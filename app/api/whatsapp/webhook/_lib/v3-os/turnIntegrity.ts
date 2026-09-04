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
