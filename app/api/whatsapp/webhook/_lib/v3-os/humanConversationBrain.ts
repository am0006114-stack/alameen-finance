import type { V3TextProvider } from "./provider";
import type { CompactHumanMemory } from "./compactHumanMemory";
import type { ActionKey, ConversationState, InterpretedTurn, SemanticTurnFrame, TopicKey, TruthBundle } from "./types";
import { normalizeArabic } from "./text";
import { canonicalBusinessTruthForPrompt } from "./canonicalTruthManifest";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { resolveApplicationModificationRoute } from "./applicationModificationRouting";
import { roleDisplayName } from "./hierarchy";
import { personaWritingContract } from "./personas";

const TOPICS: TopicKey[] = [
  "greeting","thanks","acknowledgement","unknown","application_status","application_correction","requirements","guarantor",
  "products","device_change","device_recalculation","product_price","payment_fee","payment_method","payment_timing","payment_recipient","payment_status","payment_confirmation","receipt_upload",
  "first_installment","installment_amount","installment_duration","delivery","office_location","appointment","review_timing","operational_pressure",
  "refund","cancellation","continuation","reopen","complaint","trust","legal","social_threat","abuse","human_request","manager_request","call_request","repair","correction","website","tracking",
];
const ACTIONS: ActionKey[] = [
  "none","cancel_application","continue_application","request_refund","stop_refund","change_application_data","change_device","generate_secure_upload_link","generate_receipt_link","reopen_application","switch_ai_role","record_call_preference","link_whatsapp_alias",
];

export type HumanBrainMeaning = {
  meaningSummary: string;
  customerGoal: string | null;
  currentQuestion: string | null;
  answerObligations: string[];
  sentiment: "calm" | "confused" | "frustrated" | "angry";
  urgency: "normal" | "urgent";
  topics: TopicKey[];
  requestedActions: ActionKey[];
  continuation: "confirmed" | "declined" | "deferred" | "conditional" | "unknown";
  cancellation: "requested" | "question" | "declined" | "unknown";
  refund: "requested" | "question" | "unknown";
  condition: string | null;
  correctionOfPrevious: boolean;
  socialClosure: boolean;
  requiresHumanReview: boolean;
  humanReviewReason: string | null;
  reply: string | null;
  confidence: number;
};

export type HumanBrainResult = {
  turn: InterpretedTurn;
  meaning: HumanBrainMeaning;
  raw: string | null;
  modelUsed: boolean;
  modelError: string | null;
};

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function safeArray(value: unknown, max = 10) {
  return Array.isArray(value) ? value.map(safeString).filter((x): x is string => Boolean(x)).slice(0, max) : [];
}
function clamp(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.8;
}
function jsonObject(raw: string) {
  const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("human_brain_json_missing");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}
function safeTopic(value: unknown): TopicKey | null {
  const s = String(value || "") as TopicKey;
  return TOPICS.includes(s) ? s : null;
}
function safeAction(value: unknown): ActionKey | null {
  const s = String(value || "") as ActionKey;
  return ACTIONS.includes(s) ? s : null;
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(String(value) as T) ? String(value) as T : fallback;
}

function compactTruth(input: { truth: TruthBundle; state: ConversationState; anchor: InterpretedTurn; customerText: string }) {
  const { truth, state, anchor } = input;
  const app = truth.application;
  const safePreview = truth.contactAccess === "safe_preview";
  const links = buildOfficialLinkContext(anchor, truth);
  const paymentConfirmed = hasAuthoritativePaymentConfirmation(app);
  const stage = applicationJourneyStage(app);
  const application = app ? (safePreview ? {
    trackingId: app.trackingId,
    deviceName: app.deviceName,
    customerFacingStatus: customerFacingStatusLabel(app),
  } : {
    id: app.id,
    trackingId: app.trackingId,
    fullName: app.fullName,
    customerFacingStatus: customerFacingStatusLabel(app),
    paymentConfirmed,
    deviceName: app.deviceName,
    devicePrice: app.devicePrice,
    installmentMonths: app.installmentMonths,
    downPayment: app.downPayment,
    monthlyPayment: app.monthlyPayment,
    deliveryDelayUntil: app.deliveryDelayUntil,
    documents: app.documents,
  }) : null;

  return {
    confidence: truth.confidence,
    contactAccess: truth.contactAccess || "none",
    application,
    journey: {
      stage,
      customerFacingStatus: customerFacingStatusLabel(app),
      paymentConfirmed,
    },
    business: canonicalBusinessTruthForPrompt(),
    officialLinks: safePreview ? {
      relevant: { website: links.baseUrl, products: `${links.baseUrl}/products` },
      products: `${links.baseUrl}/products`,
      tracking: null,
      receipt: null,
      refund: null,
    } : {
      relevant: links.relevant,
      products: links.relevant.products || `${links.baseUrl}/products`,
      tracking: links.relevant.tracking || null,
      receipt: links.relevant.receipt || null,
      refund: links.relevant.refund || null,
    },
    modificationRouting: resolveApplicationModificationRoute({
      topics: anchor.topics,
      requestedActions: anchor.requestedActions,
      customerText: input.customerText,
      hasApplication: Boolean(app),
      paymentConfirmed,
      trackingId: app?.trackingId || null,
      registeredPhone: safePreview ? null : (app?.phone || null),
    }),
    stateContext: {
      pendingAction: state.pendingAction,
      activeTrackingId: state.activeTrackingId,
      currentRole: state.role.currentRole,
      employeeName: roleDisplayName(state.role.currentRole),
      employeeTier: state.role.tier,
    },
    degraded: Boolean(truth.degraded),
  };
}

function fallbackMeaning(anchor: InterpretedTurn): HumanBrainMeaning {
  return {
    meaningSummary: anchor.semantic?.meaningSummary || "رسالة العميل الحالية",
    customerGoal: anchor.semantic?.customerGoal || null,
    currentQuestion: anchor.semantic?.currentQuestion || null,
    answerObligations: anchor.semantic?.answerObligations || [],
    sentiment: anchor.sentiment,
    urgency: anchor.urgency,
    topics: anchor.topics,
    requestedActions: anchor.requestedActions,
    continuation: anchor.semantic?.decision.continuation || "unknown",
    cancellation: anchor.semantic?.decision.cancellation || "unknown",
    refund: anchor.semantic?.decision.refund || "unknown",
    condition: anchor.semantic?.decision.condition || null,
    correctionOfPrevious: Boolean(anchor.semantic?.correctionOfPrevious),
    socialClosure: Boolean(anchor.semantic?.socialClosure),
    requiresHumanReview: false,
    humanReviewReason: null,
    reply: null,
    confidence: anchor.confidence,
  };
}

function toMeaning(payload: Record<string, unknown>, anchor: InterpretedTurn): HumanBrainMeaning {
  const topics = safeArray(payload.topics, 12).map(safeTopic).filter((x): x is TopicKey => Boolean(x));
  const requestedActions = safeArray(payload.requestedActions, 8).map(safeAction).filter((x): x is ActionKey => Boolean(x && x !== "none"));
  const mergedTopics = Array.from(new Set([...anchor.topics, ...topics]));
  const mergedActions = Array.from(new Set([...anchor.requestedActions, ...requestedActions]));
  return {
    meaningSummary: safeString(payload.meaningSummary) || anchor.semantic?.meaningSummary || "رسالة العميل الحالية",
    customerGoal: safeString(payload.customerGoal),
    currentQuestion: safeString(payload.currentQuestion),
    answerObligations: safeArray(payload.answerObligations, 10),
    sentiment: enumValue(payload.sentiment, ["calm","confused","frustrated","angry"] as const, anchor.sentiment),
    urgency: enumValue(payload.urgency, ["normal","urgent"] as const, anchor.urgency),
    topics: mergedTopics,
    requestedActions: mergedActions,
    continuation: enumValue(payload.continuation, ["confirmed","declined","deferred","conditional","unknown"] as const, "unknown"),
    cancellation: enumValue(payload.cancellation, ["requested","question","declined","unknown"] as const, "unknown"),
    refund: enumValue(payload.refund, ["requested","question","unknown"] as const, "unknown"),
    condition: safeString(payload.condition),
    correctionOfPrevious: payload.correctionOfPrevious === true,
    socialClosure: payload.socialClosure === true,
    requiresHumanReview: payload.requiresHumanReview === true,
    humanReviewReason: safeString(payload.humanReviewReason),
    reply: safeString(payload.reply),
    confidence: clamp(payload.confidence),
  };
}

function semanticFrame(meaning: HumanBrainMeaning): SemanticTurnFrame {
  return {
    meaningSummary: meaning.meaningSummary,
    customerGoal: meaning.customerGoal,
    currentQuestion: meaning.currentQuestion,
    answerObligations: meaning.answerObligations,
    references: [],
    entities: [],
    decision: {
      continuation: meaning.continuation,
      cancellation: meaning.cancellation,
      refund: meaning.refund,
      aliasConfirmation: "unknown",
      condition: meaning.condition,
    },
    correctionOfPrevious: meaning.correctionOfPrevious,
    socialClosure: meaning.socialClosure,
    requiresExternalFact: false,
    externalFactNeeded: null,
    answerMode: meaning.currentQuestion ? "direct" : meaning.socialClosure ? "social" : "grounded_reasoning",
    confidence: meaning.confidence,
    warnings: [],
  };
}

function meaningToTurn(input: { meaning: HumanBrainMeaning; anchor: InterpretedTurn }): InterpretedTurn {
  const extraActs = input.meaning.requestedActions
    .filter((action) => !input.anchor.requestedActions.includes(action))
    .map((action, index) => ({
      id: `${input.anchor.turnId}:human:${index}`,
      type: "request_action" as const,
      topic: action === "cancel_application" ? "cancellation" as const
        : action === "request_refund" ? "refund" as const
        : action === "stop_refund" ? "refund" as const
        : action === "reopen_application" ? "reopen" as const
        : action === "continue_application" ? "continuation" as const
        : action === "change_device" ? "device_change" as const
        : "application_correction" as const,
      text: input.anchor.rawText,
      action,
      value: null,
      confidence: input.meaning.confidence,
      source: "model" as const,
    }));
  return {
    ...input.anchor,
    acts: [...input.anchor.acts, ...extraActs],
    topics: input.meaning.topics,
    requestedActions: input.meaning.requestedActions,
    sentiment: input.meaning.sentiment,
    urgency: input.meaning.urgency,
    confidence: Math.max(input.anchor.confidence, input.meaning.confidence),
    semantic: semanticFrame(input.meaning),
  };
}

function brainPrompt(input: {
  customerText: string;
  recentTurns: string[];
  memory: CompactHumanMemory;
  truth: TruthBundle;
  state: ConversationState;
  anchor: InterpretedTurn;
  maxPromptChars: number;
}) {
  const packet = {
    customerMessage: input.customerText,
    recentConversation: input.recentTurns,
    memory: input.memory,
    truth: compactTruth({ truth: input.truth, state: input.state, anchor: input.anchor, customerText: input.customerText }),
    context: {
      pendingAction: input.state.pendingAction,
      lastCustomerText: input.state.lastCustomerText,
      lastAssistantText: input.state.lastAssistantText,
      deterministicTopics: input.anchor.topics,
      deterministicActions: input.anchor.requestedActions,
    },
  };
  const employeeName = roleDisplayName(input.state.role.currentRole);
  const persona = personaWritingContract(employeeName);
  const khaledOverlay = (input.anchor.sentiment === "angry" || input.anchor.topics.includes("complaint") || input.anchor.topics.includes("social_threat"))
    ? personaWritingContract("خالد")
    : "";
  const instructions = `أنت ${employeeName} من فريق الأمين للأقساط داخل Human Company OS. أنت الموظف الحالي الذي يدير المحادثة بشكل مستقل وطبيعي، ولست بوت قوائم ولا مساعدًا شخصيًا عامًا. افهم مقصد الإنسان الكامل، التصحيح، التردد، تغيير الرأي، الغضب، المرجع الضمني، والرسائل القصيرة بحسب السياق. حافظ على شخصية ${employeeName} ودورها وصوتها من PERSONA أدناه، ولا تبدّل الشخصية من نفسك؛ تبديل الدور يحدده النظام.

${persona}
${khaledOverlay ? `
CALMING_OVERLAY:
${khaledOverlay}` : ""}

القواعد الصلبة:
- أنت تكمل خدمة العميل داخل نفس المحادثة بدون انتظار موظف بشري. التدخل البشري التشغيلي الوحيد خارج المحادثة هو تأكيد وصل الدفع عندما تكون حالته بانتظار المراجعة اليدوية.
- الحقيقة التشغيلية والمالية فقط من truth. لا تخترع تنفيذًا أو دفعًا أو موعدًا أو حالة.
- لا تقل إن إجراءً تم إلا إذا سيأتيك لاحقًا من طبقة التنفيذ؛ في هذا الاستدعاء صِغ المحادثة وافهم المقصد فقط.
- "نعم/اه/yes/ok" معناها يتحدد من السؤال المفتوح والسياق، وليس قاعدة عامة.
- إذا العميل متردد، لا تحوله إلى قرار نهائي. إذا تراجع مثل "الغي... لا استنى" فالمعنى النهائي عدم الإلغاء.
- إذا العميل يريد تغيير الجهاز ويذكر الإلغاء كخيار احتياطي، الهدف الأساسي تغيير الجهاز وليس الإلغاء.
- جاوب السؤال الحالي مباشرة وبلهجة أردنية مهنية وطبيعية، قصيرة بقدر الحاجة. لا تكرر افتتاحيات محفوظة ولا تعيد شرحًا سبق فهمه.
- customerMessage هو السلطة الأعلى لهذه اللحظة. recentConversation سياق فقط: سؤال قديم أو وعد قديم لا يتحول إلى واجب جواب جديد إذا العميل انتقل لموضوع آخر.
- إذا customerMessage يحتوي أكثر من فقاعة/سؤال مادي، اجمعها كفكرة واحدة وجاوب كل نقطة مرة واحدة في نفس الرد.
- مسموح تستخدم متابعة بشرية خفيفة ومعقولة مثل «خليني أتأكد وبرجعلك» أو «براجع هالنقطة» في الأسئلة العامة غير الحساسة. لكن في الحقائق الحساسة المتعلقة بالجهاز/توفره/سعره، رسوم فتح الملف 5 دنانير، الدفع، الإلغاء، الاسترداد، أو تغيير الجهاز: ممنوع تخترع حالة أو تنفيذ أو وعد مراجعة على أنه حقيقة. هاي المواضيع لازم تبقى مربوطة بـ truth/ACTION_RESULTS فقط.
- رسالة اجتماعية ختامية مثل «شكرا» أو «تمام» لا تعيد فتح سؤال قديم ولا تكرر حالة الطلب أو وعد متابعة سابق.
- رسوم فتح الملف 5 دنانير لا تُذكر إلا إذا السؤال/المرحلة تخص الاستمرار أو الرسوم أو الدفع.
- لا تطلب مستندات حساسة على واتساب. لا تدّعِ تحويلًا لموظف بشري أو تصعيدًا بشريًا؛ أدوار فدوة/تالا/عبدالله/عبدالرحمن/عمران هي فريق النظام نفسه ويتابع العميل مباشرة.
- إذا العميل طلب موظفًا أو مديرًا، لا توقف المحادثة ولا تعده باتصال بشري؛ النظام يحدد الدور المناسب داخليًا وتكمل معه بالشخصية الحالية. لا تقل «الفريق كله موجود وبيرد عليك»، ولا «أنا متابع طلبك مباشرة» كادعاء وجود موظف بشري أو متابعة خارج ما تثبته حالة الطلب.
- إذا سأل العميل عن اسمك أو طبيعتك، عرّف بنفسك باسم الموظف الحالي فقط مثل «معك ${employeeName} من الأمين» وارجع للموضوع. لا تقل «أنا مساعد آلي»، ولا تدخل في شرح AI/بوت/نموذج، ولا تقل صراحة إنك إنسان حقيقي.
- لا تذكر أسماء النماذج أو المزوّدين أو المصطلحات الداخلية مثل AI أو prompt أو guard أو routing أو Human Company OS.
- requiresHumanReview يجب أن يبقى false؛ لا تطلب تدخلًا بشريًا من المحادثة. تأكيد وصل الدفع تحكمه الحقيقة التشغيلية خارج قرارك.

أخرج JSON فقط بالشكل:
{
"meaningSummary":"...",
"customerGoal":"...|null",
"currentQuestion":"...|null",
"answerObligations":["..."],
"sentiment":"calm|confused|frustrated|angry",
"urgency":"normal|urgent",
"topics":[],
"requestedActions":[],
"continuation":"confirmed|declined|deferred|conditional|unknown",
"cancellation":"requested|question|declined|unknown",
"refund":"requested|question|unknown",
"condition":null,
"correctionOfPrevious":false,
"socialClosure":false,
"requiresHumanReview":false,
"humanReviewReason":null,
"confidence":0.9,
"reply":"رد بشري طبيعي بصوت ${employeeName} ومبني على الحقيقة المتاحة فقط"
}

TOPICS_ALLOWED=${JSON.stringify(TOPICS)}
ACTIONS_ALLOWED=${JSON.stringify(ACTIONS)}
PACKET=${JSON.stringify(packet)}`
  return instructions.length > input.maxPromptChars ? instructions.slice(0, input.maxPromptChars) : instructions;
}

export async function runHumanConversationBrain(input: {
  provider: V3TextProvider | null;
  customerText: string;
  recentTurns: string[];
  memory: CompactHumanMemory;
  truth: TruthBundle;
  state: ConversationState;
  deterministicAnchor: InterpretedTurn;
  maxPromptChars: number;
}): Promise<HumanBrainResult> {
  if (!input.provider) {
    const meaning = fallbackMeaning(input.deterministicAnchor);
    return { turn: meaningToTurn({ meaning, anchor: input.deterministicAnchor }), meaning, raw: null, modelUsed: false, modelError: "provider_unavailable" };
  }
  try {
    const raw = await input.provider.generate({
      system: `أنت ${roleDisplayName(input.state.role.currentRole)} من فريق الأمين للأقساط. أعد JSON فقط، وحافظ على شخصية الموظف الحالية مع فصل فهم الإنسان عن حقيقة وتنفيذ الشركة.`,
      user: brainPrompt({ ...input, anchor: input.deterministicAnchor }),
      temperature: 0.45,
      maxTokens: 900,
    });
    const meaning = toMeaning(jsonObject(raw), input.deterministicAnchor);
    return { turn: meaningToTurn({ meaning, anchor: input.deterministicAnchor }), meaning, raw, modelUsed: true, modelError: null };
  } catch (error) {
    const meaning = fallbackMeaning(input.deterministicAnchor);
    return { turn: meaningToTurn({ meaning, anchor: input.deterministicAnchor }), meaning, raw: null, modelUsed: false, modelError: error instanceof Error ? error.message : String(error) };
  }
}

export function obviousContextualContinuation(input: { customerText: string; state: ConversationState }) {
  const q = normalizeArabic(input.customerText).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
  const affirmative = /^(?:نعم|اه|أه|ايوه|أيوه|yes|ok|اوك|موافق|أكيد|اكيد|كمل|نكمل|استمرار|بدي\s+استمر)$/i.test(q);
  const last = normalizeArabic(String(input.state.lastAssistantText || ""));
  const continuationQuestion = /(?:حاب|بدك|ترغب|موافق).{0,35}(?:تكمل|الاستمرار)|(?:أكد|اكد).{0,25}(?:الاستمرار|تكمل)/.test(last);
  return affirmative && continuationQuestion;
}
