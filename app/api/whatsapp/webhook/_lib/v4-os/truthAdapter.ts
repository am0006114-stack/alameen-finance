import { BUSINESS_WEBSITE } from "../constants";
import { applicationJourneyStage, customerFacingStatusLabel } from "../v3-os/applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "../v3-os/paymentTruth";
import type { ActionResult, TruthBundle } from "../v3-os/types";
import type { V4ActionName, V4TruthBundle, V4TruthFact } from "./types";

function fact(key: string, value: unknown, source: V4TruthFact["source"] = "database", customerVisible = true): V4TruthFact {
  return { key, value, source, confidence: 1, customerVisible };
}

function baseUrl() {
  return String(BUSINESS_WEBSITE || "https://www.ameenfinance.co").replace(/\/+$/, "");
}

function boundUrl(path: string, truth: TruthBundle) {
  const app = truth.application;
  if (truth.contactAccess !== "full" || !app?.trackingId || !app.phone) return null;
  return `${baseUrl()}${path}?tracking=${encodeURIComponent(app.trackingId)}&phone=${encodeURIComponent(app.phone)}`;
}

function mapAction(action: string): V4ActionName | null {
  switch (action) {
    case "cancel_application": return "cancel_application";
    case "request_refund": return "request_refund";
    case "stop_refund": return "stop_refund";
    case "change_application_data": return "change_application_data";
    case "change_device": return "change_device";
    case "reopen_application": return "reopen_application";
    case "link_whatsapp_alias": return "link_whatsapp_alias";
    case "record_call_preference": return "record_human_contact_request";
    case "continue_application": return "continue_application";
    default: return null;
  }
}

export function toV4TruthBundle(input: { truth: TruthBundle; actions?: ActionResult[] }): V4TruthBundle {
  const app = input.truth.application;
  const policy = input.truth.policy;
  const facts: Record<string, V4TruthFact> = {};
  const official = baseUrl();

  facts["business.name"] = fact("business.name", policy.businessName, "policy");
  facts["business.location.general"] = fact("business.location.general", policy.generalLocation, "policy");
  facts["business.independence"] = fact("business.independence", policy.independenceStatement, "policy");
  facts["business.commercial_structure"] = fact("business.commercial_structure", policy.commercialStructureRule, "policy");
  facts["business.website"] = fact("business.website", official, "system");
  facts["business.products_url"] = fact("business.products_url", `${official}/products`, "system");
  // Tracking is intentionally hidden from the V4 writer until payment is authoritatively
  // confirmed. The commercial funnel must not distract a preliminary-approved customer
  // with a tracking link before the 5 JOD continuation step is completed.
  facts["business.tracking_url"] = fact("business.tracking_url", `${official}/track`, "system", false);
  facts["fee.opening.amount_jod"] = fact("fee.opening.amount_jod", policy.fileOpeningFeeJod, "policy");
  facts["fee.opening.timing"] = fact("fee.opening.timing", policy.fileOpeningFeeTiming, "policy");
  facts["fee.opening.purpose"] = fact("fee.opening.purpose", policy.fileOpeningFeePurposeRule, "policy");
  facts["fee.opening.refund_rule"] = fact("fee.opening.refund_rule", policy.fileOpeningFeeRefundRule, "policy");
  facts["requirements.guidance"] = fact("requirements.guidance", policy.requirementsGuidanceRule, "policy");
  facts["installment.first_rule"] = fact("installment.first_rule", policy.firstInstallmentRule, "policy");
  facts["pickup.rule"] = fact("pickup.rule", policy.pickupRule, "policy");
  facts["documents.secure_rule"] = fact("documents.secure_rule", policy.secureDocumentsRule, "policy");
  facts["payment.aliases"] = fact("payment.aliases", policy.paymentAliases, "policy");
  facts["payment.beneficiary"] = fact("payment.beneficiary", policy.paymentBeneficiaryName, "policy");
  facts["payment.method_rule"] = fact("payment.method_rule", policy.paymentMethodRule, "policy");
  facts["payment.confirmation_rule"] = fact("payment.confirmation_rule", policy.paymentConfirmationRule, "policy");
  facts["review.normal_window"] = fact("review.normal_window", policy.normalReviewWindow, "policy");
  facts["review.pressure"] = fact("review.pressure", policy.reviewPressureLevel, "policy");
  facts["review.severe_pressure_rule"] = fact("review.severe_pressure_rule", policy.severePressureRule, "policy");
  facts["refund.pressure_rule"] = fact("refund.pressure_rule", policy.refundPressureRule, "policy");
  facts["recent_release.rule"] = fact("recent_release.rule", policy.recentReleaseAvailabilityRule, "policy");

  if (app) {
    const stage = applicationJourneyStage(app);
    const paymentConfirmed = hasAuthoritativePaymentConfirmation(app);
    facts["application.exists"] = fact("application.exists", true);
    facts["application.tracking_id"] = fact("application.tracking_id", app.trackingId);
    facts["application.status.raw"] = fact("application.status.raw", app.status);
    facts["application.status.customer"] = fact("application.status.customer", customerFacingStatusLabel(app));
    facts["application.journey_stage"] = fact("application.journey_stage", stage);
    facts["application.device_name"] = fact("application.device_name", app.deviceName);
    facts["application.device_price"] = fact("application.device_price", app.devicePrice);
    facts["application.installment_months"] = fact("application.installment_months", app.installmentMonths);
    facts["application.down_payment"] = fact("application.down_payment", app.downPayment);
    facts["application.interest_rate"] = fact("application.interest_rate", app.interestRate);
    facts["application.monthly_payment"] = fact("application.monthly_payment", app.monthlyPayment);
    facts["application.total_with_interest"] = fact("application.total_with_interest", app.totalWithInterest);
    facts["application.payment_confirmed"] = fact("application.payment_confirmed", paymentConfirmed);
    facts["application.payment_status"] = fact("application.payment_status", app.paymentStatus);
    facts["application.payment_confirmed_at"] = fact("application.payment_confirmed_at", app.paymentConfirmedAt);
    facts["application.delivery_delay_until"] = fact("application.delivery_delay_until", app.deliveryDelayUntil);
    facts["application.documents"] = fact("application.documents", app.documents || null);

    if (input.truth.contactAccess === "full" && app.fullName) {
      facts["application.customer_name"] = fact("application.customer_name", app.fullName);
    }

    // The user-approved commercial funnel exposes tracking only after authoritative
    // payment confirmation. Before that, V4 should drive the continuation/payment step.
    if (paymentConfirmed) {
      facts["business.tracking_url"] = fact("business.tracking_url", `${official}/track`, "system", true);
      const tracking = boundUrl("/track", input.truth);
      if (tracking) facts["application.tracking_link"] = fact("application.tracking_link", tracking, "system");
    }

    // Sensitive receipt link is visible only after continuation is already recorded and
    // before authoritative payment confirmation. This preserves the frozen 5 JOD funnel.
    if (stage === "continuation_confirmed_fee_due" && !paymentConfirmed) {
      const receipt = boundUrl("/receipt", input.truth);
      if (receipt) facts["application.receipt_upload_link"] = fact("application.receipt_upload_link", receipt, "system");
    }

    if (stage === "refund_requested") {
      const refundBase = boundUrl("/delay-decision", input.truth);
      if (refundBase) facts["application.refund_link"] = fact("application.refund_link", `${refundBase}&mode=refund`, "system");
    }
  } else {
    facts["application.exists"] = fact("application.exists", false);
  }

  const verifiedActionReceipts = (input.actions || []).flatMap((result) => {
    const action = mapAction(result.action);
    if (!action) return [];
    return [{
      action,
      executed: Boolean(result.executed),
      receiptId: result.mutationId || null,
      summary: result.authoritativeSummary || null,
    }];
  });

  return {
    applicationId: app?.id || null,
    trackingId: app?.trackingId || null,
    facts,
    verifiedActionReceipts,
  };
}
