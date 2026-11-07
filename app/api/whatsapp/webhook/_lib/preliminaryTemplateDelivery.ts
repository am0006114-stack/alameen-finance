import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendDiscordNotification } from "@/lib/discord";

type ProviderFailure = {
  code?: number | string;
  title?: string;
  message?: string;
};

/**
 * Reconcile an asynchronous Meta template delivery failure with the application
 * notification field. The original accepted-by-Meta "sent" event is NOT proof
 * that the customer received the preliminary-approval template.
 *
 * This function deliberately leaves preliminary_whatsapp_sent_at intact:
 * the existing cron uses that timestamp to avoid duplicate or automated
 * retries, and the failed recipient needs an explicit delivery investigation.
 * No qualification, continuation, fee, receipt, or payment state is mutated.
 */
export async function reconcilePreliminaryTemplateFailure(input: {
  messageId: string;
  failure?: ProviderFailure | null;
}) {
  const messageId = String(input.messageId || "").trim();
  if (!messageId) return;

  const { data: message, error: lookupError } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("application_id,tracking_id,message_type,body")
    .eq("message_id", messageId)
    .eq("direction", "outgoing")
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("preliminary_template_failure_lookup_failed", lookupError.message);
    return;
  }

  if (message?.message_type !== "template_event"
    || !String(message.body || "").startsWith("PRELIMINARY_APPROVAL_TEMPLATE_SENT")
    || !message.application_id) return;

  const errorCode = String(input.failure?.code ?? "unknown").slice(0, 20);
  const reason = String(input.failure?.title || input.failure?.message || "Message undeliverable")
    .replace(/[\r\n\t]/g, " ").slice(0, 180);
  const errorText = `Meta delivery failed (${errorCode}): ${reason}`;

  // Compare-and-set for idempotency. Never touch progressed applications and
  // never reopen a send attempt through the cron's null-timestamp selector.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("applications")
    .update({ preliminary_whatsapp_status: "failed", preliminary_whatsapp_error: errorText })
    .eq("id", message.application_id)
    .eq("status", "preliminary_qualified")
    .eq("preliminary_whatsapp_status", "sent")
    .select("id,tracking_id")
    .maybeSingle();

  if (updateError) {
    console.error("preliminary_template_failure_reconcile_failed", updateError.message);
    return;
  }
  if (!updated) return;

  const notification = await sendDiscordNotification({
    title: "⛔ فشل تسليم إشعار الموافقة المبدئية",
    description: "Meta قبلت إرسال القالب ثم أعادت فشل التسليم. حالة الإشعار داخل الطلب صارت failed، بدون إعادة إرسال تلقائية. يلزم متابعة سبب الفشل يدويًا.",
    fields: [
      { name: "رقم الطلب", value: String(updated.tracking_id || message.tracking_id || updated.id) },
      { name: "رمز خطأ Meta", value: errorCode },
      { name: "السبب", value: reason },
    ],
  });
  if (!notification.success) {
    console.error("preliminary_template_failure_discord_failed", notification.error);
  }
}
