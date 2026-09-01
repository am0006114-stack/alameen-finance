import { actionRequiresOmran } from "./hierarchy";
import { hasPaymentRefundIntegrityConflict, truthHasAuthoritativePaymentConfirmation } from "./paymentTruth";
import type { ActionKey, ActionResult, ConversationState, PlannedAction, TruthBundle } from "./types";

export type ActionExecutorAdapter = {
  execute(action: PlannedAction, context: { state: ConversationState; truth: TruthBundle }): Promise<{ success: boolean; alreadyDone?: boolean; mutationId?: string | null; summary?: string | null; blocker?: string | null; details?: Record<string, unknown> | null }>;
};

export function guardAction(action: PlannedAction, state: ConversationState, truth: TruthBundle): ActionResult {
  if (action.action === "switch_ai_role" || action.action === "record_call_preference") {
    return {
      action: action.action,
      outcome: "executed",
      executed: true,
      authoritativeSummary: action.action === "switch_ai_role" ? "تم تغيير مستوى المعالجة داخل فريق AI." : "تم تسجيل تفضيل العميل للمكالمة دون وعد باتصال.",
      mutationId: null,
      blocker: null,
      ownerRole: state.role.currentRole,
    };
  }

  const businessMutation = actionRequiresOmran(action.action);
  if (businessMutation && state.role.currentRole !== "omran") {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "omran_supervisor_required", ownerRole: state.role.currentRole };
  }

  if (["cancel_application","request_refund","change_application_data","change_device","continue_application","reopen_application","stop_refund"].includes(action.action) && !truth.application) {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "application_truth_required", ownerRole: state.role.currentRole };
  }

  if (hasPaymentRefundIntegrityConflict(truth.application) && ["cancel_application","request_refund","stop_refund","reopen_application","continue_application","change_application_data","change_device"].includes(action.action)) {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "payment_refund_integrity_conflict_requires_admin", ownerRole: state.role.currentRole };
  }

  if (action.action === "request_refund" && !truthHasAuthoritativePaymentConfirmation(truth)) {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "confirmed_payment_required_for_refund_path", ownerRole: state.role.currentRole };
  }

  if (action.requiresConfirmation) {
    return { action: action.action, outcome: "needs_confirmation", executed: false, authoritativeSummary: null, mutationId: null, blocker: "explicit_confirmation_required", ownerRole: state.role.currentRole };
  }

  return { action: action.action, outcome: "dry_run", executed: false, authoritativeSummary: null, mutationId: null, blocker: "shadow_core_no_business_mutation", ownerRole: state.role.currentRole };
}

export async function executeActions(input: { actions: PlannedAction[]; state: ConversationState; truth: TruthBundle; adapter?: ActionExecutorAdapter | null; allowMutation?: boolean }): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const action of input.actions) {
    const guarded = guardAction(action,input.state,input.truth);
    if (guarded.outcome !== "dry_run" || !input.allowMutation || !input.adapter) {
      results.push(guarded);
      continue;
    }
    try {
      const r = await input.adapter.execute(action,{ state: input.state, truth: input.truth });
      results.push({
        action: action.action,
        outcome: r.success ? (r.alreadyDone ? "already_done" : "executed") : "failed",
        executed: r.success,
        authoritativeSummary: r.summary || null,
        mutationId: r.mutationId || null,
        blocker: r.blocker || null,
        ownerRole: input.state.role.currentRole,
        details: r.details || null,
      });
    } catch (error) {
      results.push({ action: action.action, outcome: "failed", executed: false, authoritativeSummary: null, mutationId: null, blocker: error instanceof Error ? error.message : "action_executor_error", ownerRole: input.state.role.currentRole });
    }
  }
  return results;
}
