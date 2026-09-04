import { BUSINESS_WEBSITE } from "../constants";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { continuationNeedsFeeNow } from "./commercialProgression";
import { canDiscloseFileOpeningPayment } from "./applicationJourney";
import type { ConversationState, InterpretedTurn, TopicKey, TruthBundle } from "./types";
import { explicitDocumentUploadKind } from "./operationalPrecision";

const HTTP_URL_RE = /https?:\/\/[^\s<>{}\[\]"']+/gi;
const DOMAIN_TOKEN_RE = /\b(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>{}\[\]"']*)?/gi;

export type OfficialLinkKind = "website" | "products" | "tracking" | "receipt" | "refund" | "identity" | "salarySlip" | "guarantor";

export type OfficialLinkContext = {
  baseUrl: string;
  relevant: Partial<Record<OfficialLinkKind, string>>;
  allowedUrls: string[];
  currentCustomerUrls: Array<{ officialHost: boolean }>;
  receiptLinkUnavailableReason: "application_not_resolved" | "payment_already_confirmed" | null;
};

function canonicalBaseUrl() {
  return String(BUSINESS_WEBSITE || "https://www.ameenfinance.co").replace(/\/+$/, "");
}

function trimUrlPunctuation(value: string) {
  return String(value || "").replace(/[،,.!?؛:]+$/g, "");
}

export function extractHttpUrls(value: string | null | undefined) {
  return (String(value || "").match(HTTP_URL_RE) || []).map(trimUrlPunctuation);
}

function safeUrl(value: string) {
  try { return new URL(value); } catch { return null; }
}

function normalizedHttpUrl(value: string) {
  const parsed = safeUrl(trimUrlPunctuation(value));
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) return null;
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "" : "/");
}

function officialHostnames() {
  const parsed = safeUrl(canonicalBaseUrl());
  const host = parsed?.hostname.toLowerCase() || "www.ameenfinance.co";
  return new Set([host, host.replace(/^www\./, ""), `www.${host.replace(/^www\./, "")}`]);
}

export function isOfficialAmeenHost(host: string | null | undefined) {
  if (!host) return false;
  return officialHostnames().has(String(host).toLowerCase());
}

function boundApplicationUrl(path: string, truth: TruthBundle) {
  const app = truth.application;
  if (!app?.id || !app.trackingId || !app.phone) return null;
  return `${canonicalBaseUrl()}${path}?tracking=${encodeURIComponent(app.trackingId)}&phone=${encodeURIComponent(app.phone)}`;
}

export function applicationRefundUrl(truth: TruthBundle) {
  const app = truth.application;
  if (!app?.id || !app.trackingId || !app.phone) return null;
  return `${canonicalBaseUrl()}/delay-decision?tracking=${encodeURIComponent(app.trackingId)}&phone=${encodeURIComponent(app.phone)}&mode=refund`;
}

function turnNeeds(topic: TopicKey, topics: TopicKey[]) {
  return topics.includes(topic);
}

function requirementLinks(turn: InterpretedTurn, truth: TruthBundle) {
  const result: Partial<Record<OfficialLinkKind, string>> = {};
  const explicitKind = explicitDocumentUploadKind(turn.rawText);
  if (!turnNeeds("requirements", turn.topics) && !turnNeeds("guarantor", turn.topics) && !explicitKind) return result;
  const app = truth.application;
  if (!app) return result;
  const docs = app.documents;
  const status = String(app.status || "").toLowerCase();

  if ((["needs_identity", "identity_requested"].includes(status) || explicitKind === "identity") && docs?.identityComplete !== true) {
    const url = boundApplicationUrl("/identity", truth);
    if (url) result.identity = url;
  }
  if ((["needs_salary_slip", "salary_slip_link_sent"].includes(status) || explicitKind === "salarySlip") && docs?.salarySlipUploaded !== true) {
    const url = boundApplicationUrl("/salary-slip", truth);
    if (url) result.salarySlip = url;
  }
  if ((status === "needs_guarantor" || explicitKind === "guarantor") && docs?.guarantorDataComplete !== true) {
    const url = boundApplicationUrl("/guarantor", truth);
    if (url) result.guarantor = url;
  }
  return result;
}

export function buildOfficialLinkContext(turn: InterpretedTurn, truth: TruthBundle): OfficialLinkContext {
  const baseUrl = canonicalBaseUrl();
  const relevant: Partial<Record<OfficialLinkKind, string>> = {};

  if (turnNeeds("website", turn.topics) || turnNeeds("trust", turn.topics)) relevant.website = baseUrl;
  if (turnNeeds("products", turn.topics)) relevant.products = `${baseUrl}/products`;
  const contextualStatusConfirmation = turn.acts.some((act) => act.topic === "application_status" && act.value === "confirm_current_application_status");
  if (turnNeeds("tracking", turn.topics) || (turnNeeds("application_status", turn.topics) && !contextualStatusConfirmation)) {
    relevant.tracking = boundApplicationUrl("/track", truth) || `${baseUrl}/track`;
  }

  Object.assign(relevant, requirementLinks(turn, truth));

  const paymentDisclosureAllowed = canDiscloseFileOpeningPayment(truth.application, turn);
  const receiptRequested = paymentDisclosureAllowed && (
    turnNeeds("receipt_upload", turn.topics) ||
    turnNeeds("payment_confirmation", turn.topics) ||
    (turnNeeds("continuation", turn.topics) && continuationNeedsFeeNow(truth))
  );
  const paymentConfirmed = hasAuthoritativePaymentConfirmation(truth.application);
  const receipt = receiptRequested && !paymentConfirmed ? boundApplicationUrl("/receipt", truth) : null;
  if (receipt) relevant.receipt = receipt;

  // Refund links are only issued from authoritative post-action truth. This
  // preserves all existing receipt/requirements safeguards while allowing the
  // deterministic paid-cancellation/refund response to pass link integrity.
  const refundRelevant = Boolean(
    truth.application &&
    (turnNeeds("refund", turn.topics) || turnNeeds("cancellation", turn.topics)) &&
    (String(truth.application.status || "").toLowerCase() === "refund_requested" ||
      String(truth.application.paymentStatus || "").toLowerCase() === "refund_requested")
  );
  const refund = refundRelevant ? applicationRefundUrl(truth) : null;
  if (refund) relevant.refund = refund;

  const currentCustomerUrls = extractHttpUrls(turn.rawText).map((value) => {
    const parsed = safeUrl(value);
    return { officialHost: isOfficialAmeenHost(parsed?.hostname) };
  });

  return {
    baseUrl,
    relevant,
    allowedUrls: Object.values(relevant).filter(Boolean) as string[],
    currentCustomerUrls,
    receiptLinkUnavailableReason: receiptRequested
      ? paymentConfirmed ? "payment_already_confirmed" : receipt ? null : "application_not_resolved"
      : null,
  };
}

export function sanitizeRecentTurnsForModel(recentTurns?: string[]) {
  return (recentTurns || []).map((turn) => String(turn || "").replace(HTTP_URL_RE, (url) => {
    const parsed = safeUrl(trimUrlPunctuation(url));
    if (parsed && isOfficialAmeenHost(parsed.hostname)) return "[رابط رسمي سابق محجوب؛ استخدم OFFICIAL_LINKS الحالية فقط]";
    return "[رابط سابق أرسله العميل أو ظهر في السياق — غير موثوق ولا يجوز إعادة استخدامه]";
  }));
}

export function sanitizeStateForWriter(state: ConversationState) {
  const redact = (value: string | null | undefined) => String(value || "").replace(HTTP_URL_RE, "[URL_REDACTED_FROM_STATE]");
  const sanitizePayload = (payload: Record<string, string | number | boolean | null> | null) => {
    if (!payload) return null;
    return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, typeof value === "string" ? redact(value) : value]));
  };
  return {
    role: state.role,
    currentTopic: state.currentTopic,
    openLoops: state.openLoops.slice(-10).map((loop) => ({ ...loop, question: loop.question ? redact(loop.question) : loop.question })),
    facts: state.facts.slice(-20).map((fact) => ({ ...fact, value: redact(fact.value) })),
    pendingAction: state.pendingAction,
    pendingActionPayload: sanitizePayload(state.pendingActionPayload),
  };
}

export function sanitizeTurnForWriter(turn: InterpretedTurn) {
  const customerUrls = extractHttpUrls(turn.rawText).map((value) => {
    const parsed = safeUrl(value);
    return { officialHost: isOfficialAmeenHost(parsed?.hostname) };
  });
  const redact = (value: string) => String(value || "").replace(HTTP_URL_RE, "[CUSTOMER_URL_REDACTED]");
  return {
    ...turn,
    rawText: redact(turn.rawText),
    normalizedText: redact(turn.normalizedText),
    acts: turn.acts.map((act) => ({ ...act, text: redact(act.text) })),
    customerUrls,
  };
}

function normalizeAllowedSet(urls: string[]) {
  return new Set(urls.map((url) => normalizedHttpUrl(url)).filter(Boolean) as string[]);
}

export function detectReplyLinkViolations(input: { reply: string; turn: InterpretedTurn; truth: TruthBundle }) {
  const violations: string[] = [];
  const context = buildOfficialLinkContext(input.turn, input.truth);
  const allowed = normalizeAllowedSet(context.allowedUrls);
  const replyUrls = extractHttpUrls(input.reply);

  for (const raw of replyUrls) {
    const parsed = safeUrl(raw);
    const normalized = normalizedHttpUrl(raw);
    if (!parsed || !normalized) { violations.push("malformed_url_in_reply"); continue; }
    if (!isOfficialAmeenHost(parsed.hostname)) violations.push(`foreign_domain_url:${parsed.hostname.toLowerCase()}`);
    if (!allowed.has(normalized)) violations.push(`url_not_issued_by_v3_truth:${parsed.hostname.toLowerCase()}${parsed.pathname}`);
  }

  const domainTokens = String(input.reply || "").match(DOMAIN_TOKEN_RE) || [];
  for (const token of domainTokens) {
    const host = token.split("/")[0].toLowerCase();
    if (!isOfficialAmeenHost(host)) violations.push(`foreign_domain_reference:${host}`);
  }

  const paymentDisclosureAllowed = canDiscloseFileOpeningPayment(input.truth.application, input.turn);
  if (paymentDisclosureAllowed && (input.turn.topics.includes("receipt_upload") || (input.turn.topics.includes("continuation") && continuationNeedsFeeNow(input.truth)))) {
    if (context.receiptLinkUnavailableReason === "payment_already_confirmed") {
      if (replyUrls.length) violations.push("receipt_link_sent_after_payment_confirmed");
    } else if (context.relevant.receipt) {
      const expected = normalizedHttpUrl(context.relevant.receipt);
      if (!replyUrls.some((url) => normalizedHttpUrl(url) === expected)) violations.push("required_receipt_url_missing");
    } else {
      const normalizedReply = String(input.reply || "").replace(/[أإآ]/g, "ا").replace(/[ى]/g, "ي");
      const asksForBinding = /رقم\s*(?:التتبع|الطلب)/.test(normalizedReply);
      if (!asksForBinding) violations.push("receipt_link_requires_application_resolution");
    }
  }

  if (input.turn.topics.includes("website") && context.relevant.website) {
    const expected = normalizedHttpUrl(context.relevant.website);
    if (!replyUrls.some((url) => normalizedHttpUrl(url) === expected)) violations.push("required_website_url_missing");
  }

  const contextualStatusConfirmation = input.turn.acts.some((act) => act.topic === "application_status" && act.value === "confirm_current_application_status");
  if ((input.turn.topics.includes("tracking") || (input.turn.topics.includes("application_status") && !contextualStatusConfirmation)) && context.relevant.tracking) {
    const expected = normalizedHttpUrl(context.relevant.tracking);
    if (!replyUrls.some((url) => normalizedHttpUrl(url) === expected)) violations.push("required_tracking_url_missing");
  }

  const explicitDocumentKind = explicitDocumentUploadKind(input.turn.rawText);
  if (explicitDocumentKind) {
    const expectedRaw = context.relevant[explicitDocumentKind];
    if (expectedRaw) {
      const expected = normalizedHttpUrl(expectedRaw);
      if (!replyUrls.some((url) => normalizedHttpUrl(url) === expected)) {
        violations.push(`required_explicit_document_upload_url_missing:${explicitDocumentKind}`);
      }
    }
  }

  return Array.from(new Set(violations));
}
