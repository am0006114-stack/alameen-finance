import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type HumanModelTier = "deterministic" | "deepseek" | "sol";

export type HumanModelRoute = {
  tier: HumanModelTier;
  reasons: string[];
  score: number;
};

const COMPLEX_TOPICS = new Set(["refund", "cancellation", "reopen", "application_correction", "device_change", "complaint", "legal", "trust"]);

export function routeHumanModel(input: {
  customerText: string;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  solEnabled: boolean;
}): HumanModelRoute {
  const text = String(input.customerText || "").trim();
  const semantic = input.turn.semantic;
  const reasons: string[] = [];
  let score = 0;

  const shortContextual = text.length <= 20 && /^(?:نعم|اه|أه|ايوه|أيوه|yes|ok|اوك|تمام|كمل|نكمل|استمرار|بدي\s+استمر)$/i.test(text);
  const knownCommercialContext = ["preliminary_approved", "customer_confirmed_continue", "pending_payment", "payment_info_sent"].includes(String(input.truth.application?.status || "").toLowerCase());
  if (shortContextual && knownCommercialContext) return { tier: "deterministic", reasons: ["short_contextual_commercial_turn"], score: 0 };

  if (text.length > 500) { score += 2; reasons.push("long_customer_turn"); }
  if ((text.match(/[؟?]/g) || []).length >= 2) { score += 1; reasons.push("multiple_questions"); }
  if (input.turn.requestedActions.length >= 2) { score += 3; reasons.push("multiple_requested_actions"); }
  if (input.turn.topics.filter((x) => COMPLEX_TOPICS.has(x)).length >= 2) { score += 2; reasons.push("multiple_complex_topics"); }
  if (semantic?.decision.condition) { score += 2; reasons.push("conditional_decision"); }
  if (semantic?.correctionOfPrevious) { score += 1; reasons.push("correction_of_previous"); }
  if (input.state.pendingAction && input.turn.requestedActions.length) { score += 1; reasons.push("pending_action_interaction"); }
  if (input.truth.degraded) { score += 1; reasons.push("degraded_truth"); }

  if (input.solEnabled && score >= 8) return { tier: "sol", reasons: reasons.length ? reasons : ["high_complexity"], score };
  return { tier: "deepseek", reasons: reasons.length ? reasons : ["normal_human_conversation"], score };
}
