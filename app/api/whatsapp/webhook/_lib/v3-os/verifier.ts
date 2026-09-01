import { detectHumanityViolations } from "./humanVoice";
import { actionRequiresOmran } from "./hierarchy";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import type { ActionResult, ConversationState, InterpretedTurn, ReplyPlan, TopicKey, TruthBundle, VerificationReport } from "./types";
import { normalizeArabic } from "./text";

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
    human_request: ["معك","فريق الامين"],
    manager_request: ["عمران","متابعه","إشراف"],
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
    complaint: ["حق","طلب","حل","الغاء","إلغاء","استرداد"],
    legal: ["طلب","حق","استرداد","الغاء","إلغاء","شكوى"],
    social_threat: ["حق","استرداد","الغاء","إلغاء","تشهير","نشر"],
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

  const paymentConfirmed = hasAuthoritativePaymentConfirmation(input.truth.application);
  if (!paymentConfirmed && /(?:تم|صار|ظاهر|عندي).*?(?:تاكيد|تأكيد|مؤكد).*?الدفع|الدفع.*?(?:مؤكد|متاكد|متأكد)/.test(t)) truthContradictions.push("chat_cannot_confirm_payment");
  if (/ابعث(?:لي)?[^\n]{0,50}(?:وصل|اثبات|إثبات|صوره|صورة)[^\n]{0,50}(?:واتساب|هون|هنا)|ارسل(?:لي)?[^\n]{0,50}(?:وصل|اثبات|إثبات)[^\n]{0,50}(?:واتساب|هون|هنا)/.test(t)) policyViolations.push("sensitive_payment_proof_requested_on_whatsapp");

  if (reviewWindowViolation(reply,input.turn)) policyViolations.push("review_window_or_pressure_missing");
  if (input.turn.topics.includes("review_timing") && /24\s*ساع|48\s*ساع|خلال\s*يوم\s*واحد|بكره|غدا|غدًا/.test(t)) unsupportedClaims.push("invented_review_eta");

  if (input.turn.explicitRoleRequest === "staff" && /انتظر|تحويل.*موظف|موظف.*سيتواصل/.test(t)) hierarchyViolations.push("human_dependency_reintroduced");
  if (input.turn.explicitRoleRequest === "manager" && input.plan.role !== "omran") hierarchyViolations.push("manager_not_routed_to_omran");
  for (const action of input.plan.actions) {
    if (actionRequiresOmran(action.action) && (input.plan.role !== "omran" || action.requiredRole !== "omran")) hierarchyViolations.push(`mutation_not_owned_by_omran:${action.action}`);
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
