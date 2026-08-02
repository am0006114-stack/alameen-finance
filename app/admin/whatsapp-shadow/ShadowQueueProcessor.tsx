"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ShadowQueueProcessor() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const processQueue = useCallback(async (automatic = false) => {
    if (running) return;
    setRunning(true);
    setMessage(automatic ? "جارٍ فحص الردود المعلقة..." : "جارٍ معالجة الردود المعلقة...");

    let processed = 0;
    try {
      for (let index = 0; index < 8; index += 1) {
        const response = await fetch("/api/admin/whatsapp-shadow/process", {
          method: "POST",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(data?.error || `HTTP ${response.status}`));
        if (!data?.processed) break;
        processed += 1;
      }

      setMessage(processed ? `تمت معالجة ${processed} نتيجة تجريبية.` : "لا توجد نتائج معلقة جاهزة للمعالجة.");
      router.refresh();
    } catch (error) {
      setMessage(`تعذر تشغيل المعالج: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  }, [router, running]);

  useEffect(() => {
    const key = "shadow-v2-auto-processor-last-run";
    const last = Number(sessionStorage.getItem(key) || "0");
    if (Date.now() - last < 15000) return;
    sessionStorage.setItem(key, String(Date.now()));
    void processQueue(true);
  }, [processQueue]);

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <button
        type="button"
        onClick={() => void processQueue(false)}
        disabled={running}
        className="rounded-2xl border border-[#d6b56b]/30 bg-[#d6b56b]/10 px-4 py-2 text-sm font-black text-[#f3dfac] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? "جارٍ المعالجة..." : "معالجة الردود المعلقة"}
      </button>
      {message ? <p className="max-w-sm text-xs font-bold text-[#aeb9af]">{message}</p> : null}
    </div>
  );
}
