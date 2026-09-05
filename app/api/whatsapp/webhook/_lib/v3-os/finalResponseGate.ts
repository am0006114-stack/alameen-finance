import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { containsRestrictedPaymentExecutionDetail, paymentDisclosureDecision } from "./paymentEligibilityFirewall";
import { normalizeArabic } from "./text";
import type { ActionResult, ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type FinalResponseGateResult = {
  pass: boolean;
  violations: string[];
  replacementReply: string | null;
  severity: "none" | "warning" | "p0";
};

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

function roboticPhrase(reply: string) {
  const n = normalized(reply);
  return /الطلب\s+AM-\d+\s+مربوط\s+(?:بالمحادثه|بالمحادثة)|احكيلي\s+النقطه\s+اللي\s+بدك\s+تعرفها|إذا\s+في\s+نقطه\s+محدده\s+بالطلب|اذا\s+في\s+نقطه\s+محدده\s+بالطلب|إذا\s+سؤالك\s+عن\s+طلب\s+سابق\s+ابعث\s+رقم\s+التتبع|اذا\s+سؤالك\s+عن\s+طلب\s+سابق\s+ابعث\s+رقم\s+التتبع|ما\s+في\s+تحديث\s+جديد\s+عن\s+آخر\s+حاله|ما\s+في\s+تحديث\s+جديد\s+عن\s+آخر\s+حالة|على\s+الموجود\s+فعليا\s+بدون\s+ما\s+الفك\s+بنفس\s+الكلام/.test(n);
}

function directProductAvailabilityQuestion(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:متوفر|موجود|في\s+عندكم|عندكم).{0,35}(?:ايفون|آيفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|جهاز)|(?:ايفون|آيفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno).{0,35}(?:متوفر|موجود|عندكم)/i.test(q);
}

function trustConcern(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("trust") || turn.topics.includes("complaint") || /(?:نصب|نصاب|مصداقيه|مصداقية|اضمن|أضمن|يضمن|ثقه|ثقة|مسجلين\s+قانون|قانونيا|قانونيًا|خايف|خايفة|متخوف)/.test(q);
}

function customerClaimsPaid(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:دفعت|دافع|حولت|حوّلت|تم\s+الدفع|رفعت\s+الوصل|بعثت\s+الوصل)/.test(q);
}

function humanRequest(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("human_request") || /(?:بدي|اريد|أريد).{0,28}(?:شخص|موظف|حدا|انسان|إنسان).{0,25}(?:احكي|أحكي|اتكلم|يرد)|(?:حولني|حوّلني).{0,20}(?:موظف|شخص|الاداره|الإدارة)/.test(q);
}

function reviewTimingQuestion(turn: InterpretedTurn) {
  return turn.topics.includes("review_timing") || /(?:متى|امتى|ايمتى).{0,45}(?:ترد|تحكو|تحكولي|خبر|موافق|قرار|يخلص|تخلص|يطلع)|(?:قبلتو|قبلتوه).{0,25}(?:طلبي|الطلب)?/.test(normalized(turn.rawText));
}

function executedUnrequestedScopedMutation(actions: ActionResult[], turn: InterpretedTurn) {
  const requested = new Set(turn.requestedActions);
  return actions.find((x) => x.executed
    && ["cancel_application", "request_refund", "stop_refund", "reopen_application", "change_device", "change_application_data"].includes(x.action)
    && !requested.has(x.action)) || null;
}

function hasAlienTracking(reply: string, truth: TruthBundle) {
  const current = truth.application?.trackingId ? String(truth.application.trackingId).toUpperCase() : null;
  if (!current) return false;
  const ids = Array.from(String(reply || "").matchAll(/\bAM-\d{8,}\b/gi)).map((m) => m[0].toUpperCase());
  return ids.some((id) => id !== current);
}

function buildReviewTimingReply(input: { truth: TruthBundle; state: ConversationState }) {
  const app = input.truth.application;
  const p = input.truth.policy;
  const pendingManual = String(input.state.pendingActionPayload?._manualStatus || "") === "awaiting_admin" ? input.state.pendingAction : null;
  if (pendingManual) {
    const labels: Record<string,string> = {
      reopen_application: "إعادة فتح الطلب",
      stop_refund: "إيقاف الاسترداد",
      change_device: "تعديل الجهاز وإعادة الحسبة",
      change_application_data: "تعديل بيانات الطلب",
      cancel_application: "إلغاء الطلب",
      request_refund: "طلب الاسترداد",
    };
    return `طلب ${labels[pendingManual] || "التعديل"} بانتظار تنفيذ الإدارة على نفس الملف. ما عندي وقت ثابت وموثق لتنفيذه، لذلك ما بدي أعطيك موعد من عندي. الحالة الحالية ما بتتغير عندي إلا بعد التنفيذ الفعلي.`;
  }
  if (!app) return `المعدل الطبيعي للمراجعة ${p.normalReviewWindow}، وحاليًا في ضغط مراجعات شديد. إذا بدك مدة تخص طلبك نفسه لازم يكون الطلب مربوط بشكل موثوق أولًا.`;
  const stage = applicationJourneyStage(app);
  if (stage === "cancelled") return "الطلب متوقف/ملغي حاليًا، لذلك ما في مراجعة فعالة ماشية عليه الآن. إذا كان في طلب إعادة فتح، بضل بانتظار التنفيذ الفعلي قبل ما أحكي عن مدة مراجعة جديدة.";
  if (stage === "refund_requested") return "الاسترداد مسجل وقيد المعالجة. ما عندي موعد تحويل ثابت وموثق أقدر أضمنه، وبعتمد فقط التنفيذ الفعلي لما يتم.";
  if (stage === "preliminary_approved_waiting_decision") return `الموافقة المبدئية صدرت، لكن الدراسة النهائية ما بتبدأ قبل اختيار الاستمرار وفتح الملف. بعد هالخطوة المعدل الطبيعي للمراجعة ${p.normalReviewWindow}، وحاليًا في ضغط مراجعات قد يطيل بعض الملفات.`;
  return `طلبك ${customerFacingStatusLabel(app)}. المعدل الطبيعي للمراجعة ${p.normalReviewWindow}، لكن حاليًا في ضغط مراجعات شديد وبعض الملفات بتتأخر أكثر من الطبيعي. ما عندي موعد نهائي موثق أقدر أضمنه.`;
}

function buildProductReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const products = links.relevant.products || "https://www.ameenfinance.co/products";
  return `التوفر والسعر الحاليين مرجعهم صفحة المنتجات الرسمية، وما بدي أأكد موديل معيّن من غير بيانات محدثة. شوف الأجهزة الموجودة مباشرة من هون:\n${products}`;
}

function buildTrustReply(input: { truth: TruthBundle }) {
  return `مفهوم تخوفك، خصوصًا مع كثرة حالات الاحتيال. اللي بقدر أؤكده بدون مبالغة: ${input.truth.policy.independenceStatement} كل خطوة على الطلب بنعتمدها من حالته الفعلية، وما بنعتبر دفع أو تعديل أو موافقة نهائية تمت إلا إذا كانت مثبتة فعليًا. إذا عندك نقطة محددة مخوفتك احكيها وبجاوبك عليها مباشرة.`;
}

function buildStatusReply(input: { truth: TruthBundle }) {
  const app = input.truth.application;
  if (!app) return "ما عندي طلب موثوق مربوط بهالرسالة هسا، وما بدي أخمّن عليك بحالة طلب غير مؤكدة.";
  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_approved_waiting_decision") {
    return `طلبك أخذ موافقة مبدئية ولسا مش نهائية. إذا بدك تكمل للدراسة النهائية، الخطوة التالية فتح الملف ورسومه ${input.truth.policy.fileOpeningFeeJod} دنانير؛ منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. إذا بدك نكمل اكتبلي: أود الاستمرار.`;
  }
  if (stage === "preliminary_review") return "طلبك قيد المراجعة المبدئية، وما في خطوة دفع أو حضور مطلوبة منك هسا.";
  if (["final_review", "under_review"].includes(stage)) return "طلبك قيد الدراسة النهائية، وما في خطوة ناقصة منك حسب الحالة الحالية. أول شي منتظره هسا هو قرار المراجعة النهائية.";
  if (stage === "refund_requested") return "طلب الاسترداد مسجل وقيد المعالجة، وما في خطوة ناقصة منك حسب الحالة الحالية.";
  if (stage === "cancelled") return "الطلب متوقف/ملغي حاليًا، وما في دراسة فعالة ماشية عليه الآن.";
  return `حالة طلبك الآن: ${customerFacingStatusLabel(app)}.`;
}

function buildReplacement(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  paymentViolation: boolean;
}) {
  const decision = paymentDisclosureDecision({
    application: input.truth.application,
    customerText: input.turn.rawText,
    explicitContinuationThisTurn: input.turn.requestedActions.includes("continue_application") || input.turn.topics.includes("continuation"),
  });
  if (input.paymentViolation) {
    if (decision.alreadyPaid) return "الدفع مؤكد إداريًا على طلبك، فما في داعي لأي دفعة أو وصل جديد. الملف مكمل بالمرحلة المسجلة عليه.";
    if (decision.receiptPending) return "وصل الدفع موجود على الملف وبانتظار مراجعة الإدارة، فما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية.";
    if (applicationJourneyStage(input.truth.application) === "preliminary_approved_waiting_decision") return `الموافقة الحالية مبدئية. رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير بتصير فقط إذا اخترت الاستمرار، وهي منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. تفاصيل التحويل بنعطيك إياها بعد قرار الاستمرار.`;
    return `رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير مرتبطة بمرحلة ما بعد الموافقة المبدئية واختيار الاستمرار. ما رح أعطيك بيانات تحويل قبل ما تكون الخطوة مفتوحة فعليًا على الطلب.`;
  }
  if (customerClaimsPaid(input.turn)) {
    if (decision.alreadyPaid) return "تمام، الدفع مؤكد إداريًا على طلبك، فما في داعي تعيد الدفع أو ترفع وصل جديد.";
    if (decision.receiptPending) return "تمام، الوصل موجود على الملف وبانتظار اعتماد الإدارة، فما في داعي تعيد الدفع أو ترفعه مرة ثانية.";
    return "وصلتني إنك بتقول إنك دفعت. الرسالة نفسها ما بتعتبر تأكيد دفع إداري، وبنفس الوقت ما رح أطلب منك تدفع مرة ثانية لمجرد إن التأكيد ما ظهر عندي هسا. بعتمد حالة الدفع الفعلية على الملف أول ما تتحدث.";
  }
  if (directProductAvailabilityQuestion(input.turn)) return buildProductReply({ turn: input.turn, truth: input.truth });
  if (reviewTimingQuestion(input.turn)) return buildReviewTimingReply({ truth: input.truth, state: input.state });
  if (trustConcern(input.turn)) return buildTrustReply({ truth: input.truth });
  if (humanRequest(input.turn)) return "فاهم إنك بدك تحكي مع شخص مباشرة. المتابعة الرسمية لدى الأمين للطلب من نفس واتساب، وما رح أوهمك بتحويل أو اتصال إذا ما في تحويل فعلي. احكيلي شو الإجراء أو المعلومة اللي بدك إياها وبعطيك الجواب الموجود على الطلب بدون تدوير.";
  return buildStatusReply({ truth: input.truth });
}

/**
 * Final deterministic egress gate. The writer/verifier can improve language,
 * but this gate owns the last word on application scope, payment disclosure,
 * unsupported trust claims, and known robotic escape phrases.
 */
export function enforceFinalResponseGate(input: {
  reply: string | null;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  actions: ActionResult[];
  applicationChanged: boolean;
}) : FinalResponseGateResult {
  const reply = String(input.reply || "").trim();
  const violations: string[] = [];
  let severity: "none" | "warning" | "p0" = "none";

  const paymentDecision = paymentDisclosureDecision({
    application: input.truth.application,
    customerText: input.turn.rawText,
    explicitContinuationThisTurn: input.turn.requestedActions.includes("continue_application") || input.turn.topics.includes("continuation"),
  });
  const paymentLeak = Boolean(reply && containsRestrictedPaymentExecutionDetail(reply, input.truth.policy) && !paymentDecision.paymentExecutionDetailsAllowed);
  if (paymentLeak) {
    violations.push(`payment_execution_details_not_allowed:${paymentDecision.reason}`);
    severity = "p0";
  }
  if (reply && roboticPhrase(reply)) violations.push("robotic_escape_phrase");
  if (directProductAvailabilityQuestion(input.turn) && /(?:ابعث|ابعت|ارسل|أرسل).{0,35}(?:رقم\s+التتبع|رقم\s+الطلب)/.test(normalized(reply))) violations.push("product_question_wrong_tracking_fallback");
  if (trustConcern(input.turn) && /(?:جهة\s+معروفه|جهة\s+معروفة|مسجلين\s+قانونيا|مسجلين\s+قانونيًا|مرخصين|مرخصة)/.test(normalized(reply))) violations.push("unsupported_trust_or_registration_claim");
  if (customerClaimsPaid(input.turn) && /(?:لسه|لسا|ما).{0,40}(?:وصل|وصلت).{0,25}(?:مرحله|مرحلة).{0,25}(?:رسوم|الدفع)|(?:ما\s+في|لا\s+يوجد).{0,25}(?:مرحله|مرحلة).{0,20}(?:دفع|رسوم)/.test(normalized(reply))) {
    violations.push("customer_payment_claim_contradicted_by_stage_template");
  }
  if (input.applicationChanged && hasAlienTracking(reply, input.truth)) violations.push("old_application_tracking_leaked_after_switch");

  const crossApplicationMutation = input.applicationChanged ? executedUnrequestedScopedMutation(input.actions, input.turn) : null;
  if (crossApplicationMutation) {
    violations.push(`cross_application_mutation_executed:${crossApplicationMutation.action}`);
    severity = "p0";
  }

  const optOut = /(?:لا\s+ارغب|لا\s+أرغب|لا\s+اريد|لا\s+أريد|ما\s+بدي|مش\s+حاب).{0,35}(?:استمر|الاستمرار|اكمل|أكمل)/.test(normalized(input.turn.rawText));
  if (optOut && (containsRestrictedPaymentExecutionDetail(reply, input.truth.policy) || /(?:أود\s+الاستمرار|بدك\s+تكمل|هل\s+تود\s+الاستمرار)/.test(reply))) {
    violations.push("opt_out_must_not_trigger_continuation_or_payment");
    severity = "p0";
  }

  if (!reply) violations.push("empty_final_reply");
  if (violations.length && severity === "none") severity = "warning";

  return {
    pass: violations.length === 0,
    violations,
    replacementReply: violations.length ? buildReplacement({ turn: input.turn, state: input.state, truth: input.truth, paymentViolation: paymentLeak }) : null,
    severity,
  };
}
