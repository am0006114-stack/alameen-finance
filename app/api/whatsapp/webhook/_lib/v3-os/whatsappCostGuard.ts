import { supabaseAdmin } from "@/lib/supabaseAdmin";

function envNumber(name: string, fallback: number) {
  const n = Number(process.env[name] ?? "");
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function pricingOf(raw: any) {
  const pricing = raw && typeof raw === "object" ? raw.pricing : null;
  return pricing && typeof pricing === "object" ? pricing : null;
}

export type WhatsAppCostSnapshot = {
  monthStart: string;
  uniqueOutgoingWithPricing: number;
  freeService: number;
  paidService: number;
  paidUtility: number;
  otherBillable: number;
  totalBillable: number;
  serviceFreeTierConfigured: number;
  freeTierRemaining: number;
  estimatedCostUsd: number | null;
  configuredUnitCostUsd: number | null;
};

export async function loadWhatsAppMonthlyCostSnapshot(now = new Date()): Promise<WhatsAppCostSnapshot> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const pageSize = 1000;
  const maxRows = Math.max(1000, Math.min(envNumber("WHATSAPP_COST_GUARD_MAX_SCAN_ROWS", 20000), 100000));
  const byMessage = new Map<string, any>();

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("message_id,created_at,raw_payload")
      .eq("direction", "outgoing")
      .gte("created_at", monthStart)
      .order("created_at", { ascending: true })
      .range(from, Math.min(from + pageSize - 1, maxRows - 1));
    if (error) throw new Error(`whatsapp_cost_guard_read:${error.message}`);
    const rows = data || [];
    for (const row of rows) {
      const id = String(row.message_id || "").trim();
      if (!id) continue;
      const pricing = pricingOf(row.raw_payload);
      if (pricing) byMessage.set(id, pricing);
    }
    if (rows.length < pageSize) break;
  }

  let freeService = 0, paidService = 0, paidUtility = 0, otherBillable = 0;
  for (const pricing of byMessage.values()) {
    const type = String(pricing.type || "").toLowerCase();
    const category = String(pricing.category || "").toLowerCase();
    const billable = pricing.billable === true || String(pricing.billable).toLowerCase() === "true";
    if (!billable && type === "free_customer_service") freeService++;
    else if (billable && category === "service") paidService++;
    else if (billable && category === "utility") paidUtility++;
    else if (billable) otherBillable++;
  }

  const totalBillable = paidService + paidUtility + otherBillable;
  const serviceFreeTierConfigured = envNumber("WHATSAPP_SERVICE_FREE_TIER", 1000);
  const freeTierRemaining = Math.max(0, serviceFreeTierConfigured - freeService);
  const unitCost = envNumber("WHATSAPP_COST_PER_PAID_MESSAGE_USD", 0);
  const configuredUnitCostUsd = unitCost > 0 ? unitCost : null;

  return {
    monthStart,
    uniqueOutgoingWithPricing: byMessage.size,
    freeService,
    paidService,
    paidUtility,
    otherBillable,
    totalBillable,
    serviceFreeTierConfigured,
    freeTierRemaining,
    estimatedCostUsd: configuredUnitCostUsd == null ? null : Math.round(totalBillable * configuredUnitCostUsd * 10000) / 10000,
    configuredUnitCostUsd,
  };
}

export function obviousLowValueWhatsAppReply(value: string | null | undefined) {
  const q = String(value || "").trim().replace(/[.!؟?،,]+$/g, "").trim().toLowerCase();
  if (!q || q.length > 80) return false;
  return /^(?:العفو|اهلا وسهلا|أهلا وسهلا|بالخدمة|تكرم|تكرمي|تمام|اوكي|أوكي|شكرا الك|شكرًا الك|يعطيك العافية|الله يعافيك)(?:\s*[🙏👍❤️❤]*)$/.test(q);
}
