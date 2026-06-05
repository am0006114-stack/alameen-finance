import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendDiscordNotification } from "@/lib/discord";

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

  const tracking = application.tracking_id || application.id;
  const phone = application.phone || "";
  const customerName = firstTwoNames(application.full_name);
  const cleanPhone = normalizeJordanPhoneForWhatsApp(phone);

  const salarySlipUrl = `${baseUrl}/salary-slip?tracking=${encodeURIComponent(
    tracking
  )}&phone=${encodeURIComponent(phone)}`;

  await supabaseAdmin
    .from("applications")
    .update({
      status: "salary_slip_link_sent",
    })
    .eq("id", applicationId)
    .eq("payment_status", "confirmed");

  await sendDiscordNotification({
    title: "📨 تم إرسال رابط كشف راتب رسمي",
    description:
      "تم فتح واتساب برسالة رابط رفع كشف راتب رسمي لاستكمال الدراسة النهائية.",
    color: 0xd6b56b,
    fields: [
      { name: "الاسم", value: customerName, inline: true },
      { name: "الهاتف", value: phone || "—", inline: true },
      { name: "رقم التتبع", value: tracking || "—", inline: true },
      { name: "الجهاز", value: application.device_name || "—", inline: false },
      { name: "رابط كشف الراتب", value: salarySlipUrl, inline: false },
      { name: "حالة الدفع", value: application.payment_status || "—", inline: true },
    ],
  });

  if (!cleanPhone) {
    return NextResponse.redirect(`${baseUrl}/admin/applications/${applicationId}`);
  }

  const message = `أهلًا ${customerName} 🌿

لاستكمال إجراءات الدراسة النهائية حسب متطلبات الموافقة، يرجى رفع كشف راتب رسمي حديث أو شهادة راتب صادرة من جهة العمل عبر الرابط التالي:

${salarySlipUrl}

رقم التتبع:
${tracking}

هذه الخطوة إجراء تنظيمي لاستكمال الملف، ولا تعني رفض الطلب.

الأمين للأقساط`;

  return NextResponse.redirect(
    `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
  );
}
