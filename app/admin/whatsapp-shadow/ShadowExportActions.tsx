"use client";

import { useState } from "react";

type Props = {
  hours: number;
  result: string;
  agent: string;
};

export function ShadowExportActions({ hours, result, agent }: Props) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"copy" | "json" | "csv" | null>(null);

  function endpoint(format: "copy" | "json" | "csv") {
    const params = new URLSearchParams({
      hours: String(hours),
      result,
      agent,
      format,
      privacy: "redacted",
    });
    return `/api/admin/whatsapp-shadow/export?${params.toString()}`;
  }

  async function copyAll() {
    setBusy("copy");
    setMessage("جارٍ تجهيز النسخة الآمنة...");
    try {
      const response = await fetch(endpoint("copy"), { cache: "no-store" });
      const text = await response.text();
      if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
      await navigator.clipboard.writeText(text);
      setMessage("تم نسخ كل النتائج المطابقة للفلاتر مع إخفاء الأرقام والبيانات الشخصية.");
    } catch (error) {
      setMessage(`تعذر النسخ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function download(format: "json" | "csv") {
    setBusy(format);
    setMessage(`جارٍ تجهيز ملف ${format.toUpperCase()}...`);
    try {
      const response = await fetch(endpoint(format), { cache: "no-store" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || `alameen-shadow.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`تم تصدير ${format === "csv" ? "CSV المتوافق مع Excel" : "JSON الكامل"} بنجاح.`);
    } catch (error) {
      setMessage(`تعذر التصدير: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyAll()}
          disabled={busy !== null}
          className="rounded-xl border border-sky-300/25 bg-sky-950/25 px-3 py-2 text-xs font-black text-sky-100 disabled:opacity-50"
        >
          {busy === "copy" ? "جارٍ النسخ..." : "نسخ الكل"}
        </button>
        <button
          type="button"
          onClick={() => void download("json")}
          disabled={busy !== null}
          className="rounded-xl border border-emerald-300/25 bg-emerald-950/25 px-3 py-2 text-xs font-black text-emerald-100 disabled:opacity-50"
        >
          {busy === "json" ? "جارٍ التصدير..." : "تصدير JSON"}
        </button>
        <button
          type="button"
          onClick={() => void download("csv")}
          disabled={busy !== null}
          className="rounded-xl border border-[#d6b56b]/30 bg-[#d6b56b]/10 px-3 py-2 text-xs font-black text-[#f3dfac] disabled:opacity-50"
        >
          {busy === "csv" ? "جارٍ التصدير..." : "تصدير CSV / Excel"}
        </button>
      </div>
      <p className="mt-2 text-[11px] font-bold leading-5 text-[#aeb9af]">
        التصدير يطابق الفلاتر الحالية ويخفي أرقام الهواتف والتتبع والبريد وروابط الاستعلام تلقائيًا.
      </p>
      {message ? <p className="mt-2 text-xs font-bold text-[#d7ddd5]">{message}</p> : null}
    </div>
  );
}
