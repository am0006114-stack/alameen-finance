import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ApplicationRecord, CustomerIntent } from "../types";
import {
  interpretConversationTurn,
  loadConversationState,
  reduceConversationState,
  saveConversationState,
  type V2InterpretedTurn,
} from "../v2-conversation";
import { v2PolicyViolations, policyTruthForPrompt } from "./policyRegistry";
import { applicationTruthForPrompt, resolveV2ProductionTruth, type V2ResolvedTruth } from "./truthResolver";
import { composeV2TruthOnlyReply } from "./safeComposer";

export type V2ProductionMode = "off" | "canary" | "broad" | "full";

type ProductionSettings = {
  mode: V2ProductionMode;
  killSwitch: boolean;
  canaryPercent: number;
  reserveUsdPerTurn: number;
  openAiReserveUsdPerAudit: number;
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

export type V2ActionExecution = {
  usedLegacyExecutor: boolean;
  requested: boolean;
  executed: boolean;
  intent: CustomerIntent | null;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  beforePaymentStatus?: string | null;
  afterPaymentStatus?: string | null;
  summary?: string | null;
};

export type V2ProductionWriteResult = {
  reply: string;
  usedV2Writer: boolean;
  selfRepairApplied: boolean;
  failClosedApplied: boolean;
  safeComposerApplied: boolean;
  auditorUsed: boolean;
  auditorPassed: boolean | null;
  violations: string[];
  writerError: string | null;
  truthSource: string;
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
      .select("mode,kill_switch,canary_percent,reserve_usd_per_turn,openai_reserve_usd_per_audit")
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
      reserveUsdPerTurn: Math.max(0.001, Math.min(0.25, Number(data.reserve_usd_per_turn || 0.04) || 0.04)),
      openAiReserveUsdPerAudit: Math.max(0.001, Math.min(0.25, Number(data.openai_reserve_usd_per_audit || 0.02) || 0.02)),
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

async function reserveDeepSeek(input: { waId: string; incomingMessageId: string; reserveUsd: number }): Promise<UsageReservation> {
  const model = String(process.env.ALAMEEN_V2_PRODUCTION_MODEL || process.env.ALAMEEN_V2_INTERPRETER_MODEL || "deepseek-v4-pro").trim();
  const { data, error } = await supabaseAdmin.rpc("reserve_whatsapp_v2_production_budget", {
    p_model: model,
    p_purpose: "production_turn",
    p_wa_id: input.waId,
    p_incoming_message_id: input.incomingMessageId,
    p_reserve_usd: input.reserveUsd,
  });
  if (error) {
    console.error("V2 production DeepSeek budget RPC failed", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row?.allowed && row?.reservation_id ? { id: String(row.reservation_id) } : null;
}

async function reserveOpenAi(input: { waId: string; incomingMessageId: string; reserveUsd: number }): Promise<UsageReservation> {
  const model = String(process.env.ALAMEEN_V2_PRODUCTION_AUDITOR_MODEL || "gpt-5.6-luna").trim();
  const { data, error } = await supabaseAdmin.rpc("reserve_whatsapp_v2_production_provider_budget", {
    p_provider: "openai",
    p_model: model,
    p_purpose: "production_semantic_audit",
    p_wa_id: input.waId,
    p_incoming_message_id: input.incomingMessageId,
    p_reserve_usd: input.reserveUsd,
  });
  if (error) {
    console.error("V2 production OpenAI budget RPC failed", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row?.allowed && row?.reservation_id ? { id: String(row.reservation_id) } : null;
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
  const map: Record<string, CustomerIntent> = {
    continue_application: "continue_decision",
    decline_application: "decline_decision",
    request_refund: "refund",
    upload_receipt: "receipt_upload_needed",
    human_handoff: "human_agent",
    request_call: "call_request",
    change_application: "application_data_correction",
  };
  const action = unique[0];
  if (action === "cancel_application") {
    const confirm = turn.acts.some((act) => act.action === "cancel_application" && act.type === "confirm" && act.confidence >= 0.78);
    return confirm ? "cancel_confirmed" : "cancel_request";
  }
  return map[action] || null;
}

export function shouldUseLegacyActionExecutor(preparation: V2ProductionPreparation) {
  if (!preparation.active || !preparation.turn || !preparation.forcedIntent) return false;
  return new Set<CustomerIntent>([
    "cancel_request",
    "cancel_confirmed",
    "continue_decision",
    "decline_decision",
    "refund",
    "application_data_correction",
  ]).has(preparation.forcedIntent);
}

export async function prepareV2ProductionTurn(input: {
  waId: string;
  incomingMessageId: string;
  customerText: string;
  messageType?: string | null;
  lastCustomerMessages?: string[];
}): Promise<V2ProductionPreparation> {
  const settings = await readSettings();
  if (!settings) return { active: false, mode: "off", turn: null, forcedIntent: null, reservationId: null, fallbackReason: "settings_unavailable", state: null };
  if (settings.killSwitch || settings.mode === "off") return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: settings.killSwitch ? "kill_switch" : "mode_off", state: null };
  if (!messageTypeEligible(input.messageType)) return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: "message_type_not_enabled", state: null };
  if (stableBucket(input.waId) >= modePercent(settings)) return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: "outside_canary", state: null };

  const reservation = await reserveDeepSeek({ waId: input.waId, incomingMessageId: input.incomingMessageId, reserveUsd: settings.reserveUsdPerTurn });

  try {
    const state = await loadConversationState(input.waId);
    // Legacy assistant replies are deliberately excluded. They are narrative history, never truth.
    const customerOnlyContext = (input.lastCustomerMessages || []).slice(0, 8).reverse().map((x) => `العميل: ${x}`).join("\n");
    const interpreted = await interpretConversationTurn({
      customerText: input.customerText,
      messageType: input.messageType,
      state,
      conversationContext: customerOnlyContext,
      lastCustomerMessages: input.lastCustomerMessages,
      lastAssistantReplies: [],
      useProvider: Boolean(reservation),
    });
    if (!interpreted.turn) {
      if (reservation) await finalizeBudget(reservation.id, "failed", "interpreter_failed");
      return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: "interpreter_failed", state };
    }
    return {
      active: true,
      mode: settings.mode,
      turn: interpreted.turn,
      forcedIntent: forcedIntentFromTurn(interpreted.turn),
      reservationId: reservation?.id || null,
      fallbackReason: reservation ? (interpreted.providerError ? "interpreter_provider_fallback" : null) : "budget_blocked_truth_only",
      state,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (reservation) await finalizeBudget(reservation.id, "failed", message);
    return { active: false, mode: settings.mode, turn: null, forcedIntent: null, reservationId: null, fallbackReason: `prepare_failed:${message}`, state: null };
  }
}

function extractDeepSeekText(payload: unknown) {
  const obj = payload as any;
  const content = obj?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((x) => typeof x?.text === "string" ? x.text : "").join("\n").trim();
  return "";
}

function currentStatePrompt(preparation: V2ProductionPreparation) {
  const state = preparation.state;
  return state ? {
    current_topic: state.currentTopic || null,
    current_goal: state.currentGoal || null,
    active_tracking_id: state.activeTrackingId || null,
    customer_facts: (state.facts || []).filter((x) => x.source !== "system").slice(-20),
    open_loops: (state.openLoops || []).filter((x) => x.state === "open").slice(-12),
    human_handoff: state.humanHandoff,
    last_customer_text: state.lastCustomerText || null,
  } : null;
}

async function callWriter(input: {
  customerText: string;
  preparation: V2ProductionPreparation;
  truth: V2ResolvedTruth;
  actionExecution?: V2ActionExecution | null;
  lastCustomerMessages?: string[];
  repairIssues?: string[];
  priorDraft?: string | null;
}) {
  const key = String(process.env.DEEPSEEK_V2_API_KEY || "").trim();
  if (!key) throw new Error("DEEPSEEK_V2_API_KEY missing");
  const model = String(process.env.ALAMEEN_V2_PRODUCTION_MODEL || "deepseek-v4-pro").trim();
  const baseUrl = String(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const repair = Boolean(input.repairIssues?.length);
  const system = `أنت الموظف الذي يكتب الرد النهائي لعملاء الأمين للأقساط على واتساب. المطلوب أن يبدو الرد كإنسان فاهم المحادثة والطلب، لا كبوت ولا كقالب خدمة عملاء.

مصادر الحقيقة مرتبة ولا يجوز خلطها:
1) APPLICATION_TRUTH الحية من Supabase.
2) POLICY_TRUTH الثابتة.
3) ACTION_RESULT إذا تم تنفيذ إجراء فعلي.
4) كلام العميل يُفهم كسياق/ادعاء من العميل فقط، وليس حقيقة نظامية.
ممنوع اعتبار أي رد قديم من الأمين مصدر حقيقة، وهو أصلًا غير مقدم لك هنا.

أسلوب إلزامي:
- جاوب سؤال العميل الحالي مباشرة، وغطِّ كل المواضيع في الرسالة إذا كانت متعددة.
- باللهجة الأردنية الطبيعية، بدون مقدمات متكررة، بدون تعريف اسم موظف من عندك، وبدون خاتمة آلية مثل «إذا عندك أي استفسار أنا جاهز».
- لا تستخدم 🌿 كعلامة ثابتة ولا تحول الرد لقالب رسمي طويل إلا إذا طبيعة السؤال تحتاج تنظيمًا.
- لا تعيد سؤالًا سبق أن حسمه العميل أو موجود جوابه في الحقيقة/الحالة.
- لا تسأل «هل تريد الاستمرار؟» إلا إذا الاستمرار فعلًا هو الخطوة المفقودة حسب الحقيقة، والعميل لم يؤكده في الرسالة الحالية أو حالة المحادثة.
- لا تختلق حالة طلب/دفع/استرداد/موعد/تواصل مستقبلي.
- طلب إجراء لا يعني أنه نُفذ. ACTION_RESULT وحده يثبت التنفيذ.
- رسوم فتح الملف 5 دنانير فقط، بعد التأهيل المبدئي إذا اختار العميل الاستمرار. أي رقم قديم آخر مرفوض.
- القسط الأول: بعد شهر من استلام الجهاز وتوقيع العقد.
- لا توصيل؛ الاستلام من المكتب بموعد.
- إثباتات الدفع والمستندات الحساسة لا تُطلب على واتساب.
- لا تخترع رابطًا؛ استخدم فقط trusted_links.
- لا تذكر AI أو النظام الداخلي أو الحراس.
${repair ? "هذه محاولة إصلاح نهائية. عالج كل ISSUE حرفيًا ولا تعيد أي مخالفة." : ""}`;

  const user = `CURRENT_CUSTOMER_MESSAGE:\n${input.customerText}\n\nTURN_PLAN:\n${JSON.stringify(input.preparation.turn)}\n\nCONVERSATION_STATE:\n${JSON.stringify(currentStatePrompt(input.preparation))}\n\nRECENT_CUSTOMER_MESSAGES_ONLY:\n${JSON.stringify((input.lastCustomerMessages || []).slice(0, 8))}\n\nAPPLICATION_TRUTH:\n${JSON.stringify(applicationTruthForPrompt(input.truth))}\n\nPOLICY_TRUTH:\n${JSON.stringify(policyTruthForPrompt())}\n\nACTION_RESULT:\n${JSON.stringify(input.actionExecution || null)}${repair ? `\n\nREJECTED_DRAFT:\n${input.priorDraft || ""}\n\nISSUES_TO_FIX:\n${JSON.stringify(input.repairIssues || [])}` : ""}\n\nاكتب الرد النهائي فقط.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), repair ? 20000 : 24000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: repair ? 0 : 0.35,
        max_tokens: 950,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`writer_http_${response.status}:${raw.slice(0, 500)}`);
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    const text = extractDeepSeekText(parsed);
    if (!text) throw new Error("empty_writer_reply");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function stateContradictionViolations(reply: string, truth: V2ResolvedTruth) {
  const text = String(reply || "");
  const violations = new Set<string>();
  const app = truth.application;

  if (/(?:لا\s*يوجد|ما\s*في|مافي)[^\n]{0,35}(?:دفع|مبلغ)[^\n]{0,15}(?:مطلوب|مستحق)/i.test(text)) {
    violations.add("unsupported_no_payment_due_claim");
  }

  if (truth.confidence === "none") {
    if (/(?:طلبك|الطلب)[^\n]{0,50}(?:قيد|مؤهل|ملغي|موافق|مرفوض|بالدراسة|تحت\s*الدراسة|بانتظار)/i.test(text)) {
      violations.add("unsupported_application_state_claim_no_truth");
    }
    if (/(?:الدفع|الرسوم|الوصل)[^\n]{0,45}(?:مؤكد|مسجل|وصل|قيد\s*التأكيد)/i.test(text)) {
      violations.add("unsupported_payment_state_claim_no_truth");
    }
  }

  if (app) {
    const status = String(app.status || "");
    const paymentStatus = String(app.payment_status || "");
    if (status === "cancelled" && /(?:قيد\s*(?:الدراسة|المراجعة)|مؤهل\s*مبدئي|موافق)/i.test(text)) violations.add("application_status_contradiction");
    if (status !== "cancelled" && /(?:طلبك|الطلب)[^\n]{0,30}(?:ملغي|تم\s*إلغاؤه)/i.test(text) && !/إذا|لو/.test(text)) violations.add("application_status_contradiction");
    if (paymentStatus !== "confirmed" && /(?:الدفع|الرسوم|الوصل)[^\n]{0,35}(?:مؤكد|تم\s*تأكيد|مسجل\s*ومؤكد)/i.test(text)) violations.add("payment_status_contradiction");
  }

  return Array.from(violations);
}

function turnCoverageViolations(reply: string, preparation: V2ProductionPreparation, truth: V2ResolvedTruth) {
  const text = String(reply || "");
  const violations = new Set<string>();
  const topics = new Set(preparation.turn?.topics || []);
  const app = truth.application;

  const asksContinue = /(?:هل|بدك|حاب|حابه|حابة|حابب)[^\n]{0,30}(?:تستمر|تكمل|نكمل)/i.test(text);
  const customerAlreadyContinued = preparation.turn?.acts.some((act) => act.topic === "continuation" && ["confirm", "request_action"].includes(act.type) && act.confidence >= 0.7);
  if (asksContinue && (customerAlreadyContinued || (app && !["preliminary_qualified"].includes(String(app.status || ""))) || !topics.has("continuation"))) {
    violations.add("unnecessary_continue_question");
  }

  const coverage: Array<[string, RegExp]> = [
    ["payment_fee", /(?:5|٥)\s*(?:دنانير|دينار)|رسوم\s*فتح\s*الملف/i],
    ["first_installment", /القسط\s*(?:الأول|الاول)|الدفعة\s*(?:الأولى|الاولى)/i],
    ["office_location", /عمان|عمّان|شارع\s*المدينة/i],
    ["human_handoff", /موظف|الإدارة|الادارة|مسؤول/i],
    ["application_status", /طلبك|الطلب|الحالة/i],
    ["refund", /استرداد|استرجاع|المبلغ|الرسوم/i],
    ["delivery", /استلام|توصيل|المكتب/i],
  ];
  for (const [topic, regex] of coverage) {
    if (topics.has(topic as any) && !regex.test(text)) violations.add(`missing_topic:${topic}`);
  }
  return Array.from(violations);
}

function linkViolations(reply: string, truth: V2ResolvedTruth) {
  const violations = new Set<string>();
  const urls = String(reply || "").match(/https?:\/\/[^\s)]+/gi) || [];
  const trusted = new Set(truth.trustedLinks.map((x) => x.replace(/[،,.]+$/g, "")));
  for (const url of urls) {
    if (!trusted.has(url.replace(/[،,.]+$/g, ""))) violations.add("untrusted_or_invented_link");
  }
  if (/\[(?:رابط|لينك)[^\]]*\]/i.test(reply)) violations.add("placeholder_link");
  return Array.from(violations);
}

function actionViolations(reply: string, actionExecution?: V2ActionExecution | null) {
  const violations = new Set<string>();
  const executionClaim = /(?:تم|جرى|سجلت|سجلنا|حولت|حوّلت)[^\n]{0,45}(?:إلغاء|الغاء|استرداد|تحويل|تصعيد|الطلب|الموظف|الإدارة|الادارة)/i.test(reply);
  if (executionClaim && !actionExecution?.executed) violations.add("unverified_action_execution_claim");
  return Array.from(violations);
}

function allViolations(input: {
  reply: string;
  preparation: V2ProductionPreparation;
  truth: V2ResolvedTruth;
  actionExecution?: V2ActionExecution | null;
}) {
  return Array.from(new Set([
    ...v2PolicyViolations(input.reply),
    ...stateContradictionViolations(input.reply, input.truth),
    ...turnCoverageViolations(input.reply, input.preparation, input.truth),
    ...linkViolations(input.reply, input.truth),
    ...actionViolations(input.reply, input.actionExecution),
  ]));
}

function isHighRisk(preparation: V2ProductionPreparation) {
  const topics = new Set(preparation.turn?.topics || []);
  return [
    "application_status", "cancellation", "continuation", "refund", "payment_fee", "payment_method",
    "payment_timing", "payment_recipient", "receipt_upload", "first_installment", "delivery", "requirements",
    "identity", "salary", "guarantor", "human_handoff", "call_request", "trust",
  ].some((topic) => topics.has(topic as any)) || Boolean(preparation.forcedIntent);
}

function openAiText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

async function auditWithOpenAi(input: {
  waId: string;
  incomingMessageId: string;
  customerText: string;
  reply: string;
  preparation: V2ProductionPreparation;
  truth: V2ResolvedTruth;
  actionExecution?: V2ActionExecution | null;
  reserveUsd: number;
}) {
  const apiKey = String(process.env.OPENAI_V2_API_KEY || "").trim();
  if (!apiKey) return { available: false, pass: false, issues: ["openai_key_missing"] };
  const reservation = await reserveOpenAi({ waId: input.waId, incomingMessageId: input.incomingMessageId, reserveUsd: input.reserveUsd });
  if (!reservation) return { available: false, pass: false, issues: ["openai_budget_or_rpc_unavailable"] };
  const model = String(process.env.ALAMEEN_V2_PRODUCTION_AUDITOR_MODEL || "gpt-5.6-luna").trim();
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["pass", "issues"],
    properties: {
      pass: { type: "boolean" },
      issues: { type: "array", items: { type: "string" }, maxItems: 12 },
    },
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 24000);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: `أنت مدقق مستقل للرد النهائي في الأمين للأقساط. لا تعيد كتابة الرد. افحص فقط: فهم كل مواضيع رسالة العميل، الاستمرارية، عدم إعادة سؤال حُسم، عدم اختلاق حالة/دفع/استرداد/موعد/تواصل، صحة رسوم 5 دنانير وتوقيتها، القسط الأول بعد شهر من الاستلام والتوقيع، عدم التوصيل، عدم ادعاء تنفيذ action بلا ACTION_RESULT، وأن الأسلوب بشري وغير آلي. APPLICATION_TRUTH وPOLICY_TRUTH هما الحقيقة الوحيدة. أعط pass=false لأي خطأ قد يضلل العميل أو يجعله يبدو كبوت فاقد للسياق.`,
        input: `CUSTOMER_MESSAGE:\n${input.customerText}\n\nTURN_PLAN:\n${JSON.stringify(input.preparation.turn)}\n\nAPPLICATION_TRUTH:\n${JSON.stringify(applicationTruthForPrompt(input.truth))}\n\nACTION_RESULT:\n${JSON.stringify(input.actionExecution || null)}\n\nCANDIDATE_REPLY:\n${input.reply}`,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "alameen_live_audit", strict: true, schema }, verbosity: "low" },
        max_output_tokens: 500,
        store: false,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const body = await response.text();
    let decoded: any = null;
    try { decoded = JSON.parse(body); } catch { decoded = null; }
    if (!response.ok) throw new Error(`openai_http_${response.status}:${body.slice(0, 500)}`);
    const raw = openAiText(decoded);
    const parsed = JSON.parse(raw || "{}");
    await finalizeBudget(reservation.id, "completed");
    return { available: true, pass: Boolean(parsed.pass), issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 12) : [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeBudget(reservation.id, "failed", message);
    return { available: false, pass: false, issues: [`openai_audit_failed:${message.slice(0, 180)}`] };
  }
}

export async function resolveV2Truth(input: { waId: string; customerText: string; preparation: V2ProductionPreparation }) {
  return resolveV2ProductionTruth({ waId: input.waId, customerText: input.customerText, state: input.preparation.state });
}

export async function writeV2ProductionReply(input: {
  preparation: V2ProductionPreparation;
  waId: string;
  incomingMessageId: string;
  customerText: string;
  truth: V2ResolvedTruth;
  actionExecution?: V2ActionExecution | null;
  lastCustomerMessages?: string[];
}): Promise<V2ProductionWriteResult> {
  const fallback = () => composeV2TruthOnlyReply({
    customerText: input.customerText,
    turn: input.preparation.turn!,
    truth: input.truth,
    actionExecuted: Boolean(input.actionExecution?.executed),
    actionSummary: input.actionExecution?.summary || null,
  });

  if (!input.preparation.active || !input.preparation.turn) {
    const reply = "وصلتني رسالتك، لكن الخدمة الذكية متوقفة حاليًا. رح أجاوبك من المسار الاحتياطي.";
    return { reply, usedV2Writer: false, selfRepairApplied: false, failClosedApplied: true, safeComposerApplied: true, auditorUsed: false, auditorPassed: null, violations: ["v2_inactive"], writerError: input.preparation.fallbackReason, truthSource: input.truth.source };
  }

  if (!input.preparation.reservationId) {
    return {
      reply: fallback(),
      usedV2Writer: false,
      selfRepairApplied: false,
      failClosedApplied: true,
      safeComposerApplied: true,
      auditorUsed: false,
      auditorPassed: null,
      violations: ["ai_budget_blocked_truth_only"],
      writerError: input.preparation.fallbackReason || "budget_blocked_truth_only",
      truthSource: input.truth.source,
    };
  }

  let selfRepairApplied = false;
  let auditorUsed = false;
  let auditorPassed: boolean | null = null;
  try {
    let candidate = await callWriter({
      customerText: input.customerText,
      preparation: input.preparation,
      truth: input.truth,
      actionExecution: input.actionExecution,
      lastCustomerMessages: input.lastCustomerMessages,
    });
    let violations = allViolations({ reply: candidate, preparation: input.preparation, truth: input.truth, actionExecution: input.actionExecution });

    if (violations.length) {
      selfRepairApplied = true;
      candidate = await callWriter({
        customerText: input.customerText,
        preparation: input.preparation,
        truth: input.truth,
        actionExecution: input.actionExecution,
        lastCustomerMessages: input.lastCustomerMessages,
        repairIssues: violations,
        priorDraft: candidate,
      });
      violations = allViolations({ reply: candidate, preparation: input.preparation, truth: input.truth, actionExecution: input.actionExecution });
    }

    if (!violations.length && isHighRisk(input.preparation)) {
      auditorUsed = true;
      const settings = await readSettings();
      const audit = await auditWithOpenAi({
        waId: input.waId,
        incomingMessageId: input.incomingMessageId,
        customerText: input.customerText,
        reply: candidate,
        preparation: input.preparation,
        truth: input.truth,
        actionExecution: input.actionExecution,
        reserveUsd: settings?.openAiReserveUsdPerAudit || 0.02,
      });
      auditorPassed = audit.available ? audit.pass : false;
      if (!audit.available || !audit.pass) {
        selfRepairApplied = true;
        const issues = audit.issues.length ? audit.issues : ["semantic_audit_failed"];
        candidate = await callWriter({
          customerText: input.customerText,
          preparation: input.preparation,
          truth: input.truth,
          actionExecution: input.actionExecution,
          lastCustomerMessages: input.lastCustomerMessages,
          repairIssues: issues,
          priorDraft: candidate,
        });
        violations = allViolations({ reply: candidate, preparation: input.preparation, truth: input.truth, actionExecution: input.actionExecution });
        if (!violations.length && audit.available) {
          const reAudit = await auditWithOpenAi({
            waId: input.waId,
            incomingMessageId: `${input.incomingMessageId}:reaudit`,
            customerText: input.customerText,
            reply: candidate,
            preparation: input.preparation,
            truth: input.truth,
            actionExecution: input.actionExecution,
            reserveUsd: settings?.openAiReserveUsdPerAudit || 0.02,
          });
          auditorPassed = reAudit.available ? reAudit.pass : false;
          if (!reAudit.available || !reAudit.pass) violations.push(...(reAudit.issues.length ? reAudit.issues : ["semantic_reaudit_failed"]));
        } else if (!audit.available) {
          violations.push(...issues);
        }
      }
    }

    violations = Array.from(new Set([...violations, ...allViolations({ reply: candidate, preparation: input.preparation, truth: input.truth, actionExecution: input.actionExecution })]));
    if (violations.length || (auditorUsed && auditorPassed === false)) {
      const safe = fallback();
      const safeViolations = allViolations({ reply: safe, preparation: input.preparation, truth: input.truth, actionExecution: input.actionExecution });
      await finalizeBudget(input.preparation.reservationId, "completed", `fail_closed:${[...violations, ...safeViolations].join(",")}`);
      return {
        reply: safe,
        usedV2Writer: true,
        selfRepairApplied,
        failClosedApplied: true,
        safeComposerApplied: true,
        auditorUsed,
        auditorPassed,
        violations: Array.from(new Set([...violations, ...safeViolations])),
        writerError: null,
        truthSource: input.truth.source,
      };
    }

    await finalizeBudget(input.preparation.reservationId, "completed");
    return {
      reply: candidate,
      usedV2Writer: true,
      selfRepairApplied,
      failClosedApplied: false,
      safeComposerApplied: false,
      auditorUsed,
      auditorPassed,
      violations: [],
      writerError: null,
      truthSource: input.truth.source,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeBudget(input.preparation.reservationId, "failed", message);
    return {
      reply: fallback(),
      usedV2Writer: false,
      selfRepairApplied,
      failClosedApplied: true,
      safeComposerApplied: true,
      auditorUsed,
      auditorPassed,
      violations: ["writer_failure_truth_only_fallback"],
      writerError: message,
      truthSource: input.truth.source,
    };
  }
}

export async function commitV2ProductionState(input: {
  preparation: V2ProductionPreparation;
  waId: string;
  incomingMessageId: string;
  customerText: string;
  finalReply: string;
  truth: V2ResolvedTruth;
  actionExecution?: V2ActionExecution | null;
  writerResult?: V2ProductionWriteResult | null;
}) {
  if (!input.preparation.turn || !input.preparation.state) return;
  try {
    const app = input.truth.application;
    const next = reduceConversationState({
      state: input.preparation.state,
      turn: input.preparation.turn,
      turnId: input.incomingMessageId,
      customerText: input.customerText,
      actualReply: input.finalReply,
      applicationId: app?.id || null,
      trackingId: app?.tracking_id || null,
    });
    await saveConversationState(next);

    const { error } = await supabaseAdmin.from("whatsapp_v2_production_runs").insert({
      incoming_message_id: input.incomingMessageId,
      wa_id: input.waId,
      mode: input.preparation.mode,
      customer_message: input.customerText,
      interpreted_turn: input.preparation.turn,
      forced_intent: input.preparation.forcedIntent || null,
      application_snapshot: applicationTruthForPrompt(input.truth),
      final_reply: input.finalReply,
      used_v2_writer: Boolean(input.writerResult?.usedV2Writer),
      self_repair_applied: Boolean(input.writerResult?.selfRepairApplied),
      fail_closed_applied: Boolean(input.writerResult?.failClosedApplied),
      violations: input.writerResult?.violations || [],
      writer_error: input.writerResult?.writerError || null,
      truth_source: input.truth.source,
      truth_confidence: input.truth.confidence,
      auditor_used: Boolean(input.writerResult?.auditorUsed),
      auditor_passed: input.writerResult?.auditorPassed ?? null,
      safe_composer_applied: Boolean(input.writerResult?.safeComposerApplied),
      legacy_action_executor_used: Boolean(input.actionExecution?.usedLegacyExecutor),
      created_at: new Date().toISOString(),
    });
    if (error) console.error("V2 production run log failed", error.message);
  } catch (error) {
    console.error("V2 production state commit failed", error);
  }
}
