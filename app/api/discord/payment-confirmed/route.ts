import { NextResponse } from "next/server";

type RequestBody = {
  trackingId?: string;
  fullName?: string;
  phone?: string;
  paymentReference?: string;
};

function safeValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
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
            title: "💳 العميل أكد الدفع",
            description:
              "العميل ضغط تأكيد الدفع وأدخل رقم الوصل/الحركة. الطلب الآن بانتظار تأكيد الإدارة.",
            color: 5763719,
            fields: [
              {
                name: "رقم التتبع",
                value: safeValue(body.trackingId),
                inline: true,
              },
              {
                name: "اسم العميل",
                value: safeValue(body.fullName),
                inline: true,
              },
              {
                name: "رقم الهاتف",
                value: safeValue(body.phone),
                inline: true,
              },
              {
                name: "رقم الوصل / الحركة",
                value: safeValue(body.paymentReference),
                inline: false,
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