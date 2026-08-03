import type { ApplicationRecord, CustomerIntent } from "../types";

export type ShadowAgentId = "tala" | "fadwa" | "abdullah" | "abdulrahman" | "omran";
export type ShadowAgentRole = "followup" | "study" | "escalation";
export type ShadowDecisionMode = "deterministic" | "pro" | "flash";
export type ShadowPolicySeverity = "critical" | "warning";

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
  | "independence"
  | "delivery"
  | "supplier_delay"
  | "device_change"
  | "cancellation"
  | "refund"
  | "stop_refund"
  | "human_agent"
  | "staff_change"
  | "voice_message"
  | "media_upload"
  | "document_upload"
  | "unsupported_message"
  | "acknowledgement"
  | "complaint"
  | "trust"
  | "general_question";

export type ShadowFacts = {
  hasApplication: boolean;
  status: string | null;
  statusLabel: string;
  paymentStatus: string | null;
  trackingId: string | null;
  customerName: string | null;
  deviceName: string | null;
  messageType: string;
  paymentCurrentlyAllowed: boolean;
  paymentAlreadyConfirmed: boolean;
  paymentConfirmed: boolean;
  paymentReceiptPending: boolean;
  refundActive: boolean;
  refundCompleted: boolean;
  refundEligible: boolean;
  isApproved: boolean;
  isCancelled: boolean;
  requiredDocument: "guarantor" | "salary_slip" | "identity" | null;
  reviewDurationText: string;
  officeAddressCanBeShared: boolean;
};

export type ShadowRouteDecision = {
  agent: ShadowAgentId;
  agentName: string;
  role: ShadowAgentRole;
  mode: ShadowDecisionMode;
  reason: string;
  sensitiveRoute: boolean;
  templateId: string | null;
  requestedModel: string | null;
};

export type ShadowPolicyCheck = {
  id: string;
  passed: boolean;
  severity: ShadowPolicySeverity;
  message: string;
};

export type ShadowValidation = {
  valid: boolean;
  score: number;
  riskFlags: string[];
  answeredTopics: ShadowTopic[];
  missingTopics: ShadowTopic[];
  policyChecks: ShadowPolicyCheck[];
  criticalRiskCount: number;
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
  parseMode: "json" | "repaired_json" | "deterministic" | "failed";
  providerHttpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: ShadowAttemptResult[];
};

export type ShadowEvaluation = {
  candidateReply: string;
  draftReply: string;
  agent: ShadowAgentId;
  agentName: string;
  topics: ShadowTopic[];
  facts: ShadowFacts;
  route: ShadowRouteDecision;
  validation: ShadowValidation;
  draftValidation: ShadowValidation | null;
  generation: ShadowGenerationResult;
  fallbackApplied: boolean;
  deliveryReady: boolean;
  finalModel: string;
  decisionOutcome: "deterministic" | "model_approved" | "policy_fallback" | "technical_fallback" | "blocked";
  promptVersion: string;
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
  requestedModel?: string | null;
  waId?: string | null;
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
