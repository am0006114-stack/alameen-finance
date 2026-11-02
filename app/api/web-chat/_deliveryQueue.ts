import { supabaseAdmin } from "@/lib/supabaseAdmin";

const QUEUE_SETTING_KEY = "web_chat_delivery_queue_enabled";
const ACTIVE_QUEUE_LOOKBACK_MS = 10 * 60_000;
const STAFF_CAPACITY = 3;

export type WebChatDeliveryState = {
  version: 1;
  queuedAt: string;
  visibleAfter: string;
  queuePosition: number;
  queueAhead: number;
  estimatedWaitSeconds: number;
  firstReply: boolean;
  typingLeadSeconds: number;
};

function asBoolean(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function stableNumber(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableRange(key: string, min: number, max: number) {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  const span = safeMax - safeMin + 1;
  return safeMin + (stableNumber(key) % span);
}

export function readWebChatDeliveryState(rawPayload: unknown): WebChatDeliveryState | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const delivery = (rawPayload as Record<string, unknown>).delivery;
  if (!delivery || typeof delivery !== "object") return null;
  const value = delivery as Record<string, unknown>;
  const visibleAfter = String(value.visibleAfter || value.visible_after || "").trim();
  const queuedAt = String(value.queuedAt || value.queued_at || "").trim();
  const visibleAtMs = Date.parse(visibleAfter);
  if (!visibleAfter || !Number.isFinite(visibleAtMs)) return null;
  return {
    version: 1,
    queuedAt: queuedAt || new Date().toISOString(),
    visibleAfter,
    queuePosition: Math.max(1, Number(value.queuePosition || value.queue_position || 1) || 1),
    queueAhead: Math.max(0, Number(value.queueAhead || value.queue_ahead || 0) || 0),
    estimatedWaitSeconds: Math.max(0, Number(value.estimatedWaitSeconds || value.estimated_wait_seconds || 0) || 0),
    firstReply: Boolean(value.firstReply ?? value.first_reply),
    typingLeadSeconds: Math.max(3, Number(value.typingLeadSeconds || value.typing_lead_seconds || 6) || 6),
  };
}

export function isWebChatDeliveryVisible(rawPayload: unknown, nowMs = Date.now()) {
  const delivery = readWebChatDeliveryState(rawPayload);
  if (!delivery) return true;
  return Date.parse(delivery.visibleAfter) <= nowMs;
}

export async function isWebChatDeliveryQueueEnabled() {
  const { data, error } = await supabaseAdmin
    .from("web_chat_settings")
    .select("value")
    .eq("key", QUEUE_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.error("web_chat_delivery_queue_setting_read_failed", error.message);
    return false;
  }
  return asBoolean(data?.value);
}

async function loadActiveQueuedRows(nowMs: number) {
  const { data, error } = await supabaseAdmin
    .from("web_chat_messages")
    .select("id,session_id,created_at,raw_payload")
    .eq("direction", "outgoing")
    .eq("status", "queued")
    .gte("created_at", new Date(nowMs - ACTIVE_QUEUE_LOOKBACK_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("web_chat_delivery_queue_read_failed", error.message);
    return [] as Array<{ id: string; sessionId: string; delivery: WebChatDeliveryState }>;
  }

  return (data || []).flatMap((row) => {
    const delivery = readWebChatDeliveryState(row.raw_payload);
    if (!delivery || Date.parse(delivery.visibleAfter) <= nowMs) return [];
    return [{ id: String(row.id), sessionId: String(row.session_id || ""), delivery }];
  });
}

export async function scheduleWebChatDelivery(input: { sessionId: string; clientMessageId: string }) {
  if (!(await isWebChatDeliveryQueueEnabled())) return null;

  const nowMs = Date.now();
  const [prior, activeRows] = await Promise.all([
    supabaseAdmin
      .from("web_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", input.sessionId)
      .eq("direction", "outgoing"),
    loadActiveQueuedRows(nowMs),
  ]);

  if (prior.error) console.error("web_chat_delivery_prior_count_failed", prior.error.message);

  const firstReply = (prior.count || 0) === 0;
  const activeSessionIds = new Set(
    activeRows
      .map((row) => row.sessionId)
      .filter((sessionId) => sessionId && sessionId !== input.sessionId),
  );
  const queueAhead = activeSessionIds.size;
  const queuePosition = queueAhead + 1;
  const batchesAhead = Math.floor(queueAhead / STAFF_CAPACITY);

  // The first Web Chat reply gets a realistic service-desk wait. Follow-ups stay human-paced
  // without making an active conversation feel deliberately sluggish.
  const baseWait = firstReply
    ? stableRange(`${input.clientMessageId}:first`, 55, 85)
    : stableRange(`${input.clientMessageId}:followup`, 9, 17);
  const queuePenalty = batchesAhead * (firstReply ? 28 : 11);
  const estimatedWaitSeconds = Math.min(firstReply ? 180 : 50, baseWait + queuePenalty);
  const typingLeadSeconds = stableRange(`${input.clientMessageId}:typing`, 5, 8);
  const queuedAt = new Date(nowMs).toISOString();
  const visibleAfter = new Date(nowMs + estimatedWaitSeconds * 1000).toISOString();

  return {
    version: 1 as const,
    queuedAt,
    visibleAfter,
    queuePosition,
    queueAhead,
    estimatedWaitSeconds,
    firstReply,
    typingLeadSeconds,
  } satisfies WebChatDeliveryState;
}

export async function loadPendingWebChatDelivery(sessionId: string) {
  if (!(await isWebChatDeliveryQueueEnabled())) return null;

  const nowMs = Date.now();
  const { data, error } = await supabaseAdmin
    .from("web_chat_messages")
    .select("id,raw_payload,created_at")
    .eq("session_id", sessionId)
    .eq("direction", "outgoing")
    .eq("status", "queued")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.error("web_chat_pending_delivery_read_failed", error.message);
    return null;
  }

  const pending = (data || [])
    .map((row) => readWebChatDeliveryState(row.raw_payload))
    .filter((delivery): delivery is WebChatDeliveryState => Boolean(delivery) && Date.parse(delivery.visibleAfter) > nowMs)
    .sort((a, b) => Date.parse(a.visibleAfter) - Date.parse(b.visibleAfter));

  return pending[0] || null;
}
