import { customerFacingStatusLabel } from "../../whatsapp/webhook/_lib/v3-os/applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "../../whatsapp/webhook/_lib/v3-os/paymentTruth";
import {
  loadTelegramApplicationSnapshot,
  splitTelegramDevice,
  telegramMoney,
  telegramNextStep,
} from "./presentation";

export async function buildTelegramOrderSummary(applicationId: string | null | undefined) {
  if (!applicationId) {
    return "تم ربط محادثتك مع الأمين بنجاح ✅\n\nمم هون كمل معي بشكل طبيعي، وبكمل معك مم نفس المحادثة.";
  }

  const app = await loadTelegramApplicationSnapshot(applicationId);
  if (!app) {
    return "تم ربط محادثتك مع الأميم بنجاح ✅\n\nبيانات الطلب رح تظل مرتبطة بملفك، ومم هون كمل معي بشكل طبيعي.";
  }

  const firstName = String(app.fullName || "").trim().split(/\s+/).filter(Boolean)[0] || "عميلنا";
  const { device, color } = splitTelegramDevice(app.deviceName);
  const price = telegramMoney(app.devicePrice);
  const monthly = telegramMoney(app.monthlyPayment);

  const lines = [
    `أهلين ${firstName} 🌟`,
    "تم ربط محادثتك مع الأمين بنجاح ✅",
    "",
    "🌟 ملخص طلبك",
  ];

  if (device) lines.push("", "📱 الجهاز:", device);
  if (color) lines.push("", "🎨 اللون:", color);
  if (price) lines.push("", "💰 السعر:", `${price} دينار`);

  if (monthly && app.installmentMonths) {
    lines.push("", "📆 التقسيط:", `${monthly} دينار × ${app.installmentMonths} شهر`);
  } else if (monthly) {
    lines.push("", "📆 القسط الشهري التقريبي:", `${monthly} دينار`);
  } else if (app.installmentMonths) {
    lines.push("", "📆 مدة التقسيط:", `${app.installmentMonths} شهر`);
  }

  lines.push("", "📌 حالة الطلب:", customerFacingStatusLabel(app as any));
  if (app.trackingId) lines.push("", "🔖 رقم الطلب:", app.trackingId);
  if (hasAuthoritativePaymentConfirmation(app as any)) lines.push("", "💳 رسوم فتح الملف:", "الدفع مؤكد إداريًا");
  lines.push("", "✅ الخطوة التالية:", telegramNextStep(app));
  lines.push("", "من هون كمل معي بشكل طبيعي، وبتظل نفس معلومات طلبك وسياق المتابعة معي 👍");

  return lines.join("\n");
}
