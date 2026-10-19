const DEFAULT_VAULT_BASE_URL =
  "https://vlt-c4f7a91d2e6b.ameenfinance.co";

export const IDENTITY_DOCUMENT_TYPES = [
  "applicant_front",
  "applicant_back",
  "guarantor_front",
  "guarantor_back",
] as const;

export type IdentityDocumentType =
  (typeof IDENTITY_DOCUMENT_TYPES)[number];

const IDENTITY_TYPE_SET = new Set<string>(IDENTITY_DOCUMENT_TYPES);

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTrackingId(value: string) {
  const trackingId = value.trim();
  if (!/^AM-[0-9]+$/.test(trackingId)) throw new Error("invalid_tracking");
  return trackingId;
}

function normalizeDocumentType(value: string): IdentityDocumentType {
  if (!IDENTITY_TYPE_SET.has(value)) throw new Error("invalid_document_type");
  return value as IdentityDocumentType;
}

function extensionFromFile(file: File) {
  const contentType = asString(file.type).toLowerCase();
  if (contentType && MIME_TO_EXTENSION[contentType]) return MIME_TO_EXTENSION[contentType];

  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (extension && EXTENSION_TO_MIME[extension]) return extension === "jpeg" ? "jpg" : extension;

  throw new Error("invalid_file");
}

function contentTypeForFile(file: File, extension: string) {
  const suppliedType = asString(file.type).toLowerCase();
  if (suppliedType) {
    if (!MIME_TO_EXTENSION[suppliedType]) throw new Error("invalid_file");
    return suppliedType;
  }
  return EXTENSION_TO_MIME[extension] || "application/octet-stream";
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function makeVaultReference(storagePath: string) {
  return `vault://${storagePath.replace(/^\/+/, "")}`;
}

export async function uploadIdentityToVault(input: {
  file: File;
  trackingId: string;
  documentType: string;
  maxBytes: number;
}) {
  if (!(input.file instanceof File) || input.file.size <= 0) throw new Error("invalid_file");
  if (input.file.size > input.maxBytes) throw new Error("file_too_large");

  const trackingId = normalizeTrackingId(input.trackingId);
  const documentType = normalizeDocumentType(input.documentType);
  const extension = extensionFromFile(input.file);
  const contentType = contentTypeForFile(input.file, extension);
  const vaultKey = asString(process.env.ALAMEEN_VAULT_KEY);
  if (!vaultKey) throw new Error("vault_unavailable");

  const vaultBaseUrl = (
    asString(process.env.ALAMEEN_VAULT_BASE_URL) || DEFAULT_VAULT_BASE_URL
  ).replace(/\/+$/, "");

  const storagePath = `${trackingId}/${documentType}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const body = await input.file.arrayBuffer();
  const sha256 = await sha256Hex(body);

  const response = await fetch(`${vaultBaseUrl}/?p=${encodeURIComponent(storagePath)}`, {
    method: "POST",
    headers: {
      "X-Alameen-Vault-Key": vaultKey,
      "X-Alameen-Content-SHA256": sha256,
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("Identity Vault upload failed", { status: response.status, storagePath });
    throw new Error(response.status === 413 ? "file_too_large" : "upload_failed");
  }

  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; path?: string; size?: number; sha256?: string }
    | null;

  if (
    !result?.ok ||
    result.path !== storagePath ||
    Number(result.size) !== body.byteLength ||
    asString(result.sha256).toLowerCase() !== sha256
  ) {
    console.error("Identity Vault verification response mismatch", { storagePath });
    throw new Error("upload_failed");
  }

  return {
    storagePath,
    reference: makeVaultReference(storagePath),
    size: body.byteLength,
    sha256,
  };
}
