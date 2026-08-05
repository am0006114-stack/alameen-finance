import type { ApplicationRecord } from "./types";

export type ApplicationStage =
  | "submitted"
  | "queued_for_review"
  | "prequalified"
  | "requirements_pending"
  | "under_review"
  | "final_review"
  | "approved"
  | "rejected"
  | "refund_requested"
  | "refund_completed"
  | "cancelled"
  | "unknown";

const SUBMITTED = new Set(["submitted", "application_submitted"]);
const QUEUED = new Set(["queued_for_review", "queued", "pending_review"]);
const PREQUALIFIED = new Set([
  "prequalified",
  "preliminary_application",
  "preliminary_qualified",
  "customer_confirmed_continue",
]);
const REQUIREMENTS_PENDING = new Set([
  "requirements_pending",
  "needs_guarantor",
  "needs_salary_slip",
  "needs_identity",
  "identity_requested",
  "first_installment_requested",
]);
const UNDER_REVIEW = new Set([
  "under_review",
  "identity_uploaded",
  "salary_slip_uploaded",
  "guarantor_submitted",
]);
const FINAL_REVIEW = new Set(["final_review", "final_under_review"]);
const APPROVED = new Set(["approved", "customer_accepts_delivery_delay"]);
const REJECTED = new Set(["rejected", "not_approved"]);
const REFUND_REQUESTED = new Set(["refund_requested"]);
const REFUND_COMPLETED = new Set(["refund_completed"]);
const CANCELLED = new Set(["cancelled", "customer_declined_continue"]);

export function resolveApplicationStage(
  status: string | null | undefined,
  paymentStatus?: string | null,
): ApplicationStage {
  const clean = String(status || "").trim().toLowerCase();
  const payment = String(paymentStatus || "").trim().toLowerCase();

  if (REFUND_COMPLETED.has(clean)) return "refund_completed";
  if (REFUND_REQUESTED.has(clean) || payment === "refund_requested") return "refund_requested";
  if (APPROVED.has(clean)) return "approved";
  if (REJECTED.has(clean)) return "rejected";
  if (FINAL_REVIEW.has(clean)) return "final_review";
  if (REQUIREMENTS_PENDING.has(clean)) return "requirements_pending";
  if (UNDER_REVIEW.has(clean)) return "under_review";
  if (PREQUALIFIED.has(clean)) return "prequalified";
  if (QUEUED.has(clean)) return "queued_for_review";
  if (SUBMITTED.has(clean)) return "submitted";
  if (CANCELLED.has(clean)) return "cancelled";
  return "unknown";
}

export function statusHumanLabelV113(
  status: string | null | undefined,
  paymentStatus?: string | null,
): string {
  const clean = String(status || "").trim().toLowerCase();

  switch (clean) {
    case "preliminary_application":
      return "مؤهل مبدئيًا وبانتظار بدء دراسة الملف";
    case "preliminary_qualified":
    case "prequalified":
      return "مؤهل مبدئيًا";
    case "customer_confirmed_continue":
      return "تم تأكيد الرغبة بالاستمرار";
    case "customer_declined_continue":
      return "الطلب غير مستمر";
    case "submitted":
    case "application_submitted":
      return "تم استلام الطلب وتسجيله";
    case "queued_for_review":
    case "queued":
    case "pending_review":
      return "بانتظار دوره لبدء المراجعة";
    case "under_review":
      return "قيد الدراسة";
    case "final_review":
    case "final_under_review":
      return "في المرحلة النهائية من الدراسة";
    case "approved":
      return "صدرت الموافقة النهائية";
    case "rejected":
    case "not_approved":
      return "انتهت الدراسة ولم تتم الموافقة";
    case "needs_identity":
    case "identity_requested":
      return "بانتظار صورة الهوية";
    case "identity_uploaded":
      return "تم استلام صور الهوية والملف قيد الدراسة";
    case "needs_salary_slip":
      return "بانتظار كشف راتب أو شهادة راتب";
    case "salary_slip_uploaded":
      return "تم استلام كشف الراتب والملف قيد الدراسة";
    case "first_installment_requested":
      return "بانتظار دفع القسط الأول";
    case "needs_guarantor":
      return "بانتظار بيانات الكفيل";
    case "guarantor_submitted":
      return "تم استلام بيانات الكفيل والملف قيد الدراسة";
    case "customer_accepts_delivery_delay":
      return "صدرت الموافقة النهائية والطلب بانتظار ترتيب الاستلام";
    case "delivery_delay_notice_sent":
      return "بانتظار اختيار التمديد أو الاسترداد";
    case "refund_requested":
      return "طلب الاسترداد قيد المتابعة";
    case "refund_completed":
      return "تم تنفيذ الاسترداد";
    case "cancelled":
      return "الطلب ملغي";
    default: {
      const stage = resolveApplicationStage(clean, paymentStatus);
      if (stage === "submitted") return "تم استلام الطلب وتسجيله";
      if (stage === "queued_for_review") return "بانتظار دوره لبدء المراجعة";
      if (stage === "prequalified") return "مؤهل مبدئيًا وبانتظار بدء الدراسة";
      if (stage === "requirements_pending") return "بانتظار استكمال المتطلب المحدد";
      if (stage === "under_review") return "قيد الدراسة";
      if (stage === "final_review") return "في المرحلة النهائية من الدراسة";
      if (stage === "approved") return "صدرت الموافقة النهائية";
      if (stage === "rejected") return "انتهت الدراسة ولم تتم الموافقة";
      if (stage === "refund_requested") return "طلب الاسترداد قيد المتابعة";
      if (stage === "refund_completed") return "تم تنفيذ الاسترداد";
      if (stage === "cancelled") return "الطلب ملغي";
      return "قيد المتابعة";
    }
  }
}

export function stageCustomerStatusLine(app: Pick<ApplicationRecord, "status" | "payment_status">): string {
  const status = String(app.status || "").trim().toLowerCase();
  const stage = resolveApplicationStage(status, app.payment_status);

  if (status === "preliminary_application") {
    return "تم تسجيل الطلب وتأهيله مبدئيًا، وهو الآن بانتظار دوره لبدء دراسة الملف.";
  }

  if (stage === "submitted") return "تم استلام الطلب وتسجيله، وهو الآن بانتظار بدء المراجعة.";
  if (stage === "queued_for_review") return "الطلب بانتظار دوره لبدء المراجعة.";
  if (stage === "prequalified") return "تم تأهيل الطلب مبدئيًا، وهو بانتظار بدء دراسة الملف.";
  if (stage === "requirements_pending") return `الطلب ${statusHumanLabelV113(status, app.payment_status)}.`;
  if (stage === "under_review") return "الملف قيد الدراسة.";
  if (stage === "final_review") return "الملف في المرحلة النهائية من الدراسة.";
  if (stage === "approved") return "صدرت الموافقة النهائية على الطلب.";
  if (stage === "rejected") return "انتهت دراسة الطلب ولم تتم الموافقة.";
  if (stage === "refund_requested") return "طلب الاسترداد مسجل وقيد المتابعة.";
  if (stage === "refund_completed") return "تم تنفيذ الاسترداد.";
  if (stage === "cancelled") return "الطلب ملغي.";
  return `حالة الطلب الحالية: ${statusHumanLabelV113(status, app.payment_status)}.`;
}

export function customerAskedAboutFinalApproval(text: string | null | undefined): boolean {
  return /(?:الموافقة\s+النهائية|وافقوا|تمت\s+الموافقة|تم\s+ولا\s+لا|موافق\s+نهائي|قرار\s+نهائي)/i.test(String(text || ""));
}
