import { roleDisplayName } from "./hierarchy";
import type { ActionResult, ConversationState, InterpretedTurn, ReplyPlan, TruthBundle } from "./types";
import { hasAuthoritativePaymentConfirmation, hasPaymentRefundIntegrityConflict } from "./paymentTruth";

function executed(actions: ActionResult[], action: string) {
  return actions.find(x=>x.action===action && x.executed && ["executed","already_done"].includes(x.outcome));
}

export function buildV3EmergencySafeReply(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  plan: ReplyPlan;
  actions: ActionResult[];
}) {
  const parts: string[] = [];
  const topics = new Set(input.turn.topics);
  const p = input.truth.policy;

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

  if (topics.has("payment_fee")) parts.push(`رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير، وتكون ${p.fileOpeningFeeTiming}.`);
  if (topics.has("payment_confirmation")) {
    if (hasAuthoritativePaymentConfirmation(input.truth.application)) {
      parts.push("الدفع ظاهر مؤكد على الطلب، فلا تعيد الدفع.");
    } else {
      parts.push("رسالتك وصلت، لكن تأكيد الدفع النهائي يتم من الإدارة بعد مراجعة الإثبات المرفوع من الرابط الرسمي؛ ما بعتبر الدفع مؤكد من رسالة واتساب لحالها.");
    }
  }
  if (topics.has("first_installment")) parts.push(p.firstInstallmentRule);
  if (topics.has("office_location")) parts.push(`${p.generalLocation}، والحضور بموعد رسمي فقط.`);
  if (topics.has("delivery")) parts.push(p.pickupRule);
  if (topics.has("receipt_upload") || topics.has("requirements")) parts.push(p.secureDocumentsRule);
  if (topics.has("review_timing") || topics.has("operational_pressure")) parts.push(`المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل، لكن الضغط حاليًا شديد جدًا وبعض الملفات تتجاوز هذا المعدل؛ ما بعطيك موعد غير مؤكد.`);

  for (const action of ["cancel_application","request_refund","stop_refund","reopen_application","continue_application","change_device","change_application_data"] as const) {
    const result = executed(input.actions,action);
    if (result?.authoritativeSummary) parts.push(result.authoritativeSummary);
  }

  if (topics.has("application_status")) {
    if (input.truth.application) parts.push(`حالة الطلب المسجلة حاليًا: ${input.truth.application.status || "غير محددة"}.`);
    else if (input.truth.ambiguousApplications.length) parts.push("عندي أكثر من طلب مرتبط بالمحادثة، وبدي أحدد أي طلب تقصد قبل ما أعطيك حالة تخص طلب بعينه.");
    else parts.push("ما عندي حاليًا حقيقة كافية أربط فيها حالة طلب محدد بدون ما أخمّن.");
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
