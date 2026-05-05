import { NextResponse } from "next/server";

type RequestBody = {
  trackingId?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  governorate?: string;
  cityArea?: string;
  salary?: number | string;
  guarantorName?: string;
  guarantorPhone?: string;
  applicantSocialSecurity?: boolean;
  guarantorSocialSecurity?: boolean;
  guarantorRelationship?: string;
  eligibilityPath?: string;
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
    case "guarantor_social_security_first_degree":
      return "الكفيل مشترك بالضمان + قرابة مقبولة";
    default:
      return path || "—";
  }
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

    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "الأمين للأقساط",
        embeds: [
          {
            title: "📩 طلب تمويل جديد",
            description: "وصل طلب تقسيط جديد من صفحة التقديم.",
            color: 15105570,
            fields: [
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
                name: "الإيميل",
                value: safeValue(body.email),
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
                name: "مقدم الطلب بالضمان؟",
                value: yesNo(body.applicantSocialSecurity),
                inline: true,
              },
              {
                name: "الكفيل بالضمان؟",
                value: yesNo(body.guarantorSocialSecurity),
                inline: true,
              },
              {
                name: "صلة القرابة",
                value: safeValue(body.guarantorRelationship),
                inline: true,
              },
              {
                name: "مسار الأهلية",
                value: translateEligibilityPath(body.eligibilityPath),
                inline: false,
              },
              {
                name: "الكفيل",
                value: safeValue(body.guarantorName),
                inline: true,
              },
              {
                name: "هاتف الكفيل",
                value: safeValue(body.guarantorPhone),
                inline: true,
              },
              {
                name: "حالة الطلب",
                value: safeValue(body.status),
                inline: true,
              },
              {
                name: "حالة الدفع",
                value: safeValue(body.paymentStatus),
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
            ],
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