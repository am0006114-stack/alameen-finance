import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ProductionActions } from "./ProductionActions";

export const dynamic = "force-dynamic";

export default async function V2ProductionPage() {
  if (!(await isAdminLoggedIn())) redirect("/admin/login");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: settings }, { data: usage }, { data: runs }] = await Promise.all([
    supabaseAdmin.from("whatsapp_v2_production_settings").select("*").eq("id", "default").maybeSingle(),
    supabaseAdmin.from("whatsapp_v2_production_ai_usage").select("estimated_cost_usd,status,created_at").gte("created_at", since),
    supabaseAdmin.from("whatsapp_v2_production_runs").select("id,created_at,wa_id,mode,customer_message,final_reply,forced_intent,used_v2_writer,self_repair_applied,fail_closed_applied,violations,writer_error").order("created_at", { ascending: false }).limit(50),
  ]);
  const spend = (usage || []).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
  const rows = runs || [];
  const failClosed = rows.filter((row: any) => row.fail_closed_applied).length;
  const errors = rows.filter((row: any) => row.writer_error).length;

  return <main dir="rtl" className="min-h-screen bg-[#06110e] px-4 py-8 text-white"><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><p className="text-sm font-black text-emerald-200">ALAMEEN V2 — PHASE 3</p><h1 className="text-3xl font-black">Production Conversation OS</h1><p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#b8c2bc]">V2 يفهم الدور متعدد المواضيع، يقرأ حقيقة الطلب الحية، ويكتب الرد مع Self-Repair وFail-Closed. الإجراءات الحساسة تبقى خلف طبقة التنفيذ الحتمية الموجودة.</p></div>
      <div className="flex flex-col gap-3"><ProductionActions/><div className="flex gap-3"><Link href="/admin/whatsapp" className="text-xs font-black text-cyan-200">المحادثات</Link><Link href="/admin/whatsapp-v2-lab" className="text-xs font-black text-cyan-200">Archive Lab</Link></div></div>
    </div>

    <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[
      ["MODE", settings?.mode || "NOT INSTALLED"],
      ["KILL", settings?.kill_switch ? "ON" : "OFF"],
      ["Traffic", `${settings?.mode === "full" ? 100 : Number(settings?.canary_percent || 0)}%`],
      ["24h reserve", `$${spend.toFixed(3)}`],
      ["Fail-closed / 50", failClosed],
      ["Writer errors / 50", errors],
    ].map(([k,v]) => <div key={String(k)} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="text-xs font-black text-[#9fa9a3]">{k}</div><div className="mt-2 text-xl font-black">{String(v)}</div></div>)}</section>

    <div className="space-y-3">{rows.map((row: any) => <article key={row.id} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
      <div className="mb-2 flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-white/10 px-2 py-1">{row.mode}</span>{row.forced_intent ? <span className="rounded-full bg-cyan-950 px-2 py-1">{row.forced_intent}</span> : null}{row.self_repair_applied ? <span className="rounded-full bg-amber-950 px-2 py-1">REPAIR</span> : null}{row.fail_closed_applied ? <span className="rounded-full bg-red-950 px-2 py-1">FAIL-CLOSED</span> : null}</div>
      <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-xl bg-black/20 p-3"><div className="mb-1 text-xs font-black text-sky-200">العميل</div><div className="whitespace-pre-wrap text-sm font-bold">{row.customer_message}</div></div><div className="rounded-xl bg-black/20 p-3"><div className="mb-1 text-xs font-black text-emerald-200">الرد النهائي</div><div className="whitespace-pre-wrap text-sm font-bold">{row.final_reply}</div></div></div>
      {row.violations?.length ? <div className="mt-2 text-xs font-bold text-orange-200">{row.violations.join("، ")}</div> : null}
    </article>)}</div>
  </div></main>;
}
