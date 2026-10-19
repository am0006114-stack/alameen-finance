import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadIdentityToVault } from "@/lib/identityVault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELATIONSHIPS: Record<string, string> = {
  father: "الأب",
  mother: "الأم",
  brother: "الأخ",
  sister: "الأخت",
  son: "الابن",
  daughter: "الابنة",
  spouse: "الزوج / الزوجة",
  relative: "قريب",
  friend: "صديق / معرفة",
  other: "غير ذلك",
};

function cleanDigits(value: string) {
  return value.replace(/\D/g, "");
}

function validJordanPhone(value: string) {
  return /^(079|078|077)[0-9]{7}$/.test(value);
}

function validNationalId(value: string) {
  return /^[92][0-9]{9}$/.test(value);
}

function jsonError(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const applicationId = String(formData.get("applicationId") || "").trim();
  const tracking = String(formData.get("tracking") || "").trim();
  const phone = cleanDigits(String(formData.get("phone") || ""));

  const guarantorName = String(formData.get("guarantorName") || "").trim();
  const guarantorNationalId = cleanDigits(
    String(formData.get("guarantorNationalId") || "")
  );
  const guarantorPhone = cleanDigits(
    String(formData.get("guarantorPhone") || "")
  );
  const guarantorRelationship = String(
    formData.get("guarantorRelationship") || ""
  ).trim();
  const guarantorSocialSecurity =
    String(formData.get("guarantorSocialSecurity") || "") === "1";
  const termsAccepted = String(formData.get("termsAccepted") || "") === "1";

  const frontFile = formData.get("guarantorIdFront");
  const backFile = formData.get("guarantorIdBack");

  if (!applicationId || !tracking || !phone) return jsonError("invalid_link", 400);
  if (guarantorName.split(/\s+/).filter(Boolean).length < 4) {
    return jsonError("invalid_guarantor_name", 400);
  }
  if (!validNationalId(guarantorNationalId)) return jsonError("invalid_national_id", 400);
  if (!validJordanPhone(guarantorPhone)) return jsonError("invalid_guarantor_phone", 400);

  const relationshipLabel = RELATIONSHIPS[guarantorRelationship];
  if (!relationshipLabel) return jsonError("invalid_relationship", 400);
  if (!termsAccepted) return jsonError("terms_required", 400);

  if (
    !(frontFile instanceof File) || frontFile.size === 0 ||
    !(backFile instanceof File) || backFile.size === 0
  ) {
    return jsonError("missing_file", 400);
  }

  const { data: application, error: applicationError } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, phone, status")
    .eq("id", applicationId)
    .eq("tracking_id", tracking)
    .eq("phone", phone)
    .maybeSingle();

  if (applicationError || !application) return jsonError("invalid_link", 404);

  try {
    const appTracking = String(application.tracking_id || tracking).trim();

    const [frontUpload, backUpload] = await Promise.all([
      uploadIdentityToVault({
        file: frontFile,
        trackingId: appTracking,
        documentType: "guarantor_front",
        maxBytes: 5 * 1024 * 1024,
      }),
      uploadIdentityToVault({
        file: backFile,
        trackingId: appTracking,
        documentType: "guarantor_back",
        maxBytes: 5 * 1024 * 1024,
      }),
    ]);

    const { error: documentError } = await supabaseAdmin
      .from("documents")
      .insert([
        {
          application_id: applicationId,
          type: "guarantor_front",
          file_url: frontUpload.reference,
        },
        {
          application_id: applicationId,
          type: "guarantor_back",
          file_url: backUpload.reference,
        },
      ]);

    if (documentError) throw documentError;

    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({
        guarantor_name: guarantorName,
        guarantor_phone: guarantorPhone,
        guarantor_national_id: guarantorNationalId,
        guarantor_relationship: relationshipLabel,
        guarantor_social_security: guarantorSocialSecurity,
        status: "guarantor_submitted",
      })
      .eq("id", applicationId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, storage: "vault" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload_failed";
    console.error("Guarantor private Vault submission failed", {
      applicationId,
      tracking,
      error: message,
    });

    if (message === "invalid_file" || message === "file_too_large") {
      return jsonError(message, 400);
    }

    return jsonError("upload_failed", 502);
  }
}
