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

export function enforceSemanticDecisionAuthority(turn: InterpretedTurn): InterpretedTurn {
  const frame = turn.semantic;
  if (!frame || frame.confidence < 0.68) return turn;
  if (!["declined","deferred","conditional"].includes(frame.decision.continuation)) return turn;
  const acts = turn.acts.filter((act) => !(act.action === "continue_application" || (act.topic === "continuation" && act.type === "request_action")));
  return {
    ...turn,
    acts,
    requestedActions: turn.requestedActions.filter((action) => action !== "continue_application"),
    warnings: Array.from(new Set([...turn.warnings, `semantic_continuation_${frame.decision.continuation}_veto`])),
  };
}
