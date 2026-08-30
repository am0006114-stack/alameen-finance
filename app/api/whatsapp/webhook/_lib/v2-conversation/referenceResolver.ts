import type {
  V2ConversationState,
  V2DialogueAct,
  V2InterpretedTurn,
  V2OpenLoop,
  V2TopicKey,
} from "./types";
import { uniqueStrings, v2HasAny, v2Normalize } from "./normalize";

function cloneTurn(turn: V2InterpretedTurn): V2InterpretedTurn {
  return JSON.parse(JSON.stringify(turn)) as V2InterpretedTurn;
}

function latestOpenLoop(state: V2ConversationState | null | undefined): V2OpenLoop | null {
  if (!state) return null;
  return [...state.openLoops]
    .filter((loop) => loop.state === "open")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
}

function latestTopic(state: V2ConversationState | null | undefined): V2TopicKey | null {
  return latestOpenLoop(state)?.topic || state?.currentTopic || state?.facts?.slice(-1)[0]?.topic || null;
}

function hasMaterialAct(acts: V2DialogueAct[]) {
  return acts.some((item) => !["unknown", "acknowledge", "greet", "thank"].includes(item.type));
}

function appendResolvedAct(turn: V2InterpretedTurn, act: Omit<V2DialogueAct, "id" | "source">) {
  const same = turn.acts.some((item) => item.type === act.type && item.topic === act.topic && item.value === act.value);
  if (same) return;
  turn.acts.push({
    ...act,
    id: `r${turn.acts.length + 1}`,
    source: "resolved",
  });
}

export function resolveTurnReferences(input: {
  turn: V2InterpretedTurn;
  state?: V2ConversationState | null;
  recentCustomerMessages?: string[];
  recentAssistantReplies?: string[];
}): V2InterpretedTurn {
  const out = cloneTurn(input.turn);
  const state = input.state || null;
  const current = v2Normalize(out.normalizedText);
  const loop = latestOpenLoop(state);
  const topic = latestTopic(state);

  for (const reference of out.references) {
    if (!reference.targetTopic && topic) reference.targetTopic = topic;
  }

  // Short answers belong to the most recent open conversational obligation.
  if (loop && out.references.some((item) => item.kind === "short_answer")) {
    const yes = ["اه", "اها", "نعم", "تمام", "صح", "عندي"].includes(current);
    const no = ["لا", "ماعندي", "ما عندي"].includes(current);
    if (yes || no) {
      appendResolvedAct(out, {
        type: yes ? "confirm" : "deny",
        topic: loop.topic,
        text: out.normalizedText,
        target: loop.id,
        value: yes ? "yes" : "no",
        action: null,
        confidence: 0.95,
      });
    }
    if (no && loop.topic === "guarantor") {
      appendResolvedAct(out, {
        type: "provide_fact",
        topic: "guarantor",
        text: out.normalizedText,
        target: loop.id,
        value: "none",
        action: null,
        confidence: 0.98,
      });
    }
  }

  // "هيك" after a recent submission/step should point to that turn instead of becoming generic unknown.
  if (
    out.references.some((item) => item.kind === "deictic") &&
    !hasMaterialAct(out.acts)
  ) {
    const recent = [
      ...(input.recentCustomerMessages || []).slice(0, 3),
      ...(input.recentAssistantReplies || []).slice(0, 3),
    ].join("\n");
    if (v2HasAny(recent, ["قدمت طلب", "تم تقديم", "رقم التتبع", "رفع", "الوصل", "الهوية", "هويه"])) {
      appendResolvedAct(out, {
        type: "confirm",
        topic: topic || "application_status",
        text: out.normalizedText,
        target: loop?.id || "recent_submission",
        value: "verify_recent_step",
        action: null,
        confidence: 0.87,
      });
    }
  }

  // Explicit repair messages target the latest unresolved topic.
  if (out.acts.some((item) => item.type === "repair_request") && topic) {
    for (const item of out.acts) {
      if (item.type === "repair_request") {
        item.topic = topic;
        item.target = loop?.id || "previous_assistant_reply";
        item.source = "resolved";
        item.confidence = Math.max(item.confidence, 0.95);
      }
    }
  }

  // Typo correction with * inherits the nearest conversational topic.
  if (out.corrections.length && topic) {
    for (const item of out.corrections) {
      if (!item.targetTopic) item.targetTopic = topic;
    }
    for (const item of out.acts) {
      if (item.type === "correct" && item.topic === "correction") {
        item.topic = topic;
        item.target = loop?.id || "previous_customer_term";
        item.source = "resolved";
      }
    }
  }

  // Troubleshooting continuations remain on site_issue when that was the open loop.
  if (
    loop?.topic === "site_issue" &&
    v2HasAny(current, ["ما زبط", "مازبط", "لسا معلق", "جربت", "مش راضي"])
  ) {
    appendResolvedAct(out, {
      type: "complaint",
      topic: "site_issue",
      text: out.normalizedText,
      target: loop.id,
      value: "troubleshooting_continuation",
      action: null,
      confidence: 0.97,
    });
  }

  out.topics = uniqueStrings(out.acts.map((item) => item.topic));
  out.requestedActions = uniqueStrings(
    out.acts.map((item) => item.action).filter((value): value is NonNullable<V2DialogueAct["action"]> => Boolean(value && value !== "none")),
  );
  if (out.acts.some((item) => item.source === "resolved") && out.source !== "hybrid") out.source = "hybrid";
  return out;
}
