import { executeActions } from "./actionPlane";
import { buildReplyPlan } from "./planner";
import { resolveV3ProductionTruth } from "./productionTruth";
import { closeAnsweredLoops, emptyState, inferRoleIntroducedFromRecentTurns, markRoleIntroducedFromReply, reduceState } from "./state";
import { loadV3ConversationState, saveV3ConversationState } from "./stateStore";
import type { ConversationState, OsRunResult, TruthBundle, VerificationReport } from "./types";
import { verifyReply } from "./verifier";
import { buildWriterPrompt } from "./writerContract";
import { buildV3EmergencySafeReply } from "./safeFallback";
import { interpretTurnWithAi } from "./modelInterpreter";
import { v3InterpreterProviderFromEnv, v3WriterProviderFromEnv, type V3TextProvider } from "./provider";
import { applySimulatedActionTruth, v3SimulationActionAdapter } from "./simulationActionAdapter";

const PASS: VerificationReport = { pass: true, missingTopics: [], unsupportedClaims: [], truthContradictions: [], actionClaimViolations: [], policyViolations: [], hierarchyViolations: [], repetitionFlags: [] };

export type V3ActionMode = "dry_run" | "simulate";

export type V3ShadowResult = OsRunResult & {
  truthBeforeActions: TruthBundle;
  truthAfterActions: TruthBundle;
  actionMode: V3ActionMode;
  reply: string | null;
  providerUsed: boolean;
  interpreterUsed: boolean;
  interpreterError: string | null;
  replyAttempts: number;
  finalSafetyPass: boolean;
  fallbackUsed: boolean;
};

function repairPrompt(base: string, reply: string, verification: VerificationReport) {
  return `${base}\n\nالرد السابق فشل التحقق الداخلي.\nPREVIOUS_REPLY=${JSON.stringify(reply)}\nVIOLATIONS=${JSON.stringify(verification)}\n\nأعد كتابة الرد النهائي فقط. أصلح المخالفات، لا تحذف أي موضوع مطلوب، ولا تدّعي أي إجراء غير منفذ.`;
}

export async function runV3ProductionShadow(input: {
  waId: string;
  turnId: string;
  customerText: string;
  state?: ConversationState | null;
  recentTurns?: string[];
  writer?: V3TextProvider | null;
  interpreter?: V3TextProvider | null;
  truthOverride?: TruthBundle | null;
  persistState?: boolean;
  /**
   * dry_run is the production/shadow default and can never mutate business state.
   * simulate is reserved for archive/sequence testing and uses a PURE in-memory
   * action adapter; it never calls Supabase application mutations.
   */
  actionMode?: V3ActionMode;
}): Promise<V3ShadowResult> {
  const actionMode: V3ActionMode = input.actionMode || "dry_run";
  const loadedState = input.state || (input.persistState ? await loadV3ConversationState(input.waId) : null);
  const stateBefore = inferRoleIntroducedFromRecentTurns(loadedState || emptyState(input.waId), input.recentTurns);

  const interpreter = input.interpreter === undefined ? v3InterpreterProviderFromEnv() : input.interpreter;
  const interpreted = await interpretTurnWithAi({
    turnId: input.turnId,
    customerText: input.customerText,
    state: stateBefore,
    recentTurns: input.recentTurns,
    provider: interpreter,
  });
  const turn = interpreted.turn;
  const preliminaryState = reduceState({ state: stateBefore, turn });

  const truthBeforeActions = input.truthOverride || await resolveV3ProductionTruth({
    waId: input.waId,
    customerText: input.customerText,
    state: preliminaryState,
  });
  const boundState = truthBeforeActions.application
    ? { ...preliminaryState, activeApplicationId: truthBeforeActions.application.id, activeTrackingId: truthBeforeActions.application.trackingId }
    : preliminaryState;

  const plan = buildReplyPlan({ turn, state: boundState, truth: truthBeforeActions });

  // Real business mutation is NEVER enabled here. Archive simulation uses a
  // pure adapter that only returns a synthetic next truth snapshot.
  const actions = actionMode === "simulate"
    ? await executeActions({
        actions: plan.actions,
        state: boundState,
        truth: truthBeforeActions,
        adapter: v3SimulationActionAdapter,
        allowMutation: true,
      })
    : await executeActions({ actions: plan.actions, state: boundState, truth: truthBeforeActions, allowMutation: false });

  const truthAfterActions = actionMode === "simulate"
    ? applySimulatedActionTruth(truthBeforeActions, actions)
    : truthBeforeActions;

  const writer = input.writer === undefined ? v3WriterProviderFromEnv() : input.writer;
  let reply: string | null = null;
  let verification: VerificationReport = PASS;
  let replyAttempts = 0;
  let fallbackUsed = false;

  if (plan.shouldRespond) {
    if (writer) {
      const basePrompt = buildWriterPrompt({ turn, state: boundState, truth: truthAfterActions, plan, actions, recentTurns: input.recentTurns });
      try {
        replyAttempts++;
        reply = await writer.generate({
          system: "اكتب رد الأمين النهائي فقط وفق العقد التالي. لا تضف شرحًا داخليًا.",
          user: basePrompt,
          temperature: 0.22,
          maxTokens: 800,
        });
        verification = verifyReply({ reply, turn, state: boundState, truth: truthAfterActions, plan, actions, recentTurns: input.recentTurns });

        if (!verification.pass) {
          replyAttempts++;
          reply = await writer.generate({
            system: "أنت مرحلة إصلاح نهائي. أعد الرد فقط بعد إزالة كل المخالفات.",
            user: repairPrompt(basePrompt,reply,verification),
            temperature: 0.08,
            maxTokens: 850,
          });
          verification = verifyReply({ reply, turn, state: boundState, truth: truthAfterActions, plan, actions, recentTurns: input.recentTurns });
        }
      } catch {
        reply = null;
      }
    }

    if (!reply || !verification.pass) {
      fallbackUsed = true;
      replyAttempts++;
      const fallback = buildV3EmergencySafeReply({ turn, state: boundState, truth: truthAfterActions, plan, actions });
      const fallbackVerification = verifyReply({ reply: fallback, turn, state: boundState, truth: truthAfterActions, plan, actions, recentTurns: input.recentTurns });
      if (fallbackVerification.pass) {
        reply = fallback;
        verification = fallbackVerification;
      } else {
        // Fail closed: no unsafe candidate is considered sendable.
        reply = null;
        verification = fallbackVerification;
      }
    }
  }

  const finalSafetyPass = !plan.shouldRespond || Boolean(reply && verification.pass);
  const answeredTopics = reply && verification.pass ? plan.answerItems.map(x=>x.topic) : [];
  const waitingConfirmationResult = actions.find(x => x.outcome === "needs_confirmation") || null;
  const waitingConfirmation = waitingConfirmationResult?.action || null;
  const waitingPlan = waitingConfirmation ? plan.actions.find(x => x.action === waitingConfirmation) : null;
  const actionAdjustedState = {
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

  if (input.persistState) await saveV3ConversationState(stateAfter);

  return {
    version: stateAfter.version,
    turn,
    stateBefore,
    stateAfter,
    truth: truthAfterActions,
    truthBeforeActions,
    truthAfterActions,
    actionMode,
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
  };
}
