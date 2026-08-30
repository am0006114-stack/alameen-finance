import type { V2InterpretedTurn, V2TopicKey, V2UnderstandingQuality } from "./types";
import { deterministicInterpret } from "./deterministicInterpreter";
import { uniqueStrings, v2HasAny } from "./normalize";

const MATERIAL_TOPICS = new Set<V2TopicKey>([
  "application_status", "review_timing", "cancellation", "continuation", "refund",
  "payment_fee", "payment_method", "payment_timing", "payment_recipient", "receipt_upload",
  "first_installment", "installment_amount", "installment_duration", "product_price", "products",
  "office_location", "delivery", "requirements", "identity", "salary", "guarantor", "site_issue",
  "human_handoff", "call_request", "trust", "business_identity", "business_website",
]);

export function evaluateUnderstanding(input: {
  customerText: string;
  messageType?: string | null;
  turn: V2InterpretedTurn;
}): V2UnderstandingQuality {
  const baseline = deterministicInterpret({
    customerText: input.customerText,
    messageType: input.messageType,
  });

  const requiredTopics = uniqueStrings(
    baseline.topics.filter((topic) => MATERIAL_TOPICS.has(topic)),
  );
  const coveredTopics = uniqueStrings(
    input.turn.topics.filter((topic) => MATERIAL_TOPICS.has(topic)),
  );
  const missingTopics = requiredTopics.filter((topic) => !coveredTopics.includes(topic));
  const criticalFlags: string[] = [];
  const warnings: string[] = [];

  const explicitCancel = baseline.acts.some((act) =>
    act.type === "request_action" && act.topic === "cancellation" && act.action === "cancel_application"
  );
  if (explicitCancel && !input.turn.acts.some((act) =>
    act.type === "request_action" && act.topic === "cancellation" && act.action === "cancel_application"
  )) {
    criticalFlags.push("missed_explicit_cancellation");
  }

  const explicitHandoff = baseline.acts.some((act) =>
    act.type === "handoff_request" && act.topic === "human_handoff"
  );
  if (explicitHandoff && !input.turn.acts.some((act) =>
    act.type === "handoff_request" && act.topic === "human_handoff"
  )) {
    criticalFlags.push("missed_explicit_handoff");
  }

  const nonContinuation = baseline.warnings.includes("non_continuation_explicit");
  if (nonContinuation && input.turn.acts.some((act) =>
    act.action === "continue_application" && act.value !== "decline"
  )) {
    criticalFlags.push("non_continuation_inverted_to_continue");
  }

  if (v2HasAny(input.customerText, ["ما فهمت", "مش فاهم", "كيف يعني", "وضح"]) &&
      !input.turn.acts.some((act) => act.type === "repair_request")) {
    criticalFlags.push("repair_request_lost");
  }

  if (String(input.customerText || "").trim().endsWith("*") &&
      !input.turn.acts.some((act) => act.type === "correct")) {
    criticalFlags.push("correction_lost");
  }

  if (missingTopics.length) warnings.push(`missing_topics:${missingTopics.join(",")}`);

  const materialCount = Math.max(1, requiredTopics.length);
  const coverage = requiredTopics.length
    ? (requiredTopics.length - missingTopics.length) / materialCount
    : 1;
  const penalty = criticalFlags.length * 40;
  const score = Math.max(0, Math.min(100, Math.round(coverage * 100 - penalty)));

  return {
    score,
    pass: criticalFlags.length === 0 && missingTopics.length === 0,
    requiredTopics,
    coveredTopics,
    missingTopics,
    criticalFlags,
    warnings,
  };
}
