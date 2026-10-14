import { requireTelegramBotToken } from "./config";
import type { TelegramBusinessConnection } from "./types";

type TelegramApiEnvelope<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

async function telegramCall<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = requireTelegramBotToken();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const envelope = await response.json().catch(() => null) as TelegramApiEnvelope<T> | null;
  if (!response.ok || !envelope?.ok || envelope.result === undefined) {
    const detail = envelope?.description || `${response.status} ${response.statusText}`.trim();
    throw new Error(`telegram_${method}_failed:${detail}`);
  }
  return envelope.result;
}

export async function getBusinessConnection(connectionId: string) {
  return telegramCall<TelegramBusinessConnection>("getBusinessConnection", {
    business_connection_id: connectionId,
  });
}

export async function sendBusinessText(input: {
  businessConnectionId: string;
  chatId: string;
  text: string;
  disableWebPreview?: boolean;
}) {
  return telegramCall<{ message_id: number }>("sendMessage", {
    business_connection_id: input.businessConnectionId,
    chat_id: input.chatId,
    text: input.text,
    link_preview_options: { is_disabled: input.disableWebPreview !== false },
  });
}

export async function sendBusinessTyping(input: { businessConnectionId: string; chatId: string }) {
  try {
    await telegramCall<boolean>("sendChatAction", {
      business_connection_id: input.businessConnectionId,
      chat_id: input.chatId,
      action: "typing",
    });
    return true;
  } catch {
    return false;
  }
}

export async function readBusinessMessage(input: {
  businessConnectionId: string;
  chatId: string;
  messageId: number;
}) {
  try {
    await telegramCall<boolean>("readBusinessMessage", {
      business_connection_id: input.businessConnectionId,
      chat_id: input.chatId,
      message_id: input.messageId,
    });
    return true;
  } catch {
    return false;
  }
}

export async function getTelegramFile(fileId: string) {
  return telegramCall<{ file_id: string; file_unique_id?: string; file_size?: number; file_path?: string }>("getFile", {
    file_id: fileId,
  });
}

export async function downloadTelegramFile(filePath: string) {
  const token = requireTelegramBotToken();
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`telegram_file_download_failed:${response.status}`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, contentType };
}
