import { roleDisplayName } from "./hierarchy";
import type { ActionResult, ConversationState, InterpretedTurn, ReplyPlan, TruthBundle } from "./types";
import { hasAuthoritativePaymentConfirmation, hasPaymentRefundIntegrityConflict } from "./paymentTruth";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { continuationCommercialState } from "./commercialProgression";
import { applicationJourneyStage, customerFacingStatusLabel, customerOrderSnapshot, explicitContinuation, firstCustomerName, shouldAskContinuationDecision } from "./applicationJourney";
import { buildDelaySupportProfile } from "./delaySupport";

function executed(actions: ActionResult[], action: string) {
  return actions.find(x=>x.action===action && x.executed && ["executed","already_done"].includes(x.outcome));
}

export function buildV3EmergencySafeReply(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  plan: ReplyPlan;
  actions: ActionResult[];
  recentTurns?: string[];
}) {
  const parts: string[] = [];
  const topics = new Set(input.turn.topics);
  const p = input.truth.policy;
  const officialLinks = buildOfficialLinkContext(input.turn, input.truth);
  const journeyStage = applicationJourneyStage(input.truth.application);
  const continuationNow = explicitContinuation(input.turn);
  const beforeContinuation = journeyStage === "preliminary_review" || (journeyStage === "preliminary_approved_waiting_decision" && !continuationNow);
  const contextualStatusConfirmation = input.turn.acts.some((act) => act.topic === "application_status" && act.value === "confirm_current_application_status");
  const delaySupport = buildDelaySupportProfile({ turn: input.turn, truth: input.truth, recentTurns: input.recentTurns });

  if (topics.has("manager_request") && !input.state.role.introduced) parts.push(`معك ${roleDisplayName("omran")}.`);
  else if (topics.has("human_request") && !input.state.role.introduced) parts.push(`معك ${roleDisplayName(input.state.role.currentRole)} من الأمين.`);

  const pendingConfirmation = input.actions.find(x => x.outcome === "needs_confirmation");
  if (pendingConfirmation) {
    const labels: Record<string,string> = {
      cancel_application: "إلغاء الطلب",
      continue_application: "الاستمرار بالطلب",
      request_refund: "طلب الاسترداد",
      stop_refund: "إيقاف الاسترداد",
      reopen_application: "إعادة فتح الطلب",
      change_device: "تغيير الجهاز وإعادة الحسبة",
      change_application_data: "تعديل بيانات الطلب",
    };
    parts.push(`بس أكدلي إنك بدك أنفذ ${labels[pendingConfirmation.action] || "هذا الإجراء"} على طلبك.`);
  }

  if (topics.has("payment_fee")) {
    if (beforeContinuation) {
      parts.push(journeyStage === "preliminary_approved_waiting_decision"
        ? "طلبك حاصل على موافقة مبدئية، لكن قبل أي تفاصيل للخطوة التالية بدي منك قرار واضح: هل تود الاستمرار بإجراءات فتح الملف وتحويل الطلب للدراسة النهائية؟"
        : "طلبك ما زال في المراجعة المبدئية، ولسه ما وصل لمرحلة الاستمرار. أول ما تصدر الموافقة المبدئية بنوضحلك الخطوة التالية.");
    } else parts.push(`رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير، وتكون ${p.fileOpeningFeeTiming}.`);
  }
  if (["payment_method","payment_timing","payment_recipient","payment_status"].some((topic) => topics.has(topic as any))) {
    if (beforeContinuation) {
      parts.push(journeyStage === "preliminary_approved_waiting_decision"
        ? "الموافقة المبدئية موجودة. قبل تفاصيل الخطوة التالية، هل تود الاستمرار بإجراءات فتح الملف وتحويل الطلب للدراسة النهائية؟"
        : "طلبك ما زال في المراجعة المبدئية. أول ما تصدر الموافقة المبدئية بنوضحلك الخطوة التالية كاملة.");
    } else if (topics.has("payment_status")) {
      if (hasAuthoritativePaymentConfirmation(input.truth.application)) parts.push("الخطوة المالية مؤكدة إداريًا على الملف.");
      else parts.push("حالة هذه الخطوة مرتبطة بما هو مسجل على الطلب وبمراجعة الإدارة.");
    } else {
      parts.push(p.paymentMethodRule);
    }
  }
  if (topics.has("continuation")) {
    const commercial = continuationCommercialState(input.truth.application);
    if (commercial === "payment_ready") {
      parts.push(`تمام، قرارك بالاستمرار واضح. وبعرف إن أي دفعة إضافية ممكن تخليك تسأل ليش مطلوبة، فبوضحلك إياها من البداية: رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير فقط. ${p.fileOpeningFeePurposeRule} ${p.fileOpeningFeeRefundRule} القرار إلك وحقك محفوظ، وما في ضغط عليك تكمل إذا غيرت رأيك. ${p.paymentMethodRule}`);
      if (officialLinks.relevant.receipt) parts.push(`بعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك: ${officialLinks.relevant.receipt}`);
      parts.push("تأكيد الدفع النهائي يتم يدويًا من الإدارة بعد مراجعة الوصل، والقسط الأول ليس مطلوبًا الآن.");
    } else if (commercial === "already_paid") {
      parts.push("قرار الاستمرار واضح، والدفع مؤكد إداريًا أصلًا؛ ما في داعي تدفع أو ترفع وصل جديد.");
    } else if (commercial === "payment_pending_admin") {
      parts.push("قرار الاستمرار واضح، ووصل الدفع مسجل وبانتظار اعتماد الإدارة؛ لا تعيد الدفع ولا ترفع وصلًا ثانيًا.");
    } else if (commercial === "no_application") {
      parts.push("وصل قرار الاستمرار، لكن لازم أربط الطلب الصحيح قبل ما أعطيك أي تعليمات دفع.");
    }
  }
  if (topics.has("payment_confirmation")) {
    if (beforeContinuation) {
      parts.push(journeyStage === "preliminary_approved_waiting_decision"
        ? "الموافقة المبدئية موجودة. هل تود الاستمرار بإجراءات فتح الملف وتحويل الطلب للدراسة النهائية؟"
        : "الطلب ما زال في المراجعة المبدئية، ولما تصدر الموافقة المبدئية بنوضحلك الخطوة التالية.");
    } else if (hasAuthoritativePaymentConfirmation(input.truth.application)) {
      parts.push("الدفع ظاهر مؤكد على الطلب، فلا تعيد الدفع.");
    } else {
      if (officialLinks.relevant.receipt) parts.push(`رسالتك وصلت، لكن تأكيد الدفع النهائي يتم من الإدارة بعد مراجعة الإثبات. ارفع الوصل من الرابط الرسمي المرتبط بطلبك: ${officialLinks.relevant.receipt}`);
      else parts.push("رسالتك وصلت، لكن تأكيد الدفع النهائي يتم من الإدارة بعد مراجعة الإثبات. ابعث رقم التتبع حتى أعطيك رابط رفع الوصل المرتبط بطلبك؛ رسالة واتساب لحالها ما بتأكد الدفع.");
    }
  }
  if (topics.has("first_installment")) parts.push(p.firstInstallmentRule);
  if (topics.has("office_location")) parts.push(`${p.generalLocation}، والحضور بموعد رسمي فقط.`);
  if (topics.has("delivery")) parts.push(p.pickupRule);
  if (topics.has("receipt_upload")) {
    if (beforeContinuation) {
      parts.push(journeyStage === "preliminary_approved_waiting_decision"
        ? "الموافقة المبدئية موجودة. هل تود الاستمرار بإجراءات فتح الملف وتحويل الطلب للدراسة النهائية؟"
        : "الطلب ما زال في المراجعة المبدئية، ولما تصدر الموافقة المبدئية بنوضحلك الخطوة التالية.");
    } else if (hasAuthoritativePaymentConfirmation(input.truth.application)) parts.push("الدفع مؤكد على الطلب، فما في داعي ترفع الوصل مرة ثانية.");
    else if (officialLinks.relevant.receipt) parts.push(`${p.secureDocumentsRule} رابط رفع الوصل الرسمي المرتبط بطلبك: ${officialLinks.relevant.receipt}`);
    else parts.push("حتى أعطيك رابط رفع الوصل الرسمي المرتبط بطلبك، ابعث رقم التتبع أو رقم الطلب أولًا.");
  }
  if (topics.has("requirements")) {
    const docs = input.truth.application?.documents;
    if (docs?.loaded) {
      const received: string[] = [];
      if (docs.identityComplete) received.push("الهوية");
      if (docs.salarySlipUploaded) received.push("كشف/شهادة الراتب");
      if (docs.guarantorDataComplete) received.push("بيانات الكفيل");
      if (docs.guarantorIdentityComplete) received.push("هوية الكفيل");
      if (received.length) parts.push(`الموجود على ملفك حاليًا: ${received.join("، ")}. ما رح أطلب منك تعيد مستند وصلنا.`);
      else parts.push(p.secureDocumentsRule);
      if (officialLinks.relevant.identity) parts.push(`رابط رفع الهوية المطلوب حاليًا: ${officialLinks.relevant.identity}`);
      if (officialLinks.relevant.salarySlip) parts.push(`رابط رفع كشف/شهادة الراتب المطلوب حاليًا: ${officialLinks.relevant.salarySlip}`);
      if (officialLinks.relevant.guarantor) parts.push(`رابط استكمال بيانات الكفيل المطلوب حاليًا: ${officialLinks.relevant.guarantor}`);
    } else parts.push(p.secureDocumentsRule);
  }
  if (topics.has("website") && officialLinks.relevant.website) parts.push(`موقع الأمين الرسمي: ${officialLinks.relevant.website}`);
  if (topics.has("tracking") && officialLinks.relevant.tracking) parts.push(`رابط التتبع الرسمي: ${officialLinks.relevant.tracking}`);
  if (topics.has("products") && officialLinks.relevant.products) parts.push(`الأجهزة المتاحة موجودة هنا: ${officialLinks.relevant.products}`);
  if (topics.has("review_timing") || topics.has("operational_pressure")) {
    const app = input.truth.application;
    const name = app ? firstCustomerName(app) : null;
    const prefix = name ? `${name}، ` : "";
    if (delaySupport.asksBeyondNormalWindow) {
      parts.push(`${prefix}${delaySupport.reassuranceCue} بعد مدة الـ2–3 أيام ما عندنا رقم إضافي ثابت وموثق أقدر أنسبه لكل الملفات؛ لو قلتلك يومين أو خمسة زيادة بكون بخمّن عليك. الضغط الحالي شديد وبعض الملفات بتتجاوز المعدل الطبيعي، لكن ما رح أعطيك رقم من عندي.`);
    } else if (delaySupport.repeatedDelayTurns >= 2) {
      parts.push(`${prefix}${delaySupport.reassuranceCue} طلبك ما زال مربوط عندي ومراجعته مستمرة. ما عندي موعد إضافي موثق أقدر أوعدك فيه، والضغط الحالي شديد؛ لذلك بدي أظل معك على المؤكد بدل أعيد نفس الجملة أو أعطيك رقم تخميني.`);
    } else {
      parts.push(`${prefix}${delaySupport.reassuranceCue} المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل، لكن الضغط حاليًا شديد جدًا وبعض الملفات تتجاوز هذا المعدل. ما بعطيك موعد غير موثق.`);
    }
  }

  for (const action of ["cancel_application","request_refund","stop_refund","reopen_application","continue_application","change_device","change_application_data"] as const) {
    const result = executed(input.actions,action);
    if (result?.authoritativeSummary) parts.push(result.authoritativeSummary);
  }

  if (topics.has("application_status")) {
    if (input.truth.application) {
      const app = input.truth.application;
      const name = firstCustomerName(app);
      const snapshot = customerOrderSnapshot(app).filter((line) => !line.startsWith("الاسم:") && !line.startsWith("حالة الطلب:"));
      const intro = name ? `${name}، تأكدت من طلبك.` : "تأكدت من الطلب.";
      const details = snapshot.length ? ` ${snapshot.join("، ")}.` : "";

      if (contextualStatusConfirmation) {
        parts.push(`نعم، متأكد. حالة طلبك الآن: ${customerFacingStatusLabel(app)}.`);
      } else if (journeyStage === "preliminary_review") {
        parts.push(`${intro}${details} حالة الطلب: ${customerFacingStatusLabel(app)}. الطلب ما زال في المراجعة المبدئية.`);
        if (!contextualStatusConfirmation && officialLinks.relevant.tracking) parts.push(`رابط التتبع الرسمي: ${officialLinks.relevant.tracking}`);
      } else if (journeyStage === "preliminary_approved_waiting_decision") {
        parts.push(`${intro}${details} حالة الطلب: موافقة مبدئية. هذا يعني إن الطلب اجتاز المراجعة الأولية وأصبح مؤهلًا للانتقال للدراسة النهائية، لكنها ليست الموافقة النهائية.`);
        if (!contextualStatusConfirmation && officialLinks.relevant.tracking) parts.push(`رابط التتبع الرسمي: ${officialLinks.relevant.tracking}`);
        if (shouldAskContinuationDecision(app, input.turn)) parts.push("هل تود الاستمرار بإجراءات فتح الملف وتحويل الطلب للدراسة النهائية؟");
      } else if (journeyStage === "payment_proof_pending_admin") {
        parts.push(`${intro}${details} حالة الطلب: إثبات الدفع بانتظار مراجعة الإدارة. ما في داعي تعيد رفع الوصل.`);
      } else if (journeyStage === "payment_confirmed_under_review") {
        parts.push(`${intro}${details} حالة الطلب: قيد الدراسة النهائية، والدفع مؤكد إداريًا على الملف.`);
      } else {
        parts.push(`${intro}${details} حالة الطلب: ${customerFacingStatusLabel(app)}.`);
      }
    }
    else if (input.truth.ambiguousApplications.length) parts.push("عندي أكثر من طلب مرتبط بالمحادثة، وبدي أحدد أي طلب تقصد قبل ما أعطيك حالة تخص طلب بعينه.");
    else parts.push("ما عندي الآن حقيقة كافية أربط فيها حالة طلب محدد بدون ما أخمّن.");
  }

  const paymentRefundIntegrityConflict = hasPaymentRefundIntegrityConflict(input.truth.application);

  if (topics.has("refund") && !executed(input.actions,"request_refund") && !executed(input.actions,"stop_refund")) {
    if (!input.truth.application) parts.push("حتى أعطيك وضع الاسترداد الخاص بطلبك لازم أربط الطلب الصحيح أولًا.");
    else if (paymentRefundIntegrityConflict) parts.push("في تعارض مسجل بين حالة الاسترداد وتأكيد الدفع، لذلك ما رح أفترض حالة مالية غير مثبتة؛ الإدارة لازم تحسم تأكيد الدفع أولًا قبل أي تغيير جديد على الاسترداد.");
    else if (!hasAuthoritativePaymentConfirmation(input.truth.application)) parts.push("الاسترداد ما بنفتحه بدون دفع مؤكد على الطلب.");
  }

  if (topics.has("complaint") || topics.has("legal") || topics.has("social_threat")) {
    if (paymentRefundIntegrityConflict) {
      parts.push("في تعارض مسجل بين حالة الاسترداد وتأكيد الدفع، لذلك ما رح أنفذ تغيير مالي جديد قبل ما تحسم الإدارة تأكيد الدفع على الملف. حقك وحالة الطلب يظلوا محفوظين كما هم لحد ما تنحل المعلومة المتعارضة.");
    } else {
      const paid = hasAuthoritativePaymentConfirmation(input.truth.application);
      parts.push(paid
        ? "إذا ما بدك تكمل، الإلغاء متاح وحق الاسترداد على الدفع المؤكد محفوظ؛ ما بعطيك موعد غير موثق."
        : "إذا ما بدك تكمل، الإلغاء متاح. وإذا في دفع فعلي لازم يتأكد رسميًا على الملف قبل فتح الاسترداد.");
    }
    if (topics.has("social_threat")) parts.push("اعتراضك حقك، لكن نشر معلومات غير صحيحة أو التشهير المتعمد له تبعاته القانونية.");
  }

  if ((topics.has("complaint") || topics.has("legal") || topics.has("social_threat")) && !input.turn.acts.some(x => x.type === "provide_fact" || x.type === "provide_reason")) parts.push("احكيلي شو صار مع طلبك تحديدًا وبراجع نفس النقطة معك.");

  if (!parts.length) parts.push("وصلتني رسالتك، وبكمل معك على نفس الموضوع بدون ما أخمّن معلومة غير مؤكدة.");
  return parts.join(" ");
}
