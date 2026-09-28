import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ActionResult, ConversationState, TruthBundle } from "./types";
import type { CompactHumanMemory } from "./compactHumanMemory";
import type { HumanModelTier } from "./modelCostLadder";

export type HumanTurnJournal = {
  turn_id: string;
  wa_id: string;
  incoming_message_id: string | null;
  status: "started" | "interpreted" | "decided" | "reply_ready" | "delivered" | "completed" | "failed";
  model_tier: HumanModelTier | null;
  model_calls: number;
  meaning_json: Record<string, unknown> | null;
  truth_json: Record<string, unknown> | null;
  actions_json: unknown[] | null;
  final_reply: string | null;
  state_after_json: Record<string, unknown> | null;
  memory_after_json: Record<string, unknown> | null;
  provider_message_id: string | null;
};

export async function loadHumanTurnJournal(turnId: string): Promise<HumanTurnJournal | null> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_turn_journal")
    .select("turn_id,wa_id,incoming_message_id,status,model_tier,model_calls,meaning_json,truth_json,actions_json,final_reply,state_after_json,memory_after_json,provider_message_id")
    .eq("turn_id", turnId)
    .maybeSingle();
  if (error) throw new Error(`turn_journal_read_failed:${error.message}`);
  return (data || null) as HumanTurnJournal | null;
}

export async function beginHumanTurn(input: { turnId: string; waId: string; incomingMessageId?: string | null; customerText: string }) {
  const { error } = await supabaseAdmin.from("whatsapp_turn_journal").upsert({
    turn_id: input.turnId,
    wa_id: input.waId,
    incoming_message_id: input.incomingMessageId || input.turnId,
    customer_text: input.customerText,
    status: "started",
    updated_at: new Date().toISOString(),
  }, { onConflict: "turn_id", ignoreDuplicates: true });
  if (error) throw new Error(`turn_journal_begin_failed:${error.message}`);
}

export async function checkpointHumanTurn(input: {
  turnId: string;
  status: HumanTurnJournal["status"];
  modelTier?: HumanModelTier | null;
  modelCalls?: number;
  meaning?: Record<string, unknown> | null;
  truth?: TruthBundle | null;
  actions?: ActionResult[] | null;
  finalReply?: string | null;
  stateAfter?: ConversationState | null;
  memoryAfter?: CompactHumanMemory | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const patch: Record<string, unknown> = { status: input.status, updated_at: new Date().toISOString() };
  if (input.modelTier !== undefined) patch.model_tier = input.modelTier;
  if (input.modelCalls !== undefined) patch.model_calls = input.modelCalls;
  if (input.meaning !== undefined) patch.meaning_json = input.meaning;
  if (input.truth !== undefined) patch.truth_json = input.truth;
  if (input.actions !== undefined) patch.actions_json = input.actions;
  if (input.finalReply !== undefined) patch.final_reply = input.finalReply;
  if (input.stateAfter !== undefined) patch.state_after_json = input.stateAfter;
  if (input.memoryAfter !== undefined) patch.memory_after_json = input.memoryAfter;
  if (input.errorCode !== undefined) patch.error_code = input.errorCode;
  if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;
  const { error } = await supabaseAdmin.from("whatsapp_turn_journal").update(patch).eq("turn_id", input.turnId);
  if (error) throw new Error(`turn_journal_checkpoint_failed:${error.message}`);
}

export async function completeHumanTurnDelivery(input: { turnId: string; providerMessageId: string; memoryAfter?: CompactHumanMemory | null }) {
  const { error } = await supabaseAdmin.from("whatsapp_turn_journal").update({
    status: "completed",
    provider_message_id: input.providerMessageId,
    delivered_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("turn_id", input.turnId);
  if (error) throw new Error(`turn_journal_complete_failed:${error.message}`);
}
