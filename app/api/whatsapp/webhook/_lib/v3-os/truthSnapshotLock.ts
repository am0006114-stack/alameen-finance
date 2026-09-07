import type { ApplicationTruth, ConversationState, TruthBundle } from "./types";

function mergeDocuments(current: ApplicationTruth["documents"], previous: ApplicationTruth["documents"]) {
  if (!current) return previous || null;
  if (!previous) return current;
  const types = Array.from(new Set([...(previous.types || []), ...(current.types || [])]));
  return {
    ...current,
    loaded: Boolean(current.loaded || previous.loaded),
    types,
    identityComplete: current.identityComplete === true || previous.identityComplete === true ? true : current.identityComplete,
    salarySlipUploaded: current.salarySlipUploaded === true || previous.salarySlipUploaded === true ? true : current.salarySlipUploaded,
    guarantorIdentityComplete: current.guarantorIdentityComplete === true || previous.guarantorIdentityComplete === true ? true : current.guarantorIdentityComplete,
    guarantorDataComplete: current.guarantorDataComplete === true || previous.guarantorDataComplete === true ? true : current.guarantorDataComplete,
    paymentReceiptUploaded: current.paymentReceiptUploaded === true || previous.paymentReceiptUploaded === true ? true : current.paymentReceiptUploaded,
  };
}

function sameApplication(a: ApplicationTruth | null | undefined, b: ApplicationTruth | null | undefined) {
  if (!a || !b) return false;
  return a.id === b.id || Boolean(a.trackingId && b.trackingId && a.trackingId === b.trackingId);
}

export function paymentHistoricallyConfirmed(app: ApplicationTruth | null | undefined) {
  if (!app) return false;
  if (app.paymentConfirmedAt || app.paymentReference) return true;
  const p = String(app.paymentStatus || "").toLowerCase();
  const s = String(app.status || "").toLowerCase();
  return ["confirmed","paid","payment_confirmed","refund_requested","refund_processing","refund_completed","refunded"].includes(p)
    || ["refund_requested","refund_processing","refund_completed","refunded"].includes(s);
}

export function stabilizeTruthSnapshot(input: {
  truth: TruthBundle;
  state?: ConversationState | null;
  previousTruth?: TruthBundle | null;
}) : TruthBundle {
  const current = input.truth.application;
  if (!current) return input.truth;
  const previous = input.previousTruth?.application || input.state?.lastVerifiedApplication?.application || null;
  if (!sameApplication(current, previous)) return input.truth;

  const previousConfirmed = paymentHistoricallyConfirmed(previous);
  const currentConfirmed = paymentHistoricallyConfirmed(current);
  const merged: ApplicationTruth = {
    ...current,
    paymentStatus: previousConfirmed && !currentConfirmed
      ? (previous?.paymentStatus || "payment_confirmed")
      : current.paymentStatus,
    paymentConfirmedAt: current.paymentConfirmedAt || previous?.paymentConfirmedAt || null,
    paymentReference: current.paymentReference || previous?.paymentReference || null,
    preliminaryQualifiedAt: current.preliminaryQualifiedAt || previous?.preliminaryQualifiedAt || null,
    paidClickedAt: current.paidClickedAt || previous?.paidClickedAt || null,
    documents: mergeDocuments(current.documents, previous?.documents),
  };
  return { ...input.truth, application: merged };
}
