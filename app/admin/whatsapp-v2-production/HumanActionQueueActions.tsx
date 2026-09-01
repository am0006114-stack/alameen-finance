"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ActionType = "human_handoff" | "call_request" | "application_data_correction";

export function HumanActionQueueActions({ id, status, actionType }: { id: string; status: string; actionType: ActionType }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(action: "accept" | "close") {
    setBusy(true);
    try {
      const response = await fetch("/api/internal/whatsapp-v2-production/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || `HTTP ${response.status}`));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const closeLabel = actionType === "human_handoff" ? "إغلاق وإعادة الرد الآلي" : "إغلاق الطلب";

  return <div className="flex gap-2">
    {status === "pending" ? <button disabled={busy} onClick={() => run("accept")} className="rounded-lg bg-amber-700 px-3 py-1 text-xs font-black disabled:opacity-50">استلام</button> : null}
    <button disabled={busy} onClick={() => run("close")} className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-black disabled:opacity-50">{closeLabel}</button>
  </div>;
}
