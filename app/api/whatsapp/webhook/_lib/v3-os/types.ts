export const V3_OS_VERSION = "v3.0.0-phase7.8.0.1-informed-commercial-continuation-fee-rationale-integrity" as const;
// Backward compatibility anchor: v3.0.0-phase7.8.0-ai-native-conversation-brain-semantic-memory
// Backward compatibility anchor: v3.0.0-phase7.7.2-fresh-turn-open-loop-egress-integrity
// Backward compatibility anchor: v3.0.0-phase7.7.1-payment-journey-continuity-human-repair
// Backward compatibility anchor: v3.0.0-phase7.6.1-human-meaning-authority-semantic-residue-elimination
// Backward compatibility anchor: v3.0.0-phase7.6.0-human-company-runtime-identity-action-safety-conversation-control
// Backward compatibility anchor: v3.0.0-phase7.5.9.4-human-contact-isolation-continuity
// Backward compatibility anchor: v3.0.0-phase7.5.9.3-contact-isolation-current-intent-multiact-integrity
// Backward compatibility anchor: v3.0.0-phase7.5.9.2-final-regression-safe-human-judgment-runtime-safety-continuity
// Backward compatibility anchor: v3.0.0-phase7.5.9.1-regression-safe-human-judgment-runtime-safety-continuity
// Backward compatibility anchor: v3.0.0-phase7.5.9-human-judgment-runtime-safety-continuity
// Backward compatibility anchor: v3.0.0-phase7.5.8.1-regression-safe-current-human-turn-authority
// Backward compatibility anchor: v3.0.0-phase7.5.7.1-regression-safe-human-employee-operating-presence
// Backward compatibility anchor for Phase 7.5.7 self-tests: v3.0.0-phase7.5.7-human-employee-operating-presence
// Backward compatibility anchor for Phase 7.5.6 self-tests: v3.0.0-phase7.5.6-payment-conversion-integrity
// Backward compatibility anchor for Phase 7.5.5 self-tests: v3.0.0-phase7.5.5-answer-obligations-emotion-composition-fresh-public-facts
// Backward compatibility anchor for Phase 7.5.4.1 self-tests: v3.0.0-phase7.5.4.1-regression-safe-useful-human-answer-integrity
// Backward compatibility anchor for Phase 7.5.4: v3.0.0-phase7.5.4-useful-human-answer-integrity
// Backward compatibility anchor for Phase 7.5.3 self-tests: v3.0.0-phase7.5.3-human-semantic-repair
// Backward compatibility anchor for Phase 7.5.2 self-tests: v3.0.0-phase7.5.2-semantic-priority-human-refund-care
// Backward compatibility anchor for Phase 7.5.1.1 self-tests: v3.0.0-phase7.5.1.1-type-safe-routing-hotfix
// Backward compatibility anchor for Phase 7.4.6 self-tests: v3.0.0-phase7.4.6-conversation-repair-true-single-egress
// Backward compatibility anchor for Phase 7.4.5 self-tests: v3.0.0-phase7.4.5-single-response-authority
// Backward compatibility anchor for Phase 7.4.4 self-tests: v3.0.0-phase7.4.4-current-question-answer-contract
// Backward compatibility anchor for Phase 7.4.3 self-tests: v3.0.0-phase7.4.3-action-commercial-human-authority
// Backward compatibility anchor for historical Phase 7.1.1 self-tests: v3.0.0-phase7.1.1-truth-locked-actions

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
  | "record_call_preference"
  | "link_whatsapp_alias";

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


export type SemanticEntity = {
  surface: string;
  kind: "person" | "device" | "wallet_or_payment_app" | "bank" | "company" | "location" | "document" | "amount" | "date" | "other";
  role: string | null;
  knownFactStatus: "known" | "unknown" | "customer_claim";
  countryHint: "JO" | "unknown";
  confidence: number;
};

export type SemanticDecision = {
  continuation: "confirmed" | "declined" | "deferred" | "conditional" | "unknown";
  cancellation: "requested" | "question" | "declined" | "unknown";
  refund: "requested" | "question" | "unknown";
  aliasConfirmation: "confirmed" | "declined" | "unknown";
  condition: string | null;
};

export type SemanticTurnFrame = {
  meaningSummary: string;
  customerGoal: string | null;
  currentQuestion: string | null;
  answerObligations: string[];
  references: Array<{ surface: string; refersTo: string | null; confidence: number }>;
  entities: SemanticEntity[];
  decision: SemanticDecision;
  correctionOfPrevious: boolean;
  socialClosure: boolean;
  requiresExternalFact: boolean;
  externalFactNeeded: string | null;
  answerMode: "direct" | "grounded_reasoning" | "clarify" | "social";
  confidence: number;
  warnings: string[];
};

export type SemanticMemoryEntry = {
  key: string;
  value: string;
  kind: "goal" | "decision" | "entity" | "preference" | "constraint" | "concern" | "reference" | "fact";
  confidence: number;
  sourceTurnId: string;
  updatedAt: string;
};

export type SemanticMemoryEpisode = {
  turnId: string;
  customerMeaning: string;
  currentQuestion: string | null;
  customerGoal: string | null;
  continuationDecision: SemanticDecision["continuation"];
  assistantAnswer: string | null;
  createdAt: string;
};

export type SemanticMemoryState = {
  revision: number;
  activeGoal: string | null;
  activeQuestion: string | null;
  activeQuestionTurnId: string | null;
  lastMeaningSummary: string | null;
  continuationDecision: SemanticDecision["continuation"];
  continuationCondition: string | null;
  entries: SemanticMemoryEntry[];
  episodes: SemanticMemoryEpisode[];
  updatedAt: string;
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
  semantic?: SemanticTurnFrame | null;
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


export type VerifiedContactBinding = {
  aliasWaId: string;
  primaryWaId: string;
  verifiedByWaId: string;
  verifiedAt: string;
  method: "registered_sender_explicit_alias";
};

export type ContactResolutionState = {
  status: "blocked_mismatch" | "awaiting_admin_update" | "awaiting_alias_confirmation" | "verified_alias";
  trackingId: string | null;
  explanation: "different_whatsapp" | "no_whatsapp" | "international_number" | "changed_number" | "alternate_number" | null;
  updatedAt: string;
};


export type ConversationConstraintsState = {
  noLinks: boolean;
  whatsappOnly: boolean;
  avoidRepetition: boolean;
  sourceTurnId: string | null;
  updatedAt: string | null;
};


export type CommercialDisclosureState = {
  version: "2026-09-informed-fee-v1";
  applicationId: string | null;
  trackingId: string | null;
  status: "not_delivered" | "delivered" | "acknowledged";
  deliveredAt: string | null;
  deliveredTurnId: string | null;
  acknowledgedAt: string | null;
  acknowledgedTurnId: string | null;
};

export type HumanEmotion = "neutral" | "warm" | "confused" | "frustrated" | "angry" | "pleading";
export type HumanConcern = "delay" | "refund" | "payment" | "technical" | "trust" | "documents" | "availability" | "general" | null;

export type HumanRelationshipState = {
  lastEmotion: HumanEmotion;
  lastConcern: HumanConcern;
  frustrationStreak: number;
  delayTurnCount: number;
  warmTurnCount: number;
  lastGreetingTurnId: string | null;
  updatedAt: string;
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
  verifiedContactBinding: VerifiedContactBinding | null;
  contactResolution: ContactResolutionState | null;
  conversationConstraints: ConversationConstraintsState;
  humanRelationship?: HumanRelationshipState;
  semanticMemory?: SemanticMemoryState;
  commercialDisclosure?: CommercialDisclosureState;
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
  source: "current_message_tracking" | "conversation_binding" | "recent_conversation_tracking" | "unique_phone_match" | "unique_relevant_phone_match" | "verified_contact_alias" | "approved_contact_alias" | "tracking_safe_preview" | "verified_state_snapshot" | "archive_historical_truth" | "none";
  contactAccess?: "full" | "safe_preview" | "none";
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
  commercialStructureRule: string;
  additionalFeesRule: string;
  requirementsGuidanceRule: string;
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
  recentReleaseAvailabilityRule: string;
  recentReleaseNotBefore: string;
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
