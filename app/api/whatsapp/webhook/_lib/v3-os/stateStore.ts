import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { V3_OS_VERSION, type ConversationState } from "./types";

const TABLE = "whatsapp_v3_conversation_state";

function compactState(state: ConversationState): ConversationState {
  return {
    ...state,
    openLoops: state.openLoops.slice(-60),
    facts: state.facts.slice(-120),
  };
}

export async function loadV3ConversationState(waId: string): Promise<ConversationState | null> {
  const clean = String(waId || "").trim();
  if (!clean) return null;
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("state")
    .eq("wa_id", clean)
    .maybeSingle();
  if (error) throw new Error(`v3_state_load:${error.message}`);
  const state = data?.state as ConversationState | null | undefined;
  if (!state?.waId) return null;
  return {
    ...state,
    pendingAction: state.pendingAction || null,
    pendingActionPayload: state.pendingActionPayload || null,
  };
}

export async function saveV3ConversationState(state: ConversationState): Promise<void> {
  const safe = compactState(state);
  const { error } = await supabaseAdmin
    .from(TABLE)
    .upsert({
      wa_id: safe.waId,
      state: safe,
      active_application_id: safe.activeApplicationId,
      active_tracking_id: safe.activeTrackingId,
      ai_role: safe.role.currentRole,
      runtime_version: V3_OS_VERSION,
      updated_at: new Date().toISOString(),
    }, { onConflict: "wa_id" });
  if (error) throw new Error(`v3_state_save:${error.message}`);
}

export async function resetV3ConversationState(waId: string): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLE).delete().eq("wa_id", String(waId || "").trim());
  if (error) throw new Error(`v3_state_reset:${error.message}`);
}
