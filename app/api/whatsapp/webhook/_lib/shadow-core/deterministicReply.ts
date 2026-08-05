import {
  BUSINESS_ACTIVITY,
  BUSINESS_ADDRESS,
  BUSINESS_NAME,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_E164,
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

type ReplyPart = {
  id: string;
  reason: string;
  text: string;
};

function trackingLine(facts: ShadowFacts) {
  return facts.trackingId ? `\nرقم الطلب: ${facts.trackingId}` : "";
}

function deviceLine(facts: ShadowFacts) {
  return facts.currentDevice ? `\nالجهاز الحالي: ${facts.currentDevice}` : "";
}

function hasTopic(topics: ShadowTopic[], topic: ShadowTopic) {
  return topics.includes(topic);
}

function cancellationConfirmed(intent: CustomerIntent, text: string) {
  const normalized = normalizeArabicText(text);
  return intent === "cancel_confirmed" || normalized.includes("اكد الغاء الطلب");
}

function stripTracking(value: string, facts: ShadowFacts) {
  if (!facts.trackingId) return value.trim();
  return value.replace(new RegExp(`\\n?رقم الطلب\\s*:\\s*${facts.trackingId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "").trim();
}

function composeParts(parts: ReplyPart[], facts: ShadowFacts): DeterministicReplyPlan {
  const seen = new Set<string>();
  const chosen: ReplyPart[] = [];
  for (const part of parts) {
    const text = stripTracking(part.text, facts);
    const key = normalizeArabicText(text).replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chosen.push({ ...part, text });
  }

  return {
    templateId: chosen.map((part) => part.id).join("+") || "safe-generic-v1",
    reason: chosen.map((part) => part.reason).join(" ") || "رد احتياطي لا يضيف أي حقيقة غير مؤكدة.",
    reply: `${chosen.map((part) => part.text).join("\n\n")}${trackingLine(facts)}`.trim(),
  };
}

function paymentExplanation(facts: ShadowFacts) {
  return `طلبك مؤهل مبدئيًا، ورسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط. الرسوم ليست قسطًا على الجهاز، ودفعها يبدأ استكمال مراجعة الملف والمتطلبات.
الرسوم مستردة بالكامل إذا لم تتم الموافقة النهائية، والقسط الأول يكون بعد استلام الجهاز حسب الاتفاق.
التحويل متاح من أي بنك يدعم CliQ أو من محفظة إلكترونية؛ لا يشترط وجود محفظة Orange Money لديك.
الجهة المستلمة: Orange Money
التحويل إلى: AMENPAY أو PAYAMEN
اسم المستفيد الظاهر: ABDUL RAHMAN ALHARAHSHEH
بعد التحويل ارفع الوصل فقط من الرابط الرسمي: ${BUSINESS_WEBSITE}/receipt
بعد تأكيد الوصل تستكمل الدراسة، والنتيجة عادةً من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات، والجمعة والسبت لا تُحسبان.`;
}

function applicationNotLinkedReply() {
  return "ما ظهر عندي طلب مرتبط بهذه المحادثة حاليًا، لذلك ما بقدر أحدد الحالة أو المطلوب منك بدقة. أرسل رقم التتبع الموجود في الرسالة الرسمية حتى تتم مراجعة الطلب الصحيح.";
}

function statusReply(facts: ShadowFacts) {
  if (!facts.hasApplication) return applicationNotLinkedReply();
  if (facts.refundCompleted) return "حالة طلبك: تم تنفيذ الاسترداد.";
  if (facts.refundActive) {
    return "حالة طلبك: طلب الاسترداد مسجل وقيد المتابعة. لا تحتاج تعيد تقديم البيانات أو ترسلها عبر واتساب، وأول ما يظهر تنفيذ فعلي تصلك رسالة رسمية.";
  }
  if (facts.isCancelled) {
    return `حالة طلبك: ملغي.${facts.paymentConfirmed ? " إذا لم تكتمل خطوة الاسترداد، استخدم الرابط الرسمي المرتبط بالطلب لتثبيت البيانات." : " لا يوجد دفع مؤكد على الملف."}`;
  }
  if (facts.paymentReceiptPending) {
    return "وصل إشعار رفع الوصل، وهو الآن بانتظار التأكيد. لا تعيد الدفع ولا ترفع وصلًا ثانيًا.";
  }
  if (facts.requiredDocument === "guarantor") {
    return "حالة طلبك: الملف يحتاج بيانات الكفيل لاستكمال الدراسة. تعبئة البيانات تتم فقط من الرابط الرسمي المرتبط بالطلب، وليس عبر واتساب.";
  }
  if (facts.requiredDocument === "salary_slip") {
    return "حالة طلبك: الملف يحتاج كشف راتب رسمي لاستكمال الدراسة. الرفع يتم فقط من الرابط الرسمي المرتبط بالطلب، وليس عبر واتساب.";
  }
  if (facts.requiredDocument === "identity") {
    return "حالة طلبك: الملف يحتاج رفع الهوية من الرابط الرسمي المرتبط بالطلب. لا ترسل الهوية عبر واتساب.";
  }
  if (facts.status === "preliminary_application") {
    return "حالة طلبك: تم تسجيل الطلب وتأهيله مبدئيًا، وهو الآن بانتظار دوره لبدء دراسة الملف. حاليًا لا توجد أي خطوة إضافية مطلوبة، وأول ما ينتقل الطلب للمرحلة التالية يتم التواصل معك.";
  }
  if (facts.stage === "submitted") {
    return "حالة طلبك: تم استلام الطلب وتسجيله، وهو الآن بانتظار بدء المراجعة. حاليًا لا توجد أي خطوة إضافية مطلوبة.";
  }
  if (facts.stage === "queued_for_review") {
    return "حالة طلبك: الطلب بانتظار دوره لبدء المراجعة. حاليًا لا توجد أي خطوة إضافية مطلوبة.";
  }
  if (facts.status === "prequalified") {
    return "حالة طلبك: تم تأهيل الطلب مبدئيًا، وهو بانتظار بدء دراسة الملف. حاليًا لا توجد أي خطوة إضافية مطلوبة.";
  }
  if (facts.paymentCurrentlyAllowed) {
    return `حالة طلبك: مؤهل مبدئيًا. الخطوة التالية هي تأكيد رغبتك بالاستمرار، وبعدها تصلك تعليمات رسوم فتح الملف الرسمية.${deviceLine(facts)}`;
  }
  if (facts.isApproved) {
    return "حالة طلبك: تمت الموافقة النهائية. يتم إرسال موعد الحضور الرسمي بعد اعتماد جدول الاستلام، والاستلام من المكتب فقط دون توصيل.";
  }
  return `حالة طلبك: ${facts.statusLabel}. حاليًا ما في خطوة إضافية مؤكدة مطلوبة منك، وأول ما يظهر تحديث فعلي يتم التواصل معك.`;
}

function reviewTimeReply(facts: ShadowFacts) {
  return `${facts.reviewDurationText}. إذا تجاوز الطلب المدة، لا نعطي موعدًا غير مؤكد؛ أول ما يظهر تحديث فعلي يتم التواصل معك.`;
}

function requirementsReply(facts: ShadowFacts) {
  if (!facts.hasApplication) return applicationNotLinkedReply();
  if (facts.requiredDocument === "guarantor") {
    return "المطلوب حاليًا هو تعبئة بيانات الكفيل من الرابط الرسمي المرتبط بطلبك. لا ترسل بيانات الكفيل عبر واتساب.";
  }
  if (facts.requiredDocument === "salary_slip") {
    return "المطلوب حاليًا هو رفع كشف راتب رسمي من الرابط الآمن المرتبط بطلبك. لا ترسل الكشف عبر واتساب.";
  }
  if (facts.requiredDocument === "identity") {
    return "المطلوب حاليًا هو رفع الهوية من الرابط الآمن المرتبط بطلبك. لا ترسل الهوية عبر واتساب.";
  }
  return "حسب حالة الطلب الظاهرة، لا يوجد مستند محدد مطلوب منك حاليًا. إذا تغيّرت متطلبات الدراسة، تصلك رسالة رسمية واضحة مع رابط الرفع الآمن.";
}

function paymentReply(facts: ShadowFacts) {
  if (!facts.hasApplication) return applicationNotLinkedReply();
  if (facts.paymentConfirmed) {
    return "الدفع مؤكد على طلبك، وما في أي دفع إضافي مطلوب حاليًا. الملف ينتقل حسب حالته الحالية إلى المتابعة أو الدراسة.";
  }
  if (facts.paymentReceiptPending) {
    return "وصل إشعار رفع الوصل، وهو بانتظار التأكيد. لا تعيد الدفع ولا ترفع وصلًا ثانيًا، وأول ما يتم التأكيد تصلك رسالة رسمية.";
  }
  if (!facts.paymentCurrentlyAllowed) {
    return "لا يوجد دفع مطلوب أو مسموح حاليًا حسب حالة الطلب الظاهرة. تعليمات الدفع لا تُرسل إلا بعد التأهيل المبدئي.";
  }
  return paymentExplanation(facts);
}

function cancellationReply(facts: ShadowFacts, intent: CustomerIntent, text: string) {
  if (!facts.hasApplication) return applicationNotLinkedReply();
  if (cancellationConfirmed(intent, text)) {
    if (facts.isCancelled) {
      return `تم إلغاء الطلب.${facts.paymentConfirmed ? ` لتثبيت بيانات الاسترداد استخدم الرابط الرسمي: ${BUSINESS_WEBSITE}/delay-decision` : " لا يوجد دفع مؤكد على الملف."}`;
    }
    return "وصل تأكيدك النهائي بإلغاء الطلب. يجب أن ينفذ النظام خطوة الإلغاء أولًا، وبعد تحديث الحالة تظهر لك خطوات الاسترداد الرسمية إذا كان الدفع مؤكدًا.";
  }
  return `أكيد. قبل الإلغاء النهائي، اذكر سبب الإلغاء باختصار: تغيير بالقرار، تأخير، أو سبب آخر.
الإلغاء النهائي لا يتم إلا بعد كتابة: أكد إلغاء الطلب`;
}

function refundReply(facts: ShadowFacts) {
  if (!facts.hasApplication) return applicationNotLinkedReply();
  if (facts.refundCompleted) return "الاسترداد مكتمل حسب الحالة الظاهرة على الطلب.";
  if (facts.refundActive) {
    return "طلب الاسترداد مسجل وقيد المتابعة. الظروف التشغيلية الاستثنائية وضغط المراجعات هي سبب التأخير الحالي، وتتم المتابعة حسب الدور. لا يوجد موعد ثابت يمكن تأكيده قبل التنفيذ، وأول ما تتم الحوالة أو يظهر تحديث فعلي تصلك رسالة رسمية.";
  }
  if (facts.refundEligible) {
    return "لا يظهر طلب استرداد نشط حاليًا. بما أن الدفع مؤكد ولا توجد موافقة نهائية، يتم بدء الاسترداد فقط بعد إلغاء الطلب وتثبيت البيانات من الرابط الرسمي.";
  }
  return "لا يظهر طلب استرداد نشط أو مبلغ مؤكد قابل للاسترداد على الحالة الحالية. تتم مراجعة الطلب الصحيح من خلال رقم التتبع.";
}

function stopRefundReply(facts: ShadowFacts) {
  if (!facts.hasApplication) return applicationNotLinkedReply();
  if (facts.refundCompleted) {
    return "الاسترداد ظاهر كمكتمل، لذلك لا يمكن اعتباره طلبًا نشطًا قابلًا للإيقاف. تتم مراجعة إعادة فتح الطلب كإجراء منفصل.";
  }
  if (facts.refundActive) {
    return "طلب الاسترداد نشط. إيقافه ليس تلقائيًا؛ يتم أولًا فحص إمكانية إيقافه قبل إعادة تفعيل الطلب، ولن يتم تأكيد العودة إلا بعد تحديث الحالة.";
  }
  return "لا يظهر طلب استرداد نشط حاليًا. تتم مراجعة حالة الطلب قبل أي إعادة تفعيل.";
}

function officeReply(facts: ShadowFacts, independence: boolean) {
  const independenceText = independence
    ? "الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق.\n"
    : "";
  if (facts.officeAddressCanBeShared) {
    return `${independenceText}الاستلام يكون من المكتب فقط وبموعد رسمي مسبق. عنوان المكتب: ${BUSINESS_ADDRESS}.`;
  }
  return `${independenceText}لا يتم ذكر عنوان المكتب قبل الموافقة النهائية أو إرسال موعد حضور رسمي. الاستلام من المكتب فقط وبموعد مسبق، ولا يوجد توصيل.`;
}

function mediaReply(facts: ShadowFacts, type: string, includeStatus: boolean) {
  const kind = type === "document" ? "المستند" : type === "audio" || type === "voice" ? "الرسالة الصوتية" : "المرفق";
  const base = type === "audio" || type === "voice"
    ? `وصلت ${kind}، لكن محتواها غير متاح للتحليل النصي هنا. اكتب النقطة بجملة قصيرة.`
    : `وصل ${kind}. أي هوية أو كشف راتب أو بيانات كفيل أو وصل دفع لا يُعتمد عبر واتساب؛ استخدم الرابط الرسمي المرتبط بالطلب.`;
  return includeStatus ? `${base}\n${statusReply(facts)}` : base;
}

function contactReply(facts: ShadowFacts) {
  return `رقم التواصل الرسمي: ${facts.officialContact.localNumber}
ومن خارج الأردن: ${facts.officialContact.internationalNumber}
المتابعة الأساسية للطلبات عبر واتساب، والرد يكون حسب الدور وضغط المراجعات.`;
}

function phoneNotAnsweredReply(facts: ShadowFacts) {
  return `رقم التواصل الرسمي: ${facts.officialContact.localNumber}. إذا لم يتم الرد على الاتصال، اترك رسالتك ورقم طلبك على واتساب، وسيتم الرد حسب الدور وضغط المراجعات.`;
}

function humanAgentReply(facts: ShadowFacts, route: ShadowRouteDecision) {
  const requestLine = facts.hasApplication
    ? `اكتب رسالتك ورقم طلبك ${facts.trackingId || ""}.`.replace(/\s+\./g, ".")
    : "اكتب رسالتك وأرسل رقم التتبع الموجود في الرسالة الرسمية.";
  return `تفضل، معك ${route.agentName} من فريق الأمين. التواصل الأساسي للطلبات والمتابعة عبر واتساب. ${requestLine} يتم الرد حسب الدور وضغط المراجعات أو الظروف التشغيلية الاستثنائية.`;
}

function postApprovalReply() {
  return `بعد صدور الموافقة النهائية واعتماد جدول الاستلام، يصلك موعد حضور رسمي. الاستلام يكون من المكتب فقط وبموعد مسبق، ولا يوجد توصيل. القسط الأول يكون بعد استلام الجهاز حسب الاتفاق.`;
}

function deviceChangeReply(facts: ShadowFacts) {
  if (!facts.hasApplication) return applicationNotLinkedReply();
  const change = facts.deviceChangeRequest;
  if (change.status === "submitted_for_review") {
    return `طلب تعديل الجهاز${change.requestedDevice ? ` إلى ${change.requestedDevice}` : ""} تم إرساله من الرابط الرسمي للمراجعة. الجهاز الحالي لا يتغير تلقائيًا، وأي اعتماد للتعديل يحتاج تحديثًا فعليًا من الإدارة.${deviceLine(facts)}`;
  }
  if (change.status === "customer_requested") {
    return `طلبك لتعديل الجهاز${change.requestedDevice ? ` إلى ${change.requestedDevice}` : ""} مذكور في المحادثة، لكنه لا يُعتبر مسجلًا رسميًا من رسالة واتساب وحدها. تسجيل التعديل يتم فقط من الرابط الرسمي: ${BUSINESS_WEBSITE}/change-device.${deviceLine(facts)}`;
  }
  if (change.status === "approved") {
    return `تم اعتماد تعديل الجهاز حسب الحالة المسجلة${change.requestedDevice ? ` إلى ${change.requestedDevice}` : ""}.`;
  }
  if (change.status === "rejected") {
    return `طلب تعديل الجهاز ظاهر كمرفوض حسب الحالة المسجلة، والجهاز الحالي يبقى كما هو.${deviceLine(facts)}`;
  }
  return `تغيير الجهاز يتم فقط من الرابط الرسمي: ${BUSINESS_WEBSITE}/change-device. لا يتم اعتماد تغيير الجهاز من رسالة واتساب وحدها.${deviceLine(facts)}`;
}

function complaintAcknowledgement(facts: ShadowFacts) {
  return `فاهم إن التأخير أو عدم وضوح النتيجة مزعج، وحقك تسأل. ما رح نعطيك موعدًا أو إجراءً غير مؤكد${facts.hasApplication ? `، والحالة المؤكدة الآن: ${facts.statusLabel}` : ""}.`;
}

function trustReply() {
  return `حقك تتأكد قبل أي خطوة. المتابعة والدفع ورفع الوصل أو المستندات تتم فقط من خلال الموقع الرسمي ${BUSINESS_WEBSITE} والروابط المرتبطة بطلبك، ولا تُرسل المستندات الحساسة عبر واتساب.`;
}

function regulatoryStatusReply() {
  return `${BUSINESS_NAME} ليست بنكًا ولا شركة تمويل أو إقراض، ولا تمنح قروضًا، ولا ندّعي أنها مرخصة أو خاضعة لرقابة البنك المركزي الأردني. نشاطنا هو ${BUSINESS_ACTIVITY}.`;
}

function businessIdentityReply() {
  return `الاسم المعتمد في التعامل والقنوات الرسمية هو ${BUSINESS_NAME}. نشاطنا هو ${BUSINESS_ACTIVITY}، والجهة ليست بنكًا ولا شركة تمويل أو إقراض ولا تمنح قروضًا.`;
}

export function buildDeterministicReply(input: {
  facts: ShadowFacts;
  topics: ShadowTopic[];
  initialIntent: CustomerIntent;
  customerText: string;
  messageType: string | null | undefined;
  route: ShadowRouteDecision;
}): DeterministicReplyPlan {
  const { facts, topics, initialIntent, customerText, route } = input;
  const type = String(input.messageType || facts.messageType || "text").toLowerCase();

  if (hasTopic(topics, "unsupported_message")) {
    return composeParts([{ id: "unsupported-message-v1", reason: "نوع الرسالة غير مدعوم ولا يجوز افتراض محتواها.", text: "وصلت رسالة غير مدعومة، وما بقدر أحدد محتواها. اكتب طلبك نصيًا بجملة قصيرة حتى يتم الرد على النقطة نفسها." }], facts);
  }

  if (hasTopic(topics, "voice_message") || hasTopic(topics, "document_upload") || hasTopic(topics, "media_upload")) {
    return composeParts([{ id: "secure-media-v1", reason: "المرفقات والمستندات تخضع لمسار آمن ثابت.", text: mediaReply(facts, type, hasTopic(topics, "order_status")) }], facts);
  }

  if (hasTopic(topics, "cancellation")) {
    return composeParts([{ id: cancellationConfirmed(initialIntent, customerText) ? "cancel-confirmed-v1" : "cancel-request-v1", reason: "الإلغاء مسار حتمي ولا يجوز للنموذج ادعاء تنفيذه.", text: cancellationReply(facts, initialIntent, customerText) }], facts);
  }
  if (hasTopic(topics, "stop_refund")) {
    return composeParts([{ id: "stop-refund-v1", reason: "إيقاف الاسترداد يحتاج فحص حالة حتمي.", text: stopRefundReply(facts) }], facts);
  }
  if (hasTopic(topics, "refund")) {
    return composeParts([{ id: "refund-status-v1", reason: "حالة الاسترداد تُقرأ من الطلب فقط.", text: refundReply(facts) }], facts);
  }

  const parts: ReplyPart[] = [];
  const add = (id: string, reason: string, text: string) => parts.push({ id, reason, text });

  if (hasTopic(topics, "regulatory_status")) add("regulatory-status-v1", "الوضع التنظيمي للنشاط سياسة ثابتة ولا يُسمح للنموذج باختراعه.", regulatoryStatusReply());
  if (hasTopic(topics, "business_identity")) add("business-identity-v1", "اسم الجهة ونوع النشاط يؤخذان من سياسة العمل المعتمدة فقط.", businessIdentityReply());

  if (hasTopic(topics, "phone_not_answered")) add("phone-unanswered-v1", "الهاتف غير المجاب له سياسة تواصل ثابتة.", phoneNotAnsweredReply(facts));
  else if (hasTopic(topics, "contact_number")) add("official-contact-v1", "رقم التواصل يؤخذ من الثابت الرسمي فقط.", contactReply(facts));
  if (hasTopic(topics, "human_agent") || hasTopic(topics, "staff_change")) add("human-contact-v1", "طلب التواصل مع موظف لا يحتاج تصعيدًا تلقائيًا.", humanAgentReply(facts, route));

  if (hasTopic(topics, "payment_method") || hasTopic(topics, "payment_status")) add("payment-state-v2", "الدفع ووصل الدفع مساران حتميان.", paymentReply(facts));
  if (hasTopic(topics, "requirements")) add("requirements-state-v1", "لا يُطلب أي مستند إلا من requiredDocument.", requirementsReply(facts));
  if (hasTopic(topics, "office_location") || hasTopic(topics, "independence")) add("office-policy-v1", "العنوان والاستقلال عن الجهات المشابهة سياسة ثابتة.", officeReply(facts, hasTopic(topics, "independence")));
  if (hasTopic(topics, "delivery")) add("pickup-only-v1", "لا يوجد توصيل والاستلام مرتبط بالموافقة والموعد.", "لا يوجد توصيل نهائيًا. الاستلام من المكتب فقط وبموعد مسبق بعد الموافقة النهائية واعتماد جدول الاستلام.");
  if (hasTopic(topics, "supplier_delay")) add("supplier-delay-v1", "لا يجوز اختراع موعد توريد.", "لا يوجد موعد توريد مؤكد ظاهر حاليًا. يتم التواصل مع أصحاب الطلبات المؤكدة بعد وصول الأجهزة واعتماد جدول الاستلام من المكتب.");
  if (hasTopic(topics, "device_change")) add("device-change-evidence-v2", "حالة تعديل الجهاز تُبنى من دليل المحادثة أو النموذج الرسمي.", deviceChangeReply(facts));
  if (hasTopic(topics, "bank_requirement")) add("bank-requirement-v1", "لا يوجد بنك محدد مطلوب للتقديم.", "لا يوجد بنك محدد مطلوب لتقديم الطلب. عند استحقاق رسوم فتح الملف يمكن التحويل من أي بنك يدعم CliQ أو من محفظة إلكترونية حسب التعليمات الرسمية.");
  if (hasTopic(topics, "early_settlement")) add("early-settlement-v1", "السداد المبكر لا يُضمن قبل الاتفاق النهائي.", "إمكانية تسديد كامل الرصيد تعتمد على الاتفاق والجدول النهائي، لذلك ما بنقدر نضمنها مسبقًا قبل اعتماد الطلب.");
  if (hasTopic(topics, "post_approval_steps")) add("post-approval-steps-v1", "إجراءات ما بعد الموافقة سياسة ثابتة ولا تعني أن الموافقة صدرت.", postApprovalReply());
  if (hasTopic(topics, "review_time")) add("review-time-v1", "مدة المراجعة ثابتة ضمن السياسة.", reviewTimeReply(facts));
  if (hasTopic(topics, "order_status")) add("order-status-v2", "حالة الطلب تُبنى من facts فقط.", statusReply(facts));
  if (hasTopic(topics, "procedures") && !hasTopic(topics, "post_approval_steps")) add("procedures-v2", "الخطوة التالية تتحدد من حالة الطلب.", statusReply(facts));
  if (hasTopic(topics, "complaint")) add("complaint-context-v1", "تمت إضافة تهدئة دون وعد أو إجراء غير مؤكد.", complaintAcknowledgement(facts));
  if (hasTopic(topics, "trust")) add("trust-policy-v1", "التحقق يتم من القنوات الرسمية دون ضغط.", trustReply());
  if (hasTopic(topics, "acknowledgement")) add("acknowledgement-v1", "الرمز أو الشكر لا يغيّر حالة الطلب.", "وصلت 🌿");

  if (!parts.length) {
    add("safe-generic-v1", "رد احتياطي لا يضيف أي حقيقة غير مؤكدة.", facts.hasApplication ? statusReply(facts) : "تفضل، اكتب النقطة التي تريد توضيحها بجملة قصيرة، بدون إرسال مستندات حساسة عبر واتساب.");
  }

  return composeParts(parts, facts);
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
    return composeParts([{ id: "complaint-fallback-v2", reason: "تم استبدال مسودة غير آمنة برد تهدئة مبني على الحالة المؤكدة.", text: complaintAcknowledgement(input.facts) }], input.facts);
  }
  if (hasTopic(input.topics, "trust")) {
    return composeParts([{ id: "trust-fallback-v2", reason: "تم استبدال مسودة غير آمنة برد تحقق رسمي دون ضغط.", text: trustReply() }], input.facts);
  }
  return buildDeterministicReply(input);
}
