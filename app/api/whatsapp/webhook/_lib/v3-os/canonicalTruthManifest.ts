import { V3_OS_VERSION } from "./types";
import { getV3Policy } from "./policy";
import {
  ALAMEEN_DOWN_PAYMENT_RULE,
  ALAMEEN_FIRST_INSTALLMENT_RULE,
  ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE,
  ALAMEEN_OFFICE_OPERATION_RULE,
  businessTruthForPrompt,
} from "./businessTruthRegistry";
import { currentFileOpeningPaymentRule, fileOpeningPaymentWriterTruth } from "./paymentDestinationOverride";

/**
 * Phase 9 canonical customer/business truth manifest.
 *
 * The Native Conversation Kernel receives this single generated object instead
 * of parallel policy/business/payment prose bundles. Source modules remain
 * deterministic and independently testable, but the model gets one coherent
 * current manifest with no precedence puzzle to solve.
 */
export function canonicalBusinessTruthForPrompt() {
  const policy = getV3Policy();
  return {
    runtimeVersion: V3_OS_VERSION,
    identity: {
      businessName: policy.businessName,
      independenceStatement: policy.independenceStatement,
      commercialStructureRule: policy.commercialStructureRule,
    },
    office: {
      generalLocation: policy.generalLocation,
      operationRule: ALAMEEN_OFFICE_OPERATION_RULE,
      pickupRule: policy.pickupRule,
    },
    fileOpening: {
      feeJod: policy.fileOpeningFeeJod,
      timingRule: policy.fileOpeningFeeTiming,
      purposeRule: policy.fileOpeningFeePurposeRule,
      refundRule: policy.fileOpeningFeeRefundRule,
      informedContinuationRule: policy.continuationReassuranceRule,
    },
    installments: {
      downPaymentRule: ALAMEEN_DOWN_PAYMENT_RULE,
      firstInstallmentRule: ALAMEEN_FIRST_INSTALLMENT_RULE,
      monthlyPaymentChannelsRule: ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE,
      additionalFeesRule: policy.additionalFeesRule,
    },
    applicationRequirements: policy.requirementsGuidanceRule,
    secureDocumentsRule: policy.secureDocumentsRule,
    payment: {
      destination: fileOpeningPaymentWriterTruth(),
      presentationRule: currentFileOpeningPaymentRule(),
      confirmationRule: policy.paymentConfirmationRule,
    },
    review: {
      normalWindow: policy.normalReviewWindow,
      pressureLevel: policy.reviewPressureLevel,
      pressureRule: policy.severePressureRule,
      refundPressureRule: policy.refundPressureRule,
    },
    disputeResolutionRule: policy.disputeResolutionRule,
    supervisorRule: policy.autonomousSupervisorRule,
    forbiddenClaims: policy.forbiddenClaims,
    products: businessTruthForPrompt(),
  };
}
