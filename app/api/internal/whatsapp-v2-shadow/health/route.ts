import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function ageMinutes(value: string | null | undefined) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : null;
}

async function queueHealth(table: string) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id,status,attempt_count,created_at,updated_at")
    .in("status", ["queued", "processing", "retry_wait"])
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return { ok: false, error: error.message, pending: null, oldestAgeMinutes: null, attemptZero: null };
  }

  const rows = Array.isArray(data) ? data : [];
  const oldest = rows[0]?.created_at || null;
  return {
    ok: true,
    pending: rows.length,
    oldestAgeMinutes: ageMinutes(oldest),
    attemptZero: rows.filter((row) => Number(row.attempt_count || 0) === 0).length,
    processing: rows.filter((row) => row.status === "processing").length,
    retryWait: rows.filter((row) => row.status === "retry_wait").length,
  };
}

export async function GET(_request: NextRequest) {
  if (!(await isAdminLoggedIn())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: settings }, legacy, v2] = await Promise.all([
    supabaseAdmin
      .from("whatsapp_shadow_settings")
      .select("key,value,updated_at")
      .in("key", [
        "legacy_worker_last_seen_at",
        "legacy_worker_last_result",
        "v2_worker_last_seen_at",
        "v2_worker_last_result",
      ]),
    queueHealth("whatsapp_shadow_jobs"),
    queueHealth("whatsapp_v2_shadow_jobs"),
  ]);

  const map = new Map<string, { value?: string | null; updated_at?: string | null }>();
  for (const row of Array.isArray(settings) ? settings : []) {
    map.set(String(row.key), row);
  }

  const legacyHeartbeat = map.get("legacy_worker_last_seen_at")?.value || null;
  const v2Heartbeat = map.get("v2_worker_last_seen_at")?.value || null;

  const legacyHealthy =
    legacy.ok &&
    (legacy.oldestAgeMinutes === null || legacy.oldestAgeMinutes <= 10) &&
    (legacyHeartbeat === null || (ageMinutes(legacyHeartbeat) ?? 9999) <= 15);

  const v2Healthy =
    v2.ok &&
    (v2.oldestAgeMinutes === null || v2.oldestAgeMinutes <= 10) &&
    (v2Heartbeat === null || (ageMinutes(v2Heartbeat) ?? 9999) <= 15);

  return NextResponse.json({
    ok: legacyHealthy && v2Healthy,
    generatedAt: new Date().toISOString(),
    legacy: {
      ...legacy,
      heartbeat: legacyHeartbeat,
      heartbeatAgeMinutes: ageMinutes(legacyHeartbeat),
      lastResult: map.get("legacy_worker_last_result")?.value || null,
      healthy: legacyHealthy,
    },
    v2: {
      ...v2,
      heartbeat: v2Heartbeat,
      heartbeatAgeMinutes: ageMinutes(v2Heartbeat),
      lastResult: map.get("v2_worker_last_result")?.value || null,
      healthy: v2Healthy,
    },
  });
}
