import { normalizeArabicText } from "../text";
import type { CustomerIntent } from "../types";
import {
  customerAsksAmmanLocation,
  customerAsksGeneralOfficeArea,
  customerAsksCancellationPossibility,
  customerAsksCurrentNextStep,
  customerAsksReviewTiming,
  hasSubstantiveContentAfterSocialPrefix,
  isReceiptConfirmationCurrentText,
} from "../intentAlignment";
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
  const substantiveAfterSocial = hasSubstantiveContentAfterSocialPrefix(String(customerText || ""));
  if (isAcknowledgementOnly(String(customerText || "")) || ((initialIntent === "reaction" || initialIntent === "thanks") && !substantiveAfterSocial)) {
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
  const trackingNumberDefinition = containsAny(text, [
    "شو يعني رقم التتبع", "ما هو رقم التتبع", "شو رقم التتبع", "ايش رقم التتبع", "ما معنى رقم التتبع",
  ]);
  if (trackingNumberDefinition) {
    add("general_question");
    remove("order_status");
  }

  if (initialIntent === "review_time" || initialIntent === "payment_review_time") add("review_time");
  if (paymentIntents.includes(initialIntent)) add("payment_method");
  if (paymentStatusIntents.includes(initialIntent)) add("payment_status");
  if (refundIntents.includes(initialIntent)) add("refund");
  if (initialIntent === "stop_refund") add("stop_refund");
  if (cancellationIntents.includes(initialIntent)) add("cancellation");
  if (deviceChangeIntents.includes(initialIntent)) add("device_change");
  if (initialIntent === "requirements" || initialIntent === "self_employed") add("requirements");
  if (initialIntent === "office_pickup_policy" || initialIntent === "location") add("office_location");
  if (initialIntent === "voluntary_opt_out") add("voluntary_opt_out");
  if (initialIntent === "office_payment_request") add("office_payment_request");
  if (initialIntent === "delivery" || initialIntent === "supplier_delay_question") add("delivery");
  if (["complaint", "legal_threat", "social_media_threat", "device_delay_rage", "emotional_pressure"].includes(initialIntent)) add("complaint");
  if (["trust_verification", "scam_accusation"].includes(initialIntent)) add("trust");
  if (["media_upload"].includes(initialIntent)) add("media_upload");
  if (["document_upload", "document_followup"].includes(initialIntent)) add("document_upload");
  if (["apply", "products", "installment_info", "loan"].includes(initialIntent)) add("procedures");

  // V1.3.1: the literal current message outranks a stale/social initial intent.
  if (customerAsksReviewTiming(customerText)) add("review_time");
  if (customerAsksCurrentNextStep(customerText)) add("order_status");
  if (customerAsksGeneralOfficeArea(customerText) || customerAsksAmmanLocation(customerText)) add("office_location");
  if (customerAsksCancellationPossibility(customerText)) add("cancellation");
  const currentReceiptConfirmation = isReceiptConfirmationCurrentText(customerText);
  if (currentReceiptConfirmation) {
    add("payment_status");
    remove("acknowledgement");
    remove("refund");
  }

  if (containsAny(text, [
    "البنك المركزي", "مرخصين من البنك المركزي", "مرخصه من البنك المركزي", "مرخصة من البنك المركزي",
    "خاضعين للبنك المركزي", "خاضعه للبنك المركزي", "خاضعة للبنك المركزي", "رقابه البنك المركزي", "رقابة البنك المركزي",
  ])) add("regulatory_status");
  if (containsAny(text, [
    "اسم الشركه القانوني", "اسم الشركة القانوني", "الاسم القانوني", "شو اسم الشركه", "شو اسم الشركة",
    "اسمكم القانوني", "الاسم الرسمي للشركه", "الاسم الرسمي للشركة", "اسم الجهه", "اسم الجهة",
    "نفس الامين للتمويل", "نفس الأمين للتمويل", "الامين للتمويل الاصغر", "الأمين للتمويل الأصغر",
    "تابعين للامين للتمويل", "تابعين للأمين للتمويل", "الكم علاقه بالامين للتمويل", "الكم علاقة بالأمين للتمويل",
  ])) add("business_identity");
  if (containsAny(text, [
    "نفس الامين للتمويل", "نفس الأمين للتمويل", "الامين للتمويل الاصغر", "الأمين للتمويل الأصغر",
    "تابعين للامين للتمويل", "تابعين للأمين للتمويل", "علاقه بالامين للتمويل", "علاقة بالأمين للتمويل",
  ])) add("independence");

  if (containsAny(text, ["شو صار", "حاله الطلب", "حالة الطلب", "متابعه الطلب", "متابعة الطلب", "وين وصل الطلب", "اخر تحديث", "آخر تحديث", "شو صار بالطلب"])) add("order_status");
  if (containsAny(text, [
    "كم بدها", "كم بدو", "قديش", "متى الرد", "متى بتخلص", "مدة الدراسة", "مده الدراسه",
    "كم يوم", "كم وقت", "٣ ايام", "3 ايام", "الرد بدو وقت", "الرد بده وقت", "الرد مطول",
    "طيب يعني لمتى", "متى رح يبين", "هل الرد يوخذ وقت طويل", "هل الرد ياخذ وقت طويل",
    "اليوم بتردولي خبر", "متى بتحكولي اه ولا لا", "قديش بقعد وقت", "كم بقعد وقت",
    "يعني بطول", "الوقت", "لمتى", "لحد متى", "اكثر من 72 ساعه", "أكثر من 72 ساعة", "72 ساعه", "72 ساعة",
    "صرلي اسبوعين", "صرله اسبوعين", "الي اسبوعين", "إلي أسبوعين",
  ])) add("review_time");
  if (containsAny(text, [
    "مواصفات", "الرام", "رامات", "سعة الرام", "سعه الرام", "مواصفات الجهاز", "تفاصيل الجهاز",
    "سماعة معه", "سماعه معه", "معه سماعة", "معه سماعه", "شاحن معه", "معه شاحن", "ملحقات",
    "القسط ع كم شهر", "القسط على كم شهر", "كم شهر تقسيط", "مدة التقسيط", "مده التقسيط",
    "فوائد", "فائدة", "فائده", "ربا", "ربوي", "شرعي", "حلال",
  ])) add("procedures");
  if (containsAny(text, ["12 شهر", "١٢ شهر", "18 شهر", "١٨ شهر", "24 شهر", "٢٤ شهر", "مدة القسط", "مده القسط"])) add("procedures");
  if (containsAny(text, ["يحتاج بنك", "بدها بنك", "لازم بنك", "بنك معين", "بنك محدد", "التقسيط بنك"])) add("bank_requirement");
  if (containsAny(text, ["اسدد كامل", "سداد كامل", "ادفع كامل", "دفعة واحدة", "اغلق الاقساط", "اسكر الاقساط", "السداد المبكر"])) add("early_settlement");
  const explicitOfficePaymentRequest = containsAny(text, [
    "ادفع بالمكتب", "أدفع بالمكتب", "الدفع بالمكتب", "دفع بالمكتب",
    "اجي ادفع بالمكتب", "أجي أدفع بالمكتب", "اجي عالمكتب ادفع", "أجي عالمكتب أدفع",
    "ادفع عندكم بالمكتب", "أدفع عندكم بالمكتب", "اعطيكم الرسوم بالمكتب", "أعطيكم الرسوم بالمكتب",
    "وين المكتب بدي ادفع", "وين المكتب بدي أدفع", "اعطيني الموقع وبدفع", "أعطيني الموقع وبدفع",
    "بقدر ادفع بالمكتب", "بقدر أدفع بالمكتب", "ممكن ادفع بالمكتب", "ممكن أدفع بالمكتب",
    "ما بدفع الا بالمكتب", "ما بدفع إلا بالمكتب", "ما بدي ادفع اونلاين", "ما بدي أدفع أونلاين",
  ]) || (
    containsAny(text, ["المكتب", "عالمكتب", "ع المكتب", "عندكم", "الموقع", "العنوان"]) &&
    containsAny(text, ["رسوم", "فتح الملف", "الخمسه", "الخمسة", "5 دنانير", "٥ دنانير"]) &&
    containsAny(text, ["ادفع", "أدفع", "دفع", "احول", "أحول", "تحويل"])
  );
  if (explicitOfficePaymentRequest) add("office_payment_request");

  const explicitVoluntaryOptOut = containsAny(text, [
    "لا ارغب بدفع اي شي", "لا أريد دفع أي شيء", "ما بدي ادفع", "ما بدي أدفع",
    "مش حاب ادفع", "مش حاب أدفع", "ما رح ادفع", "ما رح أدفع", "مش دافع", "مش دافعة",
    "لا ارغب بالاستمرار", "لا أرغب بالاستمرار", "لا اريد الاستمرار", "لا أريد الاستمرار",
    "ما بدي اكمل", "ما بدي أكمل", "مش حاب اكمل", "مش حاب أكمل", "ما بدي استمر",
  ]) && !containsAny(text, ["استرداد", "استرجاع", "رجعولي", "بدي فلوسي"])
    && !explicitOfficePaymentRequest;
  if (explicitVoluntaryOptOut) add("voluntary_opt_out");

  if (containsAny(text, ["كيف ادفع", "وين ادفع", "كليك", "cliq", "محفظه", "محفظة", "تحويل بنكي", "الدفع", "٥ دنانير", "5 دنانير", "٥ ليرات", "5 ليرات", "كيف الدفع الشهري", "اقتطاع من البنك", "اقتطاع مباشر", "ازور المكتب كل شهر", "كمبيالات", "كيف رح يصير دفع", "بعد الاستلام كيف ادفع"])) add("payment_method");
  if (explicitVoluntaryOptOut || explicitOfficePaymentRequest) remove("payment_method");
  if (explicitOfficePaymentRequest) remove("office_location");
  if (containsAny(text, ["دفعت", "حولت", "وصل الدفع", "تأكد الدفع", "تاكد الدفع", "رفعت الوصل", "تأكيد الوصل"])) add("payment_status");
  if (currentReceiptConfirmation) {
    remove("payment_method");
    remove("refund");
  }
  if (containsAny(text, ["ارفع قيمة القسط", "أرفع قيمة القسط", "بقدر لحد", "ميزانيتي", "اخليها ٥٠", "أخليها ٥٠", "اخليها 50", "أخليها 50"])) add("procedures");
  if (containsAny(text, ["الاجراءات", "الإجراءات", "كيف بتم", "كيف تتم", "شو الخطوات", "ايش ضل خطوات", "ما هي الخطوات", "طريقة التقديم", "طريقه التقديم"])) add("procedures");
  if (containsAny(text, [
    "بعد الموافقه شو", "بعد الموافقة شو", "بعد ما تطلع الموافقه", "بعد ما تطلع الموافقة",
    "بعد الموافقه النهائيه", "بعد الموافقة النهائية", "الخطوات بعد الموافقه", "الخطوات بعد الموافقة",
    "شو الاجراءات بعد الموافقه", "شو الإجراءات بعد الموافقة", "اذا وافقو شو", "إذا وافقوا شو",
  ])) add("post_approval_steps");
  if (containsAny(text, [
    "شو المطلوب", "المتطلبات", "كفيل", "كشف راتب", "شهادة راتب", "شهاده راتب", "هويه", "هوية",
    "اثبات دخل", "إثبات دخل", "شو الاوراق", "شو الأوراق", "شو اجهز", "شو أجهز",
    "مطلوب اي اشي لبعدين", "مطلوب أي اشي لبعدين", "مطلوب اشي بعدين", "في اشي مطلوب بعدين",
    "شو مطلوب مني", "مطلوب مني حالين", "مطلوب مني حاليا", "مطلوب مني حاليًا",
  ])) add("requirements");
  if (containsAny(text, [
    "يزبط اقدم", "يزبط أقدم", "بقدر اقدم", "بقدر أقدم", "اقدر اقدم", "أقدر أقدم",
    "مؤهل اقدم", "مؤهل أقدم", "مؤهله اقدم", "مؤهلة أقدم", "ينفع اقدم", "ينفع أقدم",
    "انا موظف", "انا موظفه", "أنا موظف", "أنا موظفة", "مشترك ضمان", "مشتركه ضمان",
  ]) && containsAny(text, ["اقدم", "أقدم", "طلب", "ضمان", "موظف", "موظفه", "موظفة"])) add("eligibility");
  if (containsAny(text, ["وين المكتب", "موقع المكتب", "عنوان المكتب", "وين موقعكم", "ممكن موقعكم", "موقعكم", "الموقع", "مكانكم", "موجود بعمان", "موجود في عمان", "انتو بعمان", "المكتب بعمان", "الفرع", "فروعكم", "فروع"])) {
    if (!explicitOfficePaymentRequest) add("office_location");
    if (containsAny(text, ["الفرع", "فروعكم", "فروع"])) add("independence");
  }
  if (containsAny(text, ["توصيل", "شحن", "مندوب", "استلام الجهاز", "وين استلم", "كيف استلم", "يوصلني الجهاز", "يوصل الجهاز", "استلم الجهاز فعلا", "أستلم الجهاز فعلا"])) add("delivery");
  if (containsAny(text, ["المورد", "التوريد", "متى يوصل الجهاز", "متى بتوفر الجهاز"])) add("supplier_delay");
  if (containsAny(text, ["بدي اغير الجهاز", "تغيير الجهاز", "غير الجهاز", "أغير الجهاز"])) add("device_change");
  if (containsAny(text, ["بدي الغي", "بدي ألغي", "الغاء الطلب", "إلغاء الطلب", "اكد الغاء", "أكد إلغاء"])) add("cancellation");
  const explicitNoRefund =
    containsAny(text, [
      "ما بدي استرد", "ما بدي استرجع", "بديش استرد", "بديش استرجع",
      "مش بدي استرد", "مش بدي استرجع", "لا اريد استرداد", "لا أريد استرداد",
      "لا اريد استرجاع", "لا أريد استرجاع", "مش طالب استرداد", "مش طالب استرجاع",
      "انا بستفسر", "أنا بستفسر", "بس بستفسر", "مجرد استفسار",
    ]);

  const refundTimingOrStatus =
    containsAny(text, [
      "متى", "امتى", "إمتى", "قديش بد", "كم بد", "كم يوم", "كم ساعه", "كم ساعة",
      "اليوم", "بكرا", "غدا", "غدًا", "وين وصل", "شو صار بالاسترداد", "حالة الاسترداد",
      "موعد الاسترداد", "وقت الاسترداد", "متى الحواله", "متى الحوالة",
    ]);

  const refundPolicyInquiry =
    !currentReceiptConfirmation && (explicitNoRefund ||
    (!refundTimingOrStatus &&
      containsAny(text, [
        "رسوم", "رسوم فتح الملف", "قيمة الملف", "قيمه الملف", "الخمس", "الخمسه", "الخمسة",
        "5", "٥", "دينار", "دنانير", "مبلغ", "المبلغ", "فلوس", "مصاري",
        "استرد", "استرداد", "استرجع", "استرجاع", "رجع", "بترجع", "برجع", "مسترد", "مسترده", "مستردة",
      ]) &&
      containsAny(text, [
        "هل", "اذا", "إذا", "لو", "في حال", "بحال",
        "بترجع", "برجع", "بيرجع", "ترجعلي", "ترجع", "يرجع",
        "مسترده", "مستردة", "مسترد",
        "بتنخصم", "تنخصم", "بينخصم", "ينخصم", "بتنهضم", "تنهضم",
        "من اول قسط", "من أول قسط", "من القسط الاول", "من القسط الأول",
        "شو بصير", "وين بتروح", "شو مصير", "بسال", "بسأل", "سؤال",
      ])));

  const strongRefundRequest = containsAny(text, [
    "استرداد", "استرجاع", "رجعوا فلوسي", "رجعولي فلوسي", "بدي فلوسي", "استرجاع الرسوم",
    "متى بتم استرداد المصاري", "رجعوا الخمسه", "رجعوا الخمسة",
    "رجعولي الخمسه", "رجعولي الخمسة",
    "بدي ارجع ال 5", "بدي أرجع ال 5", "بدي ارجع 5", "بدي أرجع 5",
    "بدي ارجع الخمس", "بدي أرجع الخمس", "بدي ارجع الرسوم", "بدي أرجع الرسوم",
    "بدي ارجع المبلغ", "بدي أرجع المبلغ",
    "الخمس دنانير رجعهم", "الخمسه دنانير رجعهم", "الخمسة دنانير رجعهم",
  ]);
  const ambiguousRefundVerb = containsAny(text, [
    "رجعولي", "رجعهم", "رجعلي", "رجعوهم", "ردهم", "ردولي",
  ]);
  const refundFinancialAnchor = containsAny(text, [
    "فلوس", "مصاري", "رسوم", "المبلغ", "مبلغ", "دينار", "دنانير",
    "الخمسه", "الخمسة", "حواله", "حوالة", "دفعت", "دفعته", "دفع",
  ]);
  const explicitRefundRequest = !refundPolicyInquiry && (strongRefundRequest || (ambiguousRefundVerb && refundFinancialAnchor));
  if (refundPolicyInquiry) {
    remove("refund");
    add("payment_method");
  } else if (explicitRefundRequest) {
    add("refund");
    remove("payment_method");
    remove("payment_status");
  }
  const stopRefundAnchor = containsAny(text, ["استرداد", "الاسترداد", "استرجاع", "الاسترجاع", "refund"]);
  const stopRefundVerb = containsAny(text, [
    "الغاء", "إلغاء", "الغي", "ألغي", "الغوا", "وقف", "اوقف", "أوقف", "ايقاف", "إيقاف",
    "تراجع", "تراجعت", "ما بدي", "لا اريد", "لا أريد",
  ]);
  const returnToOrder = containsAny(text, [
    "رجع طلب التلفون", "رجعولي طلب التلفون", "رجعوا طلب التلفون", "رجعولي الطلب", "رجعوا الطلب",
    "بدي ارجع للطلب بدل الاسترداد", "بدي أرجع للطلب بدل الاسترداد", "الرجوع الى طلبي", "الرجوع إلى طلبي",
  ]);
  if ((stopRefundAnchor && stopRefundVerb) || returnToOrder) {
    add("stop_refund");
    remove("refund");
  }
  if (containsAny(text, [
    "بدي موظف", "احكي مع موظف", "بدي احكي مع موظف", "بدي اتحدث مع موظف", "بدي أتحدث مع موظف",
    "اريد التحدث مع موظف", "أريد التحدث مع موظف", "بدي مسؤول", "احكي مع مسؤول",
    "بدي عمران", "انسان مش بوت", "human", "manager",
    "بدي اتواصل مع الاداره", "بدي أتواصل مع الإدارة", "اتواصل مع الاداره", "أتواصل مع الإدارة",
    "التواصل مع الاداره", "التواصل مع الإدارة",
  ])) add("human_agent");
  if (containsAny(text, [
    "بدي رقم موظف", "بدي رقم موضف", "رقم موظف", "رقم موضف", "رقم اتواصل", "رقم للتواصل",
    "في رقم نتواصل", "اعطيني رقم", "أعطيني رقم", "رقم تلفون للتواصل", "رقم الهاتف للتواصل",
    "اتصل عليكم", "اتواصل معكم", "بدي رقم تليفون احكي معه", "بدي رقم تلفون احكي معه",
    "بدي رقم اتواصل معكم", "تبعتولي رقم اتواصل معكم", "ابعثولي رقم اتواصل معكم",
    "معلش تبعتولي رقم اتواصل معكم", "رقم تواصل مكالمه", "رقم تواصل مكالمة",
    "في رقم ثاني لتواصل", "في رقم ثاني للتواصل", "رقم ثاني للتواصل", "تواصل مع الاداره",
    "تواصل مع الإدارة", "اتواصل مع الاداره", "أتواصل مع الإدارة",
  ])) add("contact_number");
  if (containsAny(text, [
    "ما بتردو", "ما بتردوا", "ما حدا رد", "الهاتف لا يرد", "التلفون ما برد", "اتصلت وما رديتو",
    "اتصلت وما رديتوا", "بحكي وما حدا برد", "الرن ما حدا برد", "ما حدا بجاوب على الرقم الرسمي",
    "ما حدا بجاوب", "الرقم الرسمي ما برد", "الرقم الرسمي ما بجاوب",
  ])) add("phone_not_answered");
  if (containsAny(text, [
    "اوقات الدوام", "أوقات الدوام", "ساعات الدوام", "ساعه الدوام", "ساعة الدوام",
    "الدوام ببلش", "الدوام ببدأ", "من اي ساعه لا اي ساعه", "من أي ساعة لأي ساعة",
    "ايام الدوام", "أيام الدوام", "الدوام الرسمي", "دوامكم", "متى الدوام",
  ])) {
    add("business_hours");
    remove("delivery");
  }
  if (containsAny(text, ["تأخير", "تاخير", "مماطله", "مماطلة", "ما بتردو", "ما حدا رد", "مش معقول", "صارلي", "طولتوا", "كذب", "مستحيل هيك", "اقدم شكوى", "اقدم شكوه", "قدما شكوه", "قدما شكوى"])) add("complaint");
  if (containsAny(text, ["نصب", "نصاب", "احتيال", "حراميه", "حرامية", "شركة جد", "شركه جد", "كيف اثق", "كيف أضمن", "صادقين", "اتأكد انكم", "موثوقين", "مش واثق", "بس عشان اتاكد", "عشان اتاكد", "قدمت اكثر من مكان", "بعدين ببطل يرد", "بضيع الوقت وانا استنى"])) add("trust");

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

  if (trackingNumberDefinition) {
    remove("order_status");
    remove("review_time");
    add("general_question");
  }

  if (!topics.length) add("general_question");
  return topics;
}
