import type { V4ActionName, V4PendingProcedure, V4ProcedureResolution, V4TurnUnderstanding, V4WorkingMemory } from "./types";

const CONFIRMATION_REQUIRED = new Set<V4ActionName>([
  "cancel_application",
  "request_refund",
  "stop_refund",
  "change_application_data",
  "change_device",
  "reopen_application",
  "link_whatsapp_alias",
]);

export function actionNeedsConfirmation(action: V4ActionName) {
  return CONFIRMATION_REQUIRED.has(action);
}

export function resolveV4Procedure(input: {
  memory: V4WorkingMemory;
  turnId: string;
  understanding: V4TurnUnderstanding;
}): V4ProcedureResolution {
  const pending = input.memory.pendingProcedure;
  const requested = input.understanding.requestedAction;
  const disposition = input.understanding.actionDisposition;

  if (pending && pending.state === "confirmation_required") {
    if (disposition === "deny") {
      return {
        action: pending.name,
        nextState: "cancelled",
        shouldExecute: false,
        needsConfirmation: false,
        reason: "customer declined pending procedure",
      };
    }

    // A second, separate turn that clearly repeats the same requested action is itself
    // a valid confirmation. This intentionally prevents confirmation loops such as:
    // refund -> 'confirm' -> 'yes I want refund' -> 'confirm again'.
    const sameActionRepeated = requested === pending.name && (disposition === "request" || disposition === "confirm");
    const genericConfirmation = disposition === "confirm" && (!requested || requested === pending.name);
    if (sameActionRepeated || genericConfirmation) {
      return {
        action: pending.name,
        nextState: "confirmed",
        shouldExecute: true,
        needsConfirmation: false,
        reason: "pending procedure confirmed on a separate customer turn",
      };
    }

    // A genuinely new action supersedes the pending one; stale pending actions never own
    // a fresh customer goal.
    if (requested && requested !== pending.name) {
      return actionNeedsConfirmation(requested)
        ? { action: requested, nextState: "confirmation_required", shouldExecute: false, needsConfirmation: true, reason: "new action superseded stale pending procedure" }
        : { action: requested, nextState: "confirmed", shouldExecute: true, needsConfirmation: false, reason: "new direct action superseded stale pending procedure" };
    }

    return {
      action: pending.name,
      nextState: "confirmation_required",
      shouldExecute: false,
      needsConfirmation: true,
      reason: "pending procedure still awaits an explicit customer decision",
    };
  }

  if (!requested || disposition === "none" || disposition === "conditional") {
    return { action: null, nextState: null, shouldExecute: false, needsConfirmation: false, reason: "no executable current-turn procedure" };
  }

  if (disposition === "deny") {
    return { action: requested, nextState: "cancelled", shouldExecute: false, needsConfirmation: false, reason: "customer explicitly declined action" };
  }

  if (actionNeedsConfirmation(requested)) {
    return {
      action: requested,
      nextState: "confirmation_required",
      shouldExecute: false,
      needsConfirmation: true,
      reason: "sensitive procedure requires one separate confirmation turn",
    };
  }

  return {
    action: requested,
    nextState: "confirmed",
    shouldExecute: true,
    needsConfirmation: false,
    reason: "non-sensitive direct procedure can execute from current turn",
  };
}

export function applyProcedureResolution(input: {
  memory: V4WorkingMemory;
  turnId: string;
  resolution: V4ProcedureResolution;
  payload?: Record<string, unknown> | null;
}) {
  const s: V4WorkingMemory = JSON.parse(JSON.stringify(input.memory));
  const r = input.resolution;

  if (!r.action || !r.nextState) return s;

  if (r.nextState === "cancelled") {
    s.pendingProcedure = null;
    return s;
  }

  const existing = s.pendingProcedure;
  const sameExisting = existing && existing.name === r.action ? existing : null;
  const next: V4PendingProcedure = {
    name: r.action,
    state: r.nextState,
    requestedAtTurnId: sameExisting?.requestedAtTurnId || input.turnId,
    confirmedAtTurnId: r.nextState === "confirmed" || r.nextState === "executing" || r.nextState === "executed"
      ? input.turnId
      : sameExisting?.confirmedAtTurnId || null,
    executedAtTurnId: r.nextState === "executed" ? input.turnId : sameExisting?.executedAtTurnId || null,
    payload: input.payload ?? sameExisting?.payload ?? null,
    lastError: sameExisting?.lastError || null,
  };
  s.pendingProcedure = next;
  return s;
}

export function markProcedureExecution(input: {
  memory: V4WorkingMemory;
  turnId: string;
  executed: boolean;
  error?: string | null;
}) {
  const s: V4WorkingMemory = JSON.parse(JSON.stringify(input.memory));
  if (!s.pendingProcedure) return s;
  s.pendingProcedure.state = input.executed ? "executed" : "failed";
  s.pendingProcedure.executedAtTurnId = input.executed ? input.turnId : null;
  s.pendingProcedure.lastError = input.error || null;
  return s;
}
