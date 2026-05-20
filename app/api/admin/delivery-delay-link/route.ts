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


function toJordanIsoFromLocalInput(value: string | null | undefined) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue) return null;

  const date = new Date(`${cleanValue}:00+03:00`);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function formatJordanDateTime(value: string | null | undefined) {
  if (!value) return "الموعد المحدد";

  try {
    return new Intl.DateTimeFormat("ar-JO", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export async function GET(request: Request) {
  const baseUrl = getBaseUrl(request);
  return NextResponse.redirect(`${baseUrl}/admin`);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const applicationId = String(formData.get("applicationId") || "").trim();
  const delayUntilInput = String(formData.get("delay_until") || "").trim();

  const baseUrl = getBaseUrl(request);

  if (!applicationId) {
    return NextResponse.redirect(`${baseUrl}/admin`);
  }

  const { data: application, error } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name, delivery_delay_until")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !application) {
    return NextResponse.redirect(`${baseUrl}/admin`);
  }

  const tracking = application.tracking_id || application.id;
  const phone = application.phone || "";
  const delayUntilIso = toJordanIsoFromLocalInput(delayUntilInput) || application.delivery_delay_until || null;
  const formattedDelayUntil = formatJordanDateTime(delayUntilIso);
  const customerName = firstTwoNames(application.full_name);
  const cleanPhone = normalizeJordanPhoneForWhatsApp(phone);

  const delayDecisionUrl = `${baseUrl}/delay-decision?tracking=${encodeURIComponent(
    tracking
  )}&phone=${encodeURIComponent(phone)}`;

  await supabaseAdmin
    .from("applications")
    .update({
      status: "delivery_delay_notice_sent",
      delivery_delay_until: delayUntilIso,
    })
    .eq("id", applicationId);

  await sendDiscordNotification({
    title: "📨 تم إرسال خيار التمديد / الاسترداد",
    description: "تم فتح واتساب برسالة تمديد التسليم أو استرداد رسوم فتح الملف.",
    color: 0xd6b56b,
    fields: [
      { name: "الاسم", value: customerName, inline: true },
      { name: "الهاتف", value: phone || "—", inline: true },
      { name: "رقم التتبع", value: tracking || "—", inline: true },
      { name: "الجهاز", value: application.device_name || "—", inline: false },
      { name: "الموعد الجديد", value: formattedDelayUntil, inline: false },
    ],
  });

  if (!cleanPhone) {
    return NextResponse.redirect(`${baseUrl}/admin/applications/${applicationId}`);
  }

  const message = `أهلًا ${customerName} 🌿

نعتذر منكم بشدة على التعديل والتأخير، ونتفهم تمامًا أن تغيير موعد التسليم أمر مزعج.

للتوضيح بكل شفافية: كان الموعد المتوقع مبدئيًا أقرب، لكن بعد المراجعة النهائية مع الإدارة والمورد تبيّن أن بعض الأجهزة لم يتم تزويدنا بها ضمن الموعد المتوقع، لذلك تم اعتماد موعد استكمال طلبكم بتاريخ:

${formattedDelayUntil}

طلبكم ما زال قائمًا وقيد المتابعة ولم يتم إلغاؤه.

حرصًا منا على حقكم وراحتكم، يمكنكم اختيار أحد الخيارين من الرابط التالي:

1️⃣ الانتظار حتى الموعد الجديد واستكمال الطلب بشكل طبيعي
أو
2️⃣ استرداد رسوم فتح الملف المدفوعة

رابط الاختيار:
${delayDecisionUrl}

رقم التتبع:
${tracking}

نعتذر مرة أخرى، ونشكركم على صبركم وتفهمكم.
الأمين للأقساط والتمويل`;

  return NextResponse.redirect(
    `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
  );
}
