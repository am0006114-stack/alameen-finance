import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function parseJordanDateTimeLocal(value: string | null | undefined) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue) return null;

  const parsed = new Date(`${cleanValue}:00+03:00`);

  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
}

export async function GET(request: Request) {
  const baseUrl = getBaseUrl(request);
  return NextResponse.redirect(`${baseUrl}/admin/delay-messages`);
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const applicationId = String(formData.get("applicationId") || "").trim();
  const delayUntilRaw = String(formData.get("delayUntil") || "").trim();

  const baseUrl = getBaseUrl(request);

  if (!applicationId) {
    return NextResponse.redirect(`${baseUrl}/admin/delay-messages`);
  }

  const { data: application, error } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !application) {
    return NextResponse.redirect(`${baseUrl}/admin/delay-messages`);
  }

  const tracking = application.tracking_id || application.id;
  const phone = application.phone || "";
  const cleanPhone = normalizeJordanPhoneForWhatsApp(phone);
  const customerName = firstTwoNames(application.full_name);
  const delayUntilIso = parseJordanDateTimeLocal(delayUntilRaw);

  const delayDecisionUrl = `${baseUrl}/delay-decision?tracking=${encodeURIComponent(
    tracking
  )}&phone=${encodeURIComponent(phone)}`;

  const updatePayload: {
    status: string;
    delivery_delay_until?: string;
  } = {
    status: "delivery_delay_notice_sent",
  };

  if (delayUntilIso) {
    updatePayload.delivery_delay_until = delayUntilIso;
  }

  await supabaseAdmin
    .from("applications")
    .update(updatePayload)
    .eq("id", applicationId);

  if (!cleanPhone) {
    return NextResponse.redirect(`${baseUrl}/admin/delay-messages`);
  }

  const message = `أهلًا ${customerName} 🌿

نعتذر منكم بشدة على التعديل، كان الموعد المتوقع مبدئيًا يوم الخميس، لكن بعد المراجعة النهائية مع الإدارة والمورد تبيّن أن بعض الأجهزة لم يتم تزويدنا بها ضمن الموعد المتوقع، لذلك تم اعتماد موعد استكمال الطلبات ليوم الأحد 31/05/2026.

نعرف أن تغيير الموعد مزعج، وحقكم علينا بالاعتذار، لكن فضّلنا نبلغكم بالموعد المعتمد بدل ما نعطيكم موعد غير مضمون.

طلبكم ما زال قائمًا وقيد المتابعة، وسيتم استكمال الإجراءات حسب الدور يوم الأحد بإذن الله.

وفي حال عدم رغبتكم بالانتظار، يمكنكم طلب استرداد رسوم فتح الملف المدفوعة، وحقكم محفوظ بالكامل.

رابط خيار الانتظار أو الاسترداد:
${delayDecisionUrl}

رقم التتبع:
${tracking}

نعتذر مرة أخرى، ونشكركم على صبركم وتفهمكم.
الأمين للأقساط والتمويل`;

  return NextResponse.redirect(
    `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
  );
}
