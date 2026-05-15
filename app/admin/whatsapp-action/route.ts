import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function makeWhatsAppUrl(phone: string, message: string) {
  const cleanPhone = normalizeJordanPhoneForWhatsApp(phone);

  if (!cleanPhone) {
    return "/";
  }

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const applicationId = String(formData.get("applicationId") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const actionType = String(formData.get("actionType") || "").trim();

  if (!applicationId || !phone || !message) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (actionType === "qualification_link_sent") {
    await supabaseAdmin
      .from("applications")
      .update({
        status: "qualification_link_sent",
        payment_status: "not_requested_yet",
      })
      .eq("id", applicationId);
  }

  if (actionType === "payment_info_sent") {
    await supabaseAdmin
      .from("applications")
      .update({
        payment_status: "payment_info_sent",
      })
      .eq("id", applicationId);
  }

  return NextResponse.redirect(makeWhatsAppUrl(phone, message));
}
