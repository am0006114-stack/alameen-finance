import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendDiscordNotification } from "@/lib/discord";

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميل غير محدد";

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "عميل غير محدد";
  if (parts.length === 1) return parts[0];

  return `${parts[0]} ${parts[1]}`;
}

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

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

function decisionToStatus(decision: string) {
  if (decision === "confirmed") return "customer_confirmed_continue";
  if (decision === "declined") return "customer_declined_continue";

  return "";
}

function decisionLabel(decision: string) {
  if (decision === "confirmed") return "وافق على الاستمرار";
  if (decision === "declined") return "رفض الاستمرار";

  return "قرار غير معروف";
}

function buildPaymentWhatsAppUrl(params: {
  customerName: string;
  tracking: string;
  deviceName: string;
}) {
  const businessPhone = normalizeJordanPhoneForWhatsApp("0788500337");

  const message = `نعم، أود الاستمرار بإجراءات فتح الملف وتحويل طلبي للدراسة النهائية ✅

الاسم: ${params.customerName}
رقم التتبع: ${params.tracking}
الجهاز: ${params.deviceName || "—"}

معلومات رسوم فتح الملف:
قيمة الرسوم: 5 دنانير فقط

اسم المستفيد: AMEENPAY
اسم المحفظة: Orang-Money
الاسم: ABDUL RAHMAN ALHARAHSHEH

سأقوم بتحويل الرسوم وإرسال صورة وصل الدفع عبر واتساب.`;

  return `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const applicationId = String(formData.get("applicationId") || "").trim();
  const tracking = String(formData.get("tracking") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const decision = String(formData.get("decision") || "").trim();

  const baseUrl = getBaseUrl(request);
  const safeTracking = encodeURIComponent(tracking);
  const safePhone = encodeURIComponent(phone);

  if (!applicationId || !tracking || !phone) {
    return NextResponse.redirect(`${baseUrl}/`);
  }

  const nextStatus = decisionToStatus(decision);

  if (!nextStatus) {
    return NextResponse.redirect(
      `${baseUrl}/continue?tracking=${safeTracking}&phone=${safePhone}`
    );
  }

  const { data: application, error: fetchError } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name, status, payment_status")
    .eq("id", applicationId)
    .maybeSingle();

  if (fetchError || !application) {
    return NextResponse.redirect(`${baseUrl}/`);
  }

  const updatePayload: {
    status: string;
    payment_status?: string;
  } = {
    status: nextStatus,
  };

  if (decision === "confirmed") {
    updatePayload.payment_status = "pending";
  }

  if (decision === "declined") {
    updatePayload.payment_status = "not_requested_yet";
  }

  const { error: updateError } = await supabaseAdmin
    .from("applications")
    .update(updatePayload)
    .eq("id", applicationId);

  const customerName = firstTwoNames(application.full_name);
  const appTracking = application.tracking_id || tracking || "—";
  const deviceName = application.device_name || "—";

  if (!updateError) {
    const title =
      decision === "confirmed"
        ? "✅ العميل وافق على الاستمرار"
        : "❌ العميل رفض الاستمرار";

    await sendDiscordNotification({
      title,
      description:
        decision === "confirmed"
          ? "العميل ضغط زر الاستمرار من صفحة التأهيل المبدئي. تم تحويله إلى واتساب مع معلومات الدفع."
          : "العميل اختار عدم الاستمرار من صفحة التأهيل المبدئي.",
      color: decision === "confirmed" ? 0x69d97b : 0xff5c5c,
      fields: [
        {
          name: "الاسم",
          value: customerName,
          inline: true,
        },
        {
          name: "الهاتف",
          value: application.phone || phone || "—",
          inline: true,
        },
        {
          name: "رقم التتبع",
          value: appTracking,
          inline: true,
        },
        {
          name: "الجهاز",
          value: deviceName,
          inline: false,
        },
        {
          name: "قرار العميل",
          value: decisionLabel(decision),
          inline: true,
        },
        {
          name: "الحالة الجديدة",
          value: nextStatus,
          inline: true,
        },
      ],
    });
  }

  if (decision === "confirmed") {
    return NextResponse.redirect(
      buildPaymentWhatsAppUrl({
        customerName,
        tracking: appTracking,
        deviceName,
      })
    );
  }

  return NextResponse.redirect(
    `${baseUrl}/continue?tracking=${safeTracking}&phone=${safePhone}&decision=${decision}`
  );
}
