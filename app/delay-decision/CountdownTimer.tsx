"use client";

import { useEffect, useMemo, useState } from "react";

type CountdownTimerProps = {
  deadlineIso: string;
};

function calculateRemaining(deadlineIso: string) {
  const deadline = new Date(deadlineIso).getTime();
  const now = Date.now();
  const difference = Math.max(0, deadline - now);

  const totalSeconds = Math.floor(difference / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    totalSeconds,
    days,
    hours,
    minutes,
    seconds,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export default function CountdownTimer({ deadlineIso }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() =>
    calculateRemaining(deadlineIso)
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining(calculateRemaining(deadlineIso));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [deadlineIso]);

  const label = useMemo(() => {
    if (remaining.totalSeconds <= 0) {
      return "انتهت مدة التمديد";
    }

    return `${remaining.days} يوم : ${pad(remaining.hours)} ساعة : ${pad(
      remaining.minutes
    )} دقيقة : ${pad(remaining.seconds)} ثانية`;
  }, [remaining]);

  return (
    <div>
      <div className="rounded-[26px] border border-[#b8ddc4] bg-white px-4 py-5 text-center shadow-sm">
        <p className="text-3xl font-black tracking-wide text-[#123725] sm:text-4xl">
          {label}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-2xl bg-white p-3">
          <p className="text-2xl font-black text-[#123725]">{remaining.days}</p>
          <p className="mt-1 text-xs font-bold text-[#6a756c]">أيام</p>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <p className="text-2xl font-black text-[#123725]">{pad(remaining.hours)}</p>
          <p className="mt-1 text-xs font-bold text-[#6a756c]">ساعات</p>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <p className="text-2xl font-black text-[#123725]">{pad(remaining.minutes)}</p>
          <p className="mt-1 text-xs font-bold text-[#6a756c]">دقائق</p>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <p className="text-2xl font-black text-[#123725]">{pad(remaining.seconds)}</p>
          <p className="mt-1 text-xs font-bold text-[#6a756c]">ثواني</p>
        </div>
      </div>
    </div>
  );
}
