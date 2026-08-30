import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { V2ShadowQueueInput } from "./types";

export async function enqueueConversationOsShadowJob(input: V2ShadowQueueInput) {
  const applicationSnapshot = input.application
    ? JSON.parse(JSON.stringify(input.application))
    : {};
  const conversationSnapshot = input.conversationSnapshot
    ? JSON.parse(JSON.stringify(input.conversationSnapshot))
    : {};

  const { data, error } = await supabaseAdmin.rpc("enqueue_whatsapp_v2_shadow_job", {
    p_incoming_message_id: input.incomingMessageId,
    p_wa_id: input.waId,
    p_customer_name: input.customerName || null,
    p_customer_message: input.customerMessage,
    p_message_type: input.messageType || "text",
    p_actual_reply: input.actualReply,
    p_initial_intent: input.initialIntent || null,
    p_tracking_id: input.trackingId || input.application?.tracking_id || null,
    p_application_id: input.application?.id || null,
    p_application_snapshot: applicationSnapshot,
    p_conversation_snapshot: conversationSnapshot,
  });

  if (error) {
    const code = String((error as { code?: string }).code || "");
    const message = String(error.message || "");
    // Code may be deployed before the additive SQL migration. Missing V2 RPC means
    // "shadow not enabled yet", not a production WhatsApp failure.
    if (code === "PGRST202" || code === "42883" || /enqueue_whatsapp_v2_shadow_job/i.test(message)) {
      return null;
    }
    throw error;
  }
  return data;
}
