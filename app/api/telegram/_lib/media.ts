import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTelegramChannelConfig } from "./config";
import { downloadTelegramFile, getTelegramFile } from "./telegramApi";
import type { TelegramMediaRecord, TelegramMessage, TelegramPhotoSize } from "./types";

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function safeSegment(value: string | null | undefined, fallback: string) {
  const clean = String(value || "")
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 96);
  return clean || fallback;
}

function biggestPhoto(list: TelegramPhotoSize[] | undefined) {
  if (!Array.isArray(list) || !list.length) return null;
  return [...list].sort((a, b) => Number(b.file_size || (b.width || 0) * (b.height || 0)) - Number(a.file_size || (a.width || 0) * (a.height || 0)))[0] || null;
}

function mediaRef(message: TelegramMessage) {
  const photo = biggestPhoto(message.photo);
  if (photo?.file_id) return { kind: "photo" as const, file: photo, fileName: "photo.jpg", mimeType: "image/jpeg" };
  if (message.voice?.file_id) return { kind: "voice" as const, file: message.voice, fileName: "voice.ogg", mimeType: message.voice.mime_type || "audio/ogg" };
  if (message.audio?.file_id) return { kind: "audio" as const, file: message.audio, fileName: message.audio.file_name || "audio", mimeType: message.audio.mime_type || "audio/mpeg" };
  if (message.document?.file_id) return { kind: "document" as const, file: message.document, fileName: message.document.file_name || "document", mimeType: message.document.mime_type || "application/octet-stream" };
  if (message.video?.file_id) return { kind: "video" as const, file: message.video, fileName: message.video.file_name || "video.mp4", mimeType: message.video.mime_type || "video/mp4" };
  return null;
}

async function transcribeIfConfigured(input: { bytes: Uint8Array; mimeType: string; fileName: string }) {
  const config = getTelegramChannelConfig();
  if (!config.transcriptionUrl || !config.transcriptionModel) return null;

  const form = new FormData();
  form.append("model", config.transcriptionModel);
  if (config.transcriptionLanguage) form.append("language", config.transcriptionLanguage);
  // TS 5.x/Node DOM typings reject Uint8Array<ArrayBufferLike> as a BlobPart
  // because its backing store may be a SharedArrayBuffer. Copy into a real
  // ArrayBuffer so Blob always receives the exact, portable BlobPart type.
  const audioBuffer = new ArrayBuffer(input.bytes.byteLength);
  new Uint8Array(audioBuffer).set(input.bytes);
  form.append("file", new Blob([audioBuffer], { type: input.mimeType }), input.fileName);

  const headers: Record<string, string> = {};
  if (config.transcriptionApiKey) headers.Authorization = `Bearer ${config.transcriptionApiKey}`;
  const response = await fetch(config.transcriptionUrl, { method: "POST", headers, body: form });
  const raw = await response.text();
  if (!response.ok) throw new Error(`telegram_transcription_failed:${response.status}:${raw.slice(0, 300)}`);
  try {
    const parsed = JSON.parse(raw) as { text?: string; transcript?: string };
    return String(parsed.text || parsed.transcript || "").trim() || null;
  } catch {
    return raw.trim() || null;
  }
}

export async function persistTelegramMedia(input: {
  message: TelegramMessage;
  canonicalWaId: string;
  applicationId?: string | null;
}): Promise<TelegramMediaRecord | null> {
  const ref = mediaRef(input.message);
  if (!ref) return null;

  const config = getTelegramChannelConfig();
  const declaredSize = numberOrNull((ref.file as any).file_size);
  if (declaredSize != null && declaredSize > config.mediaMaxBytes) {
    return {
      kind: ref.kind,
      fileId: String((ref.file as any).file_id),
      fileUniqueId: String((ref.file as any).file_unique_id || "") || null,
      fileName: ref.fileName || null,
      mimeType: ref.mimeType || null,
      fileSize: declaredSize,
      storagePath: null,
      transcript: null,
      requiresHuman: true,
      warning: "media_too_large",
    };
  }

  try {
    const remote = await getTelegramFile(String((ref.file as any).file_id));
    const remoteSize = numberOrNull(remote.file_size) ?? declaredSize;
    if (!remote.file_path) throw new Error("telegram_file_path_missing");
    if (remoteSize != null && remoteSize > config.mediaMaxBytes) throw new Error("telegram_media_too_large");

    const downloaded = await downloadTelegramFile(remote.file_path);
    if (downloaded.bytes.byteLength > config.mediaMaxBytes) throw new Error("telegram_media_too_large");

    const fileName = safeSegment(ref.fileName, `${ref.kind}.bin`);
    const identity = safeSegment(input.canonicalWaId, "unknown");
    const app = safeSegment(input.applicationId || "no-app", "no-app");
    const date = new Date().toISOString().slice(0, 10);
    const storagePath = `${identity}/${app}/${date}/${randomUUID()}-${fileName}`;
    const mimeType = ref.mimeType || downloaded.contentType || "application/octet-stream";

    const { error: uploadError } = await supabaseAdmin.storage
      .from(config.mediaStorageBucket)
      .upload(storagePath, downloaded.bytes, { contentType: mimeType, upsert: false });
    if (uploadError) throw new Error(`telegram_media_upload:${uploadError.message}`);

    let transcript: string | null = null;
    let warning: string | null = null;
    if (ref.kind === "voice" || ref.kind === "audio") {
      try {
        transcript = await transcribeIfConfigured({ bytes: downloaded.bytes, mimeType, fileName });
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      kind: ref.kind,
      fileId: String((ref.file as any).file_id),
      fileUniqueId: String((ref.file as any).file_unique_id || remote.file_unique_id || "") || null,
      fileName,
      mimeType,
      fileSize: downloaded.bytes.byteLength,
      storagePath,
      transcript,
      requiresHuman: (ref.kind === "voice" || ref.kind === "audio") && !transcript,
      warning,
    };
  } catch (error) {
    return {
      kind: ref.kind,
      fileId: String((ref.file as any).file_id),
      fileUniqueId: String((ref.file as any).file_unique_id || "") || null,
      fileName: ref.fileName || null,
      mimeType: ref.mimeType || null,
      fileSize: declaredSize,
      storagePath: null,
      transcript: null,
      requiresHuman: true,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

export function telegramMediaCustomerText(message: TelegramMessage, media: TelegramMediaRecord | null) {
  const caption = String(message.caption || "").trim();
  if (!media) return String(message.text || caption || "").trim();
  if (media.transcript) return `[رسالة صوتية - تفريغ تلقائي]\n${media.transcript}`;
  if (caption) return `${caption}\n[مرفق ${media.kind} محفوظ مع المحادثة]`;
  return `[مرفق ${media.kind} محفوظ مع المحادثة]`;
}
