export const V3_OS_VERSION = "v3.0.0-phase7.1.1-truth-locked-actions" as const;

export type AiRoleKey = "tala" | "fadwa" | "abdullah" | "abdulrahman" | "omran";
export type AiTier = "frontline" | "case_specialist" | "supervisor";

export type TopicKey =
  | "greeting" | "thanks" | "acknowledgement" | "unknown"
  | "application_status" | "application_correction" | "requirements" | "guarantor"
  | "products" | "device_change" | "device_recalculation" | "product_price"
  | "payment_fee" | "payment_method" | "payment_timing" | "payment_recipient" | "payment_status" | "payment_confirmation" | "receipt_upload"
  | "first_installment" | "installment_amount" | "installment_duration"
  | "delivery" | "office_location" | "appointment"
  | "review_timing" | "operational_pressure" | "refund" | "cancellation" | "continuation" | "reopen"
  | "complaint" | "trust" | "legal" | "social_threat" | "abuse"
  | "human_request" | "manager_request" | "call_request" | "repair" | "correction" | "website" | "tracking";

export type ActionKey =
  | "none"
  | "cancel_application"
  | "continue_application"
  | "request_refund"
  | "stop_refund"
  | "change_application_data"
  | "change_device"
  | "generate_secure_upload_link"
  | "generate_receipt_link"
  | "reopen_application"
  | "switch_ai_role"
  | "record_call_preference";

export type DialogueActType =
  | "ask" | "request_action" | "confirm" | "deny" | "correct" | "provide_fact"
  | "provide_reason" | "repair_request" | "acknowledge" | "greet" | "thank"
  | "complaint" | "request_role" | "unknown";

export type DialogueAct = {
  id: string;
  type: DialogueActType;
  topic: TopicKey;
  text: string;
  action?: ActionKey;
  value?: string | null;
  confidence: number;
  source: "deterministic" | "model" | "resolved";
};

export type InterpretedTurn = {
  turnId: string;
  rawText: string;
  normalizedText: string;
  acts: DialogueAct[];
  topics: TopicKey[];
  requestedActions: ActionKey[];
  sentiment: "calm" | "confused" | "frustrated" | "angry";
  urgency: "normal" | "urgent";
  explicitRoleRequest: AiRoleKey | "manager" | "staff" | null;
  confidence: number;
  warnings: string[];
};

export type OpenLoop = {
  id: string;
  topic: TopicKey;
  owedBy: "ai" | "customer" | "system";
  state: "open" | "answered" | "blocked" | "cancelled";
  sourceTurnId: string;
  question?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationFact = {
  key: string;
  value: string;
  topic: TopicKey;
  source: "customer" | "resolved_reference" | "system";
  confidence: number;
  turnId: string;
  updatedAt: string;
};

export type RoleState = {
  currentRole: AiRoleKey;
  tier: AiTier;
  reason: string;
  sinceTurnId: string | null;
  introduced: boolean;
};

export type VerifiedApplicationSnapshot = {
  application: ApplicationTruth;
  fetchedAt: string;
  degraded?: boolean;
  readWarnings?: string[];
};

export type ConversationState = {
  version: typeof V3_OS_VERSION;
  waId: string;
  activeApplicationId: string | null;
  activeTrackingId: string | null;
  currentTopic: TopicKey | null;
  currentGoal: string | null;
  role: RoleState;
  openLoops: OpenLoop[];
  facts: ConversationFact[];
  pendingAction: ActionKey | null;
  pendingActionPayload: ActionPayload | null;
  lastTurnId: string | null;
  lastCustomerText: string | null;
  lastAssistantText: string | null;
  consecutiveRiskTurns: number;
  lastVerifiedApplication: VerifiedApplicationSnapshot | null;
  updatedAt: string;
};

export type TruthConfidence = "none" | "low" | "medium" | "high" | "authoritative";

export type DocumentTruth = {
  loaded: boolean;
  types: string[];
  identityComplete: boolean | null;
  salarySlipUploaded: boolean | null;
  guarantorIdentityComplete: boolean | null;
  guarantorDataComplete: boolean | null;
  paymentReceiptUploaded: boolean | null;
};

export type ApplicationTruth = {
  id: string;
  createdAt?: string | null;
  trackingId: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  paymentStatus: string | null;
  paymentConfirmedAt: string | null;
  paymentReference: string | null;
  deviceId: string | null;
  deviceName: string | null;
  devicePrice: number | null;
  installmentMonths: number | null;
  downPayment: number | null;
  interestRate: number | null;
  monthlyPayment: number | null;
  totalWithInterest: number | null;
  salary: number | null;
  deliveryDelayUntil: string | null;
  guarantorName?: string | null;
  guarantorPhone?: string | null;
  guarantorNationalId?: string | null;
  preliminaryQualifiedAt?: string | null;
  paidClickedAt?: string | null;
  documents?: DocumentTruth | null;
};

export type TruthBundle = {
  confidence: TruthConfidence;
  source: "current_message_tracking" | "conversation_binding" | "recent_conversation_tracking" | "unique_phone_match" | "unique_relevant_phone_match" | "verified_state_snapshot" | "archive_historical_truth" | "none";
  application: ApplicationTruth | null;
  ambiguousApplications: Array<{ id: string; trackingId: string | null; deviceName: string | null; status: string | null; paymentStatus?: string | null }>;
  policy: PolicyTruth;
  fetchedAt: string;
  degraded?: boolean;
  readWarnings?: string[];
};

export type PolicyTruth = {
  businessName: string;
  generalLocation: string;
  fileOpeningFeeJod: number;
  fileOpeningFeeTiming: string;
  fileOpeningFeePurposeRule: string;
  fileOpeningFeeRefundRule: string;
  continuationReassuranceRule: string;
  firstInstallmentRule: string;
  pickupRule: string;
  secureDocumentsRule: string;
  independenceStatement: string;
  paymentAliases: string[];
  paymentWalletType: string;
  paymentBeneficiaryName: string;
  paymentMethodRule: string;
  paymentConfirmationRule: string;
  normalReviewWindow: string;
  reviewPressureLevel: "normal" | "high" | "severe";
  severePressureRule: string;
  refundPressureRule: string;
  disputeResolutionRule: string;
  autonomousSupervisorRule: string;
  forbiddenClaims: string[];
};

export type PlannedAnswer = {
  actId: string;
  topic: TopicKey;
  resolution: "answer" | "ask_narrow_question" | "defer_to_truth" | "execute_then_answer" | "acknowledge";
  instruction: string;
  truthRequired: boolean;
};

export type ActionPayload = Record<string, string | number | boolean | null>;

export type PlannedAction = {
  action: ActionKey;
  sourceActId: string;
  requiresConfirmation: boolean;
  authority: "deterministic" | "ai_planned";
  requiredRole: AiRoleKey;
  payload?: ActionPayload | null;
};

export type ReplyPlan = {
  objective: string;
  role: AiRoleKey;
  answerItems: PlannedAnswer[];
  actions: PlannedAction[];
  requiredFacts: string[];
  forbiddenClaims: string[];
  tone: "brief" | "supportive" | "firm" | "apologetic";
  shouldRespond: boolean;
};

export type ActionOutcome = "none" | "blocked" | "needs_confirmation" | "executed" | "already_done" | "failed" | "dry_run";

export type ActionResult = {
  action: ActionKey;
  outcome: ActionOutcome;
  executed: boolean;
  authoritativeSummary: string | null;
  mutationId: string | null;
  blocker: string | null;
  ownerRole?: AiRoleKey | null;
  details?: Record<string, unknown> | null;
};

export type VerificationReport = {
  pass: boolean;
  missingTopics: TopicKey[];
  unsupportedClaims: string[];
  truthContradictions: string[];
  actionClaimViolations: string[];
  policyViolations: string[];
  hierarchyViolations: string[];
  repetitionFlags: string[];
};

export type OsRunResult = {
  version: typeof V3_OS_VERSION;
  turn: InterpretedTurn;
  stateBefore: ConversationState;
  stateAfter: ConversationState;
  truth: TruthBundle;
  plan: ReplyPlan;
  actions: ActionResult[];
  verification: VerificationReport;
};
