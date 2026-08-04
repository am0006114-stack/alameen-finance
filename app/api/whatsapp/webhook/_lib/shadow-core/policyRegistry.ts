import {
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_E164,
  BUSINESS_WEBSITE,
} from "../constants";
import type { ApplicationRecord } from "../types";
import type {
  ShadowDeviceChangeRequest,
  ShadowEvidence,
  ShadowFacts,
} from "./types";

const PAYMENT_ALLOWED_STATUSES = new Set([
  "preliminary_qualified",
  "customer_confirmed_continue",
]);

const PAYMENT_ALLOWED_PAYMENT_STATUSES = new Set([
  "pending",
  "pending_payment",
  "payment_info_sent",
  "not_requested_yet",
]);

const PAYMENT_CONFIRMED_STATUSES = new Set(["confirmed"]);
const PAYMENT_RECEIPT_PENDING_STATUSES = new Set([
  "customer_claimed_paid",
  "pending_payment_confirmation",
  "receipt_uploaded",
]);

function hasMeaningfulApplication(app: ApplicationRecord | null | undefined) {
  return Boolean(app && (app.id || app.tracking_id || app.status || app.payment_status || app.full_name));
}

function statusLabel(status: string | null, paymentStatus: string | null) {
  if (status === "refund_completed") return "تم تنفيذ الاسترداد";
  if (status === "refund_requested" || paymentStatus === "refund_requested") return "طلب الاسترداد قيد المتابعة";
  if (status === "cancelled") return "الطلب ملغي";
  if (status === "approved" || status === "customer_accepts_delivery_delay") return "موافقة نهائية";
  if (status === "guarantor_submitted") return "تم استلام بيانات الكفيل والملف قيد الدراسة";
  if (status === "needs_guarantor") return "الملف يحتاج بيانات الكفيل";
  if (status === "needs_salary_slip") return "الملف يحتاج كشف راتب رسمي";
  if (status === "needs_identity" || status === "identity_requested") return "الملف يحتاج رفع الهوية من الرابط الرسمي";
  if (status === "pending_payment_confirmation" || PAYMENT_RECEIPT_PENDING_STATUSES.has(String(paymentStatus || ""))) {
    return "وصل الدفع بانتظار التأكيد";
  }
  if (status === "under_review") return "قيد الدراسة النهائية";
  if (status === "preliminary_qualified" || status === "customer_confirmed_continue") return "مؤهل مبدئيًا";
  if (status === "preliminary_application") return "قيد مراجعة الموافقة المبدئية";
  return status || "لا توجد حالة مؤكدة";
}

function emptyDeviceChange(): ShadowDeviceChangeRequest {
  return {
    requested: false,
    requestedDevice: null,
    previousDevice: null,
    status: "none",
    source: "none",
    evidenceId: null,
  };
}

export function buildShadowFacts(
  app: ApplicationRecord | null | undefined,
  trackingId?: string | null,
  customerName?: string | null,
  messageType?: string | null,
  evidenceInput?: {
    evidence?: ShadowEvidence[];
    deviceChangeRequest?: ShadowDeviceChangeRequest;
  } | null,
): ShadowFacts {
  const meaningfulApp = hasMeaningfulApplication(app) ? app : null;
  const status = meaningfulApp?.status || null;
  const paymentStatus = meaningfulApp?.payment_status || null;
  const isApproved = status === "approved" || status === "customer_accepts_delivery_delay";
  const isCancelled = status === "cancelled";
  const refundActive = status === "refund_requested" || paymentStatus === "refund_requested";
  const refundCompleted = status === "refund_completed";
  const paymentConfirmed = Boolean(paymentStatus && PAYMENT_CONFIRMED_STATUSES.has(paymentStatus));
  const paymentReceiptPending = Boolean(
    status === "pending_payment_confirmation" ||
      (paymentStatus && PAYMENT_RECEIPT_PENDING_STATUSES.has(paymentStatus)),
  );
  const paymentAlreadyConfirmed = paymentConfirmed || paymentReceiptPending;
  const paymentCurrentlyAllowed = Boolean(
    meaningfulApp &&
      !paymentAlreadyConfirmed &&
      !refundActive &&
      !refundCompleted &&
      !isCancelled &&
      !isApproved &&
      ((status && PAYMENT_ALLOWED_STATUSES.has(status)) ||
        (paymentStatus && PAYMENT_ALLOWED_PAYMENT_STATUSES.has(paymentStatus))),
  );

  let requiredDocument: ShadowFacts["requiredDocument"] = null;
  if (status === "needs_guarantor") requiredDocument = "guarantor";
  if (status === "needs_salary_slip") requiredDocument = "salary_slip";
  if (status === "needs_identity" || status === "identity_requested") requiredDocument = "identity";

  const currentDevice = meaningfulApp?.device_name || null;
  const evidence: ShadowEvidence[] = [...(evidenceInput?.evidence || [])];
  if (currentDevice) {
    evidence.unshift({
      id: "structured-current-device",
      kind: "current_device",
      source: "structured_facts",
      claim: `الجهاز الحالي المسجل على الطلب هو ${currentDevice}.`,
      value: currentDevice,
      excerpt: null,
      confidence: "high",
    });
  }
  evidence.push({
    id: "policy-official-contact",
    kind: "official_contact",
    source: "business_policy",
    claim: `رقم التواصل الرسمي هو ${BUSINESS_PHONE_DISPLAY} (${BUSINESS_PHONE_E164}).`,
    value: BUSINESS_PHONE_DISPLAY,
    excerpt: null,
    confidence: "high",
  });

  return {
    hasApplication: Boolean(meaningfulApp),
    status,
    statusLabel: statusLabel(status, paymentStatus),
    paymentStatus,
    trackingId: meaningfulApp?.tracking_id || trackingId || null,
    customerName: meaningfulApp?.full_name || customerName || null,
    deviceName: currentDevice,
    currentDevice,
    deviceChangeRequest: evidenceInput?.deviceChangeRequest || emptyDeviceChange(),
    evidence,
    officialContact: {
      localNumber: BUSINESS_PHONE_DISPLAY,
      internationalNumber: BUSINESS_PHONE_E164,
      website: BUSINESS_WEBSITE,
      businessHours: null,
    },
    messageType: String(messageType || "text").toLowerCase(),
    paymentCurrentlyAllowed,
    paymentAlreadyConfirmed,
    paymentConfirmed,
    paymentReceiptPending,
    refundActive,
    refundCompleted,
    refundEligible: paymentConfirmed && !isApproved && !refundCompleted,
    isApproved,
    isCancelled,
    requiredDocument,
    reviewDurationText: "من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات، والجمعة والسبت لا تُحسبان",
    officeAddressCanBeShared: isApproved,
  };
}
