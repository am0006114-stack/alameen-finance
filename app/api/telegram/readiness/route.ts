import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTelegramChannelConfig } from "../_lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function authorized(request: Request) {
  const expected = String(process.env.TELEGRAM_READINESS_SECRET || "").trim();
  if (!expected) return false;
  const supplied = String(request.headers.get("x-alameen-readiness-secret") || "").trim();
  return supplied.length > 0 && supplied === expected;
}

async function telegramApi<T>(token: string, method: string): Promise<{ ok: boolean; result?: T; description?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
    return { ok: Boolean(response.ok && body?.ok), result: body?.result, description: body?.description };
  } catch (error) {
    return { ok: false, description: error instanceof Error ? error.message : String(error) };
  }
}

async function tableCount(table: string) {
  try {
    const { count, error } = await supabaseAdmin.from(table).select("*", { count: "exact", head: true });
    return { exists: !error, count: count ?? 0, error: error?.message || null };
  } catch (error) {
    return { exists: false, count: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ ok: false, error: "unauthorized" }, 401);

  const config = getTelegramChannelConfig();
  const requiredEnv = {
    TELEGRAM_BOT_TOKEN: Boolean(config.botToken),
    TELEGRAM_WEBHOOK_SECRET: Boolean(config.webhookSecret),
    TELEGRAM_BUSINESS_USERNAME: Boolean(config.businessUsername),
    TELEGRAM_HANDOFF_ADMIN_SECRET: Boolean(config.handoffAdminSecret),
    TELEGRAM_READINESS_SECRET: Boolean(String(process.env.TELEGRAM_READINESS_SECRET || "").trim()),
  };

  const [connections, handoffs, links, messages] = await Promise.all([
    tableCount("telegram_business_connections"),
    tableCount("telegram_handoff_tokens"),
    tableCount("telegram_customer_links"),
    tableCount("telegram_messages"),
  ]);

  const schemaReady = connections.exists && handoffs.exists && links.exists && messages.exists;
  const envReady = Object.values(requiredEnv).every(Boolean);

  const me = config.botToken
    ? await telegramApi<{ id: number; is_bot: boolean; username?: string; first_name?: string }>(config.botToken, "getMe")
    : { ok: false, description: "bot_token_missing" };
  const webhook = config.botToken
    ? await telegramApi<{ url?: string; pending_update_count?: number; last_error_message?: string; allowed_updates?: string[] }>(config.botToken, "getWebhookInfo")
    : { ok: false, description: "bot_token_missing" };

  const expectedWebhookPath = "/api/telegram/webhook";
  const webhookUrl = String(webhook.result?.url || "");
  const webhookConfigured = Boolean(webhook.ok && webhookUrl.includes(expectedWebhookPath));
  const connectionReady = connections.exists && connections.count > 0;

  return json({
    ok: true,
    phase: "18.3-r3",
    mode: "read_only_readiness",
    env: requiredEnv,
    database: {
      schemaReady,
      businessConnections: { exists: connections.exists, count: connections.count },
      handoffTokens: { exists: handoffs.exists, count: handoffs.count },
      customerLinks: { exists: links.exists, count: links.count },
      messages: { exists: messages.exists, count: messages.count },
    },
    telegram: {
      apiReachable: me.ok,
      botUsername: me.result?.username || null,
      webhookReachable: webhook.ok,
      webhookConfigured,
      webhookUrl: webhookConfigured ? webhookUrl : null,
      pendingUpdateCount: webhook.result?.pending_update_count ?? null,
      allowedUpdates: webhook.result?.allowed_updates || [],
      lastError: webhook.result?.last_error_message || null,
    },
    connectionReady,
    aiEnabled: config.aiEnabled,
    realActionsEnabled: config.realActionsEnabled,
    readyForLiveTraffic: envReady && schemaReady && me.ok && webhookConfigured && connectionReady,
  });
}
