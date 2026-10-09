import type { V4Persona, V4TurnUnderstanding, V4WorkingMemory } from "./types";
import { normalizeForFingerprint } from "./workingMemory";

const PERSONA_BY_NAME: Array<[RegExp, V4Persona]> = [
  [/(?:عمران)/, "omran"],
  [/(?:خالد)/, "khaled"],
  [/(?:عبد\s*الله|عبدالله)/, "abdullah"],
  [/(?:عبد\s*الرحمن|عبدالرحمن)/, "abdulrahman"],
  [/(?:تالا)/, "tala"],
  [/(?:فدوة|فدوه)/, "fadwa"],
];

function n(value: string | null | undefined) {
  return normalizeForFingerprint(value);
}

function asksIdentity(q: string) {
  return /(?:انت|انتي).{0,28}(?:بني ادم|بني آدم|انسان|إنسان|رد الي|رد آلي|بوت|ذكاء اصطناعي)|(?:مين|من).{0,18}(?:معي|بحكي معي|اللي بحكي معي)/.test(q);
}

function asksForBrevity(q: string) {
  return /(?:بدون فلسفه|بلا فلسفه|من الاخر|من الآخر|خلصني|جاوبني بس|جواب مباشر|اختصر|لا تطول|بلا هالحكي|بلا هل حكي)/.test(q);
}

function rejectsPrevious(q: string) {
  return /(?:مش هذا سؤالي|ما جاوبتني|نفس الحكي|نفس الكلام|بلا هالحكي|بلا هل حكي|ردك ضعيف|ما بدي نفس الرد|لا تعيد|ليش بتعيد|فهمت عليك بس)/.test(q);
}

function requestsSilence(q: string) {
  return /(?:ما في داعي للرد|مافي داعي للرد|لا ترد|ما ترد|خلص لا ترد|مش لازم ترد)/.test(q);
}

function requestsRealHuman(q: string) {
  return /(?:بدي|اريد|أريد|خليني).{0,30}(?:موظف حقيقي|موظف فعلي|شخص حقيقي|انسان حقيقي|إنسان حقيقي|بني ادم حقيقي|بني آدم حقيقي)|(?:حولني|حوّلني).{0,20}(?:لموظف|لانسان|لإنسان)/.test(q);
}

function requestedPersona(q: string): V4Persona | null {
  for (const [pattern, persona] of PERSONA_BY_NAME) {
    if (pattern.test(q) && /(?:وين|بدي|اريد|أريد|معي|احكي|أحكي|حكيني|حولني|حوّلني|ناديل|اعطيني)/.test(q)) return persona;
  }
  return null;
}

function looksLikeFreshQuestion(q: string) {
  return /(?:^|\s)(?:هل|ليش|لماذا|متى|وين|اين|أين|كيف|كم|قديش|شو|ايش|إيش|مين|من|رح|راح|بقدر|اقدر|أقدر)(?:\s|$)/.test(q) || /[؟?]/.test(q);
}

/**
 * This guard does NOT replace the model. It only enforces small, safety-critical
 * conversational truths that must never be lost to stale memory or a bad parse.
 */
export function enforceCurrentTurnUnderstanding(input: {
  burstText: string;
  model: V4TurnUnderstanding;
  memory: V4WorkingMemory;
}): V4TurnUnderstanding {
  const q = n(input.burstText);
  const out: V4TurnUnderstanding = { ...input.model, warnings: [...input.model.warnings] };

  const persona = requestedPersona(q);
  if (persona) {
    out.requestedPersona = persona;
    out.humanContactRequested = false;
    out.currentGoal = out.currentGoal || `talk_to_${persona}`;
    out.topicChanged = persona !== input.memory.persona || out.topicChanged;
    out.warnings.push("deterministic_named_persona_request");
  }

  if (asksIdentity(q)) {
    out.identityQuestion = true;
    out.currentGoal = out.currentGoal || "identify_current_team_member";
    out.warnings.push("deterministic_identity_question");
  }

  if (asksForBrevity(q)) {
    out.customerWantsBrevity = true;
    out.warnings.push("deterministic_brevity_request");
  }

  if (rejectsPrevious(q)) {
    out.customerRejectedPreviousAnswer = true;
    out.warnings.push("deterministic_previous_answer_rejection");
  }

  if (requestsSilence(q) && !out.requestedAction) {
    out.noReplyRequested = true;
    out.warnings.push("deterministic_no_reply_request");
  }

  if (requestsRealHuman(q)) {
    out.humanContactRequested = true;
    out.requestedPersona = null;
    out.currentGoal = "real_human_contact";
    out.warnings.push("deterministic_real_human_request");
  }

  // Fresh questions must never be swallowed by an old pending procedure.
  if (looksLikeFreshQuestion(q) && !out.requestedAction && out.actionDisposition === "confirm") {
    out.actionDisposition = "none";
    out.warnings.push("fresh_question_cancelled_false_confirmation");
  }

  out.warnings = Array.from(new Set(out.warnings));
  return out;
}
