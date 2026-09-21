import type { ActionKey, ConversationState, DialogueAct, DialogueActType, InterpretedTurn, SemanticTurnFrame, TopicKey } from "./types";
import { interpretTurn } from "./interpreter";
import type { V3TextProvider } from "./provider";
import { normalizeArabic } from "./text";
import { explicitContactRequestText } from "./currentTurnAuthority";

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

type ModelSemanticEntity = {
  surface?: unknown; kind?: unknown; role?: unknown; knownFactStatus?: unknown; countryHint?: unknown; confidence?: unknown;
};

type ModelSemantic = {
  meaningSummary?: unknown;
  customerGoal?: unknown;
  currentQuestion?: unknown;
  answerObligations?: unknown;
  references?: unknown;
  entities?: ModelSemanticEntity[];
  decision?: any;
  correctionOfPrevious?: unknown;
  socialClosure?: unknown;
  requiresExternalFact?: unknown;
  externalFactNeeded?: unknown;
  answerMode?: unknown;
  confidence?: unknown;
  warnings?: unknown;
};

type ModelInterpretation = {
  acts?: ModelAct[];
  sentiment?: unknown;
  urgency?: unknown;
  explicitRoleRequest?: unknown;
  warnings?: unknown;
  semantic?: ModelSemantic;
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
  "warnings":[],
  "semantic":{
    "meaningSummary":"المعنى البشري النهائي للرسالة أو دفعة الرسائل",
    "customerGoal":"ما الذي يحاول العميل إنجازه الآن أو null",
    "currentQuestion":"السؤال الحالي بصياغة واضحة أو null",
    "answerObligations":["كل نقطة مادية يجب أن يجيب عنها الرد"],
    "references":[{"surface":"منها","refersTo":"محفظة سويس","confidence":0.96}],
    "entities":[{"surface":"محفظة سويس","kind":"wallet_or_payment_app","role":"source_payment_instrument","knownFactStatus":"unknown","countryHint":"unknown","confidence":0.9}],
    "decision":{"continuation":"confirmed|declined|deferred|conditional|unknown","cancellation":"requested|question|declined|unknown","refund":"requested|question|unknown","aliasConfirmation":"confirmed|declined|unknown","condition":null},
    "correctionOfPrevious":false,
    "socialClosure":false,
    "requiresExternalFact":false,
    "externalFactNeeded":null,
    "answerMode":"direct|grounded_reasoning|clarify|social",
    "confidence":0.9,
    "warnings":[]
  }
}

قواعد:
- الرسالة قد تحتوي أكثر من فعل/سؤال. استخرج كل الأفعال المادية.
- **منطقة العمل الأردن**. افهم اللهجة والأسماء ضمن سياق الأردن، لكن لا تخترع أن خدمة/محفظة/بنك معين موجود أو غير موجود إذا لم تكن لديك حقيقة موثقة.
- إذا ظهر اسم غير مألوف مثل «محفظة سويس»، لا تستبدله تلقائيًا بـZain Cash أو بنك أو كشف راتب. استنتج **دوره النحوي والوظيفي** في السؤال: هنا هو أداة/محفظة يريد العميل أن يبدأ منها تحويل رسوم الملف. صنّفه entity غير موثقة، وافصل فهم السؤال عن معرفة توافق الخدمة.
- فرّق بين **مصدر التحويل** و**وجهة التحويل**. سؤال «بقدر أبعت من محفظتي؟» بعد إعطاء بيانات رسوم الملف هو سؤال interoperability/طريقة دفع، وليس سؤال إثبات دخل.
- CURRENT MESSAGE/BURST أعلى سلطة في المعنى من أي state أو topic قديم. السياق القديم يساعد على حل المرجع فقط، ولا يجوز أن يبتلع السؤال الجديد.
- «بس يطلع القرار بزبط أو لا بستمر» = continuation deferred/conditional، **وليس** اختيار استمرار الآن. لا تنشئ continue_application في هذه الحالة.
- «تمام/إن شاء الله/شكراً» بدون سؤال أو طلب جديد = socialClosure=true. أما إذا معها سؤال أو فقاعة لاحقة مادية فليست closure.
- املأ semantic.currentQuestion وanswerObligations بالمعنى النهائي بعد دمج كل الفقاعات، حتى لو intent التقليدي غير واضح.
- إذا العميل يصحح فهمنا («قصدي رسوم فتح الملف») اجعل correctionOfPrevious=true والسؤال المصحح هو الحاكم.
- اربط "هيك/هاذ/الرسوم*/ماعندي/طيب/كيف يعني" بالسياق والـopen loops عندما يكون المرجع واضحًا.
- لا تحول سبب الإلغاء إلى طلب دفع أو استمرار.
- لا تعتبر سؤال "بقدر ألغي؟" تنفيذ إلغاء.
- request_action فقط إذا طلب العميل تنفيذ الفعل صراحة.
- طلب موظف = human_request + switch_ai_role، لكنه لا يعني وجود إنسان؛ النظام نفسه يكمل.
- طلب المدير = manager_request + switch_ai_role.
- الإلغاء/الاسترداد/التراجع/إعادة الفتح/تعديل الطلب/تغيير الجهاز هي عمليات يشرف عليها عمران AI فقط. لا تحوّلها لإنسان.
- إذا قال العميل إنه دفع، استخرج payment_confirmation كحقيقة يدعيها العميل، ولا تعتبر الدفع confirmed ولا تنشئ أي فعل يؤكد الدفع.
- صيغة الأمر العامية مثل «رجعو المصاري»، «رجعوا الخمس»، «ردوا الرسوم» أو «بدي ترجعولي المصاري» هي request_action لموضوع refund مع action=request_refund، وليست payment أو loan. السؤال عن سياسة الاسترداد فقط يبقى ask بدون تنفيذ.
- «بطلت ألغي»، «ما بدي ألغي»، «إلغاء طلب الإلغاء» أو «تراجعت عن الإلغاء» تعني تراجعًا عن الإلغاء/طلب إعادة فتح، وليست طلب إلغاء جديدًا. استخدم reopen + reopen_application عندما لا تكون مجرد رفض لتأكيد pending action.
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
    lastAssistantText: input.state.lastAssistantText,
    semanticMemory: input.state.semanticMemory ? {
      activeGoal: input.state.semanticMemory.activeGoal,
      activeQuestion: input.state.semanticMemory.activeQuestion,
      lastMeaningSummary: input.state.semanticMemory.lastMeaningSummary,
      continuationDecision: input.state.semanticMemory.continuationDecision,
      continuationCondition: input.state.semanticMemory.continuationCondition,
      entries: input.state.semanticMemory.entries.slice(-20),
      episodes: input.state.semanticMemory.episodes.slice(-8)
    } : null
  })}

RECENT=${JSON.stringify(input.recentTurns || [])}

DETERMINISTIC_ANCHOR=${JSON.stringify(input.deterministic)}

CUSTOMER_MESSAGE=${JSON.stringify(input.customerText)}`;
}


function str(v: unknown, max = 420) {
  const value = String(v ?? "").replace(/\s+/g, " ").trim();
  return value ? (value.length > max ? `${value.slice(0,max).trim()}…` : value) : null;
}

function bool(v: unknown) { return v === true || String(v).toLowerCase() === "true"; }

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = String(v ?? "") as T;
  return allowed.includes(s) ? s : fallback;
}

function semanticFrame(parsed: ModelInterpretation, customerText: string): SemanticTurnFrame | null {
  const semantic = parsed.semantic;
  if (!semantic) return null;
  const entityKinds = ["person","device","wallet_or_payment_app","bank","company","location","document","amount","date","other"] as const;
  const knownStates = ["known","unknown","customer_claim"] as const;
  const entities = (Array.isArray(semantic.entities) ? semantic.entities : []).slice(0,16).map((entity) => ({
    surface: str(entity.surface, 120) || "",
    kind: oneOf(entity.kind, entityKinds, "other"),
    role: str(entity.role, 120),
    knownFactStatus: oneOf(entity.knownFactStatus, knownStates, "unknown"),
    countryHint: oneOf(entity.countryHint, ["JO","unknown"] as const, "unknown"),
    confidence: clampConfidence(entity.confidence),
  })).filter((entity) => entity.surface);
  const refs = Array.isArray(semantic.references) ? semantic.references.slice(0,12).map((ref:any) => ({
    surface: str(ref?.surface, 100) || "",
    refersTo: str(ref?.refersTo, 160),
    confidence: clampConfidence(ref?.confidence),
  })).filter((ref:any) => ref.surface) : [];
  const decision = semantic.decision || {};
  const obligations = Array.isArray(semantic.answerObligations) ? semantic.answerObligations.map((x) => str(x,260)).filter(Boolean).slice(0,10) as string[] : [];
  return {
    meaningSummary: str(semantic.meaningSummary, 420) || str(customerText, 420) || "",
    customerGoal: str(semantic.customerGoal, 260),
    currentQuestion: str(semantic.currentQuestion, 420),
    answerObligations: obligations,
    references: refs,
    entities,
    decision: {
      continuation: oneOf(decision.continuation, ["confirmed","declined","deferred","conditional","unknown"] as const, "unknown"),
      cancellation: oneOf(decision.cancellation, ["requested","question","declined","unknown"] as const, "unknown"),
      refund: oneOf(decision.refund, ["requested","question","unknown"] as const, "unknown"),
      aliasConfirmation: oneOf(decision.aliasConfirmation, ["confirmed","declined","unknown"] as const, "unknown"),
      condition: str(decision.condition, 300),
    },
    correctionOfPrevious: bool(semantic.correctionOfPrevious),
    socialClosure: bool(semantic.socialClosure),
    requiresExternalFact: bool(semantic.requiresExternalFact),
    externalFactNeeded: str(semantic.externalFactNeeded, 300),
    answerMode: oneOf(semantic.answerMode, ["direct","grounded_reasoning","clarify","social"] as const, "direct"),
    confidence: clampConfidence(semantic.confidence),
    warnings: Array.isArray(semantic.warnings) ? semantic.warnings.map((x) => String(x)).slice(0,12) : [],
  };
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
  if (explicitContactRequestText(customerText)) additions.push({ topic: "call_request", type: "ask", value: "official_contact" });
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
  const n = normalizeArabic(customerText).replace(/[؟?!.,،]/g, " ").replace(/\s+/g," ").trim();
  const explicitCancelDecline = pending === "cancel_application" && /(?:بطلت|تراجعت).{0,14}(?:الغي|الغاء)|(?:ما\s+بدي|بديش).{0,12}(?:الغي|الغاء)|(?:الغاء|إلغاء).{0,10}(?:طلب\s+)?(?:الالغاء|الإلغاء)/.test(n);

  // A direct reversal of a pending cancellation is a denial of that pending action,
  // not a new reopen mutation. This must win before deterministic action supersession.
  if (!explicitCancelDecline && turn.acts.some(a => a.source === "deterministic" && a.type === "request_action" && a.action && a.action !== "none")) return turn;

  const pendingMode = String(state.pendingActionPayload?._manualStatus || "");
  const cancelReapplyConfirmation = pending === "cancel_application" && pendingMode === "awaiting_customer_cancel_confirmation";
  // Cancel+reapply is a destructive recommendation, so a generic "تمام" is not
  // enough. Require the customer's reply itself to explicitly contain cancellation.
  const yes = explicitCancelDecline
    ? false
    : cancelReapplyConfirmation
      ? /(?:^|\s)(?:الغي|الغاء|إلغاء|الغيه|ألغيه|الغو|ألغوا)(?:\s|$)/.test(n)
      : /^(?:نعم|اه|اها|ايوه|ايوا|اوك|اوكي|تمام|موافق|اكد|اكدها|نفذ|نفذها|اعتمد|اعتمدها)(?:\s|$)/.test(n);
  const no = explicitCancelDecline || /^(?:لا|لأ|مش|لا خلاص|تراجعت)(?:\s|$)/.test(n);
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
  const baseActs = turn.acts.filter(a => {
    if (a.topic === "unknown" && a.type === "unknown") return false;
    if (explicitCancelDecline && a.type === "request_action" && a.action === "reopen_application") return false;
    return true;
  });
  const acts = [...baseActs,act];
  return {
    ...turn,
    acts,
    topics: Array.from(new Set([
      ...turn.topics.filter((x) => x !== "unknown" && !(explicitCancelDecline && x === "reopen")),
      topic,
    ])),
    requestedActions: yes
      ? Array.from(new Set([...turn.requestedActions,pending]))
      : turn.requestedActions.filter(a=>a!==pending && !(explicitCancelDecline && a === "reopen_application")),
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
      maxTokens: 1800,
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

    const semantic = semanticFrame(parsed, input.customerText);
    return {
      turn: enrichOperationalActs({
        ...deterministic,
        acts: merged,
        topics,
        requestedActions,
        explicitRoleRequest,
        sentiment,
        urgency,
        confidence: Math.max(deterministic.confidence, semantic?.confidence || 0, merged.length ? Math.min(0.99, merged.reduce((s,a)=>s+a.confidence,0)/merged.length) : 0),
        warnings: Array.from(new Set([...warnings, ...(semantic?.warnings || [])])),
        semantic,
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
