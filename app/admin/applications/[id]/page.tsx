import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type ApplicationRecord = {
  id: string;
  created_at?: string | null;
  tracking_id?: string | null;

  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
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

  employer?: string | null;
  employer_name?: string | null;
  job_title?: string | null;
  salary?: number | string | null;

  social_security?: boolean | null;
  has_social_security?: boolean | null;
  applicant_social_security?: boolean | null;
  guarantor_social_security?: boolean | null;
  guarantor_relationship?: string | null;
  eligibility_path?: string | null;

  device_id?: string | null;
  device_name?: string | null;
  device_price?: number | string | null;
  down_payment?: number | string | null;
  installment_months?: number | string | null;
  interest_rate?: number | string | null;
  monthly_payment?: number | string | null;
  total_with_interest?: number | string | null;

  guarantor_name?: string | null;
  guarantor_phone?: string | null;
  guarantor_national_id?: string | null;

  payment_reference?: string | null;
  paid_clicked_at?: string | null;
  payment_deadline?: string | null;

  status?: string | null;
  payment_status?: string | null;
};

type DocumentRecord = {
  id?: string;
  created_at?: string | null;
  application_id?: string | null;
  document_type?: string | null;
  type?: string | null;
  file_url?: string | null;
  public_url?: string | null;
  url?: string | null;
  file_path?: string | null;
  path?: string | null;
  storage_path?: string | null;
  filename?: string | null;
  name?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("ar-JO", {
      dateStyle: "full",
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

function formatPercent(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return String(value);
  }

  return `${(numberValue * 100).toFixed(0)}%`;
}

function yesNo(value: boolean | null | undefined) {
  if (value === true) return "نعم";
  if (value === false) return "لا";
  return "—";
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
      return "العميل أكّد الدفع";
    case "confirmed":
      return "تم تأكيد الدفع";
    case "rejected":
      return "الدفع مرفوض";
    default:
      return status || "غير محدد";
  }
}

function formatPaymentReference(value: string | null | undefined) {
  if (value === "payment_receipt_uploaded") {
    return "تم رفع صورة وصل الدفع";
  }

  return value || "—";
}

function translateEligibilityPath(path: string | null | undefined) {
  switch (path) {
    case "applicant_social_security":
      return "مقدم الطلب مشترك بالضمان";
    case "guarantor_social_security_first_degree":
      return "الكفيل مشترك بالضمان + قرابة مقبولة";
    case "applicant_social_security_optional":
      return "مقدم الطلب اختار الضمان كمعلومة إضافية";
    case "standard_application_no_social_security_required":
      return "طلب عادي — الضمان غير إلزامي";
    default:
      return path || "—";
  }
}

function translateDocumentType(type: string | null | undefined) {
  switch (type) {
    case "applicant_id_front":
    case "applicant_front":
      return "هوية مقدم الطلب - أمامي";
    case "applicant_id_back":
    case "applicant_back":
      return "هوية مقدم الطلب - خلفي";
    case "guarantor_id_front":
    case "guarantor_front":
      return "هوية الكفيل - أمامي";
    case "guarantor_id_back":
    case "guarantor_back":
      return "هوية الكفيل - خلفي";
    case "payment_receipt":
      return "وصل الدفع";
    default:
      return type || "وثيقة";
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
      return "border-white/10 bg-[rgba(255,255,255,0.04)]/5 text-[#c7d2c7]";
    default:
      return "border-white/10 bg-[rgba(255,255,255,0.04)]/5 text-[#d7ddd5]";
  }
}

function normalizeJordanPhoneForWhatsApp(phone: string | null | undefined) {
  if (!phone) return "";

  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("962")) return digits;

  if (digits.startsWith("07") && digits.length === 10) {
    return `962${digits.slice(1)}`;
  }

  if (digits.startsWith("7") && digits.length === 9) {
    return `962${digits}`;
  }

  return digits;
}

function firstName(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";
  return fullName.trim().split(/\s+/)[0] || "عميلنا الكريم";
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function getTrackUrl(app: ApplicationRecord) {
  const baseUrl = getBaseUrl();
  const phone = app.phone || "";
  const tracking = app.tracking_id || "";

  return `${baseUrl}/track?phone=${encodeURIComponent(
    phone
  )}&tracking=${encodeURIComponent(tracking)}`;
}

function getGuarantorUrl(app: ApplicationRecord) {
  const baseUrl = getBaseUrl();
  const phone = app.phone || "";
  const tracking = app.tracking_id || app.id || "";

  return `${baseUrl}/guarantor?tracking=${encodeURIComponent(
    tracking
  )}&phone=${encodeURIComponent(phone)}`;
}

function hasGpsLocation(app: ApplicationRecord) {
  return Boolean(app.location_latitude && app.location_longitude);
}

function getGoogleMapsUrl(app: ApplicationRecord) {
  if (!hasGpsLocation(app)) return "";

  return `https://www.google.com/maps?q=${encodeURIComponent(
    `${app.location_latitude},${app.location_longitude}`
  )}`;
}

function formatGpsAccuracy(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) return String(value);

  return `${Math.round(numberValue)} متر تقريباً`;
}

function makeWhatsAppUrl(phone: string | null | undefined, message: string) {
  const cleanPhone = normalizeJordanPhoneForWhatsApp(phone);

  if (!cleanPhone) return "#";

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

function currentStatusMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

نود إعلامك بأن حالة طلب التمويل الخاص بك لدى الأمين للأقساط هي:

حالة الطلب: ${translateStatus(app.status)}
حالة الدفع: ${translatePaymentStatus(app.payment_status)}
رقم التتبع: ${tracking}

يمكنك متابعة حالة الطلب من خلال الرابط:
${trackUrl}

الأمين للأقساط والتمويل`;
}

function preliminaryPaymentMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

تمت مراجعة طلبك لدى الأمين للأقساط والتمويل، وطلبك مؤهل مبدئياً لاستكمال الدراسة.

يرجى دفع رسوم فتح الملف بقيمة 5 دنانير، ثم إرسال صورة أو سكرين شوت واضح لوصل الدفع عبر واتساب.

رقم التتبع:
${tracking}

معلومات الدفع:
اسم المستفيد: AMEENPAY
اسم المحفظة: Orang-Money
الاسم: ABDUL RAHMAN ALHARAHSHEH

رابط متابعة الطلب:
${trackUrl}

ملاحظة مهمة:
دفع رسوم فتح الملف لا يعني الموافقة النهائية، ويتم استرداد الرسوم عند الموافقة وتوقيع عقد الاستلام.

الأمين للأقساط والتمويل
Al Ameen for Financial Services`;
}
}

function underReviewMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

تم تأكيد رسوم فتح الملف، وتم تحويل طلبك إلى قسم الدراسة.

حالة الطلب الآن: قيد الدراسة
مدة المراجعة المتوقعة: من 1 إلى 24 ساعة.

رقم التتبع: ${tracking}

يمكنك متابعة الطلب من الرابط:
${trackUrl}

الأمين للأقساط والتمويل`;
}

function salarySlipRequestMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

لاستكمال دراسة طلب التمويل الخاص بك لدى الأمين للأقساط والتمويل، نرجو تزويدنا بكشف راتب حديث أو شهادة راتب حديثة صادرة من جهة العمل.

رقم التتبع: ${tracking}

ملاحظات مهمة:
- يجب أن يكون الكشف/الشهادة واضحًا وحديثًا.
- يفضّل أن يحتوي على الاسم، جهة العمل، والراتب الصافي.
- إرسال المستند لا يعني الموافقة النهائية، وإنما لاستكمال دراسة الطلب.

رابط متابعة الطلب:
${trackUrl}

الأمين للأقساط والتمويل`;
}

function guarantorRequestMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const guarantorUrl = getGuarantorUrl(app);

  return `أهلًا ${name}،

بعد مراجعة طلبك لدى الأمين للأقساط والتمويل، نحتاج إلى إضافة كفيل لاستكمال دراسة الملف.

يرجى تعبئة بيانات الكفيل ورفع صور الهوية من خلال الرابط التالي:
${guarantorUrl}

رقم التتبع: ${tracking}

ملاحظة مهمة: طلب الكفيل لا يعني رفض الطلب، وإنما إجراء لاستكمال دراسة الملف حسب سياسة الموافقة.

الأمين للأقساط والتمويل
Al Ameen for Financial Services`;
}

function approvedMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

نود إعلامك بأنه تمت الموافقة المبدئية على طلب التمويل الخاص بك لدى الأمين للأقساط والتمويل.

رقم التتبع: ${tracking}

سيتم التواصل معك لاستكمال الإجراءات النهائية، ويكون التسليم من مكاتبنا بعد توقيع العقد.

رابط متابعة الطلب:
${trackUrl}

الأمين للأقساط والتمويل`;
}

function rejectedMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

نعتذر، بعد مراجعة طلب التمويل الخاص بك، لم تتم الموافقة على الطلب حاليًا.

رقم التتبع: ${tracking}

يمكنك متابعة حالة الطلب من الرابط:
${trackUrl}

الأمين للأقساط والتمويل`;
}

function getDocumentUrl(document: DocumentRecord) {
  if (document.file_url) return document.file_url;
  if (document.public_url) return document.public_url;
  if (document.url) return document.url;

  const storagePath =
    document.file_path || document.path || document.storage_path || "";

  if (!storagePath) return "";

  const { data } = supabaseAdmin.storage
    .from("documents")
    .getPublicUrl(storagePath);

  return data.publicUrl || "";
}

function InfoCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string | number | null | undefined }[];
}) {
  return (
    <section className="glass-panel gold-outline rounded-[28px] p-6 shadow-lg">
      <h2 className="gold-text mb-5 text-xl font-black">{title}</h2>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="stat-chip rounded-2xl px-4 py-3">
            <p className="mb-1 text-xs font-bold text-[#aeb9af]">
              {item.label}
            </p>
            <p className="break-words text-sm font-black text-white">
              {item.value === null ||
              item.value === undefined ||
              item.value === ""
                ? "—"
                : item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhatsAppButton({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-black transition ${className}`}
    >
      {label}
    </a>
  );
}

function StatusActionButton({
  applicationId,
  status,
  paymentStatus,
  label,
  className,
  action,
}: {
  applicationId: string;
  status?: string;
  paymentStatus?: string;
  label: string;
  className: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="applicationId" value={applicationId} />
      {status && <input type="hidden" name="status" value={status} />}
      {paymentStatus && (
        <input type="hidden" name="payment_status" value={paymentStatus} />
      )}
      <button
        type="submit"
        className={`w-full rounded-2xl px-4 py-3 text-sm font-black transition ${className}`}
      >
        {label}
      </button>
    </form>
  );
}

export default async function AdminApplicationDetailsPage({ params }: PageProps) {
  const loggedIn = await isAdminLoggedIn();

  if (!loggedIn) {
    redirect("/admin/login");
  }

  const { id } = await params;

  const { data: application, error: applicationError } = await supabaseAdmin
    .from("applications")
    .select("*")
    .eq("id", id)
    .single();

  if (applicationError || !application) {
    notFound();
  }

  const app = application as ApplicationRecord;

  const { data: documents, error: documentsError } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("application_id", id)
    .order("created_at", { ascending: true });

  const safeDocuments = (documents || []) as DocumentRecord[];

  async function updateApplicationAction(formData: FormData) {
    "use server";

    const applicationId = String(formData.get("applicationId") || "");
    const nextStatus = String(formData.get("status") || "");
    const nextPaymentStatus = String(formData.get("payment_status") || "");

    if (!applicationId) {
      redirect("/admin");
    }

    const updatePayload: {
      status?: string;
      payment_status?: string;
    } = {};

    if (nextStatus) updatePayload.status = nextStatus;
    if (nextPaymentStatus) updatePayload.payment_status = nextPaymentStatus;

    if (Object.keys(updatePayload).length === 0) {
      redirect(`/admin/applications/${applicationId}`);
    }

    await supabaseAdmin
      .from("applications")
      .update(updatePayload)
      .eq("id", applicationId);

    redirect(`/admin/applications/${applicationId}`);
  }

  const hasWhatsAppPhone = Boolean(normalizeJordanPhoneForWhatsApp(app.phone));

  const applicantSocialSecurity =
    app.applicant_social_security ?? app.social_security ?? app.has_social_security;

  const governorate = app.governorate || app.city || "—";
  const area = app.city_area || app.area || "—";
  const address = app.detailed_address || app.address || "—";
  const employer = app.employer || app.employer_name || "—";
  const guarantorUrl = getGuarantorUrl(app);
  const googleMapsUrl = getGoogleMapsUrl(app);

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden px-4 py-8 text-[#f7f3e8]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute left-[-110px] top-[280px] h-[300px] w-[300px] rounded-full bg-[#3fae65]/10 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[25%] h-[280px] w-[280px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <header className="site-shell pattern-lines mb-6 rounded-[32px] p-1 shadow-xl">
          <div className="rounded-[30px] border border-[rgba(214,181,107,0.14)] p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <Link
                  href="/admin"
                  className="soft-button mb-4 inline-flex rounded-2xl px-4 py-2 text-sm font-black transition"
                >
                  رجوع للطلبات
                </Link>

                <p className="gold-text mb-2 text-sm font-black">
                  تفاصيل طلب التمويل
                </p>

                <h1 className="text-3xl font-black text-white">
                  {app.tracking_id || app.id}
                </h1>

                <p className="mt-2 text-sm font-bold leading-7 text-[#cbd6cb]">
                  تاريخ التقديم: {formatDate(app.created_at)}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <span
                  className={`inline-flex rounded-full border px-4 py-2 text-sm font-black ${statusClass(
                    app.status
                  )}`}
                >
                  حالة الطلب: {translateStatus(app.status)}
                </span>

                <span
                  className={`inline-flex rounded-full border px-4 py-2 text-sm font-black ${statusClass(
                    app.payment_status
                  )}`}
                >
                  حالة الدفع: {translatePaymentStatus(app.payment_status)}
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className="glass-panel gold-outline mb-6 rounded-[32px] p-6 shadow-xl">
          <h2 className="gold-text mb-5 text-xl font-black">
            إجراءات الإدارة حسب الفلو الجديد
          </h2>

          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            <StatusActionButton
              applicationId={app.id}
              status="preliminary_qualified"
              paymentStatus="pending"
              label="مؤهل مبدئياً / اطلب الدفع"
              className="gold-button"
              action={updateApplicationAction}
            />

            <StatusActionButton
              applicationId={app.id}
              status="needs_salary_slip"
              label="بحاجة كشف راتب"
              className="border border-purple-300/25 bg-purple-950/30 text-purple-100 hover:bg-purple-950/45"
              action={updateApplicationAction}
            />

            <StatusActionButton
              applicationId={app.id}
              status="needs_guarantor"
              label="بحاجة كفيل"
              className="border border-orange-300/25 bg-orange-950/30 text-orange-100 hover:bg-orange-950/45"
              action={updateApplicationAction}
            />

            <StatusActionButton
              applicationId={app.id}
              status="guarantor_submitted"
              label="تم استلام الكفيل"
              className="border border-[rgba(105,217,123,0.28)] bg-[rgba(105,217,123,0.13)] text-[#b8f3c0] hover:bg-[rgba(105,217,123,0.20)]"
              action={updateApplicationAction}
            />

            <StatusActionButton
              applicationId={app.id}
              status="under_review"
              paymentStatus="confirmed"
              label="تأكيد الدفع / قيد الدراسة"
              className="green-button"
              action={updateApplicationAction}
            />

            <StatusActionButton
              applicationId={app.id}
              status="approved"
              label="قبول الطلب"
              className="border border-[rgba(105,217,123,0.28)] bg-[rgba(105,217,123,0.13)] text-[#b8f3c0] hover:bg-[rgba(105,217,123,0.20)]"
              action={updateApplicationAction}
            />

            <StatusActionButton
              applicationId={app.id}
              status="rejected"
              label="رفض الطلب"
              className="border border-red-400/30 bg-red-950/25 text-red-200 hover:bg-red-950/40"
              action={updateApplicationAction}
            />

            <StatusActionButton
              applicationId={app.id}
              status="cancelled"
              label="إلغاء الطلب"
              className="soft-button"
              action={updateApplicationAction}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-[rgba(214,181,107,0.18)] bg-[rgba(214,181,107,0.07)] p-4 text-sm font-bold leading-7 text-[#d7ddd5]">
            فلو العمل: الطلب يدخل كـ طلب مبدئي، ثم تقرر الإدارة: مؤهل مبدئياً وطلب دفع، أو بحاجة كشف راتب، أو بحاجة كفيل عبر رابط خاص، أو رفض.
          </div>
        </section>

        <section className="glass-panel gold-outline mb-6 rounded-[32px] p-6 shadow-xl">
          <div className="mb-5">
            <h2 className="gold-text text-xl font-black">
              رسائل واتساب للعميل
            </h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#cbd6cb]">
              الأزرار تفتح واتساب برسالة جاهزة. الموظف يراجع الرسالة ثم يضغط إرسال.
            </p>
          </div>

          {!hasWhatsAppPhone ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-950/25 px-4 py-3 text-sm font-bold text-red-200">
              رقم الهاتف غير صالح للإرسال عبر واتساب.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, currentStatusMessage(app))}
                label="إرسال الحالة الحالية"
                className="border border-[rgba(214,181,107,0.14)] bg-[rgba(255,255,255,0.06)] text-white hover:bg-[rgba(255,255,255,0.10)]"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, preliminaryPaymentMessage(app))}
                label="مؤهل / تعليمات الدفع"
                className="border border-[rgba(214,181,107,0.22)] bg-[rgba(214,181,107,0.16)] text-[#f3dfac] hover:bg-[rgba(214,181,107,0.24)]"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, salarySlipRequestMessage(app))}
                label="طلب كشف راتب"
                className="border border-purple-300/25 bg-purple-950/30 text-purple-100 hover:bg-purple-950/45"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, guarantorRequestMessage(app))}
                label="طلب كفيل برابط"
                className="border border-orange-300/25 bg-orange-950/30 text-orange-100 hover:bg-orange-950/45"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, underReviewMessage(app))}
                label="قيد الدراسة"
                className="border border-sky-300/25 bg-sky-950/30 text-sky-100 hover:bg-sky-950/45"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, approvedMessage(app))}
                label="موافقة مبدئية"
                className="border border-[rgba(105,217,123,0.28)] bg-[rgba(105,217,123,0.13)] text-[#b8f3c0] hover:bg-[rgba(105,217,123,0.20)]"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, rejectedMessage(app))}
                label="رفض الطلب"
                className="border border-red-400/30 bg-red-950/25 text-red-200 hover:bg-red-950/40"
              />
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-orange-300/20 bg-orange-950/20 p-4">
            <p className="text-xs font-black text-orange-100">رابط إدخال بيانات الكفيل</p>
            <p className="mt-2 break-words text-sm font-bold leading-7 text-[#f7f3e8]">
              {guarantorUrl}
            </p>
          </div>
        </section>

        {googleMapsUrl && (
          <section className="glass-panel gold-outline mb-6 rounded-[32px] p-6 shadow-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="gold-text text-xl font-black">موقع العميل GPS</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-[#cbd6cb]">
                  تم حفظ موقع العميل من صفحة التقديم. افتح الرابط لمشاهدة الموقع مباشرة على Google Maps.
                </p>
                <p className="mt-2 break-words text-sm font-black text-white">
                  {app.location_latitude}, {app.location_longitude}
                </p>
                <p className="mt-1 text-xs font-bold text-[#aeb9af]">
                  الدقة: {formatGpsAccuracy(app.location_accuracy)}
                </p>
              </div>

              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="green-button rounded-2xl px-6 py-4 text-center text-sm font-black transition"
              >
                فتح الموقع على الخريطة
              </a>
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <InfoCard
            title="معلومات مقدم الطلب"
            items={[
              { label: "الاسم الكامل", value: app.full_name },
              { label: "رقم الهاتف", value: app.phone },
              { label: "البريد الإلكتروني", value: app.email },
              { label: "الرقم الوطني", value: app.national_id },
              { label: "المحافظة", value: governorate },
              { label: "المنطقة", value: area },
              { label: "العنوان التفصيلي", value: address },
              { label: "أقرب معلم", value: app.nearest_landmark },
              {
                label: "حالة GPS",
                value: hasGpsLocation(app) ? "تم تحديد الموقع" : "لم يتم تحديد الموقع",
              },
              {
                label: "إحداثيات GPS",
                value: hasGpsLocation(app)
                  ? `${app.location_latitude}, ${app.location_longitude}`
                  : "—",
              },
              {
                label: "دقة الموقع",
                value: formatGpsAccuracy(app.location_accuracy),
              },
              {
                label: "وقت تحديد الموقع",
                value: formatDate(app.location_captured_at),
              },
              {
                label: "مقدم الطلب مشترك بالضمان",
                value: yesNo(applicantSocialSecurity),
              },
            ]}
          />

          <InfoCard
            title="معلومات العمل والدخل"
            items={[
              { label: "مكان العمل", value: employer },
              { label: "المسمى الوظيفي", value: app.job_title },
              { label: "الراتب الشهري", value: formatMoney(app.salary) },
              {
                label: "مسار الأهلية",
                value: translateEligibilityPath(app.eligibility_path),
              },
              { label: "تاريخ الطلب", value: formatDate(app.created_at) },
            ]}
          />

          <InfoCard
            title="معلومات الجهاز والتمويل"
            items={[
              { label: "معرّف الجهاز", value: app.device_id },
              { label: "اسم الجهاز", value: app.device_name },
              { label: "سعر الجهاز", value: formatMoney(app.device_price) },
              {
                label: "مدة التقسيط",
                value: app.installment_months ? `${app.installment_months} شهر` : "—",
              },
              { label: "الدفعة الأولى", value: formatMoney(app.down_payment) },
              { label: "نسبة الفائدة", value: formatPercent(app.interest_rate) },
              {
                label: "القسط الشهري التقريبي",
                value: formatMoney(app.monthly_payment),
              },
              {
                label: "الإجمالي مع الفائدة",
                value: formatMoney(app.total_with_interest),
              },
            ]}
          />

          <InfoCard
            title="معلومات الكفيل"
            items={[
              { label: "اسم الكفيل", value: app.guarantor_name },
              { label: "هاتف الكفيل", value: app.guarantor_phone },
              {
                label: "الرقم الوطني للكفيل",
                value: app.guarantor_national_id,
              },
              {
                label: "الكفيل مشترك بالضمان",
                value: yesNo(app.guarantor_social_security),
              },
              { label: "صلة القرابة", value: app.guarantor_relationship },
              { label: "رابط نموذج الكفيل", value: guarantorUrl },
            ]}
          />

          <InfoCard
            title="معلومات الدفع"
            items={[
              {
                label: "حالة الدفع",
                value: translatePaymentStatus(app.payment_status),
              },
              { label: "وصل الدفع", value: formatPaymentReference(app.payment_reference) },
              {
                label: "وقت ضغط العميل تأكيد الدفع",
                value: formatDate(app.paid_clicked_at),
              },
              { label: "مهلة الدفع", value: formatDate(app.payment_deadline) },
            ]}
          />
        </div>

        <section className="glass-panel gold-outline mt-6 rounded-[32px] p-6 shadow-xl">
          <h2 className="gold-text mb-5 text-xl font-black">
            الوثائق المرفوعة
          </h2>

          {documentsError && (
            <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-950/25 px-4 py-3 text-sm font-bold text-red-200">
              تعذر جلب الوثائق: {documentsError.message}
            </div>
          )}

          {safeDocuments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[rgba(214,181,107,0.22)] bg-[rgba(255,255,255,0.035)] p-10 text-center">
              <h3 className="text-lg font-black text-white">
                لا يوجد وثائق ظاهرة
              </h3>
              <p className="mt-2 text-sm font-bold leading-7 text-[#cbd6cb]">
                إذا أنت متأكد إن الصور مرفوعة، ممكن يكون اسم عمود الربط في جدول documents مختلف عن application_id.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {safeDocuments.map((document, index) => {
                const documentUrl = getDocumentUrl(document);
                const documentType = document.document_type || document.type;
                const isPaymentReceipt = documentType === "payment_receipt";
                const title =
                  translateDocumentType(documentType) ||
                  document.filename ||
                  document.name ||
                  `وثيقة ${index + 1}`;

                return (
                  <div
                    key={document.id || `${documentUrl}-${index}`}
                    className={`glass-panel gold-outline rounded-[28px] p-4 ${
                      isPaymentReceipt
                        ? "border-[rgba(105,217,123,0.34)] bg-[rgba(105,217,123,0.06)]"
                        : ""
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-black text-white">
                        {title}
                      </h3>

                      {documentUrl && (
                        <a
                          href={documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="green-button rounded-xl px-3 py-2 text-xs font-black transition"
                        >
                          فتح
                        </a>
                      )}
                    </div>

                    {documentUrl ? (
                      <div className="relative h-80 overflow-hidden rounded-2xl border border-[rgba(214,181,107,0.18)] bg-[rgba(3,18,14,0.42)]">
                        <Image
                          src={documentUrl}
                          alt={title}
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[rgba(214,181,107,0.22)] bg-[rgba(255,255,255,0.035)] p-8 text-center text-sm font-bold text-[#aeb9af]">
                        لا يوجد رابط ظاهر لهذه الوثيقة
                      </div>
                    )}
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
