import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findApplicationByTrackingAndPhone } from "@/app/api/whatsapp/webhook/_lib/applicationLookup";
import { normalizeWhatsAppToSend } from "@/app/api/whatsapp/webhook/_lib/text";

export const dynamic = "force-dynamic";

const ALLOWED_CAPACITIES = new Set(["64GB", "128GB", "256GB", "512GB", "1TB"]);

function cleanField(value: FormDataEntryValue | null, maxLength: number) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function redirectToPage(request: Request, input: Record<string, string>) {
  const url = new URL("/change-device", request.url);
  for (const [key, value] of Object.entries(input)) {
    if (value) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 303 });
}

async function sendDiscordNotification(input: {
  tracking: string;
  customerName: string;
  phone: string;
  currentDevice: string;
  requestedDevice: string;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "📱 طلب تعديل جهاز من الرابط الرسمي",
            color: 0x57f287,
            description: "تم تسجيل الطلب للمتابعة فقط. الجهاز الحالي لم يتغير تلقائيًا.",
            fields: [
              { name: "رقم التتبع", value: input.tracking, inline: false },
              { name: "العميل", value: input.customerName || "غير محدد", inline: true },
              { name: "رقم الهاتف", value: input.phone || "غير محدد", inline: true },
              { name: "الجهاز الحالي", value: input.currentDevice || "غير محدد", inline: false },
              { name: "التعديل المطلوب", value: input.requestedDevice, inline: false },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (error) {
    console.error("change-device Discord notification failed:", error);
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const tracking = cleanField(form.get("tracking"), 40).toUpperCase();
  const phone = cleanField(form.get("phone"), 30);
  const device = cleanField(form.get("device"), 80);
  const capacity = cleanField(form.get("capacity"), 10).toUpperCase();
  const color = cleanField(form.get("color"), 40);
  const alternateColor = cleanField(form.get("alternateColor"), 40);
  const acknowledged = cleanField(form.get("acknowledged"), 2) === "1";

  if (!tracking || !phone || !device || !color || !acknowledged || !ALLOWED_CAPACITIES.has(capacity)) {
    return redirectToPage(request, { tracking, phone, error: "missing_fields" });
  }

  const application = await findApplicationByTrackingAndPhone(tracking, phone);
  if (!application) {
    return redirectToPage(request, { tracking, phone, error: "invalid_request" });
  }

  const requestedDevice = [
    device,
    capacity,
    `اللون المطلوب: ${color}`,
    alternateColor ? `اللون البديل: ${alternateColor}` : "",
  ].filter(Boolean).join(" - ");

  const body = [
    "طلب تعديل جهاز من الرابط الرسمي:",
    `الجهاز الحالي: ${application.device_name || "غير محدد"}`,
    `الجهاز الجديد: ${device}`,
    `السعة: ${capacity}`,
    `اللون المطلوب: ${color}`,
    alternateColor ? `اللون البديل: ${alternateColor}` : "",
    "ملاحظة: الجهاز الحالي يبقى كما هو إلى أن تتم مراجعة التعديل واعتماده.",
  ].filter(Boolean).join("\n");

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: duplicate } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id")
    .eq("application_id", application.id)
    .eq("direction", "incoming")
    .eq("message_type", "form_submission")
    .eq("body", body)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  if (!duplicate) {
    const waId = normalizeWhatsAppToSend(application.phone || phone);
    const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
      wa_id: waId,
      direction: "incoming",
      customer_name: application.full_name || null,
      message_id: null,
      message_type: "form_submission",
      body,
      intent: "device_change",
      tracking_id: application.tracking_id || application.id,
      application_id: application.id,
      needs_human_review: true,
      handled_by_ai: false,
      raw_payload: {
        source: "change_device_form",
        current_device: application.device_name || null,
        requested_device: device,
        capacity,
        color,
        alternate_color: alternateColor || null,
      },
    });

    if (error) {
      console.error("change-device form insert failed:", error);
      return redirectToPage(request, { tracking, phone, error: "save_failed" });
    }

    await sendDiscordNotification({
      tracking: application.tracking_id || application.id,
      customerName: application.full_name || "",
      phone: application.phone || phone,
      currentDevice: application.device_name || "غير محدد",
      requestedDevice,
    });
  }

  return redirectToPage(request, {
    tracking,
    phone,
    submitted: "1",
    already: duplicate ? "1" : "",
  });
}
