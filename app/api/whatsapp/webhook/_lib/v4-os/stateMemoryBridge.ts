import type { ConversationState } from "../v3-os/types";
import { answerFingerprint, emptyV4WorkingMemory } from "./workingMemory";
import { V4_OS_VERSION, type V4Emotion, type V4Persona, type V4WorkingMemory } from "./types";

type StateWithV4Memory = ConversationState & {
  v4ConversationMemory?: V4WorkingMemory | null;
};

function personaFromV3(state: ConversationState): V4Persona {
  const role = state.role?.currentRole;
  if (role === "tala" || role === "fadwa" || role === "abdullah" || role === "abdulrahman" || role === "omran") return role;
  return "abdullah";
}

function emotionFromV3(state: ConversationState): V4Emotion {
  const emotion = state.humanRelationship?.lastEmotion;
  if (emotion === "neutral" || emotion === "warm" || emotion === "confused" || emotion === "frustrated" || emotion === "angry" || emotion === "pleading") return emotion;
  return "neutral";
}

function normalizeStoredMemory(memory: V4WorkingMemory, conversationId: string, persona: V4Persona): V4WorkingMemory {
  const base = emptyV4WorkingMemory(conversationId, persona);
  return {
    ...base,
    ...memory,
    version: V4_OS_VERSION,
    conversationId,
    persona: memory.persona || persona,
    openQuestions: Array.isArray(memory.openQuestions)
      ? memory.openQuestions.slice(-30).map((q) => ({ ...q, active: q.active !== false }))
      : [],
    customerDecisions: Array.isArray(memory.customerDecisions) ? memory.customerDecisions.slice(-40) : [],
    factsAlreadyExplained: Array.isArray(memory.factsAlreadyExplained) ? memory.factsAlreadyExplained.slice(-80) : [],
    rejectedAnswerFingerprints: Array.isArray(memory.rejectedAnswerFingerprints) ? memory.rejectedAnswerFingerprints.slice(-20) : [],
    episodes: Array.isArray(memory.episodes) ? memory.episodes.slice(-18) : [],
  };
}

function seedEpisodesFromV3(state: ConversationState, persona: V4Persona, emotion: V4Emotion) {
  const episodes = state.semanticMemory?.episodes || [];
  return episodes.slice(-12).map((episode) => ({
    turnId: episode.turnId,
    customerText: "",
    meaningSummary: episode.customerMeaning || episode.currentQuestion || "سياق سابق من V3",
    goal: episode.customerGoal || null,
    assistantText: episode.assistantAnswer || null,
    persona,
    emotion,
    createdAt: episode.createdAt,
  }));
}

function seedDecisionsFromV3(state: ConversationState) {
  const entries = state.semanticMemory?.entries || [];
  return entries
    .filter((entry) => entry.kind === "decision")
    .slice(-20)
    .map((entry) => ({
      key: entry.key,
      value: entry.value,
      turnId: entry.sourceTurnId,
      updatedAt: entry.updatedAt,
    }));
}

/**
 * V4 keeps its memory inside the existing JSON conversation-state document.
 * No SQL migration or new table is required. If a customer already has V3 state,
 * V4 seeds useful conversational context but deliberately refuses to inherit a
 * destructive pending action. Any unfinished mutation must be understood again by
 * V4 and confirmed under the V4 procedure contract after cutover.
 */
export function loadV4MemoryFromConversationState(state: ConversationState): V4WorkingMemory {
  const conversationId = String(state.waId || "").trim();
  const persona = personaFromV3(state);
  const embedded = (state as StateWithV4Memory).v4ConversationMemory;
  if (embedded && embedded.version === V4_OS_VERSION) {
    return normalizeStoredMemory(embedded, conversationId, persona);
  }

  const emotion = emotionFromV3(state);
  const memory = emptyV4WorkingMemory(conversationId, persona);
  const activeQuestion = state.semanticMemory?.activeQuestion || null;
  const activeQuestionTurnId = state.semanticMemory?.activeQuestionTurnId || state.lastTurnId || "v3-cutover";

  memory.activeGoal = state.semanticMemory?.activeGoal || state.currentGoal || null;
  memory.activeGoalTurnId = state.semanticMemory?.activeQuestionTurnId || state.lastTurnId || null;
  memory.lastCustomerText = state.lastCustomerText || null;
  memory.lastAssistantText = state.lastAssistantText || null;
  memory.lastAssistantFingerprint = answerFingerprint(memory.lastAssistantText);
  memory.currentEmotion = emotion;
  memory.frustrationStreak = Math.max(0, Math.min(20, Number(state.humanRelationship?.frustrationStreak || 0)));
  memory.humanContactRequested = state.currentTopic === "human_request" || state.currentTopic === "manager_request";
  memory.prefersBriefReplies = Boolean(state.conversationConstraints?.avoidRepetition && memory.frustrationStreak > 0);
  memory.repetitionSensitivity = state.conversationConstraints?.avoidRepetition
    ? Math.min(10, 3 + memory.frustrationStreak)
    : 0;

  if (activeQuestion) {
    memory.openQuestions = [{
      text: activeQuestion,
      turnId: activeQuestionTurnId,
      answered: false,
      active: true,
    }];
  }

  memory.customerDecisions = seedDecisionsFromV3(state);
  memory.episodes = seedEpisodesFromV3(state, persona, emotion);

  // Hard cutover boundary: never inherit a V3 pending mutation. This prevents an
  // old cancel/refund/reopen confirmation from owning the first fresh V4 turn.
  memory.pendingProcedure = null;
  return memory;
}

export function attachV4MemoryToConversationState(state: ConversationState, memory: V4WorkingMemory): ConversationState {
  return {
    ...state,
    v4ConversationMemory: normalizeStoredMemory(memory, String(state.waId || "").trim(), personaFromV3(state)),
  } as StateWithV4Memory;
}
