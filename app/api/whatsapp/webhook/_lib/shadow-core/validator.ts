import { normalizeArabicText } from "../text";
import type { ShadowFacts, ShadowTopic, ShadowValidation } from "./types";

function includesAny(text: string, values: string[]) {
  const normalized = normalizeArabicText(text);
  return values.some((value) => normalized.includes(normalizeArabicText(value)));
}

function topicAnswered(topic: ShadowTopic, reply: string) {
  const checks: Partial<Record<ShadowTopic, string[]>> = {
    order_status: ["حاله", "الحالة", "طلبك", "الملف"],
    review_time: ["يومين", "3 ايام", "ثلاث ايام", "موعد غير مؤكد", "المدة المعتادة"],
    bank_requirement: ["بنك محدد", "مش مطلوب بنك", "لا يحتاج بنك", "التقديم"],
    early_settlement: ["الاتفاق", "الجدول", "السداد الكامل", "غير مؤكد"],
    payment_method: ["كليك", "cliq", "محفظه", "محفظة", "الدفع"],
    payment_status: ["الدفع", "الوصل", "مؤكد", "بانتظار التأكيد", "لا يوجد مبلغ"],
    procedures: ["الخطوه", "الخطوة", "المراجعه", "المراجعة", "بعد"],
    requirements: ["المطلوب", "كفيل", "راتب", "هويه", "هوية", "لا يوجد مستند"],
    office_location: ["المكتب", "العنوان", "موعد رسمي"],
    delivery: ["الاستلام", "المكتب", "موعد"],
    supplier_delay: ["التوريد", "المورد", "موعد مؤكد"],
    cancellation: ["الغاء", "إلغاء", "تأكيد"],
    refund: ["الاسترداد", "الرسوم", "المبلغ"],
    stop_refund: ["ايقاف الاسترداد", "إيقاف الاسترداد", "تكمل", "الاستمرار"],
    human_agent: ["عمران", "موظف", "متابعه الحالات", "متابعة الحالات", "النقطه", "النقطة"],
    staff_change: ["موظف آخر", "موظف ثاني", "عمران", "متابعة"],
    voice_message: ["الرسالة الصوتية", "الصوت", "اكتب"],
    media_upload: ["الصورة", "الفيديو", "المرفق"],
    document_upload: ["المستند", "الرابط الرسمي", "الرفع الرسمي"],
    complaint: ["التأخير", "المدة", "حقك", "فاهم"],
    trust: ["رسمي", "الطلب", "الدفع", "الموقع"],
    general_question: [],
  };
  const words = checks[topic] || [];
  return words.length === 0 || includesAny(reply, words);
}

export function validateShadowReply(candidate: string, topics: ShadowTopic[], facts: ShadowFacts): ShadowValidation {
  const reply = String(candidate || "").trim();
  const riskFlags: string[] = [];

  if (!reply) riskFlags.push("empty_reply");
  if (reply.length > 1400) riskFlags.push("reply_too_long");
  if (includesAny(reply, ["اكتب السؤال كامل", "اكتب النقطة بكلمتين", "لازم تدخل بشري", "سيتم تحويلك", "متابعة بشرية"])) riskFlags.push("cold_or_internal_template");
  if (includesAny(reply, ["فرع", "فروع"])) riskFlags.push("forbidden_branch_word");
  if (includesAny(reply, ["payameen"])) riskFlags.push("wrong_payment_alias");
  if (!facts.paymentCurrentlyAllowed && includesAny(reply, ["ادفعي رسوم فتح الملف", "ادفع رسوم فتح الملف", "حولي 5", "حوّل 5", "تحويل رسوم فتح الملف"])) riskFlags.push("payment_requested_when_not_allowed");
  if (facts.paymentAlreadyConfirmed && includesAny(reply, ["ادفع الرسوم", "ادفعي الرسوم", "حول الرسوم", "حولي الرسوم"])) riskFlags.push("duplicate_payment_request");
  if (!facts.requiredDocument && includesAny(reply, ["نحتاج منك الهوية", "نحتاج منك كشف الراتب", "مطلوب منك كفيل", "ارفع الهوية", "ارفع كشف الراتب"])) riskFlags.push("unrequested_document_claim");
  if (!facts.officeAddressCanBeShared && includesAny(reply, ["رانا سنتر", "شارع المدينة المنورة", "مقابل مستشفى العيون"])) riskFlags.push("address_shared_before_allowed_state");
  if (includesAny(reply, ["اكيد بتقدري تسددي كامل", "أكيد بتقدري تسددي كامل", "السداد الكامل متاح دائما"])) riskFlags.push("unsupported_early_settlement_guarantee");
  if (!facts.isApproved && includesAny(reply, ["موافقه نهائيه", "موافقة نهائية", "تمت الموافقة النهائية"])) riskFlags.push("false_final_approval");
  if (!facts.refundCompleted && includesAny(reply, ["تم الاسترداد", "رجع المبلغ", "تمت الحوالة"])) riskFlags.push("false_refund_completion");
  if (!facts.refundActive && includesAny(reply, ["تم تسجيل الاسترداد", "طلب الاسترداد مسجل"])) riskFlags.push("false_refund_registration");
  if (includesAny(reply, ["تواصلت مع المورد", "اتصلت بالمورد", "تم تصعيد الطلب"])) riskFlags.push("unexecuted_action_claim");

  const answeredTopics = topics.filter((topic) => topicAnswered(topic, reply));
  const missingTopics = topics.filter((topic) => !answeredTopics.includes(topic));
  if (missingTopics.length) riskFlags.push("missing_customer_topics");

  const score = Math.max(0, 100 - riskFlags.length * 18 - missingTopics.length * 7);
  return { valid: riskFlags.length === 0, score, riskFlags, answeredTopics, missingTopics };
}
