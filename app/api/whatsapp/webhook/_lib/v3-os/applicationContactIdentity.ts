import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canonicalWaId } from "./contactIdentity";

export type ApplicationWhatsAppContactStatus = "approved" | "rejected";

export type ApplicationWhatsAppContactRecord = {
  id: string;
  applicationId: string;
  trackingId: string | null;
  applicationPhone: string | null;
  waId: string;
  status: ApplicationWhatsAppContactStatus;
  requestedByWaId: string;
  requestText: string | null;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  approvedBy: string | null;
  confirmationTurnId: string | null;
  confirmationText: string | null;
  approvalSource: string | null;
  updatedAt: string;
};

function mapRow(row: any): ApplicationWhatsAppContactRecord {
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    trackingId: row.tracking_id || null,
    applicationPhone: row.application_phone || null,
    waId: canonicalWaId(row.wa_id),
    status: String(row.status || "approved") as ApplicationWhatsAppContactStatus,
    requestedByWaId: canonicalWaId(row.requested_by_wa_id || row.wa_id),
    requestText: row.request_text || null,
    requestedAt: String(row.requested_at || row.updated_at || new Date().toISOString()),
    approvedAt: row.approved_at || null,
    rejectedAt: row.rejected_at || null,
    approvedBy: row.approved_by || null,
    confirmationTurnId: row.confirmation_turn_id || null,
    confirmationText: row.confirmation_text || null,
    approvalSource: row.approval_source || null,
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function approvedWhatsAppAliasForApplication(input: { applicationId: string; waId: string }) {
  const waId = canonicalWaId(input.waId);
  if (!input.applicationId || !waId) return null;
  const { data, error } = await supabaseAdmin
    .from("whatsapp_application_contacts")
    .select("*")
    .eq("application_id", input.applicationId)
    .eq("wa_id", waId)
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("v3_application_contact_alias_read_failed", error);
    return null;
  }
  return data ? mapRow(data) : null;
}

export async function approvedApplicationIdsForWhatsApp(waIdInput: string) {
  const waId = canonicalWaId(waIdInput);
  if (!waId) return [] as string[];
  const { data, error } = await supabaseAdmin
    .from("whatsapp_application_contacts")
    .select("application_id")
    .eq("wa_id", waId)
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("v3_application_contact_alias_list_failed", error);
    return [] as string[];
  }
  return Array.from(new Set((data || []).map((row: any) => String(row.application_id || "")).filter(Boolean)));
}

/**
 * Phase 7.6.0 contact identity mutation.
 * The customer has already supplied the tracking number from the current WhatsApp
 * and then explicitly confirmed the dedicated prompt (for example: "نعم اعتمد الرقم").
 * This does NOT change applications.phone. It adds the current WhatsApp sender as
 * an approved alias for this application so future turns resolve normally.
 */
export async function approveApplicationWhatsAppAlias(input: {
  applicationId: string;
  trackingId?: string | null;
  applicationPhone?: string | null;
  waId: string;
  requestedByWaId?: string | null;
  requestText?: string | null;
  confirmationTurnId?: string | null;
  confirmationText?: string | null;
}) {
  const waId = canonicalWaId(input.waId);
  const requestedByWaId = canonicalWaId(input.requestedByWaId || input.waId);
  if (!input.applicationId || !waId || !requestedByWaId) {
    return { ok: false, alreadyApproved: false, id: null as string | null, blocker: "invalid_contact_alias_mutation" };
  }

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("whatsapp_application_contacts")
    .select("*")
    .eq("application_id", input.applicationId)
    .eq("wa_id", waId)
    .maybeSingle();
  if (existingError) throw new Error(`whatsapp_alias_approve_read:${existingError.message}`);

  if (existing && String(existing.status) === "approved") {
    return { ok: true, alreadyApproved: true, id: String(existing.id), blocker: null };
  }

  const payload = {
    application_id: input.applicationId,
    tracking_id: input.trackingId || null,
    application_phone: input.applicationPhone || null,
    wa_id: waId,
    status: "approved",
    requested_by_wa_id: requestedByWaId,
    request_text: String(input.requestText || "").slice(0, 1200) || null,
    requested_at: existing?.requested_at || now,
    approved_at: now,
    rejected_at: null,
    approved_by: "customer_explicit_confirmation",
    confirmation_turn_id: input.confirmationTurnId || null,
    confirmation_text: String(input.confirmationText || "").slice(0, 1200) || null,
    approval_source: "whatsapp_two_step_confirmation",
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from("whatsapp_application_contacts")
    .upsert(payload, { onConflict: "application_id,wa_id" })
    .select("id,status")
    .maybeSingle();
  if (error) throw new Error(`whatsapp_alias_approve_write:${error.message}`);

  return {
    ok: true,
    alreadyApproved: false,
    id: data?.id ? String(data.id) : (existing?.id ? String(existing.id) : null),
    blocker: null,
  };
}

export function explicitCurrentWhatsAppAliasRequest(value: string | null | undefined) {
  const q = String(value || "")
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return false;
  const currentNumber = /(?:هذا|هاد|هاض|هدا|الرقم\s+هذا|الرقم\s+هاد|رقمي\s+الحالي|رقم\s+الواتساب\s+هذا|رقم\s+الواتس\s+هذا)/.test(q);
  const aliasMeaning = /(?:واتساب|واتس|للتواصل|للمتابعه|للمتابعة|تابع\s+للطلب|علي\s+الطلب|على\s+الطلب)/.test(q);
  const approvalVerb = /(?:اعتمد|اعتمدوا|اربط|اربطوا|ضيف|ضيفوا|اضف|أضف|خلي|خلوا|ثبت|ثبتوا|سجل|سجلوا)/.test(q);
  const ownership = /(?:رقمي|انا\s+صاحب|انا\s+صاحبه|هذا\s+رقمي|هاد\s+رقمي|هاض\s+رقمي)/.test(q);
  return (currentNumber && aliasMeaning && (approvalVerb || ownership))
    || (approvalVerb && /(?:رقم\s+الواتساب|رقم\s+الواتس|الرقم\s+الحالي|هذا\s+الرقم|هاد\s+الرقم|هاض\s+الرقم)/.test(q));
}
