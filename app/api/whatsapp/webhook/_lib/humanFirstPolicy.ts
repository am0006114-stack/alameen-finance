import type { CustomerIntent } from "./types";

// V1.4.0 QUALITY-FIRST: exact replies are reserved for flows where wording is part
// of a state-changing or secure operation. Normal conversation goes through Pro.
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

export function isHardExactCustomerIntent(intent: CustomerIntent) {
  return HARD_EXACT_INTENTS.has(String(intent));
}

export function isSocialExactCustomerIntent(intent: CustomerIntent) {
  return SOCIAL_EXACT_INTENTS.has(String(intent));
}

export function shouldReturnExactHumanFirstReply(intent: CustomerIntent) {
  return isHardExactCustomerIntent(intent);
}

export function shouldPreferHumanFirstPro(intent: CustomerIntent, _customerText = "", _hasRecentConversation = false) {
  return !isHardExactCustomerIntent(intent);
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
    "وصلت سؤالك، وما رح أرسل لك جواب ناقص",
    "ابعث رقم الطلب إذا الموضوع متعلق بملفك، أو اكتب النقطة بجملة واحدة",
  ].some((needle) => text.includes(needle));
}

export function humanFirstStyleInstructions() {
  return `
أسلوب Quality-First Human الإلزامي:
- جودة فهم العميل أهم من تقليل عدد الاستدعاءات أو طول التفكير. لا تختصر الفهم لتوفير التكلفة.
- الحماية والسياسات تعمل خلف الكواليس؛ لا تجعل العميل يشعر أنه يتحدث مع نموذج إجراءات أو شجرة خيارات.
- افهم المقصود من الرسالة الحالية مع آخر سياق قبل أن تطلب توضيحًا.
- جاوب كل سؤال أو طلب موجود في الرسالة الحالية، وبنفس ترتيب العميل إذا كانت الرسالة متعددة النقاط.
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
- إذا ذكر العميل اسم صاحب طلب أو رقم تتبع محدد، هذا المرجع أعلى من أي اسم أو طلب سابق في المحادثة.
- إذا بقي نقص حقيقي يمنع الجواب، اسأل عن المعلومة الناقصة فقط بدل قول اكتب السؤال كامل.
- الرد الآمن الأساسي هو مصدر حقائق وحدود فقط، وليس قالبًا يجب نسخه حرفيًا.
- ممنوع إضافة حقيقة أو وعد أو إجراء غير موجود في الرد الآمن أو بيانات الطلب.
`;
}
