import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ApplicationRecord = {
  id: string;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  status?: string | null;
  payment_status?: string | null;
  device_name?: string | null;
  preliminary_qualified_at?: string | null;
  preliminary_whatsapp_sent_at?: string | null;
  preliminary_whatsapp_status?: string | null;
  preliminary_whatsapp_error?: string | null;
};

type SendResult = {
  ok: boolean;
  status: number;
  responseText: string;
};

const DEFAULT_TEMPLATE_NAME = "preliminary_approval_continue_ar";
const DEFAULT_TEMPLATE_LANGUAGE = "ar";

function digitsOnly(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeWhatsAppToSend(value: string | null | undefined) {
  const digits = digitsOnly(value);

  if (!digits) return "";
  if (digits.startsWith("00962")) return digits.slice(2);
  if (digits.startsWith("962")) return digits;
  if (digits.startsWith("07") && digits.length === 10) return `962${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `962${digits}`;

  return digits;
}

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "عميلنا الكريم";
  if (parts.length === 1) return parts[0];

  return `${parts[0]} ${parts[1]}`;
}

function safeTemplateParameter(value: string | null | undefined) {
  const clean = String(value || "").trim();
  return clean || "—";
}

function buildPreviewText(app: ApplicationRecord) {
  return `تم إرسال Template الموافقة المبدئية للعميل.

الاسم: ${firstTwoNames(app.full_name)}
الجهاز: ${app.device_name || "الجهاز المطلوب"}
رقم التتبع: ${app.tracking_id || app.id}`;
}

async function logOutgoingWhatsApp(app: ApplicationRecord, to: string, body: string) {
  try {
    await supabaseAdmin.from("whatsapp_messages").insert({
      wa_id: to,
      direction: "outgoing",
      customer_name: app.full_name || null,
      message_id: null,
      message_type: "template",
      body,
    });
  } catch {
    // لا نوقف الكرون إذا جدول whatsapp_messages غير موجود أو فيه اختلاف أعمدة.
  }
}

async function sendPreliminaryApprovalTemplate(app: ApplicationRecord): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.GRAPH_API_VERSION || "v20.0";
  const templateName = process.env.WHATSAPP_PRELIMINARY_TEMPLATE_NAME || DEFAULT_TEMPLATE_NAME;
  const templateLanguage = process.env.WHATSAPP_PRELIMINARY_TEMPLATE_LANGUAGE || DEFAULT_TEMPLATE_LANGUAGE;

  if (!token || !phoneNumberId) {
    return {
      ok: false,
      status: 500,
      responseText: "Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID",
    };
  }

  const cleanTo = normalizeWhatsAppToSend(app.phone);

  if (!cleanTo) {
    return {
      ok: false,
      status: 400,
      responseText: "Missing or invalid customer WhatsApp phone",
    };
  }

  const body = {
    messaging_product: "whatsapp",
    to: cleanTo,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: templateLanguage,
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: safeTemplateParameter(firstTwoNames(app.full_name)),
            },
            {
              type: "text",
              text: safeTemplateParameter(app.device_name || "الجهاز المطلوب"),
            },
            {
              type: "text",
              text: safeTemplateParameter(app.tracking_id || app.id),
            },
          ],
        },
      ],
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const responseText = await response.text();

  if (response.ok) {
    await logOutgoingWhatsApp(app, cleanTo, buildPreviewText(app));
  }

  return {
    ok: response.ok,
    status: response.status,
    responseText,
  };
}

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) return true;

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  return querySecret === secret || bearer === secret;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const cronLimit = Number(process.env.PRELIMINARY_CRON_LIMIT || "25");
  const safeLimit = Number.isFinite(cronLimit) && cronLimit > 0 ? Math.min(cronLimit, 50) : 25;

  const { data: applications, error } = await supabaseAdmin
    .from("applications")
    .select(
      "id, tracking_id, full_name, phone, status, payment_status, device_name, preliminary_qualified_at, preliminary_whatsapp_sent_at, preliminary_whatsapp_status, preliminary_whatsapp_error"
    )
    .eq("status", "preliminary_qualified")
    .is("preliminary_whatsapp_sent_at", null)
    .order("preliminary_qualified_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  if (error) {
    console.error("Cron preliminary approval query failed:", error.message);

    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }

  const rows = (applications || []) as ApplicationRecord[];
  const results: Array<{
    id: string;
    tracking_id?: string | null;
    phone?: string | null;
    sent: boolean;
    error?: string;
  }> = [];

  for (const app of rows) {
    const cleanTo = normalizeWhatsAppToSend(app.phone);

    if (!cleanTo) {
      const errorMessage = "Missing or invalid phone";

      await supabaseAdmin
        .from("applications")
        .update({
          preliminary_whatsapp_status: "failed",
          preliminary_whatsapp_error: errorMessage,
        })
        .eq("id", app.id);

      results.push({
        id: app.id,
        tracking_id: app.tracking_id,
        phone: app.phone,
        sent: false,
        error: errorMessage,
      });

      continue;
    }

    const sendResult = await sendPreliminaryApprovalTemplate(app);

    if (sendResult.ok) {
      await supabaseAdmin
        .from("applications")
        .update({
          preliminary_whatsapp_sent_at: new Date().toISOString(),
          preliminary_whatsapp_status: "sent",
          preliminary_whatsapp_error: null,
        })
        .eq("id", app.id);

      results.push({
        id: app.id,
        tracking_id: app.tracking_id,
        phone: cleanTo,
        sent: true,
      });
    } else {
      const errorMessage = sendResult.responseText.slice(0, 1500);

      await supabaseAdmin
        .from("applications")
        .update({
          preliminary_whatsapp_status: "failed",
          preliminary_whatsapp_error: errorMessage,
        })
        .eq("id", app.id);

      results.push({
        id: app.id,
        tracking_id: app.tracking_id,
        phone: cleanTo,
        sent: false,
        error: errorMessage,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: rows.length,
    sent: results.filter((item) => item.sent).length,
    failed: results.filter((item) => !item.sent).length,
    results,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
