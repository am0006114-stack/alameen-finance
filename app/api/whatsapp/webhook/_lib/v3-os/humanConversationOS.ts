import { executeActions } from "./actionPlane";
import { buildReplyPlan } from "./planner";
import { resolveV3ProductionTruth } from "./productionTruth";
import { emptyState, reduceState, finalizeStateSemanticMemory, markRoleIntroducedFromReply } from "./state";
import { loadV3ConversationState } from "./stateStore";
import { interpretTurn } from "./interpreter";
import { v3WriterProviderFromEnv, type V3TextProvider } from "./provider";
import { v3TransactionalActionAdapter } from "./transactionalActionAdapter";
import { applicationReceiptUrl, applicationRefundUrl, buildOfficialLinkContext, sanitizeRecentTurnsForModel } from "./linkIntegrity";
import { scopeStateToCurrentApplication, scopeTurnToCurrentApplication, stampActionScope } from "./applicationScopeLock";
import { enforceMutationConfirmationGate } from "./mutationConfirmationGate";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildInformedCommercialDisclosureReply, buildPostDisclosurePaymentReply, commercialDisclosureDelivered, informedCommercialContinuationConfirmed, markCommercialDisclosureAcknowledged, markCommercialDisclosureDelivered, shouldExplainCommercialStep } from "./informedCommercialContinuation";
import { explicitContinuationText } from "./conversationRecovery";
import { validateNativeConversationReply } from "./nativeConversationKernel";
import { loadCompactHumanMemory, nextCompactHumanMemory, type CompactHumanMemory } from "./compactHumanMemory";
import { beginHumanTurn, checkpointHumanTurn, loadHumanTurnJournal } from "./durableTurnJournal";
import { humanDecisionPlane } from "./humanDecisionPlane";
import { routeHumanModel, type HumanModelTier } from "./modelCostLadder";
import { obviousContextualContinuation, runHumanConversationBrain, type HumanBrainMeaning } from "./humanConversationBrain";
import { markContactResolution } from "./contactIdentity";
import { buildIphone18AuthoritativeReply } from "./businessTruthRegistry";
import type { ActionResult, ConversationState, InterpretedTurn, ReplyPlan, TruthBundle, VerificationReport } from "./types";
import { V3_OS_VERSION } from "./types";

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
const AUTHORITATIVE_TRACKING_SAFETY = { pass: true, reasons: [] as string[] };

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

function deliveryGroundedReply(input: { truth: TruthBundle; customerText: string }) {
  const iphone18 = buildIphone18AuthoritativeReply(input.customerText);
  if (iphone18) return iphone18;
  return `ما في توصيل. الاستلام من المكتب بعد صدور الموافقة النهائية وبموعد رسمي مؤكد مرتبط بالطلب. ${input.truth.policy.generalLocation}.`;
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
  if (topics.has("delivery")) return deliveryGroundedReply({ truth: input.truth, customerText: input.customerText });
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
  if (reasons.some((reason) => reason.startsWith("delivery_") || reason === "grounding:iphone18_pickup_rule_missing")) return deliveryGroundedReply({ truth: input.truth, customerText: input.customerText });
  if (reasons.some((reason) => reason === "grounding:iphone18_region_missing")) return buildIphone18AuthoritativeReply(input.customerText) || deterministicFallback({ turn: input.turn, truth: input.truth, customerText: input.customerText });
  if (reasons.includes("unsupported_future_admin_or_contact_claim")) {
    return "ما رح أوعدك بمكالمة أو تواصل من موظف إذا ما في إجراء فعلي مثبت. نقدر نكمل المتابعة هون على نفس واتساب، وإذا في إجراء حقيقي بصير بنحكي عنه بعد ما يثبت بالنظام.";
  }
  const sanitized = sanitizeCustomerFacingStatusTokens(deterministicFallback({ turn: input.turn, truth: input.truth, customerText: input.customerText }));
  return sanitized || null;
}

function verificationFromReasons(reasons: string[]): VerificationReport {
  return reasons.length ? { ...PASS, pass: false, policyViolations: reasons } : PASS;
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
  const existing = await loadHumanTurnJournal(input.turnId);
  const recentTurns = sanitizeRecentTurnsForModel(input.recentTurns || []).slice(-input.maxRecentTurns);

  if (existing?.final_reply && ["reply_ready","delivered","completed"].includes(existing.status)) {
    const truth = await resolveV3ProductionTruth({ waId: input.waId, customerText: input.customerText, state: stateBefore, recentTurns: input.recentTurns || [], topics: [] });
    const anchor = interpretTurn({ turnId: input.turnId, customerText: input.customerText });
    const stateAfter = (existing.state_after_json as ConversationState | null) || stateBefore;
    return {
      version: V3_OS_VERSION,
      turn: anchor,
      stateBefore,
      stateAfter,
      truth,
      truthBeforeActions: truth,
      truthAfterActions: truth,
      plan: { objective: "replay durable decided turn", role: stateAfter.role.currentRole, answerItems: [], actions: [], requiredFacts: [], forbiddenClaims: [], tone: "brief", shouldRespond: true },
      actions: (existing.actions_json || []) as ActionResult[],
      verification: PASS,
      reply: existing.final_reply,
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
  if (explicitStatusTracking) deterministicAnchor = makeExplicitTrackingStatusTurn(deterministicAnchor);

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
  deterministicAnchor = scopeTurnToCurrentApplication({ turn: deterministicAnchor, applicationChanged: scopedBefore.applicationChanged });

  const contextualContinuation = obviousContextualContinuation({ customerText: input.customerText, state: stateWorking });
  if (contextualContinuation) deterministicAnchor = makeDeterministicContinuationTurn(deterministicAnchor);

  const provisionalRoute = routeHumanModel({ customerText: input.customerText, turn: deterministicAnchor, state: stateWorking, truth: truthBeforeActions, solEnabled: input.solEnabled });
  // Explicit tracking + status lookup is already authoritative DB work. Do not
  // pay a model to reinterpret it and do not let a legacy verifier replace it.
  const modelTier: HumanModelTier = explicitStatusTracking ? "deterministic" : (provisionalRoute.tier === "sol" ? "deepseek" : provisionalRoute.tier);
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
  let reduced = reduceState({ state: stateWorking, turn });
  let plan = buildReplyPlan({ turn, state: reduced, truth: truthBeforeActions });
  plan = { ...plan, actions: plan.actions.map((action) => stampActionScope(action, truthBeforeActions, turn.turnId)), shouldRespond: true };

  const gate = enforceMutationConfirmationGate({ actions: plan.actions, turn, state: reduced, truth: truthBeforeActions });
  plan = { ...plan, actions: gate.actions.map((action) => stampActionScope(action, truthBeforeActions, turn.turnId)), shouldRespond: true };
  reduced = updatePendingState({ state: reduced, gate, turn });

  const actions = await executeActions({
    actions: plan.actions,
    state: reduced,
    truth: truthBeforeActions,
    adapter: v3TransactionalActionAdapter,
    allowMutation: input.realActionsEnabled,
  });

  let truthAfterActions = truthBeforeActions;
  if (actions.some((result) => ["executed","already_done","failed"].includes(result.outcome))) {
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
  let reply = authoritativeTrackingReply || gate.confirmationPrompt || gate.informationalReply || actionSuccessReply(truthAfterActions, actions) || actionFailureReply(truthAfterActions, actions);
  if (!reply && disclosureRequired) {
    reply = buildInformedCommercialDisclosureReply(truthAfterActions);
    reduced = markCommercialDisclosureDelivered(reduced, truthAfterActions, turn.turnId);
  } else if (!reply && paymentExecutionRequired) {
    reply = buildPostDisclosurePaymentReply(truthAfterActions, applicationReceiptUrl(truthAfterActions));
    reduced = markCommercialDisclosureAcknowledged(reduced, truthAfterActions, turn.turnId);
  }
  if (!reply) reply = brainReply || deterministicFallback({ turn, truth: truthAfterActions, customerText: input.customerText });
  reply = sanitizeCustomerFacingStatusTokens(reply);

  // Keep lastAssistantText on the previous delivered assistant turn while validating
  // this candidate. Phase 11.0 validated against its own just-written reply, which
  // manufactured similarity/repetition failures and then nulled otherwise safe text.
  reduced = { ...reduced, activeApplicationId: truthAfterActions.application?.id || reduced.activeApplicationId, activeTrackingId: truthAfterActions.application?.trackingId || reduced.activeTrackingId };

  const safety = authoritativeTrackingReply ? AUTHORITATIVE_TRACKING_SAFETY : validateNativeConversationReply({
    reply,
    turn,
    state: reduced,
    truth: truthAfterActions,
    actions,
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

  const finalSafety = authoritativeTrackingReply ? AUTHORITATIVE_TRACKING_SAFETY : validateNativeConversationReply({
    reply,
    turn,
    state: reduced,
    truth: truthAfterActions,
    actions,
    recentTurns,
    customerText: input.customerText,
    disclosureRequiredThisTurn: disclosureRequired,
    protectedFiveJodStep: paymentExecutionRequired,
  });
  const finalBlockingReasons = blockingSafetyReasons(finalSafety.reasons);
  const finalSafetyPass = finalBlockingReasons.length === 0;
  const qualityWarnings = finalSafety.reasons.filter((reason) => !finalBlockingReasons.includes(reason));

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
    actions,
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
    actions,
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
