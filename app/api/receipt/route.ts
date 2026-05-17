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

function extensionFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!extension || extension.length > 8) return "jpg";

  return extension;
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const applicationId = String(formData.get("applicationId") || "").trim();
  const tracking = String(formData.get("tracking") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const note = String(formData.get("note") || "").trim();

  const baseUrl = getBaseUrl(request);
  const safeTracking = encodeURIComponent(tracking);
  const safePhone = encodeURIComponent(phone);

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

  const file = formData.get("receipt");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.redirect(
      `${baseUrl}/receipt?tracking=${safeTracking}&phone=${safePhone}&error=missing_file`
    );
  }

  const extension = extensionFromFileName(file.name);
  const filePath = `payment-receipts/${applicationId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabaseAdmin.storage
    .from("documents")
    .upload(filePath, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.redirect(
      `${baseUrl}/receipt?tracking=${safeTracking}&phone=${safePhone}&error=upload_failed`
    );
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from("documents")
    .getPublicUrl(filePath);

  await supabaseAdmin.from("documents").insert({
    application_id: applicationId,
    document_type: "payment_receipt",
    file_url: publicUrlData.publicUrl,
    file_path: filePath,
    filename: file.name || "payment-receipt",
  });

  await supabaseAdmin
    .from("applications")
    .update({
      status: "pending_payment_confirmation",
      payment_status: "customer_claimed_paid",
      payment_reference: note
        ? `payment_receipt_uploaded | ${note}`
        : "payment_receipt_uploaded",
      paid_clicked_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  const customerName = firstTwoNames(application.full_name);
  const appTracking = application.tracking_id || tracking || "—";

  await sendDiscordNotification({
    title: "💳 تم رفع وصل دفع رسوم فتح الملف",
    description: "العميل رفع وصل الدفع من صفحة رفع الوصل.",
    color: 0x69d97b,
    fields: [
      { name: "الاسم", value: customerName, inline: true },
      { name: "الهاتف", value: application.phone || phone || "—", inline: true },
      { name: "رقم التتبع", value: appTracking, inline: true },
      { name: "الجهاز", value: application.device_name || "—", inline: false },
      { name: "رابط الوصل", value: publicUrlData.publicUrl || "—", inline: false },
      { name: "ملاحظة العميل", value: note || "—", inline: false },
    ],
  });

  return NextResponse.redirect(
    `${baseUrl}/receipt?tracking=${safeTracking}&phone=${safePhone}&uploaded=1`
  );
}
