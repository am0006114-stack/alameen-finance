import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { continuationCommercialState } from "./commercialProgression";
import { isContinuationRevenueReady } from "./continuationPersistence";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { normalizeArabic } from "./text";
import type { ConversationState, DialogueAct, InterpretedTurn, TruthBundle } from "./types";
import { contextualTurnSignals } from "./contextualTurnResolver";

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

function contextText(state: ConversationState, recentTurns?: string[]) {
  if (String(state.lastAssistantText || "").trim()) return normalized(state.lastAssistantText);
  const lastAssistant = [...(recentTurns || [])].reverse().find((line) => /^(?:الامين|الأمين|assistant)\s*:/i.test(String(line || "")));
  return normalized(lastAssistant || "");
}

export function explicitNewApplicationText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:طلب|ملف)\s+جديد|(?:اقدم|أقدم|تقديم|اعمل|أعمل|افتح|أفتح)\s+(?:طلب|ملف)\s+جديد|(?:اقدم|أقدم|تقديم)\s+من\s+جديد|اول\s+مره|أول\s+مرة/.test(q);
}

function contextualNewApplicationYes(turn: InterpretedTurn, state: ConversationState, recentTurns?: string[]) {
  const q = normalized(turn.rawText);
  if (!/^(?:نعم|اه|أه|ايوه|أيوه|yes|تمام)$/.test(q)) return false;
  const ctx = contextText(state, recentTurns);
  return /(?:هل|بدك|حاب|حابه|حابة).{0,35}(?:نبدأ|نبدا|تقدم|تقديم|طلب\s+جديد|ملف\s+جديد)/.test(ctx);
}


export function isNewApplicationFlow(input: { turn: InterpretedTurn; state: ConversationState; recentTurns?: string[] }) {
  return explicitNewApplicationText(input.turn.rawText) || contextualNewApplicationYes(input.turn, input.state, input.recentTurns);
}

export function newApplicationConversationContext(state: ConversationState, recentTurns?: string[]) {
  const ctx = contextText(state, recentTurns);
  return /طلب\s+جديد|الطلب\s+الجديد|الطلب\s+القديم|صفحه\s+المنتجات|صفحة\s+المنتجات/.test(ctx) &&
    /(?:جديد|القديم|صفحه\s+المنتجات|صفحة\s+المنتجات)/.test(ctx);
}

function hasExplicitTracking(value: string | null | undefined) {
  return /AM-\d{8,}/i.test(String(value || ""));
}
export function explicitDoNotContinueText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:لا\s+ارغب|لا\s+أرغب|لا\s+اريد|لا\s+أريد|مش\s+حاب|مش\s+حابه|مش\s+حابة|ما\s+بدي|مش\s+بدي|ما\s+ارغب|ما\s+أرغب).{0,35}(?:الاستمرار|استمر|اكمل|أكمل|تكمل|المتابعه|المتابعة)|(?:لا\s+ارغب|لا\s+أرغب).{0,25}(?:حاليا|حاليًا|مستقبلا|مستقبلًا)/.test(q);
}

export function explicitContinuationText(value: string | null | undefined) {
  const q = normalized(value);
  if (explicitDoNotContinueText(value)) return false;
  return /(?:اود|أود|ارغب|أرغب)\s+(?:ب)?الاستمرار|(?:اخترت|اختارت)\s+الاستمرار|(?:انا|أنا)\s+(?:اخترت|موافق|موافقه|موافقة)\s+(?:على\s+)?الاستمرار|(?:بدي|حاب|حابه|حابة)\s+(?:اكمل|أكمل|استمر)|(?:بدي|حاب|حابه|حابة)\s+(?:افتح|أفتح|فتح)\s+(?:ال)?ملف|(?:افتح|أفتح)\s+(?:لي\s+)?(?:ال)?ملف|(?:حول|حوّل|بدي\s+احول|بدي\s+أحول)\s+(?:الطلب\s+)?(?:للدراسه|للدراسة|الى\s+الدراسه|إلى\s+الدراسة)\s+النهائيه|استكمال\s+فتح\s+الملف/.test(q);
}

function contextualContinuationYes(turn: InterpretedTurn, state: ConversationState, recentTurns?: string[]) {
  const q = normalized(turn.rawText);
  // Customers often answer the continuation question naturally with “اه بدي”
  // rather than a bare yes. Treat that as the same explicit commercial decision,
  // but only when the immediately established context actually asked to continue.
  if (!/^(?:نعم|اه|أه|ايوه|أيوه|yes|تمام)(?:\s+(?:بدي|حاب|حابه|حابة|اكيد|أكيد))?$/.test(q)) return false;
  const ctx = contextText(state, recentTurns);
  return /هل\s+(?:تود|بدك|حاب|حابه|حابة).{0,40}(?:الاستمرار|تكمل|تكملي|فتح\s+الملف|الدراسه\s+النهائيه|الدراسة\s+النهائية)/.test(ctx);
}

export function reviewTimingQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:متي|امتي|ايمتي|لايمتا|لامتي).{0,45}(?:موافق|الموافقه|قرار|يطلع|ترد|تردو|تردولي|تحكو|تحكولي|خبر|نتيجه|يخلص|تخلص|يتغير|تتغير|بتتغير)|(?:قبلتو|قبلتوه|انقبل|انقبلت).{0,30}(?:طلبي|الطلب)?|(?:شو\s+صار|وين\s+وصل).{0,30}(?:الموافقه|الطلب)|صارلي\s+[\d٠-٩]+\s*(?:يوم|ايام)|(?:ثلاث|ثلاثه|يومين|اسبوع|شهر).{0,18}(?:صارلي|استني|انتظار)|(?:قديش|كم).{0,20}(?:وقت|بده|بدها).{0,20}(?:موافق|مراجعه)/.test(q);
}

export function foreignApplicantFormBlocker(value: string | null | undefined) {
  const q = normalized(value);
  const foreignIdentity = /(?:مصري|اجنبي|أجنبي|جواز\s+سفر|اقامه\s+اردنيه|إقامة\s+أردنية|رقم\s+الاقامه|رقم\s+الإقامة|رقم\s+قومي)/.test(q);
  const fieldProblem = /(?:الرقم\s+الوطني|national\s*id).{0,80}(?:10|١٠|عشر)|(?:14|١٤|اربعه\s+عشر|أربعة\s+عشر).{0,40}(?:رقم|خانه|خانة)|(?:لا\s+تقبل|ما\s+بتقبل|لا\s+استطيع|ما\s+بقدر).{0,60}(?:الطلب|التقديم|الخانه|الخانة)/.test(q);
  return foreignIdentity && fieldProblem;
}

export function showroomBrowsingRequest(value: string | null | undefined) {
  const q = normalized(value);
  const browse = /(?:اشوف|أشوف|نشوف|شوف).{0,30}(?:الاجهزه|الأجهزة|الموديلات)|(?:اجي|أجي|نجي).{0,25}(?:المعرض|المكتب).{0,30}(?:اشوف|أشوف|نشوف)|(?:المعرض).{0,30}(?:الاجهزه|الأجهزة|اشوف|أشوف)/.test(q);
  return browse;
}

export function explicitContactNumberChangeRequest(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:ابعث|ابعت|تبعت|ارسل|أرسل|رسل|راسل|التحديث).{0,55}(?:على|ع)\s*(?:هاض|هاد|هذا)\s+الرقم.{0,55}(?:مش|مو|بدل).{0,35}(?:الرقم|رقم)|(?:غير|غيّر|تغيير|بدل).{0,35}(?:رقم\s+(?:التواصل|الواتساب|الهاتف)|الرقم\s+المسجل|رقم\s+الطلب)/.test(q);
}

function applicationStartQuestion(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:كيف|من\s+وين|وين).{0,20}(?:اقدم|أقدم|التقديم|اعمل\s+طلب|أعمل\s+طلب)|(?:بدي|حاب|حابه|حابة).{0,18}(?:اقدم|أقدم|اعمل\s+طلب|أعمل\s+طلب)/.test(q);
}

function reopenStatusQuestion(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:انفتح|انفتحش|رجع\s+انفتح|اتفتح).{0,25}(?:الملف|الطلب)|(?:الملف|الطلب).{0,25}(?:انفتح|رجع\s+فعال)/.test(q);
}

function humanRequestText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:حولني|حوّلني|حولوني|حوّلوني|وصلني|وصلوني).{0,25}(?:موظف|موضف|مسؤول|الاداره|الإدارة)|(?:بدي|اريد|أريد).{0,25}(?:موظف|موضف|شخص\s+يفيدني|حدا\s+يفيدني)/.test(q);
}

function asksAppointment(value: string | null | undefined) {
  return /(?:موعد|الحضور|اجي\s+عالمكتب|أجي\s+عالمكتب|المعرض)/.test(normalized(value));
}

function asksInstallment(value: string | null | undefined) {
  return /(?:القسط|الاقساط|الأقساط)/.test(normalized(value));
}

function asksRequirements(value: string | null | undefined) {
  return /(?:المستندات|الاوراق|الأوراق|المتطلبات)/.test(normalized(value));
}

function addAct(acts: DialogueAct[], turn: InterpretedTurn, partial: Omit<DialogueAct, "id" | "text" | "source">) {
  const duplicate = acts.some((a) => a.type === partial.type && a.topic === partial.topic && (a.action || "none") === (partial.action || "none"));
  if (duplicate) return;
  acts.push({
    ...partial,
    id: `${turn.turnId}:recovery:${acts.length + 1}`,
    text: turn.rawText,
    source: "deterministic",
  });
}

export function hardenTurnForConversationRecovery(input: { turn: InterpretedTurn; state: ConversationState; recentTurns?: string[] }) {
  const turn = input.turn;
  let acts = turn.acts.map((a) => ({ ...a }));
  const newApplication = isNewApplicationFlow(input);
  const newApplicationContext = newApplicationConversationContext(input.state, input.recentTurns) && !hasExplicitTracking(turn.rawText);
  const explicitStop = explicitDoNotContinueText(turn.rawText);
  if (explicitStop) {
    // Explicit opt-out is a veto, not a dialogue act. Strip any continuation action
    // and let the deterministic opt-out reply/runtime gate handle the customer-facing path.
    acts = acts.filter((a) => a.action !== "continue_application" && a.topic !== "continuation");
  }
  const continuation = !explicitStop && !newApplication && !newApplicationContext && (explicitContinuationText(turn.rawText) || contextualContinuationYes(turn, input.state, input.recentTurns));

  // “طلب جديد / ملف جديد” is never permission to reopen an old cancelled request.
  if (newApplication) {
    acts = acts.filter((a) => a.action !== "reopen_application" && a.topic !== "reopen");
    addAct(acts, turn, { type: "ask", topic: "products", confidence: 0.99, action: "none", value: "new_application_start" });
  }

  if (continuation) {
    addAct(acts, turn, { type: "request_action", topic: "continuation", confidence: 0.995, action: "continue_application", value: "explicit_continue" });
  }

  const dialogueSignals = contextualTurnSignals({ turn, state: input.state, recentTurns: input.recentTurns });

  if (reviewTimingQuestionText(turn.rawText) || dialogueSignals.reviewTiming) {
    addAct(acts, turn, { type: "ask", topic: "review_timing", confidence: 0.995, action: "none", value: dialogueSignals.shortFollowUpResolved ? "contextual_followup" : null });
  }

  if (dialogueSignals.nextStep) {
    addAct(acts, turn, { type: "ask", topic: "application_status", confidence: 0.99, action: "none", value: "next_step" });
  }

  if (dialogueSignals.productAvailability) {
    addAct(acts, turn, { type: "ask", topic: "products", confidence: 0.995, action: "none", value: "product_availability" });
  }

  if (dialogueSignals.trustConcern) {
    addAct(acts, turn, { type: "ask", topic: "trust", confidence: 0.995, action: "none", value: "trust_concern" });
    if (dialogueSignals.topics.includes("complaint")) addAct(acts, turn, { type: "complaint", topic: "complaint", confidence: 0.995, action: "none", value: "trust_complaint" });
  }

  if (humanRequestText(turn.rawText) || dialogueSignals.humanRequest) {
    addAct(acts, turn, { type: "request_role", topic: "human_request", confidence: 0.995, action: "switch_ai_role", value: null });
  }

  if (dialogueSignals.paymentStatusClaim) {
    addAct(acts, turn, { type: "provide_fact", topic: "payment_status", confidence: 0.98, action: "none", value: "customer_claimed_payment" });
  }

  if (asksAppointment(turn.rawText)) addAct(acts, turn, { type: "ask", topic: "appointment", confidence: 0.97, action: "none", value: null });
  if (asksInstallment(turn.rawText)) addAct(acts, turn, { type: "ask", topic: "installment_amount", confidence: 0.95, action: "none", value: null });
  if (asksRequirements(turn.rawText)) addAct(acts, turn, { type: "ask", topic: "requirements", confidence: 0.97, action: "none", value: null });
  if (explicitContactNumberChangeRequest(turn.rawText)) addAct(acts, turn, { type: "ask", topic: "application_correction", confidence: 0.995, action: "none", value: "contact_number_change_request" });
  if (foreignApplicantFormBlocker(turn.rawText)) {
    addAct(acts, turn, { type: "ask", topic: "requirements", confidence: 0.995, action: "none", value: "foreign_application_blocker" });
  } else if (applicationStartQuestion(turn.rawText)) {
    addAct(acts, turn, { type: "ask", topic: "products", confidence: 0.98, action: "none", value: "application_start" });
  }
  if (showroomBrowsingRequest(turn.rawText)) {
    addAct(acts, turn, { type: "ask", topic: "products", confidence: 0.99, action: "none", value: "browse_products_online" });
  }
  if (reopenStatusQuestion(turn.rawText)) {
    addAct(acts, turn, { type: "ask", topic: "application_status", confidence: 0.99, action: "none", value: "reopen_status_check" });
  }

  const topics = Array.from(new Set(acts.map((a) => a.topic)));
  const requestedActions = Array.from(new Set(acts.map((a) => a.action || "none").filter((a) => a !== "none")));
  return { ...turn, acts, topics, requestedActions } as InterpretedTurn;
}

export function formatJod(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function requirementsLine(truth: TruthBundle) {
  const app = truth.application;
  const docs = app?.documents;
  if (!app || !docs?.loaded) {
    return "المستندات المطلوبة بتتحدد حسب حالة الملف؛ الهوية وإثباتات الدخل من الأساسيات، وبيانات الكفيل ممكن تُطلب حسب الحالة. المستندات الحساسة تُرفع فقط عبر الرابط الرسمي الآمن.";
  }
  const received: string[] = [];
  if (docs.identityComplete) received.push("الهوية");
  if (docs.salarySlipUploaded) received.push("كشف/شهادة الراتب");
  if (docs.guarantorDataComplete) received.push("بيانات الكفيل");
  const receivedText = received.length ? `الموجود على ملفك: ${received.join("، ")}. ` : "";
  return `${receivedText}أي مستند إضافي بطلبه الملف حسب حالته الحالية فقط، وبيانات الكفيل مش شرط ثابت لكل الطلبات.`;
}

// Phase 7.1.6A compatibility anchors: `رسوم فتح الملف بقيمة ${p.fileOpeningFeeJod} دنانير`, `القرار إلك بالكامل`, and `حقك محفوظ` remain policy invariants; 7.2.1 shortens the customer wording without weakening them.
function continuationReply(turn: InterpretedTurn, truth: TruthBundle) {
  const app = truth.application;
  const p = truth.policy;
  const commercial = continuationCommercialState(app);
  const links = buildOfficialLinkContext(turn, truth);
  if (commercial === "already_paid") return "تمام، رغبتك بالاستمرار واضحة والدفع مؤكد إداريًا أصلًا. ما في داعي تدفع رسوم فتح الملف أو ترفع الوصل مرة ثانية؛ الطلب مكمل بمساره الحالي.";
  if (commercial === "payment_pending_admin" || app?.documents?.paymentReceiptUploaded) return "تمام، رغبتك بالاستمرار واضحة ووصل الدفع موجود بانتظار اعتماد الإدارة. ما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية.";
  if (isContinuationRevenueReady(app)) {
    const receipt = links.relevant.receipt;
    const upload = receipt ? `\nبعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${receipt}` : "\nرابط رفع الوصل المرتبط بالطلب غير متاح عندي الآن، لذلك ما رح أعطيك رابطًا عامًا بدل الصحيح.";
    return `تمام، هيك بنكمّل. رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير فقط؛ منفصلة عن ثمن الجهاز والقسط الأول، ومستردة عبر المسار الرسمي إذا ألغيت بعد دفع مؤكد. ${p.paymentMethodRule}${upload}\nتأكيد الدفع النهائي يتم يدويًا بعد مراجعة الوصل، والقسط الأول مش مطلوب الآن.`;
  }
  if (commercial === "no_application") return "تمام، فهمت إنك بدك تستمر، بس ما عندي طلب موثوق مربوط بالمحادثة الآن. ما رح أعطيك بيانات دفع قبل ربط الطلب الصحيح.";
  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_review") return "وصلت رغبتك بالاستمرار، لكن الطلب لسا بالمراجعة المبدئية. رسوم فتح الملف ما بتنفتح قبل صدور الموافقة المبدئية، لذلك ما في دفع مطلوب هسا.";
  return `رغبتك بالاستمرار واضحة. حالة الطلب الحالية ${customerFacingStatusLabel(app)}، لكن ما عندي خطوة مالية موثقة أقدر أفتحها على هالحالة. ما رح أطلب منك أي مبلغ قبل ما تكون الخطوة مثبتة على الطلب.`;
}

export function buildMandatoryFiveJodContinuationReply(turn: InterpretedTurn, truth: TruthBundle) {
  return continuationReply(turn, truth);
}

// Legacy Phase 7.1.6 invariant retained for compatibility: ما رح أدعي إني حولتك لموظف unless an actual transfer exists.
function reviewTimingReply(truth: TruthBundle, humanRequest: boolean) {
  const app = truth.application;
  const p = truth.policy;
  const state = app ? `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الآن ${customerFacingStatusLabel(app)}. ` : "";
  const human = humanRequest ? "أنا متابع معك من نفس الواتساب، وبعطيك الموجود فعليًا على الطلب بدون ما أوعدك بشي مش مؤكد. " : "";
  return `${human}${state}المعدل الطبيعي للمراجعة ${p.normalReviewWindow}، لكن حاليًا ضغط المراجعات شديد وبعض الملفات بتتجاوز هالمدة. ما عندي موعد نهائي أقدر أضمنه، وإذا تأخر طلبك عن الطبيعي بعطيك نفس الحقيقة بدون تدوير أو إعادة نفس القالب.`;
}

export function shouldPrioritizeConversationRecovery(input: { turn: InterpretedTurn; state: ConversationState; recentTurns?: string[] }) {
  return explicitDoNotContinueText(input.turn.rawText)
    || isNewApplicationFlow(input)
    || explicitContinuationText(input.turn.rawText)
    || contextualContinuationYes(input.turn, input.state, input.recentTurns)
    || foreignApplicantFormBlocker(input.turn.rawText)
    || showroomBrowsingRequest(input.turn.rawText)
    || explicitContactNumberChangeRequest(input.turn.rawText);
}

export function buildConversationRecoveryReply(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  recentTurns?: string[];
}) {
  const raw = input.turn.rawText;
  const q = normalized(raw);
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const newApplication = explicitNewApplicationText(raw) || contextualNewApplicationYes(input.turn, input.state, input.recentTurns);
  const newApplicationContext = newApplicationConversationContext(input.state, input.recentTurns) && !hasExplicitTracking(raw);
  const stopContinuation = explicitDoNotContinueText(raw);
  const continuation = !stopContinuation && !newApplication && !newApplicationContext && (explicitContinuationText(raw) || contextualContinuationYes(input.turn, input.state, input.recentTurns));
  const human = humanRequestText(raw);

  if (stopContinuation) {
    return "تمام، ما في أي إلزام عليك تكمل، وما رح أفتح خطوة دفع أو أرسل تعليمات 5 دنانير طالما قرارك إنك ما بدك تستمر. إذا غيرت رأيك لاحقًا، بنمشي من الحالة الفعلية للطلب وقتها.";
  }

  if (foreignApplicantFormBlocker(raw)) {
    return "فهمت المشكلة بالضبط. إذا خانة الرقم الوطني عندك لا تقبل إلا 10 أرقام وأنت ما عندك رقم وطني أردني، ما عندي مسار بديل موثق أقدر أطلب منك تحط فيه الرقم القومي المصري أو رقم الجواز أو الإقامة بدل الرقم الوطني. لا تختصر الرقم ولا تغيّره حتى يمر النموذج. بهالحالة ما بدي أعطيك حل غير معتمد؛ التقديم الإلكتروني من النموذج الحالي ما بقدر أؤكد إنه يدعم حالتك كأجنبي قبل وجود مسار رسمي واضح لها.";
  }

  if (explicitContactNumberChangeRequest(raw)) {
    return "فاهم عليك. بس ما رح أقول إن رقم التواصل تغيّر لأنه ما صار تعديل فعلي على بيانات الطلب من المحادثة. طلب استخدام رقم مختلف للتحديثات يحتاج تنفيذ إداري على الطلب؛ لحد ما يتحدث الرقم فعليًا، بعتمد الرقم المسجل على الطلب.";
  }

  if (showroomBrowsingRequest(raw)) {
    const products = links.relevant.products || "https://www.ameenfinance.co/products";
    return `إذا هدفك بس تشوف الأجهزة قبل ما تختار، المرجع هو صفحة المنتجات الرسمية:\n${products}\nالمكتب مش زيارة مفتوحة لمشاهدة الأجهزة، وما بنثبت موعد حضور من المحادثة لمجرد الاستعراض. الحضور للمكتب بيكون فقط بموعد رسمي مؤكد مرتبط بالإجراء المناسب على الطلب.`;
  }

  if (newApplication) {
    const products = links.relevant.products || "https://www.ameenfinance.co/products";
    return `إذا بدك طلب جديد، ما بنعتبر هذا إعادة فتح للطلب القديم وما بنغيّر القديم من المحادثة. ابدأ طلب جديد بالمواصفات اللي بدك إياها من صفحة المنتجات الرسمية، والطلب الجديد بياخذ رقم تتبع خاص فيه:\n${products}`;
  }

  if (newApplicationContext) {
    if (reopenStatusQuestion(raw)) {
      return "لا، حكيّنا عن بدء طلب جديد ما يعني إن الطلب القديم انفتح من جديد. ما رح أعتبر الملف القديم مُعاد فتحه إلا إذا صار تنفيذ فعلي وظهرت الحالة الجديدة بشكل موثق.";
    }
    if (reviewTimingQuestionText(raw)) {
      return "إذا قصدك الطلب الجديد، ما عندي طلب جديد مربوط بالمحادثة لسا حتى أعطيك حالة مراجعته أو موعد الموافقة. بعد ما تقدمه بيطلع له رقم تتبع جديد، وبنعتمد هذا الطلب الجديد بدل القديم.";
    }
    if (/(?:كم|قديش).{0,20}(?:القسط|قسط)/.test(q)) {
      return "إذا قصدك قسط الطلب الجديد، ما رح أستخدم قسط الطلب القديم. اختار الجهاز وقدّم الطلب الجديد أولًا، وبعدها بعتمد القسط من الحسبة المسجلة على الطلب الجديد نفسه.";
    }
    if (/(?:ايفون|آيفون|iphone|سامسونج|samsung|جهاز|تلفون|موبايل).{0,80}(?:gb|جيجا|silver|فضي|pro|max|برو|ماكس)/i.test(raw)) {
      return "إذا هاي مواصفات الجهاز اللي بدك إياه بالطلب الجديد، اختار نفس المواصفات من صفحة المنتجات وقت التقديم. ما رح أقول إنها تسجلت على طلب جديد قبل ما يتم إرسال الطلب فعليًا ويطلع له رقم تتبع جديد.";
    }
    if (explicitContinuationText(raw) || contextualContinuationYes(input.turn, input.state, input.recentTurns)) {
      return "إذا قصدك الاستمرار بالطلب الجديد، لازم يكون الطلب الجديد مقدم ومربوط برقم تتبع أولًا. ما رح أستخدم الطلب القديم أو بيانات دفعه كأنها تخص الطلب الجديد.";
    }
  }

  if (continuation) return continuationReply(input.turn, input.truth);

  if (human && !reviewTimingQuestionText(raw)) {
    return "فاهم إنك بدك تحكي مع حدا مباشرة. المتابعة الرسمية للطلبات من نفس واتساب، وما رح أوهمك بتحويل أو اتصال إذا ما في تحويل فعلي. احكيلي شو الإجراء أو المعلومة اللي بدك إياها وبجاوبك من حالة الطلب نفسها بدون تدوير.";
  }

  if (reviewTimingQuestionText(raw)) return reviewTimingReply(input.truth, human);

  if (reopenStatusQuestion(raw) && input.truth.application) {
    const app = input.truth.application;
    const stage = applicationJourneyStage(app);
    if (stage === "cancelled") return `الطلب${app.trackingId ? ` ${app.trackingId}` : ""} ما زال ظاهر عندي متوقف، وما عندي تنفيذ فعلي يثبت إنه انفتح من جديد.`;
    return `الحالة الحالية للطلب${app.trackingId ? ` ${app.trackingId}` : ""}: ${customerFacingStatusLabel(app)}. هذا هو الوضع الفعلي اللي بعتمد عليه؛ ما رح أقول إنه انفتح بسبب المحادثة إلا إذا كان في تنفيذ موثق فعليًا.`;
  }

  const appointment = asksAppointment(raw);
  const installment = asksInstallment(raw);
  const requirements = asksRequirements(raw);
  if ([appointment, installment, requirements].filter(Boolean).length >= 2) {
    const lines: string[] = [];
    if (appointment) lines.push("الموعد: إذا قصدك وقت الموافقة، ما عندي تاريخ محدد موثق أضمنه؛ وإذا قصدك الحضور للمكتب، ما بنثبت أو ننسق موعد من المحادثة والحضور فقط بموعد رسمي مؤكد مرتبط بحالة الطلب.");
    if (installment) {
      const monthly = formatJod(input.truth.application?.monthlyPayment);
      const months = input.truth.application?.installmentMonths;
      lines.push(monthly ? `القسط: المسجل تقريبًا ${monthly} دينار${months ? ` لمدة ${months} شهر` : ""}.` : "القسط: ما عندي قيمة موثقة ضمن حقيقة الطلب الحالية أقدر أؤكدها من عندي.");
    }
    if (requirements) lines.push(`المستندات: ${requirementsLine(input.truth)}`);
    return lines.join("\n");
  }

  if (applicationStartQuestion(raw)) {
    const products = links.relevant.products || "https://www.ameenfinance.co/products";
    return `التقديم يبدأ من الموقع الرسمي: اختار الجهاز من صفحة المنتجات وكمّل طلب الموافقة المبدئية، وبعد الإرسال بيطلع لك رقم تتبع للطلب:\n${products}`;
  }

  if (/(?:كم|قديش).{0,20}(?:القسط|قسط)/.test(q) && input.truth.application?.monthlyPayment != null) {
    const monthly = formatJod(input.truth.application.monthlyPayment);
    const months = input.truth.application.installmentMonths;
    return `القسط الشهري التقريبي المسجل على طلبك هو ${monthly} دينار${months ? ` لمدة ${months} شهر` : ""}.`;
  }

  return null;
}
