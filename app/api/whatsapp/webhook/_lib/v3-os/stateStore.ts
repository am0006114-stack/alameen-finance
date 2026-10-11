import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { V3_OS_VERSION, type ConversationState } from "./types";
import { emptySemanticMemory } from "./semanticMemory";
import { emptyCommercialDisclosure } from "./informedCommercialContinuation";
import { reconcileDeliveredConversationState } from "./conversationContinuityAuthority";

const TABLE = "whatsapp_v3_conversation_state";
const STATE_READ_DELAYS_MS = [0, 120, 360];

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function compactState(state: ConversationState): ConversationState {
  return {
    ...state,
    openLoops: state.openLoops.slice(-60),
    facts: state.facts.slice(-120),
    semanticMemory: state.semanticMemory ? { ...state.semanticMemory, entries: state.semanticMemory.entries.slice(-80), episodes: state.semanticMemory.episodes.slice(-24) } : emptySemanticMemory(),
  };
}

function hydrateConversationState(state: ConversationState | null | undefined): ConversationState | null {
  if (!state?.waId) return null;
  return {
    ...state,
    pendingAction: state.pendingAction || null,
    pendingActionPayload: state.pendingActionPayload || null,
    lastVerifiedApplication: state.lastVerifiedApplication || null,
    verifiedContactBinding: state.verifiedContactBinding || null,
    contactResolution: state.contactResolution || null,
    conversationConstraints: state.conversationConstraints || { noLinks: false, whatsappOnly: false, avoidRepetition: false, sourceTurnId: null, updatedAt: null },
    semanticMemory: state.semanticMemory || emptySemanticMemory(),
    commercialDisclosure: state.commercialDisclosure || emptyCommercialDisclosure(),
  };
}

async function loadLatestCompletedDeliveredState(waId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_turn_journal")
      .select("turn_id,status,state_after_json,provider_message_id,delivered_at,completed_at,updated_at")
      .eq("wa_id", waId)
      .eq("status", "completed")
      .not("provider_message_id", "is", null)
      .order("completed_at", { ascending: false })
      .limit(8);
    if (error) {
      console.error("v3_delivered_state_recovery_read_failed", { waId, error: error.message });
      return null;
    }
    const candidates = (Array.isArray(data) ? data : [])
      .map((row) => {
        const state = hydrateConversationState(row?.state_after_json as ConversationState | null | undefined);
        return state ? {
          state,
          deliveredAt: String(row?.completed_at || row?.delivered_at || row?.updated_at || state.updatedAt || ""),
        } : null;
      })
      .filter((item): item is { state: ConversationState; deliveredAt: string } => Boolean(item))
      .sort((a, b) => Date.parse(b.state.updatedAt || "") - Date.parse(a.state.updatedAt || ""));
    return candidates[0] || null;
  } catch (error) {
    console.error("v3_delivered_state_recovery_failed", { waId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function loadV3ConversationState(waId: string): Promise<ConversationState | null> {
  const clean = String(waId || "").trim();
  if (!clean) return null;
  let lastError = "unknown";
  for (let i = 0; i < STATE_READ_DELAYS_MS.length; i++) {
    const wait = STATE_READ_DELAYS_MS[i];
    if (wait) await sleep(wait);
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .select("state")
        .eq("wa_id", clean)
        .maybeSingle();
      const delivered = await loadLatestCompletedDeliveredState(clean);
      if (error) {
        lastError = error.message;
        if (delivered?.state) return delivered.state;
        continue;
      }

      const persisted = hydrateConversationState(data?.state as ConversationState | null | undefined);
      return reconcileDeliveredConversationState({
        persisted,
        deliveredState: delivered?.state || null,
        deliveredAt: delivered?.deliveredAt || null,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  console.error("v3_state_load_failed_after_retry", { waId: clean, error: lastError });
  return null;
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
