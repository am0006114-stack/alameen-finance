import type { ConversationMemory } from "./conversationMemory";
import type { ApplicationRecord, CustomerIntent } from "./types";
import { hasAny, normalizeArabicText } from "./text";

export type DialogueTone = "neutral" | "concerned" | "frustrated" | "angry" | "urgent";
export type DialogueTopic =
  | "status"
  | "approval"
  | "review_time"
  | "supplier"
  | "payment"
  | "refund"
  | "cancellation"
  | "human_contact"
  | "requirements"
  | "delivery"
  | "general";

export type DialogueResolution = {
  contextualText: string;
  intentOverride: CustomerIntent | null;
  topic: DialogueTopic;
  tone: DialogueTone;
  empathyLevel: "none" | "light" | "strong";
  isShortFollowup: boolean;
};

const GENERIC_NON_ANSWERS = [
  "وصلتني الرساله لكن معناها مش واضح",
  "اكتب النقطه بكلمتين",
  "اكتب السؤال كامل بجمله واحده",
  "رح اجاوب على نفس النقطه مباشرة",
  "ما في تحديث جديد مختلف",
  "اذا سؤالك عن نقطه محدده",
  "حاليا ما عليك اي خطوه اضافيه",
  "ممكن توضحلي النقطه المقصوده",
  "ما في قرار جديد مختلف",
];

function isQuestionLike(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return /[؟?]/.test(text) || hasAny(t, [
    "شو", "ليش", "كيف", "متى", "قديش", "كم", "وين", "هل", "ايش", "إيش",
    "يعني", "بقدر", "بنفع", "بزبط", "صح", "او كيف", "ولا كيف",
  ]);
}

export function isGenericNonAnswer(text: string | null | undefined) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return GENERIC_NON_ANSWERS.some((phrase) => t.includes(normalizeArabicText(phrase)));
}

function inferTopic(text: string): DialogueTopic {
  const t = normalizeArabicText(text);

  if (hasAny(t, ["موظف", "اتواصل", "اتصال", "رقم الشركه", "رقم الشركة", "احكي مع حدا", "human", "agent"])) {
    return "human_contact";
  }
  if (hasAny(t, ["الغاء طلب الاسترداد", "الغي طلب الاسترداد", "استمر بالمعامله", "اكمل بالمعامله", "بدي اكمل", "ما بدي استرداد"])) {
    return "refund";
  }
  if (hasAny(t, ["استرداد", "استرجاع", "رجعولي", "فلوسي", "مصاري", "المبلغ", "refund"])) {
    return "refund";
  }
  if (hasAny(t, ["الغي الطلب", "الغاء الطلب", "اكد الغاء", "بطلت بدي", "cancel"])) {
    return "cancellation";
  }
  if (hasAny(t, ["توريد", "المورد", "متوفر", "وصول الجهاز", "وصل الجهاز", "جدول الاستلام"])) {
    return "supplier";
  }
  if (hasAny(t, ["استلام", "تسليم", "موعد", "هذا الاسبوع", "هاد الاسبوع", "الاربعاء", "الخميس"])) {
    return "delivery";
  }
  if (hasAny(t, ["متى بتخلص الدراسه", "متى تخلص الدراسه", "كم بدها وقت المعامله", "كم بدو وقت", "مدة المعامله", "مده المعامله", "وقت الدراسه", "متى القرار", "كم يوم", "72 ساعه", "٧٢ ساعه"])) {
    return "review_time";
  }
  if (hasAny(t, ["الموافقه", "الموافقة", "انقبل", "قبول", "القرار", "موافق عليه", "رفض"])) {
    return "approval";
  }
  if (hasAny(t, ["دفع", "رسوم", "وصل", "حواله", "حوالة", "كليك", "cliq", "اورنج", "orange", "amenpay", "payamen"])) {
    return "payment";
  }
  if (hasAny(t, ["كفيل", "راتب", "هويه", "هوية", "شروط", "موظف بشركه", "فري لانس", "فريلانس"])) {
    return "requirements";
  }
  if (hasAny(t, ["الطلب", "طلبي", "حاله الطلب", "حالة الطلب", "شو صار", "صار اشي", "تحديث"])) {
    return "status";
  }

  return "general";
}

function inferTone(text: string): DialogueTone {
  const t = normalizeArabicText(text);

  if (hasAny(t, ["ضروري جدا", "ضروري جدًا", "مستعجل", "عاجل", "هسا", "الان", "الآن"])) {
    return "urgent";
  }
  if (hasAny(t, ["نصب", "حراميه", "حرامية", "سرقه", "سرقة", "كذب", "مماطله", "مماطلة", "جننتوني", "استوعبي", "افهمي", "مقرف", "زفت", "fuck", "bullshit"])) {
    return "angry";
  }
  if (hasAny(t, ["صارلي", "طولتوا", "تأخير", "تاخير", "ما حدا رد", "مو معقول", "حقّي", "حقي", "بدي اعرف", "وينكم"])) {
    return "frustrated";
  }
  if (hasAny(t, ["قلقان", "خايف", "متوتر", "مش فاهم", "ما فهمت", "ممكن توضح", "لو سمحت", "لو سمحتي"])) {
    return "concerned";
  }

  return "neutral";
}

export function classifyStandaloneDialogueIntent(text: string): CustomerIntent | null {
  const t = normalizeArabicText(text);
  if (!t) return null;

  // إلغاء طلب الاسترداد مختلف جذريًا عن إلغاء الطلب وطلب الاسترداد.
  if (hasAny(t, [
    "الغاء طلب الاسترداد", "إلغاء طلب الاسترداد", "الغي طلب الاسترداد", "ألغي طلب الاسترداد",
    "الغاء الاسترداد", "إلغاء الاسترداد", "ما بدي استرداد", "ما بدي الاسترداد",
    "بدي اكمل بالمعامله", "بدي أكمل بالمعاملة", "بدي اكمل في المعامله", "بدي أكمل في المعاملة",
    "ما بدي الغي الطلب", "ما بدي ألغي الطلب", "بدي استمر بالطلب", "بدي اكمل الطلب",
  ])) {
    return "refund_reversal_request";
  }

  if (["انتظر", "أنتظر", "بستنى", "استنى", "خلي الطلب", "اكمل انتظار", "أكمل انتظار"].includes(t)) {
    return "keep_request";
  }

  if (hasAny(t, [
    "بدي احكي مع موظف", "بدي اتواصل مع موظف", "احكي مع موظف بالشركه", "احكي مع موظف بالشركة",
    "ممكن موظف", "بدي موظف", "بدي حدا من الشركه", "بدي حدا من الشركة",
    "bring me a human", "get me a human", "talk to a human", "live agent", "real person",
  ])) {
    return "human_agent";
  }

  if (hasAny(t, [
    "متى بتخلص الدراسه", "متى بتخلص الدراسة", "متى تخلص الدراسه", "متى تخلص الدراسة",
    "كم بدها وقت المعامله", "كم بدها وقت المعاملة", "كم بدو وقت", "قديش بدو وقت",
    "المعامله كم يوم", "المعاملة كم يوم", "مدة المعامله", "مدة المعاملة",
    "قديش بتطول الدراسه", "قديش بتطول الدراسة", "متى القرار", "كم يوم للموافقه",
  ])) {
    return "review_time";
  }

  if (hasAny(t, [
    "متى التوريد", "كم بستغرق التوريد", "مدة التوريد", "مده التوريد", "متى يوصل من المورد",
    "متى ممكن من المورد", "التوريد كم", "موعد التوريد", "حسب علمك متى يوصل",
  ])) {
    return "supplier_delay_question";
  }

  const pureGreeting = ["مسا الخير", "مساء الخير", "صباح الخير", "السلام عليكم", "مرحبا", "هلا", "اهلا", "أهلا"].includes(t);
  if (pureGreeting) return "greeting";

  return null;
}

function shortFollowupNeedsContext(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  if (t.length <= 18) return true;
  return ["؟", "?", "الموافقه", "الموافقة", "الطلب", "التوريد", "تاخير", "تأخير", "ليش", "كيف", "متى", "صح", "او كيف", "ما فهمت", "مش فاهم"].includes(t);
}

function contextAnchor(memory: ConversationMemory) {
  return (
    memory.lastUnansweredCustomerQuestion ||
    memory.lastSubstantiveCustomerMessage ||
    memory.lastCustomerMessages?.find((message) => !isGenericNonAnswer(message)) ||
    ""
  );
}

export function resolveConversationTurn(input: {
  customerText: string;
  initialIntent: CustomerIntent;
  memory: ConversationMemory;
  app?: ApplicationRecord | null;
}): DialogueResolution {
  const current = String(input.customerText || "").trim();
  const standaloneOverride = classifyStandaloneDialogueIntent(current);
  const isShortFollowup = shortFollowupNeedsContext(current);
  const anchor = contextAnchor(input.memory);

  let contextualText = current;
  if (isShortFollowup && anchor && normalizeArabicText(anchor) !== normalizeArabicText(current)) {
    contextualText = `${anchor}\nمتابعة العميل: ${current}`;
  }

  const combinedTopic = inferTopic(`${anchor}\n${current}`);
  const currentTopic = inferTopic(current);
  const topic = currentTopic === "general" ? combinedTopic : currentTopic;
  const tone = inferTone(`${input.memory.lastCustomerMessages?.slice(0, 3).join("\n") || ""}\n${current}`);

  let intentOverride = standaloneOverride;

  if (!intentOverride && isShortFollowup) {
    if (topic === "approval" || topic === "status") intentOverride = "order_status";
    if (topic === "review_time") intentOverride = "review_time";
    if (topic === "supplier") intentOverride = "supplier_delay_question";
    if (topic === "refund" && input.app && (input.app.status === "refund_requested" || input.app.payment_status === "refund_requested")) {
      intentOverride = "refund";
    }
  }

  if (!intentOverride && input.initialIntent === "unknown" && topic === "review_time") {
    intentOverride = "review_time";
  }
  if (!intentOverride && input.initialIntent === "unknown" && topic === "supplier") {
    intentOverride = "supplier_delay_question";
  }
  if (!intentOverride && input.initialIntent === "unknown" && (topic === "status" || topic === "approval")) {
    intentOverride = "order_status";
  }

  const empathyLevel = tone === "angry" || tone === "frustrated"
    ? "strong"
    : tone === "concerned" || tone === "urgent"
      ? "light"
      : "none";

  return {
    contextualText,
    intentOverride,
    topic,
    tone,
    empathyLevel,
    isShortFollowup,
  };
}

export function shouldKeepOperationalReplyExact(intent: CustomerIntent) {
  return [
    "cancel_confirmed",
    "reopen_cancelled_confirmed",
    "device_change_confirmed",
    "application_data_correction_confirmed",
    "receipt_upload_confirmation",
    "reaction",
  ].includes(String(intent));
}

export function buildDialogueFallback(input: {
  deterministicReply: string;
  customerText: string;
  intent: CustomerIntent;
  memory?: ConversationMemory | null;
  topic?: DialogueTopic | null;
  tone?: DialogueTone | null;
}) {
  const deterministic = String(input.deterministicReply || "").trim();
  if (deterministic && !isGenericNonAnswer(deterministic)) return deterministic;

  const topic = input.topic || inferTopic(`${input.memory?.lastUnansweredCustomerQuestion || ""}\n${input.customerText}`);
  const tone = input.tone || inferTone(input.customerText);
  const empathy = tone === "angry" || tone === "frustrated" ? "فاهم إنك انزعجت، وحقك تاخذ جواب واضح. " : "";

  if (topic === "review_time") {
    return `${empathy}مدة الدراسة المعتادة من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات، والجمعة والسبت ما بتنحسب. إذا المدة تجاوزت ذلك، فالتأخير مرتبط بضغط المراجعات وما بدي أعطيك موعد غير مؤكد.`;
  }
  if (topic === "supplier") {
    return `${empathy}ما في موعد توريد مؤكد ظاهر حاليًا. أول ما يعتمد موعد وصول الجهاز وجدول الاستلام، بصلك التحديث على نفس المحادثة.`;
  }
  if (topic === "human_contact") {
    return "أكيد. رقم الشركة الرسمي 0788500337، وتم تثبيت طلبك للمتابعة المباشرة.";
  }

  const anchor = input.memory?.lastUnansweredCustomerQuestion || input.memory?.lastSubstantiveCustomerMessage || "";
  if (anchor) {
    return `${empathy}فهمت إنك تقصد: ${anchor}. ما بدي أخمّن بالمعلومة؛ رح أعتمد الحالة الحالية للطلب وأجاوبك على نفس النقطة.`;
  }

  return `${empathy}ممكن توضّحلي النقطة المقصودة بجملة قصيرة؟ بدي أجاوبك صح، مش أعطيك رد عام.`;
}

export function questionWasActuallyAnswered(question: string, answer: string) {
  if (!question || !answer) return false;
  if (isGenericNonAnswer(answer)) return false;

  const questionTopic = inferTopic(question);
  const answerTopic = inferTopic(answer);
  if (questionTopic === "general") return answer.length >= 20;
  return questionTopic === answerTopic || answer.length >= 60;
}
