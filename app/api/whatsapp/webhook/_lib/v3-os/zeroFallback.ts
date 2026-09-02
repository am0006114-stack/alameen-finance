import { applicationJourneyStage, canDiscloseFileOpeningPayment, customerFacingStatusLabel, firstCustomerName, shouldAskContinuationDecision } from "./applicationJourney";
import { continuationCommercialState } from "./commercialProgression";
import { buildDelaySupportProfile } from "./delaySupport";
import { buildOfficialLinkContext, detectReplyLinkViolations } from "./linkIntegrity";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
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
  if (!planned) return null;
  const result = actions.find((x) => x.action === planned.action);
  const label = ACTION_LABELS[planned.action] || "الإجراء المطلوب";
  if (result?.executed && ["executed","already_done"].includes(result.outcome) && result.authoritativeSummary) return result.authoritativeSummary;
  if (result?.outcome === "needs_confirmation") return `طلبك واضح: ${label}. قبل ما يتغير أي شيء على الطلب، أكدلي إنك بدك هذا الإجراء بالضبط.`;
  return `طلبك واضح عندي: ${label}. ما رح أعتبره منجز ولا أقول لك تم قبل ما تتحدث حالة الطلب فعليًا.`;
}

function shortStatus(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return null;
  const name = firstCustomerName(app);
  const who = name ? `${name}، ` : "";
  const bits = [
    app.trackingId ? `رقم طلبك ${app.trackingId}` : null,
    app.deviceName ? `الجهاز ${app.deviceName}` : null,
    `الحالة الآن: ${customerFacingStatusLabel(app)}`,
  ].filter(Boolean);
  return `${who}${bits.join("، ")}.`;
}

function pick<T>(values: T[], seed: string): T {
  let hash = 0;
  for (const ch of String(seed || "")) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  return values[hash % values.length];
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

  const action = actionSentence(input.plan, input.actions);
  if (action) parts.push(action);

  if (topics.has("application_status") || topics.has("tracking")) {
    const status = shortStatus(input.truth);
    if (status) parts.push(status);
    else if (input.truth.ambiguousApplications.length) parts.push("عندي أكثر من طلب مرتبط بالمحادثة. ابعث رقم التتبع للطلب اللي بدك أراجعه حتى ما أعطيك معلومات عن طلب ثاني.");
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
      if (stage === "preliminary_approved_waiting_decision") parts.push("الطلب حاصل على موافقة مبدئية. قبل أي تفاصيل دفع، بدي قرارك أولًا: هل تود الاستمرار بإجراءات فتح الملف وتحويل الطلب للدراسة النهائية؟");
      else parts.push("الطلب لسه ما وصل لمرحلة رسوم فتح الملف، لذلك ما رح أفتح موضوع الدفع قبل وقته.");
    } else if (hasAuthoritativePaymentConfirmation(app)) {
      parts.push("الدفع مؤكد إداريًا على الطلب، وما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية.");
    } else if (topics.has("receipt_upload") || topics.has("payment_confirmation")) {
      if (links.relevant.receipt) parts.push(`تأكيد الدفع يتم يدويًا من الإدارة بعد مراجعة الوصل. رابط رفع الوصل الرسمي المرتبط بطلبك: ${links.relevant.receipt}`);
      else parts.push("تأكيد الدفع يتم يدويًا من الإدارة. ابعث رقم التتبع حتى أعطيك رابط رفع الوصل المرتبط بنفس الطلب.");
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
      if (present.length) parts.push(`الموجود على ملفك حاليًا: ${present.join("، ")}. ما رح أطلب منك تعيد مستند وصلنا.`);
      else parts.push(p.secureDocumentsRule);
    } else parts.push(p.secureDocumentsRule);
  }

  if (topics.has("office_location")) parts.push(`${p.generalLocation}، والحضور للمكتب بموعد رسمي فقط.`);
  if (topics.has("delivery")) parts.push(p.pickupRule);
  if (topics.has("first_installment")) parts.push(p.firstInstallmentRule);

  if (!parts.length) {
    const status = shortStatus(input.truth);
    if (status) parts.push(status, pick([
      "احكيلي النقطة اللي بدك إياها على نفس الطلب وبجاوبك على المسجل عندي.",
      "شو النقطة اللي بدك أوضحها على الطلب؟",
      "أنا معك على نفس الطلب؛ احكيلي شو بدك أعرفك عليه بالضبط.",
    ], input.turn.turnId));
    else parts.push(pick([
      "أنا معك. احكيلي سؤالك أو ابعث رقم التتبع إذا الموضوع عن طلب سابق.",
      "تفضل، احكيلي شو بدك تعرف، وإذا الموضوع عن طلب ابعث رقم التتبع.",
      "احكيلي النقطة اللي بدك إياها، وإذا عندك طلب ابعث رقم التتبع حتى أربطه صح.",
    ], input.turn.turnId));
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
