import { buildCommercialFastPathDraft, resolveCommercialFastPathUnderstanding } from "./commercialFunnelPolicy";
import type {
  V4ActionName,
  V4DraftResponse,
  V4Persona,
  V4TruthBundle,
  V4TurnUnderstanding,
  V4WorkingMemory,
} from "./types";

export const JOURNEY_DIRECTOR_NOTE = "journey_director_deterministic";
const PREFIX = "journey_director:";

type DirectorKind =
  | "document_status"
  | "document_upload_income"
  | "document_upload_identity"
  | "document_upload_guarantor"
  | "installment_arrears"
  | "product_question"
  | "status"
  | "tracking"
  | "review_time"
  | "social_closure"
  | "critical_action"
  | "pending_confirmation"
  | "human_request"
  | "persona_request";

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

function factValue(truth: V4TruthBundle, key: string) {
  return truth.facts[key]?.value;
}

function factText(truth: V4TruthBundle, key: string) {
  const value = factValue(truth, key);
  return value == null ? "" : String(value).trim();
}

function factBool(truth: V4TruthBundle, key: string) {
  return factValue(truth, key) === true;
}

function factNumber(truth: V4TruthBundle, key: string) {
  const n = Number(factValue(truth, key));
  return Number.isFinite(n) ? n : null;
}

function stage(truth: V4TruthBundle) {
  return factText(truth, "application.journey_stage");
}

function rawStatus(truth: V4TruthBundle) {
  return factText(truth, "application.status.raw").toLowerCase();
}

function marker(kind: DirectorKind, detail?: string) {
  return `${PREFIX}${kind}${detail ? `:${detail}` : ""}`;
}

function directorMarker(understanding: V4TurnUnderstanding) {
  return understanding.warnings.find((x) => x.startsWith(PREFIX)) || null;
}

function makeUnderstanding(input: {
  kind: DirectorKind;
  burstText: string;
  summary: string;
  goal: string;
  questions?: string[];
  facts?: string[];
  action?: V4ActionName | null;
  disposition?: V4TurnUnderstanding["actionDisposition"];
  persona?: V4Persona | null;
  human?: boolean;
  detail?: string;
  socialClosure?: boolean;
}): V4TurnUnderstanding {
  return {
    meaningSummary: input.summary,
    currentGoal: input.goal,
    explicitQuestions: input.questions || [],
    neededFactKeys: input.facts || [],
    requestedAction: input.action || null,
    actionDisposition: input.disposition || "none",
    requestedPersona: input.persona || null,
    references: [],
    emotion: "neutral",
    urgency: input.human ? "urgent" : "normal",
    topicChanged: false,
    customerRejectedPreviousAnswer: false,
    customerWantsBrevity: true,
    noReplyRequested: false,
    identityQuestion: false,
    humanContactRequested: Boolean(input.human),
    socialClosure: Boolean(input.socialClosure),
    confidence: 1,
    warnings: [marker(input.kind, input.detail), "v4_1_current_turn_authority"],
  };
}

function isDenial(q: string) {
  return /^(?:لا|لأ|مش\s+موافق|لا\s+تعمل|لا\s+تنفذ|الغيت\s+الفكره|غيرت\s+رايي)$/.test(q);
}

function confirmsAction(action: V4ActionName, q: string) {
  if (/^(?:نعم|اه|ايوه|تمام|موافق|اكد|نفذ|اعتمد)$/.test(q)) return true;
  switch (action) {
    case "cancel_application": return /(?:نعم\s+)?(?:الغي|الغاء)\s+(?:الطلب|طلبي)/.test(q);
    case "request_refund": return /(?:نعم\s+)?(?:اريد|بدي)?\s*(?:استرداد|ارجاع|رجع)\s*(?:الرسوم|المبلغ|المصاري)?/.test(q);
    case "stop_refund": return /(?:نعم\s+)?(?:وقف|اوقف|الغ)\s+(?:الاسترداد|طلب\s+الاسترداد)/.test(q);
    case "reopen_application": return /(?:نعم\s+)?(?:بدي\s+)?(?:اعيد|ارجع)\s+فتح\s+(?:الطلب|الملف)/.test(q) || /اكمل\s+عليه/.test(q);
    case "link_whatsapp_alias": return /(?:نعم\s+)?اعتمد\s+(?:الرقم|رقم\s+الواتساب)/.test(q);
    case "change_device": return /(?:نعم\s+)?(?:غير|غيّر)\s+(?:الجهاز|الموديل)/.test(q);
    case "change_application_data": return /(?:نعم\s+)?(?:عدل|عدّل)\s+(?:البيانات|المعلومات)/.test(q);
    default: return false;
  }
}

function pendingConfirmation(input: { burstText: string; memory: V4WorkingMemory }) {
  const pending = input.memory.pendingProcedure;
  if (!pending || pending.state !== "confirmation_required") return null;
  const q = normalizeArabic(input.burstText);
  if (isDenial(q)) {
    return makeUnderstanding({
      kind: "pending_confirmation",
      burstText: input.burstText,
      summary: `العميل رفض الإجراء المعلّق ${pending.name}`,
      goal: `deny_${pending.name}`,
      action: pending.name,
      disposition: "deny",
      detail: pending.name,
    });
  }
  if (confirmsAction(pending.name, q)) {
    return makeUnderstanding({
      kind: "pending_confirmation",
      burstText: input.burstText,
      summary: `العميل أكد الإجراء المعلّق ${pending.name}`,
      goal: `confirm_${pending.name}`,
      action: pending.name,
      disposition: "confirm",
      detail: pending.name,
    });
  }
  return null;
}

function personaRequest(value: string): V4Persona | null {
  const q = normalizeArabic(value);
  if (/(?:وين|بدي|احكي\s+مع|جيب|نادولي)\s+عمران/.test(q)) return "omran";
  if (/(?:وين|بدي|احكي\s+مع|جيب|نادولي)\s+عبدالله/.test(q)) return "abdullah";
  if (/(?:وين|بدي|احكي\s+مع|جيب|نادولي)\s+عبدالرحمن/.test(q)) return "abdulrahman";
  if (/(?:وين|بدي|احكي\s+مع|جيب|نادولي)\s+تالا/.test(q)) return "tala";
  if (/(?:وين|بدي|احكي\s+مع|جيب|نادولي)\s+فدوه/.test(q)) return "fadwa";
  if (/(?:وين|بدي|احكي\s+مع|جيب|نادولي)\s+خالد/.test(q)) return "khaled";
  return null;
}

function humanRequest(value: string) {
  const q = normalizeArabic(value);
  return /(?:بدي|اريد|بدّي).{0,20}(?:موظف|حد\s+حقيقي|انسان|شخص).{0,20}(?:يحكي|يتواصل|يرن|يتصل)|(?:حد|موظف).{0,15}(?:يرن|يتصل|يتواصل)\s*(?:علي|معي)?|(?:رنوا|اتصلوا|تواصلوا)\s*(?:معي|علي)/.test(q);
}

function criticalAction(value: string): { action: V4ActionName; summary: string } | null {
  const q = normalizeArabic(value);
  if (/(?:اذا|لو)\s+/.test(q)) return null;
  if (/(?:بدي|اريد|بدّي|رجاء|لو\s+سمحت).{0,25}(?:الغي|الغاء)\s+(?:الطلب|طلبي)|^(?:الغي|الغاء)\s+(?:الطلب|طلبي)/.test(q)) {
    return { action: "cancel_application", summary: "العميل يطلب إلغاء الطلب" };
  }
  if (/(?:بدي|اريد|بدّي).{0,25}(?:استرداد|ارجاع).{0,20}(?:الرسوم|المبلغ|المصاري)|(?:رجعولي|رجعو\s+لي|رجعوا\s+لي).{0,20}(?:الرسوم|الخمس|5|المصاري)/.test(q)) {
    return { action: "request_refund", summary: "العميل يطلب استرداد الرسوم" };
  }
  if (/(?:بدي|اريد|بدّي).{0,20}(?:اوقف|وقف|الغي).{0,15}(?:الاسترداد|طلب\s+الاسترداد)/.test(q)) {
    return { action: "stop_refund", summary: "العميل يطلب إيقاف الاسترداد" };
  }
  if (/(?:بدي|اريد|بدّي).{0,20}(?:اعيد|ارجع)\s+فتح\s+(?:الطلب|الملف)|(?:تراجعت|راجع).{0,15}(?:عن\s+الالغاء)|(?:بدي|اريد).{0,15}اكمل\s+على\s+نفس\s+الطلب/.test(q)) {
    return { action: "reopen_application", summary: "العميل يطلب إعادة فتح نفس الطلب" };
  }
  return null;
}

function documentKind(value: string) {
  const q = normalizeArabic(value);
  if (/(?:كشف\s*(?:الحساب|البنك|راتب)|اثبات\s*الدخل|عقد\s*عمل|شهاده\s*راتب)/.test(q)) return "income" as const;
  if (/(?:الهويه|هويه|بطاقه\s*الشخصيه)/.test(q)) return "identity" as const;
  if (/(?:الكفيل|بيانات\s*الكفيل|هويه\s*الكفيل)/.test(q)) return "guarantor" as const;
  return null;
}

function asksHowToUpload(value: string) {
  const q = normalizeArabic(value);
  const doc = documentKind(q);
  if (!doc) return null;
  const upload = /(?:كيف|وين|من\s+وين|طريقه|شو\s+الخطوات).{0,45}(?:ارفع|رفع|ابعث|ارسل)|(?:ارفع|رفع|ابعث|ارسل).{0,45}(?:كيف|وين|من\s+وين|طريقه)/.test(q);
  return upload ? doc : null;
}

function asksWhatIsMissing(value: string) {
  const q = normalizeArabic(value);
  return /(?:ملفي|الملف|طلبي).{0,35}(?:ناقص|نقص)|(?:شو|ايش)\s+(?:ناقص|المطلوب\s+مني)|(?:هل|هو)\s+ملفي\s+ناقص/.test(q);
}

function asksInstallmentArrears(value: string) {
  const q = normalizeArabic(value);
  return /(?:لو|اذا).{0,30}(?:ما\s+دفعت|تاخرت|تأخرت).{0,30}(?:قسط|القسط|شهر)|(?:قسط|القسط).{0,25}(?:تاخر|تأخر|ما\s+اندفع)/.test(q);
}

function asksProduct(value: string) {
  const q = normalizeArabic(value);
  const device = /(?:ايفون|iphone|سامسونج|samsung|جالكسي|galaxy|s\d{2}|pro\s*max|برو\s*ماكس)/.test(q);
  const productQuestion = /(?:متوفر|موجود|عندكم|كم\s+حق|كم\s+سعر|سعره|قسطه|القسط|سعه|جيجا|تيرا)/.test(q);
  return device && productQuestion;
}

function asksTracking(value: string) {
  const q = normalizeArabic(value);
  return /(?:رابط|لينك).{0,20}(?:التتبع|تتبع)|(?:وين|كيف).{0,20}(?:اتتبع|تتبع)\s+(?:الطلب|طلبي)/.test(q);
}

function asksReviewTime(value: string) {
  const q = normalizeArabic(value);
  return /(?:كم|قديش|متى|امتى).{0,30}(?:وقت|مده|مدة|الرد|الموافقه|الموافقة)|(?:صارلي|صار\s+لي|انتظرت).{0,30}(?:يوم|اسبوع|شهر)|(?:طولت|تاخرت|تأخرت).{0,20}(?:المعامله|الطلب|الموافقه|الموافقة)/.test(q);
}

function asksStatus(value: string) {
  const q = normalizeArabic(value);
  return /(?:شو|ايش)\s+صار(?:\s+(?:بالطلب|بطلبي|فيه|بالملف))?|(?:وين|لوين)\s+وصل|(?:متابعه|متابعة)\s+(?:الطلب|طلبي)|(?:حاله|حالة|وضع)\s+(?:الطلب|طلبي)|هل\s+تم\s+(?:قبول|الموافقه|الموافقة)|طلبي.{0,45}شو\s+صار/.test(q);
}

function socialClosure(value: string) {
  const q = normalizeArabic(value);
  return /^(?:شكرا|شكراً|يسلمو|تمام|اوكي|اوك|يعطيك\s+العافيه|الله\s+يعافيك|خلص\s+تمام)$/.test(q);
}

export function resolveJourneyDirectorUnderstanding(input: {
  burstText: string;
  memory: V4WorkingMemory;
  truth: V4TruthBundle;
}): V4TurnUnderstanding | null {
  // 1) Durable pending procedure owns only an actual confirmation/denial, never a fresh question.
  const pending = pendingConfirmation({ burstText: input.burstText, memory: input.memory });
  if (pending) return pending;

  // 2) A named persona is internal conversational continuity, not a fake external human handoff.
  const persona = personaRequest(input.burstText);
  if (persona) {
    return makeUnderstanding({
      kind: "persona_request",
      burstText: input.burstText,
      summary: `العميل يطلب شخصية ${persona} من فريق الأمين داخل نفس المحادثة`,
      goal: `persona_${persona}`,
      persona,
      detail: persona,
    });
  }

  // 3) Explicit real-human/call request is a real durable escalation action.
  if (humanRequest(input.burstText)) {
    return makeUnderstanding({
      kind: "human_request",
      burstText: input.burstText,
      summary: "العميل يطلب تواصل موظف/شخص حقيقي أو اتصال هاتفي",
      goal: "request_real_human_contact",
      action: "record_human_contact_request",
      disposition: "request",
      human: true,
    });
  }

  // 4) Sensitive actions are interpreted deterministically; procedureEngine still owns one-confirmation execution.
  const action = criticalAction(input.burstText);
  if (action) {
    return makeUnderstanding({
      kind: "critical_action",
      burstText: input.burstText,
      summary: action.summary,
      goal: action.action,
      action: action.action,
      disposition: "request",
      detail: action.action,
    });
  }

  // 5) Revenue funnel is stage-aware and bypasses paid model calls.
  const commercial = resolveCommercialFastPathUnderstanding(input);
  if (commercial) return commercial;

  // 6) Exact document problem outranks generic status/review templates.
  const uploadKind = asksHowToUpload(input.burstText);
  if (uploadKind) {
    const key = uploadKind === "income"
      ? "application.income_upload_link"
      : uploadKind === "identity"
        ? "application.identity_upload_link"
        : "application.guarantor_upload_link";
    return makeUnderstanding({
      kind: uploadKind === "income" ? "document_upload_income" : uploadKind === "identity" ? "document_upload_identity" : "document_upload_guarantor",
      burstText: input.burstText,
      summary: `العميل يسأل كيف يرفع ${uploadKind}`,
      goal: `upload_${uploadKind}`,
      questions: [input.burstText.trim()].filter(Boolean),
      facts: [key, "documents.secure_rule"],
    });
  }

  if (asksWhatIsMissing(input.burstText)) {
    return makeUnderstanding({
      kind: "document_status",
      burstText: input.burstText,
      summary: "العميل يسأل تحديدًا هل ملفه ناقص مستند وما المطلوب منه",
      goal: "application_missing_documents",
      questions: [input.burstText.trim()].filter(Boolean),
      facts: [
        "application.status.raw",
        "application.documents.loaded",
        "application.documents.identity_complete",
        "application.documents.income_uploaded",
        "application.documents.guarantor_complete",
        "application.identity_upload_link",
        "application.income_upload_link",
        "application.guarantor_upload_link",
      ],
    });
  }

  // 7) Contract-installment question must never be confused with the 5-JOD receipt/payment funnel.
  if (asksInstallmentArrears(input.burstText)) {
    return makeUnderstanding({
      kind: "installment_arrears",
      burstText: input.burstText,
      summary: "العميل يسأل عن التأخر في قسط الجهاز بعد توقيع العقد",
      goal: "contract_installment_arrears_question",
      questions: [input.burstText.trim()].filter(Boolean),
      facts: ["installment.first_rule"],
    });
  }

  // 8) Device/product questions are isolated from any old application/refund/payment topic.
  if (asksProduct(input.burstText)) {
    return makeUnderstanding({
      kind: "product_question",
      burstText: input.burstText,
      summary: "العميل يسأل عن جهاز/توفر/سعر/قسط حالي",
      goal: "current_product_question",
      questions: [input.burstText.trim()].filter(Boolean),
      facts: ["business.products_url"],
    });
  }

  // 9) Status/time/tracking are separate goals; no generic tracking link is injected by default.
  if (asksTracking(input.burstText)) {
    return makeUnderstanding({
      kind: "tracking",
      burstText: input.burstText,
      summary: "العميل يطلب رابط أو طريقة تتبع طلبه",
      goal: "application_tracking",
      questions: [input.burstText.trim()].filter(Boolean),
      facts: ["application.status.customer", "application.payment_confirmed", "application.tracking_link"],
    });
  }

  if (asksReviewTime(input.burstText)) {
    return makeUnderstanding({
      kind: "review_time",
      burstText: input.burstText,
      summary: "العميل يسأل عن مدة المراجعة أو يعترض على طول الانتظار",
      goal: "application_review_time",
      questions: [input.burstText.trim()].filter(Boolean),
      facts: ["application.status.customer", "application.journey_stage", "application.age_days", "review.normal_window", "refund.pressure_rule"],
    });
  }

  if (asksStatus(input.burstText)) {
    const s = stage(input.truth);
    if (s === "continuation_confirmed_fee_due") {
      return makeUnderstanding({
        kind: "status",
        burstText: input.burstText,
        summary: "العميل يسأل عن الخطوة بعد تسجيل الاستمرار؛ رسوم فتح الملف مستحقة الآن",
        goal: "pay_opening_fee_after_continuation",
        questions: [input.burstText.trim()].filter(Boolean),
        action: "continue_application",
        disposition: "confirm",
        facts: ["application.status.customer", "application.receipt_upload_link"],
        detail: "fee_due",
      });
    }
    return makeUnderstanding({
      kind: "status",
      burstText: input.burstText,
      summary: "العميل يسأل عن حالة الطلب الحالية",
      goal: "application_status",
      questions: [input.burstText.trim()].filter(Boolean),
      facts: [
        "application.status.customer",
        "application.status.raw",
        "application.journey_stage",
        "application.payment_confirmed",
        "application.documents.loaded",
        "application.documents.identity_complete",
        "application.documents.income_uploaded",
        "application.documents.guarantor_complete",
        "application.identity_upload_link",
        "application.income_upload_link",
        "application.guarantor_upload_link",
      ],
    });
  }

  if (socialClosure(input.burstText)) {
    return makeUnderstanding({
      kind: "social_closure",
      burstText: input.burstText,
      summary: "العميل يغلق النقطة اجتماعيًا بدون سؤال أو إجراء جديد",
      goal: "social_closure",
      socialClosure: true,
    });
  }

  return null;
}

function directorKind(understanding: V4TurnUnderstanding) {
  const m = directorMarker(understanding);
  if (!m) return null;
  return m.slice(PREFIX.length).split(":")[0] as DirectorKind;
}

function directorDetail(understanding: V4TurnUnderstanding) {
  const m = directorMarker(understanding);
  if (!m) return null;
  const parts = m.slice(PREFIX.length).split(":");
  return parts.length > 1 ? parts.slice(1).join(":") : null;
}

function draft(input: {
  text: string;
  understanding: V4TurnUnderstanding;
  facts?: string[];
  notes?: string[];
  decision?: V4DraftResponse["decision"];
}): V4DraftResponse {
  return {
    text: input.text,
    decision: input.decision || "ANSWER",
    claims: [],
    answeredQuestions: input.understanding.explicitQuestions,
    usedFactKeys: input.facts || [],
    notes: [JOURNEY_DIRECTOR_NOTE, ...(input.notes || [])],
  };
}

function secureUploadDraft(input: { understanding: V4TurnUnderstanding; truth: V4TruthBundle; kind: "income" | "identity" | "guarantor" }) {
  const key = input.kind === "income"
    ? "application.income_upload_link"
    : input.kind === "identity"
      ? "application.identity_upload_link"
      : "application.guarantor_upload_link";
  const link = factText(input.truth, key);
  const label = input.kind === "income" ? "إثبات الدخل/كشف الحساب" : input.kind === "identity" ? "الهوية" : "بيانات الكفيل";
  if (!link) {
    return draft({
      text: `فاهم عليك. بدك ترفع ${label}. الرابط المرتبط بطلبك مش متاح عندي بشكل موثق هسا، فما رح أعطيك رابط عام أو غلط.`,
      understanding: input.understanding,
      facts: [key],
      notes: ["secure upload link unavailable; fail closed"],
    });
  }
  return draft({
    text: `أكيد. لرفع ${label}:\n${link}\nافتح الرابط وارفع الملف هناك؛ ما تبعث المستند الحساس على واتساب.`,
    understanding: input.understanding,
    facts: [key, "documents.secure_rule"],
    notes: ["exact secure document upload answer"],
  });
}

function documentStatusDraft(input: { understanding: V4TurnUnderstanding; truth: V4TruthBundle }) {
  const loaded = factBool(input.truth, "application.documents.loaded");
  const status = rawStatus(input.truth);
  if (!loaded && !/needs_(?:identity|salary_slip|guarantor)/.test(status)) {
    return draft({
      text: "على البيانات الموثقة عندي هسا ما بقدر أحدد مستند ناقص بعينه بدون حالة مستندات محمّلة، وما رح أخمّن عليك.",
      understanding: input.understanding,
      facts: ["application.documents.loaded"],
      notes: ["document truth unavailable; no invented missing document"],
    });
  }

  const missing: Array<{ label: string; linkKey: string }> = [];
  if (factValue(input.truth, "application.documents.identity_complete") === false || status === "needs_identity" || status === "identity_requested") {
    missing.push({ label: "الهوية", linkKey: "application.identity_upload_link" });
  }
  if (factValue(input.truth, "application.documents.income_uploaded") === false || status === "needs_salary_slip" || status === "salary_slip_link_sent") {
    missing.push({ label: "إثبات الدخل/كشف الحساب", linkKey: "application.income_upload_link" });
  }
  if (status === "needs_guarantor" && factValue(input.truth, "application.documents.guarantor_complete") !== true) {
    missing.push({ label: "بيانات الكفيل", linkKey: "application.guarantor_upload_link" });
  }

  const unique = missing.filter((item, index, all) => all.findIndex((x) => x.label === item.label) === index);
  if (!unique.length) {
    return draft({
      text: "حسب حالة المستندات المثبتة عندي، ما ظاهر مستند مطلوب ناقص حاليًا.",
      understanding: input.understanding,
      facts: ["application.documents.loaded"],
      notes: ["no authoritative missing document"],
    });
  }

  const lines = unique.map((item) => {
    const link = factText(input.truth, item.linkKey);
    return link ? `- ${item.label}: ${link}` : `- ${item.label}`;
  });
  return draft({
    text: `المطلوب الظاهر عندي حاليًا:\n${lines.join("\n")}\nارفع المستند من الرابط الرسمي فقط، مش على واتساب.`,
    understanding: input.understanding,
    facts: unique.flatMap((x) => [x.linkKey]),
    notes: ["authoritative missing-document answer"],
  });
}

function statusDraft(input: { understanding: V4TurnUnderstanding; truth: V4TruthBundle }) {
  const s = stage(input.truth);
  const raw = rawStatus(input.truth);
  const label = factText(input.truth, "application.status.customer") || "قيد المتابعة";

  // Raw document-required state outranks the generic paid-review stage. This fixes the
  // production failure where a paid file kept getting 'wait' while a document was missing.
  if (["needs_identity", "identity_requested", "needs_salary_slip", "salary_slip_link_sent", "needs_guarantor"].includes(raw)) {
    return documentStatusDraft(input);
  }

  if (s === "preliminary_review") {
    return draft({ text: `طلبك حاليًا: ${label}. ما في خطوة دفع أو فتح ملف مطلوبة منك قبل نتيجة المراجعة المبدئية.`, understanding: input.understanding, facts: ["application.status.customer"] });
  }
  if (s === "payment_proof_pending_admin") {
    return draft({ text: "وصل إثبات الدفع وهو بانتظار مراجعة الإدارة. الدفع ما بنعتبره مؤكد إداريًا قبل اعتماده على الطلب.", understanding: input.understanding, facts: ["application.status.customer"] });
  }
  if (s === "payment_confirmed_under_review") {
    return draft({ text: `طلبك حاليًا: ${label}. الدفع مؤكد، وما في خطوة مالية إضافية عليك الآن.`, understanding: input.understanding, facts: ["application.status.customer", "application.payment_confirmed"] });
  }
  if (s === "approved") {
    return draft({ text: `طلبك حاليًا: ${label}.`, understanding: input.understanding, facts: ["application.status.customer"] });
  }
  if (s === "refund_requested") {
    return draft({ text: "طلب الاسترداد مسجل وقيد المعالجة. ما رح أعتبر التحويل مكتمل إلا لما يظهر التنفيذ فعليًا.", understanding: input.understanding, facts: ["application.status.customer"] });
  }
  if (s === "refund_completed") {
    return draft({ text: "الحالة المثبتة عندي: تم الاسترداد.", understanding: input.understanding, facts: ["application.status.customer"] });
  }
  if (s === "cancelled") {
    return draft({ text: `حالة الطلب الآن: ${label}.`, understanding: input.understanding, facts: ["application.status.customer"] });
  }
  return draft({ text: `حالة طلبك الآن: ${label}.`, understanding: input.understanding, facts: ["application.status.customer"] });
}

function reviewTimeDraft(input: { understanding: V4TurnUnderstanding; truth: V4TruthBundle }) {
  const s = stage(input.truth);
  const age = factNumber(input.truth, "application.age_days");
  const label = factText(input.truth, "application.status.customer") || "قيد المتابعة";
  if (s === "refund_requested") {
    return draft({
      text: "الاسترداد قيد المعالجة، وما عندي موعد تحويل ثابت وموثق أقدر أضمنه قبل ظهور التنفيذ الفعلي.",
      understanding: input.understanding,
      facts: ["application.status.customer", "refund.pressure_rule"],
    });
  }
  if (age != null && age >= 7) {
    return draft({
      text: `طلبك حاليًا: ${label}. المدة صارت متجاوزة المعدل الطبيعي بوضوح، فما رح أرجع أحكيلك يومين أو 3 كأن الانتظار طبيعي. ما عندي موعد نهائي موثق أقدر أوعدك فيه.`,
      understanding: input.understanding,
      facts: ["application.status.customer", "application.age_days"],
      notes: ["aged case never repeats normal-window boilerplate"],
    });
  }
  const normal = factText(input.truth, "review.normal_window");
  return draft({
    text: normal ? `طلبك حاليًا: ${label}. المعدل الطبيعي للمراجعة ${normal}، وما بقدر أضمن يوم محدد قبل صدور القرار فعليًا.` : `طلبك حاليًا: ${label}. ما عندي موعد نهائي موثق أقدر أوعدك فيه.`,
    understanding: input.understanding,
    facts: ["application.status.customer", "review.normal_window"],
  });
}

export function buildJourneyDirectorDraft(input: {
  burstText: string;
  understanding: V4TurnUnderstanding;
  memory: V4WorkingMemory;
  truth: V4TruthBundle;
}): V4DraftResponse | null {
  const commercial = buildCommercialFastPathDraft({ understanding: input.understanding, truth: input.truth });
  if (commercial) return { ...commercial, notes: [...commercial.notes, JOURNEY_DIRECTOR_NOTE] };

  const kind = directorKind(input.understanding);
  if (!kind) return null;

  if (kind === "document_upload_income") return secureUploadDraft({ understanding: input.understanding, truth: input.truth, kind: "income" });
  if (kind === "document_upload_identity") return secureUploadDraft({ understanding: input.understanding, truth: input.truth, kind: "identity" });
  if (kind === "document_upload_guarantor") return secureUploadDraft({ understanding: input.understanding, truth: input.truth, kind: "guarantor" });
  if (kind === "document_status") return documentStatusDraft(input);
  if (kind === "status" && directorDetail(input.understanding) !== "fee_due") return statusDraft(input);
  if (kind === "review_time") return reviewTimeDraft(input);

  if (kind === "tracking") {
    const paid = factBool(input.truth, "application.payment_confirmed");
    const link = factText(input.truth, "application.tracking_link");
    if (!paid || !link) {
      return draft({
        text: "رابط التتبع ما بنعرضه قبل تأكيد الدفع على الطلب. هسا بخبرك بالخطوة الفعلية حسب حالة طلبك بدل ما أرميك على رابط.",
        understanding: input.understanding,
        facts: ["application.payment_confirmed"],
        notes: ["tracking blocked before authoritative payment"],
      });
    }
    return draft({ text: `تقدر تتابع طلبك من الرابط الرسمي:\n${link}`, understanding: input.understanding, facts: ["application.tracking_link"] });
  }

  if (kind === "installment_arrears") {
    return draft({
      text: "سؤالك عن قسط الجهاز بعد توقيع العقد، مش عن رسوم فتح الملف. ما عندي داخل الحقيقة الحالية بند موثق يحدد إجراء التأخير أو غرامته، فما رح أخمّن عليك؛ المرجع يكون بند التأخير في العقد نفسه.",
      understanding: input.understanding,
      facts: ["installment.first_rule"],
      notes: ["never confuse contract installment with opening-fee payment proof"],
    });
  }

  if (kind === "product_question") {
    const url = factText(input.truth, "business.products_url");
    return draft({
      text: url
        ? `سؤالك عن الجهاز الحالي نفسه، مش عن طلب قديم. السعر والتوفر الحاليين لازم يطلعوا من الكتالوج الرسمي:\n${url}`
        : "سؤالك عن الجهاز الحالي نفسه، مش عن طلب قديم. ما عندي كتالوج موثق متاح بهاللحظة، فما رح أحوّلك لموضوع طلب أو استرداد قديم.",
      understanding: input.understanding,
      facts: ["business.products_url"],
      notes: ["product question isolated from stale application topic"],
    });
  }

  if (kind === "social_closure") {
    return draft({ text: "تمام، الله يعطيك العافية.", understanding: input.understanding, decision: "ACKNOWLEDGE", notes: ["social closure cannot reopen stale topic"] });
  }

  // critical_action, pending_confirmation, human_request and persona_request continue
  // through procedure/persona execution. Their interpretation is deterministic, while the
  // existing Action/Truth backplane remains the only execution authority.
  return null;
}
