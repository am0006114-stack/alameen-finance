import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExportFormat = "json" | "csv" | "copy";
type PrivacyMode = "redacted" | "full";

type ShadowJob = Record<string, unknown> & {
  id: string;
  wa_id?: string | null;
  tracking_id?: string | null;
  customer_name?: string | null;
  created_at?: string | null;
};

type ShadowAttempt = Record<string, unknown> & {
  job_id?: string | null;
};

type ExportedJob = Record<string, unknown> & {
  status?: string | null;
  attempts: unknown[];
};

const JOB_FIELDS = [
  "id",
  "incoming_message_id",
  "wa_id",
  "customer_name",
  "customer_message",
  "message_type",
  "actual_reply",
  "initial_intent",
  "tracking_id",
  "application_id",
  "status",
  "attempt_count",
  "max_attempts",
  "next_attempt_at",
  "candidate_reply",
  "topics",
  "agent",
  "quality_score",
  "risk_flags",
  "answered_topics",
  "missing_topics",
  "facts",
  "model",
  "provider_http_status",
  "parse_mode",
  "generation_ms",
  "last_error_code",
  "last_error_message",
  "created_at",
  "updated_at",
  "completed_at",
].join(", ");

const ATTEMPT_FIELDS = [
  "id",
  "job_id",
  "job_attempt",
  "provider_attempt",
  "model",
  "started_at",
  "completed_at",
  "latency_ms",
  "http_status",
  "outcome",
  "error_code",
  "error_message",
  "raw_response",
  "created_at",
].join(", ");

function parseHours(value: string | null) {
  const hours = Number(value || "24");
  return [6, 12, 24, 48, 72, 168].includes(hours) ? hours : 24;
}

function parseResult(value: string | null) {
  const allowed = ["all", "succeeded", "blocked", "queued", "retry_wait", "dead_letter"];
  return allowed.includes(String(value || "")) ? String(value) : "all";
}

function parseAgent(value: string | null) {
  const allowed = ["all", "followup", "study", "omran"];
  return allowed.includes(String(value || "")) ? String(value) : "all";
}

function parseFormat(value: string | null): ExportFormat {
  return value === "csv" || value === "copy" ? value : "json";
}

function parsePrivacy(value: string | null): PrivacyMode {
  return value === "full" ? "full" : "redacted";
}

function pseudonym(value: string | null | undefined) {
  const raw = String(value || "unknown");
  return `case-${createHash("sha256").update(raw).digest("hex").slice(0, 10)}`;
}

function redactString(value: string) {
  return value
    .replace(/AM-\d{8,}/gi, "[TRACKING_REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]")
    .replace(/(?:\+?962|00962|0)?7[789]\d{7}/g, "[PHONE_REDACTED]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, (match) => {
      const digits = match.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15 ? "[PHONE_REDACTED]" : match;
    })
    .replace(/https?:\/\/[^\s)]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[URL_REDACTED]";
      }
    });
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/^(wa_id|phone|phone_number|customer_name|full_name|email|address|identity|national_id|id_number)$/i.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeValue(child);
      }
    }
    return result;
  }
  return value;
}

function sanitizeJob(job: ShadowJob, privacy: PrivacyMode) {
  if (privacy === "full") return job;

  const cleaned = sanitizeValue(job) as Record<string, unknown>;
  cleaned.wa_id = pseudonym(job.wa_id);
  cleaned.customer_name = "[REDACTED]";
  cleaned.tracking_id = job.tracking_id ? "[TRACKING_REDACTED]" : null;
  cleaned.incoming_message_id = job.id;
  return cleaned;
}

function sanitizeAttempt(attempt: ShadowAttempt, privacy: PrivacyMode) {
  return privacy === "full" ? attempt : sanitizeValue(attempt);
}

async function fetchJobs(input: {
  since: string;
  result: string;
  agent: string;
}) {
  const pageSize = 1000;
  const maxRows = 5000;
  const rows: ShadowJob[] = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    let query = supabaseAdmin
      .from("whatsapp_shadow_jobs")
      .select(JOB_FIELDS)
      .gte("created_at", input.since)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (input.result === "queued") query = query.in("status", ["queued", "processing"]);
    else if (input.result !== "all") query = query.eq("status", input.result);
    if (input.agent !== "all") query = query.eq("agent", input.agent);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const batch = Array.isArray(data) ? (data as unknown as ShadowJob[]) : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchAttempts(jobIds: string[]) {
  const rows: ShadowAttempt[] = [];
  const chunkSize = 100;

  for (let index = 0; index < jobIds.length; index += chunkSize) {
    const chunk = jobIds.slice(index, index + chunkSize);
    const { data, error } = await supabaseAdmin
      .from("whatsapp_shadow_attempts")
      .select(ATTEMPT_FIELDS)
      .in("job_id", chunk)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    const batch = Array.isArray(data) ? (data as unknown as ShadowAttempt[]) : [];
    rows.push(...batch);
  }

  return rows;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
  return `"${String(text).replace(/"/g, '""')}"`;
}

function toCsv(jobs: ExportedJob[]) {
  const headers = [
    "job_id",
    "created_at",
    "case_id",
    "status",
    "initial_intent",
    "message_type",
    "agent",
    "quality_score",
    "customer_message",
    "actual_reply",
    "candidate_reply",
    "topics",
    "risk_flags",
    "answered_topics",
    "missing_topics",
    "model",
    "provider_http_status",
    "parse_mode",
    "generation_ms",
    "attempt_count",
    "max_attempts",
    "last_error_code",
    "last_error_message",
    "attempts_json",
  ];

  const lines = [headers.map(csvCell).join(",")];
  for (const job of jobs) {
    const row = [
      job.id,
      job.created_at,
      job.wa_id,
      job.status,
      job.initial_intent,
      job.message_type,
      job.agent,
      job.quality_score,
      job.customer_message,
      job.actual_reply,
      job.candidate_reply,
      job.topics,
      job.risk_flags,
      job.answered_topics,
      job.missing_topics,
      job.model,
      job.provider_http_status,
      job.parse_mode,
      job.generation_ms,
      job.attempt_count,
      job.max_attempts,
      job.last_error_code,
      job.last_error_message,
      job.attempts || [],
    ];
    lines.push(row.map(csvCell).join(","));
  }

  return `\uFEFF${lines.join("\r\n")}`;
}

export async function GET(request: NextRequest) {
  if (!(await isAdminLoggedIn())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hours = parseHours(request.nextUrl.searchParams.get("hours"));
  const result = parseResult(request.nextUrl.searchParams.get("result"));
  const agent = parseAgent(request.nextUrl.searchParams.get("agent"));
  const format = parseFormat(request.nextUrl.searchParams.get("format"));
  const privacy = parsePrivacy(request.nextUrl.searchParams.get("privacy"));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    const jobs = await fetchJobs({ since, result, agent });
    const attempts = await fetchAttempts(jobs.map((job) => job.id));
    const attemptsByJob = new Map<string, ShadowAttempt[]>();

    for (const attempt of attempts) {
      const jobId = String(attempt.job_id || "");
      const current = attemptsByJob.get(jobId) || [];
      current.push(attempt);
      attemptsByJob.set(jobId, current);
    }

    const exportedJobs: ExportedJob[] = jobs.map((job) => {
      const sanitized = sanitizeJob(job, privacy) as Record<string, unknown>;

      return {
        ...sanitized,
        status: typeof sanitized.status === "string" ? sanitized.status : null,
        attempts: (attemptsByJob.get(job.id) || []).map((attempt) => sanitizeAttempt(attempt, privacy)),
      };
    });

    const summary = {
      total: exportedJobs.length,
      succeeded: exportedJobs.filter((job) => job.status === "succeeded").length,
      blocked: exportedJobs.filter((job) => job.status === "blocked").length,
      queuedOrProcessing: exportedJobs.filter((job) => job.status === "queued" || job.status === "processing").length,
      retryWait: exportedJobs.filter((job) => job.status === "retry_wait").length,
      deadLetter: exportedJobs.filter((job) => job.status === "dead_letter").length,
    };

    const payload = {
      schemaVersion: "alameen-shadow-export-v1",
      exportedAt: new Date().toISOString(),
      privacy,
      filters: { hours, result, agent, since },
      summary,
      jobs: exportedJobs,
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "csv") {
      const csv = toCsv(exportedJobs);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="alameen-shadow-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const json = JSON.stringify(payload, null, 2);
    if (format === "copy") {
      return new NextResponse(json, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="alameen-shadow-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
