import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ConversationMemory = {
  conversationContext: string;
  lastAssistantReplies: string[];
  lastCustomerMessages: string[];
  lastIntent?: string | null;
  lastDirection?: string | null;
  lastTrackingId?: string | null;
  lastPhoneNumber?: string | null;
  lastCustomerConcern?: string | null;
  hasRecentConversation?: boolean;
  sentUrls?: string[];
  hasRecentStaffIntro?: boolean;
  hasSentProductsLink?: boolean;
  hasSentTrackLink?: boolean;
  hasSentReceiptLink?: boolean;
  lastRelevantUrl?: string | null;
  isPaymentAssistanceActive?: boolean;
  hasExplainedPaymentFee?: boolean;
  hasExplainedRefundPolicy?: boolean;
  hasExplainedReviewTime?: boolean;
  hasPendingReopenConfirmation?: boolean;
  lastMeaningfulCustomerMessage?: string | null;
  lastQuestionLikeCustomerMessage?: string | null;
  hasRecentPreliminaryApprovalTemplate?: boolean;
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
  const raw = String(value || "");
  const explicitMatches = raw.match(/AM-\d{8,}/gi) || [];
  if (explicitMatches.length) return explicitMatches[explicitMatches.length - 1].toUpperCase();

  const numericMatches = raw.match(/(?:^|\D)(1\d{11,14})(?=\D|$)/g) || [];
  if (!numericMatches.length) return "";

  const digits = numericMatches[numericMatches.length - 1].replace(/\D/g, "");
  return digits ? `AM-${digits}` : "";
}

function extractJordanPhoneFromMemory(value: string | null | undefined) {
  const raw = String(value || "")
    .replace(/AM-\d{8,}/gi, " ")
    .replace(/(?:^|\D)1\d{11,14}(?=\D|$)/g, " ");
  const matches = raw.match(/(?:\+?962|00962|0)?7[789]\d{7}/g) || [];
  return matches.length ? matches[matches.length - 1] : "";
}

function extractUrlsFromMemory(value: string | null | undefined) {
  const matches = String(value || "").match(/https?:\/\/[^\s)]+/gi) || [];
  return Array.from(new Set(matches.map((url) => url.replace(/[،,.]+$/g, ""))));
}

function hasStaffIntro(value: string | null | undefined) {
  const text = String(value || "");
  return /(معك|معكِ|انا معك|أنا معك)\s+(عمران|عبدالله|عبدالرحمن|تالا|فدوة)/i.test(text);
}

function isTinyCustomerFollowup(value: string | null | undefined) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!text) return true;
  if (/^[؟?!.،,\s]+$/.test(text)) return true;

  return [
    "طيب", "طب", "يعني", "تمام", "اوكي", "أوكي", "ok", "okay", "اوك",
    "اه", "اها", "نعم", "صح", "ما فهمت", "مافهمت", "مش فاهم", "كيف يعني",
    "وضح", "وضحي", "؟", "?",
  ].includes(text);
}

function looksLikeCustomerQuestion(value: string | null | undefined) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || isTinyCustomerFollowup(text)) return false;

  return /[؟?]/.test(text) || /(?:^|\s)(?:كم|قديش|متى|امتى|إمتى|ليش|ليه|كيف|شو|هل|وين|أين|ايش|إيش|بقدر|بنفع|بزبط|لازم|ممكن|يعني)(?:\s|$)/i.test(text);
}


function inferLastConcernFromMemory(value: string | null | undefined) {
  const text = String(value || "");
  if (/الموقع|السايت|التتبع|الرابط|جلب الطلبات|خطأ|خطا|404|not found|error/i.test(text)) return "site_or_tracking_issue";
  if (/ارامكس|أرامكس|توصيل|شحن|مندوب|استلام|المكتب/i.test(text)) return "pickup_or_delivery";
  if (/نصب|احتيال|فلوسي|استرداد|شكوى|محامي|فضح/i.test(text)) return "complaint_or_dispute";
  if (/خطيبتي|خطيبي|زوجتي|زوجي|ابني|بنتي|امي|أمي|ابوي|أبوي|هدية|هديه|احراج|إحراج|محرج|بضحك عليها|بضحك عليه|باجلها|بأجلها|باجله|بأجله|وعدتها|وعدته|عيد ميلاد|عرس|خطبة/i.test(text)) return "emotional_or_gift_pressure";
  if (/وين الجهاز|وين طلبي|تأخير|تاخير|متى بستلم/i.test(text)) return "device_or_delay";
  return null;
}

export async function getConversationMemory(waId: string, limit = 60): Promise<ConversationMemory> {
  const empty: ConversationMemory = {
    conversationContext: "",
    lastAssistantReplies: [],
    lastCustomerMessages: [],
    lastIntent: null,
    lastDirection: null,
    lastTrackingId: null,
    lastPhoneNumber: null,
    lastCustomerConcern: null,
    hasRecentConversation: false,
    sentUrls: [],
    hasRecentStaffIntro: false,
    hasSentProductsLink: false,
    hasSentTrackLink: false,
    hasSentReceiptLink: false,
    lastRelevantUrl: null,
    isPaymentAssistanceActive: false,
    hasExplainedPaymentFee: false,
    hasExplainedRefundPolicy: false,
    hasExplainedReviewTime: false,
    hasPendingReopenConfirmation: false,
    lastMeaningfulCustomerMessage: null,
    lastQuestionLikeCustomerMessage: null,
    hasRecentPreliminaryApprovalTemplate: false,
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

        // لا نمرر تصنيف intent القديم إلى DeepSeek لأنه قد يكون خاطئًا.
        // نمرر النص وتسلسل الحوار فقط حتى يفهم الرسالة الحالية من سياقها.
        const messageType = message.message_type && message.message_type !== "text" ? ` / type: ${message.message_type}` : "";

        return `${directionLabel(message.direction)}${messageType}: ${body}`;
      })
      .filter(Boolean)
      .join("\n");

    const lastAssistantReplies = data
      .filter((message) => message.direction === "outgoing")
      .map((message) => trimLine(message.body, 280))
      .filter(Boolean)
      .slice(0, 4);

    const lastCustomerMessages = data
      .filter((message) => message.direction === "incoming")
      .map((message) => trimLine(message.body, 220))
      .filter(Boolean)
      .slice(0, 6);


    const incomingMessagesNewest = data
      .filter((message) => message.direction === "incoming")
      .map((message) => ({
        body: trimLine(message.body, 420),
        createdAt: message.created_at ? new Date(message.created_at).getTime() : NaN,
      }))
      .filter((message) => Boolean(message.body));

    const lastMeaningfulCustomerMessage = incomingMessagesNewest
      .find((message) => !isTinyCustomerFollowup(message.body))?.body || null;

    const lastQuestionLikeCustomerMessage = incomingMessagesNewest
      .find((message) => looksLikeCustomerQuestion(message.body))?.body || null;

    const recentTemplateMessage = data.find((message) =>
      message.direction === "outgoing" &&
      /تم إرسال Template الموافقة المبدئية للعميل|Template الموافقة المبدئية/i.test(String(message.body || ""))
    );
    const recentTemplateTime = recentTemplateMessage?.created_at
      ? new Date(recentTemplateMessage.created_at).getTime()
      : NaN;
    const hasRecentPreliminaryApprovalTemplate =
      Number.isFinite(recentTemplateTime) &&
      Date.now() - recentTemplateTime <= 6 * 60 * 60 * 1000;

    const outgoingText = data
      .filter((message) => message.direction === "outgoing")
      .map((message) => String(message.body || ""))
      .join("\n");

    // رقم الهاتف الذي يرسله العميل قد يخص طلبًا مسجلًا على رقم مختلف عن رقم واتساب الحالي.
    // نأخذه من رسائل العميل فقط حتى لا نلتقط رقم الشركة من ردودنا الرسمية.
    const incomingText = chronological
      .filter((message) => message.direction === "incoming")
      .map((message) => String(message.body || ""))
      .join("\n");

    const sentUrls = extractUrlsFromMemory(outgoingText);
    const latestRelevantUrl = sentUrls[0] || null;

    const latestPaymentOutgoing = data.find((message) =>
      message.direction === "outgoing" &&
      /(AMENPAY|AMEEENPAY|رسوم فتح الملف|\/receipt(?:$|[?#]))/i.test(String(message.body || ""))
    );
    const latestPaymentTime = latestPaymentOutgoing?.created_at
      ? new Date(latestPaymentOutgoing.created_at).getTime()
      : NaN;
    const isPaymentAssistanceActive =
      Number.isFinite(latestPaymentTime) &&
      Date.now() - latestPaymentTime <= 48 * 60 * 60 * 1000;

    const newestMessageTime = data[0]?.created_at ? new Date(data[0].created_at).getTime() : NaN;
    const hasRecentConversation =
      Number.isFinite(newestMessageTime) && Date.now() - newestMessageTime <= 30 * 60 * 1000;

    return {
      conversationContext,
      lastAssistantReplies,
      lastCustomerMessages,
      lastIntent: data[0]?.intent || null,
      lastDirection: data[0]?.direction || null,
      lastTrackingId: extractTrackingFromMemory(incomingText) || extractTrackingFromMemory(conversationContext) || null,
      lastPhoneNumber: extractJordanPhoneFromMemory(incomingText) || null,
      lastCustomerConcern: inferLastConcernFromMemory(conversationContext),
      hasRecentConversation,
      sentUrls,
      hasRecentStaffIntro: data
        .filter((message) => message.direction === "outgoing")
        .some((message) => hasStaffIntro(message.body)),
      hasSentProductsLink: sentUrls.some((url) => /\/products(?:$|[?#])/i.test(url)),
      hasSentTrackLink: sentUrls.some((url) => /\/track(?:$|[?#])/i.test(url)),
      hasSentReceiptLink: sentUrls.some((url) => /\/receipt(?:$|[?#])/i.test(url)),
      lastRelevantUrl: latestRelevantUrl,
      isPaymentAssistanceActive,
      hasExplainedPaymentFee: /رسوم فتح الملف[^\n]{0,80}(?:5|٥)\s*(?:دنانير|دينار)/i.test(outgoingText),
      hasExplainedRefundPolicy: /مسترده بالكامل|مستردة بالكامل|استرداد رسوم فتح الملف/i.test(outgoingText),
      hasExplainedReviewTime: /يومين\s*(?:الى|إلى)\s*(?:ثلاث|3)|2\s*(?:الى|إلى)\s*3\s*ايام عمل/i.test(outgoingText),
      hasPendingReopenConfirmation: /اكد اعاده تفعيل الطلب|أكد إعادة تفعيل الطلب|تأكيد إعادة فتح الطلب/i.test(outgoingText),
      lastMeaningfulCustomerMessage,
      lastQuestionLikeCustomerMessage,
      hasRecentPreliminaryApprovalTemplate,
    };
  } catch (error) {
    console.error("getConversationMemory failed:", error);

    return empty;
  }
}
