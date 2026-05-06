import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SearchParams = Promise<{
  phone?: string;
  tracking?: string;
}>;

type Application = {
  id: string;
  created_at: string | null;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  status?: string | null;
  payment_status?: string | null;

  device_name?: string | null;
  device_price?: number | string | null;
  installment_months?: number | string | null;
  down_payment?: number | string | null;
  monthly_payment?: number | string | null;
  total_with_interest?: number | string | null;
  payment_reference?: string | null;
  paid_clicked_at?: string | null;
};

function normalizePhone(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function maskName(name: string | null | undefined) {
  if (!name) return "—";

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return `${parts[0].slice(0, 1)}***`;
  }

  return `${parts[0]} ${parts[1]?.slice(0, 1) || ""}***`;
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

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) return String(value);

  return `${numberValue.toFixed(2)} د.أ`;
}

function translateStatus(status: string | null | undefined) {
  switch (status) {
    case "submitted":
      return "تم استلام الطلب";
    case "pending_payment":
      return "بانتظار دفع رسوم فتح الملف";
    case "pending_payment_confirmation":
      return "بانتظار تأكيد الدفع";
    case "under_review":
      return "قيد الدراسة";
    case "approved":
      return "موافق عليه مبدئيًا";
    case "rejected":
      return "غير موافق عليه";
    case "cancelled":
      return "ملغي";
    default:
      return "قيد المتابعة";
  }
}

function translatePaymentStatus(status: string | null | undefined) {
  switch (status) {
    case "not_paid":
      return "لم يتم الدفع";
    case "pending":
      return "بانتظار الدفع";
    case "pending_payment":
      return "بانتظار الدفع";
    case "customer_claimed_paid":
      return "تم تسجيل الدفع بانتظار تأكيد الإدارة";
    case "confirmed":
      return "تم تأكيد الدفع";
    case "rejected":
      return "الدفع غير مؤكد";
    default:
      return "قيد المتابعة";
  }
}

function getCustomerMessage(app: Application) {
  if (app.payment_status === "customer_claimed_paid") {
    return "تم تسجيل رقم الوصل/الحركة بنجاح. طلبك الآن بانتظار تأكيد الإدارة للدفع، وبعدها يتم تحويله إلى مرحلة الدراسة.";
  }

  if (app.payment_status === "confirmed" && app.status === "under_review") {
    return "تم تأكيد رسوم فتح الملف، وطلبك الآن قيد الدراسة. مدة المراجعة المتوقعة من 1 إلى 24 ساعة.";
  }

  switch (app.status) {
    case "submitted":
    case "pending_payment":
      return "طلبك مسجل لدينا. الرجاء دفع رسوم فتح الملف وإدخال رقم الوصل/الحركة حتى يتم تحويل الطلب للمراجعة.";
    case "pending_payment_confirmation":
      return "تم تسجيل إشعار الدفع، وبانتظار تأكيد الإدارة.";
    case "under_review":
      return "طلبك قيد الدراسة حاليًا. سيتم التواصل معك عند صدور القرار.";
    case "approved":
      return "تمت الموافقة المبدئية على طلبك. سيتم التواصل معك لاستكمال الإجراءات والتسليم من مكاتبنا بعد توقيع العقد.";
    case "rejected":
      return "نعتذر، لم تتم الموافقة على الطلب حاليًا. يمكنك مراجعة الإدارة لمعرفة التفاصيل العامة.";
    case "cancelled":
      return "تم إلغاء هذا الطلب. إذا كان الإلغاء بالخطأ، يرجى التواصل مع الإدارة.";
    default:
      return "طلبك قيد المتابعة. يرجى مراجعة الحالة لاحقًا.";
  }
}

function badgeClass(status: string | null | undefined) {
  switch (status) {
    case "approved":
    case "confirmed":
      return "border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]";
    case "rejected":
      return "border-red-400/30 bg-red-950/25 text-red-200";
    case "pending_payment_confirmation":
    case "customer_claimed_paid":
    case "pending_payment":
    case "pending":
      return "border-[rgba(214,181,107,0.32)] bg-[rgba(214,181,107,0.10)] text-[#f3dfac]";
    case "under_review":
      return "border-sky-300/25 bg-sky-950/20 text-sky-200";
    case "cancelled":
      return "border-white/10 bg-white/5 text-[#c7d2c7]";
    default:
      return "border-white/10 bg-white/5 text-[#d7ddd5]";
  }
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="stat-chip rounded-2xl px-4 py-4">
      <p className="mb-1 text-xs font-bold text-[#aeb9af]">{label}</p>

      <p className="break-words text-sm font-black text-white">
        {value === null || value === undefined || value === "" ? "—" : value}
      </p>
    </div>
  );
}

export default async function TrackPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = await searchParams;

  const phone = normalizePhone(params?.phone || "");
  const tracking = (params?.tracking || "").trim();

  let application: Application | null = null;
  let errorMessage = "";

  if (phone || tracking) {
    if (!phone || !tracking) {
      errorMessage = "الرجاء إدخال رقم الهاتف ورقم التتبع معًا.";
    } else if (!/^07[789]\d{7}$/.test(phone)) {
      errorMessage =
        "رقم الهاتف غير صحيح. يجب أن يبدأ بـ 079 أو 078 أو 077 ويتكون من 10 أرقام.";
    } else {
      const { data, error } = await supabaseAdmin
        .from("applications")
        .select(
          `
          id,
          created_at,
          tracking_id,
          full_name,
          phone,
          status,
          payment_status,
          device_name,
          device_price,
          installment_months,
          down_payment,
          monthly_payment,
          total_with_interest,
          payment_reference,
          paid_clicked_at
        `
        )
        .eq("phone", phone)
        .eq("tracking_id", tracking)
        .maybeSingle();

      if (error) {
        errorMessage = "حدث خطأ أثناء البحث عن الطلب. حاول مرة أخرى.";
      } else if (!data) {
        errorMessage =
          "لم يتم العثور على طلب مطابق. تأكد من رقم الهاتف ورقم التتبع.";
      } else {
        application = data as Application;
      }
    }
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-x-hidden px-4 py-10 text-[#f7f3e8]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute left-[-110px] top-[260px] h-[300px] w-[300px] rounded-full bg-[#3fae65]/10 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[22%] h-[280px] w-[280px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl">
        <header className="mb-6 text-center">
          <Link
            href="/"
            className="soft-button mb-5 inline-flex rounded-2xl px-4 py-2 text-sm font-black shadow-sm transition"
          >
            الرجوع للرئيسية
          </Link>

          <div className="site-shell pattern-lines rounded-[32px] p-1 shadow-2xl">
            <div className="rounded-[30px] border border-[rgba(214,181,107,0.14)] px-6 py-8">
              <p className="gold-chip mx-auto mb-4 inline-flex rounded-full px-4 py-2 text-xs font-black">
                متابعة حالة الطلب خطوة بخطوة
              </p>

              <h1 className="text-4xl font-black text-white">
                تتبع طلب التمويل
              </h1>

              <p className="mx-auto mt-4 max-w-2xl text-sm font-bold leading-8 text-[#cbd6cb]">
                أدخل رقم الهاتف المستخدم في الطلب مع رقم التتبع لمعرفة آخر حالة
                للطلب، حالة الدفع، وتفاصيل الجهاز والتقسيط.
              </p>
            </div>
          </div>
        </header>

        <section className="glass-panel gold-outline rounded-[32px] p-6 shadow-xl">
          <form className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-black text-[#f3dfac]">
                رقم الهاتف
              </label>

              <input
                name="phone"
                defaultValue={phone}
                inputMode="numeric"
                placeholder="079XXXXXXX"
                className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-4 text-right text-white outline-none transition placeholder:text-[#8d998f] focus:border-[#d6b56b] focus:ring-4 focus:ring-[#d6b56b]/10"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-[#f3dfac]">
                رقم التتبع
              </label>

              <input
                name="tracking"
                defaultValue={tracking}
                placeholder="AM-XXXXXXXXXXXX"
                className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-4 text-right text-white outline-none transition placeholder:text-[#8d998f] focus:border-[#d6b56b] focus:ring-4 focus:ring-[#d6b56b]/10"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="green-button w-full rounded-2xl px-5 py-4 text-base font-black shadow-lg transition"
              >
                تتبع الطلب
              </button>
            </div>
          </form>
        </section>

        {errorMessage && (
          <section className="mt-5 rounded-[24px] border border-red-400/30 bg-red-950/25 p-5 text-sm font-bold leading-8 text-red-200">
            {errorMessage}
          </section>
        )}

        {application && (
          <section className="glass-panel gold-outline mt-6 rounded-[32px] p-6 shadow-xl">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="gold-text mb-1 text-sm font-black">
                  نتيجة التتبع
                </p>

                <h2 className="break-words text-2xl font-black text-white">
                  {application.tracking_id}
                </h2>
              </div>

              <span
                className={`inline-flex rounded-full border px-4 py-2 text-sm font-black ${badgeClass(
                  application.status
                )}`}
              >
                {translateStatus(application.status)}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <InfoItem label="الاسم" value={maskName(application.full_name)} />
              <InfoItem
                label="تاريخ الطلب"
                value={formatDate(application.created_at)}
              />
              <InfoItem
                label="حالة الطلب"
                value={translateStatus(application.status)}
              />
              <InfoItem
                label="حالة الدفع"
                value={translatePaymentStatus(application.payment_status)}
              />
            </div>

            <div className="mt-5 rounded-3xl border border-[rgba(214,181,107,0.18)] bg-[rgba(214,181,107,0.07)] p-5">
              <h3 className="gold-text mb-2 text-base font-black">
                ملاحظة الحالة
              </h3>

              <p className="text-sm font-bold leading-8 text-[#d7ddd5]">
                {getCustomerMessage(application)}
              </p>
            </div>

            <div className="glass-panel-strong mt-6 rounded-[28px] p-5 shadow-sm">
              <h3 className="gold-text mb-4 text-xl font-black">
                تفاصيل الجهاز والتقسيط
              </h3>

              {application.device_name ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoItem label="الجهاز" value={application.device_name} />
                  <InfoItem
                    label="سعر الجهاز"
                    value={formatMoney(application.device_price)}
                  />
                  <InfoItem
                    label="مدة التقسيط"
                    value={
                      application.installment_months
                        ? `${application.installment_months} شهر`
                        : "—"
                    }
                  />
                  <InfoItem
                    label="الدفعة الأولى"
                    value={formatMoney(application.down_payment)}
                  />
                  <InfoItem
                    label="القسط الشهري التقريبي"
                    value={formatMoney(application.monthly_payment)}
                  />
                  <InfoItem
                    label="الإجمالي مع الفائدة"
                    value={formatMoney(application.total_with_interest)}
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[rgba(214,181,107,0.22)] bg-[rgba(255,255,255,0.035)] p-6 text-center">
                  <p className="text-sm font-bold leading-7 text-[#cbd6cb]">
                    هذا الطلب لا يحتوي على جهاز محدد من صفحة المنتجات.
                  </p>

                  <Link
                    href="/products"
                    className="gold-button mt-4 inline-flex rounded-2xl px-5 py-3 text-sm font-black transition"
                  >
                    تصفح المنتجات
                  </Link>
                </div>
              )}
            </div>

            <div className="glass-panel-strong mt-6 rounded-[28px] p-5 shadow-sm">
              <h3 className="gold-text mb-4 text-xl font-black">
                معلومات الدفع
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <InfoItem
                  label="رقم الوصل / الحركة"
                  value={application.payment_reference}
                />

                <InfoItem
                  label="وقت تسجيل الدفع"
                  value={formatDate(application.paid_clicked_at)}
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}