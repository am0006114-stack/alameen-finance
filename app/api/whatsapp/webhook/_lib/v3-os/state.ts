import { actionRequiresOmran, initialRoleState, resolveAiRole } from "./hierarchy";
import { V3_OS_VERSION, type ConversationState, type InterpretedTurn, type OpenLoop } from "./types";

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
    updatedAt: now(),
  };
}

function addLoop(loops: OpenLoop[], loop: OpenLoop) {
  if (!loops.some((x) => x.state === "open" && x.topic === loop.topic && x.owedBy === loop.owedBy)) loops.push(loop);
  return loops.slice(-50);
}

export function reduceState(input: { state: ConversationState; turn: InterpretedTurn; assistantText?: string | null }): ConversationState {
  const stamp = now();
  const s: ConversationState = JSON.parse(JSON.stringify(input.state));
  s.version = V3_OS_VERSION;
  s.role = resolveAiRole(s, input.turn);
  s.lastTurnId = input.turn.turnId;
  s.lastCustomerText = input.turn.rawText;
  s.lastAssistantText = input.assistantText || s.lastAssistantText;
  s.currentTopic = input.turn.topics.find((t) => !["greeting","thanks","acknowledgement","unknown"].includes(t)) || s.currentTopic;
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
