import { NextRequest, NextResponse } from "next/server";
import { runV3ArchiveSequence } from "../../whatsapp/webhook/_lib/v3-os/archiveSequenceLab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const configured = process.env.ALAMEEN_V3_LAB_SECRET || "";
  if (!configured) return false;
  const supplied = request.headers.get("x-alameen-v3-lab-secret") || "";
  return supplied.length > 0 && supplied === configured;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok:false, error:"unauthorized_v3_lab" }, { status:401 });
  }

  try {
    const body = await request.json() as { anchorCaseId?: string; maxTurns?: number };
    const anchorCaseId = String(body.anchorCaseId || "").trim();
    if (!anchorCaseId) {
      return NextResponse.json({ ok:false, error:"anchorCaseId_required" }, { status:400 });
    }
    const result = await runV3ArchiveSequence({ anchorCaseId, maxTurns: body.maxTurns });
    return NextResponse.json({ ok:true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "v3_lab_failed";
    const status = message === "v3_lab_disabled" ? 409 : message.startsWith("v3_budget_blocked:") ? 429 : 500;
    return NextResponse.json({ ok:false, error:message }, { status });
  }
}
