import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ArchiveLabActions } from "./ArchiveLabActions";

export const dynamic = "force-dynamic";

type CaseRow = {
  id: string; source_created_at: string; customer_message: string; actual_reply?: string | null; candidate_reply?: string | null;
  status: string; actual_score?: number | null; candidate_score?: number | null; score_delta?: number | null; winner?: string | null;
  critical_actual?: string[] | null; critical_candidate?: string[] | null; failure_tags?: string[] | null; total_cost_usd?: number | string | null;
};

export default async function ArchiveLabPage() {
  if (!(await isAdminLoggedIn())) redirect("/admin/login");
  const since = new Date(Date.now() - 24*60*60*1000).toISOString();
  const [{ data: settingsRows }, { data: cases }, { data: usage }] = await Promise.all([
    supabaseAdmin.from("whatsapp_v2_archive_settings").select("key,value"),
    supabaseAdmin.from("whatsapp_v2_archive_cases").select("id,source_created_at,customer_message,actual_reply,candidate_reply,status,actual_score,candidate_score,score_delta,winner,critical_actual,critical_candidate,failure_tags,total_cost_usd").order("source_created_at", { ascending: false }).limit(250),
    supabaseAdmin.from("whatsapp_v2_ai_usage").select("provider,estimated_cost_usd,status,created_at").gte("created_at", since).in("status", ["reserved","completed"]),
  ]);
  const settings = new Map<string,string>(); for (const r of settingsRows || []) settings.set(String(r.key), String(r.value || ""));
  const rows = (cases || []) as CaseRow[];
  const enabled = settings.get("lab_enabled") === "true";
  const totalByStatus = new Map<string,number>(); for (const r of rows) totalByStatus.set(r.status,(totalByStatus.get(r.status)||0)+1);
  const spend = { deepseek: 0, openai: 0 }; for (const u of usage || []) { const p = String(u.provider) as "deepseek"|"openai"; if (p in spend) spend[p] += Number(u.estimated_cost_usd || 0); }
  const scored = rows.filter(r => Number.isFinite(Number(r.candidate_score)));
  const avgCandidate = scored.length ? Math.round(scored.reduce((s,r)=>s+Number(r.candidate_score||0),0)/scored.length) : 0;
  const avgActual = scored.length ? Math.round(scored.reduce((s,r)=>s+Number(r.actual_score||0),0)/scored.length) : 0;

  return <main dir="rtl" className="min-h-screen bg-[#06110e] px-4 py-8 text-white"><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-black text-amber-200">ALAMEEN V2 — Phase 2</p><h1 className="text-3xl font-black">Archive Evaluation Lab</h1><p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#b8c2bc]">Replay للأرشيف فقط. لا يرسل أي رد للعميل ولا يغيّر الطلب أو الدفع أو الإلغاء أو الاسترداد. DeepSeek يبني فهم/رد V2 وOpenAI يحكم بصورة مستقلة، مع Cost Guard قبل كل استدعاء.</p></div><div className="flex flex-col gap-3"><ArchiveLabActions enabled={enabled}/><div className="flex gap-2"><Link href="/admin/whatsapp-v2-shadow" className="text-xs font-black text-cyan-200">V2 Shadow</Link><Link href="/admin/whatsapp" className="text-xs font-black text-cyan-200">المحادثات</Link></div></div></div>

    <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-8">{[
      ["الحالة", enabled ? "ON" : "OFF"], ["المحمّل", rows.length], ["ناجح", totalByStatus.get("succeeded")||0], ["مراجعة", totalByStatus.get("needs_review")||0], ["معلّق", (totalByStatus.get("queued")||0)+(totalByStatus.get("budget_blocked")||0)], ["V1 avg", `${avgActual}%`], ["V2 avg", `${avgCandidate}%`], ["24h cost", `$${(spend.deepseek+spend.openai).toFixed(4)}`]
    ].map(([k,v])=><div key={String(k)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="text-xs font-black text-[#9fa9a3]">{k}</div><div className="mt-2 text-xl font-black">{v}</div></div>)}</section>

    <section className="mb-6 rounded-2xl border border-amber-300/20 bg-amber-950/15 p-4 text-sm font-bold leading-7 text-[#d7ddd8]">DeepSeek اليوم (آخر 24 ساعة في اللوحة): <b>${spend.deepseek.toFixed(4)}</b> — OpenAI: <b>${spend.openai.toFixed(4)}</b>. الحدود الحالية: DeepSeek ${settings.get("deepseek_hourly_budget_usd")||"0.50"}/ساعة و${settings.get("deepseek_daily_budget_usd")||"2.00"}/يوم؛ OpenAI ${settings.get("openai_hourly_budget_usd")||"0.25"}/ساعة و${settings.get("openai_daily_budget_usd")||"1.00"}/يوم. لا يوجد Cron أو trigger لتشغيل هذا المختبر تلقائيًا.</section>

    <div className="space-y-4">{rows.map(row => <article key={row.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
      <div className="mb-3 flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-white/10 px-3 py-1">{row.status}</span><span className="rounded-full bg-white/10 px-3 py-1">V1 {row.actual_score ?? "—"}</span><span className="rounded-full bg-white/10 px-3 py-1">V2 {row.candidate_score ?? "—"}</span><span className="rounded-full bg-white/10 px-3 py-1">Δ {row.score_delta ?? "—"}</span><span className="rounded-full bg-white/10 px-3 py-1">{row.winner || "—"}</span><span className="rounded-full bg-white/10 px-3 py-1">${Number(row.total_cost_usd||0).toFixed(5)}</span></div>
      <div className="grid gap-3 lg:grid-cols-3"><div className="rounded-xl border border-sky-300/15 bg-sky-950/10 p-3"><p className="mb-2 text-xs font-black text-sky-200">العميل</p><p className="whitespace-pre-wrap text-sm font-bold leading-6">{row.customer_message}</p></div><div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="mb-2 text-xs font-black text-[#aaa]">V1 الفعلي</p><p className="whitespace-pre-wrap text-sm font-bold leading-6">{row.actual_reply || "—"}</p></div><div className="rounded-xl border border-emerald-300/15 bg-emerald-950/10 p-3"><p className="mb-2 text-xs font-black text-emerald-200">V2 المرشح</p><p className="whitespace-pre-wrap text-sm font-bold leading-6">{row.candidate_reply || "—"}</p></div></div>
      {(row.failure_tags?.length || row.critical_candidate?.length) ? <div className="mt-3 text-xs font-bold text-orange-200">Failures: {[...(row.critical_candidate||[]),...(row.failure_tags||[])].join("، ")}</div> : null}
    </article>)}</div>
  </div></main>;
}
