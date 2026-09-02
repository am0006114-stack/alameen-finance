import { sendDiscordNotification } from "@/lib/discord";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decideV3DiscordNotification, type V3NotificationEvent } from "./notificationPolicy";

function readableValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => readableValue(item)).filter(Boolean).join("، ");
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return "تفاصيل داخلية غير قابلة للعرض"; }
  }
  return String(value);
}

function clipped(value: unknown, max = 900) {
  const text = readableValue(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function arabicDetailLabel(name: string) {
  const labels: Record<string,string> = {
    action: "الإجراء",
    blocker: "سبب التعطيل",
    mutationId: "معرّف العملية",
    verification: "نتيجة التحقق",
    turnId: "معرّف الرسالة",
    name: "الاسم",
    device: "الجهاز",
    status: "الحالة",
    paymentStatus: "حالة الدفع",
  };
  return labels[name] || name;
}


function arabicDetailValue(name: string, value: unknown) {
  if (name === "action") {
    const actions: Record<string,string> = {
      cancel_application: "إلغاء الطلب",
      continue_application: "استمرار الطلب",
      request_refund: "طلب الاسترداد",
      stop_refund: "إيقاف الاسترداد",
      reopen_application: "إعادة فتح الطلب",
      change_device: "تغيير الجهاز وإعادة الحسبة",
      change_application_data: "تعديل بيانات الطلب",
    };
    return actions[String(value || "")] || "إجراء على الطلب";
  }
  if (name === "blocker") {
    const blockers: Record<string,string> = {
      payment_refund_integrity_conflict_requires_admin: "يوجد تعارض بين حالة الدفع والاسترداد ويحتاج مراجعة الإدارة",
      payment_confirmation_is_admin_only: "تأكيد الدفع من صلاحية الإدارة فقط",
      stale_truth: "تغيرت بيانات الطلب منذ اتخاذ القرار ويجب إعادة القراءة قبل التنفيذ",
      stale_truth_detected: "تغيرت بيانات الطلب منذ اتخاذ القرار ويجب إعادة القراءة قبل التنفيذ",
      real_actions_disabled: "التغييرات الحقيقية غير مفعلة حاليًا",
    };
    return blockers[String(value || "")] || "تعذر تنفيذ الإجراء بأمان ويحتاج مراجعة";
  }
  return value;
}
function arabicReason(reason: string) {
  const reasons: Record<string,string> = {
    routine_or_self_recovered_event_is_telemetry_only: "حدث روتيني أو تم إصلاحه تلقائيًا؛ لا يحتاج تدخلًا",
    customer_explicitly_chose_to_continue_and_payment_step_is_ready: "العميل اختار الاستمرار والطلب جاهز لخطوة رسوم فتح الملف",
    official_salary_slip_uploaded: "تم رفع مستند راتب رسمي",
    payment_already_confirmed: "الدفع مؤكد مسبقًا؛ لا حاجة لتنبيه جديد",
    manual_admin_payment_confirmation_is_required: "تأكيد الدفع يحتاج مراجعة الإدارة يدويًا",
    customer_requested_real_change_but_database_mutation_failed: "العميل طلب تغييرًا فعليًا لكن تنفيذ التغيير في قاعدة البيانات فشل",
    truth_or_send_safety_could_not_self_recover: "تعذر إصلاح تعارض الحقيقة أو سلامة الرد تلقائيًا",
    archive_lab_errors_stay_in_lab_telemetry_not_customer_discord: "خطأ داخل مختبر الأرشيف ولا يحتاج تنبيه تشغيل",
    no_notification_needed: "لا يوجد تدخل إداري مطلوب",
  };
  return reasons[reason] || "حدث تشغيلي يحتاج مراجعة الإدارة";
}

function timeBucket(minutes: number) {
  return Math.floor(Date.now() / (minutes * 60 * 1000));
}

function persistedDedupeKey(event: V3NotificationEvent, key: string) {
  if (["official_receipt_uploaded","official_salary_slip_uploaded","payment_confirmation_required"].includes(event)) return key;
  return `${key}:bucket-${timeBucket(30)}`;
}

function defaultTitle(event: V3NotificationEvent) {
  if (event === "customer_continue_payment_ready") return "✅ العميل وافق على الاستمرار — خطوة 5 دنانير";
  if (event === "official_receipt_uploaded") return "💳 تم رفع وصل الدفع — بانتظار تأكيد الإدارة";
  if (event === "official_salary_slip_uploaded") return "📄 تم رفع كشف/شهادة راتب";
  if (event === "payment_confirmation_required") return "💳 يتطلب تأكيد دفع يدوي";
  if (event === "business_mutation_failed") return "⛔ تعذر تنفيذ تغيير على الطلب";
  if (event === "truth_integrity_failure") return "⛔ تعارض في حقيقة الطلب";
  if (event === "final_safety_fail_closed") return "⛔ توقف الرد بأمان — يحتاج مراجعة";
  return "⚠️ حدث تشغيلي يحتاج تدخل الإدارة";
}

export async function notifyV3Discord(input: {
  event: V3NotificationEvent;
  applicationId?: string | null;
  trackingId?: string | null;
  waId?: string | null;
  paymentConfirmed?: boolean;
  title?: string;
  description?: string;
  details?: Record<string, unknown> | null;
}) {
  const decision = decideV3DiscordNotification({
    event: input.event,
    applicationId: input.applicationId,
    paymentConfirmed: input.paymentConfirmed,
  });

  if (!decision.notify || !decision.dedupeKey) {
    return { sent: false, suppressed: true, reason: decision.reason };
  }

  const dedupeKey = persistedDedupeKey(input.event, decision.dedupeKey);
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("whatsapp_v3_notification_ledger")
    .insert({
      dedupe_key: dedupeKey,
      event_type: input.event,
      application_id: input.applicationId || null,
      wa_id: input.waId || null,
      severity: decision.severity,
      payload: input.details || {},
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (claimError) {
    // Unique violation means an equivalent actionable notification was already sent/claimed.
    if (String((claimError as { code?: string }).code || "") === "23505") {
      return { sent: false, suppressed: true, reason: "duplicate_actionable_notification" };
    }
    return { sent: false, suppressed: true, reason: `notification_ledger_error:${claimError.message}` };
  }
  if (!claimed?.id) return { sent: false, suppressed: true, reason: "notification_claim_not_created" };

  const mention = decision.mentionAdmin ? String(process.env.DISCORD_ADMIN_MENTION || "").trim() : "";
  const detailFields = Object.entries(input.details || {}).slice(0, 8).map(([name, value]) => ({
    name: clipped(arabicDetailLabel(name), 90),
    value: clipped(arabicDetailValue(name, value), 700) || "—",
    inline: false,
  }));
  const fields = [
    input.trackingId ? { name: "رقم الطلب", value: clipped(input.trackingId), inline: true } : null,
    input.applicationId ? { name: "معرّف الطلب الداخلي", value: clipped(input.applicationId), inline: true } : null,
    input.waId ? { name: "رقم واتساب", value: clipped(input.waId), inline: true } : null,
    ...detailFields,
    { name: "سبب التنبيه", value: clipped(arabicReason(decision.reason)), inline: false },
  ].filter(Boolean) as Array<{ name: string; value: string; inline?: boolean }>;

  const result = await sendDiscordNotification({
    title: input.title || defaultTitle(input.event),
    description: clipped(`${mention ? `${mention} ` : ""}${input.description || "يوجد حدث تشغيلي يحتاج تدخلًا فعليًا."}`, 1800),
    fields,
    footer: { text: "نظام الأمين للأقساط" },
  });

  await supabaseAdmin
    .from("whatsapp_v3_notification_ledger")
    .update({
      status: result.success ? "sent" : "failed",
      error_message: result.error || null,
      sent_at: result.success ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimed.id);

  return { sent: result.success, suppressed: false, reason: result.error || decision.reason };
}
