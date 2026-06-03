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
  intent?: string | null;
  tracking_id?: string | null;
  application_id?: string | null;
  needs_human_review?: boolean | null;
  handled_by_ai?: boolean | null;
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

function normalizeJordanPhoneDisplay(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("962") && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.startsWith("7") && digits.length === 9) return `0${digits}`;
  if (digits.startsWith("07") && digits.length === 10) return digits;

  return digits;
}

function extractTracking(body: string | null | undefined) {
  const match = String(body || "").match(/AM-\d{8,}/i);
  return match ? match[0].toUpperCase() : "";
}

function getCustomerKey(message: WhatsAppMessageRecord) {
  const wa = cleanPhoneForWaLink(message.wa_id);
  if (wa) return wa;
  return message.wa_id || message.application_id || message.message_id || message.id;
}

function getCustomerDisplay(message: WhatsAppMessageRecord) {
  const name = String(message.customer_name || "").trim();
  const phone = normalizeJordanPhoneDisplay(message.wa_id) || message.wa_id || "";

  if (name && phone) return { title: name, subtitle: phone };
  if (phone) return { title: phone, subtitle: "رقم واتساب العميل" };
  if (name) return { title: name, subtitle: "بدون رقم محفوظ" };

  return { title: "—", subtitle: "غير مربوط برقم" };
}

type PageProps = {
  searchParams?: Promise<{
    phone?: string;
  }>;
};

export default async function AdminWhatsAppInboxPage({ searchParams }: PageProps) {
  const loggedIn = await isAdminLoggedIn();

  if (!loggedIn) {
    redirect("/admin/login");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const phoneFilter = cleanPhoneForWaLink(resolvedSearchParams?.phone);

  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select(
      "id, created_at, wa_id, direction, customer_name, message_id, message_type, body, status, status_timestamp, intent, tracking_id, application_id, needs_human_review, handled_by_ai"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const rawMessages = (data || []) as WhatsAppMessageRecord[];

  // Status webhooks مثل sent / delivered / read ليست محادثات فعلية.
  // يتم تحديث حالة الرسالة الأصلية من webhook، وهنا نخفي أي سجلات قديمة من نوع status حتى لا تظهر كسطور فاضية.
  const conversationMessages = rawMessages.filter((item) => item.direction !== "status");

  const filteredMessages = phoneFilter
    ? conversationMessages.filter((item) => cleanPhoneForWaLink(item.wa_id) === phoneFilter)
    : conversationMessages;

  const customerMap = new Map<string, WhatsAppMessageRecord[]>();

  for (const message of conversationMessages) {
    const key = getCustomerKey(message);
    if (!key) continue;
    const current = customerMap.get(key) || [];
    current.push(message);
    customerMap.set(key, current);
  }

  const conversations = Array.from(customerMap.entries())
    .map(([key, items]) => {
      const latest = [...items].sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      })[0];

      const incoming = items.filter((item) => item.direction === "incoming").length;
      const outgoing = items.filter((item) => item.direction === "outgoing").length;
      const needsHuman = items.some((item) => item.needs_human_review);
      const failed = items.some((item) => item.status === "failed");

      return {
        key,
        latest,
        total: items.length,
        incoming,
        outgoing,
        needsHuman,
        failed,
      };
    })
    .filter((item) => cleanPhoneForWaLink(item.latest.wa_id))
    .sort((a, b) => {
      const aTime = new Date(a.latest.created_at || 0).getTime();
      const bTime = new Date(b.latest.created_at || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 30);

  const incomingCount = conversationMessages.filter((item) => item.direction === "incoming").length;
  const outgoingCount = conversationMessages.filter((item) => item.direction === "outgoing").length;
  const failedCount = conversationMessages.filter((item) => item.status === "failed").length;
  const humanReviewCount = conversationMessages.filter((item) => item.needs_human_review).length;
  const uniqueCustomers = new Set(
    conversationMessages.map((item) => cleanPhoneForWaLink(item.wa_id)).filter(Boolean)
  ).size;
  const hiddenStatusCount = rawMessages.filter((item) => item.direction === "status").length;

  return (
    <main dir="rtl" className="min-h-screen bg-[#03120e] px-4 py-8 text-[#f7f3e8]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold text-[#d6b56b]">الأمين للأقساط</p>
            <h1 className="text-3xl font-black text-white">مراقبة رسائل واتساب</h1>
            <p className="mt-2 text-sm font-bold text-[#aeb9af]">
              آخر 500 سجل، مع إخفاء سجلات الحالة الفارغة وربط كل محادثة برقم واتساب.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {phoneFilter ? (
              <Link
                href="/admin/whatsapp"
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-white/10"
              >
                عرض كل الأرقام
              </Link>
            ) : null}

            <Link
              href="/admin"
              className="rounded-2xl border border-[#d6b56b]/30 bg-[#d6b56b]/10 px-5 py-3 text-center text-sm font-black text-[#f3dfac] transition hover:bg-[#d6b56b]/20"
            >
              العودة للوحة الأدمن
            </Link>
          </div>
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
            <section className="mb-6 grid gap-4 md:grid-cols-6">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-black text-[#aeb9af]">أرقام مختلفة</p>
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

              <div className="rounded-[24px] border border-orange-300/20 bg-orange-950/20 p-5">
                <p className="text-xs font-black text-orange-100">تحتاج متابعة</p>
                <p className="mt-2 text-3xl font-black text-white">{humanReviewCount}</p>
              </div>

              <div className="rounded-[24px] border border-[#d6b56b]/20 bg-[#d6b56b]/10 p-5">
                <p className="text-xs font-black text-[#f3dfac]">حالات مخفية</p>
                <p className="mt-2 text-3xl font-black text-white">{hiddenStatusCount}</p>
              </div>
            </section>

            <section className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-lg font-black text-white">المحادثات حسب رقم واتساب</h2>
                <p className="mt-1 text-xs font-bold leading-6 text-[#aeb9af]">
                  اضغط على أي رقم لعرض رسائله فقط. الربط هنا يعتمد على wa_id وليس اسم العميل.
                </p>
              </div>

              {conversations.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm font-bold text-[#aeb9af]">
                  لا توجد محادثات مرتبطة بأرقام حتى الآن.
                </div>
              ) : (
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {conversations.map((conversation) => {
                    const customer = getCustomerDisplay(conversation.latest);
                    const waLink = cleanPhoneForWaLink(conversation.latest.wa_id);
                    const isActive = phoneFilter && waLink === phoneFilter;

                    return (
                      <Link
                        key={conversation.key}
                        href={`/admin/whatsapp?phone=${encodeURIComponent(waLink)}`}
                        className={`rounded-2xl border p-4 transition ${
                          isActive
                            ? "border-[#d6b56b]/50 bg-[#d6b56b]/15"
                            : "border-white/10 bg-black/15 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-white">{customer.title}</p>
                            <p dir="ltr" className="mt-1 text-xs font-bold text-[#aeb9af]">
                              {customer.subtitle}
                            </p>
                          </div>

                          {conversation.needsHuman ? (
                            <span className="rounded-full border border-orange-300/25 bg-orange-950/25 px-2 py-1 text-[10px] font-black text-orange-100">
                              متابعة
                            </span>
                          ) : conversation.failed ? (
                            <span className="rounded-full border border-red-300/25 bg-red-950/25 px-2 py-1 text-[10px] font-black text-red-100">
                              فشل
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-3 line-clamp-2 min-h-[42px] text-xs font-bold leading-6 text-[#d7ddd5]">
                          {conversation.latest.body || "لا يوجد نص محفوظ لهذه الرسالة"}
                        </p>

                        <div className="mt-3 flex items-center justify-between text-[11px] font-black text-[#aeb9af]">
                          <span>{conversation.total} رسالة</span>
                          <span>
                            وارد {conversation.incoming} / صادر {conversation.outgoing}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-lg font-black text-white">
                  {phoneFilter ? "رسائل الرقم المحدد" : "آخر الرسائل"}
                </h2>
                <p className="mt-1 text-xs font-bold text-[#aeb9af]">
                  سجلات status القديمة مخفية من هذا الجدول حتى لا تظهر كسطور فاضية.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] border-collapse text-right">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/20 text-xs text-[#f3dfac]">
                      <th className="px-4 py-4 font-black">الوقت</th>
                      <th className="px-4 py-4 font-black">العميل / الرقم</th>
                      <th className="px-4 py-4 font-black">الاتجاه</th>
                      <th className="px-4 py-4 font-black">الحالة</th>
                      <th className="px-4 py-4 font-black">نوع الرسالة</th>
                      <th className="px-4 py-4 font-black">النية / متابعة</th>
                      <th className="px-4 py-4 font-black">الرسالة</th>
                      <th className="px-4 py-4 font-black">إجراءات</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredMessages.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-[#aeb9af]">
                          لا توجد رسائل محفوظة لهذا العرض.
                        </td>
                      </tr>
                    ) : (
                      filteredMessages.map((message) => {
                        const waLink = cleanPhoneForWaLink(message.wa_id);
                        const tracking = message.tracking_id || extractTracking(message.body);
                        const customer = getCustomerDisplay(message);

                        return (
                          <tr key={message.id} className="border-b border-white/10 align-top hover:bg-white/[0.03]">
                            <td className="whitespace-nowrap px-4 py-4 text-xs font-bold text-[#aeb9af]">
                              {formatDateTime(message.created_at)}
                            </td>

                            <td className="px-4 py-4">
                              <p className="text-sm font-black text-white">{customer.title}</p>
                              <p dir="ltr" className="mt-1 text-xs font-bold text-[#aeb9af]">
                                {customer.subtitle}
                              </p>
                            </td>

                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${directionClass(
                                  message.direction
                                )}`}
                              >
                                {directionLabel(message.direction)}
                              </span>
                            </td>

                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(
                                  message.status
                                )}`}
                              >
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

                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-2">
                                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-[#d7ddd5]">
                                  {message.intent || "—"}
                                </span>

                                {message.needs_human_review ? (
                                  <span className="inline-flex rounded-full border border-orange-300/25 bg-orange-950/25 px-3 py-1 text-xs font-black text-orange-100">
                                    متابعة بشرية
                                  </span>
                                ) : null}

                                {message.handled_by_ai === true ? (
                                  <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-950/20 px-3 py-1 text-[11px] font-black text-emerald-100">
                                    AI
                                  </span>
                                ) : null}
                              </div>
                            </td>

                            <td className="max-w-[420px] px-4 py-4">
                              <p className="whitespace-pre-wrap break-words text-sm font-bold leading-7 text-white">
                                {message.body || "—"}
                              </p>

                              {tracking ? (
                                <p
                                  dir="ltr"
                                  className="mt-2 inline-flex rounded-full border border-[#d6b56b]/25 bg-[#d6b56b]/10 px-3 py-1 text-xs font-black text-[#f3dfac]"
                                >
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

                                {waLink ? (
                                  <Link
                                    href={`/admin/whatsapp?phone=${encodeURIComponent(waLink)}`}
                                    className="rounded-xl border border-sky-300/25 bg-sky-950/25 px-3 py-2 text-center text-xs font-black text-sky-100 hover:bg-sky-950/40"
                                  >
                                    محادثة الرقم
                                  </Link>
                                ) : null}

                                {tracking ? (
                                  <Link
                                    href={`/track?tracking=${encodeURIComponent(tracking)}${
                                      waLink ? `&phone=${encodeURIComponent(message.wa_id || "")}` : ""
                                    }`}
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