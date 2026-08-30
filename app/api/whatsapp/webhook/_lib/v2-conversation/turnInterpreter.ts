import type { V2ConversationState, V2DialogueAct, V2InterpretedTurn } from "./types";
import { deterministicInterpret } from "./deterministicInterpreter";
import { interpretWithProvider } from "./provider";
import { resolveTurnReferences } from "./referenceResolver";
import { uniqueStrings, v2Normalize } from "./normalize";

function materialKey(act: V2DialogueAct) {
  return `${act.type}:${act.topic}:${act.action || ""}:${act.value || ""}`;
}

function mergeTurns(base: V2InterpretedTurn, llm: V2InterpretedTurn | null): V2InterpretedTurn {
  if (!llm) return base;

  const merged: V2InterpretedTurn = JSON.parse(JSON.stringify(base));
  const keys = new Set(merged.acts.map(materialKey));

  for (const act of llm.acts) {
    const key = materialKey(act);
    if (keys.has(key)) continue;
    // Deterministic safety anchors always stay; LLM may add semantic acts but cannot erase them.
    merged.acts.push({ ...act, id: `m${merged.acts.length + 1}` });
    keys.add(key);
  }

  const refKeys = new Set(merged.references.map((item) => `${item.kind}:${v2Normalize(item.text)}:${item.targetTopic || ""}`));
  for (const ref of llm.references) {
    const key = `${ref.kind}:${v2Normalize(ref.text)}:${ref.targetTopic || ""}`;
    if (!refKeys.has(key)) {
      merged.references.push(ref);
      refKeys.add(key);
    }
  }

  const correctionKeys = new Set(merged.corrections.map((item) => `${v2Normalize(item.replacement)}:${item.targetTopic || ""}`));
  for (const item of llm.corrections) {
    const key = `${v2Normalize(item.replacement)}:${item.targetTopic || ""}`;
    if (!correctionKeys.has(key)) {
      merged.corrections.push(item);
      correctionKeys.add(key);
    }
  }

  merged.source = "hybrid";
  merged.language = llm.language || base.language;
  merged.topics = uniqueStrings(merged.acts.map((item) => item.topic));
  merged.requestedActions = uniqueStrings(
    merged.acts.map((item) => item.action).filter((value): value is NonNullable<V2DialogueAct["action"]> => Boolean(value && value !== "none")),
  );
  merged.confidence = Math.max(base.confidence, llm.confidence);
  merged.warnings = uniqueStrings([...base.warnings, ...llm.warnings]);
  merged.provider = llm.provider || null;
  return merged;
}

function recentConversation(input: {
  conversationContext?: string | null;
  lastCustomerMessages?: string[];
  lastAssistantReplies?: string[];
}) {
  const useful = [
    ...(input.lastCustomerMessages || []).slice(0, 5).map((text) => `العميل: ${text}`),
    ...(input.lastAssistantReplies || []).slice(0, 5).map((text) => `الأمين: ${text}`),
  ].join("\n");
  const raw = useful || String(input.conversationContext || "");
  return raw.length > 5000 ? raw.slice(-5000) : raw;
}

export async function interpretConversationTurn(input: {
  customerText: string;
  messageType?: string | null;
  state?: V2ConversationState | null;
  conversationContext?: string | null;
  lastCustomerMessages?: string[];
  lastAssistantReplies?: string[];
  useProvider?: boolean;
}) {
  const deterministic = deterministicInterpret({
    customerText: input.customerText,
    messageType: input.messageType,
  });

  let combined = deterministic;
  let providerError: { code: string | null; message: string | null } | null = null;

  if (input.useProvider !== false) {
    const provider = await interpretWithProvider({
      customerText: input.customerText,
      messageType: input.messageType,
      recentConversation: recentConversation(input),
      openLoops: (input.state?.openLoops || [])
        .filter((item) => item.state === "open")
        .slice(-10)
        .map((item) => ({ topic: item.topic, owedBy: item.owedBy, question: item.question || null })),
      knownFacts: (input.state?.facts || [])
        .slice(-20)
        .map((item) => ({ key: item.key, value: item.value, topic: item.topic })),
    });

    if (provider.ok && provider.turn) {
      combined = mergeTurns(deterministic, provider.turn);
    } else {
      providerError = { code: provider.errorCode, message: provider.errorMessage };
      combined.provider = {
        model: provider.model,
        latencyMs: provider.latencyMs,
        parseMode: "failed",
        errorCode: provider.errorCode,
        errorMessage: provider.errorMessage,
      };
      combined.warnings = uniqueStrings([
        ...combined.warnings,
        `provider_fallback:${provider.errorCode || "unknown"}`,
      ]);
    }
  }

  const resolved = resolveTurnReferences({
    turn: combined,
    state: input.state || null,
    recentCustomerMessages: input.lastCustomerMessages,
    recentAssistantReplies: input.lastAssistantReplies,
  });

  return {
    turn: resolved,
    providerError,
  };
}
