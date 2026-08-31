import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateArchiveCase } from "@/app/api/whatsapp/webhook/_lib/v2-archive";
import type { ArchiveCase } from "@/app/api/whatsapp/webhook/_lib/v2-archive";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function readSetting(key: string, fallback: string) {
  const { data } = await supabaseAdmin.from("whatsapp_v2_archive_settings").select("value").eq("key", key).maybeSingle();
  return String(data?.value ?? fallback);
}

function tokenDigest(token: string) {
  return createHash("sha256").update(token, "utf8").digest();
}

async function validWorkerToken(request: NextRequest) {
  const auth = String(request.headers.get("authorization") || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = String(match?.[1] || "").trim();
  if (!token) return false;

  const expectedHex = await readSetting("archive_worker_token_sha256", "");
  const expiresRaw = await readSetting("archive_worker_token_expires_at", "");
  const expiresMs = Date.parse(expiresRaw);
  if (!/^[0-9a-f]{64}$/i.test(expectedHex) || !Number.isFinite(expiresMs) || Date.now() >= expiresMs) return false;

  const actual = tokenDigest(token);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function authorizedForWorker(request: NextRequest) {
  if (await isAdminLoggedIn()) return true;
  return validWorkerToken(request);
}

async function disableExpiredTimedRun() {
  const runUntilRaw = await readSetting("lab_run_until", "");
  if (!runUntilRaw) return false;

  const runUntilMs = Date.parse(runUntilRaw);
  if (!Number.isFinite(runUntilMs) || Date.now() < runUntilMs) return false;

  await supabaseAdmin
    .from("whatsapp_v2_archive_settings")
    .upsert({ key: "lab_enabled", value: "false", updated_at: new Date().toISOString() }, { onConflict: "key" });
  await supabaseAdmin
    .from("whatsapp_v2_archive_settings")
    .upsert({ key: "lab_run_until", value: "", updated_at: new Date().toISOString() }, { onConflict: "key" });

  return true;
}

export async function POST(request: NextRequest) {
  if (!(await authorizedForWorker(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await disableExpiredTimedRun()) {
    return NextResponse.json({ error: "Archive timed run expired and was disabled." }, { status: 423 });
  }

  const enabled = (await readSetting("lab_enabled", "false")).toLowerCase() === "true";
  if (!enabled) return NextResponse.json({ error: "Archive lab is disabled. Enable it from the admin lab first." }, { status: 423 });

  const body = await request.json().catch(() => ({}));
  void body;
  const requested = 1;
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
