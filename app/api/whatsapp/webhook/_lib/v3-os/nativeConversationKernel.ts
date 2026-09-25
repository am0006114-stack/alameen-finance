import type { ActionKey, ActionResult, ConversationState, DialogueAct, DialogueActType, InterpretedTurn, SemanticTurnFrame, TopicKey, TruthBundle } from "./types";
import type { V3TextProvider } from "./provider";
import { normalizeArabic } from "./text";
import { roleDisplayName } from "./hierarchy";
import { personaWritingContract } from "./personas";
import { humanVoiceGuidance, detectHumanityViolations } from "./humanVoice";
import { businessTruthForPrompt, catalogAvailabilityContradiction } from "./businessTruthRegistry";
import { buildOfficialLinkContext, detectReplyLinkViolations, sanitizeRecentTurnsForModel, sanitizeStateForWriter } from "./linkIntegrity";
import { applicationJourneyStage } from "./applicationJourney";
import { fileOpeningPaymentWriterTruth, containsAllCurrentFileOpeningPaymentDestinations, containsLegacyFileOpeningPaymentDestination, paymentDestinationPresentationViolations } from "./paymentDestinationOverride";
import { containsRestrictedPaymentExecutionDetail, paymentDisclosureDecision } from "./paymentEligibilityFirewall";
import { appointmentCoordinationOverclaim } from "./operationalPrecision";
import { enforceGroundedBusinessEgress } from "./groundingGuard";
import { commercialDisclosureDelivered, currentCommercialDisclosure } from "./informedCommercialContinuation";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { replySimilarity } from "./humanVoice";

const TOPICS: TopicKey[] = [
  "greeting","thanks","acknowledgement","unknown","application_status","application_correction","requirements","guarantor",
  "products","device_change","device_recalculation","product_price","payment_fee","payment_method","payment_timing","payment_recipient","payment_status","payment_confirmation",
  "receipt_upload","first_installment","installment_amount","installment_duration","delivery","office_location","appointment","review_timing","operational_pressure",
  "refund","cancellation","continuation","reopen","complaint","trust","legal","social_threat","abuse","human_request","manager_request","call_request","repair","correction","website","tracking",
];

const ACTIONS: ActionKey[] = [
  "none","cancel_application","continue_application","request_refund","stop_refund","change_application_data","change_device","generate_secure_upload_link",
  "generate_receipt_link","reopen_application","switch_ai_role","record_call_preference","link_whatsapp_alias",
];

const ACT_TYPES: DialogueActType[] = [
  "ask","request_action","confirm","deny","correct","provide_fact","provide_reason","repair_request","acknowledge","greet","thank","complaint","request_role","unknown",
];

const MUTATION_ACTIONS = new Set<ActionKey>([
  "cancel_application","request_refund","stop_refund","change_application_data","change_device","reopen_application","link_whatsapp_alias",
]);

const INTERNAL_LEAKS = [
  /\bAI\b/i,/ذكاء\s*اصطناعي/i,/DeepSeek/i,/OpenAI/i,/guard/i,/validator/i,/decision\s*plane/i,/routing/i,
  /لا\s+تخترع/i,/الحقيقة\s+التجارية\s+المعتمدة/i,/المعلومة\s+المحددة\s+اللازمة\s+للجواب\s+مش\s+موجودة/i,
  /اكتب\s+سؤالك\s+أو\s+رقم\s+التتبع/i,/احكيلي\s+شو\s+بدك\s+تعرف/i,/الحقيقة\s+الموثقة/i,/مرحله\s+الافصاح\s+الكامل|مرحلة\s+الإفصاح\s+الكامل/i,
  /فهمت\s+سؤالك\s+الحالي[^.]{0,160}بدون\s+تخمين/i,/الحالة\s+اللي\s+ظاهرة\s+على\s+الطلب\s+هي\s+اللي\s+بعتمدها/i,
];

export type NativeKernelResult = {
  turn: InterpretedTurn;
  reply: string | null;
  modelUsed: boolean;
  modelError: string | null;
  raw: string | null;
};

export type NativeReplyValidation = {
  pass: boolean;
  reasons: string[];
};

type ModelAct = {
  type?: unknown;
  topic?: unknown;
  action?: unknown;
  value?: unknown;
  confidence?: unknown;
};

type ModelPayload = {
  acts?: ModelAct[];
  sentiment?: unknown;
  urgency?: unknown;
  explicitRoleRequest?: unknown;
  meaningSummary?: unknown;
  customerGoal?: unknown;
  currentQuestion?: unknown;
  answerObligations?: unknown;
  references?: unknown;
  entities?: unknown;
  decision?: unknown;
  correctionOfPrevious?: unknown;
  socialClosure?: unknown;
  requiresExternalFact?: unknown;
  externalFactNeeded?: unknown;
  answerMode?: unknown;
  confidence?: unknown;
  warnings?: unknown;
  reply?: unknown;
};

function clampConfidence(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.75;
  return Math.max(0, Math.min(1, n));
}

function jsonObject(text: string) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("native_kernel_json_missing");
  return JSON.parse(raw.slice(start, end + 1)) as ModelPayload;
}

function safeRole(value: unknown): InterpretedTurn["explicitRoleRequest"] {
  const s = String(value ?? "");
  if (["manager","staff","tala","fadwa","abdullah","abdulrahman","omran"].includes(s)) return s as InterpretedTurn["explicitRoleRequest"];
  return null;
}

function safeTopic(value: unknown): TopicKey | null {
  const s = String(value || "") as TopicKey;
  return TOPICS.includes(s) ? s : null;
}

function safeAction(value: unknown): ActionKey {
  const s = String(value || "none") as ActionKey;
  return ACTIONS.includes(s) ? s : "none";
}

function safeActType(value: unknown): DialogueActType {
  const s = String(value || "unknown") as DialogueActType;
  return ACT_TYPES.includes(s) ? s : "unknown";
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeStringArray(value: unknown, max = 12) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => safeString(x)).filter((x): x is string => Boolean(x)).slice(0, max);
}

function semanticFrame(payload: ModelPayload): SemanticTurnFrame {
  const decisionRaw = payload.decision && typeof payload.decision === "object" ? payload.decision as Record<string, unknown> : {};
  const continuation = ["confirmed","declined","deferred","conditional","unknown"].includes(String(decisionRaw.continuation))
    ? String(decisionRaw.continuation) as SemanticTurnFrame["decision"]["continuation"] : "unknown";
  const cancellation = ["requested","question","declined","unknown"].includes(String(decisionRaw.cancellation))
    ? String(decisionRaw.cancellation) as SemanticTurnFrame["decision"]["cancellation"] : "unknown";
  const refund = ["requested","question","unknown"].includes(String(decisionRaw.refund))
    ? String(decisionRaw.refund) as SemanticTurnFrame["decision"]["refund"] : "unknown";
  const aliasConfirmation = ["confirmed","declined","unknown"].includes(String(decisionRaw.aliasConfirmation))
    ? String(decisionRaw.aliasConfirmation) as SemanticTurnFrame["decision"]["aliasConfirmation"] : "unknown";
  const answerMode = ["direct","grounded_reasoning","clarify","social"].includes(String(payload.answerMode))
    ? String(payload.answerMode) as SemanticTurnFrame["answerMode"] : "direct";

  return {
    meaningSummary: safeString(payload.meaningSummary) || "رسالة عميل تحتاج جوابًا مباشرًا ضمن حقيقة الطلب",
    customerGoal: safeString(payload.customerGoal),
    currentQuestion: safeString(payload.currentQuestion),
    answerObligations: safeStringArray(payload.answerObligations),
    references: Array.isArray(payload.references) ? (payload.references as Array<Record<string, unknown>>).slice(0, 10).map((x) => ({
      surface: safeString(x.surface) || "",
      refersTo: safeString(x.refersTo),
      confidence: clampConfidence(x.confidence),
    })).filter((x) => x.surface) : [],
    entities: Array.isArray(payload.entities) ? (payload.entities as Array<Record<string, unknown>>).slice(0, 12).map((x) => ({
      surface: safeString(x.surface) || "",
      kind: ["person","device","wallet_or_payment_app","bank","company","location","document","amount","date","other"].includes(String(x.kind)) ? String(x.kind) as any : "other",
      role: safeString(x.role),
      knownFactStatus: ["known","unknown","customer_claim"].includes(String(x.knownFactStatus)) ? String(x.knownFactStatus) as any : "unknown",
      countryHint: (String(x.countryHint) === "JO" ? "JO" : "unknown") as "JO" | "unknown",
      confidence: clampConfidence(x.confidence),
    })).filter((x) => x.surface) : [],
    decision: { continuation, cancellation, refund, aliasConfirmation, condition: safeString(decisionRaw.condition) },
    correctionOfPrevious: payload.correctionOfPrevious === true,
    socialClosure: payload.socialClosure === true,
    requiresExternalFact: payload.requiresExternalFact === true,
    externalFactNeeded: safeString(payload.externalFactNeeded),
    answerMode,
    confidence: clampConfidence(payload.confidence),
    warnings: safeStringArray(payload.warnings),
  };
}

function mergeMutationSafetyAnchor(modelActs: DialogueAct[], anchor: InterpretedTurn) {
  const out = [...modelActs];
  for (const act of anchor.acts) {
    if (act.type !== "request_action" || !act.action || !MUTATION_ACTIONS.has(act.action)) continue;
    if (out.some((x) => x.action === act.action && x.type === "request_action")) continue;
    out.push({ ...act, source: "deterministic", confidence: Math.max(act.confidence, 0.97) });
  }
  return out;
}

function modelTurn(input: { payload: ModelPayload; anchor: InterpretedTurn; turnId: string; customerText: string }): InterpretedTurn {
  const acts: DialogueAct[] = Array.isArray(input.payload.acts)
    ? input.payload.acts.slice(0, 18).map((a, i) => {
        const topic = safeTopic(a.topic) || "unknown";
        return {
          id: `${input.turnId}:native:${i}`,
          type: safeActType(a.type),
          topic,
          text: input.customerText,
          action: safeAction(a.action),
          value: safeString(a.value),
          confidence: clampConfidence(a.confidence),
          source: "model" as const,
        };
      })
    : [];
  const mergedActs = mergeMutationSafetyAnchor(acts.length ? acts : input.anchor.acts, input.anchor);
  const topics = Array.from(new Set(mergedActs.map((x) => x.topic)));
  const requestedActions = Array.from(new Set(mergedActs.map((x) => x.action || "none").filter((x): x is ActionKey => x !== "none")));
  return {
    turnId: input.turnId,
    rawText: input.customerText,
    normalizedText: normalizeArabic(input.customerText),
    acts: mergedActs.length ? mergedActs : input.anchor.acts,
    topics: topics.length ? topics : input.anchor.topics,
    requestedActions: requestedActions.length ? requestedActions : input.anchor.requestedActions,
    sentiment: ["calm","confused","frustrated","angry"].includes(String(input.payload.sentiment)) ? String(input.payload.sentiment) as InterpretedTurn["sentiment"] : input.anchor.sentiment,
    urgency: String(input.payload.urgency) === "urgent" ? "urgent" : "normal",
    explicitRoleRequest: safeRole(input.payload.explicitRoleRequest) || input.anchor.explicitRoleRequest,
    confidence: clampConfidence(input.payload.confidence),
    warnings: Array.from(new Set([...input.anchor.warnings, ...safeStringArray(input.payload.warnings)])),
    semantic: semanticFrame(input.payload),
  };
}

function companyTruthSnapshot(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  return {
    fetchedAt: input.truth.fetchedAt,
    confidence: input.truth.confidence,
    truthSource: input.truth.source,
    contactAccess: input.truth.contactAccess || "none",
    application: input.truth.application,
    policy: input.truth.policy,
    businessTruth: businessTruthForPrompt(),
    canonicalPublicLinks: {
      website: links.baseUrl,
      products: `${links.baseUrl}/products`,
      tracking: `${links.baseUrl}/track`,
    },
    officialLinks: links.relevant,
    boundReceiptUrl: input.truth.application?.trackingId && input.truth.application?.phone ? `${links.baseUrl}/receipt?tracking=${encodeURIComponent(input.truth.application.trackingId)}&phone=${encodeURIComponent(input.truth.application.phone)}` : null,
    boundTrackingUrl: input.truth.application?.trackingId && input.truth.application?.phone ? `${links.baseUrl}/track?tracking=${encodeURIComponent(input.truth.application.trackingId)}&phone=${encodeURIComponent(input.truth.application.phone)}` : null,
    feePaymentDestination: fileOpeningPaymentWriterTruth(),
    paymentConfirmed: hasAuthoritativePaymentConfirmation(input.truth.application),
    journeyStage: applicationJourneyStage(input.truth.application),
    informedCommercialDisclosureDelivered: commercialDisclosureDelivered(input.state, input.truth),
    informedCommercialDisclosure: currentCommercialDisclosure(input.state, input.truth),
  };
}

function nativePrompt(input: {
  customerText: string;
  turnId: string;
  state: ConversationState;
  truth: TruthBundle;
  recentTurns?: string[];
  profileName?: string | null;
  deterministicAnchor: InterpretedTurn;
  actionResults?: ActionResult[];
  validationFailures?: string[];
  operationalContext?: Record<string, unknown>;
}) {
  const roleName = roleDisplayName(input.state.role.currentRole);
  const safeRecent = sanitizeRecentTurnsForModel(input.recentTurns).slice(-16);
  const safeState = sanitizeStateForWriter(input.state);
  const truth = companyTruthSnapshot({ turn: input.deterministicAnchor, state: input.state, truth: input.truth });
  const emotionalOverlay = input.deterministicAnchor.sentiment === "angry" || input.deterministicAnchor.sentiment === "frustrated" || input.state.consecutiveRiskTurns > 0
    ? "KHALED_CALMING_OVERLAY=true: استخدم حكمة وهدوء خالد في التهدئة بدون ادعاء تحويل لموظف آخر، وبدون إعادة نفس الاعتذار أو نفس مدة المراجعة."
    : "KHALED_CALMING_OVERLAY=false";

  return `أنت Native Conversation Kernel لشركة الأمين للأقساط. أنت سلطة الحوار الوحيدة لهذه الرسالة.
مهمتك في استدعاء واحد: افهم كامل burst والسياق لأبعد حد، ثم اكتب رد واتساب بشري أردني قائم فقط على الحقيقة المعطاة.

أخرج JSON فقط:
{
  "acts":[{"type":"ask|request_action|confirm|deny|correct|provide_fact|provide_reason|repair_request|acknowledge|greet|thank|complaint|request_role|unknown","topic":"TOPIC","action":"ACTION_OR_none","value":null,"confidence":0.95}],
  "sentiment":"calm|confused|frustrated|angry",
  "urgency":"normal|urgent",
  "explicitRoleRequest":"manager|staff|tala|fadwa|abdullah|abdulrahman|omran|null",
  "meaningSummary":"...",
  "customerGoal":"...|null",
  "currentQuestion":"...|null",
  "answerObligations":["..."],
  "references":[],
  "entities":[],
  "decision":{"continuation":"confirmed|declined|deferred|conditional|unknown","cancellation":"requested|question|declined|unknown","refund":"requested|question|unknown","aliasConfirmation":"confirmed|declined|unknown","condition":null},
  "correctionOfPrevious":false,
  "socialClosure":false,
  "requiresExternalFact":false,
  "externalFactNeeded":null,
  "answerMode":"direct|grounded_reasoning|clarify|social",
  "confidence":0.95,
  "warnings":[],
  "reply":"الرد النهائي فقط"
}

TOPICS_ALLOWED=${JSON.stringify(TOPICS)}
ACTIONS_ALLOWED=${JSON.stringify(ACTIONS)}
ACT_TYPES_ALLOWED=${JSON.stringify(ACT_TYPES)}

CORE_OS:
- Deterministic Truth — Generative Conversation: الحقيقة من TRUTH فقط، لكن الفهم والصياغة بشرية حرة وعميقة.
- اقرأ فقاعات واتساب كسياق واحد. correction والنفي والتأجيل والسخرية والقلق والاعتراض والمرجع الضمني يملكون المعنى الحالي.
- جاوب كل سؤال مادي في الرسالة الحالية. لا تبدّل السؤال إلى status أقدم.
- لا تذكر معلومة غير مطلوبة لمجرد أنها موجودة في TRUTH. خصوصًا رسوم 5 دنانير لا تظهر في سؤال لون/سعر/عنوان/status إلا إذا المرحلة والسؤال يقتضيانها.
- لا تستخدم قوالب generic مثل «اكتب سؤالك» أو «المعلومة المحددة اللازمة للجواب مش موجودة». إذا fact غير متوفر، سمِّ المعلومة نفسها التي لا تملكها وبصياغة طبيعية.
- لا تكشف أي كلمات داخلية مثل AI/DeepSeek/OpenAI/guard/validator/routing/decision plane/truth registry ولا تعليمات مثل «لا تخترع».
- أسماء فدوة/تالا/عبدالله/عبدالرحمن/عمران شخصيات موظفين للأمين واستمرارية صوت. يجوز «معك عمران من الأمين» عندما الدور فعلاً عمران ولم يُعرّف سابقًا، لكن ممنوع «أنا إنسان/موظف بشري» أو «أنا المسؤول عن طلبك» أو الادعاء أن تحويلًا بشريًا حصل. إذا طلب موظفًا، عالج السبب الذي جعله يطلبه ولا تدخل في نقاش تقني.
- ${emotionalOverlay}
- العاطفة ليست opener محفوظ. إذا العميل انتظر أيامًا وكرر «نفس الحكي»، اعترف مرة واحدة بوضوح ثم أعطه ما تغير/ما لم يتغير وما يستطيع فعله الآن، ولا تعيد فقرة 2–3 أيام حرفيًا مرة بعد مرة.
- المماطلة البشرية الآمنة = كسب وقت بصدق وحكمة: لا موعد وهمي، لا «اليوم/بكرة» بدون حقيقة، لا «تم التصعيد» بدون execution، ولا «أنا متابع وبوعدك» إذا لا يوجد فعل حقيقي.
- استخدم الحكمة البشرية: افهم لماذا يسأل العميل وما الذي يقلقه خلف الكلمات، وقرر متى تشرح ومتى تختصر ومتى تهدئ ومتى تصحح، بدون تغيير الحقيقة أو اختراع خطوة.
- في الشك بالنصب أو الشكوى: لا تدافع بمحاضرة. جاوب عناصر الثقة الموثقة، العنوان العام إذا سُئل، الرابط الرسمي إذا مفيد، وسياسة الدفع/الاسترداد ذات الصلة فقط.
- إذا سأل «تابعين للبنك المركزي؟» لا تدعِ تبعية/ترخيص. استخدم حقيقة الاستقلال الموجودة في السياسة فقط إذا كانت هي الجواب المناسب.
- في طلب الإلغاء أو الاسترداد: عبّر في decision.cancellation/refund بدقة. الطلب الصريح = requested، السؤال = question. النظام الحتمي سيطلب confirmation منفصل ولن ينفذ من فهمك وحده.
- الصورة/المرفق لا يُعتبر واصلًا إلا إذا CUSTOMER_MESSAGE نفسه يحتوي event موثق مثل «تم استلام صورة.../تم استلام رسالة صوتية...». نية الإرسال ليست وصولًا.
- لا تقل للعميل «مرحلة الإفصاح الكامل» أو أي اسم داخلي للرحلة؛ اشرح الخطوة نفسها بلغة بشرية.
- التقديم يبدأ من المسار الرسمي/الموقع. لا تطلب من العميل إرسال الهوية أو الرقم الوطني أو إثبات الدخل أو الوصل داخل واتساب؛ المستندات الحساسة عبر الرابط الرسمي الآمن فقط.
- المكتب ليس زيارة مفتوحة: لا تقل «بتقدر تزورنا/تعال المكتب» بدون توضيح أن الحضور فقط بموعد رسمي مؤكد.
- لا تضمن أن نوع كفيل معيّن (عسكري/حكومي/خاص...) «مقبول» كحقيقة نهائية؛ اشرح أن الدراسة هي التي تحدد.

TRUTH_INTEGRITY_FREEZE:
- PRODUCT SOURCE OF TRUTH: businessTruth.currentCatalog هو مرجع المنتجات العام الحالي. وجود جهاز فيه يعني أنه معروض للتقديم حاليًا، وليس وعدًا بمخزون فوري. لا تقل عن جهاز موجود في currentCatalog إنه «غير متوفر/مش موجود عندنا». إذا جهاز غير موجود في currentCatalog، قل فقط إنه غير ظاهر في الكتالوج الحالي ولا تستنتج سببًا أو مخزونًا.
- iPhone 18 له حقيقة تجارية خاصة داخل businessTruth.iphone18 وتتقدم على أي تعارض أقدم في الكتالوج العام، خصوصًا السعر والخصم والألوان والكفالة والاستلام.
- PAYMENT CHANNELS: Orange Money = الرقم 0788500337 فقط. CliQ = المعرفات PAYAMEEEN وAMEEN1ST وAM500337. اسم المستفيد ABDUL RAHMAN ALHARAHSHEH. ممنوع وصف معرفات CliQ بأنها أسماء/معرفات لمحفظة Orange Money. عند عرض الدفع افصل القناتين بوضوح.
- CANONICAL PUBLIC LINKS موجودة في canonicalPublicLinks. إذا عرضت على العميل «أرسل لك رابط التقديم» ثم قال نعم/ابعثه، أرسل رابط products نفسه؛ لا تستبدله برابط التتبع. رابط tracking للمتابعة فقط، ورابط products للتقديم/اختيار جهاز.
- كلمة «كفالة» في سياق جهاز/موديل/سعر/ألوان تعني غالبًا ضمان الجهاز، لا «الكفيل». إذا السياق لا يحسم المعنى، اسأل سؤالًا قصيرًا: «قصدك كفالة الجهاز ولا الكفيل للطلب؟» بدل افتراض أحدهما.

PROTECTED_5_JOD_JOURNEY:
- هذا مسار P0 لا يجوز كسره أو تجاوزه: موافقة مبدئية -> إفصاح تجاري كامل عند الحاجة -> قرار استمرار informed -> رسوم فتح الملف 5 JOD -> بيانات الدفع الرسمية -> رفع الوصل الرسمي -> اعتماد الدفع إداريًا -> دراسة نهائية.
- لا ترسل بيانات Orange Money/CliQ أو رابط الوصل قبل informed continuation المسموح.
- إذا أول «استمرار/كمل» جاء ولم يكن الإفصاح الكامل قد وصل، اشرح الرسوم وسببها: تنظيم الدراسة النهائية، حجم الطلبات الكبير، جدية الرغبة والاستعداد المبدئي للاستمرار؛ ليست ثمن الجهاز، ليست دفعة أولى، ليست القسط الأول، لا تشتري الموافقة ولا تضمنها؛ ثم اترك للعميل القرار بدون ضغط.
- إذا الإفصاح وصل والعميل أكد الاستمرار بوضوح، حتى لو كان التأكيد المختصر «نعم/اه/Yes/موافق» في سياق القرار، اعتبر decision.continuation="confirmed" وأعطِ بيانات الدفع الرسمية كاملة ورابط الوصل الرسمي إن كان متاحًا.
- إذا سأل لماذا الرسوم/كيف أضمن/هل ترجع: أجب الاعتراض نفسه قبل أي دعوة للدفع.
- مجرد «دفعت/حولت» أو صورة واتساب لا يؤكد الدفع. الدفع المؤكد فقط من TRUTH/admin.
- سؤال الأقساط الشهرية أو القسط الأول منفصل تمامًا عن 5 JOD.

PAYMENT_PROOF_BINDING:
- عندما يسأل «كيف تعرفوا إني أنا اللي دفعت؟»: اشرح أن الوصل يُرفع من الرابط الرسمي المرتبط بطلبه/رقم تتبعه ورقم الهاتف، ثم تراجعه الإدارة وتثبت الدفع على نفس الطلب. صورة واتساب وحدها ليست الرفع الرسمي ولا تأكيد الدفع.

HUMAN_OS:
${personaWritingContract(roleName)}
${humanVoiceGuidance({ recentTurns: safeRecent, tone: input.deterministicAnchor.sentiment === "angry" ? "firm" : "supportive", roleName })}
- تذكّر ما تم شرحه ولا تجبر العميل على إعادة السؤال بصيغة سحرية.
- «استمرار/كمل/نكمل» يكفي دلاليًا عندما السياق يثبت القرار؛ لا تشترط عبارة حرفية «أود الاستمرار».
- إذا العميل قال إنه سمع نفس الكلام، لا تعيد نفس الكلام بصياغة ثانية؛ انتقل لما هو مفيد الآن.
- جواب السؤال القصير يكون قصيرًا. الحالة المركبة تغطي كل النقاط بدون جريدة.

TRUTH=${JSON.stringify(truth)}
STATE=${JSON.stringify({
    activeApplicationId: input.state.activeApplicationId,
    activeTrackingId: input.state.activeTrackingId,
    role: safeState.role,
    pendingAction: safeState.pendingAction,
    pendingActionPayload: safeState.pendingActionPayload,
    openLoops: safeState.openLoops?.slice(-12),
    facts: safeState.facts?.slice(-24),
    conversationConstraints: safeState.conversationConstraints,
    humanRelationship: input.state.humanRelationship || null,
    semanticMemory: safeState.semanticMemory,
    commercialDisclosure: input.state.commercialDisclosure || null,
    lastCustomerText: input.state.lastCustomerText,
    lastAssistantText: input.state.lastAssistantText,
  })}
RECENT=${JSON.stringify(safeRecent)}
DETERMINISTIC_SAFETY_ANCHOR=${JSON.stringify(input.deterministicAnchor)}
ACTION_RESULTS=${JSON.stringify(input.actionResults || [])}
VALIDATION_FAILURES=${JSON.stringify(input.validationFailures || [])}
OPERATIONAL_CONTEXT=${JSON.stringify(input.operationalContext || {})}
PROFILE_NAME=${JSON.stringify(input.profileName || null)}
CUSTOMER_MESSAGE=${JSON.stringify(input.customerText)}

اكتب JSON الآن. الرد داخل reply لا يحتوي أي شرح داخلي.`;
}

export async function runNativeConversationKernel(input: {
  provider: V3TextProvider | null;
  customerText: string;
  turnId: string;
  state: ConversationState;
  truth: TruthBundle;
  recentTurns?: string[];
  profileName?: string | null;
  deterministicAnchor: InterpretedTurn;
  actionResults?: ActionResult[];
  validationFailures?: string[];
  operationalContext?: Record<string, unknown>;
}): Promise<NativeKernelResult> {
  if (!input.provider) return { turn: input.deterministicAnchor, reply: null, modelUsed: false, modelError: "provider_unavailable", raw: null };
  try {
    const raw = await input.provider.generate({
      system: "أنت نواة المحادثة الوحيدة للأمين. افهم واكتب الرد النهائي داخل JSON فقط وفق الحقيقة المعطاة.",
      user: nativePrompt(input),
      temperature: 0.38,
      maxTokens: 1450,
    });
    const payload = jsonObject(raw);
    const turn = modelTurn({ payload, anchor: input.deterministicAnchor, turnId: input.turnId, customerText: input.customerText });
    const reply = safeString(payload.reply);
    return { turn, reply, modelUsed: true, modelError: null, raw };
  } catch (error) {
    return { turn: input.deterministicAnchor, reply: null, modelUsed: false, modelError: error instanceof Error ? error.message : String(error), raw: null };
  }
}

function eventHasRealMedia(customerText: string) {
  const q = normalizeArabic(customerText);
  return /تم\s+استلام\s+(?:صوره|صورة|رساله\s+صوتيه|رسالة\s+صوتية|فيديو|مرفق)|media_upload/.test(q);
}

function feeRelevantByContext(input: { turn: InterpretedTurn; truth: TruthBundle; customerText: string }) {
  const stage = applicationJourneyStage(input.truth.application);
  const customer = normalizeArabic(input.customerText);
  const asksFeeExplicitly = /(?:رسوم\s+فتح\s+الملف|رسوم|خمسه|خمسة|5|٥)\s*(?:دنانير|دينار)?/.test(customer);
  if (asksFeeExplicitly) return true;
  if (input.turn.topics.some((t) => ["payment_fee","payment_recipient","continuation"].includes(t))) return true;
  if (input.turn.semantic?.decision.continuation === "confirmed") return true;
  if (["continuation_confirmed_fee_due","payment_proof_pending_admin"].includes(stage)
    && input.turn.topics.some((t) => ["payment_method","payment_timing","payment_status","payment_confirmation","receipt_upload"].includes(t))) return true;
  return false;
}


function actionSucceeded(actions: ActionResult[], action: ActionKey) {
  return actions.some((x) => x.action === action && (x.executed || x.outcome === "executed" || x.outcome === "already_done"));
}

function waitingConfirmationAction(actions: ActionResult[]) {
  return actions.find((x) => x.outcome === "needs_confirmation")?.action || null;
}

function confirmationLanguagePresent(reply: string, action: ActionKey) {
  const n = normalizeArabic(reply);
  const confirm = /(?:اكد|أكد|تأكيد|اذا\s+قرارك\s+نهائي|إذا\s+قرارك\s+نهائي|اكتب\s+نعم|احكي\s+نعم)/.test(n);
  if (action === "cancel_application") return confirm && /(?:الغاء|إلغاء|الغي|ألغي)/.test(n);
  if (action === "request_refund") return confirm && /(?:استرداد|استرجاع|رجع)/.test(n);
  if (action === "link_whatsapp_alias") return /(?:اعتمد|اعتماد|اربط|ربط).{0,35}(?:الرقم|واتساب)/.test(n) && (confirm || /(?:نعم|موافق)/.test(n));
  if (action === "reopen_application") return confirm && /(?:اعاده|إعادة|فتح|تفعيل)/.test(n);
  if (action === "stop_refund") return confirm && /(?:وقف|ايقاف|إيقاف).{0,25}(?:الاسترداد|الاسترجاع)/.test(n);
  return true;
}

function unsafeLinkViolations(reply: string, turn: InterpretedTurn, truth: TruthBundle) {
  return detectReplyLinkViolations({ reply, turn, truth }).filter((reason) =>
    !reason.startsWith("required_") && reason !== "receipt_link_requires_application_resolution"
  );
}

export function validateNativeConversationReply(input: {
  reply: string | null | undefined;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  actions: ActionResult[];
  recentTurns?: string[];
  customerText: string;
  disclosureRequiredThisTurn: boolean;
  protectedFiveJodStep: boolean;
}): NativeReplyValidation {
  const reply = String(input.reply || "").trim();
  const reasons: string[] = [];
  if (!reply) reasons.push("empty_reply");
  for (const re of INTERNAL_LEAKS) if (re.test(reply)) reasons.push("internal_or_generic_fallback_leak");
  if (containsLegacyFileOpeningPaymentDestination(reply)) reasons.push("legacy_payment_destination");
  const productContradiction = catalogAvailabilityContradiction({ customerText: input.customerText, reply });
  if (productContradiction) reasons.push(productContradiction);
  for (const violation of paymentDestinationPresentationViolations(reply)) reasons.push(`payment_presentation:${violation}`);

  const n = normalizeArabic(reply);
  for (const violation of unsafeLinkViolations(reply, input.turn, input.truth)) reasons.push(`unsafe_link:${violation}`);
  const grounded = enforceGroundedBusinessEgress({ reply, turn: input.turn, truth: input.truth });
  if (!grounded.pass) reasons.push(`grounding:${"reason" in grounded ? grounded.reason : "unknown"}`);

  const explicitContinuationThisTurn = input.turn.requestedActions.includes("continue_application") || input.turn.semantic?.decision.continuation === "confirmed";
  const paymentDecision = paymentDisclosureDecision({
    application: input.truth.application,
    customerText: input.customerText,
    explicitContinuationThisTurn,
  });
  if (containsRestrictedPaymentExecutionDetail(reply, input.truth.policy) && !paymentDecision.paymentExecutionDetailsAllowed) {
    reasons.push(`payment_execution_not_allowed:${paymentDecision.reason}`);
  }

  if (appointmentCoordinationOverclaim(reply)) reasons.push("unsupported_appointment_coordination");
  const suggestsOpenOfficeVisit = /(?:بتقدر|تقدر|فيك|ممكن|تعال|تعالي|اجي|أجي|تيجي|تجي|تزور|زور).{0,45}(?:المكتب|الفرع|عندنا|تزورنا)/.test(n)
    && !/(?:موعد|بموعد|بعد\s+تحديد\s+موعد|موعد\s+رسمي\s+مؤكد)/.test(n);
  if (suggestsOpenOfficeVisit) reasons.push("office_visit_without_confirmed_appointment");
  if (/\b(?:preliminary_application|preliminary_qualified|customer_confirmed_continue|pending_payment|payment_info_sent|customer_claimed_paid|pending_payment_confirmation|under_review|refund_requested|refund_completed)\b/i.test(reply)) reasons.push("raw_internal_status_leak");
  if (/(?:الأمين\s+للأقساط\s+والتمويل|شركه\s+تمويل|شركة\s+تمويل|شركه\s+(?:اقراض|إقراض)|شركة\s+(?:اقراض|إقراض)|مرخص\s+من\s+البنك\s+المركزي|خاضع\s+لرقابه\s+البنك\s+المركزي|خاضع\s+لرقابة\s+البنك\s+المركزي|بدون\s+فوائد)/.test(n)) reasons.push("forbidden_business_identity_or_regulatory_claim");
  if (/(?:ابعث|ابعت|ارسل|أرسل|بعت|رسل).{0,70}(?:الهويه|الهوية|الرقم\s+الوطني|رقم\s+الهويه|رقم\s+الهوية|كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب|اثبات\s+الدخل|إثبات\s+الدخل|وصل|اثبات\s+الدفع|إثبات\s+الدفع)/.test(n)) reasons.push("sensitive_document_requested_on_whatsapp");
  if (input.turn.topics.includes("review_timing") && /(?:خلال\s+)?(?:24|٢٤|48|٤٨)\s*ساع|(?:اليوم|بكره|بكرة|غدا|غدًا).{0,35}(?:بيطلع|بيصدر|بخلص|بنخلص|القرار|الموافقه|الموافقة)/.test(n)) reasons.push("unsupported_review_eta");

  const waiting = waitingConfirmationAction(input.actions);
  if (waiting && !confirmationLanguagePresent(reply, waiting)) reasons.push(`missing_action_specific_confirmation:${waiting}`);
  if (!eventHasRealMedia(input.customerText) && /(?:وصلتني|وصلت)\s+(?:الصوره|الصورة|المرفق|الرساله\s+الصوتيه|الرسالة\s+الصوتية)/.test(n)) reasons.push("false_media_received_claim");
  if (!hasAuthoritativePaymentConfirmation(input.truth.application) && /(?:دفعك|الدفع)\s+(?:موكد|مؤكد|مثبت\s+اداريا|مثبت\s+إداريا)/.test(n)) reasons.push("false_payment_confirmation_claim");

  if (!actionSucceeded(input.actions, "cancel_application") && /(?:تم\s+(?:الغاء|إلغاء)\s+(?:طلبك|الطلب)|(?:طلبك|الطلب).{0,15}(?:صار\s+)?(?:ملغي|ملغى))/.test(n)) reasons.push("false_cancel_completion_claim");
  if (!actionSucceeded(input.actions, "request_refund") && /(?:تم\s+(?:تسجيل|تنفيذ)\s+(?:طلب\s+)?(?:الاسترداد|استرداد)|(?:الاسترداد|الاسترجاع).{0,15}(?:تم|اكتمل))/.test(n) && input.turn.requestedActions.includes("request_refund")) reasons.push("false_refund_completion_claim");
  if (!actionSucceeded(input.actions, "change_device") && /(?:تم\s+(?:تغيير|تعديل)\s+(?:الجهاز|الموديل)|(?:الجهاز|الموديل).{0,18}(?:تم\s+تغييره|صار\s+معدل))/.test(n)) reasons.push("false_device_change_completion_claim");
  if (!actionSucceeded(input.actions, "change_application_data") && /تم\s+(?:تعديل|تحديث)\s+(?:بياناتك|البيانات|الطلب)/.test(n)) reasons.push("false_application_data_change_completion_claim");
  if (!actionSucceeded(input.actions, "reopen_application") && /تم\s+(?:اعاده|إعادة)\s+(?:فتح|تفعيل)\s+(?:طلبك|الطلب)/.test(n)) reasons.push("false_reopen_completion_claim");
  if (!actionSucceeded(input.actions, "stop_refund") && /تم\s+(?:وقف|ايقاف|إيقاف)\s+(?:الاسترداد|الاسترجاع)/.test(n)) reasons.push("false_stop_refund_completion_claim");
  if (!actionSucceeded(input.actions, "link_whatsapp_alias") && /تم\s+(?:اعتماد|ربط)\s+(?:رقم|الرقم|واتساب)/.test(n)) reasons.push("false_contact_link_completion_claim");

  if (/(?:أنا|انا)\s+(?:انسان|إنسان|موظف\s+بشري|الموظف\s+(?:المسؤول|المسوول))|(?:أنا|انا).{0,30}(?:المسؤول|المسوول)\s+عن\s+طلبك|حولتك\s+(?:لموظف|لشخص)|تم\s+تحويلك\s+(?:لموظف|لشخص)/.test(n)) reasons.push("false_literal_human_handoff_claim");
  if (/(?:تم\s+التصعيد|تم\s+تصعيد|رح|راح|بنبعث|بنرسل|سنتصل|رح\s+نتصل).{0,55}(?:الاداره|الإدارة|موظف|نتواصل|نتصل|نخبرك|نبلغك|بخبرك|ببلغك)/.test(n)) reasons.push("unsupported_future_admin_or_contact_claim");

  const feeMentioned = /(?:5|٥)\s*(?:دنانير|دينار)|رسوم\s+فتح\s+الملف/.test(n);
  const feeAllowed = feeRelevantByContext({ turn: input.turn, truth: input.truth, customerText: input.customerText }) || input.disclosureRequiredThisTurn || input.protectedFiveJodStep;
  if (feeMentioned && !feeAllowed) reasons.push("unsolicited_fee_topic_drift");

  const hasPaymentExecution = /0788500337|PAYAMEEEN|AMEEN1ST|AM500337/i.test(reply);
  if (hasPaymentExecution && !feeAllowed) reasons.push("unsolicited_fee_payment_destination");
  if (/\/receipt\?tracking=/i.test(reply) && !feeAllowed) reasons.push("unsolicited_receipt_link");
  if (input.disclosureRequiredThisTurn && hasPaymentExecution) reasons.push("payment_details_before_informed_confirmation");
  if (input.disclosureRequiredThisTurn) {
    if (!feeMentioned) reasons.push("missing_informed_fee_amount");
    if (!/(?:جدي|جدية|حجم\s+الطلبات|عدد\s+الطلبات|تنظيم\s+الدراسه|تنظيم\s+الدراسة)/.test(n)) reasons.push("missing_fee_rationale");
    if (!/(?:مش|ليست)\s+(?:دفعه|دفعة|القسط|ثمن)|لا\s+(?:تضمن|تشتري)/.test(n)) reasons.push("missing_fee_non_guarantee_context");
  }
  if (input.protectedFiveJodStep) {
    if (!containsAllCurrentFileOpeningPaymentDestinations(reply)) reasons.push("missing_current_payment_destinations");
    if (!/\/receipt\?tracking=/i.test(reply)) reasons.push("missing_receipt_link_after_informed_confirmation");
  }

  if (input.turn.topics.includes("office_location") && input.truth.policy.generalLocation && !n.includes(normalizeArabic(input.truth.policy.generalLocation))) reasons.push("missed_known_office_location");
  if (/19\s*ديسمبر\s*2026|19\s*كانون\s*الأول\s*2026/i.test(reply)) reasons.push("stale_or_invented_iphone18_date");
  if (/(?:كفيل|الكفيل).{0,35}(?:عسكري|حكومي|موظف|متقاعد|قطاع\s+خاص).{0,35}(?:مقبول|بزبط|مضمون)/.test(n)) reasons.push("unsupported_specific_guarantor_acceptance");
  if (/(?:المراجعه|المراجعة)\s+(?:يدويه|يدوية)/.test(n)) reasons.push("unsupported_internal_review_mechanism");

  const prev = String(input.state.lastAssistantText || "").trim();
  if (prev.length > 60 && reply.length > 60 && replySimilarity(prev, reply) >= 0.78) {
    const customerSignalsRepetition = /نفس\s+الحكي|بتعيد|كرر|زهق|طفشت|انساني\s+من\s+هاض\s+الكلام/.test(normalizeArabic(input.customerText));
    if (customerSignalsRepetition || input.state.conversationConstraints?.avoidRepetition) reasons.push("repeated_answer_after_customer_rejection");
  }
  for (const violation of detectHumanityViolations(reply, input.recentTurns)) {
    if (["high_similarity_to_recent_reply","repeated_opening_structure"].includes(violation)) reasons.push(`humanity:${violation}`);
  }

  return { pass: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
}
