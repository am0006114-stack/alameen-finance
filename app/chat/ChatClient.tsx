"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TimelineItem = {
  id: string;
  createdAt: string;
  direction: string;
  body: string;
  channel: "web" | "telegram" | "whatsapp";
};

type OrderSummary = {
  trackingId?: string | null;
  fullName?: string | null;
  phoneMasked?: string | null;
  employer?: string | null;
  salary?: number | string | null;
  status?: string | null;
  paymentStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  governorate?: string | null;
  cityArea?: string | null;
  deviceName?: string | null;
  devicePrice?: number | string | null;
  installmentMonths?: number | null;
  downPayment?: number | string | null;
  monthlyPayment?: number | string | null;
  totalWithInterest?: number | string | null;
  eligibilityPath?: string | null;
};

type SessionPayload = {
  ok: boolean;
  trackingId?: string | null;
  primaryChannel?: "web" | "telegram" | null;
  channelActivated?: boolean;
  webAvailable?: boolean;
  order?: OrderSummary | null;
  timeline?: TimelineItem[];
};

type PendingMessage = {
  id: string;
  body: string;
  createdAt: string;
  status: "sending" | "failed";
};

type ConnectionState = "online" | "connecting" | "offline";

const channelName = { web: "الموقع", telegram: "Telegram", whatsapp: "WhatsApp" } as const;

const statusNames: Record<string, string> = {
  under_review: "قيد الدراسة النهائية",
  approved: "موافق عليه",
  rejected: "غير موافق عليه",
  cancelled: "ملغي",
  refund_requested: "طلب استرداد",
  preliminary_qualified: "موافقة مبدئية",
  customer_confirmed_continue: "تم تأكيد الاستمرار",
  needs_guarantor: "بحاجة إلى كفيل",
  guarantor_submitted: "تم تقديم الكفيل",
  needs_salary_slip: "بحاجة إلى كشف راتب",
  salary_slip_uploaded: "تم رفع كشف الراتب",
  identity_uploaded: "تم رفع الهوية",
  customer_accepts_delivery_delay: "تم قبول انتظار التوريد",
};

const paymentNames: Record<string, string> = {
  confirmed: "الدفع مؤكد",
  pending: "بانتظار تأكيد الدفع",
  awaiting_payment: "بانتظار الدفع",
  refund_requested: "الاسترداد مطلوب",
  refunded: "تم الاسترداد",
};

function statusLabel(value: string | null | undefined) {
  const key = String(value || "").trim();
  if (!key) return "حالة الطلب متاحة عند التحديث";
  return statusNames[key] || key.replaceAll("_", " ");
}

function paymentLabel(value: string | null | undefined) {
  const key = String(value || "").trim();
  if (!key) return "غير محدد";
  return paymentNames[key] || key.replaceAll("_", " ");
}

function moneyLabel(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `${new Intl.NumberFormat("ar-JO", { maximumFractionDigits: 2 }).format(amount)} د.أ`;
}

function fullDateLabel(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("ar-JO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function timeLabel(value: string) {
  try {
    return new Intl.DateTimeFormat("ar-JO", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function dayKey(value: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
}

function dayLabel(value: string) {
  const key = dayKey(value);
  const now = new Date();
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString());
  if (key === today) return "اليوم";
  if (key === yesterday) return "أمس";
  try {
    return new Intl.DateTimeFormat("ar-JO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return key;
  }
}

function compactUrl(value: string) {
  if (value.length <= 56) return value;
  return `${value.slice(0, 38)}…${value.slice(-13)}`;
}

function renderMessageBody(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;
    return (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-emerald-200 underline decoration-emerald-300/35 underline-offset-4 hover:text-emerald-100"
        title={part}
      >
        {compactUrl(part)}
      </a>
    );
  });
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5" aria-label="الأمين يكتب الآن">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-200 [animation-delay:-0.28s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-200 [animation-delay:-0.14s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-200" />
    </div>
  );
}

function DetailItem({ label, value, strong = false }: { label: string; value: string | number | null | undefined; strong?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="rounded-2xl border border-white/[0.055] bg-white/[0.025] px-3.5 py-3">
      <p className="text-[10px] text-white/35">{label}</p>
      <p className={`mt-1 break-words text-xs leading-5 ${strong ? "font-semibold text-emerald-100" : "text-white/75"}`}>{value}</p>
    </div>
  );
}

export default function ChatClient() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [channelBusy, setChannelBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [typingVisible, setTypingVisible] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const firstLoadRef = useRef(true);

  const busy = sending || channelBusy;
  const order = session?.order || null;
  const currentStatus = statusLabel(order?.status);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    setShowJump(false);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setConnection("connecting");
    try {
      const response = await fetch("/api/web-chat/session", { cache: "no-store" });
      const data = await response.json().catch(() => null) as SessionPayload | null;
      if (!response.ok || !data?.ok) {
        setSession({ ok: false });
        setConnection(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online");
        return;
      }
      setSession(data);
      setConnection("online");
    } catch {
      setConnection("offline");
      if (!silent) setNotice("تعذر تحديث المحادثة الآن. اتصالك قد يكون غير مستقر؛ رسائلك الحالية لم تتغير.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const onOnline = () => void load(true);
    const onOffline = () => setConnection("offline");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [load]);

  useEffect(() => {
    if (!sending) {
      setTypingVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setTypingVisible(true), 900);
    return () => window.clearTimeout(timer);
  }, [sending]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 54), 150)}px`;
  }, [message]);

  useEffect(() => {
    if (loading) return;
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      window.requestAnimationFrame(() => scrollToBottom("auto"));
      return;
    }
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distance < 180 || sending) scrollToBottom("smooth");
    else setShowJump(true);
  }, [loading, pending.length, sending, session?.timeline?.length, scrollToBottom]);

  const timeline = session?.timeline || [];
  const timelineWithDays = useMemo(() => {
    let previousDay = "";
    return timeline.map((item) => {
      const currentDay = dayKey(item.createdAt);
      const showDay = currentDay !== previousDay;
      previousDay = currentDay;
      return { item, showDay };
    });
  }, [timeline]);

  async function sendText(text: string, pendingId?: string) {
    const clean = text.trim();
    if (!clean || sending || !session?.ok) return;

    const clientMessageId = pendingId || (typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const optimistic: PendingMessage = {
      id: clientMessageId,
      body: clean,
      createdAt: new Date().toISOString(),
      status: "sending",
    };

    setSending(true);
    setNotice(null);
    setMessage("");
    setPending((items) => {
      const withoutExisting = items.filter((item) => item.id !== clientMessageId);
      return [...withoutExisting, optimistic];
    });
    window.requestAnimationFrame(() => scrollToBottom("smooth"));

    try {
      const response = await fetch("/api/web-chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, clientMessageId }),
      });
      const data = await response.json().catch(() => null) as any;
      if (!response.ok || !data?.ok) {
        if (response.status === 429) {
          setNotice("أرسلت عدة رسائل بسرعة. انتظر لحظة ثم أعد المحاولة حتى تظل المحادثة مرتبة.");
        }
        throw new Error(data?.error || "send_failed");
      }

      setPending((items) => items.filter((item) => item.id !== clientMessageId));
      setSession((current) => current ? { ...current, timeline: data.timeline || current.timeline } : current);
      setConnection("online");
      window.requestAnimationFrame(() => scrollToBottom("smooth"));
    } catch {
      setPending((items) => items.map((item) => item.id === clientMessageId ? { ...item, status: "failed" } : item));
      setConnection(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : connection);
      setNotice((current) => current || "تعذر إرسال الرسالة. اضغط على الرسالة لإعادتها إلى خانة الكتابة ثم جرّب مرة ثانية.");
    } finally {
      setSending(false);
    }
  }

  async function send() {
    await sendText(message);
  }

  function restoreFailed(item: PendingMessage) {
    if (sending) return;
    setPending((items) => items.filter((entry) => entry.id !== item.id));
    setMessage(item.body);
    setNotice(null);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function openTelegram() {
    if (busy) return;
    setChannelBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/web-chat/channel", { method: "POST" });
      const data = await response.json().catch(() => null) as any;
      if (!response.ok || !data?.telegramLink) throw new Error("telegram_unavailable");
      window.open(String(data.telegramLink), "_blank", "noopener,noreferrer");
      setNotice("أرسل الرسالة الجاهزة في Telegram حتى يكتمل الربط. الموقع يظل على نفس الطلب ونفس المحادثة.");
    } catch {
      setNotice("تعذر فتح Telegram الآن. المحادثة على الموقع ما زالت شغالة بشكل طبيعي.");
    } finally {
      setChannelBusy(false);
    }
  }

  function handleScroll() {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setShowJump(distance > 220);
  }

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#06100c] p-6 text-white" dir="rtl">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative h-14 w-14 rounded-2xl border border-emerald-300/20 bg-emerald-400/10">
            <span className="absolute inset-0 grid place-items-center text-2xl text-emerald-200">✦</span>
            <span className="absolute inset-[-5px] animate-ping rounded-3xl border border-emerald-300/10" />
          </div>
          <div>
            <p className="font-semibold">جاري فتح محادثتك الآمنة</p>
            <p className="mt-1 text-xs text-white/45">جاري تحميل تفاصيل طلبك ومحادثتك…</p>
          </div>
        </div>
      </main>
    );
  }

  if (!session?.ok) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#06100c] p-6 text-white" dir="rtl">
        <section className="w-full max-w-lg rounded-[28px] border border-white/10 bg-[#0b1813] p-8 text-center shadow-2xl shadow-black/25">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.05] text-2xl">🔒</div>
          <h1 className="mt-5 text-2xl font-bold">رابط المتابعة غير متاح</h1>
          <p className="mt-3 text-sm leading-7 text-white/60">إذا انتهت صلاحية الرابط، اطلب رابط متابعة جديد من نفس محادثة الأمين. انتهاء الرابط لا يعني أي دفعة جديدة.</p>
        </section>
      </main>
    );
  }

  const connectionCopy = connection === "online"
    ? "متصل"
    : connection === "connecting"
      ? "جاري المزامنة"
      : "غير متصل";

  const createdLabel = fullDateLabel(order?.createdAt);
  const updatedLabel = fullDateLabel(order?.updatedAt);
  const locationLabel = [order?.governorate, order?.cityArea].filter(Boolean).join(" / ") || null;
  const channelLabel = session.primaryChannel === "telegram" ? "Telegram" : session.primaryChannel === "web" ? "الموقع" : null;

  return (
    <main className="h-[100dvh] overflow-hidden bg-[#050d0a] text-white" dir="rtl">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle at 18% 16%, rgba(16,185,129,.12), transparent 24%), radial-gradient(circle at 82% 78%, rgba(14,116,144,.08), transparent 22%)",
        }}
      />

      <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col border-x border-white/[0.055] bg-[#07110d]/96 shadow-2xl shadow-black/35">
        <header className="z-20 border-b border-white/[0.07] bg-[#0a1913]/95 px-3 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-400/20 to-emerald-400/5 text-xl text-emerald-100 shadow-lg shadow-emerald-950/20">
              ✦
              <span className={`absolute -bottom-0.5 -left-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#0a1913] ${connection === "offline" ? "bg-amber-400" : "bg-emerald-400"}`} />
            </div>

            <button
              type="button"
              onClick={() => setOrderOpen((value) => !value)}
              className="min-w-0 flex-1 rounded-xl px-1 py-1 text-right transition hover:bg-white/[0.025]"
              aria-expanded={orderOpen}
            >
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-bold sm:text-lg">الأمين للأقساط</h1>
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-35" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] sm:text-xs">
                <span className={connection === "offline" ? "text-amber-300" : "text-emerald-300/80"}>{connectionCopy}</span>
                <span className="text-white/20">•</span>
                <span className="truncate font-medium text-white/65">{currentStatus}</span>
                {session.trackingId ? <><span className="text-white/20">•</span><span className="truncate text-white/38">{session.trackingId}</span></> : null}
                <span className={`mr-auto text-white/35 transition-transform duration-300 ${orderOpen ? "rotate-180" : ""}`}>⌄</span>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void load(false)}
                disabled={refreshing || busy}
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/65 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
                aria-label="تحديث المحادثة"
                title="تحديث"
              >
                <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                  <path d="M20 4v7h-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => void openTelegram()}
                disabled={busy}
                className="hidden h-10 items-center gap-2 rounded-xl border border-sky-300/15 bg-sky-300/[0.07] px-3 text-xs font-medium text-sky-100 transition hover:bg-sky-300/[0.12] disabled:opacity-40 sm:flex"
              >
                <span className="text-sm">↗</span>
                Telegram
              </button>
            </div>
          </div>

          <div className={`overflow-hidden transition-all duration-300 ease-out ${orderOpen ? "mt-3 max-h-[650px] opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="rounded-[22px] border border-emerald-300/[0.09] bg-gradient-to-b from-emerald-400/[0.055] to-white/[0.018] p-3.5 shadow-inner shadow-black/10 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-300/15 bg-emerald-400/[0.08] px-3 py-1.5 text-[10px] font-semibold text-emerald-100">{currentStatus}</span>
                {order?.paymentStatus ? <span className="rounded-full border border-white/[0.07] bg-white/[0.035] px-3 py-1.5 text-[10px] text-white/60">{paymentLabel(order.paymentStatus)}</span> : null}
                {channelLabel ? <span className="rounded-full border border-sky-300/10 bg-sky-300/[0.045] px-3 py-1.5 text-[10px] text-sky-100/70">المتابعة عبر {channelLabel}</span> : null}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <DetailItem label="صاحب الطلب" value={order?.fullName} strong />
                <DetailItem label="رقم الطلب" value={order?.trackingId || session.trackingId} />
                <DetailItem label="رقم التواصل" value={order?.phoneMasked} />
                <DetailItem label="الجهاز" value={order?.deviceName} strong />
                <DetailItem label="سعر الجهاز" value={moneyLabel(order?.devicePrice)} />
                <DetailItem label="الدفعة الأولى" value={moneyLabel(order?.downPayment)} />
                <DetailItem label="القسط الشهري" value={moneyLabel(order?.monthlyPayment)} strong />
                <DetailItem label="مدة التقسيط" value={order?.installmentMonths ? `${order.installmentMonths} شهر` : null} />
                <DetailItem label="الإجمالي" value={moneyLabel(order?.totalWithInterest)} />
                <DetailItem label="جهة العمل" value={order?.employer} />
                <DetailItem label="الراتب" value={moneyLabel(order?.salary)} />
                <DetailItem label="المنطقة" value={locationLabel} />
                <DetailItem label="تاريخ الطلب" value={createdLabel} />
                <DetailItem label="آخر تحديث" value={updatedLabel} />
              </div>

              <p className="mt-3 text-[10px] leading-5 text-white/30">تظهر هنا معلومات المتابعة المرتبطة بطلبك فقط. البيانات الحساسة مثل الرقم الوطني والعنوان التفصيلي لا يتم عرضها داخل الدردشة.</p>
            </div>
          </div>
        </header>

        {notice ? (
          <div className="z-10 mx-3 mt-3 flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-[#102019]/95 px-4 py-3 text-xs leading-6 text-white/70 shadow-lg sm:mx-5 sm:text-sm">
            <span className="mt-0.5 text-emerald-300">●</span>
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-white/35 hover:text-white/70" aria-label="إغلاق">×</button>
          </div>
        ) : null}

        <section className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto px-3 py-5 [scrollbar-color:rgba(255,255,255,.14)_transparent] [scrollbar-width:thin] sm:px-6"
          >
            {timeline.length === 0 && pending.length === 0 ? (
              <div className="mx-auto flex min-h-full max-w-md items-center justify-center py-12 text-center">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-emerald-300/15 bg-emerald-400/[0.07] text-2xl text-emerald-200">✦</div>
                  <h2 className="mt-5 text-lg font-bold">نفس طلبك، نفس المحادثة</h2>
                  <p className="mt-2 text-sm leading-7 text-white/45">اكتب رسالتك، والأمين يكمل معك من نفس سياق الطلب بدون ما تعيد شرح معلوماتك.</p>
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-2.5">
                {timelineWithDays.map(({ item, showDay }) => {
                  const customer = item.direction === "incoming";
                  return (
                    <div key={item.id}>
                      {showDay ? (
                        <div className="my-5 flex items-center gap-3" aria-hidden="true">
                          <div className="h-px flex-1 bg-white/[0.055]" />
                          <span className="rounded-full border border-white/[0.07] bg-white/[0.035] px-3 py-1 text-[10px] font-medium text-white/35">{dayLabel(item.createdAt)}</span>
                          <div className="h-px flex-1 bg-white/[0.055]" />
                        </div>
                      ) : null}

                      <div className={`group flex ${customer ? "justify-start" : "justify-end"}`}>
                        <article
                          className={`relative max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[78%] sm:px-4 sm:py-3 ${customer
                            ? "rounded-tr-md border border-white/[0.065] bg-[#17221d]"
                            : "rounded-tl-md border border-emerald-300/[0.12] bg-[#063c2d]"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-6 text-white/90 sm:text-sm sm:leading-7 [overflow-wrap:anywhere]">
                            {renderMessageBody(item.body)}
                          </p>
                          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[9.5px] text-white/35">
                            <span>{channelName[item.channel]}</span>
                            <span>•</span>
                            <span>{timeLabel(item.createdAt)}</span>
                            {!customer ? <span className="mr-0.5 text-emerald-300/70">✓✓</span> : null}
                          </div>
                        </article>
                      </div>
                    </div>
                  );
                })}

                {pending.map((item) => (
                  <div key={item.id} className="flex justify-start">
                    <button
                      type="button"
                      onClick={() => item.status === "failed" ? restoreFailed(item) : undefined}
                      className={`max-w-[88%] rounded-2xl rounded-tr-md border px-3.5 py-2.5 text-right shadow-sm sm:max-w-[78%] sm:px-4 sm:py-3 ${item.status === "failed"
                        ? "cursor-pointer border-rose-400/25 bg-rose-400/[0.06]"
                        : "cursor-default border-white/[0.065] bg-[#17221d]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-[13.5px] leading-6 text-white/90 sm:text-sm sm:leading-7 [overflow-wrap:anywhere]">{item.body}</p>
                      <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[9.5px] ${item.status === "failed" ? "text-rose-300/80" : "text-white/35"}`}>
                        <span>{item.status === "failed" ? "تعذر الإرسال — اضغط للمحاولة من جديد" : "جارٍ الإرسال"}</span>
                        {item.status === "sending" ? <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-white/20 border-t-white/70" /> : <span>!</span>}
                      </div>
                    </button>
                  </div>
                ))}

                {typingVisible ? (
                  <div className="flex justify-end" aria-live="polite">
                    <div className="rounded-2xl rounded-tl-md border border-emerald-300/[0.1] bg-[#063126] px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <TypingDots />
                        <span className="text-[11px] font-medium text-emerald-100/65">الأمين يكتب…</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="h-2" />
              </div>
            )}
          </div>

          {showJump ? (
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#102019]/95 px-3.5 py-2 text-[11px] font-medium text-white/70 shadow-xl backdrop-blur transition hover:bg-[#14281f] hover:text-white"
            >
              <span>↓</span>
              آخر الرسائل
            </button>
          ) : null}
        </section>

        <footer className="z-20 border-t border-white/[0.07] bg-[#08150f]/96 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-5">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-[24px] border border-white/[0.085] bg-white/[0.04] p-2 shadow-xl shadow-black/15 transition focus-within:border-emerald-300/20 focus-within:bg-white/[0.05]">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                disabled={sending}
                rows={1}
                maxLength={4000}
                placeholder={connection === "offline" ? "الاتصال غير متوفر…" : "اكتب رسالتك…"}
                className="max-h-[150px] min-h-[54px] flex-1 resize-none bg-transparent px-3 py-3.5 text-sm leading-6 text-white outline-none placeholder:text-white/28 disabled:opacity-45"
              />

              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !message.trim() || connection === "offline"}
                className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-2xl bg-emerald-400 text-[#052117] shadow-lg shadow-emerald-950/25 transition hover:scale-[1.02] hover:bg-emerald-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="إرسال"
              >
                {sending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#052117]/25 border-t-[#052117]" />
                ) : (
                  <svg className="h-5 w-5 -rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2 11 13" />
                    <path d="m22 2-7 20-4-9-9-4Z" />
                  </svg>
                )}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between px-1 text-[9.5px] text-white/25">
              <span>Enter للإرسال • Shift + Enter لسطر جديد</span>
              <button type="button" onClick={() => void openTelegram()} disabled={busy} className="text-sky-200/45 hover:text-sky-200/75 sm:hidden">Telegram ↗</button>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
