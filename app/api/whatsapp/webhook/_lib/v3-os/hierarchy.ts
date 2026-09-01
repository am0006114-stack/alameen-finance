import type { ActionKey, AiRoleKey, AiTier, ConversationState, InterpretedTurn, RoleState, TopicKey } from "./types";

export const AI_TEAM: Record<AiRoleKey, { displayName: string; tier: AiTier; mission: string; canOwn: TopicKey[] | "all" }> = {
  tala: {
    displayName: "تالا",
    tier: "frontline",
    mission: "متابعة يومية، شرح واضح، استيعاب أسلوب العميل، ومواصلة الحوار بدون قوالب جامدة.",
    canOwn: "all",
  },
  fadwa: {
    displayName: "فدوة",
    tier: "frontline",
    mission: "متابعة يومية، المحافظة على استمرارية المحادثة، وحل الاستفسارات الطبيعية بأسلوب بشري.",
    canOwn: "all",
  },
  abdullah: {
    displayName: "عبدالله",
    tier: "case_specialist",
    mission: "دراسة الطلبات والمتطلبات والحالات المركبة، وتجهيز القرار التنفيذي لعمران عند الحاجة لتغيير فعلي في الطلب.",
    canOwn: ["application_status","application_correction","requirements","guarantor","payment_fee","payment_method","payment_timing","payment_recipient","payment_status","payment_confirmation","receipt_upload","refund","cancellation","continuation","reopen","device_change","device_recalculation","review_timing","operational_pressure"],
  },
  abdulrahman: {
    displayName: "عبدالرحمن",
    tier: "case_specialist",
    mission: "دراسة الملفات والحالات المركبة، حل النواقص، وتجهيز أي إجراء تنفيذي لعمران ضمن الحقيقة.",
    canOwn: ["application_status","application_correction","requirements","guarantor","payment_fee","payment_method","payment_timing","payment_recipient","payment_status","payment_confirmation","receipt_upload","refund","cancellation","continuation","reopen","device_change","device_recalculation","review_timing","operational_pressure"],
  },
  omran: {
    displayName: "عمران",
    tier: "supervisor",
    mission: "Supervisor AI وصاحب صلاحية التغييرات الفعلية: الإلغاء، التراجع، الاسترداد، إعادة الفتح، تعديل بيانات الطلب، تغيير الجهاز وإعادة الحسبة، إضافة إلى الشكاوى والنزاعات والتصعيدات.",
    canOwn: "all",
  },
};

const SUPERVISOR_ACTIONS = new Set<ActionKey>([
  "cancel_application",
  "continue_application",
  "request_refund",
  "stop_refund",
  "change_application_data",
  "change_device",
  "reopen_application",
]);

export function actionRequiresOmran(action: ActionKey) {
  return SUPERVISOR_ACTIONS.has(action);
}

function stableRole(waId: string): AiRoleKey {
  const digits = String(waId || "").replace(/\D/g, "");
  const n = Number(digits.slice(-2) || "0");
  const names: AiRoleKey[] = ["tala", "fadwa", "abdullah", "abdulrahman"];
  return names[n % names.length];
}

export function initialRoleState(waId: string): RoleState {
  const role = stableRole(waId);
  return { currentRole: role, tier: AI_TEAM[role].tier, reason: "stable_conversation_assignment", sinceTurnId: null, introduced: false };
}

function isSupervisorRisk(turn: InterpretedTurn) {
  const topics = new Set(turn.topics);
  return turn.explicitRoleRequest === "manager" || turn.explicitRoleRequest === "omran" ||
    topics.has("legal") || topics.has("social_threat") ||
    turn.requestedActions.some(actionRequiresOmran) ||
    (topics.has("complaint") && turn.sentiment === "angry") ||
    (turn.sentiment === "angry" && turn.urgency === "urgent");
}

function needsSpecialist(turn: InterpretedTurn) {
  const specialist = new Set<TopicKey>([
    "application_status","application_correction","requirements","guarantor","payment_fee","payment_method",
    "payment_timing","payment_recipient","payment_status","payment_confirmation","receipt_upload","refund","cancellation","continuation",
    "reopen","device_change","device_recalculation","review_timing","operational_pressure",
  ]);
  return turn.topics.some((topic) => specialist.has(topic));
}

export function resolveAiRole(state: ConversationState, turn: InterpretedTurn): RoleState {
  if (isSupervisorRisk(turn)) {
    return {
      currentRole: "omran",
      tier: "supervisor",
      reason: turn.requestedActions.some(actionRequiresOmran)
        ? "autonomous_business_mutation_owned_by_omran"
        : "supervisor_risk_or_explicit_manager_request",
      sinceTurnId: turn.turnId,
      introduced: state.role.currentRole === "omran" ? state.role.introduced : false,
    };
  }

  if (turn.explicitRoleRequest && !["manager", "staff"].includes(turn.explicitRoleRequest)) {
    const requested = turn.explicitRoleRequest as AiRoleKey;
    return { currentRole: requested, tier: AI_TEAM[requested].tier, reason: "explicit_ai_staff_name_request", sinceTurnId: turn.turnId, introduced: state.role.currentRole === requested ? state.role.introduced : false };
  }

  if (turn.explicitRoleRequest === "staff") {
    return { ...state.role, reason: "customer_requested_staff_ai_continues_same_conversation" };
  }

  // Once Omran owns an operational/escalated case, keep senior continuity for the active thread.
  if (state.role.currentRole === "omran") return state.role;

  if (needsSpecialist(turn) && state.role.tier === "frontline") {
    const digits = String(state.waId || "").replace(/\D/g, "");
    const role: AiRoleKey = Number(digits.slice(-1) || "0") % 2 === 0 ? "abdullah" : "abdulrahman";
    return { currentRole: role, tier: "case_specialist", reason: "internal_ai_specialist_routing", sinceTurnId: turn.turnId, introduced: false };
  }

  return state.role;
}

export function roleDisplayName(role: AiRoleKey) {
  return AI_TEAM[role].displayName;
}
