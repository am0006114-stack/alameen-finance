import { getV3Policy } from "./policy";
import type { ApplicationTruth, ConversationState, TruthBundle } from "./types";

export type TruthResolverInput = {
  state: ConversationState;
  currentMessageTrackingId?: string | null;
  uniquePhoneApplication?: ApplicationTruth | null;
  conversationBoundApplication?: ApplicationTruth | null;
  ambiguousApplications?: TruthBundle["ambiguousApplications"];
};

export function resolveTruth(input: TruthResolverInput): TruthBundle {
  const fetchedAt = new Date().toISOString();
  const policy = getV3Policy();
  if (input.currentMessageTrackingId && input.conversationBoundApplication?.trackingId === input.currentMessageTrackingId) {
    return { confidence: "authoritative", source: "current_message_tracking", application: input.conversationBoundApplication, ambiguousApplications: [], policy, fetchedAt };
  }
  if (input.state.activeApplicationId && input.conversationBoundApplication?.id === input.state.activeApplicationId) {
    return { confidence: "high", source: "conversation_binding", application: input.conversationBoundApplication, ambiguousApplications: [], policy, fetchedAt };
  }
  if (input.uniquePhoneApplication && !(input.ambiguousApplications?.length)) {
    return { confidence: "high", source: "unique_phone_match", application: input.uniquePhoneApplication, ambiguousApplications: [], policy, fetchedAt };
  }
  return { confidence: "none", source: "none", application: null, ambiguousApplications: input.ambiguousApplications || [], policy, fetchedAt };
}
