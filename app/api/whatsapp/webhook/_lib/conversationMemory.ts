import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hasAny, normalizeArabicText } from "./text";

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
  lastSubstantiveCustomerMessage?: string | null;
  lastUnansweredCustomerQuestion?: string | null;
  activeTopic?: string | null;
  customerTone?: "neutral" | "concerned" | "frustrated" | "angry" | "urgent";
  humanRequestedRecently?: boolean;
  managerSessionActive?: boolean;
  lastOperationalIntent?: string | null;
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

function inferLastConcernFromMemory(value: string | null | undefined) {
  const text = String(value || "");
  if (/الموقع|السايت|التتبع|الرابط|جلب الطلبات|خطأ|خطا|404|not found|error/i.test(text)) return "site_or_tracking_issue";
  if (/ارامكس|أرامكس|توصيل|شحن|مندوب|استلام|المكتب/i.test(text)) return "pickup_or_delivery";
  if (/نصب|احتيال|فلوسي|استرداد|شكوى|محامي|فضح/i.test(text)) return "complaint_or_dispute";
  if (/خطيبتي|خطيبي|زوجتي|زوجي|ابني|بنتي|امي|أمي|ابوي|أبوي|هدية|هديه|احراج|إحراج|محرج|بضحك عليها|بضحك عليه|باجلها|بأجلها|باجله|بأجله|وعدتها|وعدته|عيد ميلاد|عرس|خطبة/i.test(text)) return "emotional_or_gift_pressure";
  if (/وين الجهاز|وين طلبي|تأخير|تاخير|متى بستلم/i.test(text)) return "device_or_delay";
  return null;
}


function isQuestionLike(value: string | null | undefined) {
  const text = String(value || "").trim();
  const normalized = normalizeArabicText(text);
  if (!normalized) return false;

  return /[؟?]/.test(text) || hasAny(normalized, [
    "شو", "ليش", "كيف", "متى", "قديش", "كم", "وين", "هل", "يعني", "بقدر", "بنفع", "بزبط", "صح",
  ]);
}

function isGenericNonAnswer(value: string | null | undefined) {
  const text = normalizeArabicText(value);
  if (!text) return false;
  return hasAny(text, [
    "وصلتني الرساله لكن معناها مش واضح",
    "اكتب النقطه بكلمتين",
    "اكتب السؤال كامل بجمله واحده",
    "رح اجاوب على نفس النقطه مباشرة",
    "ما في تحديث جديد مختلف",
    "اذا سؤالك عن نقطه محدده",
    "حاليا ما عليك اي خطوه اضافيه",
  "ممكن توضحلي النقطه المقصوده",
    "ما في قرار جديد مختلف",
  ]);
}

function inferTopic(value: string | null | undefined) {
  const text = normalizeArabicText(value);
  if (!text) return null;
  if (hasAny(text, ["موظف", "اتواصل", "رقم الشركه", "احكي مع حدا", "human", "agent"])) return "human_contact";
  if (hasAny(text, ["الغاء طلب الاسترداد", "استرداد", "استرجاع", "رجعولي", "فلوسي", "مصاري"])) return "refund";
  if (hasAny(text, ["توريد", "المورد", "وصول الجهاز", "جدول الاستلام"])) return "supplier";
  if (hasAny(text, ["متى بتخلص الدراسه", "كم بدها وقت المعامله", "كم بدو وقت", "مدة المعامله", "كم يوم", "72 ساعه", "٧٢ ساعه"])) return "review_time";
  if (hasAny(text, ["الموافقه", "الموافقة", "قبول", "انقبل", "رفض", "القرار"])) return "approval";
  if (hasAny(text, ["دفع", "رسوم", "وصل", "حواله", "كليك", "cliq", "اورنج", "amenpay", "payamen"])) return "payment";
  if (hasAny(text, ["الغاء الطلب", "الغي الطلب", "اكد الغاء", "بطلت بدي"])) return "cancellation";
  if (hasAny(text, ["الطلب", "طلبي", "حاله الطلب", "شو صار", "صار اشي", "تحديث"])) return "status";
  return "general";
}

function inferTone(value: string | null | undefined): "neutral" | "concerned" | "frustrated" | "angry" | "urgent" {
  const text = normalizeArabicText(value);
  if (!text) return "neutral";
  if (hasAny(text, ["ضروري جدا", "مستعجل", "عاجل", "هسا", "الان"])) return "urgent";
  if (hasAny(text, ["نصب", "حراميه", "سرقه", "كذب", "مماطله", "جننتوني", "استوعبي", "افهمي", "bullshit", "fuck"])) return "angry";
  if (hasAny(text, ["صارلي", "طولتوا", "تاخير", "تأخير", "مو معقول", "ما حدا رد", "وينكم"])) return "frustrated";
  if (hasAny(text, ["قلقان", "خايف", "متوتر", "مش فاهم", "ما فهمت", "لو سمحت", "لو سمحتي"])) return "concerned";
  return "neutral";
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
    lastSubstantiveCustomerMessage: null,
    lastUnansweredCustomerQuestion: null,
    activeTopic: null,
    customerTone: "neutral",
    humanRequestedRecently: false,
    managerSessionActive: false,
    lastOperationalIntent: null,
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

    const visibleData = data.filter((message) =>
      message.message_type !== "admin_control" && message.message_type !== "status"
    );
    const chronological = [...visibleData].reverse();

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

    const lastAssistantReplies = visibleData
      .filter((message) => message.direction === "outgoing")
      .map((message) => trimLine(message.body, 280))
      .filter(Boolean)
      .slice(0, 4);

    const lastCustomerMessages = visibleData
      .filter((message) => message.direction === "incoming")
      .map((message) => trimLine(message.body, 220))
      .filter(Boolean)
      .slice(0, 6);

    const outgoingText = visibleData
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

    const latestPaymentOutgoing = visibleData.find((message) =>
      message.direction === "outgoing" &&
      /(AMENPAY|PAYAMEN|رسوم فتح الملف|\/receipt(?:$|[?#]))/i.test(String(message.body || ""))
    );
    const latestPaymentTime = latestPaymentOutgoing?.created_at
      ? new Date(latestPaymentOutgoing.created_at).getTime()
      : NaN;
    const isPaymentAssistanceActive =
      Number.isFinite(latestPaymentTime) &&
      Date.now() - latestPaymentTime <= 48 * 60 * 60 * 1000;

    const newestMessageTime = visibleData[0]?.created_at ? new Date(visibleData[0].created_at).getTime() : NaN;
    const hasRecentConversation =
      Number.isFinite(newestMessageTime) && Date.now() - newestMessageTime <= 30 * 60 * 1000;

    const incomingMessages = visibleData.filter((message) => message.direction === "incoming");
    const lastSubstantiveCustomerMessage = incomingMessages
      .map((message) => trimLine(message.body, 320))
      .find((body) => body.length >= 2 && !/^العميل تفاعل/.test(body)) || null;

    let pendingQuestion: string | null = null;
    for (const message of chronological) {
      const body = trimLine(message.body, 420);
      if (!body) continue;

      if (message.direction === "incoming" && isQuestionLike(body)) {
        pendingQuestion = body;
        continue;
      }

      if (message.direction === "outgoing" && pendingQuestion && !isGenericNonAnswer(body)) {
        const questionTopic = inferTopic(pendingQuestion);
        const answerTopic = inferTopic(body);
        if (questionTopic === "general" || questionTopic === answerTopic || body.length >= 70) {
          pendingQuestion = null;
        }
      }
    }

    const recentIncomingText = incomingMessages
      .slice(0, 6)
      .map((message) => String(message.body || ""))
      .join("\n");
    const activeTopic = inferTopic(`${pendingQuestion || ""}\n${recentIncomingText}`);
    const customerTone = inferTone(recentIncomingText);
    const humanRequestedRecently = hasAny(recentIncomingText, [
      "بدي احكي مع موظف", "بدي اتواصل مع موظف", "بدي موظف", "احكي مع موظف", "bring me a human", "get me a human", "talk to a human",
    ]);

    // جلسة عمران هي تصعيد آلي داخل نفس المحادثة، وليست تحويلًا لموظف بشري.
    // تبقى فعّالة لمدة ساعتين من آخر تعريف بعمران أو طلب صريح لموظف،
    // حتى يكمل العميل الحديث معه بدون أن تعود أسماء المتابعة العادية.
    const managerSessionMessage = visibleData.find((message) => {
      const body = String(message.body || "");
      if (message.direction === "outgoing" && /معك\s+عمران\s+من\s+متابعه\s+الحالات/i.test(normalizeArabicText(body))) {
        return true;
      }
      return message.direction === "incoming" && String(message.intent || "") === "human_agent";
    });
    const managerSessionTime = managerSessionMessage?.created_at
      ? new Date(managerSessionMessage.created_at).getTime()
      : NaN;
    const managerSessionActive = Number.isFinite(managerSessionTime) &&
      Date.now() - managerSessionTime <= 2 * 60 * 60 * 1000;

    const lastOperationalIntent = visibleData.find((message) =>
      message.direction === "incoming" &&
      message.intent &&
      !["unknown", "greeting", "thanks", "reaction"].includes(String(message.intent))
    )?.intent || null;

    return {
      conversationContext,
      lastAssistantReplies,
      lastCustomerMessages,
      lastIntent: visibleData[0]?.intent || null,
      lastDirection: visibleData[0]?.direction || null,
      lastTrackingId: extractTrackingFromMemory(incomingText) || extractTrackingFromMemory(conversationContext) || null,
      lastPhoneNumber: extractJordanPhoneFromMemory(incomingText) || null,
      lastCustomerConcern: inferLastConcernFromMemory(conversationContext),
      hasRecentConversation,
      sentUrls,
      hasRecentStaffIntro: visibleData
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
      lastSubstantiveCustomerMessage,
      lastUnansweredCustomerQuestion: pendingQuestion,
      activeTopic,
      customerTone,
      humanRequestedRecently,
      managerSessionActive,
      lastOperationalIntent,
    };
  } catch (error) {
    console.error("getConversationMemory failed:", error);

    return empty;
  }
}
