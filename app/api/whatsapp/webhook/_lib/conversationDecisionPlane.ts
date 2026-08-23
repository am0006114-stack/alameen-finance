import type { CustomerIntent } from "./types";
import { normalizeArabicText } from "./text";

function n(value: string) {
  return normalizeArabicText(String(value || "")).replace(/\s+/g, " ").trim();
}

function c(value: string) {
  return n(value).replace(/[\s\-_.،,!?؟]+/g, "");
}

export function isNaturalNonContinuationText(value: string) {
  const text = n(value);
  const compact = c(value);
  if (!text) return false;

  // Negated cancellation means the customer wants to keep the request.
  if (/(?:لا|ما|مش)\s*(?:بدي|اريد|أريد)?\s*(?:الغي|ألغي|الغاء|إلغاء)/.test(text)) return false;

  return [
    "مابدي اكمل", "ما بدي اكمل", "ما بدي أكمل", "مش بدي اكمل", "مش بدي أكمل",
    "لا ارغب بالاستمرار", "لا أرغب بالاستمرار", "لاارغب بالاستمرار",
    "لا اريد الاستمرار", "لا أريد الاستمرار", "لااريدالاستمرار",
    "مش حاب اكمل", "مش حاب أكمل", "مش حابه اكمل", "مش حابة أكمل",
    "ما رح اكمل", "ما راح اكمل", "لن اكمل", "لن أكمل",
    "مش مكمل", "مش مكمله", "بطلت بدي اكمل", "بطلت بدي أكمل",
    "لا اريد الجهاز", "لا أريد الجهاز", "لااريدالجهاز", "ما بدي الجهاز", "مش بدي الجهاز",
  ].some((needle) => text.includes(needle) || compact.includes(c(needle)));
}

export function isNaturalContinueText(value: string) {
  const text = n(value);
  if (!text || isNaturalNonContinuationText(text)) return false;
  if (/(?:لا|ما|مش)\s+.*(?:اكمل|أكمل|استمر)/.test(text)) return false;

  return [
    "اريد الاستمرار", "أريد الاستمرار", "اود الاستمرار", "أود الاستمرار",
    "بدي اكمل", "بدي أكمل", "بدي استمر", "خلينا نكمل", "كمل", "كمل الطلب",
    "نعم استمر", "اه استمر", "آه استمر", "نعم اكمل", "نعم أكمل",
    "موافق اكمل", "موافق أكمل", "تمام استمر", "تمام كمل",
  ].some((needle) => text === needle || text.includes(needle));
}

export function isNaturalCancelRequestText(value: string) {
  const text = n(value);
  if (!text) return false;
  if (/(?:لا|ما|مش)\s*(?:بدي|اريد|أريد)?\s*(?:الغي|ألغي|الغاء|إلغاء)/.test(text)) return false;

  return [
    "بدي الغي", "بدي ألغي", "اريد الغاء", "أريد إلغاء", "الغاء الطلب", "إلغاء الطلب",
    "الغي الطلب", "ألغي الطلب", "الغوا الطلب", "لغوا الطلب", "كنسل الطلب",
    "اريد الغاء الطلب نهائيا", "أريد إلغاء الطلب نهائيًا",
  ].some((needle) => text.includes(needle));
}

export function currentMessageDecisionOverride(value: string): CustomerIntent | null {
  if (isNaturalNonContinuationText(value)) return "voluntary_opt_out" as CustomerIntent;
  if (isNaturalCancelRequestText(value)) return "cancel_request" as CustomerIntent;
  if (isNaturalContinueText(value)) return "continue_decision" as CustomerIntent;
  return null;
}

export function isGuarantorUnavailableText(value: string) {
  const text = n(value);
  if (!text || !/(كفيل|ضامن)/.test(text)) return false;
  const unavailable = /(ما\s*في|مافي|لا يوجد|ما عندي|ماعندي|مش عندي|ما معي|مش معي)/.test(text);
  const guarantorConstraint = /(ضمان|ضمان اجتماعي|مشترك|اشتراك)/.test(text) || /(كفيل|ضامن)/.test(text);
  return unavailable && guarantorConstraint;
}

export function guarantorUnavailableReply() {
  return "فاهم عليك. إذا ما عندك كفيل مشترك بالضمان، لا ترفع بيانات غير صحيحة. عندك كفيل بدون ضمان، ولا ما عندك كفيل نهائيًا؟";
}

export function replyContradictsNonContinuation(customerText: string, reply: string) {
  if (!isNaturalNonContinuationText(customerText)) return false;
  const out = n(reply);
  return /(تم تأكيد رغبتك بالاستمرار|طلبك مؤهل مبدئيا ونقدر نبدأ|رسوم فتح الملف|AMENPAY|AMEEENPAY|ارفع الوصل|تحويل)/i.test(out);
}

export function replyAsksContinueAgain(customerText: string, reply: string) {
  if (!isNaturalContinueText(customerText)) return false;
  const out = n(reply);
  return /(اكتب.*اريد الاستمرار|اكتب.*أريد الاستمرار)/i.test(out);
}

export function replyWronglyRequestsGuarantorUpload(customerText: string, reply: string) {
  if (!isGuarantorUnavailableText(customerText)) return false;
  const out = n(reply);
  return ((out.includes("بيانات الكفيل") || out.includes("الكفيل")) && /(عب|ارفع|رابط)/i.test(out)) || /guarantor/i.test(out);
}
