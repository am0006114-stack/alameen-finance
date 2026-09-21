import { supabaseAdmin } from "@/lib/supabaseAdmin";

type IncomingRow = {
  id?: string | null;
  message_id?: string | null;
  created_at?: string | null;
  raw_payload?: any;
};

function eventTime(row: IncomingRow) {
  const rawTimestamp = Number(row.raw_payload?.timestamp || 0);
  if (Number.isFinite(rawTimestamp) && rawTimestamp > 0) return rawTimestamp * 1000;
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : NaN;
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function compareRows(a: IncomingRow, b: IncomingRow) {
  const byTime = eventTime(a) - eventTime(b);
  if (byTime !== 0) return byTime;
  return String(a.message_id || a.id || "").localeCompare(String(b.message_id || b.id || ""));
}

export async function shouldSuppressStaleV3Reply(input: {
  waId: string;
  currentMessageId?: string | null;
  lookbackSeconds?: number;
}) {
  const waId = String(input.waId || "").trim();
  const currentMessageId = String(input.currentMessageId || "").trim();
  if (!waId || !currentMessageId) return false;

  const since = new Date(Date.now() - (input.lookbackSeconds ?? 120) * 1000).toISOString();
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id,message_id,created_at,raw_payload")
      .eq("wa_id", waId)
      .eq("direction", "incoming")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(40);

    if (error || !data?.length) {
      if (error) console.error("v3 stale-turn pre-send check failed:", error);
      return false;
    }

    const rows = (data as IncomingRow[]).sort(compareRows);
    const latest = rows[rows.length - 1];
    const latestId = String(latest?.message_id || latest?.id || "").trim();
    return Boolean(latestId && latestId !== currentMessageId);
  } catch (error) {
    console.error("v3 stale-turn pre-send check exception:", error);
    return false;
  }
}


/**
 * Final egress freshness barrier. A reply is not allowed to leave immediately
 * after a single latest-message read: we require a short quiet window and then
 * re-check the authoritative inbound log. This closes the narrow race where a
 * new WhatsApp bubble lands after the previous stale check but before Meta send.
 */
export async function waitForV3EgressFreshnessBarrier(input: {
  waId: string;
  currentMessageId?: string | null;
  lookbackSeconds?: number;
  quietMs?: number;
}) {
  if (await shouldSuppressStaleV3Reply(input)) return false;
  // Phase 7.8.0: 450ms was too narrow in production for human multi-bubble turns.
  // Keep the public call signature backward-compatible, but enforce a real quiet
  // window long enough for a follow-up bubble to supersede an already-authored reply.
  const effectiveQuietMs = Math.max(1800, input.quietMs ?? 1800);
  await new Promise((resolve) => setTimeout(resolve, effectiveQuietMs));
  if (await shouldSuppressStaleV3Reply(input)) return false;
  // Small second edge check closes the DB-write/Meta-send race after the main quiet window.
  await new Promise((resolve) => setTimeout(resolve, 220));
  return !(await shouldSuppressStaleV3Reply(input));
}

// PHASE 7.8.0 CONVERSATION TRANSACTION EGRESS: effective quiet window >= 1800ms.
