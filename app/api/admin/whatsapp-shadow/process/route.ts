import { NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findApplicationByPhone, findApplicationByTracking } from "@/app/api/whatsapp/webhook/_lib/applicationLookup";
import { getConversationMemory } from "@/app/api/whatsapp/webhook/_lib/conversationMemory";
import { runShadowModeV2 } from "@/app/api/whatsapp/webhook/_lib/shadow-v2";
import type { CustomerIntent } from "@/app/api/whatsapp/webhook/_lib/types";

export const dynamic = "force-dynamic";

type QueueRow = {
  id: string;
  created_at?: string | null;
  wa_id?: string | null;
  message_id?: string | null;
  status?: string | null;
  raw_payload?: unknown;
};

type QueuePayload = {
  actualWaId?: string;
  incomingMessageId?: string | null;
  customerMessage?: string;
  actualReply?: string;
  initialIntent?: string;
  facts?: { trackingId?: string | null };
  [key: string]: unknown;
};

function parsePayload(value: unknown): QueuePayload {
  return value && typeof value === "object" ? value as QueuePayload : {};
}

async function findActualReply(waId: string, createdAt: string | null | undefined) {
  const baseQuery = supabaseAdmin
    .from("whatsapp_messages")
    .select("body, created_at")
    .eq("wa_id", waId)
    .eq("direction", "outgoing")
    .neq("message_type", "admin_control")
    .order("created_at", { ascending: true })
    .limit(10);

  const { data, error } = createdAt
    ? await baseQuery.gte("created_at", createdAt)
    : await baseQuery;

  if (error) {
    console.error("Shadow processor actual reply lookup failed", error);
    return "";
  }

  const matching = (data || []).find((row) => String(row.body || "").trim());
  return String(matching?.body || "").trim();
}

export async function POST() {
  if (!(await isAdminLoggedIn())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: queuedRow, error: queueReadError } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id, created_at, wa_id, message_id, status, raw_payload")
    .eq("message_type", "shadow_v2")
    .eq("status", "shadow_queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (queueReadError && (queueReadError as any).code !== "PGRST116") {
    return NextResponse.json({ error: queueReadError.message }, { status: 500 });
  }

  if (!queuedRow) return NextResponse.json({ processed: false, remaining: false });

  const row = queuedRow as QueueRow;
  const payload = parsePayload(row.raw_payload);
  const actualWaId = String(payload.actualWaId || row.wa_id || "").replace(/^shadow_v2:/, "").trim();
  const customerText = String(payload.customerMessage || "").trim();

  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .from("whatsapp_messages")
    .update({ status: "shadow_processing" })
    .eq("id", row.id)
    .eq("status", "shadow_queued")
    .select("id")
    .limit(1);

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimedRows?.length) return NextResponse.json({ processed: false, race: true });

  try {
    const actualReply = String(payload.actualReply || "").trim() || await findActualReply(actualWaId, row.created_at);

    if (!actualWaId || !customerText || !actualReply) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ status: "shadow_queued" })
        .eq("id", row.id);

      return NextResponse.json({ processed: false, pending: true });
    }

    const trackingId = String(payload.facts?.trackingId || "").trim();
    const application = trackingId
      ? (await findApplicationByTracking(trackingId)) || (await findApplicationByPhone(actualWaId))
      : await findApplicationByPhone(actualWaId);
    const memory = await getConversationMemory(actualWaId, 60);

    let saved = false;
    await runShadowModeV2({
      waId: actualWaId,
      incomingMessageId: payload.incomingMessageId || null,
      customerName: null,
      customerText,
      messageType: "text",
      initialIntent: (payload.initialIntent || "unknown") as CustomerIntent,
      actualReply,
      application,
      memory,
      trackingId: trackingId || application?.tracking_id || null,
      logShadow: async (shadowPayload) => {
        const { error: saveError } = await supabaseAdmin
          .from("whatsapp_messages")
          .update({
            body: shadowPayload.candidateReply,
            intent: shadowPayload.initialIntent || null,
            tracking_id: shadowPayload.facts.trackingId || null,
            application_id: application?.id || null,
            raw_payload: shadowPayload,
            status: shadowPayload.validation.valid ? "shadow_pass" : "shadow_blocked",
          })
          .eq("id", row.id);

        if (saveError) throw saveError;
        saved = true;
      },
    });

    if (!saved) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          body: "[تعذر تشغيل محرك Shadow v2 من معالج لوحة المراجعة]",
          status: "shadow_failed",
          raw_payload: {
            ...payload,
            actualWaId,
            actualReply,
            candidateReply: "[تعذر تشغيل محرك Shadow v2 من معالج لوحة المراجعة]",
            validation: { valid: false, score: 0, riskFlags: ["shadow_processor_skipped"] },
          },
        })
        .eq("id", row.id);
    }

    return NextResponse.json({ processed: true, id: row.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from("whatsapp_messages")
      .update({
        body: "[فشل معالج Shadow v2؛ الرد الفعلي للعميل لم يتأثر]",
        status: "shadow_failed",
        raw_payload: {
          ...payload,
          candidateReply: "[فشل معالج Shadow v2؛ الرد الفعلي للعميل لم يتأثر]",
          validation: { valid: false, score: 0, riskFlags: ["shadow_processor_failed"] },
          runtimeError: message,
        },
      })
      .eq("id", row.id);

    return NextResponse.json({ processed: true, failed: true, error: message });
  }
}
