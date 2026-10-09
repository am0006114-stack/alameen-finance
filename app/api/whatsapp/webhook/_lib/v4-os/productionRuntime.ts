import { interpretTurn } from "../v3-os/interpreter";
import { resolveV3ProductionTruth } from "../v3-os/productionTruth";
import { emptyState } from "../v3-os/state";
import { loadV3ConversationState } from "../v3-os/stateStore";
import { v3TransactionalActionAdapter } from "../v3-os/transactionalActionAdapter";
import type { ConversationState, TruthBundle, VerificationReport } from "../v3-os/types";
import { runV4FromExistingRuntime } from "./runtimeEntrypoint";

export type V4ProductionLiveResult = {
  finalSafetyPass: boolean;
  reply: string | null;
  suppressReply: boolean;
  verification: VerificationReport;
  truthBeforeActions: TruthBundle;
  truthAfterActions: TruthBundle;
  stateBefore: ConversationState;
  stateAfter: ConversationState;
  humanOs: null;
  v4: {
    enabled: true;
    decision: string;
    criticScore: number;
    criticReasons: string[];
    requestedAction: string | null;
    actionExecuted: boolean;
  };
};

function compactRecentTurns(input?: Array<{ direction?: string; content?: string }>) {
  return (input || [])
    .map((turn) => `${String(turn.direction || "").toLowerCase() === "incoming" ? "العميل" : "الأمين"}: ${String(turn.content || "").trim()}`)
    .filter((line) => line.trim().length > 1)
    .slice(-24);
}

function verificationFor(input: {
  accepted: boolean;
  validReplyShape: boolean;
  reasons: string[];
}): VerificationReport {
  const policyViolations = input.accepted && input.validReplyShape
    ? []
    : Array.from(new Set([
        ...input.reasons,
        ...(!input.validReplyShape ? ["v4_missing_customer_reply_without_silence_decision"] : []),
      ]));
  return {
    pass: policyViolations.length === 0,
    missingTopics: [],
    unsupportedClaims: [],
    truthContradictions: [],
    actionClaimViolations: [],
    policyViolations,
    hierarchyViolations: [],
    repetitionFlags: input.reasons.filter((reason) => /repeat|repetition/i.test(reason)),
  };
}

function bindStateToTruth(input: {
  state: ConversationState;
  truth: TruthBundle;
  turnId: string;
  customerText: string;
  assistantText?: string | null;
}) {
  const app = input.truth.application;
  return {
    ...input.state,
    activeApplicationId: app?.id || input.state.activeApplicationId || null,
    activeTrackingId: app?.trackingId || input.state.activeTrackingId || null,
    lastTurnId: input.turnId,
    lastCustomerText: input.customerText,
    ...(input.assistantText ? { lastAssistantText: input.assistantText } : {}),
    updatedAt: new Date().toISOString(),
  } satisfies ConversationState;
}

/**
 * The only V4 production runtime entrypoint intended for the WhatsApp cutover.
 *
 * Important contracts:
 * - V4 is the only conversational model path in this function. There is no V3
 *   conversational fallback and no shadow execution.
 * - Authoritative DB/business truth still comes from the proven V3 truth resolver.
 * - Real mutations still go through the proven V3 transactional action adapter.
 * - The frozen 5-JOD continuation funnel remains delegated by V4 itself.
 * - A critic-rejected answer fails closed and lets the webhook retry safely.
 * - Explicit customer silence is represented by suppressReply=true; it is not a
 *   missing-answer failure and must be handled by the webhook without sending text.
 */
export async function runV4ProductionLive(input: {
  waId: string;
  turnId: string;
  customerText: string;
  recentTurns?: Array<{
    id?: string;
    direction?: string;
    message_type?: string;
    content?: string;
    created_at?: string | null;
  }>;
  profileName?: string | null;
  realActionsEnabled?: boolean;
}): Promise<V4ProductionLiveResult> {
  void input.profileName;
  const recentTurns = compactRecentTurns(input.recentTurns);
  const prior = (await loadV3ConversationState(input.waId)) || emptyState(input.waId);
  const deterministicTurn = interpretTurn({ turnId: input.turnId, customerText: input.customerText });

  const truthBeforeActions = await resolveV3ProductionTruth({
    waId: input.waId,
    customerText: input.customerText,
    state: prior,
    recentTurns,
    topics: deterministicTurn.topics,
  });

  const stateBefore = bindStateToTruth({
    state: prior,
    truth: truthBeforeActions,
    turnId: input.turnId,
    customerText: input.customerText,
  });

  const v4Run = await runV4FromExistingRuntime({
    turnId: input.turnId,
    burstText: input.customerText,
    state: stateBefore,
    truth: truthBeforeActions,
    actionAdapter: input.realActionsEnabled ? v3TransactionalActionAdapter : null,
  });

  const truthAfterActions = await resolveV3ProductionTruth({
    waId: input.waId,
    customerText: input.customerText,
    state: v4Run.stateAfter,
    recentTurns,
    topics: deterministicTurn.topics,
  });

  const suppressReply = v4Run.result.decision === "SILENCE" && v4Run.result.critic.accepted;
  const validReplyShape = suppressReply || Boolean(v4Run.result.reply?.trim());
  const verification = verificationFor({
    accepted: v4Run.result.critic.accepted,
    validReplyShape,
    reasons: v4Run.result.critic.reasons,
  });
  const finalSafetyPass = verification.pass;

  const stateAfter = bindStateToTruth({
    state: v4Run.stateAfter,
    truth: truthAfterActions,
    turnId: input.turnId,
    customerText: input.customerText,
    assistantText: suppressReply ? null : v4Run.result.reply,
  });

  return {
    finalSafetyPass,
    reply: finalSafetyPass ? v4Run.result.reply : null,
    suppressReply,
    verification,
    truthBeforeActions,
    truthAfterActions,
    stateBefore,
    stateAfter,
    humanOs: null,
    v4: {
      enabled: true,
      decision: v4Run.result.decision,
      criticScore: v4Run.result.critic.score,
      criticReasons: v4Run.result.critic.reasons,
      requestedAction: v4Run.result.understanding.requestedAction,
      actionExecuted: Boolean(v4Run.result.actionResult?.executed || v4Run.result.commercialContinuation?.persisted),
    },
  };
}
