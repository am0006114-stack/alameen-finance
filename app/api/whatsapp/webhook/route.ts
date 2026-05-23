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

function paymentMessage(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const device = app.device_name || "الجهاز المطلوب";

  return `أهلًا ${name} 🌿

طلبكم مؤهل مبدئيًا لاستكمال فتح ملف الدراسة النهائية.

تفاصيل الطلب:
الجهاز: ${device}
رقم التتبع: ${tracking}

رسوم فتح الملف:
5 دنانير فقط

✅ رسوم فتح الملف مستردة بالكامل في حال عدم الموافقة.
✅ القسط الأول لا يُدفع الآن، ويكون بعد الاستلام حسب الاتفاق.

معلومات الدفع:
اسم المستفيد: AMEENPAY
اسم المحفظة: Orange Money
الاسم: ABDUL RAHMAN ALHARAHSHEH

بعد الدفع يرجى رفع وصل الدفع من الرابط التالي:
${receiptUrl(baseUrl, app)}

الأمين للأقساط`;
}

function safeReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const url = trackUrl(baseUrl, app);

  if (paymentStatus === "customer_claimed_paid") {
    return `أهلًا ${name} 🌿

تم تسجيل إشعار الدفع أو الوصل، والطلب الآن بانتظار مراجعة الإدارة.

يرجى عدم إعادة الدفع مرة أخرى، وسيتم تحديث الحالة فور التأكد.

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${url}

الأمين للأقساط`;
  }

  if (paymentStatus === "confirmed" && status === "under_review") {
    return `أهلًا ${name} 🌿

تم تأكيد رسوم فتح الملف، وطلبكم الآن قيد الدراسة النهائية.

لا يوجد أي دفع مطلوب حاليًا.

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${url}

الأمين للأقساط`;
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

تم إرسال خيار التمديد أو الاسترداد لطلبكم.

يمكنكم اختيار الانتظار حتى الموعد الجديد أو طلب استرداد رسوم فتح الملف من الرابط التالي:
${delayUrl(baseUrl, app)}

رقم التتبع:
${tracking}

الأمين للأقساط`;
  }

  if (status === "customer_accepts_delivery_delay") {
    const delayText = formatJordanDateTime(app.delivery_delay_until);
    return `أهلًا ${name} 🌿

تم تسجيل اختياركم بالانتظار.
${delayText ? `\nالموعد الجديد المعتمد هو:\n${delayText}\n` : ""}
رسوم فتح الملف مؤكدة لدينا، ولا يوجد أي دفع مطلوب حاليًا.

رابط متابعة الطلب:
${url}

الأمين للأقساط`;
  }

  if (status === "refund_requested" || paymentStatus === "refund_requested") {
    return `أهلًا ${name} 🌿

تم تسجيل طلب استرداد رسوم فتح الملف.

سيتم مراجعة بيانات التحويل وتنفيذ الاسترداد حسب ترتيب الطلبات.

رقم التتبع:
${tracking}

الأمين للأقساط`;
  }

  if (status === "refund_completed") {
    return `أهلًا ${name} 🌿

تم تنفيذ استرداد رسوم فتح الملف حسب البيانات المسجلة لدينا.

إذا كان لديك أي ملاحظة، يرجى إرسال رقم التتبع ورقم الهاتف المستخدم في الطلب.

رقم التتبع:
${tracking}

الأمين للأقساط`;
  }

  if (status === "needs_salary_slip") {
    return `أهلًا ${name} 🌿

نحتاج كشف راتب أو شهادة راتب حديثة لاستكمال دراسة الطلب.

إرسال المستند لا يعني الموافقة النهائية، وإنما لاستكمال الدراسة.

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${url}

الأمين للأقساط`;
  }

  if (status === "needs_guarantor") {
    return `أهلًا ${name} 🌿

نحتاج إدخال بيانات كفيل لاستكمال دراسة الملف.

طلب الكفيل لا يعني رفض الطلب، وإنما إجراء لاستكمال الدراسة حسب سياسة الموافقة.

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${url}

الأمين للأقساط`;
  }

  if (status === "guarantor_submitted") {
    return `أهلًا ${name} 🌿

تم استلام بيانات الكفيل وربطها بطلبكم.

الطلب الآن بانتظار متابعة الإدارة للخطوة التالية.

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${url}

الأمين للأقساط`;
  }

  if (status === "under_review") {
    return `أهلًا ${name} 🌿

طلبكم قيد الدراسة حاليًا.

سيتم التواصل معكم عند صدور التحديث أو في حال الحاجة لأي معلومات إضافية.

لا يوجد أي دفع مطلوب حاليًا.

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${url}

الأمين للأقساط`;
  }

  if (status === "approved") {
    return `أهلًا ${name} 🌿

تمت الموافقة على طلبكم.

سيتم التواصل معكم لاستكمال الإجراءات النهائية وتحديد موعد الاستلام من الإدارة.

لا يمكن للرد الآلي تحديد موعد تسليم جديد من نفسه.

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${url}

الأمين للأقساط`;
  }

  if (status === "rejected") {
    return `أهلًا ${name} 🌿

نعتذر، لم تتم الموافقة على الطلب حاليًا.

للاستفسار عن التفاصيل العامة أو إمكانية إعادة التقديم لاحقًا، يرجى متابعة الموظف المختص.

رقم التتبع:
${tracking}

الأمين للأقساط`;
  }

  if (status === "cancelled") {
    return `أهلًا ${name} 🌿

هذا الطلب ظاهر لدينا كطلب ملغي.

إذا كان الإلغاء بالخطأ، يرجى إرسال رقم التتبع ورقم الهاتف ليتم تحويله للمتابعة.

رقم التتبع:
${tracking}

الأمين للأقساط`;
  }

  return `أهلًا ${name} 🌿

طلبكم قيد المتابعة.

لا يوجد أي دفع مطلوب حاليًا إلا إذا تم تأهيل الطلب مبدئيًا وإرسال تعليمات فتح الملف لكم.

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${url}

الأمين للأقساط`;
}

function defaultAskForTracking(baseUrl: string) {
  return `أهلًا وسهلًا 🌿

معك الأمين للأقساط.

لفحص طلبكم بدقة، يرجى إرسال رقم التتبع ورقم الهاتف المستخدم في الطلب.

مثال:
AM-XXXXXXXXXX
078XXXXXXX

بسبب عدد الطلبات الكبير، التواصل الكتابي عبر واتساب أفضل وأسرع من الاتصال لتوثيق الطلب ومراجعته بدقة.

للتقديم أو المتابعة من خلال الموقع:
${baseUrl}

تنويه مهم:
الأمين للأقساط مختص بتقسيط الأجهزة الإلكترونية والهواتف فقط، ولا يقدم قروضًا نقدية أو تمويلًا شخصيًا.`;
}

function defaultGreeting(baseUrl: string) {
  return `أهلًا وسهلًا فيكم مع الأمين للأقساط 🌿

نقدم خدمة تقسيط الأجهزة الإلكترونية والهواتف فقط، ولا نقدم قروضًا نقدية أو تمويلًا شخصيًا.

لمتابعة طلب موجود، يرجى إرسال رقم التتبع ورقم الهاتف المستخدم في الطلب.

مثال:
AM-XXXXXXXXXX
078XXXXXXX

للتقديم أو متابعة الطلب من خلال الموقع:
${baseUrl}

تنبيه مهم:
الأمين للأقساط لا علاقة له بالأمين للتمويل الأصغر أو أي مؤسسة تمويل أصغر.`;
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
    "كاش",
    "تمويل شخصي",
    "الأمين للتمويل الأصغر",
    "موافقة نهائية مؤكدة بدون مراجعة",
  ];

  if (forbidden.some((word) => clean.includes(word))) {
    return fallback;
  }

  if (clean.length > 3500) {
    clean = clean.slice(0, 3400).trim();
  }

  return clean || fallback;
}

async function generateAiReply(input: AiReplyInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return input.deterministicReply;
  }

  const systemInstructions = `
أنت موظف خدمة عملاء واتساب لدى "الأمين للأقساط".

مهمتك:
- اكتب ردًا عربيًا أردنيًا مهذبًا وواضحًا ومختصرًا نسبيًا.
- اعتمد فقط على "الرد الآمن الأساسي" و"بيانات الطلب" الموجودة في المدخلات.
- لا تخترع أي معلومة غير موجودة.
- لا تغيّر حالة الطلب.
- لا تعطي وعدًا قطعيًا بموعد تسليم.
- لا تؤكد موافقة نهائية إلا إذا الرد الآمن الأساسي يقول ذلك صراحة.
- لا تطلب القسط الأول الآن.
- لا تطلب أي دفع إلا إذا الرد الآمن الأساسي يحتوي صراحة على رسوم فتح الملف 5 دنانير.
- لا تستخدم كلمة "قروض" كخدمة مقدمة. إذا سأل العميل عن القروض، وضّح أننا لا نقدم قروضًا نقدية أو تمويلًا شخصيًا.
- الاسم الصحيح للنشاط: "الأمين للأقساط".
- النشاط مختص بتقسيط الأجهزة الإلكترونية والهواتف فقط.
- يجب ذكر أن التواصل الكتابي عبر واتساب أفضل من الاتصال عند الحاجة بسبب ضغط الطلبات.
- إذا كان الاستفسار حساسًا أو شكوى، كن هادئًا وقل إن المحادثة ستحوّل للمتابعة.
- لا تعرض بيانات حساسة.
- لا تذكر أنك ذكاء اصطناعي.
- أخرج نص رسالة واتساب فقط بدون شرح وبدون JSON.
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
        temperature: 0.2,
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

async function buildReply(request: Request, from: string, text: string) {
  const baseUrl = getBaseUrl(request);
  const tracking = extractTracking(text);
  const sensitive = looksSensitive(text);

  const app = tracking
    ? await findApplicationByTrackingAndPhone(tracking, from)
    : await findApplicationByPhone(from);

  if (app) {
    let deterministicReply = safeReply(app, baseUrl);

    if (sensitive) {
      deterministicReply = `${deterministicReply}

ملاحظة:
تم تحويل المحادثة للمتابعة بسبب وجود استفسار حساس أو شكوى.`;
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

  const deterministicReply = isGreeting(text)
    ? defaultGreeting(baseUrl)
    : defaultAskForTracking(baseUrl);

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

وصلتنا رسالتكم، لكن حاليًا يمكننا معالجة الرسائل النصية والصور فقط.

يرجى إرسال رقم التتبع ورقم الهاتف المستخدم في الطلب لمتابعة الحالة.

الأمين للأقساط`;

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