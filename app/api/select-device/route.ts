import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getProductById } from "@/lib/products";
import { calculateInstallment } from "@/lib/installments";
import { findApplicationByTrackingAndPhone } from "@/app/api/whatsapp/webhook/_lib/applicationLookup";
import { normalizeWhatsAppToSend } from "@/app/api/whatsapp/webhook/_lib/text";

export const dynamic = "force-dynamic";

const ALLOWED_MONTHS = new Set([12, 24, 36]);

function clean(value: FormDataEntryValue | null, maxLength: number) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function hasSpecificDevice(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  return !["الجهاز المطلوب", "غير محدد", "غير متوفر", "لم يتم اختيار جهاز", "بدون جهاز", "device"]
    .some((item) => normalized === item.toLowerCase());
}

function redirectToForm(request: Request, values: Record<string, string>) {
  const url = new URL("/select-device", request.url);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 303 });
}

async function notifyDiscord(input: {
  tracking: string;
  name: string;
  phone: string;
  device: string;
  price: number;
  months: number;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "📱 تم اختيار الجهاز لطلب قائم",
          color: 0x57f287,
          fields: [
            { name: "رقم التتبع", value: input.tracking, inline: false },
            { name: "العميل", value: input.name || "غير محدد", inline: true },
            { name: "الهاتف", value: input.phone || "غير محدد", inline: true },
            { name: "الجهاز", value: input.device, inline: false },
            { name: "السعر", value: `${input.price.toFixed(2)} د.أ`, inline: true },
            { name: "المدة", value: `${input.months} شهر`, inline: true },
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (error) {
    console.error("select-device Discord notification failed:", error);
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const tracking = clean(form.get("tracking"), 40).toUpperCase();
  const phone = clean(form.get("phone"), 30);
  const productId = clean(form.get("productId"), 80);
  const color = clean(form.get("color"), 80);
  const months = Number(clean(form.get("months"), 4));
  const rawDownPayment = Number(clean(form.get("downPayment"), 20) || 0);
  const product = getProductById(productId);

  if (!tracking || !phone || !product || !color || !ALLOWED_MONTHS.has(months) || !Number.isFinite(rawDownPayment) || rawDownPayment < 0) {
    return redirectToForm(request, { tracking, phone, error: "missing_fields" });
  }

  const application = await findApplicationByTrackingAndPhone(tracking, phone);
  if (!application) {
    return redirectToForm(request, { tracking, phone, error: "invalid_request" });
  }

  if (hasSpecificDevice(application.device_name)) {
    return redirectToForm(request, { tracking, phone, error: "already_has_device" });
  }

  const installment = calculateInstallment({
    price: product.price,
    months,
    downPayment: Math.min(rawDownPayment, product.price),
  });
  const deviceName = `${product.name} - ${product.model} - اللون المطلوب: ${color}`;

  const { error: updateError } = await supabaseAdmin
    .from("applications")
    .update({
      device_id: product.id,
      device_name: deviceName,
      device_price: product.price,
      installment_months: months,
      down_payment: installment.downPayment,
      interest_rate: installment.interestRate,
      monthly_payment: installment.monthly,
      total_with_interest: installment.totalWithInterest,
    })
    .eq("id", application.id);

  if (updateError) {
    console.error("select-device application update failed:", updateError);
    return redirectToForm(request, { tracking, phone, error: "save_failed" });
  }

  const messageBody = [
    "اختيار الجهاز الأول من الرابط الرسمي:",
    `الجهاز: ${product.name}`,
    `السعة: ${product.model}`,
    `اللون المطلوب: ${color}`,
    `مدة التقسيط: ${months} شهر`,
    `الدفعة الأولى: ${installment.downPayment.toFixed(2)} د.أ`,
  ].join("\n");

  await supabaseAdmin.from("whatsapp_messages").insert({
    wa_id: normalizeWhatsAppToSend(application.phone || phone),
    direction: "incoming",
    customer_name: application.full_name || null,
    message_id: null,
    message_type: "form_submission",
    body: messageBody,
    intent: "device_selection",
    tracking_id: application.tracking_id || application.id,
    application_id: application.id,
    needs_human_review: false,
    handled_by_ai: false,
    raw_payload: {
      source: "select_device_form",
      product_id: product.id,
      product_name: product.name,
      model: product.model,
      color,
      price: product.price,
      months,
      down_payment: installment.downPayment,
      monthly_payment: installment.monthly,
    },
  });

  await notifyDiscord({
    tracking: application.tracking_id || application.id,
    name: application.full_name || "",
    phone: application.phone || phone,
    device: deviceName,
    price: product.price,
    months,
  });

  return redirectToForm(request, { tracking, phone, submitted: "1" });
}
