import { NextResponse } from "next/server";
import { createTelegramHandoff } from "@/app/api/telegram/_lib/handoff";
import { getPostPaymentChannelFlags } from "@/app/api/postpayment/_lib/channelState";
import { authenticatedWebChatSession, sameOriginWebChatRequest } from "../_http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginWebChatRequest(request)) {
    return NextResponse.json({ ok: false, error: "forbidden_origin" }, { status: 403 });
  }

  const session = await authenticatedWebChatSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const flags = await getPostPaymentChannelFlags();
  if (!flags.channelChoiceEnabled) return NextResponse.json({ ok: false, error: "channel_choice_disabled" }, { status: 503 });

  try {
    const handoff = await createTelegramHandoff({
      waId: session.canonical_wa_id,
      applicationId: session.application_id,
      allowActiveChannelSwitch: true,
    });
    return NextResponse.json({
      ok: true,
      telegramLink: handoff.telegramLink || handoff.link,
      expiresAt: handoff.expiresAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("web_chat_telegram_switch_failed", error);
    return NextResponse.json({ ok: false, error: "telegram_handoff_failed" }, { status: 500 });
  }
}
