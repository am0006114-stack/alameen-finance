const fs = require("node:fs");

function patchFile(path, patches) {
  let source = fs.readFileSync(path, "utf8");
  for (const [before, after, label] of patches) {
    if (!source.includes(before)) {
      throw new Error(`${path}: missing patch anchor: ${label}`);
    }
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
  console.log(`PATCHED: ${path}`);
}

patchFile("app/api/web-chat/_runtime.ts", [
  [
    'import { loadPostPaymentChannelState, type WebChatSession } from "@/app/api/postpayment/_lib/channelState";\n',
    'import { loadPostPaymentChannelState, type WebChatSession } from "@/app/api/postpayment/_lib/channelState";\nimport { isWebChatDeliveryVisible, scheduleWebChatDelivery, type WebChatDeliveryState } from "./_deliveryQueue";\n',
    "delivery queue import",
  ],
  [
    '.select("id,created_at,direction,body,handled_by_ai")\n      .eq("canonical_wa_id", session.canonical_wa_id)',
    '.select("id,created_at,direction,body,handled_by_ai,raw_payload")\n      .eq("canonical_wa_id", session.canonical_wa_id)',
    "web timeline raw payload",
  ],
  [
    '  if (!web.error) for (const row of web.data || []) {\n    const body = normalizeReply(row.body);',
    '  if (!web.error) for (const row of web.data || []) {\n    if (String(row.direction || "") === "outgoing" && !isWebChatDeliveryVisible(row.raw_payload)) continue;\n    const body = normalizeReply(row.body);',
    "hide queued outgoing replies",
  ],
  [
    'async function logOutgoing(session: WebChatSession, body: string, handledByAi: boolean, turnId: string | null, replyTo: string) {',
    'async function logOutgoing(session: WebChatSession, body: string, handledByAi: boolean, turnId: string | null, replyTo: string, delivery: WebChatDeliveryState | null = null) {',
    "log outgoing delivery signature",
  ],
  [
    '    status: "sent",\n    raw_payload: {\n      source: "web_chat",\n      v3_turn_id: turnId,\n      reply_to_client_message_id: replyTo,\n    },',
    '    status: delivery ? "queued" : "sent",\n    raw_payload: {\n      source: "web_chat",\n      v3_turn_id: turnId,\n      reply_to_client_message_id: replyTo,\n      ...(delivery ? { delivery } : {}),\n    },',
    "persist queued delivery metadata",
  ],
  [
    '    if ((insertError as any).code === "23505") return { duplicate: true as const, reply: null, turnId: null };',
    '    if ((insertError as any).code === "23505") return { duplicate: true as const, reply: null, turnId: null, delivery: null };',
    "duplicate delivery result",
  ],
  [
    '    await logOutgoing(input.session, reply, false, null, input.clientMessageId);\n    return { duplicate: false as const, reply, turnId: null };',
    '    await logOutgoing(input.session, reply, false, null, input.clientMessageId);\n    return { duplicate: false as const, reply, turnId: null, delivery: null };',
    "maintenance delivery result",
  ],
  [
    '  reply = enforceWebChannelTruth(reply);\n  await logOutgoing(input.session, reply, Boolean(run), turnId, input.clientMessageId);',
    '  reply = enforceWebChannelTruth(reply);\n  const delivery = await scheduleWebChatDelivery({\n    sessionId: input.session.id,\n    clientMessageId: input.clientMessageId,\n  });\n  await logOutgoing(input.session, reply, Boolean(run), turnId, input.clientMessageId, delivery);',
    "schedule after guarded reply",
  ],
  [
    '  return { duplicate: false as const, reply, turnId };',
    '  return { duplicate: false as const, reply, turnId, delivery };',
    "return delivery metadata",
  ],
]);

patchFile("app/api/web-chat/session/route.ts", [
  [
    'import { supabaseAdmin } from "@/lib/supabaseAdmin";\n',
    'import { supabaseAdmin } from "@/lib/supabaseAdmin";\nimport { isWebChatDeliveryQueueEnabled, loadPendingWebChatDelivery } from "../_deliveryQueue";\n',
    "session queue import",
  ],
  [
    '  const [flags, channelState, timeline, order] = await Promise.all([\n    getPostPaymentChannelFlags(),\n    loadPostPaymentChannelState(session.application_id),\n    loadWebChatTimeline(session),\n    loadOrderSummary(session.application_id),\n  ]);',
    '  const [flags, channelState, timeline, order, deliveryQueueEnabled] = await Promise.all([\n    getPostPaymentChannelFlags(),\n    loadPostPaymentChannelState(session.application_id),\n    loadWebChatTimeline(session),\n    loadOrderSummary(session.application_id),\n    isWebChatDeliveryQueueEnabled(),\n  ]);\n  const delivery = deliveryQueueEnabled ? await loadPendingWebChatDelivery(session.id) : null;',
    "load pending delivery",
  ],
  [
    '    order,\n    timeline,',
    '    order,\n    timeline,\n    deliveryQueueEnabled,\n    delivery,',
    "session queue payload",
  ],
]);

patchFile("app/api/telegram/_lib/messages.ts", [
  [
    'import type { TelegramMediaRecord, TelegramMessage } from "./types";\n',
    'import type { TelegramMediaRecord, TelegramMessage } from "./types";\nimport { isWebChatDeliveryVisible } from "@/app/api/web-chat/_deliveryQueue";\n',
    "cross channel delivery visibility import",
  ],
  [
    '.select("created_at,direction,body")\n      .eq("canonical_wa_id", canonicalWaId)',
    '.select("created_at,direction,body,raw_payload")\n      .eq("canonical_wa_id", canonicalWaId)',
    "web recent turns raw payload",
  ],
  [
    '  if (!web.error) rows.push(...(web.data || []));',
    '  if (!web.error) rows.push(...(web.data || []).filter((row) => String(row.direction || "") !== "outgoing" || isWebChatDeliveryVisible(row.raw_payload)));',
    "exclude not-yet-visible web reply from AI context",
  ],
]);

patchFile("app/chat/ChatClient.tsx", [
  [
    'type SessionPayload = {\n  ok: boolean;',
    'type WebChatDeliveryState = {\n  version: 1;\n  queuedAt: string;\n  visibleAfter: string;\n  queuePosition: number;\n  queueAhead: number;\n  estimatedWaitSeconds: number;\n  firstReply: boolean;\n  typingLeadSeconds: number;\n};\n\ntype SessionPayload = {\n  ok: boolean;',
    "delivery client type",
  ],
  [
    '  order?: OrderSummary | null;\n  timeline?: TimelineItem[];\n};',
    '  order?: OrderSummary | null;\n  timeline?: TimelineItem[];\n  deliveryQueueEnabled?: boolean;\n  delivery?: WebChatDeliveryState | null;\n};',
    "session delivery fields",
  ],
  [
    'function timeLabel(value: string) {',
    'function waitTimeLabel(seconds: number) {\n  const safe = Math.max(0, Math.ceil(seconds));\n  if (safe < 45) return "أقل من دقيقة";\n  if (safe < 90) return "حوالي دقيقة";\n  const minutes = Math.max(2, Math.ceil(safe / 60));\n  return `حوالي ${new Intl.NumberFormat("ar-JO").format(minutes)} دقائق`;\n}\n\nfunction timeLabel(value: string) {',
    "wait label helper",
  ],
  [
    '  const [orderOpen, setOrderOpen] = useState(false);',
    '  const [orderOpen, setOrderOpen] = useState(false);\n  const [queueClock, setQueueClock] = useState(() => Date.now());',
    "queue clock state",
  ],
  [
    '  const busy = sending || channelBusy;\n  const order = session?.order || null;\n  const currentStatus = statusLabel(order?.status);',
    '  const busy = sending || channelBusy;\n  const order = session?.order || null;\n  const currentStatus = statusLabel(order?.status);\n  const delivery = session?.delivery || null;\n  const deliveryVisibleAtMs = delivery ? Date.parse(delivery.visibleAfter) : Number.NaN;\n  const deliveryQueuedAtMs = delivery ? Date.parse(delivery.queuedAt) : Number.NaN;\n  const deliveryPending = Boolean(delivery && Number.isFinite(deliveryVisibleAtMs) && deliveryVisibleAtMs > queueClock);\n  const deliveryRemainingSeconds = deliveryPending ? Math.max(0, Math.ceil((deliveryVisibleAtMs - queueClock) / 1000)) : 0;\n  const deliveryTyping = Boolean(deliveryPending && delivery && deliveryRemainingSeconds <= delivery.typingLeadSeconds);\n  const deliveryWaiting = Boolean(deliveryPending && !deliveryTyping);\n  const queueProgress = deliveryPending && Number.isFinite(deliveryQueuedAtMs) && deliveryVisibleAtMs > deliveryQueuedAtMs\n    ? Math.max(4, Math.min(96, ((queueClock - deliveryQueuedAtMs) / (deliveryVisibleAtMs - deliveryQueuedAtMs)) * 100))\n    : 0;',
    "derived queue state",
  ],
  [
    '  useEffect(() => {\n    if (!sending) {\n      setTypingVisible(false);\n      return;\n    }\n    const timer = window.setTimeout(() => setTypingVisible(true), typingDelayRef.current);\n    return () => window.clearTimeout(timer);\n  }, [sending]);',
    '  useEffect(() => {\n    if (session?.deliveryQueueEnabled) {\n      setTypingVisible(false);\n      return;\n    }\n    if (!sending) {\n      setTypingVisible(false);\n      return;\n    }\n    const timer = window.setTimeout(() => setTypingVisible(true), typingDelayRef.current);\n    return () => window.clearTimeout(timer);\n  }, [sending, session?.deliveryQueueEnabled]);\n\n  useEffect(() => {\n    if (!deliveryPending || !Number.isFinite(deliveryVisibleAtMs)) return;\n    const tick = window.setInterval(() => setQueueClock(Date.now()), 1000);\n    const reveal = window.setTimeout(() => {\n      setQueueClock(Date.now());\n      document.dispatchEvent(new Event("visibilitychange"));\n    }, Math.max(250, deliveryVisibleAtMs - Date.now() + 250));\n    return () => {\n      window.clearInterval(tick);\n      window.clearTimeout(reveal);\n    };\n  }, [deliveryPending, deliveryVisibleAtMs]);',
    "queue clock and one-shot reveal",
  ],
  [
    '    if (!clean || sending || !session?.ok) return;',
    '    if (!clean || sending || deliveryPending || !session?.ok) return;',
    "block concurrent turn while queued",
  ],
  [
    '    if (firstSend) {\n      setHandoffVisible(true);\n      handoffTimerRef.current = window.setTimeout(() => {\n        setHandoffVisible(false);\n        handoffTimerRef.current = null;\n      }, 1200);\n    } else {',
    '    if (firstSend) {\n      setHandoffVisible(true);\n      if (!session.deliveryQueueEnabled) {\n        handoffTimerRef.current = window.setTimeout(() => {\n          setHandoffVisible(false);\n          handoffTimerRef.current = null;\n        }, 1200);\n      }\n    } else {',
    "keep initial handoff until queue assignment",
  ],
  [
    '      setSession((current) => current ? { ...current, timeline: data.timeline || current.timeline } : current);',
    '      setSession((current) => current ? { ...current, timeline: data.timeline || current.timeline, delivery: data.delivery || null } : current);\n      setQueueClock(Date.now());',
    "store delivery from send response",
  ],
  [
    '                {typingVisible ? (',
    '                {deliveryWaiting && delivery ? (\n                  <div className="flex justify-end" aria-live="polite">\n                    <div className="w-full max-w-[88%] rounded-2xl rounded-tl-md border border-amber-300/[0.12] bg-gradient-to-l from-[#17231d] to-[#102019] px-4 py-3 shadow-sm sm:max-w-[78%]">\n                      <div className="flex items-start gap-3">\n                        <ServiceAvatar />\n                        <div className="min-w-0 flex-1">\n                          <p className="text-[11px] font-medium text-white/85 sm:text-xs">{delivery.firstReply ? "يرجى الانتظار، سيتم توصيلك بالموظف…" : "جاري متابعة رسالتك…"}</p>\n                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] text-white/42">\n                            <span>{delivery.queueAhead > 0 ? `أمامك ${new Intl.NumberFormat("ar-JO").format(delivery.queueAhead)} محادثات` : "أنت التالي"}</span>\n                            <span className="text-white/18">•</span>\n                            <span>الوقت المتوقع: {waitTimeLabel(deliveryRemainingSeconds)}</span>\n                          </div>\n                          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.055]">\n                            <div className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-amber-300 transition-[width] duration-1000 ease-linear" style={{ width: `${queueProgress}%` }} />\n                          </div>\n                        </div>\n                      </div>\n                    </div>\n                  </div>\n                ) : null}\n\n                {(typingVisible || deliveryTyping) ? (',
    "queue card and delayed typing",
  ],
  [
    '                disabled={sending}\n                rows={1}',
    '                disabled={sending}\n                rows={1}',
    "textarea remains draftable while queued",
  ],
  [
    '                placeholder={connection === "offline" ? "الاتصال غير متوفر…" : "اكتب رسالتك…"}',
    '                placeholder={connection === "offline" ? "الاتصال غير متوفر…" : deliveryPending ? "اكتب رسالتك التالية… وسيُتاح إرسالها بعد وصول الرد" : "اكتب رسالتك…"}',
    "queued draft placeholder",
  ],
  [
    '                disabled={sending || !message.trim() || connection === "offline"}',
    '                disabled={sending || deliveryPending || !message.trim() || connection === "offline"}',
    "disable send while queued",
  ],
]);

console.log("WEB CHAT DELIVERY QUEUE PATCH: PASS");
