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

export type ShadowCandidatePayload = {
  version: "multi-agent-v2-shadow";
  generatedAt: string;
  actualWaId: string;
  incomingMessageId: string | null;
  customerMessage: string;
  actualReply: string;
  candidateReply: string;
  initialIntent: CustomerIntent;
  agent: ShadowAgentId;
  topics: ShadowTopic[];
  facts: ShadowFacts;
  validation: ShadowValidation;
  model: string;
  generationMs: number;
  parseMode: "json" | "text" | "fallback";
  generationError?: string | null;
};

export type RunShadowModeInput = {
  waId: string;
  incomingMessageId?: string | null;
  customerName?: string | null;
  customerText: string;
  messageType?: string | null;
  initialIntent: CustomerIntent;
  actualReply: string;
  application?: ApplicationRecord | null;
  memory?: {
    conversationContext?: string;
    lastAssistantReplies?: string[];
    lastCustomerMessages?: string[];
  } | null;
  trackingId?: string | null;
  logShadow: (payload: ShadowCandidatePayload) => Promise<void>;
};
