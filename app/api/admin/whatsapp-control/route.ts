import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RUNTIME_VERSION = "v3.0.0-phase7-operator-control";

type Action = "enable_replies" | "disable_v3" | "enable_real_actions" | "disable_real_actions";

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "") as Action;

  if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), runtime_version: RUNTIME_VERSION };
  let message = "";

  if (action === "enable_replies") {
    Object.assign(patch, { live_enabled: true, kill_switch: false, real_actions_enabled: false, resume_legacy_ignored: true });
    message = "تم تشغيل V3 على الردود فقط. Real Actions ما زالت مقفلة.";
  } else if (action === "disable_v3") {
    Object.assign(patch, { live_enabled: false, kill_switch: true, real_actions_enabled: false });
    message = "تم إيقاف V3 وتفعيل المسار الآمن.";
  } else if (action === "disable_real_actions") {
    Object.assign(patch, { real_actions_enabled: false });
    message = "تم إيقاف Real Actions.";
  } else if (action === "enable_real_actions") {
    if (body?.confirm !== "ENABLE_REAL_ACTIONS") return NextResponse.json({ error: "Explicit confirmation required" }, { status: 400 });
    const { data: current, error: currentError } = await supabaseAdmin.from("whatsapp_v3_production_settings").select("live_enabled,kill_switch").eq("id", "default").maybeSingle();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
    if (!current?.live_enabled || current?.kill_switch) return NextResponse.json({ error: "شغّل V3 Replies Only أولًا." }, { status: 409 });
    Object.assign(patch, { real_actions_enabled: true });
    message = "تم تفعيل Real Actions لعمران.";
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from("whatsapp_v3_production_settings").update(patch).eq("id", "default").select("id,live_enabled,kill_switch,real_actions_enabled,resume_legacy_ignored,runtime_version,updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message, settings: data });
}
