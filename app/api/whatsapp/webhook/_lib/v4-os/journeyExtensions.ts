import { JOURNEY_DIRECTOR_NOTE } from "./journeyDirector";
import type { V4DraftResponse, V4TruthBundle, V4TurnUnderstanding } from "./types";

const PREFIX = "journey_extension:";

type ExtensionKind =
  | "new_application"
  | "apply_start"
  | "delivery_time"
  | "review_and_delivery_time"
  | "guarantor_choice"
  | "alternative_income"
  | "contract_type"
  | "office_location"
  | "reopen_from_closed_stage";

function normalizeArabic(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[ـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function value(truth: V4TruthBundle, key: string) {
  return truth.facts[key]?.value;
}
function text(truth: V4TruthBundle, key: string) {
  const v = value(truth, key);
  return v == null ? "" : String(v).trim();
}
function stage(truth: V4TruthBundle) {
  return text(truth, "application.journey_stage");
}

function understanding(input: {
  kind: ExtensionKind;
  burstText: string;
  summary: string;
  goal: string;
  facts?: string[];
  action?: V4TurnUnderstanding["requestedAction"];
  disposition?: V4TurnUnderstanding["actionDisposition"];
}): V4TurnUnderstanding {
  return {
    meaningSummary: input.summary,
    currentGoal: input.goal,
    explicitQuestions: [input.burstText.trim()].filter(Boolean),
    neededFactKeys: input.facts || [],
    requestedAction: input.action || null,
    actionDisposition: input.disposition || "none",
    requestedPersona: null,
    references: [],
    emotion: "neutral",
    urgency: "normal",
    topicChanged: true,
    customerRejectedPreviousAnswer: false,
    customerWantsBrevity: true,
    noReplyRequested: false,
    identityQuestion: false,
    humanContactRequested: false,
    socialClosure: false,
    confidence: 1,
    warnings: [`${PREFIX}${input.kind}`, "v4_1_second_pass_production_failure"],
  };
}

function kindOf(u: V4TurnUnderstanding): ExtensionKind | null {
  const m = u.warnings.find((x) => x.startsWith(PREFIX));
  return m ? (m.slice(PREFIX.length) as ExtensionKind) : null;
}

function asksNewApplication(q: string) {
  return /(?:بدي|اريد|حاب).{0,20}(?:اطلب|اقدم|اعمل).{0,20}(?:جهاز|طلب)\s+(?:جديد|من\s+جديد)|(?:طلب|جهاز)\s+جديد/.test(q);
}

function asksApplyStart(q: string) {
  return /(?:كيف|من\s+وين|وين).{0,20}(?:اقدم|ابدأ|ابدا|ابلش)|(?:ساعدني|وجهني).{0,20}(?:ابلش|ابدأ|ابدا)|(?:شو|ايش)\s+(?:الاجراءات|الإجراءات)\s*(?:للتقديم)?/.test(q);
}

function asksDeliveryTime(q: string) {
  const delivery = /(?:استلام|استلم|التسليم|تسليم|يوصلني|استلم\s+الجهاز)/.test(q);
  const timing = /(?:كم|قديش|متى|امتى|مده|مدة|وقت|تقريبي|تقريبا|بالوضع\s+الطبيعي|من\s+الموافقه\s+النهائيه)/.test(q);
  return delivery && timing;
}

function asksReviewTime(q: string) {
  return /(?:كم|قديش|متى|امتى).{0,30}(?:الموافقه|الموافقة|الرد|المراجعه|المراجعة)|(?:وقت|مده|مدة).{0,20}(?:الموافقه|الموافقة|المراجعه|المراجعة)/.test(q);
}

function asksGuarantorChoice(q: string) {
  return /(?:كفيل).{0,40}(?:كشف\s+راتب|اثبات\s+دخل)|(?:كشف\s+راتب|اثبات\s+دخل).{0,40}(?:كفيل)|(?:شو|ايش)\s+(?:شروط|حالات).{0,20}كفيل|(?:بدي|اريد).{0,20}كفيل/.test(q);
}

function asksAlternativeIncome(q: string) {
  return /(?:ما\s+عندي|بدون).{0,25}(?:راتب|كشف\s+راتب|شهاده\s+راتب)|(?:دخل|مصدر\s+دخل).{0,40}(?:ايجار|ورث|ورثه|عمل\s+حر)|(?:ايجار|ورث|ورثه).{0,40}(?:دخل|راتب)/.test(q);
}

function asksContractType(q: string) {
  return /(?:شو|ايش|ما).{0,20}(?:العقد|نوع\s+العقد)|(?:كمبياله|كمبيالة|سند\s+لامر|سند\s+لأمر)/.test(q);
}

function asksOffice(q: string) {
  return /(?:في|عندكم).{0,20}(?:فرع|مكتب|مكان)|(?:وين|اين).{0,20}(?:الفرع|المكتب|موقعكم)|(?:نزور|ازور).{0,20}(?:موقعكم|المكتب|الفرع)/.test(q);
}

function asksContinueClosed(q: string) {
  return /(?:بدي|اريد|حاب).{0,20}(?:اكمل|استكمل|ارجع\s+اكمل)|(?:استكمال|اكمال)\s+(?:الطلب|الاجراء|الاجراءات)/.test(q);
}

export function resolveV41ExtendedUnderstanding(input: {
  burstText: string;
  truth: V4TruthBundle;
}): V4TurnUnderstanding | null {
  const q = normalizeArabic(input.burstText);
  if (!q) return null;

  // A clearly new purchase/request is never dragged back into an old refund/cancelled case.
  if (asksNewApplication(q)) {
    return understanding({
      kind: "new_application", burstText: input.burstText,
      summary: "العميل يريد بدء طلب جهاز جديد وليس متابعة الموضوع القديم",
      goal: "start_new_application", facts: ["business.products_url"],
    });
  }

  // If the current case is closed/refunding and the customer explicitly says they want
  // to continue the same process, route to reopen rather than repeating refund status.
  if (["refund_requested", "cancelled"].includes(stage(input.truth)) && asksContinueClosed(q)) {
    return understanding({
      kind: "reopen_from_closed_stage", burstText: input.burstText,
      summary: "العميل يريد التراجع عن الإغلاق/الاسترداد والاستمرار بنفس الطلب",
      goal: "reopen_application", action: "reopen_application", disposition: "request",
    });
  }

  const delivery = asksDeliveryTime(q);
  const review = asksReviewTime(q);
  if (delivery && review) {
    return understanding({
      kind: "review_and_delivery_time", burstText: input.burstText,
      summary: "العميل يسأل عن مدة الموافقة ومدة الاستلام معًا",
      goal: "review_and_delivery_time",
      facts: ["application.device_name", "review.normal_window", "recent_release.rule", "pickup.rule"],
    });
  }
  if (delivery) {
    return understanding({
      kind: "delivery_time", burstText: input.burstText,
      summary: "العميل يسأل عن مدة استلام الجهاز لا عن مدة مراجعة الطلب",
      goal: "device_delivery_time",
      facts: ["application.device_name", "recent_release.rule", "pickup.rule", "application.status.customer"],
    });
  }

  if (asksNewApplication(q) || asksApplyStart(q)) {
    return understanding({
      kind: "apply_start", burstText: input.burstText,
      summary: "العميل يسأل من أين يبدأ التقديم أو ما إجراءات البداية",
      goal: "application_start", facts: ["business.products_url", "requirements.guidance"],
    });
  }

  if (asksGuarantorChoice(q)) {
    return understanding({
      kind: "guarantor_choice", burstText: input.burstText,
      summary: "العميل يسأل هل الكفيل بديل عن إثبات الدخل أو متى يُطلب",
      goal: "guarantor_vs_income_requirement", facts: ["requirements.guidance"],
    });
  }

  if (asksAlternativeIncome(q)) {
    return understanding({
      kind: "alternative_income", burstText: input.burstText,
      summary: "العميل لديه مصدر دخل غير راتب ويسأل كيف يثبت الدخل",
      goal: "alternative_income_proof", facts: ["requirements.guidance"],
    });
  }

  if (asksContractType(q)) {
    return understanding({
      kind: "contract_type", burstText: input.burstText,
      summary: "العميل يسأل عن طبيعة العقد أو هل هو كمبيالة/سند",
      goal: "contract_type_question", facts: ["business.commercial_structure"],
    });
  }

  if (asksOffice(q)) {
    return understanding({
      kind: "office_location", burstText: input.burstText,
      summary: "العميل يسأل عن فرع أو مكان زيارة المكتب",
      goal: "office_location", facts: ["business.location.general", "pickup.rule"],
    });
  }

  return null;
}

function draft(input: { text: string; understanding: V4TurnUnderstanding; facts?: string[]; notes?: string[] }): V4DraftResponse {
  return {
    text: input.text,
    decision: "ANSWER",
    claims: [],
    answeredQuestions: input.understanding.explicitQuestions,
    usedFactKeys: input.facts || [],
    notes: [JOURNEY_DIRECTOR_NOTE, "journey_extension_deterministic", ...(input.notes || [])],
  };
}

function isIphone18(device: string) {
  return /iphone\s*18/i.test(device);
}

function deliveryText(truth: V4TruthBundle) {
  const device = text(truth, "application.device_name");
  const recentRule = text(truth, "recent_release.rule");
  const pickup = text(truth, "pickup.rule");
  if (isIphone18(device) && recentRule) return recentRule;
  return pickup
    ? `بالنسبة للاستلام: ما عندي مدة عامة ثابتة وموثقة قبل الموافقة النهائية وجاهزية الجهاز. ${pickup}`
    : "بالنسبة للاستلام: ما عندي مدة عامة ثابتة وموثقة قبل الموافقة النهائية وجاهزية الجهاز، فما رح أعطيك رقم تقريبي من عندي.";
}

export function buildV41ExtendedDraft(input: {
  understanding: V4TurnUnderstanding;
  truth: V4TruthBundle;
}): V4DraftResponse | null {
  const kind = kindOf(input.understanding);
  if (!kind) return null;

  if (kind === "new_application" || kind === "apply_start") {
    const products = text(input.truth, "business.products_url");
    const guidance = text(input.truth, "requirements.guidance");
    const lead = kind === "new_application"
      ? "أكيد، إذا بدك جهاز جديد بنبدأ طلب جديد وما بنربطه تلقائيًا بالطلب القديم."
      : "ابدأ من صفحة الأجهزة: اختار الجهاز وعبّي طلب الموافقة المبدئية.";
    return draft({
      text: `${lead}${products ? `\n${products}` : ""}${guidance ? `\nالأساس: الهوية وإثبات دخل مناسب، والدراسة تحدد المطلوب النهائي.` : ""}`,
      understanding: input.understanding,
      facts: ["business.products_url", "requirements.guidance"],
      notes: ["new/start application cannot be hijacked by old refund/status"],
    });
  }

  if (kind === "delivery_time") {
    return draft({
      text: deliveryText(input.truth), understanding: input.understanding,
      facts: ["application.device_name", "recent_release.rule", "pickup.rule"],
      notes: ["delivery timing isolated from review timing"],
    });
  }

  if (kind === "review_and_delivery_time") {
    const review = text(input.truth, "review.normal_window");
    return draft({
      text: `للموافقة: ${review || "ما عندي مدة مراجعة موثقة أقدر أحددها"}.\n${deliveryText(input.truth)}`,
      understanding: input.understanding,
      facts: ["review.normal_window", "application.device_name", "recent_release.rule", "pickup.rule"],
      notes: ["answers both review and delivery questions"],
    });
  }

  if (kind === "guarantor_choice") {
    return draft({
      text: "الكفيل مش بديل تلقائي عن إثبات الدخل، ومش شرط ثابت لكل طلب. إذا ما عندك كشف/شهادة راتب، ممكن تقدم إثبات دخل بديل مناسب، والدراسة هي اللي تحدد إذا احتاج الملف كفيل أو مستند إضافي.",
      understanding: input.understanding,
      facts: ["requirements.guidance"],
      notes: ["direct guarantor-vs-income answer"],
    });
  }

  if (kind === "alternative_income") {
    return draft({
      text: "إذا دخلك مش راتب ثابت، ارفع مستند رسمي يوضح مصدر الدخل أو كشف حساب يبينه. ما بقدر أضمن قبول نوع مستند بعينه قبل الدراسة؛ هي اللي تحدد المقبول النهائي حسب الملف.",
      understanding: input.understanding,
      facts: ["requirements.guidance"],
      notes: ["alternative income answered without restarting general sales script"],
    });
  }

  if (kind === "contract_type") {
    const structure = text(input.truth, "business.commercial_structure");
    return draft({
      text: `${structure ? `${structure}. ` : ""}أما هل المستند تحديدًا كمبيالة أو سند لأمر، ما عندي حقيقة موثقة بهالتفصيل ضمن بياناتي الحالية، فما رح أخمّن عليك.`,
      understanding: input.understanding,
      facts: ["business.commercial_structure"],
      notes: ["contract question cannot repeat payment handoff"],
    });
  }

  if (kind === "office_location") {
    const location = text(input.truth, "business.location.general");
    const pickup = text(input.truth, "pickup.rule");
    return draft({
      text: `${location ? `الموقع الموثق عندي: ${location}.` : "ما عندي موقع فرع موثق أقدر أعطيك إياه."}${pickup ? ` ${pickup}` : ""}`,
      understanding: input.understanding,
      facts: ["business.location.general", "pickup.rule"],
      notes: ["do not invent branch availability"],
    });
  }

  // Reopen is intentionally left to procedureEngine + authoritative action backplane.
  return null;
}
