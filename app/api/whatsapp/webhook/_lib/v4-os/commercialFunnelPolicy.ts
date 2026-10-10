import type { V4DraftResponse, V4TruthBundle, V4TurnUnderstanding, V4WorkingMemory } from "./types";

export type V4CommercialFastPathKind = "continue" | "decline" | "status_offer" | "next_step" | "fee_reason" | "fee_refund";

const WAITING_DECISION_STAGE = "preliminary_approved_waiting_decision";
const FAST_PATH_PREFIX = "commercial_fastpath:";

function normalizeArabic(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function factValue(truth: V4TruthBundle, key: string) {
  return truth.facts[key]?.value;
}

export function waitingForCommercialDecision(truth: V4TruthBundle) {
  return String(factValue(truth, "application.journey_stage") || "") === WAITING_DECISION_STAGE;
}

function promptPreviouslyShown(memory: V4WorkingMemory) {
  const last = normalizeArabic(memory.lastAssistantText);
  if (!last) return false;
  return /هل ترغب بالاستمرار|هل بدك تكمل|هل حاب تكمل/.test(last)
    || (/رسوم فتح الملف/.test(last) && (/(?:اكتب|اكتبي)\s*1/.test(last) || /1\s+نعم/.test(last) || /للمتابعه/.test(last)));
}

function explicitContinuationShortcut(value: string, memory: V4WorkingMemory) {
  const q = normalizeArabic(value);
  if (!q) return false;

  // "1" is the explicit CTA for this exact stage. It never needs an LLM round-trip.
  if (q === "1") return true;

  // Strong continuation language is unambiguous on its own.
  if (/^(?:نعم\s+اعتمد|اعتمد|تمام\s+استمرار|استمرار|كمل|اكمل|استمر|موافق|اوافق|بدي\s+(?:اكمل|كمل|استمر)|حاب\s+(?:اكمل|كمل|استمر)|خلينا\s+(?:نكمل|نستمر)|يلا\s+(?:كمل|نكمل))$/.test(q)) return true;

  // Bare yes/okay is accepted only after the continuation CTA was actually shown.
  return /^(?:نعم|اه|ايوه|تمام|اوكي|اوك)$/.test(q) && promptPreviouslyShown(memory);
}

function explicitDeclineShortcut(value: string, memory: V4WorkingMemory) {
  const q = normalizeArabic(value);
  if (!q || !promptPreviouslyShown(memory)) return false;
  return q === "2" || /^(?:لا|مش\s+هسا|لا\s+شكرا|بلاش|ما\s+بدي\s+اكمل)$/.test(q);
}

function feeReasonQuestion(value: string) {
  const q = normalizeArabic(value);
  return /(?:ليش|لماذا|شو\s+سبب|ايش\s+سبب|شو\s+مقابل).{0,35}(?:رسوم|5\s*دنانير|5\s*دينار|خمس\s+دنانير|فتح\s+الملف)/.test(q)
    || /(?:ليش|لماذا).{0,25}(?:ادفع|دفع).{0,20}(?:5|خمس)/.test(q);
}

function feeRefundQuestion(value: string) {
  const q = normalizeArabic(value);
  return /(?:5|خمس|الرسوم).{0,35}(?:مسترده|بترجع|ترجع|برجعولي|استرداد)/.test(q)
    || /(?:اذا|لو).{0,30}(?:ما\s+صدرت|ما\s+طلعت|ما\s+اجت|ما\s+وافقت|انرفض).{0,45}(?:الرسوم|5|خمس|ترجع|بترجع|مسترده)/.test(q);
}

function nextStepQuestion(value: string) {
  const q = normalizeArabic(value);
  return /(?:شو|ايش)\s+(?:المطلوب|مطلوب|لازم)|(?:شو|ايش)\s+(?:اعمل|اسوي)|(?:شو|ايش)\s+(?:الخطوه|الخطوة)\s*(?:الجايه|التاليه)?|شو\s+بعدين|كيف\s+(?:اكمل|كمل|اتابع|تابع)|طيب\s+(?:شو|ايش)\s+(?:المطلوب|مطلوب)/.test(q);
}

function currentStatusQuestion(value: string) {
  const q = normalizeArabic(value);
  return /(?:شو\s+صار|وين\s+وصل|شو\s+وضع|شو\s+حاله|حاله\s+الطلب|وضع\s+الطلب|طلبي.{0,45}شو\s+صار|الطلب.{0,45}شو\s+صار|شو\s+صار\s+فيه)/.test(q);
}

function understanding(kind: V4CommercialFastPathKind, burstText: string): V4TurnUnderstanding {
  const isContinue = kind === "continue";
  const question = ["status_offer", "next_step", "fee_reason", "fee_refund"].includes(kind)
    ? [burstText.trim()].filter(Boolean)
    : [];
  const neededFactKeys = kind === "fee_reason"
    ? ["fee.opening.amount_jod", "fee.opening.purpose", "fee.opening.refund_rule"]
    : kind === "fee_refund"
      ? ["fee.opening.amount_jod", "fee.opening.refund_rule"]
      : ["status_offer", "next_step"].includes(kind)
        ? ["application.status.customer", "fee.opening.amount_jod", "fee.opening.refund_rule"]
        : [];

  return {
    meaningSummary: kind === "continue"
      ? "العميل اختار الاستمرار بعد الموافقة المبدئية"
      : kind === "decline"
        ? "العميل اختار عدم فتح خطوة الدفع الآن"
        : kind === "status_offer"
          ? "العميل يسأل عن طلب حصل على موافقة مبدئية ويجب عرض قرار الاستمرار بوضوح"
          : kind === "fee_reason"
            ? "العميل يسأل لماذا توجد رسوم فتح ملف 5 دنانير"
            : kind === "fee_refund"
              ? "العميل يسأل هل رسوم فتح الملف مستردة"
              : "العميل يسأل ما الخطوة المطلوبة بعد الموافقة المبدئية",
    currentGoal: kind === "continue"
      ? "continue_after_preliminary_approval"
      : kind === "decline"
        ? "pause_after_preliminary_approval"
        : `commercial_${kind}`,
    explicitQuestions: question,
    neededFactKeys,
    requestedAction: isContinue ? "continue_application" : null,
    actionDisposition: isContinue ? "request" : kind === "decline" ? "deny" : "none",
    requestedPersona: null,
    references: [],
    emotion: "neutral",
    urgency: "normal",
    topicChanged: false,
    customerRejectedPreviousAnswer: false,
    customerWantsBrevity: true,
    noReplyRequested: false,
    identityQuestion: false,
    humanContactRequested: false,
    socialClosure: false,
    confidence: 1,
    warnings: [`${FAST_PATH_PREFIX}${kind}`, "deterministic_commercial_funnel"],
  };
}

export function resolveCommercialFastPathUnderstanding(input: {
  burstText: string;
  memory: V4WorkingMemory;
  truth: V4TruthBundle;
}): V4TurnUnderstanding | null {
  if (!waitingForCommercialDecision(input.truth)) return null;
  if (explicitContinuationShortcut(input.burstText, input.memory)) return understanding("continue", input.burstText);
  if (explicitDeclineShortcut(input.burstText, input.memory)) return understanding("decline", input.burstText);
  if (feeReasonQuestion(input.burstText)) return understanding("fee_reason", input.burstText);
  if (feeRefundQuestion(input.burstText)) return understanding("fee_refund", input.burstText);
  if (currentStatusQuestion(input.burstText)) return understanding("status_offer", input.burstText);
  if (nextStepQuestion(input.burstText)) return understanding("next_step", input.burstText);
  return null;
}

export function commercialFastPathKind(understanding: V4TurnUnderstanding): V4CommercialFastPathKind | null {
  const marker = understanding.warnings.find((x) => x.startsWith(FAST_PATH_PREFIX));
  const kind = marker?.slice(FAST_PATH_PREFIX.length) as V4CommercialFastPathKind | undefined;
  return kind && ["continue", "decline", "status_offer", "next_step", "fee_reason", "fee_refund"].includes(kind) ? kind : null;
}

function decisionOfferDraft(input: { understanding: V4TurnUnderstanding }): V4DraftResponse {
  return {
    text: "طلبك أخذ موافقة مبدئية ✅\n\nهل ترغب بالاستمرار للدراسة النهائية؟\n1️⃣ نعم، أريد الاستمرار\n2️⃣ لا، مش هسا\n\nعند اختيار 1، رسوم فتح الملف 5 دنانير، وهي مستردة إذا ما صدرت الموافقة النهائية.",
    decision: "ANSWER",
    claims: [
      { kind: "fact", text: "الطلب أخذ موافقة مبدئية", factKey: "application.status.customer" },
      { kind: "fact", text: "رسوم فتح الملف 5 دنانير", factKey: "fee.opening.amount_jod" },
      { kind: "fact", text: "الرسوم مستردة إذا ما صدرت الموافقة النهائية", factKey: "fee.opening.refund_rule" },
    ],
    answeredQuestions: input.understanding.explicitQuestions,
    usedFactKeys: ["application.status.customer", "fee.opening.amount_jod", "fee.opening.refund_rule"],
    notes: ["commercial deterministic decision offer", "no tracking link before payment", "fee rationale intentionally omitted unless asked"],
  };
}

export function buildCommercialFastPathDraft(input: {
  understanding: V4TurnUnderstanding;
  truth: V4TruthBundle;
}): V4DraftResponse | null {
  if (!waitingForCommercialDecision(input.truth)) return null;
  const kind = commercialFastPathKind(input.understanding);
  if (!kind || kind === "continue") return null;

  if (kind === "status_offer" || kind === "next_step") {
    return decisionOfferDraft({ understanding: input.understanding });
  }

  if (kind === "decline") {
    return {
      text: "تمام، ما رح نفتح خطوة الدفع هسا. إذا غيرت رأيك لاحقًا اكتب كمل.",
      decision: "ANSWER",
      claims: [],
      answeredQuestions: [],
      usedFactKeys: [],
      notes: ["commercial deterministic decline", "no payment step opened"],
    };
  }

  if (kind === "fee_reason") {
    return {
      text: "هي رسوم فتح ملف للدراسة النهائية وتمييز الطلبات الجادة، ومش دفعة أولى ولا جزء من سعر الجهاز. وإذا ما صدرت الموافقة النهائية فهي مستردة. إذا بدك تكمل اكتب 1.",
      decision: "ANSWER",
      claims: [
        { kind: "fact", text: "رسوم فتح الملف للدراسة النهائية وتمييز الطلبات الجادة", factKey: "fee.opening.purpose" },
        { kind: "fact", text: "الرسوم مستردة إذا ما صدرت الموافقة النهائية", factKey: "fee.opening.refund_rule" },
      ],
      answeredQuestions: input.understanding.explicitQuestions,
      usedFactKeys: ["fee.opening.purpose", "fee.opening.refund_rule"],
      notes: ["commercial deterministic fastpath", "fee rationale shown only because customer asked why"],
    };
  }

  return {
    text: "نعم. إذا ما صدرت الموافقة النهائية، الـ5 دنانير مستردة بالكامل عبر المسار الرسمي. إذا بدك تكمل اكتب 1.",
    decision: "ANSWER",
    claims: [
      { kind: "fact", text: "الرسوم مستردة إذا ما صدرت الموافقة النهائية", factKey: "fee.opening.refund_rule" },
    ],
    answeredQuestions: input.understanding.explicitQuestions,
    usedFactKeys: ["fee.opening.refund_rule"],
    notes: ["commercial deterministic fastpath", "refund question answered without expanding the funnel"],
  };
}
