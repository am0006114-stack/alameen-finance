import { detectHumanityViolations } from "./humanVoice";
import { actionRequiresOmran, roleDisplayName } from "./hierarchy";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { continuationCommercialState } from "./commercialProgression";
import { applicationJourneyStage, canDiscloseFileOpeningPayment, explicitContinuation, firstCustomerName } from "./applicationJourney";
import type { ActionResult, ConversationState, InterpretedTurn, ReplyPlan, TopicKey, TruthBundle, VerificationReport } from "./types";
import { normalizeArabic } from "./text";
import { detectReplyLinkViolations } from "./linkIntegrity";

function claimExecuted(text: string, action: string[]) {
  const t = normalizeArabic(text);
  return action.some((a) => t.includes(normalizeArabic(a)));
}

function actionOk(actions: ActionResult[], names: string[]) {
  return actions.some((a) => names.includes(a.action) && a.executed && ["executed","already_done"].includes(a.outcome));
}

function topicCovered(topic: TopicKey, text: string) {
  const t = normalizeArabic(text);
  const map: Partial<Record<TopicKey,string[]>> = {
    payment_fee: ["5 دنانير","رسوم فتح الملف"],
    payment_confirmation: ["الاداره","الإدارة","تاكيد الدفع","تأكيد الدفع","مراجعه الدفع","مراجعة الدفع"],
    first_installment: ["بعد شهر","القسط الاول"],
    office_location: ["شارع المدينه","عمان"],
    delivery: ["المكتب","لا يوجد توصيل","الاستلام"],
    receipt_upload: ["الرابط","رفع"],
    human_request: ["معك","الامين","الأمين"],
    manager_request: ["عمران","معك","راجع","متابعه"],
    application_status: ["طلب","حاله","تتبع"],
    refund: ["استرداد","استرجاع"],
    cancellation: ["الغاء","إلغاء"],
    continuation: ["استمرار","اكمل","إكمال"],
    reopen: ["اعاده","إعادة","تفعيل","فتح","تراجع"],
    review_timing: ["يومين","2","ثلاث","3","ضغط","مراجعات"],
    operational_pressure: ["ضغط","مراجعات","تاخير","تأخير"],
    appointment: ["موعد","المكتب"],
    call_request: ["واتساب","اتصال","مكالمه"],
    trust: ["مستقله","الأمين للأقساط"],
    device_change: ["الجهاز","الموديل","تغيير"],
    device_recalculation: ["القسط","الحسبه","الحسبة","السعر","شهر"],
    application_correction: ["تعديل","تصحيح","بيانات"],
    complaint: ["طلب","مشكله","مشكلة","راجع","حل","حق"],
    legal: ["طلب","حق","شكوى","راجع","قانون"],
    social_threat: ["نشر","تشهير","قانون","اعتراض","حق","طلب"],
  };
  const needles = map[topic];
  return !needles || needles.some((n) => t.includes(normalizeArabic(n)));
}

function reviewWindowViolation(reply: string, turn: InterpretedTurn) {
  if (!turn.topics.includes("review_timing")) return false;
  const n = normalizeArabic(reply);
  const q = normalizeArabic(turn.rawText);
  const asksBeyondNormal = ["بعد المده المحدده","بعد المدة المحددة","بعد المده","بعد المدة","كم يوم زياده","كم يوم زيادة","قديش زياده","قديش زيادة"].some((x) => q.includes(normalizeArabic(x)));
  const hasNormalWindow = /(?:2|يومين|يومان)\s*(?:الى|ل|ـ)?\s*(?:3|ثلاث)/.test(n) || (n.includes("يومين") && (n.includes("ثلاث") || n.includes("3")));
  const hasPressure = n.includes("ضغط") || n.includes("المراجعات") || n.includes("الظروف التشغيليه");
  if (asksBeyondNormal) {
    const honestNoFixedExtra = ["ما عندنا رقم", "ما في رقم", "ما عندي رقم", "غير ثابت", "موثق", "تخمين", "بخمّن", "بخمن"].some((x) => n.includes(normalizeArabic(x)));
    return !(hasPressure && honestNoFixedExtra);
  }
  return !(hasNormalWindow && hasPressure);
}

function customerRejectedAutoUpdatePhrase(recentTurns?: string[]) {
  return (recentTurns || []).some((line) => {
    if (!/^\s*(?:العميل|customer)\s*:/i.test(String(line || ""))) return false;
    const n = normalizeArabic(String(line || ""));
    const reject = n.includes("لا تحكيلي") || n.includes("لا تقلي") || n.includes("ما بدي") || n.includes("بلاش");
    return reject && (n.includes("اول ما") || n.includes("لما تخلص") || n.includes("لما يطلع"));
  });
}


function replyWordCount(value: string) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function riskReplyWordLimit(plan: ReplyPlan) {
  const substantive = plan.answerItems.filter(x => !["manager_request","human_request","greeting","thanks","acknowledgement"].includes(x.topic)).length;
  return Math.min(110, 68 + Math.max(0, substantive - 1) * 12);
}

function exposesInternalArchitecture(reply: string) {
  const n = normalizeArabic(reply);
  const raw = String(reply || "").toLowerCase();
  return n.includes(normalizeArabic("مستوى اشراف")) ||
    n.includes(normalizeArabic("مستوى الإشراف")) ||
    n.includes(normalizeArabic("داخل النظام")) ||
    n.includes(normalizeArabic("نظام التشغيل")) ||
    n.includes(normalizeArabic("ذكاء اصطناعي")) ||
    n.includes(normalizeArabic("تحويل داخلي")) ||
    n.includes(normalizeArabic("انتقلت المعالجه داخليا")) ||
    /\bsupervisor\b/.test(raw) || /\brouting\b/.test(raw) || /\bai\b/.test(raw);
}

function roleIntroduction(reply: string, roleName: string) {
  const n = normalizeArabic(reply);
  return n.includes(normalizeArabic(`معك ${roleName}`)) ||
    n.includes(normalizeArabic(`انا ${roleName}`)) ||
    n.includes(normalizeArabic(`أنا ${roleName}`));
}

function hasContinuationDecisionQuestion(reply: string) {
  const n = normalizeArabic(reply);
  return /هل\s*(?:تود|ترغب)[^؟?]{0,70}(?:الاستمرار|تكمل)|(?:بدك|حاب|حابب)[^؟?]{0,40}(?:تكمل|تستمر)/.test(n);
}

function hasPaymentDetail(reply: string) {
  const n = normalizeArabic(reply);
  return /(?:5|٥)\s*(?:دنانير|دينار)|رسوم\s*فتح\s*الملف|AMEEENPAY|AMENPAY|ABDUL\s+RAHMAN|\/receipt(?:\?|\b)|اسم\s*المستفيد|(?:حول|حوّل|تحويل)[^\n]{0,40}(?:كليك|cliq|محفظه|محفظة)/i.test(reply) ||
    n.includes(normalizeArabic("رسوم فتح الملف"));
}

function hasAnyPaymentLanguage(reply: string) {
  const n = normalizeArabic(reply);
  return /(?:دفع|رسوم|تحويل|حواله|حوالة|وصل\s*الدفع|اثبات\s*الدفع|إثبات\s*الدفع|كليك|cliq|محفظه|محفظة|مبلغ\s*مستحق|مستحق\s*(?:الان|الآن|حاليا|حاليًا))/i.test(reply) || n.includes(normalizeArabic("رسوم فتح الملف"));
}

function rawStatusLeaked(reply: string) {
  return /\b(?:preliminary_application|preliminary_qualified|customer_confirmed_continue|pending_payment|payment_info_sent|customer_claimed_paid|pending_payment_confirmation|needs_identity|needs_salary_slip|needs_guarantor|under_review|refund_requested|refund_completed)\b/i.test(reply);
}

function numericValueMentioned(reply: string, value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return true;
  const n = Number(value);
  const candidates = new Set([String(n), String(Math.round(n * 10) / 10), String(Math.round(n * 100) / 100)]);
  return Array.from(candidates).some((candidate) => reply.includes(candidate));
}

function asksFullApplicationSummary(turn: InterpretedTurn) {
  const q = normalizeArabic(turn.rawText);
  return [
    "معلومات طلبي",
    "معلومات الطلب",
    "تفاصيل طلبي",
    "تفاصيل الطلب",
    "بيانات طلبي",
    "بيانات الطلب",
    "شو معلومات طلبي",
    "شو معلومات الطلب",
    "شو تفاصيل طلبي",
    "شو تفاصيل الطلب",
  ].some((phrase) => q.includes(normalizeArabic(phrase)));
}

function forbiddenBusinessIdentityClaim(reply: string) {
  const n = normalizeArabic(reply);
  const businessRefs = "(?:الامين|الأمين|احنا|إحنا|نحن|جهتنا|الشركه|الشركة)";
  const forbiddenDescriptions = "(?:بنك|شركه تمويل|شركة تمويل|شركه اقراض|شركة اقراض|شركة إقراض)";
  return new RegExp(`${businessRefs}.{0,28}${forbiddenDescriptions}|${forbiddenDescriptions}.{0,28}${businessRefs}`, "i").test(n);
}

export function verifyReply(input: { reply: string; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle; plan: ReplyPlan; actions: ActionResult[]; recentTurns?: string[] }): VerificationReport {
  const reply = String(input.reply || "").trim();
  const t = normalizeArabic(reply);
  let missingTopics = input.plan.answerItems
    .filter((x) => !["greeting","thanks","acknowledgement","unknown"].includes(x.topic) && !topicCovered(x.topic,reply))
    .map((x) => x.topic);
  const unsupportedClaims: string[] = [];
  const truthContradictions: string[] = [];
  const actionClaimViolations: string[] = [];
  const policyViolations: string[] = [];
  const hierarchyViolations: string[] = [];
  const repetitionFlags: string[] = detectHumanityViolations(reply,input.recentTurns);
  policyViolations.push(...detectReplyLinkViolations({ reply, turn: input.turn, truth: input.truth }).map((x) => `link_integrity:${x}`));

  const journeyStage = applicationJourneyStage(input.truth.application);
  const continuationNow = explicitContinuation(input.turn);
  const paymentTopics: TopicKey[] = ["payment_fee","payment_method","payment_timing","payment_recipient","payment_status","payment_confirmation","receipt_upload"];
  const preContinuationStage = !canDiscloseFileOpeningPayment(input.truth.application, input.turn) && (journeyStage === "preliminary_review" || journeyStage === "preliminary_approved_waiting_decision");
  if (preContinuationStage) {
    // Before the customer explicitly chooses to continue, payment topics are intentionally deferred.
    // Do not fail coverage merely because the safe response refuses to expose payment details.
    missingTopics = missingTopics.filter((topic) => !paymentTopics.includes(topic));
  }

  if (rawStatusLeaked(reply)) policyViolations.push("raw_internal_application_status_exposed");
  if (/(?:هلق|هلّق|هلأ)/.test(reply)) repetitionFlags.push("non_jordanian_now_word");

  if (preContinuationStage) {
    if (hasPaymentDetail(reply)) policyViolations.push("payment_details_exposed_before_explicit_continuation");
    if (hasAnyPaymentLanguage(reply)) policyViolations.push("payment_language_exposed_before_explicit_continuation");
  }

  if (input.turn.topics.includes("application_status") && input.truth.application) {
    const app = input.truth.application;
    const contextualStatusConfirmation = input.turn.acts.some((act) => act.topic === "application_status" && act.value === "confirm_current_application_status");
    const firstName = firstCustomerName(app);
    const roleNameForAddress = roleDisplayName(input.plan.role);
    if (firstName && normalizeArabic(firstName) !== normalizeArabic(roleNameForAddress)) {
      const roleVocative = new RegExp(`^(?:\\s*(?:اخ|أخ)\\s+)?${roleNameForAddress}[،,:\\s]`, "i");
      if (roleVocative.test(reply) && !normalizeArabic(reply).startsWith(normalizeArabic(`معك ${roleNameForAddress}`))) policyViolations.push("staff_role_name_used_as_customer_name");
    }
    if (!contextualStatusConfirmation && asksFullApplicationSummary(input.turn)) {
      if (firstName && !normalizeArabic(reply).includes(normalizeArabic(firstName))) policyViolations.push("application_status_customer_name_missing");
      if (app.trackingId && !reply.includes(app.trackingId)) policyViolations.push("application_status_tracking_missing");
      if (app.deviceName && !reply.toLowerCase().includes(String(app.deviceName).toLowerCase())) policyViolations.push("application_status_device_missing");
      if (!numericValueMentioned(reply, app.monthlyPayment)) policyViolations.push("application_status_monthly_payment_missing");
      if (app.installmentMonths && !reply.includes(String(app.installmentMonths))) policyViolations.push("application_status_installment_duration_missing");
    }

    if (journeyStage === "preliminary_review") {
      const preliminaryLabelOk =
        t.includes(normalizeArabic("مراجعة مبدئية")) ||
        t.includes(normalizeArabic("قيد المراجعة المبدئية")) ||
        t.includes(normalizeArabic("مراجعة أولية")) ||
        t.includes(normalizeArabic("قيد المراجعة الأولية"));
      if (!preliminaryLabelOk) policyViolations.push("preliminary_review_status_label_missing");
      if (hasContinuationDecisionQuestion(reply)) policyViolations.push("continuation_question_before_preliminary_approval");
    }

    if (journeyStage === "preliminary_approved_waiting_decision" && !continuationNow) {
      if (!t.includes(normalizeArabic("موافقة مبدئية"))) policyViolations.push("preliminary_approval_customer_label_missing");
      if (!hasContinuationDecisionQuestion(reply)) policyViolations.push("preliminary_approval_continue_question_missing");
      const saysNotFinal = t.includes(normalizeArabic("ليست موافقة نهائية")) ||
        t.includes(normalizeArabic("ليست الموافقة النهائية")) ||
        t.includes(normalizeArabic("مش موافقة نهائية")) ||
        t.includes(normalizeArabic("الموافقة النهائية لم تصدر")) ||
        t.includes(normalizeArabic("الموافقة النهائية لسه"));
      if (!saysNotFinal) policyViolations.push("preliminary_approval_not_final_explanation_missing");
    }
  }

  for (const forbidden of input.truth.policy.forbiddenClaims) {
    if (normalizeArabic(forbidden) === normalizeArabic("بنك")) continue;
    if (t.includes(normalizeArabic(forbidden))) policyViolations.push(`forbidden_claim:${forbidden}`);
  }
  if (forbiddenBusinessIdentityClaim(reply)) policyViolations.push("forbidden_business_identity_claim");
  if (/\b3\s*(?:دنانير|دينار)\b/.test(reply) || /\b٣\s*(?:دنانير|دينار)\b/.test(reply)) policyViolations.push("forbidden_3_jod");
  if (reply.length > 3900) repetitionFlags.push(`reply_too_long_for_whatsapp:${reply.length}`);

  if (claimExecuted(reply,["تم التحويل","حولتك","تم تصعيد","تم التصعيد"]) && !actionOk(input.actions,["switch_ai_role"])) actionClaimViolations.push("unverified_transfer_claim");
  if (claimExecuted(reply,["تم الغاء","تم إلغاء","الغينا الطلب"]) && !actionOk(input.actions,["cancel_application"])) actionClaimViolations.push("unverified_cancel_claim");
  if (claimExecuted(reply,["تم الاسترداد","تم الاسترجاع","رجعنا المبلغ"]) && !actionOk(input.actions,["request_refund"])) actionClaimViolations.push("unverified_refund_claim");
  if (claimExecuted(reply,["تم اعاده تفعيل","تم إعادة تفعيل","تم فتح الطلب","وقفنا الاسترداد"]) && !actionOk(input.actions,["reopen_application","stop_refund","continue_application"])) actionClaimViolations.push("unverified_reopen_claim");
  if (claimExecuted(reply,["تم تغيير الجهاز","غيرت الجهاز","تم تعديل الجهاز"]) && !actionOk(input.actions,["change_device"])) actionClaimViolations.push("unverified_device_change_claim");
  if (claimExecuted(reply,["تم تعديل البيانات","عدلت البيانات"]) && !actionOk(input.actions,["change_application_data"])) actionClaimViolations.push("unverified_application_change_claim");
  if (claimExecuted(reply,["تم تحديد موعد","حجزتلك","حجزنا موعد"])) actionClaimViolations.push("unverified_appointment_claim");
  if (claimExecuted(reply,["رح نتصل","سنتصل","موظف رح يتواصل","سيتواصل معك موظف"])) actionClaimViolations.push("future_human_contact_claim");

  // EXECUTION RECEIPT GATE: when this exact customer turn requested a real
  // mutation, broad completion wording is forbidden unless the ActionResult
  // proves an executed/already_done receipt. Reading an already-existing DB
  // state on a normal status turn is not affected by this gate.
  const plannedActions = new Set(input.plan.actions.map((x) => x.action));
  if (plannedActions.has("cancel_application") && !actionOk(input.actions,["cancel_application"]) && /(?:تم.{0,20}(?:الغاء|إلغاء)|(?:الغينا|ألغينا).{0,20}الطلب|(?:طلبك|الطلب).{0,12}(?:صار\s+)?(?:ملغي|ملغى))/i.test(reply)) actionClaimViolations.push("execution_receipt_missing:cancel_application");
  if (plannedActions.has("request_refund") && !actionOk(input.actions,["request_refund"]) && /(?:تم.{0,20}(?:الاسترداد|الاسترجاع)|(?:رجعنا|حولنا).{0,20}(?:المبلغ|المصاري)|الاسترداد.{0,12}(?:تم|اكتمل))/i.test(reply)) actionClaimViolations.push("execution_receipt_missing:request_refund");
  if (plannedActions.has("change_device") && !actionOk(input.actions,["change_device"]) && /(?:تم.{0,24}(?:التعديل|تغيير).{0,24}(?:الجهاز|الطلب)|(?:طلبك|الجهاز).{0,16}(?:صار\s+)?معدل)/i.test(reply)) actionClaimViolations.push("execution_receipt_missing:change_device");
  if (plannedActions.has("change_application_data") && !actionOk(input.actions,["change_application_data"]) && /(?:تم.{0,24}(?:تعديل|تحديث).{0,24}(?:البيانات|الطلب)|(?:بياناتك|البيانات).{0,16}(?:صارت|تمت).{0,10}(?:معدله|معدلة|محدثه|محدثة))/i.test(reply)) actionClaimViolations.push("execution_receipt_missing:change_application_data");
  if ((plannedActions.has("reopen_application") || plannedActions.has("stop_refund")) && !actionOk(input.actions,["reopen_application","stop_refund"]) && /(?:تم.{0,24}(?:اعاده|إعادة).{0,20}(?:فتح|تفعيل)|وقفنا.{0,12}الاسترداد|الطلب.{0,12}(?:رجع|عاد).{0,10}(?:فعال|مفتوح))/i.test(reply)) actionClaimViolations.push("execution_receipt_missing:reopen_or_stop_refund");

  const waitingConfirmation = input.actions.find(a => a.outcome === "needs_confirmation");
  if (waitingConfirmation) {
    const asksConfirmation = /(?:اكد|أكد|تأكيد|تاكيد|متأكد|متاكد|بدك\s+(?:انفذ|أنفذ)|موافق\s+انفذ|موافق\s+أنفذ)/.test(t);
    if (!asksConfirmation) policyViolations.push(`pending_action_confirmation_not_requested:${waitingConfirmation.action}`);
  }

  const docs = input.truth.application?.documents;
  const asksIdentityAgain = /(?:ارفع|رفع|ابعث|ارسل|أرسل)[^\n]{0,50}(?:الهويه|الهوية|صوره الهويه|صورة الهوية)/.test(t);
  const asksSalaryAgain = /(?:ارفع|رفع|ابعث|ارسل|أرسل)[^\n]{0,60}(?:كشف راتب|شهاده راتب|شهادة راتب)/.test(t);
  const asksGuarantorAgain = /(?:عب[يئ]|ارفع|رفع|ابعث|ارسل|أرسل)[^\n]{0,60}(?:بيانات الكفيل|هويه الكفيل|هوية الكفيل)/.test(t);
  if (docs?.loaded && docs.identityComplete === true && asksIdentityAgain) truthContradictions.push("identity_already_uploaded_re_requested");
  if (docs?.loaded && docs.salarySlipUploaded === true && asksSalaryAgain) truthContradictions.push("salary_document_already_uploaded_re_requested");
  if (docs?.loaded && (docs.guarantorDataComplete === true || docs.guarantorIdentityComplete === true) && asksGuarantorAgain) truthContradictions.push("guarantor_data_already_present_re_requested");

  const paymentConfirmed = hasAuthoritativePaymentConfirmation(input.truth.application);
  if (!paymentConfirmed && /(?:تم|صار|ظاهر|عندي).*?(?:تاكيد|تأكيد|مؤكد).*?الدفع|الدفع.*?(?:مؤكد|متاكد|متأكد)/.test(t)) truthContradictions.push("chat_cannot_confirm_payment");
  if (paymentConfirmed && /(?:ارفع|رفع|ابعث|ارسل|أرسل)[^\n]{0,60}(?:وصل الدفع|اثبات الدفع|إثبات الدفع)/.test(t)) truthContradictions.push("payment_already_confirmed_receipt_re_requested");
  if (paymentConfirmed && /(?:بانتظار الدفع|لازم تدفع|ادفع الرسوم|ادفع 5|ادفع ٥)/.test(t)) truthContradictions.push("payment_already_confirmed_but_reply_requests_payment");

  if (input.turn.topics.includes("continuation")) {
    const commercial = continuationCommercialState(input.truth.application);
    if (commercial === "payment_ready") {
      const feeMentioned = /(?:5|٥)\s*(?:دنانير|دينار)/.test(reply) && /رسوم\s*فتح\s*الملف/.test(t);
      if (!feeMentioned) policyViolations.push("continuation_payment_ready_missing_5_jod_fee");
      if (/لا\s*يوجد\s*اي\s*دفع\s*مطلوب|ما\s*في\s*دفع\s*مطلوب|لا\s*دفع\s*مطلوب/.test(t)) truthContradictions.push("continuation_payment_ready_wrong_no_payment_claim");
      const aliases = input.truth.policy.paymentAliases || [];
      if (aliases.length && !aliases.some((alias) => reply.includes(alias))) policyViolations.push("continuation_payment_ready_missing_payment_destination");
      if (!/القسط\s*الاول|القسط\s*الأول/.test(t)) policyViolations.push("continuation_payment_ready_first_installment_distinction_missing");
      if (!/(?:مسترده|مستردة)\s*(?:بالكامل|كامل)/.test(t)) policyViolations.push("continuation_payment_ready_refundability_missing");
      if (!/(?:فتح\s*الملف|استكمال\s*(?:اجراءات|إجراءات)\s*الطلب)/.test(t)) policyViolations.push("continuation_payment_ready_fee_purpose_missing");
      if (!/(?:القرار\s*(?:الك|إلك|لك)|براحتك|بدون\s*ضغط|ما\s*في\s*ضغط|حقك\s*محفوظ|اذا\s*غيرت\s*رايك|إذا\s*غيرت\s*رأيك)/.test(t)) policyViolations.push("continuation_payment_ready_human_reassurance_missing");
    }
    if (["already_paid","payment_pending_admin"].includes(commercial) && /(?:ادفع|حول|حوّل)[^\n]{0,40}(?:5|٥|رسوم)/.test(t)) truthContradictions.push("continuation_payment_already_handled_but_fee_requested_again");
  }
  if (/\/track(?:\?|\b)/i.test(reply) && /(?:ارفع|رفع)[^\n]{0,80}(?:مستند|الهويه|الهوية|وصل|راتب|كفيل)/.test(t)) policyViolations.push("tracking_link_misrepresented_as_upload_link");
  if (/ابعث(?:لي)?[^\n]{0,50}(?:وصل|اثبات|إثبات|صوره|صورة)[^\n]{0,50}(?:واتساب|هون|هنا)|ارسل(?:لي)?[^\n]{0,50}(?:وصل|اثبات|إثبات)[^\n]{0,50}(?:واتساب|هون|هنا)/.test(t)) policyViolations.push("sensitive_payment_proof_requested_on_whatsapp");

  if (reviewWindowViolation(reply,input.turn)) policyViolations.push("review_window_or_pressure_missing");
  if (customerRejectedAutoUpdatePhrase(input.recentTurns) && /اول\s*ما|أول\s*ما|لما\s*(?:تخلص|يطلع|يظهر)/.test(t)) repetitionFlags.push("ignored_customer_wording_constraint_auto_update_phrase");
  if (input.turn.topics.includes("review_timing") && /24\s*ساع|48\s*ساع|خلال\s*يوم\s*واحد|بكره|غدا|غدًا/.test(t)) unsupportedClaims.push("invented_review_eta");

  if (input.turn.explicitRoleRequest === "staff" && /انتظر|تحويل.*موظف|موظف.*سيتواصل/.test(t)) hierarchyViolations.push("human_dependency_reintroduced");
  if (input.turn.explicitRoleRequest === "manager" && input.plan.role !== "omran") hierarchyViolations.push("manager_not_routed_to_omran");
  for (const action of input.plan.actions) {
    if (actionRequiresOmran(action.action) && (input.plan.role !== "omran" || action.requiredRole !== "omran")) hierarchyViolations.push(`mutation_not_owned_by_omran:${action.action}`);
  }

  if (exposesInternalArchitecture(reply)) hierarchyViolations.push("internal_architecture_exposed_to_customer");

  const roleName = roleDisplayName(input.plan.role);
  if (input.state.role.introduced && roleIntroduction(reply, roleName)) repetitionFlags.push(`repeated_role_self_introduction:${roleName}`);

  if (input.plan.tone === "firm") {
    const words = replyWordCount(reply);
    const maxWords = riskReplyWordLimit(input.plan);
    if (words > maxWords) repetitionFlags.push(`risk_reply_too_long:${words}>${maxWords}`);
    const questions = (reply.match(/[؟?]/g) || []).length;
    if (questions > 1) repetitionFlags.push(`risk_reply_too_many_questions:${questions}`);
    const paragraphs = reply.split(/\n\s*\n/).filter(x => x.trim()).length;
    if (paragraphs > 3) repetitionFlags.push(`risk_reply_too_many_paragraphs:${paragraphs}`);
  }

  if ((input.turn.topics.includes("application_status") || input.turn.topics.includes("refund")) && input.truth.confidence === "none" && input.truth.ambiguousApplications.length && /طلبك (?:حاليا|حاليًا)|حالته|تمت الموافقه|مؤهل/.test(t)) truthContradictions.push("personal_truth_with_ambiguous_application");
  if (input.state.lastAssistantText && normalizeArabic(input.state.lastAssistantText) === t && t.length > 15) repetitionFlags.push("exact_previous_reply_repeat");
  if (reply.length === 0 && input.plan.shouldRespond) unsupportedClaims.push("missing_reply");

  return {
    pass: !(missingTopics.length || unsupportedClaims.length || truthContradictions.length || actionClaimViolations.length || policyViolations.length || hierarchyViolations.length || repetitionFlags.length),
    missingTopics,
    unsupportedClaims,
    truthContradictions,
    actionClaimViolations,
    policyViolations,
    hierarchyViolations,
    repetitionFlags: Array.from(new Set(repetitionFlags)),
  };
}
