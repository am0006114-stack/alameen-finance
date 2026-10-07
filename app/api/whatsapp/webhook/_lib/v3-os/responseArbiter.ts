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
import { buildHumanCompanyOverrideReply, resolveHumanCompanyOverride } from "./humanCompanyRuntime";
import { buildPaymentIncidentReply, detectPaymentIncident } from "./paymentIncident";
import { buildIphone18AuthoritativeReply } from "./businessTruthRegistry";

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
  | "refund_process_problem"
  | "operational_calendar"
  | "fee_document_question"
  | "fee_question"
  | "conditional_future_mutation"
  | "requirements_question"
  | "contract_terms_question"
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
  | "social_greeting"
  | "social_closure"
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


// Keep these egress-critical checks local to the arbiter. Older regression suites
// intentionally load responseArbiter with a fixed dependency surface, so adding a
// convenience import here would make a harness failure look like a runtime regression.
function explicitExpediteRequestTextForArbiter(value: string | null | undefined) {
  const q = n(value);
  return /(?:بلغ|بلّغ|وصل|وصلوا|احكي|احكوا).{0,35}(?:الاداره|الإدارة).{0,40}(?:مستعجل|مستعجله|مستعجلة|استعجال|سرعه|سرعة)|(?:بدي|بدنا|لو\s+سمحت|لو\s+سمحتوا|رجاء|رجاءا|رجائا|ارجو|أرجو).{0,34}(?:استعجال|تسريع|تسرعوا|تستعجلوا|تستعجل|سرعوا|سرّعوا).{0,30}(?:الطلب|القرار|المراجعه|المراجعة|الموافقه|الموافقة)?|(?:استعجلوا|استعجلو|تستعجلوا|تستعجلو).{0,24}(?:بالطلب|بلطلب|الطلب)|(?:اعملوني|اعملولي).{0,25}(?:حاله|حالة)\s+استثنائيه|(?:حاله|حالة)\s+استثنائيه.{0,25}(?:لو\s+سمحت|بدي)/.test(q);
}

function pureSocialClosureTurnForArbiter(turn: InterpretedTurn) {
  const raw = String(turn.rawText || "").trim();
  const q = n(turn.rawText);
  if (!raw && !q) return false;
  if (turn.requestedActions.length) return false;
  // Phase 11.7.1: literal short closures own the current turn even if a model
  // accidentally copied the previous topic into acts/topics.
  if (/^(?:خلص|خلص\s+تمام|تمام|تم|اوك|اوكي|أوك|أوكي|شكرا|شكرًا|شكراً|يسلمو|تسلم|الله\s+يعافيك|يعطيك\s+العافيه|يعطيك\s+العافية|الله\s+يعافيك|الله\s+يعطيك\s+العافيه|الله\s+يعطيك\s+العافية|ان\s+شاء\s+الله|إن\s+شاء\s+الله|تمام\s+ان\s+شاء\s+الله|تمام\s+إن\s+شاء\s+الله|العفو)$/.test(q)) return true;
  if (/^(?:👍|👍🏻|❤️|❤|🌹|🙏|🙏🏻|👌|✅|☑️|😁|🙂|😊|✔️)+$/u.test(raw)) return true;
  const materialAct = turn.acts.some((act) => {
    if (["greet", "thank", "acknowledge"].includes(act.type)) return false;
    if (act.topic === "unknown" && act.type === "unknown") return false;
    return ["ask", "request_action", "confirm", "deny", "correct", "provide_fact", "provide_reason", "repair_request", "complaint", "request_role"].includes(act.type)
      || !["greeting", "thanks", "acknowledgement", "unknown"].includes(act.topic);
  });
  if (materialAct) return false;
  const materialText = /(?:\?|؟|بدي|اريد|أريد|متى|امتى|ايمتى|قديش|كم|كيف|وين|ليش|شو|هل|الغي|إلغاء|استرداد|دفع|ادفع|أدفع|تحويل|كليك|cliq|استعجال|سرعه|سرعة|حاله\s+استثنائيه|حالة\s+استثنائية)/i.test(raw);
  if (materialText) return false;
  const hasThanks = /(?:شكرا|شكرًا|شكراً|تسلم|الله\s+يعافيك|يعطيك\s+العافيه|يعطيك\s+العافية)/.test(q);
  const hasWish = /(?:ان\s+شاء\s+الله|إن\s+شاء\s+الله|يارب|يا\s+رب)/.test(q);
  return (hasThanks || hasWish) && q.length <= 120;
}

function pureGreetingTurnForArbiter(turn: InterpretedTurn) {
  if (turn.requestedActions.length) return false;
  const q = n(turn.rawText);
  return /^(?:مرحبا|مرحبًا|هلا|اهلا|أهلا|السلام\s+عليكم|صباح\s+الخير|مساء\s+الخير|كيفك(?:\s+[\p{L}]+){0,2}|كيف\s+حالكم)$/u.test(q);
}

function buildGreetingReplyForArbiter(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (/السلام\s+عليكم/.test(q)) return "وعليكم السلام ورحمة الله وبركاته. تفضل، شو بتحب تسأل؟";
  if (/صباح\s+الخير/.test(q)) return "صباح النور. تفضل، شو بتحب تسأل؟";
  if (/مساء\s+الخير/.test(q)) return "مساء النور. تفضل، شو بتحب تسأل؟";
  if (/كيفك|كيف\s+حالكم/.test(q)) return "الحمدلله بخير، تفضل شو بتحب تسأل؟";
  return "أهلين وسهلين. تفضل، شو بتحب تسأل؟";
}

function buildSocialClosureReplyForArbiter(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (/(?:شكرا|شكر|تسلم|يعطيك\s+العافيه|يعطيك\s+العافية|الله\s+يعافيك)/.test(q)) return "العفو، الله يعطيك العافية.";
  if (/(?:ان\s+شاء\s+الله|إن\s+شاء\s+الله|يارب|يا\s+رب)/.test(q)) return "تمام، إن شاء الله. الله يعطيك العافية.";
  return "تمام، الله يعطيك العافية.";
}

function explicitReopenApplicationText(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  return /(?:اعيد|أعيد|اعاده|إعادة).{0,18}(?:فتح|تفعيل)?.{0,12}(?:الطلب|المعامله|المعاملة)/.test(q)
    || /(?:ارجع|أرجع|رجع).{0,18}(?:افتح|أفتح|فتح|اكمل|أكمل|اقدم|أقدم).{0,18}(?:الطلب|طلب|المعامله|المعاملة)/.test(q)
    || /(?:بدي|حاب|اريد|أريد)?\s*(?:افتح|أفتح|فتح).{0,8}(?:الطلب|طلب)(?:\s|$)/.test(q)
    || /(?:فك|الغاء|إلغاء).{0,14}(?:الالغاء|الإلغاء)/.test(q);
}

function commercialFileOpeningText(value: string | null | undefined) {
  const q = n(value);
  if (!q || explicitReopenApplicationText(value)) return false;
  return /(?:بدي|حاب|اريد|أريد|خليني|يلا|ممكن)?\s*(?:افتح|أفتح|فتح|نفتح).{0,14}(?:الملف|ملف)(?:\s|$)/.test(q);
}

function asksOperationalCalendarQuestion(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  const weekend = /(?:الجمعه|الجمعة|السبت|عطله|عطلة|الويكند|ويكند)/.test(q);
  const operation = /(?:دراسه|دراسة|مراجعه|مراجعة|موعد|مواعيد|استلام|تسليم|حضور|دوام|تاجيل|تأجيل|يتحسب|ينحسب|تحسب|ايام|أيام)/.test(q);
  return weekend && operation;
}

function operationalCalendarReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const policy = input.truth.policy;
  const appDevice = String(input.truth.application?.deviceName || "");
  const mentionsIphone18 = /(?:iphone|ايفون|آيفون)\s*18\b/i.test(String(input.turn.rawText || "")) || /(?:iphone|ايفون|آيفون)\s*18\b/i.test(appDevice);
  const asksStudy = /(?:دراسه|دراسة|مراجعه|مراجعة|يتحسب|ينحسب|تحسب|ايام|أيام)/.test(q);
  const parts = [policy.pickupRule];
  if (asksStudy) parts.push(policy.normalReviewWindow);
  if (mentionsIphone18) parts.push(policy.recentReleaseAvailabilityRule);
  return Array.from(new Set(parts.filter(Boolean))).join(" ");
}

function asksFeeDocumentQuestion(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  const document = /(?:فاتوره|فاتورة|ايصال|إيصال|سند\s+قبض)/.test(q);
  const fee = /(?:5|٥|الخمس|الخمسه|الخمسة|رسوم|فتح\s+الملف)/.test(q);
  const beforePayment = /(?:قبل|بدون).{0,20}(?:الدفع|التحويل|احول|أحول)|(?:باسم|اسم).{0,12}(?:الشركه|الشركة)/.test(q);
  return document && fee && beforePayment;
}

function feeDocumentQuestionReply() {
  return "إذا قصدك فاتورة أو إيصال مالي رسمي باسم الشركة قبل التحويل: ما عندي من النظام الحالي مستند صادر قبل الدفع أقدر أؤكد لك إنه متوفر. ما رح أخترع فاتورة أو أوعدك بمستند مش مثبت. إذا وجود فاتورة قبل الدفع شرط إلك، لا تحوّل قبل ما يتم تأكيد توفرها إداريًا. أما بعد التحويل فإثبات الدفع يُرفع من المسار الرسمي ويُعتمد إداريًا.";
}

function hasAuthoritativeMutationResult(actions: ActionResult[], turn?: InterpretedTurn) {
  const reopenAllowed = !turn || explicitReopenApplicationText(turn.rawText);
  return actions.some((a) => {
    if (a.action === "reopen_application" && !reopenAllowed) return false;
    return ["cancel_application", "request_refund", "stop_refund", "reopen_application", "link_whatsapp_alias"].includes(a.action)
      && (a.executed || ["executed", "already_done", "needs_confirmation", "blocked", "failed", "dry_run"].includes(a.outcome));
  });
}

function authoritativeStopOrReopenReply(input: { actions: ActionResult[]; truth: TruthBundle; turn: InterpretedTurn }) {
  const tracking = input.truth.application?.trackingId ? ` على الطلب ${input.truth.application.trackingId}` : "";
  const stop = input.actions.find((a) => a.action === "stop_refund");
  if (stop) {
    if (stop.outcome === "needs_confirmation") return `طلب إيقاف الاسترداد واضح${tracking}. للتأكيد النهائي اكتب: نعم، بدي أوقف طلب الاسترداد وأرجع أكمل طلب التقسيط.`;
    if (stop.outcome === "executed") return `تم إيقاف طلب الاسترداد وإعادة تفعيل طلبك${tracking}. المتابعة بتكمل على نفس الطلب.`;
    if (stop.outcome === "already_done") return `ما في استرداد نشط يحتاج إيقاف${tracking}؛ الطلب مستمر أصلًا حسب النتيجة الموثقة.`;
    return `طلب إيقاف الاسترداد واضح${tracking}، لكن الإجراء ما تنفذ فعليًا لحد الآن. ما رح أعتبر الاسترداد موقوف قبل ما تثبت النتيجة بالنظام.`;
  }
  const reopen = explicitReopenApplicationText(input.turn.rawText) ? input.actions.find((a) => a.action === "reopen_application") : undefined;
  if (reopen) {
    if (reopen.outcome === "needs_confirmation") return `طلب إعادة فتح الطلب واضح${tracking}. للتأكيد النهائي اكتب: نعم، بدي أعيد فتح الطلب وأكمل عليه.`;
    if (reopen.outcome === "executed") return `تم إعادة فتح طلبك${tracking} بنجاح، والمتابعة بتكمل على نفس الطلب.`;
    if (reopen.outcome === "already_done") return `طلبك${tracking} مفتوح أصلًا وما في داعي نعيد فتحه.`;
    return `طلب إعادة فتح الطلب واضح${tracking}، لكن الإجراء ما تنفذ فعليًا لحد الآن. ما رح أقول إنه انفتح قبل ما تثبت النتيجة بالنظام.`;
  }
  return null;
}

function conditionalFutureMutationText(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  return /(?:لو|اذا|ادا).{0,70}(?:تاخر|تأخر|طول|طوّل|ما\s+طلع|ما\s+صدر|ما\s+خلص|ما\s+تم).{0,70}(?:بدي|راح|رح|ممكن).{0,24}(?:الغي|الغاء|استرد|استرجع)/.test(q);
}

function hasCurrentSensitiveMutation(turn: InterpretedTurn) {
  // Never trust a model/planner action label by itself here. Production showed that
  // informational and conditional phrases can be mislabelled as a mutation. Only
  // an unconditional current imperative may own the destructive-action obligation.
  const q = n(turn.rawText);
  if (!q || conditionalFutureMutationText(turn.rawText)) return false;
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

function genericCurrentQuestionDeflection(reply: string | null | undefined) {
  const q = n(reply);
  return /(?:اخر\s+رساله|الرساله\s+الاخيره).{0,45}(?:ما\s+قدرت|مش\s+قادر|ما\s+قدرتش).{0,45}(?:احدد|تحديد|المطلوب)/.test(q)
    || /(?:اكتب|احكيلي).{0,28}(?:المطلوب\s+نفسه|النقطه\s+اللي\s+بدك\s+جوابها|شو\s+بدك\s+بالزبط)/.test(q);
}

function staleMediaCandidateOnTextTurn(turn: InterpretedTurn, reply: string | null | undefined) {
  if (isMediaEnvelope(turn)) return false;
  const q = n(reply);
  if (!q) return false;
  return /(?:وصلني|وصلتني|وصلت).{0,28}(?:المرفق|الصوره|الصورة|الرساله\s+الصوتيه|الرسالة\s+الصوتية)|(?:المرفق).{0,35}(?:اكتبلي|وضح)/.test(q);
}

function staleMediaTextTurnRepair(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const contract = buildCurrentQuestionAnswerContractReply(input);
  if (contract) return contract;
  const q = n(input.turn.rawText);
  if (/(?:ياريت|لو\s+سمحت).{0,28}(?:تبعت|ابعث|ابعت|ترسل|تبعتولي|تبعثولي)/.test(q)) {
    return "أكيد. إذا ظهر تحديث فعلي وموثّق على طلبك بنبلغك من نفس مسار المتابعة؛ ما رح أعتبر رسالتك مرفق جديد.";
  }
  if (pureSocialClosureTurnForArbiter(input.turn)) return buildSocialClosureReplyForArbiter(input.turn);
  return statusReply({ turn: input.turn, truth: input.truth, state: input.state });
}

export function responseHasKnownBadFallbackSignature(reply: string | null | undefined) {
  return staleContinuationReply(reply)
    || missingDetailsReply(reply)
    || repeatedKnownTrackingReply(reply)
    || noUpdateDeflection(reply)
    || genericCurrentQuestionDeflection(reply);
}

function asksTrackingLink(value: string | null | undefined) {
  const q = n(value);
  // device_change_link_owns_current_turn: an explicit link object outranks the
  // generic word "رابط" so a device-change link can never become a tracking link.
  if (/(?:رابط).{0,35}(?:تغيير|تعديل).{0,24}(?:الجهاز|الموديل)|(?:تغيير|تعديل).{0,24}(?:الجهاز|الموديل).{0,35}(?:رابط)/.test(q)) return false;
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
  if (explicitExpediteRequestTextForArbiter(value)) return true;
  if (turn.topics.includes("review_timing") || turn.topics.includes("operational_pressure")) return true;
  return /(?:متى|امتى|قديش|كم|تاريخ).{0,35}(?:وقت|بتاخد|بتطول|الموافقه|النتيجه|القرار)|(?:ممكن|بزبط|هل).{0,22}(?:تصدر|تطلع|يطلع).{0,24}(?:الموافقه|الموافقة|النتيجه|النتيجة|القرار).{0,24}(?:بنفس|نفس)\s+اليوم|(?:صارلي|صارله|الها|الو).{0,24}(?:يوم|ايام|اسبوع|اسابيع)|(?:طولت|طوّلت|تاخرت|تأخرت|ليش\s+طولت|مش\s+ناوين\s+يخلصو|ناوين\s+يخلصو|معلق).{0,35}(?:الطلب|الملف|الدراسه|الموافقه)?/.test(q);
}

function asksRefundMeaning(value: string | null | undefined) {
  const q = n(value);
  return /(?:شو|ايش|اش|ليش|ليه|لشو|ما\s+معنى|مغزى|مغزاه).{0,35}(?:الاسترداد|استرداد)|(?:الاسترداد|استرداد).{0,35}(?:شو|تبع\s+شو|ليش|ليه|لشو|يعني|معناه|مغزاه)/.test(q);
}

function asksRefundTiming(value: string | null | undefined, truth: TruthBundle) {
  const q = n(value);
  const stage = applicationJourneyStage(truth.application);
  const timingWord = /(?:^|\s)(?:وين|متى|متي|امتى|امتي|اميت|قديش|كم)(?:\s|$)/.test(q);
  const moneyWord = /(?:مصاري|المصاري|المبلغ|الرسوم|رسوم|الاسترداد|استرداد|الخمس|الخمسه|5|٥)/.test(q);
  const explicit = (timingWord && moneyWord)
    || /(?:بترجع|برجع|بيرجع|يرجع).{0,30}(?:متى|متي|امتى|امتي|اميت|قديش|كم)(?:\s|$)/.test(q)
    || /^(?:وينهم|اميت|متى|متي|امتى|امتي)$/.test(q);
  if (explicit) return true;
  if (stage === "refund_requested" && /^(?:كم|قديش).{0,24}(?:تحتاج|بدها|بدو|بياخد|ياخد|وقت|مده|مدة)|^(?:متى|امتى|لحد\s+متى|الى\s+متى|إلى\s+متى)$/.test(q)) return true;
  return stage === "refund_requested" && /^(?:وينها|وينهم|شو\s+هسا|شو\s+صار|[؟?]+)$/.test(q);
}

function asksRefundProcessProblem(value: string | null | undefined, truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  if (stage !== "refund_requested" && stage !== "refund_completed" && stage !== "cancelled") return false;
  const q = n(value);
  const refundContext = /(?:استرداد|استرجاع|الرسوم|الخمس|5|٥)/.test(q);
  const linkOrForm = /(?:الرابط|الصفحه|الصفحة|خانات|خانة|حقل|حقول|بيانات)/.test(q);
  const broken = /(?:ما\s+في|ما\s+فيه|مش\s+موجود|ما\s+بطلع|ما\s+بيطلع|ما\s+بدخل|ما\s+بيدخل|ما\s+بفتح|ما\s+بيفتح|فاضي|فاضية|خطا|خطأ)/.test(q);
  return (refundContext && linkOrForm && broken) || (linkOrForm && broken && /(?:ادخل|أدخل|اضيف|أضيف|اثبت|أثبت|اعبي|أعبي|عبي|عبّي|املأ|املا)/.test(q));
}

function refundProcessProblemReply(truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  if (stage === "refund_completed") return "الاسترداد مكتمل حسب الحالة الحالية، فما في داعي تدخل بيانات استرداد جديدة.";
  if (stage === "refund_requested") return "طلب الاسترداد مسجل فعلًا، ومشكلة الرابط ما تعني إنك تعيد طلب الاسترداد أو الإلغاء. لا تبعث بيانات الاسترداد الحساسة على واتساب. حدّث صفحة الاسترداد مرة واحدة؛ وإذا ظل الرابط يفتح بدون حقول أو ظهر خطأ، اكتبلي نص الخطأ أو احكيلي إذا الصفحة فاضية بالكامل وبنكمل على نفس طلب الاسترداد.";
  return "الطلب ملغي حسب الحالة الحالية. إذا رابط الاسترداد ما بعرض حقول تثبيت البيانات، لا تعيد الإلغاء ولا تبعث بيانات مالية على واتساب؛ احكيلي شو ظاهر بالصفحة وبنكمل من نفس المسار.";
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
  return /(?:يوجد|في|عندكم).{0,15}(?:توصيل|دليفري)|(?:التوصيل|توصيل).{0,20}(?:موجود|في|عندكم|ولا)|(?:الاستلام).{0,20}(?:توصيل|مكتب)/.test(q)
    || /(?:متى|امتى|قديش|كم|ليش).{0,35}(?:استلم|الاستلام|التسليم)|(?:استلم|الاستلام|التسليم).{0,35}(?:متى|امتى|بعد\s+شهر|شهر|قديش|كم|ليش)/.test(q);
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
  // Phase 11.7: media authority belongs only to a literal current-turn transport
  // envelope. A stale/model topic such as receipt_upload can never make a later
  // text question look like a new attachment.
  return /تم\s+استلام\s+(?:صوره|صورة|رساله\s+صوتيه|رسالة\s+صوتية|فيديو|ملف)\s+من\s+العميل/.test(q);
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

function contactIdentityMismatchReply(input: { truth: TruthBundle; state: ConversationState }) {
  const app = input.truth.application;
  if (input.truth.contactAccess === "safe_preview" && app) {
    const preview = `لقيت الطلب${app.trackingId ? ` ${app.trackingId}` : ""}${app.deviceName ? ` — ${app.deviceName}` : ""}. حالته الآن: ${customerFacingStatusLabel(app)}.`;
    if (input.state.contactResolution?.status === "awaiting_alias_confirmation") {
      return `${preview} ضل بس تأكيدك على ربط رقم الواتساب الحالي بنفس الطلب. إذا موافق اكتب: نعم، اعتمد الرقم. رقم الهاتف الأساسي بالطلب ما رح يتغير.`;
    }
    return `${preview} رقم الواتساب الحالي مختلف عن رقم الهاتف الأساسي بالطلب، بس هذا ما بوقف المتابعة. إذا هذا واتسابك وبدك أعتمده كرقم تابع لنفس الطلب، اكتب: نعم، اعتمد الرقم. بعد تأكيدك الواضح بنفذ الربط مباشرة، ورقم الهاتف الأساسي بالطلب بيضل كما هو.`;
  }
  return "إذا عندك رقم التتبع ابعثه مرة واحدة. براجع الطلب وبعطيك معلومات تشغيلية آمنة عنه، وإذا رقم واتسابك مختلف عن رقم الهاتف الأساسي بقدر أعرض عليك اعتماده على نفس الطلب بتأكيد واحد واضح.";
}

function asksRequirementsQuestion(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q) return false;
  if (/(?:شروط|بنود)\s+العقد/.test(q)) return false;
  const requirementObject = /(?:شروط|الشروط|المتطلبات|الاوراق|الأوراق|وثائق|الوثائق|مستند|مستندات|كفيل|ضامن|اثبات\s+دخل|إثبات\s+دخل|كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب)/;
  const asks = /(?:شو|ايش|إيش|ما|هل|ايه|إيه).{0,28}(?:شروط|الشروط|المتطلبات|الاوراق|الأوراق|وثائق|الوثائق|مستند|مستندات|اثبات\s+دخل|إثبات\s+دخل|كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب)|(?:شو\s+لازم|شو\s+مطلوب).{0,28}(?:للتقديم|للطلب|مني|ارفع|أرفع)|(?:هل|بدي|محتاج).{0,24}(?:كفيل|ضامن|وثائق|مستندات)|(?:كفيل|الكفيل).{0,24}(?:لازم|مطلوب|ضروري|هل)|(?:اثبات\s+دخل|إثبات\s+دخل).{0,24}(?:قصدك|يعني|هو).{0,20}(?:كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب)/.test(q);
  return asks || (turn.topics.includes("requirements") && requirementObject.test(q));
}

function asksContractTermsQuestion(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q) return false;
  return /(?:شو|ايش|إيش|ما).{0,22}(?:شروط\s+العقد|بنود\s+العقد)|(?:شروط\s+العقد|بنود\s+العقد).{0,22}(?:شو|ايش|إيش|ما|كيف)/.test(q);
}

function requirementsQuestionReply(truth: TruthBundle) {
  return `${truth.policy.requirementsGuidanceRule} ${truth.policy.secureDocumentsRule}`.replace(/\s+/g, " ").trim();
}

function contractTermsQuestionReply(truth: TruthBundle) {
  return `${truth.policy.commercialStructureRule} ${truth.policy.additionalFeesRule} ${truth.policy.firstInstallmentRule} ${truth.policy.requirementsGuidanceRule}`.replace(/\s+/g, " ").trim();
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
  if (hasAuthoritativeMutationResult(input.actions, input.turn)) return "mutation_truth";
  if (structuredApplicationStatusRequest(input.turn)) return "application_status";
  if (pureGreetingTurnForArbiter(input.turn)) return "social_greeting";
  if (pureSocialClosureTurnForArbiter(input.turn)) return "social_closure";

  // Phase 11.7 precedence: the literal current customer question owns the answer
  // before journey-stage, media, delivery, or stale commercial context.
  if (currentHumanTurn.kind !== "none") return "current_human_turn";
  const answerBundle = resolveAnswerBundle({ turn: input.turn, state: input.state, truth: input.truth });
  if (answerBundle.kind !== "none") return "answer_bundle";
  if (asksOperationalCalendarQuestion(input.turn.rawText)) return "operational_calendar";
  if (asksFeeDocumentQuestion(input.turn.rawText)) return "fee_document_question";
  if (semanticQuestionLock.kind !== "none") return semanticQuestionLock.kind;
  if (refundHumanCareMode({ turn: input.turn, state: input.state, truth: input.truth })) return "refund_human_care";
  if (conditionalFutureMutationText(input.turn.rawText)) return "conditional_future_mutation";
  if (hasCurrentSensitiveMutation(input.turn)) return "mutation_truth";
  if (meaningLock.kind !== "none") return meaningLock.kind;

  if (asksDocumentUploadGuidance(input.turn, input.state)) return "document_upload_guidance";
  if (asksInstallmentServiceOverview(input.turn.rawText)) return "installment_service_overview";

  const turn = repairContextTurn(input.turn, input.state);
  if (asksTrackingLink(turn.rawText)) return "tracking_link";
  if (asksContactChannel(turn.rawText, turn)) return "contact_channel";
  if (asksApplicationExists(turn.rawText)) return "application_exists";
  if (asksApprovalStatus(turn.rawText)) return "approval_status";
  if (asksRefundProcessProblem(turn.rawText, input.truth)) return "refund_process_problem";
  if (asksRefundTiming(turn.rawText, input.truth)) return "refund_timing";
  if (asksReviewTiming(turn.rawText, turn)) return "review_timing";
  if (asksRefundMeaning(turn.rawText)) return "refund_meaning";
  if (asksRequirementsQuestion(turn)) return "requirements_question";
  if (asksContractTermsQuestion(turn)) return "contract_terms_question";
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
  const window = input.truth.policy.normalReviewWindow || "من يومين لـ3 أيام تشغيلية؛ الجمعة والسبت لا تُحتسبان ولا تُنفذ فيهما دراسة";
  const pressure = input.truth.policy.severePressureRule || "حاليًا في ضغط مراجعات شديد وقد تتأخر بعض الملفات أكثر من المعدل الطبيعي.";
  if (explicitExpediteRequestTextForArbiter(input.turn.rawText)) {
    const status = app ? ` طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الآن ${customerFacingStatusLabel(app)}.` : "";
    return `فاهم إنك طالب استعجال للطلب.${status} ما بقدر أضمن تقديم الدور أو موعد قرار غير موثق، وما رح أقول إن الأولوية تغيّرت قبل تنفيذ إداري فعلي.`;
  }
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
  const stopRefundRequest = /(?:وقف|اوقف|ايقاف|الغاء|الغي).{0,34}(?:طلب\s+)?(?:الاسترداد|الاسترجاع)/.test(q);
  if (stopRefundRequest) {
    if (stage === "refund_requested") return `طلبك واضح: بدك توقف الاسترداد وترجع تكمل نفس الطلب${app?.trackingId ? ` ${app.trackingId}` : ""}. للتأكيد النهائي اكتب: نعم، بدي أوقف طلب الاسترداد وأرجع أكمل طلب التقسيط.`;
    if (stage === "refund_completed") return "الاسترداد مكتمل حسب الحالة الحالية، لذلك ما بقدر أعتبره قابلًا للإيقاف من المحادثة وحدها.";
    return "ما في طلب استرداد نشط ظاهر على الحالة الحالية يحتاج إيقاف.";
  }
  const reopenRequest = explicitReopenApplicationText(input.turn.rawText);
  if (reopenRequest && ["cancelled", "refund_requested"].includes(stage)) {
    return `طلب إعادة فتح الطلب واضح${app?.trackingId ? ` ${app.trackingId}` : ""}. للتأكيد النهائي اكتب: نعم، بدي أعيد فتح الطلب وأكمل عليه.`;
  }
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
    return `نعم، ما في دفعة أولى للجهاز. القسط الأول يستحق بعد شهر من تاريخ توقيع العقد، وتاريخ توقيع العقد هو نفسه تاريخ استلام الجهاز. ورسوم فتح الملف ${fee} دنانير خطوة منفصلة بعد الموافقة المبدئية واختيار الاستمرار.`;
  }
  if (/(?:بترجع|برجع|مسترده|مستردة|بترجعو|برجعو)/.test(q)) {
    return `نعم، رسوم فتح الملف ${fee} دنانير مستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية بعد دفع مؤكد، وكذلك إذا ألغيت بعد دفع مؤكد. ما بعتبر الاسترداد منفذ إلا لما تتحدث الحالة فعليًا.`;
  }
  if (/(?:ليش|ليه|لشو|شو\s+سبب|شو\s+فايده|شو\s+فائدة)/.test(q)) {
    return `رسوم فتح الملف ${fee} دنانير هي خطوة فتح الملف واستكماله للدراسة النهائية. هدفها تنظيم الدخول لهالمرحلة وقياس جدية الطلب والاستعداد المبدئي لإكمال الالتزامات المالية؛ لأن حجم الطلبات كبير جدًا وما بنقدر ندخل كل الطلبات غير الجادة في المراجعة التفصيلية ونأخر أصحاب الطلبات الجادة. هي مؤشر أولي فقط، ومش تقييم نهائي للقدرة الائتمانية ولا ضمان للموافقة، ومش ثمن الجهاز ولا قسط مقدم ولا القسط الأول. وإذا ما صدرت الموافقة النهائية بعد دفع مؤكد فهي مستردة بالكامل عبر المسار الرسمي، وإذا تم دفعها وبعدها قررت تلغي بتدخل ضمن مسار الاسترداد الرسمي بعد تأكيد الدفع إداريًا.`;
  }
  if (["payment_confirmed_under_review", "payment_proof_pending_admin"].includes(stage)) return "لا، ما تدفع 5 دنانير مرة ثانية؛ الدفع/الوصل موجود على الملف حسب الحالة الحالية.";
  if (stage === "continuation_confirmed_fee_due") return `نعم، إذا بدك تكمل من المرحلة الحالية فالمطلوب ${fee} دنانير رسوم فتح الملف. بعدها ترفع الوصل من الرابط الرسمي، وبعد اعتماد الدفع يدخل الملف للدراسة النهائية.`;
  if (stage === "preliminary_approved_waiting_decision") return `رسوم فتح الملف ${fee} دنانير ما بتصير إلا بعد الموافقة المبدئية لما تختار الاستمرار. قبل اختيار الاستمرار ما بطلب منك دفعها.`;
  return `رسوم فتح الملف ${fee} دنانير مرتبطة بمرحلة ما بعد الموافقة المبدئية واختيار الاستمرار، وهي منفصلة عن القسط الأول.`;
}

function productAvailabilityReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const iphone18 = buildIphone18AuthoritativeReply(input.turn.rawText);
  if (iphone18) return iphone18;
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
  const device = String(input.truth.application?.deviceName || "");
  const iphone18 = /(?:iphone|ايفون|آيفون)\s*18\b/i.test(String(input.turn.rawText || "")) || /(?:iphone|ايفون|آيفون)\s*18\b/i.test(device);
  if (iphone18) return `${requirements}${input.truth.policy.recentReleaseAvailabilityRule} ${input.truth.policy.pickupRule}`;
  return `${requirements}ما في توصيل. الاستلام من المكتب فقط وبموعد رسمي مؤكد بعد استحقاق مرحلة الاستلام. ${input.truth.policy.pickupRule}`;
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
  return `أكيد. التقديم بيبدأ من الموقع الرسمي باختيار الجهاز وتعبئة طلب الموافقة المبدئية. الأساس هو الهوية وإثبات الدخل؛ وإذا ما عندك كشف أو شهادة راتب ممكن ترفع بديل رسمي مثل كشف حساب بنكي أو عقد عمل أو مستند يوضح مصدر الدخل، والدراسة هي اللي بتحدد المقبول النهائي. الكفيل مش شرط ثابت لكل طلب. بعد الموافقة المبدئية، إذا اخترت الاستمرار، رسوم فتح الملف 5 دنانير فقط وهي منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. القسط الأول بيستحق بعد شهر من تاريخ توقيع العقد، وتاريخ توقيع العقد هو نفسه تاريخ استلام الجهاز.\n${products}`;
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

function conditionalFutureMutationReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const app = input.truth.application;
  const status = app ? ` طلبك${app.trackingId ? ` ${app.trackingId}` : ""} يظل على حالته الحالية: ${customerFacingStatusLabel(app)}.` : "";
  if (/(?:الغي|الغاء|إلغاء)/.test(q)) return `فهمت قصدك: هذا شرط للمستقبل إذا استمر التأخير، مش طلب إلغاء حالي.${status} ما رح أسجل إلغاء من هالرسالة. وإذا قررت الإلغاء فعلًا لاحقًا، احكيها كقرار مباشر وبطلب منك تأكيد مستقل قبل التنفيذ.`;
  if (/(?:استرد|استرجع|استرداد|استرجاع)/.test(q)) return `فهمت قصدك: هذا شرط للمستقبل، مش طلب استرداد حالي.${status} ما رح أسجل استرداد من هالرسالة. وإذا قررت الاسترداد فعلًا لاحقًا، احكيه كقرار مباشر وبطلب منك تأكيد مستقل قبل التنفيذ.`;
  return `فهمت إنك بتحكي عن إجراء محتمل بالمستقبل، مش طلب تنفيذ حالي.${status} ما رح أنفذ تغيير من كلام شرطي.`;
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
      return buildSemanticQuestionLockReply({ lock: resolveSemanticQuestionLock({ turn: input.turn, truth: input.truth }), turn: input.turn, truth: input.truth, state: input.state });
    case "mutation_request": return mutationRequestReply({ turn: input.turn, truth: input.truth });
    case "tracking_link": return trackingReply({ turn, truth: input.truth });
    case "contact_identity_mismatch": return contactIdentityMismatchReply({ truth: input.truth, state: input.state });
    case "contact_channel": return "المتابعة الأساسية للطلبات من خلال واتساب الحالي. ما عندي رقم تواصل إضافي رسمي موثق أقدر أعطيك إياه.";
    case "application_exists": return applicationExistsReply(input.truth);
    case "approval_status": return approvalReply(input.truth);
    case "refund_human_care": return buildRefundHumanCareReply({ turn: input.turn, state: input.state, truth: input.truth }) || refundTimingReply({ turn, truth: input.truth });
    case "current_human_turn": return buildCurrentHumanTurnReply({ authority: resolveCurrentHumanTurnAuthority({ turn: input.turn, state: input.state, truth: input.truth }), turn: input.turn, state: input.state, truth: input.truth });
    case "answer_bundle": return buildAnswerBundleReply({ bundle: resolveAnswerBundle({ turn: input.turn, state: input.state, truth: input.truth }), turn: input.turn, state: input.state, truth: input.truth });
    case "human_semantic_care": return buildHumanSemanticCareReply({ turn: input.turn, state: input.state, truth: input.truth });
    case "refund_timing": return refundTimingReply({ turn, truth: input.truth });
    case "refund_process_problem": return refundProcessProblemReply(input.truth);
    case "operational_calendar": return operationalCalendarReply({ turn, truth: input.truth });
    case "review_timing": return reviewTimingReply({ turn, truth: input.truth });
    case "refund_meaning": return refundMeaningReply(input.truth);
    case "fee_document_question": return feeDocumentQuestionReply();
    case "fee_question": return feeQuestionReply({ turn, truth: input.truth });
    case "conditional_future_mutation": return conditionalFutureMutationReply({ turn, truth: input.truth });
    case "requirements_question": return requirementsQuestionReply(input.truth);
    case "contract_terms_question": return contractTermsQuestionReply(input.truth);
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
    case "social_greeting": return buildGreetingReplyForArbiter(turn);
    case "social_closure": return buildSocialClosureReplyForArbiter(turn);
    default: return null;
  }
}

function candidateLooksResponsive(input: { obligation: ResponseObligation; candidate: string | null | undefined; truth: TruthBundle; turn: InterpretedTurn; state: ConversationState }) {
  const raw = sanitizeUnifiedEgressReply(input.candidate);
  if (!raw) return false;
  if (responseHasKnownBadFallbackSignature(raw)) return false;
  const q = n(raw);
  const stage = applicationJourneyStage(input.truth.application);
  if (["operational_calendar", "fee_document_question", "review_timing", "pickup_delivery"].includes(input.obligation)) return false;
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
    case "refund_process_problem": return false;
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
    case "conditional_future_mutation": return false;
    case "requirements_question": return false;
    case "contract_terms_question": return false;
    case "product_availability": return false;
    case "pickup_delivery": return /(?:ما\s+في\s+توصيل|الاستلام\s+من\s+المكتب)/.test(q);
    case "post_payment_next_step": return false;
    case "external_system_question": return /(?:ما\s+عندي).{0,35}(?:معلومه\s+موثقه|تكامل).{0,45}(?:كريف|crif|ائتماني)/i.test(q);
    case "general_eligibility": return /(?:دراسه\s+الملف|دراسة\s+الملف|اثبات\s+الدخل|إثبات\s+الدخل|كشف\s+حساب|عقد\s+عمل|كفيل)/.test(q) && !/(?:طلبك\s+ملغي|طلبك\s+موافقه\s+مبدئيه)/.test(q);
    case "application_start": return /products|صفحه\s+المنتجات|صفحة\s+المنتجات|الموقع\s+الرسمي/.test(q);
    case "installment_service_overview": return /(?:التقديم|الموقع\s+الرسمي).{0,90}(?:الهويه|الهوية|اثبات\s+الدخل|إثبات\s+الدخل)|(?:رسوم\s+فتح\s+الملف).{0,60}(?:5|٥)/.test(q);
    case "document_upload_guidance": return /(?:الرابط\s+الرسمي|المسار\s+الرسمي).{0,70}(?:الهويه|الهوية|اثبات\s+الدخل|إثبات\s+الدخل|المستندات)/.test(q) && !staleContinuationReply(raw);
    case "current_question_contract": return false;
    case "identity": return /(?:فريق\s+الامين|فريق\s+الأمين|معك\s+\S+)/.test(q) && !missingDetailsReply(raw);
    case "media": return /(?:وصلت|وصلني|المرفق|الصوره|الصورة|الصوتيه|الصوتية)/.test(q) && !missingDetailsReply(raw);
    case "application_status": return /(?:حاله|حالة|قيد|موافقه|موافقة|ملغي|استرداد|مراجعه|مراجعة)/.test(q) && !staleContinuationReply(raw);
    case "foreign_content_clarification": return !missingDetailsReply(raw) && /(?:النص|الرساله|الرسالة|ايميل|إيميل|اشرح|الخص|ألخص|رد)/.test(q);
    case "social_greeting": return /(?:اهلين|أهلين|وعليكم\s+السلام|صباح\s+النور|مساء\s+النور|الحمدلله)/.test(q) && !/(?:قيد\s+الدراسه|قيد\s+الدراسة|رسوم\s+فتح\s+الملف)/.test(q);
    case "social_closure": return /(?:العفو|الله\s+يعطيك\s+العافيه|الله\s+يعطيك\s+العافية|ان\s+شاء\s+الله|إن\s+شاء\s+الله)/.test(q)
      && !/(?:يومين|3\s+ايام|3\s+أيام|قيد\s+الدراسه|قيد\s+الدراسة|رسوم\s+فتح\s+الملف|الدفع\s+مؤكد|الاسترداد)/.test(q);
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

  // Phase 11.9.1: a new text turn immediately expires stale media authority.
  if (staleMediaCandidateOnTextTurn(input.turn, candidate)) {
    const repair = staleMediaTextTurnRepair({ turn: input.turn, state: input.state, truth: input.truth });
    return { reply: sanitizeUnifiedEgressReply(repair), obligation: "current_question_contract", repaired: repair !== candidate, reason: "new text turn expired stale media authority before human-turn arbitration" };
  }

  const currentQuestionFirst = new Set<ResponseObligation>([
    "current_human_turn", "answer_bundle", "refund_human_care", "refund_timing", "refund_process_problem",
    "operational_calendar", "fee_document_question", "fee_question", "pickup_delivery", "approval_status",
    "review_timing", "conditional_future_mutation", "requirements_question", "contract_terms_question", "current_question_contract", "application_status",
  ]);

  // Phase 7.6.0: literal human meaning can veto a bad classifier before any
  // legacy payment/status meaning lock owns the egress. These are bounded,
  // deterministic repairs for production-proven cross-domain failures.
  const companyOverride = resolveHumanCompanyOverride({ turn: input.turn, state: input.state, truth: input.truth });
  if (companyOverride !== "none" && !currentQuestionFirst.has(obligation)) {
    const repair = buildHumanCompanyOverrideReply({ kind: companyOverride, state: input.state, truth: input.truth });
    if (repair) return { reply: sanitizeUnifiedEgressReply(repair), obligation: "current_human_turn", repaired: repair !== candidate, reason: `human company runtime current-turn override: ${companyOverride}` };
  }
  const paymentIncident = detectPaymentIncident(input.turn.rawText);
  if (paymentIncident !== "none") {
    const repair = buildPaymentIncidentReply({ kind: paymentIncident, expectedBeneficiary: input.truth.policy.paymentBeneficiaryName });
    if (repair) return { reply: sanitizeUnifiedEgressReply(repair), obligation: "current_human_turn", repaired: repair !== candidate, reason: `payment incident plane: ${paymentIncident}` };
  }

  if (obligation === "contact_identity_mismatch") {
    const repair = contactIdentityMismatchReply({ truth: input.truth, state: input.state });
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

  if (meaningLock.kind !== "none" && !currentQuestionFirst.has(obligation) && !candidateAlignedWithLockedMeaning({ meaning: meaningLock, candidate })) {
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

  // Phase 11.7.1: a semantic/stage lock is contextual support only. Once the
  // current turn has a deterministic explicit-question obligation, an older
  // payment/location/human stage lock cannot replace that answer.
  if (semanticQuestionLock.kind !== "none" && !currentQuestionFirst.has(obligation) && !semanticQuestionCandidateAligned({ lock: semanticQuestionLock, candidate, truth: input.truth, state: input.state })) {
    const lockedReply = buildSemanticQuestionLockReply({ lock: semanticQuestionLock, turn: input.turn, truth: input.truth });
    return { reply: sanitizeUnifiedEgressReply(lockedReply), obligation, repaired: lockedReply !== candidate, reason: `semantic question veto repaired cross-domain candidate: ${semanticQuestionLock.reason}` };
  }

  if (obligation === "mutation_truth") {
    const stopOrReopenReply = authoritativeStopOrReopenReply({ actions: input.actions, truth: input.truth, turn: input.turn });
    if (stopOrReopenReply) {
      return { reply: sanitizeUnifiedEgressReply(stopOrReopenReply), obligation, repaired: stopOrReopenReply !== candidate, reason: "stop-refund/reopen action result owns final response" };
    }
    if (hasAuthoritativeMutationResult(input.actions, input.turn)) {
      return { reply: candidate, obligation, repaired: false, reason: "mutation/action truth remains authoritative" };
    }
    // An explicit customer mutation request still needs the two-step confirmation
    // contract, but a stale continuation/status candidate must not hijack it.
    const q = n(candidate);
    const alreadyGood = /(?:اكدلي|أكدلي|اكتب).{0,35}(?:نعم).{0,35}(?:الغي|ألغي|استرداد|اعتمد\s+الرقم)|(?:ملغي بالفعل|الاسترداد مسجل بالفعل|رقم\s+الواتساب.{0,20}معتمد)/.test(q);
    if (alreadyGood) return { reply: candidate, obligation, repaired: false, reason: "mutation/action truth remains authoritative" };
    const repair = mutationRequestReply({ turn: input.turn, truth: input.truth });
    return { reply: repair, obligation, repaired: repair !== candidate, reason: "explicit mutation request repaired to confirmation contract" };
  }
  if (obligation === "social_greeting") {
    if (!input.forceRepair && candidateLooksResponsive({ obligation, candidate, truth: input.truth, turn: input.turn, state: input.state })) {
      return { reply: candidate, obligation: "none", repaired: false, reason: "literal greeting already answered naturally" };
    }
    const greeting = buildGreetingReplyForArbiter(input.turn);
    return { reply: sanitizeUnifiedEgressReply(greeting), obligation, repaired: greeting !== candidate, reason: "fresh-turn greeting vetoed stale previous-topic answer" };
  }
  if (obligation === "social_closure") {
    // Backward-compatible no-op when the writer already produced a clean social
    // close. 7.7.2 only takes authority when stale journey/status text leaked
    // into an acknowledgement-only turn.
    if (!input.forceRepair && candidateLooksResponsive({ obligation, candidate, truth: input.truth, turn: input.turn, state: input.state })) {
      return { reply: candidate, obligation: "none", repaired: false, reason: "social turn already closed naturally" };
    }
    const closure = buildSocialClosureReplyForArbiter(input.turn);
    return { reply: sanitizeUnifiedEgressReply(closure), obligation, repaired: closure !== candidate, reason: "fresh-turn social closure vetoed stale previous-topic answer" };
  }
  if (staleMediaCandidateOnTextTurn(input.turn, candidate)) {
    const repair = staleMediaTextTurnRepair({ turn: input.turn, state: input.state, truth: input.truth });
    return { reply: sanitizeUnifiedEgressReply(repair), obligation, repaired: repair !== candidate, reason: "stale media authority removed from non-media current turn" };
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
