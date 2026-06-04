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
  payment_reference?: string | null;
  paid_clicked_at?: string | null;
};

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

function isReceiptAlreadyLocked(application: ApplicationRecord) {
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
    .select(
      "id, tracking_id, full_name, phone, device_name, status, payment_status, payment_reference, paid_clicked_at"
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (fetchError || !application) {
    return NextResponse.redirect(`${baseUrl}/`);
  }

  const currentApplication = application as ApplicationRecord;
  const appTracking = currentApplication.tracking_id || tracking || "—";
  const adminApplicationUrl = `${baseUrl}/admin/applications/${applicationId}`;

  if (isReceiptAlreadyLocked(currentApplication)) {
    return NextResponse.redirect(
      `${baseUrl}/receipt?tracking=${safeTracking}&phone=${safePhone}&already=1`
    );
  }

  const file = formData.get("receipt");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.redirect(
      `${baseUrl}/receipt?tracking=${safeTracking}&phone=${safePhone}&error=missing_file`
    );
  }

  const allowedFileTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
  const maxSize = 8 * 1024 * 1024;

  if (file.type && !allowedFileTypes.includes(file.type)) {
    return NextResponse.redirect(
      `${baseUrl}/receipt?tracking=${safeTracking}&phone=${safePhone}&error=invalid_file`
    );
  }

  if (file.size > maxSize) {
    return NextResponse.redirect(
      `${baseUrl}/receipt?tracking=${safeTracking}&phone=${safePhone}&error=file_too_large`
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

  const nowIso = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("applications")
    .update({
      status: "pending_payment_confirmation",
      payment_status: "customer_claimed_paid",
      payment_reference: note
        ? `payment_receipt_uploaded | ${note}`
        : "payment_receipt_uploaded",
      paid_clicked_at: nowIso,
    })
    .eq("id", applicationId)
    .not("payment_status", "in", '("customer_claimed_paid","confirmed")');

  if (updateError) {
    await sendDiscordNotification({
      title: "⚠️ وصل الدفع ارتفع لكن تحديث حالة الطلب فشل",
      description:
        "تم رفع الوصل وتخزينه، لكن تحديث حالة الطلب في قاعدة البيانات فشل. افتح صفحة الطلب وعدّل الحالة يدويًا.",
      color: 0xff9900,
      fields: [
        { name: "رقم التتبع", value: appTracking, inline: true },
        { name: "الهاتف", value: currentApplication.phone || phone || "—", inline: true },
        { name: "صفحة الطلب في الأدمن", value: adminApplicationUrl, inline: false },
        { name: "رابط الوصل", value: publicUrlData.publicUrl || "—", inline: false },
        { name: "خطأ التحديث", value: updateError.message || "—", inline: false },
      ],
    });

    return NextResponse.redirect(
      `${baseUrl}/receipt?tracking=${safeTracking}&phone=${safePhone}&error=status_update_failed`
    );
  }

  const customerName = firstTwoNames(currentApplication.full_name);

  await sendDiscordNotification({
    title: "💳 العميل رفع وصل الدفع — بانتظار تأكيد الإدارة",
    description:
      "تم رفع وصل رسوم فتح الملف. افتح صفحة الطلب من الرابط أدناه ثم اضغط تأكيد الدفع / قيد الدراسة.",
    color: 0x69d97b,
    fields: [
      { name: "الاسم", value: customerName, inline: true },
      { name: "الهاتف", value: currentApplication.phone || phone || "—", inline: true },
      { name: "رقم التتبع", value: appTracking, inline: true },
      { name: "الجهاز", value: currentApplication.device_name || "—", inline: false },
      { name: "رابط الوصل", value: publicUrlData.publicUrl || "—", inline: false },
      { name: "صفحة تأكيد الدفع في الأدمن", value: adminApplicationUrl, inline: false },
      { name: "ملاحظة العميل", value: note || "—", inline: false },
    ],
  });

  return NextResponse.redirect(
    `${baseUrl}/receipt?tracking=${safeTracking}&phone=${safePhone}&uploaded=1`
  );
}
