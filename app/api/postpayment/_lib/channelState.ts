import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeWhatsAppToSend } from "@/app/api/whatsapp/webhook/_lib/text";
import { isPaymentConfirmedForConversation } from "@/app/api/whatsapp/webhook/_lib/v3-os/paymentTruth";

export const WEB_CHAT_COOKIE_NAME = "alameen_web_chat";
const BOOTSTRAP_TTL_MINUTES = 45;
const SESSION_TTL_DAYS = 30;

type PaymentApplication = {
  id: string;
  tracking_id?: string | null;
  phone?: string | null;
  payment_status?: string | null;
  payment_confirmed_at?: string | null;
};

export type WebChatSession = {
  id: string;
  application_id: string;
  canonical_wa_id: string;
  tracking_id?: string | null;
  session_expires_at?: string | null;
};

export type PostPaymentChannelState = {
  application_id: string;
  canonical_wa_id: string;
  primary_channel?: "web" | "telegram" | null;
  web_available: boolean;
  whatsapp_routine_blocked: boolean;
  whatsapp_redirect_notice_sent: boolean;
  activated_at?: string | null;
  updated_at: string;
};

export type PostPaymentChannelFlags = {
  channelChoiceEnabled: boolean;
  webChatEnabled: boolean;
  whatsappHardCutoverEnabled: boolean;
};

function hashToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function asBoolean(value: unknown) {
  return String(value || "").trim().toLowerCase() === "true";
}

export function canonicalPostPaymentWaId(value: string | null | undefined) {
  return normalizeWhatsAppToSend(String(value || "").trim());
}

function siteBaseUrl() {
  return String(process.env.NEXT_PUBLIC_SITE_URL || "https://ameenfinance.co").replace(/\/+$/, "");
}

export async function getPostPaymentChannelFlags(): Promise<PostPaymentChannelFlags> {
  const { data, error } = await supabaseAdmin
    .from("web_chat_settings")
    .select("key,value")
    .in("key", [
      "postpayment_channel_choice_enabled",
      "web_chat_enabled",
      "whatsapp_hard_cutover_enabled",
    ]);

  if (error) {
    console.error("postpayment_channel_flags_read_failed", error.message);
    return { channelChoiceEnabled: false, webChatEnabled: false, whatsappHardCutoverEnabled: false };
  }

  const values = new Map((data || []).map((row: any) => [String(row.key), String(row.value)]));
  return {
    channelChoiceEnabled: asBoolean(values.get("postpayment_channel_choice_enabled")),
    webChatEnabled: asBoolean(values.get("web_chat_enabled")),
    whatsappHardCutoverEnabled: asBoolean(values.get("whatsapp_hard_cutover_enabled")),
  };
}

async function loadPaymentApplication(applicationId: string): Promise<PaymentApplication | null> {
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,phone,payment_status,payment_confirmed_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(`web_chat_application_read:${error.message}`);
  return (data || null) as PaymentApplication | null;
}

export async function assertPostPaymentConfirmed(applicationId: string) {
  const app = await loadPaymentApplication(applicationId);
  if (!app || !isPaymentConfirmedForConversation({
    paymentStatus: app.payment_status,
    paymentConfirmedAt: app.payment_confirmed_at,
  })) {
    throw new Error("web_chat_payment_not_confirmed");
  }
  return app;
}

export async function loadPostPaymentChannelState(applicationId: string): Promise<PostPaymentChannelState | null> {
  const { data, error } = await supabaseAdmin
    .from("customer_postpayment_channel_state")
    .select("application_id,canonical_wa_id,primary_channel,web_available,whatsapp_routine_blocked,whatsapp_redirect_notice_sent,activated_at,updated_at")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (error) throw new Error(`postpayment_channel_state_read:${error.message}`);
  return (data || null) as PostPaymentChannelState | null;
}

export async function createWebChatBootstrap(input: { applicationId: string; canonicalWaId: string }) {
  const flags = await getPostPaymentChannelFlags();
  if (!flags.channelChoiceEnabled || !flags.webChatEnabled) throw new Error("web_chat_not_enabled");

  const app = await assertPostPaymentConfirmed(input.applicationId);
  const canonicalWaId = canonicalPostPaymentWaId(input.canonicalWaId || app.phone);
  if (!canonicalWaId) throw new Error("web_chat_invalid_customer_identity");

  const now = new Date();
  const nowIso = now.toISOString();
  const token = `wc1_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + BOOTSTRAP_TTL_MINUTES * 60_000).toISOString();

  await supabaseAdmin
    .from("web_chat_sessions")
    .update({ bootstrap_expires_at: nowIso, updated_at: nowIso })
    .eq("application_id", app.id)
    .is("bootstrap_used_at", null)
    .gt("bootstrap_expires_at", nowIso);

  const { error } = await supabaseAdmin.from("web_chat_sessions").insert({
    application_id: app.id,
    canonical_wa_id: canonicalWaId,
    tracking_id: app.tracking_id || null,
    bootstrap_token_hash: hashToken(token),
    bootstrap_expires_at: expiresAt,
  });
  if (error) throw new Error(`web_chat_bootstrap_create:${error.message}`);

  const { error: stateError } = await supabaseAdmin
    .from("customer_postpayment_channel_state")
    .upsert({
      application_id: app.id,
      canonical_wa_id: canonicalWaId,
      web_available: true,
      updated_at: nowIso,
    }, { onConflict: "application_id" });
  if (stateError) throw new Error(`web_chat_channel_state_prepare:${stateError.message}`);

  return {
    token,
    expiresAt,
    link: `${siteBaseUrl()}/api/web-chat/claim?token=${encodeURIComponent(token)}`,
  };
}

export async function claimWebChatBootstrap(token: string) {
  const clean = String(token || "").trim();
  if (!/^wc1_[A-Za-z0-9_-]{30,}$/.test(clean)) throw new Error("web_chat_bootstrap_invalid");

  const flags = await getPostPaymentChannelFlags();
  if (!flags.channelChoiceEnabled || !flags.webChatEnabled) throw new Error("web_chat_not_enabled");

  const now = new Date();
  const nowIso = now.toISOString();
  const sessionToken = `wcs1_${randomBytes(32).toString("base64url")}`;
  const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("web_chat_sessions")
    .update({
      bootstrap_used_at: nowIso,
      session_token_hash: hashToken(sessionToken),
      session_expires_at: sessionExpiresAt,
      last_seen_at: nowIso,
      updated_at: nowIso,
    })
    .eq("bootstrap_token_hash", hashToken(clean))
    .is("bootstrap_used_at", null)
    .is("revoked_at", null)
    .gt("bootstrap_expires_at", nowIso)
    .select("id,application_id,canonical_wa_id,tracking_id,session_expires_at")
    .maybeSingle();

  if (error) throw new Error(`web_chat_bootstrap_claim:${error.message}`);
  if (!data) throw new Error("web_chat_bootstrap_expired_or_used");
  await assertPostPaymentConfirmed(String(data.application_id));
  return { sessionToken, session: data as WebChatSession };
}

export async function loadWebChatSession(token: string | null | undefined): Promise<WebChatSession | null> {
  const clean = String(token || "").trim();
  if (!/^wcs1_[A-Za-z0-9_-]{30,}$/.test(clean)) return null;

  const flags = await getPostPaymentChannelFlags();
  if (!flags.webChatEnabled) return null;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("web_chat_sessions")
    .select("id,application_id,canonical_wa_id,tracking_id,session_expires_at")
    .eq("session_token_hash", hashToken(clean))
    .is("revoked_at", null)
    .gt("session_expires_at", nowIso)
    .maybeSingle();
  if (error) throw new Error(`web_chat_session_read:${error.message}`);
  if (!data) return null;

  try {
    await assertPostPaymentConfirmed(String(data.application_id));
  } catch {
    return null;
  }

  await supabaseAdmin.from("web_chat_sessions").update({ last_seen_at: nowIso, updated_at: nowIso }).eq("id", data.id);
  return data as WebChatSession;
}

export async function activateWebPostPaymentChannel(session: WebChatSession) {
  await assertPostPaymentConfirmed(session.application_id);
  const flags = await getPostPaymentChannelFlags();
  if (!flags.channelChoiceEnabled || !flags.webChatEnabled) throw new Error("web_chat_not_enabled");

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("customer_postpayment_channel_state")
    .upsert({
      application_id: session.application_id,
      canonical_wa_id: canonicalPostPaymentWaId(session.canonical_wa_id),
      primary_channel: "web",
      web_available: true,
      whatsapp_routine_blocked: true,
      activated_at: now,
      updated_at: now,
    }, { onConflict: "application_id" });
  if (error) throw new Error(`web_chat_channel_activate:${error.message}`);
}

export async function markTelegramPostPaymentChannelActive(input: { applicationId?: string | null; canonicalWaId: string }) {
  if (!input.applicationId) return false;
  const flags = await getPostPaymentChannelFlags();
  if (!flags.channelChoiceEnabled) return false;

  await assertPostPaymentConfirmed(String(input.applicationId));
  const canonicalWaId = canonicalPostPaymentWaId(input.canonicalWaId);
  if (!canonicalWaId) return false;
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("customer_postpayment_channel_state")
    .upsert({
      application_id: String(input.applicationId),
      canonical_wa_id: canonicalWaId,
      primary_channel: "telegram",
      web_available: true,
      whatsapp_routine_blocked: true,
      activated_at: now,
      updated_at: now,
    }, { onConflict: "application_id" });
  if (error) throw new Error(`telegram_postpayment_channel_activate:${error.message}`);
  return true;
}

export async function shouldSuppressRoutineWhatsAppMigration(applicationId: string) {
  const flags = await getPostPaymentChannelFlags();
  if (!flags.whatsappHardCutoverEnabled) return false;
  const state = await loadPostPaymentChannelState(applicationId);
  return Boolean(state?.activated_at && state.whatsapp_routine_blocked && state.primary_channel);
}

export function webChatSessionMaxAgeSeconds() {
  return SESSION_TTL_DAYS * 24 * 60 * 60;
}
