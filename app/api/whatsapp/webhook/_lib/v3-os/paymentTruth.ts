import type { ApplicationTruth, TruthBundle } from "./types";

const AUTHORITATIVE_PAYMENT_STATUSES = new Set(["confirmed", "paid", "payment_confirmed"]);
const REFUND_WORKFLOW_STATUSES = new Set(["refund_requested", "refund_completed"]);

/**
 * Payment truth is authoritative only when it comes from an admin-confirmed
 * database fact. Refund workflow state is deliberately NOT payment evidence:
 * old/inconsistent rows must never bootstrap themselves into "paid" truth.
 */
export function hasAuthoritativePaymentConfirmation(app: ApplicationTruth | null | undefined) {
  if (!app) return false;
  return Boolean(app.paymentConfirmedAt) || AUTHORITATIVE_PAYMENT_STATUSES.has(String(app.paymentStatus || ""));
}

export function truthHasAuthoritativePaymentConfirmation(truth: TruthBundle) {
  return hasAuthoritativePaymentConfirmation(truth.application);
}

export function hasRefundWorkflowState(app: ApplicationTruth | null | undefined) {
  if (!app) return false;
  return REFUND_WORKFLOW_STATUSES.has(String(app.status || "")) || REFUND_WORKFLOW_STATUSES.has(String(app.paymentStatus || ""));
}

export function hasPaymentRefundIntegrityConflict(app: ApplicationTruth | null | undefined) {
  return hasRefundWorkflowState(app) && !hasAuthoritativePaymentConfirmation(app);
}
