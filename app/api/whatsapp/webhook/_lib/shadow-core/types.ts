import type { ApplicationRecord, CustomerIntent } from "../types";

export type ShadowAgentId = "tala" | "fadwa" | "abdullah" | "abdulrahman" | "omran";
export type ShadowAgentRole = "followup" | "study" | "escalation";
export type ShadowDecisionMode = "deterministic" | "pro" | "flash";
export type ShadowPolicySeverity = "critical" | "warning";

export type ShadowTopic =
  | "order_status"
  | "review_time"
  | "bank_requirement"
  | "regulatory_status"
  | "business_identity"
  | "early_settlement"
  | "payment_method"
  | "payment_status"
  | "procedures"
  | "post_approval_steps"
  | "requirements"
  | "office_location"
  | "independence"
  | "delivery"
  | "supplier_delay"
  | "device_change"
  | "cancellation"
  | "refund"
  | "stop_refund"
  | "contact_number"
  | "phone_not_answered"
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

export type ShadowEvidenceSource =
  | "structured_facts"
  | "conversation_history"
  | "business_policy";

export type ShadowEvidence = {
  id: string;
  kind:
    | "current_device"
    | "device_change_request"
    | "device_change_submission"
    | "official_contact"
    | "business_policy"
    | "business_identity"
    | "regulatory_status";
  source: ShadowEvidenceSource;
  claim: string;
  value: string | null;
  excerpt: string | null;
  confidence: "high" | "medium";
};

export type ShadowDeviceChangeStatus =
  | "none"
  | "customer_requested"
  | "submitted_for_review"
  | "approved"
  | "rejected";

export type ShadowDeviceChangeRequest = {
  requested: boolean;
  requestedDevice: string | null;
  previousDevice: string | null;
  status: ShadowDeviceChangeStatus;
  source: "none" | "conversation_history" | "official_form" | "structured_facts";
  evidenceId: string | null;
};

export type ShadowFacts = {
  hasApplication: boolean;
  status: string | null;
  stage: string;
  statusLabel: string;
  customerGender: "male" | "female" | "unknown";
  customerAskedFinalApproval: boolean;
  paymentStatus: string | null;
  trackingId: string | null;
  customerName: string | null;
  deviceName: string | null;
  currentDevice: string | null;
  deviceChangeRequest: ShadowDeviceChangeRequest;
  evidence: ShadowEvidence[];
  officialContact: {
    localNumber: string;
    internationalNumber: string;
    website: string;
    businessHours: null;
  };
  businessIdentity: {
    brandName: string;
    legalName: null;
    activity: string;
    isBank: false;
    isFinanceCompany: false;
    isLender: false;
    offersLoans: false;
    centralBankSupervised: false;
  };
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

export type ShadowConversationSnapshot = {
  conversationContext?: string;
  lastAssistantReplies?: string[];
  lastCustomerMessages?: string[];
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
  conversationSnapshot?: ShadowConversationSnapshot | null;
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
  conversationSnapshot?: ShadowConversationSnapshot | null;
};
