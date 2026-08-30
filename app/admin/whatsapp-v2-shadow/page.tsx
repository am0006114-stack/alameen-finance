import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RunV2ShadowWorkerButton } from "./V2ShadowActions";

export const dynamic = "force-dynamic";

type Job = {
  id: string;
  created_at?: string | null;
  wa_id?: string | null;
  customer_message?: string | null;
  actual_reply?: string | null;
  status?: string | null;
  attempt_count?: number | null;
  understanding_score?: number | null;
  required_topics?: string[] | null;
  covered_topics?: string[] | null;
  missing_topics?: string[] | null;
  critical_flags?: string[] | null;
  warnings?: string[] | null;
  interpretation?: Record<string, unknown> | null;
  state_after?: Record<string, unknown> | null;
  interpreter_model?: string | null;
  interpreter_ms?: number | null;
  interpreter_error_code?: string | null;
  interpreter_error_message?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-JO", {
      dateStyle: "short",
      timeStyle: "medium",
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusStyle(status?: string | null) {
  if (status === "succeeded") return "border-emerald-300/30 bg-emerald-950/30 text-emerald-100";
  if (status === "needs_review") return "border-orange-300/30 bg-orange-950/30 text-orange-100";
  if (status === "dead_letter") return "border-red-300/30 bg-red-950/30 text-red-100";
  return "border-[#d6b56b]/30 bg-[#d6b56b]/10 text-[#f3dfac]";
}

function interpretationActs(job: Job) {
  const acts = job.interpretation?.acts;
  return Array.isArray(acts) ? acts as Array<Record<string, unknown>> : [];
}

export default async function V2ConversationShadowPage() {
  if (!(await isAdminLoggedIn())) redirect("/admin/login");

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [{ data, error }, { data: settingRows }] = await Promise.all([
    supabaseAdmin
      .from("whatsapp_v2_shadow_jobs")
      .select("id,created_at,wa_id,customer_message,actual_reply,status,attempt_count,understanding_score,required_topics,covered_topics,missing_topics,critical_flags,warnings,interpretation,state_after,interpreter_model,interpreter_ms,interpreter_error_code,interpreter_error_message")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(250),
    supabaseAdmin
      .from("whatsapp_shadow_settings")
      .select("key,value")
      .in("key", ["v2_worker_last_seen_at", "v2_worker_last_result", "legacy_worker_last_seen_at"]),
  ]);

  const rows = (data || []) as Job[];
  const settings = new Map<string, string>();
  for (const row of Array.isArray(settingRows) ? settingRows : []) {
    if (row.key) settings.set(String(row.key), String(row.value || ""));
  }

  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const scored = rows.filter((row) => ["succeeded", "needs_review"].includes(String(row.status || "")));
  const average = scored.length
    ? Math.round(scored.reduce((sum, row) => sum + Number(row.understanding_score || 0), 0) / scored.length)
    : 0;
  const attemptZero = rows.filter((row) => ["queued", "processing", "retry_wait"].includes(String(row.status || "")) && Number(row.attempt_count || 0) === 0).length;

  return (
    <main dir="rtl" className="min-h-screen bg-[#03120e] px-4 py-8 text-[#f7f3e8]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-black text-cyan-200">ALAMEEN V2.0 — Conversation OS</p>
            <h1 className="mt-1 text-3xl font-black text-white">مختبر فهم المحادثة — Shadow فقط</h1>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#aeb9af]">
              هذه المرحلة لا ترسل أي رد V2 للعميل ولا تغيّر أي حالة مالية أو طلب. مهمتها قياس: الأفعال المتعددة،
              المراجع، التصحيحات، الاستمرارية، وعدم ضياع الأسئلة أو قرارات الإلغاء/الاسترداد.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <RunV2ShadowWorkerButton />
            <div className="flex gap-2">
              <Link href="/admin/whatsapp-shadow" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white">
                Shadow القديم
              </Link>
              <Link href="/admin/whatsapp" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white">
                المحادثات
              </Link>
            </div>
          </div>
        </div>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["الإجمالي", rows.length],
            ["ناجح", count("succeeded")],
            ["يحتاج مراجعة", count("needs_review")],
            ["معلّق", count("queued") + count("processing")],
            ["Attempt 0", attemptZero],
            ["متوسط الفهم", `${average}%`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-black text-[#aeb9af]">{label}</p>
              <p className="mt-2 text-2xl font-black text-white">{value}</p>
            </div>
          ))}
        </section>

        <section className="mb-6 rounded-2xl border border-cyan-300/20 bg-cyan-950/15 p-4 text-sm font-bold leading-7 text-[#d7ddd5]">
          <div>آخر heartbeat لـ V2: <span dir="ltr">{settings.get("v2_worker_last_seen_at") || "لم يظهر بعد"}</span></div>
          <div>آخر نتيجة V2: <span dir="ltr">{settings.get("v2_worker_last_result") || "—"}</span></div>
          <div>آخر heartbeat للـ Shadow القديم: <span dir="ltr">{settings.get("legacy_worker_last_seen_at") || "لم يظهر بعد"}</span></div>
        </section>

        {error ? (
          <section className="rounded-2xl border border-red-300/25 bg-red-950/25 p-6 text-red-100">
            تعذر قراءة V2 Shadow: {error.message}. إذا لم يتم تشغيل Migration الخاصة بـ V2 بعد، فهذا متوقع.
          </section>
        ) : rows.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center font-bold text-[#aeb9af]">
            لا توجد مهام V2 خلال آخر 48 ساعة.
          </section>
        ) : (
          <div className="space-y-4">
            {rows.map((job) => {
              const acts = interpretationActs(job);
              return (
                <article key={job.id} className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04]">
                  <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/20 px-5 py-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle(job.status)}`}>{job.status || "—"}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black">الفهم {job.understanding_score ?? 0}%</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black">attempt {job.attempt_count ?? 0}</span>
                    <span className="text-xs font-bold text-[#aeb9af]">{formatDate(job.created_at)}</span>
                    <span dir="ltr" className="text-xs font-bold text-[#aeb9af]">{job.wa_id || "—"}</span>
                  </div>

                  <div className="grid gap-4 p-5 lg:grid-cols-2">
                    <div className="rounded-2xl border border-sky-300/15 bg-sky-950/10 p-4">
                      <p className="mb-2 text-xs font-black text-sky-200">رسالة العميل</p>
                      <p className="whitespace-pre-wrap text-sm font-bold leading-7 text-white">{job.customer_message || "—"}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                      <p className="mb-2 text-xs font-black text-[#aeb9af]">الرد الفعلي الحالي</p>
                      <p className="whitespace-pre-wrap text-sm font-bold leading-7 text-[#d7ddd5]">{job.actual_reply || "—"}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-white/10 px-5 py-4 lg:grid-cols-2">
                    <div>
                      <p className="text-xs font-black text-cyan-200">الأفعال التي فهمها V2</p>
                      <div className="mt-2 space-y-2">
                        {acts.length ? acts.map((act, index) => (
                          <div key={`${job.id}:act:${index}`} className="rounded-xl border border-cyan-300/15 bg-cyan-950/10 px-3 py-2 text-xs font-bold leading-6">
                            {String(act.type || "—")} → {String(act.topic || "—")}
                            {act.action ? ` | action=${String(act.action)}` : ""}
                            {act.value ? ` | value=${String(act.value)}` : ""}
                            {act.source ? ` | ${String(act.source)}` : ""}
                          </div>
                        )) : <p className="text-xs text-[#aeb9af]">لا توجد أفعال محفوظة بعد.</p>}
                      </div>
                    </div>

                    <div className="space-y-2 text-xs font-bold leading-6 text-[#d7ddd5]">
                      <div>Required: {(job.required_topics || []).join("، ") || "—"}</div>
                      <div>Covered: {(job.covered_topics || []).join("، ") || "—"}</div>
                      <div className={job.missing_topics?.length ? "text-orange-200" : ""}>Missing: {(job.missing_topics || []).join("، ") || "لا يوجد"}</div>
                      <div className={job.critical_flags?.length ? "text-red-200" : ""}>Critical: {(job.critical_flags || []).join("، ") || "لا يوجد"}</div>
                      <div>Warnings: {(job.warnings || []).join("، ") || "—"}</div>
                      <div dir="ltr">Model: {job.interpreter_model || "deterministic"} | {job.interpreter_ms ?? 0}ms</div>
                      {job.interpreter_error_code ? <div className="text-orange-200">Provider fallback: {job.interpreter_error_code} — {job.interpreter_error_message || ""}</div> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
