import type { ConversationState } from "./types";

function normalize(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function time(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function reconcileDeliveredConversationState(input: {
  persisted: ConversationState | null;
  deliveredState: ConversationState | null;
  deliveredAt?: string | null;
}) {
  const persisted = input.persisted;
  const delivered = input.deliveredState;
  if (!delivered?.waId) return persisted;
  if (!persisted?.waId) return delivered;
  if (persisted.waId !== delivered.waId) return persisted;
  if (persisted.lastTurnId === delivered.lastTurnId) return persisted;

  const deliveredStateAt = time(delivered.updatedAt) || time(input.deliveredAt);
  const persistedAt = time(persisted.updatedAt);
  return deliveredStateAt >= persistedAt ? delivered : persisted;
}

export function paymentAccessProblemText(value: string | null | undefined) {
  const q = normalize(value);
  if (!q) return false;
  const missingRail = /(?:ما\s*عندي|مش\s*عندي|بدون|مش\s*مفعل(?:ه)?|ما\s*بقدر\s*استخدم).{0,36}(?:كليك|cliq|محفظه|محفظة)|(?:كليك|cliq|محفظه|محفظة).{0,36}(?:ما\s*عندي|مش\s*عندي|مش\s*مفعل(?:ه)?|ما\s*بقدر)/i.test(q);
  const asksForWay = /(?:كيف|شو|ايش|إيش|وين|طيب|الحل|طريقه|طريقة).{0,34}(?:ادفع|دفع|احول|تحويل)|(?:ادفع|احول|دفع|تحويل).{0,34}(?:كيف|شو|وين|الحل|طريقه|طريقة)/.test(q);
  return missingRail && asksForWay;
}

export function explicitCurrentTurnPaymentExecution(value: string | null | undefined) {
  const q = normalize(value);
  if (!q || paymentAccessProblemText(value)) return false;
  return /(?:كيف|وين|بدي|اريد|حاب|ممكن).{0,24}(?:ادفع|دفع|احول|تحويل)|(?:ادفع|احول|حول|تحويل)(?:\s|$)|(?:بيانات|رقم|اسم).{0,18}(?:الدفع|التحويل|المستفيد)|(?:وين|شو).{0,18}(?:رقم\s+كليك|cliq|كليك).{0,18}(?:احول|تحويل|ادفع)?/.test(q);
}

function explicitMutationOrFreshQuestion(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const q = normalize(value);
  if (!q) return false;
  if (/[؟?]/.test(raw)) return true;
  if (/^(?:كيف|وين|ليش|متى|امتى|هل|شو|ايش|إيش|مين|قديش|كم)(?:\s|$)/.test(q)) return true;
  if (/(?:الغاء|الغي|استرداد|استرجاع|غير\s+الجهاز|غير\s+الرقم|عدل\s+الطلب|احذف\s+بياناتي)/.test(q)) return true;
  return explicitCurrentTurnPaymentExecution(value);
}

export function likelyContextualAnswerToAssistantPrompt(input: {
  customerText: string;
  lastAssistantText: string | null | undefined;
}) {
  const current = normalize(input.customerText);
  const previousRaw = String(input.lastAssistantText || "").trim();
  const previous = normalize(previousRaw);
  if (!current || !previous || current.length > 140) return false;
  if (explicitMutationOrFreshQuestion(input.customerText)) return false;

  const assistantAsked = /[؟?]\s*$/.test(previousRaw)
    || /(?:احكيلي|اكتبلي|ابعثلي|خبرني|اعطيني|حددلي|اختار|اختاري|اكدلي|أكدلي|شو\s+اسم|اي\s+واحد|أي\s+واحد|اسم\s+ال)/.test(previous);
  if (!assistantAsked) return false;

  const socialOnly = /^(?:تمام|اوك|اوكي|شكرا|يسلمو|العفو)$/.test(current);
  return !socialOnly;
}
