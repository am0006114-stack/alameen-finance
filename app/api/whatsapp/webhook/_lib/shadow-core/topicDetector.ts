import { normalizeArabicText } from "../text";
import type { CustomerIntent } from "../types";
import type { ShadowTopic } from "./types";

function containsAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalizeArabicText(value)));
}

function isAcknowledgementOnly(text: string) {
  const compact = text.replace(/\s+/g, "").trim();
  if (!compact) return false;
  if (/^(?:👍|✅|👌|🙏|💚|🌿|❤️|❤|🙂|😊|تمام|اوكي|ok|okay|شكرا|شكرًا|العفو)+$/i.test(compact)) return true;
  return false;
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
  const remove = (topic: ShadowTopic) => {
    const index = topics.indexOf(topic);
    if (index >= 0) topics.splice(index, 1);
  };

  if (type === "unsupported") add("unsupported_message");
  if (["audio", "voice"].includes(type)) add("voice_message");
  if (["image", "video", "sticker"].includes(type)) add("media_upload");
  if (type === "document") add("document_upload");
  if (isAcknowledgementOnly(String(customerText || "")) || initialIntent === "reaction" || initialIntent === "thanks") {
    add("acknowledgement");
  }

  if (containsAny(text, [
    "بدي التواصل مع احد الاعضاء الاخرين", "بدي موظف ثاني", "موظف اخر", "موظف آخر",
    "حدا غيرك", "شخص غيرك", "غير الموظف", "غيري الموظف", "بدي عضو ثاني", "مع حدا ثاني",
  ])) {
    add("staff_change");
    add("human_agent");
  }

  const paymentIntents: CustomerIntent[] = [
    "payment", "payment_amount", "payment_method", "payment_timing", "payment_recipient",
    "payment_next_step", "payment_review_time", "payment_objection", "payment_link_issue",
    "payment_trust_question", "alternative_payment_source", "continue_decision",
  ];
  const paymentStatusIntents: CustomerIntent[] = [
    "receipt_upload_needed", "receipt_upload_confirmation", "payment_dispute",
  ];
  const cancellationIntents: CustomerIntent[] = [
    "cancel_request", "cancel_confirmed", "decline_decision",
  ];
  const refundIntents: CustomerIntent[] = ["refund", "cancel_refund_request"];
  const deviceChangeIntents: CustomerIntent[] = [
    "device_change", "device_change_cancelled", "device_change_confirmed",
  ];

  if (initialIntent === "human_agent" || initialIntent === "staff_identity") add("human_agent");
  if (initialIntent === "contact_info" || initialIntent === "call_request") add("contact_number");
  if (initialIntent === "regulatory_status") add("regulatory_status");
  if (initialIntent === "business_identity") add("business_identity");
  if (initialIntent === "order_status") add("order_status");
  if (initialIntent === "review_time" || initialIntent === "payment_review_time") add("review_time");
  if (paymentIntents.includes(initialIntent)) add("payment_method");
  if (paymentStatusIntents.includes(initialIntent)) add("payment_status");
  if (refundIntents.includes(initialIntent)) add("refund");
  if (cancellationIntents.includes(initialIntent)) add("cancellation");
  if (deviceChangeIntents.includes(initialIntent)) add("device_change");
  if (initialIntent === "requirements" || initialIntent === "self_employed") add("requirements");
  if (initialIntent === "office_pickup_policy" || initialIntent === "location") add("office_location");
  if (initialIntent === "delivery" || initialIntent === "supplier_delay_question") add("delivery");
  if (["complaint", "legal_threat", "social_media_threat", "device_delay_rage", "emotional_pressure"].includes(initialIntent)) add("complaint");
  if (["trust_verification", "scam_accusation"].includes(initialIntent)) add("trust");
  if (["media_upload"].includes(initialIntent)) add("media_upload");
  if (["document_upload", "document_followup"].includes(initialIntent)) add("document_upload");
  if (["apply", "products", "installment_info", "loan"].includes(initialIntent)) add("procedures");

  if (containsAny(text, [
    "البنك المركزي", "مرخصين من البنك المركزي", "مرخصه من البنك المركزي", "مرخصة من البنك المركزي",
    "خاضعين للبنك المركزي", "خاضعه للبنك المركزي", "خاضعة للبنك المركزي", "رقابه البنك المركزي", "رقابة البنك المركزي",
  ])) add("regulatory_status");
  if (containsAny(text, [
    "اسم الشركه القانوني", "اسم الشركة القانوني", "الاسم القانوني", "شو اسم الشركه", "شو اسم الشركة",
    "اسمكم القانوني", "الاسم الرسمي للشركه", "الاسم الرسمي للشركة", "اسم الجهه", "اسم الجهة",
  ])) add("business_identity");

  if (containsAny(text, ["شو صار", "حاله الطلب", "حالة الطلب", "متابعه الطلب", "متابعة الطلب", "وين وصل الطلب", "اخر تحديث", "آخر تحديث", "شو صار بالطلب"])) add("order_status");
  if (containsAny(text, ["كم بدها", "كم بدو", "قديش", "متى الرد", "متى بتخلص", "مدة الدراسة", "مده الدراسه", "كم يوم", "كم وقت", "٣ ايام", "3 ايام"])) add("review_time");
  if (containsAny(text, ["يحتاج بنك", "بدها بنك", "لازم بنك", "بنك معين", "بنك محدد", "التقسيط بنك"])) add("bank_requirement");
  if (containsAny(text, ["اسدد كامل", "سداد كامل", "ادفع كامل", "دفعة واحدة", "اغلق الاقساط", "اسكر الاقساط", "السداد المبكر"])) add("early_settlement");
  if (containsAny(text, ["كيف ادفع", "وين ادفع", "كليك", "cliq", "محفظه", "محفظة", "تحويل بنكي", "الدفع", "٥ دنانير", "5 دنانير", "٥ ليرات", "5 ليرات"])) add("payment_method");
  if (containsAny(text, ["دفعت", "حولت", "وصل الدفع", "تأكد الدفع", "تاكد الدفع", "رفعت الوصل", "تأكيد الوصل"])) add("payment_status");
  if (containsAny(text, ["الاجراءات", "الإجراءات", "كيف بتم", "كيف تتم", "شو الخطوات", "ايش ضل خطوات", "ما هي الخطوات", "طريقة التقديم", "طريقه التقديم"])) add("procedures");
  if (containsAny(text, [
    "بعد الموافقه شو", "بعد الموافقة شو", "بعد ما تطلع الموافقه", "بعد ما تطلع الموافقة",
    "بعد الموافقه النهائيه", "بعد الموافقة النهائية", "الخطوات بعد الموافقه", "الخطوات بعد الموافقة",
    "شو الاجراءات بعد الموافقه", "شو الإجراءات بعد الموافقة", "اذا وافقو شو", "إذا وافقوا شو",
  ])) add("post_approval_steps");
  if (containsAny(text, ["شو المطلوب", "المتطلبات", "كفيل", "كشف راتب", "شهادة راتب", "شهاده راتب", "هويه", "هوية"])) add("requirements");
  if (containsAny(text, ["وين المكتب", "موقع المكتب", "عنوان المكتب", "وين موقعكم", "مكانكم", "الفرع", "فروعكم", "فروع"])) {
    add("office_location");
    if (containsAny(text, ["الفرع", "فروعكم", "فروع"])) add("independence");
  }
  if (containsAny(text, ["توصيل", "شحن", "مندوب", "استلام الجهاز", "وين استلم", "كيف استلم"])) add("delivery");
  if (containsAny(text, ["المورد", "التوريد", "متى يوصل الجهاز", "متى بتوفر الجهاز"])) add("supplier_delay");
  if (containsAny(text, ["بدي اغير الجهاز", "تغيير الجهاز", "غير الجهاز", "أغير الجهاز"])) add("device_change");
  if (containsAny(text, ["بدي الغي", "بدي ألغي", "الغاء الطلب", "إلغاء الطلب", "اكد الغاء", "أكد إلغاء"])) add("cancellation");
  const explicitRefundRequest = containsAny(text, [
    "استرداد", "استرجاع", "رجعولي", "رجعوا فلوسي", "بدي فلوسي", "استرجاع الرسوم",
    "متى بتم استرداد المصاري", "رجعهم", "رجعلي", "رجعوهم", "ردهم", "ردولي",
    "رجعوا الخمسه", "رجعوا الخمسة", "رجعولي الخمسه", "رجعولي الخمسة",
    "الخمس دنانير رجعهم", "الخمسه دنانير رجعهم", "الخمسة دنانير رجعهم",
  ]);
  if (explicitRefundRequest) {
    add("refund");
    remove("payment_method");
    remove("payment_status");
  }
  if (containsAny(text, ["الغاء طلب الاسترداد", "إلغاء طلب الاسترداد", "وقف الاسترداد", "اوقف الاسترداد", "ما بدي استرداد", "بدي اكمل بالمعامله", "بدي أكمل بالمعاملة"])) add("stop_refund");
  if (containsAny(text, [
    "بدي موظف", "احكي مع موظف", "بدي احكي مع موظف", "بدي اتحدث مع موظف", "بدي أتحدث مع موظف",
    "اريد التحدث مع موظف", "أريد التحدث مع موظف", "بدي مسؤول", "احكي مع مسؤول",
    "بدي عمران", "انسان مش بوت", "human", "manager",
  ])) add("human_agent");
  if (containsAny(text, [
    "بدي رقم موظف", "بدي رقم موضف", "رقم موظف", "رقم موضف", "رقم اتواصل", "رقم للتواصل",
    "في رقم نتواصل", "اعطيني رقم", "أعطيني رقم", "رقم تلفون للتواصل", "رقم الهاتف للتواصل",
    "اتصل عليكم", "اتواصل معكم", "بدي رقم تليفون احكي معه", "بدي رقم تلفون احكي معه",
    "بدي رقم اتواصل معكم", "تبعتولي رقم اتواصل معكم", "ابعثولي رقم اتواصل معكم",
    "معلش تبعتولي رقم اتواصل معكم",
  ])) add("contact_number");
  if (containsAny(text, [
    "ما بتردو", "ما بتردوا", "ما حدا رد", "الهاتف لا يرد", "التلفون ما برد", "اتصلت وما رديتو",
    "اتصلت وما رديتوا", "بحكي وما حدا برد", "الرن ما حدا برد",
  ])) add("phone_not_answered");
  if (containsAny(text, ["تأخير", "تاخير", "مماطله", "مماطلة", "ما بتردو", "ما حدا رد", "مش معقول", "صارلي", "طولتوا", "كذب", "مستحيل هيك"])) add("complaint");
  if (containsAny(text, ["نصب", "نصاب", "احتيال", "حراميه", "حرامية", "شركة جد", "شركه جد", "كيف اثق", "كيف أضمن", "صادقين", "اتأكد انكم", "موثوقين", "مش واثق"])) add("trust");

  // A phone number written inside the standard application-follow-up template is an identifier, not a contact request.
  const explicitContactQuestion = containsAny(text, [
    "بدي رقم موظف", "بدي رقم موضف", "رقم موظف", "رقم موضف", "رقم اتواصل", "رقم للتواصل",
    "في رقم نتواصل", "اعطيني رقم", "أعطيني رقم", "رقم تلفون للتواصل", "رقم الهاتف للتواصل",
    "اتصل عليكم", "اتواصل معكم",
  ]) || initialIntent === "contact_info" || initialIntent === "call_request";
  const templatePhoneLabel = /(?:^|\n)\s*رقم\s+(?:الهاتف|التلفون)\s*:/i.test(text);
  if (topics.includes("contact_number") && templatePhoneLabel && !explicitContactQuestion) {
    const index = topics.indexOf("contact_number");
    if (index >= 0) topics.splice(index, 1);
  }

  // Regulatory and identity questions are direct business-policy questions, not threats or complaints by themselves.
  if (topics.includes("regulatory_status") || topics.includes("business_identity")) {
    for (const noisyTopic of ["complaint", "trust", "general_question"] as ShadowTopic[]) {
      const index = topics.indexOf(noisyTopic);
      if (index >= 0) topics.splice(index, 1);
    }
  }

  // Explicit wording in the current message outranks a noisy legacy intent.
  if (topics.includes("contact_number") || topics.includes("phone_not_answered")) {
    const paymentIsExplicit = containsAny(text, ["كيف ادفع", "وين ادفع", "رسوم فتح الملف", "amenpay", "payamen", "كليك", "cliq"]);
    if (!paymentIsExplicit) {
      const paymentIndex = topics.indexOf("payment_method");
      if (paymentIndex >= 0) topics.splice(paymentIndex, 1);
      const paymentStatusIndex = topics.indexOf("payment_status");
      if (paymentStatusIndex >= 0) topics.splice(paymentStatusIndex, 1);
    }
  }

  if (topics.includes("post_approval_steps")) {
    const proceduresIndex = topics.indexOf("procedures");
    if (proceduresIndex >= 0) topics.splice(proceduresIndex, 1);
  }

  // V1.1.4 DEVICE SELECTION TOPIC START
  if (initialIntent === "apply") add("device_selection");
  if (containsAny(text, [
    "ما اخترت جهاز", "ما اخترت الجهاز", "ما اخترت تلفون", "ما اخترت موبايل",
    "لم اختر جهاز", "ما حددت جهاز", "بدون جهاز",
    "كيف اختار جهاز", "كيف أختار جهاز", "وين اختار جهاز", "وين أختار جهاز",
    "رابط اختيار الجهاز", "اختيار الجهاز", "اختيار جهاز",
    "بدي اختار جهاز", "بدي أختار جهاز", "احدد الجهاز", "أحدد الجهاز",
  ])) add("device_selection");
  // V1.1.4 DEVICE SELECTION TOPIC END

  if (!topics.length) add("general_question");
  return topics;
}
