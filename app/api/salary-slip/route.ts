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
  if (!fullName) return "عميل غير محدد";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "عميل غير محدد";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

function extensionFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || extension.length > 8) return "jpg";
  return extension;
}

function buildWhatsAppUrl(params: { customerName: string; tracking: string; deviceName: string; amount: string }) {
  const businessPhone = normalizeJordanPhoneForWhatsApp("0788500337");
  const message = `أرغب بدفع القسط الأول بدل رفع كشف الراتب ✅

الاسم: ${params.customerName}
رقم التتبع: ${params.tracking}
الجهاز: ${params.deviceName || "—"}
قيمة القسط الأول: ${params.amount ? `${params.amount} دنانير` : "يرجى تزويدي بالقيمة المحددة"}

يرجى تزويدي بمعلومات الدفع لاستكمال الإجراء.`;

  return `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const applicationId = String(formData.get("applicationId") || "").trim();
  const tracking = String(formData.get("tracking") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const amount = String(formData.get("amount") || "").trim();
  const actionType = String(formData.get("actionType") || "").trim();

  const baseUrl = getBaseUrl(request);
  const safeTracking = encodeURIComponent(tracking);
  const safePhone = encodeURIComponent(phone);
  const safeAmount = encodeURIComponent(amount);

  if (!applicationId || !tracking || !phone) {
    return NextResponse.redirect(`${baseUrl}/`);
  }

  const { data: application, error: fetchError } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name")
    .eq("id", applicationId)
    .maybeSingle();

  if (fetchError || !application) {
    return NextResponse.redirect(`${baseUrl}/`);
  }

  const customerName = firstTwoNames(application.full_name);
  const appTracking = application.tracking_id || tracking;
  const deviceName = application.device_name || "—";

  if (actionType === "first_installment_whatsapp") {
    await supabaseAdmin
      .from("applications")
      .update({
        status: "first_installment_requested",
        payment_status: "first_installment_whatsapp",
      })
      .eq("id", applicationId);

    await sendDiscordNotification({
      title: "💬 العميل اختار دفع القسط الأول",
      description: "العميل اختار دفع القسط الأول بدل رفع كشف الراتب وتم تحويله إلى واتساب.",
      color: 0xd6b56b,
      fields: [
        { name: "الاسم", value: customerName, inline: true },
        { name: "الهاتف", value: application.phone || phone || "—", inline: true },
        { name: "رقم التتبع", value: appTracking || "—", inline: true },
        { name: "الجهاز", value: deviceName || "—", inline: false },
        { name: "قيمة القسط الأول", value: amount ? `${amount} دنانير` : "غير محددة", inline: true },
      ],
    });

    return NextResponse.redirect(buildWhatsAppUrl({ customerName, tracking: appTracking, deviceName, amount }));
  }

  if (actionType === "upload_salary_slip") {
    const file = formData.get("salarySlip");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.redirect(`${baseUrl}/salary-slip?tracking=${safeTracking}&phone=${safePhone}&amount=${safeAmount}&error=missing_file`);
    }

    const extension = extensionFromFileName(file.name);
    const filePath = `salary-slips/${applicationId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from("documents")
      .upload(filePath, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.redirect(`${baseUrl}/salary-slip?tracking=${safeTracking}&phone=${safePhone}&amount=${safeAmount}&error=upload_failed`);
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from("documents").getPublicUrl(filePath);

    await supabaseAdmin.from("documents").insert({
      application_id: applicationId,
      document_type: "salary_slip",
      file_url: publicUrlData.publicUrl,
      file_path: filePath,
      filename: file.name || "salary-slip",
    });

    await supabaseAdmin
      .from("applications")
      .update({
        status: "salary_slip_uploaded",
      })
      .eq("id", applicationId);

    await sendDiscordNotification({
      title: "📄 تم رفع كشف راتب",
      description: "العميل رفع كشف راتب من صفحة استكمال الدراسة.",
      color: 0x69d97b,
      fields: [
        { name: "الاسم", value: customerName, inline: true },
        { name: "الهاتف", value: application.phone || phone || "—", inline: true },
        { name: "رقم التتبع", value: appTracking || "—", inline: true },
        { name: "الجهاز", value: deviceName || "—", inline: false },
      ],
    });

    return NextResponse.redirect(`${baseUrl}/salary-slip?tracking=${safeTracking}&phone=${safePhone}&amount=${safeAmount}&uploaded=1`);
  }

  return NextResponse.redirect(`${baseUrl}/salary-slip?tracking=${safeTracking}&phone=${safePhone}&amount=${safeAmount}`);
}
