import type { ApplicationRecord, CustomerIntent } from "../types";

export type ShadowAgentId = "followup" | "study" | "omran";

export type ShadowTopic =
  | "order_status"
  | "review_time"
  | "bank_requirement"
  | "early_settlement"
  | "payment_method"
  | "payment_status"
  | "procedures"
  | "requirements"
  | "office_location"
  | "delivery"
  | "supplier_delay"
  | "cancellation"
  | "refund"
  | "stop_refund"
  | "human_agent"
  | "staff_change"
  | "voice_message"
  | "media_upload"
  | "document_upload"
  | "complaint"
  | "trust"
  | "general_question";

export type ShadowFacts = {
  hasApplication: boolean;
  status: string | null;
  paymentStatus: string | null;
  trackingId: string | null;
  customerName: string | null;
  deviceName: string | null;
  paymentCurrentlyAllowed: boolean;
  paymentAlreadyConfirmed: boolean;
  refundActive: boolean;
  refundCompleted: boolean;
  isApproved: boolean;
  requiredDocument: "guarantor" | "salary_slip" | "identity" | null;
  reviewDurationText: string;
  officeAddressCanBeShared: boolean;
};

export type ShadowValidation = {
  valid: boolean;
  score: number;
  riskFlags: string[];
  answeredTopics: ShadowTopic[];
  missingTopics: ShadowTopic[];
};

export type ShadowAttemptResult = {
  providerAttempt: number;
  model: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  httpStatus: number | null;
  outcome: "success" | "http_error" | "network_error" | "timeout" | "parse_error";
  errorCode: string | null;
  errorMessage: string | null;
  rawResponse: string | null;
};

export type ShadowGenerationResult = {
  ok: boolean;
  retryable: boolean;
  candidateReply: string;
  model: string;
  generationMs: number;
  parseMode: "json" | "repaired_json" | "failed";
  providerHttpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: ShadowAttemptResult[];
};

export type ShadowEvaluation = {
  candidateReply: string;
  agent: ShadowAgentId;
  topics: ShadowTopic[];
  facts: ShadowFacts;
  validation: ShadowValidation;
  generation: ShadowGenerationResult;
};

export type ShadowQueueInput = {
  incomingMessageId: string;
  waId: string;
  customerName?: string | null;
  customerMessage: string;
  messageType?: string | null;
  actualReply: string;
  initialIntent: CustomerIntent;
  trackingId?: string | null;
  application?: ApplicationRecord | null;
  conversationSnapshot?: {
    conversationContext?: string;
    lastAssistantReplies?: string[];
    lastCustomerMessages?: string[];
  } | null;
};

export type ShadowEngineInput = {
  customerName?: string | null;
  customerMessage: string;
  messageType?: string | null;
  initialIntent: CustomerIntent;
  actualReply: string;
  trackingId?: string | null;
  application?: ApplicationRecord | null;
  conversationSnapshot?: {
    conversationContext?: string;
    lastAssistantReplies?: string[];
    lastCustomerMessages?: string[];
  } | null;
};
