import crypto from "node:crypto";
import type { ApplicationTruth } from "./types";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";

const TOKEN_VERSION = 1 as const;
const TOKEN_PURPOSE = "change_device" as const;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_MAX_TTL_MS = 48 * 60 * 60 * 1000;
const TOKEN_KEY_DOMAIN = "alameen:v3:phase11.2:device-change:v1";

export type DeviceChangeBeforeSnapshot = {
  status: string | null;
  payment_status: string | null;
  payment_confirmed_at: string | null;
  device_id: string | null;
  device_name: string | null;
  device_price: number | null;
  installment_months: number | null;
  down_payment: number | null;
  interest_rate: number | null;
  monthly_payment: number | null;
  total_with_interest: number | null;
};

export type DeviceChangeTokenClaims = {
  v: typeof TOKEN_VERSION;
  purpose: typeof TOKEN_PURPOSE;
  applicationId: string;
  trackingId: string;
  waId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  // New links use beforeHash to stay compact. before remains for legacy links.
  before: DeviceChangeBeforeSnapshot | null;
  beforeHash?: string;
};

function compactNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}


export function deviceChangeTruthFromRow(row: Record<string, unknown>): ApplicationTruth {
  return {
    id: String(row.id || ""),
    trackingId: cleanText(row.tracking_id),
    fullName: cleanText(row.full_name),
    phone: cleanText(row.phone),
    email: cleanText(row.email),
    status: cleanText(row.status),
    paymentStatus: cleanText(row.payment_status),
    paymentConfirmedAt: cleanText(row.payment_confirmed_at),
    paymentReference: cleanText(row.payment_reference),
    deviceId: cleanText(row.device_id),
    deviceName: cleanText(row.device_name),
    devicePrice: compactNumber(row.device_price),
    installmentMonths: compactNumber(row.installment_months),
    downPayment: compactNumber(row.down_payment),
    interestRate: compactNumber(row.interest_rate),
    monthlyPayment: compactNumber(row.monthly_payment),
    totalWithInterest: compactNumber(row.total_with_interest),
    salary: compactNumber(row.salary),
    deliveryDelayUntil: cleanText(row.delivery_delay_until),
  };
}

export function deviceChangeRowHasAuthoritativePaymentConfirmation(row: Record<string, unknown>) {
  const app = deviceChangeTruthFromRow(row);
  return hasAuthoritativePaymentConfirmation(app);
}

export function deviceChangeSnapshotFromTruth(app: ApplicationTruth): DeviceChangeBeforeSnapshot {
  return {
    status: cleanText(app.status),
    payment_status: cleanText(app.paymentStatus),
    payment_confirmed_at: cleanText(app.paymentConfirmedAt),
    device_id: cleanText(app.deviceId),
    device_name: cleanText(app.deviceName),
    device_price: compactNumber(app.devicePrice),
    installment_months: compactNumber(app.installmentMonths),
    down_payment: compactNumber(app.downPayment),
    interest_rate: compactNumber(app.interestRate),
    monthly_payment: compactNumber(app.monthlyPayment),
    total_with_interest: compactNumber(app.totalWithInterest),
  };
}

export function deviceChangeSnapshotFromRow(row: Record<string, unknown>): DeviceChangeBeforeSnapshot {
  return {
    status: cleanText(row.status),
    payment_status: cleanText(row.payment_status),
    payment_confirmed_at: cleanText(row.payment_confirmed_at),
    device_id: cleanText(row.device_id),
    device_name: cleanText(row.device_name),
    device_price: compactNumber(row.device_price),
    installment_months: compactNumber(row.installment_months),
    down_payment: compactNumber(row.down_payment),
    interest_rate: compactNumber(row.interest_rate),
    monthly_payment: compactNumber(row.monthly_payment),
    total_with_interest: compactNumber(row.total_with_interest),
  };
}

function stableDeviceChangeLinkSnapshot(value: DeviceChangeBeforeSnapshot) {
  return {
    payment_confirmed_at: cleanText(value.payment_confirmed_at),
    device_id: cleanText(value.device_id),
    device_name: cleanText(value.device_name),
    device_price: compactNumber(value.device_price),
    installment_months: compactNumber(value.installment_months),
    down_payment: compactNumber(value.down_payment),
    interest_rate: compactNumber(value.interest_rate),
    monthly_payment: compactNumber(value.monthly_payment),
    total_with_interest: compactNumber(value.total_with_interest),
  };
}

// Link validity ignores harmless workflow-stage movement, but still locks payment
// confirmation plus the device and every financing term.
export function sameDeviceChangeSnapshot(a: DeviceChangeBeforeSnapshot, b: DeviceChangeBeforeSnapshot) {
  return JSON.stringify(stableDeviceChangeLinkSnapshot(a)) === JSON.stringify(stableDeviceChangeLinkSnapshot(b));
}

export function deviceChangeSnapshotHash(snapshot: DeviceChangeBeforeSnapshot) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableDeviceChangeLinkSnapshot(snapshot)), "utf8")
    .digest("base64url");
}

export function deviceChangeClaimsMatchSnapshot(claims: DeviceChangeTokenClaims, current: DeviceChangeBeforeSnapshot) {
  if (claims.beforeHash) {
    const expected = Buffer.from(String(claims.beforeHash));
    const actual = Buffer.from(deviceChangeSnapshotHash(current));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  return Boolean(claims.before && sameDeviceChangeSnapshot(current, claims.before));
}

function tokenKey() {
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!serviceRole) throw new Error("device_change_token_secret_unavailable");
  return crypto.createHash("sha256").update(`${TOKEN_KEY_DOMAIN}:${serviceRole}`).digest();
}

export function issueDeviceChangeToken(input: {
  application: ApplicationTruth;
  waId: string;
  ttlMs?: number;
}): string {
  if (!hasAuthoritativePaymentConfirmation(input.application)) throw new Error("device_change_requires_authoritative_payment");
  const applicationId = String(input.application.id || "").trim();
  const trackingId = String(input.application.trackingId || "").trim().toUpperCase();
  const waId = String(input.waId || "").trim();
  if (!applicationId || !trackingId || !waId) throw new Error("device_change_token_identity_required");

  const now = Date.now();
  const claims: DeviceChangeTokenClaims = {
    v: TOKEN_VERSION,
    purpose: TOKEN_PURPOSE,
    applicationId,
    trackingId,
    waId,
    issuedAt: now,
    expiresAt: now + Math.max(5 * 60 * 1000, Math.min(input.ttlMs || TOKEN_TTL_MS, TOKEN_MAX_TTL_MS)),
    nonce: crypto.randomBytes(18).toString("base64url"),
    before: null,
    beforeHash: deviceChangeSnapshotHash(deviceChangeSnapshotFromTruth(input.application)),
  };

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from(TOKEN_KEY_DOMAIN, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function readDeviceChangeToken(token: string): DeviceChangeTokenClaims | null {
  try {
    const raw = Buffer.from(String(token || "").trim(), "base64url");
    if (raw.length < 12 + 16 + 16) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), iv);
    decipher.setAAD(Buffer.from(TOKEN_KEY_DOMAIN, "utf8"));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const claims = JSON.parse(plain) as DeviceChangeTokenClaims;
    if (claims?.v !== TOKEN_VERSION || claims?.purpose !== TOKEN_PURPOSE) return null;
    if (!claims.applicationId || !claims.trackingId || !claims.waId || !claims.nonce || (!claims.beforeHash && !claims.before)) return null;
    if (claims.beforeHash && !/^[A-Za-z0-9_-]{43}$/.test(String(claims.beforeHash))) return null;
    if (!Number.isFinite(claims.issuedAt) || !Number.isFinite(claims.expiresAt)) return null;
    if (claims.expiresAt <= Date.now()) return null;
    if (claims.issuedAt > Date.now() + 60_000) return null;
    return claims;
  } catch {
    return null;
  }
}

export function deviceChangeIdempotencyKey(claims: DeviceChangeTokenClaims) {
  return `device-change-link:${claims.applicationId}:${claims.nonce}`;
}

export function buildSecureDeviceChangeUrl(input: {
  baseUrl: string;
  application: ApplicationTruth;
  waId: string;
}) {
  const token = issueDeviceChangeToken({ application: input.application, waId: input.waId });
  return `${String(input.baseUrl || "https://www.ameenfinance.co").replace(/\/$/, "")}/change-device?t=${encodeURIComponent(token)}`;
}
