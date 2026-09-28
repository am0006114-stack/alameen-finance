import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { WhatsAppWebhookBody } from "../types";

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
