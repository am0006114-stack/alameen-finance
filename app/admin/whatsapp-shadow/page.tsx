import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RetryShadowJobButton, RunShadowWorkerButton } from "./ShadowActions";
import { ShadowExportActions } from "./ShadowExportActions";

export const dynamic = "force-dynamic";

type ShadowJob = {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
  wa_id?: string | null;
  customer_message?: string | null;
  actual_reply?: string | null;
  candidate_reply?: string | null;
  status?: string | null;
  initial_intent?: string | null;
  tracking_id?: string | null;
  topics?: string[] | null;
  agent?: string | null;
  quality_score?: number | null;
  risk_flags?: string[] | null;
  answered_topics?: string[] | null;
  missing_topics?: string[] | null;
  facts?: Record<string, unknown> | null;
  model?: string | null;
  provider_http_status?: number | null;
  parse_mode?: string | null;
  generation_ms?: number | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  attempt_count?: number | null;
  max_attempts?: number | null;
  next_attempt_at?: string | null;
  completed_at?: string | null;
  experiment_key?: string | null;
  comparison_group_id?: string | null;
  variant?: string | null;
  requested_model?: string | null;
  agent_name?: string | null;
  decision_mode?: string | null;
  route_reason?: string | null;
  sensitive_route?: boolean | null;
  deterministic_template?: string | null;
  draft_reply?: string | null;
  draft_risk_flags?: string[] | null;
  policy_checks?: Array<{ id?: string; passed?: boolean; severity?: string; message?: string }> | null;
  fallback_applied?: boolean | null;
  prompt_version?: string | null;
  decision_outcome?: string | null;
  draft_model?: string | null;
  final_model?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-JO", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function agentLabel(agent: string | null | undefined) {
  if (agent === "tala") return "تالا";
  if (agent === "fadwa") return "فدوة";
  if (agent === "abdullah") return "عبدالله";
  if (agent === "abdulrahman") return "عبدالرحمن";
  if (agent === "omran") return "عمران";
  if (agent === "study") return "الدراسة (قديم)";
  if (agent === "followup") return "المتابعة (قديم)";
  return agent || "—";
}

function modeInfo(mode: string | null | undefined) {
  if (mode === "deterministic") return { label: "حتمي", cls: "border-emerald-300/25 bg-emerald-950/25 text-emerald-100" };
  if (mode === "pro") return { label: "PRO", cls: "border-violet-300/25 bg-violet-950/25 text-violet-100" };
  if (mode === "flash") return { label: "FLASH", cls: "border-cyan-300/25 bg-cyan-950/25 text-cyan-100" };
  return { label: mode || "قديم", cls: "border-white/10 bg-white/5 text-[#d7ddd5]" };
}

function statusInfo(status: string | null | undefined) {
  switch (status) {
    case "succeeded": return { label: "اجتاز", cls: "border-emerald-300/25 bg-emerald-950/25 text-emerald-100" };
    case "blocked": return { label: "محجوب", cls: "border-red-300/25 bg-red-950/25 text-red-100" };
    case "processing": return { label: "قيد المعالجة", cls: "border-sky-300/25 bg-sky-950/25 text-sky-100" };
    case "retry_wait": return { label: "بانتظار إعادة المحاولة", cls: "border-amber-300/25 bg-amber-950/25 text-amber-100" };
    case "dead_letter": return { label: "فشل نهائي", cls: "border-orange-300/25 bg-orange-950/25 text-orange-100" };
    default: return { label: "معلقة", cls: "border-[#d6b56b]/25 bg-[#d6b56b]/10 text-[#f3dfac]" };
  }
}


function variantInfo(variant: string | null | undefined) {
  if (variant === "pro") return { label: "PRO", cls: "border-violet-300/30 bg-violet-950/30 text-violet-100" };
  if (variant === "flash") return { label: "FLASH", cls: "border-cyan-300/30 bg-cyan-950/30 text-cyan-100" };
  return { label: "PRIMARY", cls: "border-white/10 bg-white/5 text-[#d7ddd5]" };
}

type AbRow = {
  comparison_group_id?: string | null;
  variant?: string | null;
  status?: string | null;
  quality_score?: number | null;
  generation_ms?: number | null;
  model?: string | null;
};

function averageNumber(rows: AbRow[], key: "quality_score" | "generation_ms") {
  const eligible = key === "quality_score"
    ? rows.filter((row) => ["succeeded", "blocked"].includes(String(row.status || "")))
    : rows.filter((row) => Number(row.generation_ms || 0) > 0);
  const values = eligible
    .map((row) => Number(row[key]))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

type PageProps = {
  searchParams?: Promise<{ hours?: string; result?: string; agent?: string }>;
};

export default async function WhatsAppShadowReviewPage({ searchParams }: PageProps) {
  if (!(await isAdminLoggedIn())) redirect("/admin/login");

  const params = searchParams ? await searchParams : {};
  const hours = [6, 12, 24, 48, 72].includes(Number(params.hours)) ? Number(params.hours) : 24;
  const allowedResults = ["all", "succeeded", "blocked", "queued", "retry_wait", "dead_letter"];
  const resultFilter = allowedResults.includes(String(params.result)) ? String(params.result) : "all";
  const agentFilter = ["tala", "fadwa", "abdullah", "abdulrahman", "omran", "followup", "study"].includes(String(params.agent)) ? String(params.agent) : "all";
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from("whatsapp_shadow_jobs")
    .select("id, created_at, updated_at, wa_id, customer_message, actual_reply, candidate_reply, status, initial_intent, tracking_id, topics, agent, quality_score, risk_flags, answered_topics, missing_topics, facts, model, provider_http_status, parse_mode, generation_ms, last_error_code, last_error_message, attempt_count, max_attempts, next_attempt_at, completed_at, experiment_key, comparison_group_id, variant, requested_model, agent_name, decision_mode, route_reason, sensitive_route, deterministic_template, draft_reply, draft_risk_flags, policy_checks, fallback_applied, prompt_version, decision_outcome, draft_model, final_model")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (resultFilter === "queued") query = query.in("status", ["queued", "processing"]);
  else if (resultFilter !== "all") query = query.eq("status", resultFilter);
  if (agentFilter !== "all") query = query.eq("agent", agentFilter);

  const { data, error } = await query;
  const rows = (data || []) as ShadowJob[];

  const { data: statsData } = await supabaseAdmin
    .from("whatsapp_shadow_jobs")
    .select("status, quality_score, agent, decision_mode, fallback_applied")
    .gte("created_at", since)
    .limit(2000);
  const allRows = (statsData || []) as Array<{ status?: string | null; quality_score?: number | null; agent?: string | null; decision_mode?: string | null; fallback_applied?: boolean | null }>;

  const count = (statuses: string[]) => allRows.filter((row) => statuses.includes(String(row.status || ""))).length;
  const scored = allRows.filter((row) => ["succeeded", "blocked"].includes(String(row.status || "")));
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, row) => sum + Number(row.quality_score || 0), 0) / scored.length)
    : 0;

  const { data: settingData } = await supabaseAdmin
    .from("whatsapp_shadow_settings")
    .select("key, value")
    .in("key", ["ab_test_enabled", "ab_test_target_messages", "ab_test_key", "multi_agent_enabled", "shadow_prompt_version"]);
  const settings = new Map<string, string>();
  for (const row of (Array.isArray(settingData) ? settingData : []) as unknown as Array<{ key?: string; value?: string }>) {
    if (row.key) settings.set(row.key, String(row.value || ""));
  }
  const abEnabled = settings.get("ab_test_enabled") !== "false";
  const abTarget = Math.max(1, Number(settings.get("ab_test_target_messages") || "30"));
  const abKey = settings.get("ab_test_key") || "pro-vs-flash-20260803";
  const multiAgentEnabled = settings.get("multi_agent_enabled") === "true";
  const promptVersion = settings.get("shadow_prompt_version") || "legacy";
  const deterministicCount = allRows.filter((row) => row.decision_mode === "deterministic").length;
  const fallbackCount = allRows.filter((row) => row.fallback_applied).length;
  const agentCounts = ["tala", "fadwa", "abdullah", "abdulrahman", "omran"]
    .map((agent) => `${agentLabel(agent)} ${allRows.filter((row) => row.agent === agent).length}`)
    .join(" | ");

  const { data: abData } = await supabaseAdmin
    .from("whatsapp_shadow_jobs")
    .select("comparison_group_id, variant, status, quality_score, generation_ms, model")
    .eq("experiment_key", abKey)
    .order("created_at", { ascending: true })
    .limit(2000);
  const abRows = (Array.isArray(abData) ? abData : []) as unknown as AbRow[];
  const proRows = abRows.filter((row) => row.variant === "pro");
  const flashRows = abRows.filter((row) => row.variant === "flash");
  const abPairCount = new Set(proRows.map((row) => row.comparison_group_id).filter(Boolean)).size;
  const terminal = new Set(["succeeded", "blocked", "dead_letter"]);
  const pairs = new Map<string, { pro?: AbRow; flash?: AbRow }>();
  for (const row of abRows) {
    const key = String(row.comparison_group_id || "");
    if (!key) continue;
    const pair = pairs.get(key) || {};
    if (row.variant === "pro") pair.pro = row;
    if (row.variant === "flash") pair.flash = row;
    pairs.set(key, pair);
  }
  let completePairs = 0;
  let proWins = 0;
  let flashWins = 0;
  let ties = 0;
  for (const pair of pairs.values()) {
    if (!pair.pro || !pair.flash) continue;
    if (!terminal.has(String(pair.pro.status || "")) || !terminal.has(String(pair.flash.status || ""))) continue;
    completePairs += 1;
    const proScore = Number(pair.pro.quality_score || 0);
    const flashScore = Number(pair.flash.quality_score || 0);
    if (proScore > flashScore) proWins += 1;
    else if (flashScore > proScore) flashWins += 1;
    else ties += 1;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#03120e] px-4 py-8 text-[#f7f3e8]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black text-[#d6b56b]">Shadow Queue — مستقل عن واتساب</p>
            <h1 className="mt-1 text-3xl font-black text-white">مراجعة الردود التجريبية</h1>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#aeb9af]">
              الرد الفعلي وصل من النظام المستقر. المعالجة التجريبية تعمل من طابور مستقل، مع محاولات وأخطاء محفوظة، ولا تغيّر الطلب أو ترسل أي رد للعميل.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <RunShadowWorkerButton />
            <ShadowExportActions hours={hours} result={resultFilter} agent={agentFilter} />
            <div className="flex gap-2">
              <Link href="/admin/whatsapp" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white">محادثات واتساب</Link>
              <Link href="/admin" className="rounded-2xl border border-[#d6b56b]/25 bg-[#d6b56b]/10 px-5 py-3 text-sm font-black text-[#f3dfac]">لوحة الأدمن</Link>
            </div>
          </div>
        </div>

        <section className="mb-6 grid gap-4 md:grid-cols-6">
          <Stat label="إجمالي المهام" value={allRows.length} />
          <Stat label="اجتازت" value={count(["succeeded"])} tone="green" />
          <Stat label="محجوبة" value={count(["blocked"])} tone="red" />
          <Stat label="معلقة/تعمل" value={count(["queued", "processing"])} tone="gold" />
          <Stat label="إعادة/فشل" value={count(["retry_wait", "dead_letter"])} tone="orange" />
          <Stat label="متوسط الجودة" value={`${averageScore}%`} tone="gold" />
        </section>


        <section className="mb-6 rounded-[26px] border border-violet-300/20 bg-violet-950/15 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black text-violet-200">اختبار A/B — نفس الرسالة على النموذجين</p>
              <h2 className="mt-1 text-xl font-black text-white">DeepSeek V4 Pro مقابل V4 Flash</h2>
              <p className="mt-2 text-sm font-bold text-[#aeb9af]">
                التقدم: {abPairCount}/{abTarget} رسالة — أزواج مكتملة: {completePairs}. بعد اكتمال الهدف يصبح Pro هو الأساسي وFlash احتياطيًا للأخطاء التقنية.
              </p>
            </div>
            <span className={`rounded-full border px-4 py-2 text-xs font-black ${abEnabled ? "border-emerald-300/25 bg-emerald-950/25 text-emerald-100" : "border-white/10 bg-white/5 text-[#aeb9af]"}`}>
              {abEnabled && abPairCount < abTarget ? "الاختبار يعمل" : "الاختبار مكتمل / متوقف"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <MiniStat label="متوسط Pro" value={`${averageNumber(proRows, "quality_score")}%`} />
            <MiniStat label="متوسط Flash" value={`${averageNumber(flashRows, "quality_score")}%`} />
            <MiniStat label="زمن Pro" value={`${averageNumber(proRows, "generation_ms")}ms`} />
            <MiniStat label="زمن Flash" value={`${averageNumber(flashRows, "generation_ms")}ms`} />
            <MiniStat label="الفوز" value={`Pro ${proWins} | Flash ${flashWins} | تعادل ${ties}`} />
          </div>
        </section>

        <section className="mb-6 rounded-[26px] border border-emerald-300/20 bg-emerald-950/15 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black text-emerald-200">Solid Multi-Agent — Shadow Only</p>
              <h2 className="mt-1 text-xl font-black text-white">موجّه حتمي + موظفون متخصصون + Policy Judge</h2>
              <p className="mt-2 text-sm font-bold leading-7 text-[#aeb9af]">
                النسخة: {promptVersion} — المسارات الحساسة حتمية، وPro/Flash للصياغة غير الحساسة فقط. المسودة المخالفة تُحفظ ثم تُستبدل برد آمن.
              </p>
            </div>
            <span className={`rounded-full border px-4 py-2 text-xs font-black ${multiAgentEnabled ? "border-emerald-300/25 bg-emerald-950/25 text-emerald-100" : "border-red-300/25 bg-red-950/25 text-red-100"}`}>
              {multiAgentEnabled ? "مفعّل" : "غير مفعّل"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MiniStat label="ردود حتمية" value={String(deterministicCount)} />
            <MiniStat label="Fallback آمن" value={String(fallbackCount)} />
            <MiniStat label="توزيع الموظفين" value={agentCounts || "لا توجد بيانات"} />
          </div>
        </section>

        <section className="mb-6 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap gap-2">
            {[6, 12, 24, 48, 72].map((value) => (
              <FilterLink key={value} active={hours === value} href={`?hours=${value}&result=${resultFilter}&agent=${agentFilter}`}>آخر {value} ساعة</FilterLink>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterLink active={resultFilter === "all"} href={`?hours=${hours}&result=all&agent=${agentFilter}`}>الكل</FilterLink>
            <FilterLink active={resultFilter === "succeeded"} href={`?hours=${hours}&result=succeeded&agent=${agentFilter}`}>ناجح</FilterLink>
            <FilterLink active={resultFilter === "blocked"} href={`?hours=${hours}&result=blocked&agent=${agentFilter}`}>محجوب</FilterLink>
            <FilterLink active={resultFilter === "queued"} href={`?hours=${hours}&result=queued&agent=${agentFilter}`}>معلقة</FilterLink>
            <FilterLink active={resultFilter === "retry_wait"} href={`?hours=${hours}&result=retry_wait&agent=${agentFilter}`}>إعادة محاولة</FilterLink>
            <FilterLink active={resultFilter === "dead_letter"} href={`?hours=${hours}&result=dead_letter&agent=${agentFilter}`}>فشل نهائي</FilterLink>
            <FilterLink active={agentFilter === "all"} href={`?hours=${hours}&result=${resultFilter}&agent=all`}>كل الموظفين</FilterLink>
            <FilterLink active={agentFilter === "tala"} href={`?hours=${hours}&result=${resultFilter}&agent=tala`}>تالا</FilterLink>
            <FilterLink active={agentFilter === "fadwa"} href={`?hours=${hours}&result=${resultFilter}&agent=fadwa`}>فدوة</FilterLink>
            <FilterLink active={agentFilter === "abdullah"} href={`?hours=${hours}&result=${resultFilter}&agent=abdullah`}>عبدالله</FilterLink>
            <FilterLink active={agentFilter === "abdulrahman"} href={`?hours=${hours}&result=${resultFilter}&agent=abdulrahman`}>عبدالرحمن</FilterLink>
            <FilterLink active={agentFilter === "omran"} href={`?hours=${hours}&result=${resultFilter}&agent=omran`}>عمران</FilterLink>
          </div>
        </section>

        {error ? (
          <section className="rounded-[24px] border border-red-300/25 bg-red-950/25 p-6 text-red-100">
            تعذر قراءة جدول Shadow الجديد: {error.message}. تأكد من تشغيل Migration المرفقة.
          </section>
        ) : rows.length === 0 ? (
          <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-10 text-center font-bold text-[#aeb9af]">لا توجد مهام ضمن الفلتر الحالي.</section>
        ) : (
          <div className="space-y-5">
            {rows.map((row) => {
              const status = statusInfo(row.status);
              const facts = row.facts || {};
              const retryable = ["dead_letter", "retry_wait"].includes(String(row.status || ""));
              return (
                <article key={row.id} className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
                  <div className="flex flex-col gap-3 border-b border-white/10 bg-black/20 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${status.cls}`}>{status.label}</span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${variantInfo(row.variant).cls}`}>{variantInfo(row.variant).label}</span>
                      <span className="rounded-full border border-[#d6b56b]/25 bg-[#d6b56b]/10 px-3 py-1 text-xs font-black text-[#f3dfac]">{row.agent_name || agentLabel(row.agent)}</span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${modeInfo(row.decision_mode).cls}`}>{modeInfo(row.decision_mode).label}</span>
                      {row.fallback_applied ? <span className="rounded-full border border-orange-300/25 bg-orange-950/25 px-3 py-1 text-xs font-black text-orange-100">SAFE FALLBACK</span> : null}
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-[#d7ddd5]">الجودة {row.quality_score ?? 0}%</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-[#d7ddd5]">المحاولة {row.attempt_count ?? 0}/{row.max_attempts ?? 3}</span>
                      <span dir="ltr" className="text-xs font-bold text-[#aeb9af]">{row.wa_id || "—"}</span>
                      {row.comparison_group_id ? <span dir="ltr" className="text-[10px] font-bold text-violet-200">PAIR {row.comparison_group_id.slice(-8)}</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#aeb9af]">
                      <span>{formatDate(row.created_at)}</span>
                      {row.wa_id ? <Link href={`/admin/whatsapp?phone=${encodeURIComponent(row.wa_id)}`} className="text-sky-200 underline">فتح المحادثة</Link> : null}
                      {retryable ? <RetryShadowJobButton id={row.id} /> : null}
                    </div>
                  </div>

                  <div className="grid gap-4 p-5 lg:grid-cols-3">
                    <MessageCard title="رسالة العميل" text={row.customer_message || "—"} tone="customer" />
                    <MessageCard title="الرد الفعلي المرسل" text={row.actual_reply || "—"} tone="actual" />
                    <MessageCard title="الرد التجريبي النهائي" text={row.candidate_reply || "—"} tone={row.status === "succeeded" ? "shadow" : "blocked"} />
                  </div>
                  {row.draft_reply && row.draft_reply !== row.candidate_reply ? (
                    <div className="border-t border-white/10 px-5 py-4">
                      <MessageCard title="مسودة النموذج قبل الحماية" text={row.draft_reply} tone="blocked" />
                    </div>
                  ) : null}

                  <div className="grid gap-4 border-t border-white/10 px-5 py-4 md:grid-cols-2">
                    <Info title="الموضوعات" value={row.topics?.join("، ") || "—"} />
                    <Info title="مخاطر الرد النهائي" value={row.risk_flags?.length ? row.risk_flags.join("، ") : "لا توجد مخالفات مكتشفة"} />
                    <Info title="سبب التوجيه" value={row.route_reason || "—"} />
                    <Info title="قالب / نتيجة القرار" value={`${row.deterministic_template || "بدون قالب"} | ${row.decision_outcome || "—"}`} />
                    {row.draft_risk_flags?.length ? <Info title="مخاطر المسودة الأصلية" value={row.draft_risk_flags.join("، ")} /> : null}
                    {row.policy_checks?.length ? <Info title="فحوصات Policy Judge الفاشلة" value={row.policy_checks.filter((check) => check.passed === false).map((check) => `${check.id}: ${check.message || ""}`).join(" | ") || "كل الفحوصات اجتازت"} /> : null}
                    <div className="text-xs font-bold leading-6 text-[#aeb9af]">
                      الحالة: {String(facts.status || "—")} | الدفع: {String(facts.paymentStatus || "—")} | الدفع مسموح: {facts.paymentCurrentlyAllowed ? "نعم" : "لا"}
                    </div>
                    <div className="text-xs font-bold leading-6 text-[#aeb9af]">
                      النموذج المطلوب: {row.requested_model || "حسب الموجّه"} | المسودة: {row.draft_model || "—"} | النهائي: {row.final_model || row.model || "—"} | HTTP: {row.provider_http_status ?? "—"} | الزمن: {row.generation_ms ?? 0}ms | التحليل: {row.parse_mode || "—"}
                    </div>
                    {row.last_error_code || row.last_error_message ? (
                      <div className="md:col-span-2 rounded-2xl border border-orange-300/20 bg-orange-950/20 px-4 py-3 text-xs font-bold leading-6 text-orange-100">
                        الخطأ: {row.last_error_code || "unknown"} — {row.last_error_message || "لا توجد تفاصيل"}
                        {row.next_attempt_at ? ` | المحاولة القادمة: ${formatDate(row.next_attempt_at)}` : ""}
                      </div>
                    ) : null}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[11px] font-black text-[#aeb9af]">{label}</p><p className="mt-2 text-lg font-black text-white">{value}</p></div>;
}

function Info({ title, value }: { title: string; value: string }) {
  return <div><p className="text-xs font-black text-[#d6b56b]">{title}</p><p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">{value}</p></div>;
}

function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: string }) {
  const className = tone === "green" ? "border-emerald-300/20 bg-emerald-950/20"
    : tone === "red" ? "border-red-300/20 bg-red-950/20"
      : tone === "gold" ? "border-[#d6b56b]/20 bg-[#d6b56b]/10"
        : tone === "orange" ? "border-orange-300/20 bg-orange-950/20"
          : "border-white/10 bg-white/[0.04]";
  return <div className={`rounded-[22px] border p-5 ${className}`}><p className="text-xs font-black text-[#aeb9af]">{label}</p><p className="mt-2 text-3xl font-black text-white">{value}</p></div>;
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link href={href} className={`rounded-xl border px-3 py-2 text-xs font-black ${active ? "border-[#d6b56b]/40 bg-[#d6b56b]/15 text-[#f3dfac]" : "border-white/10 bg-white/5 text-[#d7ddd5]"}`}>{children}</Link>;
}

function MessageCard({ title, text, tone }: { title: string; text: string; tone: "customer" | "actual" | "shadow" | "blocked" }) {
  const className = tone === "customer" ? "border-sky-300/20 bg-sky-950/20"
    : tone === "actual" ? "border-white/10 bg-black/20"
      : tone === "shadow" ? "border-emerald-300/20 bg-emerald-950/20"
        : "border-red-300/20 bg-red-950/20";
  return <div className={`rounded-[22px] border p-4 ${className}`}><p className="mb-3 text-xs font-black text-[#f3dfac]">{title}</p><p className="whitespace-pre-wrap break-words text-sm font-bold leading-8 text-white">{text}</p></div>;
}
