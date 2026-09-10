import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { normalizeArabic } from "./text";
import { buildCurrentQuestionAnswerContractReply } from "./currentQuestionAnswerContract";
import { aiIdentityQuestionText, buildHumanFirstConversationAuthorityReply } from "./humanFirstConversationAuthority";
import type { ActionResult, ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type ResponseObligation =
  | "mutation_truth"
  | "tracking_link"
  | "contact_channel"
  | "application_exists"
  | "approval_status"
  | "review_timing"
  | "refund_meaning"
  | "general_eligibility"
  | "application_start"
  | "current_question_contract"
  | "identity"
  | "media"
  | "application_status"
  | "foreign_content_clarification"
  | "none";

export type ResponseArbitrationResult = {
  reply: string | null;
  obligation: ResponseObligation;
  repaired: boolean;
  reason: string;
};

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasExecutedMutation(actions: ActionResult[]) {
  return actions.some((a) => a.executed && ["cancel_application", "request_refund"].includes(a.action));
}

function hasCurrentSensitiveMutation(turn: InterpretedTurn) {
  if (turn.requestedActions.some((action) => [
    "cancel_application",
    "request_refund",
    "stop_refund",
    "reopen_application",
    "change_device",
    "change_application_data",
  ].includes(action))) return true;
  const q = n(turn.rawText);
  const explicitCancel = /^(?:الغي|الغاء|الغوا)\s*(?:الطلب|طلبي|المعامله)?$|(?:بدي|اريد|أريد|حاب).{0,18}(?:الغي|الغاء).{0,22}(?:الطلب|طلبي)/.test(q);
  const explicitRefund = /^(?:استرداد|استرجاع)$|(?:بدي|اريد|أريد|حاب).{0,20}(?:استرد|استرجع|استرداد|استرجاع)|(?:رجعلي|رجعولي).{0,18}(?:المبلغ|الرسوم|المصاري)/.test(q);
  return explicitCancel || explicitRefund;
}

function staleContinuationReply(reply: string | null | undefined) {
  const q = n(reply);
  return /(?:رغبتك|اختيارك|اختيار)\s+(?:بال)?(?:ال)?استمرار.{0,90}(?:مسجل|ما\s+في\s+داعي|جاوبني|بنكمل\s+من)/.test(q)
    || /(?:طلبك).{0,35}(?:موافقه\s+مبدئيه).{0,90}(?:اكتب|جاوبني).{0,20}(?:السؤال|النقطه|النقطة)/.test(q);
}

function missingDetailsReply(reply: string | null | undefined) {
  const q = n(reply);
  return /(?:تفاصيل\s+الطلب).{0,35}(?:مش|مو|غير).{0,20}(?:كامله|مكتمله)|(?:ما\s+عندي).{0,30}(?:طلب\s+موثوق|حاله\s+موثقه)|(?:حتى\s+اعطيك\s+حاله\s+صحيحه).{0,45}(?:ابعث|ارسل).{0,20}(?:رقم\s+التتبع|رقم\s+الطلب)/.test(q);
}

function repeatedKnownTrackingReply(reply: string | null | undefined) {
  const q = n(reply);
  return /رقم\s+الطلب\s+المرتبط\s+بالمحادثه.{0,80}(?:ما\s+رح\s+اطلبه|اكتب\s+سوالك|اكتب\s+سؤالك)/.test(q);
}

function noUpdateDeflection(reply: string | null | undefined) {
  const q = n(reply);
  return /ما\s+في\s+تحديث\s+جديد\s+عن\s+اخر\s+رد.{0,80}(?:نقطه\s+جديده|سوال\s+مختلف)/.test(q);
}

export function responseHasKnownBadFallbackSignature(reply: string | null | undefined) {
  return staleContinuationReply(reply) || missingDetailsReply(reply) || repeatedKnownTrackingReply(reply) || noUpdateDeflection(reply);
}

function asksTrackingLink(value: string | null | undefined) {
  const q = n(value);
  return /(?:اعطيني|ابعث|ابعت|ارسل|بدي|وين|كيف).{0,28}(?:رابط\s+التتبع|رابط).{0,25}(?:طلبي|الطلب)?|(?:كيف\s+اشوف|كيف\s+اتتبع|بدي\s+اتتبع).{0,22}(?:طلبي|الطلب)/.test(q);
}

function asksContactChannel(value: string | null | undefined, turn: InterpretedTurn) {
  const q = n(value);
  return turn.topics.includes("call_request")
    || /(?:رقم|وسيله|وسيلة).{0,18}(?:تواصل|اتصال)|(?:كيف|وين).{0,20}(?:اتواصل|احكي).{0,20}(?:موظف|حد|شخص)/.test(q);
}

function asksApplicationExists(value: string | null | undefined) {
  const q = n(value);
  return /(?:طلبي|الطلب).{0,24}(?:مقدم|مسجل|واصل|موجود).{0,20}(?:صح|ولا|او\s+لا|؟)?|(?:انا|هس|هسا|هل).{0,30}(?:طلبي|الطلب).{0,18}(?:مقدم|مسجل|موجود)/.test(q);
}

function asksApprovalStatus(value: string | null | undefined) {
  const q = n(value);
  if (/(?:متى|امتى|قديش|كم).{0,28}(?:موافقه|الموافقه|انقبل)/.test(q)) return false;
  return /(?:هل|يعني|طيب|هسا|هس).{0,28}(?:الطلب|طلبي).{0,24}(?:انقبل|مقبول|موافق\s+عليه)|(?:الطلب|طلبي).{0,26}(?:انقبل|مقبول|موافق\s+عليه).{0,20}(?:ولا|او\s+لا|صح)|(?:انقبل|انقبلت|طلعت\s+الموافقه|صدرت\s+الموافقه).{0,20}(?:ولا|او\s+لا|صح)?/.test(q);
}

function asksReviewTiming(value: string | null | undefined, turn: InterpretedTurn) {
  const q = n(value);
  if (turn.topics.includes("review_timing") || turn.topics.includes("operational_pressure")) return true;
  return /(?:متى|امتى|قديش|كم).{0,35}(?:وقت|بتاخد|بتطول|الموافقه|النتيجه|القرار)|(?:صارلي|صارله|الها|الو).{0,24}(?:يوم|ايام|اسبوع|اسابيع)|(?:طولت|طوّلت|تاخرت|تأخرت|ليش\s+طولت|مش\s+ناوين\s+يخلصو|ناوين\s+يخلصو|معلق).{0,35}(?:الطلب|الملف|الدراسه|الموافقه)?/.test(q);
}

function asksRefundMeaning(value: string | null | undefined) {
  const q = n(value);
  return /(?:شو|ايش|اش|ليش|ليه|لشو|ما\s+معنى|مغزى|مغزاه).{0,35}(?:الاسترداد|استرداد)|(?:الاسترداد|استرداد).{0,35}(?:شو|تبع\s+شو|ليش|ليه|لشو|يعني|معناه|مغزاه)/.test(q);
}

function asksGeneralEligibility(value: string | null | undefined) {
  const q = n(value);
  const asksCanApply = /(?:هل|ممكن|بقدر|اقدر|اگدر|بنفع|بصير).{0,35}(?:اقدم|التقديم|ينقبل|تقبلو|تقبلوا)|(?:تقبلو|تقبلوا|بتقبلو|بتقبلوا).{0,45}(?:هويه|هوية|اقامه|إقامة|جواز|طالب|سوري|مصري|اردنيه|أردنية)/.test(q);
  const specialProfile = /(?:سوري|مصري|اجنبي|أجنبي|مقيم|اقامه|إقامة|جواز\s+سفر|ابناء\s+اردنيات|أبناء\s+أردنيات|ما\s+عندي\s+رقم\s+وطني|بدون\s+رقم\s+وطني|طالب\s+جامعي)/.test(q);
  const incomeGap = /(?:ما\s+عندي|بدون|مش\s+عندي).{0,28}(?:كشف\s+راتب|شهاده\s+راتب|اثبات\s+دخل|إثبات\s+دخل)/.test(q);
  return asksCanApply || (specialProfile && (/(?:هل|ممكن|بقدر|اقدر|التقديم|تقسيط)/.test(q) || incomeGap));
}

function asksApplicationStart(value: string | null | undefined) {
  const q = n(value);
  return /(?:كيف|من\s+وين|وين).{0,25}(?:اقدم|أقدم|التقديم)|(?:بدي|اريد|أريد|حاب).{0,25}(?:اقدم|أقدم).{0,18}(?:طلب|تقسيط)|(?:رابط).{0,20}(?:التقديم|تقديم\s+طلب)/.test(q);
}

function isMediaEnvelope(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  return turn.topics.includes("receipt_upload")
    || /تم\s+استلام\s+(?:صوره|صورة|رساله\s+صوتيه|رسالة\s+صوتية|ملف)\s+من\s+العميل/.test(q);
}

function asksApplicationStatus(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  return turn.topics.includes("application_status") || turn.topics.includes("tracking")
    || /(?:شو|ايش|اش|وين).{0,20}(?:صار|وصل|وضع).{0,20}(?:طلبي|الطلب|الملف)|^(?:شو\s+صار|تحديث|في\s+تحديث)$/.test(q);
}

function pastedForeignContent(value: string | null | undefined) {
  const raw = String(value || "");
  if (raw.length < 80) return false;
  return /(?:dear\s+\w+|kind\s+regards|good\s+day|@\w+\.|http:\/\/|https:\/\/)/i.test(raw)
    && !/(?:ameenfinance|الأمين\s+للأقساط)/i.test(raw);
}

export function resolveResponseObligation(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  actions: ActionResult[];
}): ResponseObligation {
  if (hasExecutedMutation(input.actions) || hasCurrentSensitiveMutation(input.turn)) return "mutation_truth";
  if (asksTrackingLink(input.turn.rawText)) return "tracking_link";
  if (asksContactChannel(input.turn.rawText, input.turn)) return "contact_channel";
  if (asksApplicationExists(input.turn.rawText)) return "application_exists";
  if (asksApprovalStatus(input.turn.rawText)) return "approval_status";
  if (asksReviewTiming(input.turn.rawText, input.turn)) return "review_timing";
  if (asksRefundMeaning(input.turn.rawText)) return "refund_meaning";
  if (asksGeneralEligibility(input.turn.rawText)) return "general_eligibility";
  if (asksApplicationStart(input.turn.rawText)) return "application_start";
  if (buildCurrentQuestionAnswerContractReply({ turn: input.turn, state: input.state, truth: input.truth })) return "current_question_contract";
  if (aiIdentityQuestionText(input.turn.rawText)) return "identity";
  if (isMediaEnvelope(input.turn)) return "media";
  if (asksApplicationStatus(input.turn)) return "application_status";
  if (pastedForeignContent(input.turn.rawText)) return "foreign_content_clarification";
  return "none";
}

function trackingReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const link = links.relevant.tracking || `${links.baseUrl}/track`;
  const app = input.truth.application;
  if (app?.trackingId) return `أكيد، هذا رابط التتبع الرسمي لطلبك ${app.trackingId}:\n${link}`;
  return `أكيد، هذا رابط التتبع الرسمي:\n${link}`;
}

function applicationExistsReply(truth: TruthBundle) {
  const app = truth.application;
  if (app) return `نعم، طلبك${app.trackingId ? ` ${app.trackingId}` : ""} مسجل عندنا. حالته الآن: ${customerFacingStatusLabel(app)}.`;
  if (truth.ambiguousApplications.length > 1) return "عندي أكثر من طلب محتمل مرتبط بنفس السياق، فما بدي أقول نعم على طلب غلط. ابعث رقم التتبع للطلب المقصود وبعطيك حالته مباشرة.";
  return "ما ظهر عندي طلب موثوق أقدر أأكد إنه مسجل على نفس البيانات هسا. إذا عندك رقم تتبع ابعثه مرة واحدة وبراجع نفس الطلب مباشرة.";
}

function approvalReply(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return "ما عندي حالة طلب موثوقة أقدر أقول منها مقبول أو مرفوض. إذا عندك رقم تتبع ابعثه مرة واحدة وبعطيك الحالة الفعلية.";
  const stage = applicationJourneyStage(app);
  if (stage === "approved") return `نعم، طلبك${app.trackingId ? ` ${app.trackingId}` : ""} موافق عليه حسب الحالة الحالية.`;
  if (stage === "preliminary_approved_waiting_decision" || stage === "continuation_confirmed_fee_due" || stage === "payment_proof_pending_admin" || stage === "payment_confirmed_under_review") {
    const suffix = stage === "payment_confirmed_under_review" ? " والملف هسا قيد الدراسة النهائية." : stage === "payment_proof_pending_admin" ? " ووصل الدفع بانتظار اعتماد الإدارة." : stage === "continuation_confirmed_fee_due" ? " واختيار الاستمرار مسجل، لكن القرار النهائي لسا ما صدر." : " ولسا القرار النهائي ما صدر.";
    return `عندك موافقة مبدئية، مش موافقة نهائية.${suffix}`;
  }
  if (["cancelled", "refund_requested", "refund_completed"].includes(stage)) return `لا، الطلب الحالي مش بمسار موافقة؛ حالته الآن: ${customerFacingStatusLabel(app)}.`;
  if (stage === "preliminary_review") return "لسا لا؛ الطلب قيد المراجعة المبدئية، وما صدرت موافقة مبدئية أو نهائية حتى الآن.";
  return `الحالة الحالية للطلب: ${customerFacingStatusLabel(app)}. ما عندي قرار نهائي موثق غير هاي الحالة.`;
}

function reviewTimingReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const app = input.truth.application;
  const window = input.truth.policy.normalReviewWindow || "من يومين لـ3 أيام عمل";
  const pressure = input.truth.policy.severePressureRule || "حاليًا في ضغط مراجعات شديد وقد تتأخر بعض الملفات أكثر من المعدل الطبيعي.";
  if (!app) return `${window} هو المعدل الطبيعي للمراجعة، لكن ${pressure} ما بقدر أعطي موعد محدد بدون حالة طلب موثقة.`;
  const stage = applicationJourneyStage(app);
  if (stage === "approved") return `طلبك موافق عليه حسب الحالة الحالية، فمرحلة انتظار قرار الموافقة انتهت.`;
  if (["cancelled", "refund_requested", "refund_completed"].includes(stage)) return `طلبك مش بانتظار موافقة حاليًا؛ حالته: ${customerFacingStatusLabel(app)}.`;
  return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الآن ${customerFacingStatusLabel(app)}. ${window}، لكن ${pressure} ما عندي موعد نهائي مؤكد أقدر أوعدك فيه.`;
}

function refundMeaningReply(truth: TruthBundle) {
  const app = truth.application;
  const basic = "الاسترداد يعني إرجاع مبلغ مدفوع ومؤكد على الطلب بعد فتح مسار الإلغاء/الاسترداد؛ مش موافقة جديدة ولا خطوة لاستلام الجهاز.";
  if (!app) return basic;
  const stage = applicationJourneyStage(app);
  if (stage === "refund_requested") return `${basic} وبحالتك الحالية طلب الاسترداد مسجل وقيد المعالجة.`;
  if (stage === "refund_completed") return `${basic} وبحالتك الحالية الاسترداد مكتمل حسب النظام.`;
  if (stage === "cancelled") return `${basic} طلبك ملغي، لكن ما بقدر أقول إن في مبلغ راجع إلا إذا كان الدفع مؤكد على الملف.`;
  return `${basic} وحالة طلبك الحالية: ${customerFacingStatusLabel(app)}.`;
}

function generalEligibilityReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const guidance = input.truth.policy.requirementsGuidanceRule;
  const nationalitySpecific = /(?:سوري|مصري|اجنبي|مقيم|اقامه|إقامة|جواز\s+سفر|ابناء\s+اردنيات|أبناء\s+أردنيات|رقم\s+وطني)/.test(q);
  const noSalary = /(?:ما\s+عندي|بدون|مش\s+عندي).{0,28}(?:كشف\s+راتب|شهاده\s+راتب|اثبات\s+دخل)/.test(q);
  const prefix = nationalitySpecific
    ? "الجنسية أو نوع الوثيقة لحالها ما بتعطيني حق أضمن قبول أو رفض من واتساب؛ القرار النهائي حسب دراسة الملف والمتطلبات اللي يقبلها مسار التقديم."
    : "القبول ما بنضمنه من معلومة واحدة؛ القرار النهائي بيطلع بعد دراسة الملف.";
  const context = noSalary ? " وبما إنك ذكرت إن ما عندك إثبات دخل تقليدي، بنمشي على بدائل إثبات الدخل المسموحة ضمن الدراسة." : "";
  return `${prefix}${context} ${guidance}`.replace(/\s+/g, " ").trim();
}

function applicationStartReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  return `التقديم يبدأ من الموقع الرسمي: اختار الجهاز من صفحة المنتجات وكمل طلب الموافقة المبدئية، وبعد الإرسال بيطلع لك رقم تتبع.\n${links.relevant.products || `${links.baseUrl}/products`}`;
}

function statusReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const app = input.truth.application;
  if (!app) {
    if (input.truth.ambiguousApplications.length > 1) return "عندي أكثر من طلب محتمل، فحتى ما أعطيك حالة طلب ثاني ابعث رقم التتبع للطلب المقصود مرة واحدة.";
    return "ما ظهرت عندي حالة طلب موثوقة أقدر أعطيك تحديث عليها هسا. إذا عندك رقم تتبع ابعثه مرة واحدة وبراجع نفس الطلب مباشرة.";
  }
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const link = links.relevant.tracking;
  return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الآن: ${customerFacingStatusLabel(app)}.${link ? `\nللمتابعة: ${link}` : ""}`;
}

function directRepair(input: {
  obligation: ResponseObligation;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  actions: ActionResult[];
}) {
  const currentQuestion = buildCurrentQuestionAnswerContractReply({ turn: input.turn, state: input.state, truth: input.truth });
  const humanAuthority = buildHumanFirstConversationAuthorityReply({ turn: input.turn, state: input.state, truth: input.truth, actions: input.actions });
  switch (input.obligation) {
    case "tracking_link": return trackingReply(input);
    case "contact_channel": return "المتابعة الأساسية للطلبات من خلال واتساب الحالي. ما عندي رقم تواصل إضافي رسمي موثق أقدر أعطيك إياه.";
    case "application_exists": return applicationExistsReply(input.truth);
    case "approval_status": return approvalReply(input.truth);
    case "review_timing": return reviewTimingReply(input);
    case "refund_meaning": return refundMeaningReply(input.truth);
    case "general_eligibility": return generalEligibilityReply(input);
    case "application_start": return applicationStartReply(input);
    case "current_question_contract": return currentQuestion;
    case "identity": return humanAuthority || "معك فريق الأمين للأقساط من نفس المحادثة، واحكيلي المطلوب مباشرة وبجاوبك على قد السؤال.";
    case "media": return currentQuestion || humanAuthority || "وصلني المرفق. إذا هو لتوضيح مشكلة أو سؤال، اكتبلي باختصار شو بدك أتأكد منه منه وبمشي معك من نفس السياق.";
    case "application_status": return currentQuestion || statusReply(input);
    case "foreign_content_clarification": return "وصلني النص اللي بعثته. احكيلي شو بدك أعمل فيه بالضبط—أشرحه، ألخصه، أو أساعدك ترد عليه—وبجاوبك على نفس الموضوع.";
    default: return null;
  }
}

function candidateLooksResponsive(input: { obligation: ResponseObligation; candidate: string | null | undefined; truth: TruthBundle }) {
  const raw = String(input.candidate || "").trim();
  if (!raw) return false;
  if (responseHasKnownBadFallbackSignature(raw)) return false;
  const q = n(raw);
  const stage = applicationJourneyStage(input.truth.application);
  switch (input.obligation) {
    case "tracking_link": return /https?:\/\//i.test(raw) && /track|تتبع/i.test(raw);
    case "contact_channel": return /واتساب|تواصل|اتصال/.test(q) && !missingDetailsReply(raw);
    case "application_exists": return /(?:نعم|لا|ما\s+ظهر|مسجل|موجود)/.test(q);
    case "approval_status": {
      if (stage === "approved") return /موافق|انقبل/.test(q);
      if (stage === "preliminary_review") return /مراجعه\s+مبدئيه|ما\s+صدرت/.test(q);
      if (["preliminary_approved_waiting_decision", "continuation_confirmed_fee_due", "payment_proof_pending_admin", "payment_confirmed_under_review"].includes(stage)) return /موافقه\s+مبدئيه|ليست\s+نهائيه|مش\s+موافقه\s+نهائيه|الدراسه\s+النهائيه/.test(q);
      return /حاله|حالة|ملغي|استرداد/.test(q);
    }
    case "review_timing": return /(?:يومين|3\s+ايام|3\s+أيام|ضغط\s+مراجعات|موعد\s+مؤكد|ما\s+بقدر\s+اعطيك\s+موعد|ما\s+عندي\s+موعد)/.test(q);
    case "refund_meaning": return /(?:ارجاع|إرجاع|يرجع|مبلغ\s+مدفوع|معنى\s+الاسترداد|الاسترداد\s+يعني)/.test(q);
    case "general_eligibility": return /(?:دراسه\s+الملف|دراسة\s+الملف|اثبات\s+الدخل|إثبات\s+الدخل|كشف\s+حساب|عقد\s+عمل|كفيل)/.test(q) && !/(?:طلبك\s+ملغي|طلبك\s+موافقه\s+مبدئيه)/.test(q);
    case "application_start": return /products|صفحه\s+المنتجات|صفحة\s+المنتجات|الموقع\s+الرسمي/.test(q);
    case "current_question_contract": return !staleContinuationReply(raw) && !missingDetailsReply(raw);
    case "identity": return /(?:فريق\s+الامين|فريق\s+الأمين|معك\s+\S+)/.test(q) && !missingDetailsReply(raw);
    case "media": return /(?:وصلت|وصلني|المرفق|الصوره|الصورة|الصوتيه|الصوتية)/.test(q) && !missingDetailsReply(raw);
    case "application_status": return /(?:حاله|حالة|قيد|موافقه|موافقة|ملغي|استرداد|مراجعه|مراجعة)/.test(q) && !staleContinuationReply(raw);
    case "foreign_content_clarification": return !missingDetailsReply(raw) && /(?:النص|الرساله|الرسالة|ايميل|إيميل|اشرح|الخص|ألخص|رد)/.test(q);
    default: return true;
  }
}

export function arbitrateProductionReply(input: {
  candidate: string | null | undefined;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  actions: ActionResult[];
  forceRepair?: boolean;
}): ResponseArbitrationResult {
  const obligation = resolveResponseObligation(input);
  const candidate = String(input.candidate || "").trim() || null;

  if (obligation === "mutation_truth") {
    return { reply: candidate, obligation, repaired: false, reason: "mutation/action truth remains authoritative" };
  }
  if (obligation === "none") {
    return { reply: candidate, obligation, repaired: false, reason: "no higher-priority current-answer obligation detected" };
  }
  if (!input.forceRepair && candidateLooksResponsive({ obligation, candidate, truth: input.truth })) {
    return { reply: candidate, obligation, repaired: false, reason: "candidate already answers the current customer obligation" };
  }

  const repair = directRepair({ obligation, turn: input.turn, state: input.state, truth: input.truth, actions: input.actions });
  if (repair) return { reply: repair, obligation, repaired: repair !== candidate, reason: "single response authority repaired current-question mismatch" };
  return { reply: candidate, obligation, repaired: false, reason: "no safe deterministic repair available" };
}
