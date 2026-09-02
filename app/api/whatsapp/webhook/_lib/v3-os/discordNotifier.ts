import { sendDiscordNotification } from "@/lib/discord";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decideV3DiscordNotification, type V3NotificationEvent } from "./notificationPolicy";

function clipped(value: unknown, max = 900) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function timeBucket(minutes: number) {
  return Math.floor(Date.now() / (minutes * 60 * 1000));
}

function persistedDedupeKey(event: V3NotificationEvent, key: string) {
  if (["official_receipt_uploaded","official_salary_slip_uploaded","payment_confirmation_required"].includes(event)) return key;
  return `${key}:bucket-${timeBucket(30)}`;
}

function defaultTitle(event: V3NotificationEvent) {
  if (event === "customer_continue_payment_ready") return "✅ العميل وافق على الاستمرار — خطوة 5 دنانير";
  if (event === "official_receipt_uploaded") return "💳 تم رفع وصل الدفع — بانتظار تأكيد الإدارة";
  if (event === "official_salary_slip_uploaded") return "📄 تم رفع كشف/شهادة راتب";
  if (event === "payment_confirmation_required") return "يتطلب تأكيد دفع يدوي";
  return "V3 — حدث يتطلب تدخل الإدارة";
}

export async function notifyV3Discord(input: {
  event: V3NotificationEvent;
  applicationId?: string | null;
  trackingId?: string | null;
  waId?: string | null;
  paymentConfirmed?: boolean;
  title?: string;
  description?: string;
  details?: Record<string, unknown> | null;
}) {
  const decision = decideV3DiscordNotification({
    event: input.event,
    applicationId: input.applicationId,
    paymentConfirmed: input.paymentConfirmed,
  });

  if (!decision.notify || !decision.dedupeKey) {
    return { sent: false, suppressed: true, reason: decision.reason };
  }

  const dedupeKey = persistedDedupeKey(input.event, decision.dedupeKey);
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("whatsapp_v3_notification_ledger")
    .insert({
      dedupe_key: dedupeKey,
      event_type: input.event,
      application_id: input.applicationId || null,
      wa_id: input.waId || null,
      severity: decision.severity,
      payload: input.details || {},
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (claimError) {
    // Unique violation means an equivalent actionable notification was already sent/claimed.
    if (String((claimError as { code?: string }).code || "") === "23505") {
      return { sent: false, suppressed: true, reason: "duplicate_actionable_notification" };
    }
    return { sent: false, suppressed: true, reason: `notification_ledger_error:${claimError.message}` };
  }
  if (!claimed?.id) return { sent: false, suppressed: true, reason: "notification_claim_not_created" };

  const mention = decision.mentionAdmin ? String(process.env.DISCORD_ADMIN_MENTION || "").trim() : "";
  const detailFields = Object.entries(input.details || {}).slice(0, 8).map(([name, value]) => ({
    name: clipped(name, 90),
    value: clipped(value, 700) || "—",
    inline: false,
  }));
  const fields = [
    input.trackingId ? { name: "رقم الطلب", value: clipped(input.trackingId), inline: true } : null,
    input.applicationId ? { name: "Application", value: clipped(input.applicationId), inline: true } : null,
    input.waId ? { name: "WhatsApp", value: clipped(input.waId), inline: true } : null,
    ...detailFields,
    { name: "السبب", value: clipped(decision.reason), inline: false },
  ].filter(Boolean) as Array<{ name: string; value: string; inline?: boolean }>;

  const result = await sendDiscordNotification({
    title: input.title || defaultTitle(input.event),
    description: clipped(`${mention ? `${mention} ` : ""}${input.description || "يوجد حدث تشغيلي يحتاج تدخلًا فعليًا."}`, 1800),
    fields,
  });

  await supabaseAdmin
    .from("whatsapp_v3_notification_ledger")
    .update({
      status: result.success ? "sent" : "failed",
      error_message: result.error || null,
      sent_at: result.success ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimed.id);

  return { sent: result.success, suppressed: false, reason: result.error || decision.reason };
}
