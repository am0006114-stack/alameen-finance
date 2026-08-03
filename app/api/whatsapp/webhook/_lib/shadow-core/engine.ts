import {
  BUSINESS_ADDRESS, BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_E164, BUSINESS_WEBSITE, FILE_OPENING_FEE_JOD,
} from "../constants";
import { detectShadowTopics } from "./topicDetector";
import { routeShadowAgent, shadowAgentStyle } from "./agentRouter";
import { buildShadowFacts } from "./policyRegistry";
import { validateShadowReply } from "./validator";
import { generateJsonReply } from "./provider";
import type { ShadowEngineInput, ShadowEvaluation, ShadowTopic } from "./types";

function factsForPrompt(facts: ReturnType<typeof buildShadowFacts>) {
  return [
    `هل يوجد طلب مرتبط: ${facts.hasApplication ? "نعم" : "لا"}`,
    `الحالة: ${facts.status || "غير متوفرة"}`,
    `حالة الدفع: ${facts.paymentStatus || "غير متوفرة"}`,
    `رقم التتبع: ${facts.trackingId || "غير متوفر"}`,
    `الاسم: ${facts.customerName || "غير متوفر"}`,
    `الجهاز: ${facts.deviceName || "غير متوفر"}`,
    `الدفع مطلوب ومسموح حاليًا: ${facts.paymentCurrentlyAllowed ? "نعم" : "لا"}`,
    `الدفع مؤكد أو العميل ادعى الدفع: ${facts.paymentAlreadyConfirmed ? "نعم" : "لا"}`,
    `طلب استرداد نشط: ${facts.refundActive ? "نعم" : "لا"}`,
    `الاسترداد مكتمل: ${facts.refundCompleted ? "نعم" : "لا"}`,
    `موافقة نهائية: ${facts.isApproved ? "نعم" : "لا"}`,
    `المستند المطلوب حاليًا: ${facts.requiredDocument || "لا يوجد مستند محدد"}`,
    `هل يسمح بإظهار عنوان المكتب الآن: ${facts.officeAddressCanBeShared ? "نعم" : "لا"}`,
  ].join("\n");
}

function topicInstructions(topics: ShadowTopic[]) {
  const lines: string[] = [];
  if (topics.includes("bank_requirement")) lines.push("- لا يوجد بنك محدد مطلوب لتقديم الطلب. لا تحوّل السؤال تلقائيًا إلى شرح دفع الرسوم.");
  if (topics.includes("early_settlement")) lines.push("- سياسة تسديد كامل الرصيد تعتمد على الاتفاق والجدول النهائي، ولا تُضمن مسبقًا.");
  if (topics.includes("office_location")) lines.push("- استخدم كلمة المكتب فقط، ولا تذكر العنوان قبل السماح به في الحقائق.");
  if (topics.includes("review_time")) lines.push("- المدة المعتادة من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات، والجمعة والسبت لا تُحسبان.");
  if (topics.includes("stop_refund")) lines.push("- إيقاف الاسترداد ليس إلغاءً جديدًا. لا تدّع تنفيذ الإيقاف دون حالة مؤكدة.");
  if (topics.includes("staff_change")) lines.push("- العميل طلب موظفًا آخر؛ اعترف بطلبه بوضوح، ولا تطلب منه إعادة صياغة السؤال.");
  if (topics.includes("voice_message")) lines.push("- لا تدّع فهم محتوى الصوت. وضّح أن التحليل النصي التلقائي غير متاح، واطلب جملة نصية قصيرة أو رقم الطلب عند الحاجة.");
  if (topics.includes("document_upload") || topics.includes("media_upload")) lines.push("- المستندات الحساسة لا تُعتمد عبر واتساب؛ وجّه للرابط الرسمي المرتبط بالطلب دون اختلاق رابط أو مستند مطلوب.");
  return lines.join("\n");
}

function buildSystemPrompt(agentStyle: string) {
  return `
أنت تولّد ردًا تجريبيًا داخليًا لنظام Shadow لدى الأمين للأقساط. الرد لا يصل للعميل ولا ينفذ أي إجراء.
${agentStyle}

قواعد صارمة:
- أجب عن جميع أسئلة العميل وبنفس ترتيبها.
- لا تخمّن سياسة أو موعدًا أو إجراءً غير موجود في الحقائق.
- لا تقل "تم" عن إلغاء أو استرداد أو تصعيد أو اتصال ما لم تؤكد الحقائق ذلك.
- لا تطلب رسوم فتح الملف إلا إذا كان الدفع مسموحًا حاليًا. الرسوم ${FILE_OPENING_FEE_JOD} دنانير وليست قسطًا.
- لا تطلب هوية أو كشف راتب أو كفيل إلا إذا ظهر ذلك حرفيًا في المستند المطلوب.
- لا تستخدم كلمة فرع أو فروع؛ استخدم المكتب.
- لا تذكر العنوان إلا إذا كان مسموحًا: ${BUSINESS_ADDRESS}.
- لا يوجد توصيل؛ الاستلام من المكتب بموعد مسبق بعد اعتماد الموعد.
- لا تضمن السداد المبكر.
- عند استحقاق الرسوم فقط: التحويل من بنك يدعم CliQ أو محفظة إلكترونية إلى Orange Money باستخدام AMENPAY أو PAYAMEN، ويظهر اسم ABDUL RAHMAN ALHARAHSHEH.
- رقم الشركة: ${BUSINESS_PHONE_DISPLAY} / ${BUSINESS_PHONE_E164}. الموقع: ${BUSINESS_WEBSITE}.
- لا تكشف أنك نظام تجريبي أو ذكاء اصطناعي.
- النبرة بشرية أردنية واضحة، من 2 إلى 7 أسطر غالبًا.

أخرج JSON صالحًا فقط بهذا الشكل: {"reply":"النص النهائي فقط"}`;
}

export async function evaluateShadowReply(input: ShadowEngineInput): Promise<ShadowEvaluation> {
  const topics = detectShadowTopics(input.customerMessage, input.messageType, input.initialIntent);
  const facts = buildShadowFacts(input.application, input.trackingId, input.customerName);
  const agent = routeShadowAgent(topics, input.customerMessage);
  const userPrompt = `
رسالة العميل:
${input.customerMessage}

نوع الرسالة: ${input.messageType || "text"}
التصنيف الأولي للنظام المستقر: ${input.initialIntent}

الموضوعات الحتمية:
${topics.map((topic, index) => `${index + 1}. ${topic}`).join("\n")}

حقائق الطلب وقت الرسالة:
${factsForPrompt(facts)}

سياق المحادثة وقت الرسالة:
${input.conversationSnapshot?.conversationContext || "لا يوجد سياق كافٍ"}

آخر رسائل العميل:
${input.conversationSnapshot?.lastCustomerMessages?.join("\n") || "لا توجد"}

تعليمات خاصة:
${topicInstructions(topics) || "لا توجد"}

أنشئ جوابًا مستقلًا ولا تنفذ أي إجراء.`;

  const generation = await generateJsonReply({ systemPrompt: buildSystemPrompt(shadowAgentStyle(agent)), userPrompt });
  const validation = generation.ok
    ? validateShadowReply(generation.candidateReply, topics, facts)
    : { valid: false, score: 0, riskFlags: [generation.errorCode || "generation_failed"], answeredTopics: [], missingTopics: topics };

  return { candidateReply: generation.candidateReply, agent, topics, facts, validation, generation };
}
