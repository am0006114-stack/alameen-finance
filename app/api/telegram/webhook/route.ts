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
import { readBusinessMessage, sendBusinessText } from "../_lib/telegramApi";
import {
  attachTelegramIncomingIdentity,
  attachTelegramIncomingMedia,
  logTelegramIncoming,
  logTelegramOutgoing,
  telegramMessageBody,
  telegramMessageType,
} from "../_lib/messages";
import { buildTelegramOrderSummary } from "../_lib/orderSummary";
import { persistTelegramMedia, telegramMediaCustomerText } from "../_lib/media";
import { enqueueTelegramIntelligenceHold } from "../_lib/intelligenceHold";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
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
  return json({ ok: true, channel: "telegram_business", phase: "18.5.1" });
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

  try {
    const hold = await enqueueTelegramIntelligenceHold({
      businessConnectionId,
      telegramChatId,
      canonicalWaId: link.canonical_wa_id,
      applicationId: link.application_id,
      latestMessageId: message.message_id,
      latestUpdateId: update.update_id,
    });

    return json({
      ok: true,
      handled: "held_for_humanized_intelligence",
      holdSeconds: 20,
      dueAt: hold.dueAt,
      realActionsEnabled: false,
    });
  } catch (error) {
    console.error("telegram_intelligence_hold_enqueue_failed", error);
    // Do not fall back to immediate model execution. That would defeat the
    // 20-second comprehension window and can multiply AI/Vercel spend. The
    // message is already durably stored in telegram_messages and can be retried
    // after the queue/schema is repaired.
    return json({ ok: true, deferred: "intelligence_hold_unavailable" });
  }
}
