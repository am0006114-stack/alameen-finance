import { currentFileOpeningPaymentRule, containsCurrentFileOpeningPaymentDestination, containsLegacyFileOpeningPaymentDestination } from "./paymentDestinationOverride";
import { paymentDisclosureDecision, type PaymentDisclosureDecision } from "./paymentEligibilityFirewall";
import { normalizeArabic } from "./text";
import type { InterpretedTurn, TruthBundle } from "./types";

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

export function paymentFailureOrDestinationProblemText(value: string | null | undefined) {
  const raw = String(value || "");
  const q = normalized(raw);
  if (!q && !raw) return false;

  const mentionsLegacyDestination = containsLegacyFileOpeningPaymentDestination(raw);
  const paymentContext = /(?:دفع|ادفع|أدفع|التحويل|تحويل|احول|أحول|حواله|حوالة|كليك|cliq|محفظه|محفظة|wallet|alias|معرف|المستفيد|اسم\s+المستفيد)/i.test(q);
  const failureContext = /(?:فشل|فاشل|ما\s+زبط|ما\s+بزبط|مش\s+زابط|مو\s+زابط|مش\s+راضي|مو\s+راضي|ما\s+رضي|رفض|مرفوض|خطا|خطأ|تعذر|error|invalid|not\s+found|unable|cannot|can'?t|مش\s+موجود|مو\s+موجود|ما\s+بطلع|ما\s+طلع|ما\s+ظهر|ما\s+بيظهر|مش\s+لاقي|مش\s+لاقى|ما\s+لقيت)/i.test(q);

  return mentionsLegacyDestination || (paymentContext && failureContext);
}

function currentUpdateIntro() {
  return "نعتذر منك عن المشكلة. صار تحديث طارئ على أسماء CliQ الخاصة بمحفظة دفع رسوم فتح الملف، فإذا كنت بتحاول تستخدم بيانات دفع انبعثتلك سابقًا تجاهلها وما تعيد المحاولة عليها.";
}

export function buildPaymentFailureRecoveryReply(input: {
  turn: InterpretedTurn;
  truth: TruthBundle;
  receiptLink?: string | null;
}) {
  const decision = paymentDisclosureDecision({
    application: input.truth.application,
    customerText: input.turn.rawText,
    explicitContinuationThisTurn: input.turn.requestedActions.includes("continue_application") || input.turn.topics.includes("continuation"),
  });

  if (decision.alreadyPaid) {
    return "تمام، الدفع مؤكد إداريًا على طلبك. لا تعيد الدفع ولا تستخدم أي بيانات تحويل جديدة؛ الملف مكمل بالمرحلة المسجلة عليه.";
  }

  if (decision.receiptPending) {
    return "وصل الدفع موجود على ملفك وبانتظار مراجعة الإدارة. لا تعيد الدفع ولا تحاول التحويل مرة ثانية بسبب أي مشكلة ظهرتلك ببيانات الدفع.";
  }

  const intro = currentUpdateIntro();

  if (decision.paymentExecutionDetailsAllowed) {
    const receipt = input.receiptLink
      ? `\n\nبعد نجاح التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${input.receiptLink}`
      : "";
    return `${intro}\n\nالبيانات المعتمدة الآن هي:\n${currentFileOpeningPaymentRule({ includeApology: false })}${receipt}\n\nإذا ظل التحويل يرفض بعد استخدام البيانات الجديدة، ابعثلي نص رسالة الخطأ اللي بتظهرلك بدون إرسال أي معلومات بنكية حساسة، وبمشي معك على نفس المشكلة.`;
  }

  return `${intro}\n\nما رح أرسل بيانات التحويل قبل ما تكون خطوة دفع رسوم فتح الملف مفتوحة فعليًا على طلبك. إذا طلبك أخذ موافقة مبدئية وكنت قررت تكمل، أكد قرار الاستمرار وبعطيك بيانات الدفع الحالية المرتبطة بالطلب.`;
}

export function paymentFailureRecoveryReplyIsCurrent(reply: string | null | undefined, decision: PaymentDisclosureDecision) {
  const text = String(reply || "");
  const q = normalized(text);
  if (!text.trim()) return false;
  if (containsLegacyFileOpeningPaymentDestination(text)) return false;

  if (decision.alreadyPaid) {
    return /(?:الدفع).{0,30}(?:مؤكد|موكد).{0,20}(?:اداري|إداري)/.test(q)
      && /(?:لا\s+تعيد|ما\s+في\s+داعي).{0,24}(?:الدفع|تحويل)/.test(q)
      && !containsCurrentFileOpeningPaymentDestination(text);
  }

  if (decision.receiptPending) {
    return /(?:الوصل|وصل\s+الدفع).{0,35}(?:موجود|بانتظار|مراجعه|مراجعة)/.test(q)
      && /(?:لا\s+تعيد|ما\s+في\s+داعي).{0,28}(?:الدفع|تحويل)/.test(q)
      && !containsCurrentFileOpeningPaymentDestination(text);
  }

  const mentionsUpdate = /(?:تحديث|تغير|تغيير).{0,35}(?:اسماء|أسماء|بيانات).{0,35}(?:كليك|cliq|المحفظه|المحفظة|الدفع)|(?:اسماء|أسماء|بيانات).{0,35}(?:كليك|cliq|المحفظه|المحفظة).{0,35}(?:تغير|تحديث|تغيير)/i.test(q);

  if (decision.paymentExecutionDetailsAllowed) {
    return mentionsUpdate && containsCurrentFileOpeningPaymentDestination(text);
  }

  return mentionsUpdate && !containsCurrentFileOpeningPaymentDestination(text);
}
