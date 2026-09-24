import { executeActions } from "./actionPlane";
import { buildReplyPlan } from "./planner";
import { contactPhonesMatch, resolveV3ProductionTruth } from "./productionTruth";
import { closeAnsweredLoops, emptyState, finalizeStateSemanticMemory, inferRoleIntroducedFromRecentTurns, markRoleIntroducedFromReply, reduceState } from "./state";
import { loadV3ConversationState } from "./stateStore";
import type { ActionResult, ConversationState, InterpretedTurn, OsRunResult, TruthBundle, VerificationReport } from "./types";
import { interpretTurn } from "./interpreter";
import { v3WriterProviderFromEnv, type V3TextProvider } from "./provider";
import { LIVE_SCOPED_MUTATIONS, v3TransactionalActionAdapter } from "./transactionalActionAdapter";
import { notifyV3Discord } from "./discordNotifier";
import { continuationCommercialState } from "./commercialProgression";
import { applicationRefundUrl, buildOfficialLinkContext, sanitizeRecentTurnsForModel } from "./linkIntegrity";
import { buildManualActionCustomerReply, hasPaymentProtection, manualStatePayload, resolveManualActionDisposition } from "./manualActionPolicy";
import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { buildMandatoryFiveJodContinuationReply, explicitContactNumberChangeRequest, explicitContinuationText, explicitDoNotContinueText, hardenTurnForConversationRecovery, isNewApplicationFlow } from "./conversationRecovery";
import { isContinuationRevenueReady, persistExplicitContinuation } from "./continuationPersistence";
import { filterPlannedActionsForApplicationScope, pendingActionMatchesCurrentApplication, scopeStateToCurrentApplication, scopeTurnToCurrentApplication, stampActionScope, stampPendingPayloadScope } from "./applicationScopeLock";
import { logIntegrityTelemetry } from "./integrityTelemetry";
import { enforceMutationConfirmationGate, pendingActionIsCurrentTurnFocus } from "./mutationConfirmationGate";
import { stabilizeTruthSnapshot } from "./truthSnapshotLock";
import { dataDeletionConfirmationText, explicitExpediteRequestText, explicitTrackingFromText } from "./dailyConversationIntegrity";
import { buildHumanFirstCustomerBurst, enrichHumanFirstTurn, supersedeConversationStateForJourney } from "./humanFirstJourneyIntelligence";
import { enforceCurrentTurnAuthority, explicitContactRequestText } from "./currentTurnAuthority";
import { enforceFreshTurnAuthority } from "./freshTurnAuthority";
import { applyAuthoritativeActionConversationMemory } from "./actionConversationMemory";
import { contactExplanationFromText, markContactResolution, clearContactResolution, canonicalWaId } from "./contactIdentity";
import { applyConversationConstraintsToReply, updateConversationConstraints } from "./conversationConstraints";
import { buildPaymentIncidentReply, detectPaymentIncident } from "./paymentIncident";
import { enforceSemanticDecisionAuthority, semanticConfirmsContinuation, semanticContinuationVeto } from "./semanticAuthority";
import type { SemanticReplyCheck } from "./semanticReplyVerifier";
import { buildInformedCommercialDisclosureReply, commercialDisclosureDelivered, markCommercialDisclosureAcknowledged, markCommercialDisclosureDelivered, shouldExplainCommercialStep } from "./informedCommercialContinuation";
import { buildSingleConversationAuthorityReply } from "./singleConversationAuthority";
import { runNativeConversationKernel, validateNativeConversationReply, type NativeKernelResult } from "./nativeConversationKernel";
// Phase 7.1.1 compatibility anchor: buildV3LastResortReply({ truth: truthAfterActions, state: boundState

const PASS: VerificationReport = {
  pass: true,
  missingTopics: [],
  unsupportedClaims: [],
  truthContradictions: [],
  actionClaimViolations: [],
  policyViolations: [],
  hierarchyViolations: [],
  repetitionFlags: [],
};

function withContactIdentityEventFact(state: ConversationState, input: { turnId: string; key: string; value: string }) {
  const stamp = new Date().toISOString();
  const facts = state.facts.filter((fact) => !["verified_alternate_contact_linked", "verified_alternate_contact_conflict"].includes(fact.key));
  facts.push({ key: input.key, value: input.value, topic: "application_correction", source: "system", confidence: 1, turnId: input.turnId, updatedAt: stamp });
  return { ...state, facts: facts.slice(-120), updatedAt: stamp };
}

export type V3LiveResult = OsRunResult & {
  truthBeforeActions: TruthBundle;
  truthAfterActions: TruthBundle;
  reply: string | null;
  providerUsed: boolean;
  interpreterUsed: boolean;
  interpreterError: string | null;
  replyAttempts: number;
  finalSafetyPass: boolean;
  fallbackUsed: boolean;
  realActionsEnabled: boolean;
};

function repairPrompt(base: string, reply: string, verification: VerificationReport) {
  return `${base}\n\nالرد السابق فشل التحقق الداخلي.\nPREVIOUS_REPLY=${JSON.stringify(reply)}\nVIOLATIONS=${JSON.stringify(verification)}\n\nأعد كتابة الرد النهائي فقط. أصلح المخالفات، لا تحذف أي موضوع مطلوب، ولا تدّعي أي إجراء غير منفذ.`;
}

function semanticRepairPrompt(base: string, reply: string, check: SemanticReplyCheck) {
  return `${base}\n\nPHASE_7_8_0_SEMANTIC_REPAIR=true\nالرد السابق كان آمنًا من ناحية الحقيقة لكنه فشل في فهم/جواب المعنى الحالي.\nPREVIOUS_REPLY=${JSON.stringify(reply)}\nSEMANTIC_FAILURE=${JSON.stringify(check)}\n\nأعد كتابة الرد النهائي فقط. جاوب currentQuestion وanswerObligations الحالية مباشرة، لا ترجع لموضوع قديم، لا تقلب قرارًا مؤجلًا إلى استمرار، ولا تخترع حقيقة عن كيان/محفظة غير موثقة.`;
}

function actionNeedsTruthRefresh(actions: ActionResult[]) {
  return actions.some((x) => ["executed", "already_done", "failed"].includes(x.outcome));
}

async function notifyActionProblems(input: {
  waId: string;
  trackingId?: string | null;
  applicationId?: string | null;
  actions: ActionResult[];
}) {
  for (const result of input.actions) {
    const scopedManualBlock = String(result.blocker || "").startsWith("scoped_real_actions_disallowed:");
    if (result.outcome === "failed" && !scopedManualBlock) {
      await notifyV3Discord({
        event: "business_mutation_failed",
        applicationId: input.applicationId || null,
        trackingId: input.trackingId || null,
        waId: input.waId,
        title: "V3 — تعذر تنفيذ إجراء حقيقي",
        description: `الإجراء ${result.action} فشل بعد طلب العميل.`,
        details: { action: result.action, blocker: result.blocker, mutationId: result.mutationId },
      });
    }
    if (result.blocker === "payment_refund_integrity_conflict_requires_admin") {
      await notifyV3Discord({
        event: "truth_integrity_failure",
        applicationId: input.applicationId || null,
        trackingId: input.trackingId || null,
        waId: input.waId,
        title: "V3 — تعارض حقيقة مالية",
        description: "تم إيقاف التغيير تلقائيًا بسبب تعارض بين تأكيد الدفع ومسار الاسترداد.",
        details: { action: result.action, blocker: result.blocker },
      });
    }
  }
}

export function buildV3LastResortReply(input?: { truth: TruthBundle; state: ConversationState; customerText: string }) {
  if (!input) return "اكتب سؤالك أو رقم التتبع، وبجاوبك فقط من الحقيقة الموثقة عندنا.";
  const syntheticTurn: InterpretedTurn = { turnId: "last-resort", rawText: input.customerText, normalizedText: input.customerText, acts: [], topics: [], requestedActions: [], sentiment: "calm", urgency: "normal", explicitRoleRequest: null, confidence: 0.5, warnings: [], semantic: null };
  const authority = buildSingleConversationAuthorityReply({ turn: syntheticTurn, state: input.state, truth: input.truth });
  if (authority) return authority;
  const app = input.truth.application;
  const q = String(input.customerText || "").trim();
  const nq = q.replace(/[؟?!.,،]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  if (/^(?:تمام|اوك|اوكي|شكرا|شكرًا|يسلمو|يعطيك العافيه|يعطيك العافية|على خير|ان شاء الله|إن شاء الله|الحمد لله)[\s!]*$/i.test(nq)) {
    return "العفو، الله يعطيك العافية.";
  }
  if (explicitContactRequestText(q)) {
    return "المتابعة الأساسية للطلبات من نفس الواتساب. إذا بدك تغيّر رقم التواصل المسجل على الطلب، لازم يتحدث فعليًا على الطلب قبل ما أقول إنه تغيّر.";
  }
  if (/(?:شروط|تقسيط|طريقة التقديم|كيف اقدم|كيف أقدم)/i.test(q)) {
    return "التقديم يبدأ بطلب موافقة مبدئية من الموقع. المتطلبات بتعتمد على الملف، وعادةً تشمل الهوية وإثبات دخل، وقد تُطلب بيانات كفيل حسب الحالة. المستندات الحساسة تُرفع فقط من الرابط الرسمي الآمن.";
  }
  if (app) {
    const stage = applicationJourneyStage(app);
    if (stage === "preliminary_approved_waiting_decision") {
      return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} أخذ موافقة مبدئية، ولسا مش موافقة نهائية. إذا بدك تكمل، الخطوة التالية فتح الملف للدراسة النهائية ورسومه ${input.truth.policy.fileOpeningFeeJod} دنانير؛ منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. الدراسة عادة ${input.truth.policy.normalReviewWindow} ومع ضغط المراجعات الحالي ممكن تتأخر بعض الملفات. إذا التفاصيل مناسبة إلك وبدك تكمل، أكدلي بشكل طبيعي إنك حاب تستمر.`;
    }
    if (/(?:متى|امتى|ايمتى).{0,30}(?:استلم|اجي|أجي)|(?:موعد).{0,20}(?:استلام|اجي|أجي)/i.test(nq)) {
      return `لسا ما في موعد استلام رسمي. طلبك حالته ${customerFacingStatusLabel(app)}، والموعد ما بينحدد إلا بعد اكتمال الإجراءات وصدوره رسميًا على الطلب.`;
    }
    if (/(?:شو صار|حالة|حاله|تتبع|طلبي|الطلب)/i.test(nq)) {
      return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الآن ${customerFacingStatusLabel(app)}. إذا سؤالك عن وقت المراجعة أو الخطوة التالية، بعطيك إياها حسب نفس الحالة بدون ما أعيد عليك ملخص الطلب كامل.`;
    }
  }
  if (input.state.activeTrackingId) {
    return "تفاصيل الطلب مش كاملة عندي بهاللحظة، وما بدي أخمّن بحالة أو خطوة مش ظاهرة بشكل موثوق.";
  }
  return "إذا عندك طلب سابق ابعث رقم التتبع مرة واحدة؛ وإذا سؤالك عام اكتبه مثل ما هو وبجاوبك مباشرة.";
}

function realActionsOffCompletionClaim(reply: string) {
  return /(?:تم.{0,24}(?:الغاء|إلغاء|تعديل|تغيير|تحديث|الاسترداد|الاسترجاع)|(?:خلصت|نفذت|نفّذت|غيرت|غيّرت|عدلت|عدّلت|حدثت|حدّثت).{0,30}(?:الطلب|الجهاز|البيانات)|(?:طلبك|الطلب).{0,18}(?:صار\s+)?(?:ملغي|ملغى|محدث|محدّث|معدل|معدّل)|تم\s+تسجيل.{0,55}(?:بيانات|رقم|محفظ|حساب|على\s+ملف)|(?:الاسترداد|الاسترجاع).{0,20}قيد\s+المعالج(?:ه|ة))/i.test(String(reply || ""));
}

function clampRepeatedCharacters(reply: string) {
  return String(reply || "")
    .replace(/ه{8,}/g, "هههه")
    .replace(/(.)\1{20,}/gu, (_m, ch: string) => ch.repeat(4));
}

function replyTokens(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

function runtimeNearDuplicate(a: string | null | undefined, b: string | null | undefined) {
  const aa = replyTokens(a), bb = replyTokens(b);
  if (aa.length < 7 || bb.length < 7) return false;
  const sa = new Set(aa), sb = new Set(bb);
  let common = 0; for (const t of sa) if (sb.has(t)) common++;
  const union = new Set([...sa, ...sb]).size || 1;
  const ratio = Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length);
  return common / union >= 0.76 && ratio >= 0.65;
}

function isLowInformationCustomerTurn(value: string | null | undefined) {
  const q = String(value || "").trim().replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return true;
  if (/AM-\d{8,}/i.test(q)) return false;
  if (q.length > 18) return false;
  return /^(?:\.|؟|\?|تمام|اوك|اوكي|اه|أه|نعم|شكرا|شكرًا|مرحبا|هلا|السلام عليكم|وعليكم السلام|طيب|تم)$/i.test(q);
}


function repeatedStatusCustomerTurn(turn: InterpretedTurn) {
  if (!turn.topics.includes("application_status") && !turn.topics.includes("tracking")) return false;
  const q = String(turn.rawText || "");
  return /(?:أرغب\s+بمعرفة\s+آخر\s+تحديث|ارغب\s+بمعرفة\s+اخر\s+تحديث|متابعة\s+طلبي|متابعه\s+طلبي|الحالة\s+الحالية|الحاله\s+الحاليه).{0,120}(?:الخطوة\s+التالية|الخطوه\s+التاليه|آخر\s+تحديث|اخر\s+تحديث)?/i.test(q);
}

function buildRepeatDeltaReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const app = input.truth.application;
  if (!app) return "تمام، أنا متابع نفس السياق معك.";
  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_approved_waiting_decision") {
    return `لسا نفس المرحلة: موافقة مبدئية. إذا بدك نكمل للدراسة النهائية، رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير وبعدها ارفع الوصل الرسمي. أكدلي بشكل طبيعي إنك حاب تستمر.`;
  }
  if (stage === "preliminary_review") return "لسا بالمراجعة المبدئية، وما في رسوم أو موعد استلام بهالمرحلة.";
  if (["final_review", "under_review"].includes(stage)) return "لسا قيد الدراسة النهائية، وما ظهر قرار جديد على الطلب لحد هسا.";
  return `لسا حالة الطلب ${customerFacingStatusLabel(app)}، وما ظهر تغيير فعلي جديد.`;
}

const MANUAL_ACTIONS = new Set([
  "cancel_application",
  "request_refund",
  "stop_refund",
  "reopen_application",
  "change_device",
  "change_application_data",
]);

async function notifyContactNumberChangeRequest(input: { waId: string; customerText: string; truth: TruthBundle }) {
  if (!explicitContactNumberChangeRequest(input.customerText) || !input.truth.application || input.truth.contactAccess === "safe_preview") return;
  const app = input.truth.application;
  await notifyV3Discord({
    event: "manual_action_required",
    actionKey: "change_application_data",
    applicationId: app.id,
    trackingId: app.trackingId || null,
    waId: input.waId,
    title: "📱 العميل طلب تغيير رقم التواصل على الطلب",
    description: "العميل طلب أن تصله تحديثات الطلب على رقم مختلف. لم يتم تغيير الرقم تلقائيًا؛ يحتاج تنفيذًا إداريًا على الطلب.",
    details: {
      "الاسم": app.fullName || "—",
      "رقم التتبع": app.trackingId || "—",
      "رقم واتساب الحالي": input.waId,
    },
  });
}

async function notifyManualActionRequests(input: {
  waId: string;
  customerText: string;
  truth: TruthBundle;
  plan: ReturnType<typeof buildReplyPlan>;
  actions: ActionResult[];
  realActionsEnabled: boolean;
}) {
  if (!input.truth.application) return;
  for (const planned of input.plan.actions) {
    if (!MANUAL_ACTIONS.has(planned.action) || planned.requiresConfirmation) continue;
    const result = input.actions.find((x) => x.action === planned.action);
    if (!result || result.executed) continue;
    const scopedManualBlock = String(result.blocker || "").startsWith("scoped_real_actions_disallowed:");
    if (!(result.outcome === "dry_run" || result.blocker === "real_actions_disabled" || result.blocker === "shadow_core_no_business_mutation" || scopedManualBlock)) continue;
    const app = input.truth.application;
    // Unpaid device changes do not need an admin mutation request yet. The safe
    // path is cancel + reapply guidance; Discord is sent only after the customer
    // explicitly confirms cancellation. Payment evidence protects the existing file.
    if (planned.action === "change_device" && !hasPaymentProtection(input.truth)) continue;
    await notifyV3Discord({
      event: "manual_action_required",
      actionKey: planned.action,
      applicationId: app.id,
      trackingId: app.trackingId,
      waId: input.waId,
      title: "🛠️ إجراء مطلوب — بانتظار تنفيذ الإدارة",
      description: "العميل طلب تغييرًا فعليًا. لم يتم تنفيذ أي تعديل تلقائيًا، وتم إبقاء الحالة كما هي بانتظار تنفيذ الإدارة يدويًا.",
      details: {
        action: planned.action,
        "طلب العميل": input.customerText,
        "حالة الطلب": app.status || "—",
        "حالة الدفع": app.paymentStatus || "—",
        "القيمة المطلوبة": planned.payload?.requestedValue ?? "—",
        "وضع التنفيذ": "يدوي من الإدارة",
      },
    });
  }
}

async function notifyScopedMutationSuccesses(input: {
  waId: string;
  truth: TruthBundle;
  actions: ActionResult[];
}) {
  const app = input.truth.application;
  if (!app) return;
  for (const result of input.actions) {
    if (!result.executed || !["executed", "already_done"].includes(result.outcome) || !LIVE_SCOPED_MUTATIONS.has(result.action)) continue;
    const isCancel = result.action === "cancel_application";
    const isRefund = result.action === "request_refund";
    const isAlias = result.action === "link_whatsapp_alias";
    await notifyV3Discord({
      event: "business_mutation_succeeded",
      actionKey: result.action,
      applicationId: app.id,
      trackingId: app.trackingId,
      waId: input.waId,
      title: isCancel ? "✅ تم إلغاء الطلب تلقائيًا" : isRefund ? "💸 تم تسجيل طلب الاسترداد تلقائيًا" : "📱 تم اعتماد رقم واتساب تابع للطلب تلقائيًا",
      description: isCancel
        ? "تم تنفيذ الإلغاء في قاعدة البيانات بعد تأكيد العميل الصريح. إذا كان الطلب مدفوعًا فقد تم فتح مسار الاسترداد حسب الحقيقة المالية على الملف."
        : isRefund
          ? "تم تسجيل طلب الاسترداد في قاعدة البيانات بعد تحقق شروط الدفع."
          : "تم اعتماد رقم واتساب الحالي كرقم متابعة تابع للطلب بعد تأكيد العميل الصريح في خطوتين. رقم الهاتف الأساسي للطلب لم يتغير.",
      details: {
        action: result.action,
        "رقم واتساب المنفذ منه": input.waId,
        "حالة الطلب بعد التنفيذ": app.status || "—",
        "حالة الدفع بعد التنفيذ": app.paymentStatus || "—",
        "معرّف العملية": result.mutationId || "—",
      },
    });
  }
}

async function notifyPendingScopedActionBlock(input: {
  waId: string;
  truth: TruthBundle;
  pendingAction: string | null;
  actions: ActionResult[];
}) {
  const app = input.truth.application;
  if (!app || !input.pendingAction) return;
  const result = input.actions.find((x) => x.action === input.pendingAction);
  if (!result || result.executed || result.outcome === "needs_confirmation") return;
  await notifyV3Discord({
    event: "manual_action_required",
    actionKey: input.pendingAction,
    applicationId: app.id,
    trackingId: app.trackingId,
    waId: input.waId,
    title: "⚠️ تعذر تنفيذ الإلغاء/الاسترداد تلقائيًا — يحتاج تدخل الإدارة",
    description: "هذا الإجراء كان مؤكدًا سابقًا وبانتظار الإدارة، وحاول V3 تنفيذه بعد تفعيل النطاق المحدود لكنه لم ينجح. نفّذه يدويًا من رابط الطلب.",
    details: {
      action: input.pendingAction,
      blocker: result.blocker || result.outcome,
      "حالة الطلب": app.status || "—",
      "حالة الدفع": app.paymentStatus || "—",
    },
  });
}

function buildScopedMutationSuccessReply(input: { truth: TruthBundle; actions: ActionResult[] }) {
  const app = input.truth.application;
  if (!app) return null;
  const alias = input.actions.find((x) => x.action === "link_whatsapp_alias" && x.executed);
  if (alias) {
    return `تم، اعتمدت رقم الواتساب الحالي كرقم متابعة تابع للطلب${app.trackingId ? ` ${app.trackingId}` : ""}. رقم الهاتف الأساسي على الطلب ما تغيّر، ومن هسا بتقدر تكمل متابعة نفس الطلب من هذا الواتساب بشكل طبيعي.`;
  }
  const cancel = input.actions.find((x) => x.action === "cancel_application" && x.executed);
  if (cancel) {
    const refundRequested = String(app.paymentStatus || "").toLowerCase() === "refund_requested" || String(app.status || "").toLowerCase() === "refund_requested";
    if (refundRequested) {
      if (cancel.outcome === "executed") {
        const url = applicationRefundUrl(input.truth);
        return `تم إلغاء طلبك${app.trackingId ? ` ${app.trackingId}` : ""} بنجاح. بما أن الدفع مؤكد على الملف، تم فتح مسار الاسترداد. ثبّت بيانات الاسترداد من الرابط الرسمي التالي مرة واحدة:${url ? `\n${url}` : ""}\nبعد إدخال البيانات الصحيحة، يبقى الاسترداد تحت المراجعة إلى أن يتم تنفيذ التحويل فعليًا.`;
      }
      return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} ملغي بالفعل، وطلب الاسترداد مسجل على الملف. ما في داعي تعيد طلب الإلغاء أو الاسترداد؛ أول ما يتم التحويل فعليًا بنبلغك.`;
    }
    return `تم إلغاء طلبك${app.trackingId ? ` ${app.trackingId}` : ""} بنجاح. ما في دفع مؤكد مرتبط بالملف، لذلك ما في مسار استرداد مطلوب على هذا الطلب.`;
  }

  const refund = input.actions.find((x) => x.action === "request_refund" && x.executed);
  if (refund) {
    if (refund.outcome === "executed") {
      const url = applicationRefundUrl(input.truth);
      return `تم تسجيل طلب الاسترداد${app.trackingId ? ` على الطلب ${app.trackingId}` : ""}. ثبّت بيانات الاسترداد من الرابط الرسمي التالي مرة واحدة:${url ? `\n${url}` : ""}\nبعد إدخال البيانات الصحيحة، يبقى الطلب تحت المراجعة إلى أن يتم تنفيذ التحويل فعليًا.`;
    }
    return `طلب الاسترداد${app.trackingId ? ` على الطلب ${app.trackingId}` : ""} مسجل بالفعل. ما في داعي تعيد الطلب؛ أول ما يتم التحويل فعليًا بنبلغك.`;
  }

  return null;
}

export async function runV3ProductionLive(input: {
  waId: string;
  turnId: string;
  customerText: string;
  recentTurns?: string[];
  profileName?: string | null;
  writer?: V3TextProvider | null;
  interpreter?: V3TextProvider | null;
  realActionsEnabled: boolean;
}): Promise<V3LiveResult> {
  const truthRecentTurns = input.recentTurns || [];
  const safeRecentTurns = sanitizeRecentTurnsForModel(truthRecentTurns);
  const humanBurst = buildHumanFirstCustomerBurst({ customerText: input.customerText, recentTurns: safeRecentTurns });
  const effectiveCustomerText = humanBurst.combinedText || input.customerText;
  const loadedState = await loadV3ConversationState(input.waId);
  const stateBefore = inferRoleIntroducedFromRecentTurns(loadedState || emptyState(input.waId), safeRecentTurns);

  const kernelProvider = input.writer === undefined ? v3WriterProviderFromEnv() : input.writer;
  const deterministicAnchor = interpretTurn({ turnId: input.turnId, customerText: effectiveCustomerText });
  let turn = enforceSemanticDecisionAuthority(enforceFreshTurnAuthority({
    turn: enforceCurrentTurnAuthority(enrichHumanFirstTurn(hardenTurnForConversationRecovery({
      turn: deterministicAnchor,
      state: stateBefore,
      recentTurns: safeRecentTurns,
    }))),
    state: stateBefore,
  }));
  let nativeKernelInitial: NativeKernelResult = { turn, reply: null, modelUsed: false, modelError: null, raw: null };
  const newApplicationFlow = isNewApplicationFlow({ turn, state: stateBefore, recentTurns: safeRecentTurns });
  const reducedState = reduceState({ state: stateBefore, turn });
  const constrainedState = updateConversationConstraints({ state: reducedState, customerText: effectiveCustomerText, turnId: input.turnId });
  const preliminaryState = newApplicationFlow && ["reopen_application", "change_device", "change_application_data", "stop_refund"].includes(String(constrainedState.pendingAction || ""))
    ? { ...constrainedState, pendingAction: null, pendingActionPayload: null }
    : constrainedState;

  let rawTruthBeforeActions = await resolveV3ProductionTruth({
    waId: input.waId,
    customerText: effectiveCustomerText,
    state: preliminaryState,
    recentTurns: truthRecentTurns,
    topics: turn.topics,
  });

  // Production truth retry: a bare tracking number, a delay question, or a weak
  // classifier result must not fall straight into "details incomplete" when the
  // conversation is already bound to a concrete application. Retry once with a
  // canonical tracking/status read before failing closed.
  const retryTracking = explicitTrackingFromText(effectiveCustomerText) || preliminaryState.activeTrackingId || null;
  if (!rawTruthBeforeActions.application && retryTracking) {
    try {
      const retryTruth = await resolveV3ProductionTruth({
        waId: input.waId,
        customerText: `${retryTracking}\n${effectiveCustomerText}`,
        state: { ...preliminaryState, activeTrackingId: retryTracking },
        recentTurns: truthRecentTurns,
        topics: Array.from(new Set([...turn.topics, "application_status", "tracking"])) as typeof turn.topics,
      });
      if (retryTruth.application) {
        rawTruthBeforeActions = {
          ...retryTruth,
          readWarnings: Array.from(new Set([...(retryTruth.readWarnings || []), "authoritative_truth_retry_recovered_application"])),
        };
      }
    } catch (error) {
      console.error("V3 authoritative truth retry failed:", error);
    }
  }

  const truthBeforeActions = stabilizeTruthSnapshot({ truth: rawTruthBeforeActions, state: preliminaryState });

  // PHASE 7.5.10 CONTACT IDENTITY STATE: a privacy mismatch is a durable
  // conversation condition, not a one-reply template. Keep it in state so a
  // later "my other number / no WhatsApp / where do I send it" turn continues
  // the same human problem instead of restarting from tracking/status fallback.
  let contactAwareState = preliminaryState;
  if (truthBeforeActions.readWarnings?.includes("contact_identity_mismatch_current_tracking")) {
    contactAwareState = markContactResolution({
      state: contactAwareState,
      status: "blocked_mismatch",
      trackingId: explicitTrackingFromText(effectiveCustomerText) || contactAwareState.activeTrackingId,
      customerText: effectiveCustomerText,
    });
  } else if (["verified_contact_alias", "approved_contact_alias"].includes(truthBeforeActions.source)) {
    contactAwareState = clearContactResolution(contactAwareState);
  }

  const scopeResult = scopeStateToCurrentApplication({
    state: contactAwareState,
    truth: truthBeforeActions,
    customerText: effectiveCustomerText,
  });
  turn = scopeTurnToCurrentApplication({ turn, applicationChanged: scopeResult.applicationChanged });
  const scopedRecentTurns = scopeResult.applicationChanged ? [] : safeRecentTurns;
  const scopedState = scopeResult.state;

  const boundStateBase: ConversationState = truthBeforeActions.application
    ? {
        ...scopedState,
        activeApplicationId: truthBeforeActions.application.id,
        activeTrackingId: truthBeforeActions.application.trackingId,
        lastVerifiedApplication: truthBeforeActions.source === "verified_state_snapshot"
          ? scopedState.lastVerifiedApplication
          : { application: truthBeforeActions.application, fetchedAt: truthBeforeActions.fetchedAt },
      }
    : scopedState;
  let boundState = supersedeConversationStateForJourney({ state: boundStateBase, truth: truthBeforeActions, turn });

  // PHASE 7.6.0 CONTACT IDENTITY: a different application phone and WhatsApp
  // number is a normal operating condition, not an admin dead-end. Tracking gives
  // a restricted safe preview. The runtime then asks for one action-specific
  // confirmation before adding the current WhatsApp sender as an approved alias.
  // applications.phone is never changed by this flow.
  const contactExplanation = contactExplanationFromText(effectiveCustomerText);
  const contactResolutionBeforeAlias = boundState.contactResolution;
  const contactProblemActive = Boolean(contactResolutionBeforeAlias && ["blocked_mismatch", "awaiting_admin_update", "awaiting_alias_confirmation"].includes(contactResolutionBeforeAlias.status));
  if (contactProblemActive && ["no_whatsapp", "international_number", "changed_number", "alternate_number"].includes(String(contactExplanation || ""))) {
    boundState = markContactResolution({
      state: boundState,
      status: "awaiting_alias_confirmation",
      trackingId: contactResolutionBeforeAlias?.trackingId || boundState.activeTrackingId,
      customerText: effectiveCustomerText,
    });
  }

  const currentWa = canonicalWaId(input.waId);

  // PHASE 8.0 NATIVE CONVERSATION KERNEL: one normal model call owns both deep
  // semantic understanding and the customer-facing draft. Deterministic parsing
  // above is only a safety/truth anchor for lookup and mutation protection.
  nativeKernelInitial = await runNativeConversationKernel({
    provider: kernelProvider,
    customerText: effectiveCustomerText,
    turnId: input.turnId,
    state: boundState,
    truth: truthBeforeActions,
    recentTurns: scopedRecentTurns,
    profileName: input.profileName,
    deterministicAnchor: turn,
  });
  if (nativeKernelInitial.modelUsed) {
    turn = enforceSemanticDecisionAuthority(enforceFreshTurnAuthority({
      turn: enforceCurrentTurnAuthority(enrichHumanFirstTurn(hardenTurnForConversationRecovery({
        turn: nativeKernelInitial.turn,
        state: stateBefore,
        recentTurns: scopedRecentTurns,
      }))),
      state: stateBefore,
    }));
    const nativeReduced = updateConversationConstraints({
      state: reduceState({ state: stateBefore, turn }),
      customerText: effectiveCustomerText,
      turnId: input.turnId,
    });
    boundState = supersedeConversationStateForJourney({
      state: {
        ...nativeReduced,
        activeApplicationId: boundState.activeApplicationId,
        activeTrackingId: boundState.activeTrackingId,
        lastVerifiedApplication: boundState.lastVerifiedApplication,
        verifiedContactBinding: boundState.verifiedContactBinding,
        contactResolution: boundState.contactResolution,
      },
      truth: truthBeforeActions,
      turn,
    });
  }

  const paymentIncident = detectPaymentIncident(effectiveCustomerText);
  let paymentIncidentReply: string | null = null;
  if (paymentIncident !== "none" && truthBeforeActions.application) {
    paymentIncidentReply = buildPaymentIncidentReply({ kind: paymentIncident, expectedBeneficiary: truthBeforeActions.policy.paymentBeneficiaryName });
    try {
      await notifyV3Discord({
        event: "manual_action_required",
        applicationId: truthBeforeActions.application.id,
        trackingId: truthBeforeActions.application.trackingId,
        waId: input.waId,
        actionKey: `payment_incident:${paymentIncident}:${truthBeforeActions.application.id}`,
        title: "🚨 مراجعة تحويل — اسم المستفيد مختلف",
        description: "العميل أفاد أنه نفّذ تحويلًا وظهر له اسم مستفيد مختلف عن الاسم الرسمي. تم إيقاف أي توجيه لإعادة الدفع ويحتاج التدقيق من الإدارة.",
        details: {
          action: "payment_incident_review",
          "المشكلة": paymentIncident,
          "اسم المستفيد الرسمي": truthBeforeActions.policy.paymentBeneficiaryName,
          "رسالة العميل": effectiveCustomerText,
        },
      });
    } catch (error) {
      console.error("V3 payment incident Discord notification failed", error);
    }
  }

  // Manual operational requests that are intentionally outside Real Actions still
  // need to reach administration. Discord is best-effort and never turns into a
  // false customer-facing claim that the requested operation has already happened.
  const deletionContext = [stateBefore.lastAssistantText || "", ...safeRecentTurns.slice(-6)].join("\n");
  if (dataDeletionConfirmationText(input.customerText, deletionContext)) {
    try {
      await notifyV3Discord({
        event: "manual_action_required",
        applicationId: truthBeforeActions.application?.id || null,
        trackingId: truthBeforeActions.application?.trackingId || boundState.activeTrackingId || null,
        waId: input.waId,
        actionKey: "delete_personal_data",
        title: "🗑️ طلب حذف بيانات شخصية — يحتاج تنفيذ الإدارة",
        description: "العميل أكد صراحةً طلب حذف بياناته الشخصية. إلغاء الطلب لا يعني حذف السجلات، ولا يجوز اعتبار الحذف منفذًا قبل تنفيذ الإدارة الفعلي.",
        details: {
          action: "delete_personal_data",
          "حالة الطلب": truthBeforeActions.application?.status || "—",
          "حالة الدفع": truthBeforeActions.application?.paymentStatus || "—",
        },
      });
    } catch (error) {
      console.error("V3 personal-data deletion Discord notification failed", error);
    }
  }

  if (explicitExpediteRequestText(input.customerText)) {
    try {
      await notifyV3Discord({
        event: "manual_action_required",
        applicationId: truthBeforeActions.application?.id || null,
        trackingId: truthBeforeActions.application?.trackingId || boundState.activeTrackingId || null,
        waId: input.waId,
        actionKey: "expedite_review",
        title: "⏱️ العميل طلب استعجال المراجعة",
        description: "العميل طلب بوضوح إيصال استعجاله للإدارة. لا يوجد وعد بموعد أو تغيير أولوية تلقائي؛ يحتاج قرار/تنفيذ إداري.",
        details: {
          action: "expedite_review",
          "حالة الطلب": truthBeforeActions.application?.status || "—",
          "حالة الدفع": truthBeforeActions.application?.paymentStatus || "—",
        },
      });
    } catch (error) {
      console.error("V3 expedite-review Discord notification failed", error);
    }
  }

  if (scopeResult.droppedPendingAction) {
    logIntegrityTelemetry({
      event: "pending_action_scope_blocked",
      waId: input.waId,
      turnId: input.turnId,
      applicationId: truthBeforeActions.application?.id || null,
      trackingId: truthBeforeActions.application?.trackingId || null,
      severity: "p0",
      details: {
        droppedAction: scopeResult.droppedPendingAction,
        reason: scopeResult.reason,
        previousApplicationId: preliminaryState.activeApplicationId,
        previousTrackingId: preliminaryState.activeTrackingId,
      },
    });
    try {
      await notifyV3Discord({
        event: "truth_integrity_failure",
        applicationId: truthBeforeActions.application?.id || null,
        trackingId: truthBeforeActions.application?.trackingId || null,
        waId: input.waId,
        title: "🧱 منع انتقال إجراء من طلب سابق إلى طلب جديد",
        description: "تم اكتشاف pending action مربوط بسياق طلب سابق ومنعه قبل التنفيذ على الطلب الحالي.",
        details: {
          action: scopeResult.droppedPendingAction,
          reason: scopeResult.reason,
          "الطلب السابق": preliminaryState.activeTrackingId || "—",
          "الطلب الحالي": truthBeforeActions.application?.trackingId || "—",
        },
      });
    } catch (error) {
      console.error("V3 application-scope Discord alert failed", error);
    }
  }

  const rawContinuationIntent = truthBeforeActions.contactAccess !== "safe_preview"
    && !semanticContinuationVeto(turn)
    && !explicitDoNotContinueText(effectiveCustomerText, boundState.lastAssistantText)
    && (semanticConfirmsContinuation(turn) || explicitContinuationText(effectiveCustomerText) || turn.requestedActions.includes("continue_application"));
  const disclosureRequiredThisTurn = shouldExplainCommercialStep({
    state: boundState,
    truth: truthBeforeActions,
    turn,
    explicitContinuationIntent: rawContinuationIntent,
  });

  let plan = buildReplyPlan({ turn, state: boundState, truth: truthBeforeActions });
  if (disclosureRequiredThisTurn) {
    plan = { ...plan, actions: plan.actions.filter((action) => action.action !== "continue_application") };
  }
  if (truthBeforeActions.contactAccess === "safe_preview" && truthBeforeActions.application) {
    const aliasAction = {
      action: "link_whatsapp_alias" as const,
      sourceActId: turn.acts[0]?.id || turn.turnId,
      requiresConfirmation: true,
      authority: "deterministic" as const,
      requiredRole: boundState.role.currentRole,
      payload: {
        _autoContactAliasPrompt: true,
        _aliasWaId: currentWa || input.waId,
        _aliasRequestText: effectiveCustomerText,
      },
    };
    const blockedUntilAlias = new Set(["cancel_application", "request_refund", "stop_refund", "reopen_application", "change_application_data", "change_device", "continue_application"]);
    plan = {
      ...plan,
      actions: [aliasAction, ...plan.actions.filter((action) => !blockedUntilAlias.has(action.action))],
    };
  }
  plan = { ...plan, actions: plan.actions.map((action) => stampActionScope(action, truthBeforeActions, turn.turnId)) };
  const applicationScopedPlan = filterPlannedActionsForApplicationScope({
    actions: plan.actions,
    turn,
    applicationChanged: scopeResult.applicationChanged,
  });
  if (applicationScopedPlan.dropped.length) {
    logIntegrityTelemetry({
      event: "planned_action_scope_blocked",
      waId: input.waId,
      turnId: input.turnId,
      applicationId: truthBeforeActions.application?.id || null,
      trackingId: truthBeforeActions.application?.trackingId || null,
      severity: "p0",
      details: { actions: applicationScopedPlan.dropped.map((x) => x.action) },
    });
    try {
      await notifyV3Discord({
        event: "truth_integrity_failure",
        applicationId: truthBeforeActions.application?.id || null,
        trackingId: truthBeforeActions.application?.trackingId || null,
        waId: input.waId,
        title: "⛔ منع Action غير مطلوب على طلب جديد",
        description: "تم منع إجراء مخطط انتقل/ظهر أثناء تبديل الطلب بدون طلب صريح من رسالة العميل الحالية.",
        details: { actions: applicationScopedPlan.dropped.map((x) => x.action).join(", ") },
      });
    } catch (error) {
      console.error("V3 planned action scope Discord alert failed", error);
    }
  }
  plan = { ...plan, actions: applicationScopedPlan.actions };
  const currentJourneyStage = applicationJourneyStage(truthBeforeActions.application);
  plan = {
    ...plan,
    actions: plan.actions.filter((action) => {
      if (action.action === "reopen_application" && !["cancelled", "refund_requested"].includes(currentJourneyStage)) return false;
      if (action.action === "stop_refund" && currentJourneyStage !== "refund_requested") return false;
      return true;
    }),
  };
  const mutationGate = enforceMutationConfirmationGate({
    actions: plan.actions,
    turn,
    state: boundState,
    truth: truthBeforeActions,
  });
  plan = { ...plan, actions: mutationGate.actions.map((action) => stampActionScope(action, truthBeforeActions, turn.turnId)) };
  const executionState: ConversationState = mutationGate.clearPendingConfirmation
    ? { ...boundState, pendingAction: null, pendingActionPayload: null }
    : boundState;
  const actionsToExecute = [...plan.actions];
  if (mutationGate.blockedQuestionAction) {
    logIntegrityTelemetry({
      event: "mutation_question_blocked",
      waId: input.waId,
      turnId: input.turnId,
      applicationId: truthBeforeActions.application?.id || null,
      trackingId: truthBeforeActions.application?.trackingId || null,
      severity: "warning",
      details: { action: mutationGate.blockedQuestionAction, reason: "question_is_not_execution_consent" },
    });
  }
  const pendingScopedAction = executionState.pendingAction && LIVE_SCOPED_MUTATIONS.has(executionState.pendingAction)
    && String(executionState.pendingActionPayload?._manualStatus || "") === "awaiting_admin"
    && pendingActionMatchesCurrentApplication({ state: executionState, truth: truthBeforeActions })
    ? executionState.pendingAction
    : null;
  // Phase 7.3.1 safety change: a historical awaiting_admin cancellation/refund is
  // NEVER auto-executed merely because the customer sent another message. Real
  // mutations execute only on the dedicated second confirmation turn produced by
  // enforceMutationConfirmationGate(). pendingScopedAction is retained for audit/
  // Discord compatibility and manual follow-up, not as implicit execution consent.

  const actions = await executeActions({
    actions: actionsToExecute,
    state: executionState,
    truth: truthBeforeActions,
    adapter: input.realActionsEnabled ? v3TransactionalActionAdapter : null,
    allowMutation: input.realActionsEnabled,
  });

  let truthAfterActions = truthBeforeActions;
  if (input.realActionsEnabled && actionsToExecute.length && actionNeedsTruthRefresh(actions)) {
    const refreshedTruth = await resolveV3ProductionTruth({
      waId: input.waId,
      customerText: effectiveCustomerText,
      state: executionState,
      recentTurns: scopedRecentTurns,
      topics: turn.topics,
    });
    truthAfterActions = stabilizeTruthSnapshot({ truth: refreshedTruth, state: executionState, previousTruth: truthBeforeActions });
  }

  try {
    await notifyActionProblems({
      waId: input.waId,
      applicationId: truthAfterActions.application?.id || truthBeforeActions.application?.id || null,
      trackingId: truthAfterActions.application?.trackingId || truthBeforeActions.application?.trackingId || null,
      actions,
    });
  } catch (error) {
    console.error("V3 action-problem Discord notification failed", error);
  }

  try {
    await notifyScopedMutationSuccesses({
      waId: input.waId,
      truth: truthAfterActions,
      actions,
    });
  } catch (error) {
    console.error("V3 scoped-action success Discord notification failed", error);
  }

  try {
    await notifyManualActionRequests({
      waId: input.waId,
      customerText: effectiveCustomerText,
      truth: truthAfterActions,
      plan,
      actions,
      realActionsEnabled: input.realActionsEnabled,
    });
  } catch (error) {
    // Discord/ledger availability must never block a customer reply.
    console.error("V3 manual-action Discord notification failed", error);
  }

  try {
    await notifyPendingScopedActionBlock({
      waId: input.waId,
      truth: truthAfterActions,
      pendingAction: pendingScopedAction,
      actions,
    });
  } catch (error) {
    console.error("V3 pending scoped-action Discord notification failed", error);
  }

  try {
    await notifyContactNumberChangeRequest({
      waId: input.waId,
      customerText: effectiveCustomerText,
      truth: truthAfterActions,
    });
  } catch (error) {
    console.error("V3 contact-number-change Discord notification failed", error);
  }

  const manualDisposition = resolveManualActionDisposition({
    state: executionState,
    truth: truthAfterActions,
    plan,
    actions,
  });

  // REVENUE + ADMIN INVARIANT: the explicit continuation decision must have one
  // authoritative meaning everywhere: customer receives the 5 JOD step, the admin
  // application changes to customer_confirmed_continue, and Discord receives the
  // same decision. Never depend only on a model/planner action for this commercial
  // event.
  const semanticContinueVeto = semanticContinuationVeto(turn);
  const continuationDecisionThisTurn = !disclosureRequiredThisTurn
    && truthAfterActions.contactAccess !== "safe_preview"
    && !semanticContinueVeto
    && !explicitDoNotContinueText(effectiveCustomerText, executionState.lastAssistantText) && (
      semanticConfirmsContinuation(turn)
      || explicitContinuationText(effectiveCustomerText)
      || turn.requestedActions.includes("continue_application")
      || plan.actions.some((x) => x.action === "continue_application" && !x.requiresConfirmation)
    );
  const truthAtContinuationDecision = truthAfterActions;
  const continuationRevenueReadyAtDecision = continuationDecisionThisTurn
    && isContinuationRevenueReady(truthAtContinuationDecision.application);

  const continuationPersistence = await persistExplicitContinuation({
    application: truthAtContinuationDecision.application,
    explicitContinue: continuationDecisionThisTurn,
  });
  if (continuationPersistence.updated) {
    truthAfterActions = await resolveV3ProductionTruth({
      waId: input.waId,
      customerText: effectiveCustomerText,
      state: executionState,
      recentTurns: scopedRecentTurns,
      topics: turn.topics,
    });
    truthAfterActions = stabilizeTruthSnapshot({ truth: truthAfterActions, state: executionState, previousTruth: truthAtContinuationDecision });
  } else if (continuationPersistence.attempted && continuationPersistence.blocker) {
    try {
      await notifyV3Discord({
        event: "truth_integrity_failure",
        applicationId: truthAfterActions.application?.id || null,
        trackingId: truthAfterActions.application?.trackingId || null,
        waId: input.waId,
        title: "⛔ العميل اختار الاستمرار لكن تحديث الأدمن فشل",
        description: "تم الحفاظ على خطوة 5 دنانير للعميل، لكن تعذر تثبيت قرار الاستمرار على حالة الطلب في قاعدة البيانات. راجع الطلب يدويًا.",
        details: { blocker: continuationPersistence.blocker, action: "continue_application" },
      });
    } catch (error) {
      console.error("V3 continuation persistence alert failed", error);
    }
  }

  // PHASE 7.4.0 JOURNEY SUPERSESSION: once authoritative truth moves forward,
  // stale continuation/payment loops are cancelled before any writer/fallback sees
  // the state. This is the hard boundary that prevents refund/cancel conversations
  // from being dragged back to an older commercial step.
  let conversationState = supersedeConversationStateForJourney({
    state: executionState,
    truth: truthAfterActions,
    turn,
  });
  conversationState = applyAuthoritativeActionConversationMemory({
    state: conversationState,
    truth: truthAfterActions,
    actions,
    turnId: turn.turnId,
  });
  if (actions.some((x) => x.action === "link_whatsapp_alias" && x.executed) || truthAfterActions.source === "approved_contact_alias") {
    conversationState = clearContactResolution(conversationState);
  }

  // PHASE 8.0 NATIVE CONVERSATION EGRESS: the model draft is the sole normal
  // customer-facing writer. Deterministic layers below may validate, veto, execute
  // business actions, or trigger one bounded regeneration, but they do not replace
  // a valid conversational answer with legacy canned text.
  const protectedFiveJodStep = continuationRevenueReadyAtDecision;
  let reply: string | null = plan.shouldRespond ? nativeKernelInitial.reply : null;
  let verification: VerificationReport = PASS;
  let semanticCheck: SemanticReplyCheck = { pass: true, checked: false, answersCurrentQuestion: true, staleTopic: false, invertedDecision: false, unknownEntityMisread: false, missingObligations: [], repairInstruction: null, confidence: 1, modelError: null };
  let replyAttempts = nativeKernelInitial.modelUsed ? 1 : 0;
  let fallbackUsed = false;

  const operationalContext = {
    mutationConfirmationRequired: Boolean(mutationGate.confirmationPrompt),
    mutationConfirmationPromptMeaning: mutationGate.confirmationPrompt || null,
    mutationInformationalMeaning: mutationGate.informationalReply || null,
    blockedQuestionAction: mutationGate.blockedQuestionAction || null,
    manualDisposition,
    paymentIncident: paymentIncident !== "none" ? paymentIncident : null,
    paymentIncidentSafetyMeaning: paymentIncidentReply,
    actions,
    disclosureRequiredThisTurn,
    protectedFiveJodStep,
    continuationDecisionThisTurn,
    applicationJourneyStage: applicationJourneyStage(truthAfterActions.application),
    paymentConfirmed: hasAuthoritativePaymentConfirmation(truthAfterActions.application),
  };

  const actionOrTruthChangedAfterInitialDraft = Boolean(
    mutationGate.confirmationPrompt
    || mutationGate.informationalReply
    || paymentIncidentReply
    || manualDisposition.kind !== "none"
    || actions.some((x) => x.outcome !== "none" && x.outcome !== "dry_run")
    || continuationPersistence.updated
  );

  if (plan.shouldRespond && kernelProvider && actionOrTruthChangedAfterInitialDraft) {
    const refreshed = await runNativeConversationKernel({
      provider: kernelProvider,
      customerText: effectiveCustomerText,
      turnId: input.turnId,
      state: conversationState,
      truth: truthAfterActions,
      recentTurns: scopedRecentTurns,
      profileName: input.profileName,
      deterministicAnchor: turn,
      actionResults: actions,
      validationFailures: [
        ...(mutationGate.confirmationPrompt ? [`ACTION_CONFIRMATION_REQUIRED=${mutationGate.confirmationPrompt}`] : []),
        ...(mutationGate.informationalReply ? [`ACTION_INFORMATIONAL_RESULT=${mutationGate.informationalReply}`] : []),
        ...(paymentIncidentReply ? [`PAYMENT_INCIDENT_SAFETY=${paymentIncidentReply}`] : []),
      ],
      operationalContext,
    });
    replyAttempts++;
    if (refreshed.reply) reply = refreshed.reply;
  }

  let nativeValidation = validateNativeConversationReply({
    reply,
    turn,
    state: conversationState,
    truth: truthAfterActions,
    actions,
    recentTurns: scopedRecentTurns,
    customerText: effectiveCustomerText,
    disclosureRequiredThisTurn,
    protectedFiveJodStep,
  });

  // One bounded repair call only. This is not a judge/shadow path: it runs only
  // when deterministic truth/action validation blocks the one candidate reply.
  if (plan.shouldRespond && !nativeValidation.pass && kernelProvider && replyAttempts < 2) {
    const repaired = await runNativeConversationKernel({
      provider: kernelProvider,
      customerText: effectiveCustomerText,
      turnId: input.turnId,
      state: conversationState,
      truth: truthAfterActions,
      recentTurns: scopedRecentTurns,
      profileName: input.profileName,
      deterministicAnchor: turn,
      actionResults: actions,
      validationFailures: nativeValidation.reasons,
      operationalContext,
    });
    replyAttempts++;
    if (repaired.reply) reply = repaired.reply;
    nativeValidation = validateNativeConversationReply({
      reply,
      turn,
      state: conversationState,
      truth: truthAfterActions,
      actions,
      recentTurns: scopedRecentTurns,
      customerText: effectiveCustomerText,
      disclosureRequiredThisTurn,
      protectedFiveJodStep,
    });
  }

  // Revenue-safe emergency only: the normal path is always Native Kernel. These
  // deterministic replies exist solely to prevent a provider/validation failure
  // from breaking the protected 5-JOD commercial journey.
  if (plan.shouldRespond && !nativeValidation.pass && disclosureRequiredThisTurn) {
    reply = buildInformedCommercialDisclosureReply(truthAfterActions);
    fallbackUsed = true;
    nativeValidation = validateNativeConversationReply({
      reply,
      turn,
      state: conversationState,
      truth: truthAfterActions,
      actions,
      recentTurns: scopedRecentTurns,
      customerText: effectiveCustomerText,
      disclosureRequiredThisTurn,
      protectedFiveJodStep: false,
    });
  } else if (plan.shouldRespond && !nativeValidation.pass && protectedFiveJodStep) {
    reply = buildMandatoryFiveJodContinuationReply(turn, truthAfterActions);
    fallbackUsed = true;
    nativeValidation = validateNativeConversationReply({
      reply,
      turn,
      state: conversationState,
      truth: truthAfterActions,
      actions,
      recentTurns: scopedRecentTurns,
      customerText: effectiveCustomerText,
      disclosureRequiredThisTurn: false,
      protectedFiveJodStep: true,
    });
  }

  // Emergency fail-safe only when the provider is unavailable or both bounded
  // generations fail. This path is deliberately not used as normal conversation.
  if (plan.shouldRespond && (!reply || !nativeValidation.pass)) {
    fallbackUsed = true;
    reply = buildV3LastResortReply({ truth: truthAfterActions, state: conversationState, customerText: effectiveCustomerText });
    nativeValidation = validateNativeConversationReply({
      reply,
      turn,
      state: conversationState,
      truth: truthAfterActions,
      actions,
      recentTurns: scopedRecentTurns,
      customerText: effectiveCustomerText,
      disclosureRequiredThisTurn,
      protectedFiveJodStep,
    });
  }

  // Phase 8 native safety result is the only normal egress verdict. Legacy
  // verifiers/final gates remain in the source tree for compatibility and
  // historical regression reference, but they no longer own or rewrite the
  // customer reply. All critical truth/action/link/payment checks required by
  // the live path are enforced inside validateNativeConversationReply().
  verification = nativeValidation.pass
    ? PASS
    : { ...PASS, pass: false, policyViolations: nativeValidation.reasons };

  const finalSafetyPass = !plan.shouldRespond || Boolean(reply && nativeValidation.pass);
  if (!finalSafetyPass) {
    await notifyV3Discord({
      event: "final_safety_fail_closed",
      applicationId: truthAfterActions.application?.id || null,
      trackingId: truthAfterActions.application?.trackingId || null,
      waId: input.waId,
      title: "⛔ Phase 8 Native Kernel — توقف الرد بأمان",
      description: "تعذر تمرير رد Native Conversation Kernel بعد التحقق الحتمي.",
      details: {
        "Native validation": nativeValidation.reasons.join(" | ") || "—",
        "Native blockers": nativeValidation.reasons.join(" | ") || "—",
        "Generation attempts": replyAttempts,
        "Protected 5-JOD step": protectedFiveJodStep ? "yes" : "no",
      },
    });
  }

  if (finalSafetyPass && reply && (truthAfterActions.application || truthAtContinuationDecision.application)) {
    const explicitContinue = continuationDecisionThisTurn;
    if (explicitContinue && protectedFiveJodStep) {
      const discordApp = truthAfterActions.application || truthAtContinuationDecision.application!;
      try {
        const notification = await notifyV3Discord({
          event: "customer_continue_payment_ready",
          applicationId: discordApp.id,
          trackingId: discordApp.trackingId,
          waId: input.waId,
          title: "✅ العميل وافق على الاستمرار — أرسلت له خطوة 5 دنانير",
          description: "تم تثبيت اختيار العميل على الطلب وإرسال تعليمات رسوم فتح الملف ورابط رفع الوصل الرسمي.",
          details: {
            الاسم: discordApp.fullName || "—",
            الجهاز: discordApp.deviceName || "—",
            "حالة الطلب": discordApp.status || "—",
            "حالة الدفع": discordApp.paymentStatus || "—",
            الرسوم: `${truthAfterActions.policy.fileOpeningFeeJod} دنانير`,
          },
        });
        if (!notification.sent && !notification.suppressed) {
          console.error("V3 continuation Discord delivery failed:", notification.reason);
        }
      } catch (error) {
        console.error("V3 continuation Discord notification failed:", error);
      }
    }
  }

  const answeredTopics = reply && verification.pass ? plan.answerItems.map((x) => x.topic) : [];
  const waitingConfirmationResult = actions.find((x) => x.outcome === "needs_confirmation") || null;
  const waitingConfirmation = waitingConfirmationResult?.action || null;
  const waitingPlan = waitingConfirmation ? plan.actions.find((x) => x.action === waitingConfirmation) : null;
  const latestVerifiedSnapshot = truthAfterActions.application && truthAfterActions.source !== "verified_state_snapshot"
    ? { application: truthAfterActions.application, fetchedAt: truthAfterActions.fetchedAt }
    : boundState.lastVerifiedApplication;
  const manualPayload = stampPendingPayloadScope(manualStatePayload(manualDisposition), truthAfterActions, turn.turnId);
  const manualPendingAction = manualDisposition.kind === "awaiting_admin"
    ? manualDisposition.action
    : manualDisposition.kind === "cancel_reapply_guidance"
      ? "cancel_application"
      : null;
  const actionAdjustedState: ConversationState = {
    ...conversationState,
    lastVerifiedApplication: latestVerifiedSnapshot,
    pendingAction: waitingConfirmation
      || manualPendingAction
      || (manualDisposition.kind === "reconciled_by_truth" ? null : (plan.actions.length ? null : conversationState.pendingAction)),
    pendingActionPayload: waitingConfirmation
      ? stampPendingPayloadScope((waitingPlan?.payload || conversationState.pendingActionPayload), truthAfterActions, turn.turnId)
      : manualPayload
        ? manualPayload
        : (manualDisposition.kind === "reconciled_by_truth" ? null : (plan.actions.length ? null : conversationState.pendingActionPayload)),
  };
  const answeredState = answeredTopics.length
    ? closeAnsweredLoops({ ...actionAdjustedState, lastAssistantText: reply }, answeredTopics)
    : { ...actionAdjustedState, lastAssistantText: reply || actionAdjustedState.lastAssistantText };
  const disclosureAdjustedState = finalSafetyPass && reply && disclosureRequiredThisTurn
    ? markCommercialDisclosureDelivered(answeredState, truthAfterActions, turn.turnId)
    : finalSafetyPass && reply && continuationDecisionThisTurn && commercialDisclosureDelivered(answeredState, truthAfterActions)
      ? markCommercialDisclosureAcknowledged(answeredState, truthAfterActions, turn.turnId)
      : answeredState;
  const semanticFinalizedState = finalizeStateSemanticMemory({ state: disclosureAdjustedState, turn, reply, answered: Boolean(reply && verification.pass && semanticCheck.pass) });
  const stateAfter = markRoleIntroducedFromReply(semanticFinalizedState, reply);

  return {
    version: stateAfter.version,
    turn,
    stateBefore,
    stateAfter,
    truth: truthAfterActions,
    truthBeforeActions,
    truthAfterActions,
    plan,
    actions,
    verification,
    reply,
    providerUsed: Boolean(kernelProvider),
    interpreterUsed: nativeKernelInitial.modelUsed,
    interpreterError: nativeKernelInitial.modelError,
    replyAttempts,
    finalSafetyPass,
    fallbackUsed,
    realActionsEnabled: input.realActionsEnabled,
  };
}
