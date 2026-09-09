import { applicationJourneyStage, type ApplicationJourneyStage } from "./applicationJourney";
import { normalizeArabic } from "./text";
import type { ConversationState, DialogueAct, InterpretedTurn, TopicKey, TruthBundle } from "./types";

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSpeakerPrefix(value: string) {
  return String(value || "")
    .replace(/^\s*(?:العميل|customer)\s*:\s*/i, "")
    .trim();
}

function isCustomerLine(value: string) {
  return /^\s*(?:العميل|customer)\s*:/i.test(String(value || ""));
}

function isAssistantLine(value: string) {
  return /^\s*(?:الأمين|الامين|assistant)\s*:/i.test(String(value || ""));
}

export type HumanFirstCustomerBurst = {
  messages: string[];
  combinedText: string;
  merged: boolean;
};

/**
 * Treat every consecutive customer message since the last assistant reply as one
 * human turn. WhatsApp users naturally send a thought across several bubbles;
 * stale-send suppression prevents duplicate replies, while this collector makes
 * the latest runtime understand the whole unanswered thought before planning.
 */
export function buildHumanFirstCustomerBurst(input: {
  customerText: string;
  recentTurns?: string[];
  maxMessages?: number;
  maxChars?: number;
}): HumanFirstCustomerBurst {
  const maxMessages = Math.max(1, input.maxMessages ?? 8);
  const maxChars = Math.max(200, input.maxChars ?? 1800);
  const current = String(input.customerText || "").trim();
  const suffix: string[] = [];

  for (let i = (input.recentTurns || []).length - 1; i >= 0; i--) {
    const line = String(input.recentTurns?.[i] || "").trim();
    if (!line) continue;
    if (isAssistantLine(line)) break;
    if (isCustomerLine(line)) suffix.unshift(stripSpeakerPrefix(line));
    if (suffix.length >= maxMessages) break;
  }

  if (current) {
    const nCurrent = normalized(current);
    const alreadyLast = suffix.length && normalized(suffix[suffix.length - 1]) === nCurrent;
    if (!alreadyLast) suffix.push(current);
  }

  const deduped: string[] = [];
  for (const message of suffix) {
    const clean = String(message || "").trim();
    if (!clean) continue;
    const n = normalized(clean);
    if (deduped.length && normalized(deduped[deduped.length - 1]) === n) continue;
    deduped.push(clean);
  }

  while (deduped.length > maxMessages) deduped.shift();
  while (deduped.join("\n").length > maxChars && deduped.length > 1) deduped.shift();

  const combinedText = deduped.join("\n").trim() || current;
  return { messages: deduped, combinedText, merged: deduped.length > 1 };
}

function addResolvedAct(turn: InterpretedTurn, input: {
  topic: TopicKey;
  type?: DialogueAct["type"];
  action?: DialogueAct["action"];
  value?: string | null;
  text?: string;
}) {
  const type = input.type || "ask";
  const action = input.action || "none";
  const exists = turn.acts.some((act) => act.topic === input.topic && act.type === type && (act.action || "none") === action);
  if (exists) return turn;

  const act: DialogueAct = {
    id: `${turn.turnId}:human-first:${input.topic}:${turn.acts.length + 1}`,
    type,
    topic: input.topic,
    text: input.text || turn.rawText,
    action,
    value: input.value ?? null,
    confidence: 0.995,
    source: "resolved",
  };
  return {
    ...turn,
    acts: [...turn.acts.filter((x) => !(x.topic === "unknown" && x.type === "unknown")), act],
    topics: Array.from(new Set([...turn.topics.filter((x) => x !== "unknown"), input.topic])),
    requestedActions: action !== "none" ? Array.from(new Set([...turn.requestedActions, action])) : turn.requestedActions,
    confidence: Math.max(turn.confidence, 0.995),
  };
}

/**
 * A small deterministic semantic hardener for real failures observed in full-day
 * traffic. It supplements the model; it is not a replacement single-intent router.
 */
export function enrichHumanFirstTurn(turn: InterpretedTurn): InterpretedTurn {
  const q = normalized(turn.rawText);
  let out = turn;

  const explicitCancel = /(?:^|\s)(?:و)?(?:بدي|اريد|حاب|حابب)\s+(?:الغي|الغاء)(?:\s+(?:الطلب|طلبي|المعامله|المعاملة))?(?:\s|$)|^(?:الغي|إلغاء|الغاء)\s*(?:الطلب|طلبي|المعامله|المعاملة)?$/m.test(q);
  if (explicitCancel) out = addResolvedAct(out, { topic: "cancellation", type: "request_action", action: "cancel_application", value: "explicit_customer_cancel_request" });

  const paidClaim = /(?:^|\s)(?:دفعت|حولت|دافع|تم\s+الدفع|رفعت\s+الوصل|بعثت\s+الوصل)(?:\s|$)/m.test(q);
  if (paidClaim) out = addResolvedAct(out, { topic: "payment_status", type: "provide_fact", value: "customer_claims_payment_or_receipt" });

  const noUpfrontInstallment = /(?:ما\s+بدي|مش\s+بدي|لا\s+اريد|لا\s+أريد).{0,35}(?:قسط\s+اولي|قسط\s+أولي|دفعه\s+اولي|دفعة\s+أولى|دفعة\s+اولي).{0,70}(?:شهري|شهريه|شهرية|القسط|الدفعات)|(?:كيف|شو|قديش|كم).{0,35}(?:الدفعه|الدفعة|القسط).{0,18}(?:الشهري|الشهرية|شهري)/.test(q);
  if (noUpfrontInstallment) {
    out = addResolvedAct(out, { topic: "first_installment", type: "ask", value: "no_upfront_payment_question" });
    out = addResolvedAct(out, { topic: "installment_amount", type: "ask", value: "monthly_installment_question" });
  }

  if (/(?:وين|اين|أين).{0,24}(?:موقعكم|موقع\s+الشركه|موقع\s+الشركة|الشركه\s+بالزبط|الشركة\s+بالزبط)|(?:موقعكم|موقع\s+الشركه|موقع\s+الشركة).{0,18}(?:وين|بالزبط|بالضبط)/.test(q)) {
    out = addResolvedAct(out, { topic: "office_location", type: "ask", value: "company_location" });
  }

  if (/(?:بعدها|بعد\s+هيك|وبعدها).{0,18}(?:شو\s+بصير|شو\s+يصير|شو\s+الاجراءات|شو\s+الإجراءات)|(?:بعد\s+ما).{0,25}(?:افتح\s+الملف|أفتح\s+الملف|ادفع|أدفع).{0,25}(?:شو\s+بصير|شو\s+الاجراءات|شو\s+الإجراءات)/.test(q)) {
    out = addResolvedAct(out, { topic: "application_status", type: "ask", value: "next_steps_after_current_step" });
  }

  if (/(?:متي|امتي|ايمتي).{0,35}(?:بتبلغوني|بتخبروني|تحكولي|القرار|النتيجه|تخلص\s+الدراسه)/.test(q)) {
    out = addResolvedAct(out, { topic: "review_timing", type: "ask", value: "when_customer_will_be_notified" });
  }

  return out;
}

const STALE_BY_STAGE: Partial<Record<ApplicationJourneyStage, Set<TopicKey>>> = {
  continuation_confirmed_fee_due: new Set(["continuation"]),
  payment_proof_pending_admin: new Set(["continuation", "payment_fee", "payment_method", "payment_recipient", "receipt_upload"]),
  payment_confirmed_under_review: new Set(["continuation", "payment_fee", "payment_method", "payment_recipient", "receipt_upload", "payment_confirmation"]),
  cancelled: new Set(["continuation", "payment_fee", "payment_method", "payment_recipient", "receipt_upload", "payment_confirmation"]),
  refund_requested: new Set(["continuation", "payment_fee", "payment_method", "payment_recipient", "receipt_upload", "payment_confirmation", "cancellation"]),
  refund_completed: new Set(["continuation", "payment_fee", "payment_method", "payment_recipient", "receipt_upload", "payment_confirmation", "cancellation", "refund"]),
};

function stageGoal(stage: ApplicationJourneyStage) {
  if (stage === "refund_requested") return "support_current_refund_journey";
  if (stage === "refund_completed") return "refund_completed_no_old_commercial_loops";
  if (stage === "cancelled") return "cancelled_application_no_old_continuation";
  if (stage === "payment_confirmed_under_review") return "final_review_after_confirmed_payment";
  if (stage === "payment_proof_pending_admin") return "payment_receipt_pending_admin_review";
  if (stage === "continuation_confirmed_fee_due") return "continuation_recorded_fee_step_current";
  return null;
}

/**
 * Newer authoritative journey truth supersedes stale conversational loops. Old
 * questions remain in the audit state but are marked cancelled, so they cannot
 * drag a later refund/cancellation turn back into continuation/payment.
 */
export function supersedeConversationStateForJourney(input: {
  state: ConversationState;
  truth: TruthBundle;
  turn: InterpretedTurn;
}): ConversationState {
  const stage = applicationJourneyStage(input.truth.application);
  const staleTopics = STALE_BY_STAGE[stage];
  const stamp = new Date().toISOString();
  if (!staleTopics?.size) return input.state;

  let pendingAction = input.state.pendingAction;
  let pendingActionPayload = input.state.pendingActionPayload;
  if (stage === "refund_requested") {
    if (["continue_application", "cancel_application", "request_refund"].includes(String(pendingAction || ""))) {
      pendingAction = null;
      pendingActionPayload = null;
    }
  } else if (stage === "refund_completed") {
    pendingAction = null;
    pendingActionPayload = null;
  } else if (stage === "cancelled") {
    if (["continue_application", "cancel_application"].includes(String(pendingAction || ""))) {
      pendingAction = null;
      pendingActionPayload = null;
    }
  } else if (["payment_confirmed_under_review", "payment_proof_pending_admin", "continuation_confirmed_fee_due"].includes(stage)) {
    if (pendingAction === "continue_application") {
      pendingAction = null;
      pendingActionPayload = null;
    }
  }

  const currentTopic = input.state.currentTopic && staleTopics.has(input.state.currentTopic)
    ? (stage.startsWith("refund") ? "refund" : stage === "cancelled" ? "cancellation" : "application_status")
    : input.state.currentTopic;

  const journeyFact = {
    key: "authoritative_journey_stage",
    value: stage,
    topic: stage.startsWith("refund") ? "refund" as const : stage === "cancelled" ? "cancellation" as const : "application_status" as const,
    source: "system" as const,
    confidence: 1,
    turnId: input.turn.turnId,
    updatedAt: stamp,
  };
  const facts = input.state.facts.filter((fact) => fact.key !== journeyFact.key);
  facts.push(journeyFact);

  return {
    ...input.state,
    currentTopic,
    currentGoal: stageGoal(stage) || input.state.currentGoal,
    openLoops: input.state.openLoops.map((loop) =>
      loop.state === "open" && staleTopics.has(loop.topic)
        ? { ...loop, state: "cancelled", updatedAt: stamp }
        : loop,
    ),
    facts: facts.slice(-120),
    pendingAction,
    pendingActionPayload,
    updatedAt: stamp,
  };
}

export function refundDataFormTroubleText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:ما\s*في|مافي|مش\s+ظاهر|ما\s+ظهر|ما\s+طلع|فاضي|فاضيه|فاضية).{0,45}(?:بيانات|حقول|شي|اشي|إشي|شيء|اثبته|أثبته|اثبت|أثبت)|(?:شو|وين|كيف).{0,25}(?:اثبت|أثبت|اثبته|أثبته).{0,25}(?:البيانات|بيانات\s+الاسترداد)|(?:الرابط|الصفحه|الصفحة).{0,30}(?:فاضي|فاضيه|فاضية|ما\s+في|مافي).{0,20}(?:بيانات|حقول|شي|اشي|إشي)?/.test(q);
}

function continuationLanguage(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:اود\s+الاستمرار|أود\s+الاستمرار|رغبتك\s+بالاستمرار|بدك\s+تكمل|اذا\s+بدك\s+نكمل|إذا\s+بدك\s+نكمل|خطوه\s+الاستمرار|خطوة\s+الاستمرار)/.test(q);
}

function paymentCollectionLanguage(value: string | null | undefined) {
  const raw = String(value || "");
  const q = normalized(raw);
  // Mentioning the historic 5 JOD fee is not by itself a regression (for example,
  // a refund question may legitimately refer to the amount). We block only an
  // instruction that tries to collect/re-collect payment or a receipt.
  return /(?:ارفع|ارفعلي|ابعث|ابعت|ارسل).{0,28}(?:الوصل|اثبات\s+الدفع)|(?:بيانات\s+التحويل|اسم\s+المستفيد|\/receipt\b)/i.test(raw)
    || /(?:cliq|كليك).{0,40}(?:حول|تحويل|معرف|alias|المستفيد)/i.test(raw)
    || /(?:ادفع|حول|حوّل|حوللي|حوّللي).{0,40}(?:رسوم\s+فتح\s+الملف|(?:5|٥)\s*(?:دنانير|دينار)|الخمسه|الخمسة)/.test(q);
}

export function journeyStageReplyRegression(reply: string | null | undefined, truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  if (["refund_requested", "refund_completed", "cancelled"].includes(stage)) {
    return continuationLanguage(reply) || paymentCollectionLanguage(reply);
  }
  if (["payment_proof_pending_admin", "payment_confirmed_under_review"].includes(stage)) {
    return continuationLanguage(reply) || paymentCollectionLanguage(reply);
  }
  if (stage === "continuation_confirmed_fee_due") return continuationLanguage(reply);
  return false;
}

export function buildJourneyLockRepairReply(input: {
  turn: InterpretedTurn;
  truth: TruthBundle;
}) {
  const stage = applicationJourneyStage(input.truth.application);
  const tracking = input.truth.application?.trackingId ? ` ${input.truth.application.trackingId}` : "";

  if (stage === "refund_requested") {
    if (refundDataFormTroubleText(input.turn.rawText)) {
      return "إذا رابط الاسترداد فتح عندك وما ظهر أي حقل أو بيانات للتثبيت، لا تعيد خطوة الاستمرار ولا تدفع أي مبلغ مرة ثانية. حدّث الصفحة مرة واحدة؛ وإذا ظلّت بدون حقول احكيلي هل الصفحة فاضية بالكامل ولا بتظهر رسالة خطأ، وبكمل معك على نفس مسار الاسترداد.";
    }
    return `طلب الاسترداد${tracking} مفتوح وقيد المعالجة. ما في داعي ترجع لخطوة الاستمرار أو الدفع؛ إذا سؤالك عن الاسترداد نفسه احكيلي شو ظاهر عندك وبكمل معك من هالمرحلة.`;
  }
  if (stage === "refund_completed") return `الاسترداد${tracking} مكتمل حسب الحالة الحالية. ما في خطوة استمرار أو دفع مرتبطة بهالطلب الآن.`;
  if (stage === "cancelled") return `الطلب${tracking} ملغي حاليًا، فما رح أرجعك لخطوة الاستمرار أو الدفع على نفس الحالة. إذا قصدك تعمل طلب جديد أو تسأل عن الاسترداد، بجاوبك حسب الحقيقة الموجودة على الملف.`;
  if (stage === "payment_confirmed_under_review") return "الدفع مؤكد إداريًا والملف مكمل بالدراسة النهائية. ما في داعي تعيد «أود الاستمرار» أو تدفع أو ترفع وصل جديد؛ بجاوبك من مرحلة الدراسة الحالية.";
  if (stage === "payment_proof_pending_admin") return "وصل الدفع موجود على الملف وبانتظار اعتماد الإدارة. ما في داعي تعيد «أود الاستمرار» أو تدفع أو ترفع الوصل مرة ثانية.";
  if (stage === "continuation_confirmed_fee_due") return "اختيار الاستمرار مسجل بالفعل. ما في داعي تعيد «أود الاستمرار»؛ بنكمل من خطوة فتح الملف الحالية حسب سؤالك.";
  return null;
}

export function humanFirstJourneyWriterContext(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
}) {
  const stage = applicationJourneyStage(input.truth.application);
  const stale = Array.from(STALE_BY_STAGE[stage] || []);
  return {
    authoritativeStage: stage,
    currentGoal: input.state.currentGoal,
    staleTopicsInvalidated: stale,
    mergedCustomerBurst: input.turn.rawText.includes("\n"),
    rule: "current_customer_meaning_and_authoritative_journey_beat_stale_open_loops",
  };
}
