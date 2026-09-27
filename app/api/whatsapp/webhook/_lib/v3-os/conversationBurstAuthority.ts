export type ConversationBurstAuthorityRow = {
  id?: string | null;
  message_id?: string | null;
  body?: string | null;
  created_at?: string | null;
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

export function compareConversationBurstRows(a: ConversationBurstAuthorityRow, b: ConversationBurstAuthorityRow) {
  const timeDiff = conversationBurstEventTimeMs(a) - conversationBurstEventTimeMs(b);
  if (timeDiff !== 0) return timeDiff;
  // Meta timestamps have second precision. All webhook invocations MUST use the
  // same stable tie-breaker or every contender can mistakenly suppress itself.
  const aId = String(a?.message_id || a?.id || "");
  const bId = String(b?.message_id || b?.id || "");
  return aId.localeCompare(bId);
}

export function selectCanonicalConversationBurst(
  rows: ConversationBurstAuthorityRow[],
  maxGapMs = 18_000,
): CanonicalConversationBurst | null {
  const usable = (rows || [])
    .filter((row) => String(row?.body || "").trim())
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
