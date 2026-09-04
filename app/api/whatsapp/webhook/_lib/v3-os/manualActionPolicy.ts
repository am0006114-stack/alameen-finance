import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { customerFacingStatusLabel } from "./applicationJourney";
import { normalizeArabic } from "./text";
import type { ActionKey, ActionPayload, ActionResult, ConversationState, PlannedAction, ReplyPlan, TruthBundle } from "./types";

export const MANUAL_MUTATION_ACTIONS = new Set<ActionKey>([
  "cancel_application",
  "request_refund",
  "stop_refund",
  "reopen_application",
  "change_device",
  "change_application_data",
]);

export type ManualActionDisposition = {
  kind: "none" | "awaiting_admin" | "cancel_reapply_guidance" | "reconciled_by_truth";
  action: ActionKey | null;
  requestedValue: string | null;
  currentValue: string | null;
  paymentProtected: boolean;
  payload: ActionPayload | null;
};

function paymentStatusIndicatesEvidence(value: string | null | undefined) {
  return ["customer_claimed_paid", "pending_payment_confirmation", "confirmed", "paid", "payment_confirmed"].includes(String(value || "").toLowerCase());
}

/**
 * "No payment" is intentionally conservative. If a receipt exists, the customer
 * clicked paid, or the database carries a pending/confirmed payment state, we do
 * NOT advise cancelling/reapplying because money may already be tied to the file.
 */
export function hasPaymentProtection(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return false;
  return hasAuthoritativePaymentConfirmation(app)
    || app.documents?.paymentReceiptUploaded === true
    || Boolean(app.paidClickedAt)
    || paymentStatusIndicatesEvidence(app.paymentStatus);
}

function normalizeDevice(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/\b(?:gb|جيجا|g)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deviceMatches(requested: string | null, actual: string | null | undefined) {
  const r = normalizeDevice(requested);
  const a = normalizeDevice(actual);
  if (!r || !a) return false;
  return a.includes(r) || r.includes(a);
}

function truthShowsActionComplete(action: ActionKey, requestedValue: string | null, truth: TruthBundle) {
  const app = truth.application;
  if (!app) return false;
  const status = String(app.status || "").toLowerCase();
  const paymentStatus = String(app.paymentStatus || "").toLowerCase();
  if (action === "change_device") return deviceMatches(requestedValue, app.deviceName);
  if (action === "cancel_application") return ["cancelled", "canceled", "cancelled_by_customer", "refund_requested", "refund_completed"].includes(status);
  if (action === "request_refund") return ["refund_requested", "refund_completed"].includes(status) || ["refund_requested", "refund_completed"].includes(paymentStatus);
  if (action === "stop_refund" || action === "reopen_application") return !["refund_requested", "refund_completed", "cancelled", "canceled"].includes(status);
  return false;
}

function candidateFromPlan(plan: ReplyPlan, actions: ActionResult[]) {
  for (const planned of plan.actions) {
    if (!MANUAL_MUTATION_ACTIONS.has(planned.action)) continue;
    const result = actions.find((x) => x.action === planned.action);
    if (planned.requiresConfirmation || result?.outcome === "needs_confirmation") continue;
    if (result?.executed && ["executed", "already_done"].includes(result.outcome)) continue;
    return { planned, result };
  }
  return null;
}

function pendingFromState(state: ConversationState): PlannedAction | null {
  if (!state.pendingAction || !MANUAL_MUTATION_ACTIONS.has(state.pendingAction)) return null;
  if (String(state.pendingActionPayload?._manualStatus || "") !== "awaiting_admin") return null;
  return {
    action: state.pendingAction,
    sourceActId: state.lastTurnId || "pending-manual-action",
    requiresConfirmation: false,
    authority: "deterministic",
    requiredRole: "omran",
    payload: state.pendingActionPayload,
  };
}

export function resolveManualActionDisposition(input: {
  state: ConversationState;
  truth: TruthBundle;
  plan: ReplyPlan;
  actions: ActionResult[];
}): ManualActionDisposition {
  const plannedCandidate = candidateFromPlan(input.plan, input.actions)?.planned || pendingFromState(input.state);
  if (!plannedCandidate || !input.truth.application) {
    return { kind: "none", action: null, requestedValue: null, currentValue: null, paymentProtected: false, payload: null };
  }

  const plannedValue = plannedCandidate.payload?.requestedValue == null ? null : String(plannedCandidate.payload.requestedValue).trim();
  const previousValue = input.state.pendingAction === plannedCandidate.action && input.state.pendingActionPayload?.requestedValue != null
    ? String(input.state.pendingActionPayload.requestedValue).trim()
    : null;
  let requestedValue = plannedValue || previousValue || null;
  if (plannedCandidate.action === "change_device" && plannedValue && previousValue && normalizeDevice(plannedValue) !== normalizeDevice(previousValue)) {
    const storageOnly = /^(?:128|256|512|1024)\s*(?:gb|g|جيجا)?$/i.test(plannedValue);
    if (storageOnly && !normalizeDevice(previousValue).includes(normalizeDevice(plannedValue))) requestedValue = `${previousValue} ${plannedValue}`.trim();
  }
  const currentValue = plannedCandidate.action === "change_device" ? (input.truth.application.deviceName || null) : (input.truth.application.status || null);
  const paymentProtected = hasPaymentProtection(input.truth);

  if (truthShowsActionComplete(plannedCandidate.action, requestedValue, input.truth)) {
    return {
      kind: "reconciled_by_truth",
      action: plannedCandidate.action,
      requestedValue,
      currentValue,
      paymentProtected,
      payload: plannedCandidate.payload || null,
    };
  }

  if (plannedCandidate.action === "change_device" && !paymentProtected) {
    return {
      kind: "cancel_reapply_guidance",
      action: "change_device",
      requestedValue,
      currentValue,
      paymentProtected,
      payload: plannedCandidate.payload || null,
    };
  }

  return {
    kind: "awaiting_admin",
    action: plannedCandidate.action,
    requestedValue,
    currentValue,
    paymentProtected,
    payload: plannedCandidate.payload || null,
  };
}

function actionLabel(action: ActionKey | null) {
  const labels: Partial<Record<ActionKey, string>> = {
    cancel_application: "إلغاء الطلب",
    request_refund: "طلب الاسترداد",
    stop_refund: "إيقاف الاسترداد",
    reopen_application: "إعادة فتح الطلب",
    change_device: "تغيير الجهاز",
    change_application_data: "تعديل بيانات الطلب",
  };
  return action ? labels[action] || "الإجراء المطلوب" : "الإجراء المطلوب";
}

export function buildManualActionCustomerReply(input: {
  disposition: ManualActionDisposition;
  truth: TruthBundle;
}) {
  const d = input.disposition;
  const app = input.truth.application;
  if (!app || !d.action) return null;
  const tracking = app.trackingId ? ` على الطلب ${app.trackingId}` : "";

  if (d.kind === "cancel_reapply_guidance" && d.action === "change_device") {
    const requested = d.requestedValue ? ` إلى ${d.requestedValue}` : "";
    const current = app.deviceName ? `الجهاز المسجل حاليًا هو ${app.deviceName}. ` : "";
    return `${current}طلب تغيير الجهاز${requested} واضح عندي، لكن ما عدّلت الطلب الحالي. بما إن الطلب الحالي ما عليه ارتباط مالي مثبت، الأنظف حتى يطلع السعر والقسط على المواصفات الصحيحة هو إلغاء الطلب الحالي وتقديم طلب جديد بالجهاز المطلوب. إذا بدك ألغي الطلب الحالي${tracking}، أكدلي وبسجل طلب الإلغاء للإدارة.`;
  }

  if (d.kind === "awaiting_admin") {
    if (d.action === "change_device") {
      const requested = d.requestedValue || "الجهاز المطلوب";
      const current = app.deviceName || "الجهاز الحالي المسجل";
      const paymentNote = d.paymentProtected
        ? "وبما إن على الملف دفع/إثبات دفع، ما بنلغي الطلب ولا بنطلب منك تعيد التقديم."
        : "";
      return `طلبك لتغيير الجهاز إلى ${requested} واضح ومسجل كطلب تغيير. الجهاز الموجود فعليًا على الطلب الآن هو ${current}. ${paymentNote} التعديل نفسه بانتظار تنفيذ الإدارة وإعادة الحسبة، وما رح أعتبره تم قبل ما تتحدث بيانات الطلب فعليًا.`.replace(/\s+/g, " ").trim();
    }
    return `طلبك واضح: ${actionLabel(d.action)}${tracking}. ما تم تنفيذ التغيير على الطلب حتى الآن؛ الطلب بانتظار تنفيذ الإدارة، وبأكدلك فقط بعد ما تتحدث الحالة الفعلية.`;
  }

  if (d.kind === "reconciled_by_truth") {
    if (d.action === "change_device") {
      return `الجهاز المسجل فعليًا على طلبك الآن هو ${app.deviceName || d.requestedValue || "الجهاز المطلوب"}. أي حسبة جديدة بعتمدها فقط من البيانات المحدثة على الطلب.`;
    }
    return `حالة الطلب الحالية للعميل: ${customerFacingStatusLabel(app)}. هذا هو الوضع الفعلي اللي بعتمد عليه، وما رح أقول إن إعادة فتح/إيقاف استرداد أو أي تغيير صار بسبب المحادثة إلا إذا كان التنفيذ موثق فعليًا.`;
  }

  return null;
}

export function manualStatePayload(disposition: ManualActionDisposition): ActionPayload | null {
  if (!disposition.action) return null;
  if (disposition.kind === "awaiting_admin") {
    return {
      ...(disposition.payload || {}),
      requestedValue: disposition.requestedValue,
      _manualStatus: "awaiting_admin",
      _manualAction: disposition.action,
    };
  }
  if (disposition.kind === "cancel_reapply_guidance") {
    return {
      requestedValue: disposition.requestedValue,
      requestedChangeAction: "change_device",
      _manualStatus: "awaiting_customer_cancel_confirmation",
    };
  }
  return null;
}
