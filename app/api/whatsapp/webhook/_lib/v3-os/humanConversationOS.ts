import { executeActions } from "./actionPlane";
import { buildReplyPlan } from "./planner";
import { resolveV3ProductionTruth } from "./productionTruth";
import { emptyState, reduceState, finalizeStateSemanticMemory, markRoleIntroducedFromReply } from "./state";
import { loadV3ConversationState } from "./stateStore";
import { interpretTurn } from "./interpreter";
import { v3WriterProviderFromEnv, type V3TextProvider } from "./provider";
import { v3TransactionalActionAdapter } from "./transactionalActionAdapter";
import { applicationReceiptUrl, applicationRefundUrl, sanitizeRecentTurnsForModel } from "./linkIntegrity";
import { scopeStateToCurrentApplication, scopeTurnToCurrentApplication, stampActionScope } from "./applicationScopeLock";
import { enforceMutationConfirmationGate } from "./mutationConfirmationGate";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { applicationJourneyStage } from "./applicationJourney";
import { buildInformedCommercialDisclosureReply, buildPostDisclosurePaymentReply, commercialDisclosureDelivered, informedCommercialContinuationConfirmed, markCommercialDisclosureAcknowledged, markCommercialDisclosureDelivered, shouldExplainCommercialStep } from "./informedCommercialContinuation";
import { explicitContinuationText } from "./conversationRecovery";
import { validateNativeConversationReply } from "./nativeConversationKernel";
import { loadCompactHumanMemory, nextCompactHumanMemory, type CompactHumanMemory } from "./compactHumanMemory";
import { beginHumanTurn, checkpointHumanTurn, loadHumanTurnJournal } from "./durableTurnJournal";
import { humanDecisionPlane } from "./humanDecisionPlane";
import { routeHumanModel, type HumanModelTier } from "./modelCostLadder";
import { obviousContextualContinuation, runHumanConversationBrain, type HumanBrainMeaning } from "./humanConversationBrain";
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

function deterministicFallback(input: { turn: InterpretedTurn; truth: TruthBundle; customerText: string }) {
  const app = input.truth.application;
  const stage = applicationJourneyStage(app);
  if (input.turn.topics.includes("application_status") && app) return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} موجود وحالته الحالية ${app.status || "قيد المتابعة"}.`;
  if (input.turn.topics.includes("payment_status") && app) return hasAuthoritativePaymentConfirmation(app) ? "الدفع مؤكد إداريًا على طلبك، وما في داعي تعيد الدفع أو ترفع وصل جديد." : "الدفع مش مؤكد إداريًا على الطلب لحد الآن، لذلك ما رح أعتبره مكتمل قبل اعتماد الإدارة.";
  if (input.turn.topics.includes("payment_fee")) return `رسوم فتح الملف هي ${input.truth.policy.fileOpeningFeeJod} دنانير بعد الموافقة المبدئية واختيار الاستمرار، وهي منفصلة عن ثمن الجهاز والقسط الأول، ولها مسار استرداد حسب سياسة الطلب.`;
  if (stage === "preliminary_approved_waiting_decision" && input.turn.topics.includes("continuation")) return buildInformedCommercialDisclosureReply(input.truth);
  return "وصلتني رسالتك. بدي أعتمد فقط على الحالة الفعلية لطلبك، وإذا في نقطة محددة بدك جوابها احكيلي إياها بنفس طريقتك وبكمل معك من نفس السياق.";
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

  const scopedBefore = scopeStateToCurrentApplication({ state: stateBefore, truth: truthBeforeActions, customerText: input.customerText });
  let stateWorking = { ...scopedBefore.state, activeApplicationId: truthBeforeActions.application?.id || scopedBefore.state.activeApplicationId, activeTrackingId: truthBeforeActions.application?.trackingId || scopedBefore.state.activeTrackingId };
  deterministicAnchor = scopeTurnToCurrentApplication({ turn: deterministicAnchor, applicationChanged: scopedBefore.applicationChanged });

  const contextualContinuation = obviousContextualContinuation({ customerText: input.customerText, state: stateWorking });
  if (contextualContinuation) deterministicAnchor = makeDeterministicContinuationTurn(deterministicAnchor);

  const provisionalRoute = routeHumanModel({ customerText: input.customerText, turn: deterministicAnchor, state: stateWorking, truth: truthBeforeActions, solEnabled: input.solEnabled });
  // Phase 11 explicitly has no paid shadow. Sol routing exists only as a future
  // opt-in tier; until an explicit Sol provider is wired here, high-complexity
  // traffic safely stays on the normal DeepSeek provider rather than duplicating it.
  const modelTier: HumanModelTier = provisionalRoute.tier === "sol" ? "deepseek" : provisionalRoute.tier;
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

  let reply = gate.confirmationPrompt || gate.informationalReply || actionSuccessReply(truthAfterActions, actions) || actionFailureReply(truthAfterActions, actions);
  if (!reply && disclosureRequired) {
    reply = buildInformedCommercialDisclosureReply(truthAfterActions);
    reduced = markCommercialDisclosureDelivered(reduced, truthAfterActions, turn.turnId);
  } else if (!reply && alreadyDisclosed && continuationIntent) {
    reply = buildPostDisclosurePaymentReply(truthAfterActions, applicationReceiptUrl(truthAfterActions));
    reduced = markCommercialDisclosureAcknowledged(reduced, truthAfterActions, turn.turnId);
  }
  if (!reply) reply = brainReply || deterministicFallback({ turn, truth: truthAfterActions, customerText: input.customerText });

  reduced = { ...reduced, activeApplicationId: truthAfterActions.application?.id || reduced.activeApplicationId, activeTrackingId: truthAfterActions.application?.trackingId || reduced.activeTrackingId };
  reduced = finalizeStateSemanticMemory({ state: reduced, turn, reply, answered: Boolean(reply) });
  reduced = markRoleIntroducedFromReply({ ...reduced, lastAssistantText: reply, updatedAt: new Date().toISOString() }, reply);

  const protectedFiveJodStep = disclosureRequired || (alreadyDisclosed && Boolean(continuationIntent));
  const safety = validateNativeConversationReply({
    reply,
    turn,
    state: reduced,
    truth: truthAfterActions,
    actions,
    recentTurns,
    customerText: input.customerText,
    disclosureRequiredThisTurn: disclosureRequired,
    protectedFiveJodStep,
  });
  let fallbackUsed = false;
  if (!safety.pass) {
    reply = gate.confirmationPrompt || gate.informationalReply || actionSuccessReply(truthAfterActions, actions) || actionFailureReply(truthAfterActions, actions) || deterministicFallback({ turn, truth: truthAfterActions, customerText: input.customerText });
    fallbackUsed = true;
  }

  const finalSafety = validateNativeConversationReply({
    reply,
    turn,
    state: reduced,
    truth: truthAfterActions,
    actions,
    recentTurns,
    customerText: input.customerText,
    disclosureRequiredThisTurn: disclosureRequired,
    protectedFiveJodStep,
  });
  const decision = humanDecisionPlane({ turn, truth: truthAfterActions, brainRequestedHuman: brainMeaning?.requiresHumanReview, brainReason: brainMeaning?.humanReviewReason });
  const memoryAfter = nextCompactHumanMemory({ before: memory, stateAfter: reduced, turn, truth: truthAfterActions });

  await checkpointHumanTurn({
    turnId: input.turnId,
    status: "reply_ready",
    modelTier,
    modelCalls,
    meaning: brainMeaning ? brainMeaning as unknown as Record<string, unknown> : { deterministic: true, routeReasons: provisionalRoute.reasons },
    truth: truthAfterActions,
    actions,
    finalReply: reply,
    stateAfter: reduced,
    memoryAfter,
    errorCode: finalSafety.pass ? null : "human_os_final_safety_failed",
    errorMessage: finalSafety.pass ? null : finalSafety.reasons.join(","),
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
    verification: verificationFromReasons(finalSafety.reasons),
    reply: finalSafety.pass ? reply : null,
    providerUsed: modelCalls > 0,
    interpreterUsed: modelCalls > 0,
    interpreterError,
    replyAttempts: 1,
    finalSafetyPass: finalSafety.pass,
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
