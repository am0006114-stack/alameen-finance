import { applicationJourneyStage } from "./applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { normalizeArabic } from "./text";
import type { ApplicationTruth, PolicyTruth, TruthBundle } from "./types";

export type PaymentDisclosureDecision = {
  feeExplanationAllowed: boolean;
  paymentExecutionDetailsAllowed: boolean;
  receiptLinkAllowed: boolean;
  alreadyPaid: boolean;
  receiptPending: boolean;
  reason: string;
};

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

export function explicitFeePolicyQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:خمس|5|٥)\s*(?:دنانير|دينار)|رسوم\s*فتح\s*الملف|رسوم\s*الطلب|ليش\s*(?:في|بدكم)\s*(?:رسوم|خمس|5|٥)|شو\s*رسوم/.test(q);
}

export function paymentDisclosureDecision(input: {
  application: ApplicationTruth | null | undefined;
  customerText?: string | null;
  explicitContinuationThisTurn?: boolean;
}): PaymentDisclosureDecision {
  const app = input.application;
  const feeQuestion = explicitFeePolicyQuestionText(input.customerText);
  if (!app) {
    return {
      feeExplanationAllowed: feeQuestion,
      paymentExecutionDetailsAllowed: false,
      receiptLinkAllowed: false,
      alreadyPaid: false,
      receiptPending: false,
      reason: "no_authoritative_application",
    };
  }

  const alreadyPaid = hasAuthoritativePaymentConfirmation(app);
  const receiptPending = app.documents?.paymentReceiptUploaded === true;
  const status = String(app.status || "").trim().toLowerCase();
  const paymentStatus = String(app.paymentStatus || "").trim().toLowerCase();
  const stage = applicationJourneyStage(app);
  const continuationPersisted = ["customer_confirmed_continue", "payment_info_sent"].includes(status)
    || ["pending_payment", "payment_info_sent"].includes(paymentStatus);
  const preliminarilyEligible = status === "preliminary_qualified" || continuationPersisted || stage === "preliminary_approved_waiting_decision";
  const explicitContinuation = Boolean(input.explicitContinuationThisTurn);

  if (alreadyPaid) {
    return {
      feeExplanationAllowed: true,
      paymentExecutionDetailsAllowed: false,
      receiptLinkAllowed: false,
      alreadyPaid: true,
      receiptPending,
      reason: "payment_already_confirmed",
    };
  }
  if (receiptPending) {
    return {
      feeExplanationAllowed: true,
      paymentExecutionDetailsAllowed: false,
      receiptLinkAllowed: false,
      alreadyPaid: false,
      receiptPending: true,
      reason: "receipt_pending_admin",
    };
  }
  if (!preliminarilyEligible) {
    return {
      feeExplanationAllowed: feeQuestion,
      paymentExecutionDetailsAllowed: false,
      receiptLinkAllowed: false,
      alreadyPaid: false,
      receiptPending: false,
      reason: `stage_not_payment_eligible:${stage}`,
    };
  }

  const paymentExecutionDetailsAllowed = explicitContinuation || continuationPersisted;
  return {
    feeExplanationAllowed: true,
    paymentExecutionDetailsAllowed,
    receiptLinkAllowed: paymentExecutionDetailsAllowed,
    alreadyPaid: false,
    receiptPending: false,
    reason: paymentExecutionDetailsAllowed ? "continuation_payment_ready" : "awaiting_explicit_continuation",
  };
}

export function containsRestrictedPaymentExecutionDetail(reply: string, policy?: PolicyTruth | null) {
  const aliases = (policy?.paymentAliases || []).filter(Boolean);
  if (aliases.some((alias) => String(reply || "").includes(alias))) return true;
  const beneficiary = String(policy?.paymentBeneficiaryName || "").trim();
  if (beneficiary && String(reply || "").toLowerCase().includes(beneficiary.toLowerCase())) return true;
  return /\/receipt(?:\?|\b)|اسم\s*المستفيد|(?:حول|حوّل|تحويل)[^\n]{0,60}(?:كليك|cliq|محفظه|محفظة|orange\s*money)|(?:محفظه|محفظة)\s*orange\s*money/i.test(String(reply || ""));
}

export function containsFiveJodFeeExplanation(reply: string) {
  const q = normalized(reply);
  return /(?:5|٥)\s*(?:دنانير|دينار)/.test(String(reply || "")) && /رسوم\s*فتح\s*الملف/.test(q);
}

export function buildSafePaymentFirewallReply(input: {
  truth: TruthBundle;
  customerText: string;
  decision: PaymentDisclosureDecision;
}) {
  const p = input.truth.policy;
  const app = input.truth.application;
  if (input.decision.alreadyPaid) {
    return "الدفع مؤكد إداريًا على طلبك، فما في عليك أي دفعة أو وصل جديد هسا. الملف مكمل بالمرحلة المسجلة عليه.";
  }
  if (input.decision.receiptPending) {
    return "وصل الدفع موجود على الملف وبانتظار مراجعة الإدارة، فما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية.";
  }
  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_approved_waiting_decision") {
    return `طلبك أخذ موافقة مبدئية، ولسا مش موافقة نهائية. إذا اخترت الاستمرار، الخطوة التالية فتح الملف للدراسة النهائية ورسومها ${p.fileOpeningFeeJod} دنانير؛ منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. تفاصيل التحويل بنعطيك إياها فقط بعد ما تأكد إنك بدك تستمر.`;
  }
  if (stage === "preliminary_review") {
    return `طلبك لسا بالمراجعة المبدئية. رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير بتصير فقط بعد صدور الموافقة المبدئية واختيارك الاستمرار؛ ما في أي تحويل مطلوب منك هسا.`;
  }
  if (explicitFeePolicyQuestionText(input.customerText)) {
    return `رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير، وهي منفصلة عن ثمن الجهاز والقسط الأول، وبتدخل فقط بعد الموافقة المبدئية واختيار الاستمرار. تفاصيل التحويل ما بنرسلها قبل وصول الطلب للمرحلة الصحيحة واختيار العميل يكمل.`;
  }
  return "ما في عندي خطوة دفع موثقة ومفتوحة على الحالة الحالية، لذلك ما رح أعطيك بيانات تحويل قبل وقتها.";
}
