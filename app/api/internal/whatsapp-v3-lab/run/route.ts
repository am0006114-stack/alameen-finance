import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runV3RiskArchiveBatch } from "@/app/api/whatsapp/webhook/_lib/v3-os/archiveBatchRunner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [{ data: settings }, { data: runs }] = await Promise.all([
    supabaseAdmin.from("whatsapp_v3_lab_settings").select("key,value").order("key"),
    supabaseAdmin.from("whatsapp_v3_archive_runs").select("id,anchor_case_id,wa_id,status,turn_count,v3_avg_score,historical_avg_score,critical_failure_count,continuity_failure_count,last_error,created_at,completed_at").order("created_at", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({ ok: true, settings: settings || [], recentRuns: runs || [] });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { sequences?: number; maxTurns?: number } = {};
  try { body = await request.json(); } catch {}
  try {
    const result = await runV3RiskArchiveBatch({ sequences: body.sequences, maxTurns: body.maxTurns });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
