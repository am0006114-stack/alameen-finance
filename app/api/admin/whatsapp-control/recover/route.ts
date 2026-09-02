import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getV3ProductionControl, isV3ProductionActive } from "@/app/api/whatsapp/webhook/_lib/v3-os/productionControl";
import { runV3ProductionLive } from "@/app/api/whatsapp/webhook/_lib/v3-os/runtimeLive";
import { saveV3ConversationState } from "@/app/api/whatsapp/webhook/_lib/v3-os/stateStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_HOURS = [1, 2, 6, 12, 24, 48, 168];
const FREEFORM_WINDOW_MS = 23.5 * 60 * 60 * 1000;

type MessageRow = {
  id?: string | null;
  wa_id?: string | null;
  direction?: string | null;
  body?: string | null;
  message_id?: string | null;
  message_type?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  tracking_id?: string | null;
  application_id?: string | null;
  intent?: string | null;
};

function normalizeRecipient(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("07") && digits.length === 10) return `962${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `962${digits}`;
  return digits;
}

async function sendWhatsAppText(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.GRAPH_API_VERSION || "v20.0";
  if (!token || !phoneNumberId) return { ok: false, messageId: null as string | null, error: "missing_whatsapp_credentials" };
  const cleanTo = normalizeRecipient(to);
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: cleanTo, type: "text", text: { preview_url: true, body } }),
  });
  const raw = await response.text();
  let parsed: any = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch {}
  const messageId = parsed?.messages?.[0]?.id ? String(parsed.messages[0].id) : null;
  if (!response.ok || !messageId) return { ok: false, messageId: null, error: String(parsed?.error?.message || parsed?.error?.code || raw || `HTTP ${response.status}`) };
  return { ok: true, messageId, error: null as string | null };
}

async function fetchRows(since: string) {
  const all: MessageRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 12000; from += pageSize) {
    const { data, error } = await supabaseAdmin.from("whatsapp_messages").select("id,wa_id,direction,body,message_id,message_type,created_at,customer_name,tracking_id,application_id,intent").gte("created_at", since).order("created_at", { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data || []) as MessageRow[];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

function pendingFromRows(rows: MessageRow[]) {
  const byWa = new Map<string, { latestIncoming?: MessageRow; latestOutgoing?: MessageRow; messages: MessageRow[] }>();
  for (const row of rows) {
    const waId = String(row.wa_id || "").trim();
    if (!waId) continue;
    const item = byWa.get(waId) || { messages: [] };
    item.messages.push(row);
    const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (row.direction === "incoming") {
      const prev = item.latestIncoming?.created_at ? new Date(item.latestIncoming.created_at).getTime() : 0;
      if (ts >= prev) item.latestIncoming = row;
    }
    if (row.direction === "outgoing" && row.message_type !== "admin_control") {
      const prev = item.latestOutgoing?.created_at ? new Date(item.latestOutgoing.created_at).getTime() : 0;
      if (ts >= prev) item.latestOutgoing = row;
    }
    byWa.set(waId, item);
  }
  return Array.from(byWa.entries()).map(([waId, item]) => ({ waId, ...item })).filter((item) => {
    if (!item.latestIncoming?.created_at) return false;
    if (!item.latestOutgoing?.created_at) return true;
    return new Date(item.latestIncoming.created_at).getTime() > new Date(item.latestOutgoing.created_at).getTime();
  }).sort((a, b) => new Date(a.latestIncoming!.created_at || 0).getTime() - new Date(b.latestIncoming!.created_at || 0).getTime());
}

function recentTurns(messages: MessageRow[]) {
  return messages.slice(-24).map((row) => `${row.direction === "incoming" ? "العميل" : row.direction === "outgoing" ? "الأمين" : "حالة"}: ${String(row.body || "").trim()}`).filter((line) => !line.endsWith(":"));
}

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => ({}));
  const rawHours = Number(input?.hours || 24);
  const hours = ALLOWED_HOURS.includes(rawHours) ? rawHours : 24;
  const batchSize = Math.max(1, Math.min(10, Number(input?.batchSize || 8)));
  const control = await getV3ProductionControl();
  if (!isV3ProductionActive(control)) return NextResponse.json({ error: "V3 Replies Only لازم يكون شغال قبل الاستعادة." }, { status: 409 });

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  try {
    const rows = await fetchRows(since);
    const pending = pendingFromRows(rows);
    const eligible = pending.filter((item) => item.latestIncoming?.created_at && Date.now() - new Date(item.latestIncoming.created_at).getTime() <= FREEFORM_WINDOW_MS);
    const outside = pending.length - eligible.length;
    const batch = eligible.slice(0, batchSize);
    let sent = 0;
    let failed = 0;
    const errors: Array<{ waId: string; error: string }> = [];

    for (const item of batch) {
      const incoming = item.latestIncoming!;
      const customerText = String(incoming.body || "").trim() || "متابعة المحادثة";
      const turnId = `recovery:${incoming.message_id || incoming.id || item.waId}:${Date.now()}`;
      let reply: string | null = null;
      let stateAfter: Awaited<ReturnType<typeof runV3ProductionLive>>["stateAfter"] | null = null;
      let verifiedV3 = false;
      try {
        const run = await runV3ProductionLive({ waId: item.waId, turnId, customerText, recentTurns: recentTurns(item.messages), realActionsEnabled: false });
        if (run.reply && run.finalSafetyPass) {
          reply = run.reply;
          stateAfter = run.stateAfter;
          verifiedV3 = true;
        }
      } catch (error) {
        console.error("V3 backlog recovery generation failed", { waId: item.waId, error });
      }
      if (!reply) {
        reply = "أعتذر منك عن انقطاع الرد قبل شوي. رجعت المتابعة الآن، وبكمل معك من نفس النقطة بدون ما أخمّن عليك بأي معلومة.";
      }

      const delivery = await sendWhatsAppText(item.waId, reply);
      if (!delivery.ok || !delivery.messageId) {
        failed += 1;
        errors.push({ waId: item.waId, error: delivery.error || "send_failed" });
        continue;
      }

      const { error: logError } = await supabaseAdmin.from("whatsapp_messages").insert({
        wa_id: item.waId,
        direction: "outgoing",
        body: reply,
        message_id: delivery.messageId,
        message_type: "text",
        intent: incoming.intent || "unknown",
        tracking_id: incoming.tracking_id || null,
        application_id: incoming.application_id || null,
        customer_name: incoming.customer_name || null,
        needs_human_review: false,
        handled_by_ai: true,
        status: "sent_to_meta",
        created_at: new Date().toISOString(),
      });
      if (logError) console.error("Backlog recovery outgoing log failed", { waId: item.waId, error: logError.message });
      if (verifiedV3 && stateAfter) {
        try { await saveV3ConversationState(stateAfter); } catch (error) { console.error("Backlog recovery state save failed", { waId: item.waId, error }); }
      }
      sent += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const remainingEligible = Math.max(0, eligible.length - sent);
    return NextResponse.json({ ok: true, pendingTotal: pending.length, attempted: batch.length, sent, failed, skippedOutsideWindow: outside, remainingEligible, errors });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recovery failed" }, { status: 500 });
  }
}
