import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ApplicationRecord = {
  id: string;
  created_at?: string | null;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  status?: string | null;
  payment_status?: string | null;
  device_name?: string | null;
  salary?: number | string | null;
  delivery_delay_until?: string | null;
};

type WhatsAppMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
};

type WhatsAppWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: WhatsAppMessage[];
        statuses?: unknown[];
      };
    }>;
  }>;
};

type CustomerIntent =
  | "abuse"
  | "legal_threat"
  | "social_media_threat"
  | "scam_accusation"
  | "payment_dispute"
  | "device_delay_rage"
  | "complaint"
  | "refund"
  | "continue_decision"
  | "decline_decision"
  | "human_agent"
  | "loan"
  | "contact_info"
  | "website"
  | "location"
  | "installment_info"
  | "requirements"
  | "apply"
  | "products"
  | "payment"
  | "delivery"
  | "order_status"
  | "greeting"
  | "thanks"
  | "unknown";

type AiReplyInput = {
  customerText: string;
  deterministicReply: string;
  customerName?: string;
  trackingId?: string;
  status?: string | null;
  paymentStatus?: string | null;
  deviceName?: string | null;
  isSensitive: boolean;
  hasApplication: boolean;
  intent: CustomerIntent;
};

const BUSINESS_NAME = "الأمين للأقساط";
const BUSINESS_ADDRESS = "رانا سنتر - الطابق الثاني - مقابل مستشفى العيون - شارع المدينة المنورة";
const BUSINESS_PHONE_DISPLAY = "0788500337";
const BUSINESS_PHONE_E164 = "+962788500337";
const BUSINESS_WEBSITE = "https://www.ameenfinance.co";
const POST_EID_DELIVERY_TEXT = "سيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة واعتماد جدول التوزيع من الإدارة";
const POST_EID_DELIVERY_STRICT_TEXT =
  "حتى هذه اللحظة ما زلنا بانتظار تزويدنا بالأجهزة من الوكلاء والموردين المعتمدين، وسيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة واعتماد جدول التوزيع من الإدارة";


function fileOpeningFeeExplanation() {
  return `توضيح مهم بخصوص رسوم فتح الملف:
رسوم فتح الملف هي 5 دنانير فقط، وليست دفعة على الجهاز وليست القسط الأول.

سبب وجودها أن كل ملف يتم تدقيقه يدويًا قبل القرار النهائي، ومع كثرة الطلبات اليومية توجد طلبات غير مكتملة أو غير جادة تعطل مراجعة ملفات العملاء الجادين.

الرسوم تساعد على تخصيص وقت المراجعة للطلبات الجادة واستكمال إجراءات الدراسة، وهي مستردة بالكامل في حال عدم الموافقة النهائية.

والقسط الأول لا يُدفع الآن، وإنما بعد الاستلام حسب الاتفاق.`;
}

function noPaymentNeededLine() {
  return `لا يوجد أي دفع مطلوب الآن إلا إذا كان طلبكم مؤهلًا مبدئيًا وتم إرسال تعليمات فتح الملف رسميًا لكم.`;
}

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

function digitsOnly(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeArabicText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, keywords: string[]) {
  const t = normalizeArabicText(text);
  return keywords.some((word) => t.includes(normalizeArabicText(word)));
}

function normalizeJordanPhone(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("00962") && digits.length === 14) return `0${digits.slice(5)}`;
  if (digits.startsWith("962") && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.startsWith("7") && digits.length === 9) return `0${digits}`;
  return digits;
}

function normalizeWhatsAppToSend(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("00962")) return digits.slice(2);
  if (digits.startsWith("962")) return digits;
  if (digits.startsWith("07") && digits.length === 10) return `962${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `962${digits}`;
  return digits;
}

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "عميلنا الكريم";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

function formatJordanDateTime(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("ar-JO", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function extractTracking(text: string) {
  const match = text.match(/AM-\d{8,}/i);
  return match ? match[0].toUpperCase() : "";
}

function extractJordanPhoneFromText(text: string) {
  const raw = String(text || "");
  const candidates = raw.match(/(?:\+?962|00962|0)?7[789]\d{7}/g) || [];

  for (const candidate of candidates) {
    const normalized = normalizeJordanPhone(candidate);
    if (/^07[789]\d{7}$/.test(normalized)) {
      return normalized;
    }
  }

  return "";
}

const agentNames = [
  "علي", "لؤي", "خالد", "عمر", "سامر", "أحمد", "رامي", "محمد", "أنس", "يزن",
  "سلمى", "ديما", "لين", "رنا", "نور", "تالا", "مي", "لانا", "جود", "هبة", "سمر",
];

function pickAgentName(seed: string) {
  const digits = digitsOnly(seed);
  const last = Number(digits.slice(-2) || "0");
  return agentNames[last % agentNames.length];
}

function humanOpening(seed: string) {
  const agent = pickAgentName(seed);
  const variants = [
    `أهلًا وسهلًا 🌿\nمعك ${agent} من ${BUSINESS_NAME}.`,
    `هلا فيك 🌿\nمعك ${agent} من فريق ${BUSINESS_NAME}.`,
    `أهلًا فيك، معك ${agent} 🌿\nخليني أساعدك.`,
    `يا هلا 🌿\nمعك ${agent} من ${BUSINESS_NAME}، أبشر.`,
    `مرحبًا 🌿\nمعك ${agent}، كيف بقدر أساعدك؟`,
    `حيّاك الله 🌿\nمعك ${agent} من ${BUSINESS_NAME}.`,
  ];

  const digits = digitsOnly(seed);
  const last = Number(digits.slice(-2) || "0");

  return variants[last % variants.length];
}

function isGreeting(text: string) {
  const t = normalizeArabicText(text);
  return ["مرحبا", "هلا", "السلام عليكم", "مساء الخير", "صباح الخير", "الو", "اهلا", "هاي", "hi", "hello"].includes(t);
}


const CONTACT_INFO_KEYWORDS = [
  "رقمكم", "رقمكو", "رقم الشركة", "رقم الشركه", "رقم المحل", "رقم الفرع", "رقم التواصل",
  "تواصل معكم", "اتواصل معكم", "كيف اتواصل", "كيف أتواصل", "بدي رقمكم", "اعطيني رقمكم",
  "ابعث رقمكم", "ارسل رقمكم", "واتسابكم", "واتس ابكم", "واتساب الشركة", "واتس اب الشركة",
  "phone", "number", "contact", "whatsapp number", "whatsapp",
  "شو رقمكم", "ايش رقمكم", "ما رقمكم", "رقم تلفون", "رقم هاتف", "هاتفكم", "تلفونكم",
  "اتصل فيكم", "اتصال", "رن عليكم", "احكي معكم", "اكلمكم"
];

function isContactInfoText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  if (hasAny(t, CONTACT_INFO_KEYWORDS)) return true;

  const hasPhoneWord = hasAny(t, ["رقم", "تلفون", "هاتف", "واتساب", "واتس", "اتصال", "تواصل", "contact", "phone"]);
  const hasCompanyContext = hasAny(t, ["الشركة", "الشركه", "الامين", "الأمين", "عندكم", "لكم", "معكم", "المحل", "الفرع"]);

  return hasPhoneWord && hasCompanyContext;
}


const ABUSE_KEYWORDS = [
  // إساءة مباشرة / بذاءة عربية وأردنية شائعة — تعامل معها كحدود احترام، لا كتحية ولا كسؤال عادي
  "كس اختك", "كس اختكم", "كس امك", "كس امكم", "كس امه", "كس عرضك", "كس شرفك", "كسمك", "كسمكم", "كسمكو",
  "انيك", "انيكك", "انيك اختك", "انيك امك", "نيك", "منيوك", "منيك", "منايك", "متناك", "متناكة", "متناكه",
  "عرص", "عرصة", "عرصه", "معرص", "معرصين", "قواد", "قحبة", "قحبه", "شرموط", "شرموطة", "شرموطه",
  "ابن حرام", "ولاد حرام", "يا حرامي يا ابن", "يا ابن الكلب", "ابن كلب", "كلب", "كلاب", "يا كلب", "يا كلاب",
  "خرا", "خره", "زب", "زبي", "طيزي", "طز فيك", "طقع", "تفوو", "تف عليك", "يلعن", "يلعن امك", "يلعن اختك", "لعنة الله",
  "احا", "احه", "يلعن شرف", "يا وسخ", "وسخ", "وسخين", "حقير", "حقيرين", "حيوان", "بقر", "جحش", "حمار", "يا حمار",
  "غبي", "اغبياء", "تافه", "ساقط", "نذل", "واطي", "واطيين", "قذر", "قذرين", "خنزير", "خنازير",

  // إساءة إنجليزية/فرانكو محتملة
  "fuck", "fucking", "motherfucker", "bitch", "son of a bitch", "asshole", "dick", "shit", "bastard", "wtf",
  "kos omak", "kos okhtak", "koss omak", "koss ekhtak", "kess ekhtak", "ayre", "ayri", "airi", "sharmout", "sharmoota",

  // اختصارات/كتابة محرفة
  "ك*س", "ك س امك", "ك س اختك", "كسختك", "كسامك", "كسمكو", "كسامكو", "منيكين", "متناكين", "عرصات",
];

const LEGAL_THREAT_KEYWORDS = [
  "محامي", "محاميه", "محامية", "قضيه", "قضية", "محكمه", "محكمة", "شرطة", "شرطه", "مركز امني", "مركز أمني",
  "جرائم الكترونية", "جرائم إلكترونية", "الجرائم الالكترونيه", "الجرائم الإلكترونية", "حماية المستهلك", "حمايه المستهلك",
  "وزارة الصناعة", "وزارة الصناعة والتجارة", "البنك المركزي", "المدعي العام", "النائب العام", "حق قانوني", "قانونيا", "قانونيًا",
  "راح ارفع عليكم", "برفع عليكم", "بدي ارفع قضية", "ارفع قضية", "دعوى", "دعوى قضائية", "بشتكي", "رح اشتكي", "راح اشتكي", "هشتكي",
  "complaint", "lawyer", "police", "lawsuit", "court", "report",
];

const SOCIAL_MEDIA_THREAT_KEYWORDS = [
  "بفضحكم", "افضحكم", "رح افضحكم", "راح افضحكم", "بنشر عليكم", "انشر عليكم", "سوشال ميديا", "فيسبوك", "تيك توك", "انستغرام",
  "بوست", "منشور", "جروبات", "قروبات", "الناس تعرف", "بحذر الناس", "احذر الناس", "بنزل سكرينات", "سكرينات", "سكرين شوت",
  "تقييم سيء", "review", "facebook", "instagram", "tiktok",
];

const SCAM_ACCUSATION_KEYWORDS = [
  "نصب", "نصاب", "نصابه", "نصابين", "بتنصبوا", "نصبتو", "نصبتوا", "منصوب علي", "احتيال", "محتال", "محتالين",
  "سرقه", "سرقة", "سارق", "سراق", "حرامي", "حراميه", "حرامية", "سرقتوني", "سرقتو", "سرقتوا",
  "شركة وهمية", "وهمية", "وهم", "خداع", "مخادعين", "ضحكتوا علينا", "بتضحكوا علينا", "scam", "fraud", "scammer",
];

const PAYMENT_DISPUTE_KEYWORDS = [
  "بدي فلوسي", "رجعوا فلوسي", "رجعولي فلوسي", "مصاريي", "فلوسي راحت", "استرداد", "استرجاع", "refund",
  "رجعولي الرسوم", "استرجع الرسوم", "وين مصاري", "وين المصاري", "دفعت", "دافع", "حواله", "حوالة", "وصل", "ايصال", "إيصال",
  "اخذتوا مصاري", "اكلتوا مصاري", "رسوم فتح الملف", "وين رسوم فتح الملف",
];

const DEVICE_DELAY_RAGE_KEYWORDS = [
  "وين جهازي", "وين الجهاز", "وين تلفوني", "وين الموبايل", "وين طلبي", "وين الطلب", "متى بستلم", "ليش ما استلمت",
  "تسليم", "استلام", "تأخير الجهاز", "تاخير الجهاز", "طولتوا", "صارلي", "بستنى", "مستني", "ما في تحديث", "ما وصلني",
];

function isAbuseText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, ABUSE_KEYWORDS);
}

function isLegalThreatText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, LEGAL_THREAT_KEYWORDS);
}

function isSocialMediaThreatText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, SOCIAL_MEDIA_THREAT_KEYWORDS);
}

function isScamAccusationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, SCAM_ACCUSATION_KEYWORDS);
}

function isPaymentDisputeText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, PAYMENT_DISPUTE_KEYWORDS);
}

function isDeviceDelayRageText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, DEVICE_DELAY_RAGE_KEYWORDS) && hasAny(t, ["تاخير", "تأخير", "طولت", "صارلي", "بستنى", "مستني", "وين", "ليش", "ما وصل", "ما استلم"]);
}


const ANGRY_CUSTOMER_KEYWORDS = [
  // اتهامات نصب / احتيال / سرقة
  "نصب", "نصاب", "نصابه", "نصابين", "بتنصبوا", "نصبتو", "نصبتوا", "منصوب علي", "انضحك علي",
  "احتيال", "محتال", "محتالين", "احتيالي", "احتيال مالي", "fraud", "scam", "scammer",
  "سرقه", "سرقة", "سارق", "سراق", "حرامي", "حراميه", "حرامية", "سرقتوني", "سرقتو", "سرقتوا",
  "اكلتوا حقي", "اكلتو حقي", "اكلتوا مصاري", "اخذتوا مصاري", "اخذتو مصاري", "ماكلين حقي",
  "تلاعب", "لعب", "خداع", "مخادعين", "تضليل", "كذب", "كذاب", "كذابين", "وهم", "وهمية", "شركة وهمية",

  // غضب / قهر / إساءة تجربة
  "حرام عليكم", "عيب", "مش محترمين", "قلة احترام", "استهتار", "استهتار في الناس", "بهدله", "بهدلة",
  "قرفت", "زهقت", "تعبت", "مللت", "طفشت", "انقهرت", "مقهور", "مقهوره", "حسبي الله", "حسبنا الله",
  "الله لا يسامحكم", "دعيت عليكم", "مش راح اسامح", "حق الناس", "ظلم", "ظلمتوني", "بتظلموا الناس",
  "اسوأ", "أسوأ", "سيئين", "سيئين جدا", "تجربه سيئه", "تجربة سيئة", "خدمة سيئة", "خدمة زبالة",
  "زباله", "زبالة", "مهزله", "مهزلة", "مسخره", "مسخرة", "مقلب", "نصب واحتيال",

  // تأخير / مماطلة / عدم رد
  "تاخير", "تأخير", "تأخرتوا", "تاخرتوا", "طولتوا", "طولتو", "صارلي", "صار لي", "الي ايام",
  "إلي ايام", "إلي أيام", "بستنى", "مستني", "مستنية", "ما حدا رد", "ما بتردو", "ما بتردوا", "مش رادين",
  "طنشتوني", "بتطنشوا", "تطنيش", "مماطله", "مماطلة", "تسويف", "كل يوم بتحكوا", "كل شوي بتحكوا",
  "وعدتوني", "حكيتولي", "ليش التأخير", "وين الجهاز", "وين جهازي", "وين طلبي", "وين الطلب",
  "ما وصلني", "ما استلمت", "لحد الان", "لحد الآن", "ولا اشي صار", "ما صار اشي", "ما في تحديث",
  "ما في جواب", "بدون رد", "مش واضح", "لخبطة", "تخبيص", "تخبط",

  // تهديد بالشكوى / تصعيد رسمي
  "شكوى", "شكوي", "بشتكي", "رح اشتكي", "راح اشتكي", "هشتكي", "complaint", "report",
  "محامي", "محاميه", "lawyer", "قضيه", "قضية", "محكمه", "محكمة", "شرطة", "شرطه", "police",
  "جرائم", "جرائم الكترونية", "جرائم إلكترونية", "الجرائم الالكترونيه", "الجرائم الإلكترونية",
  "حمايه المستهلك", "حماية المستهلك", "وزارة الصناعة", "وزارة الصناعة والتجارة", "البنك المركزي",
  "المدعي العام", "النائب العام", "حق قانوني", "قانونيا", "قانونيًا", "رقم شكوى", "سجل تجاري",
  "ترخيص", "مرخصين", "مش مرخصين", "راح ارفع عليكم", "برفع عليكم", "بدي حقي قانونيا",

  // تصعيد علني / سوشال
  "بفضحكم", "افضحكم", "رح افضحكم", "راح افضحكم", "انشر عليكم", "بنشر عليكم", "سوشال ميديا",
  "فيسبوك", "facebook", "تيك توك", "tiktok", "انستغرام", "instagram", "جروبات", "قروبات",
  "الناس تعرف", "احذر الناس", "بحذر الناس", "بوست", "منشور", "تقييم سيء", "review",

  // فلوس / استرداد بصيغة غاضبة
  "بدي فلوسي", "رجعوا فلوسي", "رجعولي فلوسي", "مصاريي", "فلوسي راحت", "استرداد", "استرجاع",
  "refund", "رجعولي الرسوم", "استرجع الرسوم", "وين مصاري", "وين المصاري",

  // صيغ أردنية/عامية إضافية شائعة
  "نصبتو علي", "نصبتوا علي", "اكلتو حقي", "اكلتوا حقي", "وين حقي", "بدي حقي", "حقّي",
  "سرقتو فلوسي", "سرقتوا فلوسي", "بتضحكوا علينا", "ضحكتوا علينا", "انضحك علينا", "لعبتوا فينا",
  "كل يوم وعد", "كلو حكي", "كله حكي", "مماطلين", "طفح الكيل", "قرفنا", "زهقنا", "استغلال",
  "نصب رسمي", "بدي ارفع قضية", "ارفع قضية", "رح انزل بوست", "راح انزل بوست", "بنزل بوست",
  "بحط سكرينات", "سكرينات", "سكرين شوت", "فضيحة", "فضحتونا", "ضاعت فلوسي", "وين الرسوم",
  "ما في مصداقية", "مش مصداقين", "مش واضحين", "خليتوني اندم", "ندمت", "لعب اعصاب", "وجع راس",

  // أخطاء كتابة متوقعة
  "نصبب", "نصابيين", "نصابينن", "احتييال", "استردادد", "فلوسيي", "تاخيرر", "تأخيرر",
  "مماطله", "ممطالة", "ما بتردوو", "ما بتردووش", "حراميي", "حرمية", "سرقةة",

  // عبارات غضب/تهديد إضافية بصيغ واتساب واقعية
  "وينكم من الصبح", "ليش ما حدا برد", "ليش محد برد", "ليش بتطنشوني", "ليش مطنشين",
  "ما حد عبرني", "ما حدا عبرني", "بدي جواب", "اعطوني جواب", "جوابكم مش واضح",
  "كل شوي بتغيرو الحكي", "كل شوي حكي", "حكي فاضي", "كله وعود", "وعود كذابه", "وعد كاذب",
  "عيب عليكم", "قلة ذوق", "قلة مهنية", "شركة مش محترمة", "خدمة سيئة جدا", "خدمة زفت",
  "حرقتوا دمي", "رفعتولي ضغطي", "جننتوني", "تعبتوني", "ضيعتوا وقتي", "ضيعتو وقتي",
  "فلوسي عندكم", "رسومي عندكم", "وين رسوم فتح الملف", "رجعو الرسوم", "رجعوا الرسوم",
  "مش متنازل", "مش مسامح", "راح اوصلها", "بوصلها للقضاء", "برفع دعوى", "دعوى قضائية",
  "بروح عالشرطة", "بروح على حماية المستهلك", "بشتكي للوزارة", "بشتكي للبنك المركزي",
  "بدي رقم الشكوى", "اعطوني رقم شكوى", "وين رقم الشكوى", "وين الترخيص", "وين السجل",
  "راح اشهر فيكم", "بشهر فيكم", "بنزل سكرينات", "رح انزل سكرينات", "كل الناس رح تعرف",
  "نصب عيني عينك", "احتيال عيني عينك", "لعبة", "مسرحية", "فلم", "بتضحكو عالناس",
  "ضحك عالناس", "ما عندكم مصداقية", "فقدت الثقة", "مش واثق فيكم", "خربتوا ثقتي",
  "وين الجهاز تبعي", "وين تلفوني", "وين الموبايل", "ليش ما استلمت", "متى بستلم جد",
  "لا تماطلوني", "بلا مماطلة", "بلا لف ودوران", "بدون لف ودوران", "رد واضح",
];

function isAngryCustomerText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  if (hasAny(t, ANGRY_CUSTOMER_KEYWORDS)) return true;

  const hasDelayContext = hasAny(t, ["تاخير", "تأخير", "طولتوا", "مماطله", "مماطلة", "وين الطلب", "وين الجهاز", "ما بتردو", "ما حدا رد"]);
  const hasEscalationContext = hasAny(t, ["شكوى", "بشتكي", "محامي", "شرطة", "جرائم", "حماية المستهلك", "افضحكم", "انشر"]);
  const hasMoneyContext = hasAny(t, ["فلوسي", "مصاري", "رسوم", "دفعت", "حواله", "حوالة"]);

  return (hasDelayContext && hasEscalationContext) || (hasMoneyContext && hasEscalationContext);
}

function shouldFlagHumanReview(text: string, intent?: CustomerIntent) {
  const finalIntent = intent || classifyIntent(text);
  return ["abuse", "legal_threat", "social_media_threat", "scam_accusation", "payment_dispute", "device_delay_rage", "complaint", "refund", "human_agent"].includes(finalIntent) || isAngryCustomerText(text);
}

function complaintReasonLabel(text: string) {
  const t = normalizeArabicText(text);
  const reasons: string[] = [];

  if (hasAny(t, ["نصب", "نصاب", "احتيال", "محتال", "حرامي", "سرقه", "سرقة", "scam", "fraud"])) {
    reasons.push("اتهام نصب/احتيال");
  }

  if (hasAny(t, ["تاخير", "تأخير", "طولتوا", "مماطله", "مماطلة", "وين الجهاز", "وين طلبي", "ما بتردو", "ما حدا رد"])) {
    reasons.push("غضب بسبب تأخير/عدم رد");
  }

  if (hasAny(t, ["بدي فلوسي", "رجعوا فلوسي", "استرداد", "استرجاع", "refund", "مصاري"])) {
    reasons.push("طلب استرداد/اعتراض مالي");
  }

  if (hasAny(t, ["شكوى", "بشتكي", "محامي", "شرطة", "جرائم", "حماية المستهلك", "وزارة", "محكمة", "قضية"])) {
    reasons.push("تهديد بتصعيد رسمي");
  }

  if (hasAny(t, ["افضحكم", "بفضحكم", "انشر", "فيسبوك", "تيك توك", "سوشال", "بوست", "تقييم سيء"])) {
    reasons.push("تهديد بتصعيد علني");
  }

  return reasons.length ? reasons.join(" + ") : "رسالة غاضبة تحتاج جواب واضح";
}

function complaintApologyParagraph(seed: string) {
  const variants = [
    "حقك علينا، وبنعتذر منك بصدق عن أي تأخير أو لخبطة أو شعور بعدم وضوح. مش مقبول تظل بحيرة أو تحس إنك مضطر تلاحق جواب.",
    "أولًا بنعتذر منك بصدق. فاهمين تمامًا إن التأخير أو ضعف الرد بيوتر العميل، وحقك يكون عندك جواب واضح ومحترم.",
    "بعتذر منك جدًا على التجربة اللي وصلتك لهالشكل. إحنا ما بدنا أي عميل يحس إن حقه ضايع أو إن الموضوع غير واضح.",
    "حقك تزعل إذا حسّيت إن الرد تأخر أو إن الصورة مش واضحة. خليني أوضح لك حسب البيانات الظاهرة عندي بدون جدال.",
    "نعتذر منك بكل احترام عن أي إرباك صار. الأهم الآن نربط الكلام بالطلب الصحيح ونمشي خطوة خطوة.",
    "أفهم غضبك، وحقك علينا نهدّي الموضوع ونراجع الحالة بشكل واضح. بنعتذر عن أي تقصير أو تأخير وصلك من جهتنا.",
    "آسفين جدًا إن تجربتك وصلت لهالنقطة. خلينا نراجعها بهدوء وبشكل موثق حتى نعطيك جواب صحيح بدل أي كلام عام.",
    "بنعتذر منك بصدق، وحقك تطلب توضيح كامل. خليني أقرأ الحالة الظاهرة عندي وأجاوبك عليها مباشرة.",
    "معك حق تطلب جواب واضح، وبنعتذر إذا حسّيت إن المتابعة كانت بطيئة أو غير كافية.",
    "حقك علينا، ومش مطلوب منك تضل تلاحق المعلومة. خليني أرتب لك الوضع حسب رقم الطلب أو البيانات المتوفرة.",
    "فاهمين انزعاجك، خصوصًا لما يكون في دفع أو انتظار. بنعتذر عن أي ضغط صار عليك.",
    "بنعتذر عن أي سوء فهم أو تأخير. خلينا نركز الآن على حل الحالة حسب الموجود على الطلب.",
    "أقدّر غضبك، وأتفهم إن الانتظار بدون وضوح مزعج. رح أعطيك الكلام المؤكد حسب الحالة فقط.",
    "آسفين على أي تجربة مزعجة أو شعور بعدم الثقة. المهم الآن نعطيك جواب مرتب وواضح.",
    "حقك يكون عندك رد مفهوم من أول مرة. بنعتذر إذا صار أي تأخير أو تكرار بالكلام.",
    "أتفهم تمامًا إن الموضوع حساس بالنسبة إلك، وخلينا نرتبه بهدوء بدون لف ودوران.",
    "بنعتذر إذا وصلتك الصورة بشكل مربك. رح أوضح لك المطلوب أو حالة الطلب حسب البيانات الظاهرة.",
    "أكيد مش هدفنا نخليك قلقان أو محتار. بنعتذر عن أي تأخير، وخلينا نراجع الطلب من رقمه أو من رقم الهاتف.",
    "حقك تسأل وتزعل إذا ما وصلك جواب كافي. بنعتذر وبنحكي بالواضح حسب الحالة.",
    "بفهم شعورك، خصوصًا إذا صار انتظار أو دفع رسوم. خليني أجاوبك على النقطة نفسها بدون تهرّب.",
    "بنعتذر منكم بصدق عن أي تأخير أو نقص بالتوضيح. المطلوب الآن نحدد رقم الطلب ونقرأ حالته بدقة.",
    "أنت محق بطلب الوضوح. خلينا نطلع على الحالة ونحكي فقط بالمؤكد.",
    "آسفين إذا حسّيت إنك تدور على جواب. خليني أختصر عليك وأوضح الخطوة القادمة حسب الطلب.",
    "حقك علينا، وأتفهم تمامًا حساسية الموضوع. ابعث رقم التتبع أو الهاتف إذا ما ظهر الطلب عندي، وبعطيك الحالة مباشرة.",
    "بنعتذر عن أي إزعاج، وخلينا نحلها بهدوء: نحتاج نربط الرسالة بالطلب الصحيح ثم نوضح الحالة.",
  ];

  const digits = digitsOnly(seed);
  const index = Number(digits.slice(-2) || "0") % variants.length;

  return variants[index];
}
function isContinueDecisionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const positivePhrases = [
    "اود الاستمرار", "أود الاستمرار", "ارغب بالاستمرار", "أرغب بالاستمرار",
    "بدي استمر", "بدي اكمل", "بدي أكمل", "اكمل", "أكمل", "كمل", "كملي", "كملوا",
    "موافق", "موافقين", "موافقة", "تمام كمل", "تمام اكمل", "تمام", "اوكي", "ok", "okay",
    "افتح الملف", "افتحو الملف", "افتحولي الملف", "فتح الملف", "بدي افتح الملف",
    "بدي ادفع", "وين ادفع", "ابعث الدفع", "ابعت الدفع", "ارسل تعليمات الدفع",
    "جاهز ادفع", "خلينا نكمل", "نكمل", "استمر", "استمرار", "مستمر", "yes", "نعم",
  ];

  const hasPositive = hasAny(t, positivePhrases);
  const hasContext = hasAny(t, ["استمرار", "اكمل", "كمل", "ملف", "دفع", "موافق", "نعم", "تمام", "اوكي", "ok"]);

  return hasPositive && hasContext;
}

function isDeclineDecisionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const negativePhrases = [
    "لا ارغب", "لا أرغب", "لا اريد", "لا أريد", "ما بدي", "مش بدي", "ما بدي اكمل", "ما بدي أكمل",
    "مش حاب اكمل", "مش حاب أكمل", "مش حابه اكمل", "مش حابة أكمل",
    "بدي الغي", "بدي ألغي", "الغاء", "إلغاء", "الغي الطلب", "ألغي الطلب",
    "الغوا الطلب", "لغوا الطلب", "لغي الطلب", "كنسل", "cancel", "cancelled",
    "مش موافق", "غير موافق", "لا تكمل", "لا تكملوا", "وقف الطلب", "وقفو الطلب",
    "بطلت", "بطلت بدي", "صرف نظر", "ما رح اكمل", "ما راح اكمل", "لا شكرا", "لا شكرًا", "no",
  ];

  const hasNegative = hasAny(t, negativePhrases);
  const hasContext = hasAny(t, ["ارغب", "اكمل", "الغي", "الغاء", "لغي", "كنسل", "cancel", "موافق", "وقف", "بطلت", "لا"]);

  return hasNegative && hasContext;
}

function classifyIntent(text: string): CustomerIntent {
  const t = normalizeArabicText(text);

  if (!t) return "unknown";

  // حدود الاحترام والرسائل الحساسة يجب أن تُصنّف قبل التحيات أو الأسئلة العامة
  if (isAbuseText(t)) return "abuse";
  if (isScamAccusationText(t)) return "scam_accusation";
  if (isLegalThreatText(t)) return "legal_threat";
  if (isSocialMediaThreatText(t)) return "social_media_threat";
  if (isPaymentDisputeText(t)) return "payment_dispute";
  if (isDeviceDelayRageText(t)) return "device_delay_rage";

  if (isContinueDecisionText(t)) {
    return "continue_decision";
  }

  if (isDeclineDecisionText(t)) {
    return "decline_decision";
  }

  if (isAngryCustomerText(t)) {
    return "complaint";
  }

  if (hasAny(t, ["استرداد", "استرجاع", "رجعولي", "بدي فلوسي", "رجعوا فلوسي", "refund", "استرجع الرسوم"])) {
    return "refund";
  }

  if (hasAny(t, ["موظف", "حد يحكي معي", "اتصال", "رن علي", "رنه", "كلموني", "اداره", "إدارة", "مسؤول", "مندوب", "انسان", "بني ادم"])) {
    return "human_agent";
  }

  if (hasAny(t, ["قرض", "قروض", "كاش", "نقدي", "مصاري", "تمويل شخصي", "سلفه", "سلفة", "سلف", "دينار كاش"])) {
    return "loan";
  }

  if (isContactInfoText(t)) {
    return "contact_info";
  }

  if (hasAny(t, ["موقعكم", "موقع", "الرابط", "لينك", "ويب سايت", "website", "رابطكم", "لينككم", "ابلكيشن", "تطبيق", "السايت"])) {
    return "website";
  }

  if (hasAny(t, ["عنوان", "عنوانكم", "وين مكانكم", "مكانكم", "موقعكم وين", "لوكيشن", "location", "المحل", "فرع", "وينكم", "وين انتو"])) {
    return "location";
  }

  if (
    hasAny(t, [
      "كيف الاقساط", "كيف التقسيط", "كيف بدي اقسط", "بدي اقسط", "طريقه التقسيط", "طريقة التقسيط", "نظام التقسيط",
      "شو نظامكم", "كيف النظام", "تفاصيل التقسيط", "اقساط", "أقساط", "تقسيط", "كم القسط", "حاسبه", "حاسبة",
      "دفعه اولي", "دفعة اولى", "مده", "مدة", "اشهر", "24 شهر", "36 شهر",
    ])
  ) {
    return "installment_info";
  }

  if (
    hasAny(t, [
      "الشروط", "شروط", "المتطلبات", "شو المطلوب", "شو بدكم", "اوراق", "الاوراق", "الأوراق", "وثائق", "كفيل",
      "كشف راتب", "راتب", "ضمان", "ضمان اجتماعي", "هويه", "هوية", "هل بحتاج كفيل",
    ])
  ) {
    return "requirements";
  }

  if (hasAny(t, ["اقدم", "أقدم", "تقديم", "طلب جديد", "اعمل طلب", "أعمل طلب", "وين اقدم", "وين أقدم", "رابط التقديم", "قدم طلب", "بدي جهاز", "بدي تلفون", "بدي موبايل", "بدي ايفون", "بدي سامسونج", "اشتري"])) {
    return "apply";
  }

  if (hasAny(t, ["اجهزه", "أجهزة", "الاجهزه", "تلفونات", "موبايلات", "ايفون", "سامسونج", "هونر", "تكنو", "شاومي", "اسعار", "السعر", "متوفر", "ذاكره", "ذاكرة", "256", "512"])) {
    return "products";
  }

  if (hasAny(t, ["دفع", "ادفع", "دفعت", "رسوم", "خمسه", "خمسة", "5", "٥", "وصل", "ايصال", "إيصال", "كليك", "محفظه", "محفظة", "اورنج", "orange", "فتح ملف", "الدفعه", "حواله"])) {
    return "payment";
  }

  if (hasAny(t, ["موعد", "الاحد", "الأحد", "استلام", "تسليم", "متي", "متى", "بعد العيد", "31/05", "31-05", "وين وصل", "وصل الجهاز", "التسليم", "تاخر الجهاز", "تأخر الجهاز"])) {
    return "delivery";
  }

  if (hasAny(t, ["طلبي", "طلب", "حاله", "حالة", "شو صار", "وين الطلب", "رقم تتبع", "تتبع", "راجع الطلب", "افحص الطلب", "شيك", "check"])) {
    return "order_status";
  }

  if (isGreeting(t)) return "greeting";

  if (hasAny(t, ["شكرا", "يسلمو", "تمام", "يعطيك العافيه", "مشكور"])) {
    return "thanks";
  }

  return "unknown";
}

function looksSensitive(text: string) {
  const intent = classifyIntent(text);
  return ["abuse", "legal_threat", "social_media_threat", "scam_accusation", "payment_dispute", "device_delay_rage", "complaint", "refund"].includes(intent) || shouldFlagHumanReview(text, intent);
}

function trackUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/track?phone=${encodeURIComponent(phone)}&tracking=${encodeURIComponent(tracking)}`;
}

function receiptUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/receipt?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

function delayUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/delay-decision?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

function guarantorFormUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/guarantor?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

function salarySlipFormUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/salary-slip?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

function numericSalary(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function isWithinLastDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const maxAgeMs = days * 24 * 60 * 60 * 1000;
  return Date.now() - date.getTime() <= maxAgeMs;
}

function canSendPostPaymentRequirements(app: ApplicationRecord) {
  return (
    app.payment_status === "confirmed" &&
    app.status === "under_review" &&
    isWithinLastDays(app.created_at, 12)
  );
}

function postPaymentRequirementsReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const salary = numericSalary(app.salary);
  const guarantorUrl = guarantorFormUrl(baseUrl, app);
  const salarySlipUrl = salarySlipFormUrl(baseUrl, app);
  const track = trackUrl(baseUrl, app);

  if (!canSendPostPaymentRequirements(app)) {
    return "";
  }

  if (salary !== null && salary < 350) {
    return `أهلًا ${name} 🌿

تم فتح ملفكم وتحويله للدراسة النهائية.

لاستكمال إجراءات الملف حسب متطلبات الموافقة، نحتاج تزويدنا بالتالي:

1. تعبئة بيانات الكفيل من الرابط:
${guarantorUrl}

2. رفع كشف راتب رسمي حديث أو شهادة راتب من جهة العمل من الرابط:
${salarySlipUrl}

هذه الخطوة إجراء تنظيمي لاستكمال الدراسة، ولا تعني رفض الطلب.

رقم التتبع:
${tracking}

رابط المتابعة:
${track}

${BUSINESS_NAME}`;
  }

  return `أهلًا ${name} 🌿

تم فتح ملفكم وتحويله للدراسة النهائية.

لاستكمال إجراءات الملف حسب سياسة الموافقة، نحتاج تعبئة بيانات الكفيل من الرابط:
${guarantorUrl}

هذه الخطوة إجراء تنظيمي لاستكمال الدراسة، ولا تعني رفض الطلب.

رقم التتبع:
${tracking}

رابط المتابعة:
${track}

${BUSINESS_NAME}`;
}


function statusHumanLabel(status: string) {
  switch (status) {
    case "preliminary_qualified": return "مؤهل مبدئيًا";
    case "customer_confirmed_continue": return "تم تأكيد رغبتكم بالاستمرار";
    case "customer_declined_continue": return "العميل لا يرغب بالاستمرار";
    case "under_review": return "قيد الدراسة النهائية";
    case "approved": return "موافقة نهائية";
    case "rejected": return "غير موافق عليه حاليًا";
    case "needs_identity": return "بانتظار صورة الهوية";
    case "identity_requested": return "بانتظار صورة الهوية";
    case "needs_salary_slip": return "بانتظار كشف راتب / شهادة راتب";
    case "salary_slip_uploaded": return "تم استلام كشف الراتب";
    case "first_installment_requested": return "بانتظار دفع القسط الأول";
    case "needs_guarantor": return "بانتظار بيانات كفيل";
    case "guarantor_submitted": return "تم استلام بيانات الكفيل";
    case "customer_accepts_delivery_delay": return "تم اختيار الانتظار لحين وصول الأجهزة واعتماد جدول التوزيع";
    case "delivery_delay_notice_sent": return "بانتظار اختيار التمديد أو الاسترداد";
    case "refund_requested": return "طلب استرداد مسجل";
    case "refund_completed": return "تم تنفيذ الاسترداد";
    case "cancelled": return "طلب ملغي";
    default: return "قيد المتابعة";
  }
}

function apologyLine(seed = "0") {
  return complaintApologyParagraph(seed);
}


function abuseReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const tracking = app?.tracking_id || app?.id || "";
  const status = app?.status || "";

  if (app) {
    return `واضح إنك منزعج، وبنعتذر إذا صار معك أي تأخير أو إرباك.

بس خلينا نحافظ على الاحترام حتى أقدر أساعدك فعليًا.

طلبك ظاهر عندي الآن، وحالته:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

اكتبلي المشكلة نفسها بجملة واضحة، مثل: "تأخر التسليم" أو "بدي أعرف حالة الطلب"، وبجاوبك مباشرة حسب الحالة الموجودة عندي.

${BUSINESS_NAME}`;
  }

  return `واضح إنك منزعج، وبنعتذر إذا صار معك أي إزعاج.

بس حتى أقدر أساعدك، خلينا نحافظ على الاحترام ونحكي بالمشكلة نفسها.

اكتبلي رقم التتبع أو رقم الهاتف المستخدم بالطلب، أو احكيلي شو صار بجملة واضحة، وبراجعها لك مباشرة.

${BUSINESS_NAME}`;
}

function legalThreatReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const tracking = app?.tracking_id || app?.id || "";
  const status = app?.status || "";

  if (app) {
    return `حقك تطلب توضيح واضح، وبنعتذر إذا حسّيت إن المتابعة ما كانت كافية.

حسب البيانات الظاهرة عندي، حالة طلبك الحالية:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

خلينا نمشي على الموجود رسميًا: إذا عندك وصل دفع أو صورة من الطلب أو أي ملاحظة محددة، ابعثها هون وبوضح لك الخطوة المناسبة حسب حالة الطلب.

${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `حقك تطلب توضيح، وبنعتذر إذا صار أي تأخير أو عدم وضوح.

حتى أقدر أراجع الموضوع بدقة، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب، وإذا عندك وصل دفع أو صورة طلب ابعثها هون.

بعدها بعطيك الحالة والخطوة القادمة بدون كلام عام.

${BUSINESS_NAME}`;
}

function socialMediaThreatReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  if (app) {
    return `فاهمين إنك منزعج، وحقك يكون عندك تحديث واضح قبل ما تضطر تصعّد الموضوع بأي مكان.

حالة طلبك الحالية:
${statusHumanLabel(app.status || "")}

رقم التتبع:
${app.tracking_id || app.id}

خلينا نحلها بهدوء: احكيلي النقطة المحددة اللي مضايقتك — تأخير، دفع، تسليم، أو مستند ناقص — وبوضحها لك حسب البيانات الظاهرة.

رابط المتابعة:
${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `فاهمين انزعاجك، وحقك يكون عندك جواب واضح.

قبل أي تصعيد، ابعثلي رقم التتبع أو رقم الهاتف المستخدم بالطلب، وبراجعها لك مباشرة وأعطيك الحالة الحالية والخطوة المطلوبة.

${BUSINESS_NAME}`;
}

function scamAccusationReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  if (app) {
    return `${complaintApologyParagraph(`${from}:scam:${customerText}`)}

ما رح أجادلك باتهامك، الأهم نعطيك وضع الطلب حسب البيانات الظاهرة.

حالة الطلب الحالية:
${statusHumanLabel(app.status || "")}

رقم التتبع:
${app.tracking_id || app.id}

إذا عندك اعتراض على دفع أو تأخير أو تسليم، اكتبلي النقطة نفسها وبوضحها لك حسب الحالة بدون تهرب.

رابط المتابعة:
${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `${complaintApologyParagraph(`${from}:scam:${customerText}`)}

حتى ما نعطيك كلام عام، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب، وبراجع الحالة مباشرة.

إذا في وصل دفع أو صورة من الطلب، ابعثها هون كمان.

${BUSINESS_NAME}`;
}

function paymentDisputeReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  if (app) {
    return `وصلني اعتراضك بخصوص الدفع أو الرسوم، وحقك يكون الموضوع واضح.

حالة الطلب:
${statusHumanLabel(app.status || "")}

حالة الدفع:
${app.payment_status || "قيد المتابعة"}

رقم التتبع:
${app.tracking_id || app.id}

مهم: رسوم فتح الملف 5 دنانير فقط، وتكون مستردة في حال عدم الموافقة النهائية. وإذا كان عندك وصل أو إثبات دفع، ابعثه هون حتى نربطه بالحالة الصحيحة.

رابط المتابعة:
${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `أكيد، خلينا نراجع موضوع الدفع بدون لخبطة.

ابعثلي رقم التتبع أو رقم الهاتف المستخدم بالطلب، ومعه صورة الوصل إن وجدت، وبوضح لك هل الدفع مسجل وما هي الحالة الحالية.

${BUSINESS_NAME}`;
}

function deviceDelayRageReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  if (app) {
    return deliveryDateReply(app, baseUrl);
  }

  return `حقك علينا، التأخير بدون تحديث واضح مزعج وبنقدّر قلقك.

حتى أفحص لك وضع الجهاز تحديدًا، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب.

إذا كان الطلب عليه موافقة نهائية، فالتحديث المعتمد حاليًا أن الطلبات المؤكدة بانتظار وصول الأجهزة من الوكلاء والموردين المعتمدين، وسيتم التواصل فور اعتماد جدول التوزيع من الإدارة.

${BUSINESS_NAME}`;
}

function complaintReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const opening = humanOpening(`${from}:complaint`);
  const apology = complaintApologyParagraph(`${from}:${customerText}`);
  const tracking = app?.tracking_id || app?.id || "";
  const status = app?.status || "";
  const reason = complaintReasonLabel(customerText);

  if (app) {
    return `${opening}

${apology}

فهمت من رسالتك أن الموضوع مرتبط بـ:
${reason}

طلبك ظاهر عندي الآن وحالته:
${statusHumanLabel(status)}

${status === "approved" ? `طلبك عليه موافقة نهائية، لكن لا يوجد موعد تسليم نهائي محدد حاليًا لأننا بانتظار وصول الأجهزة من الوكلاء والموردين المعتمدين. سيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة واعتماد جدول التوزيع من الإدارة.` : `المتابعة المعتمدة حاليًا تكون حسب حالة الطلب فقط، ولا يوجد موعد تسليم نهائي محدد لأي طلب غير مؤكد أو غير جاهز للتوزيع.`}

رقم التتبع:
${tracking}

خلينا نمشي على المؤكد: إذا عندك وصل دفع، صورة هوية، أو أي لقطة شاشة تخص الطلب ابعثها هون، وبوضح لك الخطوة المناسبة حسب الحالة الظاهرة عندي.

رابط المتابعة:
${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `${opening}

${apology}

فهمت من رسالتك أن الموضوع مرتبط بـ:
${reason}

حتى أقدر أجاوبك بدقة وما أعطيك كلام عام، ابعثلي أي واحد من هذول:
- رقم التتبع إذا موجود
- رقم الهاتف المستخدم بالطلب
- صورة الطلب أو صورة الوصل

أول ما توصلني البيانات بربطها بالطلب وبعطيك الحالة والخطوة القادمة بشكل واضح.

${BUSINESS_NAME}`;
}
function refundReply(baseUrl: string, from: string, app?: ApplicationRecord | null) {
  const opening = humanOpening(`${from}:refund`);

  if (app) {
    return `${opening}

وصلني طلبك بخصوص الاسترداد، وحقك يكون الموضوع واضح.

حالة الطلب الحالية:
${statusHumanLabel(app.status || "")}

إذا كان طلب الاسترداد مسجل من صفحة القرار، يتم مراجعته حسب ترتيب الطلبات وبيانات التحويل المدخلة. وإذا لم يتم تسجيله بعد، ابعثلي تأكيد رغبتك بالاسترداد أو استخدم الرابط المخصص إذا وصلك.

رقم التتبع:
${app.tracking_id || app.id}

${BUSINESS_NAME}`;
  }

  return `${opening}

أكيد، بقدر أساعدك بموضوع الاسترداد.

حتى أقدر أربطه بالطلب وما نعطيك جواب عام، ابعثلي رقم التتبع أو رقم الهاتف المستخدم بالطلب. وإذا عندك صورة الطلب أو وصل الدفع ابعثها هون، وبفحصها لك.

${BUSINESS_NAME}`;
}

function contactInfoReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:contact_info`);
  return `${opening}

معلومات التواصل الرسمية لدى ${BUSINESS_NAME}:

واتساب الشركة:
${BUSINESS_PHONE_E164}

الرقم المحلي:
${BUSINESS_PHONE_DISPLAY}

الموقع الرسمي:
${BUSINESS_WEBSITE}

العنوان:
${BUSINESS_ADDRESS}

ملاحظة مهمة: زيارة المكتب لا تتم إلا إذا وصلتك رسالة واضحة من الإدارة تطلب الحضور أو تحدد موعدًا لذلك.

تنبيه بسيط: أي رقم آخر غير هذه البيانات لا يُعتبر رقمًا رسميًا من طرفنا.

إذا عندك طلب قائم، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب وبراجع الحالة مباشرة.`;
}

function websiteReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:website`);
  return `${opening}

رابط موقعنا للتقديم والمتابعة:
${baseUrl}

من خلال الموقع بتقدر:
- تشوف الأجهزة المتاحة.
- تقدم طلب تقسيط.
- تتابع حالة طلبك برقم الهاتف ورقم التتبع.
- ترفع وصل رسوم فتح الملف إذا تم تأهيل طلبك مبدئيًا.

تنويه سريع: ${BUSINESS_NAME} مختص بتقسيط الأجهزة الإلكترونية والهواتف فقط، وما بنقدم قروض نقدية أو تمويل شخصي.`;
}

function locationReply(from: string) {
  const opening = humanOpening(`${from}:location`);
  return `${opening}

عنواننا الرسمي:
${BUSINESS_ADDRESS}

للتواصل عبر واتساب:
${BUSINESS_PHONE_DISPLAY}

ملاحظة مهمة: زيارة المكتب لا تتم إلا إذا وصلتك رسالة واضحة من الإدارة تطلب الحضور أو تحدد موعدًا لذلك.

إذا عندك طلب قائم، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب وبراجع الحالة مباشرة.`;
}

function loanReply(from: string) {
  const opening = humanOpening(`${from}:loan`);
  return `${opening}

للتوضيح بكل احترام: إحنا في ${BUSINESS_NAME} ما بنقدم قروض نقدية، ولا سلف، ولا تمويل شخصي.

خدمتنا فقط تقسيط أجهزة إلكترونية وهواتف.

إذا بدك تقسط جهاز، ابعثلي نوع الجهاز اللي بدك إياه أو ادخل على الموقع وقدّم الطلب، وبعدها الإدارة بتراجع البيانات.`;
}

function installmentInfoReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:installment`);
  return `${opening}

أكيد، نظام التقسيط عندنا باختصار:

1. بتختار الجهاز المناسب.
2. بتقدم الطلب من الموقع.
3. الإدارة بتراجع البيانات.
4. إذا ظهر من صفحة الإدارة أن الطلب مؤهل مبدئيًا / عليه موافقة مبدئية فقط، بنرسل لك تعليمات فتح الملف.
5. إذا تأهل الطلب مبدئيًا وقرر العميل الاستمرار، يتم توضيح رسوم فتح الملف رسميًا.
6. رسوم فتح الملف 5 دنانير فقط ومستردة بالكامل في حال عدم الموافقة النهائية.
7. القسط الأول لا يُدفع الآن، ويكون بعد الاستلام حسب الاتفاق.

مهم: التقديم أو دفع رسوم فتح الملف لا يعني موافقة نهائية، الموافقة بتطلع بعد الدراسة.

رابط التقديم والمتابعة:
${baseUrl}`;
}

function requirementsReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:requirements`);
  return `${opening}

الشروط والمتطلبات بشكل عام بتعتمد على دراسة الطلب، لكن عادةً بنحتاج:

- بيانات شخصية صحيحة.
- رقم هاتف شغال.
- صور الهوية حسب نموذج الطلب.
- معلومات العمل/الدخل.
- كفيل فقط إذا طلبته الإدارة من صفحة الطلب.
- كشف راتب أو شهادة راتب إذا تم طلبها لاحقًا.

وإذا تأهل الطلب مبدئيًا وقررتم الاستمرار، يتم توضيح رسوم فتح الملف رسميًا، وهي 5 دنانير فقط ومستردة إذا لم تتم الموافقة النهائية.

للتقديم:
${baseUrl}`;
}

function applyReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:apply`);
  return `${opening}

للتقديم على طلب جديد، ادخل من الرابط:
${baseUrl}

اختار الجهاز، عبّي البيانات بدقة، وبعدها الإدارة بتراجع الطلب.

إذا صار الطلب مؤهلًا مبدئيًا وقررت تكمل، بنرسل لك تعليمات فتح الملف رسميًا. رسوم فتح الملف 5 دنانير فقط ومستردة بالكامل إذا لم تتم الموافقة النهائية.

والقسط الأول لا يُدفع الآن، يكون بعد الاستلام حسب الاتفاق.`;
}

function productsReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:products`);
  return `${opening}

الأجهزة والأسعار بتتحدث من خلال الموقع حسب المتوفر.

رابط الموقع:
${baseUrl}

ادخل على قسم الأجهزة، اختار الجهاز المناسب، وشوف تفاصيله، وبعدها بتقدر تقدم طلب التقسيط مباشرة.

إذا بدك جهاز محدد، اكتبلي اسمه أو صورته وبحاول أوجهك للطريقة الأنسب.`;
}

function paymentGeneralReply(from: string) {
  const opening = humanOpening(`${from}:payment`);
  return `${opening}

أكيد، خليني أوضحها بهدوء حتى ما يصير أي ضغط أو لخبطة 🌿

${fileOpeningFeeExplanation()}

مهم جدًا:
- لا يوجد أي دفع عند السؤال العام أو قبل مراجعة الطلب.
- لا نطلب رسوم فتح الملف إلا إذا ظهر من صفحة الإدارة أن الطلب مؤهل مبدئيًا / عليه موافقة مبدئية.
- دفع الرسوم لا يعني موافقة نهائية، لكنه فقط إجراء لاستكمال الدراسة.

إذا عندك طلب موجود، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب، وبفحصلك هل مطلوب منك أي إجراء فعلًا أو لا.

${BUSINESS_NAME}`;
}

function paymentMessage(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const device = app.device_name || "الجهاز المطلوب";

  return `أهلًا ${name} 🌿

طلبكم ظاهر لدينا كمؤهل مبدئيًا للانتقال لمرحلة الدراسة النهائية.

الجهاز:
${device}

رقم التتبع:
${tracking}

إذا حابّين نكمل دراسة الملف، يتم دفع رسوم فتح الملف:
5 دنانير فقط

${fileOpeningFeeExplanation()}

معلومات الدفع الرسمية عبر Orange Money:

الخيار الأول:
اسم المحفظة / الاسم التجاري: AMENPAY
اسم المستفيد الظاهر: ABDUL RAHMAN ALHARAHSHEH

الخيار الثاني:
اسم المحفظة / الاسم التجاري: PAYAMEEN
اسم المستفيد الظاهر: ABDUL RAHMAN ALHARAHSHEH

ملاحظة مهمة: الاثنين أورنج موني، وإذا ظهر اسم المستفيد ABDUL RAHMAN ALHARAHSHEH فهذا صحيح.

بعد الدفع، ارفعوا وصل الدفع من هذا الرابط:
${receiptUrl(baseUrl, app)}

إذا ما حبيتوا تكملوا حاليًا، لا يوجد أي التزام عليكم.

${BUSINESS_NAME}`;
}

function deliveryDateReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const status = app.status || "";
  const url = trackUrl(baseUrl, app);

  if (status === "approved") {
    return `أهلًا ${name} 🌿

نعتذر منكم بصدق عن التأخير ونقدّر صبركم وثقتكم بنا.

طلبكم عليه موافقة نهائية ✅

حتى هذه اللحظة ما زلنا بانتظار تزويدنا بالأجهزة من الوكلاء والموردين المعتمدين.

لذلك لا يوجد حاليًا موعد تسليم محدد أو نهائي للطلب.

سيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة واعتماد جدول التوزيع من الإدارة.

لا يوجد أي إجراء مطلوب منكم حاليًا، ولا يوجد أي دفعات مطلوبة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

نشكر لكم تفهمكم وصبركم 🌿

${BUSINESS_NAME}`;
  }

  if (status === "customer_accepts_delivery_delay") {
    return `أهلًا ${name} 🌿

اختياركم بالانتظار مسجل لدينا.

حتى هذه اللحظة ما زلنا بانتظار وصول الأجهزة من الوكلاء والموردين المعتمدين.

لا يوجد موعد تسليم نهائي محدد حاليًا.

سيتم التواصل معكم فور وصول الأجهزة واعتماد جدول التوزيع من الإدارة.

لا يوجد أي إجراء أو دفع مطلوب منكم حاليًا.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "needs_guarantor") {
    return `أهلًا ${name} 🌿

الحالة الحالية للطلب تشير إلى أن الملف بحاجة استكمال متطلبات الكفيل.

نعتذر منكم عن التأخير ونقدّر صبركم، خصوصًا مع فترة العطلة الطويلة وضغط المراجعات.

فور استكمال المتطلبات ومراجعتها من الإدارة سيتم تحديث الحالة وإبلاغكم بالمستجدات.

لا يوجد موعد تسليم محدد حاليًا قبل اكتمال الدراسة والموافقة النهائية.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "under_review" || status === "needs_salary_slip" || status === "guarantor_submitted") {
    return `أهلًا ${name} 🌿

طلبكم ما زال قيد الدراسة والمتابعة من الإدارة.

نعتذر منكم عن التأخير ونقدّر صبركم، خصوصًا مع فترة العطلة الطويلة وضغط المراجعات.

لا يوجد قرار نهائي ظاهر على الطلب حتى الآن، ولا يوجد موعد تسليم محدد حاليًا.

حالة الطلب الحالية:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  return `أهلًا ${name} 🌿

${apologyLine()}

بالنسبة للتسليم، لا يوجد موعد نهائي محدد حاليًا.

التحديث المعتمد الآن:
${POST_EID_DELIVERY_STRICT_TEXT}.

تحديد التسليم يكون فقط بعد وصول الأجهزة واعتماد جدول التوزيع من الإدارة.

حالة طلبكم الحالية:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
}

function safeReply(app: ApplicationRecord, baseUrl: string, customerText = "", intent: CustomerIntent = "order_status") {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const url = trackUrl(baseUrl, app);

  if (intent === "abuse") return abuseReply(baseUrl, app.phone || tracking, app, customerText);
  if (intent === "legal_threat") return legalThreatReply(baseUrl, app.phone || tracking, app, customerText);
  if (intent === "social_media_threat") return socialMediaThreatReply(baseUrl, app.phone || tracking, app, customerText);
  if (intent === "scam_accusation") return scamAccusationReply(baseUrl, app.phone || tracking, app, customerText);
  if (intent === "payment_dispute") return paymentDisputeReply(baseUrl, app.phone || tracking, app, customerText);
  if (intent === "device_delay_rage") return deviceDelayRageReply(baseUrl, app.phone || tracking, app, customerText);
  if (intent === "complaint") return complaintReply(baseUrl, app.phone || tracking, app, customerText);
  if (intent === "refund") return refundReply(baseUrl, app.phone || tracking, app);
  if (intent === "delivery") return deliveryDateReply(app, baseUrl);

  if (intent === "payment") {
    if (
      status === "preliminary_qualified" ||
      paymentStatus === "pending" ||
      paymentStatus === "pending_payment" ||
      paymentStatus === "payment_info_sent"
    ) {
      return paymentMessage(app, baseUrl);
    }

    if (paymentStatus === "confirmed") {
      return `أهلًا ${name} 🌿

رسوم فتح الملف مؤكدة لدينا ✅

لا يوجد أي دفع مطلوب حاليًا، والقسط الأول لا يُدفع الآن، ويكون بعد الاستلام حسب الاتفاق.

حالة الطلب:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
    }

    if (paymentStatus === "customer_claimed_paid") {
      return `أهلًا ${name} 🌿

وصل الدفع أو إشعار الدفع مسجل لدينا، والطلب بانتظار تأكيد الإدارة.

يرجى عدم إعادة الدفع مرة ثانية حتى لا يصير تكرار بالدفع.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
    }
  }

  if (paymentStatus === "customer_claimed_paid") {
    return `أهلًا ${name} 🌿

وصل الدفع مسجل لدينا، والطلب الآن بانتظار تأكيد الإدارة.

لا تعيد الدفع مرة ثانية، وبمجرد التأكيد ستظهر الحالة على رابط المتابعة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (paymentStatus === "confirmed" && status === "under_review") {
    const requirementsMessage = postPaymentRequirementsReply(app, baseUrl);

    if (requirementsMessage) {
      return requirementsMessage;
    }

    return `تمام ${name} 🌿

رسوم فتح الملف مؤكدة، وطلبكم الآن قيد الدراسة النهائية.

نعتذر منكم بصدق عن أي تأخير بالمتابعة، ونقدّر صبركم خصوصًا مع فترة العطلة الطويلة خلال الموسم.

لا يوجد قرار نهائي ظاهر على الطلب حتى الآن. سيتم التواصل معكم فور ظهور أي تحديث جديد على الملف.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

كل عام وأنتم بخير 🌿

${BUSINESS_NAME}`;
  }

  if (
    status === "preliminary_qualified" ||
    paymentStatus === "pending" ||
    paymentStatus === "pending_payment" ||
    paymentStatus === "payment_info_sent"
  ) {
    return paymentMessage(app, baseUrl);
  }

  if (status === "customer_confirmed_continue") {
    return `أهلًا ${name} 🌿

رغبتكم بالاستمرار مسجلة لدينا.

لا يوجد أي دفع مطلوب حاليًا من خلال هذه الرسالة. إذا ظهرت أي خطوة إضافية سيتم توضيحها حسب حالة الطلب.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "delivery_delay_notice_sent") {
    return `أهلًا ${name} 🌿

تم إرسال خيار التمديد أو الاسترداد على طلبكم.

تقدروا تختاروا الانتظار لحين وصول الأجهزة واعتماد جدول التوزيع أو طلب استرداد رسوم فتح الملف من الرابط التالي:
${delayUrl(baseUrl, app)}

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "customer_accepts_delivery_delay") {
    return `أهلًا ${name} 🌿

اختياركم بالانتظار مسجل لدينا.

حتى هذه اللحظة ما زلنا بانتظار وصول الأجهزة من الوكلاء والموردين المعتمدين.

لا يوجد موعد تسليم نهائي محدد حاليًا.

سيتم التواصل معكم فور وصول الأجهزة واعتماد جدول التوزيع من الإدارة.

لا يوجد أي إجراء أو دفع مطلوب منكم حاليًا.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "refund_requested" || paymentStatus === "refund_requested") {
    return `أهلًا ${name} 🌿

طلب استرداد رسوم فتح الملف مسجل لدينا.

سيتم مراجعة بيانات التحويل وتنفيذ الاسترداد حسب ترتيب الطلبات.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "refund_completed") {
    return `أهلًا ${name} 🌿

تم تنفيذ استرداد رسوم فتح الملف حسب البيانات المسجلة لدينا.

إذا عندك أي ملاحظة، ابعث رقم التتبع ورقم الهاتف المستخدم بالطلب.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "customer_declined_continue") {
    return `أهلًا ${name} 🌿

تم تسجيل عدم رغبتكم بالاستمرار حاليًا.

الطلب ظاهر لدينا كغير مستمر، ولا يوجد أي دفع مطلوب.

إذا كان هذا القرار بالخطأ أو رغبتكم بإعادة المتابعة لاحقًا، ابعثوا رقم التتبع وبوضح لكم الخيارات المتاحة حسب الحالة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "salary_slip_uploaded") {
    return `أهلًا ${name} 🌿

تم استلام كشف الراتب / شهادة الراتب وربطها بطلبكم.

الطلب الآن بانتظار الخطوة التالية حسب الحالة الظاهرة على الطلب. لا يوجد أي دفع مطلوب حاليًا إلا إذا ظهرت تعليمات جديدة من الإدارة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "first_installment_requested" || paymentStatus === "first_installment_whatsapp") {
    return `أهلًا ${name} 🌿

حسب تحديث الإدارة، مطلوب اختيار/استكمال إجراء القسط الأول قبل المتابعة النهائية.

يرجى متابعة التعليمات التي وصلتكم من الإدارة أو إرسال رقم التتبع حتى أوضح لكم الخطوة المطلوبة حسب الحالة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "needs_identity" || status === "identity_requested") {
    return `أهلًا ${name} 🌿

طلبكم بحاجة صورة هوية واضحة لاستكمال المراجعة.

يرجى إرسال صورة هوية مقدم الطلب:
- الوجه الأمامي
- الوجه الخلفي

ملاحظة مهمة: لا يمكن استكمال دراسة الطلب قبل وصول صور الهوية بشكل واضح.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "needs_salary_slip") {
    const salarySlipLink =
      paymentStatus === "confirmed"
        ? `\nرابط رفع كشف الراتب الرسمي:\n${salarySlipFormUrl(baseUrl, app)}\n`
        : "";

    return `أهلًا ${name} 🌿

لاستكمال إجراءات الملف حسب متطلبات الدراسة النهائية، نحتاج كشف راتب رسمي حديث أو شهادة راتب من جهة العمل.
${salarySlipLink}
إرسال المستند لا يعني الموافقة النهائية، لكنه إجراء تنظيمي لاستكمال مراجعة الملف.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "needs_guarantor") {
    const guarantorLink =
      paymentStatus === "confirmed"
        ? `\nرابط تعبئة بيانات الكفيل:\n${guarantorFormUrl(baseUrl, app)}\n`
        : "";

    return `أهلًا ${name} 🌿

لاستكمال إجراءات الملف حسب سياسة الدراسة النهائية، نحتاج تعبئة بيانات الكفيل.
${guarantorLink}
هذه الخطوة إجراء تنظيمي لاستكمال الملف، ولا تعني رفض الطلب.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "guarantor_submitted") {
    return `تمام ${name} 🌿

بيانات الكفيل وصلت وتم ربطها بطلبكم.

نعتذر منكم عن أي تأخير بالمتابعة. الطلب الآن بانتظار الخطوة التالية حسب الحالة الظاهرة، ولا يوجد موعد تسليم محدد حاليًا قبل اكتمال الدراسة واعتماد جدول التوزيع.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "under_review") {
    return `أهلًا ${name} 🌿

طلبكم ما زال قيد الدراسة والمتابعة من الإدارة.

نعتذر منكم عن التأخير ونقدّر صبركم، خصوصًا مع فترة العطلة الطويلة خلال الموسم.

لا يوجد قرار نهائي ظاهر على الطلب حتى الآن، وسيتم التواصل معكم فور ظهور أي تحديث جديد على الملف.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

كل عام وأنتم بخير 🌿

${BUSINESS_NAME}`;
  }

  if (status === "approved") {
    return `أهلًا ${name} 🌿

نعتذر منكم بصدق عن التأخير ونقدّر صبركم وثقتكم بنا.

طلبكم عليه موافقة نهائية ✅

حتى هذه اللحظة ما زلنا بانتظار تزويدنا بالأجهزة من الوكلاء والموردين المعتمدين.

لذلك لا يوجد حاليًا موعد تسليم محدد أو نهائي للطلب.

سيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة واعتماد جدول التوزيع من الإدارة.

لا يوجد أي إجراء مطلوب منكم حاليًا، ولا يوجد أي دفعات مطلوبة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

نشكر لكم تفهمكم وصبركم 🌿

${BUSINESS_NAME}`;
  }

  if (status === "rejected") {
    return `أهلًا ${name} 🌿

نعتذر، لم تتم الموافقة على الطلب حاليًا.

إذا حاب تعرف التفاصيل العامة أو إمكانية إعادة التقديم لاحقًا، ابعث سؤالك بشكل واضح وبوضح لك المتاح حسب الحالة بدون وعود غير مؤكدة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "cancelled") {
    return `أهلًا ${name} 🌿

الطلب ظاهر لدينا كطلب ملغي.

إذا كان الإلغاء بالخطأ، ابعث رقم التتبع ورقم الهاتف وبوضح لك الخطوة المتاحة حسب الحالة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  return `أهلًا ${name} 🌿

طلبكم ظاهر لدينا وقيد المتابعة.

حالة الطلب:
${statusHumanLabel(status)}

لا يوجد أي دفع مطلوب حاليًا إلا إذا تم تأهيل الطلب مبدئيًا وإرسال تعليمات رسوم فتح الملف لكم.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
}

function unknownReply(from: string) {
  const opening = humanOpening(`${from}:unknown`);
  return `${opening}

وصلتني رسالتك، بس حتى أجاوبك بدقة أكثر احكيلي شو المطلوب بالضبط:

- بدك تعرف طريقة التقسيط؟
- بدك رابط الموقع؟
- بدك العنوان؟
- بدك تتابع طلب؟
- بدك تستفسر عن الدفع أو رسوم فتح الملف؟
- عندك شكوى أو تأخير؟

اكتبلي طلبك بجملة بسيطة وبرد عليك مباشرة.

${BUSINESS_NAME}`;
}

async function findApplicationByPhone(phone: string) {
  const localPhone = normalizeJordanPhone(phone);
  if (!localPhone) return null;

  const phoneVariants = Array.from(
    new Set([
      localPhone,
      normalizeWhatsAppToSend(localPhone),
      `+${normalizeWhatsAppToSend(localPhone)}`,
      localPhone.startsWith("0") ? localPhone.slice(1) : localPhone,
    ].filter(Boolean))
  );

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id, created_at, tracking_id, full_name, phone, status, payment_status, device_name, salary, delivery_delay_until")
    .in("phone", phoneVariants)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("findApplicationByPhone error:", error.message);
    return null;
  }

  return (data || null) as ApplicationRecord | null;
}

async function findApplicationByTracking(tracking: string) {
  const cleanTracking = String(tracking || "").trim().toUpperCase();
  if (!cleanTracking) return null;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id, created_at, tracking_id, full_name, phone, status, payment_status, device_name, salary, delivery_delay_until")
    .eq("tracking_id", cleanTracking)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("findApplicationByTracking error:", error.message);
    return null;
  }

  return (data || null) as ApplicationRecord | null;
}

async function findApplicationByTrackingAndPhone(tracking: string, phone: string) {
  const cleanTracking = String(tracking || "").trim().toUpperCase();
  const localPhone = normalizeJordanPhone(phone);
  if (!cleanTracking || !localPhone) return null;

  const phoneVariants = Array.from(
    new Set([
      localPhone,
      normalizeWhatsAppToSend(localPhone),
      `+${normalizeWhatsAppToSend(localPhone)}`,
      localPhone.startsWith("0") ? localPhone.slice(1) : localPhone,
    ].filter(Boolean))
  );

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id, created_at, tracking_id, full_name, phone, status, payment_status, device_name, salary, delivery_delay_until")
    .eq("tracking_id", cleanTracking)
    .in("phone", phoneVariants)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("findApplicationByTrackingAndPhone error:", error.message);
    return null;
  }

  return (data || null) as ApplicationRecord | null;
}

async function sendWhatsAppText(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.GRAPH_API_VERSION || "v20.0";

  if (!token || !phoneNumberId) {
    console.error("Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
    return null;
  }

  const cleanTo = normalizeWhatsAppToSend(to);
  if (!cleanTo) return null;

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: cleanTo,
      type: "text",
      text: { preview_url: true, body },
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error("WhatsApp send failed:", responseText);
    return null;
  }

  try {
    const data = JSON.parse(responseText);
    return data?.messages?.[0]?.id || null;
  } catch {
    return null;
  }
}

function adminApplicationUrl(baseUrl: string, app: ApplicationRecord) {
  return `${baseUrl}/admin/applications/${app.id}`;
}

async function sendDiscordNotification(input: {
  title: string;
  description: string;
  color?: number;
  app?: ApplicationRecord | null;
  customerPhone?: string;
  customerMessage?: string;
  systemReply?: string;
  baseUrl?: string;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const mention = process.env.DISCORD_ADMIN_MENTION || "";
  const app = input.app || null;
  const baseUrl = input.baseUrl || "";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (app) {
    fields.push(
      { name: "رقم التتبع", value: app.tracking_id || app.id || "—", inline: true },
      { name: "العميل", value: app.full_name || "—", inline: true },
      { name: "رقم واتساب", value: input.customerPhone || app.phone || "—", inline: true },
      { name: "الجهاز", value: app.device_name || "—", inline: true },
      { name: "الحالة الحالية", value: app.status || "—", inline: true },
      { name: "حالة الدفع", value: app.payment_status || "—", inline: true },
    );

    if (baseUrl) {
      fields.push({
        name: "رابط الطلب في الأدمن",
        value: adminApplicationUrl(baseUrl, app),
        inline: false,
      });
    }
  } else if (input.customerPhone) {
    fields.push({ name: "رقم واتساب", value: input.customerPhone, inline: true });
  }

  if (input.customerMessage) {
    fields.push({
      name: "رسالة العميل",
      value: input.customerMessage.slice(0, 900) || "—",
      inline: false,
    });
  }

  if (input.systemReply) {
    fields.push({
      name: "رد النظام",
      value: input.systemReply.slice(0, 900) || "—",
      inline: false,
    });
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: mention || undefined,
        embeds: [
          {
            title: input.title,
            description: input.description,
            color: input.color ?? 0xd6b56b,
            fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (error) {
    console.error("Discord notification failed:", error);
  }
}

async function updateCustomerDecision(input: {
  app: ApplicationRecord;
  decision: "continue" | "decline";
}) {
  const now = new Date().toISOString();

  if (input.decision === "continue") {
    await supabaseAdmin
      .from("applications")
      .update({
        status: "customer_confirmed_continue",
        payment_status: "payment_info_sent",
      })
      .eq("id", input.app.id);

    return {
      ...input.app,
      status: "customer_confirmed_continue",
      payment_status: "payment_info_sent",
    } as ApplicationRecord;
  }

  await supabaseAdmin
    .from("applications")
    .update({
      status: "cancelled",
      payment_status: "not_requested_yet",
      payment_reference: "customer_declined_continue",
    })
    .eq("id", input.app.id);

  return {
    ...input.app,
    status: "cancelled",
    payment_status: "not_requested_yet",
  } as ApplicationRecord;
}

function continueConfirmationMessage(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `أهلًا ${name} 🌿

تم تسجيل رغبتكم بالاستمرار، والطلب الآن بانتظار الخطوة التالية حسب حالة الملف.

لا يوجد أي دفع مطلوب الآن من خلال هذه الرسالة.
إذا كان مطلوبًا أي إجراء إضافي، سيظهر حسب حالة الطلب أو من خلال رابط المتابعة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
}

function declineConfirmationMessage(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `أهلًا ${name} 🌿

تم تسجيل عدم رغبتكم بالاستمرار حاليًا، وتم إلغاء الطلب.

لا يوجد أي دفع مطلوب عليكم.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
}

async function logMessage(input: {
  waId: string;
  direction: "incoming" | "outgoing";
  body: string;
  customerName?: string;
  messageId?: string;
  messageType?: string;
  intent?: CustomerIntent;
  trackingId?: string | null;
  applicationId?: string | null;
  needsHumanReview?: boolean;
  handledByAi?: boolean;
  rawPayload?: unknown;
  status?: string | null;
  statusTimestamp?: string | null;
}) {
  try {
    await supabaseAdmin.from("whatsapp_messages").insert({
      wa_id: input.waId,
      direction: input.direction,
      customer_name: input.customerName || null,
      message_id: input.messageId || null,
      message_type: input.messageType || "text",
      body: input.body,
      intent: input.intent || null,
      tracking_id: input.trackingId || null,
      application_id: input.applicationId || null,
      needs_human_review: input.needsHumanReview ?? false,
      handled_by_ai: input.handledByAi ?? null,
      status: input.status || null,
      status_timestamp: input.statusTimestamp || null,
      raw_payload: input.rawPayload || null,
    });
  } catch (error) {
    console.error("whatsapp_messages insert failed:", error);
  }
}


type AiSuccessfulReplyRecord = {
  id?: string;
  intent?: string | null;
  customer_message?: string | null;
  ai_reply?: string | null;
  score?: number | null;
};

function compactForAiMemory(value: string | null | undefined, maxLength = 500) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}...`;
}

function textSimilarityScore(a: string, b: string) {
  const aWords = new Set(
    normalizeArabicText(a)
      .split(" ")
      .filter((word) => word.length >= 3)
  );
  const bWords = new Set(
    normalizeArabicText(b)
      .split(" ")
      .filter((word) => word.length >= 3)
  );

  if (!aWords.size || !bWords.size) return 0;

  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap += 1;
  }

  return overlap / Math.max(aWords.size, bWords.size);
}

async function findSimilarSuccessfulReplies(intent: CustomerIntent, customerText: string) {
  try {
    const normalizedText = normalizeArabicText(customerText);
    if (!normalizedText || normalizedText.length < 3) return "";

    const { data, error } = await supabaseAdmin
      .from("ai_successful_replies")
      .select("id,intent,customer_message,ai_reply,score")
      .or(`intent.eq.${intent},intent.eq.unknown`)
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      if ((error as any).code !== "42P01") {
        console.error("ai_successful_replies select failed:", error);
      }
      return "";
    }

    const rows = ((data || []) as AiSuccessfulReplyRecord[])
      .map((row) => ({
        ...row,
        similarity: textSimilarityScore(customerText, row.customer_message || ""),
      }))
      .filter((row) => row.ai_reply && row.customer_message && (row.similarity >= 0.12 || Number(row.score || 0) > 0))
      .sort((a, b) => {
        const bScore = Number(b.score || 0) + b.similarity * 10;
        const aScore = Number(a.score || 0) + a.similarity * 10;
        return bScore - aScore;
      })
      .slice(0, 5);

    if (!rows.length) return "";

    return rows
      .map((row, index) => {
        return `مثال ${index + 1}:\nسؤال سابق: ${compactForAiMemory(row.customer_message, 220)}\nرد ناجح: ${compactForAiMemory(row.ai_reply, 650)}\nالتقييم: ${Number(row.score || 0)}`;
      })
      .join("\n\n");
  } catch (error) {
    console.error("findSimilarSuccessfulReplies failed:", error);
    return "";
  }
}

async function logAiConversation(input: {
  phone: string;
  customerMessage: string;
  aiReply: string;
  intent: CustomerIntent;
  applicationStatus?: string | null;
}) {
  try {
    await supabaseAdmin.from("ai_conversations").insert({
      phone: normalizeWhatsAppToSend(input.phone) || input.phone || null,
      customer_message: input.customerMessage,
      ai_reply: input.aiReply,
      intent: input.intent,
      application_status: input.applicationStatus || null,
      customer_replied: false,
    });
  } catch (error) {
    if ((error as any)?.code !== "42P01") {
      console.error("ai_conversations insert failed:", error);
    }
  }
}

async function findApplicationForAiMemory(from: string, text: string, intent: CustomerIntent) {
  const tracking = extractTracking(text);
  const typedPhone = extractJordanPhoneFromText(text);

  try {
    if (tracking && typedPhone) {
      return (await findApplicationByTrackingAndPhone(tracking, typedPhone)) || (await findApplicationByTracking(tracking));
    }

    if (tracking) {
      return (await findApplicationByTracking(tracking)) || (await findApplicationByTrackingAndPhone(tracking, from));
    }

    if ([
      "order_status",
      "delivery",
      "payment",
      "refund",
      "complaint",
      "abuse",
      "legal_threat",
      "social_media_threat",
      "scam_accusation",
      "payment_dispute",
      "device_delay_rage",
      "continue_decision",
      "decline_decision",
    ].includes(intent)) {
      return await findApplicationByPhone(from);
    }
  } catch (error) {
    console.error("findApplicationForAiMemory failed:", error);
  }

  return null;
}

async function markPreviousAiConversationCustomerReplied(phone: string) {
  try {
    const normalizedPhone = normalizeWhatsAppToSend(phone) || phone;

    await supabaseAdmin
      .from("ai_conversations")
      .update({ customer_replied: true })
      .eq("phone", normalizedPhone)
      .eq("customer_replied", false);
  } catch (error) {
    if ((error as any)?.code !== "42P01") {
      console.error("ai_conversations customer_replied update failed:", error);
    }
  }
}


async function claimIncomingWhatsAppMessage(input: {
  messageId?: string;
  waId: string;
  body: string;
  messageType: string;
  rawPayload?: unknown;
}) {
  const messageId = String(input.messageId || "").trim();

  if (!messageId) {
    return { shouldProcess: true, duplicate: false, reason: "missing_message_id" };
  }

  try {
    const { error } = await supabaseAdmin.from("whatsapp_incoming_message_dedupe").insert({
      message_id: messageId,
      wa_id: input.waId,
      body: input.body,
      message_type: input.messageType,
      raw_payload: input.rawPayload || null,
      received_at: new Date().toISOString(),
    });

    if (!error) {
      return { shouldProcess: true, duplicate: false, reason: "claimed" };
    }

    if ((error as any).code === "23505") {
      return { shouldProcess: false, duplicate: true, reason: "duplicate_message_id" };
    }

    if ((error as any).code !== "42P01") {
      console.error("whatsapp_incoming_message_dedupe insert failed:", error);
    }
  } catch (error) {
    console.error("whatsapp_incoming_message_dedupe claim failed:", error);
  }

  // Fallback only if the dedicated dedupe table has not been created yet.
  // This is less race-safe than the unique table, but prevents obvious duplicate replies.
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id")
      .eq("direction", "incoming")
      .eq("message_id", messageId)
      .limit(1);

    if (!error && data && data.length > 0) {
      return { shouldProcess: false, duplicate: true, reason: "duplicate_existing_log" };
    }
  } catch (error) {
    console.error("whatsapp_messages duplicate fallback failed:", error);
  }

  return { shouldProcess: true, duplicate: false, reason: "fallback_process" };
}

async function markIncomingWhatsAppMessageProcessed(messageId?: string) {
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanMessageId) return;

  try {
    await supabaseAdmin
      .from("whatsapp_incoming_message_dedupe")
      .update({ processed_at: new Date().toISOString() })
      .eq("message_id", cleanMessageId);
  } catch (error) {
    console.error("whatsapp_incoming_message_dedupe processed update failed:", error);
  }
}

function extractDeepSeekText(data: any) {
  const directContent = data?.choices?.[0]?.message?.content;

  if (typeof directContent === "string" && directContent.trim()) {
    return directContent.trim();
  }

  const deltaContent = data?.choices?.[0]?.delta?.content;

  if (typeof deltaContent === "string" && deltaContent.trim()) {
    return deltaContent.trim();
  }

  return "";
}

function sanitizeAiReply(reply: string, fallback: string) {
  let clean = String(reply || "").trim();

  if (!clean) return fallback;

  clean = clean
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();

  const forbidden = [
    "قرض نقدي",
    "قروض نقدية",
    "قروضنا",
    "قرضك",
    "كاش",
    "تمويل شخصي",
    "الأمين للتمويل الأصغر",
    "موافقة نهائية مؤكدة بدون مراجعة",
    "استلام اليوم",
    "استلام بكرا",
    "توصيل اليوم",
    "التسليم مؤكد اليوم",
    "متابعة دقيقة",
    "مراجعة دقيقة",
    "تحويلك لموظف",
    "تحويل لموظف",
    "الموظف المختص",
    "سيتم تحويل",
    "سيتم رفع المحادثة",
    "رفع المحادثة",
    "تم تصعيد",
    "0795733001",
    "خلال هذا الأسبوع",
    "اليوم",
    "بكرا",
    "غدًا",
    "غدا",
    "الساعة",
    "6:00",
    "31/05/2026",
    "31-05",
    "جاهزين لاستقبالك",
    "زورونا",
    "زيارة المكتب متاحة",
    "دوام المكتب",
    "ساعات العمل",
    "من السبت للخميس",
    "الموعد الجديد",
    "موعد الاستلام",
    "تم تحديد موعد",
  ];

  if (forbidden.some((word) => clean.includes(word))) {
    return fallback;
  }

  if (clean.length > 2400) {
    clean = clean.slice(0, 2300).trim();
  }

  return clean || fallback;
}

async function generateAiReply(input: AiReplyInput) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  if (!apiKey) {
    console.error("Missing DEEPSEEK_API_KEY");
    return input.deterministicReply;
  }

  const strictDeterministicIntents: CustomerIntent[] = [
    "contact_info",
    "location",
    "website",
    "payment",
    "payment_dispute",
    "delivery",
    "device_delay_rage",
    "refund",
    "continue_decision",
    "decline_decision",
    "loan",
  ];

  if (strictDeterministicIntents.includes(input.intent)) {
    return input.deterministicReply;
  }

  if (input.hasApplication && ["approved", "under_review", "needs_guarantor", "customer_accepts_delivery_delay", "delivery_delay_notice_sent"].includes(String(input.status || ""))) {
    return input.deterministicReply;
  }

  const systemInstructions = `
أنت تمثل خدمة عملاء واتساب حقيقية لدى "الأمين للأقساط" في الأردن.

حقائق رسمية ثابتة ممنوع تغييرها أو اختراع بدائل عنها:
- رقم واتساب الشركة الرسمي: ${BUSINESS_PHONE_E164}
- الرقم المحلي الرسمي: ${BUSINESS_PHONE_DISPLAY}
- الموقع الرسمي: ${BUSINESS_WEBSITE}
- العنوان الرسمي: ${BUSINESS_ADDRESS}
- رسوم فتح الملف الرسمية: 5 دنانير فقط.
- ممنوع اختراع أي رقم هاتف أو رابط أو عنوان أو رسوم أو موعد.
- إذا سأل العميل عن رقم الشركة أو معلومات التواصل، استخدم هذه البيانات فقط ولا تضف أي رقم آخر.
- إذا سأل العميل عن العنوان أو الموقع الجغرافي، أعطِ العنوان الرسمي فقط مع ملاحظة أن زيارة المكتب لا تتم إلا إذا وصلت للعميل رسالة واضحة من الإدارة تطلب الحضور أو تحدد موعدًا لذلك.
- ممنوع دعوة العميل لزيارة المكتب، أو قول "جاهزين لاستقبالك"، أو ذكر دوام المكتب، أو ساعات العمل، أو أي موعد زيارة، إلا إذا كانت رسالة الإدارة نفسها تطلب ذلك صراحة.
- إذا لم تكن المعلومة موجودة في الرد الآمن الأساسي أو قاعدة بيانات الطلب، قل: "لا يوجد لدي معلومة مؤكدة حول ذلك حاليًا" ولا تخمّن.
- أي رقم هاتف غير الرقم الرسمي أو أي موعد تسليم/زيارة/اتصال غير موجود في قاعدة البيانات يعتبر خطأ ممنوع.

القاعدة الذهبية:
- افهم نية العميل أولًا.
- لا تطلب رقم التتبع إلا إذا كان السؤال عن طلب محدد أو المتابعة تحتاج ربط الطلب.
- ممنوع تمامًا أن تقول للعميل: سيتم تحويلك، متابعة بشرية، مراجعة بشرية، موظف مختص، سيتم رفع المحادثة، تم تصعيد المحادثة، أو أي صياغة تكشف أن الرد انتقل لجهة أخرى.
- إذا العميل طلب موظف أو اتصال أو قال "بدي أحكي مع حدا": رد كأنك قادر تساعده داخل نفس المحادثة، واطلب منه شرح المشكلة أو رقم التتبع فقط عند الحاجة.
- إذا العميل كتب شتيمة مباشرة أو بذاءة أو إهانة شخصية: لا ترد بتحية، لا تقل وعليكم السلام، لا تعتذر بشكل مبالغ، ولا تدخل في جدال. رد بهدوء وحدود احترام: "واضح إنك منزعج، بس خلينا نحافظ على الاحترام حتى أقدر أساعدك" ثم اطلب المشكلة نفسها أو رقم الطلب عند الحاجة.
- لا تكافئ الشتائم برد طويل. اجعل الرد قصيرًا، ثابتًا، ومهنيًا.
- إذا العميل غاضب أو كتب كلمات مثل: نصب، احتيال، حرامية، سرقة، كذب، مماطلة، تأخير، ما بتردو، بدي فلوسي، شكوى، محامي، شرطة، جرائم إلكترونية، حماية المستهلك، بفضحكم، بنشر عليكم: لا تجادله، لا تدافع، ولا تبدأ بطلب رقم التتبع إلا إذا لا توجد أي حالة طلب معروفة.
- في الرسائل الغاضبة: ابدأ باعتذار واضح ومتنوع، اعترف بحقه بالاستياء، ثم وضّح الحالة إن كانت معروفة، أو اطلب رقم التتبع/الهاتف بهدوء إذا لم يكن الطلب معروفًا.
- لا تستخدم جملة اعتذار واحدة دائمًا. نوّع بين: "حقك علينا"، "بنعتذر بصدق"، "فاهمين غضبك"، "آسفين إن التجربة وصلت لهالشكل"، "حقك يكون عندك جواب واضح"، "خلينا نراجعها بدون جدال".
- لا تعترف قانونيًا بأن الشركة نصبت أو سرقت. استخدم اعتذارًا عن التجربة/التأخير/عدم الوضوح، وليس اعترافًا باتهام.
- إذا العميل هدد بشكوى أو نشر أو محامي: قل إن حقه محفوظ، وإنك ستوضح الحالة حسب البيانات المتوفرة، واطلب البيانات لربطها بالطلب إن لم تكن موجودة.
- إذا العميل سأل سؤالًا عامًا مثل: موقعكم، عنوانكم، كيف الأقساط، الشروط، الدفع، الأجهزة: أجب مباشرة ولا تحوّل الرد لمتابعة طلب.

شخصيتك وأسلوبك:
- رد كإنسان طبيعي على واتساب، مش كنص رسمي جامد.
- استخدم لهجة أردنية مهذبة وواضحة.
- لا تكرر نفس الافتتاحية.
- خليك راقٍ، مختصر، ومطمئن.
- استخدم إيموجي خفيف جدًا مثل 🌿 أو ✅ فقط عند الحاجة.
- لا تقول إنك ذكاء اصطناعي.
- لا تكتب JSON ولا شرح داخلي.

قواعد النشاط:
- الاسم الصحيح: "الأمين للأقساط".
- النشاط فقط تقسيط أجهزة إلكترونية وهواتف.
- لا نقدم قروضًا نقدية، ولا تمويلًا شخصيًا، ولا كاش.
- إذا سأل عن قروض أو مصاري: وضح بلطف أننا لا نقدم قروضًا، فقط تقسيط أجهزة وهواتف.

قواعد الدفع:
- إذا كتب العميل: موافق، أود الاستمرار، بدي أكمل، أو أي صيغة استمرار، وكان الطلب حالته مؤهل مبدئيًا: سجّل رغبته بالاستمرار ثم أرسل تعليمات الدفع ورابط رفع الوصل تلقائيًا.
- لا ترسل تعليمات الدفع عند كلمة موافق إلا إذا كان الطلب مرتبطًا وواضحًا وحالته مؤهل مبدئيًا.
- رسوم فتح الملف 5 دنانير فقط.
- لا تُذكر رسوم فتح الملف كطلب دفع إلا إذا كان الطلب مؤهلًا مبدئيًا / عليه موافقة مبدئية من صفحة الإدارة، أو إذا الرد الآمن الأساسي يذكر صراحة أن تعليمات الدفع مطلوبة.
- لا تطلب رسوم فتح الملف في الأسئلة العامة أو قبل مراجعة الطلب.
- إذا سألك العميل عن الدفع بشكل عام، وضح أن الرسوم لا تُطلب من البداية، فقط بعد التأهيل المبدئي من صفحة الإدارة.
- إذا احتجت تشرح سبب رسوم فتح الملف، استخدم صياغة احتضانية: بسبب كثرة الطلبات اليومية يتم تدقيق كل ملف يدويًا، وتوجد طلبات غير مكتملة أو غير جادة تعطل مراجعة ملفات العملاء الجادين، لذلك تساعد الرسوم الرمزية على تخصيص وقت المراجعة للطلبات الجادة.
- ممنوع قول: لا نملك الطاقة لدراسة كل شيء، أو الطلبات الوهمية كثيرة، أو أن العميل يدفع ثمن غيره. استخدم بدلًا منها: حجم الطلبات كبير، المراجعة يدوية، ونحرص على عدالة دراسة الملفات الجادة.
- الرسوم مستردة بالكامل في حال عدم الموافقة النهائية.
- القسط الأول لا يُدفع الآن، بل بعد الاستلام حسب الاتفاق.
- دفع رسوم فتح الملف لا يعني الموافقة النهائية.

قواعد المواعيد والتسليم والتهدئة:
- لا تخترع موعد تسليم، ولا تعطي وعدًا نهائيًا خارج الرد الآمن الأساسي.
- إذا كانت حالة الطلب approved وسأل العميل عن التسليم أو التأخير: اذكر أن الطلب عليه موافقة نهائية، وأننا ما زلنا بانتظار تزويدنا بالأجهزة من الوكلاء والموردين المعتمدين، وأنه لا يوجد موعد تسليم نهائي محدد حاليًا، وسيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة واعتماد جدول التوزيع من الإدارة.
- في حالة approved ممنوع ذكر أي يوم أو تاريخ أو ساعة أو عبارة "خلال هذا الأسبوع" أو "الموعد الجديد" أو "موعد الاستلام". استخدم فقط: بانتظار تزويدنا بالأجهزة من الوكلاء والموردين المعتمدين، قيد الترتيب، تنسيق التسليم، اعتماد جدول التوزيع.
- إذا كانت الحالة customer_accepts_delivery_delay: لا تستخدم delivery_delay_until ولا تذكر أي تاريخ محفوظ. قل إن اختيار الانتظار مسجل، ولا يوجد موعد تسليم نهائي محدد حاليًا، وسيتم التواصل فور وصول الأجهزة واعتماد جدول التوزيع.
- إذا كانت الحالة under_review: اذكر أن الطلب ما زال قيد الدراسة والمتابعة من الإدارة، وأن التأخير مرتبط بالعطلة الطويلة وضغط المراجعات، ولا تعطِ أي وعد بالموافقة أو التسليم.
- إذا كانت الحالة needs_guarantor: اذكر أن الطلب بانتظار استكمال متطلبات الكفيل وأن الدراسة لم تكتمل بعد، ولا تعطِ أي موعد تسليم.
- استخدم عبارات تهدئة بشرية عند القلق أو التأخير مثل: حقك علينا، بنقدّر صبرك وثقتك، فاهمين قلقك، نتفهم أهمية الجهاز بالنسبة إلك، ما بدنا تضل منتظر بدون وضوح، حقك يكون عندك تحديث واضح، نشكرك على تفهمك، وكل عام وأنتم بخير.
- تجنّب كلمات تقلق العميل مثل: أزمة، مشكلة، نقص، نفاد، غير متوفر، لا نعلم، غير قادرين. استبدلها بصيغ مهنية مطمئنة مثل: بانتظار التوريد، قيد الترتيب، قيد الجدولة، قيد المتابعة، تحديث لوجستي، تنسيق التسليم.

قواعد الحالات:
- approved فقط تعني موافقة نهائية.
- under_review ليست موافقة.
- needs_guarantor يعني بحاجة كفيل لاستكمال الدراسة وليس رفضًا.
- needs_identity أو identity_requested يعني بحاجة صورة الهوية الأمامية والخلفية لاستكمال الدراسة.
- needs_salary_slip يعني بحاجة كشف راتب أو شهادة راتب.
- بعد تأكيد رسوم فتح الملف فقط، قد يطلب النظام كفيلًا أو كشف راتب رسميًا حسب سياسة الدراسة النهائية.
- ممنوع تمامًا أن تذكر للعميل أن طلب كشف الراتب أو الكفيل بسبب أن الراتب قليل أو أقل من 350 أو غير كافٍ.
- استخدم دائمًا صياغات محايدة مثل: حسب متطلبات الدراسة النهائية، لاستكمال إجراءات الملف، حسب سياسة الموافقة، إجراء تنظيمي لاستكمال الدراسة.
- لا ترسل رابط كفيل أو كشف راتب إذا لم تكن رسوم فتح الملف مؤكدة في الرد الآمن الأساسي.
- refund_requested يعني طلب استرداد مسجل دون وعد بوقت تنفيذ.
- refund_completed فقط تعني أن الاسترداد تم.
- customer_claimed_paid يعني الوصل قيد مراجعة الإدارة ولا يكرر الدفع.
- cancelled يعني الطلب ملغي.

ممنوعات صارمة في الرد النهائي للعميل:
- لا تقل للعميل: متابعة بشرية، مراجعة بشرية، تحويل لموظف، الموظف المختص، سيتم تحويل الموضوع، سيتم رفع المحادثة، سيتم التصعيد، الإدارة ستتواصل لاحقًا.
- لا تعطي وعدًا بوقت تنفيذ استرداد أو تسليم نهائي. حاليًا جميع مواعيد التسليم معلقة حتى وصول الأجهزة واعتماد جدول التوزيع من الإدارة.
- لا تقول موافقة نهائية إلا إذا الحالة approved.

استخدم "الرد الآمن الأساسي" كمصدر حقيقة، وصغه إنسانيًا دون مخالفة أو إضافة وعود.
`;

  const similarSuccessfulReplies = await findSimilarSuccessfulReplies(input.intent, input.customerText);

  const userInput = `
نية العميل المصنفة:
${input.intent}

رسالة العميل:
${input.customerText || "(لا يوجد نص واضح)"}

هل توجد حالة طلب؟
${input.hasApplication ? "نعم" : "لا"}

هل الرسالة حساسة؟
${input.isSensitive ? "نعم" : "لا"}

بيانات مختصرة:
الاسم: ${input.customerName || "غير متوفر"}
رقم التتبع: ${input.trackingId || "غير متوفر"}
الحالة: ${input.status || "غير متوفرة"}
حالة الدفع: ${input.paymentStatus || "غير متوفرة"}
الجهاز: ${input.deviceName || "غير متوفر"}

أمثلة سابقة ناجحة من ذاكرة ${BUSINESS_NAME}:
${similarSuccessfulReplies || "لا توجد أمثلة مشابهة كافية حاليًا."}

تعليمات استخدام الأمثلة السابقة:
- استفد من الأسلوب والنبرة فقط إذا كانت مناسبة.
- لا تنسخ أي معلومة تخالف الرد الآمن الأساسي.
- الرد الآمن الأساسي وبيانات الطلب الحالية أقوى من أي مثال سابق.

الرد الآمن الأساسي الذي يجب الالتزام به وعدم مخالفته:
${input.deterministicReply}
`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: systemInstructions,
          },
          {
            role: "user",
            content: userInput,
          },
        ],
        temperature: 0.65,
        max_tokens: 900,
        thinking: { type: "disabled" },
      }),
    });

    if (!response.ok) {
      console.error("DeepSeek reply failed:", await response.text());
      return input.deterministicReply;
    }

    const data = await response.json();
    const aiText = extractDeepSeekText(data);

    return sanitizeAiReply(aiText, input.deterministicReply);
  } catch (error) {
    console.error("DeepSeek reply error:", error);
    return input.deterministicReply;
  }
}

async function buildReply(request: Request, from: string, text: string) {
  const baseUrl = getBaseUrl(request);
  const tracking = extractTracking(text);
  const typedPhone = extractJordanPhoneFromText(text);
  const intent = classifyIntent(text);
  const sensitive = looksSensitive(text);

  let app: ApplicationRecord | null = null;

  if (tracking && typedPhone) {
    app = await findApplicationByTrackingAndPhone(tracking, typedPhone);
    if (!app) app = await findApplicationByTracking(tracking);
  } else if (tracking) {
    app = await findApplicationByTracking(tracking);
    if (!app) app = await findApplicationByTrackingAndPhone(tracking, from);
  } else if (
    intent === "order_status" ||
    intent === "delivery" ||
    intent === "payment" ||
    intent === "refund" ||
    intent === "complaint" ||
    intent === "abuse" ||
    intent === "legal_threat" ||
    intent === "social_media_threat" ||
    intent === "scam_accusation" ||
    intent === "payment_dispute" ||
    intent === "device_delay_rage" ||
    intent === "continue_decision" ||
    intent === "decline_decision"
  ) {
    app = await findApplicationByPhone(from);
  }

  let deterministicReply: string;

  if (app && intent === "continue_decision") {
    if (app.status !== "preliminary_qualified") {
      deterministicReply = `${humanOpening(`${from}:continue_guard`)}

وصلني ردك بخصوص الاستمرار، لكن هذا الخيار مرتبط فقط بطلب تم تأهيله مبدئيًا.

حالة طلبك الحالية:
${statusHumanLabel(app.status || "")}

لا يوجد أي دفع مطلوب الآن من خلال هذه الرسالة.

رقم التتبع:
${app.tracking_id || app.id}

${BUSINESS_NAME}`;

      await sendDiscordNotification({
        title: "⚠️ رد استمرار خارج حالة التأهيل المبدئي",
        description: "العميل أرسل موافقة على الاستمرار، لكن حالة الطلب ليست preliminary_qualified، لذلك لم يتم إرسال معلومات الدفع.",
        color: 0xfee75c,
        app,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });

      return generateAiReply({
        customerText: text,
        deterministicReply,
        customerName: firstTwoNames(app.full_name),
        trackingId: app.tracking_id || app.id,
        status: app.status || null,
        paymentStatus: app.payment_status || null,
        deviceName: app.device_name || null,
        isSensitive: sensitive,
        hasApplication: true,
        intent,
      });
    }

    const updatedApp = await updateCustomerDecision({ app, decision: "continue" });
    deterministicReply = paymentMessage(updatedApp, baseUrl);

    await sendDiscordNotification({
      title: "✅ العميل وافق على الاستمرار — تم إرسال معلومات الدفع",
      description: "تم تسجيل موافقة العميل على الاستمرار وإرسال معلومات فتح الملف ورابط رفع الوصل تلقائيًا.",
      color: 0x57f287,
      app: updatedApp,
      customerPhone: from,
      customerMessage: text,
      systemReply: deterministicReply,
      baseUrl,
    });

    return generateAiReply({
      customerText: text,
      deterministicReply,
      customerName: firstTwoNames(updatedApp.full_name),
      trackingId: updatedApp.tracking_id || updatedApp.id,
      status: updatedApp.status || null,
      paymentStatus: updatedApp.payment_status || null,
      deviceName: updatedApp.device_name || null,
      isSensitive: sensitive,
      hasApplication: true,
      intent,
    });
  }

  if (app && intent === "decline_decision") {
    const updatedApp = await updateCustomerDecision({ app, decision: "decline" });
    deterministicReply = declineConfirmationMessage(updatedApp);

    await sendDiscordNotification({
      title: "❌ العميل رفض الاستمرار",
      description: "تم إلغاء الطلب تلقائيًا بناءً على رد العميل.",
      color: 0xed4245,
      app: updatedApp,
      customerPhone: from,
      customerMessage: text,
      systemReply: deterministicReply,
      baseUrl,
    });

    return generateAiReply({
      customerText: text,
      deterministicReply,
      customerName: firstTwoNames(updatedApp.full_name),
      trackingId: updatedApp.tracking_id || updatedApp.id,
      status: updatedApp.status || null,
      paymentStatus: updatedApp.payment_status || null,
      deviceName: updatedApp.device_name || null,
      isSensitive: sensitive,
      hasApplication: true,
      intent,
    });
  }

  if (!app && (intent === "continue_decision" || intent === "decline_decision")) {
    deterministicReply = `${humanOpening(`${from}:decision`)}

وصلني قرارك بخصوص الاستمرار، لكن حتى أربطه بالطلب الصحيح ابعث رقم الطلب الذي يبدأ بـ AM-.

مثال:
AM-177...

${BUSINESS_NAME}`;

    await sendDiscordNotification({
      title: "⚠️ رد استمرار/إلغاء بدون طلب مرتبط",
      description: "العميل أرسل قرار استمرار أو إلغاء، لكن لم يتم العثور على طلب من رقمه.",
      color: 0xfee75c,
      customerPhone: from,
      customerMessage: text,
      systemReply: deterministicReply,
      baseUrl,
    });

    return generateAiReply({
      customerText: text,
      deterministicReply,
      isSensitive: sensitive,
      hasApplication: false,
      intent,
    });
  }

  if (app) {
    deterministicReply = safeReply(app, baseUrl, text, intent);

    return generateAiReply({
      customerText: text,
      deterministicReply,
      customerName: firstTwoNames(app.full_name),
      trackingId: app.tracking_id || app.id,
      status: app.status || null,
      paymentStatus: app.payment_status || null,
      deviceName: app.device_name || null,
      isSensitive: sensitive,
      hasApplication: true,
      intent,
    });
  }

  if (intent === "abuse") {
    deterministicReply = abuseReply(baseUrl, from, null, text);
  } else if (intent === "legal_threat") {
    deterministicReply = legalThreatReply(baseUrl, from, null, text);
  } else if (intent === "social_media_threat") {
    deterministicReply = socialMediaThreatReply(baseUrl, from, null, text);
  } else if (intent === "scam_accusation") {
    deterministicReply = scamAccusationReply(baseUrl, from, null, text);
  } else if (intent === "payment_dispute") {
    deterministicReply = paymentDisputeReply(baseUrl, from, null, text);
  } else if (intent === "device_delay_rage") {
    deterministicReply = deviceDelayRageReply(baseUrl, from, null, text);
  } else if (intent === "complaint") {
    deterministicReply = complaintReply(baseUrl, from, null, text);
  } else if (intent === "refund") {
    deterministicReply = refundReply(baseUrl, from, null);
  } else if (intent === "human_agent") {
    deterministicReply = `${humanOpening(`${from}:human`)}

أكيد، احكيلي شو المشكلة باختصار، أو ابعث رقم التتبع إذا الموضوع متعلق بطلب.

بساعدك مباشرة حسب البيانات الظاهرة عندي وبعطيك الخطوة المناسبة بدون لف ودوران.`;
  } else if (intent === "loan") {
    deterministicReply = loanReply(from);
  } else if (intent === "contact_info") {
    deterministicReply = contactInfoReply(baseUrl, from);
  } else if (intent === "website") {
    deterministicReply = websiteReply(baseUrl, from);
  } else if (intent === "location") {
    deterministicReply = locationReply(from);
  } else if (intent === "installment_info") {
    deterministicReply = installmentInfoReply(baseUrl, from);
  } else if (intent === "requirements") {
    deterministicReply = requirementsReply(baseUrl, from);
  } else if (intent === "apply") {
    deterministicReply = applyReply(baseUrl, from);
  } else if (intent === "products") {
    deterministicReply = productsReply(baseUrl, from);
  } else if (intent === "payment") {
    deterministicReply = paymentGeneralReply(from);
  } else if (intent === "delivery") {
    deterministicReply = `${humanOpening(`${from}:delivery`)}

نعتذر منك بصدق عن أي تأخير أو عدم وضوح بخصوص المواعيد.

التحديث المعتمد حاليًا:
${POST_EID_DELIVERY_STRICT_TEXT}.

لا يوجد موعد تسليم نهائي محدد حاليًا. إذا بدك أفحص حالة طلبك تحديدًا، ابعث رقم التتبع، وبعطيك الحالة الموجودة عندي بدون تخمين.`;
  } else if (tracking) {
    deterministicReply = `${humanOpening(`${from}:tracking`)}

فحصت رقم التتبع اللي وصلني:
${tracking}

بس ما ظهر عندي طلب مطابق لهذا الرقم.

ممكن يكون في رقم ناقص أو خطأ بسيط بالتتبع. ابعثلي صورة الطلب أو رقم الهاتف المستخدم بالطلب، وبراجعه لك فورًا.

${BUSINESS_NAME}`;
  } else if (intent === "greeting") {
    deterministicReply = `${humanOpening(`${from}:greeting`)}

كيف بقدر أساعدك اليوم؟

اسألني مباشرة عن التقسيط، الشروط، الموقع، العنوان، الدفع، أو متابعة طلب، وبجاوبك بدون لف ودوران.`;
  } else if (intent === "thanks") {
    deterministicReply = `العفو 🌿
بخدمتك بأي وقت.`;
  } else {
    deterministicReply = unknownReply(from);
  }

  const factualIntentNeedsExactReply = [
    "contact_info",
    "website",
    "location",
    "loan",
    "installment_info",
    "requirements",
    "apply",
    "products",
    "payment",
    "delivery",
    "greeting",
    "thanks",
  ].includes(intent);

  if (factualIntentNeedsExactReply) {
    return deterministicReply;
  }

  return generateAiReply({
    customerText: text,
    deterministicReply,
    isSensitive: sensitive,
    hasApplication: false,
    intent,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  const body = (await request.json()) as WhatsAppWebhookBody;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      const contactName = value?.contacts?.[0]?.profile?.name || "";

      for (const statusEvent of ((value?.statuses || []) as any[])) {
        const statusMessageId = String(statusEvent?.id || "");
        const statusValue = String(statusEvent?.status || "");
        const recipientId = String(statusEvent?.recipient_id || "");
        const unixTimestamp = Number(statusEvent?.timestamp || 0);
        const statusTimestamp =
          Number.isFinite(unixTimestamp) && unixTimestamp > 0
            ? new Date(unixTimestamp * 1000).toISOString()
            : new Date().toISOString();

        if (!statusMessageId && !statusValue) continue;

        try {
          let matchedExistingMessage = false;

          if (statusMessageId) {
            const { data: updatedRows, error: updateError } = await supabaseAdmin
              .from("whatsapp_messages")
              .update({
                status: statusValue || null,
                status_timestamp: statusTimestamp,
                raw_payload: statusEvent,
              })
              .eq("message_id", statusMessageId)
              .select("id")
              .limit(1);

            if (updateError) {
              throw updateError;
            }

            matchedExistingMessage = Array.isArray(updatedRows) && updatedRows.length > 0;
          }

          // Meta sends sent/delivered/read webhooks for messages we already logged when sending.
          // Do not insert every status event as a new conversation row, otherwise the dashboard
          // shows duplicate empty outgoing rows and sometimes cannot display a linked customer.
          // Only create a fallback row if Meta sends a status for a message ID that we do not
          // have stored locally.
          if (!matchedExistingMessage && statusMessageId) {
            const statusPhone = recipientId || "";
            await logMessage({
              waId: statusPhone,
              direction: "outgoing",
              body: "",
              messageId: statusMessageId,
              messageType: "status",
              status: statusValue || null,
              statusTimestamp,
              rawPayload: statusEvent,
            });
          }
        } catch (error) {
          console.error("Failed to process WhatsApp status:", error);
        }
      }

      for (const message of value?.messages || []) {
        const from = message.from || "";
        const type = message.type || "unknown";
        const text =
          type === "text"
            ? message.text?.body || ""
            : type === "image"
              ? message.image?.caption || "تم استلام صورة."
              : "";

        if (!from) continue;

        const incomingClaim = await claimIncomingWhatsAppMessage({
          messageId: message.id,
          waId: from,
          body: text,
          messageType: type,
          rawPayload: message,
        });

        if (!incomingClaim.shouldProcess) {
          console.log("WhatsApp duplicate incoming message skipped:", {
            messageId: message.id,
            waId: from,
            reason: incomingClaim.reason,
          });
          continue;
        }

        const incomingIntent = classifyIntent(text);
        const incomingTracking = extractTracking(text);
        const needsHumanReview = shouldFlagHumanReview(text, incomingIntent);

        await markPreviousAiConversationCustomerReplied(from);

        await logMessage({
          waId: from,
          direction: "incoming",
          body: text,
          customerName: contactName,
          messageId: message.id,
          messageType: type,
          intent: incomingIntent,
          trackingId: incomingTracking || null,
          needsHumanReview,
          handledByAi: false,
          rawPayload: message,
        });

        if (type !== "text" && type !== "image") {
          const reply = `أهلًا وسهلًا 🌿

وصلتنا رسالتكم، لكن حاليًا بقدر أتعامل مع الرسائل النصية والصور فقط.

اكتبلي طلبك نصيًا: تقسيط، متابعة طلب، دفع، عنوان، موقع، أو شكوى، وبساعدك مباشرة.

${BUSINESS_NAME}`;

          const outgoingMessageId = await sendWhatsAppText(from, reply);
          await logMessage({
            waId: from,
            direction: "outgoing",
            body: reply,
            messageId: outgoingMessageId || undefined,
            intent: incomingIntent,
            trackingId: incomingTracking || null,
            needsHumanReview,
            handledByAi: true,
          });
          await markIncomingWhatsAppMessageProcessed(message.id);
          continue;
        }

        const reply = await buildReply(request, from, text);
        const outgoingMessageId = await sendWhatsAppText(from, reply);
        await logMessage({
          waId: from,
          direction: "outgoing",
          body: reply,
          messageId: outgoingMessageId || undefined,
          intent: incomingIntent,
          trackingId: incomingTracking || null,
          needsHumanReview,
          handledByAi: true,
        });

        const aiMemoryApp = await findApplicationForAiMemory(from, text, incomingIntent);
        await logAiConversation({
          phone: from,
          customerMessage: text,
          aiReply: reply,
          intent: incomingIntent,
          applicationStatus: aiMemoryApp?.status || null,
        });

        await markIncomingWhatsAppMessageProcessed(message.id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}