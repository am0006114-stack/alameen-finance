import { detectHumanityViolations } from "./humanVoice";
import { actionRequiresOmran, roleDisplayName } from "./hierarchy";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { continuationCommercialState } from "./commercialProgression";
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
  const hasNormalWindow = /(?:2|يومين|يومان)\s*(?:الى|ل|ـ)?\s*(?:3|ثلاث)/.test(n) || (n.includes("يومين") && (n.includes("ثلاث") || n.includes("3")));
  const hasPressure = n.includes("ضغط") || n.includes("المراجعات") || n.includes("الظروف التشغيليه");
  return !(hasNormalWindow && hasPressure);
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

export function verifyReply(input: { reply: string; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle; plan: ReplyPlan; actions: ActionResult[]; recentTurns?: string[] }): VerificationReport {
  const reply = String(input.reply || "").trim();
  const t = normalizeArabic(reply);
  const missingTopics = input.plan.answerItems
    .filter((x) => !["greeting","thanks","acknowledgement","unknown"].includes(x.topic) && !topicCovered(x.topic,reply))
    .map((x) => x.topic);
  const unsupportedClaims: string[] = [];
  const truthContradictions: string[] = [];
  const actionClaimViolations: string[] = [];
  const policyViolations: string[] = [];
  const hierarchyViolations: string[] = [];
  const repetitionFlags: string[] = detectHumanityViolations(reply,input.recentTurns);
  policyViolations.push(...detectReplyLinkViolations({ reply, turn: input.turn, truth: input.truth }).map((x) => `link_integrity:${x}`));

  for (const forbidden of input.truth.policy.forbiddenClaims) if (t.includes(normalizeArabic(forbidden))) policyViolations.push(`forbidden_claim:${forbidden}`);
  if (/\b3\s*(?:دنانير|دينار)\b/.test(reply) || /\b٣\s*(?:دنانير|دينار)\b/.test(reply)) policyViolations.push("forbidden_3_jod");

  if (claimExecuted(reply,["تم التحويل","حولتك","تم تصعيد","تم التصعيد"]) && !actionOk(input.actions,["switch_ai_role"])) actionClaimViolations.push("unverified_transfer_claim");
  if (claimExecuted(reply,["تم الغاء","تم إلغاء","الغينا الطلب"]) && !actionOk(input.actions,["cancel_application"])) actionClaimViolations.push("unverified_cancel_claim");
  if (claimExecuted(reply,["تم الاسترداد","تم الاسترجاع","رجعنا المبلغ"]) && !actionOk(input.actions,["request_refund"])) actionClaimViolations.push("unverified_refund_claim");
  if (claimExecuted(reply,["تم اعاده تفعيل","تم إعادة تفعيل","تم فتح الطلب","وقفنا الاسترداد"]) && !actionOk(input.actions,["reopen_application","stop_refund","continue_application"])) actionClaimViolations.push("unverified_reopen_claim");
  if (claimExecuted(reply,["تم تغيير الجهاز","غيرت الجهاز","تم تعديل الجهاز"]) && !actionOk(input.actions,["change_device"])) actionClaimViolations.push("unverified_device_change_claim");
  if (claimExecuted(reply,["تم تعديل البيانات","عدلت البيانات"]) && !actionOk(input.actions,["change_application_data"])) actionClaimViolations.push("unverified_application_change_claim");
  if (claimExecuted(reply,["تم تحديد موعد","حجزتلك","حجزنا موعد"])) actionClaimViolations.push("unverified_appointment_claim");
  if (claimExecuted(reply,["رح نتصل","سنتصل","موظف رح يتواصل","سيتواصل معك موظف"])) actionClaimViolations.push("future_human_contact_claim");

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
