import { applicationJourneyStage } from "./applicationJourney";
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

export function shouldExplainCommercialStep(input: { state: ConversationState; truth: TruthBundle; turn: InterpretedTurn; explicitContinuationIntent: boolean }) {
  if (!preliminaryApprovalNeedsInformedDisclosure(input.state, input.truth)) return false;
  if (input.explicitContinuationIntent) return true;
  const semantic = input.turn.semantic;
  if (!semantic || semantic.confidence < 0.62 || semantic.socialClosure) return false;
  const commercialTopics = new Set(["continuation", "payment_fee", "payment_timing", "payment_method"]);
  if (input.turn.topics.some((topic) => commercialTopics.has(topic))) return true;
  const unrelatedMaterialTopics = new Set(["products", "product_price", "device_change", "device_recalculation", "office_location", "appointment", "delivery", "refund", "cancellation", "reopen", "legal", "human_request", "manager_request", "call_request", "tracking"]);
  if (input.turn.topics.some((topic) => unrelatedMaterialTopics.has(topic))) return false;
  return Boolean(semantic.currentQuestion || semantic.answerObligations.length || semantic.customerGoal);
}

export function buildInformedCommercialDisclosureReply(truth: TruthBundle) {
  const fee = truth.policy.fileOpeningFeeJod;
  const review = truth.policy.normalReviewWindow;
  return `أكيد. قبل ما نثبت الاستمرار، بوضحلك المرحلة كاملة حتى يكون قرارك على بينة. بعد الموافقة المبدئية، إذا حاب تكمل للدراسة النهائية، في رسوم فتح ملف مقدارها ${fee} دنانير. هي مش دفعة أولى، ومش جزء من سعر الجهاز أو القسط الأول، ودفعها ما يعني موافقة نهائية ولا يضمن قبول الطلب.

سبب الرسوم إن مرحلة الدراسة النهائية بتحتاج معالجة فعلية للملف، ومع وجود عدد كبير جدًا من الطلبات بنستخدم خطوة فتح الملف لتمييز العملاء الراغبين فعلًا بالاستمرار والمستعدين لإكمال الالتزامات الأساسية، حتى ما تأخر الطلبات غير الجادة ملفات العملاء الجادين. هاي الخطوة مؤشر أولي على الجدية والاستعداد للاستمرار، وليست تقييمًا نهائيًا للقدرة على السداد ولا شراءً للموافقة.

إذا صار دفع مؤكد وما صدرت الموافقة النهائية، الرسوم مستردة بالكامل عبر المسار الرسمي. وإذا قررت تلغي بعد دفع مؤكد، الرسوم إلها مسار استرداد رسمي. وبالنسبة للدراسة: ${review}، ومع ضغط المراجعات ممكن تتأخر بعض الملفات بدون ما نعطيك وعد بموعد غير موثق.

خذ قرارك براحتك؛ إذا التفاصيل مناسبة إلك وبدك تكمل، أكدلي بشكل طبيعي إنك حاب تستمر، وساعتها بعطيك بيانات الدفع الرسمية ورابط رفع الوصل.`;
}

export function buildPostDisclosurePaymentReply(truth: TruthBundle, receiptUrl: string | null) {
  const p = truth.policy;
  const upload = receiptUrl
    ? `\nبعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${receiptUrl}`
    : "\nرابط رفع الوصل المرتبط بالطلب غير متاح عندي الآن، لذلك ما رح أعطيك رابطًا عامًا بدل الصحيح.";
  return `تمام، هيك ثبتنا إنك حاب تكمل بعد ما وضحنا الخطوة. رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير، وهاي بيانات الدفع الرسمية:\n${p.paymentMethodRule}${upload}\nتأكيد الدفع النهائي يتم يدويًا بعد مراجعة الوصل، والقسط الأول مش مطلوب الآن؛ يستحق بعد شهر من تاريخ توقيع العقد، وتاريخ توقيع العقد هو نفسه تاريخ استلام الجهاز.`;
}
