import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { customerFacingStatusLabel } from "../../whatsapp/webhook/_lib/v3-os/applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "../../whatsapp/webhook/_lib/v3-os/paymentTruth";

function money(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export async function buildTelegramOrderSummary(applicationId: string | null | undefined) {
  if (!applicationId) {
    return "تم ربط محادثتك مع الأمين بنجاح.\nمن هون كمل معي بشكل طبيعي، وبكمل معك من نفس المحادثة.";
  }

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,full_name,status,payment_status,payment_confirmed_at,device_id,device_name,device_price,installment_months,monthly_payment,preliminary_qualified_at")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !data) {
    return "تم ربط محادثتك مع الأمين بنجاح.\nبيانات الطلب رح تظل مرتبطة بملفك، ومن هون كمل معي بشكل طبيعي.";
  }

  const app = {
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
  } as any;

  const firstName = String(data.full_name || "").trim().split(/\s+/).filter(Boolean)[0] || "عميلنا";
  const lines = [
    `أهلين ${firstName}، تم ربط محادثتك مع الأمين بنجاح.`,
    "",
    "ملخص طلبك:",
  ];
  if (data.tracking_id) lines.push(`رقم الطلب: ${data.tracking_id}`);
  if (data.device_name) lines.push(`الجهاز: ${data.device_name}`);
  const price = money(data.device_price);
  if (price) lines.push(`سعر الجهاز المسجل: ${price} دينار`);
  const monthly = money(data.monthly_payment);
  if (monthly && data.installment_months) lines.push(`القسط الشهري التقريبي: ${monthly} دينار لمدة ${data.installment_months} شهر`);
  else if (monthly) lines.push(`القسط الشهري التقريبي: ${monthly} دينار`);
  else if (data.installment_months) lines.push(`مدة التقسيط: ${data.installment_months} شهر`);
  lines.push(`حالة الطلب: ${customerFacingStatusLabel(app)}`);
  if (hasAuthoritativePaymentConfirmation(app)) lines.push("رسوم فتح الملف: الدفع مؤكد إداريًا");
  lines.push("", "من هون كمل معي بشكل طبيعي، وبتظل نفس معلومات طلبك وسياق المتابعة معي.");
  return lines.join("\n");
}
