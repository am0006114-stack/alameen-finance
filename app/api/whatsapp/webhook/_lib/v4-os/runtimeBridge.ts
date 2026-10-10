import { executeActions, type ActionExecutorAdapter } from "../v3-os/actionPlane";
import { stampActionScope } from "../v3-os/applicationScopeLock";
import { actionRequiresOmran } from "../v3-os/hierarchy";
import { v3InterpreterProviderFromEnv, v3JudgeProviderFromEnv, v3WriterProviderFromEnv } from "../v3-os/provider";
import type { ActionKey, ConversationState, PlannedAction, TruthBundle } from "../v3-os/types";
import { runFrozenCommercialContinuation } from "./commercialContinuationBridge";
import { requestRealHumanEscalation } from "./humanEscalationBridge";
import { createV41JourneyAwareModelAdapter } from "./journeyAwareModelAdapter";
import { toV4TruthBundle } from "./truthAdapter";
import type { V4ActionExecutor, V4ActionName, V4CommercialContinuationExecutor, V4HumanEscalationExecutor, V4ModelAdapter, V4Persona } from "./types";

function mapV4ActionToV3(action: V4ActionName): ActionKey | null {
  switch (action) {
    case "cancel_application": return "cancel_application";
    case "request_refund": return "request_refund";
    case "stop_refund": return "stop_refund";
    case "change_application_data": return "change_application_data";
    case "change_device": return "change_device";
    case "reopen_application": return "reopen_application";
    case "link_whatsapp_alias": return "link_whatsapp_alias";
    case "continue_application": return "continue_application";
    case "record_human_contact_request": return "record_call_preference";
    default: return null;
  }
}

export function v4PersonaFromV3State(state: ConversationState): V4Persona {
  const role = state.role.currentRole;
  if (role === "tala" || role === "fadwa" || role === "abdullah" || role === "abdulrahman" || role === "omran") return role;
  return "abdullah";
}

export function v4ModelAdapterFromEnv(): V4ModelAdapter | null {
  const writer = v3WriterProviderFromEnv();
  const interpreter = v3InterpreterProviderFromEnv() || writer;
  const critic = v3JudgeProviderFromEnv() || writer;
  if (!writer || !interpreter || !critic) return null;
  return createV41JourneyAwareModelAdapter({ understandingProvider: interpreter, writerProvider: writer, criticProvider: critic });
}

function executionStateForAction(state: ConversationState, action: ActionKey, turnId: string): ConversationState {
  if (!actionRequiresOmran(action)) return state;
  return {
    ...state,
    role: {
      ...state.role,
      currentRole: "omran",
      tier: "supervisor",
      reason: "v4_confirmed_business_mutation_owned_by_omran",
      sinceTurnId: turnId,
    },
  };
}

export function createV4CommercialContinuationExecutorFromV3(input: { truth: TruthBundle }): V4CommercialContinuationExecutor {
  return {
    async continue(req) {
      return runFrozenCommercialContinuation({
        turnId: req.turnId,
        customerText: req.customerText,
        truth: input.truth,
      });
    },
  };
}

export function createV4HumanEscalationExecutorFromV3(input: { state: ConversationState; truth: TruthBundle }): V4HumanEscalationExecutor {
  return {
    async request(req) {
      return requestRealHumanEscalation({
        turnId: req.turnId,
        customerText: req.customerText,
        state: input.state,
        truth: input.truth,
      });
    },
  };
}

// V4 deliberately reuses the already-proven authoritative V3 mutation backplane.
// This bridge does not weaken role ownership, payment truth, contact isolation,
// application scope, or mutation receipts. If the V3 guard blocks execution,
// V4 receives the real blocker and must explain it instead of pretending success.
export function createV4ActionExecutorFromV3(input: {
  state: ConversationState;
  truth: TruthBundle;
  adapter: ActionExecutorAdapter;
}): V4ActionExecutor {
  return {
    async execute(req) {
      const v3Action = mapV4ActionToV3(req.action);
      if (!v3Action) return { action: req.action, executed: false, receiptId: null, summary: null, error: "unsupported_v4_action" };

      // Hard fail-safe: commercial continuation must never enter the generic action
      // backplane. It has its own delegate above which calls the frozen 5-JOD funnel.
      if (req.action === "continue_application") {
        return { action: req.action, executed: false, receiptId: null, summary: null, error: "continuation_must_use_frozen_commercial_delegate" };
      }

      // Real-human escalation is also a dedicated durable bridge; never turn it into a
      // fake generic action receipt.
      if (req.action === "record_human_contact_request") {
        return { action: req.action, executed: false, receiptId: null, summary: null, error: "human_contact_must_use_durable_escalation_bridge" };
      }

      const planned: PlannedAction = {
        action: v3Action,
        sourceActId: `v4:${req.turnId}`,
        requiresConfirmation: false,
        authority: "ai_planned",
        requiredRole: actionRequiresOmran(v3Action) ? "omran" : input.state.role.currentRole,
        payload: {
          ...(req.payload || {}),
          _scopeWaId: input.state.waId,
          _mutationConfirmedOnTurn: req.turnId,
        } as Record<string, string | number | boolean | null>,
      };
      const scoped = stampActionScope(planned, input.truth, req.turnId);
      const executionState = executionStateForAction(input.state, v3Action, req.turnId);
      const results = await executeActions({ actions: [scoped], state: executionState, truth: input.truth, adapter: input.adapter, allowMutation: true });
      const result = results[0];
      if (!result) return { action: req.action, executed: false, receiptId: null, summary: null, error: "v3_action_backplane_returned_no_result" };
      return {
        action: req.action,
        executed: Boolean(result.executed),
        receiptId: result.mutationId || null,
        summary: result.authoritativeSummary || null,
        error: result.executed ? null : result.blocker || result.outcome || "action_not_executed",
      };
    },
  };
}

export function v4TruthFromV3(input: { truth: TruthBundle; actions?: Parameters<typeof toV4TruthBundle>[0]["actions"] }) {
  return toV4TruthBundle(input);
}
