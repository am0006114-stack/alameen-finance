import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type HumanSemanticCareMode = "frustration" | "hope" | "plea" | "trust_loss";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function refundStage(truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  return stage === "refund_requested" || stage === "refund_completed";
}

export function humanSemanticCareMode(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): HumanSemanticCareMode | null {
  if (refundStage(input.truth)) return null; // refundHumanCare owns refund emotions.
  const q = n(input.turn.rawText);
  if (!q) return null;
  if (/(?:نصاب|نصابين|احتيال|محتال|كذاب|كذابين|ما\s+بثق|فقدت\s+الثقه|فقدت\s+الثقة)/.test(q)) return "trust_loss";
  if (/(?:يا\s+رب|ان\s+شاء\s+الله|إن\s+شاء\s+الله).{0,35}(?:تزبط|يمشي|تنقبل|تنحل|خير)|(?:متامل|متأمل|بتمنى|اتمنى|أتمنى).{0,32}(?:يمشي|تزبط|تنقبل)/.test(q)) return "hope";
  if (/(?:الله\s+يخليك|بترجاك|برجاك|معلش|تحملني|استحملني|بس\s+حاول|اذا\s+بتقدر|إذا\s+بتقدر)/.test(q)) return "plea";
  if (input.turn.sentiment === "frustrated" || input.turn.sentiment === "angry" || /(?:والله\s+لو\s+سياره|والله\s+لو\s+سيارة|مش\s+معقول|ليش\s+هيك|طولتوا|تأخرتوا|كتير\s+طولت|كثير\s+طولت|زهقت|تعبت|قرفت|كل\s+هالوقت)/.test(q)) return "frustration";
  return null;
}

function statusTruth(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return null;
  return `الحالة الفعلية لطلبك الآن: ${customerFacingStatusLabel(app)}.`;
}

function reviewBoundary(truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  if (!["preliminary_review", "preliminary_approved_waiting_decision", "continuation_confirmed_fee_due", "payment_proof_pending_admin", "payment_confirmed_under_review"].includes(stage)) return "";
  const window = truth.policy.normalReviewWindow || "من يومين لـ3 أيام عمل";
  const pressure = truth.policy.severePressureRule || "حاليًا في ضغط مراجعات شديد وقد تتأخر بعض الملفات أكثر من المعدل الطبيعي.";
  return ` المعدل الطبيعي ${window}، لكن ${pressure} وما بدي أوعدك بموعد مش مضمون.`;
}

export function buildHumanSemanticCareReply(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): string | null {
  const mode = humanSemanticCareMode(input);
  if (!mode) return null;
  const truth = statusTruth(input.truth);
  const boundary = reviewBoundary(input.truth);
  if (mode === "hope") {
    const human = "إن شاء الله خير. واضح إنك مهتم يزبط الطلب، وكون أمور الدخل والمستندات عندك مرتبة بيساعد على اكتمال الملف، بس القرار النهائي بضل حسب نتيجة الدراسة نفسها وما بدي أضمنه قبل ما يصدر.";
    return truth ? `${human}\n\n${truth}${boundary}` : human;
  }
  if (mode === "plea") {
    const human = "أكيد فاهم عليك، وما بدي أرد عليك بجملة محفوظة. بعطيك اللي ظاهر فعليًا عندي بدون وعد زيادة.";
    return truth ? `${human}\n\n${truth}${boundary}` : human;
  }
  if (mode === "trust_loss") {
    const human = "فاهم إن اللي صار خلاك تشك بالموضوع، وما رح أدخل معك بجدال. خليني أعطيك الحقيقة الحالية مباشرة وأفصل بين اللي صار فعلًا وبين أي وعد مش موثق.";
    return truth ? `${human}\n\n${truth}${boundary}` : human;
  }
  const human = "معك حق تنزعج إذا حاسس إن الموضوع أخذ وقت أكبر من المتوقع. ما بدي أقلل من انتظارك ولا أعيد نفس الكلام عليك.";
  return truth ? `${human}\n\n${truth}${boundary}` : human;
}

export function humanSemanticCareCandidateAligned(input: { candidate: string | null | undefined; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const mode = humanSemanticCareMode(input);
  if (!mode) return true;
  const q = n(input.candidate);
  if (!q) return false;
  const hasAck = /(?:فاهم|معك\s+حق|واضح\s+إنك|واضح\s+انك|إن\s+شاء\s+الله\s+خير|ان\s+شاء\s+الله\s+خير|ما\s+بدي\s+اقلّل|ما\s+بدي\s+أقلل|ما\s+رح\s+ادخل\s+معك\s+بجدال|ما\s+رح\s+أدخل\s+معك\s+بجدال)/.test(q);
  const notTrivial = !/^(?:العفو|تمام|الله\s+يعطيك\s+العافيه|الله\s+يعطيك\s+العافية|أنا\s+معك)\.?$/.test(q);
  const needsTruth = Boolean(input.truth.application);
  const hasTruth = !needsTruth || /(?:الحاله|الحالة|طلبك|الملف|الدراسه|الدراسة|الموافقه|الموافقة|قيد|ملغي|استرداد)/.test(q);
  return hasAck && notTrivial && hasTruth;
}
