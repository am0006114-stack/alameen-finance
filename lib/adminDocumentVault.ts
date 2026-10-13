import { supabaseAdmin } from "@/lib/supabaseAdmin";

type DocumentLike = Record<string, unknown>;

const DEFAULT_VAULT_BASE_URL =
  "https://vlt-c4f7a91d2e6b.ameenfinance.co";

const IDENTITY_TYPES = new Set([
  "applicant_front",
  "applicant_back",
  "applicant_id_front",
  "applicant_id_back",
  "guarantor_front",
  "guarantor_back",
  "guarantor_id_front",
  "guarantor_id_back",
]);

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...init,
    signal: controller.signal,
    cache: "no-store",
  }).finally(() => clearTimeout(timeout));
}

export function getDocumentType(document: DocumentLike) {
  return asString(document.document_type || document.type);
}

export function isIdentityDocument(document: DocumentLike) {
  return IDENTITY_TYPES.has(getDocumentType(document));
}

export function getDocumentStoragePath(document: DocumentLike) {
  const directPath = asString(
    document.file_path || document.path || document.storage_path
  );

  if (directPath) {
    return directPath.replace(/^\/+/, "");
  }

  const directUrl = asString(
    document.file_url || document.public_url || document.url
  );

  if (!directUrl) return "";

  const markers = [
    "/storage/v1/object/public/documents/",
    "/storage/v1/object/sign/documents/",
  ];

  for (const marker of markers) {
    const markerIndex = directUrl.indexOf(marker);

    if (markerIndex === -1) continue;

    const encodedPath = directUrl
      .slice(markerIndex + marker.length)
      .split("?")[0];

    try {
      return decodeURIComponent(encodedPath).replace(/^\/+/, "");
    } catch {
      return encodedPath.replace(/^\/+/, "");
    }
  }

  return "";
}

export function getDocumentDirectUrl(document: DocumentLike) {
  const directUrl = asString(
    document.file_url || document.public_url || document.url
  );

  if (directUrl) return directUrl;

  const storagePath = getDocumentStoragePath(document);
  if (!storagePath) return "";

  const { data } = supabaseAdmin.storage
    .from("documents")
    .getPublicUrl(storagePath);

  return data.publicUrl || "";
}

export async function fetchAdminDocument(document: DocumentLike) {
  const storagePath = getDocumentStoragePath(document);

  if (isIdentityDocument(document) && storagePath) {
    const vaultKey = asString(process.env.ALAMEEN_VAULT_KEY);

    if (vaultKey) {
      const vaultBaseUrl = (
        asString(process.env.ALAMEEN_VAULT_BASE_URL) ||
        DEFAULT_VAULT_BASE_URL
      ).replace(/\/+$/, "");

      const vaultUrl = `${vaultBaseUrl}/?p=${encodeURIComponent(storagePath)}`;
      const vaultResponse = await fetchWithTimeout(vaultUrl, {
        headers: {
          "X-Alameen-Vault-Key": vaultKey,
        },
      });

      if (vaultResponse.ok) {
        return {
          response: vaultResponse,
          source: "vault" as const,
          storagePath,
        };
      }

      // 404 means this is most likely a newer identity that was never archived.
      // Any other Vault failure is treated as an infrastructure/security failure
      // instead of silently bypassing the Vault.
      if (vaultResponse.status !== 404) {
        throw new Error(
          `Vault fetch failed with status ${vaultResponse.status}`
        );
      }
    }
  }

  const directUrl = getDocumentDirectUrl(document);

  if (!directUrl) {
    throw new Error("Document has no resolvable source URL");
  }

  const sourceResponse = await fetchWithTimeout(directUrl);

  if (!sourceResponse.ok) {
    throw new Error(
      `Supabase document fetch failed with status ${sourceResponse.status}`
    );
  }

  return {
    response: sourceResponse,
    source: "supabase" as const,
    storagePath,
  };
}
