import { applicationJourneyStage } from "./applicationJourney";
import type { ActionResult, ConversationFact, ConversationState, TopicKey, TruthBundle } from "./types";

function now() { return new Date().toISOString(); }

function upsertFact(state: ConversationState, fact: ConversationFact) {
  const facts = [...state.facts];
  const index = facts.findIndex((item) => item.key === fact.key);
  if (index >= 0) facts[index] = fact;
  else facts.push(fact);
  return facts.slice(-50);
}

function closeTopics(state: ConversationState, topics: TopicKey[]) {
  const stamp = now();
  return state.openLoops.map((loop) => topics.includes(loop.topic) && loop.state === "open"
    ? { ...loop, state: "answered" as const, updatedAt: stamp }
    : loop);
}

/**
 * Persist authoritative business outcomes as conversation memory. This is not a
 * replacement for DB truth; it prevents the dialogue layer from asking the
 * customer to repeat an action that the transactional layer just executed or
 * that current authoritative application truth already proves is complete.
 */
export function applyAuthoritativeActionConversationMemory(input: {
  state: ConversationState;
  truth: TruthBundle;
  actions: ActionResult[];
  turnId: string;
}): ConversationState {
  let state: ConversationState = { ...input.state, facts: [...input.state.facts], openLoops: [...input.state.openLoops] };
  const stage = applicationJourneyStage(input.truth.application);
  const stamp = now();
  const tracking = input.truth.application?.trackingId || "";

  const cancelResult = input.actions.find((result) => result.action === "cancel_application" && ["executed", "already_done"].includes(result.outcome));
  const refundResult = input.actions.find((result) => result.action === "request_refund" && ["executed", "already_done"].includes(result.outcome));
  const cancellationAuthoritative = Boolean(cancelResult) || ["cancelled", "refund_requested", "refund_completed"].includes(stage);
  const refundAuthoritative = Boolean(refundResult) || ["refund_requested", "refund_completed"].includes(stage);

  if (cancellationAuthoritative) {
    state.facts = upsertFact(state, {
      key: "authoritative_cancel_application",
      value: `confirmed:${stage}${tracking ? `:${tracking}` : ""}`,
      topic: "cancellation",
      source: "system",
      confidence: 1,
      turnId: input.turnId,
      updatedAt: stamp,
    });
    state.openLoops = closeTopics(state, ["cancellation", "continuation", "payment_fee", "payment_method", "payment_timing", "payment_recipient", "receipt_upload"]);
    if (state.pendingAction === "cancel_application") {
      state.pendingAction = null;
      state.pendingActionPayload = null;
    }
  }

  if (refundAuthoritative) {
    state.facts = upsertFact(state, {
      key: "authoritative_request_refund",
      value: `confirmed:${stage}${tracking ? `:${tracking}` : ""}`,
      topic: "refund",
      source: "system",
      confidence: 1,
      turnId: input.turnId,
      updatedAt: stamp,
    });
    state.openLoops = closeTopics(state, ["refund", "continuation", "payment_fee", "payment_method", "payment_timing", "payment_recipient", "receipt_upload"]);
    if (state.pendingAction === "request_refund") {
      state.pendingAction = null;
      state.pendingActionPayload = null;
    }
  }

  if (stage === "payment_confirmed_under_review") {
    state.facts = upsertFact(state, {
      key: "authoritative_payment_confirmed",
      value: `confirmed${tracking ? `:${tracking}` : ""}`,
      topic: "payment_confirmation",
      source: "system",
      confidence: 1,
      turnId: input.turnId,
      updatedAt: stamp,
    });
    state.openLoops = closeTopics(state, ["continuation", "payment_fee", "payment_method", "payment_timing", "payment_recipient", "receipt_upload"]);
  }

  return { ...state, updatedAt: stamp };
}
