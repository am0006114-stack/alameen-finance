import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ArchiveCase, ArchiveContextMessage } from "./types";

export async function loadArchiveContext(item: ArchiveCase): Promise<ArchiveContextMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("direction,body,message_type,created_at")
    .eq("wa_id", item.wa_id)
    .lt("created_at", item.source_created_at)
    .not("body", "is", null)
    .order("created_at", { ascending: false })
    .limit(14);

  if (error) throw new Error(`archive_context_failed:${error.message}`);
  return (data || []).reverse().map((row) => ({
    direction: String(row.direction || ""),
    body: String(row.body || "").replace(/\s+/g, " ").trim().slice(0, 650),
    messageType: row.message_type ? String(row.message_type) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
  })).filter((row) => row.body);
}

export async function loadHistoricalActionRequests(item: ArchiveCase) {
  if (!item.application_id) return [];
  const { data, error } = await supabaseAdmin
    .from("application_action_requests")
    .select("action_type,status,created_at,resolved_at,resolution_note")
    .eq("application_id", item.application_id)
    .lte("created_at", item.source_created_at)
    .order("created_at", { ascending: true })
    .limit(30);
  if (error) {
    console.error("loadHistoricalActionRequests failed", error.message);
    return [];
  }
  return data || [];
}

export function contextAsText(rows: ArchiveContextMessage[]) {
  const text = rows.map((row) => `${row.direction === "incoming" ? "العميل" : "الأمين"}: ${row.body}`).join("\n");
  return text.length > 8500 ? text.slice(-8500) : text;
}
