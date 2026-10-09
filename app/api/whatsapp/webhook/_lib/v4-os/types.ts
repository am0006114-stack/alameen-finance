export const V4_OS_VERSION = "v4.0.0-human-ai-conversation-os-dev" as const;

export type V4Persona = "tala" | "fadwa" | "abdullah" | "abdulrahman" | "omran" | "khaled";
export type V4Decision = "ANSWER" | "ACT" | "ASK" | "ESCALATE" | "ACKNOWLEDGE" | "SILENCE";
export type V4Emotion = "neutral" | "warm" | "confused" | "frustrated" | "angry" | "anxious" | "distrustful" | "pleading";
export type V4ActionName =
  | "cancel_application"
  | "request_refund"
  | "stop_refund"
  | "change_application_data"
  | "change_device"
  | "reopen_application"
  | "link_whatsapp_alias"
  | "record_human_contact_request"
  | "continue_application";

export type V4ProcedureState = "requested" | "confirmation_required" | "confirmed" | "executing" | "executed" | "failed" | "cancelled";

export type V4Reference = {
  surface: string;
  refersTo: string | null;
  confidence: number;
};

export type V4TurnUnderstanding = {
  meaningSummary: string;
  currentGoal: string | null;
  explicitQuestions: string[];
  neededFactKeys: string[];
  requestedAction: V4ActionName | null;
  actionDisposition: "request" | "confirm" | "deny" | "conditional" | "none";
  requestedPersona: V4Persona | null;
  references: V4Reference[];
  emotion: V4Emotion;
  urgency: "normal" | "urgent";
  topicChanged: boolean;
  customerRejectedPreviousAnswer: boolean;
  customerWantsBrevity: boolean;
  noReplyRequested: boolean;
  identityQuestion: boolean;
  humanContactRequested: boolean;
  socialClosure: boolean;
  confidence: number;
  warnings: string[];
};

export type V4PendingProcedure = {
  name: V4ActionName;
  state: V4ProcedureState;
  requestedAtTurnId: string;
  confirmedAtTurnId: string | null;
  executedAtTurnId: string | null;
  payload: Record<string, unknown> | null;
  lastError: string | null;
};

export type V4CustomerDecision = {
  key: string;
  value: string;
  turnId: string;
  updatedAt: string;
};

export type V4ConversationEpisode = {
  turnId: string;
  customerText: string;
  meaningSummary: string;
  goal: string | null;
  assistantText: string | null;
  persona: V4Persona;
  emotion: V4Emotion;
  createdAt: string;
};

export type V4WorkingMemory = {
  version: typeof V4_OS_VERSION;
  conversationId: string;
  persona: V4Persona;
  activeGoal: string | null;
  activeGoalTurnId: string | null;
  openQuestions: Array<{ text: string; turnId: string; answered: boolean; active: boolean }>;
  pendingProcedure: V4PendingProcedure | null;
  customerDecisions: V4CustomerDecision[];
  factsAlreadyExplained: string[];
  rejectedAnswerFingerprints: string[];
  currentEmotion: V4Emotion;
  frustrationStreak: number;
  humanContactRequested: boolean;
  prefersBriefReplies: boolean;
  repetitionSensitivity: number;
  lastCustomerText: string | null;
  lastAssistantText: string | null;
  lastAssistantFingerprint: string | null;
  episodes: V4ConversationEpisode[];
  updatedAt: string;
};

export type V4TruthFact = {
  key: string;
  value: unknown;
  source: "database" | "policy" | "action_receipt" | "system";
  confidence: 1;
  customerVisible: boolean;
};

export type V4TruthBundle = {
  applicationId: string | null;
  trackingId: string | null;
  facts: Record<string, V4TruthFact>;
  verifiedActionReceipts: Array<{
    action: V4ActionName;
    executed: boolean;
    receiptId: string | null;
    summary: string | null;
  }>;
};

export type V4DraftClaim = {
  kind: "fact" | "action" | "timing" | "identity" | "emotion" | "courtesy";
  text: string;
  factKey?: string | null;
  action?: V4ActionName | null;
};

export type V4DraftResponse = {
  text: string | null;
  decision: V4Decision;
  claims: V4DraftClaim[];
  answeredQuestions: string[];
  usedFactKeys: string[];
  notes: string[];
};

export type V4CriticResult = {
  accepted: boolean;
  score: number;
  reasons: string[];
  repairInstructions: string[];
};

export type V4ActionExecutionResult = {
  action: V4ActionName;
  executed: boolean;
  receiptId: string | null;
  summary: string | null;
  error: string | null;
};

export type V4CommercialContinuationResult = {
  handled: boolean;
  persisted: boolean;
  receiptId: string | null;
  reply: string | null;
  blocker: string | null;
};

export interface V4CommercialContinuationExecutor {
  continue(input: {
    turnId: string;
    customerText: string;
  }): Promise<V4CommercialContinuationResult>;
}

export interface V4ModelAdapter {
  understand(input: {
    burstText: string;
    memory: V4WorkingMemory;
    truth: V4TruthBundle;
  }): Promise<V4TurnUnderstanding>;

  compose(input: {
    burstText: string;
    understanding: V4TurnUnderstanding;
    memory: V4WorkingMemory;
    truth: V4TruthBundle;
    decision: V4Decision;
    procedure: V4ProcedureResolution;
    repairInstructions?: string[];
  }): Promise<V4DraftResponse>;

  critique(input: {
    burstText: string;
    understanding: V4TurnUnderstanding;
    memory: V4WorkingMemory;
    truth: V4TruthBundle;
    draft: V4DraftResponse;
  }): Promise<V4CriticResult>;
}

export interface V4ActionExecutor {
  execute(input: {
    action: V4ActionName;
    payload: Record<string, unknown> | null;
    truth: V4TruthBundle;
    turnId: string;
  }): Promise<V4ActionExecutionResult>;
}

export type V4ProcedureResolution = {
  action: V4ActionName | null;
  nextState: V4ProcedureState | null;
  shouldExecute: boolean;
  needsConfirmation: boolean;
  reason: string;
};

export type V4TurnResult = {
  reply: string | null;
  decision: V4Decision;
  understanding: V4TurnUnderstanding;
  memory: V4WorkingMemory;
  procedure: V4ProcedureResolution;
  actionResult: V4ActionExecutionResult | null;
  commercialContinuation: V4CommercialContinuationResult | null;
  critic: V4CriticResult;
};
