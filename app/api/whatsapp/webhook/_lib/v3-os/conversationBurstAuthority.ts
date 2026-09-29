export type ConversationBurstAuthorityRow = {
  id?: string | null;
  message_id?: string | null;
  body?: string | null;
  created_at?: string | null;
  authority_received_at?: string | null;
  message_type?: string | null;
  raw_payload?: any;
};

export type CanonicalConversationBurst = {
  leaderMessageId: string;
  messageIds: string[];
  combinedText: string;
};

export function conversationBurstEventTimeMs(row: ConversationBurstAuthorityRow) {
  const rawTimestamp = Number(row?.raw_payload?.timestamp || 0);
  if (Number.isFinite(rawTimestamp) && rawTimestamp > 0) return rawTimestamp * 1000;
  const createdAt = row?.created_at ? new Date(row.created_at).getTime() : NaN;
  return Number.isFinite(createdAt) ? createdAt : 0;
}


export function conversationBurstAuthorityEligible(row: ConversationBurstAuthorityRow) {
  const type = String(row?.message_type || row?.raw_payload?.type || "").trim().toLowerCase();
  if (type === "reaction") return false;
  const body = String(row?.body || "").trim();
  if (!body) return false;
  // A punctuation-only bubble must never steal ownership from a substantive turn.
  // It can still be logged, but it is not a canonical conversation leader.
  if (/^[.،,!?؟…ـ\-\s]+$/.test(body)) return false;
  return true;
}

export function compareConversationBurstRows(a: ConversationBurstAuthorityRow, b: ConversationBurstAuthorityRow) {
  const timeDiff = conversationBurstEventTimeMs(a) - conversationBurstEventTimeMs(b);
  if (timeDiff !== 0) return timeDiff;
  // Phase 11.5: Meta timestamps have second precision. When durable ingress
  // receipt time is available, use it as the authoritative same-second order
  // before falling back to the stable message-id tie-breaker.
  const aReceived = Date.parse(String(a?.authority_received_at || a?.created_at || ""));
  const bReceived = Date.parse(String(b?.authority_received_at || b?.created_at || ""));
  if (Number.isFinite(aReceived) && Number.isFinite(bReceived) && aReceived !== bReceived) return aReceived - bReceived;
  const aId = String(a?.message_id || a?.id || "");
  const bId = String(b?.message_id || b?.id || "");
  return aId.localeCompare(bId);
}

export function selectCanonicalConversationBurst(
  rows: ConversationBurstAuthorityRow[],
  maxGapMs = 18_000,
): CanonicalConversationBurst | null {
  const usable = (rows || [])
    .filter(conversationBurstAuthorityEligible)
    .slice()
    .sort(compareConversationBurstRows);
  if (!usable.length) return null;

  const latest = usable[usable.length - 1];
  const tail = [latest];
  for (let index = usable.length - 2; index >= 0; index -= 1) {
    const newerTime = conversationBurstEventTimeMs(tail[0]);
    const olderTime = conversationBurstEventTimeMs(usable[index]);
    if (!Number.isFinite(newerTime) || !Number.isFinite(olderTime) || newerTime - olderTime > maxGapMs) break;
    tail.unshift(usable[index]);
  }

  const messageIds = tail
    .map((row) => String(row.message_id || row.id || "").trim())
    .filter(Boolean);
  const leaderMessageId = String(latest.message_id || latest.id || "").trim();
  const combinedText = tail
    .map((row) => String(row.body || "").trim())
    .filter(Boolean)
    .join("\n");

  return { leaderMessageId, messageIds, combinedText };
}

export function conversationBurstLockKey(waId: string, leaderMessageId: string) {
  const cleanWaId = String(waId || "").trim();
  const cleanLeader = String(leaderMessageId || "").trim();
  return cleanWaId && cleanLeader ? `burst:${cleanWaId}:${cleanLeader}` : "";
}
