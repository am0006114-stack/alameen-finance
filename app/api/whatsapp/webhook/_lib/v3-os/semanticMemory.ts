import type { ConversationState, InterpretedTurn, SemanticMemoryEntry, SemanticMemoryState } from "./types";

function stamp() { return new Date().toISOString(); }

export function emptySemanticMemory(): SemanticMemoryState {
  return {
    revision: 0,
    activeGoal: null,
    activeQuestion: null,
    activeQuestionTurnId: null,
    lastMeaningSummary: null,
    continuationDecision: "unknown",
    continuationCondition: null,
    entries: [],
    episodes: [],
    updatedAt: stamp(),
  };
}

function upsertEntry(entries: SemanticMemoryEntry[], next: SemanticMemoryEntry) {
  const index = entries.findIndex((entry) => entry.key === next.key);
  if (index >= 0) entries[index] = next;
  else entries.push(next);
  return entries.slice(-80);
}

function clean(value: string | null | undefined, max = 360) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

export function updateSemanticMemoryFromTurn(input: { state: ConversationState; turn: InterpretedTurn }): SemanticMemoryState {
  const current = input.state.semanticMemory || emptySemanticMemory();
  const frame = input.turn.semantic;
  const now = stamp();
  if (!frame) return { ...current, revision: current.revision + 1, updatedAt: now };

  let entries = [...current.entries];
  if (frame.customerGoal) {
    entries = upsertEntry(entries, {
      key: "active_goal",
      value: clean(frame.customerGoal),
      kind: "goal",
      confidence: frame.confidence,
      sourceTurnId: input.turn.turnId,
      updatedAt: now,
    });
  }
  if (frame.decision.continuation !== "unknown") {
    entries = upsertEntry(entries, {
      key: "continuation_decision",
      value: frame.decision.continuation,
      kind: "decision",
      confidence: frame.confidence,
      sourceTurnId: input.turn.turnId,
      updatedAt: now,
    });
  }
  if (frame.decision.condition) {
    entries = upsertEntry(entries, {
      key: "continuation_condition",
      value: clean(frame.decision.condition),
      kind: "constraint",
      confidence: frame.confidence,
      sourceTurnId: input.turn.turnId,
      updatedAt: now,
    });
  }
  if (frame.currentQuestion) {
    entries = upsertEntry(entries, { key: "last_current_question", value: clean(frame.currentQuestion, 420), kind: "goal", confidence: frame.confidence, sourceTurnId: input.turn.turnId, updatedAt: now });
  }
  if (frame.decision.cancellation !== "unknown") {
    entries = upsertEntry(entries, { key: "cancellation_semantic_decision", value: frame.decision.cancellation, kind: "decision", confidence: frame.confidence, sourceTurnId: input.turn.turnId, updatedAt: now });
  }
  if (frame.decision.refund !== "unknown") {
    entries = upsertEntry(entries, { key: "refund_semantic_decision", value: frame.decision.refund, kind: "decision", confidence: frame.confidence, sourceTurnId: input.turn.turnId, updatedAt: now });
  }
  if (frame.decision.aliasConfirmation !== "unknown") {
    entries = upsertEntry(entries, { key: "alias_semantic_decision", value: frame.decision.aliasConfirmation, kind: "decision", confidence: frame.confidence, sourceTurnId: input.turn.turnId, updatedAt: now });
  }
  if (frame.correctionOfPrevious) {
    entries = upsertEntry(entries, { key: "last_turn_is_correction", value: clean(frame.meaningSummary, 420), kind: "reference", confidence: frame.confidence, sourceTurnId: input.turn.turnId, updatedAt: now });
  }
  for (const ref of frame.references.slice(0, 10)) {
    const surface = clean(ref.surface, 100);
    if (!surface) continue;
    entries = upsertEntry(entries, { key: `reference:${surface.toLowerCase()}`, value: clean(ref.refersTo, 180) || "unresolved", kind: "reference", confidence: ref.confidence, sourceTurnId: input.turn.turnId, updatedAt: now });
  }
  for (const entity of frame.entities.slice(0, 12)) {
    const surface = clean(entity.surface, 120);
    if (!surface) continue;
    entries = upsertEntry(entries, {
      key: `entity:${entity.kind}:${surface.toLowerCase()}`,
      value: JSON.stringify({ surface, kind: entity.kind, role: entity.role, knownFactStatus: entity.knownFactStatus, countryHint: entity.countryHint }),
      kind: "entity",
      confidence: entity.confidence,
      sourceTurnId: input.turn.turnId,
      updatedAt: now,
    });
  }

  const activeQuestion = frame.socialClosure && !frame.currentQuestion ? null : clean(frame.currentQuestion, 420) || null;
  const episode = {
    turnId: input.turn.turnId,
    customerMeaning: clean(frame.meaningSummary || input.turn.rawText, 420),
    currentQuestion: activeQuestion,
    customerGoal: clean(frame.customerGoal, 260) || null,
    continuationDecision: frame.decision.continuation,
    assistantAnswer: null,
    createdAt: now,
  };

  return {
    revision: current.revision + 1,
    activeGoal: clean(frame.customerGoal, 260) || current.activeGoal,
    activeQuestion,
    activeQuestionTurnId: activeQuestion ? input.turn.turnId : null,
    lastMeaningSummary: clean(frame.meaningSummary, 420) || current.lastMeaningSummary,
    continuationDecision: frame.decision.continuation !== "unknown" ? frame.decision.continuation : current.continuationDecision,
    continuationCondition: frame.decision.condition ? clean(frame.decision.condition, 320) : (frame.decision.continuation === "confirmed" || frame.decision.continuation === "declined" ? null : current.continuationCondition),
    entries,
    episodes: [...current.episodes, episode].slice(-24),
    updatedAt: now,
  };
}

export function finalizeSemanticMemoryAfterReply(input: { state: ConversationState; turn: InterpretedTurn; reply: string | null | undefined; answered: boolean }): SemanticMemoryState {
  const current = input.state.semanticMemory || emptySemanticMemory();
  const reply = clean(input.reply, 520) || null;
  const episodes = current.episodes.map((episode) => episode.turnId === input.turn.turnId ? { ...episode, assistantAnswer: reply } : episode).slice(-24);
  return {
    ...current,
    activeQuestion: input.answered && current.activeQuestionTurnId === input.turn.turnId ? null : current.activeQuestion,
    activeQuestionTurnId: input.answered && current.activeQuestionTurnId === input.turn.turnId ? null : current.activeQuestionTurnId,
    episodes,
    updatedAt: stamp(),
  };
}

export function semanticMemoryForPrompt(state: ConversationState) {
  const memory = state.semanticMemory || emptySemanticMemory();
  return {
    revision: memory.revision,
    activeGoal: memory.activeGoal,
    activeQuestion: memory.activeQuestion,
    activeQuestionTurnId: memory.activeQuestionTurnId,
    lastMeaningSummary: memory.lastMeaningSummary,
    continuationDecision: memory.continuationDecision,
    continuationCondition: memory.continuationCondition,
    entries: memory.entries.slice(-30),
    episodes: memory.episodes.slice(-10),
  };
}
