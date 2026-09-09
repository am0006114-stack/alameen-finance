import { normalizeArabic } from "./text";
import type { DialogueAct, InterpretedTurn, TopicKey } from "./types";

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The public tracking page sends a structured WhatsApp message that contains
 * labels such as "رقم الهاتف:". Those labels are application identifiers, not a
 * request for the company's phone number. Treat the whole template as an
 * application-status turn before any generic contact resolver sees it.
 */
export function structuredOrderStatusTemplateText(value: string | null | undefined) {
  const raw = String(value || "");
  const q = normalized(raw);
  const hasTracking = /\bAM-\d{8,}\b/i.test(raw);
  const hasPhoneField = /رقم\s*الهاتف\s*[:：]/i.test(raw) || /رقم\s+الهاتف\b/.test(q);
  const hasStatusField = /الحاله\s+الحاليه\s*[:：]/i.test(raw) || /الحاله\s+الحاليه\b/.test(q);
  const asksUpdate = /(?:ارغب|أرغب).{0,35}(?:اخر|آخر)\s+تحديث|(?:اخر|آخر)\s+تحديث|الخطوه\s+التاليه|متابعه\s+طلبي/.test(q);
  return hasTracking && hasPhoneField && (hasStatusField || asksUpdate);
}

export function explicitOrderStatusRequestText(value: string | null | undefined) {
  const q = normalized(value);
  if (!q) return false;
  return structuredOrderStatusTemplateText(value)
    || /(?:اريد|أريد|بدي|حاب|حابب|ارغب|أرغب).{0,28}(?:متابعه|متابعة).{0,18}(?:طلبي|الطلب)|(?:متابعه|متابعة)\s+(?:طلبي|الطلب)|(?:اخر|آخر)\s+تحديث.{0,30}(?:طلبي|الطلب)?|(?:شو\s+صار|وين\s+وصل|شو\s+وضع|ما\s+هو\s+وضع).{0,24}(?:طلبي|الطلب)|(?:حاله|حالة)\s+(?:طلبي|الطلب)|(?:الخطوه|الخطوة)\s+(?:التاليه|التالية).{0,30}(?:طلبي|الطلب|الملف)?/.test(q);
}

/**
 * Contact intent must contain an actual communication request. Bare labels or
 * identifiers such as "رقم الهاتف: 079..." are deliberately excluded.
 */
export function explicitContactRequestText(value: string | null | undefined) {
  const raw = String(value || "");
  const q = normalized(raw);
  if (!q) return false;

  if (structuredOrderStatusTemplateText(raw)
      && !/(?:كيف\s+ارن|كيف\s+اتصل|كيف\s+اتواصل|بدي\s+اتصل|بدي\s+احكي\s+تلفون|في\s+رقم\s+(?:اتصل|ارن|احكي)|ما\s*في\s+رقم\s+(?:اتصل|ارن|احكي)|اعطيني\s+رقم(?:كم)?|أعطيني\s+رقم(?:كم)?|شو\s+رقمكم|رقمكم\s+شو|رنوا\s+علي|اتصلوا\s+في|مكالمه|مكالمة)/.test(q)) {
    return false;
  }

  return /(?:كيف\s+(?:ارن|اتصل|اتواصل)|(?:بدي|اريد|أريد|حاب|حابب)\s+(?:اتصل|ارن|أرن|احكي\s+تلفون)|(?:في|فيه|عندكم|ما\s*في|مافي)\s+رقم\s+(?:اتصل|ارن|أرن|احكي|تواصل)|(?:اعطيني|أعطيني)\s+(?:رقمكم|رقم\s+(?:تواصل|اتصال|هاتف|واتساب))|شو\s+رقمكم|رقمكم\s+شو|(?:رنوا|اتصلوا|احكوا)\s+(?:علي|في)|(?:بدي|اريد|أريد)\s+مكالمه|مكالمة|مكالمه)/.test(q)
    || /^(?:رقم\s*(?:تواصل|اتصال|هاتف|واتساب)(?:\s+الشركه|\s+الشركة)?|رقمكم)(?:\s+لو\s+سمحت)?$/.test(q);
}

function addResolvedAct(turn: InterpretedTurn, topic: TopicKey, value: string): DialogueAct {
  return {
    id: `${turn.turnId}:current-turn-authority:${topic}`,
    type: "ask",
    topic,
    text: turn.rawText,
    action: "none",
    value,
    confidence: 0.999,
    source: "resolved",
  };
}

/**
 * Current explicit meaning outranks stale conversation topics. This is a topic
 * authority layer, not another single-intent router: legitimate multi-topic
 * turns keep both topics when both are explicitly asked in the current text.
 */
export function enforceCurrentTurnAuthority(turn: InterpretedTurn): InterpretedTurn {
  const asksStatus = explicitOrderStatusRequestText(turn.rawText);
  const asksContact = explicitContactRequestText(turn.rawText);
  if (!asksStatus) return turn;

  let acts = [...turn.acts];
  let topics = [...turn.topics];
  let requestedActions = [...turn.requestedActions];

  if (!asksContact) {
    acts = acts.filter((act) => act.topic !== "call_request" && act.action !== "record_call_preference");
    topics = topics.filter((topic) => topic !== "call_request");
    requestedActions = requestedActions.filter((action) => action !== "record_call_preference");
  }

  if (!acts.some((act) => act.topic === "application_status")) {
    acts.push(addResolvedAct(turn, "application_status", structuredOrderStatusTemplateText(turn.rawText)
      ? "structured_tracking_status_request"
      : "explicit_current_order_status_request"));
  }
  if (!topics.includes("application_status")) topics.push("application_status");

  return {
    ...turn,
    acts: acts.filter((act) => !(act.topic === "unknown" && act.type === "unknown")),
    topics: Array.from(new Set(topics.filter((topic) => topic !== "unknown"))),
    requestedActions: Array.from(new Set(requestedActions)),
    confidence: Math.max(turn.confidence, 0.999),
    warnings: Array.from(new Set([...(turn.warnings || []), "current_turn_status_authority"])),
  };
}

export function currentTurnAuthorityKind(value: string | null | undefined) {
  const status = explicitOrderStatusRequestText(value);
  const contact = explicitContactRequestText(value);
  if (status && contact) return "status_and_contact" as const;
  if (status) return "application_status" as const;
  if (contact) return "contact" as const;
  return "other" as const;
}

export function replyMisalignedWithCurrentTurn(input: { turn: InterpretedTurn; reply: string | null | undefined }) {
  const reply = normalized(input.reply);
  if (!reply) return false;
  if (explicitOrderStatusRequestText(input.turn.rawText) && !explicitContactRequestText(input.turn.rawText)) {
    const contactReply = /(?:المتابعه\s+الاساسيه|المتابعة\s+الأساسية).{0,45}(?:واتساب)|(?:رقم\s+هاتف\s+اضافي|رقم\s+هاتف\s+إضافي|رقم\s+غير\s+موثق|قناه\s+تواصل\s+اضافيه|قناة\s+تواصل\s+إضافية)/.test(reply);
    const statusAnswer = /(?:حاله\s+طلبك|حالة\s+طلبك|الحاله\s+الان|الحالة\s+الآن|قيد\s+الدراسه|قيد\s+الدراسة|قيد\s+المراجعه|قيد\s+المراجعة|موافقه\s+مبدئيه|موافقة\s+مبدئية|الاسترداد|ملغي|ملغى|رابط\s+التتبع|AM-\d{8,})/i.test(String(input.reply || ""));
    return contactReply && !statusAnswer;
  }
  return false;
}
