import { actionRequiresOmran } from "./hierarchy";
import { hasPaymentRefundIntegrityConflict, truthHasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { applicationJourneyStage } from "./applicationJourney";
import { commercialContinuationAffirmativeText, commercialDisclosureDelivered, strongCommercialContinuationDecisionText } from "./informedCommercialContinuation";
import { persistExplicitContinuation } from "./continuationPersistence";
import { notifyV3Discord } from "./discordNotifier";
import { normalizeArabic } from "./text";
import type { ActionKey, ActionResult, ConversationState, PlannedAction, TruthBundle } from "./types";

export type ActionExecutorAdapter = {
  execute(action: PlannedAction, context: { state: ConversationState; truth: TruthBundle }): Promise<{ success: boolean; alreadyDone?: boolean; mutationId?: string | null; summary?: string | null; blocker?: string | null; details?: Record<string, unknown> | null }>;
};

export function guardAction(action: PlannedAction, state: ConversationState, truth: TruthBundle): ActionResult {
  if (action.action === "switch_ai_role") {
    return { action: action.action, outcome: "executed", executed: true, authoritativeSummary: "تم تغيير مستوى المعالجة داخل فريق AI.", mutationId: null, blocker: null, ownerRole: state.role.currentRole };
  }
  if (action.action === "record_call_preference") {
    return { action: action.action, outcome: "dry_run", executed: false, authoritativeSummary: null, mutationId: null, blocker: "human_contact_request_requires_durable_receipt", ownerRole: state.role.currentRole };
  }

  const businessMutation = actionRequiresOmran(action.action);
  if (businessMutation && state.role.currentRole !== "omran") {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "omran_supervisor_required", ownerRole: state.role.currentRole };
  }

  if (["cancel_application","request_refund","link_whatsapp_alias","change_application_data","change_device","continue_application","reopen_application","stop_refund"].includes(action.action) && !truth.application) {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "application_truth_required", ownerRole: state.role.currentRole };
  }

  if (["cancel_application","request_refund","change_application_data","change_device","continue_application","reopen_application","stop_refund"].includes(action.action) && ["safe_preview","none"].includes(String(truth.contactAccess || ""))) {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "full_contact_identity_required_for_mutation", ownerRole: state.role.currentRole };
  }

  if (action.action === "link_whatsapp_alias" && String(truth.contactAccess || "") === "none") {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "tracking_safe_preview_required_for_alias_link", ownerRole: state.role.currentRole };
  }

  if (hasPaymentRefundIntegrityConflict(truth.application) && ["cancel_application","request_refund","stop_refund","reopen_application","continue_application","change_application_data","change_device"].includes(action.action)) {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "payment_refund_integrity_conflict_requires_admin", ownerRole: state.role.currentRole };
  }

  if (action.action === "request_refund" && !truthHasAuthoritativePaymentConfirmation(truth)) {
    return { action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: "confirmed_payment_required_for_refund_path", ownerRole: state.role.currentRole };
  }

  if (action.requiresConfirmation) {
    return { action: action.action, outcome: "needs_confirmation", executed: false, authoritativeSummary: null, mutationId: null, blocker: "explicit_confirmation_required", ownerRole: state.role.currentRole };
  }

  return { action: action.action, outcome: "dry_run", executed: false, authoritativeSummary: null, mutationId: null, blocker: "shadow_core_no_business_mutation", ownerRole: state.role.currentRole };
}

function realMutationOwnershipBlocker(action: PlannedAction, state: ConversationState, truth: TruthBundle, currentTurnId: string) {
  if (!["cancel_application", "request_refund", "stop_refund", "reopen_application", "link_whatsapp_alias"].includes(action.action)) return null;
  const payload = action.payload || {};
  const normalizedTurnId = String(currentTurnId || "").trim();
  if (!normalizedTurnId) return "current_turn_authority_required";
  if (!truth.application) return "application_truth_required";
  if (String(payload._scopeApplicationId || "") !== truth.application.id) return "mutation_application_scope_required";
  if (String(payload._scopeTrackingId || "") !== String(truth.application.trackingId || "")) return "mutation_tracking_scope_required";
  if (String(payload._scopeWaId || "") !== String(state.waId || "")) return "mutation_sender_scope_required";
  if (action.action === "link_whatsapp_alias" && String(payload._aliasWaId || payload._scopeWaId || "") !== String(state.waId || "")) return "alias_sender_scope_required";
  const confirmedOnTurn = String(payload._mutationConfirmedOnTurn || "").trim();
  if (!confirmedOnTurn) return "explicit_action_named_confirmation_required";
  if (confirmedOnTurn !== normalizedTurnId) return "mutation_confirmation_turn_mismatch";
  return null;
}

function normalizedCurrentTurn(currentCustomerText: string) {
  return normalizeArabic(String(currentCustomerText || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namedCurrentTurnMutation(action: ActionKey, q: string) {
  if (action === "cancel_application") {
    return /(?:الغي|الغاء|الغوا|ألغ|إلغ).{0,26}(?:الطلب|طلبي|المعامله|المعاملة)?/.test(q)
      && !/(?:لا|ما)\s*(?:تلغي|الغي|الغاء)|(?:تراجعت|بطلت).{0,18}(?:الالغاء|الإلغاء)/.test(q);
  }
  if (action === "request_refund") {
    return /(?:استرداد|استرجاع|استرد|استرجع|رجعلي|رجعولي)/.test(q)
      && !/(?:بديش|ما\s+بدي|لا\s+اريد|لا\s+أريد).{0,24}(?:استرد|استرجع|الاسترداد|الاسترجاع)/.test(q);
  }
  if (action === "stop_refund") {
    return /(?:وقف|اوقف|أوقف|ايقاف|إيقاف|الغي|ألغي|الغاء|إلغاء).{0,34}(?:طلب\s+)?(?:الاسترداد|الاسترجاع)|(?:بديش|ما\s+بدي|لا\s+اريد|لا\s+أريد).{0,26}(?:الاسترداد|الاسترجاع)|(?:ارجع|بدي).{0,26}(?:اكمل|استمر).{0,28}(?:بدل|بعد).{0,20}(?:الاسترداد|الاسترجاع)/.test(q);
  }
  if (action === "reopen_application") {
    return /(?:اعيد|أعيد|اعاده|إعادة|ارجع|أرجع|رجع).{0,28}(?:افتح|فتح|الطلب|الملف)|(?:افتح|أفتح|تفعيل).{0,24}(?:الطلب|الملف)|(?:تراجعت|بطلت).{0,24}(?:الالغاء|الإلغاء)/.test(q)
      && !/(?:لا|ما)\s*(?:ترجع|تعيد|تفتح)|(?:ما\s+بدي|بديش|لا\s+اريد).{0,24}(?:اكمل|استمر)/.test(q);
  }
  return true;
}

function currentTurnMutationAuthorityBlocker(action: PlannedAction, currentCustomerText: string) {
  if (!["cancel_application", "request_refund", "stop_refund", "reopen_application", "link_whatsapp_alias"].includes(action.action)) return null;
  if (!String(currentCustomerText || "").trim()) return "current_turn_authority_required";
  if (action.action === "link_whatsapp_alias") return null;
  const q = normalizedCurrentTurn(currentCustomerText);
  const cancel = namedCurrentTurnMutation("cancel_application", q);
  const refund = namedCurrentTurnMutation("request_refund", q);
  const stopRefund = namedCurrentTurnMutation("stop_refund", q);
  const reopen = namedCurrentTurnMutation("reopen_application", q);
  if ((cancel && reopen) || (refund && stopRefund)) return "conflicting_current_turn_mutation_directions";
  if (!namedCurrentTurnMutation(action.action, q)) return "current_turn_explicit_action_name_required";
  return null;
}

function deterministicCommercialContinuationAction(state: ConversationState, truth: TruthBundle, currentCustomerText: string): PlannedAction | null {
  const app = truth.application;
  if (!app || String(truth.contactAccess || "") !== "full") return null;
  if (applicationJourneyStage(app) !== "preliminary_approved_waiting_decision") return null;
  const currentAuthorityText = String(currentCustomerText || "").trim();
  if (!currentAuthorityText) return null;
  if (!commercialContinuationAffirmativeText(currentAuthorityText)) return null;

  // Ambiguous acknowledgements still require the scoped disclosure state.
  const disclosureSatisfied = commercialDisclosureDelivered(state, truth);
  const strongDecision = strongCommercialContinuationDecisionText(currentAuthorityText);
  if (!disclosureSatisfied && !strongDecision) return null;

  return {
    action: "continue_application",
    sourceActId: state.lastTurnId || "commercial-continuation",
    requiresConfirmation: false,
    authority: "deterministic",
    requiredRole: "omran",
    payload: {
      _commercialDecision: true,
      _scopeApplicationId: app.id,
      _scopeTrackingId: app.trackingId,
      _scopeWaId: state.waId,
    },
  };
}

async function notifyCommercialContinuationPersisted(input: {
  state: ConversationState;
  truth: TruthBundle;
  updated: boolean;
  alreadyRecorded: boolean;
}) {
  const app = input.truth.application;
  if (!app) return;
  try {
    await notifyV3Discord({
      event: "customer_continue_payment_ready",
      applicationId: app.id,
      trackingId: app.trackingId || null,
      waId: input.state.waId,
      title: "✅ العميل اختار الاستمرار — خطوة الدفع مفتوحة",
      description: input.updated
        ? "تم تثبيت قرار الاستمرار من واتساب وتحديث الطلب إلى خطوة رسوم فتح الملف."
        : "قرار الاستمرار مثبت مسبقًا، وتم التأكد أن خطوة رسوم فتح الملف مفتوحة.",
      details: {
        action: "continue_application",
        status: "customer_confirmed_continue",
        paymentStatus: "pending_payment",
        source: "whatsapp_human_os",
        updated: input.updated,
        alreadyRecorded: input.alreadyRecorded,
      },
    });
  } catch (error) {
    // Discord is observability. A successful authoritative application write must
    // never be rolled back or reported as failed because notification delivery failed.
    console.error("V3 continuation success Discord notification failed", error);
  }
}

export async function executeActions(input: { actions: PlannedAction[]; state: ConversationState; truth: TruthBundle; adapter?: ActionExecutorAdapter | null; allowMutation?: boolean; currentTurnId: string; currentCustomerText: string }): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  const commercialContinuation = deterministicCommercialContinuationAction(input.state, input.truth, input.currentCustomerText);
  const actions = commercialContinuation
    ? [commercialContinuation, ...input.actions.filter((action) => action.action !== "continue_application")]
    : input.actions;

  for (const action of actions) {
    // Commercial continuation is intentionally not a broad Real Action. It is a
    // narrow, idempotent state transition that may run even while general real
    // mutations are disabled. Scoped disclosure is required for ambiguous/bare
    // acknowledgements; a strong standalone continuation command is independently
    // authoritative for the exact preliminary-approved application.
    if (action.action === "continue_application" && action.payload?._commercialDecision === true) {
      const persisted = await persistExplicitContinuation({
        application: input.truth.application,
        explicitContinue: true,
      });
      const success = persisted.updated || persisted.alreadyRecorded;
      results.push({
        action: "continue_application",
        outcome: persisted.updated ? "executed" : persisted.alreadyRecorded ? "already_done" : persisted.attempted ? "failed" : "blocked",
        executed: success,
        authoritativeSummary: persisted.updated
          ? "تم تسجيل رغبة الاستمرار وفتح خطوة رسوم فتح الملف."
          : persisted.alreadyRecorded
            ? "رغبة الاستمرار مسجلة أصلًا."
            : null,
        mutationId: null,
        blocker: persisted.blocker,
        ownerRole: input.state.role.currentRole,
        details: {
          deterministicCommercialContinuation: true,
          attempted: persisted.attempted,
          updated: persisted.updated,
          alreadyRecorded: persisted.alreadyRecorded,
        },
      });
      if (success && input.truth.application) {
        // Monotonic read-your-write bridge: this fact is written only after the
        // authoritative application mutation succeeds. Production truth may use it
        // briefly if a subsequent database read is lagging behind the committed row.
        const stamp = new Date().toISOString();
        const fact = {
          key: "authoritative_continuation_persisted",
          value: input.truth.application.id,
          topic: "continuation" as const,
          source: "system" as const,
          confidence: 1,
          turnId: input.state.lastTurnId || action.sourceActId || "commercial-continuation",
          updatedAt: stamp,
        };
        const existingFact = input.state.facts.findIndex((item) => item.key === fact.key);
        if (existingFact >= 0) input.state.facts[existingFact] = fact;
        else input.state.facts.push(fact);
        input.state.updatedAt = stamp;

        await notifyCommercialContinuationPersisted({
          state: input.state,
          truth: input.truth,
          updated: persisted.updated,
          alreadyRecorded: persisted.alreadyRecorded,
        });
      }
      continue;
    }

    const guarded = guardAction(action,input.state,input.truth);
    if (guarded.outcome !== "dry_run" || !input.allowMutation || !input.adapter) {
      results.push(guarded);
      continue;
    }
    const ownershipBlocker = realMutationOwnershipBlocker(action, input.state, input.truth, input.currentTurnId);
    if (ownershipBlocker) {
      results.push({ action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: ownershipBlocker, ownerRole: input.state.role.currentRole });
      continue;
    }
    const currentTurnBlocker = currentTurnMutationAuthorityBlocker(action, input.currentCustomerText);
    if (currentTurnBlocker) {
      results.push({ action: action.action, outcome: "blocked", executed: false, authoritativeSummary: null, mutationId: null, blocker: currentTurnBlocker, ownerRole: input.state.role.currentRole });
      continue;
    }
    try {
      const r = await input.adapter.execute(action,{ state: input.state, truth: input.truth });
      results.push({
        action: action.action,
        outcome: r.success ? (r.alreadyDone ? "already_done" : "executed") : "failed",
        executed: r.success,
        authoritativeSummary: r.summary || null,
        mutationId: r.mutationId || null,
        blocker: r.blocker || null,
        ownerRole: input.state.role.currentRole,
        details: r.details || null,
      });
    } catch (error) {
      results.push({ action: action.action, outcome: "failed", executed: false, authoritativeSummary: null, mutationId: null, blocker: error instanceof Error ? error.message : "action_executor_error", ownerRole: input.state.role.currentRole });
    }
  }
  return results;
}
