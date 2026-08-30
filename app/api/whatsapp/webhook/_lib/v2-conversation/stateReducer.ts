import type {
  V2ConversationFact,
  V2ConversationState,
  V2InterpretedTurn,
  V2OpenLoop,
  V2TopicKey,
} from "./types";

function now() {
  return new Date().toISOString();
}

export function emptyConversationState(waId: string): V2ConversationState {
  return {
    version: "2.0-phase1",
    waId,
    activeApplicationId: null,
    activeTrackingId: null,
    currentTopic: null,
    currentGoal: null,
    openLoops: [],
    facts: [],
    pendingCorrections: [],
    humanHandoff: { requested: false, requestedAt: null, status: null },
    lastTurnId: null,
    lastCustomerText: null,
    lastAssistantText: null,
    updatedAt: now(),
  };
}

function upsertFact(facts: V2ConversationFact[], next: V2ConversationFact) {
  const index = facts.findIndex((item) => item.key === next.key);
  if (index >= 0) facts[index] = next;
  else facts.push(next);
  return facts.slice(-80);
}

function closeLoopsForTopic(loops: V2OpenLoop[], topic: V2TopicKey) {
  const stamp = now();
  return loops.map((loop) =>
    loop.topic === topic && loop.state === "open"
      ? { ...loop, state: "answered" as const, updatedAt: stamp }
      : loop,
  );
}

function addLoop(loops: V2OpenLoop[], loop: V2OpenLoop) {
  const duplicate = loops.some((item) => item.state === "open" && item.topic === loop.topic && item.owedBy === loop.owedBy);
  if (!duplicate) loops.push(loop);
  return loops.slice(-40);
}

function normalized(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function replyProbablyAnswersTopic(reply: string | null | undefined, topic: V2TopicKey) {
  const r = normalized(reply);
  if (!r) return false;
  const map: Partial<Record<V2TopicKey, string[]>> = {
    office_location: ["عمان", "شارع المدينه", "المكتب"],
    review_timing: ["يوم", "ايام عمل", "حسب الدور", "مده", "موعد"],
    refund: ["استرداد", "استرجاع", "الرسوم", "فلوس"],
    payment_fee: ["رسوم فتح الملف", "5 دنانير", "٥ دنانير"],
    payment_timing: ["الدفع", "تحويل", "موعد", "مهله"],
    receipt_upload: ["رفع الوصل", "/receipt", "الوصل"],
    first_installment: ["القسط الاول", "الدفعة الاولى", "بعد استلام"],
    installment_amount: ["القسط", "الدفعه"],
    installment_duration: ["شهر", "تقسيط"],
    product_price: ["سعر", "دينار", "المنتجات"],
    delivery: ["استلام", "توصيل", "المكتب"],
    guarantor: ["كفيل", "ضامن"],
    requirements: ["مطلوب", "الهوية", "كشف راتب", "كفيل"],
    application_status: ["حاله", "الطلب", "قيد", "مؤهل", "موافق"],
    site_issue: ["جرب", "الرابط", "الشاشه", "الموقع", "علق"],
    human_handoff: ["موظف", "الاداره", "الإدارة"],
  };
  return (map[topic] || []).some((needle) => r.includes(normalized(needle)));
}

function assistantQuestionTopic(reply: string | null | undefined): V2TopicKey | null {
  const r = normalized(reply);
  if (!r) return null;
  if (
    r.includes("عندك كفيل بدون ضمان") ||
    r.includes("ما عندك كفيل نهائيا") ||
    r.includes("هل عندك كفيل") ||
    r.includes("في كفيل")
  ) return "guarantor";
  if (
    r.includes("شو اخر شاشه") ||
    r.includes("شو اخر شاشة") ||
    r.includes("شو اللي بظهر") ||
    r.includes("شو بيظهر")
  ) return "site_issue";
  if (r.includes("اكد الغاء") || r.includes("أكد إلغاء")) return "cancellation";
  if (r.includes("اكد اعاده تفعيل") || r.includes("أكد إعادة تفعيل")) return "continuation";
  return null;
}

export function reduceConversationState(input: {
  state: V2ConversationState;
  turn: V2InterpretedTurn;
  turnId: string;
  customerText: string;
  actualReply?: string | null;
  applicationId?: string | null;
  trackingId?: string | null;
}): V2ConversationState {
  const stamp = now();
  const next: V2ConversationState = JSON.parse(JSON.stringify(input.state));
  next.version = "2.0-phase1";
  next.waId = input.state.waId;
  next.lastTurnId = input.turnId;
  next.lastCustomerText = input.customerText;
  next.lastAssistantText = input.actualReply || null;
  next.activeApplicationId = input.applicationId || next.activeApplicationId || null;
  next.activeTrackingId = input.trackingId || next.activeTrackingId || null;
  next.currentTopic = input.turn.topics.find((topic) => !["acknowledgement", "greeting", "unknown"].includes(topic)) || next.currentTopic || null;
  next.pendingCorrections = [...(next.pendingCorrections || []), ...input.turn.corrections].slice(-20);

  for (const act of input.turn.acts) {
    if (act.type === "provide_fact" && act.value) {
      const key = act.topic === "guarantor" ? "guarantor_availability" : `${act.topic}_customer_fact`;
      next.facts = upsertFact(next.facts || [], {
        key,
        value: String(act.value),
        source: act.source === "resolved" ? "resolved_reference" : "customer",
        topic: act.topic,
        confidence: act.confidence,
        turnId: input.turnId,
        updatedAt: stamp,
      });
      next.openLoops = closeLoopsForTopic(next.openLoops || [], act.topic);
    }

    if (["confirm", "deny"].includes(act.type)) {
      next.openLoops = closeLoopsForTopic(next.openLoops || [], act.topic);
    }

    if (act.type === "ask") {
      if (replyProbablyAnswersTopic(input.actualReply, act.topic)) {
        next.openLoops = closeLoopsForTopic(next.openLoops || [], act.topic);
      } else {
        next.openLoops = addLoop(next.openLoops || [], {
          id: `${input.turnId}:${act.id}`,
          topic: act.topic,
          owedBy: "assistant",
          state: "open",
          question: act.text,
          sourceTurnId: input.turnId,
          createdAt: stamp,
          updatedAt: stamp,
        });
      }
    }

    if (act.type === "handoff_request" && act.topic === "human_handoff") {
      next.humanHandoff = {
        requested: true,
        requestedAt: stamp,
        status: "requested",
      };
      next.openLoops = addLoop(next.openLoops || [], {
        id: `${input.turnId}:handoff`,
        topic: "human_handoff",
        owedBy: "staff",
        state: "open",
        question: "customer_requested_human_agent",
        sourceTurnId: input.turnId,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }

    if (act.type === "repair_request") {
      next.currentGoal = `repair:${act.topic}`;
    }
  }

  const assistantQuestion = assistantQuestionTopic(input.actualReply);
  if (assistantQuestion) {
    next.openLoops = addLoop(next.openLoops || [], {
      id: `${input.turnId}:assistant:${assistantQuestion}`,
      topic: assistantQuestion,
      owedBy: "customer",
      state: "open",
      question: input.actualReply || null,
      sourceTurnId: input.turnId,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  next.updatedAt = stamp;
  return next;
}
