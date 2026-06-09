import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ApplicationRecord } from "./types";
import {
  normalizeJordanPhone,
  normalizeWhatsAppToSend,
} from "./text";

export async function findApplicationByPhone(phone: string) {
  const localPhone = normalizeJordanPhone(phone);
  if (!localPhone) return null;

  const phoneVariants = Array.from(
    new Set([
      localPhone,
      normalizeWhatsAppToSend(localPhone),
      `+${normalizeWhatsAppToSend(localPhone)}`,
      localPhone.startsWith("0") ? localPhone.slice(1) : localPhone,
    ].filter(Boolean))
  );

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id, created_at, tracking_id, full_name, phone, status, payment_status, payment_confirmed_at, device_name, salary, delivery_delay_until")
    .in("phone", phoneVariants)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("findApplicationByPhone error:", error.message);
    return null;
  }

  return (data || null) as ApplicationRecord | null;
}

export async function findApplicationByTracking(tracking: string) {
  const cleanTracking = String(tracking || "").trim().toUpperCase();
  if (!cleanTracking) return null;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id, created_at, tracking_id, full_name, phone, status, payment_status, payment_confirmed_at, device_name, salary, delivery_delay_until")
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
  const localPhone = normalizeJordanPhone(phone);
  if (!cleanTracking || !localPhone) return null;

  const phoneVariants = Array.from(
    new Set([
      localPhone,
      normalizeWhatsAppToSend(localPhone),
      `+${normalizeWhatsAppToSend(localPhone)}`,
      localPhone.startsWith("0") ? localPhone.slice(1) : localPhone,
    ].filter(Boolean))
  );

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("id, created_at, tracking_id, full_name, phone, status, payment_status, payment_confirmed_at, device_name, salary, delivery_delay_until")
    .eq("tracking_id", cleanTracking)
    .in("phone", phoneVariants)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("findApplicationByTrackingAndPhone error:", error.message);
    return null;
  }

  return (data || null) as ApplicationRecord | null;
}
