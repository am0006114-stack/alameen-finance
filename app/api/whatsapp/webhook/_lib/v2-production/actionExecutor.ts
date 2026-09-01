import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  hasConfirmedPaymentEvidence,
  isConditionalCancellationText,
  isExactCancelConfirmationText,
  isExplicitRefundMutationText,
  isPositiveContinueDecisionText,
} from "../stateIntegrity";
import type { ApplicationRecord, CustomerIntent } from "../types";
import type { V2InterpretedTurn } from "../v2-conversation";

export const V2_RUNTIME_VERSION = "v2.1.0";

type V2ActionOutcome = "none" | "blocked" | "already_done" | "updated" | "queued" | "failed" | "partial";

export type V2ActionExecutionItem = {
  intent: CustomerIntent;
  actionKind: string;
  executed: boolean;
  outcome: V2ActionOutcome;
  queueId?: string | null;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  beforePaymentStatus?: string | null;
  afterPaymentStatus?: string | null;
  summary?: string | null;
  error?: string | null;
};

export type V2ActionExecution = {
  usedLegacyExecutor: false;
  requested: boolean;
  executed: boolean;
  intent: CustomerIntent | null;
  actionKind?: string | null;
  outcome?: V2ActionOutcome | null;
  queueId?: string | null;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  beforePaymentStatus?: string | null;
  afterPaymentStatus?: string | null;
  summary?: string | null;
  pauseAutoReplyAfterSend?: boolean;
  error?: string | null;
  requestedIntents: CustomerIntent[];
  deferredIntents: CustomerIntent[];
  conflictDetected: boolean;
  results: V2ActionExecutionItem[];
};

type ExecuteInput = {
  waId: string;
  incomingMessageId: string;
  customerText: string;
  forcedIntent: CustomerIntent | null;
  turn: V2InterpretedTurn;
  application: ApplicationRecord | null;
};

const APP_SELECT = "id,created_at,tracking_id,full_name,phone,status,payment_status,payment_confirmed_at,payment_reference,device_name,salary,delivery_delay_until";

const ACTION_PRIORITY: CustomerIntent[] = [
  "human_agent",
  "call_request",
  "application_data_correction",
  "cancel_confirmed",
  "cancel_request",
  "refund",
  "continue_decision",
  "decline_decision",
  "stop_refund",
  "receipt_upload_needed",
];

function uniqueIntents(values: CustomerIntent[]) {
  return Array.from(new Set(values));
}

export function collectV2ActionIntents(turn: V2InterpretedTurn): CustomerIntent[] {
  const intents: CustomerIntent[] = [];
  for (const act of turn.acts || []) {
    if (act.confidence < 0.78 || !act.action || act.action === "none") continue;
    if (act.action === "cancel_application") {
      intents.push(act.type === "confirm" ? "cancel_confirmed" : "cancel_request");
      continue;
    }
    const map: Partial<Record<string, CustomerIntent>> = {
      continue_application: "continue_decision",
      decline_application: "decline_decision",
      request_refund: "refund",
      stop_refund: "stop_refund",
      upload_receipt: "receipt_upload_needed",
      human_handoff: "human_agent",
      request_call: "call_request",
      change_application: "application_data_correction",
    };
    const mapped = map[String(act.action)];
    if (mapped) intents.push(mapped);
  }

  const unique = uniqueIntents(intents);
  // A confirmed cancellation supersedes the preliminary cancel-request representation
  // if both deterministic and semantic acts describe the same customer decision.
  if (unique.includes("cancel_confirmed")) {
    return unique.filter((intent) => intent !== "cancel_request");
  }
  return unique;
}

export function primaryV2ActionIntent(turn: V2InterpretedTurn): CustomerIntent | null {
  const intents = collectV2ActionIntents(turn);
  return ACTION_PRIORITY.find((intent) => intents.includes(intent)) || intents[0] || null;
}

function baseResult(input: ExecuteInput, requestedIntents: CustomerIntent[]): V2ActionExecution {
  const primary = primaryV2ActionIntent(input.turn) || input.forcedIntent || null;
  return {
    usedLegacyExecutor: false,
    requested: requestedIntents.length > 0 || Boolean(input.forcedIntent),
    executed: false,
    intent: primary,
    actionKind: primary,
    outcome: "none",
    beforeStatus: input.application?.status || null,
    afterStatus: input.application?.status || null,
    beforePaymentStatus: input.application?.payment_status || null,
    afterPaymentStatus: input.application?.payment_status || null,
    summary: null,
    pauseAutoReplyAfterSend: false,
    error: null,
    requestedIntents,
    deferredIntents: [],
    conflictDetected: false,
    results: [],
  };
}

async function refreshApplication(id: string) {
  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(APP_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as ApplicationRecord | null;
}

async function updateApplication(
  app: ApplicationRecord,
  payload: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin
    .from("applications")
    .update(payload)
    .eq("id", app.id);
  if (error) throw error;
  return (await refreshApplication(app.id)) || ({ ...app, ...payload } as ApplicationRecord);
}

async function queueStaffAction(input: ExecuteInput, actionType: "human_handoff" | "call_request" | "application_data_correction") {
  const payload = {
    incoming_message_id: input.incomingMessageId,
    wa_id: input.waId,
    application_id: input.application?.id || null,
    tracking_id: input.application?.tracking_id || null,
    action_type: actionType,
    customer_message: String(input.customerText || "").slice(0, 3000),
    status: "pending",
    runtime_version: V2_RUNTIME_VERSION,
    metadata: {
      turn_topics: input.turn.topics,
      requested_actions: input.turn.requestedActions,
    },
  };

  const { data, error } = await supabaseAdmin
    .from("whatsapp_v2_human_action_queue")
    .upsert(payload, { onConflict: "incoming_message_id,action_type", ignoreDuplicates: true })
    .select("id,status")
    .maybeSingle();

  if (error) throw error;

  if (data?.id) return { id: String(data.id), status: String(data.status || "pending") };

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("whatsapp_v2_human_action_queue")
    .select("id,status")
    .eq("incoming_message_id", input.incomingMessageId)
    .eq("action_type", actionType)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing?.id) throw new Error("staff_action_queue_insert_not_confirmed");
  return { id: String(existing.id), status: String(existing.status || "pending") };
}

function hasTurnAction(turn: V2InterpretedTurn, action: string) {
  return turn.acts.some((act) => act.action === action && act.confidence >= 0.78);
}

function itemBase(intent: CustomerIntent, app: ApplicationRecord | null): V2ActionExecutionItem {
  return {
    intent,
    actionKind: intent,
    executed: false,
    outcome: "none",
    queueId: null,
    beforeStatus: app?.status || null,
    afterStatus: app?.status || null,
    beforePaymentStatus: app?.payment_status || null,
    afterPaymentStatus: app?.payment_status || null,
    summary: null,
    error: null,
  };
}

async function executeSingleIntent(
  input: ExecuteInput,
  intent: CustomerIntent,
  app: ApplicationRecord | null,
): Promise<{ result: V2ActionExecutionItem; application: ApplicationRecord | null }> {
  const result = itemBase(intent, app);

  if (intent === "human_agent") {
    const queued = await queueStaffAction({ ...input, application: app }, "human_handoff");
    return {
      result: {
        ...result,
        executed: true,
        actionKind: "human_handoff",
        outcome: "queued",
        queueId: queued.id,
        summary: "تم تحويل المحادثة فعليًا لقائمة متابعة الموظفين، وبعد هذه الرسالة بيتوقف الرد الآلي على المحادثة.",
      },
      application: app,
    };
  }

  if (intent === "call_request") {
    const queued = await queueStaffAction({ ...input, application: app }, "call_request");
    return {
      result: {
        ...result,
        executed: true,
        actionKind: "call_request",
        outcome: "queued",
        queueId: queued.id,
        summary: "تم تسجيل طلب المكالمة للمتابعة. هذا ما يعني إن وقت الاتصال تحدد.",
      },
      application: app,
    };
  }

  if (intent === "application_data_correction") {
    const queued = await queueStaffAction({ ...input, application: app }, "application_data_correction");
    return {
      result: {
        ...result,
        executed: true,
        actionKind: "application_data_correction",
        outcome: "queued",
        queueId: queued.id,
        summary: "تم تسجيل طلب تصحيح البيانات للمراجعة، وما تم تغيير بيانات الطلب تلقائيًا.",
      },
      application: app,
    };
  }

  if (intent === "receipt_upload_needed") {
    return { result: { ...result, outcome: "none", summary: "رفع إثبات الدفع يحتاج الرابط الرسمي المرتبط بالطلب؛ ما في تغيير آلي على الطلب من مجرد السؤال." }, application: app };
  }

  if (intent === "stop_refund") {
    return { result: { ...result, outcome: "blocked", summary: "إيقاف مسار الاسترداد ما تم تنفيذه تلقائيًا من هذه الرسالة." }, application: app };
  }

  if (!app) {
    return {
      result: { ...result, outcome: "blocked", summary: "ما تم تنفيذ أي تغيير لأن الرسالة غير مربوطة بطلب مؤكد." },
      application: app,
    };
  }

  if (intent === "cancel_request") {
    return {
      result: { ...result, outcome: "blocked", summary: "تم فهم طلب الإلغاء، لكن الإلغاء النهائي ما تنفذ بدون تأكيد صريح." },
      application: app,
    };
  }

  if (intent === "decline_decision") {
    return {
      result: { ...result, outcome: "blocked", summary: "تم فهم إنك ما بدك تستمر، لكن الطلب ما انلغى نهائيًا بدون تأكيد إلغاء صريح." },
      application: app,
    };
  }

  if (intent === "continue_decision") {
    if (!hasTurnAction(input.turn, "continue_application") || !isPositiveContinueDecisionText(input.customerText)) {
      return { result: { ...result, outcome: "blocked", summary: "ما تم تسجيل الاستمرار لأن الرسالة ما فيها قرار استمرار صريح." }, application: app };
    }
    if (app.status === "customer_confirmed_continue" || ["pending", "pending_payment", "payment_info_sent", "confirmed"].includes(String(app.payment_status || ""))) {
      return { result: { ...result, executed: true, outcome: "already_done", summary: "رغبتك بالاستمرار مسجلة أصلًا على الطلب." }, application: app };
    }
    if (app.status !== "preliminary_qualified") {
      return { result: { ...result, outcome: "blocked", summary: "الطلب متقدم أصلًا عن مرحلة التأهيل المبدئي، لذلك ما تم تغيير حالته بسبب رسالة الاستمرار." }, application: app };
    }
    const updated = await updateApplication(app, {
      status: "customer_confirmed_continue",
      payment_status: "payment_info_sent",
    });
    return {
      result: {
        ...result,
        executed: true,
        outcome: "updated",
        afterStatus: updated.status || null,
        afterPaymentStatus: updated.payment_status || null,
        summary: "تم تسجيل رغبتك بالاستمرار فعليًا على الطلب.",
      },
      application: updated,
    };
  }

  if (intent === "cancel_confirmed") {
    if (!isExactCancelConfirmationText(input.customerText) || isConditionalCancellationText(input.customerText)) {
      return { result: { ...result, outcome: "blocked", summary: "الإلغاء النهائي ما تنفذ لأن التأكيد الصريح غير مكتمل." }, application: app };
    }
    if (app.status === "cancelled") {
      return { result: { ...result, executed: true, outcome: "already_done", summary: "الطلب ملغي أصلًا." }, application: app };
    }
    const wasPaid = hasConfirmedPaymentEvidence(app);
    const updated = await updateApplication(app, wasPaid ? {
      status: "cancelled",
      payment_status: "refund_requested",
      payment_reference: "customer_cancelled_paid_refund_pending",
    } : {
      status: "cancelled",
      payment_status: "not_requested_yet",
      payment_reference: "customer_declined_continue",
    });
    return {
      result: {
        ...result,
        executed: true,
        outcome: "updated",
        afterStatus: updated.status || null,
        afterPaymentStatus: updated.payment_status || null,
        summary: wasPaid
          ? "تم إلغاء الطلب فعليًا، وبما إن الدفع مؤكد انفتح مسار الاسترداد على الطلب."
          : "تم إلغاء الطلب فعليًا، وما في استرداد مرتبط فيه لأنه ما في دفع مؤكد على الملف.",
      },
      application: updated,
    };
  }

  if (intent === "refund") {
    const paymentConfirmed = hasConfirmedPaymentEvidence(app);
    if (app.status === "refund_completed") {
      return { result: { ...result, executed: true, outcome: "already_done", summary: "الاسترداد مكتمل أصلًا على الطلب." }, application: app };
    }
    if ((app.status === "refund_requested" || app.payment_status === "refund_requested") && paymentConfirmed) {
      return { result: { ...result, executed: true, outcome: "already_done", summary: "طلب الاسترداد مسجل أصلًا وقيد المراجعة." }, application: app };
    }
    if (!isExplicitRefundMutationText(input.customerText) || !hasTurnAction(input.turn, "request_refund")) {
      return { result: { ...result, outcome: "blocked", summary: "ما تم تسجيل استرداد لأن الرسالة مش طلب استرداد صريح." }, application: app };
    }
    if (!paymentConfirmed) {
      return { result: { ...result, outcome: "blocked", summary: "ما تم تسجيل استرداد لأنه ما في دفع مؤكد ظاهر على الطلب." }, application: app };
    }
    const updated = await updateApplication(app, { status: "refund_requested" });
    return {
      result: {
        ...result,
        executed: true,
        outcome: "updated",
        afterStatus: updated.status || null,
        afterPaymentStatus: updated.payment_status || null,
        summary: "تم تسجيل طلب الاسترداد فعليًا على الطلب.",
      },
      application: updated,
    };
  }

  return { result, application: app };
}

function conflictingTransactionalIntents(intents: CustomerIntent[]) {
  const decisionIntents = intents.filter((intent) => [
    "continue_decision",
    "decline_decision",
    "cancel_request",
    "cancel_confirmed",
  ].includes(intent));
  return uniqueIntents(decisionIntents).length > 1;
}

function aggregateOutcome(results: V2ActionExecutionItem[], conflictDetected: boolean): V2ActionOutcome {
  if (!results.length) return conflictDetected ? "blocked" : "none";
  const outcomes = new Set(results.map((item) => item.outcome));
  if (conflictDetected || outcomes.size > 1) return "partial";
  return results[0].outcome;
}

export function actionResultSucceeded(execution: V2ActionExecution | null | undefined, intent: CustomerIntent) {
  return Boolean(execution?.results?.some((item) => item.intent === intent && item.executed && ["updated", "queued", "already_done"].includes(item.outcome)));
}

export async function executeV2Action(input: ExecuteInput): Promise<V2ActionExecution> {
  const requestedIntents = collectV2ActionIntents(input.turn);
  if (!requestedIntents.length && input.forcedIntent) requestedIntents.push(input.forcedIntent);
  const result = baseResult(input, requestedIntents);
  if (!requestedIntents.length) return result;

  const conflictDetected = conflictingTransactionalIntents(requestedIntents);
  const staffIntents = requestedIntents.filter((intent) => ["human_agent", "call_request", "application_data_correction"].includes(intent));
  const deferredIntents = conflictDetected
    ? requestedIntents.filter((intent) => !staffIntents.includes(intent))
    : [];
  const executionIntents = conflictDetected ? staffIntents : requestedIntents;

  let currentApp = input.application;
  const results: V2ActionExecutionItem[] = [];
  let topLevelError: string | null = null;

  if (conflictDetected) {
    for (const intent of deferredIntents) {
      results.push({
        ...itemBase(intent, currentApp),
        outcome: "blocked",
        summary: "الرسالة فيها أكثر من قرار متعارض على الطلب، لذلك ما تم تنفيذ هذا التغيير تلقائيًا قبل حسم المقصود.",
      });
    }
  }

  for (const intent of executionIntents) {
    try {
      const executed = await executeSingleIntent(input, intent, currentApp);
      results.push(executed.result);
      currentApp = executed.application;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      topLevelError = topLevelError || message;
      console.error("V2.1 action executor failed", { intent, waId: input.waId, incomingMessageId: input.incomingMessageId, error: message });
      results.push({
        ...itemBase(intent, currentApp),
        outcome: "failed",
        error: message.slice(0, 800),
        summary: "تعذر تنفيذ هذا الإجراء الآن، لذلك ما تم اعتباره منفذًا.",
      });
    }
  }

  const executed = results.some((item) => item.executed);
  const pauseAutoReplyAfterSend = results.some((item) => item.intent === "human_agent" && item.executed && item.outcome === "queued");
  const summaries = Array.from(new Set(results.map((item) => String(item.summary || "").trim()).filter(Boolean)));
  const queueId = results.find((item) => item.queueId)?.queueId || null;
  const primary = primaryV2ActionIntent(input.turn) || input.forcedIntent || requestedIntents[0] || null;
  const successfulPrimary = primary ? results.find((item) => item.intent === primary) : null;

  return {
    ...result,
    requested: true,
    executed,
    intent: primary,
    actionKind: results.length > 1 ? "multi_action" : (successfulPrimary?.actionKind || primary),
    outcome: aggregateOutcome(results, conflictDetected),
    queueId,
    afterStatus: currentApp?.status || result.afterStatus || null,
    afterPaymentStatus: currentApp?.payment_status || result.afterPaymentStatus || null,
    summary: summaries.join(" ") || null,
    pauseAutoReplyAfterSend,
    error: topLevelError,
    requestedIntents,
    deferredIntents,
    conflictDetected,
    results,
  };
}

export async function applyV2PostSendAction(input: {
  waId: string;
  actionExecution?: V2ActionExecution | null;
}) {
  if (!input.actionExecution?.pauseAutoReplyAfterSend || !input.actionExecution.executed) return;
  const waId = String(input.waId || "").replace(/\D/g, "");
  if (!waId) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin.from("whatsapp_messages").insert({
    wa_id: waId,
    direction: "outgoing",
    customer_name: null,
    message_id: null,
    message_type: "admin_control",
    body: "AUTO_REPLY_IGNORED",
    intent: null,
    tracking_id: null,
    application_id: null,
    needs_human_review: true,
    handled_by_ai: false,
    raw_payload: {
      source: "v2.1_human_handoff",
      auto_reply_ignored: true,
      action_queue_id: input.actionExecution.queueId || null,
      changed_at: nowIso,
      runtime_version: V2_RUNTIME_VERSION,
    },
  });
  if (error) throw error;
}
