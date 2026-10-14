import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applicationJourneyStage,
  customerFacingStatusLabel,
  firstCustomerName,
} from "../../whatsapp/webhook/_lib/v3-os/applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "../../whatsapp/webhook/_lib/v3-os/paymentTruth";

type TelegramApplicationSnapshot = {
  id: string;
  trackingId: string | null;
  fullName: string | null;
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

export type TelegramPresentationIntent = "status" | "summary" | null;

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
    /شو (?:صار|وضع) (?:ب)?(?:طلبي|الطلب)/,
    /شو (?:حاله|وضع) (?:طلبي|الطلب)/,
    /(?:وين|لوين) (?:وصل|صار) (?:طلبي|الطلب)/,
    /(?:حاله|وضع) (?:طلبي|الطلب)/,
    /(?:طلبي|الطلب) شو (?:صار|وضعه|حالته)/,
  ];
  if (statusPatterns.some((pattern) => pattern.test(t))) return "status";

  return null;
}

export async function loadTelegramApplicationSnapshot(applicationId: string | null | undefined): Promise<TelegramApplicationSnapshot | null> {
  if (!applicationId) return null;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,full_name,status,payment_status,payment_confirmed_at,device_id,device_name,device_price,installment_months,monthly_payment,preliminary_qualified_at")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id),
    trackingId: data.tracking_id || null,
    fullName: data.full_name || null,
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

export function polishTelegramReply(value: string | null | undefined) {
  let text = String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) return text;

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
