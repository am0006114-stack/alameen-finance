import { cookies } from "next/headers";
import { WEB_CHAT_COOKIE_NAME, loadWebChatSession } from "@/app/api/postpayment/_lib/channelState";

export function sameOriginWebChatRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function authenticatedWebChatSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(WEB_CHAT_COOKIE_NAME)?.value || null;
  return loadWebChatSession(token);
}
