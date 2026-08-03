import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ShadowQueueInput } from "./types";

export async function enqueueShadowJob(input: ShadowQueueInput) {
  const applicationSnapshot = input.application ? JSON.parse(JSON.stringify(input.application)) : {};
  const conversationSnapshot = input.conversationSnapshot ? JSON.parse(JSON.stringify(input.conversationSnapshot)) : {};

  const { error } = await supabaseAdmin
    .from("whatsapp_shadow_jobs")
    .upsert({
      incoming_message_id: input.incomingMessageId,
      wa_id: input.waId,
      customer_name: input.customerName || null,
      customer_message: input.customerMessage,
      message_type: input.messageType || "text",
      actual_reply: input.actualReply,
      initial_intent: input.initialIntent,
      tracking_id: input.trackingId || input.application?.tracking_id || null,
      application_id: input.application?.id || null,
      application_snapshot: applicationSnapshot,
      conversation_snapshot: conversationSnapshot,
      status: "queued",
      next_attempt_at: new Date().toISOString(),
    }, { onConflict: "incoming_message_id", ignoreDuplicates: true });

  if (error && (error as { code?: string }).code !== "23505") throw error;
}
