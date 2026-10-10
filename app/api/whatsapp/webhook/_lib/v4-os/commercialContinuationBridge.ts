import { applicationJourneyStage } from "../v3-os/applicationJourney";
import { buildMandatoryFiveJodContinuationReply } from "../v3-os/conversationRecovery";
import { persistExplicitContinuation } from "../v3-os/continuationPersistence";
import { fileOpeningPaymentWriterTruth } from "../v3-os/paymentDestinationOverride";
import { applicationReceiptUrl } from "../v3-os/linkIntegrity";
import type { InterpretedTurn, TruthBundle } from "../v3-os/types";
import type { V4CommercialContinuationResult } from "./types";

function syntheticContinuationTurn(input: { turnId: string; customerText: string }): InterpretedTurn {
  return {
    turnId: input.turnId,
    rawText: input.customerText,
    normalizedText: input.customerText,
    acts: [{
      id: `${input.turnId}:v4-commercial-continuation`,
      type: "request_action",
      topic: "continuation",
      text: input.customerText,
      action: "continue_application",
      value: "v4_explicit_continuation",
      confidence: 1,
      source: "deterministic",
    }],
    topics: ["continuation", "payment_fee", "payment_method", "receipt_upload"],
    requestedActions: ["continue_application"],
    sentiment: "calm",
    urgency: "normal",
    explicitRoleRequest: null,
    confidence: 1,
    warnings: ["v4_delegated_to_frozen_commercial_funnel"],
    semantic: null,
  };
}

function compactPaymentHandoff(truth: TruthBundle) {
  const payment = fileOpeningPaymentWriterTruth();
  const receipt = truth.contactAccess === "full" ? applicationReceiptUrl(truth) : null;
  const aliases = payment.channels.cliq.aliases.join(" / ");
  const receiptLine = receipt
    ? `\nارفع الوصل من الرابط الرسمي:\n${receipt}`
    : "\nرابط رفع الوصل المرتبط بطلبك مش متاح عندي بشكل موثق هسا، فما رح أعطيك رابط عام.";

  return `تمام. المطلوب الآن 5 دنانير رسوم فتح الملف.\nOrange Money: ${payment.channels.orangeMoney.phone}\nCliQ: ${aliases}\nالمستفيد: ${payment.beneficiaryName}${receiptLine}`;
}

/**
 * V4 owns presentation speed, while the frozen V3 backplane still owns persistence,
 * payment destinations, receipt binding, and payment truth. No payment value or alias
 * is duplicated in V4.
 */
export async function runFrozenCommercialContinuation(input: {
  turnId: string;
  customerText: string;
  truth: TruthBundle;
}): Promise<V4CommercialContinuationResult> {
  const app = input.truth.application;
  if (!app) {
    return { handled: true, persisted: false, receiptId: null, reply: "رغبتك بالاستمرار واضحة، بس ما عندي طلب موثوق مربوط بالمحادثة هسا. ما رح أعطيك بيانات دفع قبل ربط الطلب الصحيح.", blocker: "application_truth_required" };
  }

  const stage = applicationJourneyStage(app);
  const turn = syntheticContinuationTurn({ turnId: input.turnId, customerText: input.customerText });

  // If continuation was already recorded and the fee is due, repeat only the useful
  // payment handoff. Paid/pending/refund/other stages remain delegated to the frozen
  // V3 reply so V4 cannot weaken payment truth or ask for money twice.
  if (stage !== "preliminary_approved_waiting_decision") {
    return {
      handled: true,
      persisted: false,
      receiptId: null,
      reply: stage === "continuation_confirmed_fee_due"
        ? compactPaymentHandoff(input.truth)
        : buildMandatoryFiveJodContinuationReply(turn, input.truth),
      blocker: null,
    };
  }

  const persisted = await persistExplicitContinuation({ application: app, explicitContinue: true });
  if (persisted.blocker) {
    return {
      handled: true,
      persisted: false,
      receiptId: null,
      reply: "قرار الاستمرار وصل، لكن تعذر تثبيته على الطلب. ما رح أفتح الدفع قبل ما تكون الخطوة مثبتة فعليًا.",
      blocker: persisted.blocker,
    };
  }

  return {
    handled: true,
    persisted: Boolean(persisted.updated || persisted.alreadyRecorded),
    receiptId: persisted.updated ? `continuation:${app.id}:${input.turnId}` : persisted.alreadyRecorded ? `continuation-existing:${app.id}` : null,
    reply: compactPaymentHandoff(input.truth),
    blocker: null,
  };
}
