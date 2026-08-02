import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ShadowQueueProcessor from "./ShadowQueueProcessor";

export const dynamic = "force-dynamic";

type ShadowRow = {
  id: string;
  created_at?: string | null;
  wa_id?: string | null;
  body?: string | null;
  status?: string | null;
  intent?: string | null;
  tracking_id?: string | null;
  raw_payload?: unknown;
};

type ShadowPayload = {
  version?: string;
  generatedAt?: string;
  actualWaId?: string;
  incomingMessageId?: string | null;
  customerMessage?: string;
  actualReply?: string;
  candidateReply?: string;
  initialIntent?: string;
  agent?: "followup" | "study" | "omran" | string;
  topics?: string[];
  facts?: {
    status?: string | null;
    paymentStatus?: string | null;
    trackingId?: string | null;
    paymentCurrentlyAllowed?: boolean;
    requiredDocument?: string | null;
  };
  validation?: {
    valid?: boolean;
    score?: number;
    riskFlags?: string[];
    answeredTopics?: string[];
    missingTopics?: string[];
  };
  model?: string;
  generationMs?: number;
  parseMode?: string;
  shadowState?: "queued" | "processing" | "pass" | "blocked" | "failed";
};

function parsePayload(value: unknown): ShadowPayload {
  if (!value || typeof value !== "object") return {};
  return value as ShadowPayload;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-JO", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function agentLabel(agent: string | undefined) {
  if (agent === "omran") return "عمران";
  if (agent === "study") return "الدراسة";
  if (agent === "followup") return "المتابعة";
  return agent || "—";
}

type PageProps = {
  searchParams?: Promise<{ hours?: string; result?: string; agent?: string }>;
};

export default async function WhatsAppShadowReviewPage({ searchParams }: PageProps) {
  if (!(await isAdminLoggedIn())) redirect("/admin/login");

  const params = searchParams ? await searchParams : {};
  const hours = [6, 12, 24, 48, 72].includes(Number(params.hours)) ? Number(params.hours) : 24;
  const resultFilter = params.result === "pass" || params.result === "blocked" ? params.result : "all";
  const agentFilter = ["followup", "study", "omran"].includes(String(params.agent)) ? String(params.agent) : "all";
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id, created_at, wa_id, body, status, intent, tracking_id, raw_payload")
    .like("wa_id", "shadow_v2:%")
    .eq("direction", "outgoing")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  const mappedRows = ((data || []) as ShadowRow[])
    .map((row) => ({ row, payload: parsePayload(row.raw_payload) }));

  const rows = mappedRows.filter(({ payload }) => {
    const state = String(payload.shadowState || "");
    if (resultFilter === "pass" && state !== "pass") return false;
    if (resultFilter === "blocked" && state !== "blocked") return false;
    if (agentFilter !== "all" && payload.agent !== agentFilter) return false;
    return true;
  });

  const allRows = mappedRows.map(({ payload }) => payload);
  const passedCount = allRows.filter((payload) => payload.shadowState === "pass").length;
  const queuedCount = allRows.filter((payload) => ["queued", "processing"].includes(String(payload.shadowState || ""))).length;
  const failedCount = allRows.filter((payload) => payload.shadowState === "failed").length;
  const blockedCount = allRows.filter((payload) => payload.shadowState === "blocked").length;
  const averageScore = allRows.length
    ? Math.round(allRows.reduce((sum, payload) => sum + Number(payload.validation?.score || 0), 0) / allRows.length)
    : 0;

  return (
    <main dir="rtl" className="min-h-screen bg-[#03120e] px-4 py-8 text-[#f7f3e8]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black text-[#d6b56b]">Multi-Agent v2</p>
            <h1 className="mt-1 text-3xl font-black text-white">مراجعة Shadow Mode</h1>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#aeb9af]">
              الرد الفعلي أُرسل من النسخة المستقرة. الرد التجريبي محفوظ هنا للمقارنة فقط ولم يصل للعميل ولم ينفذ أي إجراء.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <ShadowQueueProcessor />
            <div className="flex gap-2">
            <Link href="/admin/whatsapp" className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white">
              محادثات واتساب
            </Link>
            <Link href="/admin" className="rounded-2xl border border-[#d6b56b]/25 bg-[#d6b56b]/10 px-5 py-3 text-sm font-black text-[#f3dfac]">
              لوحة الأدمن
            </Link>
            </div>
          </div>
        </div>

        <section className="mb-6 grid gap-4 md:grid-cols-6">
          <Stat label="ردود تجريبية" value={allRows.length} />
          <Stat label="اجتازت السياسات" value={passedCount} tone="green" />
          <Stat label="محجوبة" value={blockedCount} tone="red" />
          <Stat label="معلقة" value={queuedCount} tone="gold" />
          <Stat label="فشل تقني" value={failedCount} tone="red" />
          <Stat label="متوسط الجودة" value={`${averageScore}%`} tone="gold" />
        </section>

        <section className="mb-6 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap gap-2">
            {[6, 12, 24, 48, 72].map((value) => (
              <FilterLink key={value} active={hours === value} href={`?hours=${value}&result=${resultFilter}&agent=${agentFilter}`}>
                آخر {value} ساعة
              </FilterLink>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterLink active={resultFilter === "all"} href={`?hours=${hours}&result=all&agent=${agentFilter}`}>الكل</FilterLink>
            <FilterLink active={resultFilter === "pass"} href={`?hours=${hours}&result=pass&agent=${agentFilter}`}>ناجح</FilterLink>
            <FilterLink active={resultFilter === "blocked"} href={`?hours=${hours}&result=blocked&agent=${agentFilter}`}>محجوب</FilterLink>
            <FilterLink active={agentFilter === "all"} href={`?hours=${hours}&result=${resultFilter}&agent=all`}>كل الموظفين</FilterLink>
            <FilterLink active={agentFilter === "followup"} href={`?hours=${hours}&result=${resultFilter}&agent=followup`}>المتابعة</FilterLink>
            <FilterLink active={agentFilter === "study"} href={`?hours=${hours}&result=${resultFilter}&agent=study`}>الدراسة</FilterLink>
            <FilterLink active={agentFilter === "omran"} href={`?hours=${hours}&result=${resultFilter}&agent=omran`}>عمران</FilterLink>
          </div>
        </section>

        {error ? (
          <section className="rounded-[24px] border border-red-300/25 bg-red-950/25 p-6 text-red-100">
            تعذر قراءة ردود Shadow Mode: {error.message}
          </section>
        ) : rows.length === 0 ? (
          <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-10 text-center font-bold text-[#aeb9af]">
            لا توجد ردود تجريبية ضمن الفلتر الحالي.
          </section>
        ) : (
          <div className="space-y-5">
            {rows.map(({ row, payload }) => {
              const valid = payload.shadowState === "pass";
              const queued = ["queued", "processing"].includes(String(payload.shadowState || ""));
              const failed = payload.shadowState === "failed";
              const resultLabel = queued ? "قيد المعالجة" : failed ? "فشل تقني" : valid ? "اجتاز" : "محجوب";
              const resultClass = queued
                ? "border-amber-300/25 bg-amber-950/25 text-amber-100"
                : failed
                  ? "border-orange-300/25 bg-orange-950/25 text-orange-100"
                  : valid
                    ? "border-emerald-300/25 bg-emerald-950/25 text-emerald-100"
                    : "border-red-300/25 bg-red-950/25 text-red-100";
              const phone = payload.actualWaId || String(row.wa_id || "").replace(/^shadow_v2:/, "");
              return (
                <article key={row.id} className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
                  <div className="flex flex-col gap-3 border-b border-white/10 bg-black/20 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${resultClass}`}>
                        {resultLabel}
                      </span>
                      <span className="rounded-full border border-[#d6b56b]/25 bg-[#d6b56b]/10 px-3 py-1 text-xs font-black text-[#f3dfac]">
                        {agentLabel(payload.agent)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-[#d7ddd5]">
                        الجودة {payload.validation?.score ?? 0}%
                      </span>
                      <span dir="ltr" className="text-xs font-bold text-[#aeb9af]">{phone || "—"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-bold text-[#aeb9af]">
                      <span>{formatDate(row.created_at)}</span>
                      {phone ? <Link href={`/admin/whatsapp?phone=${encodeURIComponent(phone)}`} className="text-sky-200 underline">فتح المحادثة</Link> : null}
                    </div>
                  </div>

                  <div className="grid gap-4 p-5 lg:grid-cols-3">
                    <MessageCard title="رسالة العميل" text={payload.customerMessage || "—"} tone="customer" />
                    <MessageCard title="الرد الفعلي المرسل" text={payload.actualReply || "—"} tone="actual" />
                    <MessageCard title="رد v2 التجريبي" text={payload.candidateReply || row.body || "—"} tone={valid ? "shadow" : "blocked"} />
                  </div>

                  <div className="grid gap-4 border-t border-white/10 px-5 py-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-black text-[#d6b56b]">الموضوعات</p>
                      <p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">{payload.topics?.join("، ") || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black text-[#d6b56b]">مخاطر / نواقص</p>
                      <p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">
                        {payload.validation?.riskFlags?.length ? payload.validation.riskFlags.join("، ") : "لا توجد مخالفات مكتشفة"}
                      </p>
                    </div>
                    <div className="text-xs font-bold leading-6 text-[#aeb9af]">
                      الحالة: {payload.facts?.status || "—"} | الدفع: {payload.facts?.paymentStatus || "—"} | الدفع مسموح: {payload.facts?.paymentCurrentlyAllowed ? "نعم" : "لا"}
                    </div>
                    <div className="text-xs font-bold leading-6 text-[#aeb9af]">
                      النموذج: {payload.model || "—"} | الزمن: {payload.generationMs ?? 0}ms | التحليل: {payload.parseMode || "—"}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: string }) {
  const className = tone === "green"
    ? "border-emerald-300/20 bg-emerald-950/20"
    : tone === "red"
      ? "border-red-300/20 bg-red-950/20"
      : tone === "gold"
        ? "border-[#d6b56b]/20 bg-[#d6b56b]/10"
        : tone === "orange"
          ? "border-orange-300/20 bg-orange-950/20"
          : "border-white/10 bg-white/[0.04]";
  return <div className={`rounded-[22px] border p-5 ${className}`}><p className="text-xs font-black text-[#aeb9af]">{label}</p><p className="mt-2 text-3xl font-black text-white">{value}</p></div>;
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link href={href} className={`rounded-xl border px-3 py-2 text-xs font-black ${active ? "border-[#d6b56b]/40 bg-[#d6b56b]/15 text-[#f3dfac]" : "border-white/10 bg-white/5 text-[#d7ddd5]"}`}>{children}</Link>;
}

function MessageCard({ title, text, tone }: { title: string; text: string; tone: "customer" | "actual" | "shadow" | "blocked" }) {
  const className = tone === "customer"
    ? "border-sky-300/20 bg-sky-950/20"
    : tone === "actual"
      ? "border-white/10 bg-black/20"
      : tone === "shadow"
        ? "border-emerald-300/20 bg-emerald-950/20"
        : "border-red-300/20 bg-red-950/20";
  return <div className={`rounded-[22px] border p-4 ${className}`}><p className="mb-3 text-xs font-black text-[#f3dfac]">{title}</p><p className="whitespace-pre-wrap break-words text-sm font-bold leading-8 text-white">{text}</p></div>;
}
