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

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    if (action === "enable") {
      await setSetting("lab_enabled", "true");
      return NextResponse.json({ ok: true, enabled: true });
    }
    if (action === "disable") {
      await setSetting("lab_enabled", "false");
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
