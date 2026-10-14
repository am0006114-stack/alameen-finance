import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TelegramMediaRecord, TelegramMessage } from "./types";

function profileName(message: TelegramMessage) {
  return [message.from?.first_name, message.from?.last_name].map((x) => String(x || "").trim()).filter(Boolean).join(" ") || null;
}

export function telegramMessageBody(message: TelegramMessage) {
  const text = String(message.text || message.caption || "").trim();
  if (text) return text;
  if (message.voice) return "[رسالة صوتية]";
  if (message.audio) return "[ملف صوتي]";
  if (message.photo) return "[صورة]";
  if (message.document) return "[ملف]";
  if (message.video) return "[فيديو]";
  return "[رسالة غير نصية]";
}

export function telegramMessageType(message: TelegramMessage) {
  if (message.text) return "text";
  if (message.voice) return "voice";
  if (message.audio) return "audio";
  if (message.photo) return "photo";
  if (message.document) return "document";
  if (message.video) return "video";
  return "unsupported";
}

export async function logTelegramIncoming(input: {
  updateId: number;
  businessConnectionId: string;
  message: TelegramMessage;
  canonicalWaId?: string | null;
  applicationId?: string | null;
}) {
  const row = {
    update_id: input.updateId,
    business_connection_id: input.businessConnectionId,
    telegram_chat_id: String(input.message.chat.id),
    telegram_user_id: input.message.from?.id != null ? String(input.message.from.id) : null,
    telegram_message_id: input.message.message_id,
    direction: "incoming",
    message_type: telegramMessageType(input.message),
    body: telegramMessageBody(input.message),
    canonical_wa_id: input.canonicalWaId || null,
    application_id: input.applicationId || null,
    customer_name: profileName(input.message),
    status: "received",
    raw_payload: input.message,
  };
  const { data, error } = await supabaseAdmin
    .from("telegram_messages")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    if ((error as any).code === "23505") return false;
    throw new Error(`telegram_incoming_log:${error.message}`);
  }
  return Boolean(data?.id);
}

export async function attachTelegramIncomingIdentity(input: {
  businessConnectionId: string;
  telegramChatId: string;
  telegramMessageId: number;
  canonicalWaId: string;
  applicationId?: string | null;
}) {
  const { error } = await supabaseAdmin
    .from("telegram_messages")
    .update({
      canonical_wa_id: input.canonicalWaId,
      application_id: input.applicationId || null,
    })
    .eq("business_connection_id", input.businessConnectionId)
    .eq("telegram_chat_id", input.telegramChatId)
    .eq("telegram_message_id", input.telegramMessageId)
    .eq("direction", "incoming");
  if (error) console.error("telegram_incoming_identity_attach_failed", error.message);
}

export async function attachTelegramIncomingMedia(input: {
  businessConnectionId: string;
  telegramChatId: string;
  telegramMessageId: number;
  media: TelegramMediaRecord;
}) {
  const { error } = await supabaseAdmin
    .from("telegram_messages")
    .update({
      media_file_id: input.media.fileId,
      media_unique_id: input.media.fileUniqueId,
      media_storage_path: input.media.storagePath,
      media_mime_type: input.media.mimeType,
      media_file_name: input.media.fileName,
      media_size_bytes: input.media.fileSize,
      transcript: input.media.transcript,
      status: input.media.warning ? "media_warning" : "received",
    })
    .eq("business_connection_id", input.businessConnectionId)
    .eq("telegram_chat_id", input.telegramChatId)
    .eq("telegram_message_id", input.telegramMessageId)
    .eq("direction", "incoming");
  if (error) console.error("telegram_incoming_media_attach_failed", error.message);
}

export async function logTelegramOutgoing(input: {
  businessConnectionId: string;
  telegramChatId: string;
  telegramMessageId: number;
  canonicalWaId: string;
  applicationId?: string | null;
  body: string;
  handledByAi: boolean;
  turnId?: string | null;
}) {
  const { error } = await supabaseAdmin.from("telegram_messages").insert({
    business_connection_id: input.businessConnectionId,
    telegram_chat_id: input.telegramChatId,
    telegram_user_id: null,
    telegram_message_id: input.telegramMessageId,
    direction: "outgoing",
    message_type: "text",
    body: input.body,
    canonical_wa_id: input.canonicalWaId,
    application_id: input.applicationId || null,
    handled_by_ai: input.handledByAi,
    status: "sent",
    raw_payload: input.turnId ? { v3_turn_id: input.turnId, source: "telegram_business" } : { source: "telegram_business" },
  });
  if (error && (error as any).code !== "23505") throw new Error(`telegram_outgoing_log:${error.message}`);
}

export async function loadCrossChannelRecentTurns(canonicalWaId: string) {
  const [wa, tg] = await Promise.all([
    supabaseAdmin
      .from("whatsapp_messages")
      .select("created_at,direction,body")
      .eq("wa_id", canonicalWaId)
      .in("direction", ["incoming", "outgoing"])
      .order("created_at", { ascending: false })
      .limit(18),
    supabaseAdmin
      .from("telegram_messages")
      .select("created_at,direction,body,transcript")
      .eq("canonical_wa_id", canonicalWaId)
      .in("direction", ["incoming", "outgoing"])
      .order("created_at", { ascending: false })
      .limit(18),
  ]);

  const rows: Array<{ created_at?: string | null; direction?: string | null; body?: string | null; transcript?: string | null }> = [];
  if (!wa.error) rows.push(...(wa.data || []));
  if (!tg.error) rows.push(...(tg.data || []));

  return rows
    .map((row) => ({ ...row, effectiveBody: String(row.transcript || row.body || "").trim() }))
    .filter((row) => row.effectiveBody)
    .sort((a, b) => Date.parse(String(a.created_at || "")) - Date.parse(String(b.created_at || "")))
    .slice(-24)
    .map((row) => `${row.direction === "incoming" ? "العميل" : "الأمين"}: ${row.effectiveBody}`);
}
