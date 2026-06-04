"use client";

import { useEffect, useMemo, useState } from "react";

type ReceiptWaitClientProps = {
  already?: boolean;
  waitSeconds: number;
  whatsappNumber: string;
  whatsappMessage: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function ReceiptWaitClient({
  already = false,
  waitSeconds,
  whatsappNumber,
  whatsappMessage,
}: ReceiptWaitClientProps) {
  const [remaining, setRemaining] = useState(waitSeconds);

  const progress = useMemo(() => {
    return ((waitSeconds - remaining) / waitSeconds) * 100;
  }, [remaining, waitSeconds]);

  const phase = useMemo(() => {
    const elapsed = waitSeconds - remaining;

    if (already) {
      return {
        title: "تم استلام الوصل سابقًا",
        description: "لا داعي لرفع الوصل مرة ثانية. طلبك موجود لدى فريق المتابعة.",
        icon: "✓",
      };
    }

    if (elapsed < 18) {
      return {
        title: "جاري رفع الوصل",
        description: "تم استلام الملف، ويتم الآن تجهيز الوصل وربطه بطلبك.",
        icon: "↥",
      };
    }

    if (elapsed < waitSeconds) {
      return {
        title: "جاري تأكيد الدفع",
        description: "يرجى الانتظار قليلًا حتى يتمكن فريق المتابعة من مطابقة الوصل.",
        icon: "⌛",
      };
    }

    return {
      title: "تم تحويلك للمتابعة",
      description: "يمكنك الآن المتابعة عبر واتساب إذا احتجت أي مساعدة.",
      icon: "✓",
    };
  }, [already, remaining, waitSeconds]);

  const whatsappUrl = useMemo(() => {
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
  }, [whatsappMessage, whatsappNumber]);

  useEffect(() => {
    if (already) return;

    if (remaining <= 0) {
      const timeout = window.setTimeout(() => {
        window.location.href = whatsappUrl;
      }, 900);

      return () => window.clearTimeout(timeout);
    }

    const interval = window.setInterval(() => {
      setRemaining((current) => clamp(current - 1, 0, waitSeconds));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [already, remaining, waitSeconds, whatsappUrl]);

  return (
    <section className="mt-5 overflow-hidden rounded-[34px] border border-[#b8ddc4] bg-white/94 p-6 text-center shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8">
      <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-[#f6fbf5] shadow-inner">
        <div
          className="relative flex h-32 w-32 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(#37b75d ${progress * 3.6}deg, #eadcc5 0deg)`,
          }}
        >
          <div className="absolute inset-3 rounded-full bg-white shadow-[inset_0_6px_20px_rgba(18,55,37,0.08)]" />
          <div className="relative z-10">
            <div className="text-3xl font-black text-[#14723a]">{already ? "✓" : remaining}</div>
            <div className="mt-1 text-[10px] font-black text-[#7a837c]">
              {already ? "مستلم" : "ثانية"}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#c9e8d1] bg-[#ecfff1] text-2xl font-black text-[#14723a]">
        {phase.icon}
      </div>

      <h2 className="mt-4 text-2xl font-black text-[#14723a]">
        {phase.title}
      </h2>

      <p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-[#526158]">
        {phase.description}
      </p>

      <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#b8ddc4] bg-[#f2fff4] p-4 text-[#14723a]">
          <p className="text-xs font-black">1</p>
          <p className="mt-1 text-sm font-black">رفع الوصل</p>
        </div>

        <div className={`rounded-2xl border p-4 ${already || waitSeconds - remaining >= 18 ? "border-[#b8ddc4] bg-[#f2fff4] text-[#14723a]" : "border-[#eadcc5] bg-white text-[#7a837c]"}`}>
          <p className="text-xs font-black">2</p>
          <p className="mt-1 text-sm font-black">تأكيد الدفع</p>
        </div>

        <div className={`rounded-2xl border p-4 ${already || remaining <= 0 ? "border-[#b8ddc4] bg-[#f2fff4] text-[#14723a]" : "border-[#eadcc5] bg-white text-[#7a837c]"}`}>
          <p className="text-xs font-black">3</p>
          <p className="mt-1 text-sm font-black">متابعة واتساب</p>
        </div>
      </div>

      <a
        href={whatsappUrl}
        className="mt-6 inline-flex rounded-2xl border border-[#37b75d] bg-[#37b75d] px-6 py-3 text-sm font-black text-white shadow-lg transition hover:bg-[#2fa553]"
      >
        المتابعة عبر واتساب الآن
      </a>
    </section>
  );
}
