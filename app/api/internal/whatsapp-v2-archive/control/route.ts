import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function setSetting(key: string, value: string) {
  const { error } = await supabaseAdmin
    .from("whatsapp_v2_archive_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

async function readSetting(key: string, fallback = "") {
  const { data } = await supabaseAdmin
    .from("whatsapp_v2_archive_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
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

  const expectedHex = await readSetting("archive_worker_token_sha256");
  const expiresRaw = await readSetting("archive_worker_token_expires_at");
  const expiresMs = Date.parse(expiresRaw);
  if (!/^[0-9a-f]{64}$/i.test(expectedHex) || !Number.isFinite(expiresMs) || Date.now() >= expiresMs) return false;

  const actual = tokenDigest(token);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function clearWorkerToken() {
  await setSetting("archive_worker_token_sha256", "");
  await setSetting("archive_worker_token_expires_at", "");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  const admin = await isAdminLoggedIn();

  // A short-lived worker token can ONLY stop the archive lab. It cannot seed,
  // enable, requeue, issue new tokens, or change any other control state.
  if (!admin) {
    const tokenMayStop = action === "disable" && (await validWorkerToken(request));
    if (!tokenMayStop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (action === "issue_worker_token") {
      const minutes = Math.max(15, Math.min(360, Number(body?.minutes || 240) || 240));
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await setSetting("archive_worker_token_sha256", tokenDigest(token).toString("hex"));
      await setSetting("archive_worker_token_expires_at", expiresAt);
      return NextResponse.json({ ok: true, token, expiresAt, minutes });
    }

    if (action === "enable") {
      await setSetting("lab_run_until", "");
      await setSetting("lab_enabled", "true");
      return NextResponse.json({ ok: true, enabled: true });
    }
    if (action === "enable_for") {
      const minutes = Math.max(1, Math.min(180, Number(body?.minutes || 120) || 120));
      const runUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await setSetting("lab_run_until", runUntil);
      await setSetting("lab_enabled", "true");
      return NextResponse.json({ ok: true, enabled: true, runUntil, minutes });
    }
    if (action === "disable") {
      await setSetting("lab_enabled", "false");
      await setSetting("lab_run_until", "");
      await clearWorkerToken();
      return NextResponse.json({ ok: true, enabled: false });
    }
    if (action === "seed") {
      const { data, error } = await supabaseAdmin.rpc("seed_whatsapp_v2_archive_cases", { p_before: null });
      if (error) throw error;
      return NextResponse.json({ ok: true, inserted: Number(data || 0) });
    }
    if (action === "requeue_review") {
      const { error } = await supabaseAdmin
        .from("whatsapp_v2_archive_cases")
        .update({ status: "queued", attempt_count: 0, next_attempt_at: new Date().toISOString(), completed_at: null, updated_at: new Date().toISOString() })
        .eq("status", "needs_review");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
