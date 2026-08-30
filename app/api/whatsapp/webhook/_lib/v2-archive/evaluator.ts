import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { deterministicInterpret } from "../v2-conversation/deterministicInterpreter";
import { contextAsText, loadArchiveContext, loadHistoricalActionRequests } from "./history";
import { runDeepSeekArchiveReplay, runOpenAiAdjudicator, runOpenAiJudge, V2BudgetBlockedError } from "./providers";
import type { ArchiveCase, ArchiveJudgeResult } from "./types";

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function shouldAdjudicate(judge: ArchiveJudgeResult) {
  const close = Math.abs(Number(judge.candidate?.overall || 0) - Number(judge.actual?.overall || 0)) <= 6;
  return Boolean(
    judge.needs_adjudication ||
    Number(judge.confidence || 0) < 0.84 ||
    close ||
    (judge.critical_failures_candidate || []).length > 0
  );
}

function selectFinalJudge(primary: ArchiveJudgeResult, adjudication: ArchiveJudgeResult | null) {
  return adjudication || primary;
}

export async function evaluateArchiveCase(item: ArchiveCase, workerId: string) {
  const contextRows = await loadArchiveContext(item);
  const contextText = contextAsText(contextRows);
  const historicalActions = await loadHistoricalActionRequests(item);
  const deterministicAnchor = deterministicInterpret({
    customerText: item.customer_message,
    messageType: item.message_type || "text",
  });

  let deepseekCost = 0;
  let openaiCost = 0;
  try {
    const deepseek = await runDeepSeekArchiveReplay({ item, contextText, historicalActions, deterministicAnchor });
    deepseekCost += Number(deepseek.costUsd || 0);

    const primaryJudge = await runOpenAiJudge({ item, contextText, deepSeek: deepseek.result });
    openaiCost += Number(primaryJudge.costUsd || 0);

    let adjudication: Awaited<ReturnType<typeof runOpenAiAdjudicator>> | null = null;
    const { data: terraSetting } = await supabaseAdmin
      .from("whatsapp_v2_archive_settings")
      .select("value")
      .eq("key", "terra_adjudication_enabled")
      .maybeSingle();
    const terraEnabled = String(terraSetting?.value || "true").toLowerCase() !== "false";

    if (terraEnabled && shouldAdjudicate(primaryJudge.result)) {
      adjudication = await runOpenAiAdjudicator({ item, contextText, deepSeek: deepseek.result });
      openaiCost += Number(adjudication.costUsd || 0);
    }

    const finalJudge = selectFinalJudge(primaryJudge.result, adjudication?.result || null);
    const actualScore = Math.round(Number(finalJudge.actual?.overall || 0));
    const candidateScore = Math.round(Number(finalJudge.candidate?.overall || 0));
    const criticalActual = uniq(finalJudge.critical_failures_actual || []);
    const criticalCandidate = uniq(finalJudge.critical_failures_candidate || []);
    const failureTags = uniq([
      ...criticalCandidate,
      ...(candidateScore < 90 ? ["candidate_below_90"] : []),
      ...(finalJudge.winner === "actual" ? ["v1_beats_v2"] : []),
      ...(deterministicAnchor.warnings || []).filter((x) => x.includes("non_continuation")),
      ...(item.historical_truth_confidence === "limited" ? ["limited_historical_truth"] : []),
    ]);
    const needsReview = criticalCandidate.length > 0 || candidateScore < 90 || finalJudge.winner === "actual";

    const { error } = await supabaseAdmin
      .from("whatsapp_v2_archive_cases")
      .update({
        status: needsReview ? "needs_review" : "succeeded",
        context_snapshot: contextRows,
        deterministic_anchor: deterministicAnchor,
        deepseek_result: deepseek.result,
        candidate_reply: deepseek.result.candidate_reply,
        openai_judge: primaryJudge.result,
        openai_adjudication: adjudication?.result || null,
        actual_score: actualScore,
        candidate_score: candidateScore,
        score_delta: candidateScore - actualScore,
        winner: finalJudge.winner,
        judge_confidence: finalJudge.confidence,
        critical_actual: criticalActual,
        critical_candidate: criticalCandidate,
        failure_tags: failureTags,
        deepseek_cost_usd: deepseekCost,
        openai_cost_usd: openaiCost,
        total_cost_usd: deepseekCost + openaiCost,
        completed_at: new Date().toISOString(),
        next_attempt_at: null,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
        last_error_code: null,
        last_error_message: null,
      })
      .eq("id", item.id)
      .eq("locked_by", workerId);
    if (error) throw error;

    return {
      id: item.id,
      status: needsReview ? "needs_review" : "succeeded",
      actualScore,
      candidateScore,
      winner: finalJudge.winner,
      criticalCandidate,
      deepseekCost,
      openaiCost,
      adjudicated: Boolean(adjudication),
    };
  } catch (error) {
    if (error instanceof V2BudgetBlockedError) {
      await supabaseAdmin
        .from("whatsapp_v2_archive_cases")
        .update({
          status: "budget_blocked",
          next_attempt_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
          last_error_code: `${error.provider}_budget_blocked`,
          last_error_message: error.reason,
        })
        .eq("id", item.id)
        .eq("locked_by", workerId);
      return { id: item.id, status: "budget_blocked", provider: error.provider, reason: error.reason };
    }

    const message = error instanceof Error ? error.message : String(error);
    const permanent = item.attempt_count >= item.max_attempts;
    await supabaseAdmin
      .from("whatsapp_v2_archive_cases")
      .update({
        status: permanent ? "dead_letter" : "retry_wait",
        next_attempt_at: permanent ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
        completed_at: permanent ? new Date().toISOString() : null,
        last_error_code: "archive_evaluation_failed",
        last_error_message: message.slice(0, 1800),
      })
      .eq("id", item.id)
      .eq("locked_by", workerId);
    return { id: item.id, status: permanent ? "dead_letter" : "retry_wait", error: message };
  }
}
