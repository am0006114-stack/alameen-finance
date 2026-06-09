import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ConversationMemory = {
  conversationContext: string;
  lastAssistantReplies: string[];
  lastCustomerMessages: string[];
  lastIntent?: string | null;
  lastDirection?: string | null;
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

export async function getConversationMemory(waId: string, limit = 8): Promise<ConversationMemory> {
  const empty: ConversationMemory = {
    conversationContext: "",
    lastAssistantReplies: [],
    lastCustomerMessages: [],
    lastIntent: null,
    lastDirection: null,
  };

  const cleanWaId = String(waId || "").trim();

  if (!cleanWaId) return empty;

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("direction, body, intent, created_at")
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
        const body = trimLine(message.body, 320);
        if (!body) return "";

        const intent = message.intent ? ` / intent: ${message.intent}` : "";

        return `${directionLabel(message.direction)}${intent}: ${body}`;
      })
      .filter(Boolean)
      .join("\n");

    const lastAssistantReplies = data
      .filter((message) => message.direction === "outgoing")
      .map((message) => trimLine(message.body, 220))
      .filter(Boolean)
      .slice(0, 3);

    const lastCustomerMessages = data
      .filter((message) => message.direction === "incoming")
      .map((message) => trimLine(message.body, 180))
      .filter(Boolean)
      .slice(0, 3);

    return {
      conversationContext,
      lastAssistantReplies,
      lastCustomerMessages,
      lastIntent: data[0]?.intent || null,
      lastDirection: data[0]?.direction || null,
    };
  } catch (error) {
    console.error("getConversationMemory failed:", error);

    return empty;
  }
}
