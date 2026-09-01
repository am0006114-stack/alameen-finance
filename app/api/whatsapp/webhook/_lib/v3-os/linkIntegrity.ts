import { BUSINESS_WEBSITE } from "../constants";
import type { ConversationState, InterpretedTurn, TopicKey, TruthBundle } from "./types";

const HTTP_URL_RE = /https?:\/\/[^\s<>{}\[\]"']+/gi;
const DOMAIN_TOKEN_RE = /\b(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>{}\[\]"']*)?/gi;

export type OfficialLinkKind = "website" | "products" | "tracking" | "receipt";

export type OfficialLinkContext = {
  baseUrl: string;
  relevant: Partial<Record<OfficialLinkKind, string>>;
  allowedUrls: string[];
  currentCustomerUrls: Array<{ officialHost: boolean }>;
  receiptLinkUnavailableReason: "application_not_resolved" | null;
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
  try {
    return new URL(value);
  } catch {
    return null;
  }
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

function applicationReceiptUrl(truth: TruthBundle) {
  const app = truth.application;
  if (!app?.id) return null;
  const tracking = app.trackingId || app.id;
  const phone = app.phone || "";
  return `${canonicalBaseUrl()}/receipt?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

function turnNeeds(topic: TopicKey, topics: TopicKey[]) {
  return topics.includes(topic);
}

export function buildOfficialLinkContext(turn: InterpretedTurn, truth: TruthBundle): OfficialLinkContext {
  const baseUrl = canonicalBaseUrl();
  const relevant: Partial<Record<OfficialLinkKind, string>> = {};

  if (turnNeeds("website", turn.topics) || turnNeeds("trust", turn.topics)) relevant.website = baseUrl;
  if (turnNeeds("products", turn.topics)) relevant.products = `${baseUrl}/products`;
  if (turnNeeds("tracking", turn.topics)) relevant.tracking = `${baseUrl}/track`;

  const receiptRequested = turnNeeds("receipt_upload", turn.topics) || turnNeeds("payment_confirmation", turn.topics);
  const receipt = receiptRequested ? applicationReceiptUrl(truth) : null;
  if (receipt) relevant.receipt = receipt;

  const currentCustomerUrls = extractHttpUrls(turn.rawText).map((value) => {
    const parsed = safeUrl(value);
    return { officialHost: isOfficialAmeenHost(parsed?.hostname) };
  });

  // Current customer-supplied URLs are evidence, never an operational link source.
  // Even an Ameen-looking URL must be regenerated deterministically before we send it.
  const allowedUrls = Object.values(relevant).filter(Boolean) as string[];

  return {
    baseUrl,
    relevant,
    allowedUrls,
    currentCustomerUrls,
    receiptLinkUnavailableReason: receiptRequested && !receipt ? "application_not_resolved" : null,
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
    if (!parsed || !normalized) {
      violations.push("malformed_url_in_reply");
      continue;
    }
    if (!isOfficialAmeenHost(parsed.hostname)) violations.push(`foreign_domain_url:${parsed.hostname.toLowerCase()}`);
    if (!allowed.has(normalized)) violations.push(`url_not_issued_by_v3_truth:${parsed.hostname.toLowerCase()}${parsed.pathname}`);
  }

  // Also catch domain/path text without an http(s) scheme.
  const domainTokens = String(input.reply || "").match(DOMAIN_TOKEN_RE) || [];
  for (const token of domainTokens) {
    const host = token.split("/")[0].toLowerCase();
    if (!isOfficialAmeenHost(host)) violations.push(`foreign_domain_reference:${host}`);
  }

  if (input.turn.topics.includes("receipt_upload")) {
    if (context.relevant.receipt) {
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

  if (input.turn.topics.includes("tracking") && context.relevant.tracking) {
    const expected = normalizedHttpUrl(context.relevant.tracking);
    if (!replyUrls.some((url) => normalizedHttpUrl(url) === expected)) violations.push("required_tracking_url_missing");
  }

  return Array.from(new Set(violations));
}
