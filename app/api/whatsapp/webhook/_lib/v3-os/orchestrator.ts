import { executeActions } from "./actionPlane";
import { interpretTurn } from "./interpreter";
import { buildReplyPlan } from "./planner";
import { closeAnsweredLoops, emptyState, reduceState } from "./state";
import { resolveTruth, type TruthResolverInput } from "./truth";
import { V3_OS_VERSION, type ConversationState, type OsRunResult } from "./types";

export async function runV3OsShadow(input: { waId: string; turnId: string; customerText: string; state?: ConversationState | null; truth?: Omit<TruthResolverInput,"state">; syntheticReplyForVerification?: string | null }): Promise<OsRunResult> {
  const stateBefore = input.state || emptyState(input.waId);
  const turn = interpretTurn({ turnId: input.turnId, customerText: input.customerText });
  const preliminaryState = reduceState({ state: stateBefore, turn });
  const truth = resolveTruth({ state: preliminaryState, ...(input.truth || {}) });
  const plan = buildReplyPlan({ turn, state: preliminaryState, truth });
  const actions = await executeActions({ actions: plan.actions, state: preliminaryState, truth, allowMutation: false });
  const answeredTopics = input.syntheticReplyForVerification ? plan.answerItems.map((x) => x.topic) : [];
  const stateAfter = answeredTopics.length ? closeAnsweredLoops(preliminaryState, answeredTopics) : preliminaryState;
  const verification = input.syntheticReplyForVerification
    ? (await import("./verifier")).verifyReply({ reply: input.syntheticReplyForVerification, turn, state: stateAfter, truth, plan, actions })
    : { pass: true, missingTopics: [], unsupportedClaims: [], truthContradictions: [], actionClaimViolations: [], policyViolations: [], hierarchyViolations: [], repetitionFlags: [] };
  return { version: V3_OS_VERSION, turn, stateBefore, stateAfter, truth, plan, actions, verification };
}
