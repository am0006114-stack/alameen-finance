import { normalizeArabicText } from "./text";

const INTERNAL_CUSTOMER_FACING_PHRASES = [
  "مجرد سؤالك عن الاسترداد لا يسجل طلب استرداد",
  "مجرد سؤالك عن الاسترداد لا يغير حالة طلبك",
  "حتى احافظ على دقة ملفك",
  "الحالة المعتمدة تقرا من الطلب نفسه",
  "الحاله المعتمده تقرا من الطلب نفسه",
  "ما رح ارسل لك جواب ناقص",
  "المعلومة المؤكدة فقط",
  "المعلومه المؤكده فقط",
  "بناء على رد غير مكتمل",
  "معلومة غير مثبتة",
  "معلومه غير مثبته",
  "ما رح اؤكد او اغير اي حالة",
  "ما رح اكد او اغير اي حالة",
  "حسب الحماية",
  "حسب الحارس",
  "final truth",
  "validator",
  "mutation",
  "جاهز للتجاهل",
  "تجاهل العميل",
];

export function hasInternalCustomerFacingLanguage(value: string) {
  const text = normalizeArabicText(String(value || ""));
  if (!text) return false;
  return INTERNAL_CUSTOMER_FACING_PHRASES.some((phrase) => text.includes(normalizeArabicText(phrase)));
}

export function isClearPaymentRefusalText(value: string) {
  const text = normalizeArabicText(String(value || ""));
  if (!text) return false;

  const explicit = [
    "ما بدفع",
    "ما رح ادفع",
    "ما راح ادفع",
    "مش دافع",
    "مش دافعه",
    "ما بدي ادفع",
    "مش حاب ادفع",
    "مش حابه ادفع",
    "لا ارغب بدفع",
    "لا اريد دفع",
    "لا ادفع اي فلس",
    "ما بدفع ايشي",
    "ما بدفع اشي",
  ].some((phrase) => text.includes(normalizeArabicText(phrase)));

  if (!explicit) return false;

  const looksLikeQuestionOnly = /^(ليش|لماذا|هل|ممكن|بقدر|بصير|شو)(?:\s|[؟?]|$)/.test(text);

  return !looksLikeQuestionOnly;
}

export function isAbsolutePaymentRefusalText(value: string) {
  const text = normalizeArabicText(String(value || ""));
  if (!isClearPaymentRefusalText(text)) return false;

  return [
    "ما بدفع ايشي",
    "ما بدفع اشي",
    "لا ادفع اي فلس",
    "مستحيل ادفع",
    "نهائيا",
    "قبل ما يكون الجهاز",
    "قبل ما يكون التلفون",
    "قبل ما استلم الجهاز",
    "قبل ما استلم التلفون",
    "الا لما يكون الجهاز",
    "بس لما يكون الجهاز",
  ].some((phrase) => text.includes(normalizeArabicText(phrase)));
}

export function paymentRefusalPolicyWasExplained(replies: string[]) {
  return (replies || []).some((reply) => {
    const text = normalizeArabicText(String(reply || ""));
    return text.includes(normalizeArabicText("رسوم فتح الملف 5 دنانير مطلوبة قبل بدء دراسة الملف"))
      || text.includes(normalizeArabicText("إذا هالطريقة ما بتناسبك"))
      || text.includes(normalizeArabicText("ما عليك أي التزام تكمل"));
  });
}

export function paymentRefusalFinalClosureWasSent(replies: string[]) {
  return (replies || []).some((reply) => {
    const text = normalizeArabicText(String(reply || ""));
    return text.includes(normalizeArabicText("بنحترم قرارك"))
      && text.includes(normalizeArabicText("إذا غيرت رأيك لاحقًا"));
  });
}

export function customerFacingPolicyInstructions() {
  return `
قواعد Customer-Facing الإلزامية:
- لا تشرح للعميل كيف تعمل الحماية أو التصنيف أو تغيير الحالة داخليًا.
- ممنوع عبارات مثل: "مجرد سؤالك لا يسجل طلب استرداد"، "حتى أحافظ على دقة ملفك"، "الحالة المعتمدة تُقرأ من الطلب"، "ما رح أرسل لك جواب ناقص"، أو أي كلام عن guards / validators / mutations.
- جاوب السؤال التجاري نفسه مباشرة وبأقصر صياغة مفيدة.
- إذا العميل رفض الدفع بوضوح، اشرح السياسة مرة واحدة فقط. عند التكرار اختم باحترام ولا تعيد تعليمات الدفع أو الروابط.
- لا تدخل بنقاش دفاعي طويل مع عميل غاضب أو شاك؛ وضح الحقيقة باختصار واترك القرار له.
- كلمة "جاهز للتجاهل" وأي تصنيف داخلي تبقى للإدارة فقط ولا تظهر للعميل.
`;
}
