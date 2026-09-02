import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = [1, 2, 6, 12, 24, 48, 168];

type Row = { wa_id?: string | null; direction?: string | null; body?: string | null; message_type?: string | null; created_at?: string | null; customer_name?: string | null; tracking_id?: string | null; intent?: string | null; status?: string | null };

function formatDate(value?: string | null) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("ar-JO", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Amman" }).format(new Date(value)); } catch { return value; }
}

async function fetchRows(since: string) {
  const all: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabaseAdmin.from("whatsapp_messages").select("wa_id,direction,body,message_type,created_at,customer_name,tracking_id,intent,status").gte("created_at", since).order("created_at", { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data || []) as Row[];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

export async function GET(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return new NextResponse("Unauthorized", { status: 401 });
  const hoursRaw = Number(request.nextUrl.searchParams.get("hours") || "2");
  const hours = ALLOWED.includes(hoursRaw) ? hoursRaw : 2;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    const rows = await fetchRows(since);
    const grouped = new Map<string, Row[]>();
    for (const row of rows) {
      const wa = String(row.wa_id || "unknown");
      const list = grouped.get(wa) || [];
      list.push(row);
      grouped.set(wa, list);
    }
    const incoming = rows.filter((x) => x.direction === "incoming").length;
    const outgoing = rows.filter((x) => x.direction === "outgoing" && x.message_type !== "admin_control").length;
    const header = [
      "سجل تشغيل واتساب — الأمين للأقساط",
      `الفترة: آخر ${hours} ساعة`,
      `تم النسخ: ${formatDate(new Date().toISOString())}`,
      `العملاء: ${grouped.size}`,
      `الوارد: ${incoming}`,
      `الصادر: ${outgoing}`,
      "",
      "========================================",
    ];
    const blocks: string[] = [];
    for (const [waId, messages] of grouped) {
      const name = messages.map((x) => String(x.customer_name || "").trim()).find(Boolean) || waId;
      blocks.push(`\nالعميل: ${name}\nواتساب: ${waId}\n----------------------------------------`);
      messages.forEach((row, index) => {
        const speaker = row.direction === "incoming" ? "العميل" : row.direction === "outgoing" ? "الأمين" : "حالة";
        const meta = [speaker, formatDate(row.created_at)];
        if (row.intent) meta.push(`intent: ${row.intent}`);
        if (row.tracking_id) meta.push(`tracking: ${row.tracking_id}`);
        blocks.push(`[${index + 1} | ${meta.join(" | ")}]\n${String(row.body || `[${row.message_type || "رسالة"}]`)}`);
      });
    }
    return new NextResponse([...header, ...blocks].join("\n"), { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Export failed", { status: 500 });
  }
}
