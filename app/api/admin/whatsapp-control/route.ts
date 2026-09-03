import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RUNTIME_VERSION = "v3.0.0-phase7.1.3-scoped-cancel-refund-actions";

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
    message = "تم تشغيل V3 على الردود فقط. الإجراءات الحقيقية تبقى يدوية وتصل كتنبيه Discord للإدارة.";
  } else if (action === "disable_v3") {
    Object.assign(patch, { live_enabled: false, kill_switch: true, real_actions_enabled: false });
    message = "تم إيقاف V3 وتفعيل المسار الآمن.";
  } else if (action === "disable_real_actions") {
    Object.assign(patch, { real_actions_enabled: false });
    message = "تم إيقاف Real Actions.";
  } else if (action === "enable_real_actions") {
    if (String(body?.confirm || "") !== "ENABLE_SCOPED_CANCEL_REFUND") {
      return NextResponse.json({ error: "التأكيد المطلوب لتفعيل الإلغاء والاسترداد التلقائي غير موجود." }, { status: 400 });
    }
    Object.assign(patch, { live_enabled: true, kill_switch: false, real_actions_enabled: true, resume_legacy_ignored: true });
    message = "تم تفعيل Real Actions بشكل مقيد: إلغاء الطلب + طلب الاسترداد فقط. باقي التغييرات تبقى يدوية عبر Discord.";
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from("whatsapp_v3_production_settings").update(patch).eq("id", "default").select("id,live_enabled,kill_switch,real_actions_enabled,resume_legacy_ignored,runtime_version,updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message, settings: data });
}
