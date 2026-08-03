import {
  BUSINESS_ADDRESS,
  BUSINESS_WEBSITE,
  FILE_OPENING_FEE_JOD,
} from "../constants";
import { normalizeArabicText } from "../text";
import type { CustomerIntent } from "../types";
import type { ShadowFacts, ShadowRouteDecision, ShadowTopic } from "./types";

export type DeterministicReplyPlan = {
  reply: string;
  templateId: string;
  reason: string;
};

function trackingLine(facts: ShadowFacts) {
  return facts.trackingId ? `\nرقم الطلب: ${facts.trackingId}` : "";
}

function deviceLine(facts: ShadowFacts) {
  return facts.deviceName ? `\nالجهاز: ${facts.deviceName}` : "";
}

function hasTopic(topics: ShadowTopic[], topic: ShadowTopic) {
  return topics.includes(topic);
}

function cancellationConfirmed(intent: CustomerIntent, text: string) {
  const normalized = normalizeArabicText(text);
  return intent === "cancel_confirmed" || normalized.includes("اكد الغاء الطلب");
}

function paymentExplanation(facts: ShadowFacts) {
  return `طلبك مؤهل مبدئيًا، ورسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط. الرسوم ليست قسطًا على الجهاز، ودفعها يبدأ استكمال مراجعة الملف والمتطلبات.
الرسوم مستردة بالكامل إذا لم تتم الموافقة النهائية، والقسط الأول يكون بعد استلام الجهاز حسب الاتفاق.
التحويل متاح من أي بنك يدعم CliQ أو من محفظة إلكترونية؛ لا يشترط وجود محفظة Orange Money لديك.
الجهة المستلمة: Orange Money
التحويل إلى: AMENPAY أو PAYAMEN
اسم المستفيد الظاهر: ABDUL RAHMAN ALHARAHSHEH
بعد التحويل ارفع الوصل فقط من الرابط الرسمي: ${BUSINESS_WEBSITE}/receipt
بعد تأكيد الوصل تستكمل الدراسة، والنتيجة عادةً من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات، والجمعة والسبت لا تُحسبان.${trackingLine(facts)}`;
}

function statusReply(facts: ShadowFacts) {
  if (!facts.hasApplication) {
    return "ما ظهر عندي طلب مرتبط بالمعلومات المتاحة حاليًا. أرسل رقم التتبع من الرسالة الرسمية حتى تتم مراجعة الطلب الصحيح.";
  }

  if (facts.refundCompleted) {
    return `حالة طلبك: تم تنفيذ الاسترداد.${trackingLine(facts)}`;
  }
  if (facts.refundActive) {
    return `حالة طلبك: طلب الاسترداد مسجل وقيد المتابعة. لا تحتاج تعيد تقديم البيانات أو ترسلها عبر واتساب، وأول ما يظهر تنفيذ فعلي توصلك رسالة رسمية.${trackingLine(facts)}`;
  }
  if (facts.isCancelled) {
    return `حالة طلبك: ملغي.${facts.paymentConfirmed ? " إذا لم تكتمل خطوة الاسترداد، استخدم الرابط الرسمي المرتبط بالطلب لتثبيت البيانات." : " لا يوجد دفع مؤكد على الملف."}${trackingLine(facts)}`;
  }
  if (facts.paymentReceiptPending) {
    return `وصل إشعار رفع الوصل، وهو الآن بانتظار التأكيد. لا تعيد الدفع ولا ترفع وصلًا ثانيًا.${trackingLine(facts)}`;
  }
  if (facts.requiredDocument === "guarantor") {
    return `حالة طلبك: الملف يحتاج بيانات الكفيل لاستكمال الدراسة. تعبئة البيانات تتم فقط من الرابط الرسمي المرتبط بالطلب، وليس عبر واتساب.${trackingLine(facts)}`;
  }
  if (facts.requiredDocument === "salary_slip") {
    return `حالة طلبك: الملف يحتاج كشف راتب رسمي لاستكمال الدراسة. الرفع يتم فقط من الرابط الرسمي المرتبط بالطلب، وليس عبر واتساب.${trackingLine(facts)}`;
  }
  if (facts.requiredDocument === "identity") {
    return `حالة طلبك: الملف يحتاج رفع الهوية من الرابط الرسمي المرتبط بالطلب. لا ترسل الهوية عبر واتساب.${trackingLine(facts)}`;
  }
  if (facts.paymentCurrentlyAllowed) {
    return `حالة طلبك: مؤهل مبدئيًا. الخطوة التالية هي تأكيد رغبتك بالاستمرار، وبعدها تصلك تعليمات رسوم فتح الملف الرسمية.${deviceLine(facts)}${trackingLine(facts)}`;
  }
  if (facts.isApproved) {
    return `حالة طلبك: تمت الموافقة النهائية. يتم إرسال موعد الحضور الرسمي بعد اعتماد جدول الاستلام، والاستلام من المكتب فقط دون توصيل.${trackingLine(facts)}`;
  }
  return `حالة طلبك: ${facts.statusLabel}. حاليًا ما في خطوة إضافية مؤكدة مطلوبة منك، وأول ما يظهر تحديث فعلي يتم التواصل معك.${trackingLine(facts)}`;
}

function requirementsReply(facts: ShadowFacts) {
  if (facts.requiredDocument === "guarantor") {
    return `المطلوب حاليًا هو تعبئة بيانات الكفيل من الرابط الرسمي المرتبط بطلبك. لا ترسل بيانات الكفيل عبر واتساب.${trackingLine(facts)}`;
  }
  if (facts.requiredDocument === "salary_slip") {
    return `المطلوب حاليًا هو رفع كشف راتب رسمي من الرابط الآمن المرتبط بطلبك. لا ترسل الكشف عبر واتساب.${trackingLine(facts)}`;
  }
  if (facts.requiredDocument === "identity") {
    return `المطلوب حاليًا هو رفع الهوية من الرابط الآمن المرتبط بطلبك. لا ترسل الهوية عبر واتساب.${trackingLine(facts)}`;
  }
  return `حسب حالة الطلب الظاهرة، لا يوجد مستند محدد مطلوب منك حاليًا. إذا تغيّرت متطلبات الدراسة، تصلك رسالة رسمية واضحة مع رابط الرفع الآمن.${trackingLine(facts)}`;
}

function paymentReply(facts: ShadowFacts) {
  if (facts.paymentConfirmed) {
    return `الدفع مؤكد على طلبك، وما في أي دفع إضافي مطلوب حاليًا. الملف ينتقل حسب حالته الحالية إلى المتابعة أو الدراسة.${trackingLine(facts)}`;
  }
  if (facts.paymentReceiptPending) {
    return `وصل إشعار رفع الوصل، وهو بانتظار التأكيد. لا تعيد الدفع ولا ترفع وصلًا ثانيًا، وأول ما يتم التأكيد تصلك رسالة رسمية.${trackingLine(facts)}`;
  }
  if (!facts.paymentCurrentlyAllowed) {
    return `لا يوجد دفع مطلوب أو مسموح حاليًا حسب حالة الطلب الظاهرة. تعليمات الدفع لا تُرسل إلا بعد التأهيل المبدئي.${trackingLine(facts)}`;
  }
  return paymentExplanation(facts);
}

function cancellationReply(facts: ShadowFacts, intent: CustomerIntent, text: string) {
  if (cancellationConfirmed(intent, text)) {
    if (facts.isCancelled) {
      return `تم إلغاء الطلب.${facts.paymentConfirmed ? ` لتثبيت بيانات الاسترداد استخدم الرابط الرسمي: ${BUSINESS_WEBSITE}/delay-decision` : " لا يوجد دفع مؤكد على الملف."}${trackingLine(facts)}`;
    }
    return `وصل تأكيدك النهائي بإلغاء الطلب. يجب أن ينفذ النظام خطوة الإلغاء أولًا، وبعد تحديث الحالة تظهر لك خطوات الاسترداد الرسمية إذا كان الدفع مؤكدًا.${trackingLine(facts)}`;
  }

  return `أكيد. قبل الإلغاء النهائي، اذكر سبب الإلغاء باختصار: تغيير بالقرار، تأخير، أو سبب آخر.
الإلغاء النهائي لا يتم إلا بعد كتابة: أكد إلغاء الطلب${trackingLine(facts)}`;
}

function refundReply(facts: ShadowFacts) {
  if (facts.refundCompleted) {
    return `الاسترداد مكتمل حسب الحالة الظاهرة على الطلب.${trackingLine(facts)}`;
  }
  if (facts.refundActive) {
    return `طلب الاسترداد مسجل وقيد المتابعة. لا يوجد موعد ثابت يمكن تأكيده قبل التنفيذ، وأول ما تتم الحوالة أو يظهر تحديث فعلي تصلك رسالة رسمية.${trackingLine(facts)}`;
  }
  if (facts.refundEligible) {
    return `لا يظهر طلب استرداد نشط حاليًا. بما أن الدفع مؤكد ولا توجد موافقة نهائية، يتم بدء الاسترداد فقط بعد إلغاء الطلب وتثبيت البيانات من الرابط الرسمي.${trackingLine(facts)}`;
  }
  return `لا يظهر طلب استرداد نشط أو مبلغ مؤكد قابل للاسترداد على الحالة الحالية. تتم مراجعة الطلب الصحيح من خلال رقم التتبع.${trackingLine(facts)}`;
}

function stopRefundReply(facts: ShadowFacts) {
  if (facts.refundCompleted) {
    return `الاسترداد ظاهر كمكتمل، لذلك لا يمكن اعتباره طلبًا نشطًا قابلًا للإيقاف. تتم مراجعة إعادة فتح الطلب كإجراء منفصل.${trackingLine(facts)}`;
  }
  if (facts.refundActive) {
    return `طلب الاسترداد نشط. إيقافه ليس تلقائيًا؛ يتم أولًا فحص إمكانية إيقافه قبل إعادة تفعيل الطلب، ولن يتم تأكيد العودة إلا بعد تحديث الحالة.${trackingLine(facts)}`;
  }
  return `لا يظهر طلب استرداد نشط حاليًا. تتم مراجعة حالة الطلب قبل أي إعادة تفعيل.${trackingLine(facts)}`;
}

function officeReply(facts: ShadowFacts, independence: boolean) {
  const independenceText = independence
    ? "الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق.\n"
    : "";
  if (facts.officeAddressCanBeShared) {
    return `${independenceText}الاستلام يكون من المكتب فقط وبموعد رسمي مسبق. عنوان المكتب: ${BUSINESS_ADDRESS}.${trackingLine(facts)}`;
  }
  return `${independenceText}لا يتم ذكر عنوان المكتب قبل الموافقة النهائية أو إرسال موعد حضور رسمي. الاستلام من المكتب فقط وبموعد مسبق، ولا يوجد توصيل.${trackingLine(facts)}`;
}

function mediaReply(facts: ShadowFacts, type: string, includeStatus: boolean) {
  const kind = type === "document" ? "المستند" : type === "audio" || type === "voice" ? "الرسالة الصوتية" : "المرفق";
  const base = type === "audio" || type === "voice"
    ? `وصلت ${kind}، لكن محتواها غير متاح للتحليل النصي هنا. اكتب النقطة بجملة قصيرة.`
    : `وصل ${kind}. أي هوية أو كشف راتب أو بيانات كفيل أو وصل دفع لا يُعتمد عبر واتساب؛ استخدم الرابط الرسمي المرتبط بالطلب.`;
  return includeStatus ? `${base}\n${statusReply(facts)}` : `${base}${trackingLine(facts)}`;
}

export function buildDeterministicReply(input: {
  facts: ShadowFacts;
  topics: ShadowTopic[];
  initialIntent: CustomerIntent;
  customerText: string;
  messageType: string | null | undefined;
  route: ShadowRouteDecision;
}): DeterministicReplyPlan {
  const { facts, topics, initialIntent, customerText } = input;
  const type = String(input.messageType || facts.messageType || "text").toLowerCase();

  if (hasTopic(topics, "unsupported_message")) {
    return {
      templateId: "unsupported-message-v1",
      reason: "نوع الرسالة غير مدعوم ولا يجوز افتراض محتواها.",
      reply: "وصلت رسالة غير مدعومة، وما بقدر أحدد محتواها. اكتب طلبك نصيًا بجملة قصيرة حتى يتم الرد على النقطة نفسها.",
    };
  }

  if (hasTopic(topics, "voice_message") || hasTopic(topics, "document_upload") || hasTopic(topics, "media_upload")) {
    return {
      templateId: "secure-media-v1",
      reason: "المرفقات والمستندات تخضع لمسار آمن ثابت.",
      reply: mediaReply(facts, type, hasTopic(topics, "order_status")),
    };
  }

  if (hasTopic(topics, "cancellation")) {
    return {
      templateId: cancellationConfirmed(initialIntent, customerText) ? "cancel-confirmed-v1" : "cancel-request-v1",
      reason: "الإلغاء مسار حتمي ولا يجوز للنموذج ادعاء تنفيذه.",
      reply: cancellationReply(facts, initialIntent, customerText),
    };
  }

  if (hasTopic(topics, "stop_refund")) {
    return { templateId: "stop-refund-v1", reason: "إيقاف الاسترداد يحتاج فحص حالة حتمي.", reply: stopRefundReply(facts) };
  }

  if (hasTopic(topics, "refund")) {
    return { templateId: "refund-status-v1", reason: "حالة الاسترداد تُقرأ من الطلب فقط.", reply: refundReply(facts) };
  }

  if (hasTopic(topics, "payment_method") || hasTopic(topics, "payment_status")) {
    return { templateId: "payment-state-v2", reason: "الدفع ووصل الدفع مساران حتميان.", reply: paymentReply(facts) };
  }

  if (hasTopic(topics, "requirements") || hasTopic(topics, "document_upload")) {
    return { templateId: "requirements-state-v1", reason: "لا يُطلب أي مستند إلا من requiredDocument.", reply: requirementsReply(facts) };
  }

  if (hasTopic(topics, "office_location") || hasTopic(topics, "independence")) {
    return {
      templateId: "office-policy-v1",
      reason: "العنوان والاستقلال عن الجهات المشابهة سياسة ثابتة.",
      reply: officeReply(facts, hasTopic(topics, "independence")),
    };
  }

  if (hasTopic(topics, "delivery")) {
    return {
      templateId: "pickup-only-v1",
      reason: "لا يوجد توصيل والاستلام مرتبط بالموافقة والموعد.",
      reply: `لا يوجد توصيل نهائيًا. الاستلام من المكتب فقط وبموعد مسبق بعد الموافقة النهائية واعتماد جدول الاستلام.${trackingLine(facts)}`,
    };
  }

  if (hasTopic(topics, "supplier_delay")) {
    return {
      templateId: "supplier-delay-v1",
      reason: "لا يجوز اختراع موعد توريد.",
      reply: `لا يوجد موعد توريد مؤكد ظاهر حاليًا. يتم التواصل مع أصحاب الطلبات المؤكدة بعد وصول الأجهزة واعتماد جدول الاستلام من المكتب.${trackingLine(facts)}`,
    };
  }

  if (hasTopic(topics, "device_change")) {
    return {
      templateId: "device-change-v1",
      reason: "تغيير الجهاز يتم من المسار الرسمي فقط.",
      reply: `تغيير الجهاز يتم فقط من الرابط الرسمي: ${BUSINESS_WEBSITE}/change-device. لا يتم اعتماد تغيير الجهاز من رسالة واتساب وحدها.${trackingLine(facts)}`,
    };
  }

  if (hasTopic(topics, "bank_requirement")) {
    return {
      templateId: "bank-requirement-v1",
      reason: "لا يوجد بنك محدد مطلوب للتقديم.",
      reply: "لا يوجد بنك محدد مطلوب لتقديم الطلب. عند استحقاق رسوم فتح الملف يمكن التحويل من أي بنك يدعم CliQ أو من محفظة إلكترونية حسب التعليمات الرسمية.",
    };
  }

  if (hasTopic(topics, "early_settlement")) {
    return {
      templateId: "early-settlement-v1",
      reason: "السداد المبكر لا يُضمن قبل الاتفاق النهائي.",
      reply: "إمكانية تسديد كامل الرصيد تعتمد على الاتفاق والجدول النهائي، لذلك ما بنقدر نضمنها مسبقًا قبل اعتماد الطلب.",
    };
  }

  if (hasTopic(topics, "review_time")) {
    return {
      templateId: "review-time-v1",
      reason: "مدة المراجعة ثابتة ضمن السياسة.",
      reply: `${facts.reviewDurationText}. إذا تجاوز الطلب المدة، لا نعطي موعدًا غير مؤكد؛ أول ما يظهر تحديث فعلي يتم التواصل معك.${trackingLine(facts)}`,
    };
  }

  if (hasTopic(topics, "order_status")) {
    return { templateId: "order-status-v2", reason: "حالة الطلب تُبنى من facts فقط.", reply: statusReply(facts) };
  }

  if (hasTopic(topics, "procedures")) {
    return {
      templateId: "procedures-v1",
      reason: "الخطوة التالية تتحدد من حالة الطلب.",
      reply: statusReply(facts),
    };
  }

  if (hasTopic(topics, "acknowledgement")) {
    return { templateId: "acknowledgement-v1", reason: "الرمز أو الشكر لا يغيّر حالة الطلب.", reply: "وصلت 🌿" };
  }

  return {
    templateId: "safe-generic-v1",
    reason: "رد احتياطي لا يضيف أي حقيقة غير مؤكدة.",
    reply: facts.hasApplication
      ? statusReply(facts)
      : "تفضل، اكتب النقطة التي تريد توضيحها بجملة قصيرة، بدون إرسال مستندات حساسة عبر واتساب.",
  };
}

export function buildSafeFallbackReply(input: {
  facts: ShadowFacts;
  topics: ShadowTopic[];
  initialIntent: CustomerIntent;
  customerText: string;
  messageType: string | null | undefined;
  route: ShadowRouteDecision;
}) {
  if (hasTopic(input.topics, "complaint")) {
    return {
      templateId: "complaint-fallback-v1",
      reason: "تم استبدال مسودة غير آمنة برد تهدئة مبني على الحالة المؤكدة.",
      reply: `فاهم إن التأخير أو عدم وضوح النتيجة مزعج، وحقك تسأل. الحالة المؤكدة على طلبك الآن: ${input.facts.statusLabel}. ما رح نعطيك موعدًا أو إجراءً غير مؤكد، وأول ما يظهر تحديث فعلي يتم التواصل معك.${trackingLine(input.facts)}`,
    };
  }
  if (hasTopic(input.topics, "trust")) {
    return {
      templateId: "trust-fallback-v1",
      reason: "تم استبدال مسودة غير آمنة برد تحقق رسمي دون ضغط.",
      reply: `حقك تتأكد قبل أي خطوة. المتابعة والدفع ورفع الوصل أو المستندات تتم فقط من خلال الموقع الرسمي ${BUSINESS_WEBSITE} والروابط المرتبطة بطلبك، ولا تُرسل المستندات الحساسة عبر واتساب. القرار إلك، وما في أي ضغط عليك.`,
    };
  }
  if (hasTopic(input.topics, "human_agent") || hasTopic(input.topics, "staff_change")) {
    return {
      templateId: "staff-fallback-v1",
      reason: "تم استبدال مسودة غير آمنة برد موظف رسمي دون نقاش حول الأنظمة الداخلية.",
      reply: `تفضل، معك ${input.route.agentName} من فريق الأمين. اكتب النقطة التي تحتاج مراجعتها، وبجاوبك حسب الحالة الظاهرة على الطلب.`,
    };
  }
  return buildDeterministicReply(input);
}
