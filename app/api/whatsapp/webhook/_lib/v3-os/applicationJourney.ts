import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import type { ApplicationTruth, InterpretedTurn } from "./types";

export type ApplicationJourneyStage =
  | "unbound"
  | "preliminary_review"
  | "preliminary_approved_waiting_decision"
  | "continuation_confirmed_fee_due"
  | "payment_proof_pending_admin"
  | "payment_confirmed_under_review"
  | "needs_identity"
  | "needs_salary_slip"
  | "needs_guarantor"
  | "approved"
  | "cancelled"
  | "refund_requested"
  | "refund_completed"
  | "other";

const PRELIMINARY_REVIEW = new Set(["", "preliminary_application", "submitted"]);
const PRELIMINARY_APPROVED = new Set(["preliminary_qualified"]);
const CONTINUE_RECORDED = new Set(["customer_confirmed_continue"]);
const FEE_DUE_PAYMENT = new Set(["pending", "pending_payment", "payment_info_sent"]);
const PAYMENT_PENDING_ADMIN = new Set(["customer_claimed_paid", "pending_payment_confirmation"]);
const NEEDS_IDENTITY = new Set(["needs_identity", "identity_requested"]);
const NEEDS_SALARY = new Set(["needs_salary_slip", "salary_slip_link_sent"]);
const NEEDS_GUARANTOR = new Set(["needs_guarantor"]);
const APPROVED = new Set(["approved", "final_approved", "ready_for_pickup", "ready_for_contract", "delivery_ready"]);
const CANCELLED = new Set(["cancelled", "customer_declined_continue", "rejected"]);
const REFUND_REQUESTED = new Set(["refund_requested"]);
const REFUND_COMPLETED = new Set(["refund_completed", "refunded"]);

function low(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function applicationJourneyStage(app: ApplicationTruth | null | undefined): ApplicationJourneyStage {
  if (!app) return "unbound";

  const status = low(app.status);
  const paymentStatus = low(app.paymentStatus);

  if (REFUND_COMPLETED.has(status) || REFUND_COMPLETED.has(paymentStatus)) return "refund_completed";
  if (REFUND_REQUESTED.has(status) || REFUND_REQUESTED.has(paymentStatus)) return "refund_requested";
  if (CANCELLED.has(status)) return "cancelled";
  if (hasAuthoritativePaymentConfirmation(app)) return "payment_confirmed_under_review";
  if (PAYMENT_PENDING_ADMIN.has(paymentStatus)) return "payment_proof_pending_admin";
  if (NEEDS_IDENTITY.has(status)) return "needs_identity";
  if (NEEDS_SALARY.has(status)) return "needs_salary_slip";
  if (NEEDS_GUARANTOR.has(status)) return "needs_guarantor";
  if (APPROVED.has(status)) return "approved";
  if (CONTINUE_RECORDED.has(status) || FEE_DUE_PAYMENT.has(paymentStatus)) return "continuation_confirmed_fee_due";
  if (PRELIMINARY_APPROVED.has(status) || Boolean(app.preliminaryQualifiedAt)) return "preliminary_approved_waiting_decision";
  if (PRELIMINARY_REVIEW.has(status)) return "preliminary_review";
  return "other";
}

export function explicitContinuation(turn: InterpretedTurn) {
  return turn.requestedActions.includes("continue_application") ||
    turn.acts.some((act) => act.type === "request_action" && act.action === "continue_application");
}

export function customerFacingStatusLabel(app: ApplicationTruth | null | undefined) {
  const stage = applicationJourneyStage(app);
  switch (stage) {
    case "preliminary_review": return "قيد المراجعة المبدئية";
    case "preliminary_approved_waiting_decision": return "موافقة مبدئية";
    case "continuation_confirmed_fee_due": return "تم تسجيل رغبتك بالاستمرار";
    case "payment_proof_pending_admin": return "إثبات الدفع بانتظار مراجعة الإدارة";
    case "payment_confirmed_under_review": return "قيد الدراسة النهائية";
    case "needs_identity": return "بانتظار استكمال الهوية";
    case "needs_salary_slip": return "بانتظار كشف/شهادة الراتب";
    case "needs_guarantor": return "بانتظار استكمال بيانات الكفيل";
    case "approved": return "موافق عليه";
    case "cancelled": return "الطلب متوقف";
    case "refund_requested": return "الاسترداد قيد المعالجة";
    case "refund_completed": return "تم الاسترداد";
    default: return "قيد المتابعة";
  }
}

export function firstCustomerName(app: ApplicationTruth | null | undefined) {
  return String(app?.fullName || "").trim().split(/\s+/).filter(Boolean)[0] || null;
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function customerOrderSnapshot(app: ApplicationTruth | null | undefined) {
  if (!app) return [] as string[];
  const lines: string[] = [];
  const name = firstCustomerName(app);
  if (name) lines.push(`الاسم: ${name}`);
  if (app.trackingId) lines.push(`رقم التتبع: ${app.trackingId}`);
  if (app.deviceName) lines.push(`الجهاز: ${app.deviceName}`);
  const price = money(app.devicePrice);
  if (price) lines.push(`سعر الجهاز المسجل: ${price} دينار`);
  const monthly = money(app.monthlyPayment);
  if (monthly && app.installmentMonths) lines.push(`القسط الشهري التقريبي: ${monthly} دينار لمدة ${app.installmentMonths} شهر`);
  else if (monthly) lines.push(`القسط الشهري التقريبي: ${monthly} دينار`);
  else if (app.installmentMonths) lines.push(`مدة التقسيط: ${app.installmentMonths} شهر`);
  lines.push(`حالة الطلب: ${customerFacingStatusLabel(app)}`);
  return lines;
}

export function isPreContinuationPaymentSilence(app: ApplicationTruth | null | undefined, turn: InterpretedTurn) {
  const stage = applicationJourneyStage(app);
  if (explicitContinuation(turn)) return false;
  return stage === "preliminary_review" || stage === "preliminary_approved_waiting_decision";
}

export function shouldAskContinuationDecision(app: ApplicationTruth | null | undefined, turn: InterpretedTurn) {
  return applicationJourneyStage(app) === "preliminary_approved_waiting_decision" && !explicitContinuation(turn);
}

export function isPreliminaryStatusStage(app: ApplicationTruth | null | undefined) {
  const stage = applicationJourneyStage(app);
  return stage === "preliminary_review" || stage === "preliminary_approved_waiting_decision";
}

export function canDiscloseFileOpeningPayment(app: ApplicationTruth | null | undefined, turn: InterpretedTurn) {
  const stage = applicationJourneyStage(app);
  if (stage === "unbound" || stage === "preliminary_review") return false;
  if (stage === "preliminary_approved_waiting_decision") return explicitContinuation(turn);
  return true;
}
