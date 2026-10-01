import { executeActions } from "./actionPlane";
import { buildReplyPlan } from "./planner";
import { resolveV3ProductionTruth } from "./productionTruth";
import { emptyState, reduceState, finalizeStateSemanticMemory, markRoleIntroducedFromReply } from "./state";
import { loadV3ConversationState } from "./stateStore";
import { enforcePaymentReceiptSemantics, interpretTurn, isPaymentRelativeToReceiptText, syntheticMediaNoticeKind, syntheticMediaSemanticText } from "./interpreter";
import { v3WriterProviderFromEnv, type V3TextProvider } from "./provider";
import { v3TransactionalActionAdapter } from "./transactionalActionAdapter";
import { applicationReceiptUrl, applicationRefundUrl, buildOfficialLinkContext, sanitizeRecentTurnsForModel } from "./linkIntegrity";
import { scopeStateToCurrentApplication, scopeTurnToCurrentApplication, stampActionScope } from "./applicationScopeLock";
import { enforceMutationConfirmationGate } from "./mutationConfirmationGate";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildInformedCommercialDisclosureReply, buildPostDisclosurePaymentReply, commercialDisclosureDelivered, informedCommercialContinuationConfirmed, markCommercialDisclosureAcknowledged, markCommercialDisclosureDelivered, resemblesFullCommercialDisclosure, resemblesPostDisclosurePaymentReply, shouldExplainCommercialStep } from "./informedCommercialContinuation";
import { explicitContinuationText } from "./conversationRecovery";
import { validateNativeConversationReply } from "./nativeConversationKernel";
import { loadCompactHumanMemory, nextCompactHumanMemory, type CompactHumanMemory } from "./compactHumanMemory";
import { beginHumanTurn, checkpointHumanTurn, loadHumanTurnJournal } from "./durableTurnJournal";
import { humanDecisionPlane } from "./humanDecisionPlane";
import { routeHumanModel, type HumanModelTier } from "./modelCostLadder";
import { obviousContextualContinuation, runHumanConversationBrain, type HumanBrainMeaning } from "./humanConversationBrain";
import { markContactResolution } from "./contactIdentity";
import { buildIphone18AuthoritativeReply } from "./businessTruthRegistry";
import { buildApplicationModificationRoutingReply } from "./applicationModificationRouting";
import { hasPaymentProtection } from "./manualActionPolicy";
import { buildSecureDeviceChangeUrl } from "./deviceChangeAuthority";
import { durableIngressTurnFreshness } from "./durableIngress";
import { manualMutationReceiptReply, recordManualMutationReceipt, type ManualMutationReceipt } from "./manualMutationReceipt";
import { notifyV3Discord } from "./discordNotifier";
import { arbitrateProductionReply } from "./responseArbiter";
import type { ActionKey, ActionResult, ConversationState, DialogueAct, InterpretedTurn, PlannedAction, ReplyPlan, TopicKey, TruthBundle, VerificationReport } from "./types";
import { V3_OS_VERSION } from "./types";
import { resolveAiRole, roleDisplayName } from "./hierarchy";

const PASS: VerificationReport = {
  pass: true,
  missingTopics: [],
  unsupportedClaims: [],
  truthContradictions: [],
  actionClaimViolations: [],
  policyViolations: [],
  hierarchyViolations: [],
  repetitionFlags: [],
};

// Phase 11.0.1: authoritative tracking replies bypass the generic native-reply
// validator, but keep the same minimal safety shape expected below. Do not use
// VerificationReport here: it has policyViolations, while native validation uses reasons.
const AUTHORITATIVE_DETERMINISTIC_SAFETY = { pass: true, reasons: [] as string[] };

export type HumanConversationOsMetadata = {
  enabled: true;
  journalTurnId: string;
  modelTier: HumanModelTier;
  modelCalls: number;
  reusedDecision: boolean;
  needsHumanReview: boolean;
  humanReviewReason: string | null;
  memoryAfter: CompactHumanMemory | null;
};

export type HumanConversationOsResult = {
  version: typeof V3_OS_VERSION;
  turn: InterpretedTurn;
  stateBefore: ConversationState;
  stateAfter: ConversationState;
  truth: TruthBundle;
  truthBeforeActions: TruthBundle;
  truthAfterActions: TruthBundle;
  plan: ReplyPlan;
  actions: ActionResult[];
  verification: VerificationReport;
  reply: string | null;
  providerUsed: boolean;
  interpreterUsed: boolean;
  interpreterError: string | null;
  replyAttempts: number;
  finalSafetyPass: boolean;
  fallbackUsed: boolean;
  realActionsEnabled: boolean;
  humanOs: HumanConversationOsMetadata;
};

function actionSuccessReply(truth: TruthBundle, actions: ActionResult[]) {
  const app = truth.application;
  const tracking = app?.trackingId ? ` ${app.trackingId}` : "";
  const cancel = actions.find((x) => x.action === "cancel_application" && x.executed);
  if (cancel) {
    const refundRequested = String(app?.paymentStatus || "").toLowerCase() === "refund_requested" || String(app?.status || "").toLowerCase() === "refund_requested";
    if (refundRequested) {
      const url = applicationRefundUrl(truth);
      return `تم إلغاء طلبك${tracking}، وبما إن الدفع مؤكد على الملف انفتح مسار الاسترداد الرسمي.${url ? `\nثبّت بيانات الاسترداد مرة واحدة من الرابط:\n${url}` : ""}`;
    }
    return `تم إلغاء طلبك${tracking} بنجاح. ما في دفع مؤكد على الملف، لذلك ما في استرداد مطلوب على هذا الطلب.`;
  }
  const refund = actions.find((x) => x.action === "request_refund" && x.executed);
  if (refund) {
    const url = applicationRefundUrl(truth);
    return `تم تسجيل طلب الاسترداد${tracking}.${url ? `\nثبّت بيانات الاسترداد مرة واحدة من الرابط الرسمي:\n${url}` : ""} ما رح أعتبر التحويل مكتمل إلا لما يصير فعليًا.`;
  }
  const stop = actions.find((x) => x.action === "stop_refund" && x.executed);
  if (stop) return stop.outcome === "already_done" ? `طلبك${tracking} مستمر أصلًا وما في استرداد نشط يحتاج إيقاف.` : `تم إيقاف طلب الاسترداد وإعادة تفعيل طلبك${tracking}. المتابعة بتكمل على نفس الطلب.`;
  const reopen = actions.find((x) => x.action === "reopen_application" && x.executed);
  if (reopen) return reopen.outcome === "already_done" ? `طلبك${tracking} مفتوح أصلًا وما في داعي نعيد فتحه.` : `تم إعادة فتح طلبك${tracking} بنجاح، والمتابعة بتكمل على نفس الطلب.`;
  const alias = actions.find((x) => x.action === "link_whatsapp_alias" && x.executed);
  if (alias) return `تم اعتماد رقم واتسابك الحالي كرقم متابعة تابع للطلب${tracking}. رقم الهاتف الأساسي على الطلب ما تغيّر.`;
  return null;
}

function actionFailureReply(truth: TruthBundle, actions: ActionResult[]) {
  const failed = actions.find((x) => ["failed","blocked"].includes(x.outcome) && ["cancel_application","request_refund","stop_refund","reopen_application","link_whatsapp_alias"].includes(x.action));
  if (!failed) return null;
  const tracking = truth.application?.trackingId ? ` على الطلب ${truth.application.trackingId}` : "";
  const label = failed.action === "cancel_application" ? "الإلغاء" : failed.action === "request_refund" ? "الاسترداد" : failed.action === "stop_refund" ? "إيقاف الاسترداد" : failed.action === "reopen_application" ? "إعادة فتح الطلب" : "اعتماد رقم واتساب";
  return `طلب ${label}${tracking} واضح، لكن التنفيذ الفعلي ما اكتمل بهاللحظة. ما رح أقول إنه تم قبل ما تثبت النتيجة بالنظام، وما في داعي تعيد نفس التأكيد الآن.`;
}

const CUSTOMER_STATUS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bpreliminary_application\b/gi, "قيد المراجعة المبدئية"],
  [/\bpreliminary_qualified\b/gi, "موافقة مبدئية"],
  [/\bcustomer_confirmed_continue\b/gi, "تم تسجيل رغبتك بالاستمرار"],
  [/\bpending_payment\b|\bpayment_info_sent\b/gi, "بانتظار دفع رسوم فتح الملف"],
  [/\bcustomer_claimed_paid\b|\bpending_payment_confirmation\b/gi, "إثبات الدفع بانتظار مراجعة الإدارة"],
  [/\bunder_review\b/gi, "قيد الدراسة النهائية"],
  [/\brefund_requested\b/gi, "الاسترداد قيد المعالجة"],
  [/\brefund_completed\b/gi, "تم الاسترداد"],
];

function sanitizeCustomerFacingStatusTokens(value: string | null | undefined) {
  let out = String(value || "").trim();
  for (const [pattern, label] of CUSTOMER_STATUS_REPLACEMENTS) out = out.replace(pattern, label);
  return out;
}

function paymentQuestionAfterDisclosure(turn: InterpretedTurn, truth: TruthBundle) {
  if (applicationJourneyStage(truth.application) !== "continuation_confirmed_fee_due") return false;
  if (turn.topics.some((topic) => ["payment_fee","payment_method","payment_timing","payment_recipient","receipt_upload"].includes(topic))) return true;
  const text = String(turn.rawText || "");
  return /(?:دفع|ادفع|أدفع|احول|أحول|تحويل|وين\s+احول|كيف\s+ادفع|بيانات\s+الدفع)/i.test(text);
}

function officeGroundedReply(truth: TruthBundle) {
  return `${truth.policy.generalLocation}. الحضور للمكتب بموعد رسمي مؤكد فقط، لأن المكتب مش نقطة استقبال مفتوحة ولازم يكون الجهاز والملف والعقد وإجراءات الاستلام جاهزة قبل حضورك حتى ما تيجي بدون تنسيق.`;
}

function explicitDeliveryOrPickupQuestionText(value: string | null | undefined) {
  const q = normalizeActionConfirmationText(value);
  if (!q) return false;
  if (/(?:توصيل|دليفري|باب\s+البيت)/.test(q)) return true;
  if (/(?:كيف|وين|اين|أين).{0,22}(?:التسليم|الاستلام|استلم|استلام)|(?:التسليم|الاستلام).{0,22}(?:كيف|وين|مكتب|البيت)/.test(q)) return true;
  return false;
}

function deliveryGroundedReply(input: { truth: TruthBundle; customerText: string }) {
  const iphone18 = buildIphone18AuthoritativeReply(input.customerText);
  if (iphone18) return iphone18;
  return `ما في توصيل. الاستلام من المكتب بعد صدور الموافقة النهائية وبموعد رسمي مؤكد مرتبط بالطلب. ${input.truth.policy.generalLocation}.`;
}

function syntheticMediaGroundedReply(customerText: string) {
  const kind = syntheticMediaNoticeKind(customerText);
  if (!kind || syntheticMediaSemanticText(customerText)) return null;
  if (kind === "voice") return "وصلتني الرسالة الصوتية، لكن ما عندي تفريغ نصي لمحتواها. اكتبلي النقطة الأساسية بنص وبجاوبك مباشرة من نفس السياق.";
  if (kind === "image") return "وصلتني الصورة، لكن ما بقدر أحدد المطلوب منها لحالها. اكتبلي شو بدك أتأكد منه فيها وبكمل معك من نفس السياق.";
  if (kind === "video") return "وصلني الفيديو، لكن ما بقدر أحدد المطلوب منه لحاله. اكتبلي النقطة اللي بدك أساعِدك فيها وبكمل معك من نفس السياق.";
  if (kind === "document") return "وصلني الملف. إذا بدك أتأكد من خطوة معينة مرتبطة فيه، اكتبلي شو المطلوب. والمستندات الحساسة ما بنعتمدها عبر واتساب؛ لازم تترفع من الرابط الرسمي الآمن المخصص للطلب.";
  return "وصلني المرفق. اكتبلي شو بدك أتأكد منه وبكمل معك من نفس السياق.";
}

// Phase 11.6.1: a high-confidence deterministic current question is an egress
// obligation, not a suggestion the conversational model may erase. Preserve only
// deterministic ASK acts that do not themselves request a mutation. The Human
// Brain can enrich context, but it cannot delete the literal question the customer
// just asked.
function preserveDeterministicCurrentQuestionAuthority(anchor: InterpretedTurn, candidate: InterpretedTurn): InterpretedTurn {
  const authoritativeActs = anchor.acts.filter((act) =>
    act.source === "deterministic"
    && act.type === "ask"
    && (act.action || "none") === "none"
    && act.confidence >= 0.95
    && !["greeting", "thanks", "acknowledgement", "unknown"].includes(act.topic)
  );
  if (!authoritativeActs.length) return candidate;

  const acts = [...candidate.acts];
  for (const act of authoritativeActs) {
    if (!acts.some((existing) => existing.topic === act.topic && existing.type === "ask")) acts.push(act);
  }
  const topics = Array.from(new Set([...candidate.topics, ...authoritativeActs.map((act) => act.topic)]));
  return { ...candidate, acts, topics, confidence: Math.max(candidate.confidence, ...authoritativeActs.map((act) => act.confidence)) };
}

function paymentRelativeReceiptGroundedReply(input: { truth: TruthBundle; customerText: string }) {
  if (!isPaymentRelativeToReceiptText(input.customerText)) return null;
  const app = input.truth.application;
  const stage = applicationJourneyStage(app);
  const firstInstallment = input.truth.policy.firstInstallmentRule;
  if (app && hasAuthoritativePaymentConfirmation(app)) {
    return `إذا قصدك رسوم فتح الملف: الدفع مؤكد إداريًا على طلبك أصلًا، فما في داعي تعيدها عند استلام الجهاز. وبالنسبة للقسط الأول: ${firstInstallment}`;
  }
  if (app && ["customer_claimed_paid", "pending_payment_confirmation"].includes(String(app.paymentStatus || "").toLowerCase())) {
    return `إذا قصدك رسوم فتح الملف: وصل الدفع مسجل وبانتظار اعتماد الإدارة، فما بنطلب منك تدفعها مرة ثانية عند الاستلام. وبالنسبة للقسط الأول: ${firstInstallment}`;
  }
  if (stage === "preliminary_review") {
    return `إذا قصدك رسوم فتح الملف: ما في رسوم مطلوبة منك هسا قبل الموافقة المبدئية. إذا تأهل الملف مبدئيًا واخترت تكمل، رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير بتكون قبل تحويل الملف للدراسة النهائية، مش عند استلام الجهاز. وبالنسبة للقسط الأول: ${firstInstallment}`;
  }
  return `إذا قصدك رسوم فتح الملف: لا، هاي مش دفعة عند استلام الجهاز. بعد الموافقة المبدئية وإذا اخترت الاستمرار، رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير بتكون قبل الدراسة النهائية. أما القسط الأول: ${firstInstallment}`;
}

function deterministicFallback(input: { turn: InterpretedTurn; truth: TruthBundle; customerText: string }) {
  const app = input.truth.application;
  const stage = applicationJourneyStage(app);
  const topics = new Set(input.turn.topics);
  if (topics.has("application_status") && app) return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} موجود وحالته الحالية: ${customerFacingStatusLabel(app)}.`;
  if (topics.has("review_timing") && app) return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الحالية: ${customerFacingStatusLabel(app)}. ${input.truth.policy.normalReviewWindow}، وما بقدر أثبت موعد نهائي غير موجود بالنظام.`;
  if (topics.has("payment_status") && app) return hasAuthoritativePaymentConfirmation(app) ? "الدفع مؤكد إداريًا على طلبك، وما في داعي تعيد الدفع أو ترفع وصل جديد." : "الدفع مش مؤكد إداريًا على الطلب لحد الآن، لذلك ما رح أعتبره مكتمل قبل اعتماد الإدارة.";
  if (topics.has("payment_fee")) return `رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير وبتدخل بعد الموافقة المبدئية إذا اخترت تكمل للدراسة النهائية. هي منفصلة عن ثمن الجهاز والقسط الأول، وما بتضمن الموافقة؛ هدفها تنظيم مرحلة الدراسة النهائية وقياس جدية الاستمرار، ولها مسار استرداد حسب سياسة الطلب.`;
  if (stage === "preliminary_approved_waiting_decision" && topics.has("continuation")) return buildInformedCommercialDisclosureReply(input.truth);
  if (topics.has("office_location")) return officeGroundedReply(input.truth);
  if (topics.has("delivery") && explicitDeliveryOrPickupQuestionText(input.customerText)) return deliveryGroundedReply({ truth: input.truth, customerText: input.customerText });
  if (topics.has("requirements")) return `${input.truth.policy.requirementsGuidanceRule} ${input.truth.policy.secureDocumentsRule}`;
  if (topics.has("call_request") || topics.has("human_request") || topics.has("manager_request")) return "التواصل الرسمي والمتابعة متاحين هون على نفس واتساب. ما رح أوعدك بمكالمة أو تحويل لموظف إذا ما في تنفيذ فعلي مثبت، لكن احكيلي المطلوب وبكمل معك من نفس السياق.";
  if (topics.has("thanks")) return "العفو، بأي وقت.";
  if (topics.has("greeting")) return "أهلين، احكيلي كيف بقدر أساعدك.";
  const links = buildOfficialLinkContext(input.turn, input.truth);
  if (topics.has("products")) return `الموديلات المتاحة للتقديم بتلاقيها بصفحة المنتجات الرسمية: ${links.relevant.products || `${links.baseUrl}/products`}`;
  return app
    ? `أنا معك على الطلب${app.trackingId ? ` ${app.trackingId}` : ""}. حالته الحالية: ${customerFacingStatusLabel(app)}. احكيلي النقطة اللي بدك جوابها وبجاوبك عليها مباشرة.`
    : "أنا معك. احكيلي النقطة اللي بدك جوابها وبجاوبك عليها مباشرة.";
}

function blockingSafetyReasons(reasons: string[]) {
  // Human/style quality must never null-out an otherwise truthful reply.
  return reasons.filter((reason) => !reason.startsWith("humanity:"));
}

function repairReplyForSafety(input: {
  reasons: string[];
  turn: InterpretedTurn;
  truth: TruthBundle;
  customerText: string;
  gateConfirmationPrompt: string | null;
  disclosureRequired: boolean;
  paymentExecutionRequired: boolean;
}) {
  const reasons = input.reasons;
  if (reasons.some((reason) => reason.startsWith("missing_action_specific_confirmation:")) && input.gateConfirmationPrompt) return input.gateConfirmationPrompt;
  if (input.disclosureRequired || reasons.some((reason) => ["missing_informed_fee_amount","missing_fee_rationale","missing_fee_non_guarantee_context","payment_details_before_informed_confirmation"].includes(reason))) {
    return buildInformedCommercialDisclosureReply(input.truth);
  }
  if (input.paymentExecutionRequired || reasons.includes("missing_current_payment_destinations") || reasons.includes("missing_receipt_link_after_informed_confirmation")) {
    return buildPostDisclosurePaymentReply(input.truth, applicationReceiptUrl(input.truth));
  }
  if (reasons.some((reason) => reason === "missed_known_office_location" || reason.startsWith("office_location_missing_"))) return officeGroundedReply(input.truth);
  if (reasons.some((reason) => reason.startsWith("delivery_") || reason === "grounding:iphone18_pickup_rule_missing") && explicitDeliveryOrPickupQuestionText(input.customerText)) return deliveryGroundedReply({ truth: input.truth, customerText: input.customerText });
  if (reasons.some((reason) => reason === "grounding:iphone18_region_missing")) return buildIphone18AuthoritativeReply(input.customerText) || deterministicFallback({ turn: input.turn, truth: input.truth, customerText: input.customerText });
  if (reasons.includes("unsupported_future_admin_or_contact_claim") || reasons.includes("unsupported_future_operational_promise")) {
    return "ما رح أوعدك بمكالمة أو تواصل من موظف إذا ما في إجراء فعلي مثبت. نقدر نكمل المتابعة هون على نفس واتساب، وإذا في إجراء حقيقي بصير بنحكي عنه بعد ما يثبت بالنظام.";
  }
  const sanitized = sanitizeCustomerFacingStatusTokens(deterministicFallback({ turn: input.turn, truth: input.truth, customerText: input.customerText }));
  return sanitized || null;
}

function verificationFromReasons(reasons: string[]): VerificationReport {
  return reasons.length ? { ...PASS, pass: false, policyViolations: reasons } : PASS;
}


const CONTEXT_CONFIRMABLE_MUTATIONS = new Set<ActionKey>([
  "cancel_application",
  "request_refund",
  "stop_refund",
  "reopen_application",
  "link_whatsapp_alias",
  "change_application_data",
]);

function normalizeActionConfirmationText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function explicitPendingMutationConfirmation(input: { customerText: string; state: ConversationState; turn: InterpretedTurn }): ActionKey | null {
  const pending = input.state.pendingAction;
  if (!pending || !CONTEXT_CONFIRMABLE_MUTATIONS.has(pending)) return null;
  const text = normalizeActionConfirmationText(input.customerText);
  if (!text) return null;

  const rejected = /(?:لا\s+(?:تلغي|الغوا|الغوه|ترجع|ترجعوا|توقف|توقفوا|تعتمد|تعتمدوا)|بطلت|تراجعت|استنى|استني|لا\s+استنى|مش\s+بدي)/.test(text);
  if (rejected) return null;

  const affirmative = /^(?:اه|نعم|ايوه|موافق|اكيد|تمام)(?:\s|$)/.test(text);
  const directCancel = /(?:الغوه|الغوا|الغي|الغا|إلغاء|الغاء).{0,22}(?:الطلب|المعامله|المعاملة)?/.test(text);
  const directRefund = /(?:رجعولي|رجعوا|استرداد|استرجاع|رجع\s+المصاري|رجع\s+المبلغ)/.test(text);
  const directStopRefund = /(?:وقف|اوقف|ايقاف).{0,28}(?:الاسترداد|الاسترجاع)/.test(text);
  const directReopen = /(?:ارجع|رجع|اعاده|اعادة).{0,22}(?:افتح|فتح|فعل|تفعيل).{0,22}(?:الطلب|المعامله|المعاملة)?/.test(text);
  const directAlias = /(?:اعتمد|اربط).{0,30}(?:الرقم|واتساب)/.test(text);

  if (pending === "cancel_application" && (directCancel || (affirmative && /(?:الغاء|الغي|الغوه|الغوا)/.test(text)))) return pending;
  if (pending === "request_refund" && (directRefund || (affirmative && /(?:استرداد|استرجاع|رجع)/.test(text)))) return pending;
  if (pending === "stop_refund" && directStopRefund) return pending;
  if (pending === "reopen_application" && directReopen) return pending;
  if (pending === "link_whatsapp_alias" && directAlias) return pending;
  if (pending === "change_application_data" && input.state.pendingActionPayload?._manualMutationConfirmationRequired === true) {
    const previous = normalizeActionConfirmationText(input.state.lastAssistantText);
    const previousAskedForChangeConfirmation = /(?:تعديل|تغيير)/.test(previous) && /(?:اكد|تاكيد|بدك|نبدأ|نبدا)/.test(previous);
    const materialTopics = input.turn.topics.filter((topic) => !["greeting", "thanks", "acknowledgement", "unknown"].includes(topic));
    const hasQuestion = /[؟?]/.test(String(input.customerText || "")) || Boolean(input.turn.semantic?.currentQuestion);
    const contextualAcknowledgement = /^(?:اه|نعم|ايوه|موافق|اكيد|تمام|ياريت|ماشي)(?:\s|$)/.test(text);
    const scopedConfirmation = contextualAcknowledgement && text.length <= 48 && !hasQuestion && !input.turn.requestedActions.length && !materialTopics.length;
    if (previousAskedForChangeConfirmation && scopedConfirmation) return pending;
  }
  return null;
}

function makeDeterministicPendingMutationTurn(turn: InterpretedTurn, action: ActionKey): InterpretedTurn {
  const topic: TopicKey = action === "cancel_application" ? "cancellation"
    : action === "request_refund" || action === "stop_refund" ? "refund"
    : action === "reopen_application" ? "reopen"
    : "application_correction";
  const alreadyHasAction = turn.requestedActions.includes(action);
  const alreadyHasAct = turn.acts.some((act) => act.action === action && act.type === "request_action");
  const act: DialogueAct[] = alreadyHasAct ? [] : [{
    id: `${turn.turnId}:pending-confirmation`,
    type: "request_action" as const,
    topic,
    text: turn.rawText,
    action,
    value: null,
    confidence: 1,
    source: "resolved" as const,
  }];
  return {
    ...turn,
    acts: [...turn.acts, ...act],
    topics: Array.from(new Set([...turn.topics, topic])),
    requestedActions: alreadyHasAction ? turn.requestedActions : [...turn.requestedActions, action],
    confidence: Math.max(turn.confidence, 0.99),
    semantic: turn.semantic ? {
      ...turn.semantic,
      currentQuestion: null,
      answerMode: "direct",
      confidence: Math.max(turn.semantic.confidence || 0, 0.99),
      decision: {
        ...turn.semantic.decision,
        cancellation: action === "cancel_application" ? "requested" : turn.semantic.decision.cancellation,
        refund: action === "request_refund" ? "requested" : turn.semantic.decision.refund,
      },
    } : turn.semantic,
  };
}

function forceConfirmedPendingMutation(plan: ReplyPlan, input: { action: ActionKey | null; state: ConversationState; turn: InterpretedTurn }): ReplyPlan {
  if (!input.action) return plan;
  const existing = plan.actions.find((item) => item.action === input.action);
  const forced: PlannedAction = {
    action: input.action,
    sourceActId: existing?.sourceActId || `${input.turn.turnId}:pending-confirmation`,
    requiresConfirmation: false,
    authority: "deterministic",
    requiredRole: "omran",
    payload: existing?.payload || input.state.pendingActionPayload || null,
  };
  return {
    ...plan,
    actions: [forced, ...plan.actions.filter((item) => item.action !== input.action)],
    shouldRespond: true,
  };
}

function punctuationOnlyCustomerTurn(value: string | null | undefined) {
  const raw = String(value || "").trim();
  return Boolean(raw) && /^[.،,!?؟…ـ\-\s]+$/.test(raw);
}

function normalizeRecentTurnBody(value: string) {
  return normalizeActionConfirmationText(value).replace(/\s+/g, " ").trim();
}

function parseRecentCustomerTurn(value: string) {
  const raw = String(value || "").trim();
  const bracket = raw.match(/^\s*\[[^\]]*(?:customer|user|incoming|العميل)[^\]]*\]\s*(.*)$/i);
  if (bracket) return bracket[1].trim();
  const labeled = raw.match(/^\s*(?:customer|user|incoming|العميل)\s*[:：|\-]\s*(.*)$/i);
  return labeled ? labeled[1].trim() : null;
}

function hasNewerCustomerTurn(input: { customerText: string; recentTurns: string[] }) {
  const current = normalizeRecentTurnBody(input.customerText);
  if (!current) return false;
  const parsed = input.recentTurns.map((line) => parseRecentCustomerTurn(line));
  let currentIndex = -1;
  for (let i = 0; i < parsed.length; i += 1) {
    const body = parsed[i];
    if (!body) continue;
    const normalized = normalizeRecentTurnBody(body);
    if (normalized === current || normalized.endsWith(current) || current.endsWith(normalized)) currentIndex = i;
  }
  if (currentIndex < 0) return false;
  return parsed.slice(currentIndex + 1).some((body) => body && !punctuationOnlyCustomerTurn(body) && normalizeRecentTurnBody(body) !== current);
}

function simpleSocialClosureReply(turn: InterpretedTurn, customerText: string) {
  if (turn.requestedActions.length) return null;
  const materialTopics = turn.topics.filter((topic) => !["thanks", "acknowledgement", "greeting", "unknown"].includes(topic));
  if (materialTopics.length) return null;
  const n = normalizeActionConfirmationText(customerText);
  if (/(?:شكرا|شكراً|يعطيك\s+العافيه|يعطيك\s+العافية|يسلمو|مشكور)/.test(n)) return "الله يعافيك، بأي وقت.";
  if (/^(?:تمام|اوكي|اوك|ماشي|خلص|تمام\s+شكرا)$/.test(n)) return "تمام.";
  return null;
}

function humanRequestGroundedReply(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  if (input.turn.requestedActions.length) return null;
  const humanRequested = input.turn.topics.some((topic) => ["human_request", "manager_request", "call_request"].includes(topic));
  if (!humanRequested) return null;
  const name = roleDisplayName(input.state.role.currentRole);
  const status = input.truth.application && input.turn.topics.includes("application_status")
    ? ` حالة طلبك الحالية: ${customerFacingStatusLabel(input.truth.application)}.`
    : "";
  return `معك ${name} من الأمين، وبكمل معك هون على نفس المحادثة.${status} ما عندي تحويل تلقائي لمكالمة أو لموظف منفصل من داخل واتساب، فاحكيلي المطلوب مباشرة وبعالجه معك حسب حالة الطلب الفعلية.`;
}

function reconcilePendingMutationWithAuthoritativeTruth(state: ConversationState, truth: TruthBundle) {
  if (!state.pendingAction || !truth.application) return state;
  const stage = applicationJourneyStage(truth.application);
  const resolved = (state.pendingAction === "request_refund" && ["refund_requested", "refund_completed"].includes(stage))
    || (state.pendingAction === "cancel_application" && ["cancelled", "refund_requested", "refund_completed"].includes(stage));
  return resolved ? { ...state, pendingAction: null, pendingActionPayload: null } : state;
}

function closePendingMutationAfterReceipt(input: { state: ConversationState; actions: ActionResult[]; manualReceipt: ManualMutationReceipt | null }) {
  const pending = input.state.pendingAction;
  if (!pending) return input.state;
  const durableResult = input.actions.find((result) => result.action === pending && ["executed", "already_done"].includes(result.outcome));
  const manualRecorded = pending === "change_application_data"
    && input.manualReceipt
    && ["awaiting_admin", "already_pending"].includes(input.manualReceipt.status);
  return durableResult || manualRecorded
    ? { ...input.state, pendingAction: null, pendingActionPayload: null }
    : input.state;
}

function updatePendingState(input: { state: ConversationState; gate: ReturnType<typeof enforceMutationConfirmationGate>; turn: InterpretedTurn }) {
  let state = input.state;
  if (input.gate.clearPendingConfirmation || input.gate.confirmedAction) {
    state = { ...state, pendingAction: null, pendingActionPayload: null };
  }
  const staged = input.gate.actions.find((action) => action.requiresConfirmation);
  if (staged && input.gate.confirmationPrompt) {
    state = { ...state, pendingAction: staged.action, pendingActionPayload: staged.payload || null };
  }
  return { ...state, lastTurnId: input.turn.turnId, lastCustomerText: input.turn.rawText, updatedAt: new Date().toISOString() };
}

// Phase 11.4: pending actions may remain durable, but they do not own every later
// customer turn. The current turn may explicitly withdraw the action, or may ask
// an unrelated material question that must be answered without replaying the old
// confirmation prompt. This is semantic/state authority, not phrase accumulation.
const PENDING_ACTION_TOPICS: Partial<Record<ActionKey, TopicKey[]>> = {
  cancel_application: ["cancellation"],
  request_refund: ["refund"],
  stop_refund: ["refund", "continuation", "reopen"],
  reopen_application: ["reopen", "continuation"],
  link_whatsapp_alias: ["application_correction"],
  continue_application: ["continuation"],
  change_device: ["device_change", "device_recalculation"],
  change_application_data: ["application_correction"],
};

const NON_MATERIAL_TURN_TOPICS = new Set<TopicKey>(["greeting", "thanks", "acknowledgement", "unknown"]);

function currentTurnWithdrawsPendingAction(input: { state: ConversationState; turn: InterpretedTurn }) {
  const pending = input.state.pendingAction;
  if (!pending) return false;
  const decision = input.turn.semantic?.decision;
  if (pending === "cancel_application" && decision?.cancellation === "declined") return true;
  if (pending === "continue_application" && decision?.continuation === "declined") return true;
  if (pending === "link_whatsapp_alias" && decision?.aliasConfirmation === "declined") return true;
  const relatedTopics = PENDING_ACTION_TOPICS[pending] || [];
  return input.turn.acts.some((act) => act.type === "deny" && (act.action === pending || relatedTopics.includes(act.topic)));
}

function currentTurnShouldIgnorePendingAction(input: {
  state: ConversationState;
  turn: InterpretedTurn;
  confirmedPendingMutation: ActionKey | null;
}) {
  const pending = input.state.pendingAction;
  if (!pending || input.confirmedPendingMutation === pending) return false;
  if (input.turn.requestedActions.includes(pending)) return false;
  const relatedTopics = PENDING_ACTION_TOPICS[pending] || [];
  if (input.turn.topics.some((topic) => relatedTopics.includes(topic))) return false;
  const materialTopics = input.turn.topics.filter((topic) => !NON_MATERIAL_TURN_TOPICS.has(topic));
  const hasCurrentQuestion = Boolean(input.turn.semantic?.currentQuestion || input.turn.semantic?.answerObligations?.length);
  return materialTopics.length > 0 || hasCurrentQuestion;
}

function stateTime(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function currentTurnStillOwnsConversation(input: {
  waId: string;
  turnId: string;
  startLastTurnId: string | null;
  fallbackState: ConversationState;
}) {
  const latestState = (await loadV3ConversationState(input.waId)) || input.fallbackState;
  const latestTurnId = latestState.lastTurnId || null;
  const stateOwnershipLost = Boolean(
    latestTurnId
    && latestTurnId !== input.turnId
    && latestTurnId !== input.startLastTurnId
  );
  // Phase 11.5: ConversationState is downstream. A newer customer message can
  // already be durable in the ingress queue before it has a chance to advance
  // lastTurnId, so mutation/egress ownership must include that upstream truth.
  const ingressFreshness = await durableIngressTurnFreshness({
    waId: input.waId,
    currentMessageId: input.turnId,
    lookbackSeconds: 180,
  });
  const ownershipLost = stateOwnershipLost || !ingressFreshness.fresh;
  return { owns: !ownershipLost, latestState, ingressFreshness };
}

async function supersededHumanTurnResult(input: {
  turnId: string;
  turn: InterpretedTurn;
  stateBefore: ConversationState;
  latestState: ConversationState;
  truthBeforeActions: TruthBundle;
  truthAfterActions: TruthBundle;
  plan: ReplyPlan;
  actions: ActionResult[];
  modelTier: HumanModelTier;
  modelCalls: number;
  interpreterError: string | null;
  realActionsEnabled: boolean;
  memory: CompactHumanMemory | null;
  reason: "ownership_lost_before_actions" | "ownership_lost_before_manual_receipt" | "ownership_lost_before_egress";
}): Promise<HumanConversationOsResult> {
  const quietPlan: ReplyPlan = {
    ...input.plan,
    objective: "suppress superseded turn because a newer durable customer turn owns the conversation",
    role: input.latestState.role.currentRole,
    actions: [],
    shouldRespond: false,
  };
  await checkpointHumanTurn({
    turnId: input.turnId,
    status: "reply_ready",
    modelTier: input.modelTier,
    modelCalls: input.modelCalls,
    meaning: { deterministic: true, suppressed: true, reason: input.reason },
    truth: input.truthAfterActions,
    actions: input.actions,
    finalReply: null,
    stateAfter: input.latestState,
    memoryAfter: input.memory,
    errorCode: "human_os_superseded_by_newer_turn",
    errorMessage: input.reason,
  });
  return {
    version: V3_OS_VERSION,
    turn: input.turn,
    stateBefore: input.stateBefore,
    stateAfter: input.latestState,
    truth: input.truthAfterActions,
    truthBeforeActions: input.truthBeforeActions,
    truthAfterActions: input.truthAfterActions,
    plan: quietPlan,
    actions: input.actions,
    verification: PASS,
    reply: null,
    providerUsed: input.modelCalls > 0,
    interpreterUsed: input.modelCalls > 0,
    interpreterError: input.interpreterError,
    replyAttempts: input.modelCalls > 0 ? 1 : 0,
    finalSafetyPass: true,
    fallbackUsed: false,
    realActionsEnabled: input.realActionsEnabled,
    humanOs: {
      enabled: true,
      journalTurnId: input.turnId,
      modelTier: input.modelTier,
      modelCalls: input.modelCalls,
      reusedDecision: false,
      needsHumanReview: false,
      humanReviewReason: null,
      memoryAfter: input.memory,
    },
  };
}

function explicitTrackingFromText(value: string | null | undefined) {
  const matches = String(value || "").match(/AM-\d{8,}/gi) || [];
  return matches.length ? matches[matches.length - 1].toUpperCase() : null;
}

function explicitTrackingStatusAuthority(input: { customerText: string; turn: InterpretedTurn }) {
  const trackingId = explicitTrackingFromText(input.customerText);
  if (!trackingId) return null;

  const disqualifyingTopics = new Set([
    "payment_fee", "payment_method", "payment_timing", "payment_recipient", "payment_status", "payment_confirmation", "receipt_upload",
    "refund", "cancellation", "continuation", "reopen", "device_change", "device_recalculation", "application_correction", "requirements",
  ]);
  if (input.turn.requestedActions.length > 0) return null;
  if (input.turn.topics.some((topic) => disqualifyingTopics.has(topic))) return null;

  const normalized = String(input.customerText || "")
    .replace(/AM-\d{8,}/gi, " ")
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const asksForApplication = /(?:شوف|شيك|تشيك|تابع|متابعه|متابعة|طلبي|الطلب|حاله|حالة|شو صار|وين وصل|اخر تحديث|آخر تحديث|status|check|follow)/i.test(normalized);
  const onlyTracking = normalized.length === 0;
  if (!asksForApplication && !onlyTracking && !input.turn.topics.includes("application_status")) return null;
  return trackingId;
}

function makeExplicitTrackingStatusTurn(turn: InterpretedTurn): InterpretedTurn {
  const topics = Array.from(new Set([...turn.topics, "tracking" as const, "application_status" as const]));
  return {
    ...turn,
    topics,
    requestedActions: [],
    semantic: turn.semantic ? {
      ...turn.semantic,
      customerGoal: turn.semantic.customerGoal || "متابعة الطلب المحدد برقم التتبع",
      currentQuestion: turn.semantic.currentQuestion || "ما الحالة الحالية لهذا الطلب؟",
      answerObligations: Array.from(new Set([...(turn.semantic.answerObligations || []), "اذكر أن الطلب تم العثور عليه وحالته الحالية من الحقيقة الموثقة"])),
      answerMode: "direct",
      confidence: Math.max(turn.semantic.confidence || 0, 0.99),
    } : turn.semantic,
  };
}

function explicitTrackingStatusReply(input: { trackingId: string; truth: TruthBundle }) {
  const app = input.truth.application;
  if (!app) {
    if (input.truth.degraded || (input.truth.readWarnings || []).length) {
      return `وصلني رقم الطلب ${input.trackingId}، لكن تعذر عليّ التحقق من حالته من قاعدة البيانات بهاللحظة. ما رح أخمّن بحالته؛ حاول معي بعد شوي.`;
    }
    return `دققت على رقم الطلب ${input.trackingId}، وما ظهر عندي طلب مطابق لهذا الرقم. تأكد من الرقم كما هو ظاهر عندك وابعتلي إياه مرة ثانية.`;
  }

  const status = customerFacingStatusLabel(app);
  const device = app.deviceName ? ` للجهاز ${app.deviceName}` : "";
  const safePreview = input.truth.contactAccess === "safe_preview";
  const privacy = safePreview ? " بما إنك بتراسلني من رقم واتساب مختلف عن الرقم المرتبط بالطلب، بعطيك الحالة العامة الآمنة للطلب بدون بيانات شخصية." : "";
  return `أكيد، لقيت الطلب ${app.trackingId || input.trackingId}${device}. حالته الحالية: ${status}.${privacy}`;
}

function explicitAssistantIdentityQuestion(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const normalized = raw
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /(?:انت|انتي|إنت|مين)\s*(?:شو|ايش|إيش)?\s*(?:ذكاء\s*اصطناعي|بوت|روبوت|رد\s*الي|رد\s*آلي|انسان|إنسان)|(?:ذكاء\s*اصطناعي|بوت|روبوت|رد\s*الي|رد\s*آلي).*(?:ولا|او|أو).*(?:انسان|إنسان|موظف)|(?:شو|ما)\s+اسمك|مين\s+انت|وين\s+(?:المسؤول|المسوول)|مين\s+(?:المسؤول|المسوول)/i.test(normalized);
}

function explicitAssistantIdentityReply(input: { customerText: string; state: ConversationState }) {
  const name = roleDisplayName(input.state.role.currentRole);
  const normalized = String(input.customerText || "")
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const asksResponsible = /(?:المسؤول|المسوول|المدير|الاداره|الإدارة)/.test(normalized);
  if (asksResponsible) {
    return `معك ${name} من الأمين، وأنا بكمل معك بهالموضوع هون. احكيلي شو المطلوب وبمشيه معك حسب حالة الطلب الفعلية.`;
  }
  return `معك ${name} من الأمين. أنا مكمل معك على نفس المحادثة؛ احكيلي شو بدك وبجاوبك أو بنفذ الإجراء المسموح حسب حالة طلبك.`;
}

function explicitManagerIdentityQuestion(value: string | null | undefined) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /(?:وين|مين|بدي|احكي\s+مع).{0,18}(?:المسؤول|المسوول|المدير|الاداره|الإدارة)|(?:عمران)/.test(normalized);
}

function makeDeterministicContinuationTurn(turn: InterpretedTurn): InterpretedTurn {
  const has = turn.requestedActions.includes("continue_application");
  const topics = turn.topics.includes("continuation") ? turn.topics : [...turn.topics, "continuation" as const];
  return {
    ...turn,
    topics,
    requestedActions: has ? turn.requestedActions : [...turn.requestedActions, "continue_application"],
    semantic: {
      ...(turn.semantic || {
        meaningSummary: "العميل أكد الاستمرار حسب السؤال المفتوح",
        customerGoal: "الاستمرار بالطلب",
        currentQuestion: null,
        answerObligations: [], references: [], entities: [], correctionOfPrevious: false, socialClosure: false,
        requiresExternalFact: false, externalFactNeeded: null, answerMode: "direct" as const, confidence: 0.99, warnings: [],
        decision: { continuation: "confirmed" as const, cancellation: "unknown" as const, refund: "unknown" as const, aliasConfirmation: "unknown" as const, condition: null },
      }),
      decision: { ...(turn.semantic?.decision || { cancellation: "unknown", refund: "unknown", aliasConfirmation: "unknown", condition: null }), continuation: "confirmed" },
      confidence: 0.99,
    },
  };
}

export async function runHumanConversationOS(input: {
  waId: string;
  turnId: string;
  customerText: string;
  recentTurns?: string[];
  profileName?: string | null;
  writer?: V3TextProvider | null;
  interpreter?: V3TextProvider | null;
  realActionsEnabled: boolean;
  solEnabled: boolean;
  maxRecentTurns: number;
  maxPromptChars: number;
}): Promise<HumanConversationOsResult> {
  const loadedState = (await loadV3ConversationState(input.waId)) || emptyState(input.waId);
  const stateBefore = loadedState;
  const startLastTurnId = stateBefore.lastTurnId || null;
  const existing = await loadHumanTurnJournal(input.turnId);
  const recentTurns = sanitizeRecentTurnsForModel(input.recentTurns || []).slice(-input.maxRecentTurns);

  if (existing?.final_reply && ["reply_ready","delivered","completed"].includes(existing.status)) {
    const truth = await resolveV3ProductionTruth({ waId: input.waId, customerText: input.customerText, state: stateBefore, recentTurns: input.recentTurns || [], topics: [] });
    const anchor = interpretTurn({ turnId: input.turnId, customerText: input.customerText });
    const stateAfter = (existing.state_after_json as ConversationState | null) || stateBefore;
    const replayIngressFreshness = await durableIngressTurnFreshness({ waId: input.waId, currentMessageId: input.turnId, lookbackSeconds: 180 });
    const replaySuperseded = Boolean(
      (stateBefore.lastTurnId
      && stateBefore.lastTurnId !== input.turnId
      && stateTime(stateBefore.updatedAt) > stateTime(stateAfter.updatedAt))
      || !replayIngressFreshness.fresh
    );
    return {
      version: V3_OS_VERSION,
      turn: anchor,
      stateBefore,
      stateAfter,
      truth,
      truthBeforeActions: truth,
      truthAfterActions: truth,
      plan: { objective: replaySuperseded ? "suppress replay because a newer durable turn owns the conversation" : "replay durable decided turn", role: stateAfter.role.currentRole, answerItems: [], actions: [], requiredFacts: [], forbiddenClaims: [], tone: "brief", shouldRespond: !replaySuperseded },
      actions: (existing.actions_json || []) as ActionResult[],
      verification: PASS,
      reply: replaySuperseded ? null : existing.final_reply,
      providerUsed: false,
      interpreterUsed: false,
      interpreterError: null,
      replyAttempts: 0,
      finalSafetyPass: true,
      fallbackUsed: false,
      realActionsEnabled: input.realActionsEnabled,
      humanOs: { enabled: true, journalTurnId: input.turnId, modelTier: existing.model_tier || "deterministic", modelCalls: existing.model_calls || 0, reusedDecision: true, needsHumanReview: false, humanReviewReason: null, memoryAfter: existing.memory_after_json as CompactHumanMemory | null },
    };
  }

  await beginHumanTurn({ turnId: input.turnId, waId: input.waId, incomingMessageId: input.turnId, customerText: input.customerText });

  let deterministicAnchor = interpretTurn({ turnId: input.turnId, customerText: input.customerText });
  const memory = await loadCompactHumanMemory(input.waId, stateBefore);
  let truthBeforeActions = await resolveV3ProductionTruth({
    waId: input.waId,
    customerText: input.customerText,
    state: stateBefore,
    recentTurns: input.recentTurns || [],
    topics: deterministicAnchor.topics,
  });

  const explicitStatusTracking = explicitTrackingStatusAuthority({ customerText: input.customerText, turn: deterministicAnchor });
  const explicitIdentityQuestion = explicitAssistantIdentityQuestion(input.customerText);
  const explicitManagerQuestion = explicitIdentityQuestion && explicitManagerIdentityQuestion(input.customerText);
  if (explicitStatusTracking) deterministicAnchor = makeExplicitTrackingStatusTurn(deterministicAnchor);
  if (explicitManagerQuestion) {
    deterministicAnchor = {
      ...deterministicAnchor,
      explicitRoleRequest: "omran",
      topics: deterministicAnchor.topics.includes("manager_request") ? deterministicAnchor.topics : [...deterministicAnchor.topics, "manager_request"],
    };
  }

  let authorityState = stateBefore;
  if (explicitStatusTracking && truthBeforeActions.contactAccess === "safe_preview") {
    authorityState = markContactResolution({
      state: authorityState,
      status: "blocked_mismatch",
      trackingId: truthBeforeActions.application?.trackingId || explicitStatusTracking,
      customerText: input.customerText,
    });
  }

  const scopedBefore = scopeStateToCurrentApplication({ state: authorityState, truth: truthBeforeActions, customerText: input.customerText });
  const canBindFullApplication = truthBeforeActions.contactAccess !== "safe_preview";
  let stateWorking = {
    ...scopedBefore.state,
    activeApplicationId: canBindFullApplication ? (truthBeforeActions.application?.id || scopedBefore.state.activeApplicationId) : scopedBefore.state.activeApplicationId,
    activeTrackingId: truthBeforeActions.application?.trackingId || scopedBefore.state.activeTrackingId,
  };
  stateWorking = reconcilePendingMutationWithAuthoritativeTruth(stateWorking, truthBeforeActions);
  deterministicAnchor = scopeTurnToCurrentApplication({ turn: deterministicAnchor, applicationChanged: scopedBefore.applicationChanged });

  const contextualContinuation = obviousContextualContinuation({ customerText: input.customerText, state: stateWorking });
  if (contextualContinuation) deterministicAnchor = makeDeterministicContinuationTurn(deterministicAnchor);
  const confirmedPendingMutation = explicitPendingMutationConfirmation({ customerText: input.customerText, state: stateWorking, turn: deterministicAnchor });
  if (confirmedPendingMutation) deterministicAnchor = makeDeterministicPendingMutationTurn(deterministicAnchor, confirmedPendingMutation);
  const suppressAsNoise = punctuationOnlyCustomerTurn(input.customerText) && !confirmedPendingMutation;
  const supersededByNewerCustomerTurn = hasNewerCustomerTurn({ customerText: input.customerText, recentTurns });

  // Phase 11.2: device/model/storage/color changes are handled through a
  // deterministic secure-link authority, not as a free-form WhatsApp mutation.
  const secureDeviceChangeRequested = Boolean(
    truthBeforeActions.application && (
      deterministicAnchor.topics.includes("device_change")
      || deterministicAnchor.topics.includes("device_recalculation")
      || deterministicAnchor.requestedActions.includes("change_device")
    )
  );

  // Phase 11.1.2: resolve the AI employee role before the conversational brain runs.
  // This keeps Fadwa/Tala/Abdullah/Abdulrahman/Omran continuity inside Human OS
  // instead of flattening every turn into a generic assistant voice.
  stateWorking = { ...stateWorking, role: resolveAiRole(stateWorking, deterministicAnchor) };

  if (suppressAsNoise || supersededByNewerCustomerTurn) {
    const quietPlan: ReplyPlan = {
      objective: supersededByNewerCustomerTurn ? "suppress stale turn because a newer customer message already exists" : "ignore punctuation-only customer noise",
      role: stateWorking.role.currentRole,
      answerItems: [],
      actions: [],
      requiredFacts: [],
      forbiddenClaims: [],
      tone: "brief",
      shouldRespond: false,
    };
    await checkpointHumanTurn({
      turnId: input.turnId,
      status: "reply_ready",
      modelTier: "deterministic",
      modelCalls: 0,
      meaning: { deterministic: true, suppressed: true, reason: supersededByNewerCustomerTurn ? "newer_customer_turn" : "punctuation_only" },
      truth: truthBeforeActions,
      actions: [],
      finalReply: null,
      stateAfter: stateWorking,
      memoryAfter: memory,
      errorCode: null,
      errorMessage: null,
    });
    return {
      version: V3_OS_VERSION,
      turn: deterministicAnchor,
      stateBefore,
      stateAfter: stateWorking,
      truth: truthBeforeActions,
      truthBeforeActions,
      truthAfterActions: truthBeforeActions,
      plan: quietPlan,
      actions: [],
      verification: PASS,
      reply: null,
      providerUsed: false,
      interpreterUsed: false,
      interpreterError: null,
      replyAttempts: 0,
      finalSafetyPass: true,
      fallbackUsed: false,
      realActionsEnabled: input.realActionsEnabled,
      humanOs: { enabled: true, journalTurnId: input.turnId, modelTier: "deterministic", modelCalls: 0, reusedDecision: false, needsHumanReview: false, humanReviewReason: null, memoryAfter: memory },
    };
  }

  const authoritativeSyntheticMediaReply = syntheticMediaGroundedReply(input.customerText);
  const provisionalRoute = routeHumanModel({ customerText: input.customerText, turn: deterministicAnchor, state: stateWorking, truth: truthBeforeActions, solEnabled: input.solEnabled });
  // Explicit tracking/status and textless media are deterministic work. Do not
  // spend a model call to reinterpret a transport notice such as "تم استلام صورة".
  const modelTier: HumanModelTier = (explicitStatusTracking || explicitIdentityQuestion || secureDeviceChangeRequested || authoritativeSyntheticMediaReply) ? "deterministic" : (provisionalRoute.tier === "sol" ? "deepseek" : provisionalRoute.tier);
  const provider = input.writer === undefined ? v3WriterProviderFromEnv() : input.writer;

  let brainMeaning: HumanBrainMeaning | null = null;
  let turn = deterministicAnchor;
  let brainReply: string | null = null;
  let modelCalls = 0;
  let interpreterError: string | null = null;

  if (modelTier === "deepseek") {
    const brain = await runHumanConversationBrain({
      provider,
      customerText: input.customerText,
      recentTurns,
      memory,
      truth: truthBeforeActions,
      state: stateWorking,
      deterministicAnchor,
      maxPromptChars: input.maxPromptChars,
    });
    turn = brain.turn;
    brainMeaning = brain.meaning;
    brainReply = brain.meaning.reply;
    modelCalls = brain.modelUsed ? 1 : 0;
    interpreterError = brain.modelError;
  }

  if (contextualContinuation) turn = makeDeterministicContinuationTurn(turn);
  turn = preserveDeterministicCurrentQuestionAuthority(deterministicAnchor, turn);
  // Phase 11.5 semantic obligation guard: payment timing relative to receiving
  // the device is not automatically a delivery/pickup-mechanics question. Apply
  // the same deterministic distinction after the model so it cannot reintroduce
  // the lexical "استلم => delivery" error.
  turn = enforcePaymentReceiptSemantics(turn, input.customerText);
  const pendingActionWithdrawn = currentTurnWithdrawsPendingAction({ state: stateWorking, turn });
  if (pendingActionWithdrawn) {
    stateWorking = { ...stateWorking, pendingAction: null, pendingActionPayload: null };
  }
  let reduced = reduceState({ state: stateWorking, turn });
  let plan = buildReplyPlan({ turn, state: reduced, truth: truthBeforeActions });
  plan = forceConfirmedPendingMutation(plan, { action: confirmedPendingMutation, state: stateWorking, turn });
  if (secureDeviceChangeRequested) {
    plan = { ...plan, actions: plan.actions.filter((action) => action.action !== "change_device") };
  }
  plan = { ...plan, actions: plan.actions.map((action) => stampActionScope(action, truthBeforeActions, turn.turnId)), shouldRespond: true };

  const ignorePendingForCurrentTurn = currentTurnShouldIgnorePendingAction({ state: reduced, turn, confirmedPendingMutation });
  const gateState = ignorePendingForCurrentTurn
    ? { ...reduced, pendingAction: null, pendingActionPayload: null }
    : reduced;
  const gate = enforceMutationConfirmationGate({ actions: plan.actions, turn, state: gateState, truth: truthBeforeActions });
  plan = { ...plan, actions: gate.actions.map((action) => stampActionScope(action, truthBeforeActions, turn.turnId)), shouldRespond: true };
  reduced = updatePendingState({ state: reduced, gate, turn });

  const manualChangeCandidate = plan.actions.find((action) => action.action === "change_application_data");
  const manualChangeNeedsConfirmation = Boolean(manualChangeCandidate?.requiresConfirmation && truthBeforeActions.application && truthBeforeActions.contactAccess === "full");
  const manualChangeConfirmationPrompt = manualChangeNeedsConfirmation
    ? `فهمت التعديل المطلوب على طلبك${truthBeforeActions.application?.trackingId ? ` ${truthBeforeActions.application.trackingId}` : ""}. قبل ما أسجل طلب التعديل للمراجعة الإدارية، أكدلي إنك بدك نبدأ تسجيله.`
    : null;
  const manualChangeScopeBlockedReply = manualChangeCandidate && (!truthBeforeActions.application || truthBeforeActions.contactAccess !== "full")
    ? "فهمت إنك بدك تعدّل بيانات الطلب، لكن ما عندي ربط كامل وآمن بالطلب من هالمحادثة هسا. ما رح أعتبر أي تعديل بدأ قبل ما يرتبط الطلب الصحيح بشكل موثوق."
    : null;
  if (manualChangeNeedsConfirmation && manualChangeCandidate) {
    reduced = {
      ...reduced,
      pendingAction: "change_application_data",
      pendingActionPayload: {
        ...(manualChangeCandidate.payload || {}),
        _manualMutationConfirmationRequired: true,
        _scopeApplicationId: truthBeforeActions.application?.id || null,
        _scopeTrackingId: truthBeforeActions.application?.trackingId || null,
        _scopeWaId: reduced.waId,
      },
    };
  } else if (confirmedPendingMutation === "change_application_data") {
    reduced = { ...reduced, pendingAction: null, pendingActionPayload: null };
  }

  const ownershipBeforeActions = await currentTurnStillOwnsConversation({
    waId: input.waId,
    turnId: input.turnId,
    startLastTurnId,
    fallbackState: stateBefore,
  });
  if (!ownershipBeforeActions.owns) {
    return supersededHumanTurnResult({
      turnId: input.turnId,
      turn,
      stateBefore,
      latestState: ownershipBeforeActions.latestState,
      truthBeforeActions,
      truthAfterActions: truthBeforeActions,
      plan,
      actions: [],
      modelTier,
      modelCalls,
      interpreterError,
      realActionsEnabled: input.realActionsEnabled,
      memory,
      reason: "ownership_lost_before_actions",
    });
  }

  const actions = await executeActions({
    actions: plan.actions,
    state: reduced,
    truth: truthBeforeActions,
    adapter: v3TransactionalActionAdapter,
    allowMutation: input.realActionsEnabled,
  });
  let actionResults = actions;

  let manualMutationReceipt: ManualMutationReceipt | null = null;
  const confirmedManualChange = plan.actions.find((action) => action.action === "change_application_data" && !action.requiresConfirmation);
  if (confirmedManualChange) {
    // Phase 11.5: the action plane does not mutate application data, but recording
    // the manual request is itself a durable side effect. Re-check ownership at
    // the exact receipt boundary so a newer customer bubble can revoke it.
    const ownershipBeforeManualReceipt = await currentTurnStillOwnsConversation({
      waId: input.waId,
      turnId: input.turnId,
      startLastTurnId,
      fallbackState: stateBefore,
    });
    if (!ownershipBeforeManualReceipt.owns) {
      return supersededHumanTurnResult({
        turnId: input.turnId,
        turn,
        stateBefore,
        latestState: ownershipBeforeManualReceipt.latestState,
        truthBeforeActions,
        truthAfterActions: truthBeforeActions,
        plan,
        actions,
        modelTier,
        modelCalls,
        interpreterError,
        realActionsEnabled: input.realActionsEnabled,
        memory,
        reason: "ownership_lost_before_manual_receipt",
      });
    }

    manualMutationReceipt = await recordManualMutationReceipt({
      truth: truthBeforeActions,
      action: "change_application_data",
      customerText: input.customerText,
      waId: input.waId,
    });
    const receiptResult: ActionResult = {
      action: "change_application_data",
      outcome: manualMutationReceipt.status === "failed" ? "failed" : "dry_run",
      executed: false,
      authoritativeSummary: manualMutationReceipt.status === "failed"
        ? "manual application-data change request was not recorded"
        : "manual application-data change request durably recorded; customer data not mutated",
      mutationId: manualMutationReceipt.receiptId,
      blocker: manualMutationReceipt.status === "failed" ? "manual_mutation_receipt_failed" : "awaiting_admin",
      ownerRole: "omran",
      details: { receiptStatus: manualMutationReceipt.status, receiptId: manualMutationReceipt.receiptId },
    };
    const existingIndex = actionResults.findIndex((result) => result.action === "change_application_data");
    actionResults = existingIndex >= 0
      ? actionResults.map((result, index) => index === existingIndex ? receiptResult : result)
      : [...actionResults, receiptResult];

    if (["awaiting_admin", "already_pending"].includes(manualMutationReceipt.status)) {
      try {
        await notifyV3Discord({
          event: "manual_action_required",
          applicationId: truthBeforeActions.application?.id || null,
          trackingId: truthBeforeActions.application?.trackingId || null,
          waId: input.waId,
          actionKey: "change_application_data",
          details: {
            action: "change_application_data",
            status: "pending",
            requestedChange: input.customerText,
            receiptId: manualMutationReceipt.receiptId,
          },
        });
      } catch (notificationError) {
        console.error("manual mutation receipt Discord notification failed", { turnId: input.turnId, error: notificationError });
      }
    }
  }

  reduced = closePendingMutationAfterReceipt({ state: reduced, actions: actionResults, manualReceipt: manualMutationReceipt });

  let truthAfterActions = truthBeforeActions;
  if (actionResults.some((result) => ["executed","already_done","failed"].includes(result.outcome))) {
    truthAfterActions = await resolveV3ProductionTruth({
      waId: input.waId,
      customerText: input.customerText,
      state: reduced,
      recentTurns: input.recentTurns || [],
      topics: turn.topics,
    });
  }

  const continuationIntent = contextualContinuation || explicitContinuationText(input.customerText) || turn.semantic?.decision.continuation === "confirmed" || informedCommercialContinuationConfirmed({ state: reduced, truth: truthAfterActions, turn, customerText: input.customerText });
  const disclosureRequired = shouldExplainCommercialStep({ state: reduced, truth: truthAfterActions, turn, explicitContinuationIntent: Boolean(continuationIntent) });
  const alreadyDisclosed = commercialDisclosureDelivered(reduced, truthAfterActions);
  const paymentExecutionRequired = !disclosureRequired && alreadyDisclosed && (Boolean(continuationIntent) || paymentQuestionAfterDisclosure(turn, truthAfterActions));

  const authoritativeTrackingReply = explicitStatusTracking
    ? explicitTrackingStatusReply({ trackingId: explicitStatusTracking, truth: truthAfterActions })
    : null;
  const authoritativeIdentityReply = explicitIdentityQuestion ? explicitAssistantIdentityReply({ customerText: input.customerText, state: stateWorking }) : null;
  const authoritativeSocialReply = simpleSocialClosureReply(turn, input.customerText);
  const authoritativeHumanRequestReply = humanRequestGroundedReply({ turn, state: stateWorking, truth: truthAfterActions });
  const authoritativePaymentRelativeReply = paymentRelativeReceiptGroundedReply({ truth: truthAfterActions, customerText: input.customerText });
  const authoritativeManualMutationReply = manualMutationReceiptReply(manualMutationReceipt, truthAfterActions);
  let authoritativeDeviceChangeReply: string | null = null;
  if (secureDeviceChangeRequested) {
    const app = truthAfterActions.application;
    if (!app || truthAfterActions.contactAccess !== "full") {
      authoritativeDeviceChangeReply = "لأمان الطلب، رابط تغيير الجهاز بنطلعه فقط لما تكون المحادثة مرتبطة بشكل كامل بالطلب من رقم واتساب المعتمد. ابعت رقم التتبع من نفس الرقم المرتبط بالطلب وبكمل معك مباشرة.";
    } else {
      try {
        const paymentConfirmed = hasAuthoritativePaymentConfirmation(app);
        const paymentProtected = hasPaymentProtection(truthAfterActions);
        const links = buildOfficialLinkContext(turn, truthAfterActions);
        const secureDeviceLink = paymentConfirmed
          ? buildSecureDeviceChangeUrl({ baseUrl: links.baseUrl, application: app, waId: input.waId })
          : null;
        authoritativeDeviceChangeReply = buildApplicationModificationRoutingReply({
          topics: turn.topics,
          requestedActions: ["change_device"],
          customerText: input.customerText,
          hasApplication: true,
          paymentConfirmed,
          paymentProtected,
          trackingId: app.trackingId,
          registeredPhone: app.phone,
          secureDeviceLink,
        });
      } catch {
        authoritativeDeviceChangeReply = "فهمت إنك بدك تغيّر الجهاز على نفس الطلب. تعذر توليد رابط التغيير الآمن بهاللحظة، وما رح أعتبر أي تعديل منفذ من الرسالة نفسها. جرّب معي بعد شوي وبطلعلك الرابط من نفس المحادثة.";
      }
    }
  }
  let reply = authoritativeTrackingReply || authoritativeIdentityReply || authoritativeSyntheticMediaReply || authoritativeDeviceChangeReply || manualChangeScopeBlockedReply || manualChangeConfirmationPrompt || authoritativeManualMutationReply || authoritativePaymentRelativeReply || gate.confirmationPrompt || gate.informationalReply || actionSuccessReply(truthAfterActions, actionResults) || actionFailureReply(truthAfterActions, actionResults) || authoritativeHumanRequestReply || authoritativeSocialReply;
  if (!reply && disclosureRequired) {
    reply = buildInformedCommercialDisclosureReply(truthAfterActions);
    reduced = markCommercialDisclosureDelivered(reduced, truthAfterActions, turn.turnId);
  } else if (!reply && paymentExecutionRequired) {
    reply = buildPostDisclosurePaymentReply(truthAfterActions, applicationReceiptUrl(truthAfterActions));
    reduced = markCommercialDisclosureAcknowledged(reduced, truthAfterActions, turn.turnId);
  }
  if (!reply) reply = brainReply || deterministicFallback({ turn, truth: truthAfterActions, customerText: input.customerText });

  // Phase 11.6.1 final response authority. The arbiter contains deterministic
  // contracts for review timing, refund care, payment-channel questions and
  // current-turn repair. Human OS now uses it as the final semantic veto.
  const arbitration = arbitrateProductionReply({
    candidate: reply,
    turn,
    state: reduced,
    truth: truthAfterActions,
    actions: actionResults,
  });
  reply = arbitration.reply;

  // Phase 11.7.1: commercial consent state follows the reply that actually wins
  // final egress arbitration. A correct payment/disclosure repair must persist its
  // state even when an earlier brain/journey candidate was stale or cross-domain.
  if (reply && resemblesFullCommercialDisclosure(reply) && !commercialDisclosureDelivered(reduced, truthAfterActions)) {
    reduced = markCommercialDisclosureDelivered(reduced, truthAfterActions, turn.turnId);
  }
  if (reply && resemblesPostDisclosurePaymentReply(reply)) {
    reduced = markCommercialDisclosureAcknowledged(reduced, truthAfterActions, turn.turnId);
  }

  if (gate.confirmationPrompt && arbitration.obligation !== "mutation_truth" && reply !== gate.confirmationPrompt) {
    reduced = { ...reduced, pendingAction: null, pendingActionPayload: null };
  }
  reply = reply ? sanitizeCustomerFacingStatusTokens(reply) : null;

  // Keep lastAssistantText on the previous delivered assistant turn while validating
  // this candidate. Phase 11.0 validated against its own just-written reply, which
  // manufactured similarity/repetition failures and then nulled otherwise safe text.
  reduced = { ...reduced, activeApplicationId: truthAfterActions.application?.id || reduced.activeApplicationId, activeTrackingId: truthAfterActions.application?.trackingId || reduced.activeTrackingId };

  const authoritativeGateReply = Boolean((gate.confirmationPrompt && reply === gate.confirmationPrompt) || (gate.informationalReply && reply === gate.informationalReply));
  const authoritativeArbiterReply = Boolean(arbitration.repaired || arbitration.suppressed);
  const authoritativeDeterministicReply = Boolean(authoritativeTrackingReply || authoritativeIdentityReply || authoritativeSyntheticMediaReply || authoritativeDeviceChangeReply || manualChangeScopeBlockedReply || manualChangeConfirmationPrompt || authoritativeManualMutationReply || authoritativePaymentRelativeReply || authoritativeHumanRequestReply || authoritativeSocialReply || authoritativeGateReply || authoritativeArbiterReply);
  const safety = authoritativeDeterministicReply ? AUTHORITATIVE_DETERMINISTIC_SAFETY : validateNativeConversationReply({
    reply,
    turn,
    state: reduced,
    truth: truthAfterActions,
    actions: actionResults,
    recentTurns,
    customerText: input.customerText,
    disclosureRequiredThisTurn: disclosureRequired,
    protectedFiveJodStep: paymentExecutionRequired,
  });

  let fallbackUsed = false;
  if (!safety.pass && blockingSafetyReasons(safety.reasons).length) {
    const repaired = repairReplyForSafety({
      reasons: safety.reasons,
      turn,
      truth: truthAfterActions,
      customerText: input.customerText,
      gateConfirmationPrompt: gate.confirmationPrompt,
      disclosureRequired,
      paymentExecutionRequired,
    });
    if (repaired) {
      reply = sanitizeCustomerFacingStatusTokens(repaired);
      fallbackUsed = true;
    }
  }

  const finalAuthoritativeGateReply = Boolean((gate.confirmationPrompt && reply === gate.confirmationPrompt) || (gate.informationalReply && reply === gate.informationalReply));
  const finalAuthoritativeDeterministicReply = Boolean(authoritativeTrackingReply || authoritativeIdentityReply || authoritativeSyntheticMediaReply || authoritativeDeviceChangeReply || manualChangeScopeBlockedReply || manualChangeConfirmationPrompt || authoritativeManualMutationReply || authoritativePaymentRelativeReply || authoritativeHumanRequestReply || authoritativeSocialReply || finalAuthoritativeGateReply || authoritativeArbiterReply);
  const finalSafety = finalAuthoritativeDeterministicReply ? AUTHORITATIVE_DETERMINISTIC_SAFETY : validateNativeConversationReply({
    reply,
    turn,
    state: reduced,
    truth: truthAfterActions,
    actions: actionResults,
    recentTurns,
    customerText: input.customerText,
    disclosureRequiredThisTurn: disclosureRequired,
    protectedFiveJodStep: paymentExecutionRequired,
  });
  const finalBlockingReasons = blockingSafetyReasons(finalSafety.reasons);
  const finalSafetyPass = finalBlockingReasons.length === 0;
  const qualityWarnings = finalSafety.reasons.filter((reason) => !finalBlockingReasons.includes(reason));

  // Phase 11.4 final egress ownership. A reply may have been valid when work
  // started but become stale while AI/truth/action work was running. Re-read the
  // durable conversation state immediately before committing reply/state. If any
  // other customer turn advanced ownership since this turn started, this turn is
  // completed silently and may not overwrite the newer state or send a ghost reply.
  const ownershipBeforeEgress = await currentTurnStillOwnsConversation({
    waId: input.waId,
    turnId: input.turnId,
    startLastTurnId,
    fallbackState: stateBefore,
  });
  if (!ownershipBeforeEgress.owns) {
    return supersededHumanTurnResult({
      turnId: input.turnId,
      turn,
      stateBefore,
      latestState: ownershipBeforeEgress.latestState,
      truthBeforeActions,
      truthAfterActions,
      plan,
      actions: actionResults,
      modelTier,
      modelCalls,
      interpreterError,
      realActionsEnabled: input.realActionsEnabled,
      memory,
      reason: "ownership_lost_before_egress",
    });
  }

  // Only the actually deliverable reply enters conversation memory. Quality-only
  // style warnings are observable in the journal but can no longer hand control
  // back to the legacy generic rescue path.
  if (finalSafetyPass) {
    reduced = finalizeStateSemanticMemory({ state: reduced, turn, reply, answered: Boolean(reply) });
    reduced = markRoleIntroducedFromReply({ ...reduced, lastAssistantText: reply, updatedAt: new Date().toISOString() }, reply);
  }

  const decision = humanDecisionPlane({ turn, truth: truthAfterActions, brainRequestedHuman: brainMeaning?.requiresHumanReview, brainReason: brainMeaning?.humanReviewReason });
  const memoryAfter = nextCompactHumanMemory({ before: memory, stateAfter: reduced, turn, truth: truthAfterActions });

  await checkpointHumanTurn({
    turnId: input.turnId,
    status: "reply_ready",
    modelTier,
    modelCalls,
    meaning: brainMeaning ? { ...(brainMeaning as unknown as Record<string, unknown>), safetyReasons: finalSafety.reasons, blockingSafetyReasons: finalBlockingReasons, qualityWarnings } : { deterministic: true, routeReasons: provisionalRoute.reasons, safetyReasons: finalSafety.reasons, blockingSafetyReasons: finalBlockingReasons, qualityWarnings },
    truth: truthAfterActions,
    actions: actionResults,
    finalReply: reply,
    stateAfter: reduced,
    memoryAfter,
    errorCode: finalSafetyPass ? (qualityWarnings.length ? "human_os_quality_warning" : null) : "human_os_final_safety_failed",
    errorMessage: finalSafety.reasons.length ? finalSafety.reasons.join(",") : null,
  });

  return {
    version: V3_OS_VERSION,
    turn,
    stateBefore,
    stateAfter: reduced,
    truth: truthAfterActions,
    truthBeforeActions,
    truthAfterActions,
    plan,
    actions: actionResults,
    verification: verificationFromReasons(finalBlockingReasons),
    reply: finalSafetyPass ? reply : null,
    providerUsed: modelCalls > 0,
    interpreterUsed: modelCalls > 0,
    interpreterError,
    replyAttempts: 1,
    finalSafetyPass,
    fallbackUsed,
    realActionsEnabled: input.realActionsEnabled,
    humanOs: {
      enabled: true,
      journalTurnId: input.turnId,
      modelTier,
      modelCalls,
      reusedDecision: false,
      needsHumanReview: decision.needsHumanReview,
      humanReviewReason: decision.reason,
      memoryAfter,
    },
  };
}
