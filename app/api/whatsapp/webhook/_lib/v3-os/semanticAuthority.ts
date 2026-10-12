import type { InterpretedTurn } from "./types";

export function semanticContinuationDecision(turn: InterpretedTurn) {
  const frame = turn.semantic;
  if (!frame || frame.confidence < 0.68) return "unknown" as const;
  return frame.decision.continuation;
}

export function semanticContinuationVeto(turn: InterpretedTurn) {
  const decision = semanticContinuationDecision(turn);
  return decision === "declined" || decision === "deferred" || decision === "conditional";
}

export function semanticConfirmsContinuation(turn: InterpretedTurn) {
  return semanticContinuationDecision(turn) === "confirmed";
}

export function semanticWriterAuthority(turn: InterpretedTurn) {
  const frame = turn.semantic;
  if (!frame || frame.confidence < 0.68) return false;
  if (frame.socialClosure) return true;
  return Boolean(
    frame.currentQuestion ||
    frame.customerGoal ||
    frame.answerObligations.length ||
    frame.correctionOfPrevious ||
    frame.entities.some((entity) => entity.knownFactStatus === "unknown") ||
    frame.decision.continuation !== "unknown"
  );
}

export function semanticIsPureSocialClosure(turn: InterpretedTurn) {
  const frame = turn.semantic;
  return Boolean(frame && frame.confidence >= 0.7 && frame.socialClosure && !frame.currentQuestion && !frame.answerObligations.length);
}

function stripConversationOnlyRoleRouting(turn: InterpretedTurn): InterpretedTurn {
  // Phase 17: "بدي موظف/مدير" and identity/persona questions are conversation
  // concerns, not business mutations. Keeping them as deterministic
  // human_request/manager_request topics made criticalOperationalFallbackReply
  // replace the AI employee's answer with a canned handoff template. The native
  // composer now answers these naturally in the active employee persona. Named
  // persona requests (for example Omran) remain available as persona context.
  const roleOnlyTopics = new Set(["human_request", "manager_request"]);
  const acts = turn.acts.filter((act) => !roleOnlyTopics.has(String(act.topic)) && act.action !== "switch_ai_role");
  const topics = turn.topics.filter((topic) => !roleOnlyTopics.has(String(topic)));
  const requestedActions = turn.requestedActions.filter((action) => action !== "switch_ai_role");
  const explicitRoleRequest = turn.explicitRoleRequest === "staff" || turn.explicitRoleRequest === "manager"
    ? null
    : turn.explicitRoleRequest;

  if (
    acts.length === turn.acts.length
    && topics.length === turn.topics.length
    && requestedActions.length === turn.requestedActions.length
    && explicitRoleRequest === turn.explicitRoleRequest
  ) return turn;

  return {
    ...turn,
    acts,
    topics,
    requestedActions,
    explicitRoleRequest,
    warnings: Array.from(new Set([...(turn.warnings || []), "phase17_conversation_role_routing_owned_by_native_composer"])),
  };
}

export function enforceSemanticDecisionAuthority(turn: InterpretedTurn): InterpretedTurn {
  const cleaned = stripConversationOnlyRoleRouting(turn);
  const frame = cleaned.semantic;
  if (!frame || frame.confidence < 0.68) return cleaned;
  if (!["declined","deferred","conditional"].includes(frame.decision.continuation)) return cleaned;
  const acts = cleaned.acts.filter((act) => !(act.action === "continue_application" || (act.topic === "continuation" && act.type === "request_action")));
  return {
    ...cleaned,
    acts,
    requestedActions: cleaned.requestedActions.filter((action) => action !== "continue_application"),
    warnings: Array.from(new Set([...cleaned.warnings, `semantic_continuation_${frame.decision.continuation}_veto`])),
  };
}
