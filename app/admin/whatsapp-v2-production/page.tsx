import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ProductionActions } from "./ProductionActions";
import { HumanActionQueueActions } from "./HumanActionQueueActions";

export const dynamic = "force-dynamic";

const CURRENT_RUNTIME = "v2.1.0";

export default async function V2ProductionPage() {
  if (!(await isAdminLoggedIn())) redirect("/admin/login");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: settings }, { data: usage }, { data: runs }, { data: actions }] = await Promise.all([
    supabaseAdmin.from("whatsapp_v2_production_settings").select("*").eq("id", "default").maybeSingle(),
    supabaseAdmin.from("whatsapp_v2_production_ai_usage").select("estimated_cost_usd,status,created_at").gte("created_at", since),
    supabaseAdmin.from("whatsapp_v2_production_runs")
      .select("id,created_at,wa_id,mode,customer_message,final_reply,forced_intent,used_v2_writer,self_repair_applied,fail_closed_applied,violations,writer_error,truth_source,truth_confidence,auditor_used,auditor_passed,safe_composer_applied,runtime_version,understanding_quality,action_result,route_outcome,fallback_reason")
      .eq("runtime_version", CURRENT_RUNTIME)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin.from("whatsapp_v2_human_action_queue")
      .select("id,created_at,wa_id,tracking_id,action_type,customer_message,status")
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const spend = (usage || []).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
  const rows = runs || [];
  const failClosed = rows.filter((row: any) => row.fail_closed_applied).length;
  const errors = rows.filter((row: any) => row.writer_error).length;
  const silent = rows.filter((row: any) => row.route_outcome === "silent_no_reply").length;
  const pendingActions = actions || [];
  const traffic = settings?.kill_switch || settings?.mode === "off"
    ? 0
    : settings?.mode === "full"
      ? 100
      : Number(settings?.canary_percent || 0);

  return <main dir="rtl" className="min-h-screen bg-[#06110e] px-4 py-8 text-white"><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><p className="text-sm font-black text-emerald-200">ALAMEEN V2.1 — {CURRENT_RUNTIME}</p><h1 className="text-3xl font-black">Production Conversation OS</h1><p className="mt-2 max-w-4xl text-sm font-bold leading-7 text-[#b8c2bc]">لا يوجد رجوع إلى V1 في مسار الإنتاج. خارج نسبة التشغيل أو عند OFF/KILL لا يرسل النظام ردًا آليًا. الحقيقة من Supabase مباشرة، والإجراءات من V2 Action Plane، والتحويل للموظف يوقف الرد الآلي بعد تسجيله.</p></div>
      <div className="flex flex-col gap-3"><ProductionActions/><div className="flex gap-3"><Link href="/admin/whatsapp" className="text-xs font-black text-cyan-200">المحادثات</Link><Link href="/admin/whatsapp-v2-lab" className="text-xs font-black text-cyan-200">Archive Lab</Link></div></div>
    </div>

    <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-8">{[
      ["RUNTIME", CURRENT_RUNTIME],
      ["MODE", settings?.mode || "NOT INSTALLED"],
      ["KILL", settings?.kill_switch ? "ON" : "OFF"],
      ["Auto reply", `${traffic}%`],
      ["24h reserve", `$${spend.toFixed(3)}`],
      ["Fail-closed / V2.1", failClosed],
      ["Silent / V2.1", silent],
      ["Human queue", pendingActions.length],
    ].map(([k,v]) => <div key={String(k)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="text-xs font-black text-[#9fa9a3]">{k}</div><div className="mt-2 text-xl font-black">{String(v)}</div></div>)}</section>

    {pendingActions.length ? <section className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/[.05] p-4"><h2 className="mb-3 text-lg font-black text-amber-100">طلبات موظف/مكالمة المعلقة</h2><div className="space-y-2">{pendingActions.map((row: any) => <div key={row.id} className="rounded-xl bg-black/20 p-3 text-sm font-bold"><div className="mb-1 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-amber-950 px-2 py-1">{row.action_type}</span><span>{row.wa_id}</span>{row.tracking_id ? <span>{row.tracking_id}</span> : null}</div><div className="whitespace-pre-wrap">{row.customer_message}</div><div className="mt-2"><HumanActionQueueActions id={row.id} status={row.status} actionType={row.action_type} /></div></div>)}</div></section> : null}

    <div className="space-y-3">{rows.map((row: any) => <article key={row.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
      <div className="mb-2 flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-white/10 px-2 py-1">{row.runtime_version}</span><span className="rounded-full bg-white/10 px-2 py-1">{row.mode}</span><span className="rounded-full bg-slate-900 px-2 py-1">{row.route_outcome || "replied"}</span>{row.forced_intent ? <span className="rounded-full bg-cyan-950 px-2 py-1">{row.forced_intent}</span> : null}{row.truth_source ? <span className="rounded-full bg-indigo-950 px-2 py-1">{row.truth_source}/{row.truth_confidence}</span> : null}{row.self_repair_applied ? <span className="rounded-full bg-amber-950 px-2 py-1">REPAIR</span> : null}{row.auditor_used ? <span className="rounded-full bg-fuchsia-950 px-2 py-1">AUDIT {row.auditor_passed ? "PASS" : "FAIL"}</span> : null}{row.safe_composer_applied ? <span className="rounded-full bg-blue-950 px-2 py-1">SAFE</span> : null}{row.fail_closed_applied ? <span className="rounded-full bg-red-950 px-2 py-1">FAIL-CLOSED</span> : null}</div>
      <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-xl bg-black/20 p-3"><div className="mb-1 text-xs font-black text-sky-200">العميل</div><div className="whitespace-pre-wrap text-sm font-bold">{row.customer_message}</div></div><div className="rounded-xl bg-black/20 p-3"><div className="mb-1 text-xs font-black text-emerald-200">الرد النهائي</div><div className="whitespace-pre-wrap text-sm font-bold">{row.final_reply || "— لم يُرسل رد آلي —"}</div></div></div>
      {row.fallback_reason ? <div className="mt-2 text-xs font-bold text-slate-300">route: {row.fallback_reason}</div> : null}
      {row.action_result ? <div className="mt-2 text-xs font-bold text-cyan-100">Action: {JSON.stringify(row.action_result)}</div> : null}
      {row.violations?.length ? <div className="mt-2 text-xs font-bold text-orange-200">{row.violations.join("، ")}</div> : null}
    </article>)}</div>
    {errors ? <p className="mt-4 text-xs font-bold text-red-200">Writer errors in current V2.1 rows: {errors}</p> : null}
  </div></main>;
}
