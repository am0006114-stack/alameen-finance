import type { ApplicationRecord } from "./types";

export function trackUrl(baseUrl: string, app: ApplicationRecord) {
  // Keep the public tracking link short in WhatsApp. The bot sends the tracking ID and phone as plain text.
  return `${baseUrl}/track`;
}

export function receiptUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/receipt?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

export function delayUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/delay-decision?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

export function guarantorUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/guarantor?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

export function salarySlipUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/salary-slip?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}

export function identityUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/identity?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}`;
}


export function refundUrl(baseUrl: string, app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  return `${baseUrl}/delay-decision?tracking=${encodeURIComponent(tracking)}&phone=${encodeURIComponent(phone)}&mode=refund`;
}
