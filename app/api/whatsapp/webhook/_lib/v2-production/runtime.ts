import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ApplicationRecord, CustomerIntent } from "../types";
import {
  interpretConversationTurn,
  loadConversationState,
  reduceConversationState,
  saveConversationState,
  type V2InterpretedTurn,
} from "../v2-conversation";
import {
  archiveReplyPolicyViolations,
  archiveTruthPolicyViolations,
} from "../v2-archive/policyVerifier";

export type V2ProductionMode = "off" | "canary" | "broad" | "full";

type ProductionSettings = {
  mode: V2ProductionMode;
  killSwitch: boolean;
  canaryPercent: number;
  reserveUsdPerTurn: number;
};

type UsageReservation = { id: string } | null;

export type V2ProductionPreparation = {
  active: boolean;
  mode: V2ProductionMode;
  turn: V2InterpretedTurn | null;
  forcedIntent: CustomerIntent | null;
  reservationId: string | null;
  fallbackReason: string | null;
  state: Awaited<ReturnType<typeof loadConversationState>> | null;
};

export type V2ProductionWriteResult = {
  reply: string;
  usedV2Writer: boolean;
  selfRepairApplied: boolean;
  failClosedApplied: boolean;
  violations: string[];
  writerError: string | null;
};

function clampPercent(value: unknown, fallback = 5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function stableBucket(waId: string) {
  let hash = 2166136261;
  for (const ch of String(waId || "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

async function readSettings(): Promise<ProductionSettings | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_v2_production_settings")
      .select("mode,kill_switch,canary_percent,reserve_usd_per_turn")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("V2 production settings read failed", error.message);
      return null;
    }
    const modeRaw = String(data.mode || "off").toLowerCase();
    const mode: V2ProductionMode = ["off", "canary", "broad", "full"].includes(modeRaw)
      ? modeRaw as V2ProductionMode
      : "off";
    return {
      mode,
      killSwitch: Boolean(data.kill_switch),
      canaryPercent: clampPercent(data.canary_percent, mode === "broad" ? 50 : 5),
      reserveUsdPerTurn: Math.max(0.001, Math.min(0.25, Number(data.reserve_usd_per_turn || 0.03) || 0.03)),
    };
  } catch (error) {
    console.error("V2 production settings exception", error);
    return null;
  }
}

function modePercent(settings: ProductionSettings) {
  if (settings.mode === "full") return 100;
  if (settings.mode === "broad") return Math.max(25, settings.canaryPercent || 50);
  if (settings.mode === "canary") return Math.min(25, settings.canaryPercent || 5);
  return 0;
}

function messageTypeEligible(messageType?: string | null) {
  return ["text", "interactive", "button"].includes(String(messageType || "text").toLowerCase());
}

async function reserveBudget(input: {
  waId: string;
  incomingMessageId: string;
  reserveUsd: number;
}): Promise<UsageReservation> {
  const model = String(process.env.ALAMEEN_V2_PRODUCTION_MODEL || process.env.ALAMEEN_V2_INTERPRETER_MODEL || "deepseek-v4-pro").trim();
  const { data, error } = await supabaseAdmin.rpc("reserve_whatsapp_v2_production_budget", {
    p_model: model,
    p_purpose: "production_turn",
    p_wa_id: input.waId,
    p_incoming_message_id: input.incomingMessageId,
    p_reserve_usd: input.reserveUsd,
  });
  if (error) {
    console.error("V2 production budget RPC failed", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed || !row?.reservation_id) return null;
  return { id: String(row.reservation_id) };
}

async function finalizeBudget(reservationId: string | null, status: "completed" | "failed", errorMessage?: string | null) {
  if (!reservationId) return;
  const { error } = await supabaseAdmin
    .from("whatsapp_v2_production_ai_usage")
    .update({
      status,
      error_message: errorMessage ? String(errorMessage).slice(0, 1200) : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", reservationId);
  if (error) console.error("V2 production budget finalize failed", error.message);
}

function forcedIntentFromTurn(turn: V2InterpretedTurn): CustomerIntent | null {
  const actionActs = turn.acts
    .filter((act) => act.confidence >= 0.78 && act.action && act.action !== "none")
    .map((act) => String(act.action));
  const unique = Array.from(new Set(actionActs));
  if (unique.length !== 1) return null;
  const map: Record<string, string> = {
    cancel_application: "cancel_request",
    continue_application: "continue_decision",
    decline_application: "decline_decision",
    request_refund: "refund",
    stop_refund: "stop_refund",
    upload_receipt: "receipt_upload_needed",
    human_handoff: "human_agent",
    request_call: "call_request",
    change_application: "application_data_correction",
  };
  const action = unique[0];
  if (action === "cancel_application") {
    const confirm = turn.acts.some((act) => act.action === "cancel_application" && act.type === "confirm" && act.confidence >= 0.78);
    return (confirm ? "cancel_confirmed" : "cancel_request") as CustomerIntent;
  }
  const mapped = map[action];
  return mapped ? mapped as CustomerIntent : null;
}

export async function prepareV2ProductionTurn(input: {
  waId: string;
  incomingMessageId: string;
  customerText: string;
  messageType?: string | null;
  conversationContext?: string | null;
  lastCustomerMessages?: string[];
  lastAssistantReplies?: string[];
}): Promise<V2ProductionPreparation> {
  const settings = await readSettings();
  if (!settings) return { active: false, mode: "off", turn: null, forcedIntent: null, reservationId: null, fallbackReason: "settings_unavailable", state: null };
  if (settings.killSwitch || settings.mode === "off") return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: settings.killSwitch ? "kill_switch" : "mode_off", state: null };
  if (!messageTypeEligible(input.messageType)) return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: "message_type_not_enabled", state: null };
  if (stableBucket(input.waId) >= modePercent(settings)) return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: "outside_canary", state: null };

  const reservation = await reserveBudget({ waId: input.waId, incomingMessageId: input.incomingMessageId, reserveUsd: settings.reserveUsdPerTurn });
  if (!reservation) return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: "budget_blocked", state: null };

  try {
    const state = await loadConversationState(input.waId);
    const interpreted = await interpretConversationTurn({
      customerText: input.customerText,
      messageType: input.messageType,
      state,
      conversationContext: input.conversationContext,
      lastCustomerMessages: input.lastCustomerMessages,
      lastAssistantReplies: input.lastAssistantReplies,
      useProvider: true,
    });
    if (interpreted.providerError || !interpreted.turn) {
      await finalizeBudget(reservation.id, "failed", interpreted.providerError?.message || interpreted.providerError?.code || "interpreter_failed");
      return { active: false, mode: settings.mode, turn: interpreted.turn || null, forcedIntent: null, reservationId: null, fallbackReason: "interpreter_failed", state };
    }
    return {
      active: true,
      mode: settings.mode,
      turn: interpreted.turn,
      forcedIntent: forcedIntentFromTurn(interpreted.turn),
      reservationId: reservation.id,
      fallbackReason: null,
      state,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeBudget(reservation.id, "failed", message);
    return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: `prepare_failed:${message}`, state: null };
  }
}

function appTruth(application?: ApplicationRecord | null) {
  if (!application) return null;
  return {
    id: application.id,
    tracking_id: application.tracking_id || null,
    status: application.status || null,
    payment_status: application.payment_status || null,
    payment_confirmed_at: application.payment_confirmed_at || null,
    device_name: application.device_name || null,
    salary: application.salary ?? null,
    delivery_delay_until: application.delivery_delay_until || null,
  };
}

function extractText(payload: unknown) {
  const obj = payload as any;
  const content = obj?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((x) => typeof x?.text === "string" ? x.text : "").join("\n").trim();
  return "";
}

async function callWriter(input: {
  customerText: string;
  deterministicReply: string;
  turn: V2InterpretedTurn;
  application?: ApplicationRecord | null;
  conversationContext?: string | null;
  lastAssistantReplies?: string[];
  repairViolations?: string[];
  priorDraft?: string | null;
}) {
  const key = process.env.DEEPSEEK_V2_API_KEY;
  if (!key) throw new Error("DEEPSEEK_V2_API_KEY missing");
  const model = String(process.env.ALAMEEN_V2_PRODUCTION_MODEL || "deepseek-v4-pro").trim();
  const baseUrl = String(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const repair = Boolean(input.repairViolations?.length);
  const system = `أنت كاتب الرد النهائي لنظام محادثة الأمين للأقساط على واتساب.
اكتب ردًا بشريًا طبيعيًا ومختصرًا باللهجة الأردنية المناسبة، وغطِّ كل الأسئلة/الأفعال في الرسالة الحالية.

قواعد حقيقة إلزامية:
- الاسم التشغيلي: الأمين للأقساط فقط. لا تقل الأمين للأقساط والتمويل، ولا بنك، ولا شركة تمويل/إقراض، ولا تدّعِ ترخيص البنك المركزي.
- رسوم فتح الملف 5 دنانير، منفصلة عن ثمن الجهاز والقسط الأول، وتُطلب فقط بعد التأهيل المبدئي إذا اختار العميل الاستمرار.
- القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد، ما لم توجد حقيقة حالة موثقة تخالف ذلك.
- لا توصيل؛ الاستلام من المكتب بموعد. قبل الموافقة/الموعد استخدم فقط: عمّان – شارع المدينة المنورة.
- المستندات الحساسة وإثبات الدفع عبر الرابط الرسمي الآمن فقط، لا تطلب إرسالها على واتساب.
- لا تخترع حالة طلب/دفع/استرداد/موعد/إشعار مستقبلي. حقيقة التطبيق أدناه هي المصدر الوحيد لحالة العميل.
- طلب إجراء لا يعني أنه نُفذ. لا تقل تم الإلغاء/الاسترداد/التحويل لموظف إلا إذا الحقيقة/الرد الحتمي يثبت التنفيذ.
- إذا طلب موظفًا: أكد أنك فهمت الطلب، لكن لا تدّعِ التحويل أو أن موظفًا سيتواصل ما لم يكن ذلك منفذًا.
- لا تطلب رقم الهاتف لأن واتساب يعرفه، ولا تعيد طلب رقم التتبع إذا كان متوفرًا.
- لا تستخدم PAYAMEN أو PAYAMEEN أو AMEENPAY. الأسماء المعتمدة فقط AMEEENPAY و AMENPAY إذا كانت معلومات الدفع موجودة أصلًا في الرد الحتمي.
- لا تخترع رابطًا. استخدم فقط الروابط الموجودة حرفيًا في الرد الحتمي.
- لا تذكر AI أو DeepSeek أو الحراس أو النظام الداخلي.

الرد الحتمي ليس نصًا يجب نسخه؛ هو حدود الحقيقة والإجراء التي لا يجوز تجاوزها.${repair ? "\nهذه محاولة إصلاح. عالج المخالفات المذكورة حرفيًا ولا تعيدها." : ""}`;
  const user = `رسالة العميل:\n${input.customerText}\n\nتحليل الدور متعدد الأفعال:\n${JSON.stringify({ topics: input.turn.topics, acts: input.turn.acts, references: input.turn.references, corrections: input.turn.corrections, requestedActions: input.turn.requestedActions })}\n\nحقيقة التطبيق الحية:\n${JSON.stringify(appTruth(input.application))}\n\nالسياق القريب:\n${String(input.conversationContext || "لا يوجد").slice(-5000)}\n\nآخر ردود الأمين:\n${JSON.stringify((input.lastAssistantReplies || []).slice(0,4))}\n\nالحدود/النتيجة الحتمية من طبقة الإجراءات الحالية:\n${input.deterministicReply}${repair ? `\n\nالمسودة المرفوضة:\n${input.priorDraft || ""}\n\nالمخالفات:\n${JSON.stringify(input.repairViolations || [])}` : ""}\n\nاكتب الرد النهائي فقط.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), repair ? 18000 : 22000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: repair ? 0 : 0.25,
        max_tokens: 900,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`writer_http_${response.status}:${raw.slice(0,500)}`);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    const text = extractText(parsed);
    if (!text) throw new Error("empty_writer_reply");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function fakeArchiveCase(input: { waId: string; customerText: string; application?: ApplicationRecord | null }) {
  const app = input.application;
  return {
    customer_message: input.customerText,
    wa_id: input.waId,
    tracking_id: app?.tracking_id || null,
    historical_truth_confidence: app ? "high" : "none",
    historical_truth: appTruth(app) || {},
  } as any;
}

function productionViolations(input: {
  waId: string;
  customerText: string;
  reply: string;
  deterministicReply: string;
  turn: V2InterpretedTurn;
  application?: ApplicationRecord | null;
}) {
  const violations = new Set<string>([
    ...archiveReplyPolicyViolations(input.reply),
    ...archiveTruthPolicyViolations(fakeArchiveCase(input), input.reply),
  ]);

  const replyUrls = String(input.reply || "").match(/https?:\/\/[^\s)]+/gi) || [];
  const allowedUrls = new Set((String(input.deterministicReply || "").match(/https?:\/\/[^\s)]+/gi) || []).map((x) => x.replace(/[،,.]+$/g, "")));
  if (replyUrls.some((url) => !allowedUrls.has(url.replace(/[،,.]+$/g, "")))) violations.add("untrusted_or_invented_link");
  if (/\[(?:رابط|لينك)[^\]]*\]/i.test(input.reply)) violations.add("placeholder_link");

  const asksHuman = input.turn.acts.some((act) => act.type === "handoff_request" || act.action === "human_handoff");
  if (asksHuman && !/(موظف|موظف|الفريق|الاداره|الإدارة|زميل)/i.test(input.reply)) violations.add("explicit_human_handoff_missed");

  const executionClaims = /(تم\s+(?:الغاء|إلغاء|تسجيل|استرداد|تحويل)|تمت\s+(?:الموافقه|الموافقة)|حولت طلبك|حوّلت طلبك|تم تحويلك)/i.test(input.reply);
  if (executionClaims) {
    const normalizedCandidate = input.reply.replace(/\s+/g, " ").trim();
    const normalizedDet = input.deterministicReply.replace(/\s+/g, " ").trim();
    const appStatus = String(input.application?.status || "");
    const stateCanSupport = ["cancelled", "refund_requested", "refund_completed", "approved"].includes(appStatus);
    if (!stateCanSupport && !normalizedDet.includes(normalizedCandidate.slice(0, Math.min(50, normalizedCandidate.length)))) {
      violations.add("unverified_action_execution_claim");
    }
  }

  if (input.application?.tracking_id && /(ابعث|ارسل|أرسل|اعطيني|أعطيني|زودني).{0,35}(رقم\s+(?:الطلب|التتبع))/i.test(input.reply)) {
    violations.add("known_tracking_id_reasked");
  }
  if (/(ابعث|ارسل|أرسل|اعطيني|أعطيني|زودني).{0,35}(رقم\s+(?:الهاتف|التلفون|الموبايل))/i.test(input.reply)) {
    violations.add("known_whatsapp_number_reasked");
  }

  return Array.from(violations);
}

export async function writeV2ProductionReply(input: {
  preparation: V2ProductionPreparation;
  waId: string;
  customerText: string;
  deterministicReply: string;
  application?: ApplicationRecord | null;
  conversationContext?: string | null;
  lastAssistantReplies?: string[];
}): Promise<V2ProductionWriteResult> {
  if (!input.preparation.active || !input.preparation.turn) {
    return { reply: input.deterministicReply, usedV2Writer: false, selfRepairApplied: false, failClosedApplied: false, violations: [], writerError: input.preparation.fallbackReason };
  }

  try {
    const first = await callWriter({
      customerText: input.customerText,
      deterministicReply: input.deterministicReply,
      turn: input.preparation.turn,
      application: input.application,
      conversationContext: input.conversationContext,
      lastAssistantReplies: input.lastAssistantReplies,
    });
    let violations = productionViolations({ ...input, reply: first, turn: input.preparation.turn });
    if (!violations.length) {
      await finalizeBudget(input.preparation.reservationId, "completed");
      return { reply: first, usedV2Writer: true, selfRepairApplied: false, failClosedApplied: false, violations: [], writerError: null };
    }

    const repaired = await callWriter({
      customerText: input.customerText,
      deterministicReply: input.deterministicReply,
      turn: input.preparation.turn,
      application: input.application,
      conversationContext: input.conversationContext,
      lastAssistantReplies: input.lastAssistantReplies,
      repairViolations: violations,
      priorDraft: first,
    });
    violations = productionViolations({ ...input, reply: repaired, turn: input.preparation.turn });
    if (!violations.length) {
      await finalizeBudget(input.preparation.reservationId, "completed");
      return { reply: repaired, usedV2Writer: true, selfRepairApplied: true, failClosedApplied: false, violations: [], writerError: null };
    }

    await finalizeBudget(input.preparation.reservationId, "completed", `fail_closed:${violations.join(",")}`);
    return {
      reply: input.deterministicReply,
      usedV2Writer: true,
      selfRepairApplied: true,
      failClosedApplied: true,
      violations,
      writerError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeBudget(input.preparation.reservationId, "failed", message);
    return {
      reply: input.deterministicReply,
      usedV2Writer: false,
      selfRepairApplied: false,
      failClosedApplied: true,
      violations: ["writer_failure_fallback"],
      writerError: message,
    };
  }
}

export async function commitV2ProductionState(input: {
  preparation: V2ProductionPreparation;
  waId: string;
  incomingMessageId: string;
  customerText: string;
  finalReply: string;
  application?: ApplicationRecord | null;
  writerResult?: V2ProductionWriteResult | null;
}) {
  if (!input.preparation.turn || !input.preparation.state) return;
  try {
    const next = reduceConversationState({
      state: input.preparation.state,
      turn: input.preparation.turn,
      turnId: input.incomingMessageId,
      customerText: input.customerText,
      actualReply: input.finalReply,
      applicationId: input.application?.id || null,
      trackingId: input.application?.tracking_id || null,
    });
    await saveConversationState(next);

    const { error } = await supabaseAdmin.from("whatsapp_v2_production_runs").insert({
      incoming_message_id: input.incomingMessageId,
      wa_id: input.waId,
      mode: input.preparation.mode,
      customer_message: input.customerText,
      interpreted_turn: input.preparation.turn,
      forced_intent: input.preparation.forcedIntent || null,
      application_snapshot: appTruth(input.application),
      final_reply: input.finalReply,
      used_v2_writer: Boolean(input.writerResult?.usedV2Writer),
      self_repair_applied: Boolean(input.writerResult?.selfRepairApplied),
      fail_closed_applied: Boolean(input.writerResult?.failClosedApplied),
      violations: input.writerResult?.violations || [],
      writer_error: input.writerResult?.writerError || null,
      created_at: new Date().toISOString(),
    });
    if (error) console.error("V2 production run log failed", error.message);
  } catch (error) {
    console.error("V2 production state commit failed", error);
  }
}
