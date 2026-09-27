export type ApplicationModificationRoute = "none" | "cancel_reapply_unpaid" | "facebook_manual_paid";

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
    route: input.paymentConfirmed ? "facebook_manual_paid" : "cancel_reapply_unpaid",
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

  if (decision.route === "facebook_manual_paid") {
    const tracking = decision.trackingId ? `رقم الطلب: ${decision.trackingId}` : "رقم الطلب";
    const phone = decision.registeredPhone ? `رقم الهاتف المسجل: ${decision.registeredPhone}` : "رقم الهاتف المسجل على الطلب";
    return `أكيد. بما إن الدفع على طلبك مؤكد، ما بننصح بإلغاء الطلب وإعادة التقديم عشان التعديل. أي تعديل يدوي على الطلب — مثل الجهاز أو الموديل أو السعة أو اللون أو البيانات — يتم عبر صفحة الأمين الرسمية على فيسبوك.\n\nابعث للصفحة ${tracking} و${phone}، واكتب التعديل المطلوب بوضوح. واتساب ما بنعتبر التعديل منفذ من خلاله، والتغيير ما بنعتبره تم إلا بعد ما يتحدث الطلب فعليًا.`;
  }

  if (input.cancelExecuted) {
    return "بما إن الطلب غير مدفوع وتم إلغاؤه فعليًا، تقدر الآن تقدم طلب جديد بالمواصفات الصحيحة من المسار الرسمي.";
  }

  if (input.cancelNeedsConfirmation) {
    return "بما إن الطلب غير مدفوع، الأنسب للتعديل هو إلغاء الطلب الحالي ثم تقديم طلب جديد بالمواصفات الصحيحة. إذا قرارك نهائي، أكد إلغاء الطلب الحالي بشكل صريح، وبعد تنفيذ الإلغاء فعليًا بتقدر تقدم الطلب الجديد.";
  }

  return "بما إن الطلب غير مدفوع، الأنسب إذا بدك تغيّر الجهاز أو الموديل أو السعة أو اللون أو بيانات الطلب هو إلغاء الطلب الحالي ثم تقديم طلب جديد بالمواصفات الصحيحة. الإلغاء ما بنعتبره تم إلا بعد تأكيدك وتنفيذه فعليًا.";
}

export function applicationModificationRoutingViolation(input: ApplicationModificationRoutingInput & { reply: string }): string | null {
  const decision = resolveApplicationModificationRoute(input);
  if (!decision.relevant) return null;
  const reply = normalizeLoose(input.reply);

  // The deterministic builder owns route completeness. This validator is a contradiction guard,
  // not a second writer. A cautious/neutral legacy-safe answer is still valid so older Truth
  // Integrity regressions remain compatible; customer-facing modification turns are replaced by
  // buildApplicationModificationRoutingReply before validation.
  if (decision.route === "facebook_manual_paid") {
    if (/(?:الغي|الغاء|إلغاء|الغيه).{0,80}(?:قدم|تقدم|طلب جديد|من جديد)|(?:قدم|تقدم).{0,80}(?:بعد|وبعد).{0,40}(?:الغاء|إلغاء)/.test(reply)) {
      return "paid_modification_wrong_cancel_reapply_route";
    }
    return null;
  }

  if (/(?:فيسبوك|فيس بوك|facebook)/.test(reply)) return "unpaid_modification_wrong_facebook_route";
  return null;
}
