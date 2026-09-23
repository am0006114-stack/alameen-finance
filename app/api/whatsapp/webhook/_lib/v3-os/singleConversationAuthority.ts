import { applicationJourneyStage } from "./applicationJourney";
import {
  ALAMEEN_FIRST_INSTALLMENT_RULE,
  ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE,
  buildIphone18AuthoritativeReply,
  isIphone18Question,
} from "./businessTruthRegistry";
import { currentCommercialDisclosure } from "./informedCommercialContinuation";
import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TopicKey, TruthBundle } from "./types";

export type ConversationAnswerKey =
  | "iphone18_product_truth"
  | "monthly_installment_payment"
  | "first_installment_timing"
  | "office_location"
  | "fee_rationale"
  | "current_next_step"
  | "installment_duration_change"
  | "grounded_unknown"
  | "business_scope";

export type ConversationAnswerItem = {
  key: ConversationAnswerKey;
  question: string;
  fact: string;
  source: "authoritative_business_truth" | "authoritative_application_truth" | "scope_policy";
};

export type SingleConversationAnswerPlan = {
  items: ConversationAnswerItem[];
  semanticQuestion: string | null;
  semanticObligations: string[];
  hasMaterialObligation: boolean;
  mustRetireGenericFallback: boolean;
};

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .toLowerCase()
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function semanticText(turn: InterpretedTurn) {
  return [
    turn.semantic?.currentQuestion,
    ...(turn.semantic?.answerObligations || []),
    turn.semantic?.customerGoal,
    turn.semantic?.meaningSummary,
  ].filter(Boolean).join(" \n ");
}

function combinedQuestion(turn: InterpretedTurn) {
  const semantic = semanticText(turn);
  return [semantic, turn.rawText].filter(Boolean).join(" \n ");
}

function hasTopic(turn: InterpretedTurn, ...topics: TopicKey[]) {
  return topics.some((topic) => turn.topics.includes(topic) || turn.acts.some((act) => act.topic === topic));
}

function add(items: ConversationAnswerItem[], item: ConversationAnswerItem) {
  if (!items.some((existing) => existing.key === item.key)) items.push(item);
}

function asksMonthlyPaymentMethod(turn: InterpretedTurn) {
  const q = n(combinedQuestion(turn));
  const semantic = n(semanticText(turn));
  const installment = hasTopic(turn, "first_installment", "installment_amount", "installment_duration")
    || /(?:قسط|اقساط|أقساط|الأقساط|الاقساط|شهري|كل\s+شهر)/.test(q);
  const method = hasTopic(turn, "payment_method")
    || /(?:كيف|طريقه|طريقة|اسدد|أسدد|ادفع|أدفع|تحويل|كليك|cliq|بنك|بنكي|كاش|نقد|اقتطاع|زيارة|موقع)/i.test(semantic || q);
  const feeOnly = /(?:رسوم\s*فتح\s*الملف|الخمس|5\s*دنانير|٥\s*دنانير)/.test(q)
    && !/(?:قسط|اقساط|أقساط|شهري|كل\s+شهر)/.test(q);
  return installment && method && !feeOnly;
}

function asksFirstInstallmentTiming(turn: InterpretedTurn) {
  if (hasTopic(turn, "first_installment")) return true;
  const q = n(combinedQuestion(turn));
  return /(?:اول|أول)\s+قسط|القسط\s+(?:الاول|الأول)/.test(q)
    && /(?:متى|بعد|وقت|يستحق|استحقاق|ادفع|أدفع|استلام|توقيع)/.test(q);
}


function asksInstallmentDurationChange(turn: InterpretedTurn) {
  if (hasTopic(turn, "installment_duration")) return true;
  const q = n(combinedQuestion(turn));
  return /(?:تقسيط|قسط|مده|مدة).{0,35}(?:12|١٢|24|٢٤|36|٣٦|سنه|سنة|سنتين|شهر)|(?:12|١٢|24|٢٤|36|٣٦|سنه|سنة|سنتين).{0,35}(?:قسط|تقسيط|مده|مدة)/.test(q);
}

function installmentDurationFact(truth: TruthBundle) {
  const months = truth.application?.installmentMonths;
  const current = months && Number.isFinite(Number(months)) ? `مدة التقسيط المسجلة حاليًا على طلبك هي ${Number(months)} شهر. ` : "";
  return `${current}إذا بدك مدة مختلفة مثل سنة أو سنتين، ما بنعتبرها تغيّرت من رسالة واتساب وحدها؛ لازم تنعمل الحسبة/الخيار الرسمي على الطلب حسب المدة المتاحة فعليًا. ما رح أخلط طلب تغيير المدة برسوم فتح الملف.`;
}

function asksOfficeLocation(turn: InterpretedTurn) {
  if (hasTopic(turn, "office_location")) return true;
  const q = n(combinedQuestion(turn));
  return /(?:وين|اين|أين).{0,20}(?:موقع|مكتب|شركة|محل|عنوان)|(?:موقعكم|عنوانكم|مكتبكم)/.test(q);
}

function asksFeeWhyOrTrust(turn: InterpretedTurn) {
  const q = n(combinedQuestion(turn));
  const feeContext = hasTopic(turn, "payment_fee") || /(?:5|٥|خمس|رسوم\s*فتح\s*الملف|رسوم)/.test(q);
  const rationale = hasTopic(turn, "trust")
    || /(?:ليش|لشو|سبب|الهدف|ضمان|يضمن|نصب|ثقه|ثقة|مصداقيه|مصداقية|داعي)/.test(q);
  return feeContext && rationale;
}

function asksCurrentNextStep(turn: InterpretedTurn) {
  const q = n(combinedQuestion(turn));
  return /(?:شو|ما|ايش|إيش).{0,24}(?:مطلوب|الخطوه|الخطوة|الاجراء|الإجراء|الخطوات)|(?:حاليا|حاليًا|هسا).{0,24}(?:شو|ايش|إيش).{0,20}(?:مطلوب|اعمل|أعمل|أسوي|اسوي)/.test(q);
}

function isBusinessRelated(turn: InterpretedTurn) {
  const businessTopics = new Set<TopicKey>([
    "application_status", "application_correction", "requirements", "guarantor", "products", "device_change",
    "device_recalculation", "product_price", "payment_fee", "payment_method", "payment_timing", "payment_recipient",
    "payment_status", "payment_confirmation", "receipt_upload", "first_installment", "installment_amount", "installment_duration",
    "delivery", "office_location", "appointment", "review_timing", "operational_pressure", "refund", "cancellation",
    "continuation", "reopen", "complaint", "trust", "legal", "social_threat", "human_request", "manager_request",
    "call_request", "repair", "correction", "website", "tracking",
  ]);
  return turn.topics.some((topic) => businessTopics.has(topic))
    || turn.acts.some((act) => businessTopics.has(act.topic));
}

function shouldScopeToBusiness(turn: InterpretedTurn) {
  const frame = turn.semantic;
  if (!frame || frame.socialClosure) return false;
  if (isBusinessRelated(turn)) return false;
  if (!frame.currentQuestion && !frame.answerObligations.length) return false;
  if (frame.requiresExternalFact) return true;
  const q = n(combinedQuestion(turn));
  return /(?:معادله|معادلة|جاذبيه|جاذبية|نيوتن|اينشتاين|عاصمه|عاصمة|من\s+هو|مين\s+هو)/.test(q);
}

function currentNextStepFact(state: ConversationState, truth: TruthBundle) {
  const app = truth.application;
  if (!app) return "ما عندي طلب موثوق مربوط بهالرسالة هسا. إذا عندك رقم تتبع ابعثه مرة واحدة وبراجع نفس الطلب.";
  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_review") {
    return "طلبك لسا بالمراجعة المبدئية، وما في عليك خطوة مالية الآن. إذا احتاج الملف مستند أو معلومة إضافية، بنطلبها من خلال المسار الرسمي المرتبط بالطلب.";
  }
  if (stage === "preliminary_approved_waiting_decision") {
    const disclosure = currentCommercialDisclosure(state, truth);
    if (disclosure.status === "not_delivered") {
      return `طلبك أخذ موافقة مبدئية، ولسا مش موافقة نهائية. إذا حاب تكمل للدراسة النهائية، لازم أولًا أوضحلك رسوم فتح الملف ${truth.policy.fileOpeningFeeJod} دنانير وسببها وشروطها كاملة حتى يكون قرارك على بينة.`;
    }
    return "طلبك أخذ موافقة مبدئية. شرح فتح الملف ورسومه موضح على نفس الطلب، وهسا القرار إلك: إذا مناسب إلك وبدك تكمل أكّد بشكل طبيعي إنك حاب تستمر؛ وإذا بدك وقت تفكر ما بنثبت عليك خطوة جديدة.";
  }
  if (stage === "continuation_confirmed_fee_due") {
    return "اختيار الاستمرار مسجل، والخطوة الحالية هي دفع رسوم فتح الملف عبر الوسائل الرسمية ثم رفع الوصل من الرابط المرتبط بالطلب. تأكيد الدفع النهائي يتم يدويًا بعد مراجعة الوصل.";
  }
  if (stage === "payment_proof_pending_admin") {
    return "الوصل الرسمي موجود على الملف وبانتظار اعتماد الإدارة. ما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية.";
  }
  if (["payment_confirmed_under_review", "final_review", "under_review"].includes(stage)) {
    return "الدفع مؤكد والملف بالدراسة النهائية. ما في عليك خطوة مالية إضافية الآن؛ المطلوب انتظار القرار النهائي.";
  }
  if (stage === "cancelled") return "الطلب ملغي حسب الحالة الحالية. إذا كان فيه دفع مؤكد، الاسترداد يمشي عبر المسار الرسمي ولا بنعتبره منفذ قبل ما تتحدث الحالة فعليًا.";
  if (stage === "refund_requested") return "طلب الاسترداد مسجل وقيد المعالجة حسب الحالة الحالية. ما في عليك إعادة طلب الاسترداد، وما بنعتبر التحويل مكتمل قبل ما يظهر التنفيذ فعليًا.";
  return `الحالة الحالية للطلب: ${String(app.status || "غير محددة")}. ما رح أفترض عليك خطوة مش مثبتة بالنظام.`;
}

export function buildSingleConversationAnswerPlan(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
}): SingleConversationAnswerPlan {
  const { turn, state, truth } = input;
  const items: ConversationAnswerItem[] = [];
  const question = combinedQuestion(turn);

  if (isIphone18Question(question) || turn.semantic?.entities.some((entity) => entity.kind === "device" && isIphone18Question(entity.surface))) {
    const fact = buildIphone18AuthoritativeReply(question) || buildIphone18AuthoritativeReply(turn.rawText);
    if (fact) add(items, {
      key: "iphone18_product_truth",
      question: turn.semantic?.currentQuestion || turn.rawText,
      fact,
      source: "authoritative_business_truth",
    });
  }

  if (asksMonthlyPaymentMethod(turn)) {
    add(items, {
      key: "monthly_installment_payment",
      question: turn.semantic?.currentQuestion || "طريقة سداد الأقساط الشهرية",
      fact: `${ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE} وهي مختلفة تمامًا عن رسوم فتح الملف.`,
      source: "authoritative_business_truth",
    });
  }

  if (asksFirstInstallmentTiming(turn)) {
    add(items, {
      key: "first_installment_timing",
      question: turn.semantic?.currentQuestion || "موعد استحقاق القسط الأول",
      fact: ALAMEEN_FIRST_INSTALLMENT_RULE,
      source: "authoritative_business_truth",
    });
  }

  if (asksInstallmentDurationChange(turn)) {
    add(items, {
      key: "installment_duration_change",
      question: turn.semantic?.currentQuestion || "تغيير مدة التقسيط",
      fact: installmentDurationFact(truth),
      source: "authoritative_application_truth",
    });
  }

  if (asksOfficeLocation(turn)) {
    add(items, {
      key: "office_location",
      question: turn.semantic?.currentQuestion || "موقع المكتب",
      fact: `${truth.policy.generalLocation}. الحضور للمكتب فقط بموعد رسمي مؤكد مرتبط بالطلب؛ ما بنحدد أو نقترح موعد حضور من المحادثة من حالنا.`,
      source: "authoritative_business_truth",
    });
  }

  if (asksFeeWhyOrTrust(turn)) {
    add(items, {
      key: "fee_rationale",
      question: turn.semantic?.currentQuestion || "سبب رسوم فتح الملف",
      fact: `رسوم فتح الملف ${truth.policy.fileOpeningFeeJod} دنانير بتدخل فقط بعد الموافقة المبدئية إذا قررت تكمل للدراسة النهائية. الهدف منها تنظيم مرحلة الدراسة التفصيلية وقياس جدية الطلب والاستعداد المبدئي لإكمال الالتزامات، لأن حجم الطلبات كبير وما بنقدر ندخل الطلبات غير الجادة بنفس مسار المراجعة ونأخر العملاء الجادين. هي مش دفعة أولى، ومش جزء من سعر الجهاز، ومش شراءً للموافقة ولا ضمانًا إلها. إذا ما صدرت الموافقة النهائية بعد دفع مؤكد، الرسوم مستردة بالكامل عبر المسار الرسمي، وإذا قررت تلغي بعد دفع مؤكد إلها مسار الاسترداد الرسمي.`,
      source: "authoritative_business_truth",
    });
  }

  if (asksCurrentNextStep(turn)) {
    add(items, {
      key: "current_next_step",
      question: turn.semantic?.currentQuestion || "الخطوة المطلوبة الآن",
      fact: currentNextStepFact(state, truth),
      source: "authoritative_application_truth",
    });
  }

  if (!items.length && turn.semantic?.currentQuestion && isBusinessRelated(turn) && !turn.semantic.socialClosure) {
    add(items, {
      key: "grounded_unknown",
      question: turn.semantic.currentQuestion,
      fact: `سؤالك واضح: «${turn.semantic.currentQuestion}». المعلومة المحددة اللازمة للجواب مش موجودة عندي ضمن الحقيقة الموثقة الحالية، لذلك ما رح أخمّن أو أبدل سؤالك بموضوع ثاني.`,
      source: "scope_policy",
    });
  }

  if (!items.length && shouldScopeToBusiness(turn)) {
    add(items, {
      key: "business_scope",
      question: turn.semantic?.currentQuestion || turn.rawText,
      fact: "أنا هون لمتابعة خدمات وطلبات الأمين للأقساط. إذا سؤالك عن طلبك، جهاز، تقسيط، دفع، مستندات أو الاستلام احكيلي النقطة وبجاوبك من المعلومات الموثقة عندنا.",
      source: "scope_policy",
    });
  }

  return {
    items,
    semanticQuestion: turn.semantic?.currentQuestion || null,
    semanticObligations: [...(turn.semantic?.answerObligations || [])],
    hasMaterialObligation: items.length > 0 || Boolean(turn.semantic?.currentQuestion || turn.semantic?.answerObligations.length),
    mustRetireGenericFallback: items.length > 0,
  };
}

export function renderSingleConversationAnswerPlan(plan: SingleConversationAnswerPlan): string | null {
  if (!plan.items.length) return null;
  if (plan.items.length === 1) return plan.items[0].fact;
  return plan.items.map((item) => item.fact.trim()).filter(Boolean).join("\n\n");
}

export function buildSingleConversationAuthorityReply(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
}): string | null {
  return renderSingleConversationAnswerPlan(buildSingleConversationAnswerPlan(input));
}

export function genericFallbackDetected(reply: string | null | undefined) {
  const q = n(reply);
  if (!q) return false;
  return (q.includes("احكيلي شو بدك تعرف") && q.includes("بدون ما افترض"))
    || (q.includes("فهمت سوالك الحالي") && q.includes("ما عندي حقيقه موثقه كفايه"))
    || (q.includes("احكيلي المعلومه اللي بدك اياها") && q.includes("بدون ما الف"));
}

function coverageForItem(reply: string, item: ConversationAnswerItem) {
  const q = n(reply);
  switch (item.key) {
    case "monthly_installment_payment":
      return /cliq|كليك/i.test(reply) && /تحويل\s+بنكي|البنك/.test(q) && /الموقع|الحضور/.test(q);
    case "first_installment_timing":
      return /شهر/.test(q) && /توقيع\s+العقد/.test(q) && /استلام\s+الجهاز/.test(q);
    case "office_location":
      return /عمان/.test(q) && /شارع\s+المدينه\s+المنوره/.test(q);
    case "fee_rationale":
      return /(?:5|٥|خمس)/.test(q) && /جدي/.test(q) && /طلبات/.test(q) && /(?:لا\s+تضمن|مش\s+ضمان|ولا\s+ضمان|لا\s+يعني\s+موافق)/.test(q);
    case "iphone18_product_truth": {
      if (!/(?:iphone|ايفون)\s*18|18\s*(?:pro|برو)/i.test(q)) return false;
      if (/19\s*ديسمبر\s*2026/.test(q)) return false;
      const fact = n(item.fact);
      if (/isystems/i.test(item.fact) && !/isystems/i.test(reply)) return false;
      if (/(?:شرق\s*اوسط|الشرق\s*الاوسط)/.test(fact) && !/(?:شرق\s*اوسط|الشرق\s*الاوسط)/.test(q)) return false;
      if (/عنابي/.test(fact) && !/عنابي/.test(q)) return false;
      if (/بعد\s+شهر/.test(fact) && !(q.includes("شهر") && q.includes(n("الموافقة النهائية")) && /موعد/.test(q))) return false;
      const compactFactNumbers = item.fact.replace(/,/g, "");
      const compactReplyNumbers = reply.replace(/,/g, "");
      const expectedPrices = Array.from(compactFactNumbers.matchAll(/\b(1199|1399|1799|2399|1299|1499|1899|2499)\b/g)).map((m) => m[1]);
      if (expectedPrices.some((price) => !compactReplyNumbers.includes(price))) return false;
      if (/خصم\s*5/.test(fact) && !/(?:ما\s+عليه|ما\s+عليها|لا\s+يوجد|بدون|مستثن).{0,30}خصم|خصم.{0,30}(?:ما\s+عليه|ما\s+عليها|لا\s+يوجد|مستثن)/.test(q)) return false;
      return true;
    }
    case "installment_duration_change":
      return /(?:مده|مدة|شهر|سنه|سنة|سنتين)/.test(q) && /(?:الحسبه|الحسبة|الطلب|رسمي)/.test(q) && !/رسوم\s+فتح\s+الملف.{0,20}(?:ادفع|مطلوب)/.test(q);
    case "grounded_unknown":
      return q.includes(n(item.question)) || (q.includes("المعلومه") && /مش\s+موجود|غير\s+موجود|ما\s+عندي/.test(q));
    case "current_next_step":
      return !genericFallbackDetected(reply) && q.length >= 20;
    case "business_scope":
      return /الامين\s+للاقساط|الأمين\s+للأقساط/.test(q);
    default:
      return true;
  }
}

export function answerPlanCoverage(input: { reply: string | null | undefined; plan: SingleConversationAnswerPlan }) {
  const reply = String(input.reply || "").trim();
  if (!input.plan.items.length) return { pass: true, missing: [] as ConversationAnswerKey[] };
  const missing = input.plan.items.filter((item) => !coverageForItem(reply, item)).map((item) => item.key);
  if (input.plan.mustRetireGenericFallback && genericFallbackDetected(reply)) {
    for (const item of input.plan.items) if (!missing.includes(item.key)) missing.push(item.key);
  }
  return { pass: missing.length === 0, missing };
}

export function repairReplyAgainstAnswerPlan(input: { reply: string | null | undefined; plan: SingleConversationAnswerPlan }) {
  const original = String(input.reply || "").trim();
  const coverage = answerPlanCoverage({ reply: original, plan: input.plan });
  if (coverage.pass) return { repaired: false, reply: original, missing: coverage.missing };
  const missingItems = input.plan.items.filter((item) => coverage.missing.includes(item.key));
  const grounded = missingItems.map((item) => item.fact.trim()).filter(Boolean).join("\n\n");
  if (!grounded) return { repaired: false, reply: original, missing: coverage.missing };
  if (!original || genericFallbackDetected(original)) {
    return { repaired: true, reply: renderSingleConversationAnswerPlan(input.plan) || grounded, missing: coverage.missing };
  }
  return { repaired: true, reply: `${original}\n\n${grounded}`.trim(), missing: coverage.missing };
}
