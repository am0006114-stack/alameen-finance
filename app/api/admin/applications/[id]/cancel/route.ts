import { NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const loggedIn = await isAdminLoggedIn();

  if (!loggedIn) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }

  const { id } = await context.params;
  const applicationId = String(id || "").trim();

  if (!applicationId) {
    return NextResponse.json(
      { success: false, error: "APPLICATION_ID_REQUIRED" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("applications")
    .update({ status: "cancelled" })
    .eq("id", applicationId)
    .select("id,status")
    .single();

  if (error) {
    console.error("ADMIN_CANCEL_APPLICATION_FAILED", {
      applicationId,
      code: error.code,
      message: error.message,
    });

    return NextResponse.json(
      { success: false, error: "ADMIN_CANCEL_APPLICATION_FAILED" },
      { status: 500 }
    );
  }

  if (!data || data.status !== "cancelled") {
    console.error("ADMIN_CANCEL_APPLICATION_NOT_PERSISTED", {
      applicationId,
      returnedStatus: data?.status || null,
    });

    return NextResponse.json(
      { success: false, error: "ADMIN_CANCEL_APPLICATION_NOT_PERSISTED" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(
    new URL(`/admin/applications/${encodeURIComponent(applicationId)}?cancelled=1`, request.url),
    303
  );
}
