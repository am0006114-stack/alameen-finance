"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const PARALLEL_LANES = 6;

export function ArchiveLabActions({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState("");
  const stopRequested = useRef(false);
  const workerToken = useRef("");

  async function postControl(action: string, extra?: Record<string, unknown>, allowWorkerToken = false) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (allowWorkerToken && workerToken.current) headers.Authorization = `Bearer ${workerToken.current}`;

    const r = await fetch("/api/internal/whatsapp-v2-archive/control", {
      method: "POST",
      headers,
      body: JSON.stringify({ action, ...(extra || {}) }),
      cache: "no-store",
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(d?.error || `HTTP ${r.status}`));
    return d;
  }

  async function issueWorkerToken(minutes = 240) {
    const d = await postControl("issue_worker_token", { minutes });
    const token = String(d?.token || "");
    if (!token) throw new Error("Archive worker token was not issued.");
    workerToken.current = token;
    return d;
  }

  async function control(action: string) {
    if (action === "disable") {
      stopRequested.current = true;
      setStopping(true);
      setMessage("جارٍ إيقاف مختبر الأرشيف...");
      try {
        await postControl("disable", undefined, true);
        workerToken.current = "";
        setMessage("تم إيقاف المختبر فورًا.");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        setStopping(false);
      }
      return;
    }

    setBusy(true);
    setMessage("جارٍ التنفيذ...");
    try {
      const d = await postControl(action);
      if (action === "seed") setMessage(`تمت إضافة ${Number(d?.inserted || 0)} حالة جديدة من الأرشيف.`);
      else setMessage(action === "enable" ? "تم تشغيل مختبر الأرشيف." : "تم.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function workerOnce() {
    const retryable = new Set([429, 502, 503, 504]);
    let lastError = "unknown_error";

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      if (stopRequested.current) return { stopped: true, processed: 0, blocked: false };

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (workerToken.current) headers.Authorization = `Bearer ${workerToken.current}`;

        const r = await fetch("/api/internal/whatsapp-v2-archive/worker", {
          method: "POST",
          headers,
          body: JSON.stringify({ limit: 1 }),
          cache: "no-store",
        });
        const d = await r.json().catch(() => ({}));

        if (r.status === 423) return { stopped: true, processed: 0, blocked: false };
        if (!r.ok) {
          lastError = String(d?.error || `HTTP ${r.status}`);
          if (retryable.has(r.status) && attempt < 4) {
            setMessage(`تعذر طلب واحد (${r.status}) — إعادة المحاولة ${attempt}/3...`);
            await sleep(attempt * 2500);
            continue;
          }
          throw new Error(lastError);
        }

        const n = Number(d?.processed || 0);
        const blocked = Array.isArray(d?.results) && d.results.some((x: any) => x?.status === "budget_blocked");
        return { stopped: false, processed: n, blocked };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (attempt < 4 && /504|503|502|429|fetch|network/i.test(lastError)) {
          setMessage(`انقطاع مؤقت — إعادة المحاولة ${attempt}/3...`);
          await sleep(attempt * 2500);
          continue;
        }
        throw e;
      }
    }

    throw new Error(lastError);
  }

  async function runTarget(target: number) {
    stopRequested.current = false;
    setBusy(true);
    setMessage(`تجهيز جلسة تشغيل آمنة لتقييم ${target} حالة...`);

    let issued = 0;
    let processed = 0;
    let blocked = false;
    let noWork = false;
    let fatal: Error | null = null;

    try {
      // The admin cookie may expire during a long run. We exchange it once for a
      // short-lived worker-only token. The token cannot enable/seed/requeue the lab.
      await issueWorkerToken(240);
      setMessage(`بدء تقييم حتى ${target} حالة عبر ${PARALLEL_LANES} مسارات متوازية...`);

      async function lane() {
        while (!stopRequested.current && !blocked && !noWork && !fatal) {
          if (issued >= target) return;
          issued += 1;
          try {
            const result = await workerOnce();
            if (result.stopped) {
              stopRequested.current = true;
              return;
            }
            processed += result.processed;
            setMessage(`تم تقييم ${processed}/${target} حالة — ${PARALLEL_LANES} مسارات متوازية...`);
            if (result.blocked) {
              blocked = true;
              return;
            }
            if (result.processed === 0) {
              noWork = true;
              return;
            }
          } catch (e) {
            fatal = e instanceof Error ? e : new Error(String(e));
            return;
          }
          await sleep(100);
        }
      }

      await Promise.all(Array.from({ length: PARALLEL_LANES }, () => lane()));
      if (fatal) throw fatal;
      if (blocked) setMessage(`توقف الحارس المالي بعد ${processed} حالة.`);
      else if (noWork) setMessage(`لا توجد حالة قابلة للمعالجة الآن. تمت معالجة ${processed} حالة.`);
      else setMessage(stopRequested.current ? `تم الإيقاف بعد ${processed} حالة.` : `انتهت الجولة: تمت معالجة ${processed} حالة.`);
      router.refresh();
    } catch (e) {
      setMessage(`توقف التشغيل بعد ${processed} حالة: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runTimed(hours: 2 | 3) {
    stopRequested.current = false;
    setBusy(true);
    const deadline = Date.now() + hours * 60 * 60 * 1000;
    let processed = 0;
    let blocked = false;
    let noWork = false;
    let fatal: Error | null = null;

    try {
      const enabledRun = await postControl("enable_for", { minutes: hours * 60 });
      await issueWorkerToken(Math.min(360, hours * 60 + 30));
      const runUntil = String(enabledRun?.runUntil || new Date(deadline).toISOString());
      setMessage(`تشغيل متواصل ${hours} ساعات عبر ${PARALLEL_LANES} مسارات — حتى ${runUntil}...`);

      async function lane() {
        while (Date.now() < deadline && !stopRequested.current && !blocked && !noWork && !fatal) {
          try {
            const result = await workerOnce();
            if (result.stopped) {
              stopRequested.current = true;
              return;
            }
            processed += result.processed;
            const minsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 60000));
            setMessage(`تشغيل ${hours} ساعات: ${processed} حالة — ${PARALLEL_LANES} مسارات — متبقي تقريبًا ${minsLeft} دقيقة...`);
            if (result.blocked) {
              blocked = true;
              return;
            }
            if (result.processed === 0) {
              noWork = true;
              return;
            }
          } catch (e) {
            fatal = e instanceof Error ? e : new Error(String(e));
            return;
          }
          await sleep(100);
        }
      }

      await Promise.all(Array.from({ length: PARALLEL_LANES }, () => lane()));
      if (fatal) throw fatal;

      if (blocked) setMessage(`توقف الحارس المالي بعد ${processed} حالة.`);
      else if (noWork) setMessage(`لا توجد حالة قابلة للمعالجة الآن. تمت معالجة ${processed} حالة.`);
      else if (Date.now() >= deadline) setMessage(`انتهت مدة ${hours} ساعات. تمت معالجة ${processed} حالة.`);
      else if (stopRequested.current) setMessage(`تم الإيقاف بعد ${processed} حالة.`);
    } catch (e) {
      setMessage(`توقف التشغيل بعد ${processed} حالة: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      try { await postControl("disable", undefined, true); } catch {}
      workerToken.current = "";
      stopRequested.current = true;
      setBusy(false);
      router.refresh();
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <button
      disabled={stopping}
      onClick={() => void control(enabled || busy ? "disable" : "enable")}
      className={`rounded-xl px-4 py-2 text-sm font-black ${enabled || busy ? "bg-red-700 text-white" : "bg-emerald-600 text-white"}`}
    >
      {enabled || busy ? "STOP ALL ARCHIVE AI" : "تشغيل المختبر"}
    </button>

    <button disabled={busy || stopping} onClick={() => void control("seed")} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-black">تحميل الأرشيف</button>
    <button disabled={busy || stopping || !enabled} onClick={() => void runTarget(3)} className="rounded-xl border border-cyan-300/30 bg-cyan-950/30 px-4 py-2 text-sm font-black text-cyan-100">تقييم 3</button>
    <button disabled={busy || stopping || !enabled} onClick={() => void runTarget(20)} className="rounded-xl border border-cyan-300/30 bg-cyan-950/30 px-4 py-2 text-sm font-black text-cyan-100">تقييم 20 Risk</button>
    <button disabled={busy || stopping || !enabled} onClick={() => void runTarget(100)} className="rounded-xl border border-cyan-300/30 bg-cyan-950/30 px-4 py-2 text-sm font-black text-cyan-100">تقييم 100 Risk</button>
    <button disabled={busy || stopping || !enabled} onClick={() => void runTarget(128)} className="rounded-xl border border-emerald-300/30 bg-emerald-950/30 px-4 py-2 text-sm font-black text-emerald-100">استكمال 128 — قبول 300</button>
    <button disabled={busy || stopping || !enabled} onClick={() => void runTarget(300)} className="rounded-xl border border-amber-300/30 bg-amber-950/30 px-4 py-2 text-sm font-black text-amber-100">تقييم 300 Risk</button>
    <button disabled={busy || stopping} onClick={() => void runTimed(2)} className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-950/30 px-4 py-2 text-sm font-black text-fuchsia-100">تشغيل متواصل ساعتين ×6</button>
    <button disabled={busy || stopping} onClick={() => void runTimed(3)} className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-950/30 px-4 py-2 text-sm font-black text-fuchsia-100">تشغيل متواصل 3 ساعات ×6</button>

    {message ? <span className="w-full text-xs font-bold text-[#b8c2bc]">{message}</span> : null}
  </div>;
}
