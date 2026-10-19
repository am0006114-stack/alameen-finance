import { NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildSecureDeviceChangeUrl,
  deviceChangeRowHasAuthoritativePaymentConfirmation,
  deviceChangeTruthFromRow,
} from "@/app/api/whatsapp/webhook/_lib/v3-os/deviceChangeAuthority";

export const dynamic = "force-dynamic";

function normalizeJordanPhoneForWhatsApp(phone: string | null | undefined) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("962")) return digits;
  if (digits.startsWith("07") && digits.length === 10) return `962${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `962${digits}`;
  return "";
}

function firstTwoNames(fullName: string | null | undefined) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "عميلنا الكريم";
}

function ineligibleState(row: Record<string, unknown>) {
  const status = String(row.status || "").toLowerCase();
  const paymentStatus = String(row.payment_status || "").toLowerCase();
  return ["cancelled", "refund_requested", "refund_completed"].includes(status)
    || ["refund_requested", "refund_completed"].includes(paymentStatus);
}

function adminApplicationUrl(request: Request, applicationId: string, result: string) {
  const url = new URL(`/admin/applications/${applicationId}`, request.url);
  url.searchParams.set("deviceChange", result);
  return url;
}

export async function POST(request: Request) {
  if (!(await isAdminLoggedIn())) {
    return NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 });
  }

  const form = await request.formData();
  const applicationId = String(form.get("applicationId") || "").trim();
  if (!applicationId) {
    return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  }

  const { data: application, error } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,full_name,phone,email,status,payment_status,payment_confirmed_at,payment_reference,device_id,device_name,device_price,installment_months,down_payment,interest_rate,monthly_payment,total_with_interest,salary,delivery_delay_until")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !application) {
    return NextResponse.redirect(adminApplicationUrl(request, applicationId, "not-found"), { status: 303 });
  }

  const row = application as Record<string, unknown>;
  if (ineligibleState(row)) {
    return NextResponse.redirect(adminApplicationUrl(request, applicationId, "not-eligible"), { status: 303 });
  }
  if (!deviceChangeRowHasAuthoritativePaymentConfirmation(row)) {
    return NextResponse.redirect(adminApplicationUrl(request, applicationId, "requires-payment-confirmation"), { status: 303 });
  }

  const { data: approvedContact } = await supabaseAdmin
    .from("whatsapp_application_contacts")
    .select("wa_id")
    .eq("application_id", applicationId)
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const waId = normalizeJordanPhoneForWhatsApp(String(approvedContact?.wa_id || application.phone || ""));
  if (!waId) {
    return NextResponse.redirect(adminApplicationUrl(request, applicationId, "no-whatsapp"), { status: 303 });
  }

  const baseUrl = String(process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const deviceChangeUrl = buildSecureDeviceChangeUrl({
    baseUrl,
    application: deviceChangeTruthFromRow(row),
    waId,
  });

  const customerName = firstTwoNames(application.full_name);
  const tracking = application.tracking_id || application.id;
  const message = `أهلًا ${customerName} 🌿

هذا رابط تغيير الجهاز على نفس طلبك ${tracking}:
${deviceChangeUrl}

الرابط صالح لمدة 24 ساعة، ويعمل فقط على نفس الطلب بعد تأكيد الدفع إداريًا. إذا تغيّر الجهاز أو السعر أو الحسبة قبل استخدام الرابط، يتوقف الرابط تلقائيًا للحماية.

الأمين للأقساط`;

  return NextResponse.redirect(
    `https://wa.me/${waId}?text=${encodeURIComponent(message)}`,
    { status: 303 }
  );
}
