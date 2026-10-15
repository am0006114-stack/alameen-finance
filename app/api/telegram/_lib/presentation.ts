import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applicationJourneyStage,
  customerFacingStatusLabel,
  firstCustomerName,
} from "../../whatsapp/webhook/_lib/v3-os/applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "../../whatsapp/webhook/_lib/v3-os/paymentTruth";
import { fileOpeningPaymentWriterTruth } from "../../whatsapp/webhook/_lib/v3-os/paymentDestinationOverride";

type TelegramApplicationSnapshot = {
  id: string;
  trackingId: string | null;
  fullName: string | null;
  phone: string | null;
  status: string | null;
  paymentStatus: string | null;
  paymentConfirmedAt: string | null;
  deviceId: string | null;
  deviceName: string | null;
  devicePrice: number | null;
  installmentMonths: number | null;
  monthlyPayment: number | null;
  preliminaryQualifiedAt: string | null;
};

export type TelegramPresentationIntent = "status" | "summary" | "payment" | null;

function normalizeArabic(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

export function telegramPresentationIntent(text: string | null | undefined): TelegramPresentationIntent {
  const t = normalizeArabic(text);
  if (!t) return null;

  const summaryPatterns = [
    /ملخص (?:طلبي|الطلب)/,
    /تفاصيل (?:طلبي|الطلب)/,
    /اعطيني (?:ملخص|تفاصيل) (?:طلبي|الطلب)/,
    /ورجيني (?:ملخص|تفاصيل) (?:طلبي|الطلب)/,
  ];
  if (summaryPatterns.some((pattern) => pattern.test(t))) return "summary";

  const statusPatterns = [
    /شو (?:صار|وضع) (?:ب)?(?:طلبي|الطلب|طلب)/,
    /شو (?:حاله|وضع) (?:طلبي|الطلب|طلب)/,
    /(?:وين|لوين) (?:وصل|صار) (?:طلبي|الطلب|طلب)/,
    /(?:حاله|وضع) (?:طلبي|الطلب|طلب)/,
    /(?:طلبي|الطلب|طلب) شو (?:صار|وضعه|حالته)/,
    /(?:متي|امتي).*?(?:موافقه|نتيجه|حاله).*?(?:طلبي|الطلب|طلب)?/,
    /قديش .*?(?:وقت|بدو وقت)/,
    /(?:صارلي|صرلي) .*?(?:مقدم|منتظر|مستني)/,
    /هل .*?(?:الغيت|انلغى|انلغي|ملغي).*?(?:طلبي|الطلب|طلب)/,
    /(?:طلبي|الطلب|طلب).*?(?:ملغي|انلغى|انلغي)/,
    /شو الحل .*?(?:النتيجه|الموافقه|الطلب|طلب)/,
    /شو صار .*?(?:استرداد|استرجاع|المبلغ)/,
    /(?:حاله|وضع) .*?(?:الاسترداد|الاسترجاع|استرداد|استرجاع)/,
    /وين وصل .*?(?:الاسترداد|الاسترجاع|استرداد|استرجاع)/,
  ];
  if (statusPatterns.some((pattern) => pattern.test(t))) return "status";

  const paymentPatterns = [
    /كيف (?:ا)?دفع/,
    /كيف (?:ا)?حول/,
    /طريقه الدفع/,
    /طرق الدفع/,
    /وين (?:ا)?دفع/,
    /وين (?:ا)?حول/,
    /بيانات الدفع/,
    /معلومات الدفع/,
    /رقم (?:اورنج|orange)/,
    /(?:cliq|كليك)/,
  ];
  if (paymentPatterns.some((pattern) => pattern.test(t))) return "payment";

  return null;
}

export async function loadTelegramApplicationSnapshot(applicationId: string | null | undefined): Promise<TelegramApplicationSnapshot | null> {
  if (!applicationId) return null;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,full_name,phone,status,payment_status,payment_confirmed_at,device_id,device_name,device_price,installment_months,monthly_payment,preliminary_qualified_at")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id),
    trackingId: data.tracking_id || null,
    fullName: data.full_name || null,
    phone: data.phone || null,
    status: data.status || null,
    paymentStatus: data.payment_status || null,
    paymentConfirmedAt: data.payment_confirmed_at || null,
    deviceId: data.device_id || null,
    deviceName: data.device_name || null,
    devicePrice: data.device_price == null ? null : Number(data.device_price),
    installmentMonths: data.installment_months == null ? null : Number(data.installment_months),
    monthlyPayment: data.monthly_payment == null ? null : Number(data.monthly_payment),
    preliminaryQualifiedAt: data.preliminary_qualified_at || null,
  };
}

export function telegramMoney(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function splitTelegramDevice(deviceName: string | null | undefined) {
  const raw = String(deviceName || "").trim();
  if (!raw) return { device: null, color: null };
  const match = raw.match(/^(.*?)\s*-\s*اللون المطلوب:\s*(.+)$/i);
  if (!match) return { device: raw, color: null };
  return {
    device: String(match[1] || "").trim() || raw,
    color: String(match[2] || "").trim() || null,
  };
}

export function telegramNextStep(app: TelegramApplicationSnapshot | null | undefined) {
  const stage = applicationJourneyStage(app as any);
  switch (stage) {
    case "preliminary_review":
      return "طلبك قيد المراجعة المبدئية، وما في إجراء مطلوب منك حاليًا.";
    case "preliminary_approved_waiting_decision":
      return "عندك موافقة مبدئية. إذا حاب تكمل احكيلي إنك حاب تستمر وبكمل معك الخطوة التالية.";
    case "continuation_confirmed_fee_due":
      return "رسوم فتح الملف 5 دنانير فقط. إذا بدك طريقة الدفع احكيلي «كيف أدفع؟».";
    case "payment_proof_pending_admin":
      return "إثبات الدفع بانتظار مراجعة الإدارة. ما في داعي تعيد إرسال الحوالة إلا إذا طلبنا منك.";
    case "payment_confirmed_under_review":
      return "الدفع مؤكد إداريًا وطلبك قيد الدراسة النهائية.";
    case "needs_identity":
      return "الخطوة الحالية هي استكمال الهوية المطلوبة على الطلب.";
    case "needs_salary_slip":
      return "الخطوة الحالية هي استكمال كشف أو شهادة الراتب المطلوبة.";
    case "needs_guarantor":
      return "الخطوة الحالية هي استكمال بيانات الكفيل المطلوبة.";
    case "approved":
      return "طلبك موافق عليه. بكمل معك حسب خطوة العقد أو التسليم المسجلة على الطلب.";
    case "cancelled":
      return "الطلب متوقف حاليًا، وما رح أعتبره مستمر بدون تحديث رسمي على حالته.";
    case "refund_requested":
      return "الاسترداد قيد المعالجة حاليًا.";
    case "refund_completed":
      return "تم تسجيل الاسترداد كمكتمل.";
    default:
      return "طلبك قيد المتابعة، وبعطيك أي خطوة جديدة فقط لما تكون مثبتة على النظام.";
  }
}

export async function buildTelegramStatusReply(applicationId: string | null | undefined) {
  const app = await loadTelegramApplicationSnapshot(applicationId);
  if (!app) return null;

  const firstName = firstCustomerName(app as any) || "عميلنا";
  const { device } = splitTelegramDevice(app.deviceName);
  const lines = [
    `أهلين ${firstName} 🌟`,
    "",
    "📌 وضع طلبك الحالي:",
    `${customerFacingStatusLabel(app as any)}.`,
  ];

  if (device || app.trackingId) {
    lines.push("", "📱 الطلب:");
    if (device) lines.push(device);
    if (app.trackingId) lines.push(`🔖 رقم الطلب: ${app.trackingId}`);
  }

  lines.push("", "✅ الخطوة التالية:", telegramNextStep(app));
  return lines.join("\n");
}

export async function buildTelegramPaymentReply(applicationId: string | null | undefined) {
  const app = await loadTelegramApplicationSnapshot(applicationId);
  if (!app) return null;

  const stage = applicationJourneyStage(app as any);
  const firstName = firstCustomerName(app as any) || "عميلنا";

  if (stage === "preliminary_review") {
    return `أهلين ${firstName} 🌟\n\nرسوم فتح الملف ما بتنطلب قبل الموافقة المبدئية. طلبك حاليًا قيد المراجعة، وما في دفع مطلوب منك هسا.`;
  }

  if (stage === "preliminary_approved_waiting_decision") {
    return `أهلين ${firstName} 🌟\n\nعندك موافقة مبدئية ✅\nرسوم فتح الملف بتنطلب فقط بعد ما تأكد إنك حاب تستمر بالطلب. إذا حاب تكمل احكيلي «بدي أكمل».`;
  }

  if (stage === "payment_proof_pending_admin") {
    return `أهلين ${firstName} 🌟\n\n✅ وصل الدفع مسجل على طلبك وبانتظار مراجعة الإدارة.\nما في داعي تدفع مرة ثانية أو تعيد إرسال الحوالة إلا إذا طلبنا منك.`;
  }

  if (hasAuthoritativePaymentConfirmation(app as any)) {
    return `أهلين ${firstName} 🌟\n\n✅ رسوم فتح الملف مؤكدة إداريًا على طلبك.\nما في أي دفع إضافي مطلوب منك حاليًا، والقسط الأول مش مطلوب الآن.`;
  }

  if (stage !== "continuation_confirmed_fee_due") {
    return `أهلين ${firstName} 🌟\n\n📌 وضع الدفع على طلبك: ${customerFacingStatusLabel(app as any)}.\nما رح أعطيك بيانات دفع إلا لما تكون خطوة رسوم فتح الملف مستحقة فعليًا على طلبك.`;
  }

  const payment = fileOpeningPaymentWriterTruth();
  const lines = [
    `أكيد ${firstName} 👍`,
    "",
    "💳 طرق الدفع المعتمدة لرسوم فتح الملف (5 دنانير فقط):",
    "",
    `🟠 ${payment.channels.orangeMoney.label}:`,
    payment.channels.orangeMoney.phone,
    "",
    `💳 ${payment.channels.cliq.label}:`,
    ...payment.channels.cliq.aliases.map((alias) => `- ${alias}`),
    "",
    `👤 اسم المستفيد: ${payment.beneficiaryName}`,
    "",
    "⚠️ قبل تأكيد الحوالة تأكد إن اسم المستفيد ظاهر بنفس الاسم.",
  ];

  if (app.trackingId && app.phone) {
    lines.push(
      "",
      "📎 بعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:",
      `https://www.ameenfinance.co/receipt?tracking=${encodeURIComponent(app.trackingId)}&phone=${encodeURIComponent(app.phone)}`,
    );
  }

  lines.push(
    "",
    "✅ تأكيد الدفع النهائي يتم بعد مراجعة الوصل، والقسط الأول مش مطلوب الآن.",
  );

  return lines.join("\n");
}

export function polishTelegramReply(value: string | null | undefined) {
  let text = String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) return text;

  const channelContradiction = [
    /واتساب هو القناة الرسمية الوحيدة/i,
    /(?:telegram|تيليغرام|تليغرام|تلغرام|تلجرام)\s+(?:مش|ليس)\s+قناة\s+معتمدة/i,
    /خلي(?:كي|ك)?\s+على\s+واتساب/i,
    /ما\s+ترجع(?:ي)?\s+تبع(?:ت|تي).*?(?:telegram|تيليغرام|تليغرام|تلغرام|تلجرام)/i,
  ].some((pattern) => pattern.test(text));

  if (channelContradiction) {
    return [
      "أنت الآن على Telegram المرتبط بنفس طلبك ✅",
      "",
      "واتساب بيظل للتنبيهات والمتابعة الأساسية، والمتابعة التفصيلية بتكمل هون على Telegram.",
      "ما تحتاج ترجع لواتساب حتى نكمل نفس الطلب.",
    ].join("\n");
  }

  text = text.replace(/من رسالة واتساب/gi, "من رسالة المحادثة");

  const replacements: Array<[RegExp, string]> = [
    [/^Orange Money:\s*$/gim, "💳 Orange Money:"],
    [/^CliQ:\s*$/gim, "💳 CliQ:"],
    [/^اسم المستفيد:\s*/gim, "👤 اسم المستفيد: "],
    [/^رقم الطلب:\s*/gim, "🔖 رقم الطلب: "],
    [/^الجهاز:\s*/gim, "📱 الجهاز: "],
    [/^حالة الطلب:\s*/gim, "📌 حالة الطلب: "],
    [/^الخطوة التالية:\s*/gim, "✅ الخطوة التالية: "],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);

  if (/^تمام[،,]\s*/.test(text)) text = text.replace(/^تمام[،,]\s*/, "تمام 👍\n\n");
  return text;
}
