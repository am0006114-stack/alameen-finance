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

function cleanAmount(value: string) {
  return value.trim().replace(/[^\d.]/g, "");
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const applicationId = String(formData.get("applicationId") || "").trim();
  const amount = cleanAmount(String(formData.get("amount") || ""));

  const baseUrl = getBaseUrl(request);

  if (!applicationId) {
    return NextResponse.redirect(`${baseUrl}/admin`);
  }

  const { data: application, error } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name")
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
  )}&phone=${encodeURIComponent(phone)}${
    amount ? `&amount=${encodeURIComponent(amount)}` : ""
  }`;

  await supabaseAdmin
    .from("applications")
    .update({
      status: "salary_slip_link_sent",
      payment_status: "not_requested_yet",
    })
    .eq("id", applicationId);

  await sendDiscordNotification({
    title: "📨 تم إرسال رابط كشف الراتب / القسط الأول",
    description:
      "تم فتح واتساب برسالة رابط استكمال الدراسة للعميل من لوحة الإدارة.",
    color: 0xd6b56b,
    fields: [
      { name: "الاسم", value: customerName, inline: true },
      { name: "الهاتف", value: phone || "—", inline: true },
      { name: "رقم التتبع", value: tracking || "—", inline: true },
      { name: "الجهاز", value: application.device_name || "—", inline: false },
      {
        name: "قيمة القسط الأول",
        value: amount ? `${amount} دنانير` : "لم يتم تحديدها",
        inline: true,
      },
    ],
  });

  if (!cleanPhone) {
    return NextResponse.redirect(`${baseUrl}/admin/applications/${applicationId}`);
  }

  const amountLine = amount
    ? `\nقيمة القسط الأول في حال اختيار الدفع: ${amount} دنانير`
    : "";

  const message = `أهلًا ${customerName} 🌿

لاستكمال دراسة طلبكم لدى الأمين للأقساط والتمويل، يرجى الدخول إلى الرابط التالي واختيار أحد الخيارين:

1. رفع كشف راتب حديث
أو
2. اختيار دفع القسط الأول بدل رفع كشف الراتب${amountLine}

رقم التتبع:
${tracking}

رابط الاستكمال:
${salarySlipUrl}

الأمين للأقساط والتمويل`;

  return NextResponse.redirect(
    `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
  );
}
