import { NextResponse } from "next/server";
import {
  WEB_CHAT_COOKIE_NAME,
  activateWebPostPaymentChannel,
  claimWebChatBootstrap,
  webChatSessionMaxAgeSeconds,
} from "@/app/api/postpayment/_lib/channelState";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = new URL("/chat", url.origin);
  const token = url.searchParams.get("token") || "";

  try {
    const claimed = await claimWebChatBootstrap(token);
    await activateWebPostPaymentChannel(claimed.session);

    const response = NextResponse.redirect(destination);
    response.cookies.set(WEB_CHAT_COOKIE_NAME, claimed.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: webChatSessionMaxAgeSeconds(),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("web_chat_claim_failed", error);
    destination.searchParams.set("error", "link");
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
