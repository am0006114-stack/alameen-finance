import type { ApplicationRecord } from "../types";

export type V2DialogueActType =
  | "ask"
  | "request_action"
  | "confirm"
  | "deny"
  | "correct"
  | "provide_fact"
  | "provide_reason"
  | "repair_request"
  | "acknowledge"
  | "greet"
  | "thank"
  | "handoff_request"
  | "complaint"
  | "unknown";

export type V2TopicKey =
  | "application_status"
  | "review_timing"
  | "cancellation"
  | "continuation"
  | "refund"
  | "payment_fee"
  | "payment_method"
  | "payment_timing"
  | "payment_recipient"
  | "receipt_upload"
  | "first_installment"
  | "installment_amount"
  | "installment_duration"
  | "product_price"
  | "products"
  | "office_location"
  | "delivery"
  | "requirements"
  | "identity"
  | "salary"
  | "guarantor"
  | "site_issue"
  | "human_handoff"
  | "call_request"
  | "trust"
  | "business_identity"
  | "business_website"
  | "correction"
  | "repair"
  | "acknowledgement"
  | "greeting"
  | "unknown";

export type V2ActionKey =
  | "cancel_application"
  | "continue_application"
  | "decline_application"
  | "request_refund"
  | "stop_refund"
  | "upload_receipt"
  | "human_handoff"
  | "request_call"
  | "change_application"
  | "none";

export type V2DialogueAct = {
  id: string;
  type: V2DialogueActType;
  topic: V2TopicKey;
  text: string;
  action?: V2ActionKey | null;
  target?: string | null;
  value?: string | null;
  confidence: number;
  source: "deterministic" | "llm" | "resolved";
};

export type V2ReferenceCandidate = {
  text: string;
  kind: "deictic" | "short_answer" | "correction" | "repair" | "explicit";
  targetTopic?: V2TopicKey | null;
  targetActId?: string | null;
  confidence: number;
};

export type V2CorrectionCandidate = {
  originalText: string;
  replacement: string;
  targetTopic?: V2TopicKey | null;
  confidence: number;
};

export type V2InterpretedTurn = {
  version: "2.0-phase1";
  source: "deterministic" | "llm" | "hybrid";
  language: "ar" | "en" | "mixed";
  normalizedText: string;
  acts: V2DialogueAct[];
  topics: V2TopicKey[];
  references: V2ReferenceCandidate[];
  corrections: V2CorrectionCandidate[];
  requestedActions: V2ActionKey[];
  confidence: number;
  warnings: string[];
  provider?: {
    model?: string | null;
    latencyMs?: number | null;
    parseMode?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  } | null;
};

export type V2ConversationFact = {
  key: string;
  value: string;
  source: "customer" | "resolved_reference" | "system";
  topic: V2TopicKey;
  confidence: number;
  turnId: string;
  updatedAt: string;
};

export type V2OpenLoop = {
  id: string;
  topic: V2TopicKey;
  owedBy: "assistant" | "customer" | "system" | "staff";
  state: "open" | "answered" | "cancelled" | "blocked";
  question?: string | null;
  sourceTurnId: string;
  createdAt: string;
  updatedAt: string;
};

export type V2ConversationState = {
  version: "2.0-phase1";
  waId: string;
  activeApplicationId?: string | null;
  activeTrackingId?: string | null;
  currentTopic?: V2TopicKey | null;
  currentGoal?: string | null;
  openLoops: V2OpenLoop[];
  facts: V2ConversationFact[];
  pendingCorrections: V2CorrectionCandidate[];
  humanHandoff: {
    requested: boolean;
    requestedAt?: string | null;
    status?: "requested" | "queued" | "accepted" | "closed" | null;
  };
  lastTurnId?: string | null;
  lastCustomerText?: string | null;
  lastAssistantText?: string | null;
  updatedAt: string;
};

export type V2ConversationSnapshot = {
  conversationContext?: string;
  lastAssistantReplies?: string[];
  lastCustomerMessages?: string[];
};

export type V2ShadowQueueInput = {
  incomingMessageId: string;
  waId: string;
  customerName?: string | null;
  customerMessage: string;
  messageType?: string | null;
  actualReply: string;
  initialIntent?: string | null;
  trackingId?: string | null;
  application?: ApplicationRecord | null;
  conversationSnapshot?: V2ConversationSnapshot | null;
};

export type V2ShadowJob = {
  id: string;
  incoming_message_id: string;
  wa_id: string;
  customer_name?: string | null;
  customer_message: string;
  message_type?: string | null;
  actual_reply: string;
  initial_intent?: string | null;
  tracking_id?: string | null;
  application_id?: string | null;
  application_snapshot?: unknown;
  conversation_snapshot?: unknown;
  status: string;
  attempt_count: number;
  max_attempts: number;
  created_at?: string | null;
  locked_by?: string | null;
};

export type V2UnderstandingQuality = {
  score: number;
  pass: boolean;
  requiredTopics: V2TopicKey[];
  coveredTopics: V2TopicKey[];
  missingTopics: V2TopicKey[];
  criticalFlags: string[];
  warnings: string[];
};
