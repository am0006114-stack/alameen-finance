import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ApplicationRecord } from "../types";
import { normalizeJordanPhone, normalizeWhatsAppToSend } from "../text";
import type { V2ConversationState } from "../v2-conversation";
import { V2_POLICY, policyTruthForPrompt } from "./policyRegistry";

export type V2TruthConfidence = "high" | "medium" | "none";

export type V2ResolvedTruth = {
  application: ApplicationRecord | null;
  confidence: V2TruthConfidence;
  source:
    | "current_tracking"
    | "state_application_id"
    | "state_tracking"
    | "recent_message_tracking"
    | "single_phone_application"
    | "latest_phone_application"
    | "ambiguous_phone_applications"
    | "none";
  candidateCount: number;
  trustedLinks: string[];
  policy: ReturnType<typeof policyTruthForPrompt>;
};

const APP_SELECT = "id,created_at,tracking_id,full_name,phone,status,payment_status,payment_confirmed_at,payment_reference,device_name,salary,delivery_delay_until";

function trackingFromText(value: string | null | undefined) {
  const matches = String(value || "").match(/AM-\d{8,}/gi) || [];
  return matches.length ? matches[matches.length - 1].toUpperCase() : "";
}

function phoneVariants(value: string | null | undefined) {
  const local = normalizeJordanPhone(value);
  if (!local) return [];
  const wa = normalizeWhatsAppToSend(local);
  return Array.from(new Set([
    local,
    wa,
    wa ? `+${wa}` : "",
    local.startsWith("0") ? local.slice(1) : local,
  ].filter(Boolean)));
}

async function byId(id: string | null | undefined) {
  const clean = String(id || "").trim();
  if (!clean) return null;
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(APP_SELECT)
    .eq("id", clean)
    .maybeSingle();
  if (error) {
    console.error("V2 direct truth by id failed", error.message);
    return null;
  }
  return (data || null) as ApplicationRecord | null;
}

async function byTracking(tracking: string | null | undefined) {
  const clean = String(tracking || "").trim().toUpperCase();
  if (!clean) return null;
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(APP_SELECT)
    .eq("tracking_id", clean)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("V2 direct truth by tracking failed", error.message);
    return null;
  }
  return (data || null) as ApplicationRecord | null;
}

async function applicationsByPhone(phone: string) {
  const variants = phoneVariants(phone);
  if (!variants.length) return [] as ApplicationRecord[];
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(APP_SELECT)
    .in("phone", variants)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    console.error("V2 direct truth by phone failed", error.message);
    return [] as ApplicationRecord[];
  }
  return (data || []) as ApplicationRecord[];
}

async function recentTrackingForWaId(waId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("tracking_id,body,created_at")
    .eq("wa_id", waId)
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) {
    console.error("V2 recent message tracking lookup failed", error.message);
    return "";
  }
  for (const row of data || []) {
    const direct = String(row.tracking_id || "").trim().toUpperCase();
    if (/^AM-\d{8,}$/.test(direct)) return direct;
    const bodyTracking = trackingFromText(row.body);
    if (bodyTracking) return bodyTracking;
  }
  return "";
}

function trustedLinks(app: ApplicationRecord | null) {
  const links = new Set<string>([V2_POLICY.website, `${V2_POLICY.website}/products`, `${V2_POLICY.website}/track`]);
  const tracking = String(app?.tracking_id || "").trim();
  const phone = normalizeJordanPhone(app?.phone || "");
  if (tracking && phone) {
    links.add(`${V2_POLICY.website}/track?phone=${encodeURIComponent(phone)}&tracking=${encodeURIComponent(tracking)}`);
    links.add(`${V2_POLICY.website}/receipt?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`);
  }
  return Array.from(links);
}

function result(application: ApplicationRecord | null, confidence: V2TruthConfidence, source: V2ResolvedTruth["source"], candidateCount = application ? 1 : 0): V2ResolvedTruth {
  return {
    application,
    confidence,
    source,
    candidateCount,
    trustedLinks: trustedLinks(application),
    policy: policyTruthForPrompt(),
  };
}

export async function resolveV2ProductionTruth(input: {
  waId: string;
  customerText: string;
  state?: V2ConversationState | null;
}): Promise<V2ResolvedTruth> {
  const currentTracking = trackingFromText(input.customerText);
  if (currentTracking) {
    const app = await byTracking(currentTracking);
    if (app) return result(app, "high", "current_tracking");
  }

  // Prefer tracking actually present in recent WhatsApp records over persisted V2 state.
  // This prevents a bad application lock from an older runtime from contaminating the cutover.
  const recentTracking = await recentTrackingForWaId(input.waId);
  if (recentTracking) {
    const app = await byTracking(recentTracking);
    if (app) return result(app, "high", "recent_message_tracking");
  }

  if (input.state?.activeApplicationId) {
    const app = await byId(input.state.activeApplicationId);
    if (app) return result(app, "high", "state_application_id");
  }

  if (input.state?.activeTrackingId) {
    const app = await byTracking(input.state.activeTrackingId);
    if (app) return result(app, "high", "state_tracking");
  }

  const candidates = await applicationsByPhone(input.waId);
  if (candidates.length === 1) return result(candidates[0], "high", "single_phone_application", 1);
  if (candidates.length > 1) {
    // With no explicit historical pointer, the newest application is useful context but must
    // be treated as medium confidence by the writer. We never manufacture a state from memory.
    return result(candidates[0], "medium", "latest_phone_application", candidates.length);
  }

  return result(null, "none", "none", 0);
}

export function applicationTruthForPrompt(truth: V2ResolvedTruth) {
  const app = truth.application;
  return {
    truth_confidence: truth.confidence,
    truth_source: truth.source,
    candidate_count: truth.candidateCount,
    application: app ? {
      id: app.id,
      tracking_id: app.tracking_id || null,
      full_name: app.full_name || null,
      phone: app.phone || null,
      status: app.status || null,
      payment_status: app.payment_status || null,
      payment_confirmed_at: app.payment_confirmed_at || null,
      payment_reference: app.payment_reference || null,
      device_name: app.device_name || null,
      salary: app.salary ?? null,
      delivery_delay_until: app.delivery_delay_until || null,
    } : null,
    trusted_links: truth.trustedLinks,
    policy: truth.policy,
  };
}
