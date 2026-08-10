import type { ApplicationRecord } from "./types";
import { normalizeArabicText } from "./text";

function cleanDecisionText(value: string) {
  return normalizeArabicText(String(value || ""))
    .replace(/am-\d{8,}/gi, " ")
    .replace(/(?:\+?962|00962|0)?7[789]\d{7}/g, " ")
    .replace(/[؟?!.,،؛:;"'“”()\[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text: string, values: string[]) {
  const t = cleanDecisionText(text);
  return values.some((value) => t.includes(cleanDecisionText(value)));
}

export function isExplicitNonContinuationText(text: string) {
  return containsAny(text, [
    "لا ارغب بالاستمرار", "لا أريد الاستمرار", "لا اريد الاستمرار",
    "لا ارغب بالمتابعه", "لا أرغب بالمتابعة", "لا اريد المتابعه", "لا أريد المتابعة",
    "ما بدي اكمل", "ما بدي أكمل", "مش حاب اكمل", "مش حاب أكمل",
    "مش حابه اكمل", "مش حابة أكمل", "ما رح اكمل", "ما رح أكمل",
    "ما راح اكمل", "ما راح أكمل", "بطلت بدي اكمل", "خلص ما بدي اكمل",
    "مش راح استمر", "مش رح استمر", "ما بدي استمر",
  ]);
}

export function isPositiveContinueDecisionText(text: string) {
  const t = cleanDecisionText(text);
  if (!t || isExplicitNonContinuationText(t)) return false;
  if (containsAny(t, ["مش موافق", "غير موافق", "لا اوافق", "لا أوافق"])) return false;

  return containsAny(t, [
    "اود الاستمرار", "أود الاستمرار", "ارغب بالاستمرار", "أرغب بالاستمرار",
    "اريد الاستمرار", "أريد الاستمرار", "بدي استمر", "بدي اكمل", "بدي أكمل",
    "خلينا نكمل", "نكمل بالطلب", "كمل بالطلب", "اكمل بالطلب", "استمر بالطلب",
    "موافق على الجهاز", "موافق عالجهاز", "تمام موافق على الجهاز", "تمام موافق عالجهاز",
    "جاهز ادفع رسوم فتح الملف", "جاهز أدفع رسوم فتح الملف",
    "ابعث تعليمات الدفع", "ابعت تعليمات الدفع", "ارسل تعليمات الدفع", "أرسل تعليمات الدفع",
    "افتح الملف", "افتحولي الملف", "بدي افتح الملف",
  ]);
}

export function isExactCancelConfirmationText(text: string) {
  const t = cleanDecisionText(text);
  const exact = new Set([
    "اكد الغاء الطلب", "أكد إلغاء الطلب", "اكد الالغاء", "أكد الإلغاء",
    "نعم اكد الغاء الطلب", "نعم أكد إلغاء الطلب",
    "نعم الغي نهائيا", "نعم ألغي نهائيًا", "الغيه نهائيا", "الغيه نهائيًا",
    "الغوا نهائيا", "الغوا نهائيًا", "الغاء نهائي", "إلغاء نهائي",
    "متاكد بدي الغي", "متأكد بدي ألغي", "خلص الغي نهائي", "خلص ألغي نهائي",
    "confirm cancel", "yes cancel", "cancel confirmed", "cancel it permanently",
  ].map(cleanDecisionText));
  return exact.has(t);
}

export function isConditionalCancellationText(text: string) {
  const t = cleanDecisionText(text);
  const cancel = containsAny(t, ["الغي", "ألغي", "الغاء", "إلغاء", "كنسل", "cancel"]);
  const conditional = containsAny(t, ["اذا", "إذا", "لو", "بلاش", "قبل ما", "ممكن", "يمكن", "رح", "راح"]);
  return cancel && conditional && !isExactCancelConfirmationText(t);
}

export function isExplicitStopRefundText(text: string) {
  const t = cleanDecisionText(text);
  if (!t) return false;
  return containsAny(t, [
    "الغاء طلب الاسترداد", "إلغاء طلب الاسترداد", "الغي الاسترداد", "ألغي الاسترداد",
    "الغوا الاسترداد", "وقف الاسترداد", "اوقف الاسترداد", "أوقف الاسترداد",
    "ما بدي استرداد", "تراجعت عن الاسترداد", "بدي اوقف الاسترداد", "بدي أوقف الاسترداد",
    "رجع طلب التلفون", "رجعولي طلب التلفون", "رجعوا طلب التلفون", "رجع الطلب وكملوه",
    "بدي ارجع للطلب بدل الاسترداد", "بدي أرجع للطلب بدل الاسترداد",
  ]);
}

export function isExplicitRefundMutationText(text: string) {
  const t = cleanDecisionText(text);
  if (!t || isExplicitStopRefundText(t)) return false;

  const direct = containsAny(t, [
    "بدي استرداد", "اريد استرداد", "أريد استرداد", "بدي استرجاع", "اريد استرجاع", "أريد استرجاع",
    "رجعوا فلوسي", "رجعولي فلوسي", "بدي فلوسي", "رجعولي الرسوم", "رجعوا الرسوم",
    "استرجاع الرسوم", "استرداد الرسوم", "رجعولي الخمسه", "رجعولي الخمسة",
    "رجعوا الخمسه", "رجعوا الخمسة", "رجعولي ال 5", "رجعولي 5", "رجعولي ٥",
    "الخمس دنانير رجعهم", "الخمسه دنانير رجعهم", "الخمسة دنانير رجعهم",
  ]);
  if (direct) return true;

  const ambiguousVerb = containsAny(t, ["رجعولي", "رجعهم", "رجعلي", "رجعوهم", "ردهم"]);
  const financialAnchor = containsAny(t, [
    "فلوس", "مصاري", "رسوم", "المبلغ", "مبلغ", "دينار", "دنانير", "الخمسه", "الخمسة", "حواله", "حوالة",
  ]);
  return ambiguousVerb && financialAnchor;
}

export function isExactReopenConfirmationText(text: string) {
  const t = cleanDecisionText(text);
  const exact = new Set([
    "اكد اعاده تفعيل الطلب", "أكد إعادة تفعيل الطلب", "اكد إعادة تفعيل الطلب",
    "اكد اعاده فتح الطلب", "أكد إعادة فتح الطلب", "نعم رجع الطلب", "نعم ارجع الطلب",
    "نعم أرجع الطلب", "موافق رجع الطلب", "confirm reopen", "reopen confirmed",
  ].map(cleanDecisionText));
  return exact.has(t);
}

export function hasConfirmedPaymentEvidence(app: ApplicationRecord | null | undefined) {
  if (!app) return false;
  return app.payment_status === "confirmed" || Boolean(app.payment_confirmed_at) || app.payment_reference === "customer_cancelled_paid_refund_pending";
}

export function hasRefundState(app: ApplicationRecord | null | undefined) {
  if (!app) return false;
  return app.status === "refund_requested" || app.payment_status === "refund_requested" || app.status === "refund_completed";
}

export function hasInvalidRefundState(app: ApplicationRecord | null | undefined) {
  return hasRefundState(app) && !hasConfirmedPaymentEvidence(app);
}
