import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { V2ConversationState } from "./types";
import { emptyConversationState } from "./stateReducer";

function safeState(value: unknown, waId: string): V2ConversationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyConversationState(waId);
  const obj = value as Partial<V2ConversationState>;
  return {
    ...emptyConversationState(waId),
    ...obj,
    version: "2.0-phase1",
    waId,
    openLoops: Array.isArray(obj.openLoops) ? obj.openLoops.slice(-40) : [],
    facts: Array.isArray(obj.facts) ? obj.facts.slice(-80) : [],
    pendingCorrections: Array.isArray(obj.pendingCorrections) ? obj.pendingCorrections.slice(-20) : [],
    humanHandoff: {
      requested: Boolean(obj.humanHandoff?.requested),
      requestedAt: obj.humanHandoff?.requestedAt || null,
      status: obj.humanHandoff?.status || null,
    },
    updatedAt: obj.updatedAt || new Date().toISOString(),
  };
}

export async function loadConversationState(waId: string) {
  const clean = String(waId || "").trim();
  if (!clean) return emptyConversationState("");

  const { data, error } = await supabaseAdmin
    .from("whatsapp_v2_conversation_states")
    .select("state")
    .eq("wa_id", clean)
    .maybeSingle();

  if (error) {
    console.error("V2 state load failed", { waId: clean, error: error.message });
    return emptyConversationState(clean);
  }

  return safeState(data?.state, clean);
}

export async function saveConversationState(state: V2ConversationState) {
  const { error } = await supabaseAdmin
    .from("whatsapp_v2_conversation_states")
    .upsert({
      wa_id: state.waId,
      version: state.version,
      state,
      updated_at: state.updatedAt,
    }, { onConflict: "wa_id" });

  if (error) throw error;
}
