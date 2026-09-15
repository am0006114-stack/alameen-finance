import { applicationJourneyStage } from "./applicationJourney";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { currentFileOpeningPaymentRule } from "./paymentDestinationOverride";
import { normalizeArabic } from "./text";
import type { InterpretedTurn, TruthBundle } from "./types";

export type SemanticQuestionLockKind =
  | "file_opening_payment_method"
  | "office_location"
  | "product_region_spec"
  | "none";

export type SemanticQuestionLock = {
  kind: SemanticQuestionLockKind;
  hard: boolean;
  reason: string;
};

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fileOpeningPaymentMethodQuestion(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q) return false;
  const feeWord = /(?:5|٥|الخمس|الخمسه|خمسه|خمسة|رسوم\s+فتح\s+الملف|رسوم\s+المعامله|رسوم\s+المعاملة|الرسوم)/.test(q);
  const howWhere = /(?:وين|اين|أين|كيف|على\s+وين|لوين).{0,34}(?:ادفع|أدفع|دفع|احول|أحول|تحويل|حول|حوّل)|(?:ادفع|أدفع|احول|أحول|تحويل).{0,34}(?:وين|اين|أين|كيف|على\s+وين|لوين)/.test(q);
  const explicitPay = /(?:بدي|اريد|أريد|حاب|جاهز).{0,22}(?:ادفع|أدفع|احول|أحول).{0,24}(?:الرسوم|الخمس|الخمسه|5|٥)/.test(q);
  const directTransferWhere = /(?:وين|اين|أين|لوين|كيف).{0,24}(?:بنقدر|نقدر|بقدر)?\s*(?:نحول|احول|أحول|نحوّل|أحوّل)(?:ها|هم)?|(?:نحول|احول|أحول).{0,18}(?:وين|لوين|كيف)/.test(q);
  return (feeWord && howWhere) || explicitPay || directTransferWhere || (turn.topics.includes("payment_method") && /(?:ادفع|أدفع|احول|أحول|تحويل)/.test(q));
}

export function officeLocationQuestion(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q) return false;
  if (turn.topics.includes("office_location")) return true;
  const office = /(?:المكتب|مكتبكم|موقعكم|عنوانكم|الموقع|العنوان)/.test(q);
  const ask = /(?:وين|اين|أين|بدي|اعطيني|أعطيني|ارسل|أرسل|ابعث|ابعت|موقع|عنوان)/.test(q);
  const appointmentContext = /(?:موعد|رنيتوا|اتصلتوا|تواصلتوا|موعد\s+رسمي|مؤكد)/.test(q);
  return office && (ask || appointmentContext);
}

export function productRegionSpecQuestion(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q) return false;
  const region = /(?:وارد|نسخه|نسخة|شرق\s+اوسط|شرق\s+أوسط|middle\s*east|امريكي|أمريكي|اوربي|أوروبي|خليجي|ياباني|صيني)/i.test(q);
  const device = /(?:الجهاز|التلفون|الهاتف|ايفون|آيفون|iphone|سامسونج|samsung)/i.test(q);
  const questionLike = /(?:شو|ايش|إيش|هل|ولا|كيف|وارد|نسخه|نسخة|شرق\s+اوسط|شرق\s+أوسط)/i.test(q);
  return region && questionLike && (device || q.length <= 80);
}

export function resolveSemanticQuestionLock(input: { turn: InterpretedTurn; truth: TruthBundle }): SemanticQuestionLock {
  if (fileOpeningPaymentMethodQuestion(input.turn)) return { kind: "file_opening_payment_method", hard: true, reason: "direct current-turn file-opening payment-method question" };
  if (officeLocationQuestion(input.turn)) return { kind: "office_location", hard: true, reason: "direct current-turn office location/address question" };
  if (productRegionSpecQuestion(input.turn)) return { kind: "product_region_spec", hard: true, reason: "direct current-turn product market/region specification question" };
  return { kind: "none", hard: false, reason: "no semantic question lock" };
}

function fileOpeningPaymentMethodReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const fee = input.truth.policy.fileOpeningFeeJod || 5;
  const stage = applicationJourneyStage(input.truth.application);
  if (["payment_proof_pending_admin", "payment_confirmed_under_review", "approved"].includes(stage)) {
    return "ما تدفع الرسوم مرة ثانية. حسب الحالة الحالية، خطوة الدفع موجودة أصلًا على الملف؛ إذا الوصل بانتظار المراجعة انتظر الاعتماد، وإذا الدفع مؤكد فما في عليك خطوة مالية جديدة الآن.";
  }
  if (stage === "preliminary_approved_waiting_decision") {
    return `أكيد. رسوم فتح الملف ${fee} دنانير، بس بيانات التحويل ما بنفتحها قبل ما تختار الاستمرار رسميًا. إذا قرارك تكمل اكتب: أود الاستمرار، وبعدها بعطيك بيانات الدفع الرسمية ورابط رفع الوصل.`;
  }
  if (stage === "continuation_confirmed_fee_due") {
    const links = buildOfficialLinkContext(input.turn, input.truth);
    const receipt = links.relevant.receipt;
    return `أكيد. رسوم فتح الملف ${fee} دنانير. ${currentFileOpeningPaymentRule()}${receipt ? `\nبعد التحويل ارفع الوصل مرة واحدة من الرابط الرسمي المرتبط بطلبك:\n${receipt}` : ""}`;
  }
  if (["refund_requested", "refund_completed", "cancelled"].includes(stage)) {
    return `طلبك الحالي مش بمرحلة دفع رسوم فتح الملف؛ حالته الآن ${stage === "refund_completed" ? "الاسترداد مكتمل" : stage === "refund_requested" ? "الاسترداد قيد المعالجة" : "ملغي"}. ما رح أعطيك تعليمات دفع على طلب مش مفتوح للدفع.`;
  }
  return `رسوم فتح الملف ${fee} دنانير بتصير فقط بعد الموافقة المبدئية واختيار الاستمرار. لما توصل لهالمرحلة بعطيك بيانات الدفع الرسمية من نفس المحادثة، وما بنطلب تحويل قبلها.`;
}

function officeLocationReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const hasConfirmedAppointment = /(?:موعد).{0,18}(?:رسمي|مؤكد)|(?:رنيتوا|اتصلتوا|تواصلتوا).{0,28}(?:موعد)/.test(q);
  if (hasConfirmedAppointment) {
    return `${input.truth.policy.generalLocation}. طالما عندك موعد رسمي مؤكد، اعتمد تفاصيل الموعد اللي وصلتك، والحضور يكون على الموعد نفسه.`;
  }
  return `${input.truth.policy.generalLocation}. الحضور للمكتب بموعد رسمي مؤكد فقط.`;
}

function productRegionSpecReply() {
  return "إذا قصدك وارد/نسخة الجهاز وهل هي شرق أوسط أو أمريكي أو غيره: منطقة النسخة مش مثبتة عندي كحقيقة على الطلب، فما رح أخمّنها. المرجع يكون مواصفات النسخة ورقم الموديل الفعلي وقت التوريد/الاستلام قبل اعتماد هالنقطة.";
}

export function buildSemanticQuestionLockReply(input: { lock: SemanticQuestionLock; turn: InterpretedTurn; truth: TruthBundle }) {
  switch (input.lock.kind) {
    case "file_opening_payment_method": return fileOpeningPaymentMethodReply({ turn: input.turn, truth: input.truth });
    case "office_location": return officeLocationReply({ turn: input.turn, truth: input.truth });
    case "product_region_spec": return productRegionSpecReply();
    default: return null;
  }
}

export function semanticQuestionCandidateAligned(input: { lock: SemanticQuestionLock; candidate: string | null | undefined; truth: TruthBundle }) {
  if (input.lock.kind === "none") return true;
  const q = n(input.candidate);
  if (!q) return false;
  const stage = applicationJourneyStage(input.truth.application);
  switch (input.lock.kind) {
    case "file_opening_payment_method": {
      if (["payment_proof_pending_admin", "payment_confirmed_under_review", "approved"].includes(stage)) return /(?:ما\s+تدفع|لا\s+تدفع|خطوه\s+الدفع|خطوة\s+الدفع|الدفع\s+مؤكد|الوصل).{0,55}(?:مره\s+ثانيه|مرة\s+ثانية|موجود|بانتظار|مؤكد)/.test(q) && !/استرداد/.test(q);
      if (stage === "preliminary_approved_waiting_decision") return /(?:اختار|اختر|أود\s+الاستمرار|الاستمرار).{0,45}(?:بيانات\s+الدفع|التحويل|الرسوم)/.test(q) && !/استرداد/.test(q);
      if (stage === "continuation_confirmed_fee_due") return /(?:payameeen|ameen1st|am500337|0788500337|orange\s+money|cliq|كليك)/i.test(q) && !/(?:متى|وين).{0,20}(?:الاسترداد|يرجع)/.test(q);
      return /(?:رسوم\s+فتح\s+الملف|5|٥).{0,50}(?:الموافقه\s+المبدئيه|الموافقة\s+المبدئية|اختيار\s+الاستمرار|بيانات\s+الدفع)/.test(q) && !/استرداد/.test(q);
    }
    case "office_location": return /(?:عمان|عمّان).{0,30}(?:شارع\s+المدينه|شارع\s+المدينة)|(?:شارع\s+المدينه|شارع\s+المدينة)/.test(q) && !/(?:تعبئه\s+الطلب|تعبئة\s+الطلب|الخانه|الخانة|النموذج)/.test(q);
    case "product_region_spec": return /(?:وارد|نسخه|نسخة|شرق\s+اوسط|شرق\s+أوسط|امريكي|أمريكي|منطقه\s+النسخه|منطقة\s+النسخة).{0,80}(?:مش\s+مثبت|غير\s+مثبت|ما\s+عندي|ما\s+بقدر|رقم\s+الموديل|مواصفات)/.test(q) && !/(?:غير\s+الجهاز|غيّر\s+الجهاز|تغيير\s+الجهاز)/.test(q);
    default: return true;
  }
}
