import { normalizeArabicText } from "../text";
import type { CustomerIntent } from "../types";
import type { ShadowTopic } from "./types";

function containsAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalizeArabicText(value)));
}

export function detectShadowTopics(
  customerText: string,
  messageType: string | null | undefined,
  initialIntent: CustomerIntent,
): ShadowTopic[] {
  const text = normalizeArabicText(customerText);
  const type = String(messageType || "text").toLowerCase();
  const topics: ShadowTopic[] = [];
  const add = (topic: ShadowTopic) => {
    if (!topics.includes(topic)) topics.push(topic);
  };

  if (["audio", "voice"].includes(type)) add("voice_message");
  if (["image", "video", "sticker"].includes(type)) add("media_upload");
  if (type === "document") add("document_upload");

  if (containsAny(text, [
    "بدي التواصل مع احد الاعضاء الاخرين", "بدي التواصل مع أحد الأعضاء الآخرين",
    "بدي موظف ثاني", "موظف اخر", "موظف آخر", "حدا غيرك", "شخص غيرك",
    "غير الموظف", "غيري الموظف", "بدي عضو ثاني", "مع حدا ثاني",
  ])) {
    add("staff_change");
    add("human_agent");
  }

  if (initialIntent === "human_agent") add("human_agent");
  if (initialIntent === "order_status") add("order_status");
  if (initialIntent === "review_time" || initialIntent === "payment_review_time") add("review_time");
  if (["refund", "cancel_refund_request"].includes(initialIntent)) add("refund");
  if (["cancel_request", "cancel_confirmed"].includes(initialIntent)) add("cancellation");
  if (["complaint", "legal_threat", "social_media_threat", "device_delay_rage"].includes(initialIntent)) add("complaint");
  if (["trust_verification", "scam_accusation"].includes(initialIntent)) add("trust");

  if (containsAny(text, ["شو صار", "حاله الطلب", "حالة الطلب", "متابعه الطلب", "متابعة الطلب", "وين وصل الطلب", "اخر تحديث", "آخر تحديث"])) add("order_status");
  if (containsAny(text, ["كم بدها", "كم بدو", "قديش", "متى الرد", "متى بتخلص", "مدة الدراسة", "مده الدراسه", "كم يوم", "كم وقت"])) add("review_time");
  if (containsAny(text, ["يحتاج بنك", "بدها بنك", "لازم بنك", "بنك معين", "بنك محدد", "التقسيط بنك"])) add("bank_requirement");
  if (containsAny(text, ["اسدد كامل", "أسدد كامل", "سداد كامل", "ادفع كامل", "أدفع كامل", "دفعة واحدة", "دفعه وحده", "اغلق الاقساط", "أسكر الأقساط", "السداد المبكر"])) add("early_settlement");
  if (containsAny(text, ["كيف ادفع", "كيف أدفع", "وين ادفع", "وين أدفع", "كليك", "cliq", "محفظه", "محفظة", "تحويل بنكي"])) add("payment_method");
  if (containsAny(text, ["دفعت", "حولت", "وصل الدفع", "تأكد الدفع", "تاكد الدفع", "وين فلوسي"])) add("payment_status");
  if (containsAny(text, ["الاجراءات", "الإجراءات", "كيف بتم", "كيف تتم", "شو الخطوات", "طريقة التقديم", "طريقه التقديم"])) add("procedures");
  if (containsAny(text, ["شو المطلوب", "المتطلبات", "كفيل", "كشف راتب", "شهادة راتب", "شهاده راتب", "هويه", "هوية"])) add("requirements");
  if (containsAny(text, ["وين المكتب", "موقع المكتب", "عنوان المكتب", "وين موقعكم", "مكانكم", "الفرع", "فروعكم"])) add("office_location");
  if (containsAny(text, ["توصيل", "شحن", "مندوب", "استلام", "وين الجهاز"])) add("delivery");
  if (containsAny(text, ["المورد", "التوريد", "متى يوصل الجهاز", "متى بتوفر الجهاز"])) add("supplier_delay");
  if (containsAny(text, ["بدي الغي", "بدي ألغي", "الغاء الطلب", "إلغاء الطلب", "اكد الغاء", "أكد إلغاء"])) add("cancellation");
  if (containsAny(text, ["استرداد", "رجعولي", "رجعوا فلوسي", "بدي فلوسي", "استرجاع الرسوم"])) add("refund");
  if (containsAny(text, ["الغاء طلب الاسترداد", "إلغاء طلب الاسترداد", "وقف الاسترداد", "اوقف الاسترداد", "ما بدي استرداد", "بدي اكمل بالمعامله", "بدي أكمل بالمعاملة"])) add("stop_refund");
  if (containsAny(text, ["بدي موظف", "احكي مع موظف", "أحكي مع موظف", "بدي مسؤول", "احكي مع مسؤول", "أحكي مع مسؤول", "بدي عمران", "human", "manager"])) add("human_agent");
  if (containsAny(text, ["تأخير", "تاخير", "مماطله", "مماطلة", "ما بتردو", "ما حدا رد", "مش معقول", "صارلي", "طولتوا"])) add("complaint");
  if (containsAny(text, ["نصب", "نصاب", "احتيال", "حراميه", "حرامية", "شركة جد", "شركه جد", "كيف اثق", "كيف أضمن", "صادقين", "اتأكد انكم", "اتاكد انكم", "موثوقين", "مش واثق", "ما بدفع اي رسوم لما اتأكد"])) add("trust");

  if (!topics.length) add("general_question");
  return topics;
}
