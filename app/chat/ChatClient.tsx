"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TimelineItem = {
  id: string;
  createdAt: string;
  direction: string;
  body: string;
  channel: "web" | "telegram" | "whatsapp";
};

type SessionPayload = {
  ok: boolean;
  trackingId?: string | null;
  primaryChannel?: "web" | "telegram" | null;
  channelActivated?: boolean;
  webAvailable?: boolean;
  timeline?: TimelineItem[];
};

const channelName = { web: "الموقع", telegram: "Telegram", whatsapp: "WhatsApp" } as const;

function timeLabel(value: string) {
  try {
    return new Intl.DateTimeFormat("ar-JO", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export default function ChatClient() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/web-chat/session", { cache: "no-store" });
      const data = await response.json().catch(() => null) as SessionPayload | null;
      setSession(data?.ok ? data : { ok: false });
    } catch {
      setSession({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.timeline?.length]);

  async function send() {
    const text = message.trim();
    if (!text || busy || !session?.ok) return;
    setBusy(true);
    setNotice(null);
    setMessage("");
    try {
      const clientMessageId = typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await fetch("/api/web-chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, clientMessageId }),
      });
      const data = await response.json().catch(() => null) as any;
      if (!response.ok || !data?.ok) {
        if (response.status === 429) setNotice("أرسلت رسائل بسرعة كبيرة. جرّب بعد شوي حتى ما يصير تكرار بالمحادثة.");
        else throw new Error(data?.error || "send_failed");
      } else {
        setSession((current) => current ? { ...current, timeline: data.timeline || current.timeline } : current);
      }
    } catch {
      setMessage(text);
      setNotice("الرسالة ما انرسلت. جرّب إرسالها مرة ثانية؛ ما في أي دفع أو إجراء جديد مطلوب.");
    } finally {
      setBusy(false);
    }
  }

  async function openTelegram() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/web-chat/channel", { method: "POST" });
      const data = await response.json().catch(() => null) as any;
      if (!response.ok || !data?.telegramLink) throw new Error("telegram_unavailable");
      window.open(String(data.telegramLink), "_blank", "noopener,noreferrer");
      setNotice("أرسل الرسالة الجاهزة في Telegram حتى يكتمل الربط. الموقع يظل محتفظًا بنفس المحادثة.");
    } catch {
      setNotice("تعذر فتح رابط Telegram الآن. المحادثة على الموقع ما زالت شغالة بشكل طبيعي.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-[#07110d] text-white flex items-center justify-center p-6" dir="rtl">جاري فتح المحادثة الآمنة…</main>;
  }

  if (!session?.ok) {
    return (
      <main className="min-h-screen bg-[#07110d] text-white flex items-center justify-center p-6" dir="rtl">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center">
          <h1 className="text-2xl font-bold">رابط المتابعة غير متاح</h1>
          <p className="mt-3 text-sm leading-7 text-white/70">إذا انتهت صلاحية الرابط، اطلب رابط متابعة جديد من نفس محادثة الأمين. انتهاء الرابط لا يعني أي دفعة جديدة.</p>
        </section>
      </main>
    );
  }

  const timeline = session.timeline || [];

  return (
    <main className="min-h-screen bg-[#07110d] text-white" dir="rtl">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-3 py-4 sm:px-6">
        <header className="rounded-3xl border border-emerald-300/15 bg-[#0b1d16] p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-300">الأمين للأقساط</p>
              <h1 className="mt-1 text-xl font-bold">متابعة طلبك</h1>
              {session.trackingId ? <p className="mt-1 text-xs text-white/55">رقم الطلب: {session.trackingId}</p> : null}
            </div>
            <button onClick={() => void load()} disabled={busy} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50">تحديث</button>
          </div>
          <p className="mt-4 text-sm leading-6 text-white/65">الموقع وTelegram مربوطين بنفس الطلب ونفس سياق المحادثة. ما بتحتاج تعيد شرح معلوماتك عند الانتقال بينهم.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-300/10 px-3 py-1.5 text-xs text-emerald-100">الموقع مفعّل</span>
            <button onClick={() => void openTelegram()} disabled={busy} className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1.5 text-xs text-sky-100 disabled:opacity-50">فتح Telegram</button>
          </div>
        </header>

        {notice ? <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/75">{notice}</div> : null}

        <section className="mt-4 flex-1 rounded-3xl border border-white/10 bg-black/15 p-3 sm:p-5">
          {timeline.length === 0 ? (
            <div className="py-12 text-center text-sm text-white/45">اكتب أول رسالة وبتكمل من نفس الطلب.</div>
          ) : (
            <div className="space-y-3">
              {timeline.map((item) => {
                const customer = item.direction === "incoming";
                return (
                  <div key={item.id} className={`flex ${customer ? "justify-start" : "justify-end"}`}>
                    <article className={`max-w-[88%] rounded-2xl px-4 py-3 ${customer ? "bg-white/[0.07]" : "border border-emerald-300/10 bg-emerald-400/15"}`}>
                      <div className="mb-1 flex items-center gap-2 text-[10px] text-white/40">
                        <span>{customer ? "أنت" : "الأمين"}</span><span>•</span><span>{channelName[item.channel]}</span><span>•</span><span>{timeLabel(item.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-white/90">{item.body}</p>
                    </article>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <footer className="sticky bottom-0 mt-3 rounded-3xl border border-white/10 bg-[#091711]/95 p-3 backdrop-blur">
          <div className="flex gap-2">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              disabled={busy}
              rows={2}
              maxLength={4000}
              placeholder="اكتب رسالتك…"
              className="min-h-[54px] flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-emerald-300/30 disabled:opacity-50"
            />
            <button onClick={() => void send()} disabled={busy || !message.trim()} className="rounded-2xl bg-emerald-400 px-5 font-bold text-[#06120d] disabled:opacity-40">{busy ? "…" : "إرسال"}</button>
          </div>
        </footer>
      </div>
    </main>
  );
}
