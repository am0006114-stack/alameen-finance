import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createTelegramHandoff } from "../../../../telegram/_lib/handoff";
import { normalizeWhatsAppToSend } from "../text";

const MIGRATION_MAX_OUTBOUND = 5;
const MIGRATION_REMINDER_COOLDOWN_MS = 10 * 60_000;
const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60_000;

type MigrationApplication = {
  id: string;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_confirmed_at?: string | null;
};

type MigrationState = {
  application_id: string;
  canonical_wa_id: string;
  state: string;
  outbound_count: number;
  linked_notice_sent: boolean;
  last_source_key?: string | null;
  last_handoff_sent_at?: string | null;
  linked_at?: string | null;
};

type Reservation = {
  allowed: boolean;
  outbound_count: number;
  state: string;
};

function canonicalWaId(value: string | null | undefined) {
  return normalizeWhatsAppToSend(String(value || "").trim());
}

function jordanPhoneVariants(value: string | null | undefined) {
  const canonical = canonicalWaId(value);
  const values = new Set<string>();
  if (canonical) {
    values.add(canonical);
    if (canonical.startsWith("962") && canonical.length > 3) {
      values.add(`0${canonical.slice(3)}`);
      values.add(canonical.slice(3));
    }
  }
  const raw = String(value || "").replace(/\D/g, "");
  if (raw) values.add(raw);
  return Array.from(values);
}

function firstName(value: string | null | undefined) {
  return String(value || "").trim().split(/\s+/).filter(Boolean)[0] || "عميلنا";
}

function paymentAuthoritativelyConfirmed(app: MigrationApplication | null | undefined) {
  if (!app) return false;
  const paymentStatus = String(app.payment_status || "").trim().toLowerCase();
  return Boolean(app.payment_confirmed_at) || ["confirmed", "paid", "payment_confirmed"].includes(paymentStatus);
}

async function loadApplicationById(applicationId: string): Promise<MigrationApplication | null> {
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,full_name,phone,status,payment_status,payment_confirmed_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(`telegram_migration_application_read:${error.message}`);
  return (data || null) as MigrationApplication | null;
}

async function preferredWhatsAppForApplication(app: MigrationApplication) {
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_application_contacts")
      .select("wa_id,updated_at")
      .eq("application_id", app.id)
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.wa_id) {
      const approved = canonicalWaId(data.wa_id);
      if (approved) return approved;
    }
  } catch (error) {
    console.error("telegram_migration_preferred_whatsapp_lookup_failed", error);
  }

  return canonicalWaId(app.phone);
}

async function loadPaidApplicationForWhatsApp(waId: string): Promise<MigrationApplication | null> {
  const canonical = canonicalWaId(waId);
  if (!canonical) return null;
  const variants = jordanPhoneVariants(canonical);

  try {
    const { data: contacts, error: contactError } = await supabaseAdmin
      .from("whatsapp_application_contacts")
      .select("application_id,wa_id,updated_at")
      .in("wa_id", variants)
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (!contactError && contacts?.length) {
      const ids = Array.from(new Set(contacts.map((row: any) => String(row.application_id || "")).filter(Boolean)));
      if (ids.length) {
        const { data: apps, error: appsError } = await supabaseAdmin
          .from("applications")
          .select("id,tracking_id,full_name,phone,status,payment_status,payment_confirmed_at,created_at")
          .in("id", ids)
          .order("created_at", { ascending: false });
        if (!appsError) {
          const paid = (apps || []).find((app: any) => paymentAuthoritativelyConfirmed(app));
          if (paid) return paid as MigrationApplication;
        }
      }
    }
  } catch (error) {
    console.error("telegram_migration_alias_lookup_failed", error);
  }

  const { data: apps, error } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,full_name,phone,status,payment_status,payment_confirmed_at,created_at")
    .in("phone", variants)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("telegram_migration_application_lookup_failed", error.message);
    return null;
  }

  return ((apps || []).find((app: any) => paymentAuthoritativelyConfirmed(app)) || null) as MigrationApplication | null;
}

async function loadTelegramLink(applicationId: string, waId: string) {
  const canonical = canonicalWaId(waId);
  const { data, error } = await supabaseAdmin
    .from("telegram_customer_links")
    .select("business_connection_id,telegram_chat_id,linked_at")
    .eq("application_id", applicationId)
    .eq("canonical_wa_id", canonical)
    .order("linked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("telegram_migration_link_lookup_failed", error.message);
    return null;
  }
  return data || null;
}

async function ensureMigrationState(applicationId: string, waId: string) {
  const canonical = canonicalWaId(waId);
  const { error } = await supabaseAdmin
    .from("whatsapp_telegram_migration_state")
    .upsert({
      application_id: applicationId,
      canonical_wa_id: canonical,
      state: "eligible",
      updated_at: new Date().toISOString(),
    }, { onConflict: "application_id", ignoreDuplicates: true });
  if (error) throw new Error(`telegram_migration_state_ensure:${error.message}`);
}

async function loadMigrationState(applicationId: string): Promise<MigrationState | null> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_telegram_migration_state")
    .select("application_id,canonical_wa_id,state,outbound_count,linked_notice_sent,last_source_key,last_handoff_sent_at,linked_at")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (error) throw new Error(`telegram_migration_state_read:${error.message}`);
  return (data || null) as MigrationState | null;
}

async function markMigrationLinked(applicationId: string, waId: string) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("whatsapp_telegram_migration_state")
    .upsert({
      application_id: applicationId,
      canonical_wa_id: canonicalWaId(waId),
      state: "linked",
      linked_at: now,
      updated_at: now,
    }, { onConflict: "application_id" });
  if (error) throw new Error(`telegram_migration_mark_linked:${error.message}`);
}

async function reserveMigrationMessage(input: {
  applicationId: string;
  waId: string;
  sourceKey: string;
  kind: "handoff" | "linked_notice";
}): Promise<Reservation> {
  const { data, error } = await supabaseAdmin.rpc("reserve_whatsapp_telegram_migration_message", {
    p_application_id: input.applicationId,
    p_wa_id: canonicalWaId(input.waId),
    p_source_key: input.sourceKey,
    p_kind: input.kind,
  });

  if (error) throw new Error(`telegram_migration_reserve:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    outbound_count: Number(row?.outbound_count || 0),
    state: String(row?.state || "eligible"),
  };
}

async function clearFailedSendCooldown(applicationId: string) {
  const { error } = await supabaseAdmin
    .from("whatsapp_telegram_migration_state")
    .update({ last_handoff_sent_at: null, updated_at: new Date().toISOString() })
    .eq("application_id", applicationId);
  if (error) console.error("telegram_migration_failed_send_cooldown_clear_failed", error.message);
}

async function hasOpenWhatsAppServiceWindow(waId: string) {
  const canonical = canonicalWaId(waId);
  if (!canonical) return false;
  const since = new Date(Date.now() - WHATSAPP_SERVICE_WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id")
    .eq("wa_id", canonical)
    .eq("direction", "incoming")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("telegram_migration_service_window_check_failed", error.message);
    return false;
  }
  return Boolean(data?.length);
}

function firstHandoffMessage(app: MigrationApplication, link: string) {
  return [
    `أهلين ${firstName(app.full_name)} 🌟`,
    "",
    "بنعتذر عن الانقطاع المؤقت اللي صار بخدمة المتابعة خلال فترة الصيانة والتحديثات الأخيرة.",
    "كنا بنحدّث نظام المتابعة وربط قنوات التواصل حتى تظل محادثتك مرتبطة بنفس طلبك بشكل أوضح وأسرع.",
    "",
    "✅ تم تأكيد رسوم فتح الملف على طلبك.",
    "",
    "من هسا المتابعة التفصيلية لطلبك بتكمل عبر Telegram من خلال رابط آمن خاص بطلبك:",
    link,
    "",
    "📌 افتح الرابط واضغط إرسال على الرسالة الجاهزة. رح ينربط Telegram بنفس طلبك بدون ما تعيد شرح معلوماتك.",
    "",
    "واتساب بيظل للتنبيهات والمتابعة الأساسية، والمتابعة اليومية بتكمل على Telegram.",
    "",
    "بنعتذر مرة ثانية عن أي إزعاج صار، وشكرًا لتفهمك 🌟",
  ].join("\n");
}

function reminderHandoffMessage(link: string) {
  return [
    "✅ رسوم فتح الملف عندك مؤكدة.",
    "",
    "حتى نكمل المتابعة التفصيلية بدون انقطاع، افتح رابط Telegram الآمن الخاص بطلبك:",
    link,
    "",
    "الرابط بيربط المحادثة بنفس طلبك مباشرة، وما بتحتاج تعيد بياناتك.",
  ].join("\n");
}

function linkedNoticeMessage() {
  return [
    "متابعتك مرتبطة بطلبك على Telegram بالفعل ✅",
    "كمل معنا هناك وبتظل معلومات الطلب وسياق المتابعة مربوطين بنفس الملف.",
    "",
    "واتساب بيظل للتنبيهات الأساسية فقط.",
  ].join("\n");
}

async function sendWhatsAppMigrationText(input: {
  app: MigrationApplication;
  waId: string;
  body: string;
  sourceKey: string;
  migrationCount: number;
  kind: "handoff" | "linked_notice";
}) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.GRAPH_API_VERSION || "v20.0";
  const to = canonicalWaId(input.waId);

  if (!token || !phoneNumberId || !to) {
    throw new Error("telegram_migration_whatsapp_credentials_or_recipient_missing");
  }

  let providerMessageId: string | null = null;
  let status = "failed";
  let responsePayload: any = null;

  try {
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: true, body: input.body },
      }),
    });

    responsePayload = await response.json().catch(() => null);
    providerMessageId = responsePayload?.messages?.[0]?.id || null;
    if (!response.ok || !providerMessageId) {
      throw new Error(`telegram_migration_whatsapp_send_failed:${response.status}:${responsePayload?.error?.code || "unknown"}`);
    }
    status = "sent";
  } finally {
    const { error: logError } = await supabaseAdmin.from("whatsapp_messages").insert({
      wa_id: to,
      direction: "outgoing",
      customer_name: input.app.full_name || null,
      message_id: providerMessageId,
      message_type: "text",
      body: input.body,
      handled_by: "telegram_migration",
      handled_by_ai: false,
      status,
      tracking_id: input.app.tracking_id || null,
      application_id: input.app.id,
      raw_payload: {
        phase: "18.5",
        kind: "telegram_migration",
        migration_kind: input.kind,
        source_key: input.sourceKey,
        migration_outbound_count: input.migrationCount,
        max_migration_outbound: MIGRATION_MAX_OUTBOUND,
        provider_response: responsePayload,
      },
    });
    if (logError) console.error("telegram_migration_whatsapp_log_failed", logError.message);
  }

  return providerMessageId;
}

async function prepareMigrationSend(input: {
  app: MigrationApplication;
  waId: string;
  sourceKey: string;
}) {
  const canonical = canonicalWaId(input.waId);
  if (!canonical || !paymentAuthoritativelyConfirmed(input.app)) {
    return { handled: false as const, sent: false, suppressed: false, reason: "not_eligible" };
  }

  await ensureMigrationState(input.app.id, canonical);

  const link = await loadTelegramLink(input.app.id, canonical);
  if (link) {
    await markMigrationLinked(input.app.id, canonical);
    const reservation = await reserveMigrationMessage({
      applicationId: input.app.id,
      waId: canonical,
      sourceKey: input.sourceKey,
      kind: "linked_notice",
    });
    if (!reservation.allowed) {
      return { handled: true as const, sent: false, suppressed: true, reason: "already_linked_notice_suppressed" };
    }

    const body = linkedNoticeMessage();
    try {
      const providerMessageId = await sendWhatsAppMigrationText({
        app: input.app,
        waId: canonical,
        body,
        sourceKey: input.sourceKey,
        migrationCount: reservation.outbound_count,
        kind: "linked_notice",
      });
      return { handled: true as const, sent: true, suppressed: false, reason: "linked_notice_sent", providerMessageId };
    } catch (error) {
      await clearFailedSendCooldown(input.app.id);
      console.error("telegram_migration_linked_notice_send_failed", error);
      return { handled: true as const, sent: false, suppressed: true, reason: "linked_notice_send_failed" };
    }
  }

  const state = await loadMigrationState(input.app.id);
  if ((state?.outbound_count ?? 0) >= MIGRATION_MAX_OUTBOUND || state?.state === "exhausted") {
    return { handled: true as const, sent: false, suppressed: true, reason: "migration_cap_reached" };
  }

  if (state?.last_handoff_sent_at) {
    const last = Date.parse(state.last_handoff_sent_at);
    if (Number.isFinite(last) && Date.now() - last < MIGRATION_REMINDER_COOLDOWN_MS) {
      return { handled: true as const, sent: false, suppressed: true, reason: "migration_cooldown" };
    }
  }

  const reservation = await reserveMigrationMessage({
    applicationId: input.app.id,
    waId: canonical,
    sourceKey: input.sourceKey,
    kind: "handoff",
  });
  if (!reservation.allowed) {
    return { handled: true as const, sent: false, suppressed: true, reason: "migration_reservation_denied" };
  }

  let handoff: Awaited<ReturnType<typeof createTelegramHandoff>>;
  try {
    handoff = await createTelegramHandoff({ waId: canonical, applicationId: input.app.id });
  } catch (error) {
    await clearFailedSendCooldown(input.app.id);
    console.error("telegram_migration_handoff_create_failed", error);
    return { handled: true as const, sent: false, suppressed: true, reason: "handoff_create_failed" };
  }

  const body = reservation.outbound_count === 1
    ? firstHandoffMessage(input.app, handoff.link)
    : reminderHandoffMessage(handoff.link);

  try {
    const providerMessageId = await sendWhatsAppMigrationText({
      app: input.app,
      waId: canonical,
      body,
      sourceKey: input.sourceKey,
      migrationCount: reservation.outbound_count,
      kind: "handoff",
    });
    return {
      handled: true as const,
      sent: true,
      suppressed: false,
      reason: "handoff_sent",
      providerMessageId,
      migrationCount: reservation.outbound_count,
    };
  } catch (error) {
    await clearFailedSendCooldown(input.app.id);
    console.error("telegram_migration_handoff_send_failed", error);
    return { handled: true as const, sent: false, suppressed: true, reason: "handoff_send_failed" };
  }
}

export async function handlePostPaymentWhatsAppMigrationInbound(input: {
  waId: string;
  sourceMessageId?: string | null;
}) {
  const canonical = canonicalWaId(input.waId);
  if (!canonical) return { handled: false, sent: false, suppressed: false, reason: "invalid_wa_id" };

  const app = await loadPaidApplicationForWhatsApp(canonical);
  if (!app) return { handled: false, sent: false, suppressed: false, reason: "no_authoritatively_paid_application" };

  return prepareMigrationSend({
    app,
    waId: canonical,
    sourceKey: `wa-inbound:${String(input.sourceMessageId || "unknown")}`,
  });
}

export async function sendPostPaymentTelegramMigrationAfterConfirmation(input: {
  applicationId: string;
  sourceKey: string;
}) {
  const app = await loadApplicationById(input.applicationId);
  if (!app || !paymentAuthoritativelyConfirmed(app)) {
    return { handled: false, sent: false, suppressed: false, reason: "payment_not_authoritatively_confirmed" };
  }

  const waId = await preferredWhatsAppForApplication(app);
  if (!waId) return { handled: false, sent: false, suppressed: false, reason: "no_whatsapp_recipient" };

  await ensureMigrationState(app.id, waId);

  // Plain-text customer-service replies are sent automatically only while the
  // 24-hour WhatsApp service window is open. Outside it we wait for the next
  // inbound customer message; that message itself opens the service window and
  // the inbound gate sends the handoff then. We do not silently substitute an
  // unrelated template.
  const serviceWindowOpen = await hasOpenWhatsAppServiceWindow(waId);
  if (!serviceWindowOpen) {
    return { handled: true, sent: false, suppressed: true, reason: "waiting_for_customer_service_window" };
  }

  return prepareMigrationSend({
    app,
    waId,
    sourceKey: input.sourceKey,
  });
}

export const TELEGRAM_MIGRATION_MAX_WHATSAPP_OUTBOUND = MIGRATION_MAX_OUTBOUND;
