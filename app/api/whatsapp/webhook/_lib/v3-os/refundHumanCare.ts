import { applicationJourneyStage } from "./applicationJourney";
import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type RefundHumanCareMode =
  | "timing"
  | "long_delay"
  | "solution_request"
  | "repeat_demand"
  | "distress"
  | "accusation"
  | "status_followup";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function refundStage(truth: TruthBundle) {
  return applicationJourneyStage(truth.application);
}

function asksRefundMoneyOrTiming(q: string) {
  const money = /(?:الاسترداد|استرداد|المبلغ|المصاري|مصاري|الرسوم|الخمس|الخمسه|5|٥)/.test(q);
  const timing = /(?:متى|امتى|قديش|كم\s+وقت|كم\s+تحتاج|وين|وينها|وينهم|اين|أين|لحد\s+متى|الى\s+متى|إلى\s+متى)/.test(q);
  return money && timing;
}

function asksForSolution(q: string) {
  return /(?:شو\s+الحل|طيب\s+والحل|وين\s+الحل|كيف\s+ممكن\s+حل|كيف\s+نحل|حل\s+مشكلتي|حل\s+لمشكلتي|بدي\s+حل|اريد\s+حل|أريد\s+حل|شو\s+اعمل|شو\s+أعمل)/.test(q);
}

function repeatedRefundDemand(q: string) {
  return /(?:رجعوا|رجعو|رجعولي|رجعلي|حولوا|حولو|ردوا|ردو).{0,24}(?:مصاري|المصاري|المبلغ|الرسوم|الخمس|الخمسه|5|٥)|(?:بدي|اريد|أريد|ارجو|أرجو).{0,18}(?:مصاري|المبلغ|استرداد|استرجاع).{0,16}(?:هسا|الان|الآن|بسرعه|بسرعة)?/.test(q);
}

function looksDistressed(q: string, turn: InterpretedTurn) {
  return turn.sentiment === "frustrated" || turn.sentiment === "angry"
    || /(?:حسبي\s+الله|لا\s+اله\s+الا\s+الله|لا\s+إله\s+إلا\s+الله|تعبت|زهقت|قرفت|حرام|ليش\s+هيك|مش\s+معقول|عيب|الله\s+لا\s+يوفق)/.test(q);
}

function accusation(q: string) {
  return /(?:نصاب|نصابين|احتيال|محتال|سرقه|سرقة|حراميه|حرامية|كذاب|كذابين)/.test(q);
}

function longDelay(q: string) {
  return /(?:شهر|اسبوعين|أسبوعين|3\s+اسابيع|٣\s+اسابيع|ثلاث\s+اسابيع|قرب\s+الشهر|صارله\s+كتير|صارلو\s+كتير|طول\s+كثير|طولت\s+كثير|من\s+زمان)/.test(q);
}

export function refundHumanCareMode(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): RefundHumanCareMode | null {
  const stage = refundStage(input.truth);
  if (stage !== "refund_requested" && stage !== "refund_completed") return null;
  const q = n(input.turn.rawText);
  if (!q) return null;
  if (stage === "refund_completed") {
    if (asksRefundMoneyOrTiming(q) || asksForSolution(q) || repeatedRefundDemand(q) || looksDistressed(q, input.turn)) return "status_followup";
    return null;
  }
  if (accusation(q)) return "accusation";
  if (longDelay(q) && (asksRefundMoneyOrTiming(q) || /(?:قيد\s+المعالجه|قيد\s+المعالجة|الاسترداد)/.test(q))) return "long_delay";
  if (asksForSolution(q)) return "solution_request";
  if (repeatedRefundDemand(q)) return "repeat_demand";
  if (asksRefundMoneyOrTiming(q)) return "timing";
  if (looksDistressed(q, input.turn)) return "distress";
  if (/^(?:شو\s+صار|شو\s+هسا|وينها|وينهم|[؟?]+)$/.test(q)) return "status_followup";
  return null;
}

function freshAcknowledgement(mode: RefundHumanCareMode, previous: string) {
  const pools: Record<RefundHumanCareMode, string[]> = {
    timing: [
      "فاهم إنك بدك تعرف متى المبلغ يرجع فعليًا، مش بس تسمع إنه قيد المعالجة.",
      "سؤالك بمحله؛ المهم عندك هسا وقت رجوع المبلغ فعليًا.",
      "أكيد، اللي يهمك هسا متى المصاري ترجع مش إعادة نفس حالة الطلب.",
    ],
    long_delay: [
      "معك حق تكون متضايق؛ مدة انتظار طويلة للاسترداد بتتعب أي حدا.",
      "فاهم ليش الموضوع صار ثقيل عليك، خصوصًا بعد هالفترة من الانتظار.",
      "هالانتظار طويل عليك ومفهوم إن تكرار كلمة «قيد المعالجة» لحالها ما عاد يكفيك.",
    ],
    solution_request: [
      "فاهم إنك مش طالب شرح للحالة؛ أنت بدك تعرف شو الحل العملي هسا.",
      "تمام، خليني أجاوبك على الحل بدل ما أعيد نفس جملة الحالة.",
      "وصلتني نقطتك: بدك حل واضح، مش إعادة وصف المشكلة.",
    ],
    repeat_demand: [
      "وصلتني إنك بدك مصاريك ترجع، وما رح أرجع أطلب منك نفس الطلب مرة ثانية.",
      "طلبك واضح ومش بحاجة تعيده كل مرة.",
      "فاهمك؛ أنت مش عم تسأل عن الإلغاء من جديد، أنت عم تطالب بالمبلغ المسترد.",
    ],
    distress: [
      "مفهوم إنك متضايق، وخصوصًا لما تضل تنتظر بدون نتيجة نهائية ظاهرة.",
      "شايف إن الموضوع ضاغط عليك، وما بدي أزيد عليك برد يكرر نفس الكلام.",
      "معك حق تنزعج من طول الانتظار، وخليني أعطيك الحقيقة الحالية بدون لف ودوران.",
    ],
    accusation: [
      "فاهم إن التأخير خلاك تفقد الثقة، وما رح أدخل معك بجدال.",
      "واضح إنك وصلت لمرحلة غضب من التأخير؛ خليني أحكي لك فقط شو المثبت على طلبك وشو مش مثبت.",
      "ما رح أجادلك على غضبك؛ الأهم هسا أعطيك الحقيقة العملية عن الاسترداد.",
    ],
    status_followup: [
      "أكيد، خليني أعطيك آخر حقيقة فعلية عن الاسترداد بدون إعادة كلام زائد.",
      "تمام، براجع معك نفس نقطة الاسترداد مباشرة.",
      "فاهم إنك بدك آخر نتيجة فعلية، مش شرح عام.",
    ],
  };
  const normalizedPrevious = n(previous);
  return pools[mode].find((x) => !normalizedPrevious.includes(n(x).slice(0, 24))) || pools[mode][0];
}

function currentTruthLine(truth: TruthBundle) {
  const stage = refundStage(truth);
  if (stage === "refund_completed") return "حسب الحالة الحالية، الاسترداد مكتمل بالنظام.";
  return "طلب الاسترداد مسجل فعلًا وقيد المعالجة، وما في عليك طلب جديد تعيده من ناحيتك.";
}

function timingBoundaryLine(mode: RefundHumanCareMode) {
  if (mode === "long_delay" || mode === "distress" || mode === "accusation") {
    return "ما بدي أعطيك موعد من عندي وأرجع أخلفه؛ ما عندي وقت تحويل ثابت وموثق أقدر أضمنه قبل ما يظهر التنفيذ فعليًا.";
  }
  return "ما عندي موعد تحويل ثابت وموثق أقدر أضمنه قبل ظهور التنفيذ الفعلي.";
}

function nextExpectationLine(mode: RefundHumanCareMode, previous: string) {
  const candidates = mode === "solution_request"
    ? [
        "الحل الحالي هو إبقاء طلب الاسترداد نفسه مفتوحًا لحد ما يتم التنفيذ؛ إعادة طلب الاسترداد أو الإلغاء ما رح تسرّع المسار ولا بدي أخليك تعيدهم.",
        "عمليًا ما عليك خطوة ثانية الآن؛ نفس طلب الاسترداد هو اللي لازم يكتمل، وأي تنفيذ فعلي لازم يظهر على الحالة قبل ما أقول لك إنه تم.",
      ]
    : [
        "أول ما يظهر تنفيذ فعلي للتحويل بتتغير الحالة، وقتها بنقدر نقول لك إنه تم بدل ما نوعدك قبل التنفيذ.",
        "ما رح أعتبر المبلغ محول إلا لما يظهر التنفيذ فعليًا على الطلب؛ وقتها بتظهر النتيجة الموثقة على الحالة.",
        "من جهتك ما في داعي تعيد الطلب؛ اللي ننتظره الآن هو ظهور تنفيذ الاسترداد نفسه على الحالة.",
      ];
  const prev = n(previous);
  return candidates.find((x) => !prev.includes(n(x).slice(0, 24))) || candidates[0];
}

export function buildRefundHumanCareReply(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): string | null {
  const mode = refundHumanCareMode(input);
  if (!mode) return null;
  const stage = refundStage(input.truth);
  const previous = input.state.lastAssistantText || "";
  const ack = freshAcknowledgement(mode, previous);
  const truth = currentTruthLine(input.truth);
  if (stage === "refund_completed") return `${ack} ${truth}`;
  const boundary = timingBoundaryLine(mode);
  const next = nextExpectationLine(mode, previous);
  return `${ack}\n\n${truth} ${boundary}\n\n${next}`;
}

export function refundHumanCareCandidateAligned(input: { candidate: string | null | undefined; truth: TruthBundle; turn?: InterpretedTurn; state?: ConversationState }) {
  const q = n(input.candidate);
  if (!q) return false;
  const stage = refundStage(input.truth);
  if (stage === "refund_completed") return /(?:الاسترداد|المبلغ).{0,30}(?:مكتمل|تم|تحول|تحويل)/.test(q);
  const hasTruth = /(?:الاسترداد|طلب\s+الاسترداد|المبلغ|المصاري).{0,55}(?:قيد\s+المعالجه|قيد\s+المعالجة|مسجل|تحويل|موعد|تنفيذ)/.test(q);
  const hasHumanAcknowledgement = /(?:فاهم|مفهوم|معك\s+حق|وصلتني|سؤالك\s+بمحله|متضايق|انزعاج|غضب|ثقيل\s+عليك)/.test(q);
  const notEmptyStatusLoop = !/^(?:نعم\s+)?طلبك\s+ملغي\s+بالفعل.{0,90}(?:الاسترداد\s+مسجل|قيد\s+المعالجه|قيد\s+المعالجة)/.test(q);
  const noFalsePromise = !/(?:خلال\s+\d+|بكرا|غدا|غدًا|اليوم\s+اكيد|اليوم\s+أكيد|قريبًا\s+اكيد|قريباً\s+أكيد).{0,20}(?:يرجع|يتم|تحويل)/.test(q);
  const mode = input.turn && input.state ? refundHumanCareMode({ turn: input.turn, state: input.state, truth: input.truth }) : null;
  const modeSpecific = mode === "solution_request" ? /(?:الحل|عملي|خطوه\s+ثانيه|خطوة\s+ثانية|نفس\s+طلب\s+الاسترداد)/.test(q)
    : mode === "repeat_demand" ? /(?:ما\s+في\s+داعي|مش\s+بحاجه|مش\s+بحاجة|ما\s+رح\s+اطلب|ما\s+رح\s+أطلب|طلبك\s+واضح)/.test(q)
    : mode === "long_delay" ? /(?:انتظار|مده|مدة|هالفتره|هالفترة|طويل|شهر)/.test(q)
    : true;
  return hasTruth && hasHumanAcknowledgement && notEmptyStatusLoop && noFalsePromise && modeSpecific;
}
