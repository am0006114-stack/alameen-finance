import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function update(values: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_v2_production_settings")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", "default")
    .select("id,mode,kill_switch,canary_percent,deepseek_hourly_budget_usd,deepseek_daily_budget_usd,reserve_usd_per_turn")
    .single();
  if (error) throw error;
  return data;
}

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  try {
    if (action === "kill") return NextResponse.json({ ok: true, settings: await update({ kill_switch: true, mode: "off" }) });
    if (action === "off") return NextResponse.json({ ok: true, settings: await update({ kill_switch: false, mode: "off" }) });
    if (action === "canary") {
      const percent = Math.max(1, Math.min(25, Number(body?.percent || 5) || 5));
      return NextResponse.json({ ok: true, settings: await update({ kill_switch: false, mode: "canary", canary_percent: percent }) });
    }
    if (action === "broad") {
      const percent = Math.max(25, Math.min(90, Number(body?.percent || 50) || 50));
      return NextResponse.json({ ok: true, settings: await update({ kill_switch: false, mode: "broad", canary_percent: percent }) });
    }
    if (action === "full") return NextResponse.json({ ok: true, settings: await update({ kill_switch: false, mode: "full", canary_percent: 100 }) });
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
