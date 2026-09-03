import type { ActionKey, ConversationState, DialogueAct, DialogueActType, InterpretedTurn, TopicKey } from "./types";
import { interpretTurn } from "./interpreter";
import type { V3TextProvider } from "./provider";
import { normalizeArabic } from "./text";

const TOPICS: TopicKey[] = [
  "greeting","thanks","acknowledgement","unknown","application_status","application_correction","requirements","guarantor",
  "products","device_change","device_recalculation","product_price","payment_fee","payment_method","payment_timing","payment_recipient","payment_status","payment_confirmation",
  "receipt_upload","first_installment","installment_amount","installment_duration","delivery","office_location","appointment",
  "review_timing","operational_pressure","refund","cancellation","continuation","reopen","complaint","trust","legal","social_threat","abuse","human_request",
  "manager_request","call_request","repair","correction","website","tracking"
];

const ACTIONS: ActionKey[] = [
  "none","cancel_application","continue_application","request_refund","stop_refund","change_application_data","change_device",
  "generate_secure_upload_link","generate_receipt_link","reopen_application","switch_ai_role","record_call_preference"
];

const ACT_TYPES: DialogueActType[] = [
  "ask","request_action","confirm","deny","correct","provide_fact","provide_reason","repair_request","acknowledge","greet",
  "thank","complaint","request_role","unknown"
];

type ModelAct = {
  type?: unknown;
  topic?: unknown;
  text?: unknown;
  action?: unknown;
  value?: unknown;
  confidence?: unknown;
};

type ModelInterpretation = {
  acts?: ModelAct[];
  sentiment?: unknown;
  urgency?: unknown;
  explicitRoleRequest?: unknown;
  warnings?: unknown;
};

function clampConfidence(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.7;
  return Math.max(0, Math.min(1, n));
}

function jsonFromText(text: string): ModelInterpretation {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("model_interpreter_json_missing");
  return JSON.parse(raw.slice(start,end+1)) as ModelInterpretation;
}

function modelPrompt(input: { customerText: string; state: ConversationState; recentTurns?: string[]; deterministic: InterpretedTurn }) {
  return `حلّل رسالة عميل للأمين للأقساط كدور فهم فقط، وليس كتابة رد.

أعد JSON فقط بالشكل:
{
  "acts":[{"type":"ask","topic":"application_status","action":"none","value":null,"confidence":0.9}],
  "sentiment":"calm|confused|frustrated|angry",
  "urgency":"normal|urgent",
  "explicitRoleRequest":"manager|staff|tala|fadwa|abdullah|abdulrahman|omran|null",
  "warnings":[]
}

قواعد:
- الرسالة قد تحتوي أكثر من فعل/سؤال. استخرج كل الأفعال المادية.
- اربط "هيك/هاذ/الرسوم*/ماعندي/طيب/كيف يعني" بالسياق والـopen loops عندما يكون المرجع واضحًا.
- لا تحول سبب الإلغاء إلى طلب دفع أو استمرار.
- لا تعتبر سؤال "بقدر ألغي؟" تنفيذ إلغاء.
- request_action فقط إذا طلب العميل تنفيذ الفعل صراحة.
- طلب موظف = human_request + switch_ai_role، لكنه لا يعني وجود إنسان؛ النظام نفسه يكمل.
- طلب المدير = manager_request + switch_ai_role.
- الإلغاء/الاسترداد/التراجع/إعادة الفتح/تعديل الطلب/تغيير الجهاز هي عمليات يشرف عليها عمران AI فقط. لا تحوّلها لإنسان.
- إذا قال العميل إنه دفع، استخرج payment_confirmation كحقيقة يدعيها العميل، ولا تعتبر الدفع confirmed ولا تنشئ أي فعل يؤكد الدفع.
- عند تغيير الجهاز، ضع وصف الموديل المطلوب في value كما قاله العميل.
- عند تصحيح بيانات الطلب، ضع في value وصفًا مركزًا للتصحيح والرقم/القيمة الجديدة إن كانت واضحة.
- لا تخترع tracking أو هاتف أو حالة طلب.
- لا تضف موضوعًا بلا دليل لغوي أو سياقي معقول.
- confidence أقل من 0.55 إذا كنت غير متأكد.

TOPICS_ALLOWED=${JSON.stringify(TOPICS)}
ACTIONS_ALLOWED=${JSON.stringify(ACTIONS)}
ACT_TYPES_ALLOWED=${JSON.stringify(ACT_TYPES)}

STATE=${JSON.stringify({
    currentTopic: input.state.currentTopic,
    pendingAction: input.state.pendingAction,
    role: input.state.role,
    openLoops: input.state.openLoops.filter(x=>x.state==="open").slice(-12),
    facts: input.state.facts.slice(-20),
    lastCustomerText: input.state.lastCustomerText,
    lastAssistantText: input.state.lastAssistantText
  })}

RECENT=${JSON.stringify(input.recentTurns || [])}

DETERMINISTIC_ANCHOR=${JSON.stringify(input.deterministic)}

CUSTOMER_MESSAGE=${JSON.stringify(input.customerText)}`;
}

function signature(a: Pick<DialogueAct,"type"|"topic"|"action"|"value">) {
  return `${a.type}|${a.topic}|${a.action || "none"}|${a.value || ""}`;
}

function validRole(v: unknown): InterpretedTurn["explicitRoleRequest"] {
  const s = String(v ?? "");
  if (["manager","staff","tala","fadwa","abdullah","abdulrahman","omran"].includes(s)) return s as InterpretedTurn["explicitRoleRequest"];
  return null;
}


function resolveContextualStatusFollowup(turn: InterpretedTurn, state: ConversationState, customerText: string): InterpretedTurn {
  const n = normalizeArabic(customerText).replace(/[؟?!.,،]/g, " ").replace(/\s+/g," ").trim();
  const statusConfirm = /^(?:متاكد|متأكد|اكيد|أكيد|صح|صحيح|يعني|جد|عنجد)(?:\s|$)/.test(n);
  if (!statusConfirm || state.currentTopic !== "application_status") return turn;
  if (turn.acts.some((a) => a.topic === "application_status")) return turn;
  const act: DialogueAct = {
    id: `${turn.turnId}:resolved-status-followup`,
    type: "ask",
    topic: "application_status",
    text: customerText,
    action: "none",
    value: "confirm_current_application_status",
    confidence: 0.995,
    source: "resolved",
  };
  return {
    ...turn,
    acts: [...turn.acts.filter((a) => !(a.topic === "unknown" && a.type === "unknown")), act],
    topics: Array.from(new Set([...turn.topics.filter((x) => x !== "unknown"), "application_status"])),
    confidence: Math.max(turn.confidence, 0.995),
  };
}

function enrichOperationalActs(turn: InterpretedTurn, customerText: string): InterpretedTurn {
  const q = normalizeArabic(customerText).replace(/[؟?!.,،]/g, " ").replace(/\s+/g, " ").trim();
  const additions: Array<{ topic: TopicKey; type?: DialogueActType; value?: string | null }> = [];
  if (/(?:متى|امتى|ايمتى|موعد).{0,30}(?:اجي|أجي|استلم)|(?:اجي|أجي).{0,30}(?:استلم|موعد)/.test(q)) additions.push({ topic: "appointment", type: "ask", value: "pickup_time" });
  if (/(?:وين|اين|أين).{0,24}(?:استلم|اجي|أجي)|(?:موقع|عنوان).{0,20}(?:المكتب|الاستلام)/.test(q)) additions.push({ topic: "office_location", type: "ask", value: "pickup_location" });
  if (/(?:كم|قديش|شو).{0,20}(?:قسط|القسط)|(?:القسط|قسطه|قسطو).{0,20}(?:كم|قديش)/.test(q)) additions.push({ topic: "device_recalculation", type: "ask", value: "installment_amount" });
  if (/(?:رقم\s*(?:تواصل|اتصال|هاتف|واتساب)|مكالمة|اتصل\s+عليكم)/.test(q)) additions.push({ topic: "call_request", type: "ask", value: "official_contact" });
  if (/(?:الجهاز|التلفون|الموبايل).{0,25}(?:جديد|بالكرتونه|بالكرتونة|مختوم)|(?:جديد|بالكرتونه|بالكرتونة|مختوم).{0,25}(?:الجهاز|التلفون|الموبايل)/.test(q)) additions.push({ topic: "products", type: "ask", value: "product_condition" });
  if (/(?:خمس|5|٥)\s*(?:دنانير|دينار)|رسوم\s*فتح\s*الملف|بدون\s*(?:خمس|5|٥)|ما\s*بتفتحو[^\n]{0,30}(?:خمس|5|٥)/.test(q)) additions.push({ topic: "payment_fee", type: "ask", value: "fee_policy" });
  if (!additions.length) return turn;

  const acts = [...turn.acts];
  const topics = new Set(turn.topics);
  for (const add of additions) {
    if (acts.some((a) => a.topic === add.topic && a.value === add.value)) continue;
    acts.push({
      id: `${turn.turnId}:enriched:${add.topic}`,
      type: add.type || "ask",
      topic: add.topic,
      text: customerText,
      action: "none",
      value: add.value || null,
      confidence: 0.995,
      source: "resolved",
    });
    topics.add(add.topic);
  }
  return { ...turn, acts, topics: Array.from(topics), confidence: Math.max(turn.confidence, 0.995) };
}

const ACTION_TOPIC: Partial<Record<ActionKey,TopicKey>> = {
  cancel_application: "cancellation",
  continue_application: "continuation",
  request_refund: "refund",
  stop_refund: "refund",
  change_application_data: "application_correction",
  change_device: "device_change",
  reopen_application: "reopen",
};

function resolvePendingConfirmation(turn: InterpretedTurn, state: ConversationState, customerText: string): InterpretedTurn {
  const pending = state.pendingAction;
  if (!pending || !ACTION_TOPIC[pending]) return turn;
  // An explicit new deterministic mutation supersedes any old pending action.
  if (turn.acts.some(a => a.source === "deterministic" && a.type === "request_action" && a.action && a.action !== "none")) return turn;

  const n = normalizeArabic(customerText).replace(/[؟?!.,،]/g, " ").replace(/\s+/g," ").trim();
  const pendingMode = String(state.pendingActionPayload?._manualStatus || "");
  const cancelReapplyConfirmation = pending === "cancel_application" && pendingMode === "awaiting_customer_cancel_confirmation";
  // Cancel+reapply is a destructive recommendation, so a generic "تمام" is not
  // enough. Require the customer's reply itself to explicitly contain cancellation.
  const yes = cancelReapplyConfirmation
    ? /(?:^|\s)(?:الغي|الغاء|إلغاء|الغيه|ألغيه|الغو|ألغوا)(?:\s|$)/.test(n)
    : /^(?:نعم|اه|اها|ايوه|ايوا|اوك|اوكي|تمام|موافق|اكد|اكدها|نفذ|نفذها|اعتمد|اعتمدها)(?:\s|$)/.test(n);
  const no = /^(?:لا|لأ|مش|لا خلاص|تراجعت)(?:\s|$)/.test(n);
  if (!yes && !no) return turn;

  const topic = ACTION_TOPIC[pending] as TopicKey;
  const act: DialogueAct = yes ? {
    id: `${turn.turnId}:resolved-confirm`,
    type: "request_action",
    topic,
    text: customerText,
    action: pending,
    value: state.pendingActionPayload?.requestedValue == null ? null : String(state.pendingActionPayload.requestedValue),
    confidence: 0.995,
    source: "resolved",
  } : {
    id: `${turn.turnId}:resolved-deny`,
    type: "deny",
    topic,
    text: customerText,
    action: "none",
    value: "pending_action_declined",
    confidence: 0.995,
    source: "resolved",
  };
  const acts = [...turn.acts.filter(a=>!(a.topic === "unknown" && a.type === "unknown")),act];
  return {
    ...turn,
    acts,
    topics: Array.from(new Set([...turn.topics.filter(x=>x!=="unknown"),topic])),
    requestedActions: yes ? Array.from(new Set([...turn.requestedActions,pending])) : turn.requestedActions.filter(a=>a!==pending),
    confidence: Math.max(turn.confidence,0.995),
  };
}

export async function interpretTurnWithAi(input: {
  turnId: string;
  customerText: string;
  state: ConversationState;
  recentTurns?: string[];
  provider?: V3TextProvider | null;
}): Promise<{ turn: InterpretedTurn; modelUsed: boolean; modelError: string | null }> {
  const deterministicBase = interpretTurn({ turnId: input.turnId, customerText: input.customerText });
  const contextual = resolveContextualStatusFollowup(deterministicBase,input.state,input.customerText);
  const deterministic = enrichOperationalActs(resolvePendingConfirmation(contextual,input.state,input.customerText), input.customerText);
  if (!input.provider) return { turn: deterministic, modelUsed: false, modelError: null };

  try {
    const generated = await input.provider.generate({
      system: "أنت محلل محادثات صارم. أخرج JSON فقط ولا تكتب ردًا للعميل.",
      user: modelPrompt({ customerText: input.customerText, state: input.state, recentTurns: input.recentTurns, deterministic }),
      temperature: 0,
      maxTokens: 1200,
    });
    const parsed = jsonFromText(generated);
    const merged = [...deterministic.acts];
    const seen = new Set(merged.map(signature));

    for (const candidate of Array.isArray(parsed.acts) ? parsed.acts : []) {
      const type = String(candidate.type || "") as DialogueActType;
      const topic = String(candidate.topic || "") as TopicKey;
      const action = String(candidate.action || "none") as ActionKey;
      const confidence = clampConfidence(candidate.confidence);
      if (!ACT_TYPES.includes(type) || !TOPICS.includes(topic) || !ACTIONS.includes(action) || confidence < 0.55) continue;
      if (action !== "none" && !["request_action","request_role","ask"].includes(type)) continue;
      const act: DialogueAct = {
        id: `${input.turnId}:m${merged.length + 1}`,
        type,
        topic,
        text: String(candidate.text || input.customerText || ""),
        action,
        value: candidate.value == null ? null : String(candidate.value),
        confidence,
        source: "model",
      };
      const sig = signature(act);
      if (!seen.has(sig)) {
        seen.add(sig);
        merged.push(act);
      }
    }

    const topics = Array.from(new Set(merged.map(a=>a.topic)));
    const requestedActions = Array.from(new Set(merged.map(a=>a.action || "none").filter(a=>a!=="none"))) as ActionKey[];
    const explicitRoleRequest = validRole(parsed.explicitRoleRequest) || deterministic.explicitRoleRequest;
    const sentiment = ["calm","confused","frustrated","angry"].includes(String(parsed.sentiment))
      ? parsed.sentiment as InterpretedTurn["sentiment"] : deterministic.sentiment;
    const urgency = ["normal","urgent"].includes(String(parsed.urgency))
      ? parsed.urgency as InterpretedTurn["urgency"] : deterministic.urgency;
    const warnings = Array.from(new Set([
      ...deterministic.warnings,
      ...(Array.isArray(parsed.warnings) ? parsed.warnings.map(String).slice(0,12) : []),
    ]));

    return {
      turn: enrichOperationalActs({
        ...deterministic,
        acts: merged,
        topics,
        requestedActions,
        explicitRoleRequest,
        sentiment,
        urgency,
        confidence: Math.max(deterministic.confidence, merged.length ? Math.min(0.99, merged.reduce((s,a)=>s+a.confidence,0)/merged.length) : 0),
        warnings,
      }, input.customerText),
      modelUsed: true,
      modelError: null,
    };
  } catch (error) {
    return {
      turn: { ...deterministic, warnings: [...deterministic.warnings, "model_interpreter_failed"] },
      modelUsed: true,
      modelError: error instanceof Error ? error.message : "model_interpreter_failed",
    };
  }
}
