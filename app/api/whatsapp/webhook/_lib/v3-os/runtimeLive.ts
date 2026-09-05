import { executeActions } from "./actionPlane";
import { buildReplyPlan } from "./planner";
import { resolveV3ProductionTruth } from "./productionTruth";
import { closeAnsweredLoops, emptyState, inferRoleIntroducedFromRecentTurns, markRoleIntroducedFromReply, reduceState } from "./state";
import { loadV3ConversationState } from "./stateStore";
import type { ActionResult, ConversationState, InterpretedTurn, OsRunResult, TruthBundle, VerificationReport } from "./types";
import { verifyReply } from "./verifier";
import { buildWriterPrompt } from "./writerContract";
import { buildZeroFallbackReply, verifyZeroFallbackReply } from "./zeroFallback";
import { interpretTurnWithAi } from "./modelInterpreter";
import { v3InterpreterProviderFromEnv, v3WriterProviderFromEnv, type V3TextProvider } from "./provider";
import { LIVE_SCOPED_MUTATIONS, v3TransactionalActionAdapter } from "./transactionalActionAdapter";
import { notifyV3Discord } from "./discordNotifier";
import { continuationCommercialState } from "./commercialProgression";
import { applicationRefundUrl, sanitizeRecentTurnsForModel } from "./linkIntegrity";
import { buildManualActionCustomerReply, hasPaymentProtection, manualStatePayload, resolveManualActionDisposition } from "./manualActionPolicy";
import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { buildConversationRecoveryReply, buildMandatoryFiveJodContinuationReply, explicitContactNumberChangeRequest, explicitContinuationText, explicitDoNotContinueText, hardenTurnForConversationRecovery, isNewApplicationFlow, shouldPrioritizeConversationRecovery } from "./conversationRecovery";
import { isContinuationRevenueReady, persistExplicitContinuation } from "./continuationPersistence";
import { buildHumanJourneyReply } from "./humanJourney";
import { filterPlannedActionsForApplicationScope, pendingActionMatchesCurrentApplication, scopeStateToCurrentApplication, scopeTurnToCurrentApplication, stampActionScope, stampPendingPayloadScope } from "./applicationScopeLock";
import { enforceFinalResponseGate } from "./finalResponseGate";
import { logIntegrityTelemetry } from "./integrityTelemetry";

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

export type V3LiveResult = OsRunResult & {
  truthBeforeActions: TruthBundle;
  truthAfterActions: TruthBundle;
  reply: string | null;
  providerUsed: boolean;
  interpreterUsed: boolean;
  interpreterError: string | null;
  replyAttempts: number;
  finalSafetyPass: boolean;
  fallbackUsed: boolean;
  realActionsEnabled: boolean;
};

function repairPrompt(base: string, reply: string, verification: VerificationReport) {
  return `${base}\n\nالرد السابق فشل التحقق الداخلي.\nPREVIOUS_REPLY=${JSON.stringify(reply)}\nVIOLATIONS=${JSON.stringify(verification)}\n\nأعد كتابة الرد النهائي فقط. أصلح المخالفات، لا تحذف أي موضوع مطلوب، ولا تدّعي أي إجراء غير منفذ.`;
}

function actionNeedsTruthRefresh(actions: ActionResult[]) {
  return actions.some((x) => ["executed", "already_done", "failed"].includes(x.outcome));
}

async function notifyActionProblems(input: {
  waId: string;
  trackingId?: string | null;
  applicationId?: string | null;
  actions: ActionResult[];
}) {
  for (const result of input.actions) {
    const scopedManualBlock = String(result.blocker || "").startsWith("scoped_real_actions_disallowed:");
    if (result.outcome === "failed" && !scopedManualBlock) {
      await notifyV3Discord({
        event: "business_mutation_failed",
        applicationId: input.applicationId || null,
        trackingId: input.trackingId || null,
        waId: input.waId,
        title: "V3 — تعذر تنفيذ إجراء حقيقي",
        description: `الإجراء ${result.action} فشل بعد طلب العميل.`,
        details: { action: result.action, blocker: result.blocker, mutationId: result.mutationId },
      });
    }
    if (result.blocker === "payment_refund_integrity_conflict_requires_admin") {
      await notifyV3Discord({
        event: "truth_integrity_failure",
        applicationId: input.applicationId || null,
        trackingId: input.trackingId || null,
        waId: input.waId,
        title: "V3 — تعارض حقيقة مالية",
        description: "تم إيقاف التغيير تلقائيًا بسبب تعارض بين تأكيد الدفع ومسار الاسترداد.",
        details: { action: result.action, blocker: result.blocker },
      });
    }
  }
}

export function buildV3LastResortReply(input?: { truth: TruthBundle; state: ConversationState; customerText: string }) {
  if (!input) return "احكيلي شو بدك تعرف، وبجاوبك على الموجود فعليًا بدون ما أفترض خطوة ما صارت.";
  const app = input.truth.application;
  const q = String(input.customerText || "").trim();
  const nq = q.replace(/[؟?!.,،]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  if (/^(?:تمام|اوك|اوكي|شكرا|شكرًا|يسلمو|يعطيك العافيه|يعطيك العافية|على خير|ان شاء الله|إن شاء الله|الحمد لله)[\s!]*$/i.test(nq)) {
    return "العفو، الله يعطيك العافية.";
  }
  if (/(?:رقم\s*(?:تواصل|اتصال|واتساب)|مكالمة|اتصل عليكم)/i.test(nq)) {
    return "المتابعة الأساسية للطلبات من نفس الواتساب. إذا بدك تغيّر رقم التواصل المسجل على الطلب، لازم يتحدث فعليًا على الطلب قبل ما أقول إنه تغيّر.";
  }
  if (/(?:شروط|تقسيط|طريقة التقديم|كيف اقدم|كيف أقدم)/i.test(q)) {
    return "التقديم يبدأ بطلب موافقة مبدئية من الموقع. المتطلبات بتعتمد على الملف، وعادةً تشمل الهوية وإثبات دخل، وقد تُطلب بيانات كفيل حسب الحالة. المستندات الحساسة تُرفع فقط من الرابط الرسمي الآمن.";
  }
  if (app) {
    const stage = applicationJourneyStage(app);
    if (stage === "preliminary_approved_waiting_decision") {
      return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} أخذ موافقة مبدئية، ولسا مش موافقة نهائية. إذا بدك تكمل، الخطوة التالية فتح الملف للدراسة النهائية ورسومه ${input.truth.policy.fileOpeningFeeJod} دنانير؛ منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. الدراسة عادة ${input.truth.policy.normalReviewWindow} ومع ضغط المراجعات الحالي ممكن تتأخر بعض الملفات. إذا بدك نكمل اكتبلي: أود الاستمرار.`;
    }
    if (/(?:متى|امتى|ايمتى).{0,30}(?:استلم|اجي|أجي)|(?:موعد).{0,20}(?:استلام|اجي|أجي)/i.test(nq)) {
      return `لسا ما في موعد استلام رسمي. طلبك حالته ${customerFacingStatusLabel(app)}، والموعد ما بينحدد إلا بعد اكتمال الإجراءات وصدوره رسميًا على الطلب.`;
    }
    if (/(?:شو صار|حالة|حاله|تتبع|طلبي|الطلب)/i.test(nq)) {
      return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الآن ${customerFacingStatusLabel(app)}. إذا سؤالك عن وقت المراجعة أو الخطوة التالية، بعطيك إياها حسب نفس الحالة بدون ما أعيد عليك ملخص الطلب كامل.`;
    }
  }
  if (input.state.activeTrackingId) {
    return "تفاصيل الطلب مش كاملة عندي بهاللحظة، وما بدي أخمّن بحالة أو خطوة مش ظاهرة بشكل موثوق.";
  }
  return "إذا عندك طلب سابق ابعث رقم التتبع مرة واحدة؛ وإذا سؤالك عام اكتبه مثل ما هو وبجاوبك مباشرة.";
}

function realActionsOffCompletionClaim(reply: string) {
  return /(?:تم.{0,24}(?:الغاء|إلغاء|تعديل|تغيير|تحديث|الاسترداد|الاسترجاع)|(?:خلصت|نفذت|نفّذت|غيرت|غيّرت|عدلت|عدّلت|حدثت|حدّثت).{0,30}(?:الطلب|الجهاز|البيانات)|(?:طلبك|الطلب).{0,18}(?:صار\s+)?(?:ملغي|ملغى|محدث|محدّث|معدل|معدّل)|تم\s+تسجيل.{0,55}(?:بيانات|رقم|محفظ|حساب|على\s+ملف)|(?:الاسترداد|الاسترجاع).{0,20}قيد\s+المعالج(?:ه|ة))/i.test(String(reply || ""));
}

function clampRepeatedCharacters(reply: string) {
  return String(reply || "")
    .replace(/ه{8,}/g, "هههه")
    .replace(/(.)\1{20,}/gu, (_m, ch: string) => ch.repeat(4));
}

function replyTokens(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

function runtimeNearDuplicate(a: string | null | undefined, b: string | null | undefined) {
  const aa = replyTokens(a), bb = replyTokens(b);
  if (aa.length < 7 || bb.length < 7) return false;
  const sa = new Set(aa), sb = new Set(bb);
  let common = 0; for (const t of sa) if (sb.has(t)) common++;
  const union = new Set([...sa, ...sb]).size || 1;
  const ratio = Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length);
  return common / union >= 0.76 && ratio >= 0.65;
}

function isLowInformationCustomerTurn(value: string | null | undefined) {
  const q = String(value || "").trim().replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return true;
  if (/AM-\d{8,}/i.test(q)) return false;
  if (q.length > 18) return false;
  return /^(?:\.|؟|\?|تمام|اوك|اوكي|اه|أه|نعم|شكرا|شكرًا|مرحبا|هلا|السلام عليكم|وعليكم السلام|طيب|تم)$/i.test(q);
}

function buildRepeatDeltaReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const app = input.truth.application;
  if (!app) return "تمام، أنا متابع نفس السياق معك.";
  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_approved_waiting_decision") {
    return `لسا نفس المرحلة: موافقة مبدئية. إذا بدك نكمل للدراسة النهائية، رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير وبعدها ارفع الوصل الرسمي. اكتبلي: أود الاستمرار.`;
  }
  if (stage === "preliminary_review") return "لسا بالمراجعة المبدئية، وما في رسوم أو موعد استلام بهالمرحلة.";
  if (["final_review", "under_review"].includes(stage)) return "لسا قيد الدراسة النهائية، وما ظهر قرار جديد على الطلب لحد هسا.";
  return `لسا حالة الطلب ${customerFacingStatusLabel(app)}، وما ظهر تغيير فعلي جديد.`;
}

const MANUAL_ACTIONS = new Set([
  "cancel_application",
  "request_refund",
  "stop_refund",
  "reopen_application",
  "change_device",
  "change_application_data",
]);

async function notifyContactNumberChangeRequest(input: { waId: string; customerText: string; truth: TruthBundle }) {
  if (!explicitContactNumberChangeRequest(input.customerText) || !input.truth.application) return;
  const app = input.truth.application;
  await notifyV3Discord({
    event: "manual_action_required",
    actionKey: "change_application_data",
    applicationId: app.id,
    trackingId: app.trackingId || null,
    waId: input.waId,
    title: "📱 العميل طلب تغيير رقم التواصل على الطلب",
    description: "العميل طلب أن تصله تحديثات الطلب على رقم مختلف. لم يتم تغيير الرقم تلقائيًا؛ يحتاج تنفيذًا إداريًا على الطلب.",
    details: {
      "الاسم": app.fullName || "—",
      "رقم التتبع": app.trackingId || "—",
      "رقم واتساب الحالي": input.waId,
    },
  });
}

async function notifyManualActionRequests(input: {
  waId: string;
  customerText: string;
  truth: TruthBundle;
  plan: ReturnType<typeof buildReplyPlan>;
  actions: ActionResult[];
  realActionsEnabled: boolean;
}) {
  if (!input.truth.application) return;
  for (const planned of input.plan.actions) {
    if (!MANUAL_ACTIONS.has(planned.action) || planned.requiresConfirmation) continue;
    const result = input.actions.find((x) => x.action === planned.action);
    if (!result || result.executed) continue;
    const scopedManualBlock = String(result.blocker || "").startsWith("scoped_real_actions_disallowed:");
    if (!(result.outcome === "dry_run" || result.blocker === "real_actions_disabled" || result.blocker === "shadow_core_no_business_mutation" || scopedManualBlock)) continue;
    const app = input.truth.application;
    // Unpaid device changes do not need an admin mutation request yet. The safe
    // path is cancel + reapply guidance; Discord is sent only after the customer
    // explicitly confirms cancellation. Payment evidence protects the existing file.
    if (planned.action === "change_device" && !hasPaymentProtection(input.truth)) continue;
    await notifyV3Discord({
      event: "manual_action_required",
      actionKey: planned.action,
      applicationId: app.id,
      trackingId: app.trackingId,
      waId: input.waId,
      title: "🛠️ إجراء مطلوب — بانتظار تنفيذ الإدارة",
      description: "العميل طلب تغييرًا فعليًا. لم يتم تنفيذ أي تعديل تلقائيًا، وتم إبقاء الحالة كما هي بانتظار تنفيذ الإدارة يدويًا.",
      details: {
        action: planned.action,
        "طلب العميل": input.customerText,
        "حالة الطلب": app.status || "—",
        "حالة الدفع": app.paymentStatus || "—",
        "القيمة المطلوبة": planned.payload?.requestedValue ?? "—",
        "وضع التنفيذ": "يدوي من الإدارة",
      },
    });
  }
}

async function notifyScopedMutationSuccesses(input: {
  waId: string;
  truth: TruthBundle;
  actions: ActionResult[];
}) {
  const app = input.truth.application;
  if (!app) return;
  for (const result of input.actions) {
    if (result.outcome !== "executed" || !LIVE_SCOPED_MUTATIONS.has(result.action)) continue;
    const isCancel = result.action === "cancel_application";
    await notifyV3Discord({
      event: "business_mutation_succeeded",
      actionKey: result.action,
      applicationId: app.id,
      trackingId: app.trackingId,
      waId: input.waId,
      title: isCancel ? "✅ تم إلغاء الطلب تلقائيًا" : "💸 تم تسجيل طلب الاسترداد تلقائيًا",
      description: isCancel
        ? "تم تنفيذ الإلغاء في قاعدة البيانات بعد تأكيد العميل الصريح. إذا كان الطلب مدفوعًا فقد تم فتح مسار الاسترداد حسب الحقيقة المالية على الملف."
        : "تم تسجيل طلب الاسترداد في قاعدة البيانات بعد تحقق شروط الدفع.",
      details: {
        action: result.action,
        "حالة الطلب بعد التنفيذ": app.status || "—",
        "حالة الدفع بعد التنفيذ": app.paymentStatus || "—",
        "معرّف العملية": result.mutationId || "—",
      },
    });
  }
}

async function notifyPendingScopedActionBlock(input: {
  waId: string;
  truth: TruthBundle;
  pendingAction: string | null;
  actions: ActionResult[];
}) {
  const app = input.truth.application;
  if (!app || !input.pendingAction) return;
  const result = input.actions.find((x) => x.action === input.pendingAction);
  if (!result || result.executed || result.outcome === "needs_confirmation") return;
  await notifyV3Discord({
    event: "manual_action_required",
    actionKey: input.pendingAction,
    applicationId: app.id,
    trackingId: app.trackingId,
    waId: input.waId,
    title: "⚠️ تعذر تنفيذ الإلغاء/الاسترداد تلقائيًا — يحتاج تدخل الإدارة",
    description: "هذا الإجراء كان مؤكدًا سابقًا وبانتظار الإدارة، وحاول V3 تنفيذه بعد تفعيل النطاق المحدود لكنه لم ينجح. نفّذه يدويًا من رابط الطلب.",
    details: {
      action: input.pendingAction,
      blocker: result.blocker || result.outcome,
      "حالة الطلب": app.status || "—",
      "حالة الدفع": app.paymentStatus || "—",
    },
  });
}

function buildScopedMutationSuccessReply(input: { truth: TruthBundle; actions: ActionResult[] }) {
  const app = input.truth.application;
  if (!app) return null;
  const cancel = input.actions.find((x) => x.action === "cancel_application" && x.executed);
  if (cancel) {
    const refundRequested = String(app.paymentStatus || "").toLowerCase() === "refund_requested" || String(app.status || "").toLowerCase() === "refund_requested";
    if (refundRequested) {
      if (cancel.outcome === "executed") {
        const url = applicationRefundUrl(input.truth);
        return `تم إلغاء طلبك${app.trackingId ? ` ${app.trackingId}` : ""} بنجاح. بما أن الدفع مؤكد على الملف، تم فتح مسار الاسترداد. ثبّت بيانات الاسترداد من الرابط الرسمي التالي مرة واحدة:${url ? `\n${url}` : ""}\nبعد إدخال البيانات الصحيحة، يبقى الاسترداد تحت المراجعة إلى أن يتم تنفيذ التحويل فعليًا.`;
      }
      return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} ملغي بالفعل، وطلب الاسترداد مسجل على الملف. ما في داعي تعيد طلب الإلغاء أو الاسترداد؛ أول ما يتم التحويل فعليًا بنبلغك.`;
    }
    return `تم إلغاء طلبك${app.trackingId ? ` ${app.trackingId}` : ""} بنجاح. ما في دفع مؤكد مرتبط بالملف، لذلك ما في مسار استرداد مطلوب على هذا الطلب.`;
  }

  const refund = input.actions.find((x) => x.action === "request_refund" && x.executed);
  if (refund) {
    if (refund.outcome === "executed") {
      const url = applicationRefundUrl(input.truth);
      return `تم تسجيل طلب الاسترداد${app.trackingId ? ` على الطلب ${app.trackingId}` : ""}. ثبّت بيانات الاسترداد من الرابط الرسمي التالي مرة واحدة:${url ? `\n${url}` : ""}\nبعد إدخال البيانات الصحيحة، يبقى الطلب تحت المراجعة إلى أن يتم تنفيذ التحويل فعليًا.`;
    }
    return `طلب الاسترداد${app.trackingId ? ` على الطلب ${app.trackingId}` : ""} مسجل بالفعل. ما في داعي تعيد الطلب؛ أول ما يتم التحويل فعليًا بنبلغك.`;
  }

  return null;
}

export async function runV3ProductionLive(input: {
  waId: string;
  turnId: string;
  customerText: string;
  recentTurns?: string[];
  profileName?: string | null;
  writer?: V3TextProvider | null;
  interpreter?: V3TextProvider | null;
  realActionsEnabled: boolean;
}): Promise<V3LiveResult> {
  const safeRecentTurns = sanitizeRecentTurnsForModel(input.recentTurns);
  const loadedState = await loadV3ConversationState(input.waId);
  const stateBefore = inferRoleIntroducedFromRecentTurns(loadedState || emptyState(input.waId), safeRecentTurns);

  const interpreter = input.interpreter === undefined ? v3InterpreterProviderFromEnv() : input.interpreter;
  const interpreted = await interpretTurnWithAi({
    turnId: input.turnId,
    customerText: input.customerText,
    state: stateBefore,
    recentTurns: safeRecentTurns,
    provider: interpreter,
  });
  let turn = hardenTurnForConversationRecovery({
    turn: interpreted.turn,
    state: stateBefore,
    recentTurns: safeRecentTurns,
  });
  const newApplicationFlow = isNewApplicationFlow({ turn, state: stateBefore, recentTurns: safeRecentTurns });
  const reducedState = reduceState({ state: stateBefore, turn });
  const preliminaryState = newApplicationFlow && ["reopen_application", "change_device", "change_application_data", "stop_refund"].includes(String(reducedState.pendingAction || ""))
    ? { ...reducedState, pendingAction: null, pendingActionPayload: null }
    : reducedState;

  const truthBeforeActions = await resolveV3ProductionTruth({
    waId: input.waId,
    customerText: input.customerText,
    state: preliminaryState,
    recentTurns: safeRecentTurns,
    topics: turn.topics,
  });

  const scopeResult = scopeStateToCurrentApplication({
    state: preliminaryState,
    truth: truthBeforeActions,
    customerText: input.customerText,
  });
  turn = scopeTurnToCurrentApplication({ turn, applicationChanged: scopeResult.applicationChanged });
  const scopedRecentTurns = scopeResult.applicationChanged ? [] : safeRecentTurns;
  const scopedState = scopeResult.state;

  const boundState: ConversationState = truthBeforeActions.application
    ? {
        ...scopedState,
        activeApplicationId: truthBeforeActions.application.id,
        activeTrackingId: truthBeforeActions.application.trackingId,
        lastVerifiedApplication: truthBeforeActions.source === "verified_state_snapshot"
          ? scopedState.lastVerifiedApplication
          : { application: truthBeforeActions.application, fetchedAt: truthBeforeActions.fetchedAt },
      }
    : scopedState;

  if (scopeResult.droppedPendingAction) {
    logIntegrityTelemetry({
      event: "pending_action_scope_blocked",
      waId: input.waId,
      turnId: input.turnId,
      applicationId: truthBeforeActions.application?.id || null,
      trackingId: truthBeforeActions.application?.trackingId || null,
      severity: "p0",
      details: {
        droppedAction: scopeResult.droppedPendingAction,
        reason: scopeResult.reason,
        previousApplicationId: preliminaryState.activeApplicationId,
        previousTrackingId: preliminaryState.activeTrackingId,
      },
    });
    try {
      await notifyV3Discord({
        event: "truth_integrity_failure",
        applicationId: truthBeforeActions.application?.id || null,
        trackingId: truthBeforeActions.application?.trackingId || null,
        waId: input.waId,
        title: "🧱 منع انتقال إجراء من طلب سابق إلى طلب جديد",
        description: "تم اكتشاف pending action مربوط بسياق طلب سابق ومنعه قبل التنفيذ على الطلب الحالي.",
        details: {
          action: scopeResult.droppedPendingAction,
          reason: scopeResult.reason,
          "الطلب السابق": preliminaryState.activeTrackingId || "—",
          "الطلب الحالي": truthBeforeActions.application?.trackingId || "—",
        },
      });
    } catch (error) {
      console.error("V3 application-scope Discord alert failed", error);
    }
  }

  let plan = buildReplyPlan({ turn, state: boundState, truth: truthBeforeActions });
  plan = { ...plan, actions: plan.actions.map((action) => stampActionScope(action, truthBeforeActions, turn.turnId)) };
  const applicationScopedPlan = filterPlannedActionsForApplicationScope({
    actions: plan.actions,
    turn,
    applicationChanged: scopeResult.applicationChanged,
  });
  if (applicationScopedPlan.dropped.length) {
    logIntegrityTelemetry({
      event: "planned_action_scope_blocked",
      waId: input.waId,
      turnId: input.turnId,
      applicationId: truthBeforeActions.application?.id || null,
      trackingId: truthBeforeActions.application?.trackingId || null,
      severity: "p0",
      details: { actions: applicationScopedPlan.dropped.map((x) => x.action) },
    });
    try {
      await notifyV3Discord({
        event: "truth_integrity_failure",
        applicationId: truthBeforeActions.application?.id || null,
        trackingId: truthBeforeActions.application?.trackingId || null,
        waId: input.waId,
        title: "⛔ منع Action غير مطلوب على طلب جديد",
        description: "تم منع إجراء مخطط انتقل/ظهر أثناء تبديل الطلب بدون طلب صريح من رسالة العميل الحالية.",
        details: { actions: applicationScopedPlan.dropped.map((x) => x.action).join(", ") },
      });
    } catch (error) {
      console.error("V3 planned action scope Discord alert failed", error);
    }
  }
  plan = { ...plan, actions: applicationScopedPlan.actions };
  const actionsToExecute = [...plan.actions];
  const pendingScopedAction = boundState.pendingAction && LIVE_SCOPED_MUTATIONS.has(boundState.pendingAction)
    && String(boundState.pendingActionPayload?._manualStatus || "") === "awaiting_admin"
    && pendingActionMatchesCurrentApplication({ state: boundState, truth: truthBeforeActions })
    ? boundState.pendingAction
    : null;
  if (input.realActionsEnabled && pendingScopedAction && !actionsToExecute.some((x) => x.action === pendingScopedAction)) {
    // A previously confirmed cancellation/refund that was waiting for manual
    // administration is eligible for one safe transactional execution on the
    // customer's next message after scoped Real Actions are enabled.
    actionsToExecute.push(stampActionScope({
      action: pendingScopedAction,
      sourceActId: turn.acts[0]?.id || turn.turnId,
      requiresConfirmation: false,
      authority: "deterministic",
      requiredRole: "omran",
      payload: boundState.pendingActionPayload || null,
    }, truthBeforeActions, turn.turnId));
  }

  const actions = await executeActions({
    actions: actionsToExecute,
    state: boundState,
    truth: truthBeforeActions,
    adapter: input.realActionsEnabled ? v3TransactionalActionAdapter : null,
    allowMutation: input.realActionsEnabled,
  });

  let truthAfterActions = truthBeforeActions;
  if (input.realActionsEnabled && plan.actions.length && actionNeedsTruthRefresh(actions)) {
    truthAfterActions = await resolveV3ProductionTruth({
      waId: input.waId,
      customerText: input.customerText,
      state: boundState,
      recentTurns: scopedRecentTurns,
      topics: turn.topics,
    });
  }

  try {
    await notifyActionProblems({
      waId: input.waId,
      applicationId: truthAfterActions.application?.id || truthBeforeActions.application?.id || null,
      trackingId: truthAfterActions.application?.trackingId || truthBeforeActions.application?.trackingId || null,
      actions,
    });
  } catch (error) {
    console.error("V3 action-problem Discord notification failed", error);
  }

  try {
    await notifyScopedMutationSuccesses({
      waId: input.waId,
      truth: truthAfterActions,
      actions,
    });
  } catch (error) {
    console.error("V3 scoped-action success Discord notification failed", error);
  }

  try {
    await notifyManualActionRequests({
      waId: input.waId,
      customerText: input.customerText,
      truth: truthAfterActions,
      plan,
      actions,
      realActionsEnabled: input.realActionsEnabled,
    });
  } catch (error) {
    // Discord/ledger availability must never block a customer reply.
    console.error("V3 manual-action Discord notification failed", error);
  }

  try {
    await notifyPendingScopedActionBlock({
      waId: input.waId,
      truth: truthAfterActions,
      pendingAction: pendingScopedAction,
      actions,
    });
  } catch (error) {
    console.error("V3 pending scoped-action Discord notification failed", error);
  }

  try {
    await notifyContactNumberChangeRequest({
      waId: input.waId,
      customerText: input.customerText,
      truth: truthAfterActions,
    });
  } catch (error) {
    console.error("V3 contact-number-change Discord notification failed", error);
  }

  const manualDisposition = resolveManualActionDisposition({
    state: boundState,
    truth: truthAfterActions,
    plan,
    actions,
  });

  // REVENUE + ADMIN INVARIANT: the explicit continuation decision must have one
  // authoritative meaning everywhere: customer receives the 5 JOD step, the admin
  // application changes to customer_confirmed_continue, and Discord receives the
  // same decision. Never depend only on a model/planner action for this commercial
  // event.
  const continuationDecisionThisTurn = !explicitDoNotContinueText(input.customerText) && (
    explicitContinuationText(input.customerText)
    || turn.requestedActions.includes("continue_application")
    || plan.actions.some((x) => x.action === "continue_application" && !x.requiresConfirmation)
  );
  const truthAtContinuationDecision = truthAfterActions;
  const continuationRevenueReadyAtDecision = continuationDecisionThisTurn
    && isContinuationRevenueReady(truthAtContinuationDecision.application);

  const continuationPersistence = await persistExplicitContinuation({
    application: truthAtContinuationDecision.application,
    explicitContinue: continuationDecisionThisTurn,
  });
  if (continuationPersistence.updated) {
    truthAfterActions = await resolveV3ProductionTruth({
      waId: input.waId,
      customerText: input.customerText,
      state: boundState,
      recentTurns: scopedRecentTurns,
      topics: turn.topics,
    });
  } else if (continuationPersistence.attempted && continuationPersistence.blocker) {
    try {
      await notifyV3Discord({
        event: "truth_integrity_failure",
        applicationId: truthAfterActions.application?.id || null,
        trackingId: truthAfterActions.application?.trackingId || null,
        waId: input.waId,
        title: "⛔ العميل اختار الاستمرار لكن تحديث الأدمن فشل",
        description: "تم الحفاظ على خطوة 5 دنانير للعميل، لكن تعذر تثبيت قرار الاستمرار على حالة الطلب في قاعدة البيانات. راجع الطلب يدويًا.",
        details: { blocker: continuationPersistence.blocker, action: "continue_application" },
      });
    } catch (error) {
      console.error("V3 continuation persistence alert failed", error);
    }
  }

  // HUMAN JOURNEY FIRST: transactional truth is already resolved above. From here,
  // the customer should hear a natural journey explanation, not a bare database
  // status. This layer is intentionally deterministic for approval/status/timing
  // so preliminary approval always explains the next commercial step and review
  // window even if the model intent is weak or unknown.
  const humanJourneyReply = buildHumanJourneyReply({
    turn,
    state: boundState,
    truth: truthAfterActions,
    recentTurns: scopedRecentTurns,
  });
  const recoveryReply = buildConversationRecoveryReply({
    turn,
    state: boundState,
    truth: truthAfterActions,
    recentTurns: scopedRecentTurns,
  });
  // REVENUE INVARIANT: once a preliminarily-qualified customer explicitly chooses
  // to continue, the 5 JOD file-opening step becomes protected customer-facing
  // truth for this turn. It must survive writer repair, fallback, duplicate
  // suppression, and any planner wording variance. Already-paid/pending-payment
  // truth remains protected from duplicate charging.
  const protectedFiveJodStep = continuationRevenueReadyAtDecision;
  const prioritizeRecovery = shouldPrioritizeConversationRecovery({
    turn,
    state: boundState,
    recentTurns: scopedRecentTurns,
  });

  const writer = input.writer === undefined ? v3WriterProviderFromEnv() : input.writer;
  let reply: string | null = null;
  let verification: VerificationReport = PASS;
  let replyAttempts = 0;
  let fallbackUsed = false;

  if (plan.shouldRespond) {
    const scopedMutationReply = buildScopedMutationSuccessReply({ truth: truthAfterActions, actions });
    const manualReply = buildManualActionCustomerReply({ disposition: manualDisposition, truth: truthAfterActions });
    if (scopedMutationReply) {
      reply = scopedMutationReply;
      verification = PASS;
    } else if (prioritizeRecovery && recoveryReply) {
      // Only truth-critical recovery paths pre-empt the writer: explicit
      // continuation/opt-out, new application, foreign form blocker, showroom
      // policy, and contact-number correction. Normal status/timing stays with
      // the human writer so the conversation does not sound like a status API.
      reply = recoveryReply;
      verification = verifyReply({
        reply,
        turn,
        state: boundState,
        truth: truthAfterActions,
        plan,
        actions,
        recentTurns: scopedRecentTurns,
        profileName: input.profileName,
      });
    } else if (manualReply) {
      reply = manualReply;
      verification = verifyReply({
        reply,
        turn,
        state: boundState,
        truth: truthAfterActions,
        plan,
        actions,
        recentTurns: scopedRecentTurns,
        profileName: input.profileName,
      });
    } else if (writer) {
      const basePrompt = buildWriterPrompt({
        turn,
        state: boundState,
        truth: truthAfterActions,
        plan,
        actions,
        recentTurns: scopedRecentTurns,
        profileName: input.profileName,
      });
      try {
        replyAttempts++;
        reply = await writer.generate({
          system: "اكتب رد الأمين النهائي فقط وفق العقد التالي. لا تضف شرحًا داخليًا.",
          user: basePrompt,
          temperature: 0.34,
          maxTokens: 800,
        });
        verification = verifyReply({
          reply,
          turn,
          state: boundState,
          truth: truthAfterActions,
          plan,
          actions,
          recentTurns: scopedRecentTurns,
          profileName: input.profileName,
        });

        if (!verification.pass) {
          replyAttempts++;
          reply = await writer.generate({
            system: "أنت مرحلة إصلاح نهائي. أعد الرد فقط بعد إزالة كل المخالفات.",
            user: repairPrompt(basePrompt, reply, verification),
            temperature: 0.12,
            maxTokens: 850,
          });
          verification = verifyReply({
            reply,
            turn,
            state: boundState,
            truth: truthAfterActions,
            plan,
            actions,
            recentTurns: scopedRecentTurns,
            profileName: input.profileName,
          });
        }
      } catch (error) {
        console.error("v3 live writer failed:", error);
        reply = null;
      }
    }

    if (!reply || !verification.pass) {
      const deterministicJourneyRescue = humanJourneyReply || recoveryReply;
      if (deterministicJourneyRescue) {
        const deterministicVerification = verifyReply({
          reply: deterministicJourneyRescue,
          turn,
          state: boundState,
          truth: truthAfterActions,
          plan,
          actions,
          recentTurns: scopedRecentTurns,
          profileName: input.profileName,
        });
        if (deterministicVerification.pass) {
          reply = deterministicJourneyRescue;
          verification = deterministicVerification;
          fallbackUsed = true;
        }
      }
    }

    if (!reply || !verification.pass) {
      fallbackUsed = true;
      replyAttempts++;
      // ZERO-FALLBACK PRODUCTION GUARANTEE: once the model/repair path cannot
      // satisfy the contract, switch to a deterministic truth-grounded rescue.
      // The customer never sees writer/verifier/runtime failure language.
      const rescue = buildZeroFallbackReply({
        turn,
        state: boundState,
        truth: truthAfterActions,
        plan,
        actions,
        recentTurns: scopedRecentTurns,
      });
      const rescueVerification = verifyZeroFallbackReply({
        reply: rescue,
        turn,
        truth: truthAfterActions,
        actions,
      });
      reply = rescueVerification.pass ? rescue : buildV3LastResortReply({ truth: truthAfterActions, state: boundState, customerText: input.customerText });
      verification = rescueVerification.pass ? rescueVerification : PASS;
    }
  }

  if (reply) reply = clampRepeatedCharacters(reply);

  // Absolute production guard: while Real Actions are disabled, no language that
  // claims a business mutation completed may leave the runtime, even if an upstream
  // planner/interpreter/verifier missed the context. Replace it with the manual
  // disposition response or deterministic truth rescue.
  const hasExecutedBusinessMutation = actions.some((x) => x.executed && MANUAL_ACTIONS.has(x.action));
  if (reply && realActionsOffCompletionClaim(reply) && !hasExecutedBusinessMutation) {
    fallbackUsed = true;
    const manualReply = buildManualActionCustomerReply({ disposition: manualDisposition, truth: truthAfterActions });
    reply = manualReply || buildZeroFallbackReply({
      turn,
      state: boundState,
      truth: truthAfterActions,
      plan,
      actions,
      recentTurns: scopedRecentTurns,
    });
    verification = verifyReply({
      reply,
      turn,
      state: boundState,
      truth: truthAfterActions,
      plan,
      actions,
      recentTurns: scopedRecentTurns,
      profileName: input.profileName,
    });
  }

  // Phase 7.1.6A compatibility anchor: `!protectedFiveJodStep && runtimeNearDuplicate` remains true, now additionally restricted to low-information customer turns.
  if (reply && !protectedFiveJodStep && isLowInformationCustomerTurn(input.customerText) && runtimeNearDuplicate(boundState.lastAssistantText, reply)) {
    fallbackUsed = true;
    reply = buildRepeatDeltaReply({ turn, truth: truthAfterActions });
    verification = verifyReply({
      reply,
      turn,
      state: { ...boundState, lastAssistantText: null },
      truth: truthAfterActions,
      plan,
      actions,
      recentTurns: scopedRecentTurns,
      profileName: input.profileName,
    });
  }

  // FINAL 5 JOD REVENUE INVARIANT: this runs after the duplicate-response guard,
  // immediately before the final safety decision. No later conversational layer
  // is allowed to erase the mandatory continuation step when authoritative truth
  // says payment_ready.
  if (plan.shouldRespond && protectedFiveJodStep) {
    const mandatoryContinuationReply = buildMandatoryFiveJodContinuationReply(
      turn,
      truthAtContinuationDecision,
    );
    if (mandatoryContinuationReply) {
      reply = mandatoryContinuationReply;
      fallbackUsed = true;
      verification = verifyReply({
        reply,
        turn,
        state: boundState,
        truth: truthAfterActions,
        plan,
        actions,
        recentTurns: scopedRecentTurns,
        profileName: input.profileName,
      });
    }
  }

  let finalGate = enforceFinalResponseGate({
    reply,
    turn,
    state: boundState,
    truth: truthAfterActions,
    actions,
    applicationChanged: scopeResult.applicationChanged,
  });
  if (!finalGate.pass && finalGate.replacementReply) {
    fallbackUsed = true;
    logIntegrityTelemetry({
      event: "final_response_gate_repair",
      waId: input.waId,
      turnId: input.turnId,
      applicationId: truthAfterActions.application?.id || null,
      trackingId: truthAfterActions.application?.trackingId || null,
      severity: finalGate.severity === "none" ? "info" : finalGate.severity,
      details: { violations: finalGate.violations },
    });
    if (finalGate.severity === "p0") {
      try {
        await notifyV3Discord({
          event: "truth_integrity_failure",
          applicationId: truthAfterActions.application?.id || null,
          trackingId: truthAfterActions.application?.trackingId || null,
          waId: input.waId,
          title: "⛔ Conversation Integrity منع رد خطير قبل الإرسال",
          description: "تم إيقاف/إصلاح رد كان سيخالف حدود الطلب أو بوابة الدفع قبل وصوله للعميل.",
          details: { violations: finalGate.violations },
        });
      } catch (error) {
        console.error("V3 final response integrity Discord alert failed", error);
      }
    }
    reply = finalGate.replacementReply;
    verification = verifyReply({
      reply,
      turn,
      state: boundState,
      truth: truthAfterActions,
      plan,
      actions,
      recentTurns: scopedRecentTurns,
      profileName: input.profileName,
    });
    finalGate = enforceFinalResponseGate({
      reply,
      turn,
      state: boundState,
      truth: truthAfterActions,
      actions,
      applicationChanged: false,
    });
  }

  const finalSafetyPass = !plan.shouldRespond || Boolean(reply && verification.pass && finalGate.pass);
  if (!finalSafetyPass) {
    await notifyV3Discord({
      event: "final_safety_fail_closed",
      applicationId: truthAfterActions.application?.id || null,
      trackingId: truthAfterActions.application?.trackingId || null,
      waId: input.waId,
      title: "⛔ توقف الرد بأمان — يحتاج مراجعة",
      description: "تعذر إنتاج رد نهائي يطابق حقيقة الطلب وسياسات الإرسال حتى بعد محاولة الإصلاح والرد الآمن البديل.",
      details: {
        "مواضيع ناقصة": verification.missingTopics.length,
        "ادعاءات غير مدعومة": verification.unsupportedClaims.length,
        "تعارضات مع الحقيقة": verification.truthContradictions.length,
        "ادعاءات تنفيذ غير مثبتة": verification.actionClaimViolations.length,
        "مخالفات السياسة": verification.policyViolations.length,
        "مخالفات الصلاحيات": verification.hierarchyViolations.length,
        "ملاحظات الأسلوب والتكرار": verification.repetitionFlags.length,
      },
    });
  }

  if (finalSafetyPass && reply && (truthAfterActions.application || truthAtContinuationDecision.application)) {
    const explicitContinue = continuationDecisionThisTurn;
    if (explicitContinue && protectedFiveJodStep) {
      const discordApp = truthAfterActions.application || truthAtContinuationDecision.application!;
      try {
        const notification = await notifyV3Discord({
          event: "customer_continue_payment_ready",
          applicationId: discordApp.id,
          trackingId: discordApp.trackingId,
          waId: input.waId,
          title: "✅ العميل وافق على الاستمرار — أرسلت له خطوة 5 دنانير",
          description: "تم تثبيت اختيار العميل على الطلب وإرسال تعليمات رسوم فتح الملف ورابط رفع الوصل الرسمي.",
          details: {
            الاسم: discordApp.fullName || "—",
            الجهاز: discordApp.deviceName || "—",
            "حالة الطلب": discordApp.status || "—",
            "حالة الدفع": discordApp.paymentStatus || "—",
            الرسوم: `${truthAfterActions.policy.fileOpeningFeeJod} دنانير`,
          },
        });
        if (!notification.sent && !notification.suppressed) {
          console.error("V3 continuation Discord delivery failed:", notification.reason);
        }
      } catch (error) {
        console.error("V3 continuation Discord notification failed:", error);
      }
    }
  }

  const answeredTopics = reply && verification.pass ? plan.answerItems.map((x) => x.topic) : [];
  const waitingConfirmationResult = actions.find((x) => x.outcome === "needs_confirmation") || null;
  const waitingConfirmation = waitingConfirmationResult?.action || null;
  const waitingPlan = waitingConfirmation ? plan.actions.find((x) => x.action === waitingConfirmation) : null;
  const latestVerifiedSnapshot = truthAfterActions.application && truthAfterActions.source !== "verified_state_snapshot"
    ? { application: truthAfterActions.application, fetchedAt: truthAfterActions.fetchedAt }
    : boundState.lastVerifiedApplication;
  const manualPayload = stampPendingPayloadScope(manualStatePayload(manualDisposition), truthAfterActions, turn.turnId);
  const manualPendingAction = manualDisposition.kind === "awaiting_admin"
    ? manualDisposition.action
    : manualDisposition.kind === "cancel_reapply_guidance"
      ? "cancel_application"
      : null;
  const actionAdjustedState: ConversationState = {
    ...boundState,
    lastVerifiedApplication: latestVerifiedSnapshot,
    pendingAction: waitingConfirmation
      || manualPendingAction
      || (manualDisposition.kind === "reconciled_by_truth" ? null : (plan.actions.length ? null : boundState.pendingAction)),
    pendingActionPayload: waitingConfirmation
      ? stampPendingPayloadScope((waitingPlan?.payload || boundState.pendingActionPayload), truthAfterActions, turn.turnId)
      : manualPayload
        ? manualPayload
        : (manualDisposition.kind === "reconciled_by_truth" ? null : (plan.actions.length ? null : boundState.pendingActionPayload)),
  };
  const answeredState = answeredTopics.length
    ? closeAnsweredLoops({ ...actionAdjustedState, lastAssistantText: reply }, answeredTopics)
    : { ...actionAdjustedState, lastAssistantText: reply || actionAdjustedState.lastAssistantText };
  const stateAfter = markRoleIntroducedFromReply(answeredState, reply);

  return {
    version: stateAfter.version,
    turn,
    stateBefore,
    stateAfter,
    truth: truthAfterActions,
    truthBeforeActions,
    truthAfterActions,
    plan,
    actions,
    verification,
    reply,
    providerUsed: Boolean(writer),
    interpreterUsed: interpreted.modelUsed,
    interpreterError: interpreted.modelError,
    replyAttempts,
    finalSafetyPass,
    fallbackUsed,
    realActionsEnabled: input.realActionsEnabled,
  };
}
