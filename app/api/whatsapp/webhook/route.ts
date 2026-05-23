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
};

const POST_EID_DELIVERY_TEXT = "بعد العيد، ابتداءً من الأحد 31/05/2026";
const FILE_OPENING_FEE_TEXT = "رسوم فتح الملف 5 دنانير فقط، وهي مستردة بالكامل في حال عدم الموافقة.";
const BUSINESS_NAME = "الأمين للأقساط";

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

function digitsOnly(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeJordanPhone(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("962") && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.startsWith("7") && digits.length === 9) return `0${digits}`;
  return digits;
}

function normalizeWhatsAppToSend(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (!digits) return "";
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

const agentNames = ["سلمى", "ديما", "لين", "رنا", "نور", "تالا"];

function pickAgentName(seed: string) {
  const digits = digitsOnly(seed);
  const last = Number(digits.slice(-2) || "0");
  return agentNames[last % agentNames.length];
}

function humanOpening(from: string) {
  const agent = pickAgentName(from);
  const variants = [
    `أهلًا وسهلًا 🌿\nمعك ${agent} من الأمين للأقساط.`,
    `هلا فيك 🌿\nمعك ${agent} من فريق الأمين للأقساط.`,
    `أهلًا فيك، معك ${agent} 🌿\nخليني أساعدك.`,
    `يا هلا 🌿\nمعك ${agent} من الأمين للأقساط، أبشر.`,
    `مرحبًا 🌿\nمعك ${agent}، كيف بقدر أساعدك؟`,
  ];

  const digits = digitsOnly(from);
  const last = Number(digits.slice(-2) || "0");

  return variants[last % variants.length];
}

function looksSensitive(text: string) {
  const t = text.toLowerCase();
  return [
    "نصاب",
    "نصب",
    "احتيال",
    "شكوى",
    "محامي",
    "شرطة",
    "بدي فلوسي",
    "رجعولي",
    "رجعوا",
    "استرجاع",
    "استرداد",
    "وين جهازي",
    "تأخير",
    "تاخير",
    "راح اشتكي",
    "رح اشتكي",
    "مش راح اسكت",
    "حرام",
    "كذاب",
    "كذب",
    "نصبتو",
    "سرقتو",
    "سرقة",
    "بشتكي",
    "القضاء",
    "جرائم",
    "حماية المستهلك",
  ].some((word) => t.includes(word));
}

function isGreeting(text: string) {
  const t = text.trim().toLowerCase();
  return [
    "مرحبا",
    "هلا",
    "السلام عليكم",
    "مساء الخير",
    "صباح الخير",
    "الو",
    "اهلا",
    "أهلا",
    "هاي",
    "hi",
    "hello",
  ].includes(t);
}

function asksAboutDeliveryDate(text: string) {
  const t = text.toLowerCase();
  return [
    "موعد",
    "الاحد",
    "الأحد",
    "استلام",
    "تسليم",
    "الجهاز",
    "جهازي",
    "متى",
    "بعد العيد",
    "31/05",
    "31-05",
    "٣١",
    "وين وصل",
    "وصل",
  ].some((word) => t.includes(word));
}

function asksAboutPaymentOrFee(text: string) {
  const t = text.toLowerCase();
  return [
    "الدفع",
    "ادفع",
    "دفع",
    "خمسة",
    "5",
    "٥",
    "رسوم",
    "فتح ملف",
    "وصل",
    "ايصال",
    "إيصال",
    "كليك",
    "محفظة",
    "اورنج",
    "orange",
  ].some((word) => t.includes(word));
}

function asksAboutLoan(text: string) {
  const t = text.toLowerCase();
  return [
    "قرض",
    "قروض",
    "كاش",
    "نقدي",
    "مصاري",
    "تمويل شخصي",
    "سلفة",
    "سلفه",
  ].some((word) => t.includes(word));
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
    case "preliminary_qualified":
      return "مؤهل مبدئيًا";
    case "customer_confirmed_continue":
      return "تم تأكيد رغبتكم بالاستمرار";
    case "under_review":
      return "قيد الدراسة النهائية";
    case "approved":
      return "موافقة نهائية";
    case "rejected":
      return "غير موافق عليه حاليًا";
    case "needs_salary_slip":
      return "بانتظار كشف راتب / شهادة راتب";
    case "needs_guarantor":
      return "بانتظار بيانات كفيل";
    case "guarantor_submitted":
      return "تم استلام بيانات الكفيل";
    case "customer_accepts_delivery_delay":
      return "تم اختيار الانتظار للموعد الجديد";
    case "delivery_delay_notice_sent":
      return "بانتظار اختيار التمديد أو الاسترداد";
    case "refund_requested":
      return "طلب استرداد مسجل";
    case "refund_completed":
      return "تم تنفيذ الاسترداد";
    case "cancelled":
      return "طلب ملغي";
    default:
      return "قيد المتابعة";
  }
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

لاستكمال فتح الملف، المطلوب فقط رسوم فتح الملف:
5 دنانير

مهم جدًا:
✅ الرسوم مستردة بالكامل في حال عدم الموافقة.
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

طلبكم عليه موافقة نهائية ✅

بالنسبة لموعد الاستلام، المواعيد للأجهزة الموافق عليها نهائيًا ستكون ${POST_EID_DELIVERY_TEXT} حسب جدول التسليم وترتيب الإدارة.

ما بدي أعطيك ساعة أو موعد دقيق من عندي حتى ما أوعدك بشي غير مؤكد، لكن طلبك ظاهر لدينا كموافق عليه.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "customer_accepts_delivery_delay") {
    const delayText = formatJordanDateTime(app.delivery_delay_until);
    return `أهلًا ${name} 🌿

اختياركم بالانتظار مسجل لدينا.

${delayText ? `الموعد الجديد المعتمد الظاهر على الطلب:\n${delayText}` : `المتابعة ستكون ${POST_EID_DELIVERY_TEXT} حسب ترتيب الطلبات وجدول الإدارة.`}

لا يوجد أي دفع مطلوب حاليًا.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "under_review" || status === "needs_salary_slip" || status === "needs_guarantor" || status === "guarantor_submitted") {
    return `أهلًا ${name} 🌿

طلبكم لسه ضمن مرحلة الدراسة والمتابعة، لذلك ما بقدر أعطي موعد استلام نهائي الآن.

المتابعة بعد العيد، والموعد يعتمد على نتيجة الدراسة وما يظهر من صفحة الإدارة عند تحديث الحالة.

حالة الطلب الحالية:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  return `أهلًا ${name} 🌿

بالنسبة للموعد، لا أقدر أحدد تاريخ استلام نهائي إلا إذا كان الطلب عليه موافقة نهائية من الإدارة.

حالة طلبكم الحالية:
${statusHumanLabel(status)}

بشكل عام المتابعات ستكون بعد العيد، وما يظهر في صفحة الإدارة هو المعتمد.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
}

function safeReply(app: ApplicationRecord, baseUrl: string, customerText = "") {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const url = trackUrl(baseUrl, app);

  if (asksAboutDeliveryDate(customerText)) {
    return deliveryDateReply(app, baseUrl);
  }

  if (asksAboutPaymentOrFee(customerText)) {
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

    return `أهلًا ${name} 🌿

حاليًا لا يظهر عندي أي دفع مطلوب على طلبكم.

رسوم فتح الملف تكون 5 دنانير فقط، ولا نطلبها إلا إذا كان الطلب مؤهل مبدئيًا أو تم إرسال تعليمات الدفع لكم من الإدارة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
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

لا يوجد أي دفع مطلوب حاليًا.
المتابعة ستكون بعد العيد حسب ترتيب الطلبات وما يظهر من الإدارة.

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

الطلب الآن بانتظار متابعة الإدارة للخطوة التالية، والمتابعة ستكون بعد العيد حسب ترتيب الطلبات.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "under_review") {
    return `أهلًا ${name} 🌿

طلبكم قيد الدراسة النهائية حاليًا.

لا يوجد أي دفع مطلوب الآن، وسيتم التواصل معكم إذا احتجنا أي معلومة إضافية أو عند صدور التحديث من الإدارة.

المتابعة ستكون بعد العيد حسب ترتيب الطلبات.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "approved") {
    return `أهلًا ${name} 🌿

طلبكم عليه موافقة نهائية ✅

الاستلام والمتابعة للأجهزة الموافق عليها نهائيًا ستكون ${POST_EID_DELIVERY_TEXT} حسب جدول التسليم وترتيب الإدارة.

لا أقدر أحدد ساعة دقيقة من الرد الآلي، لكن حالة الطلب عندكم موافقة نهائية.

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

لا يوجد أي دفع مطلوب حاليًا إلا إذا تم تأهيل الطلب مبدئيًا وإرسال تعليمات رسوم فتح الملف لكم.

حالة الطلب:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
}

function defaultAskForTracking(baseUrl: string, customerText = "", from = "") {
  const opening = humanOpening(from);

  if (asksAboutLoan(customerText)) {
    return `${opening}

للتوضيح فقط: إحنا في ${BUSINESS_NAME} مختصين بتقسيط الأجهزة الإلكترونية والهواتف فقط.

ما بنقدم قروض نقدية أو تمويل شخصي.

إذا عندك طلب تقسيط جهاز، ابعثلي رقم التتبع ورقم الهاتف المستخدم بالطلب، وبفحصلك الحالة مباشرة.`;
  }

  if (asksAboutDeliveryDate(customerText)) {
    return `${opening}

حتى أعطيك جواب دقيق عن الموعد، ابعثلي رقم التتبع ورقم الهاتف المستخدم بالطلب.

بشكل عام:
- الطلبات اللي عليها موافقة نهائية متابعتها بعد العيد، ابتداءً من الأحد 31/05/2026 حسب جدول الإدارة.
- الطلبات اللي لسه قيد الدراسة أو ناقصها كفيل/كشف راتب، موعدها يعتمد على تحديث الإدارة ونتيجة الدراسة.

مثال:
AM-XXXXXXXXXX
078XXXXXXX

${BUSINESS_NAME}`;
  }

  return `${opening}

حتى أقدر أطلعلك الطلب بدقة، ابعثلي رقم التتبع ورقم الهاتف المستخدم بالطلب.

مثال:
AM-XXXXXXXXXX
078XXXXXXX

وبسبب ضغط الطلبات، المتابعة الكتابية على واتساب أفضل وأسرع من الاتصال لأنها بتضل موثقة وواضحة.

تنويه سريع:
${BUSINESS_NAME} مختص بتقسيط الأجهزة الإلكترونية والهواتف فقط، ولا يقدم قروضًا نقدية أو تمويلًا شخصيًا.`;
}

function defaultGreeting(baseUrl: string, from = "") {
  const opening = humanOpening(from);

  return `${opening}

كيف بقدر أساعدك؟

إذا بدك تتابع طلب موجود، ابعثلي رقم التتبع ورقم الهاتف المستخدم بالطلب وبفحصلك الحالة مباشرة.

مثال:
AM-XXXXXXXXXX
078XXXXXXX

وللتقديم أو المتابعة من خلال الموقع:
${baseUrl}

ملاحظة مهمة:
إحنا مختصين بتقسيط الأجهزة الإلكترونية والهواتف فقط، وما بنقدم قروض نقدية أو تمويل شخصي.`;
}

async function findApplicationByPhone(phone: string) {
  const localPhone = normalizeJordanPhone(phone);
  if (!localPhone) return null;

  const { data } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, status, payment_status, device_name, delivery_delay_until")
    .eq("phone", localPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data || null) as ApplicationRecord | null;
}

async function findApplicationByTrackingAndPhone(tracking: string, phone: string) {
  const localPhone = normalizeJordanPhone(phone);
  if (!tracking || !localPhone) return null;

  const { data } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, status, payment_status, device_name, delivery_delay_until")
    .eq("tracking_id", tracking)
    .eq("phone", localPhone)
    .maybeSingle();

  return (data || null) as ApplicationRecord | null;
}

async function sendWhatsAppText(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.GRAPH_API_VERSION || "v20.0";

  if (!token || !phoneNumberId) {
    console.error("Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
    return;
  }

  const cleanTo = normalizeWhatsAppToSend(to);
  if (!cleanTo) return;

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

  if (!response.ok) {
    console.error("WhatsApp send failed:", await response.text());
  }
}

async function logMessage(input: {
  waId: string;
  direction: "incoming" | "outgoing";
  body: string;
  customerName?: string;
  messageId?: string;
  messageType?: string;
}) {
  try {
    await supabaseAdmin.from("whatsapp_messages").insert({
      wa_id: input.waId,
      direction: input.direction,
      customer_name: input.customerName || null,
      message_id: input.messageId || null,
      message_type: input.messageType || "text",
      body: input.body,
    });
  } catch {
    // لا نوقف الرد إذا جدول النسخ الاحتياطي غير موجود
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

  if (clean.length > 2800) {
    clean = clean.slice(0, 2700).trim();
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
أنت موظف خدمة عملاء واتساب حقيقي لدى "الأمين للأقساط" في الأردن.

شخصيتك وأسلوبك:
- رد كإنسان طبيعي على واتساب، مش كنص رسمي جامد.
- استخدم لهجة أردنية مهذبة وخفيفة، بدون مبالغة.
- لا تكرر نفس الافتتاحية كل مرة، وغيّر اسم الموظف/الموظفة وطريقة الترحيب حسب الافتتاحية الموجودة في الرد الآمن.
- خليك راقٍ، واضح، ومطمئن.
- إذا العميل متضايق، ابدأ بتهدئة واحترام.
- لا تكتب ردود طويلة بلا داعي.
- استخدم إيموجي خفيف جدًا مثل 🌿 أو ✅ فقط عند الحاجة.
- لا تقول إنك ذكاء اصطناعي.
- لا تكتب JSON ولا شرح داخلي.

قواعد النشاط:
- الاسم الصحيح: "الأمين للأقساط".
- النشاط فقط تقسيط أجهزة إلكترونية وهواتف.
- لا نقدم قروضًا نقدية، ولا تمويلًا شخصيًا، ولا كاش.
- إذا سأل العميل عن قروض أو مصاري: وضح بلطف أننا لا نقدم قروضًا، فقط تقسيط أجهزة وهواتف.
- لا تذكر "الأمين للتمويل الأصغر" إلا للتوضيح إذا لزم.

قواعد الدفع:
- لا تطلب أي دفع إلا إذا الرد الآمن الأساسي يذكر صراحة رسوم فتح الملف.
- رسوم فتح الملف 5 دنانير فقط.
- الرسوم مستردة بالكامل في حال عدم الموافقة.
- القسط الأول لا يُدفع الآن، بل بعد الاستلام حسب الاتفاق.
- دفع رسوم فتح الملف لا يعني الموافقة النهائية.

قواعد المواعيد:
- لا تخترع موعد تسليم.
- للأجهزة التي عليها موافقة نهائية فقط: المتابعة/الاستلام تكون بعد العيد، ابتداءً من الأحد 31/05/2026، حسب جدول الإدارة.
- الطلبات التي ما زالت قيد الدراسة، بحاجة كفيل، بحاجة كشف راتب، أو قيد مراجعة: قل إن المتابعة بعد العيد وتعتمد على نتيجة الدراسة وما يظهر من صفحة الإدارة.
- إذا سأل عن الأحد أو موعده، اربط الإجابة بحالة الطلب فقط.

قواعد حالات الطلب:
- إذا الحالة approved فقط، يجوز قول "موافقة نهائية".
- إذا الحالة under_review أو confirmed payment تحت الدراسة، لا تقل موافقة.
- إذا الحالة needs_guarantor، اطلب بيانات الكفيل بلطف ووضح أنها لاستكمال الدراسة وليست رفضًا.
- إذا الحالة needs_salary_slip، اطلب كشف راتب أو شهادة راتب حديثة بلطف.
- إذا الحالة refund_requested، أكد تسجيل طلب الاسترداد بدون تحديد وقت تنفيذ.
- إذا الحالة customer_claimed_paid، أكد أن الوصل قيد مراجعة الإدارة واطلب عدم إعادة الدفع.
- إذا لا يوجد طلب معروف، اطلب رقم التتبع ورقم الهاتف فقط إذا لم يكونا موجودين في رسالة العميل. إذا أرسلهما العميل ولم يتم العثور على الطلب، اعتذر بلطف واطلب التأكد من الرقمين.
- التواصل الكتابي عبر واتساب أفضل من الاتصال بسبب ضغط الطلبات وتوثيق المتابعة.

طريقة استخدام الرد الآمن:
- الرد الآمن الأساسي هو مصدر الحقيقة.
- أعد صياغته بشكل بشري ولطيف، لكن لا تخالفه.
- لا تضف معلومة جديدة غير موجودة.
- لا تغير حالة الطلب.
- لا تتعهد بشيء غير موجود.
`;

  const userInput = `
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
        temperature: 0.65,
        max_output_tokens: 1000,
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

async function buildReply(request: Request, from: string, text: string) {
  const baseUrl = getBaseUrl(request);
  const tracking = extractTracking(text);
  const typedPhone = extractJordanPhoneFromText(text);
  const sensitive = looksSensitive(text);

  let app: ApplicationRecord | null = null;

  if (tracking && typedPhone) {
    app = await findApplicationByTrackingAndPhone(tracking, typedPhone);
  } else if (tracking) {
    app = await findApplicationByTrackingAndPhone(tracking, from);
  } else {
    app = await findApplicationByPhone(from);
  }

  if (app) {
    let deterministicReply = safeReply(app, baseUrl, text);

    if (sensitive) {
      deterministicReply = `${deterministicReply}

ولا يهمك، رح أرفع المحادثة للمتابعة حتى تنشاف بشكل أوضح من الإدارة.`;
    }

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
    });
  }

  if (tracking && typedPhone) {
    const opening = humanOpening(from);

    return generateAiReply({
      customerText: text,
      deterministicReply: `${opening}

فحصت رقم التتبع ورقم الهاتف اللي وصلوني، بس ما ظهر عندي طلب مطابق عليهم.

خليني أتأكد معك من البيانات:

رقم التتبع:
${tracking}

رقم الهاتف:
${typedPhone}

ممكن يكون الرقم مسجل بطريقة مختلفة أو الطلب مربوط على رقم ثاني. إذا عندك صورة الطلب أو رقم تتبع آخر ابعثه وبفحصه لك.

${BUSINESS_NAME}`,
      isSensitive: sensitive,
      hasApplication: false,
    });
  }

  const deterministicReply = isGreeting(text)
    ? defaultGreeting(baseUrl, from)
    : defaultAskForTracking(baseUrl, text, from);

  return generateAiReply({
    customerText: text,
    deterministicReply,
    isSensitive: sensitive,
    hasApplication: false,
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

        await logMessage({
          waId: from,
          direction: "incoming",
          body: text,
          customerName: contactName,
          messageId: message.id,
          messageType: type,
        });

        if (type !== "text" && type !== "image") {
          const reply = `أهلًا وسهلًا 🌿

وصلتنا رسالتكم، لكن حاليًا أقدر أتعامل مع الرسائل النصية والصور فقط.

ابعث رقم التتبع ورقم الهاتف المستخدم بالطلب، وبفحصلك الحالة.

${BUSINESS_NAME}`;

          await sendWhatsAppText(from, reply);
          await logMessage({ waId: from, direction: "outgoing", body: reply });
          continue;
        }

        const reply = await buildReply(request, from, text);
        await sendWhatsAppText(from, reply);
        await logMessage({ waId: from, direction: "outgoing", body: reply });
      }
    }
  }

  return NextResponse.json({ ok: true });
}