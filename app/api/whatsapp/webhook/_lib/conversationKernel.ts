import type { ApplicationRecord, CustomerIntent } from "./types";

export type ConversationKernelGoal =
  | "none"
  | "unsupported_media"
  | "payment_alias_confirmation"
  | "payment_timing"
  | "total_payable"
  | "post_approval_installment_payment"
  | "application_change_installment_duration"
  | "application_change_general"
  | "reopen_cancelled"
  | "refund_status"
  | "business_independence"
  | "business_verification"
  | "business_website";

export type ConversationKernelMemory = {
  conversationContext?: string | null;
  lastAssistantReplies?: string[];
  lastCustomerMessages?: string[];
  isPaymentAssistanceActive?: boolean;
};

export type ConversationTurnContract = {
  version: "1.7.0";
  primaryGoal: ConversationKernelGoal;
  goals: ConversationKernelGoal[];
  mustAnswer: string[];
  intentOverride: CustomerIntent | null;
  immediateReply: string | null;
  actionRequestType: string | null;
  requestedChange: string | null;
  confidence: number;
  reason: string;
};

type AnalyzeConversationTurnInput = {
  customerText: string;
  messageType?: string | null;
  currentIntent: CustomerIntent;
  application?: ApplicationRecord | null;
  memory?: ConversationKernelMemory | null;
};

type FinalReplyGuardInput = AnalyzeConversationTurnInput & {
  reply: string;
};

function normalize(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, values: string[]) {
  const t = normalize(text);
  return values.some((value) => t.includes(normalize(value)));
}

function hasAll(text: string, groups: string[][]) {
  return groups.every((group) => hasAny(text, group));
}

function recentText(memory?: ConversationKernelMemory | null) {
  return [
    ...(memory?.lastCustomerMessages || []),
    ...(memory?.lastAssistantReplies || []),
    memory?.conversationContext || "",
  ].join("\n");
}

function trackingLine(app?: ApplicationRecord | null) {
  const tracking = app?.tracking_id || app?.id;
  return tracking ? `\nرقم الطلب: ${tracking}` : "";
}

function isCancelled(app?: ApplicationRecord | null) {
  return app?.status === "cancelled";
}

function isRefundActive(app?: ApplicationRecord | null) {
  return app?.status === "refund_requested" || app?.payment_status === "refund_requested";
}

function isRefundCompleted(app?: ApplicationRecord | null) {
  return app?.status === "refund_completed";
}

function isSyntheticUnsupportedMessage(text: string, messageType?: string | null) {
  const t = normalize(text);
  return messageType === "unsupported" ||
    t.includes(normalize("تم استلام رسالة واتساب من نوع unsupported")) ||
    /^تم استلام رساله واتساب من نوع [a-z0-9_-]+\.?$/i.test(t);
}

function isPaymentAliasConfirmation(text: string) {
  const t = normalize(text);
  const alias = /\b(?:ameeenpay|amenpay)\b/i.test(String(text || ""));
  const transfer = hasAny(t, ["احول", "أحول", "تحويل", "حول", "ادفع", "أدفع", "دفع"]);
  const confirm = hasAny(t, ["تمام", "صح", "هيك", "هاد", "هذا", "لهاد", "لهذا", "؟", "?"]);
  return alias && transfer && confirm;
}

function isTotalPayableQuestion(text: string) {
  const t = normalize(text);
  const total = hasAny(t, ["اجمالي", "إجمالي", "التوتل", "total", "المجموع", "كامل المبلغ", "كم راح ادفع", "كم رح ادفع"]);
  const end = hasAny(t, ["في النهايه", "في النهاية", "حتى اخر قسط", "حتى آخر قسط", "لآخر قسط", "لاخر قسط", "بالنهايه", "بالنهاية", "كل الاقساط", "كل الأقساط"]);
  return total && end;
}

function isPostApprovalInstallmentPaymentQuestion(text: string) {
  const t = normalize(text);
  const afterApproval = hasAny(t, ["بعد الموافقه", "بعد الموافقة", "بعد القبول", "بعد الاعتماد", "بعدين"]);
  const installmentPayment = hasAny(t, ["القسط", "الاقساط", "الأقساط", "الدفعات", "دفع القسط", "كيف الدفعات", "اي فواتير", "أي فواتير", "e-fawateer", "efawateer"]);
  return afterApproval && installmentPayment;
}

function isInstallmentDurationChange(text: string) {
  const t = normalize(text);
  const change = hasAny(t, ["تعديل", "اعدل", "أعدل", "غير", "غيّر", "بدال", "بدل", "تغيير"]);
  const duration = hasAny(t, ["عدد الدفعات", "عدد الاقساط", "عدد الأقساط", "شهر", "24", "36", "مده التقسيط", "مدة التقسيط"]);
  return change && duration;
}

function isGeneralApplicationChange(text: string) {
  const t = normalize(text);
  if (isInstallmentDurationChange(text)) return false;
  const change = hasAny(t, ["اريد تعديل", "أريد تعديل", "بدي اعدل", "بدي أعدل", "تعديل المعلومات", "تعديل بيانات", "اعدل معلومات", "أعدل معلومات", "تغيير المعلومات", "تغيير البيانات", "تغيير", "غير", "غيّر", "يمكنني تغيير"]);
  const applicationContext = hasAny(t, ["المعلومات", "البيانات", "الهاتف", "رقم الهاتف", "رقمي", "الطلب", "المعامله", "المعاملة"]);
  return change && applicationContext;
}

function isContinueAfterCancellation(text: string, app?: ApplicationRecord | null) {
  if (!isCancelled(app)) return false;
  const t = normalize(text);
  const continueText = hasAny(t, [
    "اود الاستمرار", "أود الاستمرار", "اريد الاستمرار", "أريد الاستمرار", "بدي اكمل", "بدي أكمل",
    "ما تلغو طلبي", "لا تلغو طلبي", "ما بدي الغي", "ما بدي ألغي", "كملو الطلب", "كملوا الطلب",
  ]);
  return continueText;
}

function isRefundStatusQuestion(text: string, app?: ApplicationRecord | null) {
  if (!isRefundActive(app) && !isRefundCompleted(app)) return false;
  const t = normalize(text);
  const mentionsRefund = hasAny(t, ["استرداد", "استرجاع", "ترجع لي الخمسه", "ترجع لي الخمسة", "رجعولي", "الخمس دنانير"]);
  const statusFollowup = hasAny(t, ["شو صار", "وين", "متى", "متابعه", "متابعة", "اخر تحديث", "آخر تحديث", "الحاله الحاليه", "الحالة الحالية"]);
  const standardState = hasAny(t, ["طلب الاسترداد مسجل", "الاسترداد مسجل"]);
  return standardState || (mentionsRefund && statusFollowup);
}

function isBusinessIndependenceConcern(text: string) {
  const t = normalize(text);
  return hasAny(t, [
    "شركه الامين مختلفه", "شركة الامين مختلفة", "الشركه الاصليه", "الشركة الأصلية", "الشركة الاصلية",
    "الامين للتمويل الاصغر", "الأمين للتمويل الأصغر", "مالكم علاقه", "ما الكم علاقه", "جهة مختلفة",
  ]);
}

function isBusinessWebsiteRequest(text: string) {
  const t = normalize(text);
  const site = hasAny(t, ["موقع الشركه", "موقع الشركة", "الموقع الرسمي", "ويب سايت", "website"]);
  const asks = hasAny(t, ["اعطيني", "أعطيني", "وين", "شو", "ارسل", "أرسل", "بدي"]);
  return site && asks;
}

function isBusinessVerificationQuestion(text: string) {
  const t = normalize(text);
  return hasAny(t, [
    "جهه معتمده", "جهة معتمدة", "جهه رسميه", "جهة رسمية", "انتو معتمدين", "هل انتم معتمدين",
    "اثبات انك جهه رسميه", "إثبات انك جهة رسمية", "اثبات رسمي", "إثبات رسمي",
  ]);
}

function hasRecentPaymentContext(memory?: ConversationKernelMemory | null) {
  if (memory?.isPaymentAssistanceActive) return true;
  return hasAny(recentText(memory), [
    "AMEEENPAY", "AMENPAY", "رسوم فتح الملف", "التحويل إلى", "التحويل الى", "ارفع الوصل", "رفع الوصل",
  ]);
}

function isShortPaymentTimingFollowup(text: string, memory?: ConversationKernelMemory | null) {
  if (!hasRecentPaymentContext(memory)) return false;
  const t = normalize(text);
  const time = hasAny(t, ["كم معي", "قديش معي", "لحد متى", "اخر وقت", "آخر وقت", "متى لازم احول", "متى لازم أحول", "من هون لاحول", "من هون لأحول"]);
  const transfer = hasAny(t, ["احول", "أحول", "تحويل", "دفع", "ادفع", "أدفع"]);
  return time && transfer;
}

function refundStatusReply(app: ApplicationRecord) {
  const tracking = trackingLine(app);
  if (isRefundCompleted(app)) {
    return `الاسترداد ظاهر كمكتمل على الطلب.${tracking}`;
  }
  return `طلب الاسترداد مسجل على الطلب وقيد المتابعة. ما عندي موعد تنفيذ مؤكد ظاهر حاليًا، وأول ما تتغير الحالة بنبلغك رسميًا.${tracking}`;
}

function businessIndependenceReply() {
  return "الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق. نشاطنا تقسيط الأجهزة الإلكترونية والهواتف، ولسنا بنكًا ولا شركة تمويل أو إقراض.";
}

function businessVerificationReply() {
  return "إذا قصدك بكلمة «معتمدة/رسمية» ترخيصًا تمويليًا: ما بنوصف الأمين للأقساط كبنك أو شركة تمويل أو إقراض، وما بندّعي إنها مرخصة أو خاضعة لرقابة البنك المركزي. القنوات الرسمية للأمين هي الموقع وواتساب الشركة، وتقدر تتحقق منها قبل أي خطوة.";
}

function businessWebsiteReply() {
  return "الموقع الرسمي للأمين للأقساط هو:\nhttps://www.ameenfinance.co/";
}

function totalPayableReply(app?: ApplicationRecord | null) {
  return `الإجمالي النهائي حتى آخر قسط مش ظاهر عندي كرقم معتمد ضمن بيانات الطلب الحالية، لذلك ما رح أخمنه. رسوم فتح الملف 5 دنانير منفصلة عن ثمن الجهاز وعن الأقساط. إجمالي ثمن الجهاز وجدول الأقساط النهائي يكون حسب الاتفاق المعتمد على الطلب.${trackingLine(app)}`;
}

function postApprovalInstallmentPaymentReply(app?: ApplicationRecord | null) {
  return `إذا قصدك طريقة دفع الأقساط بعد الموافقة: هاي منفصلة عن رسوم فتح الملف. وسيلة تحصيل الأقساط النهائية مش ظاهرة عندي كطريقة معتمدة على الطلب الحالي، لذلك ما رح أعطيك اسم خدمة أو رقم دفع من عندي. بتكون حسب العقد/الجدول المعتمد عند إكمال الموافقة والاستلام.${trackingLine(app)}`;
}

function paymentStateBlocksNewPayment(app?: ApplicationRecord | null) {
  if (!app) return null;
  if (app.payment_status === "confirmed") {
    return `رسوم فتح الملف مؤكدة على طلبك، فلا تحول أي مبلغ جديد.${trackingLine(app)}`;
  }
  if (app.payment_status === "customer_claimed_paid") {
    return `وصل الدفع مسجل وبانتظار التأكيد، فلا تعيد التحويل أو الدفع مرة ثانية.${trackingLine(app)}`;
  }
  if (app.status === "cancelled" || app.status === "refund_requested" || app.payment_status === "refund_requested" || app.status === "refund_completed") {
    return `طلبك مش بمرحلة دفع جديدة حاليًا، فلا تحول أي مبلغ جديد.${trackingLine(app)}`;
  }
  return null;
}

function paymentAliasConfirmationReply(app?: ApplicationRecord | null) {
  const blocked = paymentStateBlocksNewPayment(app);
  if (blocked) return blocked;
  return `نعم، AMENPAY هو أحد اسمي CliQ المعتمدين لرسوم فتح الملف، والاسم الآخر AMEEENPAY. قبل تأكيد التحويل تأكد أن اسم المستفيد الظاهر هو ABDUL RAHMAN ALHARAHSHEH. بعد التحويل ارفع الوصل فقط من الرابط الرسمي المرتبط بطلبك.${trackingLine(app)}`;
}

function paymentTimingReply(app?: ApplicationRecord | null) {
  const blocked = paymentStateBlocksNewPayment(app);
  if (blocked) return blocked;
  return `ما عندي مهلة زمنية أو آخر موعد دفع معتمد ظاهر على طلبك، لذلك ما رح أحدد لك وقت من عندي. إذا كانت تعليمات رسوم فتح الملف وصلت لك رسميًا، استخدم نفس بيانات الدفع والرابط الرسمي المرتبط بطلبك، ولا تعيد الدفع إذا كنت حولت بالفعل.${trackingLine(app)}`;
}

function unsupportedMediaReply() {
  return "وصلتني رسالة من نوع غير مدعوم وما عندي محتواها الفعلي حتى أجاوبك عليه بدون تخمين. اكتب سؤالك أو محتوى الرسالة نصيًا هون وبجاوبك مباشرة.";
}

function emptyContract(): ConversationTurnContract {
  return {
    version: "1.7.0",
    primaryGoal: "none",
    goals: [],
    mustAnswer: [],
    intentOverride: null,
    immediateReply: null,
    actionRequestType: null,
    requestedChange: null,
    confidence: 0,
    reason: "no_kernel_override",
  };
}

function contract(input: Partial<ConversationTurnContract> & Pick<ConversationTurnContract, "primaryGoal">): ConversationTurnContract {
  return {
    ...emptyContract(),
    goals: [input.primaryGoal],
    confidence: 0.98,
    ...input,
    version: "1.7.0",
  };
}

export function analyzeConversationTurn(input: AnalyzeConversationTurnInput): ConversationTurnContract {
  const text = String(input.customerText || "").trim();
  const app = input.application || null;

  if (isSyntheticUnsupportedMessage(text, input.messageType)) {
    return contract({
      primaryGoal: "unsupported_media",
      mustAnswer: ["acknowledge_unsupported_without_inventing_content"],
      intentOverride: "unknown",
      immediateReply: unsupportedMediaReply(),
      reason: "synthetic_unsupported_message_must_not_generate_operational_story",
    });
  }

  if (isBusinessWebsiteRequest(text)) {
    return contract({
      primaryGoal: "business_website",
      mustAnswer: ["official_website"],
      intentOverride: "website",
      immediateReply: businessWebsiteReply(),
      reason: "explicit_official_website_request",
    });
  }

  if (isBusinessIndependenceConcern(text)) {
    return contract({
      primaryGoal: "business_independence",
      mustAnswer: ["independence_from_microfinance_company", "non_bank_non_lender"],
      intentOverride: "trust_verification",
      immediateReply: businessIndependenceReply(),
      reason: "explicit_entity_identity_or_independence_concern",
    });
  }

  if (isBusinessVerificationQuestion(text)) {
    return contract({
      primaryGoal: "business_verification",
      mustAnswer: ["no_unsupported_regulatory_claim", "verification_channels"],
      intentOverride: "trust_verification",
      immediateReply: businessVerificationReply(),
      reason: "explicit_official_or_accredited_claim_question",
    });
  }

  if (isInstallmentDurationChange(text)) {
    return contract({
      primaryGoal: "application_change_installment_duration",
      mustAnswer: ["acknowledge_requested_plan_change", "no_unverified_mutation"],
      intentOverride: "application_data_correction",
      immediateReply: app ? null : "حتى أربط تعديل مدة التقسيط بالطلب الصحيح، ابعث رقم التتبع الذي يبدأ بـ AM- أو رقم الهاتف المستخدم بالتقديم.",
      actionRequestType: app ? "installment_plan_change_review" : null,
      requestedChange: text,
      reason: "installment_duration_change_requires_review_not_salary_flow",
    });
  }

  if (isGeneralApplicationChange(text)) {
    return contract({
      primaryGoal: "application_change_general",
      mustAnswer: ["acknowledge_requested_application_change", "no_unverified_mutation"],
      intentOverride: "application_data_correction",
      immediateReply: app ? null : "حتى أربط تعديل بيانات الطلب بالملف الصحيح، ابعث رقم التتبع الذي يبدأ بـ AM- أو رقم الهاتف المستخدم بالتقديم.",
      actionRequestType: app ? "application_data_change_review" : null,
      requestedChange: text,
      reason: "general_application_change_must_not_fall_into_generic_or_salary_only_flow",
    });
  }

  if (isContinueAfterCancellation(text, app)) {
    return contract({
      primaryGoal: "reopen_cancelled",
      mustAnswer: ["cancelled_state", "reopen_confirmation_path"],
      intentOverride: "reopen_cancelled_request",
      immediateReply: null,
      reason: "continue_intent_on_cancelled_application_must_route_to_reopen_flow",
    });
  }

  if (app && isRefundStatusQuestion(text, app)) {
    return contract({
      primaryGoal: "refund_status",
      mustAnswer: ["durable_refund_state", "no_refund_policy_reset"],
      intentOverride: "order_status",
      immediateReply: refundStatusReply(app),
      reason: "durable_refund_state_outranks_fee_inquiry_wording",
    });
  }

  if (isPaymentAliasConfirmation(text)) {
    return contract({
      primaryGoal: "payment_alias_confirmation",
      mustAnswer: ["confirm_or_reject_named_alias", "beneficiary_check"],
      intentOverride: "payment_recipient",
      immediateReply: paymentAliasConfirmationReply(app),
      reason: "named_payment_alias_confirmation_is_not_greeting",
    });
  }

  if (isTotalPayableQuestion(text)) {
    return contract({
      primaryGoal: "total_payable",
      mustAnswer: ["final_total", "separate_file_opening_fee", "no_invented_total"],
      intentOverride: "installment_info",
      immediateReply: totalPayableReply(app),
      reason: "explicit_total_until_last_installment_question",
    });
  }

  if (isPostApprovalInstallmentPaymentQuestion(text)) {
    return contract({
      primaryGoal: "post_approval_installment_payment",
      mustAnswer: ["post_approval_installment_payment_method", "separate_from_file_opening_fee"],
      intentOverride: "installment_info",
      immediateReply: postApprovalInstallmentPaymentReply(app),
      reason: "post_approval_installment_payment_must_not_route_to_file_opening_fee_payment",
    });
  }

  if (isShortPaymentTimingFollowup(text, input.memory)) {
    return contract({
      primaryGoal: "payment_timing",
      mustAnswer: ["payment_timing_without_invented_deadline"],
      intentOverride: "payment_timing",
      immediateReply: paymentTimingReply(app),
      reason: "short_payment_timing_followup_uses_recent_payment_context",
    });
  }

  return emptyContract();
}

export function resolveConversationKernelIntent(input: AnalyzeConversationTurnInput): CustomerIntent {
  return analyzeConversationTurn(input).intentOverride || input.currentIntent;
}

export function buildConversationKernelActionReply(
  turn: ConversationTurnContract,
  app: ApplicationRecord,
  recorded: { ok: boolean; duplicate: boolean },
) {
  const tracking = app.tracking_id || app.id;
  const recordedLine = recorded.ok
    ? (recorded.duplicate ? "طلب التعديل موجود بالفعل للمراجعة، وما رح نسجله مرة ثانية." : "تم تسجيل طلب التعديل للمراجعة، ولسا ما تم تأكيد التغيير على الملف.")
    : "وصل طلب التعديل، لكن ما تم تأكيد تسجيله بالنظام لحد الآن، لذلك ما رح أدّعي إن البيانات تغيرت.";

  if (turn.primaryGoal === "application_change_installment_duration") {
    return `وصل طلبك بتعديل مدة/عدد أقساط الطلب. ${recordedLine}\nما رح نغيّر الخطة تلقائيًا من واتساب قبل مراجعتها واعتمادها.\nرقم الطلب: ${tracking}`;
  }

  return `وصل طلبك بتعديل بيانات الطلب. ${recordedLine}\nما رح نغيّر أي بيانات حساسة تلقائيًا من واتساب قبل مراجعتها.\nرقم الطلب: ${tracking}`;
}

function looksLikeGenericFallback(reply: string) {
  const r = normalize(reply);
  return hasAny(r, [
    "احكيلي شو النقطه اللي مقلقتك", "احكيلي شو النقطة اللي مقلقتك", "اكتب سؤالك نفسه بجمله واحده", "اكتب سؤالك نفسه بجملة واحدة",
  ]);
}

function hasUnsupportedOfficialClaim(reply: string) {
  const r = normalize(reply);
  return hasAny(r, [
    "جهه اردنيه معتمده", "جهة أردنية معتمدة", "جهه رسميه", "جهة رسمية", "شركه رسميه", "شركة رسمية",
  ]);
}

function endsWithBareConnector(reply: string) {
  const clean = normalize(reply).replace(/[؟?!.،,;؛:]+$/g, "").trim();
  return /(?:^|\s)(?:ان|انه|انو|او|و|لكن|لان|لانه)$/.test(clean);
}

export function applyConversationKernelReplyGuard(input: FinalReplyGuardInput): string {
  const reply = String(input.reply || "").trim();
  const turn = analyzeConversationTurn(input);
  const r = normalize(reply);

  if (turn.immediateReply && turn.primaryGoal !== "none") {
    return turn.immediateReply;
  }

  if (turn.primaryGoal === "reopen_cancelled") {
    const contradiction = r.includes(normalize("طلبك مستمر")) && r.includes(normalize("الطلب ملغي"));
    if (contradiction || looksLikeGenericFallback(reply)) {
      const tracking = trackingLine(input.application);
      return `طلبك ظاهر ملغي حاليًا، لذلك ما بصح أوصفه بأنه مستمر. إذا بدك ترجع تكمل على نفس الطلب، اكتب: أكد إعادة تفعيل الطلب.${tracking}`;
    }
  }

  if (turn.primaryGoal === "application_change_installment_duration" || turn.primaryGoal === "application_change_general") {
    if (looksLikeGenericFallback(reply) || hasAny(r, ["رسوم فتح الملف مؤكده", "رسوم فتح الملف مؤكدة"])) {
      const tracking = trackingLine(input.application);
      return turn.primaryGoal === "application_change_installment_duration"
        ? `فهمت إنك بدك تعدل مدة/عدد أقساط الطلب. التعديل يحتاج مراجعة واعتماد، وما رح أعتبره منفذ تلقائيًا من واتساب.${tracking}`
        : `فهمت إنك بدك تعدل بيانات الطلب. التعديل يحتاج مراجعة واعتماد، وما رح أعتبر البيانات تغيرت تلقائيًا من واتساب.${tracking}`;
    }
  }

  if (isRefundActive(input.application) && hasAny(r, ["استفسار وليس طلب استرداد", "ليس طلب استرداد"])) {
    return refundStatusReply(input.application!);
  }

  if (hasUnsupportedOfficialClaim(reply)) {
    return businessVerificationReply();
  }

  if (endsWithBareConnector(reply)) {
    if (input.application) {
      return `طلبك ظاهر عندي وحالته الحالية موجودة على الملف، لكن الرد السابق انقطع قبل اكتماله. ما رح أعطيك نتيجة ناقصة؛ ابعث نفس السؤال مرة ثانية وبجاوبك عليه مباشرة.${trackingLine(input.application)}`;
    }
    return "الرد السابق انقطع قبل اكتماله. ابعث نفس السؤال مرة ثانية وبجاوبك عليه مباشرة بدون تخمين.";
  }

  return reply;
}
