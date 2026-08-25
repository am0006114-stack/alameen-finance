import { normalizeArabicText } from "./text";
import type { CustomerIntent } from "./types";

function n(value: string) {
  return normalizeArabicText(String(value || ""))
    .replace(/[؟?!.,،؛:;"'“”()\[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, values: string[]) {
  const t = n(text);
  return values.some((value) => t.includes(n(value)));
}

const SOCIAL_PREFIXES = [
  "تمام", "اوكي", "okay", "ok", "شكرا", "شكراً", "مشكور", "مشكوره", "يسلمو", "تسلم",
  "يعطيك العافيه", "يعطيك العافية", "يعطيكم العافيه", "يعطيكم العافية",
  "مرحبا", "مرحباً", "اهلا", "أهلا", "اهلين", "أهلين", "هلا",
  "السلام عليكم", "صباح الخير", "مساء الخير",
];

const SOCIAL_HONORIFICS = [
  "اخي", "أخي", "اختي", "أختي", "حبيبي", "حبيبتي", "يا اخي", "يا أخي", "يا اختي", "يا أختي",
];

export function stripLeadingSocialAcknowledgement(value: string) {
  let text = n(value);
  if (!text) return "";

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of SOCIAL_PREFIXES) {
      const p = n(prefix);
      if (text === p) return "";
      if (text.startsWith(`${p} `)) {
        text = text.slice(p.length).trim();
        changed = true;
        break;
      }
    }
  }

  let honorificRemoved = true;
  while (honorificRemoved && text) {
    honorificRemoved = false;
    for (const honorific of SOCIAL_HONORIFICS) {
      const h = n(honorific);
      if (text === h) return "";
      if (text.startsWith(`${h} `)) {
        text = text.slice(h.length).trim();
        honorificRemoved = true;
        break;
      }
    }
  }

  return text;
}

export function isPureSocialAcknowledgementText(value: string) {
  const original = n(value);
  if (!original) return false;
  const tail = stripLeadingSocialAcknowledgement(original);
  if (!tail) return true;
  return ["اه", "اها", "نعم", "تمام تمام", "ولا يهمك"].includes(tail);
}

export function hasSubstantiveContentAfterSocialPrefix(value: string) {
  const original = n(value);
  if (!original) return false;
  const tail = stripLeadingSocialAcknowledgement(original);
  if (!tail || tail === original) return false;
  return tail.length >= 3;
}

export function isReceiptConfirmationCurrentText(value: string) {
  const text = n(value);
  if (!text) return false;
  const receiptAnchor = hasAny(text, [
    "وصل الدفع", "وصل دفع", "الوصل", "الايصال", "الإيصال", "اشعار التحويل", "إشعار التحويل",
  ]);
  const actionAnchor = hasAny(text, [
    "رفعت", "تم رفع", "ارفقته", "أرفقته", "بعثته بالرابط", "رفعته بالرابط", "متابعه التاكيد",
    "متابعة التأكيد", "تاكيد الوصل", "تأكيد الوصل", "تاكد الدفع", "تأكد الدفع",
  ]);
  return receiptAnchor && actionAnchor;
}

export function customerAsksReviewTiming(value: string) {
  const text = n(value);
  if (!text) return false;
  if (hasAny(text, ["استرداد", "استرجاع", "الحواله", "الحوالة", "مصاري", "فلوس", "المبلغ"])) return false;
  return hasAny(text, [
    "متى", "لمتى", "لحد متى", "قديش", "كم وقت", "كم يوم", "كم ساعه", "كم ساعة",
    "اكثر من 72 ساعه", "أكثر من 72 ساعة", "72 ساعه", "72 ساعة", "٧٢ ساعه", "٧٢ ساعة",
    "طولت", "مطول", "صارلي", "صرلي", "الوقت", "متى تردوا", "متى تردو",
  ]);
}

export function customerAsksCurrentNextStep(value: string) {
  const text = n(value);
  if (!text) return false;
  return hasAny(text, [
    "شو مطلوب مني", "شو المطلوب مني", "شو علي", "شو لازم اعمل", "شو لازم أعمل",
    "هسا شو اعمل", "هسا شو أعمل", "هسه شو اعمل", "هسه شو أعمل", "شو اسوي هسا",
    "شو أسوي هسا", "شو الخطوه الجايه", "شو الخطوة الجاية", "شو المطلوب حاليا", "شو المطلوب حاليًا",
    "مطلوب مني حالين", "مطلوب مني حاليا", "مطلوب مني حاليًا",
  ]);
}

export function customerAsksAmmanLocation(value: string) {
  const text = n(value);
  if (!text) return false;
  return hasAny(text, [
    "موجود بعمان", "موجود في عمان", "انتو بعمان", "انتم بعمان", "المكتب بعمان", "مكتبكم بعمان",
    "يعني بعمان", "بعمان صح",
  ]);
}


export function customerAsksGeneralOfficeArea(value: string) {
  const text = n(value);
  if (!text) return false;
  return hasAny(text, [
    "في اي محافظه", "في أي محافظة", "اي محافظه", "أي محافظة", "وين موقعكم", "وين المكتب",
    "وين بعمان", "وين في عمان", "بأي منطقة", "باي منطقه", "شارع شو", "اي شارع", "أي شارع",
    "الموقع بعيد", "اعرف اذا بعيد", "أعرف إذا بعيد",
  ]);
}

export function customerAsksCancellationPossibility(value: string) {
  const text = n(value);
  if (!text) return false;
  if (hasAny(text, ["بلاش الغي", "بلاش ألغي", "ما بدي الغي", "ما بدي ألغي", "مش بدي الغي", "مش بدي ألغي"])) return false;
  return hasAny(text, [
    "بزبط الغي", "بزبط ألغي", "بقدر الغي", "بقدر ألغي", "ممكن الغي", "ممكن ألغي",
    "هل بقدر الغي", "هل بقدر ألغي", "بصير الغي", "بصير ألغي", "كيف الغي", "كيف ألغي",
  ]);
}


function isPureGreetingFragment(value: string) {
  const text = n(value);
  return [
    "الخير", "صباح", "مساء",
  ].includes(text);
}

function isExplicitHumanRequest(value: string) {
  const text = n(value);
  if (!text) return false;
  return hasAny(text, [
    "بدي موظف", "احكي مع موظف", "بدي حدا يحكي معي", "بدي حد يحكي معي",
    "بدي انسان", "بدي إنسان", "بدي بني ادم", "بدي بني آدم", "بدي بني تدم",
    "بدي بشر", "وين البشر", "حدا حقيقي", "شخص حقيقي", "موظف حقيقي",
    "انت روبوت", "انت روبورت", "انتي روبوت", "انتي روبورت",
    "talk to a human", "live agent", "real person",
  ]);
}

function isExplicitTrackingLinkRequest(value: string) {
  const text = n(value);
  if (!text) return false;

  // V1.6.5: a specific operational link request is not a generic tracking-link request.
  // Let the production route resolve identity / receipt / guarantor / salary / refund safely.
  const specificOperationalContext = hasAny(text, [
    "هوية", "هويه", "الهوية", "الهويه",
    "وصل", "ايصال", "إيصال", "حواله", "حوالة",
    "كشف راتب", "شهادة راتب", "شهاده راتب",
    "كفيل", "الضامن", "ضامن",
    "استرداد", "استرجاع", "refund",
    "اختيار الجهاز", "تغيير الجهاز", "تعديل الجهاز",
  ]);
  if (specificOperationalContext) return false;

  const direct = hasAny(text, [
    "وين الرابط", "اين الرابط", "أين الرابط", "اين الرايط", "وين الرايط",
    "بدي الرابط", "ابعث الرابط", "ابعت الرابط", "ارسل الرابط", "أرسل الرابط",
    "هات الرابط", "اعطيني الرابط", "أعطيني الرابط", "الرابط لو سمحت",
    "وين اللينك", "بدي اللينك", "link please",
  ]);
  const linkWord = hasAny(text, ["رابط", "الرايط", "لينك", "link"]);
  const askWord = hasAny(text, ["وين", "اين", "أين", "بدي", "ابعث", "ابعت", "ارسل", "أرسل", "هات", "اعطيني", "أعطيني", "لو سمحت"]);
  return direct || (linkWord && askWord);
}

function isClearSiteIssue(value: string) {
  const text = n(value);
  if (!text) return false;
  const problem = hasAny(text, [
    "مش راضي يفتح", "مو راضي يفتح", "ما بفتح", "مش شغال", "ما بشتغل",
    "حدث خطا", "حدث خطأ", "خطا في الاتصال", "خطأ في الاتصال", "error", "404",
    "لا يمكنني تتبع", "مش قادر اتتبع", "مش قادر أتتبع", "ما بقدر اتتبع", "ما بقدر أتتبع",
    "غير موجود", "ما لقي الطلب", "مش لاقي الطلب",
  ]);
  const context = hasAny(text, [
    "الموقع", "السايت", "الرابط", "الرايط", "تتبع", "التتبع", "متابعه الطلب", "متابعة الطلب",
    "اقدم الطلب", "أقدم الطلب", "التقديم", "اختار جهاز", "اختيار جهاز", "الطلب",
  ]);
  return problem && context;
}

function isProductAvailabilityUiIssue(value: string) {
  const text = n(value);
  return hasAny(text, ["مخزون محدود", "المخزون محدود", "ما لقينا جهاز مطابق", "ما لقينا جهازا مطابقا", "ما لقيت الجهاز بالموقع"]);
}

function isGeneralRequirementsQuestion(value: string) {
  const text = n(value);
  if (!text) return false;
  return hasAny(text, [
    "شو الاوراق", "شو الأوراق", "الاوراق المطلوبه", "الأوراق المطلوبة", "شو الورق المطلوب",
    "شو اجهز اوراق", "شو أجهز أوراق", "اي اوراق", "أي أوراق", "شو الوثائق", "المستندات المطلوبة",
  ]);
}

export function currentMessageSemanticIntentHint(value: string): CustomerIntent | null {
  if (isReceiptConfirmationCurrentText(value)) return "receipt_upload_confirmation";
  if (customerAsksCancellationPossibility(value)) return "cancel_request";
  if (isClearSiteIssue(value)) return "site_issue";
  if (isExplicitTrackingLinkRequest(value)) return "tracking_link_request";
  if (isProductAvailabilityUiIssue(value)) return "products";
  if (isGeneralRequirementsQuestion(value)) return "requirements";
  if (isExplicitHumanRequest(value) && n(value).length <= 90) return "human_agent";
  if (isPureGreetingFragment(value)) return "greeting";
  if (customerAsksGeneralOfficeArea(value) || customerAsksAmmanLocation(value)) return "location";
  if (customerAsksReviewTiming(value)) return "review_time";
  if (customerAsksCurrentNextStep(value)) return "order_status";
  return null;
}

export function replyLooksSocialOnly(value: string) {
  const text = n(value);
  if (!text) return true;
  const compact = text.replace(/\s+/g, " ").trim();
  return [
    "العفو", "العفو بخدمتك باي وقت", "العفو بخدمتك بأي وقت", "وصلت", "تمام", "اهلا وسهلا",
    "أهلا وسهلا", "ولا يهمك", "من عيوني",
  ].includes(compact);
}
