export type ApplicationModificationRoute = "none" | "facebook_manual";

export type ApplicationModificationRoutingInput = {
  topics?: string[] | null;
  requestedActions?: string[] | null;
  customerText?: string | null;
  hasApplication: boolean;
  paymentConfirmed: boolean;
  trackingId?: string | null;
  registeredPhone?: string | null;
};

export type ApplicationModificationRoutingDecision = {
  relevant: boolean;
  route: ApplicationModificationRoute;
  trackingId: string | null;
  registeredPhone: string | null;
};

const MODIFICATION_TOPICS = new Set(["device_change", "device_recalculation", "application_correction"]);
const MODIFICATION_ACTIONS = new Set(["change_device", "change_application_data"]);

function normalizeLoose(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function explicitManualModificationText(customerText: string) {
  const text = normalizeLoose(customerText);
  if (!text) return false;
  const targetPattern = "(?:الجهاز|الموديل|السعه|اللون|البيانات|الطلب|الاسم|العنوان|الدفعه الاولي|رقم الهاتف|الهاتف)";
  const directImperative = new RegExp(`(?:^|\\s)غير(?:لي)?\\s+${targetPattern}`).test(text);
  const changeIntent = /(?:بدي|اريد|حاب|حابه|ممكن|بدنا|لازم|حابب|حابّة)?\s*(?:اغير|بغير|نغير|غيرلي|غيره|غيرها|تغيير|عدل|تعديل|صحح|تصحيح|بدل|استبدل)/.test(text);
  const target = new RegExp(targetPattern).test(text);
  return directImperative || (changeIntent && target);
}

export function resolveApplicationModificationRoute(input: ApplicationModificationRoutingInput): ApplicationModificationRoutingDecision {
  const topics = Array.isArray(input.topics) ? input.topics : [];
  const actions = Array.isArray(input.requestedActions) ? input.requestedActions : [];
  const relevant = Boolean(input.hasApplication) && (
    topics.some((topic) => MODIFICATION_TOPICS.has(String(topic)))
    || actions.some((action) => MODIFICATION_ACTIONS.has(String(action)))
    || explicitManualModificationText(String(input.customerText || ""))
  );

  if (!relevant) {
    return { relevant: false, route: "none", trackingId: input.trackingId || null, registeredPhone: input.registeredPhone || null };
  }

  return {
    relevant: true,
    route: "facebook_manual",
    trackingId: input.trackingId || null,
    registeredPhone: input.registeredPhone || null,
  };
}

export function buildApplicationModificationRoutingReply(input: ApplicationModificationRoutingInput & {
  cancelExecuted?: boolean;
  cancelNeedsConfirmation?: boolean;
}): string | null {
  const decision = resolveApplicationModificationRoute(input);
  if (!decision.relevant) return null;

  const tracking = decision.trackingId ? `رقم الطلب: ${decision.trackingId}` : "رقم الطلب";
  const phone = decision.registeredPhone ? `رقم الهاتف المسجل: ${decision.registeredPhone}` : "رقم الهاتف المسجل على الطلب";
  return `طلب التعديل واضح. التعديلات اليدوية على الطلب — مثل الجهاز أو الموديل أو السعة أو اللون أو بيانات الطلب أو إعادة الحسبة — ما بتننفذ من واتساب. المتابعة الرسمية لهاي التعديلات تكون عبر صفحة الأمين الرسمية على فيسبوك.

ابعث للصفحة ${tracking} و${phone}، واكتب التعديل المطلوب بوضوح. واتساب ما رح يعتبر التعديل تم إلا بعد ما تتحدث بيانات الطلب فعليًا.`;
}

export function applicationModificationRoutingViolation(input: ApplicationModificationRoutingInput & { reply: string }): string | null {
  const decision = resolveApplicationModificationRoute(input);
  if (!decision.relevant) return null;
  const reply = normalizeLoose(input.reply);

  if (/(?:الغي|الغاء|إلغاء|الغيه).{0,80}(?:قدم|تقدم|طلب جديد|من جديد)|(?:قدم|تقدم).{0,80}(?:بعد|وبعد).{0,40}(?:الغاء|إلغاء)/.test(reply)) {
    return "manual_modification_wrong_cancel_reapply_route";
  }
  return null;
}
