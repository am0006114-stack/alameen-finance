import { normalizeArabic } from "./text";
import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { stopRefundKeepRequest } from "./unifiedConversationDecisionPlane";
import type { ActionKey, ConversationState, InterpretedTurn, PlannedAction, TruthBundle } from "./types";

const REAL_MUTATIONS = new Set<ActionKey>(["cancel_application", "request_refund", "link_whatsapp_alias"]);
const MANUAL_MUTATIONS = new Set<ActionKey>(["stop_refund", "reopen_application", "change_device", "change_application_data"]);

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cancelWords(q: string) {
  return /(?:الغاء|الغي|الغوا|الغيه|الغيه|يلغي|لغيت|تلغي|ملغي|ملغى)/.test(q);
}

function refundWords(q: string) {
  return /(?:استرداد|استرجاع|استرد|استرجع|رجعلي|رجعولي|يرجع|ترجع)/.test(q);
}

function aliasWords(q: string) {
  return /(?:اعتمد|اربط|ضيف|اضف|ثبت|سجل).{0,34}(?:الرقم|رقم|واتساب|واتس)|(?:الرقم|رقم|واتساب|واتس).{0,34}(?:اعتمد|اربط|ضيف|اضف|ثبت|سجل)/.test(q);
}

function actionWords(action: ActionKey, q: string) {
  if (action === "cancel_application") return cancelWords(q);
  if (action === "request_refund") return refundWords(q);
  if (action === "link_whatsapp_alias") return aliasWords(q);
  return false;
}

export function mutationQuestion(action: ActionKey, value: string | null | undefined) {
  const q = normalized(value);
  const hasAction = actionWords(action, q);
  if (!hasAction) return false;
  if (action === "link_whatsapp_alias") return /^(?:طيب\s+)?(?:بزبط|ممكن|هل|بقدر|اقدر|كيف)/.test(q) || /(?:ممكن|بقدر|هل).{0,32}(?:اعتمد|اربط|ضيف|اضف|ثبت|سجل)/.test(q);
  return /^(?:طيب\s+)?(?:بزبط|ممكن|هل|بقدر|اقدر|اقدرش|لو|اذا|كيف|شو\s+بصير|شو\s+يصير|وش\s+يصير|قديش|كم)/.test(q)
    || /(?:لو|اذا).{0,24}(?:الغ|استرد|استرجع)/.test(q)
    || /(?:بزبط|ممكن|بقدر|هل).{0,30}(?:الغ|استرد|استرجع)/.test(q)
    || /(?:شو\s+بصير|شو\s+يصير|كيف).{0,30}(?:الغاء|الاسترداد|الاسترجاع)/.test(q);
}

export function mutationDecline(action: ActionKey, value: string | null | undefined) {
  const q = normalized(value);
  if (action === "cancel_application") {
    return /(?:بديش|ما\s+بدي|لا\s+اريد|لا\s+ارغب).{0,24}(?:الغ|الغاء)|(?:بطلت|تراجعت).{0,18}(?:الغي|الغاء)|(?:الغاء).{0,12}(?:طلب\s+)?(?:الالغاء)|(?:سالتك|سألتك|بس\s+سوال|بس\s+سؤال).{0,28}(?:الغ|الغاء)|(?:ما\s+حكيتلك|ما\s+طلبت).{0,24}(?:تلغي|الغاء)|(?:كمل|اكمل|استمر).{0,28}(?:الطلب|الجهاز)/.test(q);
  }
  if (action === "request_refund") {
    return /(?:بديش|ما\s+بدي|لا\s+اريد|لا\s+ارغب).{0,24}(?:استرد|استرجع|الاسترداد)|(?:ما\s+طلبت).{0,24}(?:استرداد|استرجاع)/.test(q);
  }
  if (action === "link_whatsapp_alias") {
    return /(?:لا\s+تعتمد|لا\s+تربط|ما\s+بدي|بديش|لا\s+اريد|لا\s+ارغب).{0,30}(?:الرقم|واتساب|واتس|تربط|تعتمد)|(?:خليه|خليها).{0,20}(?:بدون\s+ربط|زي\s+ما\s+هو)/.test(q);
  }
  return false;
}

export function explicitMutationRequest(action: ActionKey, value: string | null | undefined) {
  const q = normalized(value);
  if (!q || mutationQuestion(action, q) || mutationDecline(action, q)) return false;
  if (action === "cancel_application") {
    return /(?:بدي|اريد|حاب|حابب).{0,18}(?:الغي|الغاء).{0,30}(?:الطلب|المعامله)?|^(?:الغي|الغوا|الغاء)\s*(?:الطلب|المعامله)?(?:\s+بشكل\s+صريح)?$|^(?:الغاء|إلغاء)\s+بشكل\s+صريح$|(?:الغاء|الغي).{0,16}(?:طلبي|الطلب)$/.test(q);
  }
  if (action === "request_refund") {
    return /(?:بدي|اريد|حاب|حابب).{0,20}(?:استرد|استرجع|استرداد|استرجاع)|(?:رجعلي|رجعولي).{0,20}(?:الرسوم|المبلغ|المصاري)|^(?:استرداد|استرجاع)$/.test(q);
  }
  if (action === "link_whatsapp_alias") {
    return aliasWords(q) && !/^(?:ممكن|هل|بقدر|اقدر|كيف)/.test(q);
  }
  return false;
}

function lastAssistantAskedForConfirmation(state: ConversationState, action: ActionKey) {
  const q = normalized(state.lastAssistantText);
  if (!/(?:اكدلي|اكد|تاكيد|للتاكيد|بدي\s+تاكيد|اكتب.{0,18}نعم|قبل\s+ما\s+انفذ|قبل\s+التنفيذ)/.test(q)) return false;
  return actionWords(action, q);
}

function bareAffirmative(value: string | null | undefined) {
  const q = normalized(value);
  return /^(?:نعم|اه|أه|ايوه|أيوه|اكيد|أكيد|موافق)$/.test(q);
}

function contextualAliasOpenLoopConfirmation(input: { value: string | null | undefined; state: ConversationState; truth: TruthBundle }) {
  if (!bareAffirmative(input.value)) return false;
  if (!input.truth.application) return false;
  const aliasLoopActive = input.state.pendingAction === "link_whatsapp_alias"
    || input.state.contactResolution?.status === "awaiting_alias_confirmation";
  if (!aliasLoopActive) return false;
  if (!lastAssistantAskedForConfirmation(input.state, "link_whatsapp_alias")) return false;
  const tracking = String(input.state.contactResolution?.trackingId || input.state.activeTrackingId || "").trim();
  if (tracking && tracking !== String(input.truth.application.trackingId || "").trim()) return false;
  return true;
}

export function explicitMutationConfirmation(input: { action: ActionKey; value: string | null | undefined; state: ConversationState }) {
  const q = normalized(input.value);
  if (!q || mutationQuestion(input.action, q) || mutationDecline(input.action, q)) return false;
  const actionMentioned = actionWords(input.action, q);
  const explicit = /(?:نعم|اه|ايوه|اكيد|اكد|موافق).{0,28}/.test(q) && actionMentioned;
  // Phase 7.6.0 P0: generic acknowledgements are never mutation consent. Production
  // proved that "تم" after a payment instruction could inherit a stale cancellation.
  // Every real mutation must be named on the confirmation turn itself: cancellation,
  // refund, or WhatsApp-alias linking (for example: "نعم اعتمد الرقم").
  return explicit;
}

function pendingScopeMatchesTruth(state: ConversationState, truth: TruthBundle) {
  if (!truth.application) return false;
  const payload = state.pendingActionPayload || {};
  const appId = String(payload._scopeApplicationId || "").trim();
  const trackingId = String(payload._scopeTrackingId || "").trim();
  const waId = String(payload._scopeWaId || "").trim();
  if (appId && appId !== truth.application.id) return false;
  if (trackingId && trackingId !== String(truth.application.trackingId || "")) return false;
  if (waId && waId !== String(state.waId || "").trim()) return false;
  return true;
}

function missingApplicationMutationReply(action: ActionKey, state: ConversationState) {
  const known = String(state.activeTrackingId || "").trim();
  const label = action === "cancel_application" ? "الإلغاء" : action === "request_refund" ? "الاسترداد" : "اعتماد رقم واتساب";
  if (known) return `طلب ${label} واضح، لكن تفاصيل الطلب ${known} مش محمّلة بشكل موثوق بهاللحظة. حفاظًا على طلبك ما رح أنفذ أو أعتبر الإجراء بدأ قبل ما أقرأ الطلب الصحيح فعليًا. جرّب متابعة الطلب من جديد أو ابعث رقم التتبع نفسه مرة واحدة إذا ظلّت المشكلة.`;
  const target = action === "cancel_application" ? "تلغيه" : action === "request_refund" ? "تسترد رسومه" : "تربط رقم واتسابك فيه";
  return `طلب ${label} واضح، لكن ما عندي طلب موثوق مربوط بالمحادثة هسا. حفاظًا على طلبك ما رح أنفذ الإجراء على تخمين؛ ابعث رقم التتبع للطلب اللي بدك ${target} مرة واحدة.`;
}

function payloadWithConfirmationScope(action: PlannedAction, truth: TruthBundle, turnId: string, waId: string) {
  return {
    ...(action.payload || {}),
    _mutationConfirmationRequired: true,
    _mutationAction: action.action,
    _scopeApplicationId: truth.application?.id || null,
    _scopeTrackingId: truth.application?.trackingId || null,
    _scopeTurnId: turnId,
    _scopeWaId: waId,
  };
}

function confirmationPrompt(action: ActionKey, truth: TruthBundle) {
  const tracking = truth.application?.trackingId ? ` ${truth.application.trackingId}` : "";
  if (action === "cancel_application") {
    return `أكيد. بس لأن إلغاء الطلب${tracking} إجراء فعلي وما بدي أنفذه من سؤال أو بالغلط، بدي تأكيد منفصل منك. إذا قرارك نهائي اكتب: نعم، ألغي الطلب.`;
  }
  if (action === "request_refund") {
    return `أكيد. بس لأن طلب الاسترداد إجراء فعلي وما بدي أسجله من سؤال أو بالغلط، بدي تأكيد منفصل منك. إذا قرارك نهائي اكتب: نعم، أريد استرداد الرسوم.`;
  }
  const app = truth.application;
  const preview = app ? `لقيت الطلب${app.trackingId ? ` ${app.trackingId}` : ""}${app.deviceName ? ` — ${app.deviceName}` : ""}، وحالته ${customerFacingStatusLabel(app)}. ` : "";
  return `${preview}رقم واتسابك الحالي مختلف عن رقم الهاتف الأساسي على الطلب. إذا هذا رقم واتسابك وبدك أعتمده كرقم متابعة تابع لنفس الطلب، اكتب: نعم، اعتمد الرقم. رقم الهاتف الأساسي بالطلب ما رح يتغير.`;
}

function informationalReply(action: ActionKey, truth: TruthBundle) {
  if (action === "cancel_application") {
    const paid = Boolean(truth.application?.paymentConfirmedAt) || ["confirmed","paid","payment_confirmed","refund_requested","refund_completed"].includes(String(truth.application?.paymentStatus || "").toLowerCase());
    return paid
      ? "نعم، الإلغاء ممكن. سؤالك هذا ما اعتبرته طلب إلغاء وما نفذت أي تغيير. إذا قررت تلغي فعليًا، اطلب الإلغاء بشكل صريح وبعدها بطلب منك تأكيد منفصل؛ وبما إن على الملف دفع مؤكد، الإلغاء يفتح مسار الاسترداد الرسمي."
      : "نعم، الإلغاء ممكن. سؤالك هذا ما اعتبرته طلب إلغاء وما نفذت أي تغيير. إذا قررت تلغي فعليًا، اطلب الإلغاء بشكل صريح وبعدها بطلب منك تأكيد منفصل قبل التنفيذ.";
  }
  if (action === "request_refund") return "نعم، تقدر تطلب الاسترداد إذا كانت شروطه متحققة على الملف. سؤالك هذا ما اعتبرته طلب استرداد وما سجلت أي إجراء. إذا بدك تنفذه فعليًا، اطلبه بشكل صريح وبعدها بطلب منك تأكيد منفصل.";
  return "نعم، بنقدر نعتمد رقم واتسابك الحالي كرقم متابعة تابع لنفس الطلب بدون تغيير رقم الهاتف الأساسي. سؤالك لحاله ما نفّذ أي ربط؛ لما تطلب الاعتماد بطلب منك تأكيد منفصل وواضح قبل التنفيذ.";
}

export type MutationConfirmationGateResult = {
  actions: PlannedAction[];
  confirmationPrompt: string | null;
  informationalReply: string | null;
  clearPendingConfirmation: boolean;
  confirmedAction: ActionKey | null;
  blockedQuestionAction: ActionKey | null;
};

export function enforceMutationConfirmationGate(input: {
  actions: PlannedAction[];
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
}): MutationConfirmationGateResult {
  const authoritativeStage = applicationJourneyStage(input.truth.application);
  const currentQ = normalized(input.turn.rawText);

  // PHASE 7.5.0 ACTION INTENT SEPARATION: "stop the refund and keep my device order"
  // is never a cancel_application or request_refund command. Real mutations are
  // stripped before confirmation logic; manual stop/reopen actions may continue
  // through their existing administrative path, while customer-facing truth stays
  // unchanged until authoritative state actually moves.
  if (stopRefundKeepRequest(input.turn.rawText)) {
    return {
      actions: input.actions.filter((action) => !REAL_MUTATIONS.has(action.action)),
      confirmationPrompt: null,
      informationalReply: "فهمت عليك: بدك توقف/تلغي طلب الاسترداد وتكمل بطلب الجهاز، مش تلغي طلب التقسيط. ما رح أنفذ إلغاء جديد ولا أفتح استرداد جديد من هالرسالة؛ الحالة الحالية بتظل معتمدة لحد ما يتنفذ التغيير فعليًا وتتحدث على الطلب.",
      clearPendingConfirmation: true,
      confirmedAction: null,
      blockedQuestionAction: null,
    };
  }

  const alreadyCancelled = ["cancelled", "refund_requested", "refund_completed"].includes(authoritativeStage);
  const cancellationInfoQuestion = /^(?:وين|متى|امتى|ليش|ليه|شو|كيف|قديش|كم|هل)\b/.test(currentQ)
    || /(?:مصاري|المبلغ|الاسترداد|استرداد).{0,28}(?:وين|متى|امتى)|(?:وين|متى|امتى).{0,28}(?:مصاري|المبلغ|الاسترداد|استرداد)/.test(currentQ);
  if (alreadyCancelled && cancelWords(currentQ) && !cancellationInfoQuestion) {
    const info = authoritativeStage === "refund_requested"
      ? "طلبك ملغي بالفعل، وطلب الاسترداد مسجل وقيد المعالجة. ما في داعي تعيد طلب الإلغاء أو تأكيده مرة ثانية."
      : authoritativeStage === "refund_completed"
        ? "طلبك ملغي بالفعل، والاسترداد مكتمل حسب الحالة الحالية. ما في داعي تعيد طلب الإلغاء أو تأكيده مرة ثانية."
        : "طلبك ملغي بالفعل. ما في داعي تعيد طلب الإلغاء أو تأكيده مرة ثانية.";
    return {
      actions: input.actions.filter((action) => action.action !== "cancel_application"),
      confirmationPrompt: null,
      informationalReply: info,
      clearPendingConfirmation: true,
      confirmedAction: null,
      blockedQuestionAction: "cancel_application",
    };
  }
  const pending = input.state.pendingAction && REAL_MUTATIONS.has(input.state.pendingAction)
    && input.state.pendingActionPayload?._mutationConfirmationRequired === true
    ? input.state.pendingAction
    : null;

  let clearPendingConfirmation = false;
  let confirmedAction: ActionKey | null = null;
  let blockedQuestionAction: ActionKey | null = null;
  let prompt: string | null = null;
  let info: string | null = null;

  const q = normalized(input.turn.rawText);
  const aliasOpenLoopConfirmation = contextualAliasOpenLoopConfirmation({ value: input.turn.rawText, state: input.state, truth: input.truth });
  const explicitConfirmationFromLastPrompt = aliasOpenLoopConfirmation
    ? "link_whatsapp_alias" as ActionKey
    : Array.from(REAL_MUTATIONS).find((action) =>
        lastAssistantAskedForConfirmation(input.state, action)
        && explicitMutationConfirmation({ action, value: input.turn.rawText, state: input.state })
      ) || null;

  // If the runtime/state reducer failed to persist the pending confirmation token but
  // the immediately previous assistant message asked for this exact confirmation, the
  // second customer message can still complete the two-step flow. Never infer this
  // across a different application or without current authoritative truth.
  const recoverableScopeMatches = Boolean(input.truth.application)
    && Boolean(input.state.activeApplicationId || input.state.activeTrackingId)
    && (!input.state.activeApplicationId || input.state.activeApplicationId === input.truth.application?.id)
    && (!input.state.activeTrackingId || input.state.activeTrackingId === input.truth.application?.trackingId);
  const recoverableConfirmation = !pending && explicitConfirmationFromLastPrompt && recoverableScopeMatches
    ? explicitConfirmationFromLastPrompt
    : null;

  if (pending && !pendingScopeMatchesTruth(input.state, input.truth)) {
    clearPendingConfirmation = true;
    info = missingApplicationMutationReply(pending, input.state);
  }

  if (pending && mutationDecline(pending, input.turn.rawText)) {
    clearPendingConfirmation = true;
  }

  // P0 stale-confirmation killer: a generic acknowledgement such as "تم" must
  // never inherit an older cancellation/refund prompt after the assistant has
  // already moved on to another topic (for example payment instructions).
  // If the immediately previous assistant turn is no longer the matching
  // confirmation prompt and the customer did not name the mutation, clear it.
  if (pending && !lastAssistantAskedForConfirmation(input.state, pending)) {
    const namesPending = actionWords(pending, q);
    if (!namesPending) clearPendingConfirmation = true;
  }

  if (pending && !clearPendingConfirmation && pendingScopeMatchesTruth(input.state, input.truth)
      && (explicitMutationConfirmation({ action: pending, value: input.turn.rawText, state: input.state })
        || (pending === "link_whatsapp_alias" && aliasOpenLoopConfirmation))) {
    confirmedAction = pending;
  } else if (recoverableConfirmation) {
    confirmedAction = recoverableConfirmation;
  } else if (pending && !mutationDecline(pending, input.turn.rawText) && !clearPendingConfirmation) {
    const stillTalkingAboutPending = actionWords(pending, q);
    if (!stillTalkingAboutPending && q.length > 2) clearPendingConfirmation = true;
  }

  const output: PlannedAction[] = [];
  for (const action of input.actions) {
    if (!REAL_MUTATIONS.has(action.action)) {
      output.push(action);
      continue;
    }

    if (mutationDecline(action.action, input.turn.rawText)) {
      clearPendingConfirmation = true;
      continue;
    }
    const automaticAliasPrompt = action.action === "link_whatsapp_alias"
      && action.payload?._autoContactAliasPrompt === true
      && input.truth.contactAccess === "safe_preview"
      && Boolean(input.truth.application);
    if (automaticAliasPrompt && confirmedAction !== "link_whatsapp_alias") {
      const staged = { ...action, requiresConfirmation: true, authority: "deterministic" as const, payload: payloadWithConfirmationScope(action, input.truth, input.turn.turnId, input.state.waId) };
      output.push(staged);
      prompt = confirmationPrompt(action.action, input.truth);
      continue;
    }
    if (mutationQuestion(action.action, input.turn.rawText)) {
      blockedQuestionAction = action.action;
      info = informationalReply(action.action, input.truth);
      continue;
    }
    if (!input.truth.application && (explicitMutationRequest(action.action, input.turn.rawText) || explicitMutationConfirmation({ action: action.action, value: input.turn.rawText, state: input.state }))) {
      clearPendingConfirmation = true;
      info = missingApplicationMutationReply(action.action, input.state);
      continue;
    }
    if (confirmedAction === action.action) {
      output.push({
        ...action,
        requiresConfirmation: false,
        authority: "deterministic",
        payload: {
          ...(input.state.pendingActionPayload || action.payload || {}),
          _mutationConfirmedOnTurn: input.turn.turnId,
          _scopeApplicationId: input.truth.application?.id || null,
          _scopeTrackingId: input.truth.application?.trackingId || null,
          _scopeWaId: input.state.waId,
        },
      });
      continue;
    }
    if (explicitMutationRequest(action.action, input.turn.rawText)) {
      const staged = { ...action, requiresConfirmation: true, authority: "deterministic" as const, payload: payloadWithConfirmationScope(action, input.truth, input.turn.turnId, input.state.waId) };
      output.push(staged);
      prompt = confirmationPrompt(action.action, input.truth);
      continue;
    }
    // Model/planner inference alone can never authorize a real mutation.
  }

  if (confirmedAction && !input.truth.application) {
    clearPendingConfirmation = true;
    info = missingApplicationMutationReply(confirmedAction, input.state);
    confirmedAction = null;
  }

  if (confirmedAction && !output.some((x) => x.action === confirmedAction)) {
    output.push({
      action: confirmedAction,
      sourceActId: input.turn.acts[0]?.id || input.turn.turnId,
      requiresConfirmation: false,
      authority: "deterministic",
      requiredRole: confirmedAction === "link_whatsapp_alias" ? input.state.role.currentRole : "omran",
      payload: {
        ...(input.state.pendingActionPayload || {}),
        _mutationConfirmedOnTurn: input.turn.turnId,
        _scopeApplicationId: input.truth.application?.id || null,
        _scopeTrackingId: input.truth.application?.trackingId || null,
        _scopeWaId: input.state.waId,
      },
    });
  }

  for (const action of REAL_MUTATIONS) {
    if (prompt || confirmedAction || blockedQuestionAction || info) break;
    if (!input.truth.application && (explicitMutationRequest(action, input.turn.rawText) || explicitMutationConfirmation({ action, value: input.turn.rawText, state: input.state }))) {
      clearPendingConfirmation = true;
      info = missingApplicationMutationReply(action, input.state);
      break;
    }
    if (explicitMutationRequest(action, input.turn.rawText)) {
      const staged: PlannedAction = {
        action,
        sourceActId: input.turn.acts[0]?.id || input.turn.turnId,
        requiresConfirmation: true,
        authority: "deterministic",
        requiredRole: action === "link_whatsapp_alias" ? input.state.role.currentRole : "omran",
        payload: payloadWithConfirmationScope({ action, sourceActId: input.turn.turnId, requiresConfirmation: true, authority: "deterministic", requiredRole: "omran", payload: null }, input.truth, input.turn.turnId, input.state.waId),
      };
      output.push(staged);
      prompt = confirmationPrompt(action, input.truth);
      break;
    }
    if (mutationQuestion(action, input.turn.rawText)) {
      blockedQuestionAction = action;
      info = informationalReply(action, input.truth);
      break;
    }
  }

  return { actions: output, confirmationPrompt: prompt, informationalReply: info, clearPendingConfirmation, confirmedAction, blockedQuestionAction };
}

export function pendingActionIsCurrentTurnFocus(input: { action: ActionKey | null; turn: InterpretedTurn }) {
  if (!input.action) return false;
  const q = normalized(input.turn.rawText);
  if (input.action === "cancel_application") return cancelWords(q);
  if (input.action === "request_refund") return refundWords(q);
  if (input.action === "stop_refund") return /(?:وقف|اوقف|الغي|الغاء).{0,28}(?:الاسترداد|الاسترجاع)|(?:بديش|لا\s+اريد).{0,22}(?:استرداد|استرجاع)/.test(q);
  if (input.action === "reopen_application") return /(?:اعاده|ارجع|رجع|استينف|استانف|افتح).{0,30}(?:الطلب|الملف)|(?:كمل|اكمل|استمر).{0,25}(?:الطلب|الجهاز)/.test(q);
  if (input.action === "change_device") return /(?:غير|تغيير|بدل).{0,30}(?:الجهاز|التلفون|الموبايل)|(?:الجهاز|التلفون).{0,25}(?:غير|بدل)/.test(q);
  if (input.action === "change_application_data") return /(?:غير|تغيير|بدل|عدل).{0,30}(?:الرقم|البيانات|الهاتف|التواصل)/.test(q);
  if (input.action === "link_whatsapp_alias") return aliasWords(q);
  return MANUAL_MUTATIONS.has(input.action) && input.turn.requestedActions.includes(input.action);
}
