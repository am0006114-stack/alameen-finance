import { NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdminLoggedIn())) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  return NextResponse.json(
    {
      ok: false,
      retired: true,
      error: "تم إلغاء تحكم تجاهل العميل في Phase 9 لأن Conversation OS يجب ألا يترك العميل بصمت. استخدم التنبيهات/الإجراءات التشغيلية بدل إيقاف الرد.",
    },
    { status: 410 },
  );
}
