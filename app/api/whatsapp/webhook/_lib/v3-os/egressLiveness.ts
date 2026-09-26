export const DEFAULT_INCOMING_PROCESSING_LEASE_MS = 45_000;
export const OUTGOING_DELIVERED_MARKER_PREFIX = "DELIVERED:";

export type DuplicateIncomingDecision = "processed" | "retry_later" | "reclaim";

export function decideDuplicateIncomingClaim(input: {
  processedAt?: string | null;
  receivedAt?: string | null;
  nowMs?: number;
  leaseMs?: number;
}): DuplicateIncomingDecision {
  if (String(input.processedAt || "").trim()) return "processed";

  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const leaseMs = Math.max(5_000, Number(input.leaseMs || DEFAULT_INCOMING_PROCESSING_LEASE_MS));
  const receivedMs = input.receivedAt ? new Date(input.receivedAt).getTime() : NaN;

  if (!Number.isFinite(receivedMs)) return "reclaim";
  return nowMs - receivedMs >= leaseMs ? "reclaim" : "retry_later";
}

export function deliveredOutgoingMarker(providerMessageId: string | null | undefined) {
  const clean = String(providerMessageId || "").trim();
  return clean ? `${OUTGOING_DELIVERED_MARKER_PREFIX}${clean}` : "";
}

export function providerMessageIdFromDeliveredMarker(value: string | null | undefined) {
  const clean = String(value || "").trim();
  if (!clean.startsWith(OUTGOING_DELIVERED_MARKER_PREFIX)) return null;
  const id = clean.slice(OUTGOING_DELIVERED_MARKER_PREFIX.length).trim();
  return id || null;
}


export const DEFAULT_OUTGOING_DELIVERY_LEASE_MS = 90_000;

export type DuplicateOutgoingLockDecision = "delivered" | "inflight" | "reclaim";

export function decideDuplicateOutgoingLock(input: {
  replyBody?: string | null;
  createdAt?: string | null;
  nowMs?: number;
  leaseMs?: number;
}): DuplicateOutgoingLockDecision {
  if (providerMessageIdFromDeliveredMarker(input.replyBody || null)) return "delivered";
  const createdMs = Date.parse(String(input.createdAt || ""));
  if (!Number.isFinite(createdMs)) return "reclaim";
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const leaseMs = Number.isFinite(input.leaseMs) && Number(input.leaseMs) > 0
    ? Number(input.leaseMs)
    : DEFAULT_OUTGOING_DELIVERY_LEASE_MS;
  return Math.max(0, nowMs - createdMs) < leaseMs ? "inflight" : "reclaim";
}

export function outgoingDeliveryEvidence(input: {
  providerMessageIdFromLock?: string | null;
  sourceOutgoingRowExists?: boolean;
}) {
  return Boolean(String(input.providerMessageIdFromLock || "").trim() || input.sourceOutgoingRowExists);
}

// Backward-compatible helper retained for Phase 8.1.2 regressions.
export function duplicateOutgoingLockMeansDelivered(input: {
  lockClaimed: boolean;
  recentOutgoingExists: boolean;
}) {
  if (input.lockClaimed) return false;
  return Boolean(input.recentOutgoingExists);
}
