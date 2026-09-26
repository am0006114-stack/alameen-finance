export const DEFAULT_INCOMING_PROCESSING_LEASE_MS = 45_000;

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

export function duplicateOutgoingLockMeansDelivered(input: {
  lockClaimed: boolean;
  recentOutgoingExists: boolean;
}) {
  if (input.lockClaimed) return false;
  return Boolean(input.recentOutgoingExists);
}
