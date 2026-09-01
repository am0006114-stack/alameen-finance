"use client";
import { useState } from "react";

export function V3LabActions({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(sequences: number) {
    if (!enabled || busy) return;
    setBusy(true); setMessage("جاري تشغيل المحادثات المتسلسلة...");
    try {
      const response = await fetch("/api/internal/whatsapp-v3-lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequences, maxTurns: 6 }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "فشل التشغيل");
      const r = body.result;
      setMessage(`اكتمل: ${r.completedSequences} محادثات / ${r.totalTurns} رسائل — V3 ${r.averageV3Score}/100 — Critical ${r.criticalFailures} — Continuity ${r.continuityFailures}`);
      window.setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap gap-2">
      {[1,3,5].map(n => <button key={n} disabled={!enabled || busy} onClick={() => run(n)} className="rounded-xl border border-cyan-300/25 bg-cyan-950/30 px-4 py-2 text-sm font-black text-cyan-100 disabled:opacity-40">{n} Risk Sequence{n > 1 ? "s" : ""}</button>)}
    </div>
    <div className="text-xs text-slate-300">{enabled ? "المختبر مفعّل. التشغيل يدوي فقط ولا يغيّر طلبات العملاء." : "المختبر OFF. لن يتم استهلاك AI حتى تفعّله صراحةً."}</div>
    {message ? <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white">{message}</div> : null}
  </div>;
}
