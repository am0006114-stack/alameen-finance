import { executeActions } from "./actionPlane";
import { buildReplyPlan } from "./planner";
import { resolveV3ProductionTruth } from "./productionTruth";
import { closeAnsweredLoops, emptyState, inferRoleIntroducedFromRecentTurns, markRoleIntroducedFromReply, reduceState } from "./state";
import { loadV3ConversationState } from "./stateStore";
import type { ActionResult, ConversationState, OsRunResult, TruthBundle, VerificationReport } from "./types";
import { verifyReply } from "./verifier";
import { buildWriterPrompt } from "./writerContract";
import { buildV3EmergencySafeReply } from "./safeFallback";
import { interpretTurnWithAi } from "./modelInterpreter";
import { v3InterpreterProviderFromEnv, v3WriterProviderFromEnv, type V3TextProvider } from "./provider";
import { v3TransactionalActionAdapter } from "./transactionalActionAdapter";
import { notifyV3Discord } from "./discordNotifier";
import { sanitizeRecentTurnsForModel } from "./linkIntegrity";

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

export function buildV3LastResortReply() {
  return "وصلتني رسالتك. في مشكلة مؤقتة بقراءة تفاصيل الطلب، وما رح أعطيك معلومة أو أنفذ تغيير بدون تحقق. ابعثلي نفس النقطة مرة ثانية بعد شوي وبكمل معك من نفس المحادثة.";
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
  });

  const boundState: ConversationState = truthBeforeActions.application
    ? {
        ...preliminaryState,
        activeApplicationId: truthBeforeActions.application.id,
        activeTrackingId: truthBeforeActions.application.trackingId,
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
    });
  }

  await notifyActionProblems({
    waId: input.waId,
    applicationId: truthAfterActions.application?.id || truthBeforeActions.application?.id || null,
    trackingId: truthAfterActions.application?.trackingId || truthBeforeActions.application?.trackingId || null,
    actions,
  });

  const writer = input.writer === undefined ? v3WriterProviderFromEnv() : input.writer;
  let reply: string | null = null;
  let verification: VerificationReport = PASS;
  let replyAttempts = 0;
  let fallbackUsed = false;

  if (plan.shouldRespond) {
    if (writer) {
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
      const fallback = buildV3EmergencySafeReply({
        turn,
        state: boundState,
        truth: truthAfterActions,
        plan,
        actions,
      });
      const fallbackVerification = verifyReply({
        reply: fallback,
        turn,
        state: boundState,
        truth: truthAfterActions,
        plan,
        actions,
        recentTurns: safeRecentTurns,
      });
      if (fallbackVerification.pass) {
        reply = fallback;
        verification = fallbackVerification;
      } else {
        reply = null;
        verification = fallbackVerification;
      }
    }
  }

  const finalSafetyPass = !plan.shouldRespond || Boolean(reply && verification.pass);
  if (!finalSafetyPass) {
    await notifyV3Discord({
      event: "final_safety_fail_closed",
      applicationId: truthAfterActions.application?.id || null,
      trackingId: truthAfterActions.application?.trackingId || null,
      waId: input.waId,
      title: "V3 — الرد النهائي توقف بأمان",
      description: "الكاتب ومرحلة الإصلاح والـsafe fallback لم ينجحوا في إنتاج رد يجتاز التحقق.",
      details: { verification, turnId: input.turnId },
    });
  }

  const answeredTopics = reply && verification.pass ? plan.answerItems.map((x) => x.topic) : [];
  const waitingConfirmationResult = actions.find((x) => x.outcome === "needs_confirmation") || null;
  const waitingConfirmation = waitingConfirmationResult?.action || null;
  const waitingPlan = waitingConfirmation ? plan.actions.find((x) => x.action === waitingConfirmation) : null;
  const actionAdjustedState: ConversationState = {
    ...boundState,
    pendingAction: waitingConfirmation || (plan.actions.length ? null : boundState.pendingAction),
    pendingActionPayload: waitingConfirmation
      ? (waitingPlan?.payload || boundState.pendingActionPayload)
      : (plan.actions.length ? null : boundState.pendingActionPayload),
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
