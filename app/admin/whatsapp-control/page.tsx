import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ControlActions from "./ControlActions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ hours?: string }>;

type MessageRow = {
  id?: string | null;
  wa_id?: string | null;
  direction?: string | null;
  body?: string | null;
  message_type?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  tracking_id?: string | null;
  application_id?: string | null;
  status?: string | null;
};

const ALLOWED_HOURS = [1, 2, 6, 12, 24, 48, 168];

function parseHours(value?: string) {
  const n = Number(value || "2");
  return ALLOWED_HOURS.includes(n) ? n : 2;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-JO", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Amman" }).format(new Date(value));
  } catch {
    return value;
  }
}

function shortText(value?: string | null, max = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text || "—";
}

function customerLabel(row: MessageRow) {
  return String(row.customer_name || "").trim() || String(row.wa_id || "—");
}

function pendingConversations(rows: MessageRow[]) {
  const byWa = new Map<string, { latestIncoming?: MessageRow; latestOutgoing?: MessageRow }>();
  for (const row of rows) {
    const wa = String(row.wa_id || "").trim();
    if (!wa) continue;
    const entry = byWa.get(wa) || {};
    const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (row.direction === "incoming") {
      const prev = entry.latestIncoming?.created_at ? new Date(entry.latestIncoming.created_at).getTime() : 0;
      if (ts >= prev) entry.latestIncoming = row;
    }
    if (row.direction === "outgoing" && row.message_type !== "admin_control") {
      const prev = entry.latestOutgoing?.created_at ? new Date(entry.latestOutgoing.created_at).getTime() : 0;
      if (ts >= prev) entry.latestOutgoing = row;
    }
    byWa.set(wa, entry);
  }
  return Array.from(byWa.entries())
    .filter(([, entry]) => {
      if (!entry.latestIncoming?.created_at) return false;
      if (!entry.latestOutgoing?.created_at) return true;
      return new Date(entry.latestIncoming.created_at).getTime() > new Date(entry.latestOutgoing.created_at).getTime();
    })
    .map(([waId, entry]) => ({ waId, incoming: entry.latestIncoming! }))
    .sort((a, b) => new Date(b.incoming.created_at || 0).getTime() - new Date(a.incoming.created_at || 0).getTime());
}

export default async function WhatsAppControlPage({ searchParams }: { searchParams?: SearchParams }) {
  if (!(await isAdminLoggedIn())) redirect("/admin/login");
  const params = searchParams ? await searchParams : {};
  const hours = parseHours(params.hours);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const [{ data: settings }, { data: messages, error: messagesError }, actionResult, notificationResult, manualActionCountResult, deliveryFailureCountResult] = await Promise.all([
    supabaseAdmin.from("whatsapp_v3_production_settings").select("id,live_enabled,kill_switch,real_actions_enabled,resume_legacy_ignored,runtime_version,updated_at").eq("id", "default").maybeSingle(),
    supabaseAdmin.from("whatsapp_messages").select("id,wa_id,direction,body,message_type,created_at,customer_name,tracking_id,application_id,status").gte("created_at", since).order("created_at", { ascending: true }).limit(5000),
    supabaseAdmin.from("whatsapp_v3_action_ledger").select("id,action_type,status,application_id,wa_id,created_at,blocker").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("whatsapp_v3_notification_ledger").select("id,event_type,severity,status,wa_id,application_id,created_at,error_message").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("whatsapp_v3_notification_ledger").select("id", { count: "exact", head: true }).eq("event_type", "manual_action_required").gte("created_at", since),
    supabaseAdmin.from("whatsapp_v3_notification_ledger").select("id", { count: "exact", head: true }).eq("event_type", "whatsapp_delivery_failure").gte("created_at", since),
  ]);

  const rows = (messages || []) as MessageRow[];
  const pending = pendingConversations(rows);
  const now = Date.now();
  const outsideWindow = pending.filter((x) => !x.incoming.created_at || now - new Date(x.incoming.created_at).getTime() > 23.5 * 60 * 60 * 1000);
  const incoming = rows.filter((x) => x.direction === "incoming").length;
  const outgoing = rows.filter((x) => x.direction === "outgoing" && x.message_type !== "admin_control").length;
  const customers = new Set(rows.map((x) => x.wa_id).filter(Boolean)).size;
  const failedStatuses = rows.filter((x) => x.direction === "status" && String(x.status || "").toLowerCase() === "failed").length;
  const visibleFallbacks = rows.filter((x) => x.direction === "outgoing" && /صار خلل مؤقت|بكمل معك على نفس الموضوع بدون ما أخمّن/i.test(String(x.body || ""))).length;
  const manualActionRequests = Number(manualActionCountResult.count || 0);
  const deliveryFailures = Number(deliveryFailureCountResult.count || 0);
  const liveEnabled = Boolean(settings?.live_enabled);
  const killSwitch = Boolean(settings?.kill_switch);
  const realActions = Boolean(settings?.real_actions_enabled);

  return (
    <main dir="rtl" className="min-h-screen bg-[#0b0f0d] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-black text-[#d6b56b]">الأمين للأقساط</div>
            <h1 className="mt-1 text-3xl font-black">V3 Control Center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#aeb8b0]">تشغيل ومراقبة V3 من مكان واحد. Real Actions مقفلة؛ أي تغيير حقيقي يتحول إلى تنبيه Discord واضح للإدارة، واللوحة تراقب الـFallback الظاهر وفشل الإرسال والمحادثات المتوقفة.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/whatsapp" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black">محادثات واتساب</Link>
            <Link href="/admin" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black">الطلبات</Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Stat title="حالة V3" value={liveEnabled && !killSwitch ? "شغال" : "موقف"} accent={liveEnabled && !killSwitch ? "good" : "warn"} />
          <Stat title="رسائل واردة" value={String(incoming)} />
          <Stat title="ردود صادرة" value={String(outgoing)} />
          <Stat title="محادثات متوقفة" value={String(pending.length)} accent={pending.length ? "bad" : "good"} />
          <Stat title="Fallback ظاهر" value={String(visibleFallbacks)} accent={visibleFallbacks ? "bad" : "good"} />
          <Stat title="إجراءات يدوية" value={String(manualActionRequests)} accent={manualActionRequests ? "warn" : undefined} />
          <Stat title="فشل إرسال" value={String(deliveryFailures)} accent={deliveryFailures ? "bad" : "good"} />
          <Stat title="عملاء بالفترة" value={String(customers)} />
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ml-2 text-xs font-black text-[#aeb8b0]">نافذة المراقبة:</span>
            {ALLOWED_HOURS.map((value) => (
              <Link key={value} href={`/admin/whatsapp-control?hours=${value}`} className={`rounded-xl px-3 py-2 text-xs font-black ${hours === value ? "bg-[#d6b56b] text-black" : "border border-white/10 bg-black/20 text-white"}`}>
                {value === 1 ? "ساعة" : value === 2 ? "ساعتين" : value === 24 ? "يوم" : value === 48 ? "يومين" : value === 168 ? "أسبوع" : `${value} ساعات`}
              </Link>
            ))}
          </div>
        </div>

        <ControlActions currentHours={hours} v3Live={liveEnabled} killSwitch={killSwitch} realActions={realActions} pendingCount={pending.length} outsideWindowCount={outsideWindow.length} />

        {messagesError ? <div className="rounded-2xl border border-red-400/25 bg-red-950/20 p-4 text-sm text-red-100">تعذر قراءة سجل واتساب: {messagesError.message}</div> : null}

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">المحادثات التي تنتظر ردًا</h2>
              <p className="mt-1 text-xs text-[#9fa9a1]">{outsideWindow.length ? `${outsideWindow.length} منها خارج نافذة الرد الحر في واتساب.` : "كل المحادثات الظاهرة ما زالت ضمن نافذة الرد الحر."}</p>
            </div>
            <div className="text-xs font-black text-[#d6b56b]">فشل حالات Meta المسجلة: {failedStatuses}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-sm">
              <thead className="text-xs text-[#9fa9a1]"><tr><th className="px-3 py-2">العميل</th><th className="px-3 py-2">آخر رسالة</th><th className="px-3 py-2">الوقت</th><th className="px-3 py-2">التتبع</th><th className="px-3 py-2">النافذة</th></tr></thead>
              <tbody>
                {pending.slice(0, 50).map(({ waId, incoming: row }) => {
                  const old = !row.created_at || now - new Date(row.created_at).getTime() > 23.5 * 60 * 60 * 1000;
                  return <tr key={`${waId}-${row.id}`} className="border-t border-white/5"><td className="px-3 py-3 font-bold">{customerLabel(row)}<div className="text-xs font-normal text-[#8f9991]">{waId}</div></td><td className="max-w-md px-3 py-3 text-[#dfe5df]">{shortText(row.body)}</td><td className="px-3 py-3 text-[#aeb8b0]">{formatDate(row.created_at)}</td><td className="px-3 py-3 font-mono text-xs">{row.tracking_id || "—"}</td><td className="px-3 py-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${old ? "bg-amber-500/15 text-amber-100" : "bg-emerald-500/15 text-emerald-100"}`}>{old ? "خارج 24 ساعة" : "قابل للاستعادة"}</span></td></tr>;
                })}
                {!pending.length ? <tr><td colSpan={5} className="px-3 py-10 text-center text-[#8f9991]">لا توجد محادثات متوقفة ضمن الفترة المختارة.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Ledger title="آخر إجراءات V3" rows={(actionResult.data || []) as Record<string, unknown>[]} />
          <Ledger title="آخر تنبيهات V3" rows={(notificationResult.data || []) as Record<string, unknown>[]} />
        </div>
      </div>
    </main>
  );
}

function Stat({ title, value, accent }: { title: string; value: string; accent?: "good" | "warn" | "bad" }) {
  const cls = accent === "good" ? "text-emerald-200" : accent === "bad" ? "text-red-200" : accent === "warn" ? "text-amber-100" : "text-white";
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-xs font-bold text-[#8f9991]">{title}</div><div className={`mt-2 text-2xl font-black ${cls}`}>{value}</div></div>;
}

function Ledger({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  return <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><h2 className="mb-4 text-lg font-black">{title}</h2><div className="space-y-2">{rows.slice(0, 12).map((row, index) => <div key={String(row.id || index)} className="rounded-2xl border border-white/5 bg-black/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-black text-white">{String(row.action_type || row.event_type || row.status || "حدث")}</span><span className="text-xs text-[#8f9991]">{formatDate(String(row.created_at || ""))}</span></div><div className="mt-2 text-xs leading-6 text-[#aeb8b0]">{String(row.blocker || row.error_message || row.status || row.severity || "—")}</div></div>)}{!rows.length ? <div className="py-8 text-center text-sm text-[#8f9991]">لا توجد بيانات ضمن الفترة.</div> : null}</div></section>;
}
