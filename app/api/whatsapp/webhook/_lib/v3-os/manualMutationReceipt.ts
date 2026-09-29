import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ActionKey, TruthBundle } from "./types";

export type ManualMutationReceiptStatus = "awaiting_admin" | "already_pending" | "failed" | "not_applicable";

export type ManualMutationReceipt = {
  action: ActionKey;
  status: ManualMutationReceiptStatus;
  receiptId: string | null;
  trackingId: string | null;
  error: string | null;
};

const RECEIPT_ACTIONS = new Set<ActionKey>(["change_application_data"]);

function result(input: Partial<ManualMutationReceipt> & Pick<ManualMutationReceipt, "action" | "status">): ManualMutationReceipt {
  return {
    action: input.action,
    status: input.status,
    receiptId: input.receiptId || null,
    trackingId: input.trackingId || null,
    error: input.error || null,
  };
}

export async function recordManualMutationReceipt(input: {
  truth: TruthBundle;
  action: ActionKey;
  customerText: string;
  waId: string;
}): Promise<ManualMutationReceipt> {
  const app = input.truth.application;
  if (!RECEIPT_ACTIONS.has(input.action) || !app || input.truth.contactAccess !== "full") {
    return result({ action: input.action, status: "not_applicable", trackingId: app?.trackingId || null });
  }

  const record = {
    application_id: app.id,
    tracking_id: app.trackingId || null,
    action_type: input.action,
    source: "whatsapp_v3_human_os",
    customer_message: String(input.customerText || "").slice(0, 2000),
    status: "pending",
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("application_action_requests")
      .insert(record)
      .select("id")
      .maybeSingle();

    if (!error) {
      return result({
        action: input.action,
        status: "awaiting_admin",
        receiptId: data?.id != null ? String(data.id) : null,
        trackingId: app.trackingId || null,
      });
    }

    if (String((error as { code?: string }).code || "") === "23505") {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("application_action_requests")
        .select("id")
        .eq("application_id", app.id)
        .eq("action_type", input.action)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) {
        console.error("manual mutation existing receipt read failed", { action: input.action, applicationId: app.id, error: existingError.message });
      }
      return result({
        action: input.action,
        status: "already_pending",
        receiptId: existing?.id != null ? String(existing.id) : null,
        trackingId: app.trackingId || null,
      });
    }

    console.error("manual mutation receipt insert failed", { action: input.action, applicationId: app.id, error: error.message });
    return result({ action: input.action, status: "failed", trackingId: app.trackingId || null, error: error.message });
  } catch (error) {
    console.error("manual mutation receipt exception", { action: input.action, applicationId: app.id, error });
    return result({ action: input.action, status: "failed", trackingId: app.trackingId || null, error: String(error) });
  }
}

export function manualMutationReceiptReply(receipt: ManualMutationReceipt | null, truth: TruthBundle) {
  if (!receipt || receipt.action !== "change_application_data") return null;
  const tracking = truth.application?.trackingId || receipt.trackingId;
  const scope = tracking ? ` على الطلب ${tracking}` : "";
  if (["awaiting_admin", "already_pending"].includes(receipt.status)) {
    return `تم تسجيل طلب تعديل البيانات للمراجعة الإدارية${scope}. التعديل نفسه لم يُنفذ بعد، وبنعتبره مكتمل فقط لما تتغير بيانات الطلب فعليًا.`;
  }
  if (receipt.status === "failed") {
    return `فهمت التعديل المطلوب${scope}، لكن ما قدرت أسجل طلب التنفيذ الآن. التعديل نفسه ما بدأ وما تغيرت بيانات الطلب.`;
  }
  return null;
}
