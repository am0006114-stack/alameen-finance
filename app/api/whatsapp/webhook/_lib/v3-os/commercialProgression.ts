import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import type { ApplicationTruth, TruthBundle } from "./types";

export type ContinuationCommercialState =
  | "no_application"
  | "already_paid"
  | "payment_pending_admin"
  | "payment_ready"
  | "not_ready";

export function continuationCommercialState(app: ApplicationTruth | null | undefined): ContinuationCommercialState {
  if (!app) return "no_application";
  if (hasAuthoritativePaymentConfirmation(app)) return "already_paid";

  const paymentStatus = String(app.paymentStatus || "").trim().toLowerCase();
  if (["customer_claimed_paid", "pending_payment_confirmation"].includes(paymentStatus)) return "payment_pending_admin";

  const status = String(app.status || "").trim().toLowerCase();
  if (
    status === "preliminary_qualified" ||
    status === "customer_confirmed_continue" ||
    ["pending", "pending_payment", "payment_info_sent"].includes(paymentStatus)
  ) return "payment_ready";

  return "not_ready";
}

export function continuationNeedsFeeNow(truth: TruthBundle) {
  return continuationCommercialState(truth.application) === "payment_ready";
}

export function continuationAlreadyHandled(truth: TruthBundle) {
  const state = continuationCommercialState(truth.application);
  return state === "already_paid" || state === "payment_pending_admin";
}
