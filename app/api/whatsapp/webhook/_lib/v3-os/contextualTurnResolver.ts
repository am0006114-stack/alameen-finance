import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TopicKey } from "./types";

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

function registrationOrLicensingQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:مسجلين|مسجله|مسجلة|مسجل|معتمدين|معتمده|معتمدة|مرخصين|مرخصه|مرخصة|ترخيص|سجل\s+تجاري|السجل\s+التجاري|الحكومه|الحكومة).{0,45}(?:الشركه|الشركة|الجهه|الجهة|انتو|انتم|عندكم)?|(?:الشركه|الشركة|الجهه|الجهة|انتو|انتم).{0,45}(?:مسجل|معتمد|مرخص|ترخيص|سجل\s+تجاري|الحكومه|الحكومة)/.test(q);
}

function contractingPartyQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:مين|من).{0,30}(?:الشركه|الشركة|الجهه|الجهة).{0,35}(?:القانونيه|القانونية).{0,40}(?:العقد|باسمها)|(?:العقد).{0,35}(?:باسم\s+مين|باسم\s+من|مع\s+مين|مع\s+من|بين\s+مين|بين\s+من|طرف|الطرف)|(?:مين|من).{0,25}(?:طرف\s+العقد|اطراف\s+العقد|أطراف\s+العقد)|(?:هل|هو).{0,25}(?:البنك|شركة\s+تمويل|شركه\s+تمويل).{0,30}(?:طرف|بالعقد|في\s+العقد)/.test(q);
}

function safetyTrustQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:هل|يعني|صراحه|صراحة)?.{0,12}(?:امنه|آمنة|امن|آمن|موثوقه|موثوقة|موثوق|مضمونه|مضمونة)|(?:نصب|نصاب|نصابين|احتيال|مصداقيه|مصداقية|ثقه|ثقة|فيد\s*باك|feedback|خايف|خايفه|خايفة|متخوف|متخوفه|متخوفة)/i.test(q);
}

function lastRelevantContext(state: ConversationState, recentTurns?: string[]) {
  const lines = (recentTurns || []).filter(Boolean);
  const tail = lines.slice(-10).join("\n");
  return normalized([state.lastAssistantText || "", state.lastCustomerText || "", tail].filter(Boolean).join("\n"));
}

function shortAffirmative(q: string) {
  return /^(?:اه|نعم|ايوه|تمام|طيب|اوكي|اوك|yes|صح|مزبوط)$/.test(q);
}

export function explicitNoPriorApplicationText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:^|\s)(?:لا|ما)\s*(?:عندي|معي)\s+(?:طلب|ملف)(?:\s+سابق)?(?:\s|$)|(?:ماعندي|ما عندي|ما معي)\s+(?:طلب|ملف)(?:\s+سابق)?|(?:لا|ما)\s*(?:عندي|معي)\s+(?:رقم\s+)?تتبع/.test(q);
}

export function installmentAdjustmentQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:ازود|أزود|زود|زياده|زيادة|ادفع|أدفع|اسدد|أسدد).{0,32}(?:القسط|الاقساط|الأقساط|الدفعات)|(?:القسط|الاقساط|الأقساط|الدفعات).{0,35}(?:ازود|أزود|زياده|زيادة|اكثر|أكثر|مقدم|مرتين|دفعتين)|(?:دفعات|دفعه|دفعة).{0,24}(?:اكبر|أكبر|اكثر|أكثر).{0,24}(?:شهري|القسط)|(?:تسديد|سداد).{0,25}(?:مبكر|مبكرًا|مسبق|زياده|زيادة)/.test(q);
}

export function generalRequirementsQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:شو|ما|ايش|إيش).{0,18}(?:الشروط|المتطلبات|الاوراق|الأوراق)|(?:شو|ما).{0,18}(?:لازم|required)|(?:لازم|ضروري).{0,22}(?:كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب|اثبات\s+دخل|إثبات\s+دخل|هويه|هوية|كفيل)|(?:بزبط|بصير|ينفع).{0,28}(?:ع\s*الهويه|على\s+الهويه|بالهوية|بالهويه|بدون\s+كشف\s+راتب)|(?:كشف\s+راتب|اثبات\s+دخل|إثبات\s+دخل).{0,20}(?:لازم|ضروري|مطلوب)|(?:الهويه|الهوية).{0,25}(?:لحال|فقط|بس)|(?:ما\s+عندي|بدون).{0,25}(?:كشف\s+راتب|اثبات\s+دخل|إثبات\s+دخل)|(?:طالب|طالبه|طالبة|جامعه|جامعة).{0,35}(?:كشف\s+راتب|اثبات\s+دخل|إثبات\s+دخل)/.test(q);
}

export function financingStructureQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:التقسيط|الاقساط|الأقساط|المعامله|المعاملة).{0,30}(?:عن\s+طريق|من\s+خلال).{0,18}(?:بنك|البنك)|(?:عن\s+طريق|من\s+خلال)\s+(?:بنك|البنك).{0,30}(?:التقسيط|الشروط|المعامله|المعاملة)|(?:بنك|البنك).{0,22}(?:وشو|وما|شو).{0,18}(?:الشروط|المتطلبات)/.test(q);
}

export function applicationFormIssueText(value: string | null | undefined, context?: string | null) {
  const q = normalized(value);
  const ctx = normalized(context);
  const direct = /(?:حطيت|عبّيت|عبيت|دخلت).{0,35}(?:كلشي|كل\s+شي|البيانات).{0,30}(?:ما\s*كمل|ما\s+بكمل|ما\s+كمل|وقف|علق)|(?:كل\s+شوي).{0,28}(?:بعطيني|بطلعلي|بيطلعلي).{0,20}(?:هيك|خطا|خطأ|رساله|رسالة)|(?:ما\s+عم\s+بقدر|ما\s+بقدر|مش\s+قادر).{0,28}(?:احط|أحط|ادخل|أدخل|اكمل|أكمل).{0,28}(?:معلومات|بيانات|التقديم|الطلب)|(?:النموذج|الفورم|التقديم|الطلب).{0,35}(?:ما\s*كمل|ما\s+بكمل|علق|واقف|مش\s+راضي)/.test(q);
  const contextualShort = /^(?:شو\s+القصه|شو\s+القصة|هيك|نفس\s+الاشي|نفس\s+الشي|ماكمل|ما\s+كمل|كل\s+شوي\s+هيك)$/.test(q)
    && /(?:الموقع|الصفحه|النموذج|الفورم|التقديم|بيانات|صوره|صورة|سكرين|خطا|خطأ)/.test(ctx);
  return direct || contextualShort;
}

export function foreignApplicantGeneralFormIssueText(value: string | null | undefined) {
  const q = normalized(value);
  const nationality = /(?:سوري|سوريه|سورية|مصري|مصريه|مصرية|فلسطيني|فلسطينيه|فلسطينية|عراقي|عراقيه|عراقية|اجنبي|أجنبي|اجنبيه|أجنبية|غير\s+اردني|غير\s+أردني|جواز\s+سفر|اقامه|إقامة)/.test(q);
  const formProblem = /(?:ما\s+عم\s+بقدر|ما\s+بقدر|مش\s+قادر|لا\s+استطيع|مش\s+راضي).{0,40}(?:احط|أحط|ادخل|أدخل|اكمل|أكمل|اعبي|أعبي).{0,35}(?:معلومات|بيانات|الطلب|التقديم|الخانات|خانه|خانة)/.test(q);
  return nationality && formProblem;
}

export type ContextualTurnSignals = {
  topics: TopicKey[];
  reviewTiming: boolean;
  nextStep: boolean;
  productAvailability: boolean;
  trustConcern: boolean;
  registrationQuestion: boolean;
  contractingPartyQuestion: boolean;
  safetyTrustQuestion: boolean;
  humanRequest: boolean;
  paymentStatusClaim: boolean;
  siteIssue: boolean;
  trackingLinkRequest: boolean;
  refundMeaning: boolean;
  continueAfterCancellation: boolean;
  noPriorApplication: boolean;
  applicationFormIssue: boolean;
  foreignApplicantFormIssue: boolean;
  generalRequirements: boolean;
  financingStructure: boolean;
  installmentAdjustment: boolean;
  shortFollowUpResolved: boolean;
};

/**
 * Deterministic dialogue continuation for the common short/colloquial messages
 * that generic intent classification routinely loses. This does not answer the
 * customer; it only preserves what topic the current message belongs to.
 */
export function contextualTurnSignals(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  recentTurns?: string[];
}): ContextualTurnSignals {
  const q = normalized(input.turn.rawText);
  const ctx = lastRelevantContext(input.state, input.recentTurns);
  const topics = new Set<TopicKey>();

  // All patterns below are written against normalizeArabic() output (e.g. متى -> متي, خطوة -> خطوه).
  const directReviewTiming = /(?:متي|امتي|ايمتي|لايمتا|لامتي).{0,45}(?:ترد|تردو|تردولي|تحكو|تحكولي|تحكولنا|خبر|الخبر|النتيجه|الموافقه|قرار|يخلص|تخلص|يطلع|يتغير|تتغير|بتتغير|يتحدث|تتحدث|بتتحدث|يصير\s+تحديث)|(?:قبلتو|قبلتوه|قبلتم|انقبل|انقبلت).{0,35}(?:طلبي|الطلب)?|(?:صارلي|صار له|صارلها).{0,20}(?:اسبوع|يوم|ايام|شهر).{0,35}(?:استني|انتظر|بدون\s+رد)|(?:للحين|لهسا|لحد\s+الان).{0,30}(?:ما\s+في|ما\s+صدر|ما\s+طلع).{0,30}(?:رد|موافقه|قرار)|(?:قديش|كم).{0,12}(?:بده|بتاخد|بياخد).{0,22}(?:وقت|للمراجعه|المراجعه)|(?:كم\s+يوم).{0,25}(?:مراجعه|قرار|موافقه)/.test(q);
  const shortTiming = /^(?:متي|امتي|ايمتي|طيب\s+متي|اه\s+متي|متي\s+يعني|قديش\s+بده(?:\s+وقت(?:\s+للمراجعه)?)?|كم\s+بده(?:\s+وقت(?:\s+للمراجعه)?)?)$/.test(q);
  const contextIsTiming = /(?:وقت\s+المراجعه|مده\s+المراجعه|متي\s+الموافقه|المعدل\s+الطبيعي|يومين|3\s+ايام|ثلاث\s+ايام|ضغط\s+المراجعات|قرار\s+نهائي|الموافقه\s+النهائيه)/.test(ctx);
  const shortYesOnTiming = shortAffirmative(q) && contextIsTiming && /(?:اذا\s+سوالك|بدك\s+اعطيك|بعطيك|احكيلك).{0,40}(?:وقت|مده|المراجعه|الخطوه)/.test(ctx);
  const reviewTiming = directReviewTiming || (shortTiming && contextIsTiming) || shortYesOnTiming;
  if (reviewTiming) topics.add("review_timing");

  const nextStep = /(?:شو|ما|ايش).{0,18}الخطوه\s*التاليه|^الخطوه\s*التاليه$|(?:شو\s+ضل|شو\s+باقي|وبعدين|طيب\s+وبعدين)/.test(q);
  if (nextStep) topics.add("application_status");

  const productAvailability = /(?:متوفر|موجود|في\s+عندكم|عندكم).{0,35}(?:ايفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|اوبو|oppo|ريلمي|realme|جهاز)|(?:ايفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|اوبو|oppo|ريلمي|realme).{0,35}(?:متوفر|موجود|عندكم)|^(?:في|فيه)\s+(?:ايفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|اوبو|oppo|ريلمي|realme)(?:\s|\d|$)|(?:ايفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|اوبو|oppo|ريلمي|realme).{0,30}(?:كم\s+سعر|قديش\s+سعر|شو\s+سعر|سعرو|سعره|سعرها|بكم)/i.test(q);
  if (productAvailability) topics.add("products");

  const registrationQuestion = registrationOrLicensingQuestionText(q);
  const contractingPartyQuestion = contractingPartyQuestionText(q);
  const safetyTrustQuestion = safetyTrustQuestionText(q);
  const trustConcern = registrationQuestion || contractingPartyQuestion || safetyTrustQuestion
    || /(?:نصب|نصاب|نصابين|مصداقيه|اضمن|يضمن|ثقه|قانونيا|خايف|خايفه|متخوف|متخوفه)/.test(q);
  if (trustConcern) {
    topics.add("trust");
    if (registrationQuestion || contractingPartyQuestion) topics.add("legal");
    if (/(?:نصب|نصاب|نصابين|احتيال|لا\s+يوجد\s+مصداقيه|مش\s+مصداقيه|مو\s+مصداقيه)/.test(q)) topics.add("complaint");
  }

  const humanRequest = /(?:بدي|اريد).{0,30}(?:شخص|موظف|موضف|حدا|انسان).{0,25}(?:احكي|اتكلم|اكلم|يرد|افهمه)|(?:حولني|وصلني|وصلوني).{0,25}(?:موظف|شخص|الاداره)|(?:رقم\s+تواصل|بدي\s+رقم).{0,25}(?:احكي|اتصل)/.test(q);
  if (humanRequest) topics.add("human_request");

  const paymentStatusClaim = /(?:دفعت|دافع|حولت|تم\s+الدفع|رفعت\s+الوصل|بعثت\s+الوصل|وصل\s+الدفع)/.test(q);
  if (paymentStatusClaim) topics.add("payment_status");

  const directSiteIssue = /(?:الموقع|الصفحه|الرابط).{0,45}(?:مش\s+راضي|ما\s+بفتح|مش\s+فاتح|ما\s+بشتغل|مش\s+شغال|عطل|مشكله)|(?:مش\s+راضي|ما\s+بقدر).{0,28}(?:يفتح|يوديني|يدخل).{0,25}(?:الموقع|الصفحه|الرابط)/.test(q);
  const applicationFormIssue = applicationFormIssueText(q, ctx);
  const foreignApplicantFormIssue = foreignApplicantGeneralFormIssueText(q);
  const siteIssue = directSiteIssue || applicationFormIssue || foreignApplicantFormIssue;
  if (siteIssue) topics.add("website");

  const trackingLinkRequest = /(?:اعطيني|ابعث|ابعت|ارسل|بدي).{0,25}(?:رابط).{0,25}(?:التتبع|طلبي)|(?:كيف\s+اشوف|كيف\s+اتتبع|بدي\s+اتتبع).{0,25}(?:طلبي|الطلب)?|(?:رابط\s+التتبع)/.test(q);
  if (trackingLinkRequest) topics.add("tracking");

  const refundMeaning = /(?:شو|ايش|ليش|لشو|مغزي|مغزاه|معني).{0,30}(?:الاسترداد|استرداد)|(?:الاسترداد|استرداد).{0,30}(?:شو|ليش|لشو|تبع\s+شو|مغزاه)/.test(q);
  if (refundMeaning) topics.add("refund");

  const continueAfterCancellation = /(?:بديش|ما\s+بدي|لا\s+اريد).{0,28}(?:الغاء|الغي)|(?:رجع|اعاده).{0,25}(?:الطلب|الملف).{0,22}(?:طبيعته|شغال|فعال)|(?:الغي|وقف).{0,24}(?:مسار\s+)?(?:الاسترداد|الاسترجاع)/.test(q);
  if (continueAfterCancellation) {
    topics.add("reopen");
    topics.add("refund");
  }

  const noPriorApplication = explicitNoPriorApplicationText(q)
    || (/^(?:لا|لاا|لأ|no)$/.test(q) && /(?:عندك|معك).{0,18}(?:طلب|ملف|رقم\s+تتبع)/.test(ctx));
  if (noPriorApplication) topics.add(applicationFormIssue || foreignApplicantFormIssue ? "website" : "products");

  const contextualRequirementShort = /^(?:بيزبط|بزبط|ينفع|بصير|طيب\s+بيزبط|طيب\s+بزبط)$/.test(q)
    && /(?:كشف\s+راتب|اثبات\s+دخل|إثبات\s+دخل|الهويه|الهوية|كفيل|طالب|طالبه|طالبة)/.test(ctx);
  const generalRequirements = generalRequirementsQuestionText(q) || contextualRequirementShort;
  if (generalRequirements) topics.add("requirements");

  const financingStructure = financingStructureQuestionText(q);
  if (financingStructure) topics.add("requirements");

  const installmentAdjustment = installmentAdjustmentQuestionText(q);
  if (installmentAdjustment) topics.add("installment_amount");

  return {
    topics: Array.from(topics),
    reviewTiming,
    nextStep,
    productAvailability,
    trustConcern,
    registrationQuestion,
    contractingPartyQuestion,
    safetyTrustQuestion,
    humanRequest,
    paymentStatusClaim,
    siteIssue,
    trackingLinkRequest,
    refundMeaning,
    continueAfterCancellation,
    noPriorApplication,
    applicationFormIssue,
    foreignApplicantFormIssue,
    generalRequirements,
    financingStructure,
    installmentAdjustment,
    shortFollowUpResolved: (shortTiming || shortAffirmative(q)) && topics.size > 0,
  };
}
