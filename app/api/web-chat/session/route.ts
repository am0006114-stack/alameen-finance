import { NextResponse } from "next/server";
import { authenticatedWebChatSession } from "../_http";
import { loadWebChatTimeline } from "../_runtime";
import { getPostPaymentChannelFlags, loadPostPaymentChannelState } from "@/app/api/postpayment/_lib/channelState";

export const runtime = "nodejs";

export async function GET() {
  const session = await authenticatedWebChatSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [flags, channelState, timeline] = await Promise.all([
    getPostPaymentChannelFlags(),
    loadPostPaymentChannelState(session.application_id),
    loadWebChatTimeline(session),
  ]);

  if (!flags.webChatEnabled) return NextResponse.json({ ok: false, error: "web_chat_disabled" }, { status: 503 });

  return NextResponse.json({
    ok: true,
    trackingId: session.tracking_id || null,
    primaryChannel: channelState?.primary_channel || null,
    channelActivated: Boolean(channelState?.activated_at),
    webAvailable: Boolean(channelState?.web_available),
    timeline,
  }, { headers: { "Cache-Control": "no-store" } });
}
