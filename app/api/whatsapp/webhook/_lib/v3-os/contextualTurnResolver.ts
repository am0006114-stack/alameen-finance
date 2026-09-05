import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TopicKey } from "./types";

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

function lastRelevantContext(state: ConversationState, recentTurns?: string[]) {
  const lines = (recentTurns || []).filter(Boolean);
  const tail = lines.slice(-8).join("\n");
  return normalized([state.lastAssistantText || "", state.lastCustomerText || "", tail].filter(Boolean).join("\n"));
}

function shortAffirmative(q: string) {
  return /^(?:اه|نعم|ايوه|تمام|طيب|اوكي|اوك|yes|صح|مزبوط)$/.test(q);
}

export type ContextualTurnSignals = {
  topics: TopicKey[];
  reviewTiming: boolean;
  nextStep: boolean;
  productAvailability: boolean;
  trustConcern: boolean;
  humanRequest: boolean;
  paymentStatusClaim: boolean;
  shortFollowUpResolved: boolean;
};

/**
 * Deterministic dialogue continuation for the common short/colloquial messages
 * that generic intent classification routinely loses. This does not answer the
 * customer; it only preserves what topic the current message belongs to.
 */
export function contextualTurnSignals(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  recentTurns?: string[];
}): ContextualTurnSignals {
  const q = normalized(input.turn.rawText);
  const ctx = lastRelevantContext(input.state, input.recentTurns);
  const topics = new Set<TopicKey>();

  // All patterns below are written against normalizeArabic() output (e.g. متى -> متي, خطوة -> خطوه).
  const directReviewTiming = /(?:متي|امتي|ايمتي|لايمتا|لامتي).{0,45}(?:ترد|تردو|تردولي|تحكو|تحكولي|تحكولنا|خبر|الخبر|النتيجه|الموافقه|قرار|يخلص|تخلص|يطلع|يتغير|تتغير|بتتغير|يتحدث|تتحدث|بتتحدث|يصير\s+تحديث)|(?:قبلتو|قبلتوه|قبلتم|انقبل|انقبلت).{0,35}(?:طلبي|الطلب)?|(?:صارلي|صار له|صارلها).{0,20}(?:اسبوع|يوم|ايام|شهر).{0,35}(?:استني|انتظر|بدون\s+رد)|(?:للحين|لهسا|لحد\s+الان).{0,30}(?:ما\s+في|ما\s+صدر|ما\s+طلع).{0,30}(?:رد|موافقه|قرار)|(?:قديش|كم).{0,12}(?:بده|بتاخد|بياخد).{0,22}(?:وقت|للمراجعه|المراجعه)|(?:كم\s+يوم).{0,25}(?:مراجعه|قرار|موافقه)/.test(q);
  const shortTiming = /^(?:متي|امتي|ايمتي|طيب\s+متي|اه\s+متي|متي\s+يعني|قديش\s+بده(?:\s+وقت(?:\s+للمراجعه)?)?|كم\s+بده(?:\s+وقت(?:\s+للمراجعه)?)?)$/.test(q);
  const contextIsTiming = /(?:وقت\s+المراجعه|مده\s+المراجعه|متي\s+الموافقه|المعدل\s+الطبيعي|يومين|3\s+ايام|ثلاث\s+ايام|ضغط\s+المراجعات|قرار\s+نهائي|الموافقه\s+النهائيه)/.test(ctx);
  const shortYesOnTiming = shortAffirmative(q) && contextIsTiming && /(?:اذا\s+سوالك|بدك\s+اعطيك|بعطيك|احكيلك).{0,40}(?:وقت|مده|المراجعه|الخطوه)/.test(ctx);
  const reviewTiming = directReviewTiming || (shortTiming && contextIsTiming) || shortYesOnTiming;
  if (reviewTiming) topics.add("review_timing");

  const nextStep = /(?:شو|ما|ايش).{0,18}الخطوه\s*التاليه|^الخطوه\s*التاليه$|(?:شو\s+ضل|شو\s+باقي|وبعدين|طيب\s+وبعدين)/.test(q);
  if (nextStep) topics.add("application_status");

  const productAvailability = /(?:متوفر|موجود|في\s+عندكم|عندكم).{0,35}(?:ايفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|جهاز)|(?:ايفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno).{0,35}(?:متوفر|موجود|عندكم)/i.test(q);
  if (productAvailability) topics.add("products");

  const trustConcern = /(?:نصب|نصاب|نصابين|مصداقيه|اضمن|يضمن|ثقه|مسجلين\s+قانون|قانونيا|خايف|خايفه|متخوف|متخوفه)/.test(q);
  if (trustConcern) {
    topics.add("trust");
    if (/(?:نصب|نصاب|نصابين|لا\s+يوجد\s+مصداقيه|مش\s+مصداقيه|مو\s+مصداقيه)/.test(q)) topics.add("complaint");
  }

  const humanRequest = /(?:بدي|اريد).{0,30}(?:شخص|موظف|موضف|حدا|انسان).{0,25}(?:احكي|اتكلم|اكلم|يرد|افهمه)|(?:حولني|وصلني|وصلوني).{0,25}(?:موظف|شخص|الاداره)|(?:رقم\s+تواصل|بدي\s+رقم).{0,25}(?:احكي|اتصل)/.test(q);
  if (humanRequest) topics.add("human_request");

  const paymentStatusClaim = /(?:دفعت|دافع|حولت|تم\s+الدفع|رفعت\s+الوصل|بعثت\s+الوصل|وصل\s+الدفع)/.test(q);
  if (paymentStatusClaim) topics.add("payment_status");

  return {
    topics: Array.from(topics),
    reviewTiming,
    nextStep,
    productAvailability,
    trustConcern,
    humanRequest,
    paymentStatusClaim,
    shortFollowUpResolved: (shortTiming || shortAffirmative(q)) && topics.size > 0,
  };
}
