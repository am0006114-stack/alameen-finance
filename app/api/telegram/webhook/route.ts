import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTelegramChannelConfig } from "../_lib/config";
import type { TelegramMessage, TelegramUpdate } from "../_lib/types";
import {
  consumeTelegramHandoff,
  loadTelegramCustomerLink,
  markTelegramHumanTakeover,
  resolveTelegramBusinessConnection,
  telegramLinkAiPaused,
  upsertTelegramBusinessConnection,
} from "../_lib/handoff";
import { readBusinessMessage, sendBusinessText, sendBusinessTyping } from "../_lib/telegramApi";
import {
  attachTelegramIncomingIdentity,
  attachTelegramIncomingMedia,
  loadCrossChannelRecentTurns,
  logTelegramIncoming,
  logTelegramOutgoing,
  telegramMessageBody,
  telegramMessageType,
} from "../_lib/messages";
import { buildTelegramOrderSummary } from "../_lib/orderSummary";
import { persistTelegramMedia, telegramMediaCustomerText } from "../_lib/media";
import { getV3ProductionControl, isV3ProductionActive } from "../../whatsapp/webhook/_lib/v3-os/productionControl";
import { buildV3LastResortReply, runV3ProductionLive } from "../../whatsapp/webhook/_lib/v3-os/runtimeLive";
import { saveV3ConversationState } from "../../whatsapp/webhook/_lib/v3-os/stateStore";
import { saveCompactHumanMemory } from "../../whatsapp/webhook/_lib/v3-os/compactHumanMemory";
import { completeHumanTurnDelivery } from "../../whatsapp/webhook/_lib/v3-os/durableTurnJournal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function profileName(message: TelegramMessage) {
  return [message.from?.first_name, message.from?.last_name].map((x) => String(x || "").trim()).filter(Boolean).join(" ") || null;
}

function isCustomerTextCapable(message: TelegramMessage) {
  return telegramMessageType(message) === "text" || Boolean(message.caption);
}

async function handleConnection(update: TelegramUpdate) {
  if (!update.business_connection) return false;
  await upsertTelegramBusinessConnection(update.business_connection);
  return true;
}

export async function GET() {
  return json({ ok: true, channel: "telegram_business", phase: "18.3" });
}

export async function POST(request: Request) {
  const config = getTelegramChannelConfig();
  if (!config.webhookSecret) return json({ ok: false, error: "telegram_webhook_secret_not_configured" }, 503);

  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (suppliedSecret !== config.webhookSecret) return json({ ok: false, error: "unauthorized" }, 401);

  const update = await request.json().catch(() => null) as TelegramUpdate | null;
  if (!update || !Number.isFinite(Number(update.update_id))) return json({ ok: true, ignored: "invalid_update" });

  if (await handleConnection(update)) return json({ ok: true, handled: "business_connection" });

  const message = update.business_message;
  if (!message?.business_connection_id || !message.chat?.id || !message.message_id) {
    return json({ ok: true, ignored: "unsupported_update" });
  }

  const businessConnectionId = String(message.business_connection_id);
  const telegramChatId = String(message.chat.id);
  const telegramUserId = message.from?.id != null ? String(message.from.id) : null;

  let connection: any;
  try {
    connection = await resolveTelegramBusinessConnection(businessConnectionId);
  } catch (error) {
    console.error("telegram_business_connection_resolve_failed", error);
    return json({ ok: true, deferred: "business_connection_unavailable" });
  }

  // Messages sent by our connected bot are echoed back as business messages.
  // Never treat them as fresh customer input.
  if (message.sender_business_bot) return json({ ok: true, ignored: "bot_echo" });

  // A message sent manually by the business account is an implicit human takeover.
  if (telegramUserId && telegramUserId === String(connection.business_user_id || "")) {
    await markTelegramHumanTakeover({ businessConnectionId, telegramChatId });
    return json({ ok: true, handled: "human_takeover" });
  }

  let link = await loadTelegramCustomerLink({ businessConnectionId, telegramChatId });
  const firstInsert = await logTelegramIncoming({
    updateId: update.update_id,
    businessConnectionId,
    message,
    canonicalWaId: link?.canonical_wa_id || null,
    applicationId: link?.application_id || null,
  });
  if (!firstInsert) return json({ ok: true, ignored: "duplicate_message" });

  await readBusinessMessage({
    businessConnectionId,
    chatId: telegramChatId,
    messageId: message.message_id,
  });

  const body = telegramMessageBody(message);

  // Handoff messages are transport/authentication messages, not customer dialogue.
  if (!link && isCustomerTextCapable(message)) {
    try {
      link = await consumeTelegramHandoff({
        text: body,
        businessConnectionId,
        telegramChatId,
        telegramUserId,
      });
    } catch (error) {
      console.error("telegram_handoff_consume_failed", error);
    }

    if (link) {
      await attachTelegramIncomingIdentity({
        businessConnectionId,
        telegramChatId,
        telegramMessageId: message.message_id,
        canonicalWaId: link.canonical_wa_id,
        applicationId: link.application_id,
      });
      const summary = await buildTelegramOrderSummary(link.application_id);
      const sent = await sendBusinessText({
        businessConnectionId,
        chatId: telegramChatId,
        text: summary,
      });
      await logTelegramOutgoing({
        businessConnectionId,
        telegramChatId,
        telegramMessageId: sent.message_id,
        canonicalWaId: link.canonical_wa_id,
        applicationId: link.application_id,
        body: summary,
        handledByAi: false,
        turnId: `tg-handoff:${businessConnectionId}:${message.message_id}`,
      });
      return json({ ok: true, handled: "handoff_linked" });
    }
  }

  if (!link) {
    const text = "أهلين، حتى أربط محادثتك بنفس طلبك الحالي بأمان افتح رابط المتابعة الخاص فيك من الأمين على واتساب. الرابط بيربط المحادثتين بدون ما تعيد بياناتك.";
    const sent = await sendBusinessText({ businessConnectionId, chatId: telegramChatId, text });
    await logTelegramOutgoing({
      businessConnectionId,
      telegramChatId,
      telegramMessageId: sent.message_id,
      canonicalWaId: `tg-unlinked:${telegramChatId}`,
      applicationId: null,
      body: text,
      handledByAi: false,
    });
    return json({ ok: true, handled: "unlinked_customer" });
  }

  await attachTelegramIncomingIdentity({
    businessConnectionId,
    telegramChatId,
    telegramMessageId: message.message_id,
    canonicalWaId: link.canonical_wa_id,
    applicationId: link.application_id,
  });

  let effectiveBody = body;
  const type = telegramMessageType(message);
  if (["photo", "voice", "audio", "document", "video"].includes(type)) {
    const media = await persistTelegramMedia({
      message,
      canonicalWaId: link.canonical_wa_id,
      applicationId: link.application_id,
    });
    if (media) {
      await attachTelegramIncomingMedia({
        businessConnectionId,
        telegramChatId,
        telegramMessageId: message.message_id,
        media,
      });
      effectiveBody = telegramMediaCustomerText(message, media);

      const voiceUnderstood = (media.kind === "voice" || media.kind === "audio") && Boolean(media.transcript);
      if (!voiceUnderstood) {
        const mediaName = media.kind === "photo" ? "الصورة"
          : media.kind === "document" ? "الملف"
          : media.kind === "video" ? "الفيديو"
          : "الفويس";
        const storageLine = media.storagePath ? "وانحفظ بأمان مع محادثتك" : "ووصلتني بياناته، لكن حفظه التلقائي تعذر";
        const text = `وصلني ${mediaName} ${storageLine}. ما رح أدّعي إني فهمت محتوى المرفق إذا ما كان عندي تحليل موثوق إله. إذا بدك جواب فوري اكتب المطلوب عنه بنص، أو خليه للمتابعة البشرية من نفس المحادثة.`;
        const sent = await sendBusinessText({ businessConnectionId, chatId: telegramChatId, text });
        await logTelegramOutgoing({
          businessConnectionId,
          telegramChatId,
          telegramMessageId: sent.message_id,
          canonicalWaId: link.canonical_wa_id,
          applicationId: link.application_id,
          body: text,
          handledByAi: false,
          turnId: `tg-media:${businessConnectionId}:${message.message_id}`,
        });
        return json({ ok: true, handled: "media_stored_safe", mediaKind: media.kind, stored: Boolean(media.storagePath), warning: media.warning });
      }
    }
  }

  if (telegramLinkAiPaused(link)) return json({ ok: true, handled: "ai_paused_for_human" });
  if (!config.aiEnabled) return json({ ok: true, handled: "telegram_ai_disabled" });

  if (!String(effectiveBody || "").trim()) {
    const text = "وصلتني الرسالة، لكن ما قدرت أستخرج منها نص موثوق. اكتب المطلوب بنص وبكمل معك من نفس الطلب.";
    const sent = await sendBusinessText({ businessConnectionId, chatId: telegramChatId, text });
    await logTelegramOutgoing({
      businessConnectionId,
      telegramChatId,
      telegramMessageId: sent.message_id,
      canonicalWaId: link.canonical_wa_id,
      applicationId: link.application_id,
      body: text,
      handledByAi: false,
    });
    return json({ ok: true, handled: "non_text_without_trusted_text" });
  }

  const control = await getV3ProductionControl();
  if (!isV3ProductionActive(control)) {
    const text = "وصلتني رسالتك وهي محفوظة على نفس طلبك. نظام المحادثة تحت صيانة قصيرة حاليًا، وما رح أعطيك معلومة غير مؤكدة.";
    const sent = await sendBusinessText({ businessConnectionId, chatId: telegramChatId, text });
    await logTelegramOutgoing({
      businessConnectionId,
      telegramChatId,
      telegramMessageId: sent.message_id,
      canonicalWaId: link.canonical_wa_id,
      applicationId: link.application_id,
      body: text,
      handledByAi: false,
    });
    return json({ ok: true, handled: "v3_not_active" });
  }

  await sendBusinessTyping({ businessConnectionId, chatId: telegramChatId });
  const recentTurns = await loadCrossChannelRecentTurns(link.canonical_wa_id);
  const turnId = `tg:${businessConnectionId}:${message.message_id}`;

  let run: Awaited<ReturnType<typeof runV3ProductionLive>> | null = null;
  let reply = "";
  try {
    run = await runV3ProductionLive({
      waId: link.canonical_wa_id,
      turnId,
      customerText: effectiveBody,
      recentTurns,
      profileName: profileName(message),
      // Separate cutover safety guard: Telegram mutations remain off until
      // TELEGRAM_REAL_ACTIONS_ENABLED=true AND the existing V3 control allows them.
      realActionsEnabled: config.realActionsEnabled && control.realActionsEnabled,
    });
    reply = String(run.reply || "").trim();
  } catch (error) {
    console.error("telegram_v3_runtime_failed", { turnId, error });
  }

  if (!reply) reply = buildV3LastResortReply();

  const sent = await sendBusinessText({
    businessConnectionId,
    chatId: telegramChatId,
    text: reply,
  });

  await logTelegramOutgoing({
    businessConnectionId,
    telegramChatId,
    telegramMessageId: sent.message_id,
    canonicalWaId: link.canonical_wa_id,
    applicationId: link.application_id,
    body: reply,
    handledByAi: Boolean(run),
    turnId,
  });

  if (run?.stateAfter) {
    await saveV3ConversationState(run.stateAfter);
  }
  if (run?.humanOs?.memoryAfter) {
    await saveCompactHumanMemory(link.canonical_wa_id, run.humanOs.memoryAfter);
  }
  if (run?.humanOs) {
    await completeHumanTurnDelivery({
      turnId: run.humanOs.journalTurnId,
      providerMessageId: `telegram:${sent.message_id}`,
      memoryAfter: run.humanOs.memoryAfter,
    });
  }

  return json({
    ok: true,
    handled: "v3_reply",
    realActionsEnabled: config.realActionsEnabled && control.realActionsEnabled,
  });
}
