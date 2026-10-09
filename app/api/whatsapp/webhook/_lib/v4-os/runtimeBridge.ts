import { executeActions, type ActionExecutorAdapter } from "../v3-os/actionPlane";
import { stampActionScope } from "../v3-os/applicationScopeLock";
import { actionRequiresOmran } from "../v3-os/hierarchy";
import { v3InterpreterProviderFromEnv, v3JudgeProviderFromEnv, v3WriterProviderFromEnv } from "../v3-os/provider";
import type { ActionKey, ConversationState, PlannedAction, TruthBundle } from "../v3-os/types";
import { createV4ModelAdapter } from "./modelAdapter";
import { toV4TruthBundle } from "./truthAdapter";
import type { V4ActionExecutor, V4ActionName, V4ModelAdapter, V4Persona } from "./types";

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
  return createV4ModelAdapter({ understandingProvider: interpreter, writerProvider: writer, criticProvider: critic });
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

      // The 5 JOD continuation/payment funnel remains owned by its existing control plane.
      // V4 can understand and explain continuation, but must not bypass that funnel here.
      if (req.action === "continue_application") {
        return { action: req.action, executed: false, receiptId: null, summary: null, error: "continuation_owned_by_existing_payment_funnel" };
      }

      // Human-contact durability has its own receipt path in the current runtime and will
      // be bridged explicitly before cutover; never fake an executed contact request.
      if (req.action === "record_human_contact_request") {
        return { action: req.action, executed: false, receiptId: null, summary: null, error: "human_contact_durable_receipt_bridge_not_connected" };
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
      const results = await executeActions({ actions: [scoped], state: input.state, truth: input.truth, adapter: input.adapter, allowMutation: true });
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
