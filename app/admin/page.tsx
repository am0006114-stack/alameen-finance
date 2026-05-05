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
  { value: "submitted", label: "طلب جديد" },
  { value: "pending_payment", label: "بانتظار الدفع" },
  { value: "pending_payment_confirmation", label: "بانتظار تأكيد الدفع" },
  { value: "under_review", label: "قيد الدراسة" },
  { value: "approved", label: "مقبول" },
  { value: "rejected", label: "مرفوض" },
  { value: "cancelled", label: "ملغي" },
];

const PAYMENT_OPTIONS = [
  { value: "", label: "كل حالات الدفع" },
  { value: "not_paid", label: "غير مدفوع" },
  { value: "pending", label: "بانتظار الدفع" },
  { value: "pending_payment", label: "بانتظار الدفع" },
  { value: "customer_claimed_paid", label: "العميل ضغط تم الدفع" },
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
    case "not_paid":
      return "غير مدفوع";
    case "pending":
      return "بانتظار الدفع";
    case "pending_payment":
      return "بانتظار الدفع";
    case "customer_claimed_paid":
      return "العميل ضغط تم الدفع";
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
      return "bg-green-50 text-green-700 border-green-200";
    case "rejected":
      return "bg-red-50 text-red-700 border-red-200";
    case "pending_payment_confirmation":
    case "customer_claimed_paid":
    case "pending":
    case "pending_payment":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "under_review":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "cancelled":
      return "bg-gray-100 text-gray-600 border-gray-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
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
    <article className="rounded-2xl border border-[#eadfce] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-gray-400">رقم التتبع</p>
          <h3 className="truncate text-sm font-black text-[#111827]">
            {app.tracking_id || app.id.slice(0, 8)}
          </h3>
        </div>

        <Link
          href={`/admin/applications/${app.id}`}
          className="shrink-0 rounded-xl bg-[#111827] px-3 py-2 text-xs font-black text-white"
        >
          التفاصيل
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="mb-1 font-bold text-gray-400">الاسم</p>
          <p className="truncate font-black text-gray-800">
            {app.full_name || "—"}
          </p>
        </div>

        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="mb-1 font-bold text-gray-400">الهاتف</p>
          <p className="truncate font-black text-gray-800">
            {app.phone || "—"}
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

  const pendingPaymentCount = safeApplications.filter(
    (app) =>
      app.payment_status === "customer_claimed_paid" ||
      app.status === "pending_payment_confirmation"
  ).length;

  const approvedCount = safeApplications.filter(
    (app) => app.status === "approved"
  ).length;

  const newCount = safeApplications.filter(
    (app) =>
      app.status === "submitted" ||
      app.status === "pending_payment" ||
      !app.status
  ).length;

  async function logoutAction() {
    "use server";

    await clearAdminSession();
    redirect("/admin/login");
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#f6f3ee] px-3 py-5 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[28px] border border-[#eadfce] bg-white p-5 shadow-xl sm:mb-8 sm:rounded-[32px] sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-sm font-bold text-gray-400">لوحة تحكم</p>

              <h1 className="text-2xl font-black text-[#111827] sm:text-3xl">
                الأمين للأقساط
              </h1>

              <p className="mt-2 text-sm leading-7 text-gray-500">
                إدارة طلبات التمويل، متابعة الدفع، ومراجعة حالات العملاء.
              </p>
            </div>

            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-100 md:w-auto"
              >
                تسجيل خروج
              </button>
            </form>
          </div>
        </header>

        {error && (
          <section className="mb-6 rounded-[24px] border border-red-200 bg-red-50 p-5 text-red-700">
            <h2 className="mb-2 text-lg font-black">
              صار خطأ أثناء جلب الطلبات
            </h2>
            <p className="text-sm leading-7">{error.message}</p>
          </section>
        )}

        <section className="grid gap-3 sm:gap-4 md:grid-cols-4">
          <div className="rounded-[24px] border border-[#eadfce] bg-white p-5 shadow-lg sm:rounded-[28px] sm:p-6">
            <p className="text-sm font-bold text-gray-400">إجمالي الطلبات</p>
            <h2 className="mt-3 text-4xl font-black text-[#111827]">
              {totalApplications}
            </h2>
          </div>

          <div className="rounded-[24px] border border-[#eadfce] bg-white p-5 shadow-lg sm:rounded-[28px] sm:p-6">
            <p className="text-sm font-bold text-gray-400">الطلبات الجديدة</p>
            <h2 className="mt-3 text-4xl font-black text-[#111827]">
              {newCount}
            </h2>
          </div>

          <div className="rounded-[24px] border border-[#eadfce] bg-white p-5 shadow-lg sm:rounded-[28px] sm:p-6">
            <p className="text-sm font-bold text-gray-400">
              بانتظار تأكيد الدفع
            </p>
            <h2 className="mt-3 text-4xl font-black text-[#111827]">
              {pendingPaymentCount}
            </h2>
          </div>

          <div className="rounded-[24px] border border-[#eadfce] bg-white p-5 shadow-lg sm:rounded-[28px] sm:p-6">
            <p className="text-sm font-bold text-gray-400">طلبات مقبولة</p>
            <h2 className="mt-3 text-4xl font-black text-[#111827]">
              {approvedCount}
            </h2>
          </div>
        </section>

        <section className="sticky top-3 z-20 mt-5 rounded-[28px] border border-[#eadfce] bg-white/95 p-4 shadow-xl backdrop-blur sm:mt-6 sm:rounded-[32px] sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-black text-[#111827]">
              البحث والفلترة
            </h2>
            <p className="mt-1 text-xs leading-6 text-gray-500">
              ابحث بالاسم، الهاتف، رقم التتبع، الرقم الوطني، الكفيل أو الجهاز.
            </p>
          </div>

          <form className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
            <input
              name="q"
              defaultValue={q}
              placeholder="بحث سريع..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold outline-none transition focus:border-[#111827] focus:bg-white"
            />

            <select
              name="status"
              defaultValue={selectedStatus}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold outline-none transition focus:border-[#111827] focus:bg-white"
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
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold outline-none transition focus:border-[#111827] focus:bg-white"
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
                className="rounded-2xl bg-[#111827] px-5 py-3 text-sm font-black text-white transition hover:bg-black"
              >
                تطبيق
              </button>

              <Link
                href="/admin"
                className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-3 text-center text-sm font-black text-gray-700 transition hover:bg-gray-100"
              >
                مسح
              </Link>
            </div>
          </form>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <Link
              href="/admin"
              className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-black text-gray-700"
            >
              الكل
            </Link>

            <Link
              href={buildFilterHref({
                q,
                status: "pending_payment_confirmation",
                payment: selectedPayment,
              })}
              className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-700"
            >
              بانتظار التأكيد
            </Link>

            <Link
              href={buildFilterHref({
                q,
                status: "under_review",
                payment: selectedPayment,
              })}
              className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700"
            >
              قيد الدراسة
            </Link>

            <Link
              href={buildFilterHref({
                q,
                status: "approved",
                payment: selectedPayment,
              })}
              className="shrink-0 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-xs font-black text-green-700"
            >
              مقبولة
            </Link>

            <Link
              href={buildFilterHref({
                q,
                status: "rejected",
                payment: selectedPayment,
              })}
              className="shrink-0 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700"
            >
              مرفوضة
            </Link>
          </div>
        </section>

        <section className="mt-5 rounded-[28px] border border-[#eadfce] bg-white p-4 shadow-xl sm:mt-6 sm:rounded-[32px] sm:p-6">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-[#111827]">آخر الطلبات</h2>
              <p className="mt-2 text-sm text-gray-500">
                النتائج المعروضة: {filteredApplications.length} من أصل{" "}
                {totalApplications}
              </p>
            </div>
          </div>

          {filteredApplications.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
              <h3 className="text-lg font-black text-gray-700">
                لا توجد نتائج مطابقة
              </h3>
              <p className="mt-2 text-sm text-gray-500">
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
                <div className="overflow-hidden rounded-3xl border border-gray-100">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] border-collapse text-right">
                      <thead className="bg-[#111827] text-white">
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
                            المدينة
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
                            className="border-b border-gray-100 transition hover:bg-gray-50"
                          >
                            <td className="px-4 py-4 text-sm font-black text-gray-900">
                              {app.tracking_id || app.id.slice(0, 8)}
                            </td>

                            <td className="px-4 py-4 text-sm font-bold text-gray-800">
                              {app.full_name || "—"}
                            </td>

                            <td className="px-4 py-4 text-sm text-gray-600">
                              {app.phone || "—"}
                            </td>

                            <td className="px-4 py-4 text-sm text-gray-600">
                              {app.city || app.area || "—"}
                            </td>

                            <td className="px-4 py-4 text-sm font-bold text-gray-800">
                              {formatMoney(app.salary)}
                            </td>

                            <td className="px-4 py-4 text-sm text-gray-600">
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

                            <td className="px-4 py-4 text-sm text-gray-500">
                              {formatDate(app.created_at)}
                            </td>

                            <td className="px-4 py-4 text-sm">
                              <Link
                                href={`/admin/applications/${app.id}`}
                                className="inline-flex rounded-2xl bg-[#111827] px-4 py-2 text-xs font-black text-white transition hover:bg-black"
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