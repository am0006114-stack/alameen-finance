export type HumanOsControl = {
  enabled: boolean;
  solEnabled: boolean;
  maxRecentTurns: number;
  maxPromptChars: number;
  source: "db" | "safe_default";
};

// Phase 17 — Single Writer Conversation Cutover
//
// The newer HumanConversationOS accumulated multiple customer-facing writers
// (authoritative reply chains, response repair writers, human-care egress, etc.)
// above the model. Production evidence showed those layers could overwrite the
// current customer question with stale payment/location/media/human-request
// templates. The live runtime already contains the Native Conversation Kernel,
// whose contract is one conversational writer plus deterministic truth/action
// validation. Phase 17 makes that path authoritative again.
//
// This is intentionally code-owned rather than DB-toggle-owned. A stale settings
// row must not be able to re-enable the multi-writer HumanConversationOS while
// Phase 17 is under evaluation. Re-enabling it requires an explicit code change
// and a new regression review.
const PHASE17_NATIVE_SINGLE_WRITER: HumanOsControl = {
  enabled: false,
  solEnabled: false,
  maxRecentTurns: 6,
  maxPromptChars: 18000,
  source: "safe_default",
};

export async function getHumanOsControl(): Promise<HumanOsControl> {
  return PHASE17_NATIVE_SINGLE_WRITER;
}
