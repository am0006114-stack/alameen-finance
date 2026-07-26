import { NextResponse } from "next/server";
import { isAdminLoggedIn } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const AUTO_REPLY_IGNORED_MARKER = "AUTO_REPLY_IGNORED";
const AUTO_REPLY_ACTIVE_MARKER = "AUTO_REPLY_ACTIVE";

function normalizeWhatsAppId(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("962") && digits.length === 12) return digits;
  if (digits.startsWith("07") && digits.length === 10) return `962${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `962${digits}`;

  return digits;
}

export async function POST(request: Request) {
  const loggedIn = await isAdminLoggedIn();

  if (!loggedIn) {
    return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });
  }

  let payload: { phone?: unknown; ignored?: unknown };

  try {
    payload = (await request.json()) as { phone?: unknown; ignored?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "بيانات غير صالحة" }, { status: 400 });
  }

  const waId = normalizeWhatsAppId(payload.phone);
  const ignored = payload.ignored === true;

  if (!waId) {
    return NextResponse.json({ ok: false, error: "رقم واتساب غير صالح" }, { status: 400 });
  }

  const marker = ignored ? AUTO_REPLY_IGNORED_MARKER : AUTO_REPLY_ACTIVE_MARKER;
  const nowIso = new Date().toISOString();

  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    wa_id: waId,
    direction: "outgoing",
    customer_name: null,
    message_id: null,
    message_type: "admin_control",
    body: marker,
    intent: null,
    tracking_id: null,
    application_id: null,
    needs_human_review: ignored,
    handled_by_ai: false,
    raw_payload: {
      source: "admin_whatsapp_ignore_button",
      auto_reply_ignored: ignored,
      changed_at: nowIso,
    },
  });

  if (error) {
    console.error("Failed to save WhatsApp ignore state:", error);
    return NextResponse.json(
      { ok: false, error: "تعذر حفظ حالة التجاهل" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ignored });
}
