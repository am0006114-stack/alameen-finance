import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getV3Policy } from "./policy";
import { V3_OS_VERSION, type ApplicationTruth, type ConversationState, type TruthBundle } from "./types";
import { emptyState } from "./state";
import { runV3ProductionShadow } from "./runtimeShadow";
import { judgeV3Turn, type V3JudgeResult } from "./judge";
import { createDeepSeekProvider, createOpenAiProvider } from "./provider";
import { withV3BudgetGuard } from "./costGuard";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";

export type ArchiveCaseRow = {
  id: string;
  source_created_at: string;
  wa_id: string;
  customer_message: string;
  actual_reply?: string | null;
  historical_truth?: Record<string, unknown> | null;
  historical_truth_confidence?: string | null;
};

type Settings = Record<string,string>;

function num(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function settings(): Promise<Settings> {
  const { data, error } = await supabaseAdmin.from("whatsapp_v3_lab_settings").select("key,value");
  if (error) throw new Error(`v3_lab_settings:${error.message}`);
  const out: Settings = {};
  for (const row of data || []) out[String(row.key)] = String(row.value);
  if (out.lab_enabled !== "true") throw new Error("v3_lab_disabled");
  return out;
}

export function historicalTruth(row: ArchiveCaseRow): TruthBundle {
  const h = (row.historical_truth || {}) as Record<string, any>;
  const id = h.application_id ? String(h.application_id) : "";
  const trackingId = h.tracking_id ? String(h.tracking_id) : null;
  const app: ApplicationTruth | null = (id || trackingId) ? {
    id: id || `archive:${trackingId}`,
    trackingId,
    fullName: h.full_name ? String(h.full_name) : null,
    phone: h.phone == null ? null : String(h.phone),
    email: h.email == null ? null : String(h.email),
    status: h.status == null ? null : String(h.status),
    paymentStatus: h.payment_status == null ? null : String(h.payment_status),
    paymentConfirmedAt: h.payment_confirmed_at == null ? null : String(h.payment_confirmed_at),
    paymentReference: h.payment_reference == null ? null : String(h.payment_reference),
    deviceId: h.device_id == null ? null : String(h.device_id),
    deviceName: h.device_name == null ? null : String(h.device_name),
    devicePrice: h.device_price == null ? null : Number(h.device_price),
    installmentMonths: h.installment_months == null ? null : Number(h.installment_months),
    downPayment: h.down_payment == null ? null : Number(h.down_payment),
    interestRate: h.interest_rate == null ? null : Number(h.interest_rate),
    monthlyPayment: h.monthly_payment == null ? null : Number(h.monthly_payment),
    totalWithInterest: h.total_with_interest == null ? null : Number(h.total_with_interest),
    salary: h.salary == null ? null : Number(h.salary),
    deliveryDelayUntil: h.delivery_delay_until == null ? null : String(h.delivery_delay_until),
  } : null;
  const c = String(row.historical_truth_confidence || "none");
  const confidence: TruthBundle["confidence"] = c === "high" ? "high" : c === "medium" ? "medium" : c === "limited" ? "low" : "none";
  return {
    confidence,
    source: "archive_historical_truth",
    application: app,
    ambiguousApplications: [],
    policy: getV3Policy(),
    fetchedAt: row.source_created_at,
  };
}

/**
 * Preserve V3's synthetic branch between archive turns while admitting only
 * truly external authoritative facts that may legitimately appear later in
 * history (manual payment confirmation, completed refund, operational delay).
 * We intentionally DO NOT overwrite V3's cancel/reopen/device decisions with
 * the historical V1 branch, otherwise sequence replay would stop testing the
 * consequences of V3's own decisions.
 */
export function mergeArchiveExternalTruth(simulated: TruthBundle | null, currentHistorical: TruthBundle): TruthBundle {
  if (!simulated?.application) return currentHistorical;
  const sim = simulated.application;
  const hist = currentHistorical.application;
  if (!hist) return { ...simulated, fetchedAt: currentHistorical.fetchedAt };

  if (sim.id !== hist.id && sim.trackingId !== hist.trackingId) {
    return currentHistorical;
  }

  const next: ApplicationTruth = { ...sim };

  // Admin payment confirmation is an external fact and must be admitted.
  if (hasAuthoritativePaymentConfirmation(hist) && !hasAuthoritativePaymentConfirmation(sim)) {
    next.paymentConfirmedAt = hist.paymentConfirmedAt || sim.paymentConfirmedAt;
    next.paymentReference = hist.paymentReference || sim.paymentReference;
    if (!["refund_requested","refund_completed"].includes(String(sim.paymentStatus || ""))) {
      next.paymentStatus = hist.paymentStatus || "confirmed";
    }
  }

  // Refund completion is an external back-office event; once historical truth
  // proves completion, the synthetic branch must respect it.
  if (hist.status === "refund_completed" || hist.paymentStatus === "refund_completed") {
    next.status = "refund_completed";
    next.paymentStatus = "refund_completed";
    next.paymentReference = hist.paymentReference || next.paymentReference;
    next.paymentConfirmedAt = hist.paymentConfirmedAt || next.paymentConfirmedAt;
  }

  // Supply/operational delay is also external to the conversation engine.
  if (hist.deliveryDelayUntil) next.deliveryDelayUntil = hist.deliveryDelayUntil;

  return {
    ...simulated,
    confidence: currentHistorical.confidence === "authoritative" ? "authoritative" : simulated.confidence,
    application: next,
    fetchedAt: currentHistorical.fetchedAt,
  };
}

async function loadSequence(anchorCaseId: string, maxTurns: number) {
  const { data: anchor, error: aerr } = await supabaseAdmin
    .from("whatsapp_v2_archive_cases")
    .select("id,source_created_at,wa_id,customer_message,actual_reply,historical_truth,historical_truth_confidence")
    .eq("id", anchorCaseId)
    .maybeSingle();
  if (aerr) throw new Error(`v3_archive_anchor:${aerr.message}`);
  if (!anchor?.id) throw new Error("v3_archive_anchor_not_found");

  const { data, error } = await supabaseAdmin
    .from("whatsapp_v2_archive_cases")
    .select("id,source_created_at,wa_id,customer_message,actual_reply,historical_truth,historical_truth_confidence")
    .eq("wa_id", anchor.wa_id)
    .lte("source_created_at", anchor.source_created_at)
    .order("source_created_at", { ascending: false })
    .limit(maxTurns);
  if (error) throw new Error(`v3_archive_sequence:${error.message}`);
  return ((data || []) as ArchiveCaseRow[]).reverse();
}

async function createRun(anchorCaseId: string, waId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_v3_archive_runs")
    .insert({ anchor_case_id: anchorCaseId, wa_id: waId, status: "processing", runtime_version: V3_OS_VERSION })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`v3_archive_run_create:${error?.message || "missing_id"}`);
  return String(data.id);
}

export type V3ArchiveSequenceResult = {
  runId: string;
  waId: string;
  turnCount: number;
  v3AverageScore: number;
  historicalAverageScore: number | null;
  criticalFailureCount: number;
  continuityFailureCount: number;
  turns: Array<{
    caseId: string;
    customerText: string;
    historicalReply: string | null;
    v3Reply: string | null;
    judge: V3JudgeResult;
    finalSafetyPass: boolean;
  }>;
};

export async function runV3ArchiveSequence(input: { anchorCaseId: string; maxTurns?: number }): Promise<V3ArchiveSequenceResult> {
  const s = await settings();
  const maxTurns = Math.max(1, Math.min(input.maxTurns || num(s.max_turns_per_run,6), 12));
  const rows = await loadSequence(input.anchorCaseId,maxTurns);
  if (!rows.length) throw new Error("v3_archive_sequence_empty");
  const runId = await createRun(input.anchorCaseId,rows[0].wa_id);

  try {
    const dsKey = process.env.DEEPSEEK_V3_API_KEY || process.env.DEEPSEEK_V2_API_KEY || "";
    const oaKey = process.env.OPENAI_V3_API_KEY || process.env.OPENAI_V2_API_KEY || "";
    if (!dsKey) throw new Error("v3_deepseek_key_missing");
    if (!oaKey) throw new Error("v3_openai_key_missing");

    const interpreterModel = s.deepseek_interpreter_model || s.deepseek_model || "deepseek-chat";
    const writerModel = s.deepseek_writer_model || s.deepseek_model || "deepseek-chat";
    const judgeModel = s.openai_judge_model || "";
    if (!judgeModel) throw new Error("v3_openai_judge_model_missing");

    const interpreterBase = createDeepSeekProvider(dsKey,interpreterModel);
    const writerBase = createDeepSeekProvider(dsKey,writerModel);
    const judgeBase = createOpenAiProvider(oaKey,judgeModel);

    const interpreter = withV3BudgetGuard(interpreterBase,{ runId,provider:"deepseek",model:interpreterModel,purpose:"interpreter",reserveUsd:num(s.deepseek_reserve_per_call_usd,0.01) });
    const writer = withV3BudgetGuard(writerBase,{ runId,provider:"deepseek",model:writerModel,purpose:"writer",reserveUsd:num(s.deepseek_reserve_per_call_usd,0.01) });
    const judgeProvider = withV3BudgetGuard(judgeBase,{ runId,provider:"openai",model:judgeModel,purpose:"judge",reserveUsd:num(s.openai_reserve_per_call_usd,0.03) });

    let state: ConversationState = emptyState(rows[0].wa_id);
    let simulatedTruth: TruthBundle | null = null;
    const recent: string[] = [];
    const results: V3ArchiveSequenceResult["turns"] = [];
    let v3ScoreSum = 0, histScoreSum = 0, histCount = 0, critical = 0, continuity = 0;

    for (let i=0;i<rows.length;i++) {
      const row = rows[i];
      const historical = historicalTruth(row);
      const effectiveTruth = mergeArchiveExternalTruth(simulatedTruth,historical);
      const run = await runV3ProductionShadow({
        waId: row.wa_id,
        turnId: `archive:${row.id}`,
        customerText: row.customer_message,
        state,
        recentTurns: recent.slice(-16),
        writer,
        interpreter,
        truthOverride: effectiveTruth,
        persistState: false,
        actionMode: "simulate",
      });
      simulatedTruth = run.truthAfterActions;

      const judged = await judgeV3Turn({
        provider: judgeProvider,
        customerText: row.customer_message,
        historicalReply: row.actual_reply || null,
        v3Reply: run.reply,
        turn: run.turn,
        stateBefore: run.stateBefore,
        stateAfter: run.stateAfter,
        truth: run.truthAfterActions,
        plan: run.plan,
        actions: run.actions,
        verification: run.verification,
      });
      state = run.stateAfter;
      recent.push(`العميل: ${row.customer_message}`);
      if (run.reply) recent.push(`الأمين: ${run.reply}`);

      v3ScoreSum += judged.v3Score;
      if (judged.historicalScore != null) { histScoreSum += judged.historicalScore; histCount++; }
      critical += judged.criticalFailures.length;
      continuity += judged.continuityFailures.length;

      const turnResult = {
        caseId: row.id,
        customerText: row.customer_message,
        historicalReply: row.actual_reply || null,
        v3Reply: run.reply,
        judge: judged,
        finalSafetyPass: run.finalSafetyPass,
      };
      results.push(turnResult);

      const { error: terr } = await supabaseAdmin.from("whatsapp_v3_archive_turn_results").insert({
        run_id: runId,
        source_case_id: row.id,
        turn_index: i + 1,
        customer_message: row.customer_message,
        historical_reply: row.actual_reply || null,
        v3_reply: run.reply,
        interpretation: run.turn,
        state_before: run.stateBefore,
        state_after: run.stateAfter,
        // Preserve the actual historical snapshot for auditability. The
        // simulated branch is carried in action_results.details and judge input.
        historical_truth: historical,
        plan: run.plan,
        action_results: run.actions,
        verification: run.verification,
        judge_result: judged,
        v3_score: judged.v3Score,
        historical_score: judged.historicalScore,
        critical_failures: judged.criticalFailures,
        continuity_failures: judged.continuityFailures,
        final_safety_pass: run.finalSafetyPass,
      });
      if (terr) throw new Error(`v3_archive_turn_persist:${terr.message}`);
    }

    const summary: V3ArchiveSequenceResult = {
      runId,
      waId: rows[0].wa_id,
      turnCount: results.length,
      v3AverageScore: results.length ? Math.round((v3ScoreSum/results.length)*100)/100 : 0,
      historicalAverageScore: histCount ? Math.round((histScoreSum/histCount)*100)/100 : null,
      criticalFailureCount: critical,
      continuityFailureCount: continuity,
      turns: results,
    };
    const { error: uerr } = await supabaseAdmin.from("whatsapp_v3_archive_runs").update({
      status: critical ? "needs_review" : "succeeded",
      turn_count: summary.turnCount,
      v3_avg_score: summary.v3AverageScore,
      historical_avg_score: summary.historicalAverageScore,
      critical_failure_count: critical,
      continuity_failure_count: continuity,
      result_json: summary,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id",runId);
    if (uerr) throw new Error(`v3_archive_run_finish:${uerr.message}`);
    return summary;
  } catch (error) {
    try {
      await supabaseAdmin.from("whatsapp_v3_archive_runs").update({
        status:"failed",
        last_error: error instanceof Error ? error.message : "v3_archive_sequence_failed",
        completed_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      }).eq("id",runId);
    } catch {}
    throw error;
  }
}
