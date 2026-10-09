import { V4_OS_VERSION, type V4Persona, type V4TurnUnderstanding, type V4WorkingMemory } from "./types";

function now() { return new Date().toISOString(); }

export function emptyV4WorkingMemory(conversationId: string, persona: V4Persona = "abdullah"): V4WorkingMemory {
  return {
    version: V4_OS_VERSION,
    conversationId,
    persona,
    activeGoal: null,
    activeGoalTurnId: null,
    openQuestions: [],
    pendingProcedure: null,
    customerDecisions: [],
    factsAlreadyExplained: [],
    rejectedAnswerFingerprints: [],
    currentEmotion: "neutral",
    frustrationStreak: 0,
    humanContactRequested: false,
    lastCustomerText: null,
    lastAssistantText: null,
    lastAssistantFingerprint: null,
    updatedAt: now(),
  };
}

export function normalizeForFingerprint(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerFingerprint(value: string | null | undefined) {
  const n = normalizeForFingerprint(value);
  if (!n) return null;
  const words = n.split(" ").filter(Boolean);
  return words.slice(0, 40).join(" ");
}

export function semanticOverlap(a: string | null | undefined, b: string | null | undefined) {
  const aa = new Set(normalizeForFingerprint(a).split(" ").filter((x) => x.length > 1));
  const bb = new Set(normalizeForFingerprint(b).split(" ").filter((x) => x.length > 1));
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection += 1;
  const union = new Set([...aa, ...bb]).size;
  return union ? intersection / union : 0;
}

export function applyTurnUnderstanding(input: {
  memory: V4WorkingMemory;
  turnId: string;
  customerText: string;
  understanding: V4TurnUnderstanding;
}) {
  const s: V4WorkingMemory = JSON.parse(JSON.stringify(input.memory));
  s.version = V4_OS_VERSION;
  s.lastCustomerText = input.customerText;
  s.currentEmotion = input.understanding.emotion;
  s.humanContactRequested = input.understanding.humanContactRequested || s.humanContactRequested;

  const upset = ["frustrated", "angry", "anxious", "distrustful"].includes(input.understanding.emotion);
  s.frustrationStreak = upset ? Math.min(20, s.frustrationStreak + 1) : Math.max(0, s.frustrationStreak - 1);

  // Current-turn authority: a new understood goal replaces the old active goal.
  if (input.understanding.currentGoal) {
    const changed = input.understanding.topicChanged || input.understanding.currentGoal !== s.activeGoal;
    s.activeGoal = input.understanding.currentGoal;
    s.activeGoalTurnId = input.turnId;
    if (changed) {
      // Old unanswered questions remain in history, but are no longer allowed to own the reply.
      s.openQuestions = s.openQuestions.map((q) => ({ ...q, answered: q.answered || q.turnId !== input.turnId }));
    }
  }

  for (const q of input.understanding.explicitQuestions) {
    if (!q.trim()) continue;
    if (!s.openQuestions.some((x) => !x.answered && normalizeForFingerprint(x.text) === normalizeForFingerprint(q))) {
      s.openQuestions.push({ text: q, turnId: input.turnId, answered: false });
    }
  }
  s.openQuestions = s.openQuestions.slice(-30);

  if (input.understanding.customerRejectedPreviousAnswer && s.lastAssistantFingerprint) {
    if (!s.rejectedAnswerFingerprints.includes(s.lastAssistantFingerprint)) {
      s.rejectedAnswerFingerprints.push(s.lastAssistantFingerprint);
      s.rejectedAnswerFingerprints = s.rejectedAnswerFingerprints.slice(-20);
    }
  }

  s.updatedAt = now();
  return s;
}

export function finalizeV4Memory(input: {
  memory: V4WorkingMemory;
  assistantText: string | null;
  answeredQuestions: string[];
  explainedFactKeys?: string[];
}) {
  const s: V4WorkingMemory = JSON.parse(JSON.stringify(input.memory));
  s.lastAssistantText = input.assistantText;
  s.lastAssistantFingerprint = answerFingerprint(input.assistantText);

  const answeredNorm = new Set(input.answeredQuestions.map(normalizeForFingerprint));
  s.openQuestions = s.openQuestions.map((q) => answeredNorm.has(normalizeForFingerprint(q.text)) ? { ...q, answered: true } : q);

  for (const key of input.explainedFactKeys || []) {
    if (!s.factsAlreadyExplained.includes(key)) s.factsAlreadyExplained.push(key);
  }
  s.factsAlreadyExplained = s.factsAlreadyExplained.slice(-80);
  s.updatedAt = now();
  return s;
}

export function proposedAnswerRepeatsRejected(memory: V4WorkingMemory, proposed: string | null | undefined) {
  const fp = answerFingerprint(proposed);
  if (!fp) return false;
  if (memory.rejectedAnswerFingerprints.includes(fp)) return true;
  return memory.rejectedAnswerFingerprints.some((old) => semanticOverlap(old, fp) >= 0.72);
}

export function proposedAnswerRepeatsLast(memory: V4WorkingMemory, proposed: string | null | undefined) {
  if (!memory.lastAssistantText || !proposed) return false;
  return semanticOverlap(memory.lastAssistantText, proposed) >= 0.78;
}
