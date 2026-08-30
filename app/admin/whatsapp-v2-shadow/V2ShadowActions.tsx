"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunV2ShadowWorkerButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setRunning(true);
    setMessage("جارٍ تشغيل V2 Shadow...");
    try {
      const response = await fetch("/api/internal/whatsapp-v2-shadow/worker", {
        method: "POST",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || `HTTP ${response.status}`));
      setMessage(`تمت معالجة ${Number(data?.claimed || 0)} مهمة V2.`);
      router.refresh();
    } catch (error) {
      setMessage(`تعذر تشغيل V2: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="rounded-2xl border border-cyan-300/30 bg-cyan-950/30 px-4 py-2 text-sm font-black text-cyan-100 disabled:opacity-50"
      >
        {running ? "جارٍ التشغيل..." : "تشغيل V2 Shadow الآن"}
      </button>
      {message ? <p className="max-w-sm text-xs font-bold text-[#aeb9af]">{message}</p> : null}
    </div>
  );
}
