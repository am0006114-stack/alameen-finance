import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ShadowQueueInput } from "./types";

export async function enqueueShadowJob(input: ShadowQueueInput) {
  const applicationSnapshot = input.application
    ? JSON.parse(JSON.stringify(input.application))
    : {};
  const conversationSnapshot = input.conversationSnapshot
    ? JSON.parse(JSON.stringify(input.conversationSnapshot))
    : {};

  const { error } = await supabaseAdmin.rpc("enqueue_whatsapp_shadow_experiment", {
    p_incoming_message_id: input.incomingMessageId,
    p_wa_id: input.waId,
    p_customer_name: input.customerName || null,
    p_customer_message: input.customerMessage,
    p_message_type: input.messageType || "text",
    p_actual_reply: input.actualReply,
    p_initial_intent: input.initialIntent,
    p_tracking_id: input.trackingId || input.application?.tracking_id || null,
    p_application_id: input.application?.id || null,
    p_application_snapshot: applicationSnapshot,
    p_conversation_snapshot: conversationSnapshot,
  });

  if (error) throw error;
}
