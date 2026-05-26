import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ApplicationRecord = {
  id: string;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  status?: string | null;
  payment_status?: string | null;
  device_name?: string | null;
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
  | "complaint"
  | "refund"
  | "human_agent"
  | "loan"
  | "website"
  | "location"
  | "installment_info"
  | "requirements"
  | "apply"
  | "products"
  | "payment"
  | "payment_receipt"
  | "continue_request"
  | "decline_continue"
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
const POST_EID_DELIVERY_TEXT = "بعد العيد، ابتداءً من الأحد 31/05/2026";
const POST_EID_DELIVERY_STRICT_TEXT =
  "جميع مواعيد التسليم والاستلام ستكون بعد العيد، ابتداءً من الأحد 31/05/2026، وحسب جدول الإدارة وترتيب الطلبات";

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

const agentNames = ["سلمى", "ديما", "لين", "رنا", "نور", "تالا", "مي", "لانا", "جود", "هبة"];

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
  return finalIntent === "complaint" || finalIntent === "refund" || finalIntent === "human_agent" || isAngryCustomerText(text);
}


const CONTINUE_REQUEST_KEYWORDS = [
  "اود الاستمرار", "أود الاستمرار", "ارغب بالاستمرار", "أرغب بالاستمرار", "بدي استمر", "بدي أكمل", "بدي اكمل",
  "موافق", "موافقه", "موافقة", "تمام كمل", "كمل", "كمّل", "استمر", "افتح الملف", "فتح الملف", "اكمل الطلب",
  "نعم اريد", "نعم أريد", "yes", "continue", "ok continue", "تمام افتح", "بدي افتح الملف", "انا موافق",
];

const DECLINE_CONTINUE_KEYWORDS = [
  "لا ارغب", "لا أرغب", "لا اريد", "لا أريد", "مش حاب", "مش حابه", "ما بدي", "بديش", "الغاء", "إلغاء",
  "الغي الطلب", "إلغي الطلب", "الغوا الطلب", "إلغوا الطلب", "cancel", "stop", "مش مكمل", "ما بدي اكمل",
  "لا تكمل", "خلص بلاش", "بلاش", "مش مهتم", "لا حاليا", "لا حاليًا",
];

const PAYMENT_RECEIPT_KEYWORDS = [
  "دفعت", "تم الدفع", "حولت", "حوّلت", "حواله", "حوالة", "بعتت الوصل", "بعثت الوصل", "ارسلت الوصل", "أرسلت الوصل",
  "رفعت الوصل", "رفعت الايصال", "رفعت الإيصال", "وصل الدفع", "ايصال الدفع", "إيصال الدفع", "هاي صورة الدفع",
  "هاي الوصل", "هاي الايصال", "هاي الإيصال", "attached receipt", "payment receipt", "paid", "i paid",
];

function isContinueRequestText(text: string) {
  return hasAny(text, CONTINUE_REQUEST_KEYWORDS);
}

function isDeclineContinueText(text: string) {
  return hasAny(text, DECLINE_CONTINUE_KEYWORDS);
}

function isPaymentReceiptText(text: string) {
  return hasAny(text, PAYMENT_RECEIPT_KEYWORDS);
}

function canSendPaymentInfo(app: ApplicationRecord) {
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";

  return (
    status === "preliminary_qualified" ||
    status === "qualification_link_sent" ||
    status === "customer_confirmed_continue" ||
    paymentStatus === "not_requested_yet" ||
    paymentStatus === "pending" ||
    paymentStatus === "pending_payment" ||
    paymentStatus === "payment_info_sent"
  );
}

async function updateApplicationWorkflowState(
  app: ApplicationRecord,
  payload: {
    status?: string;
    payment_status?: string;
    payment_confirmed_at?: string | null;
    preliminary_qualified_at?: string | null;
  }
) {
  if (!app.id || Object.keys(payload).length === 0) return;

  const { error } = await supabaseAdmin
    .from("applications")
    .update(payload)
    .eq("id", app.id);

  if (error) {
    console.error("Failed to update WhatsApp workflow state:", error.message);
  }
}

function confirmedContinueReply(app: ApplicationRecord, baseUrl: string) {
  return paymentMessage(
    {
      ...app,
      status: "customer_confirmed_continue",
      payment_status: "payment_info_sent",
    },
    baseUrl
  );
}

function declinedContinueReply(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `أهلًا ${name} 🌿

تم تسجيل رغبتكم بعدم الاستمرار في فتح ملف الدراسة النهائية حاليًا.

لن يتم طلب أي رسوم فتح ملف على هذا الطلب، وبإمكانكم التقديم لاحقًا عند الحاجة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
}

function paymentReceiptReceivedReply(app: ApplicationRecord, baseUrl: string, messageType = "text") {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const uploadedText =
    messageType === "image"
      ? "تم استلام صورة الوصل / الإيصال من خلال واتساب."
      : "تم تسجيل إشعاركم بخصوص الدفع.";

  return `أهلًا ${name} 🌿

${uploadedText}

سيتم مراجعة وصل الدفع من الإدارة، والطلب الآن بانتظار تأكيد الدفع.

يرجى عدم إعادة الدفع مرة ثانية حتى لا يصير تكرار بالدفع.

رقم التتبع:
${tracking}

رابط المتابعة:
${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
}

function receiptUploadRequiredReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `أهلًا ${name} 🌿

إذا تم الدفع، يرجى رفع صورة وصل الدفع من الرابط التالي حتى تقدر الإدارة تراجعه وتؤكد فتح الملف:

${receiptUrl(baseUrl, app)}

رقم التتبع:
${tracking}

تنبيه مهم: لا تعيد الدفع مرة ثانية إذا كنت دفعت بالفعل، فقط ارفع الوصل.

${BUSINESS_NAME}`;
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

  return reasons.length ? reasons.join(" + ") : "رسالة حساسة/غاضبة تحتاج متابعة";
}

function complaintApologyParagraph(seed: string) {
  const variants = [
    "حقك علينا، وبنعتذر منك بصدق عن أي تأخير أو لخبطة أو شعور بعدم وضوح. مش مقبول تظل بحيرة أو تحس إنك مضطر تلاحق حقك.",
    "أولًا بنعتذر منك بصدق. فاهمين تمامًا إن التأخير أو ضعف المتابعة بيوتر العميل، وحقك يكون عندك جواب واضح ومحترم.",
    "بعتذر منك جدًا على التجربة اللي وصلتك لهالشكل. إحنا ما بدنا أي عميل يحس إن حقه ضايع أو إن الموضوع غير واضح.",
    "حقك تزعل إذا حسّيت إن الرد تأخر أو إن الصورة مش واضحة. بنعتذر منك، ورح نتعامل مع الموضوع كمتابعة جدية مش كرسالة عابرة.",
    "نعتذر منك بكل احترام عن أي إرباك صار. الأهم الآن نربط المحادثة بالطلب الصحيح ونراجع الحالة بدون جدال أو لف ودوران.",
    "أفهم غضبك، وحقك علينا نهدّي الموضوع ونراجع الطلب بشكل واضح. بنعتذر عن أي تقصير أو تأخير وصلك من جهتنا.",
    "آسفين جدًا إن تجربتك وصلت لهالنقطة. خلينا نراجعها بهدوء وبشكل موثق حتى نقدر نعطيك جواب صحيح بدل أي كلام عام.",
    "بنعتذر منك بصدق، وحقك تطلب توضيح كامل. رح نتعامل مع رسالتك كأولوية متابعة حتى تنشاف الحالة من الإدارة.",
  ];

  const digits = digitsOnly(seed);
  const index = Number(digits.slice(-2) || "0") % variants.length;

  return variants[index];
}

function classifyIntent(text: string): CustomerIntent {
  const t = normalizeArabicText(text);

  if (!t) return "unknown";

  if (isAngryCustomerText(t)) {
    return "complaint";
  }

  if (isDeclineContinueText(t)) {
    return "decline_continue";
  }

  if (isContinueRequestText(t)) {
    return "continue_request";
  }

  if (isPaymentReceiptText(t)) {
    return "payment_receipt";
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
  return intent === "complaint" || intent === "refund" || shouldFlagHumanReview(text, intent);
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

function statusHumanLabel(status: string) {
  switch (status) {
    case "preliminary_qualified": return "مؤهل مبدئيًا";
    case "customer_confirmed_continue": return "تم تأكيد رغبتكم بالاستمرار";
    case "customer_declined_continue": return "تم تسجيل عدم الرغبة بالاستمرار";
    case "payment_info_sent": return "تم إرسال معلومات الدفع";
    case "under_review": return "قيد الدراسة النهائية";
    case "approved": return "موافقة نهائية";
    case "rejected": return "غير موافق عليه حاليًا";
    case "needs_salary_slip": return "بانتظار كشف راتب / شهادة راتب";
    case "salary_slip_link_sent": return "تم إرسال رابط كشف الراتب";
    case "salary_slip_uploaded": return "تم استلام كشف الراتب";
    case "first_installment_requested": return "بانتظار اختيار/دفع القسط الأول";
    case "needs_guarantor": return "بانتظار بيانات كفيل";
    case "guarantor_submitted": return "تم استلام بيانات الكفيل";
    case "customer_accepts_delivery_delay": return "تم اختيار الانتظار للموعد الجديد";
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

function complaintReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const opening = humanOpening(`${from}:complaint`);
  const apology = complaintApologyParagraph(`${from}:${customerText}`);
  const tracking = app?.tracking_id || app?.id || "";
  const status = app?.status || "";
  const reason = complaintReasonLabel(customerText);

  if (app) {
    return `${opening}

${apology}

تم اعتبار رسالتك كمتابعة حساسة وتحتاج مراجعة بشرية، والسبب الظاهر لدينا:
${reason}

طلبك ظاهر عندي الآن وحالته:
${statusHumanLabel(status)}

${status === "approved" ? `طلبك عليه موافقة نهائية، والتسليم المعتمد للأجهزة الموافق عليها سيكون ${POST_EID_DELIVERY_TEXT} حسب جدول الإدارة.` : `المتابعة المعتمدة ستكون ${POST_EID_DELIVERY_TEXT}، وبالنسبة للطلبات غير المسلّمة القرار النهائي يعتمد على حالة الطلب وما يظهر من الإدارة.`}

رقم التتبع:
${tracking}

رح يتم رفع المحادثة للمتابعة حتى تنشاف من الإدارة بشكل أوضح. هدفنا الآن نعطيك جواب صحيح وموثق، مش ندخل معك بجدال.

رابط المتابعة:
${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `${opening}

${apology}

تم اعتبار رسالتك كمتابعة حساسة وتحتاج مراجعة بشرية، والسبب الظاهر لدينا:
${reason}

حتى أقدر أرفعها صح وأربطها بالطلب، ابعثلي أي واحد من هذول:
- رقم التتبع إذا موجود
- رقم الهاتف المستخدم بالطلب
- أو صورة الطلب / صورة الوصل

وبمجرد توصلني البيانات بفحصها مباشرة وبرد عليك حسب الحالة. وإذا الموضوع فيه استرداد أو تأخير، بنحوّله للمتابعة بدون جدال.

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

عنواننا:
${BUSINESS_ADDRESS}

للتواصل:
${BUSINESS_PHONE_DISPLAY}

ومع هيك، الأفضل تتابع كتابيًا على واتساب لأن المتابعة بتكون أوضح وموثقة، خصوصًا إذا عندك رقم طلب أو استفسار عن موافقة/تسليم.`;
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
5. رسوم فتح الملف 5 دنانير فقط، ومستردة بالكامل في حال عدم الموافقة.
6. القسط الأول لا يُدفع الآن، ويكون بعد الاستلام حسب الاتفاق.

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

وإذا تأهل الطلب مبدئيًا، رسوم فتح الملف 5 دنانير فقط ومستردة إذا ما تمت الموافقة.

للتقديم:
${baseUrl}`;
}

function applyReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:apply`);
  return `${opening}

للتقديم على طلب جديد، ادخل من الرابط:
${baseUrl}

اختار الجهاز، عبّي البيانات بدقة، وبعدها الإدارة بتراجع الطلب.

إذا صار الطلب مؤهل مبدئيًا بنرسل لك تعليمات فتح الملف. رسوم فتح الملف 5 دنانير فقط ومستردة بالكامل إذا لم تتم الموافقة.

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

بالنسبة للدفع، خليني أوضحها بشكل حاسم حتى ما يصير أي لخبطة:

رسوم فتح الملف 5 دنانير فقط، لكنها لا تُطلب من البداية أبدًا.

تُطلب فقط وفقط وفقط إذا ظهر من صفحة الإدارة أن الطلب مؤهل مبدئيًا / عليه موافقة مبدئية، أو إذا تم إرسال تعليمات الدفع رسميًا للعميل.

مهم جدًا:
- لا يوجد أي دفع عند السؤال العام أو قبل مراجعة الطلب.
- الرسوم مستردة بالكامل في حال عدم الموافقة النهائية.
- القسط الأول لا يُدفع الآن.
- القسط الأول يكون بعد الاستلام حسب الاتفاق.
- دفع رسوم فتح الملف لا يعني موافقة نهائية، هو فقط لاستكمال الدراسة.

إذا عندك طلب موجود، ابعث رقم التتبع وبفحصلك هل مطلوب منك دفع أو لا.`;
}

function paymentMessage(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const device = app.device_name || "الجهاز المطلوب";

  return `تمام ${name} 🌿

طلبكم مؤهل مبدئيًا للانتقال لمرحلة الدراسة النهائية.

الجهاز:
${device}

رقم التتبع:
${tracking}

حسب صفحة الإدارة، طلبكم مؤهل مبدئيًا / عليه موافقة مبدئية، ولذلك فقط تم طلب رسوم فتح الملف:
5 دنانير فقط

مهم جدًا:
✅ رسوم فتح الملف لا تُطلب إلا بعد ظهور التأهيل المبدئي من صفحة الإدارة.
✅ الرسوم مستردة بالكامل في حال عدم الموافقة النهائية.
✅ القسط الأول لا يُدفع الآن، ويكون بعد الاستلام حسب الاتفاق.
✅ دفع رسوم فتح الملف لا يعني الموافقة النهائية، لكنه إجراء لاستكمال الدراسة.

معلومات الدفع:
اسم المستفيد: AMEENPAY
اسم المحفظة: Orange Money
الاسم: ABDUL RAHMAN ALHARAHSHEH

بعد الدفع، ارفع وصل الدفع من هذا الرابط:
${receiptUrl(baseUrl, app)}

${BUSINESS_NAME}`;
}

function deliveryDateReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const status = app.status || "";
  const url = trackUrl(baseUrl, app);

  if (status === "approved") {
    return `أهلًا ${name} 🌿

${apologyLine()}

طلبكم عليه موافقة نهائية ✅

التحديث المعتمد الآن:
${POST_EID_DELIVERY_STRICT_TEXT}.

يعني لا يوجد تسليم قبل هذا التاريخ، وبعد 31/05/2026 يتم ترتيب التسليم حسب جدول الإدارة وأولوية الطلبات.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "customer_accepts_delivery_delay") {
    const delayText = formatJordanDateTime(app.delivery_delay_until);
    return `أهلًا ${name} 🌿

نعتذر منكم بصدق عن التأخير، وبنقدّر انتظاركم وتفهمكم.

اختياركم بالانتظار مسجل لدينا.

${delayText ? `الموعد الجديد الظاهر على الطلب:\n${delayText}` : `التحديث المعتمد للتسليم والمتابعة:\n${POST_EID_DELIVERY_STRICT_TEXT}.`}

لا يوجد أي دفع مطلوب حاليًا.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "under_review" || status === "needs_salary_slip" || status === "needs_guarantor" || status === "guarantor_submitted") {
    return `أهلًا ${name} 🌿

نعتذر منكم جدًا عن أي تأخير أو انتظار صار خلال فترة الدراسة. والله حقكم علينا يكون الموضوع أوضح وأخف عليكم.

طلبكم لسه ضمن مرحلة الدراسة والمتابعة، لذلك ما بقدر أعطي موعد استلام نهائي الآن.

التحديث المعتمد:
${POST_EID_DELIVERY_STRICT_TEXT}، لكن للطلبات التي ما زالت قيد الدراسة يعتمد الأمر أولًا على نتيجة الدراسة وما يظهر من صفحة الإدارة.

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

بالنسبة للتسليم:
${POST_EID_DELIVERY_STRICT_TEXT}.

لكن لا أقدر أحدد موعد استلام نهائي إلا إذا كان الطلب عليه موافقة نهائية من الإدارة.

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

  if (intent === "complaint") return complaintReply(baseUrl, app.phone || tracking, app, customerText);
  if (intent === "refund") return refundReply(baseUrl, app.phone || tracking, app);
  if (intent === "continue_request") {
    if (canSendPaymentInfo(app)) return paymentMessage(app, baseUrl);

    return `أهلًا ${name} 🌿

تم استلام رغبتكم بالاستمرار سابقًا أو أن الطلب انتقل لمرحلة أخرى.

حالة الطلب الحالية:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }
  if (intent === "decline_continue") {
    return `أهلًا ${name} 🌿

طلبكم ظاهر لدينا بالحالة التالية:
${statusHumanLabel(status)}

إذا رغبتكم هي إلغاء الاستمرار أو إيقاف الطلب، سيتم تحويل الرسالة للمتابعة حتى يتم تأكيدها على الطلب الصحيح.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }
  if (intent === "payment_receipt") {
    if (paymentStatus === "customer_claimed_paid") {
      return `أهلًا ${name} 🌿

وصل الدفع أو إشعار الدفع مسجل لدينا بالفعل، والطلب بانتظار تأكيد الإدارة.

يرجى عدم إعادة الدفع مرة ثانية.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
    }

    if (paymentStatus === "confirmed") {
      return `أهلًا ${name} 🌿

رسوم فتح الملف مؤكدة لدينا ✅

لا يوجد أي دفع مطلوب حاليًا، والطلب ضمن المتابعة حسب حالته الحالية.

حالة الطلب:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
    }

    return receiptUploadRequiredReply(app, baseUrl);
  }
  if (intent === "delivery") return deliveryDateReply(app, baseUrl);

  if (intent === "payment") {
    if (
      status === "preliminary_qualified" ||
      status === "customer_confirmed_continue" ||
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
    return `تمام ${name} 🌿

رسوم فتح الملف مؤكدة، وطلبكم الآن قيد الدراسة النهائية.

نعتذر منكم بصدق عن أي تأخير بالمتابعة. لا يوجد أي دفع مطلوب حاليًا.
التحديث المعتمد للمتابعة والتسليم هو بعد العيد ابتداءً من الأحد 31/05/2026، حسب ترتيب الطلبات وما يظهر من الإدارة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (
    status === "preliminary_qualified" ||
    status === "customer_confirmed_continue" ||
    paymentStatus === "pending" ||
    paymentStatus === "pending_payment" ||
    paymentStatus === "payment_info_sent"
  ) {
    return paymentMessage(app, baseUrl);
  }

  if (status === "customer_declined_continue") {
    return `أهلًا ${name} 🌿

تم تسجيل عدم رغبتكم بالاستمرار في فتح ملف الدراسة النهائية حاليًا.

لا يوجد أي دفع مطلوب على هذا الطلب، وبإمكانكم التقديم لاحقًا عند الحاجة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "salary_slip_uploaded") {
    return `أهلًا ${name} 🌿

تم استلام كشف الراتب / شهادة الراتب وربطه بطلبكم.

الطلب الآن بانتظار مراجعة الإدارة للخطوة التالية، ولا يوجد أي دفع مطلوب حاليًا إلا إذا ظهر لكم طلب رسمي من الإدارة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "first_installment_requested" || paymentStatus === "first_installment_whatsapp") {
    return `أهلًا ${name} 🌿

حسب تحديث الإدارة، يوجد خيار متعلق بدفع القسط الأول لاستكمال الإجراء.

يرجى الالتزام فقط بالتعليمات الرسمية المرسلة لكم من صفحة الإدارة أو رابط كشف الراتب / القسط الأول، وعدم إرسال أي دفعات إضافية دون تأكيد واضح.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "delivery_delay_notice_sent") {
    return `أهلًا ${name} 🌿

تم إرسال خيار التمديد أو الاسترداد على طلبكم.

تقدروا تختاروا الانتظار للموعد الجديد أو طلب استرداد رسوم فتح الملف من الرابط التالي:
${delayUrl(baseUrl, app)}

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "customer_accepts_delivery_delay") {
    const delayText = formatJordanDateTime(app.delivery_delay_until);
    return `أهلًا ${name} 🌿

اختياركم بالانتظار مسجل لدينا.

${delayText ? `الموعد الجديد المعتمد:\n${delayText}` : `المتابعة ستكون ${POST_EID_DELIVERY_TEXT} حسب ترتيب الطلبات وجدول الإدارة.`}

رسوم فتح الملف مؤكدة، ولا يوجد أي دفع مطلوب حاليًا.

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

  if (status === "needs_salary_slip") {
    return `أهلًا ${name} 🌿

طلبكم بحاجة كشف راتب أو شهادة راتب حديثة لاستكمال الدراسة.

إرسال المستند لا يعني الموافقة النهائية، لكنه مطلوب حتى تقدر الإدارة تكمل مراجعة الملف.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "needs_guarantor") {
    return `أهلًا ${name} 🌿

حسب تحديث الإدارة، طلبكم بحاجة بيانات كفيل لاستكمال دراسة الملف.

هذا لا يعني رفض الطلب، لكنه إجراء مطلوب حتى تكتمل الدراسة.

يرجى تجهيز بيانات الكفيل المطلوبة حسب تعليمات الإدارة، وسيتم متابعة الطلب بعدها.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "guarantor_submitted") {
    return `تمام ${name} 🌿

بيانات الكفيل وصلت وتم ربطها بطلبكم.

نعتذر منكم عن أي تأخير بالمتابعة. الطلب الآن بانتظار متابعة الإدارة للخطوة التالية، والتحديث المعتمد للمتابعة والتسليم هو بعد العيد ابتداءً من الأحد 31/05/2026 حسب ترتيب الطلبات.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "under_review") {
    return `أهلًا ${name} 🌿

نعتذر منكم جدًا عن أي تأخير أو انتظار. بنقدّر ثقتكم، وحقكم علينا تكون الصورة واضحة.

طلبكم قيد الدراسة النهائية حاليًا.

لا يوجد أي دفع مطلوب الآن، وسيتم التواصل معكم إذا احتجنا أي معلومة إضافية أو عند صدور التحديث من الإدارة.

التحديث المعتمد للمتابعة والتسليم:
${POST_EID_DELIVERY_STRICT_TEXT}، مع اعتماد نتيجة الدراسة وما يظهر في صفحة الإدارة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "approved") {
    return `أهلًا ${name} 🌿

نعتذر منكم بصدق عن أي تأخير أو انتظار صار على موعد التسليم. حقكم علينا يكون الكلام واضح وما نترككم بتوقعات غير مؤكدة.

طلبكم عليه موافقة نهائية ✅

التحديث المعتمد:
${POST_EID_DELIVERY_STRICT_TEXT}.

بعد هذا التاريخ يتم ترتيب التسليم حسب جدول الإدارة وأولوية الطلبات.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "rejected") {
    return `أهلًا ${name} 🌿

نعتذر، لم تتم الموافقة على الطلب حاليًا.

إذا حاب تعرف التفاصيل العامة أو إمكانية إعادة التقديم لاحقًا، يتم تحويل الموضوع للمتابعة مع الموظف المختص.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "cancelled") {
    return `أهلًا ${name} 🌿

الطلب ظاهر لدينا كطلب ملغي.

إذا كان الإلغاء بالخطأ، ابعث رقم التتبع ورقم الهاتف حتى يتم تحويله للمتابعة.

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
    .select("id, tracking_id, full_name, phone, status, payment_status, device_name, delivery_delay_until")
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
    .select("id, tracking_id, full_name, phone, status, payment_status, device_name, delivery_delay_until")
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
    .select("id, tracking_id, full_name, phone, status, payment_status, device_name, delivery_delay_until")
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

function extractOpenAiText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks: string[] = [];

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
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
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  if (!apiKey) {
    return input.deterministicReply;
  }

  const systemInstructions = `
أنت موظف/موظفة خدمة عملاء واتساب حقيقي لدى "الأمين للأقساط" في الأردن.

القاعدة الذهبية:
- افهم نية العميل أولًا.
- لا تطلب رقم التتبع إلا إذا كان السؤال عن طلب محدد أو المتابعة تحتاج ربط الطلب.
- إذا العميل غاضب أو كتب كلمات مثل: نصب، احتيال، حرامية، سرقة، كذب، مماطلة، تأخير، ما بتردو، بدي فلوسي، شكوى، محامي، شرطة، جرائم إلكترونية، حماية المستهلك، بفضحكم، بنشر عليكم: لا تجادله، لا تدافع، ولا تطلب رقم التتبع كأول جملة.
- في الرسائل الغاضبة: ابدأ باعتذار واضح ومتنوع، اعترف بحقه بالاستياء، طمّنه أن المحادثة تحولت لمتابعة حساسة، ثم اطلب رقم التتبع/الهاتف فقط إذا لم يكن الطلب معروفًا.
- لا تستخدم جملة اعتذار واحدة دائمًا. نوّع بين: "حقك علينا"، "بنعتذر بصدق"، "فاهمين غضبك"، "آسفين إن التجربة وصلت لهالشكل"، "حقك يكون عندك جواب واضح"، "رح نراجعها بدون جدال".
- لا تعترف قانونيًا بأن الشركة نصبت أو سرقت. استخدم اعتذارًا عن التجربة/التأخير/عدم الوضوح، وليس اعترافًا باتهام.
- إذا العميل هدد بشكوى أو نشر أو محامي: قل إن حقه محفوظ، وإن المحادثة سيتم رفعها للمتابعة الإدارية، واطلب البيانات لربطها بالطلب إن لم تكن موجودة.
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
- رسوم فتح الملف 5 دنانير فقط.
- لا تُذكر رسوم فتح الملف كطلب دفع إلا إذا كان الطلب مؤهلًا مبدئيًا / عليه موافقة مبدئية من صفحة الإدارة، أو إذا الرد الآمن الأساسي يذكر صراحة أن تعليمات الدفع مطلوبة.
- لا تطلب رسوم فتح الملف في الأسئلة العامة أو قبل مراجعة الطلب.
- إذا سألك العميل عن الدفع بشكل عام، وضح أن الرسوم لا تُطلب من البداية، فقط بعد التأهيل المبدئي من صفحة الإدارة.
- الرسوم مستردة بالكامل في حال عدم الموافقة النهائية.
- القسط الأول لا يُدفع الآن، بل بعد الاستلام حسب الاتفاق.
- دفع رسوم فتح الملف لا يعني الموافقة النهائية.

قواعد المواعيد:
- لا تخترع موعد تسليم.
- جميع مواعيد التسليم والمتابعة بعد العيد، ابتداءً من الأحد 31/05/2026.
- الموافق عليه نهائيًا: التسليم بعد 31/05/2026 حسب جدول الإدارة وأولوية الطلبات.
- قيد الدراسة/كفيل/كشف راتب: المتابعة بعد العيد، لكن الموعد النهائي حسب نتيجة الدراسة وصفحة الإدارة.

قواعد الحالات:
- approved فقط تعني موافقة نهائية.
- under_review ليست موافقة.
- needs_guarantor يعني بحاجة كفيل لاستكمال الدراسة وليس رفضًا.
- needs_salary_slip يعني بحاجة كشف راتب أو شهادة راتب.
- refund_requested يعني طلب استرداد مسجل دون وعد بوقت تنفيذ.
- customer_claimed_paid يعني الوصل قيد مراجعة الإدارة ولا يكرر الدفع.

استخدم "الرد الآمن الأساسي" كمصدر حقيقة، وصغه إنسانيًا دون مخالفة أو إضافة وعود.
`;

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

الرد الآمن الأساسي الذي يجب الالتزام به وعدم مخالفته:
${input.deterministicReply}
`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: systemInstructions,
        input: userInput,
        temperature: 0.75,
        max_output_tokens: 900,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI reply failed:", await response.text());
      return input.deterministicReply;
    }

    const data = await response.json();
    const aiText = extractOpenAiText(data);

    return sanitizeAiReply(aiText, input.deterministicReply);
  } catch (error) {
    console.error("OpenAI reply error:", error);
    return input.deterministicReply;
  }
}

async function buildReply(request: Request, from: string, text: string, messageType = "text") {
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
    intent === "payment_receipt" ||
    intent === "refund" ||
    intent === "complaint" ||
    intent === "continue_request" ||
    intent === "decline_continue" ||
    messageType === "image"
  ) {
    app = await findApplicationByPhone(from);
  }

  let deterministicReply: string;

  if (app) {
    if (intent === "continue_request" && canSendPaymentInfo(app)) {
      await updateApplicationWorkflowState(app, {
        status: "customer_confirmed_continue",
        payment_status: "payment_info_sent",
      });

      deterministicReply = confirmedContinueReply(app, baseUrl);

      return generateAiReply({
        customerText: text,
        deterministicReply,
        customerName: firstTwoNames(app.full_name),
        trackingId: app.tracking_id || app.id,
        status: "customer_confirmed_continue",
        paymentStatus: "payment_info_sent",
        deviceName: app.device_name || null,
        isSensitive: false,
        hasApplication: true,
        intent,
      });
    }

    if (intent === "decline_continue") {
      await updateApplicationWorkflowState(app, {
        status: "customer_declined_continue",
      });

      deterministicReply = declinedContinueReply(app);

      return generateAiReply({
        customerText: text,
        deterministicReply,
        customerName: firstTwoNames(app.full_name),
        trackingId: app.tracking_id || app.id,
        status: "customer_declined_continue",
        paymentStatus: app.payment_status || null,
        deviceName: app.device_name || null,
        isSensitive: false,
        hasApplication: true,
        intent,
      });
    }

    if (intent === "payment_receipt" || messageType === "image") {
      if (app.payment_status === "confirmed") {
        deterministicReply = safeReply(app, baseUrl, text, "payment_receipt");
      } else if (app.payment_status === "customer_claimed_paid") {
        deterministicReply = safeReply(app, baseUrl, text, "payment_receipt");
      } else {
        await updateApplicationWorkflowState(app, {
          status: "pending_payment_confirmation",
          payment_status: "customer_claimed_paid",
        });

        deterministicReply = paymentReceiptReceivedReply(app, baseUrl, messageType);
      }

      return generateAiReply({
        customerText: text,
        deterministicReply,
        customerName: firstTwoNames(app.full_name),
        trackingId: app.tracking_id || app.id,
        status: "pending_payment_confirmation",
        paymentStatus: "customer_claimed_paid",
        deviceName: app.device_name || null,
        isSensitive: false,
        hasApplication: true,
        intent: "payment_receipt",
      });
    }

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

  if (intent === "complaint") {
    deterministicReply = complaintReply(baseUrl, from, null, text);
  } else if (intent === "continue_request") {
    deterministicReply = `${humanOpening(`${from}:continue`)}

وصلتني رغبتك بالاستمرار، لكن ما قدرت أربط الرسالة بطلب واضح من رقم واتسابك.

ابعث رقم التتبع الذي يبدأ بـ AM- أو رقم الهاتف المستخدم في الطلب حتى أفتح لك تعليمات المرحلة التالية بدقة.

${BUSINESS_NAME}`;
  } else if (intent === "decline_continue") {
    deterministicReply = `${humanOpening(`${from}:decline`)}

وصلتني رغبتك بعدم الاستمرار حاليًا.

حتى يتم تسجيل ذلك على الطلب الصحيح، ابعث رقم التتبع أو رقم الهاتف المستخدم في الطلب.

${BUSINESS_NAME}`;
  } else if (intent === "payment_receipt") {
    deterministicReply = `${humanOpening(`${from}:receipt`)}

وصلني كلامك بخصوص الدفع/الوصل، لكن ما قدرت أربطه بطلب واضح من رقم واتسابك.

ابعث رقم التتبع أو رقم الهاتف المستخدم في الطلب، وإذا عندك صورة الوصل ابعثها هنا أو ارفعها من رابط الطلب الرسمي.

${BUSINESS_NAME}`;
  } else if (intent === "refund") {
    deterministicReply = refundReply(baseUrl, from, null);
  } else if (intent === "human_agent") {
    deterministicReply = `${humanOpening(`${from}:human`)}

أكيد، بقدر أحوّل طلبك للمتابعة.

اكتبلي باختصار شو المشكلة أو ابعث رقم التتبع إذا الموضوع متعلق بطلب، وأنا برتب لك الرد بطريقة واضحة.`;
  } else if (intent === "loan") {
    deterministicReply = loanReply(from);
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

إذا بدك أفحص موعد طلبك تحديدًا، ابعث رقم التتبع، وبعطيك الحالة الموجودة عندي بدون تخمين.`;
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
          if (statusMessageId) {
            await supabaseAdmin
              .from("whatsapp_messages")
              .update({
                status: statusValue || null,
                status_timestamp: statusTimestamp,
                raw_payload: statusEvent,
              })
              .eq("message_id", statusMessageId);
          }

          await logMessage({
            waId: recipientId,
            direction: "outgoing",
            body: "",
            messageId: statusMessageId || undefined,
            messageType: "status",
            status: statusValue || null,
            statusTimestamp,
            rawPayload: statusEvent,
          });
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

        const incomingIntent = classifyIntent(text);
        const incomingTracking = extractTracking(text);
        const needsHumanReview = shouldFlagHumanReview(text, incomingIntent);

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
          continue;
        }

        const reply = await buildReply(request, from, text, type);
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
      }
    }
  }

  return NextResponse.json({ ok: true });
}
