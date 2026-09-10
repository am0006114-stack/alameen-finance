import { applicationJourneyStage } from "./applicationJourney";
import { continuationCommercialState } from "./commercialProgression";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { roleDisplayName } from "./hierarchy";
import { normalizeArabic } from "./text";
import type { ActionResult, ConversationState, InterpretedTurn, TruthBundle } from "./types";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cancellationStatusQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:هل|يعني|طيب|بس|بدي\s+اعرف|بدي\s+اتاكد|متاكد).{0,28}(?:لغيت|الغيت|انلغى|انلغي|تم\s+الغاء)|(?:لغيت|الغيت|انلغى|انلغي).{0,28}(?:صح|ولا|او\s+لا|كيف|متاكد)|(?:تم\s+الغاء\s+الطلب).{0,20}(?:صح|ولا|او\s+لا)|(?:اعطيني|بدي).{0,25}(?:دليل|اثبات).{0,25}(?:الغاء|لغيت)/.test(q);
}

export function currentFeePaymentQuestionText(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  return /^(?:(?:طيب|تمام|اه|أه)\s+)?(?:(?:هسا|هلأ|الان|الآن)\s+)?(?:ادفع|أدفع|احول|أحول|بدفع|بحول)(?:\s+(?:هسا|هلأ|الان|الآن|اليوم|المصاري|المبلغ|الخمس|الخمسه|5|٥|دنانير|دينار))*$/.test(q)
    || /(?:احول|أحول|ادفع|أدفع|بدفع|بحول).{0,28}(?:المصاري|الخمسه|الخمس|5|٥|رسوم\s+فتح\s+الملف).{0,25}(?:هسا|هلأ|الان|الآن|اليوم)?|(?:بدي|حاب|اريد|أريد).{0,20}(?:ادفع|أدفع|احول|أحول).{0,24}(?:الخمس|الخمسه|5|٥)|(?:الخمس|الخمسه|5|٥).{0,25}(?:هسا|هلأ|الان|الآن|ادفع|أدفع|احول|أحول)/.test(q);
}

export function feeDeferralOrNoMoneyText(value: string | null | undefined) {
  const q = n(value);
  return /(?:ما\s+معي|مش\s+معي|ما\s+عندي).{0,25}(?:مصاري|فلوس|5|٥|الخمس|الخمسه)|(?:بقدر|بصير|ممكن).{0,28}(?:اكمل|أكمل|نفتح|افتح|أفتح).{0,28}(?:بدون|من\s+غير).{0,18}(?:5|٥|الخمس|الخمسه)|(?:ادفع|أدفع).{0,28}(?:5|٥|الخمس|الخمسه|رسوم).{0,35}(?:مع\s+القسط|بعد\s+شهر|وقت\s+القسط|مع\s+الدفعه|مع\s+الدفعة)/.test(q);
}

export function feeVsFirstInstallmentConfusionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:قلت|حكيت|انت\s+قلت).{0,30}(?:مافي|ما\s+في|بدون).{0,20}دفعه\s+اولي|(?:5|٥|الخمس|الخمسه).{0,30}(?:قسط|دفعه\s+اولي)|دفعه\s+اولي.{0,30}(?:5|٥|الخمس|الخمسه)/.test(q);
}

export function aiIdentityQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:انت|إنت|انتا).{0,18}(?:ai\b|ذكاء|روبوت|بوت)|(?:ai\b|ذكاء\s+اصطناعي|روبوت|بوت).{0,18}(?:صح|ولا|انت|إنت)/i.test(q);
}

export function falseLiteralHumanIdentityClaim(value: string | null | undefined) {
  const q = n(value);
  return /(?:انا|أنا).{0,20}(?:انسان|إنسان|بني\s+ادم|بني\s+آدم|موظف\s+عادي|موظف\s+حقيقي)|(?:مش|مو|لست).{0,12}(?:ai|ذكاء\s+اصطناعي|روبوت|بوت)/i.test(q);
}

export function abuseOnlyTurn(turn: InterpretedTurn) {
  if (!turn.topics.includes("abuse")) return false;
  const businessTopics = turn.topics.filter((topic) => !["abuse", "unknown", "greeting", "thanks", "acknowledgement"].includes(topic));
  return businessTopics.length === 0 && turn.requestedActions.length === 0;
}

export function expediteTodayText(value: string | null | undefined) {
  const q = n(value);
  return /(?:ممكن|بصير|مايصير|ما\s+يصير|ما\s+بصير|بدك|بدي).{0,28}(?:تمشيها|تمشوه|تخلصوه|تخلصها|تزبطها|تسرعوه|تسرعها).{0,24}(?:اليوم|هسا|الان)?|(?:تمشيها|تخلصها|تزبطها).{0,20}اليوم|(?:بدي|بدها|لازم).{0,25}(?:قرار|جواب|نتيجه).{0,20}(?:اليوم|هسا|الان)/.test(q);
}

export function websiteDocumentAcknowledgementText(value: string | null | undefined) {
  const q = n(value);
  return /(?:صورتها|رفعتها|حملتها|صورت|رفعت|حملت).{0,30}(?:عالموقع|على\s+الموقع|بالموقع)|(?:الهويه|المستند|الورق).{0,30}(?:صورتها|رفعتها|حملتها|صورت|رفعت|حملت).{0,20}(?:عالموقع|على\s+الموقع|بالموقع)/.test(q);
}

export function requirementsHelpText(value: string | null | undefined) {
  const q = n(value);
  return /(?:شو|ايش|إيش).{0,20}(?:المطلوب|الشروط|المتطلبات)|(?:كيف).{0,24}(?:اخلي|أخلي).{0,20}(?:ملفي|الملف).{0,15}(?:قوي|واضح)|(?:ما\s+عندي|مش\s+عندي).{0,30}(?:شهاده\s+راتب|شهادة\s+راتب|كشف\s+راتب|حساب\s+بنك|عقد\s+عمل).{0,28}(?:شو|كيف|الحل|اعمل|أعمل)/.test(q);
}

export function multiCommercialFaqText(value: string | null | undefined) {
  const q = n(value);
  const checks = [
    /(?:مرابحه|مرابحة|ربوي|ربا)/.test(q),
    /(?:دفعه\s+اولى|دفعة\s+أولى|تامين|تأمين|رسوم\s+عقد|رسوم\s+اداريه|رسوم\s+إدارية)/.test(q),
    /(?:شرق\s+اوسط|شرق\s+أوسط|ياباني|منشا|منشأ|وارد)/.test(q),
    /(?:غرامه|غرامة|تاخير\s+القسط|تأخير\s+القسط)/.test(q),
    /(?:سنتين|24\s+شهر|٢٤\s+شهر|مده\s+اقل|مدة\s+أقل|نرفع\s+القسط)/.test(q),
    /(?:مجمل|اجمالي|إجمالي).{0,18}(?:السعر|المبلغ)/.test(q),
  ];
  return checks.filter(Boolean).length >= 2;
}

function cancellationStatusReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const stage = applicationJourneyStage(input.truth.application);
  if (!["cancelled", "refund_requested", "refund_completed"].includes(stage)) return null;
  const synthetic: InterpretedTurn = {
    ...input.turn,
    topics: Array.from(new Set([...input.turn.topics, "application_status", "tracking"])) as InterpretedTurn["topics"],
  };
  const link = buildOfficialLinkContext(synthetic, input.truth).relevant.tracking;
  if (stage === "refund_requested") {
    return `نعم، طلبك ملغي بالفعل، وطلب الاسترداد مسجل وقيد المعالجة.${link ? `\nوللتأكد من الحالة بنفسك: ${link}` : ""}`;
  }
  if (stage === "refund_completed") {
    return `نعم، طلبك ملغي، والاسترداد مكتمل حسب الحالة الحالية.${link ? `\nوللتأكد من الحالة بنفسك: ${link}` : ""}`;
  }
  return `نعم، طلبك ملغي بالفعل. ما في داعي تعيد طلب الإلغاء أو تأكيده مرة ثانية.${link ? `\nوللتأكد من الحالة بنفسك: ${link}` : ""}`;
}

function paymentAuthorityReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const app = input.truth.application;
  const stage = applicationJourneyStage(app);
  const commercial = continuationCommercialState(app);
  const p = input.truth.policy;
  const raw = input.turn.rawText;
  const deferral = feeDeferralOrNoMoneyText(raw);
  const confusion = feeVsFirstInstallmentConfusionText(raw);
  const wantsCurrentPayment = currentFeePaymentQuestionText(raw);
  if (!deferral && !confusion && !wantsCurrentPayment) return null;

  if (commercial === "already_paid" || stage === "payment_confirmed_under_review") {
    return `الدفع مؤكد إداريًا على طلبك، فما في داعي تدفع 5 دنانير مرة ثانية. والقسط الأول بيستحق بعد شهر من استلام الجهاز وتوقيع العقد.`;
  }
  if (commercial === "payment_pending_admin" || stage === "payment_proof_pending_admin") {
    return `وصل الدفع موجود على الملف وبانتظار المراجعة، فما في داعي تدفع مرة ثانية. والقسط الأول منفصل وبيستحق بعد شهر من الاستلام وتوقيع العقد.`;
  }
  if (stage === "preliminary_approved_waiting_decision") {
    return `الـ5 دنانير مش دفعة أولى؛ هي رسوم فتح الملف، وبتصير فقط إذا اخترت الاستمرار. القسط الأول شيء منفصل وبيستحق بعد شهر من استلام الجهاز وتوقيع العقد.`;
  }
  if (commercial === "payment_ready" || stage === "continuation_confirmed_fee_due") {
    if (deferral) {
      return `إذا بدك نفتح الملف للدراسة النهائية، رسوم فتح الملف 5 دنانير لازم تنعمل بهالمرحلة قبل بدء الدراسة النهائية؛ ما بتنضاف على القسط الأول ولا بتتأجل معه. إذا مش جاهز هسا، ما في مشكلة ولا ضغط: لما تكون جاهز للخطوة بنكمل من نفس الطلب. القسط الأول بيستحق بعد شهر من الاستلام وتوقيع العقد.`;
    }
    if (confusion) {
      return `صح، ما في دفعة أولى على الجهاز. الـ5 دنانير مش دفعة أولى؛ هي رسوم فتح الملف لبدء الدراسة النهائية. القسط الأول نفسه بيستحق بعد شهر من استلام الجهاز وتوقيع العقد.`;
    }
    if (wantsCurrentPayment) {
      const synthetic: InterpretedTurn = {
        ...input.turn,
        topics: Array.from(new Set([...input.turn.topics, "payment_fee", "payment_method", "receipt_upload", "continuation"])) as InterpretedTurn["topics"],
      };
      const receipt = buildOfficialLinkContext(synthetic, input.truth).relevant.receipt;
      return `نعم، إذا بدك تكمل فتح الملف هسا، المطلوب 5 دنانير رسوم فتح الملف. ${p.paymentMethodRule}${receipt ? `\nبعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${receipt}` : ""}\nالقسط الأول مش مطلوب هسا؛ بيستحق بعد شهر من استلام الجهاز وتوقيع العقد.`;
    }
  }
  return `رسوم فتح الملف 5 دنانير مرتبطة بمرحلة ما بعد الموافقة المبدئية واختيار الاستمرار، وهي منفصلة عن القسط الأول. القسط الأول بيستحق بعد شهر من الاستلام وتوقيع العقد.`;
}

function commercialFaqReply(input: { truth: TruthBundle; turn: InterpretedTurn }) {
  if (!multiCommercialFaqText(input.turn.rawText)) return null;
  const q = n(input.turn.rawText);
  const p = input.truth.policy;
  const app = input.truth.application;
  const lines: string[] = [];
  if (/(?:مرابحه|مرابحة|ربوي|ربا)/.test(q)) lines.push(`• النظام: ${p.commercialStructureRule}`);
  if (/(?:دفعه\s+اولى|دفعة\s+أولى|تامين|تأمين|رسوم\s+عقد|رسوم\s+اداريه|رسوم\s+إدارية)/.test(q)) lines.push(`• الدفعة والرسوم: ${p.additionalFeesRule}`);
  if (/(?:شرق\s+اوسط|شرق\s+أوسط|ياباني|منشا|منشأ|وارد)/.test(q)) lines.push("• منشأ الجهاز: ما عندي منشأ موثق على الطلب هسا، لذلك ما رح أخمّن إذا كان شرق أوسط أو ياباني.");
  if (/(?:غرامه|غرامة|تاخير\s+القسط|تأخير\s+القسط)/.test(q)) lines.push("• التأخير: تفاصيل أي غرامة أو رسوم تأخير تُعتمد من العقد النهائي؛ ما رح أعطيك رقم أو شرط غير موثق قبل العقد.");
  if (/(?:سنتين|24\s+شهر|٢٤\s+شهر|مده\s+اقل|مدة\s+أقل|نرفع\s+القسط)/.test(q)) {
    const current = app?.installmentMonths ? ` طلبك الحالي مسجل على ${app.installmentMonths} شهر.` : "";
    lines.push(`• سنتين/24 شهر:${current} تغيير المدة والحسبة ممكن يطلب تعديل إداري، وأي قسط جديد بنعتمده فقط بعد ما تظهر الحسبة الرسمية على الطلب.`);
  }
  if (/(?:مجمل|اجمالي|إجمالي).{0,18}(?:السعر|المبلغ)/.test(q)) {
    const total = app?.totalWithInterest != null ? `الإجمالي المسجل حاليًا ${app.totalWithInterest} دينار.` : "ما عندي إجمالي موثق إضافي غير الحسبة الظاهرة على الطلب.";
    lines.push(`• إجمالي السعر: ${total}`);
  }
  return lines.length ? lines.join("\n") : null;
}

function requirementsReply(input: { truth: TruthBundle; turn: InterpretedTurn }) {
  if (!requirementsHelpText(input.turn.rawText)) return null;
  const p = input.truth.policy;
  return `${p.requirementsGuidanceRule} المستندات الحساسة بنستلمها فقط من الرابط الرسمي الآمن، مش عبر واتساب.`;
}

function identityReply(state: ConversationState) {
  return `معك ${roleDisplayName(state.role.currentRole)} من فريق الأمين، وأنا متابع معك من هون. احكيلي سؤالك وبكمل معك مباشرة.`;
}

function abuseReply() {
  return "أنا هون أحل موضوعك، بس خلينا بدون إساءة. إذا في مشكلة بالطلب أو شي مضايقك احكيلي شو صار وبمشي معك فيه مباشرة.";
}

function expediteReply(truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  const status = truth.application ? ` طلبك حاليًا ${stage === "payment_confirmed_under_review" ? "قيد الدراسة النهائية" : stage === "preliminary_review" ? "قيد المراجعة المبدئية" : "قيد المتابعة"}.` : "";
  return `فاهم إنك بدك الموضوع يخلص اليوم.${status} ما بقدر أضمن قرار اليوم أو أقدّم موعد غير موثق، لكن طلب الاستعجال واضح وبنعتمد أي تحديث فعلي أول ما يظهر على الملف.`;
}

function documentAckReply(truth: TruthBundle) {
  if (truth.application?.documents?.identityComplete) return "تمام، الهوية ظاهرة مكتملة على الملف، فما في داعي تعيدي رفعها أو تبعتيها على واتساب.";
  return "تمام، إذا رفعتي الهوية من الموقع فهاي هي الطريقة الصحيحة. ما في داعي تبعتيها على واتساب؛ بنعتمد اللي يظهر رسميًا على الملف بعد المراجعة.";
}

export function buildHumanFirstConversationAuthorityReply(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  actions?: ActionResult[];
}) {
  const cancel = cancellationStatusReply({ turn: input.turn, truth: input.truth });
  if (cancel) return cancel;
  const payment = paymentAuthorityReply({ turn: input.turn, truth: input.truth });
  if (payment) return payment;
  const faq = commercialFaqReply({ truth: input.truth, turn: input.turn });
  if (faq) return faq;
  if (aiIdentityQuestionText(input.turn.rawText) && input.turn.requestedActions.length === 0) return identityReply(input.state);
  if (abuseOnlyTurn(input.turn)) return abuseReply();
  if (expediteTodayText(input.turn.rawText)) return expediteReply(input.truth);
  if (websiteDocumentAcknowledgementText(input.turn.rawText)) return documentAckReply(input.truth);
  const requirements = requirementsReply({ truth: input.truth, turn: input.turn });
  if (requirements) return requirements;
  return null;
}

export function appendSafeIdentityAnswerIfAsked(input: { reply: string; turn: InterpretedTurn; state: ConversationState }) {
  if (!aiIdentityQuestionText(input.turn.rawText)) return input.reply;
  if (/معك.{0,20}(?:تالا|فدوه|فدوة|عبدالله|عبدالرحمن|عمران).{0,25}(?:الامين|الأمين)/.test(n(input.reply))) return input.reply;
  return `${input.reply}\n\n${identityReply(input.state)}`;
}

export function replyMisalignedWithHumanFirstAuthority(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  reply: string | null | undefined;
}) {
  const reply = n(input.reply);
  if (!reply) return false;
  const stage = applicationJourneyStage(input.truth.application);
  if (cancellationStatusQuestionText(input.turn.rawText) && ["cancelled", "refund_requested", "refund_completed"].includes(stage)) {
    if (/(?:بدي\s+تاكيد|اكتب.{0,18}نعم|ما\s+نفذت|ما\s+اعتبرته|اذا\s+قررت\s+تلغي|إذا\s+قررت\s+تلغي)/.test(reply)) return true;
  }
  if ((currentFeePaymentQuestionText(input.turn.rawText) || feeDeferralOrNoMoneyText(input.turn.rawText) || feeVsFirstInstallmentConfusionText(input.turn.rawText))
      && /(?:رغبتك\s+بالاستمرار\s+مسجله|رغبتك\s+بالاستمرار\s+مسجلة|جاوبني\s+بالنقطه|جاوبني\s+بالنقطة)/.test(reply)) return true;
  if (multiCommercialFaqText(input.turn.rawText) && /(?:تعديل\s+اللون|تعديل\s+المواصفات)/.test(reply)) return true;
  if (aiIdentityQuestionText(input.turn.rawText) && falseLiteralHumanIdentityClaim(input.reply)) return true;
  if (abuseOnlyTurn(input.turn) && /(?:ما\s+عندي\s+طلب\s+موثوق|تفاصيل\s+الطلب\s+مش\s+كامله|تفاصيل\s+الطلب\s+مش\s+كاملة)/.test(reply)) return true;
  if (expediteTodayText(input.turn.rawText) && /(?:تفاصيل\s+الطلب\s+مش\s+كامله|تفاصيل\s+الطلب\s+مش\s+كاملة)/.test(reply)) return true;
  if (websiteDocumentAcknowledgementText(input.turn.rawText) && /(?:اذا\s+رسالتك|إذا\s+رسالتك|حاله\s+طلبك|حالة\s+طلبك).{0,80}(?:سؤال|جاوب)/.test(reply)) return true;
  if (requirementsHelpText(input.turn.rawText) && /^(?:المتطلبات\s+تعتمد\s+على\s+حاله\s+الملف|المتطلبات\s+تعتمد\s+على\s+حالة\s+الملف)/.test(reply)) return true;
  return false;
}
