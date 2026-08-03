"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunShadowWorkerButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setRunning(true);
    setMessage("جارٍ تشغيل العامل...");
    try {
      const response = await fetch("/api/internal/whatsapp-shadow/worker", { method: "POST", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || `HTTP ${response.status}`));
      setMessage(`تمت معالجة ${Number(data?.claimed || 0)} مهمة.`);
      router.refresh();
    } catch (error) {
      setMessage(`تعذر تشغيل العامل: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <button type="button" onClick={() => void run()} disabled={running}
        className="rounded-2xl border border-[#d6b56b]/30 bg-[#d6b56b]/10 px-4 py-2 text-sm font-black text-[#f3dfac] disabled:opacity-50">
        {running ? "جارٍ التشغيل..." : "تشغيل العامل الآن"}
      </button>
      {message ? <p className="max-w-sm text-xs font-bold text-[#aeb9af]">{message}</p> : null}
    </div>
  );
}

export function RetryShadowJobButton({ id }: { id: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function retry() {
    setRunning(true);
    try {
      const response = await fetch("/api/admin/whatsapp-shadow/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || `HTTP ${response.status}`));
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return <button type="button" disabled={running} onClick={() => void retry()}
    className="rounded-xl border border-orange-300/25 bg-orange-950/25 px-3 py-2 text-xs font-black text-orange-100 disabled:opacity-50">
    {running ? "جارٍ الإعادة..." : "إعادة المحاولة"}
  </button>;
}
