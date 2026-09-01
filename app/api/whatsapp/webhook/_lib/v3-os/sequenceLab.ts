import { emptyState } from "./state";
import type { ConversationState, TruthBundle } from "./types";
import { runV3ProductionShadow, type V3ActionMode, type V3ShadowResult } from "./runtimeShadow";
import type { V3TextProvider } from "./provider";

export type SequenceTurn = { turnId: string; customerText: string };
export type SequenceRun = { waId: string; turns: V3ShadowResult[]; finalState: ConversationState; finalTruth: TruthBundle | null; failures: Array<{ turnId: string; reasons: string[] }> };

export async function runV3SequenceShadow(input: {
  waId: string;
  turns: SequenceTurn[];
  writer?: V3TextProvider | null;
  interpreter?: V3TextProvider | null;
  truth?: TruthBundle | null;
  actionMode?: V3ActionMode;
}): Promise<SequenceRun> {
  let state = emptyState(input.waId);
  let branchTruth = input.truth || null;
  const results: V3ShadowResult[] = [];
  const recent: string[] = [];
  const failures: SequenceRun["failures"] = [];

  for (const turn of input.turns) {
    const result = await runV3ProductionShadow({
      waId: input.waId,
      turnId: turn.turnId,
      customerText: turn.customerText,
      state,
      recentTurns: recent.slice(-12),
      writer: input.writer,
      interpreter: input.interpreter,
      truthOverride: branchTruth,
      actionMode: input.actionMode || "dry_run",
    });
    results.push(result);
    state = result.stateAfter;
    if (input.actionMode === "simulate" && branchTruth) branchTruth = result.truthAfterActions;
    recent.push(`العميل: ${turn.customerText}`);
    if (result.reply) recent.push(`الأمين: ${result.reply}`);
    if (!result.verification.pass) {
      failures.push({ turnId: turn.turnId, reasons: [
        ...result.verification.missingTopics.map((x) => `missing:${x}`),
        ...result.verification.unsupportedClaims,
        ...result.verification.truthContradictions,
        ...result.verification.actionClaimViolations,
        ...result.verification.policyViolations,
        ...result.verification.hierarchyViolations,
        ...result.verification.repetitionFlags,
      ] });
    }
  }
  return { waId: input.waId, turns: results, finalState: state, finalTruth: branchTruth, failures };
}
