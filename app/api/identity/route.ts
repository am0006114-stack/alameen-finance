import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendDiscordNotification } from "@/lib/discord";
import { uploadIdentityToVault } from "@/lib/identityVault";

export const runtime = "nodejs";

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

async function insertIdentityDocuments(
  applicationId: string,
  documents: Array<{ type: string; reference: string }>
) {
  const { error } = await supabaseAdmin.from("documents").insert(
    documents.map((document) => ({
      application_id: applicationId,
      type: document.type,
      file_url: document.reference,
    }))
  );
  if (error) throw error;
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
    .eq("tracking_id", tracking)
    .eq("phone", phone)
    .maybeSingle();

  if (fetchError || !application) {
    console.error("Identity upload binding mismatch", { applicationId, tracking });
    return NextResponse.redirect(
      `${baseUrl}/identity?tracking=${safeTracking}&phone=${safePhone}&error=invalid_link`
    );
  }

  const identityUploadAllowed = [
    "needs_identity",
    "identity_requested",
    "identity_uploaded",
  ].includes(String(application.status || ""));

  if (!identityUploadAllowed) {
    return NextResponse.redirect(
      `${baseUrl}/identity?tracking=${safeTracking}&phone=${safePhone}&error=invalid_state`
    );
  }

  const frontFile = formData.get("applicantIdFront");
  const backFile = formData.get("applicantIdBack");

  if (
    !(frontFile instanceof File) ||
    frontFile.size === 0 ||
    !(backFile instanceof File) ||
    backFile.size === 0
  ) {
    return NextResponse.redirect(
      `${baseUrl}/identity?tracking=${safeTracking}&phone=${safePhone}&error=missing_file`
    );
  }

  try {
    const appTracking = String(application.tracking_id || tracking).trim();

    const [frontUpload, backUpload] = await Promise.all([
      uploadIdentityToVault({
        file: frontFile,
        trackingId: appTracking,
        documentType: "applicant_front",
        maxBytes: 8 * 1024 * 1024,
      }),
      uploadIdentityToVault({
        file: backFile,
        trackingId: appTracking,
        documentType: "applicant_back",
        maxBytes: 8 * 1024 * 1024,
      }),
    ]);

    await insertIdentityDocuments(applicationId, [
      { type: "applicant_front", reference: frontUpload.reference },
      { type: "applicant_back", reference: backUpload.reference },
    ]);

    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({ status: "identity_uploaded" })
      .eq("id", applicationId);

    const customerName = firstTwoNames(application.full_name);
    const deviceName = application.device_name || "—";
    const adminUrl = `${baseUrl}/admin/applications/${applicationId}`;

    await sendDiscordNotification({
      title: updateError
        ? "⚠️ صور الهوية ارتفعت لكن تحديث الحالة فشل"
        : "🪪 تم رفع صور هوية مقدم الطلب",
      description: updateError
        ? "تم حفظ صور الهوية في الخزنة الخاصة وربطها بالوثائق، لكن تحديث حالة الطلب فشل. افتح صفحة الطلب وراجع الحالة يدويًا."
        : "العميل رفع صور الهوية الأمامية والخلفية من الرابط الرسمي وتم حفظها في الخزنة الخاصة.",
      color: updateError ? 0xff9900 : 0x69d97b,
      fields: [
        { name: "الاسم", value: customerName, inline: true },
        { name: "الهاتف", value: application.phone || phone || "—", inline: true },
        { name: "رقم التتبع", value: appTracking || "—", inline: true },
        { name: "الجهاز", value: deviceName || "—", inline: false },
        { name: "الوجه الأمامي", value: "محفوظ في الخزنة الخاصة ✅", inline: false },
        { name: "الوجه الخلفي", value: "محفوظ في الخزنة الخاصة ✅", inline: false },
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

    if (
      message === "invalid_file" ||
      message === "file_too_large" ||
      message === "upload_failed"
    ) {
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
