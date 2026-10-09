import type { ActionKey, ConversationState } from "../v3-os/types";
import { answerFingerprint, emptyV4WorkingMemory } from "./workingMemory";
import type { V4ActionName, V4Emotion, V4PendingProcedure, V4Persona, V4WorkingMemory } from "./types";

function now() { return new Date().toISOString(); }

function personaFromV3(state: ConversationState): V4Persona {
  const role = state.role?.currentRole;
  if (role === "tala" || role === "fadwa" || role === "abdullah" || role === "abdulrahman" || role === "omran") return role;
  return "abdullah";
}

function emotionFromV3(value: string | null | undefined): V4Emotion {
  if (value === "warm" || value === "confused" || value === "frustrated" || value === "angry" || value === "pleading") return value;
  return "neutral";
}

function actionFromV3(action: ActionKey | null | undefined): V4ActionName | null {
  switch (action) {
    case "cancel_application": return "cancel_application";
    case "request_refund": return "request_refund";
    case "stop_refund": return "stop_refund";
    case "change_application_data": return "change_application_data";
    case "change_device": return "change_device";
    case "reopen_application": return "reopen_application";
    case "link_whatsapp_alias": return "link_whatsapp_alias";
    case "continue_application": return "continue_application";
    default: return null;
  }
}

function scopedPendingProcedure(state: ConversationState): V4PendingProcedure | null {
  const action = actionFromV3(state.pendingAction);
  if (!action) return null;
  const payload = state.pendingActionPayload || null;

  // Never carry a legacy mutation into V4 unless V3 had already scoped it to the
  // current application/sender. This is a cutover safety boundary, not a convenience.
  const appScope = String(payload?._scopeApplicationId || "").trim();
  const trackingScope = String(payload?._scopeTrackingId || "").trim();
  const senderScope = String(payload?._scopeWaId || "").trim();
  const currentApp = String(state.activeApplicationId || "").trim();
  const currentTracking = String(state.activeTrackingId || "").trim();
  const currentSender = String(state.waId || "").trim();
  const scopeProven = Boolean(
    appScope && currentApp && appScope === currentApp &&
    (!trackingScope || !currentTracking || trackingScope === currentTracking) &&
    (!senderScope || senderScope === currentSender)
  );
  if (!scopeProven) return null;

  return {
    name: action,
    state: "confirmation_required",
    requestedAtTurnId: state.lastTurnId || "v3-cutover",
    confirmedAtTurnId: null,
    executedAtTurnId: null,
    payload: payload as Record<string, unknown>,
    lastError: null,
  };
}

function migrateEpisodes(state: ConversationState, persona: V4Persona) {
  const episodes = state.semanticMemory?.episodes || [];
  return episodes.slice(-12).map((episode) => ({
    turnId: episode.turnId,
    customerText: "",
    meaningSummary: episode.customerMeaning || episode.currentQuestion || "سياق سابق من V3",
    goal: episode.customerGoal || null,
    assistantText: episode.assistantAnswer || null,
    persona,
    emotion: emotionFromV3(state.humanRelationship?.lastEmotion),
    createdAt: episode.createdAt,
  }));
}

/**
 * One-time in-place cutover bridge. V4 starts from the useful conversational context
 * already accumulated by V3, but refuses to inherit unsafe/stale transactional state.
 * No new SQL table is required: callers may store the resulting V4 memory inside the
 * existing JSON conversation state envelope when the real cutover is approved.
 */
export function migrateV3ConversationStateToV4(state: ConversationState): V4WorkingMemory {
  const persona = personaFromV3(state);
  const memory = emptyV4WorkingMemory(state.waId, persona);
  const activeGoal = state.semanticMemory?.activeGoal || state.currentGoal || null;
  const activeQuestion = state.semanticMemory?.activeQuestion || null;

  memory.activeGoal = activeGoal;
  memory.activeGoalTurnId = state.semanticMemory?.activeQuestionTurnId || state.lastTurnId || null;
  memory.currentEmotion = emotionFromV3(state.humanRelationship?.lastEmotion);
  memory.frustrationStreak = Math.max(0, Math.min(20, Number(state.humanRelationship?.frustrationStreak || 0)));
  memory.prefersBriefReplies = Boolean(state.conversationConstraints?.avoidRepetition && memory.frustrationStreak > 0);
  memory.repetitionSensitivity = state.conversationConstraints?.avoidRepetition ? Math.min(10, 3 + memory.frustrationStreak) : 0;
  memory.lastCustomerText = state.lastCustomerText || null;
  memory.lastAssistantText = state.lastAssistantText || null;
  memory.lastAssistantFingerprint = answerFingerprint(memory.lastAssistantText);
  memory.pendingProcedure = scopedPendingProcedure(state);
  memory.episodes = migrateEpisodes(state, persona);

  if (activeQuestion) {
    memory.openQuestions = [{
      text: activeQuestion,
      turnId: state.semanticMemory?.activeQuestionTurnId || state.lastTurnId || "v3-cutover",
      answered: false,
      active: true,
    }];
  }

  const entries = state.semanticMemory?.entries || [];
  memory.customerDecisions = entries
    .filter((entry) => entry.kind === "decision")
    .slice(-12)
    .map((entry) => ({ key: entry.key, value: entry.value, turnId: entry.sourceTurnId, updatedAt: entry.updatedAt }));

  memory.updatedAt = now();
  return memory;
}
