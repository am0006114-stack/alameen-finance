import { createTelegramHandoff } from "../_lib/handoff";
import { getTelegramChannelConfig } from "../_lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getTelegramChannelConfig();
  if (!config.handoffAdminSecret) {
    return Response.json({ ok: false, error: "TELEGRAM_HANDOFF_ADMIN_SECRET is not configured" }, { status: 503 });
  }
  const supplied = request.headers.get("x-alameen-admin-secret") || "";
  if (supplied !== config.handoffAdminSecret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { waId?: string; applicationId?: string } | null;
  if (!body?.waId || !body.applicationId) {
    return Response.json({ ok: false, error: "waId and applicationId are required" }, { status: 400 });
  }

  try {
    const handoff = await createTelegramHandoff({
      waId: body.waId,
      applicationId: body.applicationId,
    });
    return Response.json({
      ok: true,
      link: handoff.link,
      expiresAt: handoff.expiresAt,
      applicationId: handoff.applicationId,
      trackingId: handoff.trackingId,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}
