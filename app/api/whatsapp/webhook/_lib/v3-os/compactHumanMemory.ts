import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type CompactHumanMemory = {
  revision: number;
  activeGoal: string | null;
  currentQuestion: string | null;
  lastMeaning: string | null;
  continuation: "confirmed" | "declined" | "deferred" | "conditional" | "unknown";
  continuationCondition: string | null;
  emotionalState: string | null;
  concern: string | null;
  pendingAction: string | null;
  activeTrackingId: string | null;
  durableFacts: Array<{ key: string; value: string }>;
  openLoops: Array<{ topic: string; question: string | null }>;
  updatedAt: string;
};

export function memoryFromConversationState(state: ConversationState): CompactHumanMemory {
  const semantic = state.semanticMemory;
  return {
    revision: Math.max(0, Number(semantic?.revision || 0)),
    activeGoal: semantic?.activeGoal || state.currentGoal || null,
    currentQuestion: semantic?.activeQuestion || null,
    lastMeaning: semantic?.lastMeaningSummary || null,
    continuation: semantic?.continuationDecision || "unknown",
    continuationCondition: semantic?.continuationCondition || null,
    emotionalState: state.humanRelationship?.lastEmotion || null,
    concern: state.humanRelationship?.lastConcern || null,
    pendingAction: state.pendingAction || null,
    activeTrackingId: state.activeTrackingId || null,
    durableFacts: state.facts.slice(-12).map((fact) => ({ key: fact.key, value: fact.value })),
    openLoops: state.openLoops.filter((loop) => loop.state === "open").slice(-6).map((loop) => ({ topic: loop.topic, question: loop.question || null })),
    updatedAt: new Date().toISOString(),
  };
}

export async function loadCompactHumanMemory(waId: string, fallback: ConversationState): Promise<CompactHumanMemory> {
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_human_memory")
      .select("memory,revision")
      .eq("wa_id", waId)
      .maybeSingle();
    if (!error && data?.memory && typeof data.memory === "object") {
      const m = data.memory as Partial<CompactHumanMemory>;
      return { ...memoryFromConversationState(fallback), ...m, revision: Number(data.revision || m.revision || 0) };
    }
  } catch {}
  return memoryFromConversationState(fallback);
}

export function nextCompactHumanMemory(input: {
  before: CompactHumanMemory;
  stateAfter: ConversationState;
  turn: InterpretedTurn;
  truth: TruthBundle;
}): CompactHumanMemory {
  const semantic = input.turn.semantic;
  return {
    ...memoryFromConversationState(input.stateAfter),
    revision: Math.max(input.before.revision + 1, Number(input.stateAfter.semanticMemory?.revision || 0)),
    activeGoal: semantic?.customerGoal || input.stateAfter.semanticMemory?.activeGoal || input.before.activeGoal,
    currentQuestion: semantic?.currentQuestion || null,
    lastMeaning: semantic?.meaningSummary || input.before.lastMeaning,
    continuation: semantic?.decision.continuation || input.before.continuation,
    continuationCondition: semantic?.decision.condition || null,
    activeTrackingId: input.truth.application?.trackingId || input.stateAfter.activeTrackingId || input.before.activeTrackingId,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveCompactHumanMemory(waId: string, memory: CompactHumanMemory) {
  const { error } = await supabaseAdmin
    .from("whatsapp_human_memory")
    .upsert({ wa_id: waId, revision: memory.revision, memory, updated_at: new Date().toISOString() }, { onConflict: "wa_id" });
  if (error) throw new Error(`human_memory_save_failed:${error.message}`);
}
