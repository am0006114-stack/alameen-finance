import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { continuationCommercialState } from "./commercialProgression";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import type { ApplicationTruth } from "./types";

export type ContinuationPersistenceResult = {
  attempted: boolean;
  updated: boolean;
  alreadyRecorded: boolean;
  blocker: string | null;
};

/**
 * Revenue-ready means the customer has authoritative preliminary approval (or
 * their continuation decision is already persisted), but the 5 JOD payment is
 * neither confirmed nor represented by a receipt waiting for admin review.
 * This deliberately survives the status transition from preliminary_qualified
 * -> customer_confirmed_continue so persistence can never erase the payment step.
 */
// Phase 7.1.6B compatibility: the old gate was `commercial !== "payment_ready"`; 7.2.1 intentionally extends payment-ready continuity across customer_confirmed_continue without widening any mutation scope.
export function isContinuationRevenueReady(app: ApplicationTruth | null | undefined) {
  if (!app) return false;
  if (hasAuthoritativePaymentConfirmation(app)) return false;
  if (app.documents?.paymentReceiptUploaded) return false;

  const status = String(app.status || "").trim().toLowerCase();
  if (["preliminary_qualified", "customer_confirmed_continue"].includes(status)) return true;
  return continuationCommercialState(app) === "payment_ready";
}

/**
 * Persist the customer's explicit continuation decision into the same application
 * status that the existing admin UI already understands. This is a deterministic
 * commercial-state write, not a broad Real Action: it cannot cancel, refund, reopen,
 * change device/data, or confirm payment.
 */
export async function persistExplicitContinuation(input: {
  application: ApplicationTruth | null | undefined;
  explicitContinue: boolean;
}): Promise<ContinuationPersistenceResult> {
  const app = input.application;
  if (!input.explicitContinue || !app) {
    return { attempted: false, updated: false, alreadyRecorded: false, blocker: null };
  }

  const status = String(app.status || "").trim().toLowerCase();
  if (status === "customer_confirmed_continue") {
    return { attempted: false, updated: false, alreadyRecorded: true, blocker: null };
  }

  if (!isContinuationRevenueReady(app)) {
    const commercial = continuationCommercialState(app);
    return { attempted: false, updated: false, alreadyRecorded: false, blocker: `commercial_state:${commercial}` };
  }

  if (status !== "preliminary_qualified") {
    return { attempted: false, updated: false, alreadyRecorded: false, blocker: `application_status:${status || "empty"}` };
  }

  const { data, error } = await supabaseAdmin
    .from("applications")
    .update({
      status: "customer_confirmed_continue",
      payment_status: "pending_payment",
    })
    .eq("id", app.id)
    .eq("status", "preliminary_qualified")
    .select("id,status,payment_status")
    .maybeSingle();

  if (error) {
    return { attempted: true, updated: false, alreadyRecorded: false, blocker: `continuation_persistence:${error.message}` };
  }
  if (!data) {
    return { attempted: true, updated: false, alreadyRecorded: false, blocker: "continuation_persistence_stale_truth" };
  }

  return { attempted: true, updated: true, alreadyRecorded: false, blocker: null };
}
