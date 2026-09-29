export type ApplicationModificationRoute = "none" | "secure_device_link" | "payment_confirmation_pending" | "unpaid_cancel_reapply" | "facebook_manual";

export type ApplicationModificationRoutingInput = {
  topics?: string[] | null;
  requestedActions?: string[] | null;
  customerText?: string | null;
  hasApplication: boolean;
  paymentConfirmed: boolean;
  paymentProtected?: boolean;
  trackingId?: string | null;
  registeredPhone?: string | null;
};

export type ApplicationModificationRoutingDecision = {
  relevant: boolean;
  route: ApplicationModificationRoute;
  trackingId: string | null;
  registeredPhone: string | null;
  deviceChange: boolean;
};

const MODIFICATION_TOPICS = new Set(["device_change", "device_recalculation", "application_correction"]);
const MODIFICATION_ACTIONS = new Set(["change_device", "change_application_data"]);
const DEVICE_TOPICS = new Set(["device_change", "device_recalculation"]);

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
  const directImperative = new RegExp(`(?:^|\s)غير(?:لي)?\s+${targetPattern}`).test(text);
  const changeIntent = /(?:بدي|اريد|حاب|حابه|ممكن|بدنا|لازم|حابب|حابّة)?\s*(?:اغير|بغير|نغير|غيرلي|غيره|غيرها|تغيير|عدل|تعديل|صحح|تصحيح|بدل|استبدل)/.test(text);
  const target = new RegExp(targetPattern).test(text);
  return directImperative || (changeIntent && target);
}

function explicitDeviceModificationText(customerText: string) {
  const text = normalizeLoose(customerText);
  if (!text) return false;
  const asksChange = /(?:بدي|اريد|حاب|حابه|ممكن|بدنا|لازم|حابب|حابّة)?\s*(?:اغير|بغير|نغير|غيرلي|غيره|غيرها|تغيير|عدل|تعديل|بدل|استبدل)/.test(text);
  const target = /(?:الجهاز|التلفون|الهاتف|الموديل|السعه|اللون)/.test(text);
  return asksChange && target;
}

export function resolveApplicationModificationRoute(input: ApplicationModificationRoutingInput): ApplicationModificationRoutingDecision {
  const topics = Array.isArray(input.topics) ? input.topics : [];
  const actions = Array.isArray(input.requestedActions) ? input.requestedActions : [];
  const deviceChange = topics.some((topic) => DEVICE_TOPICS.has(String(topic)))
    || actions.some((action) => String(action) === "change_device")
    || explicitDeviceModificationText(String(input.customerText || ""));
  const relevant = Boolean(input.hasApplication) && (
    deviceChange
    || topics.some((topic) => MODIFICATION_TOPICS.has(String(topic)))
    || actions.some((action) => MODIFICATION_ACTIONS.has(String(action)))
    || explicitManualModificationText(String(input.customerText || ""))
  );

  if (!relevant) {
    return { relevant: false, route: "none", trackingId: input.trackingId || null, registeredPhone: input.registeredPhone || null, deviceChange: false };
  }

  let route: ApplicationModificationRoute = "facebook_manual";
  if (deviceChange) {
    if (input.paymentConfirmed) route = "secure_device_link";
    else if (input.paymentProtected) route = "payment_confirmation_pending";
    else route = "unpaid_cancel_reapply";
  }

  return {
    relevant: true,
    route,
    trackingId: input.trackingId || null,
    registeredPhone: input.registeredPhone || null,
    deviceChange,
  };
}

export function buildApplicationModificationRoutingReply(input: ApplicationModificationRoutingInput & {
  cancelExecuted?: boolean;
  cancelNeedsConfirmation?: boolean;
  secureDeviceLink?: string | null;
}): string | null {
  const decision = resolveApplicationModificationRoute(input);
  if (!decision.relevant) return null;

  if (decision.route === "secure_device_link") {
    if (input.secureDeviceLink) {
      return `أكيد. بما إن الدفع مؤكد إداريًا على نفس الطلب، تغيير الجهاز متاح من الرابط الرسمي الآمن:
${input.secureDeviceLink}

الرابط مؤقت ومخصص لطلبك، والتغيير ما بنعتبره تم إلا بعد ما تكمل الاختيار من الصفحة ويثبت التنفيذ بالنظام.`;
    }
    return "الدفع مؤكد إداريًا والطلب مؤهل لتغيير الجهاز، لكن تعذر توليد رابط التغيير الآمن الآن. ما رح أعتبر أي تعديل منفذ من رسالة واتساب؛ اطلب الرابط مرة ثانية بعد شوي.";
  }

  if (decision.route === "payment_confirmation_pending") {
    return "طلب تغيير الجهاز واضح. على هذا الملف في إثبات/حالة دفع بانتظار الاعتماد، لكن الدفع لسه مش مؤكد إداريًا؛ لذلك رابط تغيير الجهاز ما بنطلعه قبل تأكيد الدفع رسميًا. خليك على نفس الطلب وما تقدم طلب جديد لهسا.";
  }

  if (decision.route === "unpaid_cancel_reapply") {
    return "طلبك الحالي ما عليه دفع مؤكد ولا إثبات دفع يحميه، لذلك رابط تغيير الجهاز مش متاح له. إذا بدك جهاز مختلف، المسار الصحيح هو إلغاء الطلب الحالي بعد تأكيدك بشكل منفصل ثم تقديم طلب جديد بالمواصفات الصحيحة. ما رح ألغي الطلب من نفسي.";
  }

  const tracking = decision.trackingId ? `رقم الطلب: ${decision.trackingId}` : "رقم الطلب";
  const phone = decision.registeredPhone ? `رقم الهاتف المسجل: ${decision.registeredPhone}` : "رقم الهاتف المسجل على الطلب";
  return `طلب تعديل بيانات الطلب واضح. تعديلات البيانات غير المتعلقة بالجهاز ما زالت ما بتننفذ من واتساب. المتابعة الرسمية لهاي التعديلات تكون عبر صفحة الأمين الرسمية على فيسبوك.

ابعث للصفحة ${tracking} و${phone}، واكتب التعديل المطلوب بوضوح. واتساب ما رح يعتبر التعديل تم إلا بعد ما تتحدث بيانات الطلب فعليًا.`;
}

export function applicationModificationRoutingViolation(input: ApplicationModificationRoutingInput & { reply: string }): string | null {
  const decision = resolveApplicationModificationRoute(input);
  if (!decision.relevant) return null;
  const reply = normalizeLoose(input.reply);

  if (decision.route === "secure_device_link") {
    if (/فيسبوك|facebook/.test(reply)) return "paid_device_change_wrong_facebook_route";
    if (/(?:تم\s+تسجيل|سجلنا|حولنا|حوّلنا|ارسلنا|أرسلنا).{0,45}(?:طلب\s+التعديل|تغيير\s+الجهاز|للمراجعه|للمراجعة)/.test(reply)) {
      return "device_change_false_manual_handoff_claim";
    }
    return null;
  }

  if (decision.route === "payment_confirmation_pending" && /\/change-device\?t=|رابط\s+التغيير\s+الرسمي/.test(reply)) {
    return "device_change_link_before_authoritative_payment";
  }

  if (decision.route === "unpaid_cancel_reapply" && /\/change-device\?t=|رابط\s+التغيير\s+الرسمي/.test(reply)) {
    return "unpaid_device_change_link_forbidden";
  }

  if (decision.route === "facebook_manual" && /(?:الغي|الغاء|إلغاء|الغيه).{0,80}(?:قدم|تقدم|طلب جديد|من جديد)|(?:قدم|تقدم).{0,80}(?:بعد|وبعد).{0,40}(?:الغاء|إلغاء)/.test(reply)) {
    return "manual_modification_wrong_cancel_reapply_route";
  }
  return null;
}
