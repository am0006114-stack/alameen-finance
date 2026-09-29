import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calculateInstallment } from "@/lib/installments";
import { IPHONE18_COLORS, IPHONE18_PRODUCTS } from "@/app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry";
import {
  deviceChangeIdempotencyKey,
  deviceChangeRowHasAuthoritativePaymentConfirmation,
  deviceChangeSnapshotFromRow,
  readDeviceChangeToken,
  sameDeviceChangeSnapshot,
} from "@/app/api/whatsapp/webhook/_lib/v3-os/deviceChangeAuthority";
import { V3_OS_VERSION } from "@/app/api/whatsapp/webhook/_lib/v3-os/types";
import { canV3ExecuteRealActions, getV3ProductionControl } from "@/app/api/whatsapp/webhook/_lib/v3-os/productionControl";

export const dynamic = "force-dynamic";

const ALLOWED_MONTHS = new Set([12, 24, 36]);

function clean(value: FormDataEntryValue | null, maxLength: number) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function redirectToPage(request: Request, token: string, error?: string) {
  const url = new URL("/change-device", request.url);
  if (token) url.searchParams.set("t", token);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

function firstRpcRow(data: unknown) {
  if (Array.isArray(data)) return (data[0] || null) as Record<string, unknown> | null;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

function ineligibleState(row: Record<string, unknown>) {
  const status = String(row.status || "").toLowerCase();
  const paymentStatus = String(row.payment_status || "").toLowerCase();
  return ["cancelled", "refund_requested", "refund_completed"].includes(status)
    || ["refund_requested", "refund_completed"].includes(paymentStatus);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const token = clean(form.get("token"), 2000);
  const productId = clean(form.get("productId"), 100);
  const color = clean(form.get("color"), 40);
  const acknowledged = clean(form.get("acknowledged"), 2) === "1";

  const claims = readDeviceChangeToken(token);
  if (!claims) return redirectToPage(request, token, "expired_or_invalid");

  const productionControl = await getV3ProductionControl();
  if (!canV3ExecuteRealActions(productionControl)) return redirectToPage(request, token, "actions_disabled");

  const product = IPHONE18_PRODUCTS.find((item) => item.id === productId) || null;
  const allowedColor = IPHONE18_COLORS.includes(color as (typeof IPHONE18_COLORS)[number]);
  if (!product || !allowedColor || !acknowledged) return redirectToPage(request, token, "missing_fields");

  const idempotencyKey = deviceChangeIdempotencyKey(claims);
  const { data: existingLedger } = await supabaseAdmin
    .from("whatsapp_v3_action_ledger")
    .select("status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (["executed", "already_done"].includes(String(existingLedger?.status || ""))) {
    return redirectToPage(request, token);
  }

  const { data: application, error: applicationError } = await supabaseAdmin
    .from("applications")
    .select("*")
    .eq("id", claims.applicationId)
    .maybeSingle();

  if (applicationError || !application) return redirectToPage(request, token, "expired_or_invalid");
  if (String(application.tracking_id || "").toUpperCase() !== claims.trackingId) return redirectToPage(request, token, "expired_or_invalid");
  if (ineligibleState(application as Record<string, unknown>)) return redirectToPage(request, token, "not_eligible");
  if (!deviceChangeRowHasAuthoritativePaymentConfirmation(application as Record<string, unknown>)) return redirectToPage(request, token, "payment_not_confirmed");

  const currentSnapshot = deviceChangeSnapshotFromRow(application as Record<string, unknown>);
  if (!sameDeviceChangeSnapshot(currentSnapshot, claims.before)) {
    return redirectToPage(request, token, "request_changed");
  }

  const months = Number(application.installment_months);
  const rawDownPayment = Number(application.down_payment || 0);
  if (!ALLOWED_MONTHS.has(months) || !Number.isFinite(rawDownPayment) || rawDownPayment < 0) {
    return redirectToPage(request, token, "terms_missing");
  }

  const calculation = calculateInstallment({
    price: product.priceJod,
    months,
    downPayment: Math.min(rawDownPayment, product.priceJod),
  });
  const deviceName = `${product.model} - ${product.capacity} - اللون المطلوب: ${color}`;
  const payload = {
    device_id: product.id,
    device_name: deviceName,
    device_price: product.priceJod,
    installment_months: months,
    down_payment: calculation.downPayment,
    interest_rate: calculation.interestRate,
    monthly_payment: calculation.monthly,
    total_with_interest: calculation.totalWithInterest,
  };

  const { data, error } = await supabaseAdmin.rpc("execute_whatsapp_v3_application_action", {
    p_idempotency_key: idempotencyKey,
    p_application_id: claims.applicationId,
    p_wa_id: claims.waId,
    p_source_turn_id: `device-change-link:${claims.nonce}`,
    p_action_type: "change_device",
    p_owner_role: "omran",
    p_expected_before: claims.before,
    p_payload: payload,
    p_runtime_version: `${V3_OS_VERSION}-phase11.2-device-link`,
  });

  if (error) {
    console.error("secure change-device RPC failed:", error);
    return redirectToPage(request, token, "save_failed");
  }

  const row = firstRpcRow(data);
  const outcome = String(row?.outcome || "failed");
  if (!["executed", "already_done"].includes(outcome)) {
    const blocker = String(row?.blocker || "");
    if (blocker.startsWith("stale_truth_")) return redirectToPage(request, token, "request_changed");
    return redirectToPage(request, token, "save_failed");
  }

  await supabaseAdmin.from("whatsapp_messages").insert({
    wa_id: claims.waId,
    direction: "incoming",
    customer_name: application.full_name || null,
    message_id: null,
    message_type: "form_submission",
    body: [
      "تم تنفيذ تغيير الجهاز من الرابط الرسمي الآمن:",
      `الجهاز السابق: ${application.device_name || "غير محدد"}`,
      `الجهاز الجديد: ${deviceName}`,
      `السعر الموثق: ${product.priceJod} د.أ`,
      `مدة التقسيط: ${months} شهر`,
      `الدفعة الأولى: ${calculation.downPayment.toFixed(2)} د.أ`,
      `القسط الشهري حسب الحسبة الرسمية: ${calculation.monthly.toFixed(2)} د.أ`,
    ].join("\n"),
    intent: "device_change",
    tracking_id: claims.trackingId,
    application_id: claims.applicationId,
    needs_human_review: false,
    handled_by_ai: true,
    raw_payload: {
      source: "secure_device_change_link",
      token_nonce: claims.nonce,
      action_ledger_id: row?.ledger_id || null,
      product_id: product.id,
      product_name: product.model,
      capacity: product.capacity,
      color,
      price: product.priceJod,
      months,
      down_payment: calculation.downPayment,
      monthly_payment: calculation.monthly,
    },
  });

  return redirectToPage(request, token);
}
