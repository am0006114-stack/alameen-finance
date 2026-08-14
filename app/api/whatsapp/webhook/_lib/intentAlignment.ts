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

export function currentMessageSemanticIntentHint(value: string): CustomerIntent | null {
  if (isReceiptConfirmationCurrentText(value)) return "receipt_upload_confirmation";
  if (customerAsksCancellationPossibility(value)) return "cancel_request";
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
