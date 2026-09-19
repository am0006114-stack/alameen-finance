import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeJordanPhone, normalizeWhatsAppToSend } from "../text";
import type { ApplicationTruth, ConversationState, DocumentTruth, TopicKey, TruthBundle } from "./types";
import { resolveTruth } from "./truth";

import { approvedApplicationIdsForWhatsApp, approvedWhatsAppAliasForApplication } from "./applicationContactIdentity";

const APP_SELECT = "id,created_at,tracking_id,full_name,phone,email,status,payment_status,payment_confirmed_at,payment_reference,device_id,device_name,device_price,installment_months,down_payment,interest_rate,monthly_payment,total_with_interest,salary,delivery_delay_until,guarantor_name,guarantor_phone,guarantor_national_id,preliminary_qualified_at,paid_clicked_at";
const CORE_APP_SELECT = "id,created_at,tracking_id,full_name,phone,status,payment_status,payment_confirmed_at,device_name,installment_months,monthly_payment,preliminary_qualified_at";
const TRUTH_RETRY_DELAYS_MS = [0, 140, 420];
const VERIFIED_SNAPSHOT_MAX_AGE_MS = 20 * 60 * 1000;

const PAYMENT_CONFIRMED = new Set(["confirmed", "paid", "payment_confirmed"]);
const PAYMENT_PENDING = new Set(["customer_claimed_paid", "pending_payment_confirmation"]);
const TERMINAL_STATUSES = new Set(["rejected", "cancelled", "refund_completed"]);
const PAYMENT_TOPICS = new Set<TopicKey>(["payment_status", "payment_confirmation", "receipt_upload", "refund"]);

type ApplicationRow = {
  id: string;
  created_at?: string | null;
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
  guarantor_name?: string | null;
  guarantor_phone?: string | null;
  guarantor_national_id?: string | null;
  preliminary_qualified_at?: string | null;
  paid_clicked_at?: string | null;
};

type DocumentRow = {
  document_type?: string | null;
  type?: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retrySupabaseRead<T>(label: string, fn: () => Promise<{ data: T; error: { message?: string } | null }>): Promise<T> {
  let last = "unknown";
  for (let i = 0; i < TRUTH_RETRY_DELAYS_MS.length; i++) {
    const wait = TRUTH_RETRY_DELAYS_MS[i];
    if (wait) await sleep(wait);
    try {
      const { data, error } = await fn();
      if (!error) return data;
      last = String(error.message || "unknown");
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`${label}:${last}`);
}

async function readApplicationWithFallback(label: string, full: () => Promise<{ data: ApplicationRow | null; error: { message?: string } | null }>, core: () => Promise<{ data: ApplicationRow | null; error: { message?: string } | null }>) {
  try {
    return await retrySupabaseRead<ApplicationRow | null>(label, full);
  } catch (fullError) {
    console.error(`${label}_full_read_failed`, fullError);
    return retrySupabaseRead<ApplicationRow | null>(`${label}_core`, core);
  }
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function documentType(row: DocumentRow) {
  return String(row.document_type || row.type || "").trim().toLowerCase();
}

async function loadDocumentTruth(applicationId: string, app: ApplicationRow): Promise<DocumentTruth> {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("document_type,type")
    .eq("application_id", applicationId);

  if (error) {
    console.error("v3_truth_documents:", error.message);
    return {
      loaded: false,
      types: [],
      identityComplete: null,
      salarySlipUploaded: null,
      guarantorIdentityComplete: null,
      guarantorDataComplete: null,
      paymentReceiptUploaded: null,
    };
  }

  const types = Array.from(new Set(((data || []) as DocumentRow[]).map(documentType).filter(Boolean)));
  const has = (...values: string[]) => values.some((value) => types.includes(value));
  const identityFront = has("applicant_front", "applicant_id_front");
  const identityBack = has("applicant_back", "applicant_id_back");
  const guarantorFront = has("guarantor_front", "guarantor_id_front");
  const guarantorBack = has("guarantor_back", "guarantor_id_back");

  return {
    loaded: true,
    types,
    identityComplete: identityFront && identityBack,
    salarySlipUploaded: has("salary_slip"),
    guarantorIdentityComplete: guarantorFront && guarantorBack,
    guarantorDataComplete: Boolean(app.guarantor_name && app.guarantor_phone && app.guarantor_national_id),
    paymentReceiptUploaded: has("payment_receipt"),
  };
}

async function toTruth(app: ApplicationRow | null | undefined): Promise<ApplicationTruth | null> {
  if (!app?.id) return null;
  return {
    id: String(app.id),
    createdAt: app.created_at || null,
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
    guarantorName: app.guarantor_name || null,
    guarantorPhone: app.guarantor_phone || null,
    guarantorNationalId: app.guarantor_national_id || null,
    preliminaryQualifiedAt: app.preliminary_qualified_at || null,
    paidClickedAt: app.paid_clicked_at || null,
    documents: await loadDocumentTruth(String(app.id), app),
  };
}

function trackingFromText(value: string | null | undefined) {
  const explicit = String(value || "").match(/AM-\d{8,}/gi) || [];
  return explicit.length ? explicit[explicit.length - 1].toUpperCase() : "";
}

function trackingFromRecentTurns(recentTurns?: string[]) {
  for (let i = (recentTurns || []).length - 1; i >= 0; i--) {
    const found = trackingFromText(recentTurns?.[i]);
    if (found) return found;
  }
  return "";
}

function jordanPhoneFromText(value: string | null | undefined) {
  const raw = String(value || "")
    .replace(/AM-\d{8,}/gi, " ")
    .replace(/(?:^|\D)1\d{11,14}(?=\D|$)/g, " ");
  const candidates = raw.match(/(?:\+?962|00962|0)?7[789]\d{7}/g) || [];
  for (const candidate of candidates) {
    const local = normalizeJordanPhone(candidate);
    if (/^07[789]\d{7}$/.test(local)) return local;
  }
  return "";
}

function phoneFromRecentCustomerTurns(recentTurns?: string[]) {
  for (let i = (recentTurns || []).length - 1; i >= 0; i--) {
    const line = String(recentTurns?.[i] || "");
    if (!/^\s*(?:العميل|customer)\s*:/i.test(line)) continue;
    const found = jordanPhoneFromText(line);
    if (found) return found;
  }
  return "";
}

function phoneVariants(value: string | null | undefined) {
  const local = normalizeJordanPhone(value);
  if (!local) return [];
  const wa = normalizeWhatsAppToSend(local);
  return Array.from(new Set([local, wa, wa ? `+${wa}` : "", local.startsWith("0") ? local.slice(1) : local].filter(Boolean)));
}

export function contactPhonesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = new Set(phoneVariants(a).map((x) => x.replace(/\D/g, "")));
  if (!left.size) return false;
  return phoneVariants(b).some((x) => left.has(x.replace(/\D/g, "")));
}

export function suppliedPhoneConflictsWithSender(waId: string, suppliedPhone?: string | null) {
  const supplied = normalizeJordanPhone(suppliedPhone || "");
  if (!supplied) return false;
  return !contactPhonesMatch(waId, supplied);
}

function primaryContactAllowsApplication(app: ApplicationRow | null, waId: string) {
  if (!app) return false;
  return contactPhonesMatch(app.phone || "", waId);
}

async function fullContactAccess(app: ApplicationRow | null, waId: string, state: ConversationState) {
  if (!app) return { allowed: false, source: null as TruthBundle["source"] | null };
  if (contactPhonesMatch(app.phone || "", waId)) return { allowed: true, source: "current_message_tracking" as TruthBundle["source"] };
  // Phase 7.6.0: customer-declared/state-only aliases never grant application access.
  // Only the primary application phone or a customer-confirmed persisted WhatsApp alias does.
  const approved = await approvedWhatsAppAliasForApplication({ applicationId: app.id, waId });
  return approved ? { allowed: true, source: "approved_contact_alias" as TruthBundle["source"] } : { allowed: false, source: null };
}

function identityLookupPhone(_state: ConversationState, waId: string) {
  return waId;
}

function identitySource(_state: ConversationState, _waId: string, fallback: TruthBundle["source"]): TruthBundle["source"] {
  return fallback;
}

function paymentConfirmedRow(app: ApplicationRow) {
  return Boolean(app.payment_confirmed_at) || PAYMENT_CONFIRMED.has(String(app.payment_status || "").toLowerCase());
}

function paymentPendingRow(app: ApplicationRow) {
  return PAYMENT_PENDING.has(String(app.payment_status || "").toLowerCase());
}

function isTerminal(app: ApplicationRow) {
  return TERMINAL_STATUSES.has(String(app.status || "").toLowerCase());
}

async function byTracking(tracking: string) {
  return readApplicationWithFallback(
    "v3_truth_tracking",
    async () => {
      const { data, error } = await supabaseAdmin.from("applications").select(APP_SELECT).eq("tracking_id", tracking).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return { data: (data || null) as ApplicationRow | null, error };
    },
    async () => {
      const { data, error } = await supabaseAdmin.from("applications").select(CORE_APP_SELECT).eq("tracking_id", tracking).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return { data: (data || null) as ApplicationRow | null, error };
    },
  );
}

async function byId(id: string) {
  return readApplicationWithFallback(
    "v3_truth_id",
    async () => {
      const { data, error } = await supabaseAdmin.from("applications").select(APP_SELECT).eq("id", id).maybeSingle();
      return { data: (data || null) as ApplicationRow | null, error };
    },
    async () => {
      const { data, error } = await supabaseAdmin.from("applications").select(CORE_APP_SELECT).eq("id", id).maybeSingle();
      return { data: (data || null) as ApplicationRow | null, error };
    },
  );
}

async function byPhone(identifier: string) {
  const variants = phoneVariants(identifier);
  if (!variants.length) return [] as ApplicationRow[];
  try {
    return await retrySupabaseRead<ApplicationRow[]>("v3_truth_phone", async () => {
      const { data, error } = await supabaseAdmin.from("applications").select(APP_SELECT).in("phone", variants).order("created_at", { ascending: false }).limit(20);
      return { data: (data || []) as ApplicationRow[], error };
    });
  } catch (fullError) {
    console.error("v3_truth_phone_full_read_failed", fullError);
    return retrySupabaseRead<ApplicationRow[]>("v3_truth_phone_core", async () => {
      const { data, error } = await supabaseAdmin.from("applications").select(CORE_APP_SELECT).in("phone", variants).order("created_at", { ascending: false }).limit(20);
      return { data: (data || []) as ApplicationRow[], error };
    });
  }
}

function ambiguousRows(candidates: ApplicationRow[]): TruthBundle["ambiguousApplications"] {
  return candidates.map((app) => ({
    id: app.id,
    trackingId: app.tracking_id || null,
    deviceName: app.device_name || null,
    status: app.status || null,
    paymentStatus: app.payment_status || null,
  }));
}

async function authoritativeBundle(source: TruthBundle["source"], app: ApplicationRow, state: ConversationState, contactAccess: TruthBundle["contactAccess"] = "full"): Promise<TruthBundle> {
  const truth = await toTruth(app);
  if (!truth) return resolveTruth({ state });
  return {
    confidence: source === "current_message_tracking" ? "authoritative" : "high",
    source,
    contactAccess,
    application: truth,
    ambiguousApplications: [],
    policy: resolveTruth({ state }).policy,
    fetchedAt: new Date().toISOString(),
  };
}

async function safePreviewBundle(app: ApplicationRow, state: ConversationState, warnings: string[]): Promise<TruthBundle> {
  const truth = await toTruth(app);
  if (!truth) return { ...resolveTruth({ state }), contactAccess: "none", readWarnings: warnings };
  const safe: ApplicationTruth = {
    ...truth,
    fullName: null,
    phone: null,
    email: null,
    salary: null,
    guarantorName: null,
    guarantorPhone: null,
    guarantorNationalId: null,
    paymentReference: null,
    documents: null,
  };
  return {
    confidence: "authoritative",
    source: "tracking_safe_preview",
    contactAccess: "safe_preview",
    application: safe,
    ambiguousApplications: [],
    policy: resolveTruth({ state }).policy,
    fetchedAt: new Date().toISOString(),
    readWarnings: Array.from(new Set([...warnings, "contact_identity_safe_preview"])),
  };
}

function snapshotAllowedForTopics(topics?: TopicKey[]) {
  const sensitive = new Set<TopicKey>(["payment_status", "payment_confirmation", "receipt_upload", "refund", "cancellation", "reopen", "application_correction", "device_change"]);
  return !(topics || []).some((topic) => sensitive.has(topic));
}

function snapshotBundle(input: { state: ConversationState; waId: string; suppliedPhone?: string | null; topics?: TopicKey[]; warnings: string[] }): TruthBundle | null {
  const snapshot = input.state.lastVerifiedApplication;
  if (!snapshot?.application || !snapshotAllowedForTopics(input.topics)) return null;
  const age = Date.now() - new Date(snapshot.fetchedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > VERIFIED_SNAPSHOT_MAX_AGE_MS) return null;
  const row = snapshot.application as unknown as ApplicationRow;
  if (!primaryContactAllowsApplication(row, input.waId)) return null;
  return {
    confidence: "medium",
    source: "verified_state_snapshot",
    application: snapshot.application,
    ambiguousApplications: [],
    policy: resolveTruth({ state: input.state }).policy,
    fetchedAt: snapshot.fetchedAt,
    degraded: true,
    readWarnings: input.warnings,
  };
}

async function attemptLookup<T>(label: string, warnings: string[], fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`${label}:${message}`);
    console.error(`V3 truth lookup ${label} failed after retry`, error);
    return null;
  }
}

export async function resolveV3ProductionTruth(input: {
  waId: string;
  customerText: string;
  state: ConversationState;
  recentTurns?: string[];
  topics?: TopicKey[];
}): Promise<TruthBundle> {
  const warnings: string[] = [];
  const suppliedPhone = jordanPhoneFromText(input.customerText) || phoneFromRecentCustomerTurns(input.recentTurns);
  const currentTracking = trackingFromText(input.customerText);
  const suppliedPhoneConflict = suppliedPhoneConflictsWithSender(input.waId, suppliedPhone);

  if (currentTracking) {
    const app = await attemptLookup("current_tracking", warnings, () => byTracking(currentTracking));
    if (app) {
      const access = await fullContactAccess(app, input.waId, input.state);
      if (access.allowed) return authoritativeBundle(access.source === "approved_contact_alias" ? "approved_contact_alias" : identitySource(input.state, input.waId, "current_message_tracking"), app, input.state, "full");
      return safePreviewBundle(app, input.state, Array.from(new Set([
        ...warnings,
        "contact_identity_mismatch_current_tracking",
        ...(suppliedPhoneConflict ? ["supplied_phone_differs_from_whatsapp_sender"] : []),
      ])));
    }
  }

  // Sticky binding first: once an application was authoritatively bound, keep using its id/tracking
  // across short follow-ups instead of rediscovering from generic phone matching every turn.
  if (input.state.activeApplicationId) {
    const app = await attemptLookup("active_application_id", warnings, () => byId(input.state.activeApplicationId as string));
    if (app) {
      const access = await fullContactAccess(app, input.waId, input.state);
      if (access.allowed) return authoritativeBundle(access.source === "approved_contact_alias" ? "approved_contact_alias" : identitySource(input.state, input.waId, "conversation_binding"), app, input.state, "full");
      if (input.state.contactResolution?.trackingId && input.state.contactResolution.trackingId === app.tracking_id) return safePreviewBundle(app, input.state, warnings);
    }
  }

  if (input.state.activeTrackingId) {
    const app = await attemptLookup("active_tracking", warnings, () => byTracking(input.state.activeTrackingId as string));
    if (app) {
      const access = await fullContactAccess(app, input.waId, input.state);
      if (access.allowed) return authoritativeBundle(access.source === "approved_contact_alias" ? "approved_contact_alias" : identitySource(input.state, input.waId, "conversation_binding"), app, input.state, "full");
      if (input.state.contactResolution?.trackingId === input.state.activeTrackingId) return safePreviewBundle(app, input.state, warnings);
    }
  }

  const recentTracking = trackingFromRecentTurns(input.recentTurns);
  if (recentTracking) {
    const app = await attemptLookup("recent_tracking", warnings, () => byTracking(recentTracking));
    if (app) {
      const access = await fullContactAccess(app, input.waId, input.state);
      if (access.allowed) return authoritativeBundle(access.source === "approved_contact_alias" ? "approved_contact_alias" : identitySource(input.state, input.waId, "recent_conversation_tracking"), app, input.state, "full");
    }
  }

  const lookupPhone = identityLookupPhone(input.state, input.waId);
  const candidates = await attemptLookup("phone_candidates", warnings, () => byPhone(lookupPhone));
  if (candidates?.length === 1) return authoritativeBundle(identitySource(input.state, input.waId, "unique_phone_match"), candidates[0], input.state, "full");

  if (!candidates?.length) {
    const approvedIds = await approvedApplicationIdsForWhatsApp(input.waId);
    if (approvedIds.length === 1) {
      const approvedApp = await attemptLookup("approved_alias_application", warnings, () => byId(approvedIds[0]));
      if (approvedApp) return authoritativeBundle("approved_contact_alias", approvedApp, input.state, "full");
    }
    if (approvedIds.length > 1) {
      const approvedRows = (await Promise.all(approvedIds.slice(0, 10).map((id) => attemptLookup("approved_alias_application", warnings, () => byId(id))))).filter(Boolean) as ApplicationRow[];
      if (approvedRows.length === 1) return authoritativeBundle("approved_contact_alias", approvedRows[0], input.state, "full");
      if (approvedRows.length > 1) {
        const ambiguous = resolveTruth({ state: input.state, ambiguousApplications: ambiguousRows(approvedRows) });
        return { ...ambiguous, contactAccess: "full", readWarnings: warnings.length ? warnings : undefined };
      }
    }
  }

  if (candidates && candidates.length > 1) {
    const paymentQuestion = (input.topics || []).some((topic) => PAYMENT_TOPICS.has(topic));
    if (paymentQuestion) {
      const confirmed = candidates.filter(paymentConfirmedRow);
      if (confirmed.length === 1) return authoritativeBundle(identitySource(input.state, input.waId, "unique_relevant_phone_match"), confirmed[0], input.state);
      if (!confirmed.length) {
        const pending = candidates.filter(paymentPendingRow);
        if (pending.length === 1) return authoritativeBundle(identitySource(input.state, input.waId, "unique_relevant_phone_match"), pending[0], input.state);
      }
    }

    const active = candidates.filter((app) => !isTerminal(app));
    if (active.length === 1) return authoritativeBundle(identitySource(input.state, input.waId, "unique_relevant_phone_match"), active[0], input.state);

    const ambiguous = resolveTruth({ state: input.state, ambiguousApplications: ambiguousRows(candidates) });
    return { ...ambiguous, readWarnings: warnings.length ? warnings : undefined };
  }

  if (warnings.length) {
    const cached = snapshotBundle({ state: input.state, waId: input.waId, suppliedPhone, topics: input.topics, warnings });
    if (cached) return cached;
  }

  const empty = resolveTruth({ state: input.state });
  return { ...empty, contactAccess: "none", degraded: warnings.length > 0, readWarnings: warnings.length ? warnings : undefined };
}
