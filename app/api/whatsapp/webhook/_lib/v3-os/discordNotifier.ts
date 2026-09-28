import { sendDiscordNotification } from "@/lib/discord";
import { BUSINESS_WEBSITE } from "../constants";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decideV3DiscordNotification, type V3NotificationEvent } from "./notificationPolicy";
import { arabicOperationalActionName, formatWaitingAge } from "./operationsAutopilot";

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
  if (name === "action") return arabicOperationalActionName(String(value || ""));
  if (name === "blocker") {
    const blockers: Record<string,string> = {
      payment_refund_integrity_conflict_requires_admin: "يوجد تعارض بين حالة الدفع والاسترداد ويحتاج مراجعة الإدارة",
      payment_confirmation_is_admin_only: "تأكيد الدفع من صلاحية الإدارة فقط",
      stale_truth: "تغيرت بيانات الطلب منذ اتخاذ القرار ويجب إعادة القراءة قبل التنفيذ",
      stale_truth_detected: "تغيرت بيانات الطلب منذ اتخاذ القرار ويجب إعادة القراءة قبل التنفيذ",
      real_actions_disabled: "التغييرات الحقيقية غير مفعلة حاليًا",
      v3_real_actions_production_gate_disabled: "بوابة الإجراءات الحقيقية غير مفعلة حاليًا؛ يحتاج تنفيذ الإدارة",
    };
    const raw = String(value || "");
    if (raw.startsWith("scoped_real_actions_disallowed:")) return `الإجراء ${arabicOperationalActionName(raw.split(":")[1])} غير مفعّل تلقائيًا ويحتاج تنفيذ الإدارة.`;
    if (raw.startsWith("unsupported_transactional_action:")) return `الإجراء ${arabicOperationalActionName(raw.split(":")[1])} ليس تغيير قاعدة بيانات مدعومًا في Action Plane.`;
    return blockers[raw] || "تعذر تنفيذ الإجراء بأمان ويحتاج مراجعة";
  }
  return value;
}
function arabicReason(reason: string) {
  const reasons: Record<string,string> = {
    routine_or_self_recovered_event_is_telemetry_only: "حدث روتيني أو تم إصلاحه تلقائيًا؛ لا يحتاج تدخلًا",
    customer_explicitly_chose_to_continue_and_payment_step_is_ready: "العميل اختار الاستمرار والطلب جاهز لخطوة رسوم فتح الملف",
    official_salary_slip_uploaded: "تم رفع مستند راتب رسمي",
    official_receipt_uploaded: "تم رفع وصل دفع رسمي وبانتظار مراجعة الإدارة",
    payment_already_confirmed: "الدفع مؤكد مسبقًا؛ لا حاجة لتنبيه جديد",
    manual_admin_payment_confirmation_is_required: "تأكيد الدفع يحتاج مراجعة الإدارة يدويًا",
    real_action_requires_manual_admin_execution: "العميل طلب تغييرًا فعليًا على الطلب ويحتاج تنفيذ الإدارة يدويًا",
    scoped_real_action_executed_successfully: "تم تنفيذ إجراء الإلغاء/الاسترداد المسموح به تلقائيًا وتثبيت النتيجة في قاعدة البيانات",
    customer_requested_real_change_but_database_mutation_failed: "العميل طلب تغييرًا فعليًا لكن تنفيذ التغيير في قاعدة البيانات فشل",
    truth_or_send_safety_could_not_self_recover: "تعذر إصلاح تعارض الحقيقة أو سلامة الرد تلقائيًا",
    whatsapp_delivery_failed_after_safe_retry: "تعذر إرسال الرد عبر واتساب حتى بعد محاولة رد قصير وآمن",
    v3_was_automatically_stopped_to_protect_customers: "تم إيقاف V3 تلقائيًا وإرجاع الرسائل الجديدة للمسار الآمن لحماية العملاء",
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
  if (event === "manual_action_required") return "🛠️ إجراء مطلوب — بانتظار تنفيذ الإدارة";
  if (event === "business_mutation_succeeded") return "✅ تم تنفيذ إجراء حقيقي تلقائيًا";
  if (event === "business_mutation_failed") return "⛔ تعذر تنفيذ تغيير على الطلب";
  if (event === "truth_integrity_failure") return "⛔ تعارض في حقيقة الطلب";
  if (event === "whatsapp_delivery_failure") return "⛔ تعذر إرسال رد واتساب";
  if (event === "v3_circuit_breaker_tripped") return "🛡️ تم إيقاف V3 تلقائيًا";
  if (event === "final_safety_fail_closed") return "⚠️ تم استخدام رد آمن بديل";
  return "⚠️ حدث تشغيلي يحتاج تدخل الإدارة";
}

async function loadApplicationSummary(applicationId?: string | null) {
  if (!applicationId) return null;
  try {
    const { data } = await supabaseAdmin
      .from("applications")
      .select("full_name,device_name,status,tracking_id,phone")
      .eq("id", applicationId)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

async function loadConversationSummary(waId?: string | null) {
  const cleanWaId = String(waId || "").trim();
  if (!cleanWaId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("direction,body,created_at,intent,message_type")
      .eq("wa_id", cleanWaId)
      .order("created_at", { ascending: false })
      .limit(14);
    if (error) return null;
    const rows = (data || []) as Array<{ direction?: string | null; body?: string | null; created_at?: string | null; intent?: string | null; message_type?: string | null }>;
    const incoming = rows.filter((row) => row.direction === "incoming" && String(row.body || "").trim() && row.message_type !== "reaction");
    const latest = incoming[0] || null;
    const context = incoming.slice(0, 3).reverse().map((row) => String(row.body || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const latestMs = latest?.created_at ? new Date(latest.created_at).getTime() : NaN;
    return {
      latestCustomerMessage: latest ? String(latest.body || "").trim() : null,
      latestIntent: latest?.intent || null,
      context,
      waitingAge: Number.isFinite(latestMs) ? formatWaitingAge(Date.now() - latestMs) : null,
    };
  } catch {
    return null;
  }
}

function operatorInstruction(input: { event: V3NotificationEvent; action?: string | null; blocker?: string | null }) {
  const actionName = arabicOperationalActionName(input.action || "");
  if (input.event === "manual_action_required") return `نفّذ ${actionName} على الطلب من زر "فتح الطلب مباشرة" ثم حدّث الحالة الفعلية. لا تحتاج للبحث عن المحادثة يدويًا.`;
  if (input.event === "business_mutation_failed") return `راجع الطلب ونفّذ/صحح ${actionName} يدويًا. سبب الفشل ظاهر أدناه، وبعد التنفيذ حدّث الحقيقة على الطلب.`;
  if (input.event === "whatsapp_delivery_failure") return "تحقق من حالة WhatsApp/Meta والاعتماديات فورًا. المحادثة بقيت غير مكتملة ولن تُعتبر منتهية بدون دليل إرسال.";
  if (input.event === "truth_integrity_failure") return "راجع حقيقة الطلب أولًا ثم صحح الحالة من المصدر الموثق. لا تعتمد على نص المحادثة وحده.";
  if (input.event === "payment_confirmation_required" || input.event === "official_receipt_uploaded") return "راجع الوصل من الطلب وثبّت الدفع إداريًا فقط إذا كانت البيانات صحيحة.";
  return input.blocker ? "راجع الطلب والسبب أدناه ونفّذ الإجراء المطلوب من المصدر الموثق." : "راجع الطلب من الرابط المباشر ونفّذ المطلوب إذا كان يحتاج تدخلًا إداريًا.";
}

export async function notifyV3Discord(input: {
  event: V3NotificationEvent;
  applicationId?: string | null;
  trackingId?: string | null;
  waId?: string | null;
  paymentConfirmed?: boolean;
  actionKey?: string | null;
  title?: string;
  description?: string;
  details?: Record<string, unknown> | null;
}) {
  const decision = decideV3DiscordNotification({
    event: input.event,
    applicationId: input.applicationId,
    paymentConfirmed: input.paymentConfirmed,
    actionKey: input.actionKey || null,
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
  const [appSummary, conversationSummary] = await Promise.all([
    loadApplicationSummary(input.applicationId),
    loadConversationSummary(input.waId),
  ]);
  const actionValue = String(input.actionKey || input.details?.action || "").split(":")[0] || null;
  const blockerValue = input.details?.blocker ? String(input.details.blocker) : null;
  const hiddenDetailKeys = new Set(["messageId", "turnId", "verification", "mutationId"]);
  const detailFields = Object.entries(input.details || {})
    .filter(([name]) => !hiddenDetailKeys.has(name))
    .slice(0, 6)
    .map(([name, value]) => ({
      name: clipped(arabicDetailLabel(name), 90),
      value: clipped(arabicDetailValue(name, value), 700) || "—",
      inline: false,
    }));
  const baseUrl = String(BUSINESS_WEBSITE || "https://www.ameenfinance.co").replace(/\/+$/, "");
  const adminApplicationUrl = input.applicationId ? `${baseUrl}/admin/applications/${encodeURIComponent(input.applicationId)}` : null;
  const fields = [
    (input.trackingId || appSummary?.tracking_id) ? { name: "رقم الطلب", value: clipped(input.trackingId || appSummary?.tracking_id), inline: true } : null,
    appSummary?.full_name ? { name: "العميل", value: clipped(appSummary.full_name), inline: true } : null,
    input.waId ? { name: "رقم واتساب", value: clipped(input.waId), inline: true } : null,
    conversationSummary?.waitingAge ? { name: "مدة انتظار العميل", value: clipped(conversationSummary.waitingAge), inline: true } : null,
    conversationSummary?.latestCustomerMessage ? { name: "آخر رسالة من العميل", value: clipped(`«${conversationSummary.latestCustomerMessage}»`, 700), inline: false } : null,
    conversationSummary?.context?.length ? { name: "آخر رسائل العميل", value: clipped(conversationSummary.context.map((line, index) => `${index + 1}) ${line}`).join("\n"), 900), inline: false } : null,
    appSummary?.phone ? { name: "رقم الهاتف الأساسي", value: clipped(appSummary.phone), inline: true } : null,
    appSummary?.device_name ? { name: "الجهاز", value: clipped(appSummary.device_name), inline: true } : null,
    adminApplicationUrl ? { name: "فتح الطلب مباشرة", value: adminApplicationUrl, inline: false } : null,
    { name: "المطلوب منك الآن", value: clipped(operatorInstruction({ event: input.event, action: actionValue, blocker: blockerValue }), 900), inline: false },
    ...detailFields,
    { name: "سبب التنبيه", value: clipped(arabicReason(decision.reason)), inline: false },
  ].filter(Boolean) as Array<{ name: string; value: string; inline?: boolean }>;

  const actionName = actionValue ? arabicOperationalActionName(actionValue) : null;
  const resolvedTitle = input.event === "manual_action_required" && actionName
    ? `🛠️ ${actionName} — يحتاج تنفيذ الإدارة`
    : input.event === "business_mutation_failed" && actionName
      ? `⛔ ${actionName} — تعذر التنفيذ ويحتاج مراجعة`
      : input.event === "whatsapp_delivery_failure"
        ? "⛔ واتساب لم يرسل الرد — العميل ينتظر"
        : input.title || defaultTitle(input.event);

  const result = await sendDiscordNotification({
    title: resolvedTitle,
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
