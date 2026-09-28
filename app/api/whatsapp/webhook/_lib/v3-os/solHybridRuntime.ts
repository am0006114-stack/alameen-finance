import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { V3TextProvider } from "./provider";

export const SOL_HYBRID_USAGE_LABEL = "gpt-5.6-sol-hybrid-pilot-v1";
export const SOL_HYBRID_DEFAULT_MODEL = "gpt-5.6-sol";
export const SOL_HYBRID_DEFAULT_BUDGET_USD = 5;
export const SOL_HYBRID_DEFAULT_HOURS = 24;
const SOL_CALL_RESERVE_USD = 0.05;

const SETTINGS = {
  enabled: "sol_hybrid_enabled",
  startedAt: "sol_hybrid_pilot_started_at",
  endsAt: "sol_hybrid_pilot_ends_at",
  budgetUsd: "sol_hybrid_budget_usd",
  model: "sol_hybrid_model",
} as const;

export type SolHybridControl = {
  enabled: boolean;
  active: boolean;
  startedAt: string | null;
  endsAt: string | null;
  budgetUsd: number;
  model: string;
  configured: boolean;
  expired: boolean;
};

export type SolHybridMetrics = {
  calls: number;
  completed: number;
  failed: number;
  reservedUsd: number;
  estimatedCostUsd: number;
};

function n(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function openAiApiKey() {
  return process.env.OPENAI_V3_API_KEY || process.env.OPENAI_V2_API_KEY || "";
}

async function readSettingMap() {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_v3_lab_settings")
    .select("key,value")
    .in("key", Object.values(SETTINGS));
  if (error) {
    console.error("sol hybrid settings read failed:", error.message);
    return new Map<string, string>();
  }
  return new Map((data || []).map((row) => [String(row.key), String(row.value)]));
}

export async function getSolHybridControl(): Promise<SolHybridControl> {
  const map = await readSettingMap();
  const enabled = map.get(SETTINGS.enabled) === "true";
  const startedAt = map.get(SETTINGS.startedAt) || null;
  const endsAt = map.get(SETTINGS.endsAt) || null;
  const budgetUsd = Math.max(0, n(map.get(SETTINGS.budgetUsd), SOL_HYBRID_DEFAULT_BUDGET_USD));
  const model = map.get(SETTINGS.model) || SOL_HYBRID_DEFAULT_MODEL;
  const endsMs = endsAt ? new Date(endsAt).getTime() : 0;
  const expired = Boolean(endsAt && Number.isFinite(endsMs) && Date.now() >= endsMs);
  return {
    enabled,
    active: enabled && !expired && Boolean(openAiApiKey()),
    startedAt,
    endsAt,
    budgetUsd,
    model,
    configured: Boolean(openAiApiKey()),
    expired,
  };
}

async function writeSettings(entries: Array<{ key: string; value: string }>) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("whatsapp_v3_lab_settings")
    .upsert(entries.map((x) => ({ ...x, updated_at: now })), { onConflict: "key" });
  if (error) throw new Error(`sol_hybrid_settings_write:${error.message}`);
}

export async function startSolHybridPilot(input?: { hours?: number; budgetUsd?: number; model?: string }) {
  const hours = Math.min(48, Math.max(1, n(input?.hours, SOL_HYBRID_DEFAULT_HOURS)));
  const budgetUsd = Math.min(20, Math.max(0.25, n(input?.budgetUsd, SOL_HYBRID_DEFAULT_BUDGET_USD)));
  const model = String(input?.model || SOL_HYBRID_DEFAULT_MODEL).trim() || SOL_HYBRID_DEFAULT_MODEL;
  if (!openAiApiKey()) throw new Error("OPENAI_V3_API_KEY is not configured");
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + hours * 60 * 60 * 1000);
  await writeSettings([
    { key: SETTINGS.enabled, value: "true" },
    { key: SETTINGS.startedAt, value: startedAt.toISOString() },
    { key: SETTINGS.endsAt, value: endsAt.toISOString() },
    { key: SETTINGS.budgetUsd, value: budgetUsd.toFixed(2) },
    { key: SETTINGS.model, value: model },
  ]);
  return { startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString(), budgetUsd, model };
}

export async function stopSolHybridPilot() {
  await writeSettings([{ key: SETTINGS.enabled, value: "false" }]);
}

export async function getSolHybridMetrics(control?: SolHybridControl): Promise<SolHybridMetrics> {
  const c = control || await getSolHybridControl();
  const startedAt = c.startedAt || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("whatsapp_v3_ai_usage")
    .select("status,reserved_usd,estimated_cost_usd,created_at")
    .eq("provider", "openai")
    .eq("model", SOL_HYBRID_USAGE_LABEL)
    .gte("created_at", startedAt)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) {
    console.error("sol hybrid metrics read failed:", error.message);
    return { calls: 0, completed: 0, failed: 0, reservedUsd: 0, estimatedCostUsd: 0 };
  }
  const rows = data || [];
  return {
    calls: rows.length,
    completed: rows.filter((x) => x.status === "completed").length,
    failed: rows.filter((x) => x.status === "failed").length,
    reservedUsd: rows.reduce((sum, x) => sum + n(x.reserved_usd, 0), 0),
    estimatedCostUsd: rows.reduce((sum, x) => sum + n(x.estimated_cost_usd, 0), 0),
  };
}

async function reservePilotCall(control: SolHybridControl) {
  if (!control.active) throw new Error(control.expired ? "sol_hybrid_pilot_expired" : "sol_hybrid_disabled");
  const metrics = await getSolHybridMetrics(control);
  if (metrics.reservedUsd + SOL_CALL_RESERVE_USD > control.budgetUsd + 1e-9) {
    throw new Error("sol_hybrid_budget_exceeded");
  }
  const { data, error } = await supabaseAdmin
    .from("whatsapp_v3_ai_usage")
    .insert({
      provider: "openai",
      model: SOL_HYBRID_USAGE_LABEL,
      purpose: "interpreter",
      status: "reserved",
      reserved_usd: SOL_CALL_RESERVE_USD,
      estimated_cost_usd: SOL_CALL_RESERVE_USD,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`sol_hybrid_reserve_failed:${error?.message || "missing_id"}`);
  return String(data.id);
}

async function finishPilotCall(id: string, status: "completed" | "failed", estimatedCostUsd: number, errorMessage?: string | null) {
  const { error } = await supabaseAdmin
    .from("whatsapp_v3_ai_usage")
    .update({
      status,
      estimated_cost_usd: Math.max(0, estimatedCostUsd),
      error_message: errorMessage || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) console.error("sol hybrid usage finalize failed:", error.message);
}

function responseText(json: any) {
  if (typeof json?.output_text === "string" && json.output_text.trim()) return json.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(json?.output) ? json.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function estimatedSolCost(usage: any) {
  const input = n(usage?.input_tokens, 0);
  const cached = n(usage?.input_tokens_details?.cached_tokens, 0);
  const cacheWrite = n(usage?.input_tokens_details?.cache_write_tokens, 0);
  const output = n(usage?.output_tokens, 0);
  const regular = Math.max(0, input - cached - cacheWrite);
  return (regular * 4 + cached * 0.4 + cacheWrite * 5 + output * 20) / 1_000_000;
}

export function createSolHybridProvider(input: {
  control: SolHybridControl;
  waId: string;
  trackingId?: string | null;
  escalationReasons: string[];
  complexityScore: number;
}): V3TextProvider | null {
  const apiKey = openAiApiKey();
  if (!apiKey || !input.control.active) return null;
  const model = input.control.model || SOL_HYBRID_DEFAULT_MODEL;

  return {
    async generate(req) {
      const reservationId = await reservePilotCall(input.control);
      const started = Date.now();
      try {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            input: [
              { role: "developer", content: [{ type: "input_text", text: req.system }] },
              { role: "user", content: [{ type: "input_text", text: req.user }] },
            ],
            reasoning: { effort: "medium" },
            max_output_tokens: req.maxTokens ?? 1450,
            temperature: req.temperature ?? 0.3,
            text: { verbosity: "low" },
            prompt_cache_key: "alameen-phase10-sol-hybrid-v1",
            prompt_cache_options: { mode: "implicit", ttl: "30m" },
            store: false,
          }),
        });
        const rawText = await response.text();
        if (!response.ok) throw new Error(`sol_hybrid_http_${response.status}:${rawText.slice(0, 500)}`);
        const json = JSON.parse(rawText);
        const text = responseText(json);
        if (!text) throw new Error("sol_hybrid_empty_response");
        const estimatedCostUsd = estimatedSolCost(json?.usage || {});
        await finishPilotCall(reservationId, "completed", estimatedCostUsd);
        console.info("V3_SOL_HYBRID_TELEMETRY", JSON.stringify({
          waId: input.waId,
          trackingId: input.trackingId || null,
          model,
          reasonForEscalation: input.escalationReasons,
          complexityScore: input.complexityScore,
          inputTokens: n(json?.usage?.input_tokens, 0),
          cachedInputTokens: n(json?.usage?.input_tokens_details?.cached_tokens, 0),
          cacheWriteTokens: n(json?.usage?.input_tokens_details?.cache_write_tokens, 0),
          outputTokens: n(json?.usage?.output_tokens, 0),
          reasoningTokens: n(json?.usage?.output_tokens_details?.reasoning_tokens, 0),
          estimatedCostUsd,
          latencyMs: Date.now() - started,
          outcome: "completed",
        }));
        return text;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await finishPilotCall(reservationId, "failed", 0, message.slice(0, 900));
        console.error("V3_SOL_HYBRID_TELEMETRY", JSON.stringify({
          waId: input.waId,
          trackingId: input.trackingId || null,
          model,
          reasonForEscalation: input.escalationReasons,
          complexityScore: input.complexityScore,
          latencyMs: Date.now() - started,
          outcome: "failed",
          error: message,
        }));
        throw error;
      }
    },
  };
}
