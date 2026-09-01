import type {
  V2ActionKey,
  V2CorrectionCandidate,
  V2DialogueAct,
  V2InterpretedTurn,
  V2ReferenceCandidate,
  V2TopicKey,
} from "./types";
import { uniqueStrings, v2Compact, v2HasAny, v2Language, v2Normalize } from "./normalize";

type DeterministicInput = {
  customerText: string;
  messageType?: string | null;
};

function act(
  acts: V2DialogueAct[],
  type: V2DialogueAct["type"],
  topic: V2TopicKey,
  text: string,
  options: Partial<Pick<V2DialogueAct, "action" | "target" | "value" | "confidence">> = {},
) {
  const key = `${type}:${topic}:${v2Normalize(text)}:${options.action || ""}:${options.value || ""}`;
  if (acts.some((item) => `${item.type}:${item.topic}:${v2Normalize(item.text)}:${item.action || ""}:${item.value || ""}` === key)) return;
  acts.push({
    id: `d${acts.length + 1}`,
    type,
    topic,
    text: String(text || "").trim(),
    action: options.action ?? null,
    target: options.target ?? null,
    value: options.value ?? null,
    confidence: options.confidence ?? 0.97,
    source: "deterministic",
  });
}

function addReference(references: V2ReferenceCandidate[], candidate: V2ReferenceCandidate) {
  if (!references.some((item) => item.kind === candidate.kind && v2Normalize(item.text) === v2Normalize(candidate.text))) {
    references.push(candidate);
  }
}

function asks(value: string) {
  const t = v2Normalize(value);
  return /[؟?]/.test(String(value || "")) ||
    /(?:^|\s)(?:كم|قديش|متى|امتى|ليش|كيف|شو|هل|وين|اين|ايش|بقدر|بنفع|بزبط|ممكن|لازم)(?:\s|$)/.test(t);
}

function explicitCancel(text: string) {
  const t = v2Normalize(text);
  if (/(?:لا|ما|مش)\s*(?:بدي|اريد)?\s*(?:الغي|الغاء)/.test(t)) return false;
  return v2HasAny(t, [
    "بدي الغي", "اريد الغاء", "الغاء الطلب", "الغي الطلب", "الغوا الطلب",
    "كنسل الطلب", "الغيه", "الغي معاملتي", "الغاء معاملتي",
  ]);
}

function cancellationQuestion(text: string) {
  const t = v2Normalize(text);
  return asks(text) && v2HasAny(t, [
    "بقدر الغي", "بزبط الغي", "ممكن الغي", "كيف الغي", "هل بقدر الغي", "بصير الغي",
  ]);
}

function explicitRefund(text: string) {
  const t = v2Normalize(text);
  const timing = v2HasAny(t, ["شو صار بالاسترداد", "وين الاسترداد", "متى الاسترداد", "شو صار بالاسترجاع", "وين فلوسي"]);
  if (timing) return false;
  return v2HasAny(t, [
    "بدي استرداد", "بدي استرجاع", "رجعولي فلوسي", "رجعولي الرسوم", "ردولي الرسوم",
    "بدي فلوسي", "استرداد الرسوم", "استرجاع الرسوم", "رجعولي الخمس",
  ]);
}

function refundFollowup(text: string) {
  return v2HasAny(text, [
    "شو صار بالاسترداد", "وهسا شو صار بالاسترجاع", "وهسا شو صار بالاسترداد",
    "وين الاسترداد", "وين فلوسي", "متى الاسترداد", "متى الحواله", "متى الحوالة",
    "بدي الاسترداد تبعي", "الاسترداد تبعي",
  ]);
}

function explicitHandoff(text: string) {
  return v2HasAny(text, [
    "بدي موظف", "بدي موضف", "احكي مع موظف", "أحكي مع موظف", "بدي احكي مع موظف",
    "بدي احكي مع حدا", "بدي أحكي مع حدا", "احكي مع حدا", "أحكي مع حدا",
    "حولني لموظف", "حوّلني لموظف", "حولوني لموظف", "حوّلوني لموظف",
    "حولني لحدا", "حوّلني لحدا", "بدي مسؤول", "احكي مع مسؤول", "أحكي مع مسؤول",
    "بدي انسان", "بدي إنسان", "بدي بشر", "موظف حقيقي", "شخص حقيقي",
    "بدي شخص حقيقي", "حدا من الاداره", "حدا من الإدارة", "talk to a human", "live agent", "real person",
  ]);
}

function explicitCall(text: string) {
  return v2HasAny(text, [
    "بدي مكالمه", "بدي مكالمة", "اتصلوا في", "اتصلوا علي", "اتصلو في", "رنوا علي", "رنولي",
    "احكولي تلفون", "أحكولي تلفون", "بدي احكي تلفون", "بدي أحكي تلفون",
    "ممكن مكالمه", "ممكن مكالمة", "بدي اتصال", "طلب اتصال", "اتصل في", "اتصل علي",
  ]);
}

function noGuarantor(text: string) {
  const t = v2Normalize(text);
  return /(كفيل|ضامن)/.test(t) &&
    /(ما\s*عندي|ماعندي|ما\s*في|مافي|لا يوجد|مش عندي|ما معي|مش معي)/.test(t);
}

function repairRequest(text: string) {
  const t = v2Normalize(text);
  return [
    "ما فهمت", "مافهمت", "مش فاهم", "مش فاهمه", "كيف يعني", "شو يعني",
    "وضح", "وضحي", "اشرح", "اشرحي",
  ].includes(t);
}

function deictic(text: string) {
  const t = v2Normalize(text);
  return [
    "هيك", "هيك تمام", "هيك صح", "هاد", "هذا", "هاي", "هو نفسه", "هي نفسها",
    "تمام هيك", "صح هيك",
  ].includes(t) || /^هيك\b/.test(t);
}

function shortAnswer(text: string) {
  const t = v2Normalize(text);
  return ["اه", "اها", "نعم", "لا", "ماعندي", "ما عندي", "عندي", "تمام", "صح"].includes(t);
}

function correction(text: string) {
  const raw = String(text || "").trim();
  if (!raw.endsWith("*")) return null;
  const replacement = raw.slice(0, -1).trim();
  return replacement ? replacement : null;
}

function looksLikeSiteFailure(text: string) {
  return v2HasAny(text, [
    "ما زبط", "مازبط", "مش زابط", "لسا معلق", "لسا بعلق", "جربت من اول وجديد",
    "جربت عدت من اول وجديد", "مش راضي يفتح", "ما بفتح", "خطا", "خطأ", "404",
  ]);
}

function addQuestionTopics(acts: V2DialogueAct[], text: string) {
  const t = v2Normalize(text);

  const firstInstallment = v2HasAny(t, ["الدفعه الاولى", "الدفعة الاولى", "القسط الاول", "اول قسط"]);
  if (firstInstallment) {
    act(acts, "ask", "first_installment", text, { confidence: 0.99 });
  }

  const installmentAmount = v2HasAny(t, [
    "كم القسط", "قديش القسط", "كم الدفعه", "كم الدفعة", "قيمة القسط", "قيمه القسط",
  ]);
  if (installmentAmount && !firstInstallment) {
    act(acts, "ask", "installment_amount", text, { confidence: 0.97 });
  }

  const duration = v2HasAny(t, [
    "كم شهر", "كم من شهر", "على كم شهر", "مده التقسيط", "مدة التقسيط", "عدد الاقساط", "عدد الأقساط",
  ]);
  if (duration) act(acts, "ask", "installment_duration", text, { confidence: 0.99 });

  const price = v2HasAny(t, [
    "السعر", "سعره", "سعر الجهاز", "كم سعر", "قديش سعر",
  ]);
  if (price) act(acts, "ask", "product_price", text, { confidence: 0.98 });

  const products = v2HasAny(t, ["الاجهزه", "الأجهزة", "المنتجات", "شو عندكم اجهزه", "شو عندكم أجهزة"]);
  if (products) act(acts, "ask", "products", text, { confidence: 0.95 });

  const location = v2HasAny(t, [
    "وين موقعكم", "وين المكتب", "موقع الاستلام", "وين موقع الاستلام", "وين استلم",
    "عنوانكم", "موقع المكتب", "وين مكانكم", "بقدر اجي المكتب", "بقدر أجي المكتب",
    "اقدر اجي المكتب", "أقدر أجي المكتب", "ممكن اجي المكتب", "ممكن أجي المكتب",
    "بقدر ازور المكتب", "بقدر أزور المكتب", "ممكن ازوركم", "ممكن أزوركم",
  ]);
  if (location) act(acts, "ask", "office_location", text, { confidence: 0.99 });

  const review = v2HasAny(t, [
    "متى بردولي", "متى بتردولي", "متى الرد", "قديش بدها وقت", "كم بدها وقت",
    "كم يوم", "متى بتطلع النتيجه", "متى بتطلع النتيجة", "قصدي متى بردولي", "قصدي متا بردولي",
  ]);
  if (review) act(acts, "ask", "review_timing", text, { confidence: 0.98 });

  const status = v2HasAny(t, [
    "شو صار بالطلب", "وين وصل الطلب", "حاله الطلب", "حالة الطلب", "اخر تحديث", "آخر تحديث",
  ]);
  if (status) act(acts, "ask", "application_status", text, { confidence: 0.98 });

  const paymentTiming = v2HasAny(t, [
    "متى احول", "متى أحول", "احول هسا", "أحول هسا", "ادفع هسا", "أدفع هسا",
    "عند الموافقه ام الان", "عند الموافقة ام الآن", "كم معي لاحول", "لحد متى احول",
  ]);
  if (paymentTiming) {
    act(acts, "ask", "payment_timing", text, { confidence: 0.99 });
  } else if (asks(text) && v2HasAny(t, ["احول", "أحول", "ادفع", "أدفع"]) && t.length <= 55) {
    act(acts, "ask", "payment_timing", text, { confidence: 0.9 });
  }

  const fee = v2HasAny(t, [
    "رسوم فتح الملف", "الخمس دنانير", "ال 5 دنانير", "ال ٥ دنانير", "الرسوم",
  ]);
  if (fee && asks(text)) act(acts, "ask", "payment_fee", text, { confidence: 0.96 });

  const receipt = v2HasAny(t, [
    "كيف احط الوصل", "كيف ارفع الوصل", "وين ارفع الوصل", "رابط الوصل", "رفع الوصل",
  ]);
  if (receipt) act(acts, "ask", "receipt_upload", text, { confidence: 0.99 });

  const delivery = v2HasAny(t, [
    "متى استلم", "متى بستلم", "وين استلم الجهاز", "كيف الاستلام", "التوصيل",
  ]);
  if (delivery) act(acts, "ask", "delivery", text, { confidence: 0.96 });

  const guarantor = v2HasAny(t, [
    "الكفيل", "كفيل", "ضامن", "الضامن",
  ]);
  if (guarantor && asks(text)) act(acts, "ask", "guarantor", text, { confidence: 0.96 });

  const requirements = v2HasAny(t, [
    "شو المطلوب", "شو الاوراق", "شو الأوراق", "المتطلبات", "المستندات المطلوبه", "المستندات المطلوبة",
  ]);
  if (requirements) act(acts, "ask", "requirements", text, { confidence: 0.98 });
}

export function deterministicInterpret(input: DeterministicInput): V2InterpretedTurn {
  const raw = String(input.customerText || "").trim();
  const normalizedText = v2Normalize(raw);
  const compact = v2Compact(raw);
  const acts: V2DialogueAct[] = [];
  const references: V2ReferenceCandidate[] = [];
  const corrections: V2CorrectionCandidate[] = [];
  const warnings: string[] = [];

  if (!raw) {
    act(acts, "unknown", "unknown", "", { confidence: 0.3 });
  }

  const corrected = correction(raw);
  if (corrected) {
    act(acts, "correct", "correction", raw, { value: corrected, confidence: 0.99 });
    corrections.push({
      originalText: raw,
      replacement: corrected,
      targetTopic: null,
      confidence: 0.99,
    });
    addReference(references, { text: raw, kind: "correction", targetTopic: null, targetActId: null, confidence: 0.99 });
  }

  if (explicitHandoff(raw)) {
    act(acts, "handoff_request", "human_handoff", raw, { action: "human_handoff", confidence: 1 });
  }

  if (explicitCall(raw)) {
    act(acts, "handoff_request", "call_request", raw, { action: "request_call", confidence: 0.99 });
  }

  if (cancellationQuestion(raw)) {
    act(acts, "ask", "cancellation", raw, { confidence: 0.99 });
  } else if (explicitCancel(raw)) {
    act(acts, "request_action", "cancellation", raw, { action: "cancel_application", confidence: 1 });
    const reasonMatch = raw.match(/(?:لاني|لأني|لأنني|لانو|لأنه|لسبب|عشان)\s+(.+)/i);
    if (reasonMatch?.[1]) {
      act(acts, "provide_reason", "cancellation", reasonMatch[1], {
        target: "cancel_application",
        value: reasonMatch[1].trim(),
        confidence: 0.94,
      });
    }
  }

  if (explicitRefund(raw)) {
    act(acts, "request_action", "refund", raw, { action: "request_refund", confidence: 1 });
  } else if (refundFollowup(raw)) {
    act(acts, "ask", "refund", raw, { confidence: 1 });
  }

  if (v2HasAny(raw, ["ما بدي اكمل", "ما بدي أكمل", "لا ارغب بالاستمرار", "لا أريد الاستمرار", "ما رح اكمل"])) {
    act(acts, "request_action", "continuation", raw, { action: "decline_application", value: "decline", confidence: 0.99 });
    warnings.push("non_continuation_explicit");
  } else if (v2HasAny(raw, ["بدي اكمل", "بدي أكمل", "اريد الاستمرار", "أريد الاستمرار", "نعم استمر", "خلينا نكمل"])) {
    act(acts, "request_action", "continuation", raw, { action: "continue_application", value: "continue", confidence: 0.99 });
  }

  if (noGuarantor(raw)) {
    act(acts, "provide_fact", "guarantor", raw, { value: "none", confidence: 1 });
  }

  if (repairRequest(raw)) {
    act(acts, "repair_request", "repair", raw, { confidence: 1 });
    addReference(references, { text: raw, kind: "repair", targetTopic: null, targetActId: null, confidence: 0.99 });
  }

  if (deictic(raw)) {
    addReference(references, { text: raw, kind: "deictic", targetTopic: null, targetActId: null, confidence: 0.97 });
  } else if (shortAnswer(raw)) {
    addReference(references, { text: raw, kind: "short_answer", targetTopic: null, targetActId: null, confidence: 0.95 });
  }

  if (looksLikeSiteFailure(raw)) {
    act(acts, "complaint", "site_issue", raw, { confidence: 0.92 });
  }

  addQuestionTopics(acts, raw);

  if (v2HasAny(raw, ["مرحبا", "السلام عليكم", "اهلا", "أهلا", "هلا"]) && normalizedText.length <= 40) {
    act(acts, "greet", "greeting", raw, { confidence: 0.95 });
  }
  if (v2HasAny(raw, ["شكرا", "شكراً", "يسلمو", "مشكور"]) && normalizedText.length <= 55) {
    act(acts, "thank", "acknowledgement", raw, { confidence: 0.95 });
  }

  if (!acts.length && input.messageType && input.messageType !== "text") {
    act(acts, "unknown", "unknown", raw || `[${input.messageType}]`, { confidence: 0.55 });
    warnings.push(`media_requires_resolution:${input.messageType}`);
  }

  if (!acts.length) {
    act(acts, "unknown", "unknown", raw, { confidence: compact.length <= 10 ? 0.45 : 0.6 });
  }

  const topics = uniqueStrings(acts.map((item) => item.topic));
  const requestedActions = uniqueStrings(
    acts.map((item) => item.action).filter((value): value is V2ActionKey => Boolean(value && value !== "none")),
  );

  return {
    version: "2.0-phase1",
    source: "deterministic",
    language: v2Language(raw),
    normalizedText,
    acts,
    topics,
    references,
    corrections,
    requestedActions,
    confidence: Math.min(1, Math.max(...acts.map((item) => item.confidence), 0.5)),
    warnings,
    provider: null,
  };
}
