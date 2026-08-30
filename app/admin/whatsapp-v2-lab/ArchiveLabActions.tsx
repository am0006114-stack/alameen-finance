"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArchiveLabActions({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function control(action: string) {
    setBusy(true); setMessage("جارٍ التنفيذ...");
    try {
      const r = await fetch("/api/internal/whatsapp-v2-archive/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(d?.error || `HTTP ${r.status}`));
      if (action === "seed") setMessage(`تمت إضافة ${Number(d?.inserted || 0)} حالة جديدة من الأرشيف.`);
      else setMessage(action === "enable" ? "تم تشغيل مختبر الأرشيف." : action === "disable" ? "تم إيقاف المختبر فورًا." : "تم.");
      router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function runTarget(target: number) {
    setBusy(true); setMessage(`بدء تقييم حتى ${target} حالة...`);
    let processed = 0;
    try {
      while (processed < target) {
        const r = await fetch("/api/internal/whatsapp-v2-archive/worker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: Math.min(3, target - processed) }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(String(d?.error || `HTTP ${r.status}`));
        const n = Number(d?.processed || 0);
        processed += n;
        setMessage(`تم تقييم ${processed}/${target} حالة...`);
        const blocked = Array.isArray(d?.results) && d.results.some((x: any) => x?.status === "budget_blocked");
        if (blocked || n === 0) break;
      }
      setMessage(`انتهت الجولة: تمت معالجة ${processed} حالة.`);
      router.refresh();
    } catch (e) { setMessage(`توقف التشغيل بعد ${processed} حالة: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <button disabled={busy} onClick={() => void control(enabled ? "disable" : "enable")} className={`rounded-xl px-4 py-2 text-sm font-black ${enabled ? "bg-red-700 text-white" : "bg-emerald-600 text-white"}`}>{enabled ? "STOP ALL ARCHIVE AI" : "تشغيل المختبر"}</button>
    <button disabled={busy} onClick={() => void control("seed")} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black">تحميل الأرشيف</button>
    <button disabled={busy || !enabled} onClick={() => void runTarget(3)} className="rounded-xl border border-cyan-300/30 bg-cyan-950/30 px-4 py-2 text-sm font-black text-cyan-100">تقييم 3</button>
    <button disabled={busy || !enabled} onClick={() => void runTarget(20)} className="rounded-xl border border-cyan-300/30 bg-cyan-950/30 px-4 py-2 text-sm font-black text-cyan-100">تقييم 20</button>
    {message ? <span className="w-full text-xs font-bold text-[#b8c2bc]">{message}</span> : null}
  </div>;
}
