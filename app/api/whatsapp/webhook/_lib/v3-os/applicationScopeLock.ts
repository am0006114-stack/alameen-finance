import { normalizeArabic } from "./text";
import type { ActionKey, ActionPayload, ConversationState, InterpretedTurn, PlannedAction, TruthBundle } from "./types";

const SCOPED_ACTIONS = new Set<ActionKey>([
  "cancel_application",
  "request_refund",
  "stop_refund",
  "reopen_application",
  "change_application_data",
  "change_device",
  "continue_application",
]);

const TOPIC_FOR_ACTION: Partial<Record<ActionKey, string[]>> = {
  cancel_application: ["cancellation"],
  request_refund: ["refund"],
  stop_refund: ["refund"],
  reopen_application: ["reopen"],
  change_application_data: ["application_correction"],
  change_device: ["device_change", "device_recalculation"],
  continue_application: ["continuation"],
};

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

export function explicitTrackingId(value: string | null | undefined) {
  const match = String(value || "").match(/\bAM-\d{8,}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function actionExplicitInCurrentText(action: ActionKey, value: string | null | undefined) {
  const q = normalized(value);
  if (!q) return false;
  // Patterns are intentionally written against normalizeArabic() output.
  if (action === "cancel_application") return /(?:الغاء|الغي|الغوا|الغيه|الغيلي|بدي\s+الغي|ما\s+بدي).{0,45}(?:الطلب|المعامله)|(?:الطلب|المعامله).{0,35}(?:الغاء|الغي|الغوا)/.test(q);
  if (action === "request_refund") return /(?:استرداد|استرجاع|رجع|رجعولي|رجعلي).{0,35}(?:الرسوم|المبلغ|المصاري|5|٥)|(?:بدي|اريد).{0,25}(?:استرداد|استرجاع)/.test(q);
  if (action === "stop_refund") return /(?:وقف|اوقف|الغاء).{0,30}(?:الاسترداد|الاسترجاع)|(?:بدي\s+اكمل).{0,35}(?:بدل|بعد).{0,25}(?:الاسترداد|الالغاء)/.test(q);
  if (action === "reopen_application") return /(?:استينف|استانف|استيناف|اعاده|رجع).{0,35}(?:الطلب|الملف|فتحه|فتح)|(?:افتح).{0,25}(?:الطلب|الملف).{0,20}(?:من\s+جديد|مره\s+ثانيه)/.test(q);
  if (action === "change_device") return /(?:غير|تغيير|بدل|استبدل).{0,35}(?:الجهاز|التلفون|الموبايل|ايفون|iphone)|(?:الجهاز|التلفون|الموبايل).{0,35}(?:غير|تغيير|بدل)/i.test(q);
  if (action === "change_application_data") return /(?:غير|تغيير|عدل|تعديل|صحح).{0,35}(?:الرقم|الهاتف|الواتساب|الاسم|البيانات|العنوان|الايميل)/.test(q);
  if (action === "continue_application") {
    if (/(?:لا\s+ارغب|لا\s+اريد|ما\s+بدي|مش\s+حاب).{0,35}(?:استمر|الاستمرار|اكمل)/.test(q)) return false;
    return /(?:اود|ارغب).{0,10}(?:الاستمرار|استمر)|(?:بدي|حاب|حابه).{0,18}(?:اكمل|استمر|افتح).{0,15}(?:الطلب|الملف)?/.test(q);
  }
  return false;
}

export type ApplicationScopeResult = {
  state: ConversationState;
  applicationChanged: boolean;
  droppedPendingAction: ActionKey | null;
  reason: string | null;
};

/**
 * A conversation can contain several applications over time. Pending mutation
 * state is never allowed to jump from one application to another. When the
 * current message explicitly binds a different tracking number, application-
 * specific loops/facts are reset as well so a new order starts with a clean
 * transactional context while preserving the role/persona continuity.
 */
export function scopeStateToCurrentApplication(input: {
  state: ConversationState;
  truth: TruthBundle;
  customerText: string;
}): ApplicationScopeResult {
  const app = input.truth.application;
  if (!app) return { state: input.state, applicationChanged: false, droppedPendingAction: null, reason: null };

  const currentTracking = app.trackingId ? String(app.trackingId).toUpperCase() : null;
  const previousAppId = input.state.activeApplicationId;
  const previousTracking = input.state.activeTrackingId ? String(input.state.activeTrackingId).toUpperCase() : null;
  const explicitTracking = explicitTrackingId(input.customerText);
  const authoritativeCurrentMessageBinding = input.truth.source === "current_message_tracking" || Boolean(explicitTracking && currentTracking && explicitTracking === currentTracking);
  const identityChanged = Boolean(
    (previousAppId && previousAppId !== app.id) ||
    (previousTracking && currentTracking && previousTracking !== currentTracking)
  );

  const payloadScope = input.state.pendingActionPayload?._scopeApplicationId == null
    ? null
    : String(input.state.pendingActionPayload._scopeApplicationId);
  const pendingScopeMismatch = Boolean(payloadScope && payloadScope !== app.id);
  const legacyPendingWithoutProvableScope = Boolean(
    input.state.pendingAction && !payloadScope && authoritativeCurrentMessageBinding && !previousAppId && !previousTracking
  );
  // Any authoritative resolver result that changes application identity is a hard
  // transactional boundary. We fail closed even when the switch was resolved by
  // phone/current binding rather than an explicit tracking token: losing stale
  // conversational context is safer than carrying an old mutation into a new app.
  const shouldResetForNewApplication = identityChanged;
  const shouldDropPending = identityChanged || pendingScopeMismatch || legacyPendingWithoutProvableScope;

  if (!shouldResetForNewApplication && !shouldDropPending) {
    return { state: input.state, applicationChanged: false, droppedPendingAction: null, reason: null };
  }

  const droppedPendingAction = input.state.pendingAction;
  const state: ConversationState = {
    ...input.state,
    ...(shouldResetForNewApplication ? {
      currentTopic: null,
      currentGoal: null,
      openLoops: [],
      facts: [],
      lastAssistantText: null,
      lastVerifiedApplication: null,
      consecutiveRiskTurns: 0,
    } : {}),
    pendingAction: shouldDropPending ? null : input.state.pendingAction,
    pendingActionPayload: shouldDropPending ? null : input.state.pendingActionPayload,
  };

  return {
    state,
    applicationChanged: shouldResetForNewApplication,
    droppedPendingAction,
    reason: shouldResetForNewApplication
      ? "application_identity_switch"
      : pendingScopeMismatch
        ? "pending_action_scope_mismatch"
        : "legacy_pending_action_scope_unproven",
  };
}

/**
 * The interpreter sees conversation history before authoritative application
 * binding. If that history belonged to an older application, remove any risky
 * action that the customer did not explicitly request in the current message.
 */
export function scopeTurnToCurrentApplication(input: {
  turn: InterpretedTurn;
  applicationChanged: boolean;
}) {
  if (!input.applicationChanged) return input.turn;
  const allowedAction = (action: ActionKey | undefined) => !action || action === "none" || !SCOPED_ACTIONS.has(action) || actionExplicitInCurrentText(action, input.turn.rawText);
  const acts = input.turn.acts.filter((act) => allowedAction(act.action));
  const requestedActions = input.turn.requestedActions.filter((action) => allowedAction(action));
  const blockedTopics = new Set<string>();
  for (const action of SCOPED_ACTIONS) {
    if (!actionExplicitInCurrentText(action, input.turn.rawText)) {
      for (const topic of TOPIC_FOR_ACTION[action] || []) blockedTopics.add(topic);
    }
  }
  const topics = input.turn.topics.filter((topic) => !blockedTopics.has(topic));
  return {
    ...input.turn,
    acts,
    requestedActions,
    topics: Array.from(new Set(topics)),
    warnings: Array.from(new Set([...(input.turn.warnings || []), "application_scope_reset"])),
  };
}

export function filterPlannedActionsForApplicationScope(input: {
  actions: PlannedAction[];
  turn: InterpretedTurn;
  applicationChanged: boolean;
}) {
  if (!input.applicationChanged) return { actions: input.actions, dropped: [] as PlannedAction[] };
  const requested = new Set(input.turn.requestedActions);
  const dropped: PlannedAction[] = [];
  const actions = input.actions.filter((action) => {
    if (!SCOPED_ACTIONS.has(action.action)) return true;
    const allowed = requested.has(action.action) && actionExplicitInCurrentText(action.action, input.turn.rawText);
    if (!allowed) dropped.push(action);
    return allowed;
  });
  return { actions, dropped };
}

export function stampActionScope(action: PlannedAction, truth: TruthBundle, turnId: string): PlannedAction {
  const app = truth.application;
  if (!app || action.action === "none") return action;
  const payload: ActionPayload = {
    ...(action.payload || {}),
    _scopeApplicationId: app.id,
    _scopeTrackingId: app.trackingId || null,
    _scopeTurnId: turnId,
  };
  return { ...action, payload };
}

export function stampPendingPayloadScope(payload: ActionPayload | null | undefined, truth: TruthBundle, turnId: string) {
  const app = truth.application;
  if (!payload || !app) return payload || null;
  return {
    ...payload,
    _scopeApplicationId: app.id,
    _scopeTrackingId: app.trackingId || null,
    _scopeTurnId: turnId,
  } satisfies ActionPayload;
}

export function pendingActionMatchesCurrentApplication(input: {
  state: ConversationState;
  truth: TruthBundle;
}) {
  const app = input.truth.application;
  if (!app || !input.state.pendingAction) return false;
  const payloadScope = input.state.pendingActionPayload?._scopeApplicationId;
  if (payloadScope != null) return String(payloadScope) === app.id;
  // Backward compatibility for pending actions created before Phase 7.3.0:
  // they are valid only while the conversation is still bound to the exact
  // same application identity. A switched application is cleared earlier.
  return input.state.activeApplicationId === app.id || (
    Boolean(input.state.activeTrackingId) && Boolean(app.trackingId) &&
    String(input.state.activeTrackingId).toUpperCase() === String(app.trackingId).toUpperCase()
  );
}

export function scopedBusinessAction(action: ActionKey) {
  return SCOPED_ACTIONS.has(action);
}
