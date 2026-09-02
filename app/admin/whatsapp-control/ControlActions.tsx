"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  currentHours: number;
  v3Live: boolean;
  killSwitch: boolean;
  realActions: boolean;
  pendingCount: number;
  outsideWindowCount: number;
};

type RecoveryResult = {
  ok: boolean;
  attempted: number;
  sent: number;
  failed: number;
  skippedOutsideWindow: number;
  remainingEligible: number;
  pendingTotal: number;
  errors?: Array<{ waId: string; error: string }>;
};

const WINDOWS = [1, 2, 6, 12, 24, 48, 168];

function labelForHours(hours: number) {
  if (hours === 1) return "ساعة";
  if (hours === 2) return "ساعتين";
  if (hours === 24) return "يوم";
  if (hours === 48) return "يومين";
  if (hours === 168) return "أسبوع";
  return `${hours} ساعات`;
}

export default function ControlActions(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: Math.max(props.pendingCount, 0) });

  const statusText = useMemo(() => {
    if (props.v3Live && !props.killSwitch) return "V3 شغال على الردود";
    if (props.killSwitch) return "المسار الآمن شغال — V3 موقف";
    return "V3 غير مفعّل";
  }, [props.v3Live, props.killSwitch]);

  async function control(action: string) {
    setBusy(action);
    setMessage("");
    try {
      let confirmValue: string | undefined;
      if (action === "enable_real_actions") {
        const accepted = window.confirm("تفعيل Real Actions يسمح لعمران بتنفيذ تغييرات حقيقية على الطلبات. هل أنت متأكد؟");
        if (!accepted) return;
        confirmValue = "ENABLE_REAL_ACTIONS";
      }
      const response = await fetch("/api/admin/whatsapp-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirm: confirmValue }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "تعذر تنفيذ الأمر");
      setMessage(payload?.message || "تم تنفيذ الأمر");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حدث خطأ");
    } finally {
      setBusy(null);
    }
  }

  async function recoverAll() {
    if (!props.v3Live || props.killSwitch) {
      setMessage("شغّل V3 Replies Only أولًا قبل استعادة المحادثات.");
      return;
    }
    if (!window.confirm(`سيتم الرد على المحادثات المتوقفة ضمن آخر ${labelForHours(props.currentHours)}. Real Actions تبقى مقفلة داخل الاستعادة. متابعة؟`)) return;

    setBusy("recover");
    setMessage("");
    setProgress({ done: 0, total: Math.max(props.pendingCount - props.outsideWindowCount, 0) });
    let totalSent = 0;
    let totalFailed = 0;
    let safety = 0;
    try {
      while (safety < 100) {
        safety += 1;
        const response = await fetch("/api/admin/whatsapp-control/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hours: props.currentHours, batchSize: 8 }),
        });
        const payload = (await response.json().catch(() => ({}))) as RecoveryResult & { error?: string };
        if (!response.ok) throw new Error(payload?.error || "تعذر تشغيل استعادة المحادثات");
        totalSent += Number(payload.sent || 0);
        totalFailed += Number(payload.failed || 0);
        setProgress((prev) => ({
          total: Math.max(prev.total, Number(payload.pendingTotal || 0) - Number(payload.skippedOutsideWindow || 0)),
          done: prev.done + Number(payload.sent || 0) + Number(payload.failed || 0),
        }));

        if (payload.failed > 0) {
          setMessage(`تم إرسال ${totalSent} رد، لكن فشل ${totalFailed}. تم إيقاف الاستعادة حتى لا نكرر المحاولات على نفس العملاء.`);
          break;
        }
        if (!payload.remainingEligible || payload.attempted === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      setMessage(`انتهت الاستعادة: تم إرسال ${totalSent} رد، وفشل ${totalFailed}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "فشلت الاستعادة");
    } finally {
      setBusy(null);
    }
  }

  async function copyWindow(hours: number) {
    setBusy(`copy-${hours}`);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/whatsapp-control/export?hours=${hours}`);
      const text = await response.text();
      if (!response.ok) throw new Error(text || "تعذر تجهيز النسخة");
      await navigator.clipboard.writeText(text);
      setMessage(`تم نسخ سجل ${labelForHours(hours)} إلى الحافظة.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر النسخ");
    } finally {
      setBusy(null);
    }
  }

  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#d6b56b]">التحكم المباشر</div>
            <div className="mt-1 text-lg font-black text-white">{statusText}</div>
          </div>
          <div className={`rounded-full px-4 py-2 text-xs font-black ${props.v3Live && !props.killSwitch ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-100"}`}>
            Real Actions: {props.realActions ? "ON" : "OFF"}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button disabled={Boolean(busy)} onClick={() => control("enable_replies")} className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-black disabled:opacity-50">
            تشغيل V3 — ردود فقط
          </button>
          <button disabled={Boolean(busy)} onClick={() => control("disable_v3")} className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-5 py-3 text-sm font-black text-amber-100 disabled:opacity-50">
            إيقاف V3 / المسار الآمن
          </button>
          {!props.realActions ? (
            <button disabled={Boolean(busy) || !props.v3Live || props.killSwitch} onClick={() => control("enable_real_actions")} className="rounded-2xl border border-red-300/30 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 disabled:opacity-40">
              تفعيل Real Actions لعمران
            </button>
          ) : (
            <button disabled={Boolean(busy)} onClick={() => control("disable_real_actions")} className="rounded-2xl border border-red-300/30 bg-red-500/20 px-5 py-3 text-sm font-black text-red-100 disabled:opacity-50">
              إيقاف Real Actions
            </button>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-[#d6b56b]/20 bg-[#d6b56b]/[0.055] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-[#d6b56b]">Backlog Recovery</div>
            <h3 className="mt-1 text-xl font-black text-white">استعادة المحادثات التي توقفت بدون رد</h3>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#cfd5cf]">
              يتم إرسال رد واحد فقط لكل محادثة متوقفة، باستخدام V3 مع Real Actions مقفلة. الرسائل الأقدم من نافذة واتساب للرد الحر تُعرض ولا يتم إرسال نص مخالف لها.
            </p>
          </div>
          <button disabled={Boolean(busy) || props.pendingCount === 0} onClick={recoverAll} className="rounded-2xl bg-[#d6b56b] px-6 py-3 text-sm font-black text-black disabled:opacity-40">
            {busy === "recover" ? "جاري الاستعادة..." : `رد على المتوقفين (${props.pendingCount})`}
          </button>
        </div>

        {busy === "recover" || progress.done > 0 ? (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-[#d7ddd5]">
              <span>{progress.done} / {progress.total}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-black/35">
              <div className="h-full rounded-full bg-[#d6b56b] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
        <div className="mb-3 text-sm font-black text-white">نسخ سجل التشغيل والمحادثات</div>
        <div className="flex flex-wrap gap-2">
          {WINDOWS.map((hours) => (
            <button key={hours} disabled={Boolean(busy)} onClick={() => copyWindow(hours)} className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs font-black text-[#e7ebe7] hover:border-[#d6b56b]/40 disabled:opacity-50">
              نسخ {labelForHours(hours)}
            </button>
          ))}
        </div>
      </div>

      {message ? <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white">{message}</div> : null}
    </div>
  );
}
