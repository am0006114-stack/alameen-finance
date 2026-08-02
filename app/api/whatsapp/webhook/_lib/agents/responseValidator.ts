import type { AiReplyInput } from "../types";
import { hasAny, normalizeArabicText } from "../text";

export type AgentReplyValidation = {
  valid: boolean;
  reason: string;
};

const GENERIC_FAILURES = [
  "اكتب السؤال كامل",
  "اكتب النقطه بكلمتين",
  "رح اجاوب على نفس النقطه",
  "وصلتني الرساله لكن معناها مش واضح",
  "ما في تحديث جديد مختلف",
];

const UNSUPPORTED_ACTIONS = [
  "تم الغاء الطلب",
  "تم إلغاء الطلب",
  "تم تنفيذ الاسترداد",
  "تم ايقاف الاسترداد",
  "تم إيقاف الاسترداد",
  "تم اعاده تفعيل الطلب",
  "تم إعادة تفعيل الطلب",
  "تواصلت مع المورد",
  "تواصلنا مع المورد",
  "تم التواصل مع المورد",
  "تم تصعيد الطلب",
];

export function validateAgentReply(reply: string, input: AiReplyInput): AgentReplyValidation {
  const clean = String(reply || "").trim();
  const normalized = normalizeArabicText(clean);
  const fallback = normalizeArabicText(input.deterministicReply || "");

  if (!clean) return { valid: false, reason: "empty_reply" };
  if (hasAny(normalized, GENERIC_FAILURES)) return { valid: false, reason: "generic_non_answer" };

  const wrongNames = ["فدوة", "تالا", "عبدالله", "عبدالرحمن", "عمران"]
    .filter((name) => name !== input.assignedAgentName);
  if (wrongNames.some((name) => normalized.includes(normalizeArabicText(`معك ${name}`)))) {
    return { valid: false, reason: "wrong_agent_identity" };
  }

  for (const claim of UNSUPPORTED_ACTIONS) {
    const normalizedClaim = normalizeArabicText(claim);
    if (normalized.includes(normalizedClaim) && !fallback.includes(normalizedClaim)) {
      return { valid: false, reason: "unsupported_action_claim" };
    }
  }

  const status = String(input.status || "");
  const approved = ["approved", "customer_accepts_delivery_delay", "delivery_delay_notice_sent"].includes(status);
  const negatedApproval = hasAny(normalized, [
    "ما في موافقة نهائية", "ما في موافقه نهائيه", "لسا ما صدرت الموافقة", "لم تصدر الموافقة", "مش موافقة نهائية",
  ]);
  const positiveApprovalClaim = !negatedApproval && hasAny(normalized, [
    "طلبك عليه موافقة نهائية", "الطلب عليه موافقة نهائية", "تمت الموافقة النهائية", "صدرت الموافقة النهائية", "طلبك مقبول",
  ]);
  if (!approved && positiveApprovalClaim) {
    return { valid: false, reason: "false_approval_claim" };
  }

  if (input.activeAgentRole === "study" && hasAny(normalized, ["مضمون القبول", "اكيد بتنقبل", "الكفيل بضمن القبول"])) {
    return { valid: false, reason: "study_guarantee_claim" };
  }

  if (input.activeAgentRole !== "escalation" && hasAny(normalized, ["احولك لموظف", "تم تحويلك لموظف", "تدخل بشري"])) {
    return { valid: false, reason: "human_transfer_claim" };
  }

  if (String(input.intent) === "review_time" && !hasAny(normalized, ["يومين", "2 يوم", "ثلاث ايام", "3 ايام", "أيام عمل", "ايام عمل"])) {
    return { valid: false, reason: "review_time_not_answered" };
  }

  return { valid: true, reason: "ok" };
}
