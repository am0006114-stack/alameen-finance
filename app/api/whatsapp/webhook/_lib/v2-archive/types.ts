export type ArchiveCase = {
  id: string;
  source_message_id: string;
  source_created_at: string;
  wa_id: string;
  customer_name?: string | null;
  customer_message: string;
  message_type?: string | null;
  actual_intent?: string | null;
  actual_reply?: string | null;
  application_id?: string | null;
  tracking_id?: string | null;
  historical_truth?: Record<string, unknown> | null;
  historical_truth_confidence?: string | null;
  historical_truth_source?: string | null;
  status: string;
  attempt_count: number;
  max_attempts: number;
  locked_by?: string | null;
};

export type ArchiveContextMessage = {
  direction: "incoming" | "outgoing" | string;
  body: string;
  messageType?: string | null;
  createdAt?: string | null;
};

export type DeepSeekReplayResult = {
  interpretation: {
    acts: Array<{
      type: string;
      topic: string;
      action?: string | null;
      value?: string | null;
      evidence?: string | null;
    }>;
    topics: string[];
    references: Array<{ text: string; resolves_to?: string | null; confidence?: number }>;
    confidence: number;
  };
  plan: {
    must_answer: string[];
    facts_used: string[];
    prohibited_claims: string[];
    action_handling: string[];
  };
  candidate_reply: string;
  confidence: number;
  safety_flags: string[];
};

export type ArchiveJudgeResult = {
  actual: {
    intent_alignment: number;
    multi_topic_coverage: number;
    continuity: number;
    factual_grounding: number;
    action_safety: number;
    human_tone: number;
    overall: number;
  };
  candidate: {
    intent_alignment: number;
    multi_topic_coverage: number;
    continuity: number;
    factual_grounding: number;
    action_safety: number;
    human_tone: number;
    overall: number;
  };
  winner: "actual" | "candidate" | "tie";
  confidence: number;
  critical_failures_actual: string[];
  critical_failures_candidate: string[];
  reasons: string[];
  needs_adjudication: boolean;
};
