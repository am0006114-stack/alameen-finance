import type { V3TextProvider } from "../v3-os/provider";
import { createV4ModelAdapter } from "./modelAdapter";
import { buildJourneyDirectorDraft, JOURNEY_DIRECTOR_NOTE, resolveJourneyDirectorUnderstanding } from "./journeyDirector";
import type { V4ActionName, V4ModelAdapter, V4TurnUnderstanding, V4WorkingMemory } from "./types";

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

function directUnderstanding(input: {
  summary: string;
  goal: string;
  action: V4ActionName;
  disposition: V4TurnUnderstanding["actionDisposition"];
  warning: string;
  human?: boolean;
}): V4TurnUnderstanding {
  return {
    meaningSummary: input.summary,
    currentGoal: input.goal,
    explicitQuestions: [],
    neededFactKeys: [],
    requestedAction: input.action,
    actionDisposition: input.disposition,
    requestedPersona: null,
    references: [],
    emotion: "neutral",
    urgency: input.human ? "urgent" : "normal",
    topicChanged: false,
    customerRejectedPreviousAnswer: false,
    customerWantsBrevity: true,
    noReplyRequested: false,
    identityQuestion: false,
    humanContactRequested: Boolean(input.human),
    socialClosure: false,
    confidence: 1,
    warnings: [input.warning, "v4_1_current_turn_authority"],
  };
}

function socialClosureUnderstanding(): V4TurnUnderstanding {
  return {
    meaningSummary: "العميل أقرّ بالرسالة بدون اختيار الاستمرار أو الرفض",
    currentGoal: "social_closure",
    explicitQuestions: [],
    neededFactKeys: [],
    requestedAction: null,
    actionDisposition: "none",
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
    socialClosure: true,
    confidence: 1,
    warnings: ["journey_director:social_closure", "v4_1_preliminary_ack_not_consent"],
  };
}

function preliminaryDecisionOverride(input: { burstText: string; truth: { facts: Record<string, { value: unknown }> } }): V4TurnUnderstanding | null {
  const stage = String(input.truth.facts["application.journey_stage"]?.value || "");
  if (stage !== "preliminary_approved_waiting_decision") return null;
  const q = normalizeArabic(input.burstText);

  // 1 / ١ and explicit variants are consent. Plain تمام/OK is only acknowledgement.
  if (/^1(?:\s+(?:موافق|نعم|استمرار|اكمل|كمل))?$/.test(q)) {
    return directUnderstanding({
      summary: "العميل اختار الاستمرار صراحة من خيار الموافقة المبدئية",
      goal: "continue_after_preliminary_approval",
      action: "continue_application",
      disposition: "request",
      warning: "commercial_fastpath:continue",
    });
  }
  if (/^(?:تمام|اوكي|اوك)$/.test(q)) return socialClosureUnderstanding();
  return null;
}

function explicitHumanRejectionOfAutomation(burstText: string): V4TurnUnderstanding | null {
  const q = normalizeArabic(burstText);
  if (!/(?:ما\s+بدي|مش\s+بدي|لا\s+اريد).{0,15}(?:رد\s+الي|رد\s+آلي|بوت|روبوت)|(?:بدي|اريد).{0,20}(?:موظف|حد\s+حقيقي|انسان)/.test(q)) return null;
  return directUnderstanding({
    summary: "العميل يرفض الرد الآلي ويطلب تواصلًا بشريًا حقيقيًا",
    goal: "request_real_human_contact",
    action: "record_human_contact_request",
    disposition: "request",
    warning: "explicit_real_human_request:not_silence",
    human: true,
  });
}

function explicitLongWaitOverride(burstText: string): V4TurnUnderstanding | null {
  const q = normalizeArabic(burstText);
  const unit = /(?:يوم|ايام|اسبوع|اسابيع|شهر|شهور|اشهر|سنه|سنين|سنوات)/;
  const waitPhrase = /(?:صارلي|صار\s+لي|انتظرت|بستنى|استنى|استنيت|من)\s*.{0,24}/;
  const elapsed = new RegExp(`${waitPhrase.source}(?:\\d+\\s*)?${unit.source}`).test(q);
  const explicitTimeQuestion = /(?:كم|قديش|متى|امتى).{0,30}(?:وقت|مده|الرد|الموافقه)/.test(q);
  if (!elapsed && !explicitTimeQuestion) return null;
  return {
    meaningSummary: elapsed ? "العميل يعترض على طول الانتظار بمدة صريحة" : "العميل يسأل عن مدة المراجعة",
    currentGoal: "application_review_time",
    explicitQuestions: [burstText.trim()].filter(Boolean),
    neededFactKeys: ["application.status.customer", "application.journey_stage", "application.age_days", "review.normal_window", "refund.pressure_rule"],
    requestedAction: null,
    actionDisposition: "none",
    requestedPersona: null,
    references: [],
    emotion: elapsed ? "frustrated" : "neutral",
    urgency: elapsed ? "high" : "normal",
    topicChanged: false,
    customerRejectedPreviousAnswer: false,
    customerWantsBrevity: true,
    noReplyRequested: false,
    identityQuestion: false,
    humanContactRequested: false,
    socialClosure: false,
    confidence: 1,
    warnings: ["journey_director:review_time", "v4_1_explicit_wait_duration"],
  };
}

function confirmsVisiblePrompt(input: { burstText: string; memory: V4WorkingMemory }): V4TurnUnderstanding | null {
  const q = normalizeArabic(input.burstText);
  const last = normalizeArabic(input.memory.lastAssistantText);
  if (!q || !last) return null;

  // These are confirmations of a confirmation prompt that the customer actually saw.
  // This reconstructs authority even if a legacy/state migration missed pendingProcedure.
  const yes = /^(?:نعم|اه|ايوه|موافق|تمام)$/.test(q);

  if (/اعتمد\s+الرقم|اعتمد.*واتساب/.test(last) && (yes || /اعتمد\s+(?:الرقم|رقم\s+الواتساب)/.test(q))) {
    return directUnderstanding({
      summary: "العميل أكد اعتماد رقم واتساب بعد مطالبة واضحة ظهرت له",
      goal: "confirm_link_whatsapp_alias",
      action: "link_whatsapp_alias",
      disposition: "confirm",
      warning: "visible_prior_confirmation:link_whatsapp_alias",
    });
  }
  if (/نعم.*الغي\s+الطلب|اكتب.*الغي\s+الطلب/.test(last) && (yes || /الغي\s+(?:الطلب|طلبي)/.test(q))) {
    return directUnderstanding({
      summary: "العميل أكد إلغاء الطلب بعد مطالبة واضحة ظهرت له",
      goal: "confirm_cancel_application",
      action: "cancel_application",
      disposition: "confirm",
      warning: "visible_prior_confirmation:cancel_application",
    });
  }
  if (/نعم.*استرداد\s+الرسوم|اكتب.*استرداد\s+الرسوم/.test(last) && (yes || /استرداد\s+(?:الرسوم|المبلغ)/.test(q))) {
    return directUnderstanding({
      summary: "العميل أكد استرداد الرسوم بعد مطالبة واضحة ظهرت له",
      goal: "confirm_request_refund",
      action: "request_refund",
      disposition: "confirm",
      warning: "visible_prior_confirmation:request_refund",
    });
  }
  if (/اعيد\s+فتح\s+الطلب.*اكمل|اكتب.*اعيد\s+فتح/.test(last) && (yes || /اعيد\s+فتح\s+(?:الطلب|الملف)|اكمل\s+عليه/.test(q))) {
    return directUnderstanding({
      summary: "العميل أكد إعادة فتح الطلب بعد مطالبة واضحة ظهرت له",
      goal: "confirm_reopen_application",
      action: "reopen_application",
      disposition: "confirm",
      warning: "visible_prior_confirmation:reopen_application",
    });
  }

  return null;
}

/**
 * V4.1 puts deterministic current-turn/journey handling in front of paid model calls.
 * The base V4 model remains available for genuinely open-ended conversation, but it no
 * longer owns revenue steps, document upload, action confirmations, tracking gates,
 * status boilerplate, or other high-risk routine turns.
 */
export function createV41JourneyAwareModelAdapter(input: {
  understandingProvider: V3TextProvider;
  writerProvider: V3TextProvider;
  criticProvider: V3TextProvider;
}): V4ModelAdapter {
  const base = createV4ModelAdapter(input);

  return {
    async understand(req) {
      const explicitHuman = explicitHumanRejectionOfAutomation(req.burstText);
      if (explicitHuman) return explicitHuman;
      const visibleConfirmation = confirmsVisiblePrompt({ burstText: req.burstText, memory: req.memory });
      if (visibleConfirmation) return visibleConfirmation;
      const longWait = explicitLongWaitOverride(req.burstText);
      if (longWait) return longWait;
      const preliminaryOverride = preliminaryDecisionOverride({ burstText: req.burstText, truth: req.truth });
      if (preliminaryOverride) return preliminaryOverride;
      const directed = resolveJourneyDirectorUnderstanding(req);
      return directed || base.understand(req);
    },

    async compose(req) {
      const directed = buildJourneyDirectorDraft({
        burstText: req.burstText,
        understanding: req.understanding,
        memory: req.memory,
        truth: req.truth,
      });
      return directed || base.compose(req);
    },

    async critique(req) {
      if (req.draft.notes.includes(JOURNEY_DIRECTOR_NOTE)) {
        return { accepted: true, score: 1, reasons: [], repairInstructions: [] };
      }
      return base.critique(req);
    },
  };
}
