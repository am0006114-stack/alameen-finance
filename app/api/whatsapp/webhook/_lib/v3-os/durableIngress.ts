import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { WhatsAppMessage, WhatsAppWebhookBody } from "../types";
import { compareConversationBurstRows, conversationBurstAuthorityEligible, type ConversationBurstAuthorityRow } from "./conversationBurstAuthority";

type DurableIngressJobInsert = {
  event_key: string;
  event_kind: "message";
  wa_id: string | null;
  incoming_message_id: string | null;
  payload: WhatsAppWebhookBody;
  status: "queued";
  next_attempt_at: string;
};

export type DurableIngressEnqueueResult = {
  accepted: boolean;
  eventCount: number;
  reason: string;
  error?: string;
};

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function stableFallbackKey(prefix: string, value: unknown) {
  const digest = createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 40);
  return `${prefix}:${digest}`;
}

function oneEventPayload(input: {
  root: WhatsAppWebhookBody;
  entry: any;
  change: any;
  message?: any;
}): WhatsAppWebhookBody {
  const originalValue = (input.change?.value || {}) as Record<string, unknown>;
  const value = {
    ...originalValue,
    messages: input.message ? [input.message] : [],
    statuses: [],
  };

  return {
    ...(input.root as any),
    entry: [{
      ...(input.entry || {}),
      changes: [{
        ...(input.change || {}),
        value,
      }],
    }],
  } as WhatsAppWebhookBody;
}

export function buildDurableIngressJobs(body: WhatsAppWebhookBody): DurableIngressJobInsert[] {
  const rows: DurableIngressJobInsert[] = [];
  const nowIso = new Date().toISOString();

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value as any;

      for (const message of (value?.messages || []) as any[]) {
        const messageId = String(message?.id || "").trim();
        const waId = String(message?.from || value?.contacts?.[0]?.wa_id || "").trim() || null;
        const eventKey = messageId
          ? `message:${messageId}`
          : stableFallbackKey("message-fallback", { waId, timestamp: message?.timestamp, message });

        rows.push({
          event_key: eventKey,
          event_kind: "message",
          wa_id: waId,
          incoming_message_id: messageId || null,
          payload: oneEventPayload({ root: body, entry, change, message }),
          status: "queued",
          next_attempt_at: nowIso,
        });
      }

    }
  }

  return rows;
}

export function buildStatusOnlyWebhookBody(body: WhatsAppWebhookBody): WhatsAppWebhookBody | null {
  const statusEntries: any[] = [];
  let count = 0;

  for (const entry of body.entry || []) {
    const statusChanges: any[] = [];
    for (const change of entry.changes || []) {
      const value = change.value as any;
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      if (!statuses.length) continue;
      count += statuses.length;
      statusChanges.push({
        ...(change as any),
        value: { ...(value || {}), messages: [], statuses },
      });
    }
    if (statusChanges.length) statusEntries.push({ ...(entry as any), changes: statusChanges });
  }

  if (!count) return null;
  return { ...(body as any), entry: statusEntries } as WhatsAppWebhookBody;
}

export async function enqueueDurableIngressWebhook(body: WhatsAppWebhookBody): Promise<DurableIngressEnqueueResult> {
  const rows = buildDurableIngressJobs(body);
  if (!rows.length) {
    return { accepted: true, eventCount: 0, reason: "no_queueable_events" };
  }

  try {
    const { error } = await supabaseAdmin
      .from("whatsapp_live_ingress_jobs")
      .upsert(rows, { onConflict: "event_key", ignoreDuplicates: true });

    if (error) {
      const code = String((error as any)?.code || "");
      const message = String((error as any)?.message || error || "unknown enqueue error");
      const schemaUnavailable = ["42P01", "PGRST205", "PGRST204"].includes(code) || /whatsapp_live_ingress_jobs/i.test(message) && /not find|does not exist|schema cache/i.test(message);
      return {
        accepted: false,
        eventCount: rows.length,
        reason: schemaUnavailable ? "durable_ingress_schema_unavailable" : "durable_ingress_enqueue_failed",
        error: `${code || "unknown"}:${message}`.slice(0, 1200),
      };
    }

    return { accepted: true, eventCount: rows.length, reason: "durably_enqueued" };
  } catch (error) {
    return {
      accepted: false,
      eventCount: rows.length,
      reason: "durable_ingress_enqueue_exception",
      error: (error instanceof Error ? error.message : String(error)).slice(0, 1200),
    };
  }
}

export async function verifyDurableIngressWorkerToken(supplied: string) {
  const token = String(supplied || "").trim();
  if (!token) return false;

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_live_ingress_settings")
      .select("value")
      .eq("key", "worker_token")
      .maybeSingle();

    if (error || !data?.value) return false;
    return secureEqual(token, String(data.value));
  } catch {
    return false;
  }
}

export type DurableIngressTurnFreshness = {
  fresh: boolean;
  currentMessageId: string;
  latestMessageId: string | null;
  reason: "current_is_latest" | "newer_durable_inbound" | "current_not_found" | "no_pending_rows" | "read_failed";
};

function firstQueuedMessage(payload: unknown): WhatsAppMessage | null {
  const root = payload as WhatsAppWebhookBody | null;
  for (const entry of root?.entry || []) {
    for (const change of entry.changes || []) {
      const message = change.value?.messages?.[0];
      if (message) return message;
    }
  }
  return null;
}

function durableAuthorityBody(message: WhatsAppMessage) {
  const type = String(message.type || "unknown").toLowerCase();
  if (type === "reaction") return "";
  if (type === "text") return String(message.text?.body || "");
  if (type === "interactive") {
    return String(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || message.interactive?.list_reply?.description || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "interactive");
  }
  if (type === "button") return String(message.button?.text || message.button?.payload || "button");
  if (type === "image") return String(message.image?.caption || "image");
  if (type === "document") return String(message.document?.caption || message.document?.filename || "document");
  if (type === "video") return String(message.video?.caption || "video");
  if (["audio", "voice", "location", "contacts", "sticker"].includes(type)) return type;
  return type || "message";
}

function ingressAuthorityRow(input: { incoming_message_id?: string | null; created_at?: string | null; payload?: unknown }) : ConversationBurstAuthorityRow | null {
  const message = firstQueuedMessage(input.payload);
  if (!message) return null;
  const messageId = String(input.incoming_message_id || message.id || "").trim();
  if (!messageId) return null;
  return {
    message_id: messageId,
    body: durableAuthorityBody(message),
    created_at: input.created_at || null,
    authority_received_at: input.created_at || null,
    message_type: String(message.type || "unknown"),
    raw_payload: message,
  };
}

/**
 * Phase 11.5 durable freshness authority.
 *
 * ConversationState is downstream state. A newer customer bubble can already be
 * durably accepted while still waiting in whatsapp_live_ingress_jobs, so action
 * execution and final egress must also consult that ingress surface. This is a
 * read-only check over the existing Phase 10.1 table; no schema change is needed.
 */
export async function durableIngressTurnFreshness(input: {
  waId: string;
  currentMessageId: string;
  lookbackSeconds?: number;
}): Promise<DurableIngressTurnFreshness> {
  const waId = String(input.waId || "").trim();
  const currentMessageId = String(input.currentMessageId || "").trim();
  if (!waId || !currentMessageId) {
    return { fresh: true, currentMessageId, latestMessageId: null, reason: "current_not_found" };
  }

  try {
    const since = new Date(Date.now() - Math.max(30, input.lookbackSeconds ?? 180) * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("whatsapp_live_ingress_jobs")
      .select("incoming_message_id,created_at,payload,status")
      .eq("wa_id", waId)
      .in("status", ["queued", "processing", "retry_wait"])
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(80);

    if (error) {
      console.error("durable ingress freshness read failed", { waId, currentMessageId, error: error.message });
      return { fresh: true, currentMessageId, latestMessageId: null, reason: "read_failed" };
    }

    const rows: ConversationBurstAuthorityRow[] = (data || [])
      .map((row: any) => ingressAuthorityRow(row))
      .filter((row: ConversationBurstAuthorityRow | null): row is ConversationBurstAuthorityRow => Boolean(row) && conversationBurstAuthorityEligible(row as ConversationBurstAuthorityRow))
      .sort(compareConversationBurstRows);

    if (!rows.length) {
      return { fresh: true, currentMessageId, latestMessageId: null, reason: "no_pending_rows" };
    }

    const currentIndex = rows.findIndex((row) => String(row.message_id || "") === currentMessageId);
    if (currentIndex < 0) {
      return { fresh: true, currentMessageId, latestMessageId: String(rows[rows.length - 1]?.message_id || "") || null, reason: "current_not_found" };
    }

    const latestMessageId = String(rows[rows.length - 1]?.message_id || "").trim() || null;
    const fresh = latestMessageId === currentMessageId;
    return {
      fresh,
      currentMessageId,
      latestMessageId,
      reason: fresh ? "current_is_latest" : "newer_durable_inbound",
    };
  } catch (error) {
    console.error("durable ingress freshness exception", { waId, currentMessageId, error });
    return { fresh: true, currentMessageId, latestMessageId: null, reason: "read_failed" };
  }
}
