import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isOperationalDate } from "@/app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar";

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

function safeTemplateParameter(value: string | number | null | undefined) {
  const clean = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/ {5,}/g, " ")
    .trim();

  return clean || "—";
}

function safeErrorText(value: string | null | undefined) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 1500);
}

function buildPreviewText(app: ApplicationRecord) {
  // Internal event metadata only. Phase 9 transcript readers exclude template_event
  // so this synthetic summary can never masquerade as customer-visible dialogue.
  return `PRELIMINARY_APPROVAL_TEMPLATE_SENT | name=${firstTwoNames(app.full_name)} | device=${app.device_name || "الجهاز المطلوب"} | tracking=${app.tracking_id || app.id}`;
}

async function logOutgoingWhatsApp(app: ApplicationRecord, to: string, body: string, providerMessageId?: string | null) {
  try {
    await supabaseAdmin.from("whatsapp_messages").insert({
      wa_id: to,
      direction: "outgoing",
      customer_name: app.full_name || null,
      message_id: providerMessageId || null,
      message_type: "template_event",
      body,
      tracking_id: app.tracking_id || null,
      application_id: app.id,
      raw_payload: {
        source: "preliminary_approval_cron",
        application_id: app.id,
        tracking_id: app.tracking_id || null,
        destination_wa_id: to,
      },
    });
  } catch {
    // لا نوقف الكرون إذا جدول whatsapp_messages غير موجود أو فيه اختلاف أعمدة.
  }
}

async function verifyTemplateApplicationOwnership(app: ApplicationRecord) {
  if (!app.tracking_id) return { ok: true as const };
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, phone")
    .eq("tracking_id", app.tracking_id)
    .limit(2);

  if (error) return { ok: false as const, error: `Ownership verification failed: ${error.message}` };
  const rows = (data || []) as Array<{ id: string; tracking_id?: string | null; phone?: string | null }>;
  if (rows.length !== 1 || rows[0]?.id !== app.id) {
    return { ok: false as const, error: `Tracking ownership collision for ${app.tracking_id}` };
  }
  if (normalizeWhatsAppToSend(rows[0]?.phone) !== normalizeWhatsAppToSend(app.phone)) {
    return { ok: false as const, error: `Tracking recipient mismatch for ${app.tracking_id}` };
  }
  return { ok: true as const };
}

async function reconcilePreviouslyDeliveredTemplate(app: ApplicationRecord) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("created_at,message_id")
    .eq("direction", "outgoing")
    .eq("message_type", "template_event")
    .eq("application_id", app.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;

  const deliveredAt = String((data as any).created_at || "").trim() || new Date().toISOString();
  await supabaseAdmin
    .from("applications")
    .update({
      preliminary_whatsapp_sent_at: deliveredAt,
      preliminary_whatsapp_status: "sent",
      preliminary_whatsapp_error: null,
    })
    .eq("id", app.id)
    .is("preliminary_whatsapp_sent_at", null);

  return true;
}

async function claimPreliminaryTemplateSend(appId: string) {
  const { data, error } = await supabaseAdmin
    .from("applications")
    .update({
      preliminary_whatsapp_status: "sending",
      preliminary_whatsapp_error: null,
    })
    .eq("id", appId)
    .is("preliminary_whatsapp_sent_at", null)
    .or("preliminary_whatsapp_status.is.null,preliminary_whatsapp_status.eq.failed")
    .select("id")
    .maybeSingle();

  if (error) return { claimed: false as const, error: error.message };
  return { claimed: Boolean(data), error: null as string | null };
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
      name: safeTemplateParameter(templateName),
      language: {
        code: safeTemplateParameter(templateLanguage),
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
  let providerMessageId: string | null = null;
  try {
    const parsed = JSON.parse(responseText);
    providerMessageId = String(parsed?.messages?.[0]?.id || "").trim() || null;
  } catch {
    providerMessageId = null;
  }

  if (response.ok) {
    await logOutgoingWhatsApp(app, cleanTo, buildPreviewText(app), providerMessageId);
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

  if (!isOperationalDate(new Date())) {
    return NextResponse.json({ ok: true, skipped: true, reason: "operational_weekend", message: "الجمعة والسبت لا تُنفذ فيهما دراسة أو إرسال موافقات تشغيلية؛ تبقى الطلبات في الانتظار حتى أول يوم تشغيل." });
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
    .or("preliminary_whatsapp_status.is.null,preliminary_whatsapp_status.eq.failed")
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
    skipped?: boolean;
    recovered?: boolean;
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

    if (await reconcilePreviouslyDeliveredTemplate(app)) {
      results.push({
        id: app.id,
        tracking_id: app.tracking_id,
        phone: cleanTo,
        sent: true,
        recovered: true,
      });
      continue;
    }

    const claim = await claimPreliminaryTemplateSend(app.id);
    if (!claim.claimed) {
      if (claim.error) {
        results.push({
          id: app.id,
          tracking_id: app.tracking_id,
          phone: cleanTo,
          sent: false,
          error: safeErrorText(claim.error),
        });
      } else {
        results.push({
          id: app.id,
          tracking_id: app.tracking_id,
          phone: cleanTo,
          sent: false,
          skipped: true,
        });
      }
      continue;
    }

    const ownership = await verifyTemplateApplicationOwnership(app);
    if (!ownership.ok) {
      const errorMessage = safeErrorText(ownership.error);
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
      const errorMessage = safeErrorText(sendResult.responseText);

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
    failed: results.filter((item) => !item.sent && !item.skipped).length,
    skipped: results.filter((item) => item.skipped).length,
    recovered: results.filter((item) => item.recovered).length,
    results,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
