import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("whatsapp_shadow_jobs")
    .update({
      status: "queued",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      completed_at: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["dead_letter", "retry_wait"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
