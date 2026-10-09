export type V4InboundMessageKind = "text" | "voice" | "image" | "video" | "document" | "reaction" | "other";

export type V4InboundMessage = {
  id: string;
  text: string | null;
  receivedAt: string;
  kind: V4InboundMessageKind;
};

export type V4ConversationBurst = {
  messageIds: string[];
  burstText: string;
  startedAt: string;
  endedAt: string;
  mediaContext: Array<{ id: string; kind: Exclude<V4InboundMessageKind, "text">; receivedAt: string }>;
};

function time(value: string) {
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function mediaMarker(kind: V4InboundMessageKind) {
  if (kind === "voice") return "[رسالة صوتية حالية بلا تفريغ نصي]";
  if (kind === "image") return "[صورة حالية]";
  if (kind === "video") return "[فيديو حالي]";
  if (kind === "document") return "[ملف حالي]";
  if (kind === "reaction") return "[تفاعل حالي]";
  return "[محتوى غير نصي حالي]";
}

/**
 * WhatsApp customers often express one thought as several short messages. V4 treats
 * a contiguous run of customer messages as one semantic burst. This function does
 * not sleep or create server timers; the ingress layer supplies the recent contiguous
 * messages it already has, so there is no shadow execution or duplicate model call.
 *
 * Media never owns a later fresh text message. When text exists in the burst, media is
 * retained as context metadata but is not converted into a stale "I can't hear/see it"
 * instruction. If the burst is media-only, a current-media marker is emitted so the
 * conversation brain can ask one useful clarification.
 */
export function assembleV4ConversationBurst(input: {
  current: V4InboundMessage;
  recentContiguousInbound?: V4InboundMessage[];
  maxGapMs?: number;
}): V4ConversationBurst {
  const maxGapMs = Math.max(500, Math.min(15000, input.maxGapMs ?? 5000));
  const all = [...(input.recentContiguousInbound || []), input.current]
    .filter((m, i, arr) => Boolean(m?.id) && arr.findIndex((x) => x.id === m.id) === i)
    .sort((a, b) => time(a.receivedAt) - time(b.receivedAt));

  const currentIndex = all.findIndex((m) => m.id === input.current.id);
  const selected: V4InboundMessage[] = currentIndex >= 0 ? [all[currentIndex]] : [input.current];
  let cursor = currentIndex - 1;
  let nextTime = time(input.current.receivedAt);

  while (cursor >= 0) {
    const candidate = all[cursor];
    const candidateTime = time(candidate.receivedAt);
    if (!candidateTime || !nextTime || nextTime - candidateTime > maxGapMs) break;
    selected.unshift(candidate);
    nextTime = candidateTime;
    cursor -= 1;
  }

  const textParts = selected
    .filter((m) => m.kind === "text" && String(m.text || "").trim())
    .map((m) => String(m.text || "").trim());

  const media = selected
    .filter((m) => m.kind !== "text")
    .map((m) => ({ id: m.id, kind: m.kind as Exclude<V4InboundMessageKind, "text">, receivedAt: m.receivedAt }));

  let burstText = textParts.join("\n").trim();
  if (!burstText) {
    const currentMedia = selected[selected.length - 1];
    burstText = mediaMarker(currentMedia?.kind || "other");
  }

  return {
    messageIds: selected.map((m) => m.id),
    burstText,
    startedAt: selected[0]?.receivedAt || input.current.receivedAt,
    endedAt: selected[selected.length - 1]?.receivedAt || input.current.receivedAt,
    mediaContext: media,
  };
}
