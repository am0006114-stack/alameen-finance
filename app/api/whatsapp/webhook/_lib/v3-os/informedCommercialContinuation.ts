import { applicationJourneyStage } from "./applicationJourney";
import { normalizeArabic } from "./text";
import { isPaymentPriorityCustomerText } from "./operationsAutopilot";
import { currentFileOpeningPaymentRule } from "./paymentDestinationOverride";
import type { ApplicationTruth, CommercialDisclosureState, ConversationState, InterpretedTurn, TruthBundle } from "./types";

export const COMMERCIAL_DISCLOSURE_VERSION = "2026-10-concise-decision-v3" as const;

function disclosureVersionForState(): CommercialDisclosureState["version"] {
  // The persisted state type still carries the historical literal for backward
  // compatibility with frozen V3 state. Runtime migration is intentionally scoped
  // here so the new contract can invalidate old disclosure memory safely.
  return COMMERCIAL_DISCLOSURE_VERSION as unknown as CommercialDisclosureState["version"];
}

export function emptyCommercialDisclosure(): CommercialDisclosureState {
  return {
    version: disclosureVersionForState(),
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
  if (String(existing.version) !== COMMERCIAL_DISCLOSURE_VERSION) return emptyCommercialDisclosure();
  return existing;
}

export function commercialDisclosureDelivered(state: ConversationState, truth: TruthBundle) {
  const disclosure = currentCommercialDisclosure(state, truth);
  return disclosure.status === "delivered" || disclosure.status === "acknowledged";
}

export function informedCommercialContinuationConfirmed(input: {
  state: ConversationState;
  truth: TruthBundle;
  turn: InterpretedTurn;
  customerText: string;
}) {
  const disclosure = currentCommercialDisclosure(input.state, input.truth);
  if (disclosure.status !== "delivered") return false;
  const stage = applicationJourneyStage(input.truth.application);
  if (!["preliminary_approved_waiting_decision", "continuation_confirmed_fee_due"].includes(stage)) return false;

  if (isPaymentPriorityCustomerText(input.customerText, input.turn.topics.join(","), input.state.lastAssistantText)) return true;

  const semantic = input.turn.semantic;
  if (semantic && semantic.confidence >= 0.68) {
    if (["declined", "deferred", "conditional"].includes(semantic.decision.continuation)) return false;
    if (semantic.decision.continuation === "confirmed") return true;
  }

  const q = normalizeArabic(String(input.customerText || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const declines = /(?:لا\s+(?:ارغب|اريد)|مش\s+(?:حاب|حابب|راغب|مكمل)|ما\s+بدي|بديش).{0,30}(?:الاستمرار|استمر|اكمل|كمل|نكمل)/.test(q);
  if (declines) return false;

  const naturalContinuation = /(?:اود|ارغب|اريد|بدي|حاب|حابب|موافق|اوافق|خلينا|يلا).{0,24}(?:الاستمرار|استمر|اكمل|كمل|نكمل|نستمر)|^(?:استمرار|اكمل|كمل|نكمل|نستمر|استمر|كملو|كملوا|استمروا)$/.test(q);
  if (naturalContinuation) return true;
  if (/^(?:تمام|خلص)\s+(?:بدي|حاب|حابب|موافق|خلينا|استمرار).{0,18}(?:استمر|اكمل|كمل|نكمل|الاستمرار)?$/.test(q)) return true;
  if (/^(?:نعم|اه|ايوه|yes|موافق|موافقه|اوافق|اكيد)$/.test(q)) return true;
  const affirmativeLead = /^(?:نعم|اه|ايوه|yes)(?:\s|$)/.test(q);
  return affirmativeLead && /(?:اوافق|موافق|موافقه|الشروط|اكمل|كمل|استمر)/.test(q);
}

export function numericContinuationShortcutText(value: string | null | undefined) {
  const q = normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:1|١)$/.test(q);
}

export function preliminaryApprovalNeedsInformedDisclosure(state: ConversationState, truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  return stage === "preliminary_approved_waiting_decision" && !commercialDisclosureDelivered(state, truth);
}

export function markCommercialDisclosureDelivered(state: ConversationState, truth: TruthBundle, turnId: string): ConversationState {
  const app = truth.application;
  if (!app) return state;
  const stamp = new Date().toISOString();
  return {
    ...state,
    commercialDisclosure: {
      version: disclosureVersionForState(),
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
      version: disclosureVersionForState(),
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

function asksStatusOrNextStep(turn: InterpretedTurn) {
  const q = normalizeArabic(String(turn.rawText || ""));
  if (turn.topics.includes("application_status") || turn.topics.includes("tracking")) return true;
  return /(?:شو|ايش|إيش|ما).{0,22}(?:مطلوب|الخطوه|الخطوة|اعمل|اسوي|التالي|بعدين)|(?:شو\s+صار|وين\s+وصل|حاله\s+الطلب|حالة\s+الطلب)/.test(q);
}

function asksFeeReason(turn: InterpretedTurn) {
  const q = normalizeArabic(String(turn.rawText || ""));
  return /(?:ليش|لماذا|شو\s+سبب|ايش\s+سبب|لشو|شو\s+مقابل).{0,40}(?:رسوم|5\s*دنانير|٥\s*دنانير|خمس\s+دنانير|فتح\s+الملف)/.test(q);
}

export function shouldExplainCommercialStep(input: { state: ConversationState; truth: TruthBundle; turn: InterpretedTurn; explicitContinuationIntent: boolean; observedFullDisclosure?: boolean }) {
  const stage = applicationJourneyStage(input.truth.application);
  if (stage !== "preliminary_approved_waiting_decision") return false;
  if (asksFeeReason(input.turn)) return false;

  // Status / next-step questions after preliminary approval are the decision screen.
  // They must never decay into a stale status answer + tracking link.
  if (!input.explicitContinuationIntent && asksStatusOrNextStep(input.turn)) return true;

  if (input.observedFullDisclosure || commercialDisclosureDelivered(input.state, input.truth)) return false;
  return input.explicitContinuationIntent || input.turn.topics.includes("continuation");
}

export function resemblesFullCommercialDisclosure(value: string | null | undefined) {
  const q = normalizeArabic(String(value || ""));
  const declineChoice = /لا\s+اريد\s+الاستمرار/.test(q)
    || /(?:2|٢).{0,24}(?:لا|مش\s+هسا)/.test(q);
  return /موافقه\s+مبدئيه/.test(q)
    && /هل.{0,20}(?:ترغب|بدك|حاب).{0,25}(?:الاستمرار|تكمل)/.test(q)
    && /(?:1|١).{0,18}(?:نعم|استمرار|اكمل|كمل)/.test(q)
    && declineChoice
    && /رسوم\s+فتح\s+الملف/.test(q)
    && /مسترد/.test(q);
}

export function resemblesPostDisclosurePaymentReply(value: string | null | undefined) {
  const q = normalizeArabic(String(value || ""));
  return /رسوم\s+فتح\s+الملف/.test(q)
    && /(?:orange\s+money|اورنج\s+موني|أورنج\s+موني)/i.test(q)
    && /(?:cliq|كليك)/i.test(q)
    && /(?:payameeen|ameen1st|am500337)/i.test(q)
    && /(?:رفع\s+الوصل|ارفع\s+الوصل|رابط\s+رفع)/.test(q);
}

export function buildInformedCommercialDisclosureReply(truth: TruthBundle) {
  const fee = truth.policy.fileOpeningFeeJod;
  return `طلبك أخذ موافقة مبدئية ✅\n\nهل ترغب بالاستمرار للدراسة النهائية؟\n1 - نعم، أريد الاستمرار\n2 - لا، مش هسا\n\nعند اختيار 1، رسوم فتح الملف ${fee} دنانير، وهي مستردة إذا ما صدرت الموافقة النهائية.`;
}

export function buildPostDisclosurePaymentReply(truth: TruthBundle, receiptUrl: string | null) {
  const stage = applicationJourneyStage(truth.application);
  // Hard commercial invariant: payment destinations are never exposed from an
  // affirmative chat message alone. The continuation decision must first be
  // durably reflected in authoritative application truth.
  if (stage !== "continuation_confirmed_fee_due") {
    return "وصل اختيارك بالاستمرار، لكن القرار لسا ما تثبّت على الطلب بشكل موثوق. لذلك ما رح أعطيك بيانات دفع قبل ما يثبت الاستمرار بالنظام. جرّب معي بعد شوي من نفس المحادثة.";
  }

  const p = truth.policy;
  const upload = receiptUrl
    ? `\nارفع الوصل من الرابط الرسمي:\n${receiptUrl}`
    : "\nرابط رفع الوصل المرتبط بالطلب غير متاح عندي الآن، لذلك ما رح أعطيك رابطًا عامًا بدل الصحيح.";
  return `تمام. المطلوب الآن ${p.fileOpeningFeeJod} دنانير رسوم فتح الملف.\n${currentFileOpeningPaymentRule({ includeApology: false })}${upload}`;
}
