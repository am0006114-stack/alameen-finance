import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { V3_OS_VERSION } from "@/app/api/whatsapp/webhook/_lib/v3-os/types";
import { startSolHybridPilot, stopSolHybridPilot } from "@/app/api/whatsapp/webhook/_lib/v3-os/solHybridRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Action = "enable_replies" | "enable_real_actions" | "disable_real_actions" | "disable_v3" | "start_sol_hybrid_pilot" | "stop_sol_hybrid_pilot" | "enable_human_os" | "disable_human_os";

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "") as Action;

  if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  if (action === "start_sol_hybrid_pilot") {
    if (String(body?.confirm || "") !== "START_SOL_HYBRID_24H") {
      return NextResponse.json({ error: "التأكيد المطلوب لبدء تجربة Sol غير موجود." }, { status: 400 });
    }
    try {
      const pilot = await startSolHybridPilot({ hours: 24, budgetUsd: 5, model: "gpt-5.6-sol" });
      return NextResponse.json({ ok: true, message: "بدأت تجربة GPT-5.6 Sol لمدة 24 ساعة بحد حجز أقصى 5 دولار. عند الانتهاء أو بلوغ الحد يعود المسار تلقائيًا إلى Phase 9.1 / DeepSeek.", pilot });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر بدء تجربة Sol" }, { status: 500 });
    }
  }

  if (action === "stop_sol_hybrid_pilot") {
    try {
      await stopSolHybridPilot();
      return NextResponse.json({ ok: true, message: "تم إيقاف Sol Hybrid فورًا. رجع Conversation OS إلى مسار Phase 9.1 الحالي بدون تغيير Real Actions أو Payment Truth." });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر إيقاف Sol" }, { status: 500 });
    }
  }

  if (action === "enable_human_os" || action === "disable_human_os") {
    if (action === "enable_human_os" && String(body?.confirm || "") !== "ENABLE_HUMAN_CONVERSATION_OS") {
      return NextResponse.json({ error: "التأكيد المطلوب لتفعيل Human Conversation OS غير موجود." }, { status: 400 });
    }
    const enabled = action === "enable_human_os";
    const { data, error } = await supabaseAdmin
      .from("whatsapp_human_os_settings")
      .update({ enabled, sol_enabled: false, updated_at: new Date().toISOString() })
      .eq("id", "default")
      .select("id,enabled,sol_enabled,max_recent_turns,max_prompt_chars,updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      message: enabled
        ? "تم تفعيل Human Conversation OS. Sol بقي OFF ولا يوجد Shadow AI. الرجوع متاح فورًا من نفس اللوحة."
        : "تم إيقاف Human Conversation OS والرجوع الفوري إلى Baseline 10.1 / Conversation OS السابق بدون تغيير Real Actions.",
      humanOs: data,
    });
  }

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
