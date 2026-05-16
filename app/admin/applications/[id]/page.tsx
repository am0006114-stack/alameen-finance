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
  payment_confirmed_at?: string | null;

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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatPickupDate(date: Date) {
  return new Intl.DateTimeFormat("ar-JO", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Amman",
  }).format(date);
}

function cleanText(value: FormDataEntryValue | null) {
  const textValue = String(value || "").trim();
  return textValue || null;
}

function cleanNumber(value: FormDataEntryValue | null) {
  const textValue = String(value || "").trim();
  if (!textValue) return null;

  const numberValue = Number(textValue);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function deviceDetailsForMessage(app: ApplicationRecord) {
  const lines = [
    app.device_name || "الجهاز المطلوب",
    app.installment_months ? `مدة التقسيط: ${app.installment_months} شهر` : "",
    app.monthly_payment ? `القسط الشهري التقريبي: ${formatMoney(app.monthly_payment)}` : "",
    app.down_payment ? `الدفعة الأولى: ${formatMoney(app.down_payment)}` : "",
  ].filter(Boolean);

  return lines.join("\n");
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
    case "qualification_link_sent":
      return "تم إرسال رابط القرار";
    case "customer_confirmed_continue":
      return "العميل وافق على الاستمرار";
    case "customer_declined_continue":
      return "العميل رفض الاستمرار";
    case "delivery_delay_notice_sent":
      return "تم إرسال خيار التمديد/الاسترداد";
    case "customer_accepts_delivery_delay":
      return "وافق على تمديد التسليم";
    case "refund_requested":
      return "طلب استرداد الرسوم";
    case "refund_completed":
      return "تم تنفيذ الاسترداد";
    case "needs_salary_slip":
      return "بحاجة كشف راتب";
    case "salary_slip_link_sent":
      return "تم إرسال رابط كشف الراتب";
    case "salary_slip_uploaded":
      return "تم رفع كشف الراتب";
    case "first_installment_requested":
      return "اختار دفع القسط الأول";
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
    case "payment_info_sent":
      return "تم إرسال معلومات الدفع";
    case "refund_requested":
      return "طلب استرداد الرسوم";
    case "first_installment_whatsapp":
      return "طلب دفع القسط الأول عبر واتساب";
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
    case "customer_confirmed_continue":
      return "border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]";
    case "rejected":
    case "customer_declined_continue":
      return "border-red-400/30 bg-red-950/25 text-red-200";
    case "preliminary_qualified":
    case "qualification_link_sent":
    case "payment_info_sent":
    case "pending_payment_confirmation":
    case "customer_claimed_paid":
    case "pending":
    case "pending_payment":
      return "border-[rgba(214,181,107,0.32)] bg-[rgba(214,181,107,0.10)] text-[#f3dfac]";
    case "needs_salary_slip":
    case "salary_slip_link_sent":
    case "salary_slip_uploaded":
    case "first_installment_requested":
    case "first_installment_whatsapp":
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

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "عميلنا الكريم";
  if (parts.length === 1) return parts[0];

  return `${parts[0]} ${parts[1]}`;
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

function getContinueUrl(app: ApplicationRecord) {
  const baseUrl = getBaseUrl();
  const phone = app.phone || "";
  const tracking = app.tracking_id || app.id || "";

  return `${baseUrl}/continue?tracking=${encodeURIComponent(
    tracking
  )}&phone=${encodeURIComponent(phone)}`;
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

function preliminaryQualificationMessage(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const continueUrl = getContinueUrl(app);
  const deviceName = app.device_name || "الجهاز المطلوب";

  return `🌿 تهانينا ${name}،

بعد مراجعة البيانات المرسلة، تم تأهيل طلبكم مبدئيًا للانتقال إلى مرحلة الدراسة النهائية ✅

الجهاز المطلوب:
${deviceName}

رقم التتبع:
${tracking}

للاطلاع على تفاصيل المرحلة القادمة وتأكيد رغبتكم بالاستمرار، يرجى الدخول إلى الرابط التالي:

${continueUrl}

الأمين للأقساط والتمويل`;
}

function paymentInfoMessage(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const deviceName = app.device_name || "—";

  return `أهلًا ${name} 🌿

تم تسجيل رغبتكم بالاستمرار في فتح ملف الدراسة النهائية ✅

تفاصيل الطلب:
الجهاز: ${deviceName}
رقم التتبع: ${tracking}

معلومات رسوم فتح الملف:
قيمة الرسوم: 5 دنانير فقط

اسم المستفيد: AMEENPAY
اسم المحفظة: Orang-Money
الاسم: ABDUL RAHMAN ALHARAHSHEH

بعد التحويل يرجى إرسال صورة أو لقطة شاشة لوصل الدفع عبر واتساب ليتم فتح الملف وتحويله لقسم الدراسة النهائية.

الأمين للأقساط والتمويل`;
}

function underReviewMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

تم تأكيد رسوم فتح الملف، وتم تحويل طلبك إلى قسم الدراسة.

حالة الطلب الآن: قيد الدراسة
مدة المراجعة المتوقعة: من 24 إلى 72 ساعة من وقت تأكيد الدفع.

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
  const pickupDate = formatPickupDate(addDays(new Date(), 3));
  const deviceDetails = deviceDetailsForMessage(app);

  return `أهلًا ${name} 🌟

يسعدنا إبلاغك بأنه تمت الموافقة على طلبك لدى الأمين للأقساط والتمويل ✅

تفاصيل الجهاز:
${deviceDetails}

يرجى الحضور يوم ${pickupDate} برفقة الكفيل، لتوقيع العقد والكمبيالات واستكمال إجراءات استلام جهازك 🎉

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${trackUrl}

أهلًا وسهلًا فيك مع الأمين للأقساط والتمويل 💚

عنواننا:
رنا سنتر – الطابق الثاني
مقابل مستشفى العيون التخصصي
شارع المدينة المنورة، عمّان`;
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

function missingIdentityDocumentsMessage(app: ApplicationRecord) {
  const name = firstName(app.full_name);
  const tracking = app.tracking_id || app.id;
  const trackUrl = getTrackUrl(app);

  return `أهلًا ${name}،

وصل طلبك لدى الأمين للأقساط والتمويل، لكن صور الهوية غير ظاهرة لدينا أو لم تصل بشكل صحيح.

نرجو إرسال صورة واضحة لهوية مقدم الطلب:
- الوجه الأمامي
- الوجه الخلفي

رقم التتبع:
${tracking}

رابط متابعة الطلب:
${trackUrl}

ملاحظة: لا يمكن استكمال مراجعة الطلب قبل وصول صور الهوية بشكل واضح.

الأمين للأقساط والتمويل
Al Ameen for Financial Services`;
}

function getDocumentTypeValue(document: DocumentRecord) {
  return document.document_type || document.type || "";
}

function isApplicantFrontDocument(document: DocumentRecord) {
  const type = getDocumentTypeValue(document);

  return type === "applicant_id_front" || type === "applicant_front";
}

function isApplicantBackDocument(document: DocumentRecord) {
  const type = getDocumentTypeValue(document);

  return type === "applicant_id_back" || type === "applicant_back";
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

function EditInput({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string | number | null | undefined;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black text-[#f3dfac]">
        {label}
      </span>
      <input
        name={name}
        defaultValue={
          defaultValue === null || defaultValue === undefined ? "" : String(defaultValue)
        }
        className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-3 text-right text-sm font-bold text-white outline-none transition placeholder:text-[#8d998f] focus:border-[#d6b56b] focus:ring-4 focus:ring-[#d6b56b]/10"
      />
    </label>
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

function WhatsAppActionButton({
  applicationId,
  phone,
  message,
  actionType,
  label,
  className,
}: {
  applicationId: string;
  phone: string | null | undefined;
  message: string;
  actionType: "qualification_link_sent" | "payment_info_sent";
  label: string;
  className: string;
}) {
  return (
    <form action="/api/admin/whatsapp-action" method="POST" target="_blank">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="phone" value={phone || ""} />
      <input type="hidden" name="message" value={message} />
      <input type="hidden" name="actionType" value={actionType} />
      <button
        type="submit"
        className={`flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-black transition ${className}`}
      >
        {label}
      </button>
    </form>
  );
}



function DeliveryDelayLinkAction({
  applicationId,
}: {
  applicationId: string;
}) {
  return (
    <form action="/api/admin/delivery-delay-link" method="POST" target="_blank">
      <input type="hidden" name="applicationId" value={applicationId} />
      <button
        type="submit"
        className="flex w-full items-center justify-center rounded-2xl border border-[#d6b56b]/30 bg-[#d6b56b]/15 px-4 py-3 text-sm font-black text-[#f3dfac] transition hover:bg-[#d6b56b]/25"
      >
        إرسال خيار التمديد / الاسترداد
      </button>
    </form>
  );
}

function SalarySlipLinkAction({
  applicationId,
}: {
  applicationId: string;
}) {
  return (
    <form
      action="/api/admin/salary-slip-link"
      method="POST"
      target="_blank"
      className="rounded-2xl border border-[#d6b56b]/25 bg-[#d6b56b]/10 p-3"
    >
      <input type="hidden" name="applicationId" value={applicationId} />

      <label className="block">
        <span className="mb-2 block text-xs font-black text-[#f3dfac]">
          قيمة القسط الأول — اختياري
        </span>
        <input
          name="amount"
          inputMode="decimal"
          placeholder="مثال: 65"
          className="mb-3 w-full rounded-xl border border-[rgba(214,181,107,0.22)] bg-[rgba(3,18,14,0.58)] px-3 py-3 text-right text-sm font-bold text-white outline-none placeholder:text-[#8d998f] focus:border-[#d6b56b]"
        />
      </label>

      <button
        type="submit"
        className="flex w-full items-center justify-center rounded-xl border border-[rgba(214,181,107,0.32)] bg-[rgba(214,181,107,0.18)] px-4 py-3 text-sm font-black text-[#f3dfac] transition hover:bg-[rgba(214,181,107,0.26)]"
      >
        إرسال رابط كشف الراتب / القسط الأول
      </button>
    </form>
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
  const hasApplicantFrontDocument = safeDocuments.some(isApplicantFrontDocument);
  const hasApplicantBackDocument = safeDocuments.some(isApplicantBackDocument);
  const missingApplicantIdentityDocuments =
    !hasApplicantFrontDocument || !hasApplicantBackDocument;

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
      payment_confirmed_at?: string;
    } = {};

    if (nextStatus) updatePayload.status = nextStatus;
    if (nextPaymentStatus) updatePayload.payment_status = nextPaymentStatus;

    if (nextPaymentStatus === "confirmed") {
      updatePayload.payment_confirmed_at = new Date().toISOString();
    }

    if (Object.keys(updatePayload).length === 0) {
      redirect(`/admin/applications/${applicationId}`);
    }

    await supabaseAdmin
      .from("applications")
      .update(updatePayload)
      .eq("id", applicationId);

    redirect(`/admin/applications/${applicationId}`);
  }

  async function updateApplicationDetailsAction(formData: FormData) {
    "use server";

    const applicationId = String(formData.get("applicationId") || "");

    if (!applicationId) {
      redirect("/admin");
    }

    const updatePayload = {
      full_name: cleanText(formData.get("full_name")),
      phone: cleanText(formData.get("phone")),
      email: cleanText(formData.get("email")),
      national_id: cleanText(formData.get("national_id")),
      governorate: cleanText(formData.get("governorate")),
      city_area: cleanText(formData.get("city_area")),
      detailed_address: cleanText(formData.get("detailed_address")),
      nearest_landmark: cleanText(formData.get("nearest_landmark")),
      employer_name: cleanText(formData.get("employer_name")),
      job_title: cleanText(formData.get("job_title")),
      salary: cleanNumber(formData.get("salary")),
      device_name: cleanText(formData.get("device_name")),
      device_price: cleanNumber(formData.get("device_price")),
      down_payment: cleanNumber(formData.get("down_payment")),
      installment_months: cleanNumber(formData.get("installment_months")),
      monthly_payment: cleanNumber(formData.get("monthly_payment")),
      total_with_interest: cleanNumber(formData.get("total_with_interest")),
      guarantor_name: cleanText(formData.get("guarantor_name")),
      guarantor_phone: cleanText(formData.get("guarantor_phone")),
      guarantor_national_id: cleanText(formData.get("guarantor_national_id")),
    };

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
  const continueUrl = getContinueUrl(app);
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
              paymentStatus="not_requested_yet"
              label="مؤهل مبدئياً / إرسال صفحة القرار"
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
              تعديل بيانات الطلب
            </h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#cbd6cb]">
              عدّل رقم الهاتف، بيانات العميل، بيانات الجهاز أو الكفيل قبل إرسال الرسائل أو اعتماد القرار النهائي.
            </p>
          </div>

          <form action={updateApplicationDetailsAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <input type="hidden" name="applicationId" value={app.id} />

            <EditInput label="الاسم الكامل" name="full_name" defaultValue={app.full_name} />
            <EditInput label="رقم الهاتف" name="phone" defaultValue={app.phone} />
            <EditInput label="البريد الإلكتروني" name="email" defaultValue={app.email} />
            <EditInput label="الرقم الوطني" name="national_id" defaultValue={app.national_id} />
            <EditInput label="المحافظة" name="governorate" defaultValue={governorate === "—" ? "" : governorate} />
            <EditInput label="المنطقة" name="city_area" defaultValue={area === "—" ? "" : area} />
            <EditInput label="العنوان التفصيلي" name="detailed_address" defaultValue={address === "—" ? "" : address} />
            <EditInput label="أقرب معلم" name="nearest_landmark" defaultValue={app.nearest_landmark} />
            <EditInput label="مكان العمل" name="employer_name" defaultValue={employer === "—" ? "" : employer} />
            <EditInput label="المسمى الوظيفي" name="job_title" defaultValue={app.job_title} />
            <EditInput label="الراتب الشهري" name="salary" defaultValue={app.salary} />
            <EditInput label="اسم الجهاز" name="device_name" defaultValue={app.device_name} />
            <EditInput label="سعر الجهاز" name="device_price" defaultValue={app.device_price} />
            <EditInput label="الدفعة الأولى" name="down_payment" defaultValue={app.down_payment} />
            <EditInput label="مدة التقسيط بالشهور" name="installment_months" defaultValue={app.installment_months} />
            <EditInput label="القسط الشهري التقريبي" name="monthly_payment" defaultValue={app.monthly_payment} />
            <EditInput label="الإجمالي مع الفائدة" name="total_with_interest" defaultValue={app.total_with_interest} />
            <EditInput label="اسم الكفيل" name="guarantor_name" defaultValue={app.guarantor_name} />
            <EditInput label="هاتف الكفيل" name="guarantor_phone" defaultValue={app.guarantor_phone} />
            <EditInput label="الرقم الوطني للكفيل" name="guarantor_national_id" defaultValue={app.guarantor_national_id} />

            <div className="md:col-span-2 xl:col-span-3">
              <button
                type="submit"
                className="green-button w-full rounded-2xl px-5 py-4 text-sm font-black transition"
              >
                حفظ تعديلات الطلب
              </button>
            </div>
          </form>
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
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, currentStatusMessage(app))}
                label="إرسال الحالة الحالية"
                className="border border-[rgba(214,181,107,0.14)] bg-[rgba(255,255,255,0.06)] text-white hover:bg-[rgba(255,255,255,0.10)]"
              />

              <DeliveryDelayLinkAction applicationId={app.id} />

              <WhatsAppActionButton
                applicationId={app.id}
                phone={app.phone}
                message={preliminaryQualificationMessage(app)}
                actionType="qualification_link_sent"
                label="تهانينا + رابط القرار"
                className="border border-[rgba(214,181,107,0.22)] bg-[rgba(214,181,107,0.16)] text-[#f3dfac] hover:bg-[rgba(214,181,107,0.24)]"
              />

              <WhatsAppActionButton
                applicationId={app.id}
                phone={app.phone}
                message={paymentInfoMessage(app)}
                actionType="payment_info_sent"
                label="إرسال معلومات الدفع"
                className="border border-[rgba(105,217,123,0.28)] bg-[rgba(105,217,123,0.13)] text-[#b8f3c0] hover:bg-[rgba(105,217,123,0.20)]"
              />

              <SalarySlipLinkAction applicationId={app.id} />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, salarySlipRequestMessage(app))}
                label="طلب كشف راتب قديم"
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
                label="قرار نهائي / الاستلام"
                className="border border-[rgba(105,217,123,0.28)] bg-[rgba(105,217,123,0.13)] text-[#b8f3c0] hover:bg-[rgba(105,217,123,0.20)]"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, missingIdentityDocumentsMessage(app))}
                label="إعادة إرسال الهوية"
                className="border border-red-400/35 bg-red-950/30 text-red-100 hover:bg-red-950/45"
              />

              <WhatsAppButton
                href={makeWhatsAppUrl(app.phone, rejectedMessage(app))}
                label="رفض الطلب"
                className="border border-red-400/30 bg-red-950/25 text-red-200 hover:bg-red-950/40"
              />
            </div>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[rgba(214,181,107,0.20)] bg-[rgba(214,181,107,0.07)] p-4">
              <p className="text-xs font-black text-[#f3dfac]">رابط صفحة قرار العميل</p>
              <p className="mt-2 break-words text-sm font-bold leading-7 text-[#f7f3e8]">
                {continueUrl}
              </p>
            </div>

            <div className="rounded-2xl border border-orange-300/20 bg-orange-950/20 p-4">
              <p className="text-xs font-black text-orange-100">رابط إدخال بيانات الكفيل</p>
              <p className="mt-2 break-words text-sm font-bold leading-7 text-[#f7f3e8]">
                {guarantorUrl}
              </p>
            </div>
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
              {
                label: "وقت تأكيد الإدارة للدفع",
                value: formatDate(app.payment_confirmed_at),
              },
              { label: "مهلة الدفع", value: formatDate(app.payment_deadline) },
            ]}
          />
        </div>

        {missingApplicantIdentityDocuments && (
          <section className="mt-6 rounded-[32px] border border-red-400/35 bg-red-950/25 p-6 shadow-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-black text-red-100">
                  🔔 تنبيه: صور الهوية غير مكتملة
                </h2>
                <p className="mt-2 text-sm font-bold leading-7 text-red-100/90">
                  لم يتم العثور على الوجه الأمامي والخلفي لهوية مقدم الطلب داخل الوثائق. لا تكمل دراسة الطلب قبل استلام صور الهوية بشكل واضح.
                </p>
              </div>

              {hasWhatsAppPhone && (
                <a
                  href={makeWhatsAppUrl(app.phone, missingIdentityDocumentsMessage(app))}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-red-400/35 bg-red-950/40 px-5 py-3 text-center text-sm font-black text-red-100 transition hover:bg-red-950/55"
                >
                  طلب إعادة إرسال الهوية عبر واتساب
                </a>
              )}
            </div>
          </section>
        )}

        <section className="glass-panel gold-outline mt-6 rounded-[32px] p-6 shadow-xl">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="gold-text text-xl font-black">
              الوثائق المرفوعة
            </h2>

            <span
              className={`inline-flex rounded-full border px-4 py-2 text-sm font-black ${
                missingApplicantIdentityDocuments
                  ? "border-red-400/35 bg-red-950/30 text-red-100"
                  : "border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]"
              }`}
            >
              {missingApplicantIdentityDocuments ? "صور الهوية غير مكتملة" : "صور الهوية مكتملة"}
            </span>
          </div>

          {documentsError && (
            <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-950/25 px-4 py-3 text-sm font-bold text-red-200">
              تعذر جلب الوثائق: {documentsError.message}
            </div>
          )}

          {safeDocuments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-red-400/35 bg-red-950/20 p-10 text-center">
              <h3 className="text-lg font-black text-red-100">
                لا يوجد وثائق ظاهرة لهذا الطلب
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-red-100/90">
                غالباً صور الهوية لم تُحفظ في جدول documents أو لم ترتبط بهذا الطلب. اطلب من العميل إعادة إرسال الهوية عبر واتساب قبل متابعة الدراسة.
              </p>

              {hasWhatsAppPhone && (
                <a
                  href={makeWhatsAppUrl(app.phone, missingIdentityDocumentsMessage(app))}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex rounded-2xl border border-red-400/35 bg-red-950/40 px-5 py-3 text-sm font-black text-red-100 transition hover:bg-red-950/55"
                >
                  طلب إعادة إرسال الهوية عبر واتساب
                </a>
              )}
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
