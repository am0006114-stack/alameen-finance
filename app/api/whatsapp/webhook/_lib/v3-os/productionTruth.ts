import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeJordanPhone, normalizeWhatsAppToSend } from "../text";
import type { ApplicationTruth, ConversationState, TruthBundle } from "./types";
import { resolveTruth } from "./truth";

const APP_SELECT = "id,created_at,tracking_id,full_name,phone,email,status,payment_status,payment_confirmed_at,payment_reference,device_id,device_name,device_price,installment_months,down_payment,interest_rate,monthly_payment,total_with_interest,salary,delivery_delay_until";

type ApplicationRow = {
  id: string;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_confirmed_at?: string | null;
  payment_reference?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  device_price?: number | string | null;
  installment_months?: number | string | null;
  down_payment?: number | string | null;
  interest_rate?: number | string | null;
  monthly_payment?: number | string | null;
  total_with_interest?: number | string | null;
  salary?: number | string | null;
  delivery_delay_until?: string | null;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toTruth(app: ApplicationRow | null | undefined): ApplicationTruth | null {
  if (!app?.id) return null;
  return {
    id: String(app.id),
    trackingId: app.tracking_id || null,
    fullName: app.full_name || null,
    phone: app.phone || null,
    email: app.email || null,
    status: app.status || null,
    paymentStatus: app.payment_status || null,
    paymentConfirmedAt: app.payment_confirmed_at || null,
    paymentReference: app.payment_reference || null,
    deviceId: app.device_id || null,
    deviceName: app.device_name || null,
    devicePrice: num(app.device_price),
    installmentMonths: num(app.installment_months),
    downPayment: num(app.down_payment),
    interestRate: num(app.interest_rate),
    monthlyPayment: num(app.monthly_payment),
    totalWithInterest: num(app.total_with_interest),
    salary: num(app.salary),
    deliveryDelayUntil: app.delivery_delay_until || null,
  };
}

function trackingFromText(value: string | null | undefined) {
  const explicit = String(value || "").match(/AM-\d{8,}/gi) || [];
  return explicit.length ? explicit[explicit.length - 1].toUpperCase() : "";
}

function phoneVariants(value: string | null | undefined) {
  const local = normalizeJordanPhone(value);
  if (!local) return [];
  const wa = normalizeWhatsAppToSend(local);
  return Array.from(new Set([local, wa, wa ? `+${wa}` : "", local.startsWith("0") ? local.slice(1) : local].filter(Boolean)));
}

function appBelongsToWaId(app: ApplicationRow | null, waId: string) {
  if (!app) return false;
  const target = new Set(phoneVariants(waId).map((x) => x.replace(/\D/g, "")));
  return phoneVariants(app.phone || "").some((x) => target.has(x.replace(/\D/g, "")));
}

async function byTracking(tracking: string) {
  const { data, error } = await supabaseAdmin.from("applications").select(APP_SELECT).eq("tracking_id", tracking).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`v3_truth_tracking:${error.message}`);
  return (data || null) as ApplicationRow | null;
}

async function byId(id: string) {
  const { data, error } = await supabaseAdmin.from("applications").select(APP_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`v3_truth_id:${error.message}`);
  return (data || null) as ApplicationRow | null;
}

async function byPhone(waId: string) {
  const variants = phoneVariants(waId);
  if (!variants.length) return [] as ApplicationRow[];
  const { data, error } = await supabaseAdmin.from("applications").select(APP_SELECT).in("phone", variants).order("created_at", { ascending: false }).limit(12);
  if (error) throw new Error(`v3_truth_phone:${error.message}`);
  return (data || []) as ApplicationRow[];
}

export async function resolveV3ProductionTruth(input: { waId: string; customerText: string; state: ConversationState }): Promise<TruthBundle> {
  const currentTracking = trackingFromText(input.customerText);
  if (currentTracking) {
    const app = await byTracking(currentTracking);
    if (app && appBelongsToWaId(app, input.waId)) {
      return resolveTruth({ state: input.state, currentMessageTrackingId: currentTracking, conversationBoundApplication: toTruth(app) });
    }
  }

  if (input.state.activeApplicationId) {
    const app = await byId(input.state.activeApplicationId);
    if (app && appBelongsToWaId(app, input.waId)) {
      return resolveTruth({ state: input.state, conversationBoundApplication: toTruth(app) });
    }
  }

  const candidates = await byPhone(input.waId);
  if (candidates.length === 1) return resolveTruth({ state: input.state, uniquePhoneApplication: toTruth(candidates[0]) });
  if (candidates.length > 1) {
    return resolveTruth({
      state: input.state,
      ambiguousApplications: candidates.map((app) => ({ id: app.id, trackingId: app.tracking_id || null, deviceName: app.device_name || null, status: app.status || null })),
    });
  }

  return resolveTruth({ state: input.state });
}
