import { NextResponse } from "next/server";
import { authenticatedWebChatSession, sameOriginWebChatRequest } from "../_http";
import { loadWebChatTimeline, processWebChatMessage } from "../_runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginWebChatRequest(request)) {
    return NextResponse.json({ ok: false, error: "forbidden_origin" }, { status: 403 });
  }

  const session = await authenticatedWebChatSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null) as {
    message?: unknown;
    clientMessageId?: unknown;
  } | null;

  const message = String(payload?.message || "").trim();
  const clientMessageId = String(payload?.clientMessageId || "").trim();
  if (!message || !clientMessageId || clientMessageId.length > 120) {
    return NextResponse.json({ ok: false, error: "invalid_message" }, { status: 400 });
  }

  try {
    const result = await processWebChatMessage({ session, text: message, clientMessageId });
    const timeline = await loadWebChatTimeline(session);
    return NextResponse.json({ ok: true, ...result, timeline }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    const status = code === "web_chat_channel_not_activated" ? 409
      : code === "web_chat_rate_limited" ? 429
        : code === "web_chat_message_too_long" ? 413
          : 500;
    console.error("web_chat_message_failed", { code, applicationId: session.application_id });
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}
