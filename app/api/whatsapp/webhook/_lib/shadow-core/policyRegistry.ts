import type { ApplicationRecord } from "../types";
import type { ShadowFacts } from "./types";

const PAYMENT_ALLOWED_STATUSES = new Set([
  "preliminary_qualified",
  "customer_confirmed_continue",
]);

const PAYMENT_ALLOWED_PAYMENT_STATUSES = new Set([
  "pending",
  "pending_payment",
  "payment_info_sent",
]);

const PAYMENT_CONFIRMED_STATUSES = new Set([
  "confirmed",
  "customer_claimed_paid",
]);

export function buildShadowFacts(
  app: ApplicationRecord | null | undefined,
  trackingId?: string | null,
  customerName?: string | null,
): ShadowFacts {
  const status = app?.status || null;
  const paymentStatus = app?.payment_status || null;
  const isApproved = status === "approved" || status === "customer_accepts_delivery_delay";
  const refundActive = status === "refund_requested" || paymentStatus === "refund_requested";
  const refundCompleted = status === "refund_completed";
  const paymentAlreadyConfirmed = Boolean(paymentStatus && PAYMENT_CONFIRMED_STATUSES.has(paymentStatus));
  const paymentCurrentlyAllowed = Boolean(
    app &&
      !paymentAlreadyConfirmed &&
      !refundActive &&
      !refundCompleted &&
      status !== "cancelled" &&
      ((status && PAYMENT_ALLOWED_STATUSES.has(status)) ||
        (paymentStatus && PAYMENT_ALLOWED_PAYMENT_STATUSES.has(paymentStatus))),
  );

  let requiredDocument: ShadowFacts["requiredDocument"] = null;
  if (status === "needs_guarantor") requiredDocument = "guarantor";
  if (status === "needs_salary_slip") requiredDocument = "salary_slip";
  if (status === "needs_identity" || status === "identity_requested") requiredDocument = "identity";

  return {
    hasApplication: Boolean(app),
    status,
    paymentStatus,
    trackingId: app?.tracking_id || app?.id || trackingId || null,
    customerName: app?.full_name || customerName || null,
    deviceName: app?.device_name || null,
    paymentCurrentlyAllowed,
    paymentAlreadyConfirmed,
    refundActive,
    refundCompleted,
    isApproved,
    requiredDocument,
    reviewDurationText: "من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات، والجمعة والسبت لا تُحسبان",
    officeAddressCanBeShared: isApproved,
  };
}
