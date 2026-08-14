import type { CustomerIntent } from "./types";

const HARD_EXACT_INTENTS = new Set<string>([
  "cancel_confirmed",
  "refund",
  "stop_refund",
  "cancel_refund_request",
  "continue_decision",
  "decline_decision",
  "reopen_cancelled_confirmed",
  "receipt_upload_confirmation",
  "tracking_link_request",
  "media_upload",
  "document_upload",
  "document_followup",
  "payment_link_issue",
  "system_prompt_request",
]);

const SOCIAL_EXACT_INTENTS = new Set<string>([
  "greeting",
  "thanks",
  "reaction",
  "staff_identity",
]);

const HUMAN_FIRST_PRO_INTENTS = new Set<string>([
  "unknown",
  "order_status",
  "review_time",
  "payment_review_time",
  "installment_info",
  "requirements",
  "products",
  "delivery",
  "payment",
  "payment_amount",
  "payment_method",
  "payment_timing",
  "payment_recipient",
  "payment_next_step",
  "payment_objection",
  "contact_info",
  "location",
  "website",
  "call_request",
  "human_agent",
  "office_pickup_policy",
  "office_payment_request",
  "voluntary_opt_out",
  "business_identity",
  "regulatory_status",
  "self_employed",
  "apply",
  "loan",
  "complaint",
  "trust_verification",
  "payment_dispute",
  "device_delay_rage",
  "emotional_pressure",
  "legal_threat",
  "social_media_threat",
  "scam_accusation",
  "supplier_delay_question",
]);

export function isHardExactCustomerIntent(intent: CustomerIntent) {
  return HARD_EXACT_INTENTS.has(String(intent));
}

export function isSocialExactCustomerIntent(intent: CustomerIntent) {
  return SOCIAL_EXACT_INTENTS.has(String(intent));
}

export function shouldReturnExactHumanFirstReply(intent: CustomerIntent) {
  return isHardExactCustomerIntent(intent) || isSocialExactCustomerIntent(intent);
}

export function shouldPreferHumanFirstPro(intent: CustomerIntent, customerText = "", hasRecentConversation = false) {
  if (isHardExactCustomerIntent(intent) || isSocialExactCustomerIntent(intent)) return false;
  if (HUMAN_FIRST_PRO_INTENTS.has(String(intent))) return true;
  const compact = String(customerText || "").trim();
  return hasRecentConversation || (compact.length > 0 && compact.length <= 80);
}

export function looksLikeRoboticClarification(value: string) {
  const text = String(value || "").trim();
  if (!text) return true;
  return [
    "اكتب السؤال كامل بجملة واحدة",
    "اكتب النقطة بكلمتين",
    "الرسالة قصيرة وما قدرت أحدد المقصود",
    "ما بدي أخمّن وأعطيك معلومة غلط",
    "وصلتني الرسالة، لكن معناها مش واضح عندي",
    "ابعث رقم الطلب إذا الموضوع متعلق بملفك، أو اكتب النقطة بجملة واحدة",
  ].some((needle) => text.includes(needle));
}

export function humanFirstStyleInstructions() {
  return `
أسلوب Human-First الإلزامي:
- الحماية والسياسات تعمل خلف الكواليس؛ لا تجعل العميل يشعر أنه يتحدث مع نموذج إجراءات أو شجرة خيارات.
- افهم المقصود من الرسالة الحالية مع آخر سياق قبل أن تطلب توضيحًا.
- جاوب السؤال أولًا، وبأقصر صياغة طبيعية تكفي. سؤال بسيط غالبًا يحتاج جملة أو جملتين فقط.
- استخدم لهجة أردنية مهنية طبيعية مثل: آه، تمام، مزبوط، فاهم عليك، حسب السياق؛ بدون مبالغة أو تصنع.
- لا تكرر اسم الموظف، رقم الطلب، حالة الطلب، أو عبارة حسب الدور إذا لم تكن مطلوبة للجواب.
- لا تحول سؤالًا بسيطًا إلى قائمة إجراءات أو بيان رسمي.
- لا تستخدم إيموجي في كل رد؛ استخدمه نادرًا فقط إذا كان مناسبًا طبيعيًا.
- لا تعتذر إلا إذا يوجد سبب فعلي للاعتذار.
- إذا كانت الرسالة قصيرة مثل تمام، طيب، يعني، تم، عبيته، كم شهر، اقرأ آخر سياق وحاول فهمها قبل طلب توضيح.
- إذا بدأت الرسالة بـ "تمام" أو "شكرا" ثم أكمل العميل بسؤال أو طلب، جاوب السؤال أو الطلب؛ ممنوع الرد بـ "العفو" فقط.
- الرسالة الحالية لها أولوية دلالية أعلى من المجاملة الافتتاحية ومن أي تصنيف سابق إذا كان معناها واضحًا.
- إذا قال العميل إنه رفع وصل الدفع أو يريد متابعة تأكيده، ابقَ في موضوع الوصل/الدفع ولا تحوله إلى شرح استرداد الرسوم لمجرد وجود عبارة "رسوم فتح الملف".
- إذا بقي نقص حقيقي يمنع الجواب، اسأل عن المعلومة الناقصة فقط بدل قول اكتب السؤال كامل.
- الرد الآمن الأساسي هو مصدر حقائق وحدود فقط، وليس قالبًا يجب نسخه حرفيًا.
- ممنوع إضافة حقيقة أو وعد أو إجراء غير موجود في الرد الآمن أو بيانات الطلب.
`;
}
