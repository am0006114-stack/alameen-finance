export function envFlag(name: string, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function cleanUsername(value: string | null | undefined) {
  return String(value || "").trim().replace(/^@+/, "");
}

export type TelegramChannelConfig = {
  botToken: string;
  webhookSecret: string;
  businessUsername: string;
  handoffAdminSecret: string;
  aiEnabled: boolean;
  realActionsEnabled: boolean;
  humanTakeoverMinutes: number;
  handoffTtlMinutes: number;
  mediaStorageBucket: string;
  mediaMaxBytes: number;
  transcriptionUrl: string;
  transcriptionApiKey: string;
  transcriptionModel: string;
  transcriptionLanguage: string;
};

export function getTelegramChannelConfig(): TelegramChannelConfig {
  const takeover = Number(process.env.TELEGRAM_HUMAN_TAKEOVER_MINUTES || "30");
  const handoffTtl = Number(process.env.TELEGRAM_HANDOFF_TTL_MINUTES || "20");
  const mediaMaxMb = Number(process.env.TELEGRAM_MEDIA_MAX_MB || "20");
  const mediaMaxBytes = Number.isFinite(mediaMaxMb) && mediaMaxMb > 0
    ? Math.min(mediaMaxMb, 100) * 1024 * 1024
    : 20 * 1024 * 1024;
  return {
    botToken: String(process.env.TELEGRAM_BOT_TOKEN || "").trim(),
    webhookSecret: String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim(),
    businessUsername: cleanUsername(process.env.TELEGRAM_BUSINESS_USERNAME),
    handoffAdminSecret: String(process.env.TELEGRAM_HANDOFF_ADMIN_SECRET || "").trim(),
    aiEnabled: envFlag("TELEGRAM_AI_ENABLED", true),
    realActionsEnabled: envFlag("TELEGRAM_REAL_ACTIONS_ENABLED", false),
    humanTakeoverMinutes: Number.isFinite(takeover) && takeover > 0 ? Math.min(takeover, 24 * 60) : 30,
    handoffTtlMinutes: Number.isFinite(handoffTtl) && handoffTtl > 0 ? Math.min(handoffTtl, 24 * 60) : 20,
    mediaStorageBucket: String(process.env.TELEGRAM_MEDIA_STORAGE_BUCKET || "telegram-media").trim() || "telegram-media",
    mediaMaxBytes,
    transcriptionUrl: String(process.env.TELEGRAM_TRANSCRIPTION_URL || "").trim(),
    transcriptionApiKey: String(process.env.TELEGRAM_TRANSCRIPTION_API_KEY || "").trim(),
    transcriptionModel: String(process.env.TELEGRAM_TRANSCRIPTION_MODEL || "").trim(),
    transcriptionLanguage: String(process.env.TELEGRAM_TRANSCRIPTION_LANGUAGE || "ar").trim() || "ar",
  };
}

export function requireTelegramBotToken() {
  const token = getTelegramChannelConfig().botToken;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}
