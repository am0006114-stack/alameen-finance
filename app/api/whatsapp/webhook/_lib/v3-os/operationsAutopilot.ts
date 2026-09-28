export type RecoveryCandidate = {
  eligible: boolean;
  priority: number;
  className: "payment" | "business_action" | "question" | "complaint" | "recent_unknown" | "skip";
  reason: string;
};

function normalize(value: string | null | undefined) {
  return String(value || "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[ـ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isPaymentPriorityCustomerText(text: string | null | undefined, intent?: string | null) {
  const n = normalize(text);
  const i = String(intent || "").toLowerCase();
  if (!n) return false;
  if (/(?:ما|مش|مو)\s*(?:بدي|حاب|ناوي)?\s*(?:ادفع|احول)|ليش\s*(?:ادفع|احول)|دفعت|حولت|تم\s*الدفع/.test(n)) return false;
  if ((["payment_method", "payment_recipient", "receipt_upload", "payment"].includes(i) || i.includes("payment")) && /(?:ادفع|احول|تحويل|رابط|محفظ|كليك|cliq|orange|اورنج|الخمس|5|٥)/i.test(n)) return true;
  // Do not use ASCII \b word boundaries around Arabic words: JavaScript treats
  // Arabic letters as non-\w, which can make genuine phrases such as "وين ادفع"
  // fail matching when no intent label is available.
  return /(?:بدي\s*(?:ادفع|احول)|حاب\s*(?:ادفع|احول)|جاهز\s*(?:ادفع|للدفع|احول)|كيف\s*(?:بدي\s*)?(?:ادفع|احول)|وين\s*(?:بدي\s*)?(?:ادفع|احول)|(?:اعطيني|اعطني)\s*(?:وين|كيف)?\s*(?:ادفع|احول)|وين\s*احول\s*(?:كليك|cliq)?|ممكن\s*(?:اعرف\s*)?كيف\s*(?:بدي\s*)?(?:ادفع|احول)|رابط\s*الدفع|بيانات\s*(?:الدفع|التحويل)|معلومات\s*(?:الدفع|التحويل)|رقم\s*التحويل|ع\s*اي\s*رقم\s*احول|على\s*اي\s*رقم\s*احول|وين\s*المحفظ|اي\s*بنك|أي\s*بنك)/i.test(n);
}

export function isSocialClosureCustomerText(text: string | null | undefined, messageType?: string | null) {
  if (String(messageType || "").toLowerCase() === "reaction") return true;
  const n = normalize(text);
  if (!n) return true;
  if (/^[\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u.test(n)) return true;
  // Phase 9: ambiguous acknowledgements such as "تم/تمام/ماشي/خلص" can be
  // confirmations of a pending business action. Never discard them without context.
  return /^(?:اوك|اوكي|اوكيه|شكرا|شكرا الك|يسلمو|يعطيك العافيه|الله يعطيك العافيه|حياك|حياكي|ان شاء الله|الحمد لله|👍|❤️|❤)$/.test(n);
}

export function isBusinessActionText(text: string | null | undefined, intent?: string | null) {
  const n = normalize(text);
  const i = String(intent || "").toLowerCase();
  if (["cancel_request", "refund", "stop_refund", "reopen", "device_change", "data_change"].includes(i)) return true;
  return /(?:الغ(?:ي|اء)|استرداد|استرجاع|وقف\s*(?:الاسترداد|الاسترجاع)|اوقف\s*(?:الاسترداد|الاسترجاع)|ارجع\s*افتح|اعاده\s*فتح|تغيير\s*(?:الجهاز|الموديل|البيانات)|عدل\s*(?:الجهاز|الموديل|البيانات))/.test(n);
}

export function classifyRecoveryCandidate(input: {
  body?: string | null;
  intent?: string | null;
  messageType?: string | null;
  ageMs: number;
  freeformWindowMs?: number;
}): RecoveryCandidate {
  const freeformWindowMs = input.freeformWindowMs ?? 23.5 * 60 * 60 * 1000;
  if (!Number.isFinite(input.ageMs) || input.ageMs < 0 || input.ageMs > freeformWindowMs) {
    return { eligible: false, priority: 99, className: "skip", reason: "outside_freeform_window" };
  }
  if (isSocialClosureCustomerText(input.body, input.messageType)) {
    return { eligible: false, priority: 99, className: "skip", reason: "social_closure_or_reaction" };
  }
  if (isPaymentPriorityCustomerText(input.body, input.intent)) {
    return { eligible: true, priority: 0, className: "payment", reason: "revenue_payment_priority" };
  }
  if (isBusinessActionText(input.body, input.intent)) {
    return input.ageMs <= 6 * 60 * 60 * 1000
      ? { eligible: true, priority: 1, className: "business_action", reason: "business_action_waiting" }
      : { eligible: false, priority: 99, className: "skip", reason: "business_action_too_old_for_unsolicited_recovery" };
  }
  const n = normalize(input.body);
  const questionLike = /[؟?]/.test(String(input.body || "")) || /^(?:وين|كيف|شو|ايش|ليش|متى|امتى|قديش|كم|هل|ممكن|بقدر|وينه|وينها)/.test(n);
  if (questionLike) {
    return input.ageMs <= 2 * 60 * 60 * 1000
      ? { eligible: true, priority: 2, className: "question", reason: "unanswered_question" }
      : { eligible: false, priority: 99, className: "skip", reason: "question_too_old_for_unsolicited_recovery" };
  }
  const complaintLike = /(?:وين\s*الرد|ما\s*حد\s*رد|ما\s*بترد|ليش\s*ما\s*بترد|ردوا|رد\s*علي|طولت|تاخرت|تأخرت|زهقت|طفشت)/.test(n);
  if (complaintLike && input.ageMs <= 2 * 60 * 60 * 1000) {
    return { eligible: true, priority: 2, className: "complaint", reason: "customer_waiting_complaint" };
  }
  if (n.length >= 2 && input.ageMs <= 15 * 60 * 1000) {
    return { eligible: true, priority: 4, className: "recent_unknown", reason: "recent_unresolved_turn" };
  }
  return { eligible: false, priority: 99, className: "skip", reason: "stale_or_non_actionable_unknown" };
}

export function arabicOperationalActionName(value: string | null | undefined) {
  const actions: Record<string, string> = {
    cancel_application: "إلغاء الطلب",
    continue_application: "استمرار الطلب",
    request_refund: "طلب الاسترداد",
    stop_refund: "إيقاف الاسترداد",
    reopen_application: "إعادة فتح الطلب",
    change_device: "تغيير الجهاز وإعادة الحسبة",
    change_application_data: "تعديل بيانات الطلب",
    link_whatsapp_alias: "اعتماد رقم واتساب للمتابعة",
    generate_receipt_link: "تجهيز رابط رفع الوصل",
    generate_secure_upload_link: "تجهيز رابط الرفع الآمن",
    payment_incident_review: "مراجعة تحويل الدفع",
    delete_personal_data: "حذف البيانات الشخصية",
    expedite_review: "طلب استعجال المراجعة",
  };
  const key = String(value || "");
  return actions[key] || (key ? key : "إجراء على الطلب");
}

export function formatWaitingAge(ageMs: number) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "غير معروف";
  const minutes = Math.max(0, Math.floor(ageMs / 60000));
  if (minutes < 1) return "أقل من دقيقة";
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ساعة و${rest} دقيقة` : `${hours} ساعة`;
}
