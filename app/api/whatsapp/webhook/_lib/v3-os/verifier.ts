import { detectHumanityViolations } from "./humanVoice";
import { actionRequiresOmran, roleDisplayName } from "./hierarchy";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { continuationCommercialState } from "./commercialProgression";
import { applicationJourneyStage, explicitContinuation, firstCustomerName } from "./applicationJourney";
import type { ActionResult, ConversationState, InterpretedTurn, ReplyPlan, TopicKey, TruthBundle, VerificationReport } from "./types";
import { normalizeArabic } from "./text";
import { buildOfficialLinkContext, detectReplyLinkViolations } from "./linkIntegrity";
import { appointmentCoordinationOverclaim, asksOfficeSchedule, bankStatementDurationQuestion, productAvailabilityOverclaim, safeCustomerFirstName, resolveOfficeScheduleTarget } from "./operationalPrecision";
import { explicitNewApplicationText, foreignApplicantFormBlocker, showroomBrowsingRequest } from "./conversationRecovery";
import { containsRestrictedPaymentExecutionDetail, paymentDisclosureDecision } from "./paymentEligibilityFirewall";

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
  return /هل\s*(?:تود|ترغب)[^؟?]{0,70}(?:الاستمرار|تكمل)|(?:بدك|حاب|حابب)[^؟?]{0,40}(?:تكمل|تستمر)|(?:اكتب|احكي|قلي)[^\n]{0,30}(?:اود|أود|ارغب|أرغب)\s+(?:ب)?الاستمرار/.test(n);
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

function hasFiveJodJourneyExplanation(reply: string) {
  const n = normalizeArabic(reply);
  const fee = /(?:5|٥)\s*(?:دنانير|دينار)/.test(reply) && n.includes(normalizeArabic("فتح الملف"));
  const separated = n.includes(normalizeArabic("ثمن الجهاز")) || n.includes(normalizeArabic("القسط الأول"));
  return fee && separated;
}

function hasReviewWindowAndPressure(reply: string) {
  const n = normalizeArabic(reply);
  const duration = /(?:2|٢|يومين).{0,18}(?:3|٣|ثلاث)/.test(n) || (n.includes("يومين") && n.includes("ثلاث"));
  const pressure = n.includes(normalizeArabic("ضغط المراجعات")) || n.includes(normalizeArabic("ضغط مراجعات"));
  return duration && pressure;
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

function broadCompletionClaim(reply: string, action: string) {
  const patterns: Record<string, RegExp[]> = {
    change_device: [
      /(?:خلصت|أنهيت|انهيت).{0,24}(?:تحديث|تعديل|تغيير).{0,30}(?:الطلب|الجهاز)/i,
      /(?:طلبك|الطلب).{0,18}(?:صار\s+)?(?:محدث|محدّث|معدل|معدّل).{0,30}(?:الجهاز|سامسونج|ايفون|آيفون|iphone|samsung)?/i,
      /(?:الجهاز|الموديل).{0,18}(?:صار|أصبح|اصبح).{0,35}(?:بدل|الى|إلى)/i,
      /(?:غيرت|غيّرت|غيرنا|غيّرنا|حدثت|حدّثت|عدلنا|عدّلنا).{0,25}(?:الجهاز|الموديل|الطلب)/i,
      /(?:ثبتنا|اعتمدنا).{0,20}(?:الجهاز|الموديل)/i,
    ],
    cancel_application: [/(?:خلصت|نفذت|نفّذت|تم).{0,20}(?:الغاء|إلغاء).{0,20}(?:الطلب)?/i,/(?:طلبك|الطلب).{0,12}(?:صار\s+)?(?:ملغي|ملغى)/i],
    request_refund: [
      /(?:خلص|تم|اكتمل).{0,20}(?:الاسترداد|الاسترجاع)/i,
      /(?:رجعنا|حولنا|حوّلنا).{0,20}(?:المبلغ|المصاري)/i,
      /(?:تم\s+تسجيل|سجلنا).{0,55}(?:بيانات|رقم|محفظ|حساب|على\s+ملف)/i,
      /(?:الاسترداد|الاسترجاع).{0,20}(?:قيد\s+المعالجه|قيد\s+المعالجة)/i,
    ],
    reopen_application: [/(?:تم|خلصت).{0,24}(?:اعاده|إعادة).{0,18}(?:فتح|تفعيل)/i],
    stop_refund: [/(?:وقفنا|أوقفنا|تم.{0,12}إيقاف).{0,18}(?:الاسترداد|الاسترجاع)/i],
    change_application_data: [/(?:خلصت|تم|حدثت|حدّثت|عدلت|عدّلت).{0,25}(?:البيانات|بياناتك|الطلب)/i,/(?:البيانات|بياناتك).{0,15}(?:صارت|أصبحت|اصبحت).{0,12}(?:محدثه|محدثة|معدله|معدلة)/i],
  };
  return (patterns[action] || []).some((pattern) => pattern.test(reply));
}


function digitsOnly(value: string | null | undefined) {
  return String(value || "").replace(/\D+/g, "");
}

function phoneVariants(value: string | null | undefined) {
  const d = digitsOnly(value);
  const out = new Set<string>();
  if (!d) return out;
  out.add(d);
  if (d.startsWith("962") && d.length >= 11) out.add(`0${d.slice(3)}`);
  if (d.startsWith("0") && d.length >= 9) out.add(`962${d.slice(1)}`);
  return out;
}

function customerPhoneMisusedAsBusinessContact(reply: string, state: ConversationState, truth: TruthBundle) {
  const context = normalizeArabic(reply);
  const contactLanguage = /(?:رقم\s*(?:التواصل|الاتصال|الواتساب)|تواصل\s*(?:صوتي|هاتفي)|اتصل|اتصلي|مكالمة|مكالمه|الرقم\s+اللي\s+بتراسلنا|الرقم\s+الذي\s+تراسلنا)/i.test(context);
  if (!contactLanguage) return false;
  const candidates = new Set<string>();
  for (const v of phoneVariants(truth.application?.phone)) candidates.add(v);
  for (const v of phoneVariants(state.waId)) candidates.add(v);
  const replyDigits = digitsOnly(reply);
  for (const v of candidates) {
    if (v.length >= 9 && replyDigits.includes(v)) return true;
  }
  return false;
}

function explicitFeeQuestion(turn: InterpretedTurn) {
  const q = normalizeArabic(turn.rawText);
  return turn.topics.includes("payment_fee") || /(?:خمس|5|٥)\s*(?:دنانير|دينار)|رسوم\s*فتح\s*الملف|بدون\s*(?:خمس|5|٥)|لازم[^\n]{0,25}(?:خمس|5|٥)|ضروري[^\n]{0,25}(?:خمس|5|٥)|ما\s*بتفتحو[^\n]{0,25}(?:خمس|5|٥)/.test(q);
}

function restrictedPaymentDestinationDetail(reply: string) {
  return /AMEEENPAY|AMENPAY|ABDUL\s+RAHMAN|\/receipt(?:\?|\b)|اسم\s*المستفيد|(?:حول|حوّل|تحويل)[^\n]{0,45}(?:كليك|cliq|محفظه|محفظة)|(?:رقم|معرف)[^\n]{0,25}(?:الدفع|المحفظه|المحفظة)/i.test(reply);
}

function excessiveLaughter(reply: string) {
  const compact = String(reply || "").replace(/\s+/g, "");
  return /(?:ه){12,}/.test(compact) || /(?:ح){12,}/.test(compact) || /(.)\1{18,}/u.test(compact);
}

function asksInstallmentPaymentChannel(turn: InterpretedTurn) {
  const q = normalizeArabic(turn.rawText);
  return /(?:وين|كيف|لمن|لمين|على\s+وين|طريقه|طريقة)[^\n]{0,35}(?:القسط|الاقساط)|(?:القسط|الاقساط)[^\n]{0,35}(?:وين|كيف|لمن|لمين|دفع|تحويل|محفظه|محفظة)/.test(q);
}

function reusesFileOpeningPaymentForInstallments(reply: string) {
  const n = normalizeArabic(reply);
  return restrictedPaymentDestinationDetail(reply) ||
    /(?:نفس|ذات)[^\n]{0,25}(?:المحفظه|المحفظة|المستفيد|بيانات\s*الدفع)/.test(n) ||
    /(?:القسط|الاقساط)[^\n]{0,55}(?:orange\s*money|محفظه|محفظة|amee+npay|amenpay|abdul\s+rahman)/i.test(reply);
}

function guarantorRequirementOverclaim(reply: string) {
  const n = normalizeArabic(reply);
  if (!/(?:بيانات|هويه|هوية)[^\n]{0,12}الكفيل|الكفيل[^\n]{0,12}(?:بيانات|هويه|هوية)/.test(n)) return false;
  const conditional = /(?:قد|ممكن|حسب\s*(?:حاله|الحاله|حالة|الحالة)|اذا\s*(?:طلبت|احتاجت|تطلبت)|إذا\s*(?:طلبت|احتاجت|تطلبت))[^\n]{0,55}(?:الكفيل|بيانات)/.test(n) ||
    /(?:الكفيل|بيانات\s*الكفيل)[^\n]{0,45}(?:حسب\s*(?:الحاله|الحالة)|اذا\s*(?:طلب|احتاج)|إذا\s*(?:طلب|احتاج))/.test(n);
  if (conditional) return false;
  return /(?:باقي|ضل|ناقص|لازم|مطلوب|بنحتاج|نحتاج|الاوراق\s*الاساسيه|الأوراق\s*الأساسية)[^\n]{0,100}(?:الكفيل|بيانات\s*الكفيل)/.test(n);
}

function normalizedTokens(value: string) {
  return normalizeArabic(value).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

function nearDuplicate(a: string | null | undefined, b: string) {
  if (!a) return false;
  const aa = normalizedTokens(a);
  const bb = normalizedTokens(b);
  if (aa.length < 7 || bb.length < 7) return false;
  const sa = new Set(aa), sb = new Set(bb);
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  const union = new Set([...sa, ...sb]).size || 1;
  const jaccard = intersection / union;
  const lengthRatio = Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length);
  return jaccard >= 0.78 && lengthRatio >= 0.68;
}

function asksBoxNewCondition(turn: InterpretedTurn) {
  const q = normalizeArabic(turn.rawText);
  return /(?:الجهاز|التلفون|الموبايل).{0,24}(?:جديد|بالكرتونه|بالكرتونة|مختوم)|(?:جديد|بالكرتونه|بالكرتونة|مختوم).{0,24}(?:الجهاز|التلفون|الموبايل)/.test(q);
}
function asksKnownTrackingAgain(reply: string) {
  const n = normalizeArabic(reply);
  return /(?:ابعث|ابعت|ارسل|أرسل|هات|اعطيني|أعطيني)[^\n]{0,45}(?:رقم\s*(?:التتبع|الطلب)|التتبع)/.test(n);
}

export function verifyReply(input: { reply: string; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle; plan: ReplyPlan; actions: ActionResult[]; recentTurns?: string[]; profileName?: string | null }): VerificationReport {
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
  if (appointmentCoordinationOverclaim(reply)) actionClaimViolations.push("appointment_coordination_not_supported");

  if (explicitNewApplicationText(input.turn.rawText)) {
    if (/(?:اعاده|إعادة)\s*(?:فتح|تفعيل)|رجع\s*(?:فتح|فعل)|reopen/i.test(reply)) {
      actionClaimViolations.push("new_application_must_not_be_reopen");
    }
    if (input.truth.application?.trackingId && reply.includes(input.truth.application.trackingId)) {
      truthContradictions.push("new_application_reused_old_tracking");
    }
  }

  if (showroomBrowsingRequest(input.turn.rawText)) {
    const invitesBrowseVisit = /(?:تقدر|بتقدر|ممكن|تعال|تعالي|اجي|أجي|تجي|تيجي)[^\n]{0,45}(?:المعرض|المكتب)[^\n]{0,35}(?:تشوف|تشوفي|مشاهده|مشاهدة|الاجهزه|الأجهزة)|(?:المعرض)[^\n]{0,45}(?:مفتوح|تزور|تجي|تيجي|تشوف)/.test(t);
    if (invitesBrowseVisit) policyViolations.push("office_not_open_showroom_for_browsing");
  }

  if (foreignApplicantFormBlocker(input.turn.rawText)) {
    const suggestsSubstitution = /(?:حط|اكتب|استخدم|استعمل)[^\n]{0,40}(?:رقم\s*(?:الجواز|الاقامه|الإقامة|القومي)|جواز\s*السفر|رقم\s*مصري)[^\n]{0,35}(?:مكان|بدل|بخانه|بخانة)\s*(?:الرقم\s+الوطني)?/.test(t) ||
      /(?:قص|اختصر|احذف)[^\n]{0,30}(?:الرقم|ارقام|أرقام)/.test(t);
    if (suggestsSubstitution) unsupportedClaims.push("foreign_applicant_invented_national_id_workaround");
    const admitsNoApprovedPath = /(?:ما\s+عندي|ما\s+في|غير\s+متاح)[^\n]{0,55}(?:مسار|بديل|حل)[^\n]{0,35}(?:موثق|معتمد)|(?:ما\s+بدي|لن)[^\n]{0,35}(?:حل|طريقه|طريقة)[^\n]{0,25}(?:غير\s+معتمد|غير\s+موثق)/.test(t);
    if (!admitsNoApprovedPath) policyViolations.push("foreign_applicant_form_blocker_not_answered_directly");
  }

  if (/(?:القسط|دينار)[^\n]{0,45}\d+[.,]\d{3,}|\d+[.,]\d{3,}[^\n]{0,35}(?:دينار|القسط)/.test(reply)) {
    policyViolations.push("money_display_more_than_two_decimals");
  }

  if (asksOfficeSchedule(input.turn.rawText)) {
    const ops = resolveOfficeScheduleTarget(input.turn.rawText);
    const targetDay = normalizeArabic(ops.arabic);
    const mentionsTarget = t.includes(targetDay) || (ops.reference === "today" && /(?:اليوم|هسا)/.test(t)) || (ops.reference === "tomorrow" && /(?:بكره|بكرة|غدا)/.test(t));
    const targetOpenClaim = new RegExp(`${targetDay}[^\n]{0,28}(?:دوام\s+عادي|فاتح|مفتوح|فاتحين)|(?:دوام\s+عادي|فاتح|مفتوح|فاتحين)[^\n]{0,28}${targetDay}`).test(t);
    const targetHolidayClaim = new RegExp(`${targetDay}[^\n]{0,28}(?:عطله|عطلة|مغلق|مسكر)|(?:عطله|عطلة|مغلق|مسكر)[^\n]{0,28}${targetDay}`).test(t);
    if (ops.officeWeeklyHoliday) {
      if (!mentionsTarget || !/(?:عطله|عطلة)/.test(t) || !/(?:طلبات|التقديم|المتابعه|المتابعة)/.test(t) || !/(?:واتساب|الموقع)/.test(t)) {
        policyViolations.push("weekly_holiday_office_answer_incomplete");
      }
      if (targetOpenClaim) truthContradictions.push("weekly_holiday_claimed_open");
    } else if (targetHolidayClaim) {
      truthContradictions.push("weekly_workday_claimed_holiday");
    }
  }

  if (bankStatementDurationQuestion(input.turn.rawText)) {
    const honestUnknown = /(?:ما\s+عندي|ما\s+في)[^\n]{0,35}(?:حد\s+ادنى|حد\s+أدنى|مده\s+ثابته|مدة\s+ثابتة)|(?:بتتحدد|تتحدد)[^\n]{0,35}(?:دراسه|دراسة)\s*الملف/.test(t);
    if (!honestUnknown) policyViolations.push("bank_statement_duration_not_answered_usefully");
    if (/(?:الحد\s*(?:الادنى|الأدنى)|اقل\s+مده|أقل\s+مدة|مطلوب)[^\n]{0,30}(?:\d+|شهرين|ثلاث|3)\s*(?:شهر|اشهر|أشهر)/.test(t)) {
      unsupportedClaims.push("invented_bank_statement_minimum_duration");
    }
  }

  if (productAvailabilityOverclaim(reply) && !(input.truth.application as any)?.availability) {
    unsupportedClaims.push("product_availability_not_authoritative");
  }

  const truthAppForPricing = input.truth.application;
  if (/(?:السعر|سعره|سعرها)[^\n]{0,30}\d+(?:[.,]\d+)?\s*(?:دينار)?/.test(t)) {
    if (truthAppForPricing?.devicePrice == null) unsupportedClaims.push("device_price_not_authoritative");
    else if (!numericValueMentioned(reply, truthAppForPricing.devicePrice)) truthContradictions.push("device_price_mismatch_truth");
  }
  if (/(?:القسط|قسطه|قسطها)[^\n]{0,35}\d+(?:[.,]\d+)?\s*(?:دينار)?/.test(t)) {
    if (truthAppForPricing?.monthlyPayment == null) unsupportedClaims.push("monthly_payment_not_authoritative");
    else if (!numericValueMentioned(reply, truthAppForPricing.monthlyPayment)) truthContradictions.push("monthly_payment_mismatch_truth");
  }

  if (input.profileName && input.truth.application?.fullName && !safeCustomerFirstName(input.truth.application.fullName, input.profileName)) {
    const appFirst = String(input.truth.application.fullName || "").trim().split(/\s+/)[0] || "";
    const opening = String(reply || "").trim().split(/\s+/).slice(0, 8).join(" ");
    if (appFirst && normalizeArabic(opening).includes(normalizeArabic(appFirst))) {
      policyViolations.push("customer_name_confidence_low");
    }
  }

  const journeyStage = applicationJourneyStage(input.truth.application);
  const customerStatusText = normalizeArabic(reply);
  const claimsCancelledOrClosed = /(?:الطلب|الملف)[^\n]{0,30}(?:ملغي|ملغى|انلغى|مقفول|متوقف)|(?:تم|صار)[^\n]{0,20}(?:الغاء|إلغاء)[^\n]{0,20}(?:الطلب|الملف)/.test(customerStatusText);
  if (claimsCancelledOrClosed && !["cancelled","refund_requested","refund_completed"].includes(journeyStage)) {
    truthContradictions.push("global_cancelled_or_closed_claim_mismatch_truth");
  }
  if (customerStatusText.includes(normalizeArabic("موافقة مبدئية")) && journeyStage !== "preliminary_approved_waiting_decision") {
    truthContradictions.push("global_preliminary_approval_claim_mismatch_truth");
  }
  if (["cancelled","refund_requested","refund_completed"].includes(journeyStage) && /(?:قيد\s+الدراسه|قيد\s+الدراسة|قيد\s+المراجعه|قيد\s+المراجعة|موافقه\s+مبدئيه|موافقة\s+مبدئية)/.test(customerStatusText)) {
    truthContradictions.push("global_active_status_claim_on_terminal_application");
  }
  const continuationNow = explicitContinuation(input.turn);
  const paymentFirewall = paymentDisclosureDecision({
    application: input.truth.application,
    customerText: input.turn.rawText,
    explicitContinuationThisTurn: continuationNow || input.turn.requestedActions.includes("continue_application"),
  });
  const paymentTopics: TopicKey[] = ["payment_fee","payment_method","payment_timing","payment_recipient","payment_status","payment_confirmation","receipt_upload"];
  const preContinuationStage = !paymentFirewall.paymentExecutionDetailsAllowed && (journeyStage === "preliminary_review" || journeyStage === "preliminary_approved_waiting_decision");
  const feeQuestionNow = explicitFeeQuestion(input.turn);
  if (preContinuationStage) {
    // Before explicit continuation, transaction details remain hidden. A customer may still
    // ask a direct policy question about the existence/purpose/refundability of the 5 JOD fee;
    // answer that question without exposing recipient, alias, transfer instructions or receipt URL.
    missingTopics = missingTopics.filter((topic) => !paymentTopics.includes(topic) || (feeQuestionNow && topic === "payment_fee"));
  }

  if (rawStatusLeaked(reply)) policyViolations.push("raw_internal_application_status_exposed");
  if (!paymentFirewall.paymentExecutionDetailsAllowed && containsRestrictedPaymentExecutionDetail(reply, input.truth.policy)) {
    policyViolations.push(`payment_firewall_blocked_execution_details:${paymentFirewall.reason}`);
  }
  if (/(?:رقم\s+الطلب\s+المرتبط\s+بالمحادثه\s+عندي|رقم\s+الطلب\s+المرتبط\s+بالمحادثة\s+عندي|الطلب\s+AM-\d+\s+مربوط\s+بالمحادثه|الطلب\s+AM-\d+\s+مربوط\s+بالمحادثة|احكيلي\s+النقطه\s+اللي\s+بدك\s+تعرفها|احكيلي\s+النقطة\s+اللي\s+بدك\s+تعرفها|اذا\s+في\s+نقطه\s+محدده\s+بالطلب|إذا\s+في\s+نقطة\s+محددة\s+بالطلب|اكتب\s+سؤالك\s+مباشره|اكتب\s+سؤالك\s+مباشرة|اذا\s+عندك\s+نقطه\s+جديده|إذا\s+عندك\s+نقطة\s+جديدة|الحاله\s+الفعليه\s+المسجله|الحالة\s+الفعلية\s+المسجلة|بعتمد\s+هالحاله\s+نفسها|بعتمد\s+هالحالة\s+نفسها|ما\s+في\s+تحديث\s+جديد\s+عن\s+آخر\s+(?:رد|حاله|حالة)|على\s+الموجود\s+فعليا\s+بدون\s+ما\s+الفك\s+بنفس\s+الكلام)/.test(t)) {
    repetitionFlags.push("robotic_generic_fallback_language");
  }
  if (/^انا\s+معك(?:[،,. ]|$)|^أنا\s+معك(?:[،,. ]|$)/.test(reply.trim()) && reply.trim().split(/\s+/).length < 14) {
    repetitionFlags.push("empty_human_presence_without_answer");
  }
  if (/(?:هلق|هلّق|هلأ)/.test(reply)) repetitionFlags.push("non_jordanian_now_word");
  if (/(?:انا|أنا)\s+انسان|انسان\s+مثلك|إنسان\s+مثلك|موظف\s+حقيقي/i.test(reply)) policyViolations.push("literal_human_identity_claim");
  const knownTracking = input.truth.application?.trackingId || input.state.activeTrackingId;
  if (knownTracking && asksKnownTrackingAgain(reply)) truthContradictions.push("known_tracking_re_requested");
  if (customerPhoneMisusedAsBusinessContact(reply, input.state, input.truth)) truthContradictions.push("customer_phone_misused_as_business_contact");
  if (excessiveLaughter(reply)) repetitionFlags.push("excessive_laughter_or_repeated_characters");
  if (asksBoxNewCondition(input.turn)) {
    const answeredCondition = /(?:جديد|كرتون|كرتونه|كرتونة|مختوم|غير\s+موثق|معلومة\s+موثقة|ما\s+عندي[^\n]{0,35}(?:تأكيد|معلومة))/.test(t);
    if (!answeredCondition) missingTopics.push("products");
  }
  if (input.turn.topics.includes("products") && /(?:ابعث|ابعت|ارسل|أرسل|هات|اعطيني|أعطيني)[^\n]{0,45}(?:رقم\s*(?:التتبع|الطلب)|التتبع)/.test(t)) {
    policyViolations.push("product_question_wrong_tracking_fallback");
  }
  if ((input.turn.topics.includes("trust") || input.turn.topics.includes("complaint")) && /(?:جهة\s+معروفه|جهة\s+معروفة|مسجلين\s+قانونيا|مسجلين\s+قانونيًا|مرخصين|مرخصة)/.test(t)) {
    unsupportedClaims.push("unsupported_trust_or_registration_claim");
  }

  if (preContinuationStage) {
    // Transparency invariant: once preliminary approval exists, the customer may
    // be told that continuing opens the 5 JOD file-opening step, including purpose
    // and refundability. What stays protected until explicit continuation is the
    // transaction destination itself: recipient, aliases, transfer instructions
    // and receipt URL.
    const prelimApproved = journeyStage === "preliminary_approved_waiting_decision";
    if (feeQuestionNow || prelimApproved) {
      if (restrictedPaymentDestinationDetail(reply)) policyViolations.push("payment_destination_exposed_before_explicit_continuation");
    } else {
      if (hasPaymentDetail(reply)) policyViolations.push("payment_details_exposed_before_explicit_continuation");
      if (hasAnyPaymentLanguage(reply)) policyViolations.push("payment_language_exposed_before_explicit_continuation");
    }
  }

  if (input.turn.topics.includes("application_status") && input.truth.application) {
    const app = input.truth.application;
    const contextualStatusConfirmation = input.turn.acts.some((act) => act.topic === "application_status" && act.value === "confirm_current_application_status");
    const firstName = input.profileName ? safeCustomerFirstName(app.fullName, input.profileName) : firstCustomerName(app);
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
      if (!hasFiveJodJourneyExplanation(reply)) policyViolations.push("preliminary_approval_5_jod_next_step_missing");
      if (!hasReviewWindowAndPressure(reply)) policyViolations.push("preliminary_approval_review_window_missing");
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
  if (/(?:رح|راح|بنبعث|رح\s+نبعث|بنرسل|رح\s+نرسل).{0,45}(?:على|ع)\s*(?:هاض|هاد|هذا)\s+الرقم/i.test(reply) && !actionOk(input.actions,["change_application_data"])) actionClaimViolations.push("unverified_contact_number_change_claim");
  if (continuationNow && /(?:بمجرد|لما).{0,35}(?:تنفذ|تنفّذ|تعمل).{0,35}(?:الاداره|الإدارة).{0,35}(?:فتح\s+الملف|خطوه\s+فتح|خطوة\s+فتح)/i.test(reply)) policyViolations.push("invented_admin_gate_before_5_jod");

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

  const pendingManualAction = String(input.state.pendingActionPayload?._manualStatus || "") === "awaiting_admin" ? input.state.pendingAction : null;
  for (const action of ["cancel_application","request_refund","stop_refund","reopen_application","change_device","change_application_data"]) {
    const relevant = plannedActions.has(action as any) || pendingManualAction === action;
    if (relevant && !actionOk(input.actions,[action]) && broadCompletionClaim(reply,action)) {
      actionClaimViolations.push(`hard_execution_receipt_missing:${action}`);
    }
  }
  if (pendingManualAction && !actionOk(input.actions,[pendingManualAction]) && /(?:قيد\s+المعالجه|قيد\s+المعالجة|تم\s+تسجيلها\s+على\s+ملف|تم\s+تسجيل\s+بيانات)/i.test(reply)) {
    actionClaimViolations.push(`manual_action_falsely_in_processing:${pendingManualAction}`);
  }

  const waitingConfirmation = input.actions.find(a => a.outcome === "needs_confirmation");
  if (waitingConfirmation) {
    const asksConfirmation = /(?:اكد|أكد|تأكيد|تاكيد|متأكد|متاكد|بدك\s+(?:انفذ|أنفذ)|موافق\s+انفذ|موافق\s+أنفذ)/.test(t);
    if (!asksConfirmation) policyViolations.push(`pending_action_confirmation_not_requested:${waitingConfirmation.action}`);
  }

  if (input.turn.topics.some((topic) => topic === "requirements" || topic === "guarantor")) {
    if (/(?:اكيد|أكيد)\s+(?:بزبط|بتزبط|مقبول)|ما\s+رح\s+تحتاج[^\n]{0,35}(?:كشف|شهاده|شهادة)\s*راتب|وجود\s+(?:كفيل|كفلاء)\s+مطلوب/i.test(reply)) {
      unsupportedClaims.push("eligibility_or_document_requirement_overclaim");
    }
    if (guarantorRequirementOverclaim(reply)) unsupportedClaims.push("guarantor_requirement_presented_as_mandatory_without_truth");
    if (!input.truth.application?.documents?.loaded && /(?:باقي|ضل|ناقص)[^\n]{0,100}(?:الهويه|الهوية|كشف\s*راتب|شهاده\s*راتب|شهادة\s*راتب|بيانات\s*الكفيل)/.test(t)) {
      unsupportedClaims.push("specific_missing_documents_claim_without_document_truth");
    }
  }

  if (asksInstallmentPaymentChannel(input.turn) && reusesFileOpeningPaymentForInstallments(reply)) {
    unsupportedClaims.push("installment_payment_destination_not_authoritative");
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
      const receiptLink = buildOfficialLinkContext(input.turn, input.truth).relevant.receipt;
      if (receiptLink && !reply.includes(receiptLink)) policyViolations.push("continuation_payment_ready_missing_receipt_link");
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
  else if (nearDuplicate(input.state.lastAssistantText, reply)) repetitionFlags.push("near_previous_reply_repeat");
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
