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

type StatusView = {
  title: string;
  message: string;
  tone: "new" | "warning" | "success" | "danger" | "neutral";
  step: number;
};

function normalizePhone(value: string) {
  return value.trim().replace(/\D/g, "");
}

function getWhatsAppFollowUpUrl(message: string) {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
  const cleanNumber = number.replace(/\D/g, "");
  const encodedMessage = encodeURIComponent(message);

  if (cleanNumber) {
    return `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
  }

  return `https://wa.me/?text=${encodedMessage}`;
}

function getTrackWhatsAppMessage(app: Application, statusView: StatusView) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";

  return `مرحباً، أريد متابعة طلبي لدى الأمين للأقساط والتمويل.

رقم التتبع:
${tracking}

رقم الهاتف:
${phone}

حالة الطلب الحالية:
${statusView.title}

أرغب بالمساعدة أو معرفة الخطوة التالية.`;
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

function translatePaymentStatus(status: string | null | undefined) {
  switch (status) {
    case "not_requested_yet":
      return "لم يُطلب أي دفع";
    case "not_paid":
      return "لم يتم الدفع";
    case "pending":
    case "pending_payment":
      return "بانتظار استكمال خطوة الدفع";
    case "customer_claimed_paid":
      return "تم إرسال إشعار الدفع بانتظار تأكيد الإدارة";
    case "confirmed":
      return "تم تأكيد الدفع";
    case "rejected":
      return "الدفع غير مؤكد";
    default:
      return "غير مطلوب حالياً";
  }
}

function isPaymentConfirmed(app: Application) {
  return app.payment_status === "confirmed";
}

function getPaymentConfirmedDate(app: Application) {
  if (!isPaymentConfirmed(app)) return null;

  // مهم: لا نطلب أعمدة جديدة من Supabase هنا حتى لا تختفي الطلبات إذا العمود غير موجود.
  // نعتمد على paid_clicked_at إذا موجود، وإذا غير موجود نستخدم created_at كاحتياط.
  return app.paid_clicked_at || app.created_at || null;
}

function getReviewDeadline(app: Application) {
  const confirmedAt = getPaymentConfirmedDate(app);

  if (!confirmedAt) return null;

  const confirmedDate = new Date(confirmedAt);

  if (Number.isNaN(confirmedDate.getTime())) return null;

  return new Date(confirmedDate.getTime() + 72 * 60 * 60 * 1000);
}

function getMinimumReviewTime(app: Application) {
  const confirmedAt = getPaymentConfirmedDate(app);

  if (!confirmedAt) return null;

  const confirmedDate = new Date(confirmedAt);

  if (Number.isNaN(confirmedDate.getTime())) return null;

  return new Date(confirmedDate.getTime() + 24 * 60 * 60 * 1000);
}

function formatCountdownParts(targetDate: Date | null) {
  if (!targetDate) {
    return { days: "—", hours: "—", minutes: "—" };
  }

  const totalMs = Math.max(0, targetDate.getTime() - Date.now());
  const totalMinutes = Math.floor(totalMs / 1000 / 60);
  const days = Math.floor(totalMinutes / 60 / 24);
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes % 60;

  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
  };
}

function getStatusView(app: Application): StatusView {
  if (app.payment_status === "customer_claimed_paid") {
    return {
      title: "بانتظار تأكيد الإدارة",
      message:
        "تم تسجيل إشعار الدفع أو الوصل، والطلب الآن بانتظار مراجعة الإدارة. سيتم تحديث الحالة بعد التأكد.",
      tone: "warning",
      step: 3,
    };
  }

  if (app.payment_status === "confirmed" && app.status === "under_review") {
    return {
      title: "قيد الدراسة النهائية",
      message:
        "تم تأكيد الدفع وطلبك الآن قيد الدراسة النهائية. مدة المراجعة المتوقعة من لحظة تأكيد الدفع هي 24 إلى 72 ساعة.",
      tone: "success",
      step: 4,
    };
  }

  switch (app.status) {
    case "preliminary_application":
    case "submitted":
      return {
        title: "طلبك وصل للإدارة",
        message:
          "تم استلام طلبك كمراجعة مبدئية. إذا احتجنا أي معلومة إضافية سيتم التواصل معك عبر واتساب.",
        tone: "new",
        step: 1,
      };
    case "preliminary_qualified":
      return {
        title: "مؤهل مبدئياً",
        message:
          "طلبك مؤهل مبدئياً لاستكمال الخطوات التالية. يرجى متابعة واتساب لأن الإدارة سترسل لك المطلوب بشكل واضح.",
        tone: "success",
        step: 2,
      };
    case "needs_salary_slip":
      return {
        title: "بحاجة كشف راتب",
        message:
          "نحتاج كشف راتب أو شهادة راتب حديثة لاستكمال دراسة الطلب. يرجى متابعة رسالة واتساب من الإدارة.",
        tone: "warning",
        step: 2,
      };
    case "needs_guarantor":
      return {
        title: "بحاجة كفيل",
        message:
          "نحتاج إدخال بيانات كفيل لاستكمال دراسة الملف. سيتم إرسال رابط خاص عبر واتساب لتعبئة بيانات الكفيل داخل الموقع.",
        tone: "warning",
        step: 2,
      };
    case "guarantor_submitted":
      return {
        title: "تم استلام بيانات الكفيل",
        message:
          "تم استلام بيانات الكفيل وربطها بطلبك. الطلب الآن بانتظار متابعة الإدارة للخطوة التالية.",
        tone: "success",
        step: 3,
      };
    case "pending_payment":
    case "pending_payment_confirmation":
      return {
        title: "بانتظار استكمال خطوة",
        message:
          "طلبك بانتظار استكمال خطوة مطلوبة من الإدارة. يرجى متابعة واتساب أو انتظار تحديث الحالة.",
        tone: "warning",
        step: 3,
      };
    case "under_review":
      return {
        title: "قيد الدراسة",
        message:
          "طلبك قيد الدراسة حالياً. سيتم التواصل معك عند صدور القرار أو في حال الحاجة لأي معلومات إضافية.",
        tone: "new",
        step: 4,
      };
    case "approved":
      return {
        title: "تمت الموافقة المبدئية",
        message:
          "تمت الموافقة المبدئية على طلبك. سيتم التواصل معك لاستكمال الإجراءات النهائية، ويكون التسليم من مكاتبنا بعد توقيع العقد.",
        tone: "success",
        step: 5,
      };
    case "rejected":
      return {
        title: "لم تتم الموافقة حالياً",
        message:
          "نعتذر، لم تتم الموافقة على الطلب حالياً. يمكنك التواصل مع الإدارة لمعرفة التفاصيل العامة أو إمكانية التقديم لاحقاً.",
        tone: "danger",
        step: 5,
      };
    case "cancelled":
      return {
        title: "الطلب ملغي",
        message:
          "تم إلغاء هذا الطلب. إذا كان الإلغاء بالخطأ، يرجى التواصل مع الإدارة.",
        tone: "neutral",
        step: 5,
      };
    default:
      return {
        title: "قيد المتابعة",
        message:
          "طلبك قيد المتابعة. يرجى مراجعة الحالة لاحقاً أو انتظار التواصل عبر واتساب.",
        tone: "neutral",
        step: 1,
      };
  }
}

function badgeClass(tone: StatusView["tone"]) {
  switch (tone) {
    case "success":
      return "border-[rgba(105,217,123,0.32)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]";
    case "danger":
      return "border-red-400/30 bg-red-950/25 text-red-200";
    case "warning":
      return "border-[rgba(214,181,107,0.32)] bg-[rgba(214,181,107,0.10)] text-[#f3dfac]";
    case "new":
      return "border-sky-300/25 bg-sky-950/20 text-sky-200";
    default:
      return "border-white/10 bg-white/5 text-[#d7ddd5]";
  }
}

function timelineClass(index: number, activeStep: number, tone: StatusView["tone"]) {
  if (index < activeStep) {
    if (tone === "danger" && index === activeStep - 1) {
      return "border-red-400/30 bg-red-950/25 text-red-200";
    }

    return "border-[rgba(105,217,123,0.30)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]";
  }

  if (index === activeStep) {
    return "border-[rgba(214,181,107,0.32)] bg-[rgba(214,181,107,0.10)] text-[#f3dfac]";
  }

  return "border-white/10 bg-white/5 text-[#aeb9af]";
}

function statusIcon(tone: StatusView["tone"]) {
  switch (tone) {
    case "success":
      return "✓";
    case "warning":
      return "!";
    case "danger":
      return "×";
    case "new":
      return "●";
    default:
      return "•";
  }
}

function statusGlowClass(tone: StatusView["tone"]) {
  switch (tone) {
    case "success":
      return "border-[rgba(105,217,123,0.42)] bg-[rgba(105,217,123,0.14)] shadow-[0_0_0_1px_rgba(105,217,123,0.18),0_22px_70px_rgba(105,217,123,0.16)] text-[#b8f3c0]";
    case "warning":
      return "border-[rgba(214,181,107,0.46)] bg-[rgba(214,181,107,0.14)] shadow-[0_0_0_1px_rgba(214,181,107,0.18),0_22px_70px_rgba(214,181,107,0.13)] text-[#f3dfac]";
    case "danger":
      return "border-red-400/40 bg-red-950/30 shadow-[0_0_0_1px_rgba(248,113,113,0.18),0_22px_70px_rgba(127,29,29,0.18)] text-red-100";
    case "new":
      return "border-sky-300/30 bg-sky-950/25 shadow-[0_0_0_1px_rgba(125,211,252,0.13),0_22px_70px_rgba(14,116,144,0.13)] text-sky-100";
    default:
      return "border-white/10 bg-white/5 text-[#d7ddd5]";
  }
}

function statusShortHint(app: Application, statusView: StatusView) {
  if (app.payment_status === "confirmed") {
    return "تم فتح الملف وتحويله للدراسة النهائية";
  }

  if (app.payment_status === "customer_claimed_paid") {
    return "وصل الدفع بانتظار تأكيد الإدارة";
  }

  if (app.status === "preliminary_qualified") {
    return "";
  }

  if (app.status === "needs_salary_slip") {
    return "يلزم إرسال كشف راتب واضح";
  }

  if (app.status === "needs_guarantor") {
    return "يلزم إدخال بيانات كفيل عبر الرابط";
  }

  if (app.status === "approved") {
    return "انتقل الطلب للإجراءات النهائية";
  }

  if (app.status === "rejected") {
    return "لم تتم الموافقة حالياً";
  }

  return statusView.message;
}

function fileOpenStatus(app: Application) {
  if (app.payment_status === "confirmed") {
    return {
      title: "تم فتح الملف",
      description: "تم تأكيد خطوة الدفع، وملفك الآن داخل الدراسة النهائية.",
      icon: "✓",
      tone: "success" as const,
    };
  }

  if (app.payment_status === "customer_claimed_paid") {
    return {
      title: "وصل الدفع قيد التأكيد",
      description: "تم استلام إشعار الدفع، وبانتظار مطابقة الوصل من الإدارة.",
      icon: "⌛",
      tone: "warning" as const,
    };
  }

  if (
    app.payment_status === "pending" ||
    app.payment_status === "pending_payment" ||
    app.status === "preliminary_qualified"
  ) {
    return {
      title: "بانتظار فتح الملف",
      description: "طلبك مؤهل مبدئياً، وسيتم استكمال فتح الملف حسب تعليمات الإدارة.",
      icon: "↗",
      tone: "warning" as const,
    };
  }

  return {
    title: "لم يُطلب فتح الملف بعد",
    description: "طلبك ما زال في مرحلة المراجعة المبدئية، ولا يوجد أي دفع مطلوب حالياً.",
    icon: "•",
    tone: "neutral" as const,
  };
}

function paymentStageClass(tone: "success" | "warning" | "neutral") {
  switch (tone) {
    case "success":
      return "border-[rgba(105,217,123,0.35)] bg-[rgba(105,217,123,0.10)] text-[#b8f3c0]";
    case "warning":
      return "border-[rgba(214,181,107,0.35)] bg-[rgba(214,181,107,0.10)] text-[#f3dfac]";
    default:
      return "border-white/10 bg-white/5 text-[#d7ddd5]";
  }
}

function nextStepText(app: Application, statusView: StatusView) {
  if (app.payment_status === "confirmed") {
    return "الآن المطلوب منك فقط انتظار نتيجة الدراسة النهائية خلال 24 إلى 72 ساعة، مع إبقاء واتساب متاحاً لأي استفسار من الإدارة.";
  }

  if (app.payment_status === "customer_claimed_paid") {
    return "لا تعيد الدفع. فقط انتظر تأكيد الإدارة لوصل الدفع، وسيتم تحديث الحالة فور المطابقة.";
  }

  if (app.status === "preliminary_qualified") {
    return "تابع واتساب لأن الإدارة سترسل لك تعليمات فتح الملف والخطوة التالية بشكل واضح.";
  }

  if (app.status === "needs_salary_slip") {
    return "أرسل كشف راتب أو شهادة راتب حديثة عبر واتساب حتى نكمل دراسة الطلب.";
  }

  if (app.status === "needs_guarantor") {
    return "افتح رابط الكفيل المرسل عبر واتساب وأكمل بياناته حتى يتحرك الطلب للخطوة التالية.";
  }

  if (app.status === "approved") {
    return "تابع واتساب لاستكمال توقيع العقد وترتيب الاستلام من مكاتبنا.";
  }

  if (app.status === "rejected") {
    return "يمكنك التواصل مع الإدارة لمعرفة التفاصيل العامة أو إمكانية إعادة التقديم لاحقاً.";
  }

  return statusView.message;
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

  const statusView = application ? getStatusView(application) : null;
  const paymentConfirmedAt = application ? getPaymentConfirmedDate(application) : null;
  const minimumReviewTime = application ? getMinimumReviewTime(application) : null;
  const reviewDeadline = application ? getReviewDeadline(application) : null;
  const countdown = formatCountdownParts(reviewDeadline || null);
  const whatsappMessage =
    application && statusView ? getTrackWhatsAppMessage(application, statusView) : "";
  const whatsappHref = whatsappMessage ? getWhatsAppFollowUpUrl(whatsappMessage) : "#";
  const fileStatus = application ? fileOpenStatus(application) : null;

  const timeline = [
    "تم استلام الطلب",
    "المراجعة المبدئية",
    "استكمال المطلوب",
    "الدراسة النهائية",
    "القرار",
  ];

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
                تتبع طلب الموافقة المبدئية
              </h1>

              <p className="mx-auto mt-4 max-w-2xl text-sm font-bold leading-8 text-[#cbd6cb]">
                أدخل رقم الهاتف المستخدم في الطلب مع رقم التتبع لمعرفة آخر حالة
                للطلب. إذا احتجنا أي إجراء إضافي سيتم التواصل معك عبر واتساب.
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

        {application && statusView && (
          <section className="glass-panel gold-outline mt-6 rounded-[32px] p-6 shadow-xl">
            <div className={`mb-6 overflow-hidden rounded-[34px] border p-1 ${statusGlowClass(statusView.tone)}`}>
              <div className="relative rounded-[32px] border border-white/10 bg-[rgba(3,18,14,0.66)] p-6">
                <div className="absolute left-5 top-5 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-45" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-current" />
                </div>

                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 animate-pulse items-center justify-center rounded-3xl border border-white/15 bg-white/10 text-3xl font-black">
                      {statusIcon(statusView.tone)}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-black opacity-80">
                        الحالة الحالية للطلب
                      </p>

                      <h2 className="text-3xl font-black leading-tight text-white md:text-4xl">
                        {statusView.title}
                      </h2>

                      <p className="mt-3 max-w-2xl text-sm font-bold leading-8 text-[#d7ddd5]">
                        {statusShortHint(application, statusView)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-[rgba(214,181,107,0.22)] bg-[rgba(2,18,14,0.72)] p-4 text-center">
                    <p className="text-xs font-black text-[#f3dfac]">رقم التتبع</p>
                    <p className="mt-2 break-words text-2xl font-black text-white md:text-3xl">
                      {application.tracking_id}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {fileStatus && (
              <div className={`mb-6 rounded-[30px] border p-5 ${paymentStageClass(fileStatus.tone)}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-2xl font-black">
                      {fileStatus.icon}
                    </div>

                    <div>
                      <p className="text-xl font-black text-white">
                        {fileStatus.title}
                      </p>
                      <p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">
                        {fileStatus.description}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex rounded-full border border-white/15 bg-black/20 px-4 py-2 text-xs font-black">
                    حالة فتح الملف
                  </span>
                </div>
              </div>
            )}

            {isPaymentConfirmed(application) && (
              <div className="mb-6 overflow-hidden rounded-[32px] border border-[rgba(105,217,123,0.38)] bg-[linear-gradient(135deg,rgba(105,217,123,0.18),rgba(214,181,107,0.13),rgba(3,18,14,0.92))] p-1 shadow-[0_22px_70px_rgba(25,135,84,0.18)]">
                <div className="rounded-[30px] border border-white/10 bg-[rgba(3,18,14,0.55)] p-6">
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="mb-3 inline-flex rounded-full border border-[rgba(105,217,123,0.36)] bg-[rgba(105,217,123,0.12)] px-4 py-2 text-sm font-black text-[#b8f3c0]">
                        ✅ تم تأكيد الدفع
                      </div>

                      <h2 className="text-2xl font-black text-white md:text-3xl">
                        طلبك دخل مرحلة الدراسة النهائية
                      </h2>

                      <p className="mt-3 max-w-2xl text-sm font-bold leading-8 text-[#d7ddd5]">
                        تم تأكيد خطوة الدفع بنجاح. تبدأ مدة المراجعة النهائية من لحظة تأكيد الدفع، والرد المتوقع يكون خلال 24 إلى 72 ساعة حسب ضغط الطلبات والتحقق من البيانات.
                      </p>

                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-5 inline-flex rounded-2xl border border-[rgba(105,217,123,0.38)] bg-[linear-gradient(135deg,#69d97b,#35c98e)] px-5 py-3 text-sm font-black text-[#03120e] shadow-[0_14px_40px_rgba(105,217,123,0.18)] transition hover:scale-[1.01]"
                      >
                        تواصل معنا على واتساب بخصوص الدراسة النهائية
                      </a>
                    </div>

                    <div className="rounded-3xl border border-[rgba(214,181,107,0.22)] bg-[rgba(2,18,14,0.72)] p-5 text-center">
                      <p className="text-xs font-black text-[#f3dfac]">
                        العد التنازلي للحد الأقصى
                      </p>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl bg-[rgba(255,255,255,0.06)] px-3 py-3">
                          <p className="text-2xl font-black text-white">{countdown.days}</p>
                          <p className="mt-1 text-[11px] font-bold text-[#aeb9af]">يوم</p>
                        </div>
                        <div className="rounded-2xl bg-[rgba(255,255,255,0.06)] px-3 py-3">
                          <p className="text-2xl font-black text-white">{countdown.hours}</p>
                          <p className="mt-1 text-[11px] font-bold text-[#aeb9af]">ساعة</p>
                        </div>
                        <div className="rounded-2xl bg-[rgba(255,255,255,0.06)] px-3 py-3">
                          <p className="text-2xl font-black text-white">{countdown.minutes}</p>
                          <p className="mt-1 text-[11px] font-bold text-[#aeb9af]">دقيقة</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <InfoItem
                      label="وقت تأكيد الدفع"
                      value={formatDate(paymentConfirmedAt)}
                    />
                    <InfoItem
                      label="أقرب وقت متوقع للرد"
                      value={formatDate(minimumReviewTime?.toISOString())}
                    />
                    <InfoItem
                      label="الحد الأقصى المتوقع"
                      value={formatDate(reviewDeadline?.toISOString())}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6 grid gap-2 md:grid-cols-5">
              {timeline.map((item, index) => (
                <div
                  key={item}
                  className={`relative rounded-2xl border px-3 py-3 text-center text-xs font-black ${timelineClass(
                    index + 1,
                    statusView.step,
                    statusView.tone
                  )} ${index + 1 === statusView.step ? "animate-pulse shadow-[0_0_30px_rgba(214,181,107,0.12)]" : ""}`}
                >
                  {index + 1 === statusView.step && (
                    <span className="absolute left-2 top-2 h-2 w-2 rounded-full bg-current" />
                  )}
                  <div className="mb-1 text-lg">
                    {index + 1 < statusView.step ? "✓" : index + 1 === statusView.step ? statusIcon(statusView.tone) : index + 1}
                  </div>
                  {item}
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <InfoItem label="الاسم" value={maskName(application.full_name)} />
              <InfoItem
                label="تاريخ الطلب"
                value={formatDate(application.created_at)}
              />
              <InfoItem label="حالة الطلب" value={statusView.title} />
              <InfoItem
                label="حالة الخطوات المالية"
                value={translatePaymentStatus(application.payment_status)}
              />
              <InfoItem
                label="فتح الملف"
                value={fileStatus?.title}
              />
              <InfoItem
                label="آخر تحديث مالي"
                value={application.payment_status === "confirmed" ? "تم تأكيد الدفع" : translatePaymentStatus(application.payment_status)}
              />
            </div>

            <div className="mt-5 rounded-3xl border border-[rgba(214,181,107,0.24)] bg-[linear-gradient(135deg,rgba(214,181,107,0.10),rgba(3,18,14,0.72))] p-5">
              <h3 className="gold-text mb-2 text-base font-black">
                الخطوة التالية بوضوح
              </h3>

              <p className="text-sm font-bold leading-8 text-[#d7ddd5]">
                {nextStepText(application, statusView)}
              </p>
            </div>

            <div className="mt-6 overflow-hidden rounded-[30px] border border-[rgba(105,217,123,0.30)] bg-[linear-gradient(135deg,rgba(105,217,123,0.12),rgba(214,181,107,0.09),rgba(3,18,14,0.86))] p-1 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
              <div className="rounded-[28px] border border-white/10 bg-[rgba(3,18,14,0.54)] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-black text-white">
                      تحتاج مساعدة أو متابعة أسرع؟
                    </p>

                    <p className="mt-2 text-sm font-bold leading-7 text-[#d7ddd5]">
                      افتح واتساب برسالة جاهزة تحتوي رقم التتبع وحالة طلبك الحالية حتى نقدر نساعدك بسرعة.
                    </p>
                  </div>

                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="green-button rounded-2xl px-5 py-4 text-center text-sm font-black transition"
                  >
                    تواصل معنا على واتساب
                  </a>
                </div>
              </div>
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

            {(application.payment_reference || application.paid_clicked_at) && (
              <div className="glass-panel-strong mt-6 rounded-[28px] p-5 shadow-sm">
                <h3 className="gold-text mb-4 text-xl font-black">
                  معلومات خطوة الدفع
                </h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <InfoItem
                    label="مرجع الدفع"
                    value={application.payment_reference}
                  />

                  <InfoItem
                    label="وقت تسجيل الدفع"
                    value={formatDate(application.paid_clicked_at)}
                  />
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
