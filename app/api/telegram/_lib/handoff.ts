import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeWhatsAppToSend } from "../../whatsapp/webhook/_lib/text";
import { getTelegramChannelConfig } from "./config";
import type { TelegramBusinessConnection, TelegramCustomerLink } from "./types";
import { getBusinessConnection } from "./telegramApi";

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function cleanWaId(value: string | null | undefined) {
  return normalizeWhatsAppToSend(String(value || "").trim());
}

function tokenFromText(value: string | null | undefined) {
  const match = String(value || "").match(/(?:^|[^A-Za-z0-9_-])(tg1_[A-Za-z0-9_-]{20,})(?![A-Za-z0-9_-])/);
  return match?.[1] || null;
}

export async function createTelegramHandoff(input: {
  waId: string;
  applicationId: string;
}) {
  const config = getTelegramChannelConfig();
  if (!config.businessUsername) throw new Error("TELEGRAM_BUSINESS_USERNAME is not configured");

  const canonicalWaId = cleanWaId(input.waId);
  if (!canonicalWaId) throw new Error("telegram_handoff_invalid_wa_id");

  const { data: app, error: appError } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,phone")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (appError) throw new Error(`telegram_handoff_application_read:${appError.message}`);
  if (!app?.id) throw new Error("telegram_handoff_application_not_found");

  const appWaId = cleanWaId(app.phone);
  let contactMatches = Boolean(appWaId && appWaId === canonicalWaId);

  if (!contactMatches) {
    const { data: approvedAlias, error: aliasError } = await supabaseAdmin
      .from("whatsapp_application_contacts")
      .select("id")
      .eq("application_id", app.id)
      .eq("wa_id", canonicalWaId)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();

    if (aliasError) throw new Error(`telegram_handoff_alias_read:${aliasError.message}`);
    contactMatches = Boolean(approvedAlias?.id);
  }

  if (!contactMatches) {
    throw new Error("telegram_handoff_application_contact_mismatch");
  }

  const token = `tg1_${randomBytes(24).toString("base64url")}`;
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.handoffTtlMinutes * 60_000).toISOString();

  const { error } = await supabaseAdmin.from("telegram_handoff_tokens").insert({
    token_hash: tokenHash,
    canonical_wa_id: canonicalWaId,
    application_id: app.id,
    tracking_id: app.tracking_id || null,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`telegram_handoff_create:${error.message}`);

  const draft = `متابعة طلب الأمين ${token}`;
  const link = `https://t.me/${encodeURIComponent(config.businessUsername)}?text=${encodeURIComponent(draft)}`;
  return {
    link,
    expiresAt,
    token,
    canonicalWaId,
    applicationId: String(app.id),
    trackingId: app.tracking_id || null,
  };
}

export async function consumeTelegramHandoff(input: {
  text: string;
  businessConnectionId: string;
  telegramChatId: string;
  telegramUserId?: string | null;
}) {
  const token = tokenFromText(input.text);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("telegram_handoff_tokens")
    .update({
      used_at: now,
      used_business_connection_id: input.businessConnectionId,
      used_telegram_chat_id: input.telegramChatId,
      used_telegram_user_id: input.telegramUserId || null,
    })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("canonical_wa_id,application_id,tracking_id,expires_at")
    .maybeSingle();

  if (error) throw new Error(`telegram_handoff_consume:${error.message}`);
  if (!data) {
    const { data: tokenState, error: tokenStateError } = await supabaseAdmin
      .from("telegram_handoff_tokens")
      .select("used_at,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenStateError) throw new Error(`telegram_handoff_state_read:${tokenStateError.message}`);
    if (!tokenState) throw new Error("telegram_handoff_invalid");
    if (tokenState.used_at) throw new Error("telegram_handoff_already_used");

    const expiry = Date.parse(String(tokenState.expires_at || ""));
    if (Number.isFinite(expiry) && expiry <= Date.now()) throw new Error("telegram_handoff_expired");
    throw new Error("telegram_handoff_unavailable");
  }

  const row = {
    business_connection_id: input.businessConnectionId,
    telegram_chat_id: input.telegramChatId,
    telegram_user_id: input.telegramUserId || null,
    canonical_wa_id: String(data.canonical_wa_id || ""),
    application_id: data.application_id || null,
    tracking_id: data.tracking_id || null,
    linked_at: now,
    updated_at: now,
    ai_paused_until: null,
  };

  const { error: linkError } = await supabaseAdmin
    .from("telegram_customer_links")
    .upsert(row, { onConflict: "business_connection_id,telegram_chat_id" });
  if (linkError) throw new Error(`telegram_customer_link:${linkError.message}`);

  // Phase 18.5: once the secure handoff is consumed, mark the WhatsApp
  // migration state as linked immediately. This is best-effort so a temporary
  // telemetry/state-table issue can never invalidate a valid Telegram link.
  try {
    const { error: migrationStateError } = await supabaseAdmin
      .from("whatsapp_telegram_migration_state")
      .upsert({
        application_id: data.application_id,
        canonical_wa_id: String(data.canonical_wa_id || ""),
        state: "linked",
        linked_at: now,
        updated_at: now,
      }, { onConflict: "application_id" });
    if (migrationStateError) console.error("telegram_migration_link_state_update_failed", migrationStateError.message);
  } catch (migrationStateError) {
    console.error("telegram_migration_link_state_update_failed", migrationStateError);
  }

  return row as TelegramCustomerLink;
}

export async function loadTelegramCustomerLink(input: {
  businessConnectionId: string;
  telegramChatId: string;
}): Promise<TelegramCustomerLink | null> {
  const { data, error } = await supabaseAdmin
    .from("telegram_customer_links")
    .select("business_connection_id,telegram_chat_id,telegram_user_id,canonical_wa_id,application_id,tracking_id,ai_paused_until,linked_at")
    .eq("business_connection_id", input.businessConnectionId)
    .eq("telegram_chat_id", input.telegramChatId)
    .maybeSingle();
  if (error) throw new Error(`telegram_customer_link_read:${error.message}`);
  return (data || null) as TelegramCustomerLink | null;
}

export function telegramLinkAiPaused(link: TelegramCustomerLink | null) {
  if (!link?.ai_paused_until) return false;
  const until = Date.parse(link.ai_paused_until);
  return Number.isFinite(until) && until > Date.now();
}

export async function markTelegramHumanTakeover(input: {
  businessConnectionId: string;
  telegramChatId: string;
}) {
  const config = getTelegramChannelConfig();
  const until = new Date(Date.now() + config.humanTakeoverMinutes * 60_000).toISOString();
  const { error } = await supabaseAdmin
    .from("telegram_customer_links")
    .update({ ai_paused_until: until, updated_at: new Date().toISOString() })
    .eq("business_connection_id", input.businessConnectionId)
    .eq("telegram_chat_id", input.telegramChatId);
  if (error) console.error("telegram_human_takeover_mark_failed", error.message);
  return until;
}

export async function upsertTelegramBusinessConnection(connection: TelegramBusinessConnection) {
  const { error } = await supabaseAdmin
    .from("telegram_business_connections")
    .upsert({
      connection_id: connection.id,
      business_user_id: String(connection.user?.id || ""),
      user_chat_id: connection.user_chat_id != null ? String(connection.user_chat_id) : null,
      username: connection.user?.username || null,
      first_name: connection.user?.first_name || null,
      last_name: connection.user?.last_name || null,
      rights: connection.rights || {},
      is_enabled: connection.is_enabled !== false,
      connection_date: connection.date || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "connection_id" });
  if (error) throw new Error(`telegram_business_connection_upsert:${error.message}`);
}

export async function resolveTelegramBusinessConnection(connectionId: string) {
  const { data, error } = await supabaseAdmin
    .from("telegram_business_connections")
    .select("connection_id,business_user_id,user_chat_id,username,first_name,last_name,rights,is_enabled")
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (!error && data?.connection_id) return data;

  const live = await getBusinessConnection(connectionId);
  await upsertTelegramBusinessConnection(live);
  return {
    connection_id: live.id,
    business_user_id: String(live.user?.id || ""),
    user_chat_id: live.user_chat_id != null ? String(live.user_chat_id) : null,
    username: live.user?.username || null,
    first_name: live.user?.first_name || null,
    last_name: live.user?.last_name || null,
    rights: live.rights || {},
    is_enabled: live.is_enabled !== false,
  };
}
