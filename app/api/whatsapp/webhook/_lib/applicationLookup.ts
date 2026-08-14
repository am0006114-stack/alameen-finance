import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ApplicationRecord } from "./types";
import {
  normalizeJordanPhone,
  normalizeWhatsAppToSend,
} from "./text";

const APPLICATION_SELECT = "id, created_at, tracking_id, full_name, phone, status, payment_status, payment_confirmed_at, payment_reference, device_name, salary, delivery_delay_until";

function phoneVariants(phone: string) {
  const localPhone = normalizeJordanPhone(phone);
  if (!localPhone) return [] as string[];

  return Array.from(
    new Set([
      localPhone,
      normalizeWhatsAppToSend(localPhone),
      `+${normalizeWhatsAppToSend(localPhone)}`,
      localPhone.startsWith("0") ? localPhone.slice(1) : localPhone,
    ].filter(Boolean))
  );
}

export async function findApplicationsByPhone(phone: string, limit = 12) {
  const variants = phoneVariants(phone);
  if (!variants.length) return [] as ApplicationRecord[];

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(APPLICATION_SELECT)
    .in("phone", variants)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 25)));

  if (error) {
    console.error("findApplicationsByPhone error:", error.message);
    return [];
  }

  return (data || []) as ApplicationRecord[];
}

export async function findApplicationByPhone(phone: string) {
  const rows = await findApplicationsByPhone(phone, 1);
  return rows[0] || null;
}

export async function findApplicationById(id: string) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(APPLICATION_SELECT)
    .eq("id", cleanId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("findApplicationById error:", error.message);
    return null;
  }

  return (data || null) as ApplicationRecord | null;
}

export async function findApplicationByTracking(tracking: string) {
  const cleanTracking = String(tracking || "").trim().toUpperCase();
  if (!cleanTracking) return null;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(APPLICATION_SELECT)
    .eq("tracking_id", cleanTracking)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("findApplicationByTracking error:", error.message);
    return null;
  }

  return (data || null) as ApplicationRecord | null;
}

export async function findApplicationByTrackingAndPhone(tracking: string, phone: string) {
  const cleanTracking = String(tracking || "").trim().toUpperCase();
  const variants = phoneVariants(phone);
  if (!cleanTracking || !variants.length) return null;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(APPLICATION_SELECT)
    .eq("tracking_id", cleanTracking)
    .in("phone", variants)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("findApplicationByTrackingAndPhone error:", error.message);
    return null;
  }

  return (data || null) as ApplicationRecord | null;
}
