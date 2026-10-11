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

const PRELIMINARY_DECISION_STATUSES = new Set([
  "",
  "preliminary_application",
  "submitted",
  "preliminary_qualified",
]);
const PAYMENT_CONFIRMED_STATUSES = new Set(["confirmed", "paid", "payment_confirmed"]);
const PAYMENT_PROOF_PENDING_STATUSES = new Set(["customer_claimed_paid", "pending_payment_confirmation"]);

function low(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function preliminaryDecisionAuthority(app: ApplicationTruth | null | undefined) {
  if (!app) return false;
  const status = low(app.status);
  return PRELIMINARY_DECISION_STATUSES.has(status)
    && (status === "preliminary_qualified" || Boolean(app.preliminaryQualifiedAt));
}

/**
 * Revenue-ready means the customer has authoritative preliminary approval (or
 * their continuation decision is already persisted), but the 5 JOD payment is
 * neither confirmed nor represented by a receipt waiting for admin review.
 *
 * Important: production truth considers preliminary_qualified_at authoritative
 * evidence of preliminary approval even when the historical status field still
 * says preliminary_application/submitted. Persistence must use the same authority
 * or WhatsApp can show the decision screen while refusing to save the answer.
 */
export function isContinuationRevenueReady(app: ApplicationTruth | null | undefined) {
  if (!app) return false;
  if (hasAuthoritativePaymentConfirmation(app)) return false;
  if (app.documents?.paymentReceiptUploaded) return false;

  const status = low(app.status);
  if (status === "customer_confirmed_continue") return true;
  if (preliminaryDecisionAuthority(app)) return true;
  return continuationCommercialState(app) === "payment_ready";
}

/**
 * Persist the customer's explicit continuation decision into the same application
 * fields used by the admin UI and the canonical /api/continue-decision route.
 *
 * This is intentionally narrow and fail-closed. Before writing we re-read the row,
 * require authoritative preliminary approval, reject payment/proof states, and CAS
 * the exact current status so a concurrent approval/cancellation/refund cannot be
 * overwritten by a stale WhatsApp turn.
 */
export async function persistExplicitContinuation(input: {
  application: ApplicationTruth | null | undefined;
  explicitContinue: boolean;
}): Promise<ContinuationPersistenceResult> {
  const app = input.application;
  if (!input.explicitContinue || !app) {
    return { attempted: false, updated: false, alreadyRecorded: false, blocker: null };
  }

  if (low(app.status) === "customer_confirmed_continue") {
    return { attempted: false, updated: false, alreadyRecorded: true, blocker: null };
  }

  if (!isContinuationRevenueReady(app)) {
    const commercial = continuationCommercialState(app);
    return { attempted: false, updated: false, alreadyRecorded: false, blocker: `commercial_state:${commercial}` };
  }

  const { data: current, error: readError } = await supabaseAdmin
    .from("applications")
    .select("id,status,payment_status,payment_confirmed_at,preliminary_qualified_at")
    .eq("id", app.id)
    .maybeSingle();

  if (readError) {
    return { attempted: true, updated: false, alreadyRecorded: false, blocker: `continuation_read:${readError.message}` };
  }
  if (!current) {
    return { attempted: true, updated: false, alreadyRecorded: false, blocker: "continuation_application_not_found" };
  }

  const currentStatusRaw = current.status as string | null | undefined;
  const currentStatus = low(currentStatusRaw);
  const currentPayment = low(current.payment_status as string | null | undefined);

  if (currentStatus === "customer_confirmed_continue") {
    return { attempted: true, updated: false, alreadyRecorded: true, blocker: null };
  }

  if (Boolean(current.payment_confirmed_at) || PAYMENT_CONFIRMED_STATUSES.has(currentPayment)) {
    return { attempted: true, updated: false, alreadyRecorded: false, blocker: "continuation_payment_already_confirmed" };
  }
  if (PAYMENT_PROOF_PENDING_STATUSES.has(currentPayment)) {
    return { attempted: true, updated: false, alreadyRecorded: false, blocker: `continuation_payment_state:${currentPayment}` };
  }

  const currentPreliminaryApproved = currentStatus === "preliminary_qualified" || Boolean(current.preliminary_qualified_at);
  if (!currentPreliminaryApproved || !PRELIMINARY_DECISION_STATUSES.has(currentStatus)) {
    return { attempted: true, updated: false, alreadyRecorded: false, blocker: `application_status:${currentStatus || "empty"}` };
  }

  let updateQuery = supabaseAdmin
    .from("applications")
    .update({
      status: "customer_confirmed_continue",
      payment_status: "pending_payment",
    })
    .eq("id", app.id);

  // Compare-and-set the exact row state we just read. `status` can be NULL on
  // historical preliminary applications, so preserve that distinction here.
  updateQuery = currentStatusRaw == null
    ? updateQuery.is("status", null)
    : updateQuery.eq("status", currentStatusRaw);

  const { data, error } = await updateQuery
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
