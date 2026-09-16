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

function usefulNextStep(truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  if (stage === "preliminary_review") return "من جهتك ما في خطوة إضافية هسا؛ أول شي منتظره هو نتيجة المراجعة المبدئية.";
  if (stage === "preliminary_approved_waiting_decision") return "إذا قرارك تكمل، الخطوة العملية الوحيدة هي تأكيد الاستمرار؛ بعدها بتنفتح خطوة رسوم فتح الملف حسب المسار الرسمي.";
  if (stage === "continuation_confirmed_fee_due") return "الخطوة الحالية هي رسوم فتح الملف عبر بيانات الدفع الرسمية ثم رفع الوصل من الرابط الرسمي؛ ما في داعي تعمل أي خطوة ثانية خارج هالمسار.";
  if (stage === "payment_proof_pending_admin") return "الوصل موجود؛ لا تعيد الدفع ولا ترفع وصل ثاني. اللي ننتظره الآن اعتماد الإدارة.";
  if (stage === "payment_confirmed_under_review") return "الدفع مؤكد، وما في عليك شي إضافي الآن؛ اللي ننتظره هو قرار الدراسة النهائية.";
  if (stage === "approved") return "القرار صار موافقة حسب الحالة الحالية؛ أي حضور أو استلام يكون فقط لما يوصلك موعد رسمي مؤكد.";
  if (stage === "cancelled") return "الطلب ملغي حسب الحالة الحالية، وما رح أفتح عليك خطوة جديدة إلا إذا طلبت شي واضح ومسموح على نفس الحالة.";
  return "إذا في خطوة مطلوبة منك فعلًا بحكيلك إياها مباشرة؛ غير هيك ما رح أخليك تعيد إجراءات بدون داعي.";
}

export function humanSemanticAcknowledgement(mode: HumanSemanticCareMode) {
  if (mode === "hope") return "إن شاء الله خير. فاهم عليك، ولما الواحد يكون مرتب أموره طبيعي يتعلق بالنتيجة ويتمنى تمشي.";
  if (mode === "plea") return "أكيد، وأنا ماسك نقطتك. ما بدي أجاوبك بجملة محفوظة ولا أخليك تلف بنفس السؤال.";
  if (mode === "trust_loss") return "فاهم ليش الثقة اهتزت عندك، وما رح أحاول أغطي على هالشي بكلام إنشائي. خليني أفصل لك اللي مثبت فعليًا عن اللي ما بقدر أوعدك فيه.";
  return "معك حق تتضايق إذا حاسس إنك عم تستنى أكثر من اللازم أو عم تسمع نفس الحالة بدون نتيجة جديدة. خليني أعطيك المفيد مباشرة.";
}

export function buildHumanSemanticCareReply(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): string | null {
  const mode = humanSemanticCareMode(input);
  if (!mode) return null;
  const ack = humanSemanticAcknowledgement(mode);
  const truth = statusTruth(input.truth);
  const boundary = reviewBoundary(input.truth);
  const next = usefulNextStep(input.truth);
  if (!truth) return `${ack}\n\n${next}`;
  return `${ack}\n\n${truth}${boundary}\n\n${next}`;
}


export function composeHumanSemanticCareAroundAnswer(input: { answer: string | null | undefined; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const answer = String(input.answer || "").trim();
  if (!answer) return answer;
  const mode = humanSemanticCareMode(input);
  if (!mode) return answer;
  const q = n(answer);
  const alreadyAcknowledges = /(?:فاهم|معك\s+حق|واضح\s+إنك|واضح\s+انك|إن\s+شاء\s+الله\s+خير|ان\s+شاء\s+الله\s+خير|الثقه\s+اهتزت|الثقة\s+اهتزت|ما\s+رح\s+الف|ما\s+رح\s+ألف)/.test(q);
  if (alreadyAcknowledges) return answer;
  return `${humanSemanticAcknowledgement(mode)}\n\n${answer}`;
}

export function humanSemanticCareCandidateAligned(input: { candidate: string | null | undefined; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const mode = humanSemanticCareMode(input);
  if (!mode) return true;
  const q = n(input.candidate);
  if (!q) return false;
  const hasAck = /(?:فاهم|معك\s+حق|واضح\s+إنك|واضح\s+انك|يا\s+رب|ما\s+رح\s+احاول|ما\s+رح\s+أحاول|ما\s+بدي\s+اجاوبك\s+بجمله|ما\s+بدي\s+أجاوبك\s+بجملة|الثقه\s+اهتزت|الثقة\s+اهتزت)/.test(q);
  const notTrivial = !/^(?:العفو|تمام|الله\s+يعطيك\s+العافيه|الله\s+يعطيك\s+العافية|أنا\s+معك)\.?$/.test(q);
  const needsTruth = Boolean(input.truth.application);
  const hasTruth = !needsTruth || /(?:الحاله|الحالة|طلبك|الملف|الدراسه|الدراسة|الموافقه|الموافقة|قيد|ملغي|استرداد|الدفع)/.test(q);
  const hasUtility = /(?:ما\s+في\s+عليك|الخطوه\s+الحاليه|الخطوة\s+الحالية|اللي\s+ننتظره|لا\s+تعيد|ما\s+تعيد|إذا\s+قرارك|اذا\s+قرارك|موعد\s+رسمي|خطوه\s+اضافيه|خطوة\s+إضافية|خطوة\s+اضافية|رسوم\s+فتح\s+الملف)/.test(q);
  return hasAck && notTrivial && hasTruth && hasUtility;
}
