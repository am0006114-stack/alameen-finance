import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendDiscordNotification } from "@/lib/discord";

type ApplicationRecord = {
  id: string;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  device_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
};

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

function normalizeJordanPhoneForWhatsApp(phone: string | null | undefined) {
  if (!phone) return "";

  const digits = phone.replace(/\D/g, "");

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

function shouldKeepCurrentPaymentStatus(application: ApplicationRecord) {
  const status = application.status || "";
  const paymentStatus = application.payment_status || "";

  return (
    paymentStatus === "customer_claimed_paid" ||
    paymentStatus === "confirmed" ||
    status === "pending_payment_confirmation" ||
    status === "under_review" ||
    status === "approved" ||
    status === "needs_guarantor" ||
    status === "needs_salary_slip" ||
    status === "rejected" ||
    status === "cancelled"
  );
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const applicationId = String(formData.get("applicationId") || "").trim();

  const baseUrl = getBaseUrl(request);

  if (!applicationId) {
    return NextResponse.redirect(`${baseUrl}/admin`);
  }

  const { data: application, error } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name, status, payment_status")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !application) {
    return NextResponse.redirect(`${baseUrl}/admin`);
  }

  const currentApplication = application as ApplicationRecord;
  const tracking = currentApplication.tracking_id || currentApplication.id;
  const phone = currentApplication.phone || "";
  const customerName = firstTwoNames(currentApplication.full_name);
  const cleanPhone = normalizeJordanPhoneForWhatsApp(phone);

  const receiptLink = `${baseUrl}/receipt?tracking=${encodeURIComponent(
    tracking
  )}&phone=${encodeURIComponent(phone)}`;

  if (!shouldKeepCurrentPaymentStatus(currentApplication)) {
    await supabaseAdmin
      .from("applications")
      .update({
        payment_status: "pending",
      })
      .eq("id", applicationId);
  }

  await sendDiscordNotification({
    title: "📨 تم إرسال رابط رفع وصل الدفع",
    description: shouldKeepCurrentPaymentStatus(currentApplication)
      ? "تم فتح رابط رفع الوصل، لكن لم يتم إرجاع حالة الطلب للخلف لأن الوصل مرفوع/الدفع مؤكد سابقًا."
      : "تم فتح واتساب برسالة رابط رفع وصل رسوم فتح الملف.",
    color: 0xd6b56b,
    fields: [
      { name: "الاسم", value: customerName, inline: true },
      { name: "الهاتف", value: phone || "—", inline: true },
      { name: "رقم التتبع", value: tracking || "—", inline: true },
      { name: "الجهاز", value: currentApplication.device_name || "—", inline: false },
      { name: "رابط رفع الوصل", value: receiptLink, inline: false },
      { name: "حالة الدفع الحالية", value: currentApplication.payment_status || "—", inline: true },
      { name: "حالة الطلب الحالية", value: currentApplication.status || "—", inline: true },
    ],
  });

  if (!cleanPhone) {
    return NextResponse.redirect(`${baseUrl}/admin/applications/${applicationId}`);
  }

  const message = `أهلًا ${customerName} 🌿

يرجى رفع صورة وصل الدفع من الرابط التالي:

${receiptLink}

رقم التتبع:
${tracking}

بعد رفع الوصل سيتم تحويله لقسم المراجعة وتأكيد العملية.

الأمين للأقساط`;

  return NextResponse.redirect(
    `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
  );
}
