import { normalizeArabic } from "./text";
import type { ConversationState } from "./types";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function updateConversationConstraints(input: { state: ConversationState; customerText: string; turnId: string }): ConversationState {
  const q = n(input.customerText);
  if (!q) return input.state;
  const previous = input.state.conversationConstraints || { noLinks: false, whatsappOnly: false, avoidRepetition: false, sourceTurnId: null, updatedAt: null };
  let noLinks = previous.noLinks;
  let whatsappOnly = previous.whatsappOnly;
  let avoidRepetition = previous.avoidRepetition;

  if (/(?:ما\s*بدي|بديش|لا\s*تبعت|لا\s*تبعث|لا\s*ترسل|بدون).{0,18}(?:رابط|روابط)|(?:الرابط|الروابط).{0,15}(?:ما\s*بدي|بديش)/.test(q)) noLinks = true;
  if (/(?:ابعث|ابعت|ارسل|هات|اعطيني|أعطيني).{0,18}(?:الرابط|رابط)|(?:بدي|اريد|أريد).{0,18}(?:الرابط|رابط)/.test(q)) noLinks = false;

  if (/(?:واتساب|واتس).{0,35}(?:لا\s*ترن|لا\s*تتصل|مش\s*مكالمه|مش\s*مكالمة|بدون\s*مكالمه|بدون\s*مكالمة)|(?:لا\s*ترن|لا\s*تتصل).{0,35}(?:واتساب|واتس)|(?:ابعتلي|ابعثلي|راسلني).{0,25}(?:واتساب|واتس).{0,25}(?:لا\s*ترن|مش\s*مكالمه|مش\s*مكالمة)?/.test(q)) whatsappOnly = true;
  if (/(?:بدي|اريد|أريد|ممكن).{0,20}(?:مكالمه|مكالمة|اتصال|ترن|تتصل)|(?:اتصل|رن).{0,15}(?:علي|فيي)/.test(q) && !/(?:لا\s*ترن|لا\s*تتصل)/.test(q)) whatsappOnly = false;

  if (/(?:ما|لا)\s*(?:تعيد|تكرر)|(?:مش|مو)\s*(?:نسخ\s*لصق)|(?:نفس\s*الحكي|نفس\s*الكلام).{0,20}(?:كل\s*مره|كل\s*مرة|بتعيد|تعيد)|(?:جاوبني|رد\s*علي).{0,20}(?:بدون\s*تكرار|مش\s*نسخ)/.test(q)) avoidRepetition = true;

  if (noLinks === previous.noLinks && whatsappOnly === previous.whatsappOnly && avoidRepetition === previous.avoidRepetition) return input.state;
  const now = new Date().toISOString();
  return {
    ...input.state,
    conversationConstraints: { noLinks, whatsappOnly, avoidRepetition, sourceTurnId: input.turnId, updatedAt: now },
    updatedAt: now,
  };
}

export function applyConversationConstraintsToReply(input: { state: ConversationState; reply: string | null | undefined }) {
  let reply = String(input.reply || "").trim();
  if (!reply) return reply;
  const constraints = input.state.conversationConstraints;
  if (constraints?.noLinks) {
    reply = reply
      .split(/\r?\n/)
      .filter((line) => !/https?:\/\//i.test(line))
      .join("\n")
      .replace(/(?:وللتأكد|للمتابعة|تابع|تقدر\s+تتابع).{0,60}(?:الرابط|من\s+هون)\s*:?\s*$/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return reply;
}
