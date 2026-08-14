import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ApplicationRecord } from "./types";

export type ApplicationConversationLock = {
  wa_id: string;
  application_id: string;
  tracking_id?: string | null;
  customer_name?: string | null;
  source?: string | null;
  locked_at?: string | null;
  updated_at?: string | null;
};

const MAX_LOCK_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function getApplicationConversationLock(waId: string) {
  const cleanWaId = String(waId || "").trim();
  if (!cleanWaId) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_application_locks")
      .select("wa_id,application_id,tracking_id,customer_name,source,locked_at,updated_at")
      .eq("wa_id", cleanWaId)
      .limit(1)
      .maybeSingle();

    if (error) {
      if ((error as any)?.code !== "42P01") console.error("getApplicationConversationLock error:", error.message);
      return null;
    }

    const lock = (data || null) as ApplicationConversationLock | null;
    if (!lock) return null;

    const updated = lock.updated_at || lock.locked_at;
    const updatedMs = updated ? new Date(updated).getTime() : NaN;
    if (Number.isFinite(updatedMs) && Date.now() - updatedMs > MAX_LOCK_AGE_MS) {
      await clearApplicationConversationLock(cleanWaId);
      return null;
    }

    return lock;
  } catch (error) {
    console.error("getApplicationConversationLock failed:", error);
    return null;
  }
}

export async function setApplicationConversationLock(waId: string, app: ApplicationRecord, source: string) {
  const cleanWaId = String(waId || "").trim();
  if (!cleanWaId || !app?.id) return false;

  try {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("whatsapp_application_locks")
      .upsert({
        wa_id: cleanWaId,
        application_id: String(app.id),
        tracking_id: app.tracking_id || null,
        customer_name: app.full_name || null,
        source: String(source || "conversation"),
        locked_at: now,
        updated_at: now,
      }, { onConflict: "wa_id" });

    if (error) {
      if ((error as any)?.code !== "42P01") console.error("setApplicationConversationLock error:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("setApplicationConversationLock failed:", error);
    return false;
  }
}

export async function touchApplicationConversationLock(waId: string) {
  const cleanWaId = String(waId || "").trim();
  if (!cleanWaId) return false;
  try {
    const { error } = await supabaseAdmin
      .from("whatsapp_application_locks")
      .update({ updated_at: new Date().toISOString() })
      .eq("wa_id", cleanWaId);
    if (error) {
      if ((error as any)?.code !== "42P01") console.error("touchApplicationConversationLock error:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("touchApplicationConversationLock failed:", error);
    return false;
  }
}

export async function clearApplicationConversationLock(waId: string) {
  const cleanWaId = String(waId || "").trim();
  if (!cleanWaId) return false;
  try {
    const { error } = await supabaseAdmin
      .from("whatsapp_application_locks")
      .delete()
      .eq("wa_id", cleanWaId);
    if (error) {
      if ((error as any)?.code !== "42P01") console.error("clearApplicationConversationLock error:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("clearApplicationConversationLock failed:", error);
    return false;
  }
}
