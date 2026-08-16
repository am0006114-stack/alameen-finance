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

export function isPaymentOnReceiptQuestionText(value: string) {
  const text = normalizeArabicText(String(value || ""));
  if (!text) return false;

  const mentionsPayOnReceipt = [
    "ادفع عند الاستلام", "أدفع عند الاستلام", "الدفع عند الاستلام", "دفع عند الاستلام",
    "ادفع وقت الاستلام", "أدفع وقت الاستلام", "الدفع وقت الاستلام",
    "ادفع لما استلم", "أدفع لما استلم", "لما استلم بدفع", "لما استلم بأدفع",
    "بس استلم بدفع", "بس استلم بأدفع", "ع استلام التلفون", "على استلام التلفون",
    "ع استلام الجهاز", "على استلام الجهاز", "عند استلام التلفون", "عند استلام الجهاز",
  ].some((phrase) => text.includes(normalizeArabicText(phrase)));

  if (!mentionsPayOnReceipt) return false;
  const explicitQuestionContext = ["بسال", "بسأل", "سؤالي", "سوال", "سؤال", "حاب اسال", "حاب أسأل", "بدي اسال", "بدي أسأل"]
    .some((phrase) => text.includes(normalizeArabicText(phrase)));
  return explicitQuestionContext
    || /^(هل|بقدر|ممكن|بصير|ينفع|بزبط|ليش|شو)(?:\s|[؟?]|$)/.test(text)
    || /[؟?]$/.test(String(value || "").trim());
}

export function isPaymentOnReceiptRefusalText(value: string) {
  const text = normalizeArabicText(String(value || ""));
  if (!text || isPaymentOnReceiptQuestionText(text)) return false;

  const explicit = [
    "ما بدفع قبل ما استلم", "ما رح ادفع قبل ما استلم", "ما راح ادفع قبل ما استلم",
    "مش دافع قبل ما استلم", "ما بدي ادفع قبل ما استلم", "لا ادفع قبل الاستلام",
    "الدفع عند الاستلام", "دفع عند الاستلام", "بدي الدفع عند الاستلام",
    "بدي ادفع عند الاستلام", "بدي أدفع عند الاستلام", "ادفع عند استلام الجهاز", "أدفع عند استلام الجهاز",
    "ادفع عند استلام التلفون", "أدفع عند استلام التلفون", "الدفع عند الاستلام فقط", "بس عند الاستلام", "عند الاستلام بس",
    "بدفع عند الاستلام بس", "ادفع عند الاستلام بس", "أدفع عند الاستلام بس",
    "ادفع ع استلام التلفون بس", "أدفع ع استلام التلفون بس", "ادفع على استلام التلفون بس",
    "ادفع ع استلام الجهاز بس", "أدفع ع استلام الجهاز بس", "ادفع على استلام الجهاز بس",
    "بس استلم الجهاز بدفع", "بس استلم التلفون بدفع", "لما استلم الجهاز بدفع", "لما استلم التلفون بدفع",
    "اذا ما في دفع عند الاستلام ما بدي", "إذا ما في دفع عند الاستلام ما بدي",
    "اذا ما بقدر ادفع عند الاستلام ما بدي", "إذا ما بقدر أدفع عند الاستلام ما بدي",
    "الجهاز بايدي وبعدين بدفع", "التلفون بايدي وبعدين بدفع",
  ].some((phrase) => text.includes(normalizeArabicText(phrase)));

  if (explicit) return true;

  const receiptContext = ["استلام", "استلم", "الجهاز بايدي", "التلفون بايدي"].some((phrase) => text.includes(normalizeArabicText(phrase)));
  const payContext = ["ادفع", "أدفع", "بدفع", "دفع"].some((phrase) => text.includes(normalizeArabicText(phrase)));
  const exclusivity = ["بس", "فقط", "ما بدفع قبل", "مش دافع قبل", "لا ادفع قبل"].some((phrase) => text.includes(normalizeArabicText(phrase)));
  return receiptContext && payContext && exclusivity;
}

export function isClearPaymentRefusalText(value: string) {
  const text = normalizeArabicText(String(value || ""));
  if (!text) return false;

  if (isPaymentOnReceiptRefusalText(text)) return true;

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
  if (isPaymentOnReceiptRefusalText(text)) return true;
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
      || text.includes(normalizeArabicText("الدفع عند الاستلام غير متاح"))
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
- إذا العميل سأل فقط هل يمكن الدفع عند استلام الجهاز، جاوب مباشرة أن رسوم فتح الملف مطلوبة قبل بدء دراسة الطلب وأن الدفع عند الاستلام غير متاح، بدون تصنيفه كرافض من أول سؤال.
- إذا العميل اشترط أو أصر أنه لن يدفع إلا عند الاستلام، اشرح السياسة مرة واحدة فقط ثم اختم باحترام، والتصنيف الإداري يبقى داخليًا.
- إذا العميل رفض الدفع بوضوح، اشرح السياسة مرة واحدة فقط. عند التكرار اختم باحترام ولا تعيد تعليمات الدفع أو الروابط.
- لا تدخل بنقاش دفاعي طويل مع عميل غاضب أو شاك؛ وضح الحقيقة باختصار واترك القرار له.
- كلمة "جاهز للتجاهل" وأي تصنيف داخلي تبقى للإدارة فقط ولا تظهر للعميل.
`;
}
