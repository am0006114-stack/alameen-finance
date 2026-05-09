import { NextResponse } from "next/server";

type RequestBody = {
  trackingId?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  governorate?: string;
  cityArea?: string;
  salary?: number | string;

  locationLatitude?: number | string | null;
  locationLongitude?: number | string | null;
  locationAccuracy?: number | string | null;
  locationCapturedAt?: string | null;

  applicantSocialSecurity?: boolean;
  eligibilityPath?: string;

  deviceId?: string;
  deviceName?: string;
  devicePrice?: number | string;
  installmentMonths?: number | string;
  downPayment?: number | string;
  monthlyPayment?: number | string;

  status?: string;
  paymentStatus?: string;
};

function safeValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

function yesNo(value: boolean | undefined) {
  if (value === true) return "نعم";
  if (value === false) return "لا";
  return "—";
}

function formatJod(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return String(value);
  }

  return `${numberValue.toFixed(2)} د.أ`;
}

function translateEligibilityPath(path: string | undefined) {
  switch (path) {
    case "applicant_social_security":
      return "مقدم الطلب مشترك بالضمان";
    case "applicant_social_security_optional":
      return "مقدم الطلب اختار الضمان كمعلومة إضافية";
    case "standard_application_no_social_security_required":
      return "طلب عادي — الضمان غير إلزامي";
    case "guarantor_social_security_first_degree":
      return "الكفيل مشترك بالضمان + قرابة مقبولة";
    default:
      return path || "—";
  }
}

function translateStatus(status: string | undefined) {
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

function translatePaymentStatus(status: string | undefined) {
  switch (status) {
    case "not_requested_yet":
      return "لم يُطلب الدفع بعد";
    case "not_paid":
      return "غير مدفوع";
    case "pending":
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

function hasGps(body: RequestBody) {
  return Boolean(body.locationLatitude && body.locationLongitude);
}

function getGoogleMapsUrl(body: RequestBody) {
  if (!hasGps(body)) return "";

  return `https://www.google.com/maps?q=${encodeURIComponent(
    `${body.locationLatitude},${body.locationLongitude}`
  )}`;
}

function formatAccuracy(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return String(value);
  }

  return `${Math.round(numberValue)} متر تقريباً`;
}

export async function POST(request: Request) {
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, error: "DISCORD_WEBHOOK_URL is missing" },
        { status: 500 }
      );
    }

    const body = (await request.json()) as RequestBody;

    if (!body.trackingId) {
      return NextResponse.json(
        { success: false, error: "trackingId is required" },
        { status: 400 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const adminUrl = `${siteUrl}/admin`;
    const trackUrl = `${siteUrl}/track?phone=${encodeURIComponent(
      body.phone || ""
    )}&tracking=${encodeURIComponent(body.trackingId)}`;
    const mapsUrl = getGoogleMapsUrl(body);

    const fields = [
      {
        name: "رقم التتبع",
        value: safeValue(body.trackingId),
        inline: true,
      },
      {
        name: "الاسم",
        value: safeValue(body.fullName),
        inline: true,
      },
      {
        name: "الهاتف",
        value: safeValue(body.phone),
        inline: true,
      },
      {
        name: "المحافظة",
        value: safeValue(body.governorate),
        inline: true,
      },
      {
        name: "المنطقة",
        value: safeValue(body.cityArea),
        inline: true,
      },
      {
        name: "الراتب",
        value: formatJod(body.salary),
        inline: true,
      },
      {
        name: "الجهاز",
        value: safeValue(body.deviceName),
        inline: false,
      },
      {
        name: "سعر الجهاز",
        value: formatJod(body.devicePrice),
        inline: true,
      },
      {
        name: "مدة التقسيط",
        value: body.installmentMonths ? `${body.installmentMonths} شهر` : "—",
        inline: true,
      },
      {
        name: "الدفعة الأولى",
        value: formatJod(body.downPayment),
        inline: true,
      },
      {
        name: "القسط التقريبي",
        value: formatJod(body.monthlyPayment),
        inline: true,
      },
      {
        name: "مقدم الطلب بالضمان؟",
        value: yesNo(body.applicantSocialSecurity),
        inline: true,
      },
      {
        name: "مسار الأهلية",
        value: translateEligibilityPath(body.eligibilityPath),
        inline: false,
      },
      {
        name: "GPS",
        value: hasGps(body) ? "موجود ✅" : "غير محدد",
        inline: true,
      },
      {
        name: "دقة GPS",
        value: formatAccuracy(body.locationAccuracy),
        inline: true,
      },
      {
        name: "وقت GPS",
        value: safeValue(body.locationCapturedAt),
        inline: true,
      },
      {
        name: "حالة الطلب",
        value: translateStatus(body.status),
        inline: true,
      },
      {
        name: "حالة الخطوات المالية",
        value: translatePaymentStatus(body.paymentStatus),
        inline: true,
      },
      {
        name: "لوحة الإدارة",
        value: adminUrl,
        inline: false,
      },
      {
        name: "رابط تتبع العميل",
        value: trackUrl,
        inline: false,
      },
    ];

    if (mapsUrl) {
      fields.splice(fields.length - 2, 0, {
        name: "Google Maps",
        value: mapsUrl,
        inline: false,
      });
    }

    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "الأمين للأقساط",
        embeds: [
          {
            title: "📩 طلب موافقة مبدئية جديد",
            description:
              "وصل طلب جديد من صفحة التقديم. راجع البيانات والهوية من لوحة الإدارة.",
            color: 15105570,
            fields,
            footer: {
              text: "Al Ameen Finance System",
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    if (!discordResponse.ok) {
      const text = await discordResponse.text();

      return NextResponse.json(
        { success: false, error: text },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
