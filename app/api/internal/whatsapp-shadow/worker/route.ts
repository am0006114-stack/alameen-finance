import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateShadowReply } from "@/app/api/whatsapp/webhook/_lib/shadow-core";
import type { ApplicationRecord, CustomerIntent } from "@/app/api/whatsapp/webhook/_lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ShadowJob = {
  id: string;
  incoming_message_id: string;
  wa_id: string;
  customer_name?: string | null;
  customer_message: string;
  message_type?: string | null;
  actual_reply: string;
  initial_intent?: string | null;
  tracking_id?: string | null;
  application_snapshot?: unknown;
  conversation_snapshot?: unknown;
  attempt_count: number;
  max_attempts: number;
  locked_by?: string | null;
};

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function isAuthorized(request: NextRequest) {
  if (await isAdminLoggedIn()) return true;
  const supplied = String(request.headers.get("x-shadow-worker-token") || "");
  if (!supplied) return false;

  const { data, error } = await supabaseAdmin
    .from("whatsapp_shadow_settings")
    .select("value")
    .eq("key", "worker_token")
    .maybeSingle();

  if (error || !data?.value) return false;
  return secureEqual(supplied, String(data.value));
}

function retryAt(attemptCount: number) {
  const minutes = Math.min(30, Math.max(2, Math.pow(2, Math.max(0, attemptCount - 1)) * 2));
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function safeApplication(value: unknown): ApplicationRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ApplicationRecord
    : null;
}

function safeConversation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  return {
    conversationContext: typeof obj.conversationContext === "string" ? obj.conversationContext : "",
    lastAssistantReplies: Array.isArray(obj.lastAssistantReplies) ? obj.lastAssistantReplies.map(String).slice(0, 8) : [],
    lastCustomerMessages: Array.isArray(obj.lastCustomerMessages) ? obj.lastCustomerMessages.map(String).slice(0, 10) : [],
  };
}

async function saveAttempts(job: ShadowJob, attempts: Awaited<ReturnType<typeof evaluateShadowReply>>["generation"]["attempts"]) {
  if (!attempts.length) return;
  const rows = attempts.map((attempt) => ({
    job_id: job.id,
    job_attempt: job.attempt_count,
    provider_attempt: attempt.providerAttempt,
    model: attempt.model,
    started_at: attempt.startedAt,
    completed_at: attempt.completedAt,
    latency_ms: attempt.latencyMs,
    http_status: attempt.httpStatus,
    outcome: attempt.outcome,
    error_code: attempt.errorCode,
    error_message: attempt.errorMessage,
    raw_response: attempt.rawResponse,
  }));
  const { error } = await supabaseAdmin.from("whatsapp_shadow_attempts").insert(rows);
  if (error) console.error("Shadow attempt logging failed", { jobId: job.id, error });
}

async function processJob(job: ShadowJob, workerId: string) {
  try {
    const evaluation = await evaluateShadowReply({
      customerName: job.customer_name || null,
      customerMessage: job.customer_message,
      messageType: job.message_type || "text",
      initialIntent: (job.initial_intent || "unknown") as CustomerIntent,
      actualReply: job.actual_reply,
      trackingId: job.tracking_id || null,
      application: safeApplication(job.application_snapshot),
      conversationSnapshot: safeConversation(job.conversation_snapshot),
    });

    await saveAttempts(job, evaluation.generation.attempts);

    if (evaluation.generation.ok) {
      const finalStatus = evaluation.validation.valid ? "succeeded" : "blocked";
      const { error } = await supabaseAdmin
        .from("whatsapp_shadow_jobs")
        .update({
          status: finalStatus,
          candidate_reply: evaluation.candidateReply,
          topics: evaluation.topics,
          agent: evaluation.agent,
          quality_score: evaluation.validation.score,
          risk_flags: evaluation.validation.riskFlags,
          answered_topics: evaluation.validation.answeredTopics,
          missing_topics: evaluation.validation.missingTopics,
          facts: evaluation.facts,
          model: evaluation.generation.model,
          provider_http_status: evaluation.generation.providerHttpStatus,
          parse_mode: evaluation.generation.parseMode,
          generation_ms: evaluation.generation.generationMs,
          last_error_code: null,
          last_error_message: null,
          completed_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("locked_by", workerId);
      if (error) throw error;
      return { id: job.id, status: finalStatus };
    }

    const permanent = !evaluation.generation.retryable || job.attempt_count >= job.max_attempts;
    const status = permanent ? "dead_letter" : "retry_wait";
    const { error } = await supabaseAdmin
      .from("whatsapp_shadow_jobs")
      .update({
        status,
        topics: evaluation.topics,
        agent: evaluation.agent,
        quality_score: 0,
        risk_flags: evaluation.validation.riskFlags,
        facts: evaluation.facts,
        model: evaluation.generation.model,
        provider_http_status: evaluation.generation.providerHttpStatus,
        parse_mode: evaluation.generation.parseMode,
        generation_ms: evaluation.generation.generationMs,
        last_error_code: evaluation.generation.errorCode,
        last_error_message: evaluation.generation.errorMessage,
        next_attempt_at: permanent ? null : retryAt(job.attempt_count),
        completed_at: permanent ? new Date().toISOString() : null,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("locked_by", workerId);
    if (error) throw error;
    return { id: job.id, status, error: evaluation.generation.errorCode };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const permanent = job.attempt_count >= job.max_attempts;
    await supabaseAdmin
      .from("whatsapp_shadow_jobs")
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
    return { id: job.id, status: permanent ? "dead_letter" : "retry_wait", error: "worker_exception" };
  }
}

async function runWorker(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = `shadow:${randomUUID()}`;
  await supabaseAdmin.rpc("requeue_stale_whatsapp_shadow_jobs", { p_stale_minutes: 10 });
  const { data, error } = await supabaseAdmin.rpc("claim_whatsapp_shadow_jobs", {
    p_worker_id: workerId,
    p_limit: 2,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = (data || []) as ShadowJob[];
  const results: Array<{ id: string; status: string; error?: string | null }> = [];
  for (const job of jobs) results.push(await processJob(job, workerId));

  return NextResponse.json({ ok: true, workerId, claimed: jobs.length, results });
}

export async function GET(request: NextRequest) {
  return runWorker(request);
}

export async function POST(request: NextRequest) {
  return runWorker(request);
}
