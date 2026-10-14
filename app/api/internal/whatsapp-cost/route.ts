import { loadWhatsAppMonthlyCostSnapshot } from "../../whatsapp/webhook/_lib/v3-os/whatsappCostGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = String(process.env.WHATSAPP_COST_GUARD_ADMIN_SECRET || process.env.TELEGRAM_HANDOFF_ADMIN_SECRET || "").trim();
  if (!expected) return false;
  return (request.headers.get("x-alameen-admin-secret") || "") === expected;
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const snapshot = await loadWhatsAppMonthlyCostSnapshot();
    return Response.json({ ok: true, mode: "observe_only", ...snapshot });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
