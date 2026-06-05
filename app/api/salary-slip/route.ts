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

function isAllowedFileType(file: File) {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
  ];

  return !file.type || allowedTypes.includes(file.type);
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const applicationId = String(formData.get("applicationId") || "").trim();
  const tracking = String(formData.get("tracking") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  const baseUrl = getBaseUrl(request);
  const safeTracking = encodeURIComponent(tracking);
  const safePhone = encodeURIComponent(phone);

  if (!applicationId || !tracking || !phone) {
    return NextResponse.redirect(`${baseUrl}/`);
  }

  const { data: application, error: fetchError } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name, status, payment_status")
    .eq("id", applicationId)
    .maybeSingle();

  if (fetchError || !application) {
    return NextResponse.redirect(`${baseUrl}/`);
  }

  const file = formData.get("salarySlip");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.redirect(
      `${baseUrl}/salary-slip?tracking=${safeTracking}&phone=${safePhone}&error=missing_file`
    );
  }

  if (!isAllowedFileType(file)) {
    return NextResponse.redirect(
      `${baseUrl}/salary-slip?tracking=${safeTracking}&phone=${safePhone}&error=invalid_file`
    );
  }

  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.redirect(
      `${baseUrl}/salary-slip?tracking=${safeTracking}&phone=${safePhone}&error=file_too_large`
    );
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
    return NextResponse.redirect(
      `${baseUrl}/salary-slip?tracking=${safeTracking}&phone=${safePhone}&error=upload_failed`
    );
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from("documents")
    .getPublicUrl(filePath);

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

  const customerName = firstTwoNames(application.full_name);
  const appTracking = application.tracking_id || tracking;
  const deviceName = application.device_name || "—";
  const adminUrl = `${baseUrl}/admin/applications/${applicationId}`;

  await sendDiscordNotification({
    title: "📄 تم رفع كشف راتب رسمي",
    description: "العميل رفع كشف راتب/شهادة راتب لاستكمال الدراسة النهائية.",
    color: 0x69d97b,
    fields: [
      { name: "الاسم", value: customerName, inline: true },
      { name: "الهاتف", value: application.phone || phone || "—", inline: true },
      { name: "رقم التتبع", value: appTracking || "—", inline: true },
      { name: "الجهاز", value: deviceName || "—", inline: false },
      { name: "رابط الملف", value: publicUrlData.publicUrl || "—", inline: false },
      { name: "صفحة الطلب في الأدمن", value: adminUrl, inline: false },
    ],
  });

  return NextResponse.redirect(
    `${baseUrl}/salary-slip?tracking=${safeTracking}&phone=${safePhone}&uploaded=1`
  );
}
