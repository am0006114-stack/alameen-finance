import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { normalizeArabic } from "./text";
import { buildCurrentQuestionAnswerContractReply } from "./currentQuestionAnswerContract";
import { aiIdentityQuestionText, buildHumanFirstConversationAuthorityReply } from "./humanFirstConversationAuthority";
import type { ActionResult, ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type ResponseObligation =
  | "mutation_truth"
  | "mutation_request"
  | "tracking_link"
  | "contact_channel"
  | "application_exists"
  | "approval_status"
  | "review_timing"
  | "refund_meaning"
  | "refund_timing"
  | "fee_question"
  | "product_availability"
  | "pickup_delivery"
  | "post_payment_next_step"
  | "external_system_question"
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

function hasAuthoritativeMutationResult(actions: ActionResult[]) {
  return actions.some((a) => ["cancel_application", "request_refund"].includes(a.action)
    && (a.executed || ["executed", "already_done", "needs_confirmation", "blocked", "failed", "dry_run"].includes(a.outcome)));
}

function hasCurrentSensitiveMutation(turn: InterpretedTurn) {
  // Never trust a model/planner action label by itself here. Production showed that
  // informational phrases such as "وين مصاري الإلغاء" can be mislabelled as a
  // mutation. Only explicit imperative customer language is allowed to become a
  // mutation obligation; actual executed/confirmation truth is handled separately.
  const q = n(turn.rawText);
  if (!q) return false;
  const interrogative = /^(?:وين|متى|امتى|ليش|ليه|شو|ايش|كيف|قديش|كم|هل|ممكن|بقدر|اقدر)\b/.test(q);
  if (interrogative) return false;
  const explicitCancel = /^(?:الغي|الغاء|الغوا)\s*(?:الطلب|طلبي|المعامله)?(?:\s+بشكل\s+صريح)?$|^(?:الغاء|إلغاء)\s+بشكل\s+صريح$|(?:بدي|اريد|أريد|حاب).{0,18}(?:الغي|الغاء).{0,22}(?:الطلب|طلبي)/.test(q);
  const explicitRefund = /^(?:استرداد|استرجاع)$|(?:بدي|اريد|أريد|حاب).{0,20}(?:استرد|استرجع|استرداد|استرجاع)|(?:رجعلي|رجعولي).{0,18}(?:المبلغ|الرسوم|المصاري|الخمس|الخمسه|5|٥)/.test(q);
  return explicitCancel || explicitRefund;
}

function repairContextTurn(turn: InterpretedTurn, state: ConversationState) {
  const q = n(turn.rawText);
  const repairCue = turn.topics.includes("repair")
    || (!q && /[؟?]/.test(String(turn.rawText || "")))
    || /^(?:مش\s+فاهم|ما\s+فهمت|مش\s+فاهك|شو\s+يعني|وضحلي|فسرلي|سؤالي|جاوبني|رد\s+علي|يزلمه|يا\s+حج)$/.test(q);
  if (!repairCue || !state.lastCustomerText) return turn;
  const rawText = `${state.lastCustomerText}\n${turn.rawText}`;
  return { ...turn, rawText, normalizedText: n(rawText) };
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

function asksRefundTiming(value: string | null | undefined, truth: TruthBundle) {
  const q = n(value);
  const stage = applicationJourneyStage(truth.application);
  const timingWord = /(?:^|\s)(?:وين|متى|امتى|اميت|قديش|كم)(?:\s|$)/.test(q);
  const moneyWord = /(?:مصاري|المصاري|المبلغ|الاسترداد|استرداد|الخمس|الخمسه|5|٥)/.test(q);
  const explicit = (timingWord && moneyWord)
    || /(?:بترجع|برجع|بيرجع|يرجع).{0,30}(?:متى|امتى|اميت|قديش|كم)(?:\s|$)/.test(q)
    || /^(?:وينهم|اميت|متى|امتى)$/.test(q);
  if (explicit) return true;
  return stage === "refund_requested" && /^(?:وينها|وينهم|شو\s+هسا|شو\s+صار|[؟?]+)$/.test(q);
}

function asksFeeQuestion(value: string | null | undefined) {
  const q = n(value);
  const fee = /(?:5|٥|الخمس|الخمسه|خمسه|خمسة|رسوم\s+فتح\s+الملف|فتح\s+الملف)/.test(q);
  const required = /(?:لازم|لزم|مطلوب|ضروري).{0,28}(?:ادفع|أدفع|دفع|رسوم|5|٥|الخمس|الخمسه)|(?:هل).{0,22}(?:ادفع|دفع).{0,20}(?:5|٥|رسوم)/.test(q);
  const purpose = /(?:ليش|ليه|لشو|شو\s+سبب|شو\s+فايده|شو\s+فائدة).{0,30}(?:فتح\s+الملف|الرسوم|5|٥|الخمس|الخمسه)|(?:فتح\s+الملف).{0,25}(?:ليش|لشو|شو\s+يعني)/.test(q);
  const refundable = /(?:بترجع|برجع|مسترده|مستردة|برجعو|بترجعو|بترجعهم).{0,30}(?:5|٥|الخمس|الخمسه|الرسوم)|(?:5|٥|الخمس|الخمسه|الرسوم).{0,30}(?:بترجع|مسترده|مستردة)/.test(q);
  const noDownPayment = /(?:بدون|ما\s+في|مفيش).{0,16}(?:دفعه|دفعة).{0,8}(?:اولي|اولا|أولى|اولى)|(?:يعني).{0,20}(?:بدون\s+(?:دفعه|دفعة)|ما\s+في\s+(?:دفعه|دفعة))/.test(q);
  return noDownPayment || (fee && (required || purpose || refundable));
}

function asksProductAvailability(value: string | null | undefined) {
  const q = n(value);
  const asksAvailability = /(?:موجود|متوفر|في\s+عندكم|عندكم).{0,38}(?:ايفون|آيفون|iphone|ايباد|آيباد|ipad|سامسونج|samsung|جهاز)|(?:ايفون|آيفون|iphone|ايباد|آيباد|ipad|سامسونج|samsung).{0,38}(?:موجود|متوفر|عندكم)/.test(q);
  const absentFromSite = /(?:مش|مو|ما).{0,18}(?:موجود|ظاهر).{0,24}(?:الموقع|الويبسايت|صفحه\s+المنتجات|صفحة\s+المنتجات)|(?:الموقع|الويبسايت|صفحه\s+المنتجات|صفحة\s+المنتجات).{0,24}(?:ما\s+في|ما\s+فيه|مش\s+موجود|مو\s+موجود)/.test(q);
  return asksAvailability || absentFromSite;
}

function asksPickupDelivery(value: string | null | undefined) {
  const q = n(value);
  return /(?:يوجد|في|عندكم).{0,15}(?:توصيل|دليفري)|(?:التوصيل|توصيل).{0,20}(?:موجود|في|عندكم|ولا)|(?:الاستلام).{0,20}(?:توصيل|مكتب)/.test(q);
}

function asksPostPaymentNextStep(value: string | null | undefined) {
  const q = n(value);
  const paidClaim = /(?:تم\s+دفع|دفعت|حولت|حوّلت).{0,20}(?:5|٥|الخمس|الخمسه|الرسوم|دنانير)?/.test(q);
  const next = /(?:ما|شو|ايش|إيش).{0,18}(?:الاجراء|الإجراء|الخطوه|الخطوة|بعد\s+ذلك|بعد\s+هيك)|(?:شو\s+بصير|وش\s+يصير).{0,18}(?:بعد|هسا)?/.test(q);
  return paidClaim && next;
}

function asksExternalSystemQuestion(value: string | null | undefined) {
  const q = n(value);
  return /(?:كريف|crif|نظام\s+ائتماني|استعلام\s+ائتماني).{0,50}(?:تظهر|يظهر|تطلع|يبين|شركتكم|الامين|الأمين)|(?:تظهر|يظهر|تطلع|يبين).{0,45}(?:كريف|crif|نظام\s+ائتماني)/i.test(q);
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
  if (hasAuthoritativeMutationResult(input.actions) || hasCurrentSensitiveMutation(input.turn)) return "mutation_truth";
  const turn = repairContextTurn(input.turn, input.state);
  if (asksTrackingLink(turn.rawText)) return "tracking_link";
  if (asksContactChannel(turn.rawText, turn)) return "contact_channel";
  if (asksApplicationExists(turn.rawText)) return "application_exists";
  if (asksApprovalStatus(turn.rawText)) return "approval_status";
  if (asksRefundTiming(turn.rawText, input.truth)) return "refund_timing";
  if (asksReviewTiming(turn.rawText, turn)) return "review_timing";
  if (asksRefundMeaning(turn.rawText)) return "refund_meaning";
  if (asksFeeQuestion(turn.rawText)) return "fee_question";
  if (asksProductAvailability(turn.rawText)) return "product_availability";
  if (asksPickupDelivery(turn.rawText)) return "pickup_delivery";
  if (asksPostPaymentNextStep(turn.rawText)) return "post_payment_next_step";
  if (asksExternalSystemQuestion(turn.rawText)) return "external_system_question";
  if (asksGeneralEligibility(turn.rawText)) return "general_eligibility";
  if (asksApplicationStart(turn.rawText)) return "application_start";
  if (buildCurrentQuestionAnswerContractReply({ turn, state: input.state, truth: input.truth })) return "current_question_contract";
  if (aiIdentityQuestionText(turn.rawText)) return "identity";
  if (isMediaEnvelope(turn)) return "media";
  if (asksApplicationStatus(turn)) return "application_status";
  if (pastedForeignContent(turn.rawText)) return "foreign_content_clarification";
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

function mutationRequestReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const app = input.truth.application;
  const stage = applicationJourneyStage(app);
  const cancel = /(?:الغي|الغاء|إلغاء|الغوا)/.test(q);
  if (cancel) {
    if (["cancelled", "refund_requested", "refund_completed"].includes(stage)) {
      if (stage === "refund_requested") return "طلبك ملغي بالفعل، وطلب الاسترداد مفتوح وقيد المعالجة؛ ما في داعي تعيد الإلغاء.";
      if (stage === "refund_completed") return "طلبك ملغي والاسترداد مكتمل حسب الحالة الحالية؛ ما في داعي تعيد الإلغاء.";
      return "طلبك ملغي بالفعل حسب الحالة الحالية؛ ما في داعي تعيد الإلغاء.";
    }
    return `وصلني طلب الإلغاء${app?.trackingId ? ` للطلب ${app.trackingId}` : ""}. قبل ما أنفذ أي تغيير، أكدلي مرة واحدة: نعم، ألغي الطلب.`;
  }
  if (stage === "refund_requested") return "طلب الاسترداد مسجل بالفعل وقيد المعالجة؛ ما في داعي تعيد طلبه.";
  if (stage === "refund_completed") return "الاسترداد مكتمل حسب الحالة الحالية؛ ما في داعي تعيد طلبه.";
  return "وصلني طلب استرداد الرسوم. قبل ما أسجل الإجراء فعليًا، أكدلي مرة واحدة: نعم، أريد استرداد الرسوم.";
}

function refundTimingReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const app = input.truth.application;
  const stage = applicationJourneyStage(app);
  if (stage === "refund_completed") return "الاسترداد مكتمل حسب الحالة الحالية.";
  if (stage === "refund_requested") return "مصاري الاسترداد لسا ما ظهرت كتحويل مكتمل؛ الطلب مسجل وقيد المعالجة. ما عندي موعد تحويل ثابت وموثق أقدر أضمنه، وأول ما يتم التحويل فعليًا بتتحدث الحالة وبنبلغك.";
  if (stage === "cancelled") return "الطلب ملغي، لكن ما بقدر أقول إن مبلغ الاسترداد بالطريق إلا إذا كان الدفع مؤكد ومسار الاسترداد مفتوح فعليًا على الملف.";
  return "إذا قصدك متى ترجع الرسوم: ما عندي تنفيذ استرداد موثق أقدر أحدد له موعد من الحالة الحالية. بعتمد فقط حالة الدفع والاسترداد الفعلية على الطلب.";
}

function feeQuestionReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const fee = input.truth.policy.fileOpeningFeeJod || 5;
  const stage = applicationJourneyStage(input.truth.application);
  if (/(?:بدون|ما\s+في|مفيش).{0,16}(?:دفعه|دفعة).{0,8}(?:اولي|اولا|أولى|اولى)/.test(q)) {
    return `نعم، ما في دفعة أولى للجهاز. القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد. ورسوم فتح الملف ${fee} دنانير خطوة منفصلة بعد الموافقة المبدئية واختيار الاستمرار.`;
  }
  if (/(?:بترجع|برجع|مسترده|مستردة|بترجعو|برجعو)/.test(q)) {
    return `نعم، رسوم فتح الملف ${fee} دنانير مستردة عبر المسار الرسمي إذا ألغيت بعد دفع مؤكد. ما بعتبر الاسترداد منفذ إلا لما تتحدث الحالة فعليًا.`;
  }
  if (/(?:ليش|ليه|لشو|شو\s+سبب|شو\s+فايده|شو\s+فائدة)/.test(q)) {
    return `رسوم فتح الملف ${fee} دنانير هي خطوة فتح الملف واستكماله للدراسة النهائية بعد الموافقة المبدئية واختيار الاستمرار. هي مش ثمن الجهاز، ومش قسط مقدم، ومش القسط الأول.`;
  }
  if (["payment_confirmed_under_review", "payment_proof_pending_admin"].includes(stage)) return "لا، ما تدفع 5 دنانير مرة ثانية؛ الدفع/الوصل موجود على الملف حسب الحالة الحالية.";
  if (stage === "continuation_confirmed_fee_due") return `نعم، إذا بدك تكمل من المرحلة الحالية فالمطلوب ${fee} دنانير رسوم فتح الملف. بعدها ترفع الوصل من الرابط الرسمي، وبعد اعتماد الدفع يدخل الملف للدراسة النهائية.`;
  if (stage === "preliminary_approved_waiting_decision") return `رسوم فتح الملف ${fee} دنانير ما بتصير إلا بعد الموافقة المبدئية لما تختار الاستمرار. قبل اختيار الاستمرار ما بطلب منك دفعها.`;
  return `رسوم فتح الملف ${fee} دنانير مرتبطة بمرحلة ما بعد الموافقة المبدئية واختيار الاستمرار، وهي منفصلة عن القسط الأول.`;
}

function productAvailabilityReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const products = links.relevant.products || `${links.baseUrl}/products`;
  if (/(?:مش|مو|ما).{0,18}(?:موجود|ظاهر).{0,24}(?:الموقع|الويبسايت|صفحه\s+المنتجات|صفحة\s+المنتجات)|(?:الموقع|الويبسايت|صفحه\s+المنتجات|صفحة\s+المنتجات).{0,24}(?:ما\s+في|ما\s+فيه|مش\s+موجود|مو\s+موجود)/.test(q)) {
    return `إذا الجهاز مش ظاهر بصفحة المنتجات الرسمية، ما بقدر أعتبره متوفر حاليًا أو أفتح عليه طلب من عندي. الموجود المتاح للتقديم هو اللي ظاهر هون:
${products}`;
  }
  return `توفر الموديلات بيتغير، والمرجع الحالي هو صفحة المنتجات الرسمية. إذا الموديل ظاهر هناك تقدر تقدم عليه؛ وإذا مش ظاهر ما بقدر أؤكد توفره حاليًا:
${products}`;
}

function pickupDeliveryReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const requirements = /(?:الاوراق|الأوراق|الوثائق|الهويه|الهوية|اثبات\s+الدخل|إثبات\s+الدخل)/.test(q)
    ? `${input.truth.policy.requirementsGuidanceRule} `
    : "";
  return `${requirements}ما في توصيل. الاستلام من المكتب فقط وبموعد رسمي مؤكد بعد استحقاق مرحلة الاستلام. ${input.truth.policy.generalLocation}.`;
}

function postPaymentNextStepReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const stage = applicationJourneyStage(input.truth.application);
  if (stage === "payment_confirmed_under_review") return "الدفع مؤكد إداريًا، والخطوة الحالية هي الدراسة النهائية. ما في داعي تدفع أو ترفع وصل مرة ثانية؛ أول ما يصدر تحديث فعلي على الدراسة بنبلغك.";
  if (stage === "payment_proof_pending_admin") return "الخطوة الحالية انتظار اعتماد الوصل إداريًا. ما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية، وبعد الاعتماد يدخل الملف للدراسة النهائية.";
  const receiptTurn: InterpretedTurn = {
    ...input.turn,
    topics: Array.from(new Set([...input.turn.topics, "payment_fee", "payment_method", "receipt_upload", "continuation"])) as InterpretedTurn["topics"],
  };
  const links = buildOfficialLinkContext(receiptTurn, input.truth);
  const receipt = links.relevant.receipt;
  return `وصلتني إنك بتقول إنك دفعت، لكن ما بعتبر الدفع مؤكد من الرسالة نفسها. ${receipt ? `إذا ما رفعت الوصل من الرابط الرسمي، ارفعه مرة واحدة من هون:\n${receipt}` : "تأكيد الدفع النهائي يتم فقط بعد ظهوره إداريًا على الطلب."} وبعد اعتماد الدفع بتكون الخطوة التالية الدراسة النهائية.`;
}

function externalSystemReply() {
  return "ما عندي معلومة موثقة أو تكامل ظاهر عندي يخليني أأكد إن الأمين يظهر على كريف/نظام استعلام ائتماني معيّن. ما رح أعطيك نعم أو لا من غير توثيق رسمي.";
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
  const turn = repairContextTurn(input.turn, input.state);
  const currentQuestion = buildCurrentQuestionAnswerContractReply({ turn, state: input.state, truth: input.truth });
  const humanAuthority = buildHumanFirstConversationAuthorityReply({ turn, state: input.state, truth: input.truth, actions: input.actions });
  switch (input.obligation) {
    case "mutation_request": return mutationRequestReply({ turn: input.turn, truth: input.truth });
    case "tracking_link": return trackingReply({ turn, truth: input.truth });
    case "contact_channel": return "المتابعة الأساسية للطلبات من خلال واتساب الحالي. ما عندي رقم تواصل إضافي رسمي موثق أقدر أعطيك إياه.";
    case "application_exists": return applicationExistsReply(input.truth);
    case "approval_status": return approvalReply(input.truth);
    case "refund_timing": return refundTimingReply({ turn, truth: input.truth });
    case "review_timing": return reviewTimingReply({ turn, truth: input.truth });
    case "refund_meaning": return refundMeaningReply(input.truth);
    case "fee_question": return feeQuestionReply({ turn, truth: input.truth });
    case "product_availability": return productAvailabilityReply({ turn, truth: input.truth });
    case "pickup_delivery": return pickupDeliveryReply({ turn, truth: input.truth });
    case "post_payment_next_step": return postPaymentNextStepReply({ turn, truth: input.truth });
    case "external_system_question": return externalSystemReply();
    case "general_eligibility": return generalEligibilityReply({ turn, truth: input.truth });
    case "application_start": return applicationStartReply({ turn, truth: input.truth });
    case "current_question_contract": return currentQuestion;
    case "identity": return humanAuthority || "معك فريق الأمين للأقساط من نفس المحادثة، واحكيلي المطلوب مباشرة وبجاوبك على قد السؤال.";
    case "media": return currentQuestion || humanAuthority || "وصلني المرفق. إذا هو لتوضيح مشكلة أو سؤال، اكتبلي باختصار شو بدك أتأكد منه منه وبمشي معك من نفس السياق.";
    case "application_status": return currentQuestion || statusReply({ turn, truth: input.truth });
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
    case "mutation_request": return /(?:اكدلي|أكدلي|نعم).{0,30}(?:الغي|ألغي|استرداد)|(?:ملغي بالفعل|الاسترداد مسجل بالفعل)/.test(q);
    case "tracking_link": return /https?:\/\//i.test(raw) && /track|تتبع/i.test(raw);
    case "contact_channel": return /واتساب|تواصل|اتصال/.test(q) && !missingDetailsReply(raw);
    case "application_exists": return /(?:نعم|لا|ما\s+ظهر|مسجل|موجود)/.test(q);
    case "approval_status": {
      if (stage === "approved") return /موافق|انقبل/.test(q);
      if (stage === "preliminary_review") return /مراجعه\s+مبدئيه|ما\s+صدرت/.test(q);
      if (["preliminary_approved_waiting_decision", "continuation_confirmed_fee_due", "payment_proof_pending_admin", "payment_confirmed_under_review"].includes(stage)) return /موافقه\s+مبدئيه|ليست\s+نهائيه|مش\s+موافقه\s+نهائيه|الدراسه\s+النهائيه/.test(q);
      return /حاله|حالة|ملغي|استرداد/.test(q);
    }
    case "refund_timing": return /(?:تحويل|متى|امتى|موعد|مدة|لسا).{0,45}(?:الاسترداد|المبلغ|المصاري)|(?:الاسترداد|المبلغ|المصاري).{0,45}(?:تحويل|موعد|مكتمل)/.test(q) && !/^(?:نعم\s+)?طلبك\s+ملغي\s+بالفعل/.test(q);
    case "review_timing": return /(?:يومين|3\s+ايام|3\s+أيام|ضغط\s+مراجعات|موعد\s+مؤكد|ما\s+بقدر\s+اعطيك\s+موعد|ما\s+عندي\s+موعد)/.test(q);
    case "refund_meaning": return /(?:ارجاع|إرجاع|يرجع|مبلغ\s+مدفوع|معنى\s+الاسترداد|الاسترداد\s+يعني)/.test(q);
    case "fee_question": return false;
    case "product_availability": return false;
    case "pickup_delivery": return /(?:ما\s+في\s+توصيل|الاستلام\s+من\s+المكتب)/.test(q);
    case "post_payment_next_step": return false;
    case "external_system_question": return /(?:ما\s+عندي).{0,35}(?:معلومه\s+موثقه|تكامل).{0,45}(?:كريف|crif|ائتماني)/i.test(q);
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
    if (hasAuthoritativeMutationResult(input.actions)) {
      return { reply: candidate, obligation, repaired: false, reason: "mutation/action truth remains authoritative" };
    }
    // An explicit customer mutation request still needs the two-step confirmation
    // contract, but a stale continuation/status candidate must not hijack it.
    const q = n(candidate);
    const alreadyGood = /(?:اكدلي|أكدلي|اكتب).{0,35}(?:نعم).{0,35}(?:الغي|ألغي|استرداد)|(?:ملغي بالفعل|الاسترداد مسجل بالفعل)/.test(q);
    if (alreadyGood) return { reply: candidate, obligation, repaired: false, reason: "mutation/action truth remains authoritative" };
    const repair = mutationRequestReply({ turn: input.turn, truth: input.truth });
    return { reply: repair, obligation, repaired: repair !== candidate, reason: "explicit mutation request repaired to confirmation contract" };
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
