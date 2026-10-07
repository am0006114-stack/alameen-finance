import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  countOperationalDaysElapsed,
  formatOperationalDate,
  iphone18DeliveryCalendar,
  isIphone18Device,
  OPERATIONAL_CALENDAR_RULE,
  IPHONE18_DELIVERY_CALENDAR_RULE,
} from "@/app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar";

type ApplicationRow = {
  id: string;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  device_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_confirmed_at?: string | null;
  created_at?: string | null;
};

type LedgerRow = {
  application_id?: string | null;
  event_type?: string | null;
  created_at?: string | null;
};

function paymentConfirmed(app: ApplicationRow) {
  return Boolean(app.payment_confirmed_at) || String(app.payment_status || "").toLowerCase() === "confirmed";
}

function statusLabel(value: string | null | undefined) {
  const v = String(value || "").toLowerCase();
  if (v === "approved") return "موافقة نهائية";
  if (v === "under_review") return "قيد الدراسة النهائية";
  if (v === "preliminary_qualified") return "موافقة مبدئية";
  if (v === "pending_payment_confirmation") return "وصل بانتظار التأكيد";
  if (v === "customer_confirmed_continue") return "بانتظار رسوم فتح الملف";
  return value || "غير محدد";
}

function reviewState(app: ApplicationRow) {
  if (String(app.status || "").toLowerCase() !== "under_review" || !paymentConfirmed(app)) return null;
  const elapsed = countOperationalDaysElapsed(app.payment_confirmed_at);
  if (elapsed === null) return { label: "تاريخ بداية الدراسة غير موثق", urgent: true, days: null };
  if (elapsed <= 3) return { label: `ضمن المدة الطبيعية — ${elapsed} يوم تشغيلي مضى`, urgent: false, days: elapsed };
  return { label: `متجاوز المدة الطبيعية — ${elapsed} أيام تشغيلية`, urgent: true, days: elapsed };
}

export default async function OperationsCalendarPage() {
  if (!(await isAdminLoggedIn())) redirect("/admin/login");

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,full_name,phone,device_name,status,payment_status,payment_confirmed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) console.error("operations calendar applications query failed", error);
  const applications = (data || []) as ApplicationRow[];
  const relevant = applications.filter((app) => {
    const status = String(app.status || "").toLowerCase();
    return status === "under_review" || (isIphone18Device(app.device_name) && paymentConfirmed(app) && status === "approved");
  });

  const ids = relevant.map((app) => app.id);
  let ledgerRows: LedgerRow[] = [];
  if (ids.length) {
    const { data: ledger, error: ledgerError } = await supabaseAdmin
      .from("whatsapp_v3_notification_ledger")
      .select("application_id,event_type,created_at")
      .in("application_id", ids)
      .eq("event_type", "final_approval_recorded")
      .order("created_at", { ascending: false });
    if (ledgerError) console.error("operations calendar approval ledger query failed", ledgerError);
    ledgerRows = (ledger || []) as LedgerRow[];
  }

  const finalApprovalByApplication = new Map<string, string>();
  for (const row of ledgerRows) {
    if (row.application_id && row.created_at && !finalApprovalByApplication.has(row.application_id)) {
      finalApprovalByApplication.set(row.application_id, row.created_at);
    }
  }

  const rows = relevant.map((app) => {
    const review = reviewState(app);
    const delivery = iphone18DeliveryCalendar({
      deviceName: app.device_name,
      paymentConfirmed: paymentConfirmed(app),
      status: app.status,
      finalApprovalAt: finalApprovalByApplication.get(app.id) || null,
    });
    const priority = delivery.state === "delivery_due" ? 0 : review?.urgent ? 1 : delivery.state === "approval_date_missing" ? 2 : 3;
    return { app, review, delivery, priority };
  }).sort((a, b) => a.priority - b.priority);

  const paidIphone18Waiting = applications.filter((app) => isIphone18Device(app.device_name) && paymentConfirmed(app) && String(app.status || "").toLowerCase() !== "approved").length;
  const reviewOverdue = rows.filter((row) => row.review?.urgent).length;
  const deliveryDue = rows.filter((row) => row.delivery.state === "delivery_due").length;

  return (
    <main dir="rtl" className="min-h-screen px-4 py-8 text-[#f7f3e8]">
      <div className="mx-auto max-w-7xl">
        <header className="site-shell pattern-lines mb-6 rounded-[32px] p-6 shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="gold-text text-sm font-black">الأمين للأقساط</p>
              <h1 className="mt-2 text-3xl font-black text-white">تقويم التشغيل والدراسة والتسليم</h1>
              <p className="mt-3 max-w-4xl text-sm font-bold leading-7 text-[#cbd6cb]">{OPERATIONAL_CALENDAR_RULE}</p>
              <p className="mt-2 max-w-4xl text-sm font-bold leading-7 text-[#f3dfac]">{IPHONE18_DELIVERY_CALENDAR_RULE}</p>
            </div>
            <Link href="/admin" className="soft-button inline-flex rounded-2xl px-5 py-3 text-sm font-black">رجوع للطلبات</Link>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="glass-panel rounded-3xl border border-amber-300/25 p-5">
            <p className="text-xs font-black text-[#aeb9af]">iPhone 18 مدفوع / قيد الدراسة</p>
            <p className="mt-2 text-3xl font-black text-white">{paidIphone18Waiting}</p>
            <p className="mt-2 text-xs font-bold leading-6 text-[#cbd6cb]">ظاهر للتنبيه، لكن عداد شهر التسليم لا يبدأ قبل الموافقة النهائية.</p>
          </div>
          <div className="glass-panel rounded-3xl border border-red-300/25 p-5">
            <p className="text-xs font-black text-[#aeb9af]">دراسة تجاوزت 3 أيام تشغيلية</p>
            <p className="mt-2 text-3xl font-black text-white">{reviewOverdue}</p>
            <p className="mt-2 text-xs font-bold leading-6 text-[#cbd6cb]">الجمعة والسبت لا يدخلان بالحسبة.</p>
          </div>
          <div className="glass-panel rounded-3xl border border-emerald-300/25 p-5">
            <p className="text-xs font-black text-[#aeb9af]">iPhone 18 استحق التسليم</p>
            <p className="mt-2 text-3xl font-black text-white">{deliveryDue}</p>
            <p className="mt-2 text-xs font-bold leading-6 text-[#cbd6cb]">أي استحقاق يصادف جمعة/سبت ينتقل لأول يوم تشغيل تالٍ.</p>
          </div>
        </section>

        <section className="glass-panel gold-outline rounded-[32px] p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="gold-text text-xl font-black">المتابعة التشغيلية</h2>
            <span className="text-xs font-bold text-[#aeb9af]">{rows.length} طلب</span>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm font-bold text-[#cbd6cb]">لا توجد حالات تحتاج عرضًا في التقويم الآن.</div>
          ) : (
            <div className="grid gap-3">
              {rows.map(({ app, review, delivery }) => {
                const finalApprovalAt = finalApprovalByApplication.get(app.id) || null;
                let deliveryText = "—";
                if (isIphone18Device(app.device_name) && paymentConfirmed(app)) {
                  if (delivery.state === "awaiting_final_approval") deliveryText = "مدفوع — بانتظار الموافقة النهائية؛ عداد شهر التسليم لم يبدأ";
                  if (delivery.state === "approval_date_missing") deliveryText = "موافقة نهائية موجودة لكن تاريخ الموافقة غير موثق في تقويم التشغيل";
                  if (delivery.state === "within_delivery_window") deliveryText = `ضمن فترة التسليم — الاستحقاق ${formatOperationalDate(delivery.dueDate)}`;
                  if (delivery.state === "delivery_due") deliveryText = `استحق التسليم — الموعد التشغيلي ${formatOperationalDate(delivery.dueDate)}`;
                }
                return (
                  <div key={app.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_1fr_auto] lg:items-center">
                      <div>
                        <Link href={`/admin/applications/${app.id}`} className="font-black text-white underline decoration-[#d6b56b]/50 underline-offset-4">{app.tracking_id || app.id}</Link>
                        <p className="mt-1 text-sm font-bold text-[#d7ddd5]">{app.full_name || "—"}</p>
                        <p className="mt-1 text-xs font-bold text-[#aeb9af]">{app.device_name || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-black text-[#aeb9af]">الدراسة</p>
                        <p className={`mt-1 text-sm font-black ${review?.urgent ? "text-red-200" : "text-sky-200"}`}>{review?.label || statusLabel(app.status)}</p>
                        {app.payment_confirmed_at && <p className="mt-1 text-xs font-bold text-[#8d998f]">تأكيد الدفع: {formatOperationalDate(app.payment_confirmed_at)}</p>}
                      </div>
                      <div>
                        <p className="text-xs font-black text-[#aeb9af]">تقويم iPhone 18</p>
                        <p className={`mt-1 text-sm font-black ${delivery.state === "delivery_due" ? "text-emerald-200" : delivery.state === "approval_date_missing" ? "text-red-200" : "text-[#f3dfac]"}`}>{deliveryText}</p>
                        {finalApprovalAt && <p className="mt-1 text-xs font-bold text-[#8d998f]">الموافقة النهائية: {formatOperationalDate(finalApprovalAt)}</p>}
                      </div>
                      <div>
                        <span className="inline-flex rounded-full border border-white/10 px-3 py-2 text-xs font-black text-[#d7ddd5]">{statusLabel(app.status)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
