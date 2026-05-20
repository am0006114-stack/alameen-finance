import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
    deadline?: string;
  }>;
};

type Application = {
  id: string;
  created_at?: string | null;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  device_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  delivery_delay_until?: string | null;
  delivery_delay_started_at?: string | null;
  payment_reference?: string | null;
};

const DEFAULT_DEADLINE = "2026-05-31T18:00";

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function normalizeJordanPhoneForWhatsApp(phone: string | null | undefined) {
  if (!phone) return "";

  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("962")) return digits;
  if (digits.startsWith("07") && digits.length === 10) return `962${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `962${digits}`;

  return digits;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("ar-JO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function translateStatus(status: string | null | undefined) {
  switch (status) {
    case "delivery_delay_notice_sent":
      return "تم إرسال رابط التمديد / لم يرد";
    case "customer_accepts_delivery_delay":
      return "اختار الانتظار";
    case "refund_requested":
      return "اختار Refund";
    case "refund_completed":
      return "تم تنفيذ الاسترداد";
    case "approved":
      return "مقبول";
    case "under_review":
      return "قيد الدراسة";
    case "pending_payment_confirmation":
      return "بانتظار تأكيد الدفع";
    case "preliminary_qualified":
      return "مؤهل مبدئيًا";
    case "rejected":
      return "مرفوض";
    case "cancelled":
      return "ملغي";
    default:
      return status || "لم يرسل / غير محدد";
  }
}

function statusClass(status: string | null | undefined) {
  switch (status) {
    case "delivery_delay_notice_sent":
      return "border-[#d6b56b]/35 bg-[#d6b56b]/12 text-[#f3dfac]";
    case "customer_accepts_delivery_delay":
      return "border-[#69d97b]/35 bg-[#69d97b]/12 text-[#b8f3c0]";
    case "refund_requested":
      return "border-orange-300/35 bg-orange-950/30 text-orange-100";
    case "refund_completed":
      return "border-sky-300/35 bg-sky-950/30 text-sky-100";
    case "rejected":
    case "cancelled":
      return "border-red-400/35 bg-red-950/30 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-[#d7ddd5]";
  }
}

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "عميلنا الكريم";
  if (parts.length === 1) return parts[0];

  return `${parts[0]} ${parts[1]}`;
}

function buildDelayDecisionUrl(app: Application) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.ameenfinance.co";
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";

  return `${baseUrl}/delay-decision?tracking=${encodeURIComponent(
    tracking
  )}&phone=${encodeURIComponent(phone)}`;
}

function buildWhatsAppPreviewMessage(app: Application) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const delayDecisionUrl = buildDelayDecisionUrl(app);

  return `أهلًا ${name} 🌿

نعتذر منكم بشدة على التعديل، كان الموعد المتوقع مبدئيًا يوم الخميس، لكن بعد المراجعة النهائية مع الإدارة والمورد تبيّن أن بعض الأجهزة لم يتم تزويدنا بها ضمن الموعد المتوقع، لذلك تم اعتماد موعد استكمال الطلبات ليوم الأحد 31/05/2026.

نعرف أن تغيير الموعد مزعج، وحقكم علينا بالاعتذار، لكن فضّلنا نبلغكم بالموعد المعتمد بدل ما نعطيكم موعد غير مضمون.

طلبكم ما زال قائمًا وقيد المتابعة، وسيتم استكمال الإجراءات حسب الدور يوم الأحد بإذن الله.

وفي حال عدم رغبتكم بالانتظار، يمكنكم طلب استرداد رسوم فتح الملف المدفوعة، وحقكم محفوظ بالكامل.

رابط خيار الانتظار أو الاسترداد:
${delayDecisionUrl}

رقم التتبع:
${tracking}

نعتذر مرة أخرى، ونشكركم على صبركم وتفهمكم.
الأمين للأقساط والتمويل`;
}

function filterApplications(applications: Application[], q: string, filter: string) {
  const search = normalizeSearch(q);

  return applications.filter((app) => {
    const matchesSearch =
      !search ||
      [
        app.tracking_id,
        app.full_name,
        app.phone,
        app.device_name,
        app.status,
        app.payment_status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));

    let matchesFilter = true;

    if (filter === "not_sent") {
      matchesFilter =
        app.status !== "delivery_delay_notice_sent" &&
        app.status !== "customer_accepts_delivery_delay" &&
        app.status !== "refund_requested" &&
        app.status !== "refund_completed";
    }

    if (filter === "sent_no_reply") {
      matchesFilter = app.status === "delivery_delay_notice_sent";
    }

    if (filter === "wait") {
      matchesFilter = app.status === "customer_accepts_delivery_delay";
    }

    if (filter === "refund") {
      matchesFilter =
        app.status === "refund_requested" ||
        app.payment_status === "refund_requested";
    }

    return matchesSearch && matchesFilter;
  });
}

function buildFilterHref(params: {
  q?: string;
  filter?: string;
  deadline?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set("q", params.q);
  if (params.filter) searchParams.set("filter", params.filter);
  if (params.deadline) searchParams.set("deadline", params.deadline);

  const queryString = searchParams.toString();

  return queryString ? `/admin/delay-messages?${queryString}` : "/admin/delay-messages";
}

function CountCard({
  label,
  value,
  href,
  active,
}: {
  label: string;
  value: number;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border px-4 py-4 transition ${
        active
          ? "border-[#d6b56b]/45 bg-[#d6b56b]/16 text-[#f3dfac]"
          : "border-white/10 bg-white/5 text-[#d7ddd5] hover:bg-white/10"
      }`}
    >
      <p className="text-xs font-black">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </Link>
  );
}

export default async function DelayMessagesPage({ searchParams }: PageProps) {
  const loggedIn = await isAdminLoggedIn();

  if (!loggedIn) {
    redirect("/admin/login");
  }

  const params = await searchParams;
  const q = params?.q?.trim() || "";
  const filter = params?.filter || "";
  const deadline = params?.deadline || DEFAULT_DEADLINE;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(
      "id, created_at, tracking_id, full_name, phone, device_name, status, payment_status, delivery_delay_started_at, delivery_delay_until, payment_reference"
    )
    .order("created_at", { ascending: false })
    .limit(2000);

  const applications = (data || []) as Application[];
  const filteredApplications = filterApplications(applications, q, filter);

  const notSentCount = applications.filter(
    (app) =>
      app.status !== "delivery_delay_notice_sent" &&
      app.status !== "customer_accepts_delivery_delay" &&
      app.status !== "refund_requested" &&
      app.status !== "refund_completed"
  ).length;

  const sentNoReplyCount = applications.filter(
    (app) => app.status === "delivery_delay_notice_sent"
  ).length;

  const waitCount = applications.filter(
    (app) => app.status === "customer_accepts_delivery_delay"
  ).length;

  const refundCount = applications.filter(
    (app) => app.status === "refund_requested" || app.payment_status === "refund_requested"
  ).length;

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden px-4 py-8 text-[#f7f3e8]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute left-[-110px] top-[280px] h-[300px] w-[300px] rounded-full bg-[#3fae65]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <header className="site-shell pattern-lines mb-6 rounded-[32px] p-1 shadow-xl">
          <div className="rounded-[30px] border border-[rgba(214,181,107,0.14)] p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <Link
                  href="/admin"
                  className="soft-button mb-4 inline-flex rounded-2xl px-4 py-2 text-sm font-black transition"
                >
                  رجوع للطلبات
                </Link>

                <p className="gold-text mb-2 text-sm font-black">
                  مركز إرسال رسائل التمديد والاسترداد
                </p>

                <h1 className="text-3xl font-black text-white">
                  إرسال رسائل مخصصة من Supabase
                </h1>

                <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#cbd6cb]">
                  هذه الصفحة تسحب الطلبات مباشرة من Supabase، وتجهز لكل عميل رسالة واتساب خاصة باسمه ورقم تتبعه ورابط الانتظار أو الاسترداد.
                </p>
              </div>

              <div className="rounded-2xl border border-[#d6b56b]/25 bg-[#d6b56b]/10 p-4">
                <p className="text-xs font-black text-[#f3dfac]">الموعد الافتراضي للإرسال</p>
                <p className="mt-2 text-sm font-black text-white">
                  الأحد 31/05/2026 — 6:00 مساءً
                </p>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <section className="mb-6 rounded-3xl border border-red-400/35 bg-red-950/30 p-5 text-red-100">
            تعذر جلب الطلبات من Supabase: {error.message}
          </section>
        )}

        <section className="glass-panel gold-outline mb-6 rounded-[32px] p-6 shadow-xl">
          <form className="grid gap-4 md:grid-cols-[1fr_260px_220px_auto]" action="/admin/delay-messages">
            <label>
              <span className="mb-2 block text-xs font-black text-[#f3dfac]">
                بحث بالاسم / الرقم / التتبع
              </span>
              <input
                name="q"
                defaultValue={q}
                placeholder="مثال: 078 أو AM- أو اسم العميل"
                className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-3 text-right text-sm font-bold text-white outline-none placeholder:text-[#8d998f] focus:border-[#d6b56b]"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-black text-[#f3dfac]">
                فلتر الحالة
              </span>
              <select
                name="filter"
                defaultValue={filter}
                className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#d6b56b]"
              >
                <option value="">كل الطلبات</option>
                <option value="not_sent">لم يرسل لهم</option>
                <option value="sent_no_reply">تم إرسال الرابط / لم يرد</option>
                <option value="wait">اختار الانتظار</option>
                <option value="refund">اختار Refund</option>
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-black text-[#f3dfac]">
                نهاية التمديد
              </span>
              <input
                type="datetime-local"
                name="deadline"
                defaultValue={deadline}
                className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#d6b56b]"
              />
            </label>

            <button
              type="submit"
              className="green-button self-end rounded-2xl px-6 py-3 text-sm font-black transition"
            >
              تطبيق
            </button>
          </form>
        </section>

        <section className="mb-6 grid gap-3 md:grid-cols-4">
          <CountCard
            label="لم يرسل لهم"
            value={notSentCount}
            href={buildFilterHref({ q, filter: "not_sent", deadline })}
            active={filter === "not_sent"}
          />
          <CountCard
            label="تم إرسال الرابط / لم يرد"
            value={sentNoReplyCount}
            href={buildFilterHref({ q, filter: "sent_no_reply", deadline })}
            active={filter === "sent_no_reply"}
          />
          <CountCard
            label="اختار الانتظار"
            value={waitCount}
            href={buildFilterHref({ q, filter: "wait", deadline })}
            active={filter === "wait"}
          />
          <CountCard
            label="اختار Refund"
            value={refundCount}
            href={buildFilterHref({ q, filter: "refund", deadline })}
            active={filter === "refund"}
          />
        </section>

        <section className="glass-panel gold-outline rounded-[32px] p-4 shadow-xl">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="gold-text text-xl font-black">
              العملاء الجاهزون للإرسال
            </h2>
            <p className="text-sm font-bold text-[#cbd6cb]">
              النتائج: {filteredApplications.length}
            </p>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-white/10">
            <table className="w-full min-w-[1150px] border-collapse bg-black/10 text-sm">
              <thead>
                <tr className="bg-[#d6b56b]/10 text-[#f3dfac]">
                  <th className="p-3 text-right font-black">العميل</th>
                  <th className="p-3 text-right font-black">الهاتف</th>
                  <th className="p-3 text-right font-black">التتبع</th>
                  <th className="p-3 text-right font-black">الجهاز</th>
                  <th className="p-3 text-right font-black">الحالة</th>
                  <th className="p-3 text-right font-black">نهاية التمديد</th>
                  <th className="p-3 text-right font-black">الإرسال</th>
                </tr>
              </thead>

              <tbody>
                {filteredApplications.map((app) => {
                  const cleanPhone = normalizeJordanPhoneForWhatsApp(app.phone);
                  const canSend = Boolean(cleanPhone);
                  const preview = buildWhatsAppPreviewMessage(app);

                  return (
                    <tr key={app.id} className="border-t border-white/10 align-top hover:bg-white/[0.03]">
                      <td className="p-3">
                        <p className="font-black text-white">
                          {app.full_name || "—"}
                        </p>
                        <p className="mt-1 text-xs font-bold text-[#aeb9af]">
                          {formatDate(app.created_at)}
                        </p>
                      </td>

                      <td className="p-3 font-black text-white" dir="ltr">
                        {app.phone || "—"}
                      </td>

                      <td className="p-3 font-black text-white" dir="ltr">
                        {app.tracking_id || app.id}
                      </td>

                      <td className="max-w-[260px] p-3">
                        <p className="break-words font-bold text-[#d7ddd5]">
                          {app.device_name || "—"}
                        </p>
                      </td>

                      <td className="p-3">
                        <span className={`inline-flex rounded-full border px-3 py-2 text-xs font-black ${statusClass(app.status)}`}>
                          {translateStatus(app.status)}
                        </span>
                      </td>

                      <td className="p-3">
                        <p className="font-bold text-[#d7ddd5]">
                          {formatDate(app.delivery_delay_until)}
                        </p>
                      </td>

                      <td className="p-3">
                        <div className="grid gap-2">
                          <form action="/api/admin/bulk-delay-whatsapp" method="POST" target="_blank">
                            <input type="hidden" name="applicationId" value={app.id} />
                            <input type="hidden" name="delayUntil" value={deadline} />
                            <button
                              type="submit"
                              disabled={!canSend}
                              className={`w-full rounded-2xl px-4 py-3 text-xs font-black transition ${
                                canSend
                                  ? "green-button"
                                  : "cursor-not-allowed border border-red-400/30 bg-red-950/30 text-red-100"
                              }`}
                            >
                              إرسال رسالة مخصصة
                            </button>
                          </form>

                          <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                            <summary className="cursor-pointer text-xs font-black text-[#f3dfac]">
                              معاينة الرسالة
                            </summary>
                            <pre className="mt-3 whitespace-pre-wrap break-words text-xs font-bold leading-6 text-[#d7ddd5]">
                              {preview}
                            </pre>
                          </details>

                          <Link
                            href={`/admin/applications/${app.id}`}
                            className="text-center text-xs font-black text-[#f3dfac] underline"
                          >
                            فتح الطلب
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredApplications.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-sm font-black text-[#cbd6cb]">
                      لا يوجد نتائج حسب الفلتر الحالي.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
