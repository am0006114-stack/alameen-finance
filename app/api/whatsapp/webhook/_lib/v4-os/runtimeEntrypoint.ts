import type { ActionExecutorAdapter } from "../v3-os/actionPlane";
import type { ConversationState, TruthBundle } from "../v3-os/types";
import { runV4ConversationTurn } from "./conversationKernel";
import { createV4ActionExecutorFromV3, createV4CommercialContinuationExecutorFromV3, createV4HumanEscalationExecutorFromV3, v4ModelAdapterFromEnv, v4TruthFromV3 } from "./runtimeBridge";
import { attachV4MemoryToConversationState, loadV4MemoryFromConversationState } from "./stateMemoryBridge";
import type { V4TurnResult } from "./types";

export type V4RuntimeEntrypointResult = {
  result: V4TurnResult;
  stateAfter: ConversationState;
};

/**
 * Isolated V4/V4.1 entrypoint for cutover testing and the eventual production path.
 * Critical journey/revenue/document/action routing remains deterministic and available
 * even when conversational model providers are unavailable. There is no V3
 * conversational fallback here; V3 is reused only as the authoritative Truth/Action
 * backplane.
 */
export async function runV4FromExistingRuntime(input: {
  turnId: string;
  burstText: string;
  state: ConversationState;
  truth: TruthBundle;
  actionAdapter?: ActionExecutorAdapter | null;
}): Promise<V4RuntimeEntrypointResult> {
  const model = v4ModelAdapterFromEnv();

  const memory = loadV4MemoryFromConversationState(input.state);
  const v4Truth = v4TruthFromV3({ truth: input.truth });
  const actionExecutor = input.actionAdapter
    ? createV4ActionExecutorFromV3({ state: input.state, truth: input.truth, adapter: input.actionAdapter })
    : null;
  const commercialContinuationExecutor = createV4CommercialContinuationExecutorFromV3({ truth: input.truth });
  const humanEscalationExecutor = createV4HumanEscalationExecutorFromV3({ state: input.state, truth: input.truth });

  const result = await runV4ConversationTurn({
    turnId: input.turnId,
    burstText: input.burstText,
    memory,
    truth: v4Truth,
    model,
    actionExecutor,
    commercialContinuationExecutor,
    humanEscalationExecutor,
  });

  return {
    result,
    stateAfter: attachV4MemoryToConversationState(input.state, result.memory),
  };
}
