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
      return "العميل أكّد الدفع";
    case "confirmed":
      return "تم تأكيد الدفع";
    case "rejected":
      return "الدفع مرفوض";
    default:
      return status || "غير محدد";
  }
}

function translateEligibilityPath(path: string | null | undefined) {
  switch (path) {
    case "applicant_social_security":
      return "مقدم الطلب مشترك بالضمان";
    case "guarantor_social_security_first_degree":
      return "الكفيل مشترك بالضمان + قرابة مقبولة";
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
    default:
      return type || "وثيقة";
  }
}

function statusClass(status: string | null | undefined) {
  switch (status) {
    case "approved":
    case "confirmed":
      return "border-green-200 bg-green-50 text-green-700";
    case "rejected":
      return "border-red-200 bg-red-50 text-red-700";
    case "pending_payment_confirmation":
    case "customer_claimed_paid":
    case "pending":
    case "pending_payment":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "under_review":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "cancelled":
      return "border-gray-200 bg-gray-100 text-gray-600";
    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
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

function getTrackUrl(app: ApplicationRecord) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const phone = app.phone || "";
  const tracking = app.tracking_id || "";

  return `${baseUrl}/track?phone=${encodeURIComponent(
    phone
  )}&tracking=${encodeURIComponent(tracking)}`;
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

الأمين للأقساط`;
}

function paymentReminderMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

تم استلام طلب التمويل الخاص بك لدى الأمين للأقساط.

لاستكمال دراسة الطلب، يرجى دفع رسوم فتح الملف بقيمة 5 دنانير، ثم إدخال رقم الوصل/الحركة والضغط على زر "تأكيد الدفع" من صفحة الدفع.

رقم التتبع: ${tracking}

رابط متابعة الطلب:
${trackUrl}

الأمين للأقساط`;
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

الأمين للأقساط`;
}

function salarySlipRequestMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

لاستكمال دراسة طلب التمويل الخاص بك لدى الأمين للأقساط، نرجو تزويدنا بكشف راتب حديث أو شهادة راتب حديثة صادرة من جهة العمل.

رقم التتبع: ${tracking}

ملاحظات مهمة:
- يجب أن يكون الكشف/الشهادة واضحًا وحديثًا.
- يفضّل أن يحتوي على الاسم، جهة العمل، والراتب الصافي.
- إرسال المستند لا يعني الموافقة النهائية، وإنما لاستكمال دراسة الطلب.

رابط متابعة الطلب:
${trackUrl}

الأمين للأقساط`;
}

function approvedMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

نود إعلامك بأنه تمت الموافقة المبدئية على طلب التمويل الخاص بك لدى الأمين للأقساط.

رقم التتبع: ${tracking}

سيتم التواصل معك لاستكمال الإجراءات النهائية، ويكون التسليم في المعرض بعد توقيع العقد.

رابط متابعة الطلب:
${trackUrl}

الأمين للأقساط`;
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

الأمين للأقساط`;
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
    <section className="rounded-[28px] border border-[#eadfce] bg-white p-6 shadow-lg">
      <h2 className="mb-5 text-xl font-black text-[#111827]">{title}</h2>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3"
          >
            <p className="mb-1 text-xs font-bold text-gray-400">
              {item.label}
            </p>
            <p className="break-words text-sm font-black text-gray-800">
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
    app.applicant_social_security ??
    app.social_security ??
    app.has_social_security;

  const governorate = app.governorate || app.city || "—";
  const area = app.city_area || app.area || "—";
  const address = app.detailed_address || app.address || "—";
  const employer = app.employer || app.employer_name || "—";

  return (
    <main dir="rtl" className="min-h-screen bg-[#f6f3ee] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[32px] border border-[#eadfce] bg-white p-6 shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Link
                href="/admin"
                className="mb-4 inline-flex rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-black text-gray-700 transition hover:bg-gray-100"
              >
                رجوع للطلبات
              </Link>

              <p className="mb-2 text-sm font-bold text-gray-400">
                تفاصيل طلب التمويل
              </p>

              <h1 className="text-3xl font-black text-[#111827]">
                {app.tracking_id || app.id}
              </h1>

              <p className="mt-2 text-sm leading-7 text-gray-500">
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
        </header>

        <section className="mb-6 rounded-[32px] border border-[#eadfce] bg-white p-6 shadow-xl">
          <h2 className="mb-5 text-xl font-black text-[#111827]">
            إجراءات الإدارة
          </h2>

          <div className="grid gap-3 md:grid-cols-5">
            <form action={updateApplicationAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="payment_status" value="confirmed" />
              <input type="hidden" name="status" value="under_review" />
              <button
                type="submit"
                className="w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-black text-white transition hover:bg-green-700"
              >
                تأكيد دفع 5 دنانير
              </button>
            </form>

            <form action={updateApplicationAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="status" value="under_review" />
              <button
                type="submit"
                className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700"
              >
                تحويل لقيد الدراسة
              </button>
            </form>

            <form action={updateApplicationAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="status" value="approved" />
              <button
                type="submit"
                className="w-full rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white transition hover:bg-black"
              >
                قبول الطلب
              </button>
            </form>

            <form action={updateApplicationAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="status" value="rejected" />
              <button
                type="submit"
                className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700"
              >
                رفض الطلب
              </button>
            </form>

            <form action={updateApplicationAction}>
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="status" value="cancelled" />
              <button
                type="submit"
                className="w-full rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-200"
              >
                إلغاء الطلب
              </button>
            </form>
          </div>
        </section>

        <section className="mb-6 rounded-[32px] border border-[#eadfce] bg-white p-6 shadow-xl">
          <div className="mb-5">
            <h2 className="text-xl font-black text-[#111827]">
              رسائل واتساب للعميل
            </h2>
            <p className="mt-2 text-sm leading-7 text-gray-500">
              الأزرار تفتح واتساب برسالة جاهزة للعميل. الموظف يراجع الرسالة ثم
              يضغط إرسال.
            </p>
          </div>

          {!hasWhatsAppPhone ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              رقم الهاتف غير صالح للإرسال عبر واتساب.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-6">
              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, currentStatusMessage(app))}
                label="إرسال الحالة الحالية"
                className="bg-[#111827] text-white hover:bg-black"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, paymentReminderMessage(app))}
                label="تذكير الدفع"
                className="bg-amber-500 text-white hover:bg-amber-600"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, underReviewMessage(app))}
                label="قيد الدراسة"
                className="bg-blue-600 text-white hover:bg-blue-700"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, salarySlipRequestMessage(app))}
                label="طلب كشف راتب"
                className="bg-purple-600 text-white hover:bg-purple-700"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, approvedMessage(app))}
                label="موافقة مبدئية"
                className="bg-green-600 text-white hover:bg-green-700"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, rejectedMessage(app))}
                label="رفض الطلب"
                className="bg-red-600 text-white hover:bg-red-700"
              />
            </div>
          )}
        </section>

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
                value: app.installment_months
                  ? `${app.installment_months} شهر`
                  : "—",
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
            ]}
          />

          <InfoCard
            title="معلومات الدفع"
            items={[
              {
                label: "حالة الدفع",
                value: translatePaymentStatus(app.payment_status),
              },
              { label: "رقم الوصل / الحركة", value: app.payment_reference },
              {
                label: "وقت ضغط العميل تأكيد الدفع",
                value: formatDate(app.paid_clicked_at),
              },
              { label: "مهلة الدفع", value: formatDate(app.payment_deadline) },
            ]}
          />
        </div>

        <section className="mt-6 rounded-[32px] border border-[#eadfce] bg-white p-6 shadow-xl">
          <h2 className="mb-5 text-xl font-black text-[#111827]">
            الوثائق المرفوعة
          </h2>

          {documentsError && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              تعذر جلب الوثائق: {documentsError.message}
            </div>
          )}

          {safeDocuments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
              <h3 className="text-lg font-black text-gray-700">
                لا يوجد وثائق ظاهرة
              </h3>
              <p className="mt-2 text-sm leading-7 text-gray-500">
                إذا أنت متأكد إن الصور مرفوعة، ممكن يكون اسم عمود الربط في جدول
                documents مختلف عن application_id.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {safeDocuments.map((document, index) => {
                const documentUrl = getDocumentUrl(document);
                const documentType = document.document_type || document.type;
                const title =
                  translateDocumentType(documentType) ||
                  document.filename ||
                  document.name ||
                  `وثيقة ${index + 1}`;

                return (
                  <div
                    key={document.id || `${documentUrl}-${index}`}
                    className="rounded-[28px] border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-black text-gray-800">
                        {title}
                      </h3>

                      {documentUrl && (
                        <a
                          href={documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl bg-[#111827] px-3 py-2 text-xs font-black text-white transition hover:bg-black"
                        >
                          فتح
                        </a>
                      )}
                    </div>

                    {documentUrl ? (
                      <div className="relative h-80 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                        <Image
                          src={documentUrl}
                          alt={title}
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm font-bold text-gray-500">
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