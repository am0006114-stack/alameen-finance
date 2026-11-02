import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadCrossChannelRecentTurns } from "@/app/api/telegram/_lib/messages";
import { getV3ProductionControl, isV3ProductionActive } from "@/app/api/whatsapp/webhook/_lib/v3-os/productionControl";
import { buildV3LastResortReply, runV3ProductionLive } from "@/app/api/whatsapp/webhook/_lib/v3-os/runtimeLive";
import { saveV3ConversationState } from "@/app/api/whatsapp/webhook/_lib/v3-os/stateStore";
import { saveCompactHumanMemory } from "@/app/api/whatsapp/webhook/_lib/v3-os/compactHumanMemory";
import { completeHumanTurnDelivery } from "@/app/api/whatsapp/webhook/_lib/v3-os/durableTurnJournal";
import { loadPostPaymentChannelState, type WebChatSession } from "@/app/api/postpayment/_lib/channelState";

function normalizeInput(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeReply(value: unknown) {
  return String(value || "").trim();
}

function enforceWebChannelTruth(value: string) {
  return value
    .replace(/هون\s+على\s+Telegram/gi, "هون على الموقع")
    .replace(/عبر\s+Telegram/gi, "عبر الموقع")
    .replace(/على\s+Telegram/gi, "على الموقع")
    .replace(/Telegram/gi, "الموقع")
    .replace(/هون\s+على\s+واتساب/gi, "هون على الموقع")
    .trim();
}

async function profileName(applicationId: string) {
  const { data } = await supabaseAdmin
    .from("applications")
    .select("full_name")
    .eq("id", applicationId)
    .maybeSingle();
  return normalizeInput(data?.full_name) || null;
}

async function enforceRateLimit(session: WebChatSession) {
  const now = Date.now();
  const oneMinuteAgo = new Date(now - 60_000).toISOString();
  const tenMinutesAgo = new Date(now - 10 * 60_000).toISOString();

  const [minute, tenMinutes] = await Promise.all([
    supabaseAdmin
      .from("web_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("direction", "incoming")
      .gte("created_at", oneMinuteAgo),
    supabaseAdmin
      .from("web_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("direction", "incoming")
      .gte("created_at", tenMinutesAgo),
  ]);

  if (minute.error || tenMinutes.error) {
    console.error("web_chat_rate_limit_read_failed", minute.error?.message || tenMinutes.error?.message);
    return;
  }

  if ((minute.count || 0) >= 6 || (tenMinutes.count || 0) >= 30) {
    throw new Error("web_chat_rate_limited");
  }
}

export async function loadWebChatTimeline(session: WebChatSession) {
  const [web, telegram, whatsapp] = await Promise.all([
    supabaseAdmin
      .from("web_chat_messages")
      .select("id,created_at,direction,body,handled_by_ai")
      .eq("canonical_wa_id", session.canonical_wa_id)
      .in("direction", ["incoming", "outgoing", "system"])
      .order("created_at", { ascending: false })
      .limit(35),
    supabaseAdmin
      .from("telegram_messages")
      .select("id,created_at,direction,body,transcript,handled_by_ai")
      .eq("canonical_wa_id", session.canonical_wa_id)
      .in("direction", ["incoming", "outgoing"])
      .order("created_at", { ascending: false })
      .limit(35),
    supabaseAdmin
      .from("whatsapp_messages")
      .select("id,created_at,direction,body,handled_by_ai")
      .eq("wa_id", session.canonical_wa_id)
      .in("direction", ["incoming", "outgoing"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const rows: Array<{
    id: string;
    createdAt: string;
    direction: string;
    body: string;
    channel: "web" | "telegram" | "whatsapp";
    handledByAi: boolean;
  }> = [];

  if (!web.error) for (const row of web.data || []) {
    const body = normalizeReply(row.body);
    if (body) rows.push({
      id: `web:${row.id}`,
      createdAt: String(row.created_at || ""),
      direction: String(row.direction || "system"),
      body,
      channel: "web",
      handledByAi: Boolean(row.handled_by_ai),
    });
  }

  if (!telegram.error) for (const row of telegram.data || []) {
    const body = normalizeReply(row.transcript || row.body);
    if (body) rows.push({
      id: `telegram:${row.id}`,
      createdAt: String(row.created_at || ""),
      direction: String(row.direction || "system"),
      body,
      channel: "telegram",
      handledByAi: Boolean(row.handled_by_ai),
    });
  }

  if (!whatsapp.error) for (const row of whatsapp.data || []) {
    const body = normalizeReply(row.body);
    if (body) rows.push({
      id: `whatsapp:${row.id}`,
      createdAt: String(row.created_at || ""),
      direction: String(row.direction || "system"),
      body,
      channel: "whatsapp",
      handledByAi: Boolean(row.handled_by_ai),
    });
  }

  return rows
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-50);
}

async function logOutgoing(session: WebChatSession, body: string, handledByAi: boolean, turnId: string | null, replyTo: string) {
  const { error } = await supabaseAdmin.from("web_chat_messages").insert({
    application_id: session.application_id,
    canonical_wa_id: session.canonical_wa_id,
    session_id: session.id,
    direction: "outgoing",
    message_type: "text",
    body,
    handled_by_ai: handledByAi,
    status: "sent",
    raw_payload: {
      source: "web_chat",
      v3_turn_id: turnId,
      reply_to_client_message_id: replyTo,
    },
  });
  if (error) throw new Error(`web_chat_outgoing_log:${error.message}`);
}

export async function processWebChatMessage(input: { session: WebChatSession; text: string; clientMessageId: string }) {
  const text = normalizeInput(input.text);
  if (!text) throw new Error("web_chat_empty_message");
  if (text.length > 4000) throw new Error("web_chat_message_too_long");

  await enforceRateLimit(input.session);
  const channelState = await loadPostPaymentChannelState(input.session.application_id);
  if (!channelState?.activated_at || !channelState.web_available) throw new Error("web_chat_channel_not_activated");

  const { error: insertError } = await supabaseAdmin.from("web_chat_messages").insert({
    application_id: input.session.application_id,
    canonical_wa_id: input.session.canonical_wa_id,
    session_id: input.session.id,
    client_message_id: input.clientMessageId,
    direction: "incoming",
    message_type: "text",
    body: text,
    handled_by_ai: false,
    status: "received",
    raw_payload: { source: "web_chat" },
  });

  if (insertError) {
    if ((insertError as any).code === "23505") return { duplicate: true as const, reply: null, turnId: null };
    throw new Error(`web_chat_incoming_log:${insertError.message}`);
  }

  const control = await getV3ProductionControl();
  if (!isV3ProductionActive(control)) {
    const reply = "وصلتني رسالتك وهي محفوظة على نفس طلبك. نظام المحادثة تحت صيانة قصيرة حاليًا، وما رح أعطيك معلومة غير مؤكدة.";
    await logOutgoing(input.session, reply, false, null, input.clientMessageId);
    return { duplicate: false as const, reply, turnId: null };
  }

  const recentTurns = await loadCrossChannelRecentTurns(input.session.canonical_wa_id);
  const turnId = `web:${input.session.id}:${randomUUID()}`;
  let run: Awaited<ReturnType<typeof runV3ProductionLive>> | null = null;
  let reply = "";

  try {
    run = await runV3ProductionLive({
      waId: input.session.canonical_wa_id,
      turnId,
      customerText: text,
      // Web Chat intentionally uses the same trusted non-WhatsApp policy path
      // as Telegram while canonical wa_id remains the shared conversation key.
      transportContext: {
        channel: "telegram",
        applicationId: input.session.application_id,
        trackingId: input.session.tracking_id || null,
      },
      recentTurns,
      profileName: await profileName(input.session.application_id),
      realActionsEnabled: false,
    });
    reply = normalizeReply(run.reply);
  } catch (error) {
    console.error("web_chat_v3_runtime_failed", { turnId, error });
  }

  if (!reply) reply = buildV3LastResortReply();
  reply = enforceWebChannelTruth(reply);
  await logOutgoing(input.session, reply, Boolean(run), turnId, input.clientMessageId);

  if (run?.stateAfter) await saveV3ConversationState(run.stateAfter);
  if (run?.humanOs?.memoryAfter) await saveCompactHumanMemory(input.session.canonical_wa_id, run.humanOs.memoryAfter);
  if (run?.humanOs) {
    await completeHumanTurnDelivery({
      turnId: run.humanOs.journalTurnId,
      providerMessageId: `web:${turnId}`,
      memoryAfter: run.humanOs.memoryAfter,
    });
  }

  return { duplicate: false as const, reply, turnId };
}
