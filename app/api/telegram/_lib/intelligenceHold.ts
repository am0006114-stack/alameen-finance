import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTelegramChannelConfig } from "./config";
import { loadTelegramCustomerLink, telegramLinkAiPaused } from "./handoff";
import { loadCrossChannelRecentTurns, logTelegramOutgoing } from "./messages";
import { buildTelegramOrderSummary } from "./orderSummary";
import {
  buildTelegramPaymentReply,
  buildTelegramStatusReply,
  polishTelegramReply,
  telegramPresentationIntent,
  loadTelegramApplicationSnapshot,
} from "./presentation";
import { sendBusinessText, sendBusinessTyping } from "./telegramApi";
import { getV3ProductionControl, isV3ProductionActive } from "../../whatsapp/webhook/_lib/v3-os/productionControl";
import { buildV3LastResortReply, runV3ProductionLive } from "../../whatsapp/webhook/_lib/v3-os/runtimeLive";
import { saveV3ConversationState } from "../../whatsapp/webhook/_lib/v3-os/stateStore";
import { saveCompactHumanMemory } from "../../whatsapp/webhook/_lib/v3-os/compactHumanMemory";
import { completeHumanTurnDelivery } from "../../whatsapp/webhook/_lib/v3-os/durableTurnJournal";

export const TELEGRAM_INTELLIGENCE_HOLD_SECONDS = 20;

type ClaimedHoldJob = {
  id: string;
  business_connection_id: string;
  telegram_chat_id: string;
  canonical_wa_id: string;
  application_id?: string | null;
  latest_message_id?: number | null;
  latest_update_id?: number | null;
  window_started_at?: string | null;
  due_at?: string | null;
  attempt_count?: number | null;
};

type HeldMessageRow = {
  telegram_message_id?: number | null;
  body?: string | null;
  transcript?: string | null;
  customer_name?: string | null;
  created_at?: string | null;
};

export async function enqueueTelegramIntelligenceHold(input: {
  businessConnectionId: string;
  telegramChatId: string;
  canonicalWaId: string;
  applicationId?: string | null;
  latestMessageId: number;
  latestUpdateId: number;
}) {
  const { data, error } = await supabaseAdmin.rpc("enqueue_telegram_intelligence_hold", {
    p_business_connection_id: input.businessConnectionId,
    p_telegram_chat_id: input.telegramChatId,
    p_canonical_wa_id: input.canonicalWaId,
    p_application_id: input.applicationId || null,
    p_latest_message_id: input.latestMessageId,
    p_latest_update_id: input.latestUpdateId,
    p_hold_seconds: TELEGRAM_INTELLIGENCE_HOLD_SECONDS,
  });

  if (error) throw new Error(`telegram_intelligence_hold_enqueue:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    queued: Boolean(row?.queued ?? true),
    dueAt: row?.due_at ? String(row.due_at) : null,
    windowStartedAt: row?.window_started_at ? String(row.window_started_at) : null,
  };
}

function normalizeHeldText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildCombinedCustomerText(rows: HeldMessageRow[]) {
  const parts = rows
    .map((row) => normalizeHeldText(row.transcript || row.body))
    .filter(Boolean);

  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];

  // Keep the transport burst semantically pure. Bubble boundaries are represented
  // only by newlines; no system narration or numbering is injected into customerText.
  return parts.join("\n");
}

function latestHeldCustomerText(rows: HeldMessageRow[]) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const text = normalizeHeldText(rows[i]?.transcript || rows[i]?.body);
    if (text) return text;
  }
  return "";
}

function normalizeConversationSignal(value: string | null | undefined) {
  return normalizeHeldText(value)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function telegramSocialClosureText(value: string | null | undefined) {
  const raw = normalizeHeldText(value);
  const q = normalizeConversationSignal(value);
  if (!q || /[؟?]/.test(raw)) return false;
  if (/(?:^|\s)(?:متي|امتي|ليش|كيف|شو|وين|اين|قديش|كم|هل|بدي|اريد|حاب|بس)(?:\s|$)/.test(q)) return false;
  if (/(?:الغاء|استرداد|استرجاع|دفع|حول|حواله|طلب|مشكلتي)/.test(q)) return false;
  return /^(?:تمام(?:\s+شكرا)?|شكرا|يسلمو|يعطيك\s+العافيه|الله\s+يعطيكم\s+العافيه|مو\s+مشكله(?:\s+بستن[اي].*)?|مش\s+مشكله(?:\s+بستن[اي].*)?|بستن[اي](?:\s+خير\s+منكم)?|ان\s+شاء\s+الله(?:\s+خير)?|خلص\s+بستن[اي]|خير\s+ان\s+شاء\s+الله)$/.test(q);
}

function telegramTrustConcernText(value: string | null | undefined) {
  const q = normalizeConversationSignal(value);
  if (!q) return false;
  if (/(?:^|\s)(?:نصب|نصاب|نصابين|احتيال|محتال|محتالين)(?:\s|$)/.test(q)) return true;
  return /(?:ما\s+بطمن|مش\s+بطمن|مش\s+مطمن|مش\s+واثق|ما\s+بثق|مش\s+بثق|شو\s+بضمن|كيف\s+اضمن|بدي\s+اطمن|بدي\s+اتأكد|بدي\s+اتاكد)/.test(q);
}

function telegramDelayComplaintText(value: string | null | undefined) {
  const q = normalizeConversationSignal(value);
  if (!q) return false;
  return /(?:(?:20|٢٠|عشرين)\s*يوم|(?:صارلي|صرلي)\s+.*?يوم|تاخير|تأخير|تاخر|تأخر|المعامله\s+ما\s+بتضل|طولت|مطوله)/.test(q);
}

function daysSince(value: string | null | undefined) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}

async function buildTelegramTrustReply(input: {
  applicationId: string;
  profileName?: string | null;
  customerText?: string | null;
}) {
  const app = await loadTelegramApplicationSnapshot(input.applicationId);
  if (!app) return null;

  const applicationName = normalizeHeldText(app.fullName).split(/\s+/).filter(Boolean)[0] || "عميلنا";
  const statusReply = await buildTelegramStatusReply(input.applicationId);
  const statusBody = statusReply
    ? statusReply.replace(/^أهلين[^\n]*\n\n?/, "").trim()
    : null;
  const paymentConfirmed = Boolean(app.paymentConfirmedAt)
    || ["confirmed", "paid", "payment_confirmed"].includes(String(app.paymentStatus || "").trim().toLowerCase());
  const paymentDays = daysSince(app.paymentConfirmedAt);
  const statusValue = String(app.status || "").toLowerCase();
  const refundOrCancelled = /(?:refund|cancel)/.test(statusValue) || /(?:refund|cancel)/.test(String(app.paymentStatus || "").toLowerCase());
  const asksAboutPlace = /(?:مكان|محل|معرض|عنوان|استلام|تسليم|اجيب\s+منو\s+جهاز|اجيب\s+منه\s+جهاز)/.test(normalizeConversationSignal(input.customerText));

  const lines = [
    `${applicationName}، فاهم ليش صار عندك شك، وخصوصًا مع طول الانتظار.`,
    "ما رح أجاوبك بشرح عام عن الرسوم بدل سؤالك، وما بقدر أطلب منك تثق بكلامي وحده.",
  ];

  if (app.trackingId) lines.push("", `🔖 رقم طلبك: ${app.trackingId}`);
  if (paymentConfirmed) lines.push("💳 رسوم فتح الملف مؤكدة إداريًا على طلبك، وما في دفعة إضافية مطلوبة منك حاليًا.");
  if (paymentDays != null && paymentDays >= 10) {
    lines.push(`⏱️ صار تقريبًا ${paymentDays} يوم من تأكيد الدفع، وهاي مدة انتظار طويلة ومن حقك تستفسر عنها.`);
  }

  if (statusBody) lines.push("", statusBody);

  lines.push(
    "",
    "ما بقدر أعطيك سبب غير موثق للتأخير أو أوعدك بموعد مش مثبت بالنظام. أي تحديث أو قرار لازم يكون مسجل فعليًا على طلبك.",
  );

  if (asksAboutPlace) {
    lines.push("إذا قصدك عنوان معرض أو مكان استلام/تسليم، ما رح أعطيك عنوان أو معلومة غير مثبتة عندي. بعطيك فقط أي مكان أو خطوة تكون مسجلة رسميًا على الطلب.");
  }

  lines.push("المتابعة التفصيلية بتكمل هون على Telegram المرتبط بنفس طلبك، وواتساب بيظل للتنبيهات والمتابعة الأساسية.");

  if (paymentConfirmed && !refundOrCancelled) {
    lines.push("وإذا قررت توقف، فيك تطلب إلغاء الطلب واسترداد رسوم فتح الملف عبر المسار الرسمي.");
  }

  return lines.join("\n");
}

function enforceTelegramChannelTruth(value: string | null | undefined) {
  let text = String(value || "");
  text = text
    .replace(/المتابع(?:ة|ه)\s+بتصير\s+من\s+خلالي\s+هون\s+على\s+واتساب/gi, "المتابعة التفصيلية بتكمل من خلالي هون على Telegram")
    .replace(/من\s+خلالي\s+هون\s+على\s+واتساب/gi, "من خلالي هون على Telegram")
    .replace(/هون\s+على\s+واتساب/gi, "هون على Telegram")
    .replace(/(?:تابع|كمل|تواصل)\s+(?:معي\s+)?(?:هون\s+)?(?:على|عبر)\s+واتساب/gi, "كمل معي هون على Telegram");
  return text;
}

function lowInformationTelegramTurn(value: string | null | undefined) {
  const q = normalizeConversationSignal(value);
  if (!q) return true;
  if (q.length > 30) return false;
  return /^(?:تمام|طيب|اه|نعم|شكرا|اوك|اوكي|هه|هههه|رجاء|شو\s+صار|متي|امتي)$/.test(q);
}

function replyTokens(value: string | null | undefined) {
  return normalizeConversationSignal(value).split(/\s+/).filter(Boolean);
}

function telegramNearDuplicate(a: string | null | undefined, b: string | null | undefined) {
  const aa = replyTokens(a);
  const bb = replyTokens(b);
  if (!aa.length || !bb.length) return false;
  const na = aa.join(" ");
  const nb = bb.join(" ");
  if (na === nb) return true;
  if (aa.length < 7 || bb.length < 7) return false;
  const sa = new Set(aa);
  const sb = new Set(bb);
  let common = 0;
  for (const token of sa) if (sb.has(token)) common++;
  const union = new Set([...sa, ...sb]).size || 1;
  const lengthRatio = Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length);
  return common / union >= 0.72 && lengthRatio >= 0.68;
}

async function loadLastTelegramOutgoing(job: ClaimedHoldJob) {
  const { data, error } = await supabaseAdmin
    .from("telegram_messages")
    .select("body,created_at")
    .eq("business_connection_id", job.business_connection_id)
    .eq("telegram_chat_id", job.telegram_chat_id)
    .eq("direction", "outgoing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("telegram_last_outgoing_read_failed", error.message);
    return null;
  }
  return data || null;
}

async function loadHeldMessages(job: ClaimedHoldJob) {
  const from = job.window_started_at || new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("telegram_messages")
    .select("telegram_message_id,body,transcript,customer_name,created_at")
    .eq("business_connection_id", job.business_connection_id)
    .eq("telegram_chat_id", job.telegram_chat_id)
    .eq("direction", "incoming")
    .gte("created_at", from)
    .order("created_at", { ascending: true })
    .limit(40);

  if (error) throw new Error(`telegram_intelligence_hold_messages:${error.message}`);
  return (data || []) as HeldMessageRow[];
}

async function holdStillCurrent(job: ClaimedHoldJob) {
  const { data, error } = await supabaseAdmin
    .from("telegram_intelligence_hold_jobs")
    .select("status,latest_message_id,due_at,locked_by")
    .eq("id", job.id)
    .maybeSingle();
  if (error || !data) return false;

  const latestMatches = Number(data.latest_message_id || 0) === Number(job.latest_message_id || 0);
  const duePassed = !data.due_at || Date.parse(String(data.due_at)) <= Date.now();
  return data.status === "processing" && latestMatches && duePassed;
}

async function completeHold(jobId: string) {
  const { error } = await supabaseAdmin.rpc("complete_telegram_intelligence_hold", { p_job_id: jobId });
  if (error) throw new Error(`telegram_intelligence_hold_complete:${error.message}`);
}

async function releaseHold(jobId: string, errorMessage: string) {
  const { error } = await supabaseAdmin.rpc("release_telegram_intelligence_hold", {
    p_job_id: jobId,
    p_error: errorMessage.slice(0, 1800),
  });
  if (error) console.error("telegram_intelligence_hold_release_failed", error.message);
}

async function claimHoldJobs(workerId: string, limit: number) {
  const { data, error } = await supabaseAdmin.rpc("claim_telegram_intelligence_hold_jobs", {
    p_worker_id: workerId,
    p_limit: limit,
  });
  if (error) throw new Error(`telegram_intelligence_hold_claim:${error.message}`);
  return (data || []) as ClaimedHoldJob[];
}

async function processOne(job: ClaimedHoldJob) {
  try {
    const config = getTelegramChannelConfig();
    if (!config.aiEnabled) {
      await completeHold(job.id);
      return { id: job.id, status: "skipped_ai_disabled" };
    }

    const link = await loadTelegramCustomerLink({
      businessConnectionId: job.business_connection_id,
      telegramChatId: job.telegram_chat_id,
    });
    if (!link) {
      await completeHold(job.id);
      return { id: job.id, status: "skipped_unlinked" };
    }
    if (telegramLinkAiPaused(link)) {
      await completeHold(job.id);
      return { id: job.id, status: "skipped_human_takeover" };
    }

    const rows = await loadHeldMessages(job);
    const customerText = buildCombinedCustomerText(rows);
    const latestCustomerText = latestHeldCustomerText(rows);
    if (!customerText) {
      await completeHold(job.id);
      return { id: job.id, status: "skipped_empty" };
    }

    if (!(await holdStillCurrent(job))) {
      return { id: job.id, status: "superseded_before_reasoning" };
    }

    // The latest customer bubble owns social closure. Never let an older status
    // question inside the same 20-second comprehension window resurrect itself
    // after the customer has already closed the exchange naturally.
    if (telegramSocialClosureText(latestCustomerText)) {
      const text = "تمام، إن شاء الله خير 🌟 ما رح أعيد عليك نفس التفاصيل؛ إذا صار في تحديث جديد على طلبك بوضحلك الجديد فقط من نفس المحادثة.";
      if (!(await holdStillCurrent(job))) return { id: job.id, status: "superseded_before_social_closure" };
      const sent = await sendBusinessText({
        businessConnectionId: job.business_connection_id,
        chatId: job.telegram_chat_id,
        text,
      });
      await logTelegramOutgoing({
        businessConnectionId: job.business_connection_id,
        telegramChatId: job.telegram_chat_id,
        telegramMessageId: sent.message_id,
        canonicalWaId: link.canonical_wa_id,
        applicationId: link.application_id,
        body: text,
        handledByAi: false,
        turnId: `tg-hold-social:${job.id}`,
      });
      await completeHold(job.id);
      return { id: job.id, status: "social_closure" };
    }

    // Trust accusations and explicit lack of confidence own the turn before any
    // generic fee/status reasoning. If the customer split the concern across
    // several bubbles, a current delay complaint can still inherit that trust
    // context from the same comprehension window.
    const trustOwnsTurn = telegramTrustConcernText(latestCustomerText)
      || (telegramTrustConcernText(customerText) && telegramDelayComplaintText(latestCustomerText));
    if (trustOwnsTurn && link.application_id) {
      const profileName = rows.map((row) => normalizeHeldText(row.customer_name)).find(Boolean) || null;
      const text = await buildTelegramTrustReply({
        applicationId: link.application_id,
        profileName,
        customerText,
      });
      if (text) {
        if (!(await holdStillCurrent(job))) return { id: job.id, status: "superseded_before_trust_reply" };
        const sent = await sendBusinessText({
          businessConnectionId: job.business_connection_id,
          chatId: job.telegram_chat_id,
          text,
        });
        await logTelegramOutgoing({
          businessConnectionId: job.business_connection_id,
          telegramChatId: job.telegram_chat_id,
          telegramMessageId: sent.message_id,
          canonicalWaId: link.canonical_wa_id,
          applicationId: link.application_id,
          body: text,
          handledByAi: false,
          turnId: `tg-hold-trust:${job.id}`,
        });
        await completeHold(job.id);
        return { id: job.id, status: "trust_grounded_reply" };
      }
    }

    const control = await getV3ProductionControl();
    if (!isV3ProductionActive(control)) {
      const text = "وصلتني رسائلك وهي محفوظة على نفس طلبك. نظام المحادثة تحت صيانة قصيرة حاليًا، وما رح أعطيك معلومة غير مؤكدة.";
      if (!(await holdStillCurrent(job))) return { id: job.id, status: "superseded_before_maintenance_reply" };
      const sent = await sendBusinessText({
        businessConnectionId: job.business_connection_id,
        chatId: job.telegram_chat_id,
        text,
      });
      await logTelegramOutgoing({
        businessConnectionId: job.business_connection_id,
        telegramChatId: job.telegram_chat_id,
        telegramMessageId: sent.message_id,
        canonicalWaId: link.canonical_wa_id,
        applicationId: link.application_id,
        body: text,
        handledByAi: false,
        turnId: `tg-hold-maintenance:${job.id}`,
      });
      await completeHold(job.id);
      return { id: job.id, status: "maintenance_reply" };
    }

    await sendBusinessTyping({
      businessConnectionId: job.business_connection_id,
      chatId: job.telegram_chat_id,
    });

    // Direct presentation intent belongs to the latest bubble only. Older
    // questions remain context for V3, but cannot force a new status/summary
    // response after the customer has moved on.
    const presentationIntent = telegramPresentationIntent(latestCustomerText || customerText);
    if (presentationIntent && link.application_id) {
      let presented = presentationIntent === "summary"
        ? await buildTelegramOrderSummary(link.application_id)
        : presentationIntent === "payment"
          ? await buildTelegramPaymentReply(link.application_id)
          : await buildTelegramStatusReply(link.application_id);

      if (presented) {
        const previous = await loadLastTelegramOutgoing(job);
        if (presentationIntent === "status" && telegramNearDuplicate(presented, previous?.body)) {
          presented = "ما ظهر تحديث جديد على طلبك لحد الآن، ولسا على نفس الحالة السابقة. إذا تغيرت الحالة بعطيك الجديد فقط بدون ما أعيد ملخص الطلب كامل.";
        }

        if (!(await holdStillCurrent(job))) return { id: job.id, status: "superseded_before_presentation" };
        const sent = await sendBusinessText({
          businessConnectionId: job.business_connection_id,
          chatId: job.telegram_chat_id,
          text: presented,
        });
        await logTelegramOutgoing({
          businessConnectionId: job.business_connection_id,
          telegramChatId: job.telegram_chat_id,
          telegramMessageId: sent.message_id,
          canonicalWaId: link.canonical_wa_id,
          applicationId: link.application_id,
          body: presented,
          handledByAi: false,
          turnId: `tg-hold-presentation:${job.id}`,
        });
        await completeHold(job.id);
        return { id: job.id, status: `presentation_${presentationIntent}` };
      }
    }

    const recentTurns = await loadCrossChannelRecentTurns(link.canonical_wa_id);
    // Server-owned transport/application binding stays separate from customer words.
    const transportContext = {
      channel: "telegram" as const,
      applicationId: link.application_id || null,
    };
    const turnId = `tg-hold:${job.business_connection_id}:${job.latest_message_id || job.id}`;
    const profileName = rows.map((row) => normalizeHeldText(row.customer_name)).find(Boolean) || null;

    let run: Awaited<ReturnType<typeof runV3ProductionLive>> | null = null;
    let reply = "";
    try {
      run = await runV3ProductionLive({
        waId: link.canonical_wa_id,
        turnId,
        customerText,
        transportContext,
        recentTurns,
        profileName,
        realActionsEnabled: config.realActionsEnabled && control.realActionsEnabled,
      });
      reply = String(run.reply || "").trim();
    } catch (error) {
      console.error("telegram_held_v3_runtime_failed", { turnId, error });
    }

    if (!reply) reply = buildV3LastResortReply();
    reply = enforceTelegramChannelTruth(polishTelegramReply(reply));

    const previous = await loadLastTelegramOutgoing(job);
    if (telegramNearDuplicate(reply, previous?.body) && lowInformationTelegramTurn(latestCustomerText)) {
      reply = "وصلتني. ما عندي تحديث جديد أضيفه على آخر جواب حاليًا، فما رح أعيد نفس الكلام عليك.";
    }

    // A new customer bubble arriving while the model was reasoning invalidates
    // this reply. The newer 20-second window owns the next response.
    if (!(await holdStillCurrent(job))) {
      return { id: job.id, status: "superseded_after_reasoning" };
    }

    const sent = await sendBusinessText({
      businessConnectionId: job.business_connection_id,
      chatId: job.telegram_chat_id,
      text: reply,
    });

    await logTelegramOutgoing({
      businessConnectionId: job.business_connection_id,
      telegramChatId: job.telegram_chat_id,
      telegramMessageId: sent.message_id,
      canonicalWaId: link.canonical_wa_id,
      applicationId: link.application_id,
      body: reply,
      handledByAi: Boolean(run),
      turnId,
    });

    if (run?.stateAfter) await saveV3ConversationState(run.stateAfter);
    if (run?.humanOs?.memoryAfter) await saveCompactHumanMemory(link.canonical_wa_id, run.humanOs.memoryAfter);
    if (run?.humanOs) {
      await completeHumanTurnDelivery({
        turnId: run.humanOs.journalTurnId,
        providerMessageId: `telegram:${sent.message_id}`,
        memoryAfter: run.humanOs.memoryAfter,
      });
    }

    await completeHold(job.id);
    return { id: job.id, status: "v3_reply", messageCount: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await releaseHold(job.id, message);
    console.error("telegram_intelligence_hold_job_failed", { jobId: job.id, error: message });
    return { id: job.id, status: "retry_wait", error: message.slice(0, 300) };
  }
}

export async function processTelegramIntelligenceHoldBatch(limit = 6) {
  const workerId = `telegram-intelligence:${randomUUID()}`;
  const jobs = await claimHoldJobs(workerId, Math.max(1, Math.min(12, limit)));
  const results = [] as Array<Record<string, unknown>>;
  for (const job of jobs) results.push(await processOne(job));
  return { workerId, claimed: jobs.length, results };
}
