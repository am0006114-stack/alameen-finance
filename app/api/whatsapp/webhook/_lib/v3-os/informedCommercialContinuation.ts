import { applicationJourneyStage } from "./applicationJourney";
import { normalizeArabic } from "./text";
import { isPaymentPriorityCustomerText } from "./operationsAutopilot";
import { currentFileOpeningPaymentRule } from "./paymentDestinationOverride";
import type { ApplicationTruth, CommercialDisclosureState, ConversationState, InterpretedTurn, TruthBundle } from "./types";

export const COMMERCIAL_DISCLOSURE_VERSION = "2026-09-informed-fee-v2-full-rationale" as const;

export function emptyCommercialDisclosure(): CommercialDisclosureState {
  return {
    version: COMMERCIAL_DISCLOSURE_VERSION,
    applicationId: null,
    trackingId: null,
    status: "not_delivered",
    deliveredAt: null,
    deliveredTurnId: null,
    acknowledgedAt: null,
    acknowledgedTurnId: null,
  };
}

function sameApplication(disclosure: CommercialDisclosureState | null | undefined, app: ApplicationTruth | null | undefined) {
  if (!disclosure || !app) return false;
  if (disclosure.applicationId && disclosure.applicationId === app.id) return true;
  if (disclosure.trackingId && app.trackingId && disclosure.trackingId === app.trackingId) return true;
  return false;
}

export function currentCommercialDisclosure(state: ConversationState, truth: TruthBundle) {
  const existing = state.commercialDisclosure || emptyCommercialDisclosure();
  if (!truth.application || !sameApplication(existing, truth.application)) return emptyCommercialDisclosure();
  // v1/partial disclosures are intentionally not enough for 7.9.0. A customer
  // must receive the full rationale version before payment destinations open.
  if (existing.version !== COMMERCIAL_DISCLOSURE_VERSION) return emptyCommercialDisclosure();
  return existing;
}

export function commercialDisclosureDelivered(state: ConversationState, truth: TruthBundle) {
  const disclosure = currentCommercialDisclosure(state, truth);
  return disclosure.status === "delivered" || disclosure.status === "acknowledged";
}

export function informedCommercialContinuationConfirmed(input: {
  state: ConversationState;
  truth: TruthBundle;
  turn: InterpretedTurn;
  customerText: string;
}) {
  const disclosure = currentCommercialDisclosure(input.state, input.truth);
  if (disclosure.status !== "delivered") return false;
  const stage = applicationJourneyStage(input.truth.application);
  if (!["preliminary_approved_waiting_decision", "continuation_confirmed_fee_due"].includes(stage)) return false;

  if (isPaymentPriorityCustomerText(input.customerText, input.turn.topics.join(","), input.state.lastAssistantText)) return true;

  const semantic = input.turn.semantic;
  if (semantic && semantic.confidence >= 0.68) {
    if (["declined", "deferred", "conditional"].includes(semantic.decision.continuation)) return false;
    if (semantic.decision.continuation === "confirmed") return true;
  }

  // This is a contextual commercial consent fallback, not a phrase router: it only
  // becomes active after the full disclosure for this exact application was sent.
  // A short affirmative then means “yes to the disclosed continuation decision”;
  // it never authorizes destructive mutations or confirms payment.
  const q = normalizeArabic(String(input.customerText || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:نعم|اه|أه|ايوه|أيوه|yes|موافق|موافقة|اوافق|أوافق|اكيد|أكيد)$/.test(q)) return true;
  const affirmativeLead = /^(?:نعم|اه|أه|ايوه|أيوه|yes)(?:\s|$)/.test(q);
  return affirmativeLead && /(?:اوافق|أوافق|موافق|موافقة|الشروط)/.test(q);
}

export function numericContinuationShortcutText(value: string | null | undefined) {
  const q = normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:1|١)$/.test(q);
}

export function preliminaryApprovalNeedsInformedDisclosure(state: ConversationState, truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  return ["preliminary_approved_waiting_decision", "continuation_confirmed_fee_due"].includes(stage)
    && !commercialDisclosureDelivered(state, truth);
}

export function markCommercialDisclosureDelivered(state: ConversationState, truth: TruthBundle, turnId: string): ConversationState {
  const app = truth.application;
  if (!app) return state;
  const stamp = new Date().toISOString();
  return {
    ...state,
    commercialDisclosure: {
      version: COMMERCIAL_DISCLOSURE_VERSION,
      applicationId: app.id,
      trackingId: app.trackingId,
      status: "delivered",
      deliveredAt: stamp,
      deliveredTurnId: turnId,
      acknowledgedAt: null,
      acknowledgedTurnId: null,
    },
    updatedAt: stamp,
  };
}

export function markCommercialDisclosureAcknowledged(state: ConversationState, truth: TruthBundle, turnId: string): ConversationState {
  const app = truth.application;
  if (!app) return state;
  const current = currentCommercialDisclosure(state, truth);
  const stamp = new Date().toISOString();
  return {
    ...state,
    commercialDisclosure: {
      version: COMMERCIAL_DISCLOSURE_VERSION,
      applicationId: app.id,
      trackingId: app.trackingId,
      status: "acknowledged",
      deliveredAt: current.deliveredAt || stamp,
      deliveredTurnId: current.deliveredTurnId || turnId,
      acknowledgedAt: stamp,
      acknowledgedTurnId: turnId,
    },
    updatedAt: stamp,
  };
}

export function shouldExplainCommercialStep(input: { state: ConversationState; truth: TruthBundle; turn: InterpretedTurn; explicitContinuationIntent: boolean; observedFullDisclosure?: boolean }) {
  // Durable state is primary, but an actually-sent full disclosure visible in the
  // canonical transcript is valid recovery evidence if state persistence lagged.
  // Never punish a payment-ready customer by repeating the disclosure after the
  // system itself already sent it.
  if (input.observedFullDisclosure) return false;
  if (!preliminaryApprovalNeedsInformedDisclosure(input.state, input.truth)) return false;
  if (input.explicitContinuationIntent) return true;
  const semantic = input.turn.semantic;
  if (!semantic || semantic.confidence < 0.62 || semantic.socialClosure) return false;
  const commercialTopics = new Set(["continuation", "payment_fee", "payment_timing", "payment_method"]);
  if (input.turn.topics.some((topic) => commercialTopics.has(topic))) return true;
  // Phase 9.1 positive-only disclosure authority: an unrelated or merely unknown
  // question can never be swallowed by the 5-JOD stage. The disclosure opens only
  // from an explicit continuation/payment signal above.
  return false;
}

export function resemblesFullCommercialDisclosure(value: string | null | undefined) {
  const q = normalizeArabic(String(value || ""));
  return /رسوم\s+فتح\s+ملف/.test(q)
    && /(?:مش|ليست).{0,20}(?:دفعه\s+اولي|دفعة\s+أولى|ثمن\s+الجهاز)/.test(q)
    && /(?:ما|لا).{0,24}(?:يعني|تعني|تضمن).{0,24}(?:موافقه|الموافقه).{0,12}(?:نهاي|نهائ)/.test(q)
    && /مسترد/.test(q)
    && /(?:حاب|بدك|تقرر).{0,30}(?:تكمل|الاستمرار)/.test(q);
}

export function resemblesPostDisclosurePaymentReply(value: string | null | undefined) {
  const q = normalizeArabic(String(value || ""));
  return /رسوم\s+فتح\s+الملف/.test(q)
    && /(?:orange\s+money|اورنج\s+موني|أورنج\s+موني)/i.test(q)
    && /(?:cliq|كليك)/i.test(q)
    && /(?:payameeen|ameen1st|am500337)/i.test(q)
    && /(?:رفع\s+الوصل|ارفع\s+الوصل|رابط\s+رفع)/.test(q);
}

export function buildInformedCommercialDisclosureReply(truth: TruthBundle) {
  const fee = truth.policy.fileOpeningFeeJod;
  const review = truth.policy.normalReviewWindow;
  return `أكيد. قبل ما نثبت الاستمرار، بوضحلك المرحلة كاملة حتى يكون قرارك على بينة. بعد الموافقة المبدئية، إذا حاب تكمل للدراسة النهائية، في رسوم فتح ملف مقدارها ${fee} دنانير. هي مش دفعة أولى، ومش جزء من سعر الجهاز أو القسط الأول، ودفعها ما يعني موافقة نهائية ولا يضمن قبول الطلب.

سبب الرسوم إن مرحلة الدراسة النهائية بتحتاج معالجة فعلية للملف، ومع وجود عدد كبير جدًا من الطلبات بنستخدم خطوة فتح الملف لتمييز العملاء الراغبين فعلًا بالاستمرار والمستعدين لإكمال الالتزامات الأساسية، حتى ما تأخر الطلبات غير الجادة ملفات العملاء الجادين. هاي الخطوة مؤشر أولي على الجدية والاستعداد للاستمرار، وليست تقييمًا نهائيًا للقدرة على السداد ولا شراءً للموافقة.

إذا صار دفع مؤكد وما صدرت الموافقة النهائية، الرسوم مستردة بالكامل عبر المسار الرسمي. وإذا قررت تلغي بعد دفع مؤكد، الرسوم إلها مسار استرداد رسمي. وبالنسبة للدراسة: ${review}، ومع ضغط المراجعات ممكن تتأخر بعض الملفات بدون ما نعطيك وعد بموعد غير موثق.

خذ قرارك براحتك؛ إذا التفاصيل مناسبة إلك وبدك تكمل، اكتب الرقم 1. وإذا بتحب تحكيها بطريقتك، أي تأكيد واضح للاستمرار بكفي. بعدها بعطيك بيانات الدفع الرسمية ورابط رفع الوصل.`;
}

export function buildPostDisclosurePaymentReply(truth: TruthBundle, receiptUrl: string | null) {
  const p = truth.policy;
  const upload = receiptUrl
    ? `\nبعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${receiptUrl}`
    : "\nرابط رفع الوصل المرتبط بالطلب غير متاح عندي الآن، لذلك ما رح أعطيك رابطًا عامًا بدل الصحيح.";
  return `تمام، هيك ثبتنا إنك حاب تكمل بعد ما وضحنا الخطوة. رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير، وهاي بيانات الدفع الرسمية:\n${currentFileOpeningPaymentRule({ includeApology: false })}${upload}\nتأكيد الدفع النهائي يتم يدويًا بعد مراجعة الوصل، والقسط الأول مش مطلوب الآن؛ يستحق بعد شهر من تاريخ توقيع العقد، وتاريخ توقيع العقد هو نفسه تاريخ استلام الجهاز.`;
}
