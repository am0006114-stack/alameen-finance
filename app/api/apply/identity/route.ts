import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadIdentityToVault } from "@/lib/identityVault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_INITIAL_APPLICATION_STATES = new Set([
  "preliminary_application",
  "preliminary_qualified",
  "qualification_link_sent",
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  "applicant_front",
  "applicant_back",
]);

function cleanDigits(value: string) {
  return value.replace(/\D/g, "");
}

function jsonError(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const applicationId = String(formData.get("applicationId") || "").trim();
  const tracking = String(formData.get("tracking") || "").trim();
  const phone = cleanDigits(String(formData.get("phone") || ""));
  const documentType = String(formData.get("documentType") || "").trim();
  const file = formData.get("file");

  if (!applicationId || !/^AM-[0-9]+$/.test(tracking) || !phone) {
    return jsonError("invalid_link", 400);
  }

  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    return jsonError("invalid_document_type", 400);
  }

  if (!(file instanceof File) || file.size <= 0) {
    return jsonError("missing_file", 400);
  }

  const { data: application, error: applicationError } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, phone, status")
    .eq("id", applicationId)
    .eq("tracking_id", tracking)
    .eq("phone", phone)
    .maybeSingle();

  if (applicationError || !application) {
    return jsonError("invalid_link", 404);
  }

  if (!ALLOWED_INITIAL_APPLICATION_STATES.has(String(application.status || ""))) {
    return jsonError("invalid_state", 409);
  }

  try {
    const uploaded = await uploadIdentityToVault({
      file,
      trackingId: tracking,
      documentType,
      maxBytes: 8 * 1024 * 1024,
    });

    const { error: documentError } = await supabaseAdmin
      .from("documents")
      .insert({
        application_id: applicationId,
        type: documentType,
        file_url: uploaded.reference,
      });

    if (documentError) throw documentError;

    return NextResponse.json({
      success: true,
      storage: "vault",
      reference: uploaded.reference,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload_failed";

    console.error("Initial applicant identity Vault upload failed", {
      applicationId,
      tracking,
      documentType,
      error: message,
    });

    if (
      message === "invalid_file" ||
      message === "file_too_large" ||
      message === "invalid_tracking" ||
      message === "invalid_document_type"
    ) {
      return jsonError(message, 400);
    }

    return jsonError("upload_failed", 502);
  }
}
