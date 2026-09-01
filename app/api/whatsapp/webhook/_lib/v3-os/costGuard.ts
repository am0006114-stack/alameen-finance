import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { V3TextProvider } from "./provider";

export type V3BudgetProvider = "deepseek" | "openai";

export async function reserveV3AiBudget(input: {
  runId: string;
  provider: V3BudgetProvider;
  model: string;
  purpose: string;
  reserveUsd: number;
}) {
  const { data, error } = await supabaseAdmin.rpc("reserve_whatsapp_v3_ai_budget", {
    p_provider: input.provider,
    p_model: input.model,
    p_purpose: input.purpose,
    p_run_id: input.runId,
    p_reserve_usd: input.reserveUsd,
  });
  if (error) throw new Error(`v3_budget_rpc:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed || !row?.reservation_id) throw new Error(`v3_budget_blocked:${row?.reason || "unknown"}`);
  return String(row.reservation_id);
}

export async function finishV3AiBudget(reservationId: string, status: "completed" | "failed", errorMessage?: string | null) {
  const { error } = await supabaseAdmin
    .from("whatsapp_v3_ai_usage")
    .update({ status, error_message: errorMessage || null, completed_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw new Error(`v3_budget_finish:${error.message}`);
}

export function withV3BudgetGuard(base: V3TextProvider, config: {
  runId: string;
  provider: V3BudgetProvider;
  model: string;
  purpose: string;
  reserveUsd: number;
}): V3TextProvider {
  return {
    async generate(req) {
      const reservationId = await reserveV3AiBudget(config);
      try {
        const text = await base.generate(req);
        await finishV3AiBudget(reservationId,"completed");
        return text;
      } catch (error) {
        try { await finishV3AiBudget(reservationId,"failed", error instanceof Error ? error.message : "provider_failed"); } catch {}
        throw error;
      }
    },
  };
}
