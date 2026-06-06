import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

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
  payment_confirmed_at?: string | null;

  device_name?: string | null;
  device_price?: number | string | null;
  installment_months?: number | string | null;
  down_payment?: number | string | null;
  monthly_payment?: number | string | null;
  total_with_interest?: number | string | null;
  payment_reference?: string | null;
  paid_clicked_at?: string | null;
};

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

type StatusView = {
  title: string;
  eyebrow: string;
  message: string;
  currentStep: number;
  tone: Tone;
  actionTitle: string;
  actionDescription: string;
  actionHref?: string;
  actionLabel?: string;
};

const BUSINESS_NAME = "الأمين للأقساط";
const REVIEW_MIN_HOURS = 24;
const REVIEW_MAX_HOURS = 72;

function normalizePhone(value: string) {
  return value.trim().replace(/\D/g, "");
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function makeUrl(path: string, app: Application) {
  const baseUrl = getBaseUrl();
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";

  return `${baseUrl}${path}?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

function getGuarantorUrl(app: Application) {
  return makeUrl("/guarantor", app);
}

function getSalarySlipUrl(app: Application) {
  return makeUrl("/salary-slip", app);
}

function getReceiptUrl(app: Application) {
  return makeUrl("/receipt", app);
}

function getWhatsAppFollowUpUrl(message: string) {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "0788500337";
  const cleanNumber = number.replace(/\D/g, "");
  const encodedMessage = encodeURIComponent(message);

  if (cleanNumber.startsWith("962")) {
    return `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
  }

  if (cleanNumber.startsWith("07") && cleanNumber.length === 10) {
    return `https://wa.me/962${cleanNumber.slice(1)}?text=${encodedMessage}`;
  }

  return `https://wa.me/${cleanNumber || "962788500337"}?text=${encodedMessage}`;
}

function getTrackWhatsAppMessage(app: Application, statusView: StatusView) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";

  return `أهلًا، أريد متابعة طلبي لدى ${BUSINESS_NAME}.

رقم التتبع:
${tracking}

رقم الهاتف:
${phone}

الحالة الحالية:
${statusView.title}

أرغب بمعرفة آخر تحديث أو الخطوة التالية.`;
}

function maskName(name: string | null | undefined) {
  if (!name) return "—";

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "—";
  if (parts.length === 1) return `${parts[0].slice(0, 1)}***`;

  return `${parts[0]} ${parts[1].slice(0, 1)}***`;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";

  try {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("ar-JO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Amman",
    }).format(date);
  } catch {
    return String(value);
  }
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) return String(value);

  return `${numberValue.toFixed(2)} د.أ`;
}

function translatePaymentStatus(status: string | null | undefined) {
  switch (status) {
    case "not_requested_yet":
      return "لا يوجد دفع مطلوب حاليًا";
    case "not_paid":
      return "غير مدفوع";
    case "pending":
    case "pending_payment":
    case "payment_info_sent":
      return "بانتظار استكمال الدفع";
    case "customer_claimed_paid":
      return "وصل الدفع بانتظار تأكيد الإدارة";
    case "confirmed":
      return "تم تأكيد رسوم فتح الملف";
    case "rejected":
      return "الدفع غير مؤكد";
    case "refund_requested":
      return "طلب استرداد الرسوم";
    case "refund_completed":
      return "تم تنفيذ الاسترداد";
    default:
      return "غير مطلوب حاليًا";
  }
}

function getPaymentConfirmedDate(app: Application) {
  if (app.payment_status !== "confirmed") return null;

  return app.payment_confirmed_at || app.paid_clicked_at || app.created_at || null;
}

function getReviewWindow(app: Application) {
  const confirmedAt = getPaymentConfirmedDate(app);

  if (!confirmedAt) {
    return {
      start: null as Date | null,
      min: null as Date | null,
      max: null as Date | null,
      isOverdue: false,
      elapsedHours: 0,
    };
  }

  const start = new Date(confirmedAt);

  if (Number.isNaN(start.getTime())) {
    return {
      start: null as Date | null,
      min: null as Date | null,
      max: null as Date | null,
      isOverdue: false,
      elapsedHours: 0,
    };
  }

  const min = new Date(start.getTime() + REVIEW_MIN_HOURS * 60 * 60 * 1000);
  const max = new Date(start.getTime() + REVIEW_MAX_HOURS * 60 * 60 * 1000);
  const elapsedHours = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000 / 60 / 60));

  return {
    start,
    min,
    max,
    isOverdue: Date.now() > max.getTime(),
    elapsedHours,
  };
}

function progressPercent(app: Application, statusView: StatusView) {
  if (app.status === "approved" || app.status === "rejected" || app.status === "cancelled") {
    return 100;
  }

  if (app.payment_status === "confirmed" && app.status === "under_review") {
    const review = getReviewWindow(app);

    if (!review.start || !review.max) return 68;
    if (review.isOverdue) return 92;

    const total = review.max.getTime() - review.start.getTime();
    const elapsed = Date.now() - review.start.getTime();

    return Math.max(62, Math.min(88, Math.round((elapsed / total) * 100)));
  }

  return Math.min(100, Math.max(16, statusView.currentStep * 20));
}

function getStatusView(app: Application): StatusView {
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";

  if (paymentStatus === "customer_claimed_paid" || status === "pending_payment_confirmation") {
    return {
      title: "وصل الدفع قيد التأكيد",
      eyebrow: "تم استلام إشعار الدفع",
      message:
        "وصل الدفع أو إشعار الدفع مسجل لدينا، ويتم الآن مطابقته من الإدارة. لا تعيد الدفع مرة ثانية، وسيتم تحديث الحالة فور التأكيد.",
      tone: "warning",
      currentStep: 3,
      actionTitle: "المطلوب منك الآن",
      actionDescription: "لا يوجد إجراء إضافي. فقط انتظر تأكيد الإدارة لوصل الدفع.",
    };
  }

  if (paymentStatus === "confirmed" && status === "under_review") {
    const review = getReviewWindow(app);

    if (review.isOverdue) {
      return {
        title: "ملفك يحتاج متابعة إضافية",
        eyebrow: "تجاوز وقت المراجعة المتوقع",
        message:
          "تم تأكيد رسوم فتح الملف، والملف لا يزال ضمن الدراسة النهائية. بعض الملفات تحتاج وقتًا إضافيًا للتحقق من البيانات، ويمكنك طلب تحديث عبر واتساب.",
        tone: "warning",
        currentStep: 4,
        actionTitle: "المطلوب منك الآن",
        actionDescription:
          "لا يوجد إجراء إلزامي حاليًا. يمكنك فقط طلب تحديث إذا تجاوز الملف مدة المراجعة المتوقعة.",
      };
    }

    return {
      title: "ملفك قيد الدراسة النهائية",
      eyebrow: "تم فتح الملف بنجاح",
      message:
        "تم تأكيد رسوم فتح الملف، وملفك الآن لدى فريق الدراسة النهائية. لا يوجد أي إجراء مطلوب منك حاليًا، وسيتم التواصل معك إذا احتجنا أي مستند إضافي.",
      tone: "success",
      currentStep: 4,
      actionTitle: "المطلوب منك الآن",
      actionDescription:
        "لا يوجد أي إجراء مطلوب منك الآن. يرجى إبقاء واتساب متاحًا لأي تحديث من فريق المراجعة.",
    };
  }

  switch (status) {
    case "preliminary_application":
    case "submitted":
      return {
        title: "تم استلام طلبك",
        eyebrow: "مراجعة مبدئية",
        message:
          "وصل طلبك إلى الإدارة وسيتم مراجعته مبدئيًا. لا يوجد دفع مطلوب في هذه المرحلة، وسيتم التواصل معك عبر واتساب عند وجود تحديث.",
        tone: "info",
        currentStep: 1,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "لا يوجد إجراء مطلوب. انتظر نتيجة المراجعة المبدئية عبر واتساب.",
      };

    case "preliminary_qualified":
      return {
        title: "طلبك مؤهل مبدئيًا",
        eyebrow: "مرحلة قبل فتح الملف",
        message:
          "تم تأهيل الطلب مبدئيًا للانتقال إلى الدراسة النهائية. تابع واتساب لأن الإدارة سترسل لك التعليمات الرسمية لاستكمال فتح الملف.",
        tone: "success",
        currentStep: 2,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "تابع واتساب لاستلام تعليمات فتح الملف الرسمية من الإدارة.",
      };

    case "customer_confirmed_continue":
    case "pending_payment":
      return {
        title: "بانتظار استكمال فتح الملف",
        eyebrow: "خطوة قبل الدراسة النهائية",
        message:
          "تم تسجيل رغبتك بالاستمرار، والطلب بانتظار استكمال خطوة فتح الملف حسب التعليمات الرسمية المرسلة من الإدارة.",
        tone: "warning",
        currentStep: 3,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "اتبع تعليمات الدفع الرسمية المرسلة من الإدارة، ثم ارفع وصل الدفع من الرابط المخصص.",
        actionHref: getReceiptUrl(app),
        actionLabel: "رفع وصل الدفع",
      };

    case "needs_guarantor":
      return {
        title: "مطلوب استكمال بيانات الكفيل",
        eyebrow: "إجراء داعم للملف",
        message:
          "حسب متطلبات الدراسة النهائية، نحتاج استكمال بيانات الكفيل حتى يتم متابعة الملف بشكل صحيح. هذه الخطوة لا تعني رفض الطلب.",
        tone: "warning",
        currentStep: 3,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "يرجى تعبئة بيانات الكفيل من الرابط الآمن داخل الموقع.",
        actionHref: getGuarantorUrl(app),
        actionLabel: "تعبئة بيانات الكفيل",
      };

    case "needs_salary_slip":
      return {
        title: "مطلوب رفع كشف راتب رسمي",
        eyebrow: "استكمال مستند داعم",
        message:
          "حسب متطلبات الدراسة النهائية، نحتاج كشف راتب رسمي حديث أو شهادة راتب صادرة من جهة العمل. هذه الخطوة إجراء تنظيمي لاستكمال الملف.",
        tone: "warning",
        currentStep: 3,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "يرجى رفع كشف راتب رسمي أو شهادة راتب حديثة من الرابط الآمن داخل الموقع.",
        actionHref: getSalarySlipUrl(app),
        actionLabel: "رفع كشف الراتب",
      };

    case "salary_slip_link_sent":
      return {
        title: "بانتظار كشف الراتب الرسمي",
        eyebrow: "تم إرسال الرابط",
        message:
          "تم إرسال رابط رفع كشف الراتب. يرجى رفع المستند من الرابط الرسمي فقط حتى يتم ربطه بالطلب.",
        tone: "warning",
        currentStep: 3,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "ارفع كشف راتب رسمي أو شهادة راتب حديثة لاستكمال دراسة الملف.",
        actionHref: getSalarySlipUrl(app),
        actionLabel: "رفع كشف الراتب",
      };

    case "salary_slip_uploaded":
      return {
        title: "تم استلام كشف الراتب",
        eyebrow: "مستنداتك وصلت",
        message:
          "تم استلام كشف الراتب الرسمي وربطه بطلبك. الملف الآن بانتظار المراجعة النهائية من الإدارة.",
        tone: "success",
        currentStep: 4,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "لا يوجد إجراء إضافي. سيتم التواصل معك عند وجود تحديث من قسم الدراسة.",
      };

    case "guarantor_submitted":
      return {
        title: "تم استلام بيانات الكفيل",
        eyebrow: "بياناتك اكتملت",
        message:
          "تم استلام بيانات الكفيل وربطها بطلبك. الملف الآن ضمن المراجعة النهائية.",
        tone: "success",
        currentStep: 4,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "لا يوجد إجراء إضافي. سيتم التواصل معك عند صدور تحديث على الملف.",
      };

    case "approved":
      return {
        title: "تمت الموافقة على طلبك",
        eyebrow: "موافقة نهائية",
        message:
          "تمت الموافقة على طلبك. سيتم التواصل معك لتنسيق الخطوات النهائية والاستلام حسب تعليمات الإدارة.",
        tone: "success",
        currentStep: 5,
        actionTitle: "الخطوة التالية",
        actionDescription: "تابع واتساب لتنسيق الحضور وتوقيع العقد واستلام الجهاز.",
      };

    case "rejected":
      return {
        title: "لم تتم الموافقة حاليًا",
        eyebrow: "قرار الدراسة",
        message:
          "نعتذر، لم تتم الموافقة على الطلب في الوقت الحالي. يمكنك التواصل معنا لمعرفة الخيارات العامة أو إمكانية التقديم لاحقًا.",
        tone: "danger",
        currentStep: 5,
        actionTitle: "الخطوة التالية",
        actionDescription: "يمكنك التواصل مع الإدارة لمعرفة الخيارات المتاحة بشكل عام.",
      };

    case "refund_requested":
      return {
        title: "طلب الاسترداد مسجل",
        eyebrow: "استرداد رسوم فتح الملف",
        message:
          "تم تسجيل طلب استرداد رسوم فتح الملف. سيتم مراجعته حسب ترتيب الطلبات وبيانات التحويل المدخلة.",
        tone: "warning",
        currentStep: 5,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "لا يوجد إجراء إضافي إلا إذا طلبت الإدارة معلومات تحويل إضافية.",
      };

    case "refund_completed":
      return {
        title: "تم تنفيذ الاسترداد",
        eyebrow: "انتهت معالجة الطلب",
        message:
          "تم تنفيذ استرداد رسوم فتح الملف حسب البيانات المسجلة لدينا. إذا لديك أي ملاحظة يمكنك التواصل معنا.",
        tone: "success",
        currentStep: 5,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "لا يوجد إجراء مطلوب.",
      };

    case "customer_declined_continue":
    case "cancelled":
      return {
        title: "الطلب غير مستمر حاليًا",
        eyebrow: "تم إيقاف المتابعة",
        message:
          "تم تسجيل عدم الاستمرار أو إلغاء الطلب. إذا كان ذلك بالخطأ يمكنك التواصل معنا لمراجعة الخيارات المتاحة.",
        tone: "neutral",
        currentStep: 5,
        actionTitle: "الخطوة التالية",
        actionDescription: "لا يوجد إجراء مطلوب. تواصل معنا فقط إذا رغبت بإعادة المتابعة.",
      };

    default:
      return {
        title: "طلبك قيد المتابعة",
        eyebrow: "تحديث حالة الطلب",
        message:
          "الطلب قيد المتابعة لدى الإدارة. سيتم التواصل معك عبر واتساب عند وجود تحديث أو عند الحاجة لأي خطوة إضافية.",
        tone: "neutral",
        currentStep: 1,
        actionTitle: "المطلوب منك الآن",
        actionDescription: "لا يوجد إجراء واضح مطلوب حاليًا. تابع واتساب لأي تحديث رسمي.",
      };
  }
}

function toneClasses(tone: Tone) {
  switch (tone) {
    case "success":
      return {
        soft: "border-emerald-200 bg-emerald-50 text-emerald-800",
        solid: "bg-emerald-600 text-white",
        ring: "ring-emerald-100",
        dot: "bg-emerald-500",
        glow: "shadow-[0_26px_80px_rgba(16,185,129,0.18)]",
      };
    case "warning":
      return {
        soft: "border-amber-200 bg-amber-50 text-amber-900",
        solid: "bg-amber-500 text-[#1f1600]",
        ring: "ring-amber-100",
        dot: "bg-amber-500",
        glow: "shadow-[0_26px_80px_rgba(245,158,11,0.16)]",
      };
    case "danger":
      return {
        soft: "border-red-200 bg-red-50 text-red-800",
        solid: "bg-red-600 text-white",
        ring: "ring-red-100",
        dot: "bg-red-500",
        glow: "shadow-[0_26px_80px_rgba(239,68,68,0.16)]",
      };
    case "info":
      return {
        soft: "border-sky-200 bg-sky-50 text-sky-800",
        solid: "bg-sky-600 text-white",
        ring: "ring-sky-100",
        dot: "bg-sky-500",
        glow: "shadow-[0_26px_80px_rgba(14,165,233,0.16)]",
      };
    default:
      return {
        soft: "border-stone-200 bg-stone-50 text-stone-800",
        solid: "bg-[#123725] text-white",
        ring: "ring-stone-100",
        dot: "bg-stone-500",
        glow: "shadow-[0_26px_80px_rgba(18,55,37,0.12)]",
      };
  }
}

function stepState(index: number, currentStep: number, tone: Tone) {
  if (index < currentStep) return "done";
  if (index === currentStep) return tone === "danger" ? "danger" : "active";
  return "pending";
}

function ReviewWindowCard({ app }: { app: Application }) {
  const review = getReviewWindow(app);

  if (app.payment_status !== "confirmed") {
    return null;
  }

  return (
    <section className="rounded-[34px] border border-[#e7decf] bg-white p-6 shadow-[0_24px_70px_rgba(18,55,37,0.08)]">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-800">
            نافذة المراجعة المتوقعة
          </p>

          <h2 className="text-2xl font-black text-[#123725]">
            {review.isOverdue ? "ملفك ضمن أولوية المتابعة" : "المراجعة النهائية قيد التنفيذ"}
          </h2>

          <p className="mt-3 max-w-2xl text-sm font-bold leading-8 text-[#657166]">
            عادةً تظهر نتيجة الدراسة خلال 24 إلى 72 ساعة عمل بعد تأكيد رسوم فتح الملف.
            بعض الملفات قد تحتاج وقتًا إضافيًا للتحقق من البيانات بدون أن يعني ذلك رفض الطلب.
          </p>
        </div>

        <div className="grid min-w-full gap-3 sm:grid-cols-3 md:min-w-[390px]">
          <MiniMetric label="بدأت المراجعة" value={formatDate(review.start)} />
          <MiniMetric label="أقرب وقت متوقع" value={formatDate(review.min)} />
          <MiniMetric label="الحد المتوقع" value={formatDate(review.max)} />
        </div>
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-3xl border border-[#efe5d4] bg-[#fffaf1] p-4">
      <p className="text-xs font-black text-[#8d7954]">{label}</p>
      <p className="mt-2 text-sm font-black leading-7 text-[#123725]">{value || "—"}</p>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-3xl border border-[#efe5d4] bg-[#fffdf8] p-5 shadow-[0_16px_42px_rgba(18,55,37,0.05)]">
      <p className="text-xs font-black text-[#8a7b62]">{label}</p>
      <p className="mt-2 break-words text-base font-black leading-7 text-[#123725]">
        {value === null || value === undefined || value === "" ? "—" : value}
      </p>
    </div>
  );
}

function TrustItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-[#e9ddc9] bg-white/80 p-5">
      <p className="text-sm font-black text-[#123725]">{title}</p>
      <p className="mt-2 text-xs font-bold leading-7 text-[#687266]">{text}</p>
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
          payment_confirmed_at,
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
        console.error("Track page lookup error:", error);
        errorMessage = "حدث خطأ أثناء البحث عن الطلب. حاول مرة أخرى.";
      } else if (!data) {
        errorMessage =
          "لم يتم العثور على طلب مطابق. تأكد من رقم الهاتف ورقم التتبع.";
      } else {
        application = data as Application;
      }
    }
  }

  const statusView = application ? getStatusView(application) : null;
  const colors = statusView ? toneClasses(statusView.tone) : toneClasses("neutral");
  const whatsappMessage =
    application && statusView ? getTrackWhatsAppMessage(application, statusView) : "";
  const whatsappHref = whatsappMessage ? getWhatsAppFollowUpUrl(whatsappMessage) : "#";
  const progress = application && statusView ? progressPercent(application, statusView) : 0;

  const timeline = [
    {
      title: "استلام الطلب",
      text: "وصلت بياناتك للنظام",
    },
    {
      title: "المراجعة المبدئية",
      text: "تقييم أولي للبيانات",
    },
    {
      title: "استكمال الملف",
      text: "فتح الملف أو مستندات داعمة",
    },
    {
      title: "الدراسة النهائية",
      text: "مراجعة قبل القرار",
    },
    {
      title: "القرار",
      text: "قبول أو عدم موافقة",
    },
  ];

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-x-hidden bg-[#f6efe3] px-4 py-6 text-[#123725] sm:py-10"
    >
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(214,181,107,0.24),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(55,183,93,0.14),transparent_30%),linear-gradient(135deg,#fffaf1_0%,#f6efe3_44%,#efe3cf_100%)]" />
        <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(135deg,rgba(130,92,30,0.28)_1px,transparent_1px),linear-gradient(45deg,rgba(18,55,37,0.16)_1px,transparent_1px)] [background-size:52px_52px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <header className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <Link
              href="/"
              className="inline-flex w-fit rounded-2xl border border-[#ddc78f] bg-white/80 px-4 py-2 text-sm font-black text-[#123725] shadow-sm transition hover:bg-white"
            >
              الرجوع للرئيسية
            </Link>

            <div className="text-right md:text-left">
              <p className="text-xs font-black text-[#9a782d]">Customer Status Center</p>
              <h1 className="mt-1 text-2xl font-black text-[#123725]">
                متابعة طلبك لدى {BUSINESS_NAME}
              </h1>
            </div>
          </div>
        </header>

        <section className="mb-6 overflow-hidden rounded-[38px] border border-[#ddc78f] bg-white/86 p-[1px] shadow-[0_30px_110px_rgba(77,54,19,0.16)] backdrop-blur">
          <div className="rounded-[37px] bg-[linear-gradient(135deg,#ffffff_0%,#fffaf0_48%,#f7eddc_100%)] p-6 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
              <div>
                <p className="mb-4 inline-flex rounded-full border border-[#d6b56b]/40 bg-[#fff7e6] px-4 py-2 text-xs font-black text-[#8a6518]">
                  متابعة آمنة وواضحة بدون تعقيد
                </p>

                <h2 className="text-4xl font-black leading-[1.35] text-[#123725] sm:text-5xl">
                  اعرف حالة طلبك بخطوة واحدة
                </h2>

                <p className="mt-4 max-w-2xl text-sm font-bold leading-8 text-[#657166]">
                  أدخل رقم الهاتف ورقم التتبع، وسيظهر لك آخر تحديث واضح ومريح، مع الخطوة المطلوبة منك فقط إن وجدت.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <TrustItem
                    title="لا يوجد دفع مفاجئ"
                    text="أي دفع يظهر فقط بعد تأهيل الطلب وإرسال تعليمات رسمية."
                  />
                  <TrustItem
                    title="الخطوة المطلوبة واضحة"
                    text="إذا كان هناك كفيل أو كشف راتب سيظهر ذلك بشكل مباشر."
                  />
                  <TrustItem
                    title="تحديثات عبر واتساب"
                    text="التواصل الرسمي يكون من خلال رقم الأمين المعتمد."
                  />
                </div>
              </div>

              <form className="rounded-[34px] border border-[#e8dac4] bg-[#fffdf8] p-5 shadow-[0_26px_75px_rgba(18,55,37,0.09)]">
                <h3 className="text-xl font-black text-[#123725]">بيانات التتبع</h3>
                <p className="mt-2 text-xs font-bold leading-6 text-[#687266]">
                  استخدم نفس رقم الهاتف الذي تم تقديم الطلب به.
                </p>

                <div className="mt-5 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-black text-[#8a6518]">
                      رقم الهاتف
                    </span>
                    <input
                      name="phone"
                      defaultValue={phone}
                      inputMode="numeric"
                      placeholder="079XXXXXXX"
                      className="w-full rounded-2xl border border-[#e5d8c3] bg-white px-4 py-4 text-right text-base font-bold text-[#123725] outline-none transition placeholder:text-[#a69c8c] focus:border-[#c9a548] focus:ring-4 focus:ring-[#d6b56b]/15"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-black text-[#8a6518]">
                      رقم التتبع
                    </span>
                    <input
                      name="tracking"
                      defaultValue={tracking}
                      placeholder="AM-XXXXXXXXXXXX"
                      className="w-full rounded-2xl border border-[#e5d8c3] bg-white px-4 py-4 text-right text-base font-bold text-[#123725] outline-none transition placeholder:text-[#a69c8c] focus:border-[#c9a548] focus:ring-4 focus:ring-[#d6b56b]/15"
                    />
                  </label>

                  <button
                    type="submit"
                    className="cursor-pointer rounded-2xl bg-[#123725] px-5 py-4 text-base font-black text-white shadow-[0_16px_45px_rgba(18,55,37,0.24)] transition hover:-translate-y-0.5 hover:bg-[#0d2b1c]"
                  >
                    عرض حالة الطلب
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {errorMessage && (
          <section className="mb-6 rounded-[28px] border border-red-200 bg-red-50 p-5 text-sm font-black leading-8 text-red-800 shadow-sm">
            {errorMessage}
          </section>
        )}

        {application && statusView && (
          <div className="grid gap-6">
            <section className={`overflow-hidden rounded-[38px] border bg-white p-[1px] ${colors.glow} ${colors.soft}`}>
              <div className="rounded-[37px] bg-white p-6 sm:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-5">
                    <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl ${colors.solid} text-3xl font-black shadow-lg`}>
                      {statusView.tone === "success"
                        ? "✓"
                        : statusView.tone === "warning"
                        ? "!"
                        : statusView.tone === "danger"
                        ? "×"
                        : "●"}
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-black text-[#9a782d]">
                        {statusView.eyebrow}
                      </p>

                      <h2 className="text-4xl font-black leading-[1.35] text-[#123725]">
                        {statusView.title}
                      </h2>

                      <p className="mt-4 max-w-3xl text-base font-bold leading-9 text-[#5f6d62]">
                        {statusView.message}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-[#e8dac4] bg-[#fffaf1] p-5 text-center lg:min-w-[270px]">
                    <p className="text-xs font-black text-[#8a6518]">رقم التتبع</p>
                    <p className="mt-2 break-words text-2xl font-black text-[#123725]">
                      {application.tracking_id || application.id}
                    </p>
                    <p className="mt-3 text-xs font-bold text-[#81745f]">
                      الاسم: {maskName(application.full_name)}
                    </p>
                  </div>
                </div>

                <div className="mt-7">
                  <div className="mb-2 flex items-center justify-between text-xs font-black text-[#8a7b62]">
                    <span>تقدم الملف</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[#efe5d4]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#123725,#37b75d,#d6b56b)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[34px] border border-[#e7decf] bg-white p-6 shadow-[0_24px_70px_rgba(18,55,37,0.08)]">
                <p className="mb-2 inline-flex rounded-full border border-[#d6b56b]/40 bg-[#fff7e6] px-4 py-2 text-xs font-black text-[#8a6518]">
                  {statusView.actionTitle}
                </p>

                <h3 className="text-2xl font-black text-[#123725]">
                  {statusView.actionHref ? "يوجد إجراء مطلوب" : "لا يوجد إجراء مطلوب الآن"}
                </h3>

                <p className="mt-3 text-sm font-bold leading-8 text-[#657166]">
                  {statusView.actionDescription}
                </p>

                <div className="mt-5 flex flex-col gap-3">
                  {statusView.actionHref && statusView.actionLabel ? (
                    <a
                      href={statusView.actionHref}
                      className="inline-flex justify-center rounded-2xl bg-[#123725] px-5 py-4 text-sm font-black text-white shadow-[0_16px_45px_rgba(18,55,37,0.22)] transition hover:-translate-y-0.5 hover:bg-[#0d2b1c]"
                    >
                      {statusView.actionLabel}
                    </a>
                  ) : null}

                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex justify-center rounded-2xl border border-[#cdb06d] bg-[#fff8e8] px-5 py-4 text-sm font-black text-[#76591b] transition hover:bg-[#fff0c9]"
                  >
                    طلب تحديث عبر واتساب
                  </a>
                </div>
              </div>

              <div className="rounded-[34px] border border-[#e7decf] bg-white p-6 shadow-[0_24px_70px_rgba(18,55,37,0.08)]">
                <h3 className="text-2xl font-black text-[#123725]">
                  رحلة الطلب
                </h3>

                <div className="mt-5 grid gap-3 sm:grid-cols-5">
                  {timeline.map((step, index) => {
                    const state = stepState(index + 1, statusView.currentStep, statusView.tone);

                    return (
                      <div
                        key={step.title}
                        className={`rounded-3xl border p-4 text-center ${
                          state === "done"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : state === "active"
                            ? "border-[#d6b56b] bg-[#fff7e6] text-[#76591b] shadow-[0_16px_38px_rgba(214,181,107,0.16)]"
                            : state === "danger"
                            ? "border-red-200 bg-red-50 text-red-800"
                            : "border-[#eee1cf] bg-[#fffdf8] text-[#8d887f]"
                        }`}
                      >
                        <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-2xl border border-current/20 bg-white/60 text-sm font-black">
                          {state === "done" ? "✓" : index + 1}
                        </div>
                        <p className="text-xs font-black">{step.title}</p>
                        <p className="mt-1 text-[11px] font-bold leading-5 opacity-80">
                          {step.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <ReviewWindowCard app={application} />

            <section className="rounded-[34px] border border-[#e7decf] bg-white p-6 shadow-[0_24px_70px_rgba(18,55,37,0.08)]">
              <h3 className="text-2xl font-black text-[#123725]">
                تفاصيل الطلب
              </h3>

              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <DetailCard label="الجهاز المطلوب" value={application.device_name || "غير محدد"} />
                <DetailCard label="مدة التقسيط" value={application.installment_months ? `${application.installment_months} شهر` : "—"} />
                <DetailCard label="القسط الشهري التقريبي" value={formatMoney(application.monthly_payment)} />
                <DetailCard label="الدفعة الأولى" value={formatMoney(application.down_payment)} />
                <DetailCard label="سعر الجهاز" value={formatMoney(application.device_price)} />
                <DetailCard label="حالة فتح الملف" value={translatePaymentStatus(application.payment_status)} />
              </div>

              <details className="mt-5 rounded-3xl border border-[#efe5d4] bg-[#fffaf1] p-5">
                <summary className="cursor-pointer text-sm font-black text-[#76591b]">
                  عرض تفاصيل مالية إضافية
                </summary>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <DetailCard label="الإجمالي مع الفائدة" value={formatMoney(application.total_with_interest)} />
                  <DetailCard
                    label="وقت تسجيل الدفع"
                    value={formatDate(application.payment_confirmed_at || application.paid_clicked_at)}
                  />
                </div>
              </details>
            </section>

            <section className="rounded-[34px] border border-[#e7decf] bg-[#123725] p-6 text-white shadow-[0_24px_70px_rgba(18,55,37,0.18)]">
              <h3 className="text-2xl font-black">أسئلة مهمة</h3>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/7 p-5">
                  <p className="font-black">هل دفع رسوم فتح الملف يعني موافقة نهائية؟</p>
                  <p className="mt-2 text-sm font-bold leading-7 text-white/75">
                    لا. الرسوم تعني فتح ملف الدراسة النهائية فقط، والقرار يصدر بعد مراجعة البيانات.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/7 p-5">
                  <p className="font-black">هل يوجد قسط أول الآن؟</p>
                  <p className="mt-2 text-sm font-bold leading-7 text-white/75">
                    لا. القسط الأول لا يُدفع الآن، ويكون بعد الاستلام حسب الاتفاق.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/7 p-5">
                  <p className="font-black">متى أحتاج كفيل أو كشف راتب؟</p>
                  <p className="mt-2 text-sm font-bold leading-7 text-white/75">
                    فقط إذا طلبت الإدارة ذلك حسب متطلبات الدراسة النهائية، وسيظهر لك الرابط الرسمي عند الحاجة.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/7 p-5">
                  <p className="font-black">كيف أعرف التحديث الرسمي؟</p>
                  <p className="mt-2 text-sm font-bold leading-7 text-white/75">
                    من صفحة التتبع هذه أو من واتساب الأمين الرسمي فقط.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
