import { applicationJourneyStage } from "./applicationJourney";
import type { ApplicationTruth, CommercialDisclosureState, ConversationState, InterpretedTurn, TruthBundle } from "./types";

export const COMMERCIAL_DISCLOSURE_VERSION = "2026-09-informed-fee-v1" as const;

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
  return existing;
}

export function commercialDisclosureDelivered(state: ConversationState, truth: TruthBundle) {
  const disclosure = currentCommercialDisclosure(state, truth);
  return disclosure.status === "delivered" || disclosure.status === "acknowledged";
}

export function preliminaryApprovalNeedsInformedDisclosure(state: ConversationState, truth: TruthBundle) {
  return applicationJourneyStage(truth.application) === "preliminary_approved_waiting_decision"
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
  return `أكيد. قبل ما نثبت الاستمرار، بوضحلك الخطوة كاملة حتى يكون قرارك على بينة. بعد الموافقة المبدئية، إذا حاب تكمل للدراسة النهائية، في رسوم فتح ملف مقدارها ${fee} دنانير. هي مش دفعة أولى، ومش جزء من سعر الجهاز أو القسط الأول، ودفعها ما يعني موافقة نهائية ولا يضمن قبول الطلب.

الهدف منها تنظيم مرحلة الدراسة النهائية وقياس جدية الطلب والاستعداد المبدئي لإكمال الالتزامات المالية؛ لأن حجم الطلبات كبير جدًا، وما بنقدر ندخل كل الطلبات غير الجادة في المراجعة التفصيلية ونأخر أصحاب الطلبات الجادة. وهي مؤشر أولي فقط، وليست تقييمًا نهائيًا للقدرة الائتمانية أو قرار الموافقة.

إذا تم دفعها وبعدها قررت تلغي، بتدخل ضمن مسار الاسترداد الرسمي بعد تأكيد الدفع إداريًا. وبالنسبة للمدة: ${review}، مع احتمال تأخير بعض الملفات بسبب ضغط المراجعات الحالي.

خذ قرارك براحتك؛ إذا التفاصيل مناسبة إلك وبدك تكمل، احكيلي إنك حاب تكمل، وساعتها بعطيك بيانات الدفع الرسمية ورابط رفع الوصل.`;
}

export function buildPostDisclosurePaymentReply(truth: TruthBundle, receiptUrl: string | null) {
  const p = truth.policy;
  const upload = receiptUrl
    ? `\nبعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${receiptUrl}`
    : "\nرابط رفع الوصل المرتبط بالطلب غير متاح عندي الآن، لذلك ما رح أعطيك رابطًا عامًا بدل الصحيح.";
  return `تمام، هيك ثبتنا إنك حاب تكمل بعد ما وضحنا الخطوة. رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير، وهاي بيانات الدفع الرسمية:\n${p.paymentMethodRule}${upload}\nتأكيد الدفع النهائي يتم يدويًا بعد مراجعة الوصل، والقسط الأول مش مطلوب الآن.`;
}
