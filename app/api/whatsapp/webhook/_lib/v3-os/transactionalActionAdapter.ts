import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ActionExecutorAdapter } from "./actionPlane";
import { calculateRequestedDeviceChange, extractApplicationPatch } from "./commercialOperations";
import type { ApplicationTruth, PlannedAction, TruthBundle } from "./types";
import { truthHasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { canV3ExecuteRealActions, getV3ProductionControl } from "./productionControl";

const MUTATIONS = new Set([
  "cancel_application",
  "continue_application",
  "request_refund",
  "stop_refund",
  "change_application_data",
  "change_device",
  "reopen_application",
]);

function expectedBefore(app: ApplicationTruth) {
  return {
    status: app.status,
    payment_status: app.paymentStatus,
    payment_confirmed_at: app.paymentConfirmedAt,
    device_id: app.deviceId,
    device_name: app.deviceName,
    device_price: app.devicePrice,
    installment_months: app.installmentMonths,
    down_payment: app.downPayment,
    interest_rate: app.interestRate,
    monthly_payment: app.monthlyPayment,
    total_with_interest: app.totalWithInterest,
    phone: app.phone,
    full_name: app.fullName,
    email: app.email,
    salary: app.salary,
  };
}

function turnKey(planned: PlannedAction, app: ApplicationTruth, turnId: string | null) {
  return `v3:${app.id}:${turnId || "unknown-turn"}:${planned.action}`;
}

function actionPayload(planned: PlannedAction, app: ApplicationTruth, customerText: string) {
  if (planned.action === "change_device") {
    const requested = String(planned.payload?.requestedValue || customerText || "");
    const change = calculateRequestedDeviceChange(app, requested);
    if (!change.ok) return { ok: false as const, blocker: change.blocker, payload: null };
    return { ok: true as const, blocker: null, payload: change.payload };
  }

  if (planned.action === "change_application_data") {
    const requested = String(planned.payload?.requestedValue || customerText || "");
    const patch = extractApplicationPatch(requested);
    if (!Object.keys(patch).length) return { ok: false as const, blocker: "clear_supported_field_and_value_required", payload: null };
    return { ok: true as const, blocker: null, payload: patch };
  }

  return { ok: true as const, blocker: null, payload: planned.payload || {} };
}

function firstRpcRow(data: unknown) {
  if (Array.isArray(data)) return (data[0] || null) as Record<string, unknown> | null;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

/**
 * Real V3 transactional adapter. It is deliberately double-gated by the
 * production-control row: V3 must be live, kill-switch must be off, and
 * real_actions_enabled must be true. The SQL RPC then enforces Omran ownership,
 * row locking, stale-truth checks, idempotency and the audit ledger atomically.
 */
export const v3TransactionalActionAdapter: ActionExecutorAdapter = {
  async execute(planned, context) {
    if (!MUTATIONS.has(planned.action)) {
      if (planned.action === "none") return { success: true, alreadyDone: true, summary: "لا يوجد إجراء تنفيذي مطلوب." };
      if (planned.action === "switch_ai_role") return { success: true, alreadyDone: true, summary: "تم تغيير مستوى المعالجة داخل فريق AI." };
      if (planned.action === "record_call_preference") return { success: true, alreadyDone: true, summary: "تم تسجيل تفضيل المكالمة بدون وعد باتصال غير منفذ." };
      return { success: false, blocker: `unsupported_transactional_action:${planned.action}` };
    }

    const productionControl = await getV3ProductionControl();
    if (!canV3ExecuteRealActions(productionControl)) {
      return { success: false, blocker: "v3_real_actions_production_gate_disabled" };
    }

    const app = context.truth.application;
    if (!app) return { success: false, blocker: "authoritative_application_required" };
    if (context.state.role.currentRole !== "omran") return { success: false, blocker: "omran_supervisor_required" };

    const prepared = actionPayload(planned, app, context.state.lastCustomerText || "");
    if (!prepared.ok) return { success: false, blocker: prepared.blocker };

    const idempotencyKey = turnKey(planned, app, context.state.lastTurnId);
    const { data, error } = await supabaseAdmin.rpc("execute_whatsapp_v3_application_action", {
      p_idempotency_key: idempotencyKey,
      p_application_id: app.id,
      p_wa_id: context.state.waId,
      p_source_turn_id: context.state.lastTurnId,
      p_action_type: planned.action,
      p_owner_role: context.state.role.currentRole,
      p_expected_before: expectedBefore(app),
      p_payload: prepared.payload || {},
      p_runtime_version: context.state.version,
    });

    if (error) return { success: false, blocker: `v3_transaction_rpc:${error.message}` };
    const row = firstRpcRow(data);
    if (!row) return { success: false, blocker: "v3_transaction_rpc_empty" };

    const outcome = String(row.outcome || "failed");
    const success = outcome === "executed" || outcome === "already_done";
    const after = row.after_snapshot && typeof row.after_snapshot === "object"
      ? row.after_snapshot as Record<string, unknown>
      : null;

    return {
      success,
      alreadyDone: outcome === "already_done",
      mutationId: row.ledger_id ? String(row.ledger_id) : null,
      summary: typeof row.summary === "string" ? row.summary : null,
      blocker: success ? null : String(row.blocker || outcome),
      details: after ? { afterSnapshot: after, ledgerId: row.ledger_id || null } : { ledgerId: row.ledger_id || null },
    };
  },
};

// Backwards-compatible export name. Future live cutover must explicitly opt into
// this adapter; the current V3 shadow never imports it for mutation execution.
export const v3SupabaseActionAdapter = v3TransactionalActionAdapter;

export function paymentIsAuthoritative(truth: TruthBundle) {
  return truthHasAuthoritativePaymentConfirmation(truth);
}
