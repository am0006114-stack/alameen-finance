import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { V3_OS_VERSION } from "@/app/api/whatsapp/webhook/_lib/v3-os/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Action = "enable_replies" | "enable_real_actions" | "disable_real_actions" | "disable_v3";

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "") as Action;

  if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), runtime_version: V3_OS_VERSION };
  let message = "";

  if (action === "enable_replies") {
    Object.assign(patch, { live_enabled: true, kill_switch: false, resume_legacy_ignored: true });
    message = "تم تأكيد تشغيل Conversation OS. وضع Real Actions لم يتغير.";
  } else if (action === "disable_v3") {
    return NextResponse.json({ error: "Phase 9.1 ألغى هذا الأمر القديم. Conversation OS لا يُعاد إلى V1، وتعطيل Real Actions له أمر طوارئ مستقل وواضح." }, { status: 400 });
  } else if (action === "disable_real_actions") {
    Object.assign(patch, { real_actions_enabled: false });
    message = "تم إيقاف Real Actions.";
  } else if (action === "enable_real_actions") {
    if (String(body?.confirm || "") !== "ENABLE_AUTONOMOUS_CORE_ACTIONS") {
      return NextResponse.json({ error: "التأكيد المطلوب لتفعيل Real Actions الخمسة غير موجود." }, { status: 400 });
    }
    Object.assign(patch, { real_actions_enabled: true });
    message = "تم تفعيل Real Actions الخمسة: الإلغاء، الاسترداد، إيقاف الاسترداد، إعادة فتح الطلب، واعتماد رقم واتساب للمتابعة.";
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from("whatsapp_v3_production_settings").update(patch).eq("id", "default").select("id,live_enabled,kill_switch,real_actions_enabled,resume_legacy_ignored,runtime_version,updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message, settings: data });
}
