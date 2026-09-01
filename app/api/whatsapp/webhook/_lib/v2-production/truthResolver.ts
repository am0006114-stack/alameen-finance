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
    .eq("direction", "incoming")
    .order("created_at", { ascending: false })
    .limit(80);
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

function verifiedStateBinding(state?: V2ConversationState | null) {
  const facts = state?.facts || [];
  const activeId = String(state?.activeApplicationId || "").trim();
  const activeTracking = String(state?.activeTrackingId || "").trim().toUpperCase();
  const idVerified = Boolean(activeId && facts.some((fact) => fact.source === "system" && fact.key === "v2_verified_application_id" && String(fact.value) === activeId));
  const trackingVerified = Boolean(activeTracking && facts.some((fact) => fact.source === "system" && fact.key === "v2_verified_tracking_id" && String(fact.value).toUpperCase() === activeTracking));
  return {
    applicationId: idVerified ? activeId : "",
    trackingId: trackingVerified ? activeTracking : "",
  };
}

function applicationBelongsToWaId(app: ApplicationRecord | null, waId: string) {
  if (!app) return false;
  const variants = new Set(phoneVariants(waId).map((x) => String(x).replace(/\D/g, "")));
  const appVariants = phoneVariants(app.phone || "").map((x) => String(x).replace(/\D/g, ""));
  return appVariants.some((value) => variants.has(value));
}

function trustedLinks(app: ApplicationRecord | null) {
  const links = new Set<string>([V2_POLICY.website, `${V2_POLICY.website}/products`, `${V2_POLICY.website}/track`]);
  const tracking = String(app?.tracking_id || "").trim();
  const phone = normalizeJordanPhone(app?.phone || "");
  if (tracking && phone) {
    links.add(`${V2_POLICY.website}/track?phone=${encodeURIComponent(phone)}&tracking=${encodeURIComponent(tracking)}`);
    links.add(`${V2_POLICY.website}/receipt?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`);
    links.add(`${V2_POLICY.website}/identity?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`);
    links.add(`${V2_POLICY.website}/guarantor?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`);
    links.add(`${V2_POLICY.website}/salary-slip?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`);
    links.add(`${V2_POLICY.website}/refund?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`);
    links.add(`${V2_POLICY.website}/change-device?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`);
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
    if (app && applicationBelongsToWaId(app, input.waId)) return result(app, "high", "current_tracking");
  }

  // Only customer-originated WhatsApp messages are allowed to provide historical tracking truth.
  // Outgoing assistant messages are narrative history and can never bind an application.
  const recentTracking = await recentTrackingForWaId(input.waId);
  if (recentTracking) {
    const app = await byTracking(recentTracking);
    if (app && applicationBelongsToWaId(app, input.waId)) return result(app, "high", "recent_message_tracking");
  }

  // Persisted state is trusted only after this V2.1 runtime itself recorded a verified
  // binding from live Supabase truth. Pre-cutover state can therefore never bind a file.
  const verifiedState = verifiedStateBinding(input.state);
  if (verifiedState.applicationId) {
    const app = await byId(verifiedState.applicationId);
    if (app && applicationBelongsToWaId(app, input.waId)) return result(app, "high", "state_application_id");
  }
  if (verifiedState.trackingId) {
    const app = await byTracking(verifiedState.trackingId);
    if (app && applicationBelongsToWaId(app, input.waId)) return result(app, "high", "state_tracking");
  }

  const candidates = await applicationsByPhone(input.waId);
  if (candidates.length === 1) return result(candidates[0], "high", "single_phone_application", 1);
  if (candidates.length > 1) {
    // Never personalize from "latest application" when more than one application exists.
    // A strong customer-originated pointer is required before exposing application-specific truth.
    return result(null, "medium", "ambiguous_phone_applications", candidates.length);
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
