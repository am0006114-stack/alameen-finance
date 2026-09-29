import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyDurableIngressWorkerToken } from "@/app/api/whatsapp/webhook/_lib/v3-os/durableIngress";
import type { WhatsAppWebhookBody } from "@/app/api/whatsapp/webhook/_lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type LiveIngressJob = {
  id: string;
  event_key: string;
  event_kind: "message" | "status";
  wa_id?: string | null;
  incoming_message_id?: string | null;
  payload: WhatsAppWebhookBody;
  status: string;
  attempt_count: number;
  max_attempts: number;
  created_at?: string | null;
  locked_by?: string | null;
};

async function loadWorkerToken() {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_live_ingress_settings")
    .select("value")
    .eq("key", "worker_token")
    .maybeSingle();
  if (error || !data?.value) return "";
  return String(data.value);
}

async function authorize(request: NextRequest) {
  const supplied = String(request.headers.get("x-alameen-live-worker-token") || "").trim();
  if (supplied && await verifyDurableIngressWorkerToken(supplied)) {
    return { ok: true as const, workerToken: supplied };
  }

  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = String(request.headers.get("authorization") || "");
  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    const workerToken = await loadWorkerToken();
    if (workerToken) return { ok: true as const, workerToken };
  }

  return { ok: false as const, workerToken: "" };
}

function retryAt(attemptCount: number) {
  const seconds = Math.min(600, Math.max(60, 60 * Math.pow(2, Math.max(0, attemptCount - 1))));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function heartbeat(key: string, value: string) {
  const { error } = await supabaseAdmin
    .from("whatsapp_live_ingress_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) console.error("V3 durable ingress heartbeat failed", { key, error: error.message });
}

async function processJob(input: {
  job: LiveIngressJob;
  workerId: string;
  workerToken: string;
  origin: string;
}) {
  const { job, workerId, workerToken, origin } = input;

  try {
    const response = await fetch(`${origin}/api/whatsapp/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-alameen-live-worker-token": workerToken,
        "x-alameen-live-ingress-job-id": job.id,
      },
      body: JSON.stringify(job.payload),
      cache: "no-store",
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`live_webhook_${response.status}:${responseText.slice(0, 1200)}`);
    }

    const { error } = await supabaseAdmin
      .from("whatsapp_live_ingress_jobs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        next_attempt_at: null,
        locked_at: null,
        locked_by: null,
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("locked_by", workerId);

    if (error) throw error;

    return { id: job.id, eventKey: job.event_key, status: "succeeded" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const permanent = Number(job.attempt_count || 0) >= Number(job.max_attempts || 6);

    const { error: updateError } = await supabaseAdmin
      .from("whatsapp_live_ingress_jobs")
      .update({
        status: permanent ? "dead_letter" : "retry_wait",
        next_attempt_at: permanent ? null : retryAt(job.attempt_count),
        completed_at: permanent ? new Date().toISOString() : null,
        locked_at: null,
        locked_by: null,
        last_error_code: "live_worker_exception",
        last_error_message: message.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("locked_by", workerId);

    if (updateError) {
      console.error("V3 durable ingress retry state update failed", {
        jobId: job.id,
        error: updateError.message,
      });
    }

    console.error("V3 durable ingress worker job failed", {
      jobId: job.id,
      eventKey: job.event_key,
      attempt: job.attempt_count,
      permanent,
      error: message,
    });

    return {
      id: job.id,
      eventKey: job.event_key,
      status: permanent ? "dead_letter" : "retry_wait",
      error: message.slice(0, 400),
    };
  }
}

async function runWorker(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workerId = `live-ingress:${randomUUID()}`;
  const origin = new URL(request.url).origin;
  await heartbeat("worker_last_seen_at", new Date().toISOString());

  const { error: staleError } = await supabaseAdmin.rpc("requeue_stale_whatsapp_live_ingress_jobs", {
    p_stale_minutes: 6,
  });
  if (staleError) {
    console.error("V3 durable ingress stale-job requeue failed", { error: staleError.message });
  }

  // Phase 11.5: one trigger invocation drains multiple claim waves. The Phase
  // 10.1 SQL still exposes only the oldest unfinished row per wa_id, preserving
  // serialization, but we no longer wait for the one-minute backup cron before
  // the next message from the same customer becomes eligible.
  const maxClaimPasses = 8;
  const maxJobsPerInvocation = 24;
  const results: Array<Record<string, unknown>> = [];
  let claimPasses = 0;

  while (claimPasses < maxClaimPasses && results.length < maxJobsPerInvocation) {
    const remaining = Math.max(1, Math.min(4, maxJobsPerInvocation - results.length));
    const { data, error } = await supabaseAdmin.rpc("claim_whatsapp_live_ingress_jobs", {
      p_worker_id: workerId,
      p_limit: remaining,
    });

    if (error) {
      await heartbeat("worker_last_result", JSON.stringify({ ok: false, at: new Date().toISOString(), error: error.message, workerId, claimPasses }));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const jobs = ((data || []) as LiveIngressJob[])
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    if (!jobs.length) break;

    claimPasses += 1;
    // Different wa_id values remain parallel. Same-customer rows remain serialized
    // by the SQL oldest-unfinished invariant and become claimable on the next loop.
    const passResults = await Promise.all(jobs.map((job) => processJob({
      job,
      workerId,
      workerToken: auth.workerToken,
      origin,
    })));
    results.push(...passResults);
  }

  await heartbeat("worker_last_result", JSON.stringify({
    ok: true,
    at: new Date().toISOString(),
    workerId,
    claimPasses,
    claimed: results.length,
    succeeded: results.filter((item) => item.status === "succeeded").length,
    retryWait: results.filter((item) => item.status === "retry_wait").length,
    deadLetter: results.filter((item) => item.status === "dead_letter").length,
  }));

  return NextResponse.json({ ok: true, workerId, claimPasses, claimed: results.length, results });
}

export async function GET(request: NextRequest) {
  return runWorker(request);
}

export async function POST(request: NextRequest) {
  return runWorker(request);
}
