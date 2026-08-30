import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  evaluateUnderstanding,
  interpretConversationTurn,
  loadConversationState,
  reduceConversationState,
  saveConversationState,
} from "@/app/api/whatsapp/webhook/_lib/v2-conversation";
import type { V2ShadowJob } from "@/app/api/whatsapp/webhook/_lib/v2-conversation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function isAuthorized(request: NextRequest) {
  if (await isAdminLoggedIn()) return true;

  const supplied = String(request.headers.get("x-shadow-worker-token") || "");
  if (supplied) {
    const { data } = await supabaseAdmin
      .from("whatsapp_shadow_settings")
      .select("value")
      .eq("key", "worker_token")
      .maybeSingle();
    if (data?.value && secureEqual(supplied, String(data.value))) return true;
  }

  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = String(request.headers.get("authorization") || "");
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;

  return false;
}

function retryAt(attemptCount: number) {
  const minutes = Math.min(30, Math.max(2, Math.pow(2, Math.max(0, attemptCount - 1)) * 2));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function safeConversation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { conversationContext: "", lastAssistantReplies: [] as string[], lastCustomerMessages: [] as string[] };
  }
  const obj = value as Record<string, unknown>;
  return {
    conversationContext: typeof obj.conversationContext === "string" ? obj.conversationContext : "",
    lastAssistantReplies: Array.isArray(obj.lastAssistantReplies) ? obj.lastAssistantReplies.map(String).slice(0, 8) : [],
    lastCustomerMessages: Array.isArray(obj.lastCustomerMessages) ? obj.lastCustomerMessages.map(String).slice(0, 10) : [],
  };
}

async function heartbeat(key: string, value: string) {
  const { error } = await supabaseAdmin
    .from("whatsapp_shadow_settings")
    .upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
  if (error) console.error("V2 worker heartbeat failed", { key, error: error.message });
}

async function processJob(job: V2ShadowJob, workerId: string) {
  const started = Date.now();
  try {
    const snapshot = safeConversation(job.conversation_snapshot);
    const stateBefore = await loadConversationState(job.wa_id);

    const { turn, providerError } = await interpretConversationTurn({
      customerText: job.customer_message,
      messageType: job.message_type || "text",
      state: stateBefore,
      conversationContext: snapshot.conversationContext,
      lastCustomerMessages: snapshot.lastCustomerMessages,
      lastAssistantReplies: snapshot.lastAssistantReplies,
      useProvider: true,
    });

    const quality = evaluateUnderstanding({
      customerText: job.customer_message,
      messageType: job.message_type || "text",
      turn,
    });

    const stateAfter = reduceConversationState({
      state: stateBefore,
      turn,
      turnId: job.id,
      customerText: job.customer_message,
      actualReply: job.actual_reply,
      applicationId: job.application_id || null,
      trackingId: job.tracking_id || null,
    });

    await saveConversationState(stateAfter);

    const { error: attemptError } = await supabaseAdmin
      .from("whatsapp_v2_shadow_attempts")
      .insert({
        job_id: job.id,
        job_attempt: job.attempt_count,
        model: turn.provider?.model || null,
        latency_ms: turn.provider?.latencyMs || null,
        outcome: providerError ? "provider_fallback" : "success",
        error_code: providerError?.code || null,
        error_message: providerError?.message || null,
        interpretation_source: turn.source,
        created_at: new Date().toISOString(),
      });
    if (attemptError) console.error("V2 attempt log failed", { jobId: job.id, error: attemptError.message });

    const finalStatus = quality.pass ? "succeeded" : "needs_review";
    const { error } = await supabaseAdmin
      .from("whatsapp_v2_shadow_jobs")
      .update({
        status: finalStatus,
        interpretation: turn,
        resolved_turn: turn,
        state_before: stateBefore,
        state_after: stateAfter,
        understanding_score: quality.score,
        required_topics: quality.requiredTopics,
        covered_topics: quality.coveredTopics,
        missing_topics: quality.missingTopics,
        critical_flags: quality.criticalFlags,
        warnings: [...quality.warnings, ...turn.warnings],
        interpreter_model: turn.provider?.model || null,
        interpreter_ms: turn.provider?.latencyMs || Date.now() - started,
        interpreter_error_code: providerError?.code || null,
        interpreter_error_message: providerError?.message || null,
        completed_at: new Date().toISOString(),
        next_attempt_at: null,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("locked_by", workerId);

    if (error) throw error;

    return {
      id: job.id,
      status: finalStatus,
      score: quality.score,
      source: turn.source,
      topics: turn.topics,
      criticalFlags: quality.criticalFlags,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const permanent = job.attempt_count >= job.max_attempts;
    await supabaseAdmin
      .from("whatsapp_v2_shadow_jobs")
      .update({
        status: permanent ? "dead_letter" : "retry_wait",
        last_error_code: "worker_exception",
        last_error_message: message.slice(0, 2000),
        next_attempt_at: permanent ? null : retryAt(job.attempt_count),
        completed_at: permanent ? new Date().toISOString() : null,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("locked_by", workerId);

    return {
      id: job.id,
      status: permanent ? "dead_letter" : "retry_wait",
      error: "worker_exception",
    };
  }
}

async function runWorker(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = `v2-shadow:${randomUUID()}`;
  const startedAt = new Date().toISOString();
  await heartbeat("v2_worker_last_seen_at", startedAt);

  await supabaseAdmin.rpc("requeue_stale_whatsapp_v2_shadow_jobs", { p_stale_minutes: 10 });
  const { data, error } = await supabaseAdmin.rpc("claim_whatsapp_v2_shadow_jobs", {
    p_worker_id: workerId,
    p_limit: 2,
  });

  if (error) {
    await heartbeat("v2_worker_last_result", JSON.stringify({ ok: false, at: new Date().toISOString(), error: error.message }));
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const jobs = ((data || []) as V2ShadowJob[])
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));

  // Keep turns from the same WhatsApp conversation sequential so state cannot race.
  const groups = new Map<string, V2ShadowJob[]>();
  for (const job of jobs) {
    const rows = groups.get(job.wa_id) || [];
    rows.push(job);
    groups.set(job.wa_id, rows);
  }

  const resultGroups = await Promise.all(
    Array.from(groups.values()).map(async (rows) => {
      const results = [];
      for (const job of rows) results.push(await processJob(job, workerId));
      return results;
    }),
  );
  const results = resultGroups.flat();

  await heartbeat("v2_worker_last_result", JSON.stringify({
    ok: true,
    at: new Date().toISOString(),
    claimed: jobs.length,
    succeeded: results.filter((item) => item.status === "succeeded").length,
    needsReview: results.filter((item) => item.status === "needs_review").length,
  }));

  return NextResponse.json({
    ok: true,
    workerId,
    claimed: jobs.length,
    results,
  });
}

export async function GET(request: NextRequest) {
  return runWorker(request);
}

export async function POST(request: NextRequest) {
  return runWorker(request);
}
