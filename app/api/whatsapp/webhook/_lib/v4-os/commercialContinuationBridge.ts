import { applicationJourneyStage } from "../v3-os/applicationJourney";
import { buildMandatoryFiveJodContinuationReply } from "../v3-os/conversationRecovery";
import { persistExplicitContinuation } from "../v3-os/continuationPersistence";
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

/**
 * This is a delegate, not a rewrite of the payment funnel. It calls the exact frozen
 * V3 continuation persistence and deterministic 5-JOD customer reply. V4 never
 * reconstructs payment destinations, receipt URLs, or payment confirmation rules.
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

  // The frozen reply function already knows how to handle already-paid, receipt-pending,
  // preliminary-review and post-continuation states without asking for money twice.
  if (stage !== "preliminary_approved_waiting_decision") {
    return {
      handled: true,
      persisted: false,
      receiptId: null,
      reply: buildMandatoryFiveJodContinuationReply(turn, input.truth),
      blocker: null,
    };
  }

  const persisted = await persistExplicitContinuation({ application: app, explicitContinue: true });
  if (persisted.blocker) {
    return {
      handled: true,
      persisted: false,
      receiptId: null,
      reply: "رغبتك بالاستمرار وصلت، لكن ما بدي أفتح لك خطوة دفع على حالة غير مثبتة. في تعذر بتثبيت قرار الاستمرار على الطلب، فالمطلوب مراجعة الحالة الفعلية بدل ما أوهمك إنه تم.",
      blocker: persisted.blocker,
    };
  }

  return {
    handled: true,
    persisted: Boolean(persisted.updated || persisted.alreadyRecorded),
    receiptId: persisted.updated ? `continuation:${app.id}:${input.turnId}` : persisted.alreadyRecorded ? `continuation-existing:${app.id}` : null,
    reply: buildMandatoryFiveJodContinuationReply(turn, input.truth),
    blocker: null,
  };
}
