import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateArchiveCase } from "@/app/api/whatsapp/webhook/_lib/v2-archive";
import type { ArchiveCase } from "@/app/api/whatsapp/webhook/_lib/v2-archive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function readSetting(key: string, fallback: string) {
  const { data } = await supabaseAdmin.from("whatsapp_v2_archive_settings").select("value").eq("key", key).maybeSingle();
  return String(data?.value || fallback);
}

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enabled = (await readSetting("lab_enabled", "false")).toLowerCase() === "true";
  if (!enabled) return NextResponse.json({ error: "Archive lab is disabled. Enable it from the admin lab first." }, { status: 423 });

  const body = await request.json().catch(() => ({}));
  const configuredMax = Math.max(1, Math.min(3, Number(await readSetting("max_cases_per_worker", "3")) || 3));
  const requested = Math.max(1, Math.min(configuredMax, Number(body?.limit || configuredMax) || configuredMax));
  const workerId = `v2-archive:${randomUUID()}`;

  await supabaseAdmin.rpc("requeue_stale_whatsapp_v2_archive_cases", { p_stale_minutes: 10 });
  const { data, error } = await supabaseAdmin.rpc("claim_whatsapp_v2_archive_cases", {
    p_worker_id: workerId,
    p_limit: requested,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cases = (data || []) as ArchiveCase[];
  const results = [];
  for (const item of cases) {
    results.push(await evaluateArchiveCase(item, workerId));
    if (results.some((row: any) => row?.status === "budget_blocked")) break;
  }

  return NextResponse.json({ ok: true, workerId, claimed: cases.length, processed: results.length, results });
}
