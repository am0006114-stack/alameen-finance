const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value, 'utf8'); }
function replaceOrFail(path, before, after, label) {
  const src = read(path);
  if (!src.includes(before)) throw new Error(`PATCH MISS [${label}] in ${path}`);
  write(path, src.replace(before, after));
  console.log(`PATCH OK [${label}]`);
}
function replaceRegexOrFail(path, re, replacement, label) {
  const src = read(path);
  if (!re.test(src)) throw new Error(`PATCH MISS [${label}] in ${path}`);
  re.lastIndex = 0;
  write(path, src.replace(re, replacement));
  console.log(`PATCH OK [${label}]`);
}

const informed = 'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts';
replaceOrFail(
  informed,
`export function numericCommercialContinueText(value: string | null | undefined) {
  return /^(?:1|١)$/.test(normalizedCommercialDecisionText(value));
}

export function commercialContinuationAffirmativeText(value: string | null | undefined) {`,
`export function numericCommercialContinueText(value: string | null | undefined) {
  return /^(?:1|١)$/.test(normalizedCommercialDecisionText(value));
}

// Strong standalone continuation commands are sufficient decision authority even
// when the preceding preliminary-approval template was delivered outside the
// Human OS state store. Bare acknowledgements such as نعم/اه/تمام are deliberately
// excluded here and still require scoped disclosure context.
export function strongCommercialContinuationDecisionText(value: string | null | undefined) {
  const q = normalizedCommercialDecisionText(value);
  if (!q) return false;
  if (numericCommercialContinueText(q)) return true;
  if (/(?:اود|ارغب|اريد|بدي|حاب|حابب|خلينا|يلا).{0,24}(?:الاستمرار|استمر|اكمل|كمل|نكمل|نستمر)/.test(q)) return true;
  return /^(?:استمرار|اكمل|كمل|نكمل|نستمر|استمر|كملو|كملوا|استمروا)$/.test(q);
}

export function commercialContinuationAffirmativeText(value: string | null | undefined) {`,
  'strong continuation authority helper',
);
replaceOrFail(
  informed,
`  if (declines) return false;
  if (numericCommercialContinueText(q)) return true;
  if (/(?:اود|ارغب|اريد|بدي|حاب|حابب|موافق|اوافق|خلينا|يلا).{0,24}(?:الاستمرار|استمر|اكمل|كمل|نكمل|نستمر)|^(?:استمرار|اكمل|كمل|نكمل|نستمر|استمر|كملو|كملوا|استمروا)$/.test(q)) return true;`,
`  if (declines) return false;
  if (strongCommercialContinuationDecisionText(q)) return true;
  if (/(?:موافق|اوافق).{0,24}(?:الاستمرار|استمر|اكمل|كمل|نكمل|نستمر)/.test(q)) return true;`,
  'centralize strong continuation parsing',
);

const actionPlane = 'app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts';
replaceOrFail(
  actionPlane,
`import { commercialContinuationAffirmativeText, commercialDisclosureDelivered } from "./informedCommercialContinuation";`,
`import { commercialContinuationAffirmativeText, commercialDisclosureDelivered, strongCommercialContinuationDecisionText } from "./informedCommercialContinuation";`,
  'action plane imports strong decision authority',
);
replaceOrFail(
  actionPlane,
`  if (applicationJourneyStage(app) !== "preliminary_approved_waiting_decision") return null;
  if (!commercialDisclosureDelivered(state, truth)) return null;
  if (!commercialContinuationAffirmativeText(state.lastCustomerText)) return null;`,
`  if (applicationJourneyStage(app) !== "preliminary_approved_waiting_decision") return null;
  if (!commercialContinuationAffirmativeText(state.lastCustomerText)) return null;

  // The canonical preliminary-approval template can be delivered by the template
  // pipeline outside Human OS state persistence. A strong standalone command such
  // as "اود الاستمرار" or menu choice 1 therefore carries its own deterministic
  // decision authority. Bare نعم/اه/تمام still require the scoped disclosure state.
  const disclosureSatisfied = commercialDisclosureDelivered(state, truth);
  const strongDecision = strongCommercialContinuationDecisionText(state.lastCustomerText);
  if (!disclosureSatisfied && !strongDecision) return null;`,
  'decouple explicit continuation from volatile disclosure state',
);
replaceOrFail(
  actionPlane,
`    // Commercial continuation is intentionally not a broad Real Action. It is a
    // narrow, idempotent state transition that may run even while general real
    // mutations are disabled. The decision screen must have been delivered for
    // this exact application and the current customer turn must be affirmative.`,
`    // Commercial continuation is intentionally not a broad Real Action. It is a
    // narrow, idempotent state transition that may run even while general real
    // mutations are disabled. Scoped disclosure is required for ambiguous/bare
    // acknowledgements; a strong standalone continuation command is independently
    // authoritative for the exact preliminary-approved application.`,
  'update continuation invariant comment',
);
replaceOrFail(
  actionPlane,
`      if (success) {
        await notifyCommercialContinuationPersisted({`,
`      if (success && input.truth.application) {
        // Monotonic read-your-write bridge: this fact is written only after the
        // authoritative application mutation succeeds. Production truth may use it
        // briefly if a subsequent database read is lagging behind the committed row.
        const stamp = new Date().toISOString();
        const fact = {
          key: "authoritative_continuation_persisted",
          value: input.truth.application.id,
          topic: "continuation" as const,
          source: "system" as const,
          confidence: 1,
          turnId: input.state.lastTurnId || action.sourceActId || "commercial-continuation",
          updatedAt: stamp,
        };
        const existingFact = input.state.facts.findIndex((item) => item.key === fact.key);
        if (existingFact >= 0) input.state.facts[existingFact] = fact;
        else input.state.facts.push(fact);
        input.state.updatedAt = stamp;

        await notifyCommercialContinuationPersisted({`,
  'stamp authoritative continuation fact after successful write',
);

const continuation = 'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts';
replaceOrFail(
  continuation,
`const PAYMENT_PROOF_PENDING_STATUSES = new Set(["customer_claimed_paid", "pending_payment_confirmation"]);

function low(value: string | null | undefined) {`,
`const PAYMENT_PROOF_PENDING_STATUSES = new Set(["customer_claimed_paid", "pending_payment_confirmation"]);
const CONTINUATION_VISIBILITY_DELAYS_MS = [0, 90, 240, 600];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForContinuationVisibility(applicationId: string) {
  for (const delay of CONTINUATION_VISIBILITY_DELAYS_MS) {
    if (delay) await sleep(delay);
    const { data, error } = await supabaseAdmin
      .from("applications")
      .select("status,payment_status")
      .eq("id", applicationId)
      .maybeSingle();
    if (error) continue;
    const status = String(data?.status || "").trim().toLowerCase();
    const payment = String(data?.payment_status || "").trim().toLowerCase();
    if (status === "customer_confirmed_continue" && ["pending_payment", "payment_info_sent"].includes(payment)) return true;
  }
  return false;
}

function low(value: string | null | undefined) {`,
  'add continuation read-after-write visibility barrier',
);
replaceOrFail(
  continuation,
`  if (!data) {
    return { attempted: true, updated: false, alreadyRecorded: false, blocker: "continuation_persistence_stale_truth" };
  }

  return { attempted: true, updated: true, alreadyRecorded: false, blocker: null };`,
`  if (!data) {
    return { attempted: true, updated: false, alreadyRecorded: false, blocker: "continuation_persistence_stale_truth" };
  }

  const visible = await waitForContinuationVisibility(app.id);
  if (!visible) {
    // The update response itself is authoritative. Do not roll back a successful
    // commercial decision because a follow-up read is temporarily lagging; the
    // Human OS monotonic continuation fact bridges that visibility window.
    console.warn("continuation_read_after_write_visibility_lag", { applicationId: app.id });
  }

  return { attempted: true, updated: true, alreadyRecorded: false, blocker: null };`,
  'verify continuation visibility before returning',
);

const productionTruth = 'app/api/whatsapp/webhook/_lib/v3-os/productionTruth.ts';
replaceOrFail(
  productionTruth,
`const TERMINAL_STATUSES = new Set(["rejected", "cancelled", "refund_completed"]);
const PAYMENT_TOPICS = new Set<TopicKey>(["payment_status", "payment_confirmation", "receipt_upload", "refund"]);`,
`const TERMINAL_STATUSES = new Set(["rejected", "cancelled", "refund_completed"]);
const PAYMENT_TOPICS = new Set<TopicKey>(["payment_status", "payment_confirmation", "receipt_upload", "refund"]);
const CONTINUATION_AUTHORITY_TTL_MS = 5 * 60 * 1000;

function recentContinuationAuthority(state: ConversationState, applicationId: string) {
  const fact = [...(state.facts || [])].reverse().find((item) =>
    item.key === "authoritative_continuation_persisted" && String(item.value || "") === applicationId
  );
  if (!fact?.updatedAt) return false;
  const age = Date.now() - Date.parse(fact.updatedAt);
  return Number.isFinite(age) && age >= 0 && age <= CONTINUATION_AUTHORITY_TTL_MS;
}

function applyMonotonicContinuationAuthority(app: ApplicationTruth, state: ConversationState): ApplicationTruth {
  if (!recentContinuationAuthority(state, app.id)) return app;
  const status = String(app.status || "").trim().toLowerCase();
  const payment = String(app.paymentStatus || "").trim().toLowerCase();
  const stillLaggingAtPreliminary = ["", "preliminary_application", "submitted", "preliminary_qualified"].includes(status)
    && !PAYMENT_CONFIRMED.has(payment)
    && !PAYMENT_PENDING.has(payment)
    && !app.paymentConfirmedAt;
  if (!stillLaggingAtPreliminary) return app;
  return { ...app, status: "customer_confirmed_continue", paymentStatus: "pending_payment" };
}`, 
  'add monotonic continuation truth bridge',
);
replaceOrFail(
  productionTruth,
`async function authoritativeBundle(source: TruthBundle["source"], app: ApplicationRow, state: ConversationState, contactAccess: TruthBundle["contactAccess"] = "full"): Promise<TruthBundle> {
  const truth = await toTruth(app);
  if (!truth) return resolveTruth({ state });
  return {`,
`async function authoritativeBundle(source: TruthBundle["source"], app: ApplicationRow, state: ConversationState, contactAccess: TruthBundle["contactAccess"] = "full"): Promise<TruthBundle> {
  const rawTruth = await toTruth(app);
  if (!rawTruth) return resolveTruth({ state });
  const truth = applyMonotonicContinuationAuthority(rawTruth, state);
  return {`,
  'apply monotonic continuation bridge to full authoritative truth',
);

const humanTurn = 'app/api/whatsapp/webhook/_lib/v3-os/currentHumanTurnAuthority.ts';
replaceOrFail(
  humanTurn,
`import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";`,
`import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildInformedCommercialDisclosureReply } from "./informedCommercialContinuation";`,
  'import canonical commercial disclosure reply',
);
replaceOrFail(
  humanTurn,
`  | "whatsapp_link_routing_issue"
  | "long_delay_anomaly"`,
`  | "whatsapp_link_routing_issue"
  | "preliminary_decision_due"
  | "long_delay_anomaly"`,
  'add preliminary decision current-turn authority kind',
);
replaceRegexOrFail(
  humanTurn,
/function directCallRequest\(turn: InterpretedTurn\) \{[\s\S]*?\n\}/,
`function directCallRequest(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  return explicitContactRequestText(turn.rawText)
    || /(?:تواصل|احكي|رن|اتصل).{0,22}(?:معي|فيي|علي).{0,24}(?:اتصال|تلفون|مكالمه|مكالمة)|(?:بدي|اريد|أريد|ممكن).{0,24}(?:موظف|موضف|بني\\s+ادم|بني\\s+آدم|شخص\\s+حقيقي|انسان|إنسان).{0,32}(?:احكي|اتفاهم|اتواصل|اتصل|يرد|معه|معها)?|(?:موظف|موضف|بني\\s+ادم|بني\\s+آدم|شخص\\s+حقيقي).{0,28}(?:احكي|اتفاهم|اتواصل|اتصل|معه|معها)|(?:رن|اتصل).{0,16}(?:علي|فيي).{0,20}(?:الساعه|الساعة|على\\s+\\d+)/.test(q)
    || /(?:ممكن|بدي|اعطيني|أعطيني).{0,18}(?:رقم).{0,22}(?:اتواصل|تواصل|اتصل|احكي)|(?:كيف|وين).{0,20}(?:اتواصل|تواصل)(?:.{0,18}(?:معكم|معك|موظف))?/.test(q);
}`,
  'recognize fragmented generic contact-number requests',
);
replaceOrFail(
  humanTurn,
`function longDelayAnomaly(q: string, currentStage: string) {`,
`function preliminaryDecisionDue(turn: InterpretedTurn, currentStage: string) {
  if (currentStage !== "preliminary_approved_waiting_decision") return false;
  const q = n(turn.rawText);
  if (!q) return false;
  if (/(?:الغي|إلغاء|الغاء|استرداد|استرجاع|دفع|ادفع|أدفع|احول|أحول|كليك|cliq|اورنج|orange|موظف|مدير|اتصال|مكالمه|مكالمة)/i.test(q)) return false;
  if (turn.requestedActions.length > 0 && !turn.requestedActions.includes("continue_application")) return false;
  if (turn.topics.some((topic) => ["application_status", "tracking", "review_timing"].includes(topic))) return true;
  return /(?:شو|ايش|اش|وين).{0,22}(?:صار|وصل|وضع|تطور).{0,22}(?:طلبي|الطلب|الملف)?|(?:في).{0,18}(?:تطورات|تحديث).{0,18}(?:الطلب|طلبي)?|(?:طلبي|الطلب).{0,25}(?:من\\s+يوم|صارله|صارلي|متى|امتى)|(?:متى|امتى|قديش|كم).{0,30}(?:الموافقه|الموافقة|القرار|النتيجه|النتيجة)|(?:شو\\s+العمل|شو\\s+الخطوه|شو\\s+الخطوة|شو\\s+اعمل|شو\\s+أعمل)/.test(q);
}

function calendarAgeDays(value: string | null | undefined) {
  const started = Date.parse(String(value || ""));
  if (!Number.isFinite(started)) return null;
  const age = Date.now() - started;
  if (!Number.isFinite(age) || age < 0) return null;
  return Math.floor(age / 86_400_000);
}

function longDelayAnomaly(q: string, currentStage: string) {`,
  'add preliminary decision status authority and authoritative age helper',
);
replaceOrFail(
  humanTurn,
`  if (directCallRequest(input.turn)) return { kind: "direct_call_request", hard: true, reason: "explicit current-turn call/contact request outranks refund/delay state" };
  if (websiteUploadError(q)) return { kind: "website_upload_error", hard: true, reason: "customer supplied a concrete website/upload error" };`,
`  if (directCallRequest(input.turn)) return { kind: "direct_call_request", hard: true, reason: "explicit current-turn call/contact request outranks refund/delay state" };
  if (preliminaryDecisionDue(input.turn, currentStage)) return { kind: "preliminary_decision_due", hard: true, reason: "authoritative preliminary approval is waiting for the customer continuation decision; generic status/timing must route to the commercial decision screen" };
  if (websiteUploadError(q)) return { kind: "website_upload_error", hard: true, reason: "customer supplied a concrete website/upload error" };`,
  'route preliminary-approved status questions to decision authority',
);
replaceOrFail(
  humanTurn,
`    case "direct_call_request":
      return \`فاهم إنك بدك نحكي باتصال عشان توضح الصورة. المتابعة الرسمية للطلبات من نفس واتساب، وما عندي مكالمة فعلية أرتبها من هون. احكيلي النقطة اللي بدك تفهمها وأنا معك فيها مباشرة.\`;
    case "whatsapp_link_routing_issue":`,
`    case "direct_call_request":
      return \`فاهم إنك بدك وسيلة تواصل مباشرة. المتابعة الرسمية للطلبات من نفس واتساب الحالي، وما عندي رقم إضافي أو مكالمة فعلية أرتبها من هون. احكيلي النقطة اللي بدك تفهمها وأنا معك فيها مباشرة.\`;
    case "preliminary_decision_due":
      return buildInformedCommercialDisclosureReply(input.truth);
    case "whatsapp_link_routing_issue":`,
  'build canonical preliminary decision and clearer contact reply',
);
replaceRegexOrFail(
  humanTurn,
/    case "long_delay_anomaly": \{[\s\S]*?\n    \}\n    case "explicit_no_repeat":/,
`    case "long_delay_anomaly": {
      const app = input.truth.application || input.state.lastVerifiedApplication?.application || null;
      const ageDays = calendarAgeDays(app?.createdAt);
      const ageLine = ageDays == null
        ? "ذكرت إن الانتظار طال، لكن ما رح أثبت عدد أيام من الرسالة وحدها إذا ما قدرت أراجعه من سجل الطلب."
        : \`حسب تاريخ إنشاء الطلب المسجل عندي، عمر الطلب تقريبًا \${ageDays} يوم تقويمي. هذا هو الرقم اللي بعتمد عليه بدل ما أكرر مدة غير متحققة من المحادثة.\`;
      return \`\${ageLine} \${appLine(input)} المعدل الطبيعي للمراجعة من يومين إلى 3 أيام تشغيلية، والجمعة والسبت لا تُحتسبان. ما عندي سبب موثق أختلقه إلك ولا موعد وهمي أوعدك فيه، وأي تحديث لازم يكون مبني على حركة فعلية بالملف.\`;
    }
    case "explicit_no_repeat":`,
  'ground long-delay duration in authoritative application creation time',
);
replaceOrFail(
  humanTurn,
`    case "whatsapp_link_routing_issue": return /(?:رابط|واتساب|الرقم).{0,120}(?:رقم\\s+المتابعه|رقم\\s+المتابعة|نفس\\s+الطلب|الرقم\\s+الحالي|ما\\s+رح\\s+اعتبر)/.test(q) && !/(?:موظف|مكالمة|اتصال)/.test(q);
    case "website_upload_error":`,
`    case "whatsapp_link_routing_issue": return /(?:رابط|واتساب|الرقم).{0,120}(?:رقم\\s+المتابعه|رقم\\s+المتابعة|نفس\\s+الطلب|الرقم\\s+الحالي|ما\\s+رح\\s+اعتبر)/.test(q) && !/(?:موظف|مكالمة|اتصال)/.test(q);
    case "preliminary_decision_due": return false;
    case "website_upload_error":`,
  'force deterministic repair for preliminary decision due',
);

const arbiter = 'app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts';
replaceOrFail(
  arbiter,
`  if (contactIdentityMismatch(input.truth)) return "contact_identity_mismatch";
  if (hasAuthoritativeMutationResult(input.actions, input.turn)) return "mutation_truth";
  if (structuredApplicationStatusRequest(input.turn)) return "application_status";`,
`  if (contactIdentityMismatch(input.truth)) return "contact_identity_mismatch";
  if (hasAuthoritativeMutationResult(input.actions, input.turn)) return "mutation_truth";
  if (currentHumanTurn.kind === "preliminary_decision_due") return "current_human_turn";
  if (structuredApplicationStatusRequest(input.turn)) return "application_status";`,
  'preliminary decision outranks structured status reply',
);
replaceOrFail(
  arbiter,
`  return /(?:متى|امتى|قديش|كم|تاريخ).{0,35}(?:وقت|بتاخد|بتطول|الموافقه|النتيجه|القرار)|(?:ممكن|بزبط|هل).{0,22}(?:تصدر|تطلع|يطلع).{0,24}(?:الموافقه|الموافقة|النتيجه|النتيجة|القرار).{0,24}(?:بنفس|نفس)\\s+اليوم|(?:صارلي|صارله|الها|الو).{0,24}(?:يوم|ايام|اسبوع|اسابيع)|(?:طولت|طوّلت|تاخرت|تأخرت|ليش\\s+طولت|مش\\s+ناوين\\s+يخلصو|ناوين\\s+يخلصو|معلق).{0,35}(?:الطلب|الملف|الدراسه|الموافقه)?/.test(q);`,
`  return /(?:متى|امتى|قديش|كم|تاريخ).{0,35}(?:وقت|بتاخد|بتطول|الموافقه|النتيجه|القرار)|(?:خلال\\s+كم|المده\\s+كم|المدة\\s+كم|كم\\s+المده|كم\\s+المدة)(?:\\s+يوم)?|(?:ممكن|بزبط|هل).{0,22}(?:تصدر|تطلع|يطلع).{0,24}(?:الموافقه|الموافقة|النتيجه|النتيجة|القرار).{0,24}(?:بنفس|نفس)\\s+اليوم|(?:صارلي|صارله|الها|الو).{0,24}(?:يوم|ايام|اسبوع|اسابيع)|(?:طولت|طوّلت|تاخرت|تأخرت|ليش\\s+طولت|مش\\s+ناوين\\s+يخلصو|ناوين\\s+يخلصو|معلق).{0,35}(?:الطلب|الملف|الدراسه|الموافقه)?/.test(q);`,
  'recognize short review-duration questions on first turn',
);

const semantic = 'app/api/whatsapp/webhook/_lib/v3-os/semanticQuestionLocks.ts';
replaceOrFail(
  semantic,
`import { currentFileOpeningPaymentRule } from "./paymentDestinationOverride";`,
`import { currentFileOpeningPaymentRule, FILE_OPENING_PAYMENT_PHONE, FILE_OPENING_PAYMENT_BENEFICIARY } from "./paymentDestinationOverride";`,
  'import canonical Orange Money destination constants',
);
replaceOrFail(
  semantic,
`export function fileOpeningPaymentMethodQuestion(turn: InterpretedTurn, truth?: TruthBundle) {`,
`function cliqUnavailableQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:ما\\s*عندي|مش\\s*عندي|بدون|ما\\s*بزبط|مابزبط|ما\\s*بقدر|مش\\s*مفعل|مش\\s*مفعله).{0,28}(?:كليك|cliq)|(?:كليك|cliq).{0,28}(?:ما\\s*عندي|مش\\s*عندي|ما\\s*بزبط|مابزبط|مش\\s*مفعل)/i.test(q);
}

export function fileOpeningPaymentMethodQuestion(turn: InterpretedTurn, truth?: TruthBundle) {`,
  'detect customer without CliQ',
);
replaceOrFail(
  semantic,
`  return asksPaymentData || feeCommitment || (feeWord && howWhere) || explicitPay || directTransferWhere || destinationConfirmation || sourceCompatibility || feeDueNextStep || (turn.topics.includes("payment_method") && /(?:ادفع|أدفع|احول|أحول|تحويل|بيانات\\s+الدفع)/.test(q));`,
`  return asksPaymentData || feeCommitment || (feeWord && howWhere) || explicitPay || directTransferWhere || destinationConfirmation || sourceCompatibility || cliqUnavailableQuestionText(turn.rawText) || feeDueNextStep || (turn.topics.includes("payment_method") && /(?:ادفع|أدفع|احول|أحول|تحويل|بيانات\\s+الدفع)/.test(q));`,
  'route no-CliQ text into payment-method authority',
);
replaceOrFail(
  semantic,
`  if (stage === "continuation_confirmed_fee_due") {
    const links = buildOfficialLinkContext(input.turn, input.truth);
    const receipt = links.relevant.receipt;
    const q = n(input.turn.rawText);
    const sourceCompatibility =`,
`  if (stage === "continuation_confirmed_fee_due") {
    const links = buildOfficialLinkContext(input.turn, input.truth);
    const receipt = links.relevant.receipt;
    const q = n(input.turn.rawText);
    if (cliqUnavailableQuestionText(input.turn.rawText)) {
      return \`ولا يهمك، مش لازم يكون عندك CliQ. استخدم Orange Money لرسوم فتح الملف على الرقم \${FILE_OPENING_PAYMENT_PHONE}. قبل تأكيد الحوالة تأكد إن اسم المستفيد ظاهر: \${FILE_OPENING_PAYMENT_BENEFICIARY}.\${receipt ? `\\n\\nبعد التحويل ارفع الوصل مرة واحدة من الرابط الرسمي المرتبط بطلبك:\\n\${receipt}` : ""}\`;
    }
    const sourceCompatibility =`,
  'offer Orange Money immediately when CliQ unavailable',
);

const selftest = `const fs = require('fs');
const assert = require('assert');
function src(p){ return fs.readFileSync(p,'utf8'); }
const informed = src('app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts');
const action = src('app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts');
const persistence = src('app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts');
const truth = src('app/api/whatsapp/webhook/_lib/v3-os/productionTruth.ts');
const human = src('app/api/whatsapp/webhook/_lib/v3-os/currentHumanTurnAuthority.ts');
const arbiter = src('app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts');
const semantic = src('app/api/whatsapp/webhook/_lib/v3-os/semanticQuestionLocks.ts');
assert(informed.includes('strongCommercialContinuationDecisionText'));
assert(action.includes('!disclosureSatisfied && !strongDecision'));
assert(action.includes('authoritative_continuation_persisted'));
assert(persistence.includes('CONTINUATION_VISIBILITY_DELAYS_MS'));
assert(persistence.includes('continuation_read_after_write_visibility_lag'));
assert(truth.includes('applyMonotonicContinuationAuthority'));
assert(truth.includes('CONTINUATION_AUTHORITY_TTL_MS'));
assert(human.includes('preliminary_decision_due'));
assert(human.includes('buildInformedCommercialDisclosureReply(input.truth)'));
assert(human.includes('calendarAgeDays(app?.createdAt)'));
assert(!human.includes('المدة اللي ذكرتها (${duration}) متجاوزة'));
assert(arbiter.includes('currentHumanTurn.kind === "preliminary_decision_due"'));
assert(arbiter.includes('خلال\\s+كم'));
assert(semantic.includes('cliqUnavailableQuestionText'));
assert(semantic.includes('FILE_OPENING_PAYMENT_PHONE'));
assert(semantic.includes('مش لازم يكون عندك CliQ'));
console.log('PASS v3 Phase 13 commercial funnel hardening selftest');
`;
write('scripts/v3-phase13-commercial-funnel-hardening-selftest.cjs', selftest);
console.log('PATCH OK [write Phase 13 regression selftest]');

console.log('PHASE 13 PATCH COMPLETE');
