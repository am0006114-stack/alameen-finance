import { NextResponse } from "next/server";
import { authenticatedWebChatSession } from "../_http";
import { loadWebChatTimeline } from "../_runtime";
import { getPostPaymentChannelFlags, loadPostPaymentChannelState } from "@/app/api/postpayment/_lib/channelState";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function maskPhone(value: unknown) {
  const clean = String(value || "").replace(/\D/g, "");
  if (!clean) return null;
  if (clean.length <= 5) return clean;
  return `${clean.slice(0, 3)}•••••${clean.slice(-2)}`;
}

async function loadOrderSummary(applicationId: string) {
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("tracking_id,full_name,phone,employer,salary,status,payment_status,created_at,updated_at,governorate,city_area,device_name,device_price,installment_months,down_payment,monthly_payment,total_with_interest,eligibility_path")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    console.error("web_chat_order_summary_read_failed", error.message);
    return null;
  }
  if (!data) return null;

  return {
    trackingId: data.tracking_id || null,
    fullName: data.full_name || null,
    phoneMasked: maskPhone(data.phone),
    employer: data.employer || null,
    salary: data.salary ?? null,
    status: data.status || null,
    paymentStatus: data.payment_status || null,
    createdAt: data.created_at || null,
    updatedAt: data.updated_at || null,
    governorate: data.governorate || null,
    cityArea: data.city_area || null,
    deviceName: data.device_name || null,
    devicePrice: data.device_price ?? null,
    installmentMonths: data.installment_months ?? null,
    downPayment: data.down_payment ?? null,
    monthlyPayment: data.monthly_payment ?? null,
    totalWithInterest: data.total_with_interest ?? null,
    eligibilityPath: data.eligibility_path || null,
  };
}

export async function GET() {
  const session = await authenticatedWebChatSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [flags, channelState, timeline, order] = await Promise.all([
    getPostPaymentChannelFlags(),
    loadPostPaymentChannelState(session.application_id),
    loadWebChatTimeline(session),
    loadOrderSummary(session.application_id),
  ]);

  if (!flags.webChatEnabled) return NextResponse.json({ ok: false, error: "web_chat_disabled" }, { status: 503 });

  return NextResponse.json({
    ok: true,
    trackingId: session.tracking_id || null,
    primaryChannel: channelState?.primary_channel || null,
    channelActivated: Boolean(channelState?.activated_at),
    webAvailable: Boolean(channelState?.web_available),
    order,
    timeline,
  }, { headers: { "Cache-Control": "no-store" } });
}
