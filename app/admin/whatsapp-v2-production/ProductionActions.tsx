"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProductionActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(action: string, percent?: number) {
    if (action === "full" && !window.confirm("تفعيل V2 FULL على 100% من رسائل النص؟")) return;
    setBusy(true);
    setMessage("جارٍ التنفيذ...");
    try {
      const response = await fetch("/api/internal/whatsapp-v2-production/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, percent }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || `HTTP ${response.status}`));
      setMessage("تم تحديث وضع V2.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <button disabled={busy} onClick={() => run("kill")} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-black disabled:opacity-50">KILL SWITCH</button>
    <button disabled={busy} onClick={() => run("off")} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-black disabled:opacity-50">OFF</button>
    <button disabled={busy} onClick={() => run("canary", 5)} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black disabled:opacity-50">CANARY 5%</button>
    <button disabled={busy} onClick={() => run("broad", 50)} className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-black disabled:opacity-50">BROAD 50%</button>
    <button disabled={busy} onClick={() => run("full")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black disabled:opacity-50">FULL 100%</button>
    {message ? <span className="text-xs font-bold text-amber-100">{message}</span> : null}
  </div>;
}
