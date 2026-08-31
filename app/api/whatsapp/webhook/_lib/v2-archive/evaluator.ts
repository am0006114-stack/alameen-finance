import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { deterministicInterpret } from "../v2-conversation/deterministicInterpreter";
import { contextAsText, loadArchiveContext, loadHistoricalActionRequests } from "./history";
import { runDeepSeekArchiveReplay, runDeepSeekArchiveRepair, runOpenAiAdjudicator, runOpenAiJudge, V2BudgetBlockedError } from "./providers";
import { archiveConversationPolicyViolations, archiveReplyPolicyViolations, archiveTruthPolicyViolations, isLowValueArchiveNoise, isSimpleSocialArchiveTurn } from "./policyVerifier";
import type { ArchiveCase, ArchiveJudgeResult } from "./types";

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

const SCORE_KEYS = [
  "intent_alignment",
  "multi_topic_coverage",
  "continuity",
  "factual_grounding",
  "action_safety",
  "human_tone",
  "overall",
] as const;

type ScoreSide = ArchiveJudgeResult["actual"];

function normalizeJudgeScoreScale(judge: ArchiveJudgeResult) {
  const allValues = [judge.actual, judge.candidate]
    .flatMap((side) => SCORE_KEYS.map((key) => Number(side?.[key] ?? 0)))
    .filter((value) => Number.isFinite(value));

  // OpenAI occasionally interpreted the rubric as a 0-10 scale even though the
  // JSON schema allowed 0-100. Only repair when every score is <= 10, so genuine
  // low 0-100 scores are never multiplied accidentally.
  const looksLikeTenPointScale = allValues.length === SCORE_KEYS.length * 2 && allValues.every((value) => value >= 0 && value <= 10);
  if (!looksLikeTenPointScale) return { result: judge, repaired: false };

  const scale = (side: ScoreSide): ScoreSide => {
    const next = { ...side } as ScoreSide;
    for (const key of SCORE_KEYS) next[key] = Math.max(0, Math.min(100, Math.round(Number(side[key] || 0) * 10)));
    return next;
  };

  return {
    result: { ...judge, actual: scale(judge.actual), candidate: scale(judge.candidate) },
    repaired: true,
  };
}

function shouldAdjudicate(judge: ArchiveJudgeResult, item: ArchiveCase, localCandidateCritical: string[]) {
  // A deterministic policy violation cannot be rescued by a more expensive judge.
  if (localCandidateCritical.length > 0) return false;

  // Greetings/thanks are intentionally cheap. Luna is sufficient for the first pass.
  if (isSimpleSocialArchiveTurn(item.customer_message)) return false;

  const gap = Math.abs(Number(judge.candidate?.overall || 0) - Number(judge.actual?.overall || 0));
  const lowConfidence = Number(judge.confidence || 0) < 0.80;
  const trulyClose = gap <= 5;
  const explicitUncertainty = Boolean(judge.needs_adjudication) && gap <= 8;

  return Boolean(lowConfidence || judge.winner === "tie" || trulyClose || explicitUncertainty);
}

function selectFinalJudge(primary: ArchiveJudgeResult, adjudication: ArchiveJudgeResult | null) {
  return adjudication || primary;
}

async function skipNoiseCase(item: ArchiveCase, workerId: string) {
  const { error } = await supabaseAdmin
    .from("whatsapp_v2_archive_cases")
    .update({
      status: "skipped",
      failure_tags: ["archive_noise_skipped"],
      candidate_reply: null,
      actual_score: null,
      candidate_score: null,
      score_delta: null,
      winner: null,
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
  return { id: item.id, status: "skipped", reason: "archive_noise" };
}

export async function evaluateArchiveCase(item: ArchiveCase, workerId: string) {
  if (isLowValueArchiveNoise(item.customer_message, item.message_type)) {
    return skipNoiseCase(item, workerId);
  }

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

    const actualFindings = uniq([
      ...archiveReplyPolicyViolations(item.actual_reply || ""),
      ...archiveConversationPolicyViolations(item, item.actual_reply || ""),
      ...archiveTruthPolicyViolations(item, item.actual_reply || ""),
    ]);

    let finalDeepSeek = deepseek.result;
    let candidateFindings = uniq([
      ...archiveReplyPolicyViolations(finalDeepSeek.candidate_reply || ""),
      ...archiveConversationPolicyViolations(item, finalDeepSeek.candidate_reply || ""),
      ...archiveTruthPolicyViolations(item, finalDeepSeek.candidate_reply || ""),
    ]);
    const preRepairFindings = [...candidateFindings];
    let repairApplied = false;

    // Phase 2.5 FINAL GATE: Generate -> deterministic verify -> one focused repair -> verify again.
    // The judge only sees the post-repair candidate. This makes hard truth/policy failures
    // self-correcting without allowing the repair model to override deterministic truth.
    if (candidateFindings.length > 0) {
      const repair = await runDeepSeekArchiveRepair({
        item, contextText, historicalActions, deterministicAnchor,
        original: finalDeepSeek,
        violations: candidateFindings,
      });
      deepseekCost += Number(repair.costUsd || 0);
      repairApplied = true;
      finalDeepSeek = {
        ...finalDeepSeek,
        candidate_reply: repair.result.candidate_reply,
        confidence: Math.min(Number(finalDeepSeek.confidence || 0), Number(repair.result.confidence || finalDeepSeek.confidence || 0)),
        safety_flags: uniq([
          ...(finalDeepSeek.safety_flags || []),
          ...(repair.result.safety_flags || []),
          ...preRepairFindings.map((x) => `self_repaired:${x}`),
        ]),
      };
      candidateFindings = uniq([
        ...archiveReplyPolicyViolations(finalDeepSeek.candidate_reply || ""),
        ...archiveConversationPolicyViolations(item, finalDeepSeek.candidate_reply || ""),
        ...archiveTruthPolicyViolations(item, finalDeepSeek.candidate_reply || ""),
      ]);
    }

    const localFindings = { actual: actualFindings, candidate: candidateFindings };

    const primaryJudgeRaw = await runOpenAiJudge({ item, contextText, deepSeek: finalDeepSeek, localFindings });
    openaiCost += Number(primaryJudgeRaw.costUsd || 0);
    const normalizedPrimary = normalizeJudgeScoreScale(primaryJudgeRaw.result);
    const primaryJudge = { ...primaryJudgeRaw, result: normalizedPrimary.result };

    let adjudication: Awaited<ReturnType<typeof runOpenAiAdjudicator>> | null = null;
    const { data: terraSetting } = await supabaseAdmin
      .from("whatsapp_v2_archive_settings")
      .select("value")
      .eq("key", "terra_adjudication_enabled")
      .maybeSingle();
    const terraEnabled = String(terraSetting?.value || "true").toLowerCase() !== "false";

    if (terraEnabled && shouldAdjudicate(primaryJudge.result, item, localFindings.candidate)) {
      const adjudicationRaw = await runOpenAiAdjudicator({ item, contextText, deepSeek: finalDeepSeek, localFindings });
      openaiCost += Number(adjudicationRaw.costUsd || 0);
      const normalizedAdjudication = normalizeJudgeScoreScale(adjudicationRaw.result);
      adjudication = { ...adjudicationRaw, result: normalizedAdjudication.result };
    }

    const finalJudge = selectFinalJudge(primaryJudge.result, adjudication?.result || null);
    const localActual = uniq(localFindings.actual);
    const localCandidate = uniq(localFindings.candidate);

    // Phase 2.4: deterministic policy/truth findings are the authoritative hard-critical layer.
    // The semantic judge can still surface novel issues, but those become review tags rather
    // than silently overriding deterministic truth with a free-form critical description.
    const judgeCriticalActual = uniq(finalJudge.critical_failures_actual || []);
    const judgeCriticalCandidate = uniq(finalJudge.critical_failures_candidate || []);
    const criticalActual = localActual;
    const criticalCandidate = localCandidate;

    let actualScore = Math.round(Number(finalJudge.actual?.overall || 0));
    let candidateScore = Math.round(Number(finalJudge.candidate?.overall || 0));
    if (criticalActual.length > 0) actualScore = Math.min(actualScore, 49);
    if (criticalCandidate.length > 0) candidateScore = Math.min(candidateScore, 49);

    let winner = finalJudge.winner;
    if (criticalCandidate.length > 0 && criticalActual.length === 0) winner = "actual";
    else if (criticalActual.length > 0 && criticalCandidate.length === 0) winner = "candidate";
    else if (candidateScore > actualScore && winner === "actual") winner = "candidate";
    else if (actualScore > candidateScore && winner === "candidate") winner = "actual";

    const failureTags = uniq([
      ...criticalCandidate,
      ...judgeCriticalCandidate.map((x) => `judge_review:${x}`),
      ...(candidateScore < 90 ? ["candidate_below_90"] : []),
      ...(winner === "actual" ? ["v1_beats_v2"] : []),
      ...(deterministicAnchor.warnings || []).filter((x) => x.includes("non_continuation")),
      ...(item.historical_truth_confidence === "limited" ? ["limited_historical_truth"] : []),
      ...(repairApplied && candidateFindings.length > 0 ? ["self_repair_still_critical"] : []),
    ]);
    const needsReview =
      criticalCandidate.length > 0 ||
      judgeCriticalCandidate.length > 0 ||
      candidateScore < 90 ||
      winner === "actual";

    const { error } = await supabaseAdmin
      .from("whatsapp_v2_archive_cases")
      .update({
        status: needsReview ? "needs_review" : "succeeded",
        context_snapshot: contextRows,
        deterministic_anchor: deterministicAnchor,
        deepseek_result: finalDeepSeek,
        candidate_reply: finalDeepSeek.candidate_reply,
        openai_judge: primaryJudge.result,
        openai_adjudication: adjudication?.result || null,
        actual_score: actualScore,
        candidate_score: candidateScore,
        score_delta: candidateScore - actualScore,
        winner,
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
      winner,
      criticalCandidate,
      deepseekCost,
      openaiCost,
      adjudicated: Boolean(adjudication),
      repairApplied,
      repairedFrom: preRepairFindings,
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
