"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type IgnoreCustomerButtonProps = {
  phone: string;
  initialIgnored: boolean;
};

export default function IgnoreCustomerButton({
  phone,
  initialIgnored,
}: IgnoreCustomerButtonProps) {
  const router = useRouter();
  const [ignored, setIgnored] = useState(initialIgnored);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggleIgnore() {
    if (loading) return;

    const nextIgnored = !ignored;

    if (
      nextIgnored &&
      !window.confirm(
        "إيقاف الرد التلقائي لهذا العميل؟ ستبقى رسائله ظاهرة ومحفوظة، لكن النظام لن يرد عليه تلقائيًا."
      )
    ) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/whatsapp/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, ignored: nextIgnored }),
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; ignored?: boolean; error?: string }
        | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "تعذر تحديث حالة الرد التلقائي");
      }

      setIgnored(Boolean(result.ignored));
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر تحديث حالة الرد التلقائي"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={toggleIgnore}
        disabled={loading || !phone}
        className={`rounded-2xl border px-5 py-3 text-center text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
          ignored
            ? "border-emerald-300/30 bg-emerald-950/30 text-emerald-100 hover:bg-emerald-950/45"
            : "border-red-300/30 bg-red-950/30 text-red-100 hover:bg-red-950/45"
        }`}
      >
        {loading
          ? "جاري الحفظ..."
          : ignored
            ? "إلغاء التجاهل"
            : "تجاهل العميل"}
      </button>

      {error ? (
        <span className="rounded-xl border border-red-300/25 bg-red-950/25 px-3 py-2 text-center text-xs font-black text-red-100">
          {error}
        </span>
      ) : null}
    </div>
  );
}
