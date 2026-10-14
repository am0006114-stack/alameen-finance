import { getTelegramChannelConfig } from "../_lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getTelegramChannelConfig();
  return Response.json({
    ok: true,
    phase: "18.3",
    channel: "telegram_business",
    configured: {
      botToken: Boolean(config.botToken),
      webhookSecret: Boolean(config.webhookSecret),
      businessUsername: Boolean(config.businessUsername),
      handoffAdminSecret: Boolean(config.handoffAdminSecret),
    },
    aiEnabled: config.aiEnabled,
    realActionsEnabled: config.realActionsEnabled,
  });
}
