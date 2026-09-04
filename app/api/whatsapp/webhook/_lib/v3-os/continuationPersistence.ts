import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { continuationCommercialState } from "./commercialProgression";
import type { ApplicationTruth } from "./types";

export type ContinuationPersistenceResult = {
  attempted: boolean;
  updated: boolean;
  alreadyRecorded: boolean;
  blocker: string | null;
};

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

  const commercial = continuationCommercialState(app);
  if (commercial !== "payment_ready") {
    return { attempted: false, updated: false, alreadyRecorded: false, blocker: `commercial_state:${commercial}` };
  }

  const status = String(app.status || "").trim().toLowerCase();
  if (status === "customer_confirmed_continue") {
    return { attempted: false, updated: false, alreadyRecorded: true, blocker: null };
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
