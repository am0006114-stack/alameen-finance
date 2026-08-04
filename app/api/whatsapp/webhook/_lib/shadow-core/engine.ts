import {
  BUSINESS_ACTIVITY,
  BUSINESS_ADDRESS,
  BUSINESS_NAME,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_E164,
  BUSINESS_WEBSITE,
  FILE_OPENING_FEE_JOD,
} from "../constants";
import { detectShadowTopics } from "./topicDetector";
import { routeShadowAgent, shadowAgentStyle } from "./agentRouter";
import { buildShadowFacts } from "./policyRegistry";
import { extractConversationEvidence, preferredAgentFromConversation } from "./evidence";
import { buildDeterministicReply, buildSafeFallbackReply } from "./deterministicReply";
import { validateShadowReply } from "./validator";
import { generateJsonReply } from "./provider";
import type {
  ShadowEngineInput,
  ShadowEvaluation,
  ShadowGenerationResult,
  ShadowTopic,
} from "./types";

export const SHADOW_PROMPT_VERSION = "solid-multi-agent-v1.1.1-regulatory-identity-guard";

function factsForPrompt(facts: ReturnType<typeof buildShadowFacts>) {
  return [
    `هل يوجد طلب مرتبط: ${facts.hasApplication ? "نعم" : "لا"}`,
    `الحالة الخام: ${facts.status || "غير متوفرة"}`,
    `وصف الحالة المؤكد: ${facts.statusLabel}`,
    `حالة الدفع الخام: ${facts.paymentStatus || "غير متوفرة"}`,
    `رقم التتبع: ${facts.trackingId || "غير متوفر"}`,
    `الاسم: ${facts.customerName || "غير متوفر"}`,
    `الجهاز الحالي المسجل: ${facts.currentDevice || "غير متوفر"}`,
    `هل يوجد طلب تعديل جهاز في السجل: ${facts.deviceChangeRequest.requested ? "نعم" : "لا"}`,
    `الجهاز المطلوب في التعديل: ${facts.deviceChangeRequest.requestedDevice || "غير متوفر"}`,
    `حالة طلب التعديل: ${facts.deviceChangeRequest.status}`,
    `مصدر طلب التعديل: ${facts.deviceChangeRequest.source}`,
    `الدفع مطلوب ومسموح حاليًا: ${facts.paymentCurrentlyAllowed ? "نعم" : "لا"}`,
    `الدفع مؤكد: ${facts.paymentConfirmed ? "نعم" : "لا"}`,
    `وصل الدفع بانتظار التأكيد: ${facts.paymentReceiptPending ? "نعم" : "لا"}`,
    `طلب استرداد نشط: ${facts.refundActive ? "نعم" : "لا"}`,
    `الاسترداد مكتمل: ${facts.refundCompleted ? "نعم" : "لا"}`,
    `الرسوم قابلة للاسترداد وفق الحالة: ${facts.refundEligible ? "نعم" : "لا"}`,
    `موافقة نهائية: ${facts.isApproved ? "نعم" : "لا"}`,
    `الطلب ملغي: ${facts.isCancelled ? "نعم" : "لا"}`,
    `المستند المطلوب حاليًا: ${facts.requiredDocument || "لا يوجد مستند محدد"}`,
    `هل يسمح بإظهار عنوان المكتب الآن: ${facts.officeAddressCanBeShared ? "نعم" : "لا"}`,
    `رقم التواصل الرسمي المحلي: ${facts.officialContact.localNumber}`,
    `رقم التواصل الرسمي الدولي: ${facts.officialContact.internationalNumber}`,
    `ساعات الدوام المعتمدة: غير مخزنة، لذلك ممنوع اختراعها`,
    `الاسم المعتمد في التعامل: ${facts.businessIdentity.brandName}`,
    `الاسم القانوني المسجل: غير متوفر ضمن الحقائق، لذلك ممنوع اختراعه`,
    `النشاط: ${facts.businessIdentity.activity}`,
    `هل الجهة بنك: لا`,
    `هل الجهة شركة تمويل: لا`,
    `هل الجهة جهة إقراض: لا`,
    `هل تقدم قروضًا: لا`,
    `هل تدّعي الخضوع لرقابة البنك المركزي الأردني: لا`,
    `الأدلة المتاحة: ${facts.evidence.length ? facts.evidence.map((item) => `${item.id} | ${item.source} | ${item.claim}`).join(" || ") : "لا توجد أدلة إضافية"}`,
  ].join("\n");
}

function topicInstructions(topics: ShadowTopic[]) {
  const lines: string[] = [];
  if (topics.includes("complaint")) lines.push("- اعترف بانزعاج العميل دون وعد بموعد أو تنفيذ إجراء.");
  if (topics.includes("trust")) lines.push("- حق العميل أن يتأكد. لا تضغط عليه ولا تستخدم ضمانات أو ادعاءات غير موجودة.");
  if (topics.includes("regulatory_status")) lines.push("- أجب حتميًا بأن الجهة ليست بنكًا ولا شركة تمويل أو إقراض، ولا تمنح قروضًا، ولا تدّعي الخضوع لرقابة البنك المركزي الأردني.");
  if (topics.includes("business_identity")) lines.push("- استخدم الاسم المعتمد الأمين للأقساط فقط، ولا تدّعِ اسمًا قانونيًا غير موجود في الحقائق.");
  if (topics.includes("human_agent") || topics.includes("staff_change")) lines.push("- تحدث باسم الموظف المختار دون الدخول في نقاش عن البوت أو الذكاء الاصطناعي.");
  if (topics.includes("general_question")) lines.push("- لا تحوّل السؤال العام تلقائيًا إلى دفع أو مستندات أو إلغاء.");
  return lines.join("\n");
}

function buildSystemPrompt(agentStyle: string) {
  return `
أنت تولّد مسودة داخلية لنظام Shadow لدى الأمين للأقساط. المسودة لا تصل للعميل ولا تنفذ أي إجراء.
${agentStyle}

قواعد صارمة:
- أجب عن سؤال العميل نفسه وبنفس ترتيب النقاط.
- استخدم الحقائق المرسلة فقط. لا تخمّن حالة أو موعدًا أو مستندًا أو مدة تقسيط.
- الاسم المعتمد هو ${BUSINESS_NAME} فقط. ممنوع استخدام «الأمين للأقساط والتمويل» أو الادعاء بأنه الاسم القانوني.
- النشاط هو ${BUSINESS_ACTIVITY}. الجهة ليست بنكًا ولا شركة تمويل أو إقراض ولا تمنح قروضًا.
- ممنوع الادعاء بأنها مرخصة من البنك المركزي الأردني أو خاضعة لرقابته أو أن البنك المركزي يشرف عليها.
- يمكن استخدام دليل من conversation_history لوصف ما طلبه العميل فقط، بشرط عدم تحويله إلى إجراء إداري لم يحدث.
- فرّق دائمًا بين: طلب العميل تعديل الجهاز، وإرسال الطلب رسميًا للمراجعة، واعتماد التعديل.
- لا تذكر جهازًا غير موجود في currentDevice أو deviceChangeRequest.requestedDevice.
- لا تذكر أي رقم اتصال غير الرقم الرسمي المرسل، ولا تخترع ساعات دوام.
- لا تقل "تم" عن إلغاء أو استرداد أو تصعيد أو اتصال ما لم تؤكد الحقائق ذلك.
- لا تطلب رسوم فتح الملف إلا إذا كان الدفع مسموحًا حاليًا. الرسوم ${FILE_OPENING_FEE_JOD} دنانير وليست قسطًا.
- لا تطلب هوية أو كشف راتب أو كفيل إلا إذا ظهر حرفيًا في المستند المطلوب.
- الهوية وكشف الراتب وبيانات الكفيل ووصل الدفع لا تُرسل عبر واتساب؛ تستخدم الروابط الرسمية الآمنة فقط.
- لا تستخدم كلمة فرع أو فروع؛ استخدم المكتب.
- لا تذكر العنوان إلا إذا كان مسموحًا: ${BUSINESS_ADDRESS}.
- لا يوجد توصيل؛ الاستلام من المكتب بموعد مسبق بعد اعتماد الموعد.
- لا تضمن السداد المبكر ولا تخترع مدة بالشهور.
- لا تقل إنك بوت أو ذكاء اصطناعي أو نظام تجريبي، ولا تنفِ ذلك بصيغة "مش بوت".
- لا تعد العميل بأن الطلب سينتهي اليوم أو أن الاسترداد لن يتأخر.
- رقم الشركة: ${BUSINESS_PHONE_DISPLAY} / ${BUSINESS_PHONE_E164}. الموقع الرسمي: ${BUSINESS_WEBSITE}.
- النبرة بشرية أردنية واضحة، من سطرين إلى 6 أسطر غالبًا.

أخرج JSON صالحًا فقط بهذا الشكل: {"reply":"النص النهائي فقط"}`;
}

function deterministicGeneration(reply: string): ShadowGenerationResult {
  return {
    ok: true,
    retryable: false,
    candidateReply: reply,
    model: "deterministic",
    generationMs: 0,
    parseMode: "deterministic",
    providerHttpStatus: null,
    errorCode: null,
    errorMessage: null,
    attempts: [],
  };
}

export async function evaluateShadowReply(input: ShadowEngineInput): Promise<ShadowEvaluation> {
  const topics = detectShadowTopics(input.customerMessage, input.messageType, input.initialIntent);
  const evidenceInput = extractConversationEvidence(input.conversationSnapshot);
  const facts = buildShadowFacts(
    input.application,
    input.trackingId,
    input.customerName,
    input.messageType,
    evidenceInput,
  );
  const initialRoute = routeShadowAgent({
    topics,
    customerText: input.customerMessage,
    initialIntent: input.initialIntent,
    facts,
    requestedModel: input.requestedModel || null,
    seed: input.waId || input.trackingId || input.customerName || null,
    preferredAgent: preferredAgentFromConversation(input.conversationSnapshot),
  });

  if (initialRoute.mode === "deterministic") {
    const plan = buildDeterministicReply({
      facts,
      topics,
      initialIntent: input.initialIntent,
      customerText: input.customerMessage,
      messageType: input.messageType,
      route: initialRoute,
    });
    const route = { ...initialRoute, templateId: plan.templateId, reason: plan.reason };
    const generation = deterministicGeneration(plan.reply);
    const validation = validateShadowReply(plan.reply, topics, facts, {
      initialIntent: input.initialIntent,
      agent: route.agent,
    });

    return {
      candidateReply: plan.reply,
      draftReply: plan.reply,
      agent: route.agent,
      agentName: route.agentName,
      topics,
      facts,
      route,
      validation,
      draftValidation: validation,
      generation,
      fallbackApplied: false,
      deliveryReady: validation.valid,
      finalModel: "deterministic",
      decisionOutcome: validation.valid ? "deterministic" : "blocked",
      promptVersion: SHADOW_PROMPT_VERSION,
    };
  }

  const userPrompt = `
رسالة العميل:
${input.customerMessage}

نوع الرسالة: ${input.messageType || "text"}
التصنيف الأولي للنظام المستقر: ${input.initialIntent}
الموظف المختار: ${initialRoute.agentName}
سبب التوجيه: ${initialRoute.reason}

الموضوعات المكتشفة:
${topics.map((topic, index) => `${index + 1}. ${topic}`).join("\n")}

حقائق الطلب وقت الرسالة:
${factsForPrompt(facts)}

سياق المحادثة وقت الرسالة:
${input.conversationSnapshot?.conversationContext || "لا يوجد سياق كافٍ"}

آخر رسائل العميل:
${input.conversationSnapshot?.lastCustomerMessages?.join("\n") || "لا توجد"}

تعليمات خاصة:
${topicInstructions(topics) || "لا توجد"}

أنشئ ردًا مستقلًا ولا تنفذ أي إجراء.`;

  const generation = await generateJsonReply({
    systemPrompt: buildSystemPrompt(shadowAgentStyle(initialRoute.agent)),
    userPrompt,
    requestedModel: initialRoute.requestedModel,
  });

  const draftReply = generation.candidateReply;
  const draftValidation = generation.ok
    ? validateShadowReply(draftReply, topics, facts, {
        initialIntent: input.initialIntent,
        agent: initialRoute.agent,
      })
    : null;

  if (generation.ok && draftValidation?.valid) {
    return {
      candidateReply: draftReply,
      draftReply,
      agent: initialRoute.agent,
      agentName: initialRoute.agentName,
      topics,
      facts,
      route: initialRoute,
      validation: draftValidation,
      draftValidation,
      generation,
      fallbackApplied: false,
      deliveryReady: true,
      finalModel: generation.model,
      decisionOutcome: "model_approved",
      promptVersion: SHADOW_PROMPT_VERSION,
    };
  }

  const fallback = buildSafeFallbackReply({
    facts,
    topics,
    initialIntent: input.initialIntent,
    customerText: input.customerMessage,
    messageType: input.messageType,
    route: initialRoute,
  });
  const fallbackRoute = {
    ...initialRoute,
    templateId: fallback.templateId,
    reason: `${initialRoute.reason} ${fallback.reason}`,
  };
  const validation = validateShadowReply(fallback.reply, topics, facts, {
    initialIntent: input.initialIntent,
    agent: fallbackRoute.agent,
  });

  return {
    candidateReply: fallback.reply,
    draftReply,
    agent: fallbackRoute.agent,
    agentName: fallbackRoute.agentName,
    topics,
    facts,
    route: fallbackRoute,
    validation,
    draftValidation,
    generation,
    fallbackApplied: true,
    deliveryReady: validation.valid,
    finalModel: "deterministic",
    decisionOutcome: generation.ok ? "policy_fallback" : "technical_fallback",
    promptVersion: SHADOW_PROMPT_VERSION,
  };
}
