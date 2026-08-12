export type FinalTruthRecoveryInput = {
  customerText: string;
  failedCheckIds: string[];
  hasApplication: boolean;
  refundActive: boolean;
  refundCompleted: boolean;
  refundEligible: boolean;
  conditionalCancellation: boolean;
};

function normalize(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalize(value)));
}

const REFUND_FAILURE_IDS = new Set([
  "refund_registration_truth",
  "refund_completion_truth",
  "refund_requires_confirmed_payment",
  "final_actual_refund_requires_confirmed_payment",
  "no_unverified_refund_mechanics",
  "refund_inquiry_must_not_start_or_confirm_refund",
]);

function hasRefundFailure(ids: string[]) {
  return ids.some((id) => REFUND_FAILURE_IDS.has(id));
}

function hasMoneyAnchor(text: string) {
  return containsAny(text, [
    "مصاري", "فلوس", "مبلغ", "المبلغ", "دينار", "دنانير", "حواله", "حوالة",
    "استرداد", "استرجاع", "رجعولي", "ترجعولي", "برجعوا لي", "برجعولي",
  ]);
}

function hasFeeRefundPolicyInquiry(text: string) {
  const feeContext = containsAny(text, [
    "رسوم", "رسوم فتح الملف", "قيمه الملف", "قيمة الملف",
    "الخمس", "الخمسه", "الخمسة", "5", "٥", "دينار", "دنانير",
  ]);
  const policyQuestion = containsAny(text, [
    "هل", "اذا", "إذا", "لو", "بترجع", "برجع", "بيرجع", "ترجعلي",
    "مسترده", "مستردة", "بتنخصم", "تنخصم", "بتنهضم", "تنهضم",
    "من اول قسط", "من أول قسط", "من القسط الاول", "من القسط الأول",
    "بستفسر", "بسال", "بسأل", "شو بصير",
  ]);
  const explicitNoRefund = containsAny(text, [
    "ما بدي استرد", "ما بدي استرجع", "بديش استرد", "بديش استرجع",
    "مش طالب استرداد", "انا بستفسر", "أنا بستفسر", "مجرد استفسار",
  ]);
  return explicitNoRefund || (feeContext && policyQuestion);
}

function hasTimingAnchor(text: string) {
  return containsAny(text, [
    "ساعه", "ساعة", "ساعات", "اليوم", "بكره", "بكرة", "غدا", "غداً",
    "متى", "خلال", "بعد", "موعد", "وقت", "دقيقه", "دقيقة", "دقائق",
  ]) || /(?:^|\s)\d{1,3}(?:\s|$)/.test(text);
}

/**
 * A last-resort reply selector for the production truth gate.
 * It intentionally uses only the current customer text, validator failures,
 * and verified application facts. It never mutates application state.
 */
export function buildFinalTruthContextRecovery(input: FinalTruthRecoveryInput): string | null {
  const text = normalize(input.customerText);
  const refundFailure = hasRefundFailure(input.failedCheckIds);
  const moneyAnchor = hasMoneyAnchor(text);
  const timingAnchor = hasTimingAnchor(text);
  const feeRefundPolicyInquiry = hasFeeRefundPolicyInquiry(text);

  if (feeRefundPolicyInquiry) {
    return "سؤالك عن الخمس دنانير هو استفسار وليس طلب استرداد. رسوم فتح الملف منفصلة عن ثمن الجهاز وعن القسط الأول، وتكون مستردة بالكامل إذا لم تتم الموافقة النهائية حسب حالة الطلب. ولا يتم احتسابها كخصم من القسط الأول.";
  }

  if (input.conditionalCancellation && moneyAnchor) {
    return "إذا سؤالك عن الإلغاء بشكل عام: مجرد السؤال ما يلغي الطلب. الاسترداد يعتمد على وجود دفع مؤكد وحالة الطلب؛ إذا ما في دفع مؤكد ما في مبلغ مسترد. وإذا كان الدفع مؤكدًا وقررت الإلغاء، تتم مراجعة الاسترداد حسب حالة الطلب بدون وعد بموعد غير مثبت.";
  }

  if (refundFailure || (moneyAnchor && timingAnchor)) {
    if (input.refundCompleted) {
      return "الاسترداد ظاهر كمكتمل حسب الحالة المسجلة على الطلب. إذا كان سؤالك عن وقت وصول المبلغ فعليًا، ما بقدر أحدد ساعة أو مدة غير مثبتة من حالة التنفيذ نفسها.";
    }
    if (input.refundActive) {
      return "طلب الاسترداد ظاهر كمسجل على الطلب، لكن ما بقدر أؤكد وصول المبلغ خلال ساعات أو مدة محددة قبل التنفيذ. أول ما يظهر تحديث فعلي على الاسترداد يتم التواصل معك، وما رح أعطيك موعد غير مؤكد.";
    }
    if (input.refundEligible) {
      return "الدفع ظاهر كمؤكد، لكن ما في استرداد نشط أقدر أبني عليه موعد وصول مبلغ حاليًا. لذلك ما بقدر أعدك بوصول المصاري خلال مدة محددة قبل تسجيل الاسترداد رسميًا حسب حالة الطلب.";
    }
    if (input.hasApplication) {
      return "فاهم إنك بتحكي عن وصول مبلغ خلال مدة محددة، لكن حالة الطلب الحالية ما فيها استرداد نشط أقدر أؤكد منه وصول مصاري أو موعد تنفيذ. ما رح أعطيك وعد بساعات أو وقت غير مثبت، وأول ما يظهر تحديث فعلي يتم التواصل معك.";
    }
    return "فاهم إنك بتحكي عن وصول مصاري خلال مدة محددة، لكن ما بقدر أؤكد وجود استرداد أو موعد وصول مبلغ بدون حالة طلب مرتبطة ومثبتة. إذا عندك طلب قائم، أرسل رقم التتبع الموجود في الرسالة الرسمية حتى تتم مراجعة الحالة الصحيحة.";
  }

  return null;
}
