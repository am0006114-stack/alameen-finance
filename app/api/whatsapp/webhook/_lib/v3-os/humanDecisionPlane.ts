import type { InterpretedTurn, TruthBundle } from "./types";

export type HumanDecision = {
  needsHumanReview: boolean;
  reason: string | null;
};

export function humanDecisionPlane(input: { turn: InterpretedTurn; truth: TruthBundle; brainRequestedHuman?: boolean; brainReason?: string | null }): HumanDecision {
  if (input.brainRequestedHuman) return { needsHumanReview: true, reason: input.brainReason || "brain_requested_human_judgment" };
  if (input.truth.degraded && input.turn.requestedActions.some((a) => ["cancel_application","request_refund","stop_refund","reopen_application"].includes(a))) {
    return { needsHumanReview: true, reason: "mutation_requested_with_degraded_truth" };
  }
  if (input.turn.topics.some((t) => ["legal","social_threat"].includes(t))) return { needsHumanReview: true, reason: "legal_or_public_escalation" };
  return { needsHumanReview: false, reason: null };
}
