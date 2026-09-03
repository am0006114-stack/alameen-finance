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
import { v3TransactionalActionAdapter } from "./transactionalActionAdapter";
import { notifyV3Discord } from "./discordNotifier";
import { continuationCommercialState } from "./commercialProgression";
import { sanitizeRecentTurnsForModel } from "./linkIntegrity";
import { buildManualActionCustomerReply, hasPaymentProtection, manualStatePayload, resolveManualActionDisposition } from "./manualActionPolicy";
import { customerFacingStatusLabel } from "./applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";

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
    if (result.outcome === "failed") {
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
  // Backward-compatible with the route-level zero-argument rescue call.
  if (!input) return "أنا معك. احكيلي سؤالك مباشرة، وبجاوبك على المعلومة المتاحة عندي بدون ما أعتبر أي إجراء منجز قبل تنفيذه فعليًا.";
  const app = input.truth.application;
  const q = String(input.customerText || "").trim();
  const nq = q.replace(/[؟?!.,،]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  if (/^(?:تمام|اوك|اوكي|شكرا|شكرًا|يسلمو|يعطيك العافيه|يعطيك العافية|على خير|ان شاء الله|إن شاء الله|الحمد لله)[\s!]*$/i.test(nq)) {
    return "العفو، الله يعطيك العافية.";
  }
  if (/(?:رقم\s*(?:تواصل|اتصال|واتساب)|مكالمة|اتصل عليكم)/i.test(nq)) {
    return "المتابعة الأساسية للطلبات عبر واتساب الحالي. ما بعطيك رقم تواصل غير موثق.";
  }
  if (/(?:شروط|تقسيط|طريقة التقديم|كيف اقدم|كيف أقدم)/i.test(q)) {
    return "أكيد. التقديم للأقساط يبدأ بطلب موافقة مبدئية، والمتطلبات تختلف حسب الملف. عادةً نحتاج هوية وإثبات دخل، وقد تُطلب بيانات كفيل حسب الحالة. أي مستندات حساسة تُرفع فقط عبر الرابط الرسمي الآمن، وما بنستلمها على واتساب.";
  }
  if (app && /(?:متى|امتى|ايمتى).{0,30}(?:استلم|اجي|أجي)|(?:موعد).{0,20}(?:استلام|اجي|أجي)/i.test(nq)) {
    return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الآن ${customerFacingStatusLabel(app)}. ما في موعد استلام رسمي إلا بعد اكتمال الإجراءات وتحديد الموعد على الطلب.`;
  }
  if (app && /(?:شو صار|حالة|حاله|تتبع|طلبي|الطلب)/i.test(nq)) {
    const bits = [
      app.trackingId ? `رقم طلبك ${app.trackingId}` : null,
      app.deviceName ? `الجهاز ${app.deviceName}` : null,
      `الحالة الآن: ${customerFacingStatusLabel(app)}`,
    ].filter(Boolean);
    return `${bits.join("، ")}.`;
  }
  if (input.state.activeTrackingId) {
    return `رقم الطلب المرتبط بالمحادثة عندي ${input.state.activeTrackingId}. ما رح أطلبه منك مرة ثانية؛ اكتب سؤالك على نفس الطلب مباشرة.`;
  }
  return "أنا معك. احكيلي سؤالك مباشرة، وإذا كان عن طلب سابق وما قدرت أربطه تلقائيًا وقتها بطلب منك معلومة واحدة فقط لتحديده.";
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

function buildRepeatDeltaReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const app = input.truth.application;
  const q = String(input.turn.rawText || "");
  if (app && input.turn.topics.includes("receipt_upload")) {
    if (hasAuthoritativePaymentConfirmation(app)) return "الدفع مؤكد إداريًا أصلًا، وما في داعي تعيد رفع الوصل.";
    if (app.documents?.paymentReceiptUploaded) return "الوصل موجود على الطلب وبانتظار مراجعة الإدارة. ما في داعي تعيد رفعه.";
  }
  if (app && input.turn.topics.includes("review_timing")) return `ما في تحديث جديد عن آخر حالة؛ طلبك الآن ${customerFacingStatusLabel(app)}، وما عندي موعد إضافي موثق غير اللي وضحته لك.`;
  if (app && /(?:متى|امتى|ايمتى).{0,25}(?:استلم|اجي|أجي)|موعد.{0,20}(?:استلام|اجي|أجي)/i.test(q)) return `لسا ما في موعد استلام رسمي على الطلب. حالته الآن ${customerFacingStatusLabel(app)}، والاستلام ما بصير إلا بعد اكتمال الإجراءات وتحديد موعد رسمي.`;
  if (app && input.turn.topics.includes("application_status")) return `ما في تحديث جديد عن آخر حالة: طلبك ${app.trackingId || ""} ${customerFacingStatusLabel(app)}.`.replace(/\s+/g," ").trim();
  return "ما في تحديث جديد عن آخر رد. إذا عندك نقطة جديدة أو سؤال مختلف احكيلي إياه مباشرة.";
}

const MANUAL_ACTIONS = new Set([
  "cancel_application",
  "request_refund",
  "stop_refund",
  "reopen_application",
  "change_device",
  "change_application_data",
]);

async function notifyManualActionRequests(input: {
  waId: string;
  customerText: string;
  truth: TruthBundle;
  plan: ReturnType<typeof buildReplyPlan>;
  actions: ActionResult[];
  realActionsEnabled: boolean;
}) {
  if (input.realActionsEnabled || !input.truth.application) return;
  for (const planned of input.plan.actions) {
    if (!MANUAL_ACTIONS.has(planned.action) || planned.requiresConfirmation) continue;
    const result = input.actions.find((x) => x.action === planned.action);
    if (!result || result.executed) continue;
    if (!(result.outcome === "dry_run" || result.blocker === "real_actions_disabled" || result.blocker === "shadow_core_no_business_mutation")) continue;
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

export async function runV3ProductionLive(input: {
  waId: string;
  turnId: string;
  customerText: string;
  recentTurns?: string[];
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
  const turn = interpreted.turn;
  const preliminaryState = reduceState({ state: stateBefore, turn });

  const truthBeforeActions = await resolveV3ProductionTruth({
    waId: input.waId,
    customerText: input.customerText,
    state: preliminaryState,
    recentTurns: safeRecentTurns,
    topics: turn.topics,
  });

  const boundState: ConversationState = truthBeforeActions.application
    ? {
        ...preliminaryState,
        activeApplicationId: truthBeforeActions.application.id,
        activeTrackingId: truthBeforeActions.application.trackingId,
        lastVerifiedApplication: truthBeforeActions.source === "verified_state_snapshot"
          ? preliminaryState.lastVerifiedApplication
          : { application: truthBeforeActions.application, fetchedAt: truthBeforeActions.fetchedAt },
      }
    : preliminaryState;

  const plan = buildReplyPlan({ turn, state: boundState, truth: truthBeforeActions });
  const actions = await executeActions({
    actions: plan.actions,
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
      recentTurns: safeRecentTurns,
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

  const manualDisposition = resolveManualActionDisposition({
    state: boundState,
    truth: truthAfterActions,
    plan,
    actions,
  });

  const writer = input.writer === undefined ? v3WriterProviderFromEnv() : input.writer;
  let reply: string | null = null;
  let verification: VerificationReport = PASS;
  let replyAttempts = 0;
  let fallbackUsed = false;

  if (plan.shouldRespond) {
    const manualReply = buildManualActionCustomerReply({ disposition: manualDisposition, truth: truthAfterActions });
    if (manualReply) {
      reply = manualReply;
      verification = verifyReply({
        reply,
        turn,
        state: boundState,
        truth: truthAfterActions,
        plan,
        actions,
        recentTurns: safeRecentTurns,
      });
    } else if (writer) {
      const basePrompt = buildWriterPrompt({
        turn,
        state: boundState,
        truth: truthAfterActions,
        plan,
        actions,
        recentTurns: safeRecentTurns,
      });
      try {
        replyAttempts++;
        reply = await writer.generate({
          system: "اكتب رد الأمين النهائي فقط وفق العقد التالي. لا تضف شرحًا داخليًا.",
          user: basePrompt,
          temperature: 0.22,
          maxTokens: 800,
        });
        verification = verifyReply({
          reply,
          turn,
          state: boundState,
          truth: truthAfterActions,
          plan,
          actions,
          recentTurns: safeRecentTurns,
        });

        if (!verification.pass) {
          replyAttempts++;
          reply = await writer.generate({
            system: "أنت مرحلة إصلاح نهائي. أعد الرد فقط بعد إزالة كل المخالفات.",
            user: repairPrompt(basePrompt, reply, verification),
            temperature: 0.08,
            maxTokens: 850,
          });
          verification = verifyReply({
            reply,
            turn,
            state: boundState,
            truth: truthAfterActions,
            plan,
            actions,
            recentTurns: safeRecentTurns,
          });
        }
      } catch (error) {
        console.error("v3 live writer failed:", error);
        reply = null;
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
        recentTurns: safeRecentTurns,
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
  if (!input.realActionsEnabled && reply && realActionsOffCompletionClaim(reply)) {
    fallbackUsed = true;
    const manualReply = buildManualActionCustomerReply({ disposition: manualDisposition, truth: truthAfterActions });
    reply = manualReply || buildZeroFallbackReply({
      turn,
      state: boundState,
      truth: truthAfterActions,
      plan,
      actions,
      recentTurns: safeRecentTurns,
    });
    verification = verifyReply({
      reply,
      turn,
      state: boundState,
      truth: truthAfterActions,
      plan,
      actions,
      recentTurns: safeRecentTurns,
    });
  }

  if (reply && runtimeNearDuplicate(boundState.lastAssistantText, reply)) {
    fallbackUsed = true;
    reply = buildRepeatDeltaReply({ turn, truth: truthAfterActions });
    verification = verifyReply({
      reply,
      turn,
      state: { ...boundState, lastAssistantText: null },
      truth: truthAfterActions,
      plan,
      actions,
      recentTurns: safeRecentTurns,
    });
  }

  const finalSafetyPass = !plan.shouldRespond || Boolean(reply && verification.pass);
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

  if (finalSafetyPass && reply && truthAfterActions.application) {
    const explicitContinue = plan.actions.some((x) => x.action === "continue_application" && !x.requiresConfirmation);
    const commercial = continuationCommercialState(truthAfterActions.application);
    if (explicitContinue && commercial === "payment_ready") {
      try {
        await notifyV3Discord({
          event: "customer_continue_payment_ready",
          applicationId: truthAfterActions.application.id,
          trackingId: truthAfterActions.application.trackingId,
          waId: input.waId,
          title: "✅ العميل وافق على الاستمرار — أرسلت له خطوة 5 دنانير",
          description: "الطلب مؤهل مبدئيًا، والعميل اختار الاستمرار. V3 أرسل تعليمات رسوم فتح الملف ورابط رفع الوصل الرسمي.",
          details: {
            الاسم: truthAfterActions.application.fullName || "—",
            الجهاز: truthAfterActions.application.deviceName || "—",
            "حالة الطلب": truthAfterActions.application.status || "—",
            "حالة الدفع": truthAfterActions.application.paymentStatus || "—",
            الرسوم: `${truthAfterActions.policy.fileOpeningFeeJod} دنانير`,
          },
        });
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
  const manualPayload = manualStatePayload(manualDisposition);
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
      ? (waitingPlan?.payload || boundState.pendingActionPayload)
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
