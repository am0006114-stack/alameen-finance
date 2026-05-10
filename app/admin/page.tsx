import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn, clearAdminSession } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    payment?: string;
  }>;
};

type Application = {
  id: string;
  created_at: string | null;
  tracking_id?: string | null;

  full_name?: string | null;
  phone?: string | null;
  national_id?: string | null;

  governorate?: string | null;
  city_area?: string | null;
  detailed_address?: string | null;
  nearest_landmark?: string | null;
  location_latitude?: number | string | null;
  location_longitude?: number | string | null;
  location_accuracy?: number | string | null;
  location_captured_at?: string | null;

  city?: string | null;
  area?: string | null;
  address?: string | null;

  job_title?: string | null;
  employer_name?: string | null;
  salary?: number | string | null;
  has_social_security?: boolean | null;

  device_name?: string | null;
  device_price?: number | string | null;
  down_payment?: number | string | null;
  installment_months?: number | string | null;

  guarantor_name?: string | null;
  guarantor_phone?: string | null;
  guarantor_national_id?: string | null;

  status?: string | null;
  payment_status?: string | null;
};

const STATUS_OPTIONS = [
  { value: "", label: "كل الحالات" },
  { value: "preliminary_application", label: "طلب مبدئي جديد" },
  { value: "preliminary_qualified", label: "مؤهل مبدئياً" },
  { value: "needs_salary_slip", label: "بحاجة كشف راتب" },
  { value: "needs_guarantor", label: "بحاجة كفيل" },
  { value: "guarantor_submitted", label: "تم إدخال الكفيل" },
  { value: "pending_payment_confirmation", label: "بانتظار تأكيد الدفع" },
  { value: "under_review", label: "قيد الدراسة" },
  { value: "approved", label: "مقبول" },
  { value: "rejected", label: "مرفوض" },
  { value: "cancelled", label: "ملغي" },
];

const PAYMENT_OPTIONS = [
  { value: "", label: "كل حالات الخطوات المالية" },
  { value: "not_requested_yet", label: "لم يُطلب الدفع بعد" },
  { value: "not_paid", label: "غير مدفوع" },
  { value: "pending", label: "بانتظار الدفع" },
  { value: "pending_payment", label: "بانتظار الدفع" },
  { value: "customer_claimed_paid", label: "العميل أرسل إشعار الدفع" },
  { value: "confirmed", label: "تم التأكيد" },
  { value: "rejected", label: "الدفع مرفوض" },
];

function formatDate(value: string | null) {
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

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return String(value);
  }

  return `${numberValue.toFixed(2)} د.أ`;
}

function translateStatus(status: string | null | undefined) {
  switch (status) {
    case "preliminary_application":
      return "طلب مبدئي جديد";
    case "preliminary_qualified":
      return "مؤهل مبدئياً";
    case "needs_salary_slip":
      return "بحاجة كشف راتب";
    case "needs_guarantor":
      return "بحاجة كفيل";
    case "guarantor_submitted":
      return "تم إدخال بيانات الكفيل";
    case "submitted":
      return "طلب جديد";
    case "pending_payment":
      return "بانتظار الدفع";
    case "pending_payment_confirmation":
      return "بانتظار تأكيد الدفع";
    case "under_review":
      return "قيد الدراسة";
    case "approved":
      return "مقبول";
    case "rejected":
      return "مرفوض";
    case "cancelled":
      return "ملغي";
    default:
      return status || "غير محدد";
  }
}

function translatePaymentStatus(status: string | null | undefined) {
  switch (status) {
    case "not_requested_yet":
      return "لم يُطلب الدفع بعد";
    case "not_paid":
      return "غير مدفوع";
    case "pending":
      return "بانتظار الدفع";
    case "pending_payment":
      return "بانتظار الدفع";
    case "customer_claimed_paid":
      return "العميل أرسل إشعار الدفع";
    case "confirmed":
      return "تم التأكيد";
    case "rejected":
      return "الدفع مرفوض";
    default:
      return status || "غير محدد";
  }
}

function statusClass(status: string | null | undefined) {
  switch (status) {
    case "approved":
    case "confirmed":
    case "guarantor_submitted":
      return "border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]";
    case "rejected":
      return "border-red-400/30 bg-red-950/25 text-red-200";
    case "preliminary_qualified":
    case "pending_payment_confirmation":
    case "customer_claimed_paid":
    case "pending":
    case "pending_payment":
      return "border-[rgba(214,181,107,0.32)] bg-[rgba(214,181,107,0.10)] text-[#f3dfac]";
    case "needs_salary_slip":
    case "needs_guarantor":
      return "border-purple-300/25 bg-purple-950/25 text-purple-100";
    case "preliminary_application":
    case "not_requested_yet":
    case "under_review":
      return "border-sky-300/25 bg-sky-950/20 text-sky-200";
    case "cancelled":
      return "border-white/10 bg-white/5 text-[#c7d2c7]";
    default:
      return "border-white/10 bg-white/5 text-[#d7ddd5]";
  }
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function hasGpsLocation(app: Application) {
  return Boolean(app.location_latitude && app.location_longitude);
}

function displayGovernorate(app: Application) {
  return app.governorate || app.city || "—";
}

function displayArea(app: Application) {
  return app.city_area || app.area || "—";
}

function isNewApplication(app: Application) {
  return app.status === "preliminary_application" || !app.status;
}

function newApplicationCardClass(app: Application) {
  return isNewApplication(app)
    ? "border-red-400/40 bg-red-950/20 shadow-[0_0_0_1px_rgba(248,113,113,0.18),0_18px_45px_rgba(127,29,29,0.22)]"
    : "";
}

function newApplicationRowClass(app: Application) {
  return isNewApplication(app)
    ? "bg-red-950/20 hover:bg-red-950/30"
    : "hover:bg-[rgba(255,255,255,0.04)]";
}

function filterApplications(
  applications: Application[],
  q: string,
  status: string,
  payment: string
) {
  const search = normalizeSearch(q);

  return applications.filter((app) => {
    const matchesSearch =
      !search ||
      [
        app.tracking_id,
        app.full_name,
        app.phone,
        app.national_id,
        app.guarantor_name,
        app.guarantor_phone,
        app.device_name,
        app.governorate,
        app.city_area,
        app.detailed_address,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));

    const matchesStatus = !status || app.status === status;
    const matchesPayment = !payment || app.payment_status === payment;

    return matchesSearch && matchesStatus && matchesPayment;
  });
}

function buildFilterHref(params: {
  q?: string;
  status?: string;
  payment?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set("q", params.q);
  if (params.status) searchParams.set("status", params.status);
  if (params.payment) searchParams.set("payment", params.payment);

  const queryString = searchParams.toString();

  return queryString ? `/admin?${queryString}` : "/admin";
}

function CompactMobileRequest({ app }: { app: Application }) {
  return (
    <article
      className={`glass-panel gold-outline rounded-2xl p-4 shadow-sm ${newApplicationCardClass(
        app
      )}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[#aeb9af]">رقم التتبع</p>
          <div className="flex items-center gap-2">
            {isNewApplication(app) && (
              <span className="inline-flex rounded-full border border-red-400/40 bg-red-950/40 px-2 py-1 text-[10px] font-black text-red-100">
                🔔 جديد
              </span>
            )}
            <h3 className="truncate text-sm font-black text-white">
              {app.tracking_id || app.id.slice(0, 8)}
            </h3>
          </div>
        </div>

        <Link
          href={`/admin/applications/${app.id}`}
          className="green-button shrink-0 rounded-xl px-3 py-2 text-xs font-black"
        >
          التفاصيل
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-[rgba(214,181,107,0.12)] bg-[rgba(255,255,255,0.035)] px-3 py-2">
          <p className="mb-1 font-bold text-[#aeb9af]">الاسم</p>
          <p className="truncate font-black text-white">
            {app.full_name || "—"}
          </p>
        </div>

        <div className="rounded-xl border border-[rgba(214,181,107,0.12)] bg-[rgba(255,255,255,0.035)] px-3 py-2">
          <p className="mb-1 font-bold text-[#aeb9af]">الهاتف</p>
          <p className="truncate font-black text-white">{app.phone || "—"}</p>
        </div>

        <div className="rounded-xl border border-[rgba(214,181,107,0.12)] bg-[rgba(255,255,255,0.035)] px-3 py-2">
          <p className="mb-1 font-bold text-[#aeb9af]">المحافظة</p>
          <p className="truncate font-black text-white">{displayGovernorate(app)}</p>
        </div>

        <div className="rounded-xl border border-[rgba(214,181,107,0.12)] bg-[rgba(255,255,255,0.035)] px-3 py-2">
          <p className="mb-1 font-bold text-[#aeb9af]">GPS</p>
          <p className="truncate font-black text-white">
            {hasGpsLocation(app) ? "موجود" : "غير محدد"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black ${statusClass(
            app.status
          )}`}
        >
          {translateStatus(app.status)}
        </span>

        <span
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black ${statusClass(
            app.payment_status
          )}`}
        >
          {translatePaymentStatus(app.payment_status)}
        </span>
      </div>
    </article>
  );
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const loggedIn = await isAdminLoggedIn();

  if (!loggedIn) {
    redirect("/admin/login");
  }

  const params = await searchParams;

  const q = params?.q?.trim() || "";
  const selectedStatus = params?.status || "";
  const selectedPayment = params?.payment || "";

  const { data: applications, error } = await supabaseAdmin
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  const safeApplications = (applications || []) as Application[];

  const filteredApplications = filterApplications(
    safeApplications,
    q,
    selectedStatus,
    selectedPayment
  );

  const totalApplications = safeApplications.length;

  const needsActionCount = safeApplications.filter(
    (app) =>
      app.status === "needs_salary_slip" ||
      app.status === "needs_guarantor" ||
      app.payment_status === "customer_claimed_paid" ||
      app.status === "pending_payment_confirmation"
  ).length;

  const preliminaryCount = safeApplications.filter(
    (app) => app.status === "preliminary_application" || !app.status
  ).length;

  const qualifiedCount = safeApplications.filter(
    (app) => app.status === "preliminary_qualified"
  ).length;

  const approvedCount = safeApplications.filter(
    (app) => app.status === "approved"
  ).length;

  async function logoutAction() {
    "use server";

    await clearAdminSession();
    redirect("/admin/login");
  }

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden px-3 py-5 text-[#f7f3e8] sm:px-4 sm:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute left-[-110px] top-[280px] h-[300px] w-[300px] rounded-full bg-[#3fae65]/10 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[25%] h-[280px] w-[280px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <header className="site-shell pattern-lines mb-6 rounded-[28px] p-1 shadow-xl sm:mb-8 sm:rounded-[32px]">
          <div className="rounded-[26px] border border-[rgba(214,181,107,0.14)] p-5 sm:rounded-[30px] sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="gold-chip mb-3 inline-flex rounded-full px-4 py-2 text-xs font-black">
                  لوحة تحكم الإدارة
                </p>

                <h1 className="text-2xl font-black text-white sm:text-3xl">
                  الأمين للأقساط
                </h1>

                <p className="mt-2 text-sm font-bold leading-7 text-[#cbd6cb]">
                  إدارة طلبات الموافقة المبدئية، مراجعة العملاء، وإرسال الإجراءات المطلوبة عبر واتساب.
                </p>
              </div>

              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full rounded-2xl border border-red-400/30 bg-red-950/25 px-5 py-3 text-sm font-black text-red-200 transition hover:bg-red-950/40 md:w-auto"
                >
                  تسجيل خروج
                </button>
              </form>
            </div>
          </div>
        </header>

        {error && (
          <section className="mb-6 rounded-[24px] border border-red-400/30 bg-red-950/25 p-5 text-red-200">
            <h2 className="mb-2 text-lg font-black">
              صار خطأ أثناء جلب الطلبات
            </h2>
            <p className="text-sm leading-7">{error.message}</p>
          </section>
        )}

        <section className="grid gap-3 sm:gap-4 md:grid-cols-5">
          <StatBox label="إجمالي الطلبات" value={totalApplications} />
          <StatBox label="🔔 طلبات جديدة" value={preliminaryCount} />
          <StatBox label="بحاجة إجراء" value={needsActionCount} />
          <StatBox label="مؤهلين مبدئياً" value={qualifiedCount} />
          <StatBox label="طلبات مقبولة" value={approvedCount} />
        </section>

        <section className="glass-panel gold-outline sticky top-3 z-20 mt-5 rounded-[28px] p-4 shadow-xl backdrop-blur sm:mt-6 sm:rounded-[32px] sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-black text-white">البحث والفلترة</h2>
            <p className="mt-1 text-xs font-bold leading-6 text-[#aeb9af]">
              ابحث بالاسم، الهاتف، رقم التتبع، الرقم الوطني، المحافظة أو الجهاز.
            </p>
          </div>

          <form className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
            <input
              name="q"
              defaultValue={q}
              placeholder="بحث سريع..."
              className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-3 text-right text-sm font-bold text-white outline-none transition placeholder:text-[#8d998f] focus:border-[#d6b56b] focus:ring-4 focus:ring-[#d6b56b]/10"
            />

            <select
              name="status"
              defaultValue={selectedStatus}
              className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-[#d6b56b] focus:ring-4 focus:ring-[#d6b56b]/10"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "all-status"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              name="payment"
              defaultValue={selectedPayment}
              className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-[#d6b56b] focus:ring-4 focus:ring-[#d6b56b]/10"
            >
              {PAYMENT_OPTIONS.map((option) => (
                <option key={option.value || "all-payment"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2 lg:flex">
              <button
                type="submit"
                className="green-button rounded-2xl px-5 py-3 text-sm font-black transition"
              >
                تطبيق
              </button>

              <Link
                href="/admin"
                className="soft-button rounded-2xl px-5 py-3 text-center text-sm font-black transition"
              >
                مسح
              </Link>
            </div>
          </form>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <QuickFilter href="/admin" label="الكل" variant="neutral" />

            <QuickFilter
              href={buildFilterHref({
                q,
                status: "preliminary_application",
                payment: selectedPayment,
              })}
              label="مبدئية جديدة"
              variant="blue"
            />

            <QuickFilter
              href={buildFilterHref({
                q,
                status: "preliminary_qualified",
                payment: selectedPayment,
              })}
              label="مؤهلين"
              variant="gold"
            />

            <QuickFilter
              href={buildFilterHref({
                q,
                status: "needs_salary_slip",
                payment: selectedPayment,
              })}
              label="كشف راتب"
              variant="purple"
            />

            <QuickFilter
              href={buildFilterHref({
                q,
                status: "needs_guarantor",
                payment: selectedPayment,
              })}
              label="كفيل"
              variant="purple"
            />

            <QuickFilter
              href={buildFilterHref({
                q,
                status: "under_review",
                payment: selectedPayment,
              })}
              label="قيد الدراسة"
              variant="blue"
            />

            <QuickFilter
              href={buildFilterHref({
                q,
                status: "approved",
                payment: selectedPayment,
              })}
              label="مقبولة"
              variant="green"
            />

            <QuickFilter
              href={buildFilterHref({
                q,
                status: "rejected",
                payment: selectedPayment,
              })}
              label="مرفوضة"
              variant="red"
            />
          </div>
        </section>

        <section className="glass-panel gold-outline mt-5 rounded-[28px] p-4 shadow-xl sm:mt-6 sm:rounded-[32px] sm:p-6">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-white">آخر الطلبات</h2>
              <p className="mt-2 text-sm font-bold text-[#aeb9af]">
                النتائج المعروضة: {filteredApplications.length} من أصل{" "}
                {totalApplications}
              </p>
            </div>
          </div>

          {filteredApplications.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[rgba(214,181,107,0.22)] bg-[rgba(255,255,255,0.035)] p-10 text-center">
              <h3 className="text-lg font-black text-white">
                لا توجد نتائج مطابقة
              </h3>
              <p className="mt-2 text-sm font-bold text-[#aeb9af]">
                جرّب تغيير كلمة البحث أو إزالة الفلاتر.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:hidden">
                {filteredApplications.map((app) => (
                  <CompactMobileRequest key={app.id} app={app} />
                ))}
              </div>

              <div className="hidden md:block">
                <div className="overflow-hidden rounded-3xl border border-[rgba(214,181,107,0.14)]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1200px] border-collapse text-right">
                      <thead className="bg-[rgba(3,18,14,0.86)] text-white">
                        <tr>
                          <th className="px-4 py-4 text-sm font-black">
                            رقم التتبع
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            الاسم
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            الهاتف
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            المحافظة
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            GPS
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            الراتب
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            الجهاز
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            حالة الطلب
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            حالة الدفع
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            التاريخ
                          </th>
                          <th className="px-4 py-4 text-sm font-black">
                            إجراء
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredApplications.map((app) => (
                          <tr
                            key={app.id}
                            className={`border-b border-[rgba(214,181,107,0.10)] transition ${newApplicationRowClass(
                              app
                            )}`}
                          >
                            <td className="px-4 py-4 text-sm font-black text-white">
                              <div className="flex items-center gap-2">
                                {isNewApplication(app) && (
                                  <span className="inline-flex rounded-full border border-red-400/40 bg-red-950/40 px-2 py-1 text-[10px] font-black text-red-100">
                                    🔔 جديد
                                  </span>
                                )}
                                <span>{app.tracking_id || app.id.slice(0, 8)}</span>
                              </div>
                            </td>

                            <td className="px-4 py-4 text-sm font-bold text-[#d7ddd5]">
                              {app.full_name || "—"}
                            </td>

                            <td className="px-4 py-4 text-sm text-[#cbd6cb]">
                              {app.phone || "—"}
                            </td>

                            <td className="px-4 py-4 text-sm text-[#cbd6cb]">
                              {displayGovernorate(app)}
                              {displayArea(app) !== "—" ? ` / ${displayArea(app)}` : ""}
                            </td>

                            <td className="px-4 py-4 text-sm">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                                  hasGpsLocation(app)
                                    ? "border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]"
                                    : "border-white/10 bg-white/5 text-[#aeb9af]"
                                }`}
                              >
                                {hasGpsLocation(app) ? "موجود" : "لا يوجد"}
                              </span>
                            </td>

                            <td className="px-4 py-4 text-sm font-bold text-[#d7ddd5]">
                              {formatMoney(app.salary)}
                            </td>

                            <td className="px-4 py-4 text-sm text-[#cbd6cb]">
                              {app.device_name || "—"}
                            </td>

                            <td className="px-4 py-4 text-sm">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(
                                  app.status
                                )}`}
                              >
                                {translateStatus(app.status)}
                              </span>
                            </td>

                            <td className="px-4 py-4 text-sm">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(
                                  app.payment_status
                                )}`}
                              >
                                {translatePaymentStatus(app.payment_status)}
                              </span>
                            </td>

                            <td className="px-4 py-4 text-sm text-[#aeb9af]">
                              {formatDate(app.created_at)}
                            </td>

                            <td className="px-4 py-4 text-sm">
                              <Link
                                href={`/admin/applications/${app.id}`}
                                className="green-button inline-flex rounded-2xl px-4 py-2 text-xs font-black transition"
                              >
                                التفاصيل
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-chip rounded-[24px] p-5 shadow-lg sm:rounded-[28px] sm:p-6">
      <p className="text-sm font-bold text-[#aeb9af]">{label}</p>
      <h2 className="mt-3 text-4xl font-black text-white">{value}</h2>
    </div>
  );
}

function QuickFilter({
  href,
  label,
  variant,
}: {
  href: string;
  label: string;
  variant: "neutral" | "gold" | "blue" | "green" | "red" | "purple";
}) {
  const classes = {
    neutral: "border-white/10 bg-white/5 text-[#d7ddd5]",
    gold: "border-[rgba(214,181,107,0.32)] bg-[rgba(214,181,107,0.10)] text-[#f3dfac]",
    blue: "border-sky-300/25 bg-sky-950/20 text-sky-200",
    green: "border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]",
    red: "border-red-400/30 bg-red-950/25 text-red-200",
    purple: "border-purple-300/25 bg-purple-950/25 text-purple-100",
  };

  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black ${classes[variant]}`}
    >
      {label}
    </Link>
  );
}