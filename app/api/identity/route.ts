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
  ];

  return !file.type || allowedTypes.includes(file.type);
}

async function insertDocumentRecord(input: {
  applicationId: string;
  documentType: string;
  fileUrl: string;
  filePath: string;
  filename: string;
}) {
  const primaryPayload = {
    application_id: input.applicationId,
    document_type: input.documentType,
    file_url: input.fileUrl,
    file_path: input.filePath,
    filename: input.filename,
  };

  const { error } = await supabaseAdmin.from("documents").insert(primaryPayload);

  if (!error) return;

  const fallbackPayload = {
    application_id: input.applicationId,
    type: input.documentType,
    file_url: input.fileUrl,
  };

  const { error: fallbackError } = await supabaseAdmin
    .from("documents")
    .insert(fallbackPayload);

  if (fallbackError) {
    throw fallbackError;
  }
}

async function uploadIdentityFile(input: {
  file: File;
  applicationId: string;
  documentType: string;
}) {
  if (!isAllowedFileType(input.file)) {
    throw new Error("invalid_file");
  }

  if (input.file.size > 8 * 1024 * 1024) {
    throw new Error("file_too_large");
  }

  const extension = extensionFromFileName(input.file.name);
  const filePath = `identity/${input.applicationId}/${input.documentType}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const arrayBuffer = await input.file.arrayBuffer();

  const { error: uploadError } = await supabaseAdmin.storage
    .from("documents")
    .upload(filePath, arrayBuffer, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new Error("upload_failed");
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from("documents")
    .getPublicUrl(filePath);

  const publicUrl = publicUrlData.publicUrl || "";

  await insertDocumentRecord({
    applicationId: input.applicationId,
    documentType: input.documentType,
    fileUrl: publicUrl,
    filePath,
    filename: input.file.name || input.documentType,
  });

  return publicUrl;
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
    .select("id, tracking_id, full_name, phone, device_name, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (fetchError || !application) {
    return NextResponse.redirect(`${baseUrl}/`);
  }

  const frontFile = formData.get("applicantIdFront");
  const backFile = formData.get("applicantIdBack");

  if (!(frontFile instanceof File) || frontFile.size === 0 || !(backFile instanceof File) || backFile.size === 0) {
    return NextResponse.redirect(
      `${baseUrl}/identity?tracking=${safeTracking}&phone=${safePhone}&error=missing_file`
    );
  }

  try {
    const frontUrl = await uploadIdentityFile({
      file: frontFile,
      applicationId,
      documentType: "applicant_front",
    });

    const backUrl = await uploadIdentityFile({
      file: backFile,
      applicationId,
      documentType: "applicant_back",
    });

    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({
        status: "identity_uploaded",
      })
      .eq("id", applicationId);

    const customerName = firstTwoNames(application.full_name);
    const appTracking = application.tracking_id || tracking;
    const deviceName = application.device_name || "—";
    const adminUrl = `${baseUrl}/admin/applications/${applicationId}`;

    await sendDiscordNotification({
      title: updateError
        ? "⚠️ صور الهوية ارتفعت لكن تحديث الحالة فشل"
        : "🪪 تم رفع صور هوية مقدم الطلب",
      description: updateError
        ? "تم رفع صور الهوية وربطها بالوثائق، لكن تحديث حالة الطلب فشل. افتح صفحة الطلب وراجع الحالة يدويًا."
        : "العميل رفع صور الهوية الأمامية والخلفية من الرابط الرسمي.",
      color: updateError ? 0xff9900 : 0x69d97b,
      fields: [
        { name: "الاسم", value: customerName, inline: true },
        { name: "الهاتف", value: application.phone || phone || "—", inline: true },
        { name: "رقم التتبع", value: appTracking || "—", inline: true },
        { name: "الجهاز", value: deviceName || "—", inline: false },
        { name: "الوجه الأمامي", value: frontUrl || "—", inline: false },
        { name: "الوجه الخلفي", value: backUrl || "—", inline: false },
        { name: "صفحة الطلب في الأدمن", value: adminUrl, inline: false },
      ],
    });

    if (updateError) {
      return NextResponse.redirect(
        `${baseUrl}/identity?tracking=${safeTracking}&phone=${safePhone}&uploaded=1&warning=status_update_failed`
      );
    }

    return NextResponse.redirect(
      `${baseUrl}/identity?tracking=${safeTracking}&phone=${safePhone}&uploaded=1`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload_failed";

    if (message === "invalid_file" || message === "file_too_large" || message === "upload_failed") {
      return NextResponse.redirect(
        `${baseUrl}/identity?tracking=${safeTracking}&phone=${safePhone}&error=${message}`
      );
    }

    console.error("Identity upload error:", error);

    return NextResponse.redirect(
      `${baseUrl}/identity?tracking=${safeTracking}&phone=${safePhone}&error=upload_failed`
    );
  }
}
