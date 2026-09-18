import { normalizeArabicText, normalizeWhatsAppToSend } from "../text";
import type { ApplicationTruth, ContactResolutionState, ConversationState, VerifiedContactBinding } from "./types";

function arabicDigitsToAscii(value: string) {
  return String(value || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function digits(value: string | null | undefined) {
  return arabicDigitsToAscii(String(value || "")).replace(/\D/g, "");
}

function normalized(value: string | null | undefined) {
  return normalizeArabicText(arabicDigitsToAscii(String(value || "")))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalWaId(value: string | null | undefined) {
  const wa = normalizeWhatsAppToSend(arabicDigitsToAscii(String(value || "")));
  return digits(wa);
}

export function verifiedContactBindingValidForSender(state: ConversationState, waId: string) {
  const binding = state.verifiedContactBinding;
  if (!binding) return false;
  const sender = canonicalWaId(waId);
  return Boolean(
    sender &&
    canonicalWaId(binding.aliasWaId) === sender &&
    canonicalWaId(binding.primaryWaId) &&
    canonicalWaId(binding.verifiedByWaId) === canonicalWaId(binding.primaryWaId) &&
    binding.method === "registered_sender_explicit_alias"
  );
}

export function verifiedPrimaryWaId(state: ConversationState, waId: string) {
  if (!verifiedContactBindingValidForSender(state, waId)) return null;
  return canonicalWaId(state.verifiedContactBinding?.primaryWaId || "") || null;
}

export function bindingAllowsApplication(state: ConversationState, waId: string, appPhone: string | null | undefined, phonesMatch: (a: string | null | undefined, b: string | null | undefined) => boolean) {
  const primary = verifiedPrimaryWaId(state, waId);
  if (!primary || !appPhone) return false;
  return phonesMatch(appPhone, primary);
}

function possiblePhoneTokens(value: string) {
  const raw = arabicDigitsToAscii(value)
    .replace(/AM-\d{8,}/gi, " ")
    .replace(/(?:^|\D)1\d{11,14}(?=\D|$)/g, " ");
  const matches = raw.match(/(?:\+|00)?\d[\d\s()\-]{6,20}\d/g) || [];
  const out: string[] = [];
  for (const match of matches) {
    const d = digits(match);
    if (d.length < 9 || d.length > 15) continue;
    const wa = canonicalWaId(match);
    if (!wa || wa.length < 9 || wa.length > 15) continue;
    if (!out.includes(wa)) out.push(wa);
  }
  return out;
}

/**
 * A different number is authorized only when the currently authenticated
 * application owner explicitly says that the number belongs to them / is their
 * alternate WhatsApp channel and asks us to recognize messages from it.
 * Merely typing a phone number never authorizes anything.
 */
export function extractExplicitAlternateContactAuthorization(value: string | null | undefined, currentWaId: string) {
  const q = normalized(value);
  if (!q) return null;
  const ownership = /(?:هذا|هاض|هاد|هدا|هاذا|الرقم|رقمي).{0,28}(?:رقمي|الي|إلي|تبعي|الثاني|واتساب)|(?:رقمي|الرقم).{0,28}(?:الثاني|للوتساب|للواتساب|واتساب|بديل)/.test(q);
  const futureUse = /(?:لما|اذا|إذا|وقت).{0,35}(?:احكي|أحكي|ابعت|أبعت|اراسلكم|أراسلكم|اكتبلكم|أكتبلكم).{0,35}(?:منه|منو|من هناك|عليه|ع هالرقم)|(?:ردو|ردوا|تعرفو|تعرفوا|اعتبرو|اعتبروا|اعتمدو|اعتمدوا|اربطو|اربطوا).{0,35}(?:علي|اني|إنّي|اني صاحب|هذا الرقم|هالرقم|الرقم)/.test(q);
  if (!(ownership && futureUse)) return null;
  const current = canonicalWaId(currentWaId);
  const candidates = possiblePhoneTokens(String(value || "")).filter((x) => x !== current);
  return candidates.length === 1 ? candidates[0] : null;
}

export function contactExplanationFromText(value: string | null | undefined): ContactResolutionState["explanation"] {
  const q = normalized(value);
  if (/(?:استرالي|أسترالي|دولي|برا الاردن|برا الأردن)/.test(q)) return "international_number";
  if (/(?:ما عليه واتساب|مش عليه واتساب|ما بزبط.{0,15}واتساب|ما بشتغل.{0,15}واتساب)/.test(q)) return "no_whatsapp";
  if (/(?:غيرت رقمي|غيرته|تغير رقمي|رقم قديم)/.test(q)) return "changed_number";
  if (/(?:رقمي الثاني|رقم ثاني|هذا رقمي الثاني|هاد رقمي الثاني)/.test(q)) return "alternate_number";
  return "different_whatsapp";
}

export function markContactResolution(input: {
  state: ConversationState;
  status: ContactResolutionState["status"];
  trackingId?: string | null;
  customerText?: string | null;
}): ConversationState {
  return {
    ...input.state,
    contactResolution: {
      status: input.status,
      trackingId: input.trackingId || input.state.contactResolution?.trackingId || null,
      explanation: contactExplanationFromText(input.customerText) || input.state.contactResolution?.explanation || null,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function clearContactResolution(state: ConversationState): ConversationState {
  return state.contactResolution ? { ...state, contactResolution: null } : state;
}

export function makeVerifiedContactBinding(input: { aliasWaId: string; primaryWaId: string }): VerifiedContactBinding {
  const aliasWaId = canonicalWaId(input.aliasWaId);
  const primaryWaId = canonicalWaId(input.primaryWaId);
  return {
    aliasWaId,
    primaryWaId,
    verifiedByWaId: primaryWaId,
    verifiedAt: new Date().toISOString(),
    method: "registered_sender_explicit_alias",
  };
}

export function directSenderOwnsApplication(app: ApplicationTruth | null | undefined, senderWaId: string, phonesMatch: (a: string | null | undefined, b: string | null | undefined) => boolean) {
  return Boolean(app?.phone && phonesMatch(app.phone, senderWaId));
}
