import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendDiscordNotification } from "@/lib/discord";

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميل غير محدد";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "عميل غير محدد";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const applicationId = String(formData.get("applicationId") || "").trim();
  const tracking = String(formData.get("tracking") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const decision = String(formData.get("decision") || "").trim();
  const refundAccount = String(formData.get("refundAccount") || "").trim();
  const refundBank = String(formData.get("refundBank") || "").trim();
  const refundOwner = String(formData.get("refundOwner") || "").trim();
  const baseUrl = getBaseUrl(request);
  const safeTracking = encodeURIComponent(tracking);
  const safePhone = encodeURIComponent(phone);

  if (!applicationId || !tracking || !phone) return NextResponse.redirect(`${baseUrl}/`);

  const { data: application, error } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !application) return NextResponse.redirect(`${baseUrl}/`);

  const customerName = firstTwoNames(application.full_name);
  const appTracking = application.tracking_id || tracking || "—";

  if (decision === "wait") {
    await supabaseAdmin.from("applications").update({ status: "customer_accepts_delivery_delay" }).eq("id", applicationId);
    await sendDiscordNotification({
      title: "⏳ العميل اختار الانتظار 3 أيام",
      description: "العميل وافق على تمديد موعد التسليم لمدة 3 أيام عمل.",
      color: 0x69d97b,
      fields: [
        { name: "الاسم", value: customerName, inline: true },
        { name: "الهاتف", value: application.phone || phone || "—", inline: true },
        { name: "رقم التتبع", value: appTracking, inline: true },
        { name: "الجهاز", value: application.device_name || "—", inline: false },
      ],
    });
    return NextResponse.redirect(`${baseUrl}/delay-decision?tracking=${safeTracking}&phone=${safePhone}&result=wait`);
  }

  if (decision === "refund") {
    if (!refundAccount || !refundBank || !refundOwner) return NextResponse.redirect(`${baseUrl}/delay-decision?tracking=${safeTracking}&phone=${safePhone}`);
    await supabaseAdmin
      .from("applications")
      .update({
        status: "refund_requested",
        payment_status: "refund_requested",
        payment_reference: `Refund requested | Account: ${refundAccount} | Bank/Wallet: ${refundBank} | Owner: ${refundOwner}`,
      })
      .eq("id", applicationId);
    await sendDiscordNotification({
      title: "💳 العميل طلب استرداد رسوم فتح الملف",
      description: "العميل اختار استرداد الرسوم بدل انتظار تمديد التسليم.",
      color: 0xd6b56b,
      fields: [
        { name: "الاسم", value: customerName, inline: true },
        { name: "الهاتف", value: application.phone || phone || "—", inline: true },
        { name: "رقم التتبع", value: appTracking, inline: true },
        { name: "الجهاز", value: application.device_name || "—", inline: false },
        { name: "رقم المحفظة / اسم كليك", value: refundAccount, inline: false },
        { name: "نوع المحفظة / البنك", value: refundBank, inline: true },
        { name: "اسم صاحب الحساب", value: refundOwner, inline: true },
      ],
    });
    return NextResponse.redirect(`${baseUrl}/delay-decision?tracking=${safeTracking}&phone=${safePhone}&result=refund`);
  }

  return NextResponse.redirect(`${baseUrl}/delay-decision?tracking=${safeTracking}&phone=${safePhone}`);
}
