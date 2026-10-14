import { NextRequest, NextResponse } from "next/server";
import { verifyDurableIngressWorkerToken } from "@/app/api/whatsapp/webhook/_lib/v3-os/durableIngress";
import { processTelegramIntelligenceHoldBatch } from "@/app/api/telegram/_lib/intelligenceHold";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function authorize(request: NextRequest) {
  const supplied = String(request.headers.get("x-alameen-live-worker-token") || "").trim();
  return supplied ? verifyDurableIngressWorkerToken(supplied) : false;
}

async function run(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await processTelegramIntelligenceHoldBatch(8);
    return NextResponse.json({ ok: true, phase: "18.5.1", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("telegram_intelligence_worker_failed", error);
    return NextResponse.json({ ok: false, error: message.slice(0, 1200) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
