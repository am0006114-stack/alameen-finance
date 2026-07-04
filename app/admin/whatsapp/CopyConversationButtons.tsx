"use client";

import { useMemo, useState } from "react";

type CopyConversationButtonsProps = {
  fullText: string;
  recentText: string;
  disabled?: boolean;
};

async function copyToClipboard(value: string) {
  if (!value.trim()) return false;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.insetInlineStart = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function CopyConversationButtons({
  fullText,
  recentText,
  disabled = false,
}: CopyConversationButtonsProps) {
  const [copied, setCopied] = useState<"full" | "recent" | null>(null);
  const [failed, setFailed] = useState(false);

  const fullCount = useMemo(() => fullText.length.toLocaleString("ar-JO"), [fullText]);
  const recentCount = useMemo(() => recentText.length.toLocaleString("ar-JO"), [recentText]);

  async function handleCopy(type: "full" | "recent") {
    setFailed(false);
    const value = type === "full" ? fullText : recentText;

    try {
      const ok = await copyToClipboard(value);
      if (!ok) throw new Error("copy failed");
      setCopied(type);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2500);
    }
  }

  const baseClass =
    "rounded-2xl border px-5 py-3 text-center text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        disabled={disabled || !fullText.trim()}
        onClick={() => handleCopy("full")}
        title={`نسخ المحادثة كاملة - ${fullCount} حرف`}
        className={`${baseClass} border-[#d6b56b]/35 bg-[#d6b56b]/15 text-[#f3dfac] hover:bg-[#d6b56b]/25`}
      >
        {copied === "full" ? "تم النسخ ✅" : "نسخ المحادثة"}
      </button>

      <button
        type="button"
        disabled={disabled || !recentText.trim()}
        onClick={() => handleCopy("recent")}
        title={`نسخ آخر 20 رسالة - ${recentCount} حرف`}
        className={`${baseClass} border-sky-300/25 bg-sky-950/25 text-sky-100 hover:bg-sky-950/40`}
      >
        {copied === "recent" ? "تم النسخ ✅" : "نسخ آخر 20"}
      </button>

      {failed ? (
        <span className="rounded-2xl border border-red-300/25 bg-red-950/25 px-4 py-3 text-center text-xs font-black text-red-100">
          النسخ فشل، جرّب من متصفح آخر
        </span>
      ) : null}
    </div>
  );
}
