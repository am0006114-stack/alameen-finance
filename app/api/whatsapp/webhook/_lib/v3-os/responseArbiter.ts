import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { normalizeArabic } from "./text";
import { buildCurrentQuestionAnswerContractReply } from "./currentQuestionAnswerContract";
import { aiIdentityQuestionText, buildHumanFirstConversationAuthorityReply } from "./humanFirstConversationAuthority";
import { candidateAlignedWithLockedMeaning, lockedMeaningReply, repeatedQuestionNeedsRepair, resolveUnifiedMeaningLock, sanitizeUnifiedEgressReply, shouldSuppressRepeatedProtectedRegistration } from "./unifiedConversationDecisionPlane";
import { buildRefundHumanCareReply, refundHumanCareCandidateAligned, refundHumanCareMode } from "./refundHumanCare";
import { buildHumanSemanticCareReply, composeHumanSemanticCareAroundAnswer, humanSemanticCareCandidateAligned, humanSemanticCareMode } from "./humanSemanticCare";
import { buildSemanticQuestionLockReply, resolveSemanticQuestionLock, semanticQuestionCandidateAligned } from "./semanticQuestionLocks";
import { buildAnswerBundleReply, resolveAnswerBundle } from "./answerObligations";
import { buildCurrentHumanTurnReply, currentHumanTurnCandidateAligned, resolveCurrentHumanTurnAuthority } from "./currentHumanTurnAuthority";
import type { ActionResult, ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type ResponseObligation =
  | "protected_business_registration"
  | "stop_refund_keep_request"
  | "undo_cancel_or_refund"
  | "cancel_confirmation_declined"
  | "contact_identity_mismatch"
  | "down_payment"
  | "office_payment"
  | "monthly_payment_mechanism"
  | "device_warranty_or_insurance"
  | "product_sim_spec"
  | "payment_destination_update"
  | "file_opening_payment_method"
  | "office_location"
  | "product_region_spec"
  | "trust_assurance"
  | "total_payable"
  | "voluntary_opt_out"
  | "payment_receipt_confirmation"
  | "mutation_truth"
  | "mutation_request"
  | "tracking_link"
  | "contact_channel"
  | "application_exists"
  | "approval_status"
  | "review_timing"
  | "refund_meaning"
  | "refund_human_care"
  | "current_human_turn"
  | "answer_bundle"
  | "human_semantic_care"
  | "refund_timing"
  | "fee_question"
  | "product_availability"
  | "pickup_delivery"
  | "post_payment_next_step"
  | "external_system_question"
  | "general_eligibility"
  | "application_start"
  | "installment_service_overview"
  | "document_upload_guidance"
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
  suppressed?: boolean;
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
  const explicitRefund = /^(?:استرداد|استرجاع)$|(?:بدي|اريد|أريد|حاب).{0,20}(?:استرد|استرجع|استرداد|استرجاع|ترجعو|ترجعوا|تردو|تردوا)|(?:رجعلي|رجعولي|رجعو|رجعوا|ردو|ردوا).{0,18}(?:المبلغ|الرسوم|المصاري|الفلوس|الخمس|الخمسه|الخمسة|5|٥)/.test(q);
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
  if (stage === "refund_requested" && /^(?:كم|قديش).{0,24}(?:تحتاج|بدها|بدو|بياخد|ياخد|وقت|مده|مدة)|^(?:متى|امتى|لحد\s+متى|الى\s+متى|إلى\s+متى)$/.test(q)) return true;
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


function structuredApplicationStatusRequest(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q) return false;
  const hasTracking = /(?:رقم\s+التتبع|tracking).{0,40}(?:am\s*\d+|am-\d+)/i.test(q);
  const hasCurrentState = /الحاله\s+الحاليه|الحالة\s+الحالية/.test(q);
  const asksLatest = /(?:اخر\s+تحديث|آخر\s+تحديث|الخطوه\s+التاليه|الخطوة\s+التالية|متابعه\s+طلبي|متابعة\s+طلبي)/.test(q);
  return hasTracking && hasCurrentState && asksLatest;
}

function asksInstallmentServiceOverview(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  const service = /(?:خدمه\s+تقسيط|خدمة\s+تقسيط|تقسيط\s+الهواتف|تقسيط\s+اجهزه|تقسيط\s+أجهزة)/.test(q);
  const overview = /(?:الشروط|المتطلبات|طريقه\s+التقديم|طريقة\s+التقديم|كيف\s+اقدم|كيف\s+أقدم|كيف\s+التقديم)/.test(q);
  return service && overview;
}

function asksDocumentUploadGuidance(turn: InterpretedTurn, state: ConversationState) {
  const q = n(turn.rawText);
  const previous = n(state.lastAssistantText);
  const currentAcceptsOffer = /^(?:تمام\s+)?(?:وضحلي|وضح\s+لي|اشرحلي|اشرح\s+لي|كيف|اه\s+وضحلي|أه\s+وضحلي)$/.test(q);
  const previousOfferedDocs = /(?:اوضحلك|أوضحلك|اشرحلك|كيف).{0,30}(?:ترفع|رفع).{0,24}(?:المستندات|الوثائق|الهويه|الهوية|اثبات\s+الدخل|إثبات\s+الدخل)/.test(previous);
  return currentAcceptsOffer && previousOfferedDocs;
}

function contactIdentityMismatch(truth: TruthBundle) {
  return Boolean(truth.readWarnings?.includes("contact_identity_mismatch_current_tracking"));
}

function contactIdentityMismatchReply() {
  return "فاهم عليك. رقم التتبع اللي بعثته مربوط برقم واتساب مختلف، فحرصًا على خصوصية صاحب الطلب ما بقدر أعرض تفاصيل هذا الطلب أو حالته من هون، ولا أنفذ عليه من هالرقم. إذا الرقم المسجل إلك بس ما عليه واتساب، أو رقمك دولي/تغيّر معك، احكيلي هالشي وبنكمل هون بالحل المناسب بدون ما نكشف بيانات الطلب.";
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
  const meaningLock = resolveUnifiedMeaningLock({ turn: input.turn, state: input.state, truth: input.truth });
  const semanticQuestionLock = resolveSemanticQuestionLock({ turn: input.turn, truth: input.truth });
  const currentHumanTurn = resolveCurrentHumanTurnAuthority({ turn: input.turn, state: input.state, truth: input.truth });
  if (currentHumanTurn.kind === "contact_isolation_continuation") return "current_human_turn";
  if (contactIdentityMismatch(input.truth)) return "contact_identity_mismatch";
  if (meaningLock.kind !== "none") return meaningLock.kind;
  if (hasAuthoritativeMutationResult(input.actions)) return "mutation_truth";
  // 7.5.2: exact structured tracking/status messages have absolute semantic priority.
  // They must never fall into product/payment/continuation branches because of stale context.
  if (structuredApplicationStatusRequest(input.turn)) return "application_status";
  // 7.5.8: the literal human turn can hard-veto legacy state loops. This sits
  // before generic semantic locks so contextual Arabic such as "مسجل ضمان" is
  // understood as social-security/income context instead of a trust guarantee.
  if (currentHumanTurn.kind !== "none") return "current_human_turn";
  // 7.5.3: direct current-turn semantic questions veto stale domain context.
  if (semanticQuestionLock.kind !== "none") return semanticQuestionLock.kind;
  // 7.5.5: material questions are obligations first. Emotion may shape the answer,
  // but it may never replace an answer or erase a second question in the same turn.
  const answerBundle = resolveAnswerBundle({ turn: input.turn, state: input.state, truth: input.truth });
  if (answerBundle.kind !== "none") return "answer_bundle";
  // Once refund is already open, frustration/timing/solution/repeated refund language is
  // a customer-care question, not a new mutation request. Execution truth still outranks this above.
  if (refundHumanCareMode({ turn: input.turn, state: input.state, truth: input.truth })) return "refund_human_care";
  if (hasCurrentSensitiveMutation(input.turn)) return "mutation_truth";
  // Handle direct acceptance of our immediately previous document-upload explanation offer
  // before repairContextTurn can merge it with an older customer turn.
  if (asksDocumentUploadGuidance(input.turn, input.state)) return "document_upload_guidance";
  if (asksInstallmentServiceOverview(input.turn.rawText)) return "installment_service_overview";
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
  if (asksApplicationStart(turn.rawText)) return "application_start";
  if (asksApplicationStatus(turn)) return "application_status";
  if (pastedForeignContent(turn.rawText)) return "foreign_content_clarification";
  // Emotion is a composition layer only after all material current-question obligations.
  if (humanSemanticCareMode({ turn: input.turn, state: input.state, truth: input.truth })) return "human_semantic_care";
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


function installmentServiceOverviewReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const products = links.relevant.products || `${links.baseUrl}/products`;
  return `أكيد. التقديم بيبدأ من الموقع الرسمي باختيار الجهاز وتعبئة طلب الموافقة المبدئية. الأساس هو الهوية وإثبات الدخل؛ وإذا ما عندك كشف أو شهادة راتب ممكن ترفع بديل رسمي مثل كشف حساب بنكي أو عقد عمل أو مستند يوضح مصدر الدخل، والدراسة هي اللي بتحدد المقبول النهائي. الكفيل مش شرط ثابت لكل طلب. بعد الموافقة المبدئية، إذا اخترت الاستمرار، رسوم فتح الملف 5 دنانير فقط وهي منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. القسط الأول بيستحق بعد شهر من استلام الجهاز وتوقيع العقد.\n${products}`;
}

function documentUploadGuidanceReply(input: { truth: TruthBundle }) {
  return `أكيد. الهوية وإثبات الدخل وأي مستند حساس بتنرفع فقط من الرابط الرسمي الآمن المرتبط بطلبك، وما بنعتمد إرسالها على واتساب. إذا عندك كشف أو شهادة راتب ارفعها من نفس المسار، وإذا ما عندك فممكن تستخدم بديل رسمي مناسب مثل كشف حساب بنكي أو عقد عمل أو مستند يوضح مصدر الدخل؛ والدراسة هي اللي بتحدد المقبول النهائي. بعد الرفع تأكد إن الصفحة أظهرت اكتمال رفع المستند.`;
}

function applicationStartReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  return `التقديم يبدأ من الموقع الرسمي: اختار الجهاز من صفحة المنتجات وكمل طلب الموافقة المبدئية، وبعد الإرسال بيطلع لك رقم تتبع.\n${links.relevant.products || `${links.baseUrl}/products`}`;
}

function statusReply(input: { turn: InterpretedTurn; truth: TruthBundle; state?: ConversationState }) {
  const app = input.truth.application;
  if (!app) {
    if (input.truth.ambiguousApplications.length > 1) return "عندي أكثر من طلب محتمل، فحتى ما أعطيك حالة طلب ثاني ابعث رقم التتبع للطلب المقصود مرة واحدة.";
    return "ما ظهرت عندي حالة طلب موثوقة أقدر أعطيك تحديث عليها هسا. إذا عندك رقم تتبع ابعثه مرة واحدة وبراجع نفس الطلب مباشرة.";
  }
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const link = links.relevant.tracking;
  const currentQuestion = n(input.turn.rawText);
  const previousQuestion = n(input.state?.lastCustomerText);
  const repeated = currentQuestion.length >= 8 && currentQuestion === previousQuestion;
  if (repeated) {
    return `لسا ما تغيرت الحالة عن آخر متابعة: طلبك${app.trackingId ? ` ${app.trackingId}` : ""} ${customerFacingStatusLabel(app)}.${link ? `\nللمتابعة: ${link}` : ""}`;
  }
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
    case "protected_business_registration":
    case "stop_refund_keep_request":
    case "undo_cancel_or_refund":
    case "cancel_confirmation_declined":
    case "down_payment":
    case "office_payment":
    case "monthly_payment_mechanism":
    case "device_warranty_or_insurance":
    case "product_sim_spec":
    case "payment_destination_update":
    case "voluntary_opt_out":
    case "payment_receipt_confirmation":
      return lockedMeaningReply({ meaning: resolveUnifiedMeaningLock({ turn: input.turn, state: input.state, truth: input.truth }), turn: input.turn, truth: input.truth });
    case "file_opening_payment_method":
    case "office_location":
    case "product_region_spec":
    case "trust_assurance":
    case "total_payable":
      return buildSemanticQuestionLockReply({ lock: resolveSemanticQuestionLock({ turn: input.turn, truth: input.truth }), turn: input.turn, truth: input.truth });
    case "mutation_request": return mutationRequestReply({ turn: input.turn, truth: input.truth });
    case "tracking_link": return trackingReply({ turn, truth: input.truth });
    case "contact_identity_mismatch": return contactIdentityMismatchReply();
    case "contact_channel": return "المتابعة الأساسية للطلبات من خلال واتساب الحالي. ما عندي رقم تواصل إضافي رسمي موثق أقدر أعطيك إياه.";
    case "application_exists": return applicationExistsReply(input.truth);
    case "approval_status": return approvalReply(input.truth);
    case "refund_human_care": return buildRefundHumanCareReply({ turn: input.turn, state: input.state, truth: input.truth }) || refundTimingReply({ turn, truth: input.truth });
    case "current_human_turn": return buildCurrentHumanTurnReply({ authority: resolveCurrentHumanTurnAuthority({ turn: input.turn, state: input.state, truth: input.truth }), turn: input.turn, state: input.state, truth: input.truth });
    case "answer_bundle": return buildAnswerBundleReply({ bundle: resolveAnswerBundle({ turn: input.turn, state: input.state, truth: input.truth }), turn: input.turn, state: input.state, truth: input.truth });
    case "human_semantic_care": return buildHumanSemanticCareReply({ turn: input.turn, state: input.state, truth: input.truth });
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
    case "installment_service_overview": return installmentServiceOverviewReply({ turn, truth: input.truth });
    case "document_upload_guidance": return documentUploadGuidanceReply({ truth: input.truth });
    case "current_question_contract": return currentQuestion;
    case "identity": return humanAuthority || "معك فريق الأمين للأقساط من نفس المحادثة، واحكيلي المطلوب مباشرة وبجاوبك على قد السؤال.";
    case "media": return currentQuestion || humanAuthority || "وصلني المرفق. إذا هو لتوضيح مشكلة أو سؤال، اكتبلي باختصار شو بدك أتأكد منه منه وبمشي معك من نفس السياق.";
    case "application_status": return currentQuestion || statusReply({ turn, truth: input.truth, state: input.state });
    case "foreign_content_clarification": return "وصلني النص اللي بعثته. احكيلي شو بدك أعمل فيه بالضبط—أشرحه، ألخصه، أو أساعدك ترد عليه—وبجاوبك على نفس الموضوع.";
    default: return null;
  }
}

function candidateLooksResponsive(input: { obligation: ResponseObligation; candidate: string | null | undefined; truth: TruthBundle; turn: InterpretedTurn; state: ConversationState }) {
  const raw = sanitizeUnifiedEgressReply(input.candidate);
  if (!raw) return false;
  if (responseHasKnownBadFallbackSignature(raw)) return false;
  const q = n(raw);
  const stage = applicationJourneyStage(input.truth.application);
  switch (input.obligation) {
    case "protected_business_registration":
    case "stop_refund_keep_request":
    case "down_payment":
    case "office_payment":
    case "monthly_payment_mechanism":
    case "device_warranty_or_insurance":
    case "product_sim_spec":
    case "payment_destination_update":
    case "voluntary_opt_out":
    case "payment_receipt_confirmation":
      return candidateAlignedWithLockedMeaning({ meaning: { kind: input.obligation, hard: true, reason: "response obligation" }, candidate: raw });
    case "file_opening_payment_method":
    case "office_location":
    case "product_region_spec":
    case "trust_assurance":
    case "total_payable":
      return semanticQuestionCandidateAligned({ lock: resolveSemanticQuestionLock({ turn: input.turn, truth: input.truth }), candidate: raw, truth: input.truth });
    case "mutation_request": return /(?:اكدلي|أكدلي|نعم).{0,30}(?:الغي|ألغي|استرداد)|(?:ملغي بالفعل|الاسترداد مسجل بالفعل)/.test(q);
    case "tracking_link": return /https?:\/\//i.test(raw) && /track|تتبع/i.test(raw);
    case "contact_identity_mismatch": return /(?:مش\s+مربوط|غير\s+مرتبط).{0,50}(?:رقم\s+الواتساب|واتساب)|(?:للخصوصيه|للخصوصية).{0,80}(?:رقم\s+مختلف|الطلب)/.test(q) && !/(?:الجهاز|قيد\s+المراجعه|قيد\s+الدراسه|الدفع\s+مؤكد)/.test(q);
    case "contact_channel": return /واتساب|تواصل|اتصال/.test(q) && !missingDetailsReply(raw);
    case "application_exists": return /(?:نعم|لا|ما\s+ظهر|مسجل|موجود)/.test(q);
    case "refund_human_care": return refundHumanCareCandidateAligned({ candidate: raw, truth: input.truth, turn: input.turn, state: input.state });
    case "current_human_turn": return currentHumanTurnCandidateAligned({ authority: resolveCurrentHumanTurnAuthority({ turn: input.turn, state: input.state, truth: input.truth }), candidate: raw });
    case "answer_bundle": return false;
    case "human_semantic_care": return humanSemanticCareCandidateAligned({ candidate: raw, turn: input.turn, state: input.state, truth: input.truth });
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
    case "installment_service_overview": return /(?:التقديم|الموقع\s+الرسمي).{0,90}(?:الهويه|الهوية|اثبات\s+الدخل|إثبات\s+الدخل)|(?:رسوم\s+فتح\s+الملف).{0,60}(?:5|٥)/.test(q);
    case "document_upload_guidance": return /(?:الرابط\s+الرسمي|المسار\s+الرسمي).{0,70}(?:الهويه|الهوية|اثبات\s+الدخل|إثبات\s+الدخل|المستندات)/.test(q) && !staleContinuationReply(raw);
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
  const candidate = sanitizeUnifiedEgressReply(input.candidate) || null;
  const meaningLock = resolveUnifiedMeaningLock({ turn: input.turn, state: input.state, truth: input.truth });
  const semanticQuestionLock = resolveSemanticQuestionLock({ turn: input.turn, truth: input.truth });
  const currentHumanTurn = resolveCurrentHumanTurnAuthority({ turn: input.turn, state: input.state, truth: input.truth });

  if (obligation === "contact_identity_mismatch") {
    const repair = contactIdentityMismatchReply();
    return { reply: sanitizeUnifiedEgressReply(repair), obligation, repaired: repair !== candidate, reason: "contact isolation blocked cross-number application disclosure" };
  }

  if (obligation === "protected_business_registration" && shouldSuppressRepeatedProtectedRegistration({ turn: input.turn, state: input.state })) {
    return { reply: null, obligation, repaired: Boolean(candidate), suppressed: true, reason: "repeated protected registration request suppressed after one security notice" };
  }

  // 7.5.1: payment/receipt confirmation must always be rendered from authoritative
  // payment truth; a semantically plausible candidate is not enough.
  if (meaningLock.kind === "payment_receipt_confirmation") {
    const lockedReply = lockedMeaningReply({ meaning: meaningLock, turn: input.turn, truth: input.truth });
    return { reply: sanitizeUnifiedEgressReply(lockedReply), obligation, repaired: lockedReply !== candidate, reason: "authoritative payment/receipt truth lock" };
  }

  if (meaningLock.kind !== "none" && !candidateAlignedWithLockedMeaning({ meaning: meaningLock, candidate })) {
    const lockedReply = lockedMeaningReply({ meaning: meaningLock, turn: input.turn, truth: input.truth });
    return { reply: sanitizeUnifiedEgressReply(lockedReply), obligation, repaired: lockedReply !== candidate, reason: `current meaning lock repaired cross-domain candidate: ${meaningLock.reason}` };
  }

  // 7.5.8 FINAL CURRENT HUMAN TURN AUTHORITY: legacy refund/delay/contact
  // state may supply context, but it cannot own the reply after the customer
  // explicitly changes subject, asks for a call, reports a concrete error, or
  // says the answer is repeating. Transaction/action meaning locks above remain
  // stronger, so this does not weaken payment/refund/cancellation truth.
  if (currentHumanTurn.kind !== "none") {
    if (!input.forceRepair && currentHumanTurnCandidateAligned({ authority: currentHumanTurn, candidate })) {
      return { reply: candidate, obligation: "current_human_turn", repaired: false, reason: `current human turn already answered: ${currentHumanTurn.reason}` };
    }
    const humanTurnReply = buildCurrentHumanTurnReply({ authority: currentHumanTurn, turn: input.turn, state: input.state, truth: input.truth });
    if (humanTurnReply) return { reply: sanitizeUnifiedEgressReply(humanTurnReply), obligation: "current_human_turn", repaired: humanTurnReply !== candidate, reason: `final current human turn authority repaired legacy state loop: ${currentHumanTurn.reason}` };
  }

  if (semanticQuestionLock.kind !== "none" && !semanticQuestionCandidateAligned({ lock: semanticQuestionLock, candidate, truth: input.truth })) {
    const lockedReply = buildSemanticQuestionLockReply({ lock: semanticQuestionLock, turn: input.turn, truth: input.truth });
    return { reply: sanitizeUnifiedEgressReply(lockedReply), obligation, repaired: lockedReply !== candidate, reason: `semantic question veto repaired cross-domain candidate: ${semanticQuestionLock.reason}` };
  }

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
  const repeatedRepair = repeatedQuestionNeedsRepair({ turn: input.turn, state: input.state, candidate });
  if (!input.forceRepair && !repeatedRepair && candidateLooksResponsive({ obligation, candidate, truth: input.truth, turn: input.turn, state: input.state })) {
    const composed = obligation === "answer_bundle" ? candidate : composeHumanSemanticCareAroundAnswer({ answer: candidate, turn: input.turn, state: input.state, truth: input.truth });
    const finalCandidate = sanitizeUnifiedEgressReply(composed) || candidate;
    return { reply: finalCandidate, obligation, repaired: finalCandidate !== candidate, reason: finalCandidate !== candidate ? "emotion composed around a useful current-question answer" : "candidate already answers the current customer obligation" };
  }

  const repair = directRepair({ obligation, turn: input.turn, state: input.state, truth: input.truth, actions: input.actions });
  if (repair) { const composedRepair = obligation === "answer_bundle" ? repair : composeHumanSemanticCareAroundAnswer({ answer: repair, turn: input.turn, state: input.state, truth: input.truth }); const sanitizedRepair = sanitizeUnifiedEgressReply(composedRepair); return { reply: sanitizedRepair, obligation, repaired: sanitizedRepair !== candidate, reason: repeatedRepair ? "conversation repair rebuilt failed/repeated answer" : "single response authority repaired current-question mismatch" }; }
  return { reply: candidate, obligation, repaired: false, reason: "no safe deterministic repair available" };
}
