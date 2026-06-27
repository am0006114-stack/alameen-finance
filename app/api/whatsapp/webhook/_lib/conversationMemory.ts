import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ConversationMemory = {
  conversationContext: string;
  lastAssistantReplies: string[];
  lastCustomerMessages: string[];
  lastIntent?: string | null;
  lastDirection?: string | null;
  lastTrackingId?: string | null;
  hasRecentConversation?: boolean;
};

function trimLine(value: string | null | undefined, max = 260) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "";

  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

function directionLabel(value: string | null | undefined) {
  if (value === "outgoing") return "الأمين";
  if (value === "incoming") return "العميل";

  return "رسالة";
}

function extractTrackingFromMemory(value: string | null | undefined) {
  const matches = String(value || "").match(/AM-\d{8,}/gi) || [];
  return matches.length ? matches[matches.length - 1].toUpperCase() : "";
}

export async function getConversationMemory(waId: string, limit = 18): Promise<ConversationMemory> {
  const empty: ConversationMemory = {
    conversationContext: "",
    lastAssistantReplies: [],
    lastCustomerMessages: [],
    lastIntent: null,
    lastDirection: null,
    lastTrackingId: null,
    hasRecentConversation: false,
  };

  const cleanWaId = String(waId || "").trim();

  if (!cleanWaId) return empty;

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("direction, body, intent, created_at, message_type")
      .eq("wa_id", cleanWaId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      if (error) console.error("getConversationMemory error:", error.message);
      return empty;
    }

    const chronological = [...data].reverse();

    const conversationContext = chronological
      .map((message) => {
        const body = trimLine(message.body, 420);
        if (!body) return "";

        const intent = message.intent ? ` / intent: ${message.intent}` : "";
        const messageType = message.message_type && message.message_type !== "text" ? ` / type: ${message.message_type}` : "";

        return `${directionLabel(message.direction)}${intent}${messageType}: ${body}`;
      })
      .filter(Boolean)
      .join("\n");

    const lastAssistantReplies = data
      .filter((message) => message.direction === "outgoing")
      .map((message) => trimLine(message.body, 280))
      .filter(Boolean)
      .slice(0, 3);

    const lastCustomerMessages = data
      .filter((message) => message.direction === "incoming")
      .map((message) => trimLine(message.body, 220))
      .filter(Boolean)
      .slice(0, 4);

    const newestMessageTime = data[0]?.created_at ? new Date(data[0].created_at).getTime() : NaN;
    const hasRecentConversation =
      Number.isFinite(newestMessageTime) && Date.now() - newestMessageTime <= 30 * 60 * 1000;

    return {
      conversationContext,
      lastAssistantReplies,
      lastCustomerMessages,
      lastIntent: data[0]?.intent || null,
      lastDirection: data[0]?.direction || null,
      lastTrackingId: extractTrackingFromMemory(conversationContext) || null,
      hasRecentConversation,
    };
  } catch (error) {
    console.error("getConversationMemory failed:", error);

    return empty;
  }
}
