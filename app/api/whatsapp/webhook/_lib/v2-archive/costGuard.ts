import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type V2ArchiveProvider = "deepseek" | "openai";

export class V2BudgetBlockedError extends Error {
  constructor(public provider: V2ArchiveProvider, public reason: string) {
    super(`${provider}:${reason}`);
    this.name = "V2BudgetBlockedError";
  }
}

type ReservationRow = {
  allowed?: boolean;
  reservation_id?: string | null;
  reason?: string | null;
};

export async function reserveAiBudget(input: {
  provider: V2ArchiveProvider;
  model: string;
  purpose: string;
  caseId: string;
  reserveUsd: number;
}) {
  const { data, error } = await supabaseAdmin.rpc("reserve_whatsapp_v2_ai_budget", {
    p_provider: input.provider,
    p_model: input.model,
    p_purpose: input.purpose,
    p_case_id: input.caseId,
    p_reserve_usd: input.reserveUsd,
  });
  if (error) throw new Error(`budget_rpc_failed:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as ReservationRow | null;
  if (!row?.allowed || !row.reservation_id) {
    throw new V2BudgetBlockedError(input.provider, String(row?.reason || "budget_blocked"));
  }
  return row.reservation_id;
}

function deepSeekPeakPrice(model: string) {
  if (model.includes("v4-pro")) return { input: 1.32, output: 3.96 };
  return { input: 0.44, output: 1.32 };
}

function openAiPrice(model: string) {
  if (model.includes("terra")) return { input: 2.0, output: 12.0 };
  if (model.includes("sol") || model === "gpt-5.6") return { input: 4.0, output: 20.0 };
  return { input: 0.2, output: 1.2 };
}

export function estimateUsageCostUsd(input: {
  provider: V2ArchiveProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const p = input.provider === "deepseek" ? deepSeekPeakPrice(input.model) : openAiPrice(input.model);
  return (Math.max(0, input.inputTokens) * p.input + Math.max(0, input.outputTokens) * p.output) / 1_000_000;
}

export async function finalizeAiUsage(input: {
  reservationId: string;
  provider: V2ArchiveProvider;
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  requestId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const inputTokens = Number(input.inputTokens || 0);
  const outputTokens = Number(input.outputTokens || 0);
  const failed = Boolean(input.errorCode);
  const cost = failed && inputTokens === 0 && outputTokens === 0
    ? undefined
    : estimateUsageCostUsd({ provider: input.provider, model: input.model, inputTokens, outputTokens });

  const update: Record<string, unknown> = {
    status: failed ? "failed" : "completed",
    input_tokens: inputTokens,
    cached_input_tokens: Number(input.cachedInputTokens || 0),
    output_tokens: outputTokens,
    request_id: input.requestId || null,
    error_code: input.errorCode || null,
    error_message: input.errorMessage ? String(input.errorMessage).slice(0, 1600) : null,
    completed_at: new Date().toISOString(),
  };
  if (cost !== undefined) update.estimated_cost_usd = Math.max(0, cost);

  const { error } = await supabaseAdmin
    .from("whatsapp_v2_ai_usage")
    .update(update)
    .eq("id", input.reservationId);
  if (error) console.error("finalizeAiUsage failed", error.message);

  return cost ?? null;
}
