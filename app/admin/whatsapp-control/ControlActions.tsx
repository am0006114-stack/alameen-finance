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
  solHybridConfigured: boolean;
  solHybridEnabled: boolean;
  solHybridActive: boolean;
  solHybridExpired: boolean;
  solHybridEndsAt: string | null;
  solHybridBudgetUsd: number;
  solHybridEstimatedCostUsd: number;
  solHybridCalls: number;
  solHybridCompleted: number;
  solHybridFailed: number;
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
    if (props.v3Live && !props.killSwitch) return "Conversation OS شغال";
    return "Conversation OS شغال بوضع آمن — Real Actions يجب أن تبقى OFF";
  }, [props.v3Live, props.killSwitch]);

  async function control(action: string) {
    setBusy(action);
    setMessage("");
    try {
      let confirmValue: string | undefined;
      if (action === "enable_real_actions") {
        const accepted = window.confirm("سيتم تفعيل Real Actions الخمسة المعتمدة فقط: إلغاء الطلب، طلب الاسترداد، إيقاف الاسترداد، إعادة فتح الطلب إذا الحقيقة تسمح، واعتماد رقم واتساب للمتابعة. تعديل الجهاز/الموديل/السعة/اللون/بيانات الطلب وإعادة الحسبة تبقى يدوية عبر صفحة الأمين الرسمية على فيسبوك. متابعة؟");
        if (!accepted) return;
        confirmValue = "ENABLE_AUTONOMOUS_CORE_ACTIONS";
      }
      if (action === "start_sol_hybrid_pilot") {
        const accepted = window.confirm("بدء Pilot لمدة 24 ساعة: DeepSeek يبقى المسار الطبيعي، وGPT-5.6 Sol يدخل فقط للحالات المعقدة/الملتبسة. الدفع وReal Actions الواضحة لا تُرسل إلى Sol. حد الحجز الأقصى 5 دولار، ويمكن الرجوع فورًا بضغطة واحدة. متابعة؟");
        if (!accepted) return;
        confirmValue = "START_SOL_HYBRID_24H";
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
    setBusy("recover");
    setMessage("");
    try {
      const response = await fetch("/api/admin/whatsapp-control/recover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: props.currentHours }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "تعذر تحليل الحالات غير المكتملة");
      setMessage(payload?.message || `تم تحليل ${Number(payload?.unresolvedCount || 0)} حالة غير مكتملة.`);
      setProgress({ done: 0, total: Number(payload?.unresolvedCount || 0) });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "فشل التحليل");
    } finally { setBusy(null); }
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
            Real Actions: {props.realActions ? "ON — scoped" : "OFF"}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button disabled={Boolean(busy)} onClick={() => control("enable_replies")} className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-black disabled:opacity-50">
            تأكيد تشغيل Conversation OS
          </button>
          {props.realActions ? (
            <button disabled={Boolean(busy)} onClick={() => control("disable_real_actions")} className="rounded-2xl border border-red-300/30 bg-red-500/20 px-5 py-3 text-sm font-black text-red-100 disabled:opacity-50">
              إيقاف Real Actions الخمسة (طوارئ)
            </button>
          ) : (
            <button disabled={Boolean(busy) || !props.v3Live || props.killSwitch} onClick={() => control("enable_real_actions")} className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-100 disabled:opacity-40">
              تفعيل Real Actions المقيدة
            </button>
          )}
          <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 px-5 py-3 text-xs font-black text-sky-100">
            التعديلات اليدوية (الجهاز/الموديل/السعة/اللون/البيانات/إعادة الحسبة): صفحة الأمين الرسمية على فيسبوك
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-violet-300/20 bg-violet-500/[0.07] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-violet-200">Phase 10 Pilot — Hybrid Intelligence</div>
            <div className="mt-1 text-xl font-black text-white">DeepSeek طبيعي — GPT-5.6 Sol للحالات المعقدة فقط</div>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#cfd5cf]">
              الدفع وReal Actions الواضحة تبقى على المسار الحتمي/الرخيص. Sol يدخل فقط عند غموض فعلي، قصة طويلة، تعدد نوايا، تناقض، أو فشل فهم متكرر. إذا انتهت 24 ساعة أو بلغ حد الحجز، يرجع النظام تلقائيًا لمسار Phase 9.1.
            </p>
          </div>
          <div className={`rounded-full px-4 py-2 text-xs font-black ${props.solHybridActive ? "bg-violet-400/20 text-violet-100" : "bg-white/5 text-[#aeb8b0]"}`}>
            {props.solHybridActive ? "SOL PILOT ON" : props.solHybridExpired ? "SOL PILOT EXPIRED" : "SOL PILOT OFF"}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-[#9fa9a1]">Sol calls</div><div className="mt-1 text-xl font-black">{props.solHybridCalls}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-[#9fa9a1]">Estimated spend</div><div className="mt-1 text-xl font-black">${props.solHybridEstimatedCostUsd.toFixed(4)}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-[#9fa9a1]">Pilot cap</div><div className="mt-1 text-xl font-black">${props.solHybridBudgetUsd.toFixed(2)}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-[#9fa9a1]">نتائج</div><div className="mt-1 text-sm font-black">{props.solHybridCompleted} completed / {props.solHybridFailed} failed</div></div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {props.solHybridActive ? (
            <button disabled={Boolean(busy)} onClick={() => control("stop_sol_hybrid_pilot")} className="rounded-2xl border border-red-300/30 bg-red-500/20 px-5 py-3 text-sm font-black text-red-100 disabled:opacity-50">
              رجوع فوري إلى Phase 9.1 / DeepSeek
            </button>
          ) : (
            <button disabled={Boolean(busy) || !props.solHybridConfigured} onClick={() => control("start_sol_hybrid_pilot")} className="rounded-2xl bg-violet-300 px-5 py-3 text-sm font-black text-black disabled:opacity-40">
              بدء تجربة Sol لمدة 24 ساعة
            </button>
          )}
          <div className="text-xs font-bold text-[#aeb8b0]">
            {props.solHybridConfigured ? (props.solHybridEndsAt ? `تنتهي: ${new Date(props.solHybridEndsAt).toLocaleString("ar-JO")}` : "OpenAI API جاهز") : "OPENAI_V3_API_KEY غير موجود — لن يبدأ Pilot"}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[#d6b56b]/20 bg-[#d6b56b]/[0.055] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-[#d6b56b]">Unresolved Diagnostics — تشخيص فقط</div>
            <h3 className="mt-1 text-xl font-black text-white">تحليل الحالات غير المكتملة بدون إرسال</h3>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#cfd5cf]">
              Phase 9 ألغى Recovery كمرسل مستقل حتى لا يوجد chatbot ثانٍ أو ghost replies. هذه الأداة تحلل فقط الحالات التي ما زالت مفتوحة زمنيًا أو دلاليًا؛ الإرسال يملكه Conversation OS الحي وحده.
            </p>
          </div>
          <button disabled={Boolean(busy) || props.pendingCount === 0} onClick={recoverAll} className="rounded-2xl bg-[#d6b56b] px-6 py-3 text-sm font-black text-black disabled:opacity-40">
            {busy === "recover" ? "جاري التحليل..." : `تحليل غير المكتمل (${props.pendingCount})`}
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
