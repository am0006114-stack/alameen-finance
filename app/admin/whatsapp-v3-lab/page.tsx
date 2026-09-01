import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { V3LabActions } from "./LabActions";

export const dynamic = "force-dynamic";

export default async function V3LabPage() {
  if (!(await isAdminLoggedIn())) redirect("/admin/login");
  const [{ data: settings }, { data: runs }, { data: usage }] = await Promise.all([
    supabaseAdmin.from("whatsapp_v3_lab_settings").select("key,value"),
    supabaseAdmin.from("whatsapp_v3_archive_runs").select("id,status,turn_count,v3_avg_score,historical_avg_score,critical_failure_count,continuity_failure_count,last_error,created_at").order("created_at", { ascending: false }).limit(30),
    supabaseAdmin.from("whatsapp_v3_ai_usage").select("provider,status,estimated_cost_usd,created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const map = new Map((settings || []).map((x: { key: string; value: string }) => [String(x.key), String(x.value)]));
  const enabled = map.get("lab_enabled") === "true";
  const cost = (usage || []).reduce((sum: number, x: { estimated_cost_usd?: number | string | null }) => sum + Number(x.estimated_cost_usd || 0), 0);

  return <main dir="rtl" className="min-h-screen bg-slate-950 p-6 text-white">
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black">V3 Autonomous AI Company OS — Sequence Lab</h1><p className="mt-1 text-sm text-slate-400">اختبار محادثات كاملة مع State + Truth + Actions simulation + Judge. لا يوجد routing للعملاء.</p></div>
        <Link href="/admin" className="text-sm font-black text-cyan-200">العودة للإدارة</Link>
      </div>
      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-xs text-slate-400">Lab</div><div className="mt-2 text-xl font-black">{enabled ? "ON" : "OFF"}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-xs text-slate-400">Max turns</div><div className="mt-2 text-xl font-black">{map.get("max_turns_per_run") || "6"}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-xs text-slate-400">Recent AI reserved</div><div className="mt-2 text-xl font-black">${cost.toFixed(4)}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-xs text-slate-400">Real actions</div><div className="mt-2 text-xl font-black text-emerald-200">OFF / isolated</div></div>
      </section>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5"><V3LabActions enabled={enabled}/></section>
      <section className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full text-right text-sm"><thead className="border-b border-white/10 text-slate-400"><tr><th className="p-3">الوقت</th><th className="p-3">Status</th><th className="p-3">Turns</th><th className="p-3">V3</th><th className="p-3">V1 historical</th><th className="p-3">Critical</th><th className="p-3">Continuity</th><th className="p-3">Error</th></tr></thead><tbody>{(runs || []).map((r: any) => <tr key={r.id} className="border-b border-white/5"><td className="p-3">{r.created_at ? new Date(r.created_at).toLocaleString("ar-JO", { timeZone: "Asia/Amman" }) : "—"}</td><td className="p-3 font-bold">{r.status}</td><td className="p-3">{r.turn_count}</td><td className="p-3">{r.v3_avg_score ?? "—"}</td><td className="p-3">{r.historical_avg_score ?? "—"}</td><td className="p-3">{r.critical_failure_count}</td><td className="p-3">{r.continuity_failure_count}</td><td className="max-w-xs truncate p-3 text-red-200">{r.last_error || "—"}</td></tr>)}</tbody></table>
      </section>
    </div>
  </main>;
}
