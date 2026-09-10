import { normalizeArabic } from "./text";
import { applicationJourneyStage } from "./applicationJourney";
import type { ActionKey, ConversationState, InterpretedTurn, PlannedAction, TruthBundle } from "./types";

const REAL_MUTATIONS = new Set<ActionKey>(["cancel_application", "request_refund"]);
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

export function mutationQuestion(action: ActionKey, value: string | null | undefined) {
  const q = normalized(value);
  const hasAction = action === "cancel_application" ? cancelWords(q) : action === "request_refund" ? refundWords(q) : false;
  if (!hasAction) return false;
  return /^(?:طيب\s+)?(?:بزبط|ممكن|هل|بقدر|اقدر|اقدرش|لو|اذا|كيف|شو\s+بصير|شو\s+يصير|وش\s+يصير|قديش|كم)/.test(q)
    || /(?:لو|اذا).{0,24}(?:الغ|استرد|استرجع)/.test(q)
    || /(?:بزبط|ممكن|بقدر|هل).{0,30}(?:الغ|استرد|استرجع)/.test(q)
    || /(?:شو\s+بصير|شو\s+يصير|كيف).{0,30}(?:الغاء|الاسترداد|الاسترجاع)/.test(q);
}

export function mutationDecline(action: ActionKey, value: string | null | undefined) {
  const q = normalized(value);
  if (action === "cancel_application") {
    return /(?:بديش|ما\s+بدي|لا\s+اريد|لا\s+ارغب).{0,24}(?:الغ|الغاء)|(?:سالتك|سألتك|بس\s+سوال|بس\s+سؤال).{0,28}(?:الغ|الغاء)|(?:ما\s+حكيتلك|ما\s+طلبت).{0,24}(?:تلغي|الغاء)|(?:كمل|اكمل|استمر).{0,28}(?:الطلب|الجهاز)/.test(q);
  }
  if (action === "request_refund") {
    return /(?:بديش|ما\s+بدي|لا\s+اريد|لا\s+ارغب).{0,24}(?:استرد|استرجع|الاسترداد)|(?:ما\s+طلبت).{0,24}(?:استرداد|استرجاع)/.test(q);
  }
  return false;
}

export function explicitMutationRequest(action: ActionKey, value: string | null | undefined) {
  const q = normalized(value);
  if (!q || mutationQuestion(action, q) || mutationDecline(action, q)) return false;
  if (action === "cancel_application") {
    return /(?:بدي|اريد|حاب|حابب).{0,18}(?:الغي|الغاء).{0,30}(?:الطلب|المعامله)?|^(?:الغي|الغوا|الغاء)\s*(?:الطلب|المعامله)?$|(?:الغاء|الغي).{0,16}(?:طلبي|الطلب)$/.test(q);
  }
  if (action === "request_refund") {
    return /(?:بدي|اريد|حاب|حابب).{0,20}(?:استرد|استرجع|استرداد|استرجاع)|(?:رجعلي|رجعولي).{0,20}(?:الرسوم|المبلغ|المصاري)|^(?:استرداد|استرجاع)$/.test(q);
  }
  return false;
}

function lastAssistantAskedForConfirmation(state: ConversationState, action: ActionKey) {
  const q = normalized(state.lastAssistantText);
  if (!/(?:اكدلي|اكد|تاكيد|للتاكيد|بدي\s+تاكيد|اكتب.{0,18}نعم|قبل\s+ما\s+انفذ|قبل\s+التنفيذ)/.test(q)) return false;
  return action === "cancel_application" ? cancelWords(q) : action === "request_refund" ? refundWords(q) : false;
}

export function explicitMutationConfirmation(input: { action: ActionKey; value: string | null | undefined; state: ConversationState }) {
  const q = normalized(input.value);
  if (!q || mutationQuestion(input.action, q) || mutationDecline(input.action, q)) return false;
  const actionMentioned = input.action === "cancel_application" ? cancelWords(q) : input.action === "request_refund" ? refundWords(q) : false;
  const explicit = /(?:نعم|اه|ايوه|اكيد|اكد|موافق).{0,28}/.test(q) && actionMentioned;
  const lastAsked = lastAssistantAskedForConfirmation(input.state, input.action);
  const shortYes = /^(?:نعم|اه|ايوه|اكيد|موافق|تم)$/.test(q) && lastAsked;
  const contextualYes = lastAsked && (
    /(?:كتبت|حكيت|قلت|جاوبت).{0,18}(?:نعم|اه|ايوه|اكيد|موافق)/.test(q)
    || /(?:نعم|اه|ايوه|اكيد|موافق).{0,18}(?:مره|مرة|مرات|مليون|من\s+قبل|قبل\s+شوي)/.test(q)
    || /^(?:نعم|اه|ايوه|اكيد|موافق)(?:\s+\S+){0,4}$/.test(q)
  );
  return explicit || shortYes || contextualYes;
}

function pendingScopeMatchesTruth(state: ConversationState, truth: TruthBundle) {
  if (!truth.application) return false;
  const payload = state.pendingActionPayload || {};
  const appId = String(payload._scopeApplicationId || "").trim();
  const trackingId = String(payload._scopeTrackingId || "").trim();
  if (appId && appId !== truth.application.id) return false;
  if (trackingId && trackingId !== String(truth.application.trackingId || "")) return false;
  return true;
}

function missingApplicationMutationReply(action: ActionKey, state: ConversationState) {
  const known = String(state.activeTrackingId || "").trim();
  const label = action === "cancel_application" ? "الإلغاء" : "الاسترداد";
  if (known) return `طلب ${label} واضح، لكن تفاصيل الطلب ${known} مش محمّلة بشكل موثوق بهاللحظة. حفاظًا على طلبك ما رح أنفذ أو أعتبر الإجراء بدأ قبل ما أقرأ الطلب الصحيح فعليًا. جرّب متابعة الطلب من جديد أو ابعث رقم التتبع نفسه مرة واحدة إذا ظلّت المشكلة.`;
  return `طلب ${label} واضح، لكن ما عندي طلب موثوق مربوط بالمحادثة هسا. حفاظًا على طلبك ما رح أنفذ الإجراء على تخمين؛ ابعث رقم التتبع للطلب اللي بدك ${action === "cancel_application" ? "تلغيه" : "تسترد رسومه"} مرة واحدة.`;
}

function payloadWithConfirmationScope(action: PlannedAction, truth: TruthBundle, turnId: string) {
  return {
    ...(action.payload || {}),
    _mutationConfirmationRequired: true,
    _mutationAction: action.action,
    _scopeApplicationId: truth.application?.id || null,
    _scopeTrackingId: truth.application?.trackingId || null,
    _scopeTurnId: turnId,
  };
}

function confirmationPrompt(action: ActionKey, truth: TruthBundle) {
  const tracking = truth.application?.trackingId ? ` ${truth.application.trackingId}` : "";
  if (action === "cancel_application") {
    return `أكيد. بس لأن إلغاء الطلب${tracking} إجراء فعلي وما بدي أنفذه من سؤال أو بالغلط، بدي تأكيد منفصل منك. إذا قرارك نهائي اكتب: نعم، ألغي الطلب.`;
  }
  return `أكيد. بس لأن طلب الاسترداد إجراء فعلي وما بدي أسجله من سؤال أو بالغلط، بدي تأكيد منفصل منك. إذا قرارك نهائي اكتب: نعم، أريد استرداد الرسوم.`;
}

function informationalReply(action: ActionKey, truth: TruthBundle) {
  if (action === "cancel_application") {
    const paid = Boolean(truth.application?.paymentConfirmedAt) || ["confirmed","paid","payment_confirmed","refund_requested","refund_completed"].includes(String(truth.application?.paymentStatus || "").toLowerCase());
    return paid
      ? "نعم، الإلغاء ممكن. سؤالك هذا ما اعتبرته طلب إلغاء وما نفذت أي تغيير. إذا قررت تلغي فعليًا، اطلب الإلغاء بشكل صريح وبعدها بطلب منك تأكيد منفصل؛ وبما إن على الملف دفع مؤكد، الإلغاء يفتح مسار الاسترداد الرسمي."
      : "نعم، الإلغاء ممكن. سؤالك هذا ما اعتبرته طلب إلغاء وما نفذت أي تغيير. إذا قررت تلغي فعليًا، اطلب الإلغاء بشكل صريح وبعدها بطلب منك تأكيد منفصل قبل التنفيذ.";
  }
  return "نعم، تقدر تطلب الاسترداد إذا كانت شروطه متحققة على الملف. سؤالك هذا ما اعتبرته طلب استرداد وما سجلت أي إجراء. إذا بدك تنفذه فعليًا، اطلبه بشكل صريح وبعدها بطلب منك تأكيد منفصل.";
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
  const alreadyCancelled = ["cancelled", "refund_requested", "refund_completed"].includes(authoritativeStage);
  if (alreadyCancelled && cancelWords(currentQ)) {
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
  const explicitConfirmationFromLastPrompt = Array.from(REAL_MUTATIONS).find((action) =>
    lastAssistantAskedForConfirmation(input.state, action)
    && explicitMutationConfirmation({ action, value: input.turn.rawText, state: input.state })
  ) || null;

  // If the runtime/state reducer failed to persist the pending confirmation token but
  // the immediately previous assistant message asked for this exact confirmation, the
  // second customer message can still complete the two-step flow. Never infer this
  // across a different application or without current authoritative truth.
  const recoverableConfirmation = !pending && explicitConfirmationFromLastPrompt && input.truth.application
    ? explicitConfirmationFromLastPrompt
    : null;

  if (pending && !pendingScopeMatchesTruth(input.state, input.truth)) {
    clearPendingConfirmation = true;
    info = missingApplicationMutationReply(pending, input.state);
  }

  if (pending && mutationDecline(pending, input.turn.rawText)) {
    clearPendingConfirmation = true;
  }

  if (pending && pendingScopeMatchesTruth(input.state, input.truth) && explicitMutationConfirmation({ action: pending, value: input.turn.rawText, state: input.state })) {
    confirmedAction = pending;
  } else if (recoverableConfirmation) {
    confirmedAction = recoverableConfirmation;
  } else if (pending && !mutationDecline(pending, input.turn.rawText) && !clearPendingConfirmation) {
    const stillTalkingAboutPending = pending === "cancel_application" ? cancelWords(q) : refundWords(q);
    if (!stillTalkingAboutPending && q.length > 2) clearPendingConfirmation = true;
  }

  const output: PlannedAction[] = [];
  for (const action of input.actions) {
    if (!REAL_MUTATIONS.has(action.action)) {
      output.push(action);
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
    if (mutationDecline(action.action, input.turn.rawText)) {
      clearPendingConfirmation = true;
      continue;
    }
    if (confirmedAction === action.action) {
      output.push({ ...action, requiresConfirmation: false, authority: "deterministic" });
      continue;
    }
    if (explicitMutationRequest(action.action, input.turn.rawText)) {
      const staged = { ...action, requiresConfirmation: true, authority: "deterministic" as const, payload: payloadWithConfirmationScope(action, input.truth, input.turn.turnId) };
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
      requiredRole: "omran",
      payload: {
        ...(input.state.pendingActionPayload || {}),
        _mutationConfirmedOnTurn: input.turn.turnId,
        _scopeApplicationId: input.truth.application?.id || null,
        _scopeTrackingId: input.truth.application?.trackingId || null,
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
        requiredRole: "omran",
        payload: payloadWithConfirmationScope({ action, sourceActId: input.turn.turnId, requiresConfirmation: true, authority: "deterministic", requiredRole: "omran", payload: null }, input.truth, input.turn.turnId),
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
  return MANUAL_MUTATIONS.has(input.action) && input.turn.requestedActions.includes(input.action);
}
