import { actionRequiresOmran, initialRoleState, resolveAiRole, roleDisplayName } from "./hierarchy";
import { V3_OS_VERSION, type ConversationState, type InterpretedTurn, type OpenLoop } from "./types";
import { normalizeArabic } from "./text";
import { BUSINESS_REGISTRATION_PROTECTION_REPLY } from "./unifiedConversationDecisionPlane";
import { updateHumanRelationshipState } from "./humanRelationshipRuntime";
import { emptySemanticMemory, finalizeSemanticMemoryAfterReply, updateSemanticMemoryFromTurn } from "./semanticMemory";

function now() { return new Date().toISOString(); }

export function emptyState(waId: string): ConversationState {
  return {
    version: V3_OS_VERSION,
    waId,
    activeApplicationId: null,
    activeTrackingId: null,
    currentTopic: null,
    currentGoal: null,
    role: initialRoleState(waId),
    openLoops: [],
    facts: [],
    pendingAction: null,
    pendingActionPayload: null,
    lastTurnId: null,
    lastCustomerText: null,
    lastAssistantText: null,
    consecutiveRiskTurns: 0,
    lastVerifiedApplication: null,
    verifiedContactBinding: null,
    contactResolution: null,
    conversationConstraints: { noLinks: false, whatsappOnly: false, avoidRepetition: false, sourceTurnId: null, updatedAt: null },
    humanRelationship: { lastEmotion: "neutral", lastConcern: null, frustrationStreak: 0, delayTurnCount: 0, warmTurnCount: 0, lastGreetingTurnId: null, updatedAt: now() },
    semanticMemory: emptySemanticMemory(),
    updatedAt: now(),
  };
}

function addLoop(loops: OpenLoop[], loop: OpenLoop) {
  if (!loops.some((x) => x.state === "open" && x.topic === loop.topic && x.owedBy === loop.owedBy)) loops.push(loop);
  return loops.slice(-50);
}

function productReferentText(value: string | null | undefined) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  const q = normalizeArabic(raw);
  if (!raw || raw.length > 220) return null;
  const explicitModel = /(?:ايفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|اوبو|oppo|ريلمي|realme|s\s*\d{2}|a\s*\d{2}).{0,50}(?:\d{2}|pro|برو|max|ماكس|ultra|الترا|plus|بلس|air|اير)|(?:\d{2}).{0,35}(?:ايفون|iphone|سامسونج|samsung)/i.test(q);
  return explicitModel ? raw : null;
}

export function reduceState(input: { state: ConversationState; turn: InterpretedTurn; assistantText?: string | null }): ConversationState {
  const stamp = now();
  const s: ConversationState = JSON.parse(JSON.stringify(input.state));
  s.version = V3_OS_VERSION;
  s.role = resolveAiRole(s, input.turn);
  s.lastTurnId = input.turn.turnId;
  s.lastCustomerText = input.turn.rawText;
  s.lastAssistantText = input.assistantText || s.lastAssistantText;
  if (input.assistantText && normalizeArabic(input.assistantText).includes(normalizeArabic(BUSINESS_REGISTRATION_PROTECTION_REPLY))) {
    const key = "protected_business_registration_notice_sent";
    const fact = { key, value: "sent", topic: "trust" as const, source: "system" as const, confidence: 1, turnId: input.turn.turnId, updatedAt: stamp };
    const existing = s.facts.findIndex((f) => f.key === key);
    if (existing >= 0) s.facts[existing] = fact; else s.facts.push(fact);
  }
  s.currentTopic = input.turn.topics.find((t) => !["greeting","thanks","acknowledgement","unknown"].includes(t)) || s.currentTopic;
  const productReferent = productReferentText(input.turn.rawText);
  if (productReferent) {
    const fact = { key: "last_product_referent", value: productReferent, topic: "products" as const, source: "customer" as const, confidence: 1, turnId: input.turn.turnId, updatedAt: stamp };
    const existing = s.facts.findIndex((f) => f.key === fact.key);
    if (existing >= 0) s.facts[existing] = fact; else s.facts.push(fact);
  }
  const requestedMutationAct = input.turn.acts.find((a) => a.type === "request_action" && a.action && actionRequiresOmran(a.action));
  const declinedPending = input.turn.acts.some((a) => a.source === "resolved" && a.type === "deny" && a.value === "pending_action_declined");
  if (requestedMutationAct?.action) {
    const samePending = s.pendingAction === requestedMutationAct.action;
    s.pendingAction = requestedMutationAct.action;
    s.pendingActionPayload = requestedMutationAct.value
      ? { requestedValue: requestedMutationAct.value }
      : samePending ? s.pendingActionPayload : null;
  } else if (declinedPending) {
    s.pendingAction = null;
    s.pendingActionPayload = null;
  }
  const risk = input.turn.sentiment === "angry" || input.turn.topics.some((t) => ["legal","social_threat","complaint","refund","cancellation"].includes(t));
  s.consecutiveRiskTurns = risk ? s.consecutiveRiskTurns + 1 : Math.max(0, s.consecutiveRiskTurns - 1);
  s.humanRelationship = updateHumanRelationshipState({ state: input.state, turn: input.turn, stamp });
  s.semanticMemory = updateSemanticMemoryFromTurn({ state: input.state, turn: input.turn });

  for (const act of input.turn.acts) {
    if (act.type === "provide_fact" && act.value) {
      const existing = s.facts.findIndex((f) => f.key === `${act.topic}_customer_fact`);
      const fact = { key: `${act.topic}_customer_fact`, value: act.value, topic: act.topic, source: "customer" as const, confidence: act.confidence, turnId: input.turn.turnId, updatedAt: stamp };
      if (existing >= 0) s.facts[existing] = fact; else s.facts.push(fact);
    }
    if (["ask","request_action","repair_request"].includes(act.type)) {
      s.openLoops = addLoop(s.openLoops, {
        id: `${input.turn.turnId}:${act.id}`,
        topic: act.topic,
        owedBy: "ai",
        state: "open",
        sourceTurnId: input.turn.turnId,
        question: act.text,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }
  }

  // Staff/manager requests never create a human-owned loop. The AI hierarchy owns them.
  s.openLoops = s.openLoops.filter((loop) => loop.owedBy !== ("staff" as never));
  s.updatedAt = stamp;
  return s;
}

export function closeAnsweredLoops(state: ConversationState, topics: string[]): ConversationState {
  const stamp = now();
  return {
    ...state,
    openLoops: state.openLoops.map((loop) => topics.includes(loop.topic) && loop.state === "open" ? { ...loop, state: "answered", updatedAt: stamp } : loop),
    updatedAt: stamp,
  };
}


export function finalizeStateSemanticMemory(input: { state: ConversationState; turn: InterpretedTurn; reply: string | null | undefined; answered: boolean }): ConversationState {
  return {
    ...input.state,
    semanticMemory: finalizeSemanticMemoryAfterReply({ state: input.state, turn: input.turn, reply: input.reply, answered: input.answered }),
    updatedAt: now(),
  };
}

export function markRoleIntroducedFromReply(state: ConversationState, reply: string | null | undefined): ConversationState {
  if (!reply || state.role.introduced) return state;
  const name = roleDisplayName(state.role.currentRole);
  const n = normalizeArabic(reply);
  const introduced = n.includes(normalizeArabic(`معك ${name}`)) || n.includes(normalizeArabic(`انا ${name}`)) || n.includes(normalizeArabic(`أنا ${name}`));
  if (!introduced) return state;
  return { ...state, role: { ...state.role, introduced: true } };
}


export function inferRoleIntroducedFromRecentTurns(state: ConversationState, recentTurns?: string[]): ConversationState {
  if (state.role.introduced || !recentTurns?.length) return state;
  const name = roleDisplayName(state.role.currentRole);
  const found = recentTurns.some(turn => {
    const n = normalizeArabic(String(turn || "").replace(/^\s*(?:الامين|الأمين)\s*:\s*/i, ""));
    return n.includes(normalizeArabic(`معك ${name}`)) || n.includes(normalizeArabic(`انا ${name}`)) || n.includes(normalizeArabic(`أنا ${name}`));
  });
  return found ? { ...state, role: { ...state.role, introduced: true } } : state;
}
