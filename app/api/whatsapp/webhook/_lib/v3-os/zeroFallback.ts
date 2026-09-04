import { applicationJourneyStage, canDiscloseFileOpeningPayment, customerFacingStatusLabel, shouldAskContinuationDecision } from "./applicationJourney";
import { continuationCommercialState } from "./commercialProgression";
import { buildDelaySupportProfile } from "./delaySupport";
import { buildOfficialLinkContext, detectReplyLinkViolations } from "./linkIntegrity";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { buildManualActionCustomerReply, resolveManualActionDisposition } from "./manualActionPolicy";
import { normalizeArabic } from "./text";
import { asksOfficeSchedule, bankStatementDurationCustomerReply, bankStatementDurationQuestion, explicitDocumentUploadKind, officeScheduleCustomerReply } from "./operationalPrecision";
import type { ActionResult, ConversationState, InterpretedTurn, ReplyPlan, TruthBundle, VerificationReport } from "./types";

const ACTION_LABELS: Record<string,string> = {
  cancel_application: "إلغاء الطلب",
  request_refund: "طلب الاسترداد",
  stop_refund: "إيقاف الاسترداد",
  reopen_application: "إعادة فتح الطلب",
  change_device: "تغيير الجهاز وإعادة الحسبة",
  change_application_data: "تعديل بيانات الطلب",
  continue_application: "الاستمرار بالطلب",
};

function actionSentence(plan: ReplyPlan, actions: ActionResult[]) {
  const planned = plan.actions.find((x) => ACTION_LABELS[x.action]);
  if (!planned || planned.action === "continue_application") return null;
  const result = actions.find((x) => x.action === planned.action);
  const label = ACTION_LABELS[planned.action] || "الإجراء المطلوب";
  if (result?.executed && ["executed","already_done"].includes(result.outcome) && result.authoritativeSummary) return result.authoritativeSummary;
  if (result?.outcome === "needs_confirmation") return `طلبك واضح: ${label}. قبل ما يتغير أي شيء على الطلب، أكدلي إنك بدك هذا الإجراء بالضبط.`;
  return `طلبك واضح عندي: ${label}. ما رح أعتبره منجز ولا أقول لك تم قبل ما تتحدث حالة الطلب فعليًا.`;
}

function shortStatus(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return null;
  const bits = [
    app.trackingId ? `رقم طلبك ${app.trackingId}` : null,
    app.deviceName ? `الجهاز ${app.deviceName}` : null,
    `الحالة الآن: ${customerFacingStatusLabel(app)}`,
  ].filter(Boolean);
  return `${bits.join("، ")}.`;
}

function pick<T>(values: T[], seed: string): T {
  let hash = 0;
  for (const ch of String(seed || "")) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  return values[hash % values.length];
}

function rawAsksFeePolicy(q: string) {
  return /(?:خمس|5|٥)\s*(?:دنانير|دينار)|رسوم\s*فتح\s*الملف|بدون\s*(?:خمس|5|٥)|ما\s*بتفتحو[^\n]{0,30}(?:خمس|5|٥)|لازم[^\n]{0,30}(?:خمس|5|٥)/.test(q);
}

function rawAsksContactNumber(q: string) {
  return /(?:رقم\s*(?:تواصل|اتصال|هاتف|واتساب)|في\s+رقم\s+تواصل|بدي\s+احكي\s+تلفون|اتصل\s+عليكم|مكالمة)/.test(q);
}

function rawAsksPickupWhen(q: string) {
  return /(?:متى|امتى|ايمتى|أي\s*وقت|موعد).{0,30}(?:اجي|أجي|استلم)|(?:اجي|أجي).{0,30}(?:استلم|موعد)|(?:اعطيني|أعطيني).{0,20}موعد/.test(q);
}

function rawAsksInstallmentAmount(q: string) {
  return /(?:كم|قديش|شو).{0,20}(?:قسط|القسط)|(?:القسط|قسطه|قسطو).{0,20}(?:كم|قديش)/.test(q);
}

function rawAsksInstallmentPaymentChannel(q: string) {
  return /(?:وين|كيف|لمن|لمين|على\s+وين|طريقه|طريقة)[^\n]{0,35}(?:القسط|الاقساط)|(?:القسط|الاقساط)[^\n]{0,35}(?:وين|كيف|لمن|لمين|دفع|تحويل|محفظه|محفظة)/.test(q);
}

function rawAsksProductBoxCondition(q: string) {
  return /(?:الجهاز|التلفون|الموبايل).{0,25}(?:جديد|بالكرتونه|بالكرتونة|مختوم)|(?:جديد|بالكرتونه|بالكرتونة|مختوم).{0,25}(?:الجهاز|التلفون|الموبايل)/.test(q);
}

function isSocialAck(q: string) {
  return /^(?:تمام|اوك|اوكي|شكرا|شكرًا|يسلمو|يعطيك\s+العافيه|يعطيك\s+العافية|الله\s+يعطيك\s+العافيه|الله\s+يعطيك\s+العافية|على\s+خير|ان\s+شاء\s+الله|إن\s+شاء\s+الله|الحمد\s+لله|اه\s+تمام|أه\s+تمام)[!؟?.,،\s]*$/.test(q);
}

function safeStatusLine(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return null;
  return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} ${customerFacingStatusLabel(app)}.`;
}

export function buildZeroFallbackReply(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  plan: ReplyPlan;
  actions: ActionResult[];
  recentTurns?: string[];
}) {
  const topics = new Set(input.turn.topics);
  const p = input.truth.policy;
  const app = input.truth.application;
  const stage = applicationJourneyStage(app);
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const parts: string[] = [];
  const q = normalizeArabic(input.turn.rawText).replace(/[؟?!.,،]+/g, " ").replace(/\s+/g, " ").trim();
  const explicitDocumentKind = explicitDocumentUploadKind(input.turn.rawText);

  if (asksOfficeSchedule(input.turn.rawText)) {
    return officeScheduleCustomerReply(input.turn.rawText);
  }

  if (bankStatementDurationQuestion(input.turn.rawText)) {
    return bankStatementDurationCustomerReply();
  }

  if (explicitDocumentKind && app) {
    const docs = app.documents;
    const alreadyPresent =
      explicitDocumentKind === "identity" ? docs?.identityComplete === true :
      explicitDocumentKind === "salarySlip" ? docs?.salarySlipUploaded === true :
      docs?.guarantorDataComplete === true;
    if (alreadyPresent) {
      const label = explicitDocumentKind === "identity" ? "الهوية" : explicitDocumentKind === "salarySlip" ? "كشف/شهادة الراتب" : "بيانات الكفيل";
      return `${label} موجود على ملفك بالفعل، وما في داعي تعيد رفعه.`;
    }
    const url = links.relevant[explicitDocumentKind];
    if (url) {
      const label = explicitDocumentKind === "identity" ? "الهوية" : explicitDocumentKind === "salarySlip" ? "كشف/شهادة الراتب" : "بيانات الكفيل";
      return `ارفع ${label} من الرابط الرسمي الآمن المرتبط بطلبك:\n${url}\nوما بنستلم المستندات الحساسة على واتساب.`;
    }
    return "الرابط المباشر المرتبط بطلبك مش متاح عندي هسا، وما رح أعطيك رابط عام أو غير موثق بدل الرابط الصحيح.";
  }

  // Social acknowledgements must stay social. Never dump the full order snapshot
  // just because an application is bound to the conversation.
  if (isSocialAck(q) && !input.turn.requestedActions.length && !input.turn.topics.some((t) => ["application_status","review_timing","payment_status","refund","requirements"].includes(t))) {
    return pick(["العفو، الله يعطيك العافية.", "تمام، الله يعطيك العافية.", "على خير إن شاء الله، وأنا موجود لأي استفسار."], input.turn.turnId);
  }

  // A customer number is never an official company contact number. If no explicit
  // official contact is provided by policy, keep the channel statement number-free.
  if (rawAsksContactNumber(q) || input.turn.topics.includes("call_request")) {
    return "المتابعة الأساسية للطلبات عبر واتساب الحالي. إذا احتجت قناة تواصل إضافية بنعطيك فقط البيانات الرسمية المعتمدة؛ ما رح أعطيك رقم غير موثق.";
  }

  // Direct policy answer when the customer explicitly asks whether the 5 JOD fee
  // exists/is required. This explains the rule without exposing recipient/alias/receipt details.
  if (rawAsksFeePolicy(q) && (stage === "preliminary_approved_waiting_decision" || stage === "preliminary_review")) {
    return `رسوم فتح الملف هي ${p.fileOpeningFeeJod} دنانير، وتُطلب فقط بعد الموافقة المبدئية إذا اخترت الاستمرار بإجراءات فتح الملف والدراسة النهائية. هي ليست ثمن الجهاز ولا القسط الأول، وتخضع للاسترداد عبر المسار الرسمي عند الإلغاء بعد دفع مؤكد. ما بنرسل تفاصيل التحويل قبل ما تختار الاستمرار.`;
  }

  // A preliminary approval is not a pickup appointment. Answer the real question
  // instead of repeating the whole order snapshot.
  if (app && rawAsksPickupWhen(q) && stage !== "approved") {
    const status = safeStatusLine(input.truth) || "طلبك لسا ضمن الإجراءات.";
    const next = stage === "preliminary_approved_waiting_decision"
      ? "الموافقة الحالية مبدئية وليست النهائية، ولسا ما في موعد استلام. إذا حاب تكمل بإجراءات فتح الملف وتحويل الطلب للدراسة النهائية، أكدلي إنك بدك تستمر."
      : "لسا ما في موعد استلام رسمي على الطلب. الاستلام من المكتب فقط بعد اكتمال الإجراءات وتحديد موعد رسمي.";
    return `${status} ${next}`;
  }

  if (app && rawAsksInstallmentAmount(q) && app.monthlyPayment != null) {
    const duration = app.installmentMonths ? ` لمدة ${app.installmentMonths} شهر` : "";
    return `القسط الشهري التقريبي المسجل على طلبك هو ${app.monthlyPayment} دينار${duration}. وإذا تغير الجهاز أو السعر، ما بعتمد حسبة جديدة إلا بعد ما تتحدث بيانات الطلب فعليًا.`;
  }

  if (rawAsksInstallmentPaymentChannel(q)) {
    return `${p.firstInstallmentRule} أما جهة أو طريقة سداد الأقساط الشهرية، ما عندي إلها بيانات موثقة ضمن حقيقة الطلب الحالية، لذلك ما رح أستخدم محفظة أو مستفيد رسوم فتح الملف على إنها بيانات الأقساط.`;
  }

  if (rawAsksProductBoxCondition(q)) {
    return "بالنسبة لكون الجهاز جديد بالكرتونة أو مختوم، ما بدي أأكد صفة مش ظاهرة عندي بشكل موثق في بيانات الطلب الحالية. أي مواصفة بيعتمدها العرض أو المنتج الرسمي هي المرجع عند الإتمام.";
  }

  if (/(?:متوفر|متوفرين|متاح|موجود)[^\n]{0,35}(?:ايفون|آيفون|iphone|سامسونج|samsung|الجهاز|الموديل)|(?:ايفون|آيفون|iphone|سامسونج|samsung|الجهاز|الموديل)[^\n]{0,35}(?:متوفر|متوفرين|متاح|موجود)/i.test(q)) {
    if (links.relevant.products) return `التوفر والسعر الحاليين مرجعهم صفحة المنتجات الرسمية، وما بدي أأكد توفر موديل من غير بيانات موثقة:\n${links.relevant.products}`;
    return "ما عندي حالة توفر موثقة لهذا الموديل ضمن حقيقة الطلب الحالية، لذلك ما رح أأكد إنه متوفر أو غير متوفر من عندي.";
  }

  if (/(?:السجل\s+التجاري|مسجله\s+تجاري|مسجلة\s+تجاري|الشركه\s+مسجله|الشركة\s+مسجلة)/.test(q)) {
    return "ما عندي ضمن بيانات الطلب الحالية نتيجة سجل تجاري موثقة أقدر أأكد منها تسجيل جهة العمل. التحقق من بيانات جهة العمل يتم ضمن دراسة الملف، وما بدي أعطيك تأكيد غير ظاهر عندي.";
  }

  const manualDisposition = resolveManualActionDisposition({ state: input.state, truth: input.truth, plan: input.plan, actions: input.actions });
  const manualReply = buildManualActionCustomerReply({ disposition: manualDisposition, truth: input.truth });
  if (manualReply) return manualReply;

  const action = actionSentence(input.plan, input.actions);
  if (action) parts.push(action);

  if (topics.has("application_status") || topics.has("tracking")) {
    const status = shortStatus(input.truth);
    if (status) parts.push(status);
    else if (input.truth.ambiguousApplications.length) parts.push("عندي أكثر من طلب مرتبط بالمحادثة. ابعث رقم التتبع للطلب اللي بدك أراجعه حتى ما أعطيك معلومات عن طلب ثاني.");
    else if (input.state.activeTrackingId) parts.push(`رقم الطلب المرتبط بالمحادثة عندي ${input.state.activeTrackingId}. ما رح أطلبه منك مرة ثانية؛ ما عندي تحديث موثق أضيفه على حالته بهذه اللحظة.`);
    else parts.push("حتى أعطيك حالة صحيحة، ابعث رقم التتبع أو رقم الطلب وبراجع نفس الطلب معك.");
    if (app && stage === "preliminary_approved_waiting_decision" && shouldAskContinuationDecision(app, input.turn)) {
      parts.push("الموافقة الحالية مبدئية وليست النهائية. هل تود الاستمرار بإجراءات فتح الملف وتحويل الطلب للدراسة النهائية؟");
    } else if (links.relevant.tracking && topics.has("tracking")) {
      parts.push(`رابط التتبع الرسمي: ${links.relevant.tracking}`);
    }
  }

  if (topics.has("review_timing") || topics.has("operational_pressure")) {
    const d = buildDelaySupportProfile({ turn: input.turn, truth: input.truth, recentTurns: input.recentTurns });
    if (d.asksBeyondNormalWindow || d.repeatedDelayTurns >= 2) {
      parts.push(`${d.reassuranceCue} بعد مدة الـ2–3 أيام ما عندنا عدد إضافي ثابت وموثق لكل الملفات؛ أي رقم أعطيك إياه غير هيك بكون تخمين. الضغط الحالي شديد وبعض الملفات بتتجاوز المعدل الطبيعي.`);
    } else {
      parts.push(`${d.reassuranceCue} المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل، وحاليًا في ضغط شديد وبعض الملفات بتتجاوز هذا المعدل. ما بعطيك موعد غير موثق.`);
    }
  }

  if (["payment_status","payment_confirmation","payment_method","payment_timing","payment_recipient","payment_fee","receipt_upload"].some((t) => topics.has(t as any))) {
    if (!canDiscloseFileOpeningPayment(app, input.turn)) {
      if (rawAsksFeePolicy(q)) parts.push(`رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير وتُطلب فقط بعد الموافقة المبدئية إذا اخترت الاستمرار. ما بنرسل تفاصيل التحويل قبل قرار الاستمرار.`);
      else if (stage === "preliminary_approved_waiting_decision") parts.push("الطلب حاصل على موافقة مبدئية. قبل تفاصيل التحويل، بدي قرارك أولًا: هل تود الاستمرار بإجراءات فتح الملف وتحويل الطلب للدراسة النهائية؟");
      else parts.push("الطلب لسه ما وصل لمرحلة رسوم فتح الملف، لذلك ما رح أفتح تفاصيل التحويل قبل وقته.");
    } else if (hasAuthoritativePaymentConfirmation(app)) {
      parts.push("الدفع مؤكد إداريًا على الطلب، وما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية.");
    } else if (topics.has("receipt_upload") || topics.has("payment_confirmation")) {
      if (links.relevant.receipt) parts.push(`تأكيد الدفع يتم يدويًا من الإدارة بعد مراجعة الوصل. رابط رفع الوصل الرسمي المرتبط بطلبك: ${links.relevant.receipt}`);
      else parts.push(app?.trackingId ? "تأكيد الدفع يتم يدويًا من الإدارة، لكن رابط رفع الوصل المرتبط بالطلب غير متاح عندي الآن؛ ما رح أعطيك رابط غير موثق." : "تأكيد الدفع يتم يدويًا من الإدارة. إذا ما قدرت أربط الطلب تلقائيًا بطلب منك معلومة واحدة فقط لتحديده.");
    } else {
      parts.push(p.paymentMethodRule);
    }
  }

  if (topics.has("continuation")) {
    const commercial = continuationCommercialState(app);
    if (commercial === "payment_ready") {
      parts.push(`تمام. بما إن عندك موافقة مبدئية واخترت تكمل، رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير. ${p.fileOpeningFeePurposeRule} ${p.fileOpeningFeeRefundRule} وهي منفصلة عن ثمن الجهاز والقسط الأول. ${p.paymentMethodRule}`);
      if (links.relevant.receipt) parts.push(`بعد التحويل ارفع الوصل من الرابط الرسمي: ${links.relevant.receipt}`);
      parts.push("اعتماد الدفع النهائي يتم يدويًا من الإدارة بعد مراجعة الوصل.");
    } else if (commercial === "already_paid") parts.push("الدفع مؤكد إداريًا أصلًا، فما في داعي تعيد الدفع أو ترفع وصل جديد.");
    else if (commercial === "payment_pending_admin") parts.push("وصل الدفع مسجل وبانتظار مراجعة الإدارة؛ لا تعيد الدفع ولا ترفع الوصل مرة ثانية.");
  }

  if (topics.has("refund") && app) {
    if (stage === "refund_completed") parts.push("حالة الاسترداد المسجلة على الطلب: مكتمل.");
    else if (stage === "refund_requested") parts.push("طلب الاسترداد مسجل وقيد المعالجة، وما في خطوة ناقصة من طرفك حسب الحالة الحالية.");
    else if (!hasAuthoritativePaymentConfirmation(app)) parts.push("ما بقدر أعتبر الاسترداد مفتوح بدون دفع مؤكد إداريًا على الطلب.");
  }

  if (topics.has("requirements")) {
    const docs = app?.documents;
    if (docs?.loaded) {
      const present = [
        docs.identityComplete ? "الهوية" : null,
        docs.salarySlipUploaded ? "كشف/شهادة الراتب" : null,
        docs.guarantorDataComplete ? "بيانات الكفيل" : null,
      ].filter(Boolean);
      if (present.length) parts.push(`الموجود على ملفك حاليًا: ${present.join("، ")}. ما رح أطلب منك تعيد مستند وصلنا. إثبات الدخل من المتطلبات الأساسية، أما بيانات الكفيل فقد تُطلب حسب حالة الملف فقط. إذا احتاجت المراجعة مستندًا إضافيًا بنطلبه عبر الرابط الرسمي الآمن.`);
      else parts.push("ما عندي مستند ناقص محدد مثبت على الملف الآن. إثبات الدخل من المتطلبات الأساسية، أما بيانات الكفيل فقد تُطلب حسب حالة الملف فقط. أي مستند إضافي بنطلبه عبر الرابط الرسمي الآمن.");
    } else parts.push("المتطلبات تعتمد على حالة الملف. المستندات الحساسة تُرفع فقط عبر الرابط الرسمي الآمن، وما بنستلمها على واتساب.");
  }

  if (topics.has("office_location")) parts.push(`${p.generalLocation}، والحضور للمكتب بموعد رسمي فقط.`);
  if (topics.has("delivery")) parts.push(p.pickupRule);
  if (topics.has("first_installment")) parts.push(p.firstInstallmentRule);

  if (!parts.length && /(?:شروط|تقسيط|طريقه التقديم|طريقة التقديم|كيف اقدم|كيف أقدم)/.test(q)) {
    parts.push("أكيد. التقديم يبدأ بطلب موافقة مبدئية، والمتطلبات تختلف حسب الملف. عادةً نحتاج هوية وإثبات دخل، وقد تُطلب بيانات كفيل حسب الحالة. المستندات الحساسة تُرفع فقط عبر الرابط الرسمي الآمن، وما بنستلمها على واتساب.");
  }

  if (!parts.length) {
    if (topics.has("human_request") || /(?:موظف|موضف|حدا\s+يرد|احكي\s+مع)/.test(q)) {
      parts.push("أنا معك من فريق الأمين وبكمل معك من نفس المحادثة. احكيلي المطلوب مباشرة وبجاوبك على المسجل بدون ما أعيد عليك معلومات معروفة.");
    } else if (app) {
      const status = safeStatusLine(input.truth);
      parts.push(status || "طلبك مرتبط بالمحادثة عندي.");
      parts.push("إذا سؤالك عن نقطة محددة مثل الموعد أو القسط أو المستندات، اكتبها مباشرة وبجاوبك عليها بدون إعادة كل تفاصيل الطلب.");
    } else if (input.state.activeTrackingId) parts.push(`رقم الطلب المرتبط بالمحادثة عندي ${input.state.activeTrackingId}. ما رح أطلبه منك مرة ثانية؛ اكتب سؤالك على نفس الطلب مباشرة.`);
    else parts.push("أنا معك. احكيلي سؤالك مباشرة، وإذا تعذر ربط طلب سابق بطلب منك معلومة واحدة فقط لتحديده.");
  }

  return parts.join("\n\n").trim();
}

export function verifyZeroFallbackReply(input: {
  reply: string;
  turn: InterpretedTurn;
  truth: TruthBundle;
  actions: ActionResult[];
}): VerificationReport {
  const unsupportedClaims: string[] = [];
  const policyViolations: string[] = [];
  const actionClaimViolations: string[] = [];
  const reply = String(input.reply || "").trim();
  if (!reply) unsupportedClaims.push("empty_zero_fallback");
  if (/صار خلل|مشكلة مؤقتة بقراءة|ابعثلي نفس النقطة بعد دقيقة/i.test(reply)) policyViolations.push("visible_internal_failure_language");
  if (/(?:AI|ذكاء اصطناعي|مستوى إشراف|داخل النظام|routing|Supervisor)/i.test(reply)) policyViolations.push("internal_architecture_language");
  policyViolations.push(...detectReplyLinkViolations({ reply, turn: input.turn, truth: input.truth }).map((x) => `link_integrity:${x}`));

  const executed = (action: string) => input.actions.some((x) => x.action === action && x.executed && ["executed","already_done"].includes(x.outcome));
  if (/(?:تم\s+(?:إلغاء|الغاء)|لغينا\s+الطلب|الطلب\s+صار\s+ملغي)/i.test(reply) && !executed("cancel_application")) actionClaimViolations.push("zero_fallback_unverified_cancel_claim");
  if (/(?:تم\s+(?:تعديل|تغيير)\s+(?:الجهاز|الطلب|البيانات)|صار\s+الطلب\s+معدل)/i.test(reply) && !executed("change_device") && !executed("change_application_data")) actionClaimViolations.push("zero_fallback_unverified_change_claim");
  if (/(?:تم\s+(?:الاسترداد|الاسترجاع)|رجعنا\s+(?:المبلغ|المصاري))/i.test(reply) && !executed("request_refund")) actionClaimViolations.push("zero_fallback_unverified_refund_claim");

  return {
    pass: !(unsupportedClaims.length || policyViolations.length || actionClaimViolations.length),
    missingTopics: [],
    unsupportedClaims,
    truthContradictions: [],
    actionClaimViolations,
    policyViolations,
    hierarchyViolations: [],
    repetitionFlags: [],
  };
}
