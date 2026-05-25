import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type WhatsAppMessageRecord = {
  id: string;
  created_at?: string | null;
  wa_id?: string | null;
  direction?: string | null;
  customer_name?: string | null;
  message_id?: string | null;
  message_type?: string | null;
  body?: string | null;
  status?: string | null;
  status_timestamp?: string | null;
};

function formatDateTime(value: string | null | undefined) {
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

function directionLabel(direction: string | null | undefined) {
  switch (direction) {
    case "incoming":
      return "وارد";
    case "outgoing":
      return "صادر";
    case "status":
      return "حالة";
    default:
      return direction || "—";
  }
}

function directionClass(direction: string | null | undefined) {
  switch (direction) {
    case "incoming":
      return "border-sky-300/25 bg-sky-950/25 text-sky-100";
    case "outgoing":
      return "border-emerald-300/25 bg-emerald-950/25 text-emerald-100";
    case "status":
      return "border-[#d6b56b]/25 bg-[#d6b56b]/10 text-[#f3dfac]";
    default:
      return "border-white/10 bg-white/5 text-white";
  }
}

function statusClass(status: string | null | undefined) {
  switch (status) {
    case "sent":
    case "delivered":
    case "read":
    case "sent_to_meta":
      return "border-emerald-300/25 bg-emerald-950/20 text-emerald-100";
    case "failed":
      return "border-red-300/25 bg-red-950/25 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-[#d7ddd5]";
  }
}

function cleanPhoneForWaLink(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("962")) return digits;
  if (digits.startsWith("07") && digits.length === 10) return `962${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `962${digits}`;

  return digits;
}

function extractTracking(body: string | null | undefined) {
  const match = String(body || "").match(/AM-\d{8,}/i);
  return match ? match[0].toUpperCase() : "";
}

export default async function AdminWhatsAppInboxPage() {
  const loggedIn = await isAdminLoggedIn();

  if (!loggedIn) {
    redirect("/admin/login");
  }

  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select(
      "id, created_at, wa_id, direction, customer_name, message_id, message_type, body, status, status_timestamp"
    )
    .order("created_at", { ascending: false })
    .limit(250);

  const messages = (data || []) as WhatsAppMessageRecord[];

  const incomingCount = messages.filter((item) => item.direction === "incoming").length;
  const outgoingCount = messages.filter((item) => item.direction === "outgoing").length;
  const failedCount = messages.filter((item) => item.status === "failed").length;
  const uniqueCustomers = new Set(messages.map((item) => item.wa_id).filter(Boolean)).size;

  return (
    <main dir="rtl" className="min-h-screen bg-[#03120e] px-4 py-8 text-[#f7f3e8]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold text-[#d6b56b]">الأمين للأقساط</p>
            <h1 className="text-3xl font-black text-white">مراقبة رسائل واتساب</h1>
            <p className="mt-2 text-sm font-bold text-[#aeb9af]">
              آخر 250 سجل من الرسائل الواردة والصادرة وحالات التسليم.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-2xl border border-[#d6b56b]/30 bg-[#d6b56b]/10 px-5 py-3 text-center text-sm font-black text-[#f3dfac] transition hover:bg-[#d6b56b]/20"
          >
            العودة للوحة الأدمن
          </Link>
        </div>

        {error ? (
          <section className="rounded-[28px] border border-red-300/25 bg-red-950/25 p-6 text-red-100">
            <h2 className="mb-3 text-xl font-black">تعذر قراءة جدول الرسائل</h2>
            <p className="text-sm font-bold leading-7">
              تأكد أنك شغّلت SQL الخاص بجدول <span className="font-black">whatsapp_messages</span>.
            </p>
            <pre dir="ltr" className="mt-4 overflow-x-auto rounded-2xl bg-black/40 p-4 text-xs">
              {error.message}
            </pre>
          </section>
        ) : (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-black text-[#aeb9af]">عملاء مختلفون</p>
                <p className="mt-2 text-3xl font-black text-white">{uniqueCustomers}</p>
              </div>

              <div className="rounded-[24px] border border-sky-300/20 bg-sky-950/20 p-5">
                <p className="text-xs font-black text-sky-100">وارد</p>
                <p className="mt-2 text-3xl font-black text-white">{incomingCount}</p>
              </div>

              <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-950/20 p-5">
                <p className="text-xs font-black text-emerald-100">صادر</p>
                <p className="mt-2 text-3xl font-black text-white">{outgoingCount}</p>
              </div>

              <div className="rounded-[24px] border border-red-300/20 bg-red-950/20 p-5">
                <p className="text-xs font-black text-red-100">فشل</p>
                <p className="mt-2 text-3xl font-black text-white">{failedCount}</p>
              </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-right">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/20 text-xs text-[#f3dfac]">
                      <th className="px-4 py-4 font-black">الوقت</th>
                      <th className="px-4 py-4 font-black">العميل</th>
                      <th className="px-4 py-4 font-black">الاتجاه</th>
                      <th className="px-4 py-4 font-black">الحالة</th>
                      <th className="px-4 py-4 font-black">نوع الرسالة</th>
                      <th className="px-4 py-4 font-black">الرسالة</th>
                      <th className="px-4 py-4 font-black">إجراءات</th>
                    </tr>
                  </thead>

                  <tbody>
                    {messages.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm font-bold text-[#aeb9af]">
                          لا توجد رسائل محفوظة بعد.
                        </td>
                      </tr>
                    ) : (
                      messages.map((message) => {
                        const waLink = cleanPhoneForWaLink(message.wa_id);
                        const tracking = extractTracking(message.body);

                        return (
                          <tr key={message.id} className="border-b border-white/10 align-top hover:bg-white/[0.03]">
                            <td className="whitespace-nowrap px-4 py-4 text-xs font-bold text-[#aeb9af]">
                              {formatDateTime(message.created_at)}
                            </td>

                            <td className="px-4 py-4">
                              <p className="text-sm font-black text-white">
                                {message.customer_name || "—"}
                              </p>
                              <p dir="ltr" className="mt-1 text-xs font-bold text-[#aeb9af]">
                                {message.wa_id || "—"}
                              </p>
                            </td>

                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${directionClass(message.direction)}`}>
                                {directionLabel(message.direction)}
                              </span>
                            </td>

                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(message.status)}`}>
                                {message.status || "—"}
                              </span>
                              {message.status_timestamp ? (
                                <p className="mt-2 text-[11px] font-bold text-[#aeb9af]">
                                  {formatDateTime(message.status_timestamp)}
                                </p>
                              ) : null}
                            </td>

                            <td className="px-4 py-4 text-xs font-bold text-[#d7ddd5]">
                              {message.message_type || "text"}
                            </td>

                            <td className="max-w-[420px] px-4 py-4">
                              <p className="whitespace-pre-wrap break-words text-sm font-bold leading-7 text-white">
                                {message.body || "—"}
                              </p>

                              {tracking ? (
                                <p dir="ltr" className="mt-2 inline-flex rounded-full border border-[#d6b56b]/25 bg-[#d6b56b]/10 px-3 py-1 text-xs font-black text-[#f3dfac]">
                                  {tracking}
                                </p>
                              ) : null}
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-2">
                                {waLink ? (
                                  <a
                                    href={`https://wa.me/${waLink}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-xl border border-emerald-300/25 bg-emerald-950/25 px-3 py-2 text-center text-xs font-black text-emerald-100 hover:bg-emerald-950/40"
                                  >
                                    فتح واتساب
                                  </a>
                                ) : null}

                                {tracking ? (
                                  <Link
                                    href={`/track?tracking=${encodeURIComponent(tracking)}`}
                                    className="rounded-xl border border-[#d6b56b]/25 bg-[#d6b56b]/10 px-3 py-2 text-center text-xs font-black text-[#f3dfac] hover:bg-[#d6b56b]/20"
                                  >
                                    تتبع الطلب
                                  </Link>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
