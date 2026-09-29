import type { InterpretedTurn, TruthBundle } from "./types";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";

export type HumanDecision = {
  needsHumanReview: boolean;
  reason: string | null;
};

/**
 * Human Company OS is autonomous by design. Conversation, complaints, legal/social
 * pressure and business mutations stay inside the AI employee hierarchy. The only
 * normal human operational checkpoint is manual confirmation of a submitted payment
 * receipt; this function reports that checkpoint for observability only.
 */
export function humanDecisionPlane(input: { turn: InterpretedTurn; truth: TruthBundle; brainRequestedHuman?: boolean; brainReason?: string | null }): HumanDecision {
  const app = input.truth.application;
  const receiptPending = Boolean(
    app &&
    app.documents?.paymentReceiptUploaded &&
    !hasAuthoritativePaymentConfirmation(app) &&
    ["customer_claimed_paid", "pending_payment_confirmation", "pending_payment"].includes(String(app.paymentStatus || "").toLowerCase())
  );

  if (receiptPending) return { needsHumanReview: true, reason: "manual_payment_receipt_confirmation_only" };
  return { needsHumanReview: false, reason: null };
}
