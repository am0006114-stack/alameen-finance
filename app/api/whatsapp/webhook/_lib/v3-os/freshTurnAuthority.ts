import { explicitExpediteRequestText, politeClosureText, reviewDelayQuestionText } from "./dailyConversationIntegrity";
import { normalizeArabic } from "./text";
import type { ConversationState, DialogueAct, InterpretedTurn } from "./types";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function materialAct(act: DialogueAct) {
  if (["greet", "thank", "acknowledge"].includes(act.type)) return false;
  if (act.topic === "unknown" && act.type === "unknown") return false;
  return ["ask", "request_action", "confirm", "deny", "correct", "provide_fact", "provide_reason", "repair_request", "complaint", "request_role"].includes(act.type)
    || !["greeting", "thanks", "acknowledgement", "unknown"].includes(act.topic);
}

export function hasMaterialFreshTurn(turn: InterpretedTurn) {
  if (turn.requestedActions.length) return true;
  if (turn.acts.some(materialAct)) return true;
  if (reviewDelayQuestionText(turn.rawText) || explicitExpediteRequestText(turn.rawText)) return true;
  const q = n(turn.rawText);
  return /(?:^|\s)(?:متى|امتى|ايمتى|قديش|كم|كيف|وين|ليش|شو|هل|بدي|اريد|أريد)(?:\s|$)/.test(q);
}

/**
 * A social acknowledgement is allowed to close a turn only when the current
 * message itself contains no material question/action. Old conversation state
 * may provide context, but it may never turn "تمام إن شاء الله" back into the
 * previous review/payment answer.
 */
export function pureSocialClosureTurn(turn: InterpretedTurn) {
  return politeClosureText(turn.rawText) && !hasMaterialFreshTurn(turn);
}

export function buildSocialClosureReply(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (/(?:شكرا|شكر|تسلم|يعطيك\s+العافيه|يعطيك\s+العافية|الله\s+يعافيك)/.test(q)) return "العفو، الله يعطيك العافية.";
  if (/(?:ان\s+شاء\s+الله|إن\s+شاء\s+الله|يارب|يا\s+رب)/.test(q)) return "تمام، إن شاء الله. الله يعطيك العافية.";
  return "تمام، الله يعطيك العافية.";
}

function addReviewAct(turn: InterpretedTurn, value: string): InterpretedTurn {
  if (turn.acts.some((act) => act.topic === "review_timing" && ["ask", "complaint"].includes(act.type))) return turn;
  const act: DialogueAct = {
    id: `${turn.turnId}:fresh-turn:review-timing`,
    type: "ask",
    topic: "review_timing",
    text: turn.rawText,
    action: "none",
    value,
    confidence: 0.999,
    source: "resolved",
  };
  return {
    ...turn,
    acts: [...turn.acts.filter((x) => !(x.topic === "unknown" && x.type === "unknown")), act],
    topics: Array.from(new Set([...turn.topics.filter((x) => x !== "unknown"), "review_timing"])),
    confidence: Math.max(turn.confidence, 0.999),
    warnings: Array.from(new Set([...(turn.warnings || []), "fresh_turn_review_timing_authority"])),
  };
}

/**
 * Resolve short fragments against only the immediately preceding customer turn.
 * This is intentionally narrow: it never reopens an older topic from long-term
 * state and therefore cannot drag a stale commercial journey back into egress.
 */
export function enforceFreshTurnAuthority(input: { turn: InterpretedTurn; state: ConversationState }): InterpretedTurn {
  let turn = input.turn;
  if (reviewDelayQuestionText(turn.rawText) || explicitExpediteRequestText(turn.rawText)) {
    turn = addReviewAct(turn, explicitExpediteRequestText(turn.rawText) ? "explicit_expedite_request" : "fresh_review_timing_question");
  }

  const q = n(turn.rawText);
  const fragment = /^(?:او|أو|ولا|والرفض|او\s+الرفض|أو\s+الرفض|او\s+الموافقه|أو\s+الموافقة|والنتيجه|والنتيجة)$/.test(q);
  if (fragment && input.state.lastCustomerText && reviewDelayQuestionText(input.state.lastCustomerText)) {
    turn = addReviewAct(turn, "immediate_context_review_timing_fragment");
  }
  return turn;
}
