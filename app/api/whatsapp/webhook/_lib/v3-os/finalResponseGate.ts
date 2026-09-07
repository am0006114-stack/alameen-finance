import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { containsFiveJodFeeExplanation, containsRestrictedPaymentExecutionDetail, customerTextIsNonFeePaymentContext, explicitFeePolicyQuestionText, paymentDisclosureDecision } from "./paymentEligibilityFirewall";
import { normalizeArabic } from "./text";
import type { ActionResult, ConversationState, InterpretedTurn, TruthBundle } from "./types";
import { mutationQuestion, pendingActionIsCurrentTurnFocus } from "./mutationConfirmationGate";
import { paymentHistoricallyConfirmed } from "./truthSnapshotLock";
import { containsLegacyFileOpeningPaymentDestination, currentFileOpeningPaymentRule } from "./paymentDestinationOverride";
import { buildPaymentFailureRecoveryReply, paymentFailureOrDestinationProblemText, paymentFailureRecoveryReplyIsCurrent } from "./paymentFailureRecovery";

export type FinalResponseGateResult = {
  pass: boolean;
  violations: string[];
  replacementReply: string | null;
  severity: "none" | "warning" | "p0";
};

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

function postContinuationAcknowledgementText(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const q = normalized(value);
  if (/^(?:تمام|تم|اوك|اوكي|أوك|أوكي|ان\s+شاء\s+الله|إن\s+شاء\s+الله|شكرا|شكرًا|يسلمو|يعطيك\s+العافيه|يعطيك\s+العافية)$/.test(q)) return true;
  return Boolean(raw) && /^(?:👍|❤️|❤|🌹|🙏|👌|✅|☑️|😁|🙂|😊)+$/u.test(raw);
}

function asksCurrentPaymentDetails(value: string | null | undefined) {
  const q = normalized(value);
  const payment = /(?:دفع|ادفع|أدفع|تحويل|احول|أحول|بحول|كليك|cliq|محفظه|محفظة|المستفيد|رسوم\s+فتح\s+الملف)/i.test(q);
  const detail = /(?:كيف|وين|طريقه|طريقة|بيانات|اسم|معرف|رقم|على\s+مين|لمين)/.test(q);
  return payment && detail;
}

function postContinuationPaymentDeferralText(value: string | null | undefined) {
  const q = normalized(value);
  if (asksCurrentPaymentDetails(value)) return false;
  return /(?:بكرا|غدا|غدًا|بعدين|لاحقا|لاحقًا|بعدها|بعد\s+شوي|لما|اول\s+ما|أول\s+ما|بس\s+يوصل|بس\s+يجهز|وقت\s+ما).{0,55}(?:ادفع|أدفع|بدفع|بحول|احول|أحول|التحويل)|(?:ادفع|أدفع|بدفع|بحول|احول|أحول|التحويل).{0,45}(?:بكرا|غدا|غدًا|بعدين|لاحقا|لاحقًا|بعدها|لما|اول\s+ما|أول\s+ما)/.test(q);
}

function reviewMeaningQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:شو|ما|ايش|إيش).{0,18}(?:هي|يعني|المقصود).{0,20}(?:الدراسه|الدراسة|المراجعه|المراجعة)|(?:شو|ايش|إيش).{0,18}(?:بتدرسوا|بتراجعوا|بتشوفوا).{0,25}(?:بالملف|بالطلب)?|(?:ليش|لماذا).{0,18}(?:الدراسه|الدراسة|المراجعه|المراجعة).{0,25}(?:طويله|طويلة|كل\s+هالقد|كل\s+هاد)?/.test(q);
}

function keepCurrentReviewDecisionText(value: string | null | undefined) {
  const q = normalized(value);
  return /^(?:كملو|كملوا|كمل|خليكم\s+مكملين|ضلو\s+مكملين|ضلوا\s+مكملين)(?:\s+بس.{0,45})?$/.test(q)
    || /(?:كملو|كملوا|خليكم\s+مكملين|ضلو\s+مكملين|ضلوا\s+مكملين).{0,35}(?:بدي|بدنا).{0,25}(?:حل|نتيجه|نتيجة|خبر).{0,20}(?:قريب|بسرعه|بسرعة)?/.test(q);
}

function progressedCommercialStage(truth: TruthBundle, decision?: ReturnType<typeof paymentDisclosureDecision>) {
  const d = decision || paymentDisclosureDecision({ application: truth.application, customerText: "", explicitContinuationThisTurn: false });
  return d.paymentExecutionDetailsAllowed || d.receiptPending || d.alreadyPaid;
}

function buildPostContinuationDeferralReply(value: string | null | undefined) {
  const q = normalized(value);
  const attendance = /(?:اجي|أجي|باجي|المعرض|المكتب|استلم|استلام)/.test(q);
  const attendanceNote = attendance ? " وبالنسبة للحضور، المكتب مش معرض مفتوح؛ الاستلام بيكون فقط لما يوصل الطلب لمرحلة الاستلام وبموعد رسمي مؤكد." : "";
  return `تمام، خذ راحتك. لما تكون جاهز للدفع بنكمّل من نفس الطلب، وما في داعي أعيد بيانات التحويل هسا.${attendanceNote}`;
}

function buildReviewMeaningReply(truth: TruthBundle) {
  const paid = paymentHistoricallyConfirmed(truth.application);
  const payment = paid ? " والدفع عندك مؤكد إداريًا، فما في داعي تعيد الدفع أو ترفع الوصل." : "";
  return `الدراسة النهائية هي مراجعة الملف والبيانات والمستندات الموجودة قبل إصدار القرار النهائي. ما رح أخمّن بمعايير داخلية مش موثقة عندي.${payment} إذا ما في خطوة ناقصة ظاهرة على الطلب، المطلوب منك هسا فقط انتظار نتيجة المراجعة.`;
}

function buildKeepCurrentReviewReply(truth: TruthBundle) {
  const paid = paymentHistoricallyConfirmed(truth.application);
  const payment = paid ? " والدفع مؤكد إداريًا." : "";
  return `تمام، بنكمل على الطلب الحالي وما رح أبدأ إلغاء أو استرداد من هالحكي.${payment} بخصوص إنك بدك حل قريب: ما عندي موعد مؤكد أضمنه، وأول ما يصدر قرار فعلي رح يصلك التحديث.`;
}

function commercialPauseOrDeclineText(value: string | null | undefined, context?: string | null) {
  const q = normalized(value);
  const ctx = normalized(context);
  const direct = /(?:نخليها|خليها|خلينا).{0,22}(?:بعدين|لاحقا|لاحقًا)|(?:مش|مو|ما\s+بدي|لا\s+بدي).{0,18}(?:هسا|الان|الآن|حاليا|حاليًا).{0,28}(?:ادفع|أدفع|اكمل|أكمل|استمر)?|(?:بعدين|لاحقا|لاحقًا).{0,32}(?:بكمل|بنكمل|نكمل|بستمر|بنستمر|نستمر|بدفع)|(?:لما|اذا|إذا).{0,28}(?:يتوفر|يصير).{0,22}(?:معي|مصاري|المبلغ|فلوس).{0,28}(?:بكمل|بستمر|بدفع|نكمل)?|(?:ليس\s+لدي|ما\s+معي|ما\s+عندي).{0,24}(?:المال|المبلغ|مصاري|فلوس).{0,24}(?:الان|الآن|هسا|حاليا|حاليًا)|(?:مش|مو|غير)\s+مقتنع/.test(q);
  const contextualNo = /^(?:لا|لاا|لأ|مش\s+هسا|مو\s+هسا|بعدين)$/.test(q) && /(?:رسوم\s+فتح\s+الملف|(?:5|٥)\s*(?:دنانير|دينار)|اود\s+الاستمرار|أود\s+الاستمرار|بدك\s+تكمل|هل\s+(?:تود|تريد).{0,20}الاستمرار)/.test(ctx);
  return direct || contextualNo;
}
function orderChangeRequestText(value: string | null | undefined) { const q=normalized(value); return /(?:بزبط|بصير|ممكن|بدي|حاب|حابب|اريد|أريد).{0,26}(?:اعدل|أعدل|اغير|أغير|غير|غيّر|تغيير|بدل|استبدل).{0,35}(?:اللون|لون|الجهاز|الموديل|السعه|السعة|الذاكره|الذاكرة|الحجم)|(?:اعدل|أعدل|اغير|أغير|غير|غيّر|تغيير|بدل|استبدل).{0,28}(?:اللون|لون|الجهاز|الموديل|السعه|السعة|الذاكره|الذاكرة|الحجم)|(?:اللون|لون|الجهاز|الموديل|السعه|السعة).{0,28}(?:اعدل|أعدل|اغير|أغير|يتغير|تغيير)/.test(q); }
function orderChangeRetractionText(value: string | null | undefined) { const q=normalized(value); return /(?:لا\s+خلص|خلص|بطلت|بلاش).{0,28}(?:بدي\s+)?(?:اعدل|أعدل|اغير|أغير|التعديل|التغيير)|(?:ما\s+بدي|مش\s+بدي).{0,22}(?:اعدل|أعدل|اغير|أغير|التعديل|التغيير)/.test(q); }
function multipleDeviceEligibilityQuestionText(value: string | null | undefined, context?: string | null) { const q=normalized(value); const ctx=normalized(context); const direct=/(?:بيطلعلي|بطلعلي|بزبط|بقدر|ممكن).{0,28}(?:اكثر|أكثر).{0,18}(?:من\s+)?(?:جهاز|ايفون|آيفون|iphone)|(?:اكثر|أكثر).{0,18}(?:من\s+)?(?:جهاز|ايفون|آيفون|iphone).{0,28}(?:بيطلع|بزبط|بقدر|ممكن)|(?:لو\s+بدي|بدي).{0,12}(?:[2-9٢-٩]|اثنين|ثلاث|اربع|أربع|خمس).{0,12}(?:اجهزه|أجهزة|ايفون|آيفون|iphone)/i.test(q); const contextual=/^(?:لو\s+بدي\s+)?(?:[2-9٢-٩]|اثنين|ثلاث|اربع|أربع|خمس)(?:\s+مثلا|\s+مثلاً)?$/.test(q)&&/(?:اكثر|أكثر).{0,18}(?:جهاز|ايفون|آيفون|iphone)/i.test(ctx); return direct||contextual; }
function mapLocationRequestText(value: string | null | undefined) { const q=normalized(value); return /(?:ابعث|ابعت|ارسل|أرسل|بدي|هات).{0,30}(?:الموقع|اللوكيشن|location|المكان).{0,24}(?:الخريطه|الخريطة|map)|(?:your\s+location\s+on\s+map|location\s+on\s+map)|(?:envoie|envoyer).{0,25}(?:localisation|location)|(?:schick|sende).{0,25}(?:standort|location)|(?:الموقع).{0,18}(?:على\s+الخريطه|على\s+الخريطة)/i.test(q); }
function managementInfoQuestionText(value: string | null | undefined) { const q=normalized(value); return /(?:مين|من).{0,24}(?:المسؤول|المسوول|المدير).{0,30}(?:الاداره|الإدارة|الماليه|المالية)?|(?:اسم).{0,18}(?:المدير|المسؤول|المسوول)|(?:المسؤول|المسوول).{0,25}(?:في\s+)?(?:الاداره|الإدارة|الماليه|المالية)/.test(q); }
function productPriceStructureQuestionText(value: string | null | undefined) { const q=normalized(value); return /(?:السعر|سعر).{0,30}(?:مع|شامل).{0,18}(?:القسط|الاقساط|الأقساط)|(?:السعر|سعر).{0,30}(?:بدون).{0,18}(?:القسط|الاقساط|الأقساط)|(?:المتجر|الموقع).{0,35}(?:بيعطي|بعطي|بعرض|يعرض).{0,28}(?:السعر).{0,25}(?:مع\s+الاقساط|مع\s+الأقساط|بدون)/.test(q); }
function punctuationOnlyTurnText(value: string | null | undefined) { const raw=String(value||'').trim(); return Boolean(raw)&&/^[.،,،…!؟?\-_=+\s]+$/.test(raw); }

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

function legalOrTrustQuestionText(value: string | null | undefined) {
  return registrationOrLicensingQuestionText(value) || contractingPartyQuestionText(value) || safetyTrustQuestionText(value);
}

function buildSafeContractingPartyReply() {
  return "العقد بيكون مباشرة بين الشركة والعميل، ومش مع بنك أو شركة تمويل خارجية كطرف بالعقد. أما الاسم القانوني المثبت على العقد، المرجع هو الاسم المكتوب في العقد وبيانات الشركة الرسمية؛ ما رح أخمّن باسم قانوني من الاسم التشغيلي وحده.";
}

function buildSafeRegistrationReply(truth: TruthBundle) {
  return `بالنسبة للتسجيل أو الترخيص أو الاعتماد، ما عندي حقيقة موثقة ضمن بيانات المحادثة أقدر أأكد منها رقم تسجيل أو جهة ترخيص، لذلك ما رح أخمّن. اللي بقدر أؤكده هو: ${truth.policy.independenceStatement}`;
}

function buildSafeLegalTrustReply(truth: TruthBundle) {
  return `مفهوم إنك بدك تطمّن قبل ما تكمل. ما رح أعطيك ضمان عام أو أؤكد تسجيل/ترخيص بدون حقيقة موثقة. اللي بقدر أؤكده إن التعامل على الطلب بيكون مباشرة مع الشركة، وكل حالة دفع أو تعديل أو موافقة بنعتبرها صحيحة فقط لما تكون مثبتة فعليًا على الطلب. ${truth.policy.independenceStatement}`;
}

function unsupportedLegalEntityClaim(reply: string, truth: TruthBundle) {
  const n = normalized(reply);
  const business = normalized(truth.policy.businessName || "");
  const assertsRegistered = /(?:احنا|نحن|الشركه|الشركة|الجهه|الجهة).{0,35}(?:مسجلين|مسجله|مسجلة|مرخصين|مرخصه|مرخصة|معتمدين|معتمده|معتمدة)|(?:مسجلين|مرخصين|معتمدين).{0,25}(?:قانونيا|قانونيًا|بالحكومه|بالحكومة|رسميا|رسميًا)/.test(n);
  const assertsLegalName = /(?:الاسم\s+القانوني|الشركه\s+القانونيه|الشركة\s+القانونية).{0,35}(?:هو|هي|اسمها)|(?:العقد).{0,30}(?:رح|راح|بيكون|بكون).{0,20}(?:باسم)/.test(n)
    && Boolean(business) && n.includes(business);
  return assertsRegistered || assertsLegalName;
}

function trustLegalCommercialNudge(reply: string) {
  const n = normalized(reply);
  return /(?:رسوم\s+فتح\s+الملف|(?:5|٥)\s*(?:دنانير|دينار)|اود\s+الاستمرار|أود\s+الاستمرار|بدك\s+تكمل|بانتظارك\s+تدفع|ادفع\s+رسوم|دفع\s+رسوم|حول\s+المبلغ|حوّل\s+المبلغ|\/receipt)/.test(n);
}

function roboticPhrase(reply: string) {
  const n = normalized(reply);
  return /الطلب\s+AM-\d+\s+مربوط\s+(?:بالمحادثه|بالمحادثة)|احكيلي\s+النقطه\s+اللي\s+بدك\s+تعرفها|إذا\s+في\s+نقطه\s+محدده\s+بالطلب|اذا\s+في\s+نقطه\s+محدده\s+بالطلب|إذا\s+سؤالك\s+عن\s+طلب\s+سابق\s+ابعث\s+رقم\s+التتبع|اذا\s+سؤالك\s+عن\s+طلب\s+سابق\s+ابعث\s+رقم\s+التتبع|ما\s+في\s+تحديث\s+جديد\s+عن\s+آخر\s+حاله|ما\s+في\s+تحديث\s+جديد\s+عن\s+آخر\s+حالة|على\s+الموجود\s+فعليا\s+بدون\s+ما\s+الفك\s+بنفس\s+الكلام/.test(n);
}

function directProductAvailabilityQuestion(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("products") || /(?:متوفر|موجود|في\s+عندكم|عندكم).{0,35}(?:ايفون|آيفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|اوبو|oppo|ريلمي|realme|جهاز)|(?:ايفون|آيفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|اوبو|oppo|ريلمي|realme).{0,35}(?:متوفر|موجود|عندكم)|^(?:في|فيه)\s+(?:ايفون|آيفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|اوبو|oppo|ريلمي|realme)(?:\s|\d|$)|(?:ايفون|آيفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|اوبو|oppo|ريلمي|realme).{0,30}(?:كم\s+سعر|قديش\s+سعر|شو\s+سعر|سعرو|سعره|سعرها|بكم)/i.test(q);
}

function trustConcern(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("trust") || turn.topics.includes("legal") || turn.topics.includes("complaint")
    || legalOrTrustQuestionText(turn.rawText)
    || /(?:نصب|نصاب|مصداقيه|مصداقية|اضمن|أضمن|يضمن|ثقه|ثقة|قانونيا|قانونيًا|خايف|خايفة|متخوف)/.test(q);
}

function customerClaimsPaid(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:دفعت|دافع|حولت|حوّلت|تم\s+الدفع|رفعت\s+الوصل|بعثت\s+الوصل)/.test(q);
}

function humanRequest(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("human_request") || /(?:بدي|اريد|أريد).{0,28}(?:شخص|موظف|حدا|انسان|إنسان).{0,25}(?:احكي|أحكي|اتكلم|يرد)|(?:حولني|حوّلني).{0,20}(?:موظف|شخص|الاداره|الإدارة)/.test(q);
}

function reviewTimingQuestion(turn: InterpretedTurn) {
  return turn.topics.includes("review_timing") || /(?:متى|امتى|ايمتى).{0,45}(?:ترد|تحكو|تحكولي|خبر|موافق|قرار|يخلص|تخلص|يطلع)|(?:قبلتو|قبلتوه).{0,25}(?:طلبي|الطلب)?/.test(normalized(turn.rawText));
}

function trackingLinkRequest(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("tracking") && /(?:رابط|اتتبع|اشوف\s+طلبي|تتبع)/.test(q)
    || /(?:اعطيني|ابعث|ابعت|بدي).{0,25}رابط.{0,25}(?:التتبع|طلبي)|(?:كيف\s+اشوف|كيف\s+اتتبع).{0,25}(?:طلبي|الطلب)?/.test(q);
}

function siteIssue(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("website") || /(?:الموقع|الصفحه|الرابط).{0,45}(?:مش\s+راضي|ما\s+بفتح|مش\s+فاتح|ما\s+بشتغل|مش\s+شغال|عطل|مشكله)/.test(q);
}

function noPriorApplicationTurn(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:^|\s)(?:لا|ما)\s*(?:عندي|معي)\s+(?:طلب|ملف)(?:\s+سابق)?(?:\s|$)|(?:ماعندي|ما عندي|ما معي)\s+(?:طلب|ملف)(?:\s+سابق)?|(?:لا|ما)\s*(?:عندي|معي)\s+(?:رقم\s+)?تتبع/.test(q);
}

function applicationFormIssueTurn(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("website") || /(?:حطيت|عبيت|عبّيت|دخلت).{0,35}(?:كلشي|كل\s+شي|البيانات).{0,30}(?:ما\s*كمل|ما\s+بكمل|وقف|علق)|(?:كل\s+شوي).{0,28}(?:بعطيني|بطلعلي|بيطلعلي).{0,20}(?:هيك|خطا|خطأ|رساله|رسالة)|(?:ما\s+عم\s+بقدر|ما\s+بقدر|مش\s+قادر).{0,30}(?:احط|ادخل|اكمل|اعبي).{0,30}(?:معلومات|بيانات|التقديم|الطلب)/.test(q);
}

function generalRequirementsTurn(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("requirements") || /(?:شو|ما|ايش).{0,18}(?:الشروط|المتطلبات|الاوراق)|(?:لازم|ضروري).{0,22}(?:كشف\s+راتب|شهاده\s+راتب|هويه|هوية|كفيل)|(?:بزبط|بصير|ينفع).{0,28}(?:ع\s*الهويه|على\s+الهويه|بالهوية|بالهويه|بدون\s+كشف\s+راتب)|(?:الهويه|الهوية).{0,25}(?:لحال|فقط|بس)/.test(q);
}

function financingStructureTurn(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:التقسيط|الاقساط|الأقساط|المعامله|المعاملة).{0,30}(?:عن\s+طريق|من\s+خلال).{0,18}(?:بنك|البنك)|(?:عن\s+طريق|من\s+خلال)\s+(?:بنك|البنك).{0,30}(?:التقسيط|الشروط|المعامله|المعاملة)|(?:بنك|البنك).{0,22}(?:وشو|وما|شو).{0,18}(?:الشروط|المتطلبات)/.test(q);
}

function installmentAdjustmentTurn(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:ازود|زود|زياده|زيادة|ادفع|اسدد).{0,34}(?:القسط|الاقساط|الدفعات|دفعه|دفعة)|(?:القسط|الاقساط|الدفعات|دفعه|دفعة).{0,35}(?:ازود|زود|زياده|زيادة|اكثر|عاليه|عالية|مقدم|مرتين|دفعتين|بتخفف|تخفف|بتقلل|تقلل)|(?:تسديد|سداد).{0,25}(?:مبكر|مسبق|زياده)|(?:دفعه|دفعة).{0,35}(?:بتخفف|تخفف|بتقلل|تقلل).{0,25}(?:السعر|سعر\s+الجهاز|القسط)/.test(q);
}

function commercialPauseTurn(turn: InterpretedTurn, state: ConversationState) {
  return commercialPauseOrDeclineText(turn.rawText, state.lastAssistantText);
}

function unsafeOrderChangeExecutionClaim(reply: string, actions: ActionResult[]) {
  const n = normalized(reply);
  const risky = /(?:اكيد|أكيد).{0,12}(?:بزبط|بصير).{0,42}(?:اعدل|أعدل|اغير|أغير|اللون|الجهاز)|(?:بسجل|باسجل|رح\s+اسجل|راح\s+اسجل|باكده|بأكده).{0,35}(?:التعديل|اللون|الجهاز|المواصفات)|(?:تم|صار).{0,22}(?:تعديل|تغيير).{0,25}(?:اللون|الجهاز|الموديل|السعه|السعة)|(?:غيرنا|غيّرنا|عدلنا|عدّلنا|ثبتنا|اعتمدنا).{0,25}(?:اللون|الجهاز|الموديل|المواصفات|السعه|السعة)|(?:اللون|الجهاز|الموديل|المواصفات).{0,18}(?:صار|اصبح|أصبح).{0,20}(?:ازرق|أزرق|اسود|أسود|ابيض|أبيض|فضي|سيلفر|برتقالي|حسب\s+المتوفر)?/.test(n);
  if (!risky) return false;
  return !actions.some((x) => x.executed && ["change_device","change_application_data"].includes(x.action) && ["executed","already_done"].includes(x.outcome));
}

function unsupportedMultiDeviceGuarantee(reply: string) {
  const n = normalized(reply);
  return /(?:اكيد|أكيد).{0,18}(?:فيك|بتقدر|بقدر).{0,25}(?:تاخد|تأخذ|تطلع|يطلع).{0,25}(?:اكثر|أكثر|[2-9٢-٩]).{0,18}(?:جهاز|اجهزه|أجهزة)|(?:لو\s+بدك|اذا\s+بدك).{0,12}(?:[2-9٢-٩]|اربع|أربع|خمس).{0,16}(?:اجهزه|أجهزة).{0,30}(?:بتقدم|قدم)/.test(n);
}

function refundTimingContextualFollowup(turn: InterpretedTurn, truth: TruthBundle) {
  if (applicationJourneyStage(truth.application) !== "refund_requested") return false;
  const q = normalized(turn.rawText);
  return refundTimingQuestion(turn) || /(?:قيد\s+المعالجه|قيد\s+المعالجة).{0,24}(?:الي\s+متي|الى\s+متي|إلى\s+متى|لحد\s+متي|لحد\s+متى)|(?:متي|متى).{0,18}(?:التحويل|تحولو|تحويل)|(?:بعد).{0,12}(?:شهر|سنه|سنة).{0,12}(?:ام|او|أو).{0,12}(?:سنه|سنة|شهر)|(?:نفس\s+الرد|نفس\s+الجواب)/.test(q);
}

function phoneContactQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:كيف|كيفية|ليش|لماذا|وين).{0,28}(?:اتواصل|التواصل|اتصل|اتصال).{0,24}(?:هاتف|هاتفيا|هاتفيًا|رقم)|(?:رقم).{0,22}(?:تواصل|هاتف|اتصال)|(?:ليش|لماذا).{0,25}(?:ما\s+في|لا\s+يوجد).{0,18}(?:رقم)/.test(q);
}

function unsupportedPhoneAbsenceClaim(reply: string) {
  const n = normalized(reply);
  const safelyQualified = /(?:ما\s+عندي|غير\s+متوفر\s+عندي).{0,30}(?:رقم).{0,30}(?:اضافي|إضافي|رسمي|موثق)|(?:رقم).{0,30}(?:اضافي|إضافي|رسمي|موثق).{0,30}(?:ما\s+عندي|غير\s+متوفر)/.test(n);
  if (safelyQualified) return false;
  return /(?:ما\s+في|لا\s+يوجد|ما\s+عندنا|ما\s+النا).{0,24}(?:رقم).{0,24}(?:تواصل|هاتف|اتصال)?|(?:لهيك|لذلك).{0,24}(?:ما\s+في|لا\s+يوجد).{0,18}(?:رقم)/.test(n);
}

function safeStatusLabelForConfirmedPayment(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return null;
  const label = customerFacingStatusLabel(app);
  if (paymentHistoricallyConfirmed(app) && /(?:اثبات\s+الدفع|إثبات\s+الدفع|وصل\s+الدفع).{0,45}(?:بانتظار|قيد).{0,25}(?:مراجعه|مراجعة|اعتماد)/.test(normalized(label))) return null;
  return label;
}

function unsupportedGuarantorAcceptanceRule(reply: string) {
  const n = normalized(reply);
  return /(?:الكفيل).{0,35}(?:ما|مش|مو).{0,15}(?:لازم|ضروري).{0,20}(?:موظف)|(?:المهم).{0,25}(?:قادر|قدره).{0,20}(?:التغطيه|التغطية)|(?:حركه|حركة)\s+الحساب.{0,25}(?:بتساعد|تكفي|مقبول)|(?:الكفيل|بيانات\s+الكفيل).{0,30}(?:هو|هي|يكون|تكون).{0,18}(?:الحل|حل\s+مناسب)|(?:ممكن).{0,22}(?:الكفيل|بيانات\s+الكفيل).{0,22}(?:الحل|حل\s+مناسب)/.test(n);
}

function unsupportedEligibilityDecisionRule(reply: string) {
  const n = normalized(reply);
  return /(?:الاهليه|الأهلية).{0,25}(?:بتعتمد|تعتمد).{0,45}(?:الدخل).{0,25}(?:الالتزامات)|(?:الدخل\s+والالتزامات).{0,35}(?:الاهليه|الأهلية|القبول)|(?:عدد\s+الاجهزه|عدد\s+الأجهزة).{0,35}(?:ما\s+باثر|ما\s+بياثر|مش\s+مهم).{0,25}(?:الاهليه|الأهلية)/.test(n);
}

function confirmedPaymentRegressedToPending(reply: string, truth: TruthBundle) {
  if (!paymentHistoricallyConfirmed(truth.application)) return false;
  const n = normalized(reply);
  return /(?:وصل|اثبات\s+الدفع|إثبات\s+الدفع).{0,55}(?:بانتظار|قيد).{0,35}(?:مراجعه|مراجعة|اعتماد)|(?:بانتظار|قيد).{0,35}(?:مراجعه|مراجعة|اعتماد).{0,55}(?:وصل|اثبات\s+الدفع|إثبات\s+الدفع)|(?:الدفع).{0,35}(?:بانتظار).{0,25}(?:التاكيد|التأكيد|الاعتماد)/.test(n);
}

function reviewTimingAbandonedForMissingDetails(reply: string, turn: InterpretedTurn) {
  if (!reviewTimingQuestion(turn)) return false;
  const n = normalized(reply);
  return /(?:تفاصيل\s+الطلب).{0,25}(?:مش|مو|غير).{0,20}(?:كامله|كاملة|مكتمله|مكتملة)|(?:ما\s+عندي).{0,30}(?:تفاصيل\s+كامله|تفاصيل\s+كاملة)/.test(n);
}

function refundMeaningQuestion(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:شو|ايش|ليش|لشو|مغزي|مغزاه|معني).{0,30}(?:الاسترداد|استرداد)|(?:الاسترداد|استرداد).{0,30}(?:شو|ليش|لشو|تبع\s+شو|مغزاه)/.test(q);
}

function wantsContinueAfterCancellation(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:بديش|ما\s+بدي|لا\s+اريد).{0,28}(?:الغاء|الغي)|(?:بدي|اريد).{0,24}(?:اكمل|استمر|الجهاز|التلفون)|(?:رجع|اعاده).{0,25}(?:الطلب|الملف).{0,22}(?:طبيعته|شغال|فعال)/.test(q);
}

function receiptUploadConfirmation(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:رفعت|حملت|حمّلت|ارسلت|بعثت).{0,24}(?:وصل|اثبات\s+الدفع)|(?:وصل\s+دفع).{0,28}(?:رفعت|حملت|ارسلت|بعثت)|(?:ارغب|بدي).{0,25}(?:متابعه|تاكيد).{0,25}(?:الوصل|الدفع)/.test(q);
}

function socialCloseTurn(turn: InterpretedTurn) {
  if (turn.requestedActions.length) return false;
  const q = normalized(turn.rawText);
  if (/^(?:شكرا|يسلمو|يعطيك\s+العافيه|الله\s+يعطيك\s+العافيه|تمام\s+يسلمو|تمام\s+شكرا)$/.test(q)) return true;
  return /^(?:تمام|اوك|اوكي)$/.test(q) && turn.topics.some((t) => ["thanks","reaction"].includes(t));
}

function refundTimingQuestion(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:كم|قديش|متى|امتى|ايمتى|مدة|مده|وقت).{0,35}(?:الاسترداد|استرداد|الاسترجاع|استرجاع)|(?:الاسترداد|استرداد|الاسترجاع|استرجاع).{0,35}(?:كم|قديش|متى|امتى|ايمتى|مدة|مده|وقت|يوم)/.test(q);
}

function delayComplaint(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return turn.topics.includes("complaint")
    || /(?:مماطله|مماطلة|تاخير|تأخير|طولتو|طولتوا|صارلي|صارو|اسبوع|اسبوعين|\d+\s*(?:يوم|ايام|أيام))/.test(q);
}

function unsupportedExpeditePromise(reply: string) {
  const n = normalized(reply);
  return /(?:اقدر|بقدر|رح|راح).{0,25}(?:ارفع|اسجل|اضيف|اسوي|اعمل).{0,25}(?:ملاحظه|ملاحظة|طلب).{0,22}(?:استعجال|تسريع)|(?:ارفع|اسجل|اضيف).{0,22}(?:ملاحظه\s+استعجال|ملاحظة\s+استعجال|طلب\s+استعجال)/.test(n);
}

function mutationExecutionPromiseWithoutReceipt(reply: string, actions: ActionResult[]) {
  const n = normalized(reply);
  const promisesMutation = /(?:رح|راح|هسا|الان|الآن).{0,30}(?:ارفع|اسجل|ابلش|ابدا|ابدأ|انفذ|اعمل).{0,50}(?:الالغاء|الإلغاء|الاسترداد|الاسترجاع|طلب\s+الالغاء|طلب\s+الإلغاء|طلب\s+الاسترداد)|(?:طلب\s+الالغاء|طلب\s+الإلغاء|طلب\s+الاسترداد).{0,55}(?:رح|راح).{0,20}(?:ارفع|اسجل|ابلش|ابدا|ابدأ|انفذ)|(?:رح|راح).{0,15}(?:ابلش|ابدا|ابدأ).{0,15}(?:فيه|بالاجراء|بالإجراء)/.test(n);
  if (!promisesMutation) return false;
  return !actions.some((x) => x.executed && ["cancel_application","request_refund"].includes(x.action) && ["executed","already_done"].includes(x.outcome));
}

function unsupportedRefundEtaClaim(reply: string, turn: InterpretedTurn) {
  if (!refundTimingQuestion(turn)) return false;
  const n = normalized(reply);
  return /(?:ما|مش|مو).{0,8}(?:رح|راح).{0,25}(?:ياخذ|يوخذ|يطول).{0,28}(?:سنه|سنة|هالقد|لهالدرجه|لهالدرجة)|(?:اكيد|بالتاكيد|بالتأكيد).{0,35}(?:مش|ما).{0,20}(?:سنه|سنة|يطول|ياخذ|يوخذ)/.test(n);
}

function currentTurnExplicitMutationRequest(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  return /(?:بدي|اريد|أريد|حاب|حابب).{0,24}(?:الغي|إلغاء|الغاء|استرد|استرجع|استرداد|استرجاع)|^(?:الغي|إلغاء|الغاء|استرداد|استرجاع)\b/.test(q)
    || /(?:نعم|اه|ايوه|أكيد|اكيد|موافق).{0,28}(?:الغي|إلغاء|الغاء|استرد|استرجع|استرداد|استرجاع)/.test(q);
}

function repeatedMutationCta(reply: string, turn: InterpretedTurn) {
  if (currentTurnExplicitMutationRequest(turn)) return false;
  const n = normalized(reply);
  return /(?:بدك|هل\s+تريد|اذا\s+بدك|إذا\s+بدك).{0,38}(?:ارفع|أرفع|اسجل|أسجل|اتابع|أتابع|نبلش|نبدأ|ابدأ|أبدأ).{0,36}(?:الالغاء|الإلغاء|الاسترداد|الاسترجاع|الطلب)|(?:بدك\s+(?:ارفع|أرفع|اتابع|أتابع)).{0,35}(?:طلب\s+الالغاء|طلب\s+الإلغاء|طلب\s+الاسترداد)/.test(n);
}

function repeatedEmpathyOpener(reply: string, state: ConversationState) {
  const now = normalized(reply);
  const prev = normalized(state.lastAssistantText);
  return /^معك\s+حق(?:\s|$)/.test(now) && /^معك\s+حق(?:\s|$)/.test(prev);
}

function withoutRepeatedEmpathyOpener(reply: string) {
  const cleaned = String(reply || "").replace(/^\s*معك\s+حق(?:[،,]\s*|\s+)/, "").trim();
  return cleaned || "فاهم عليك.";
}

function normalizedReviewWindow(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل";
  return /المعدل\s+الطبيعي/.test(normalized(raw)) ? raw : `المعدل الطبيعي للمراجعة ${raw}`;
}

function continuationStageRegression(reply: string, truth: TruthBundle) {
  const decision = paymentDisclosureDecision({ application: truth.application, customerText: "", explicitContinuationThisTurn: false });
  const progressed = decision.paymentExecutionDetailsAllowed || decision.receiptPending || decision.alreadyPaid;
  if (!progressed) return false;
  const n = normalized(reply);
  return /(?:اكتبلي|اكتب|قللي|قولي).{0,22}(?:اود\s+الاستمرار|ارغب\s+بالاستمرار)|(?:اذا\s+بدك|إذا\s+بدك).{0,20}(?:نكمل|تكمل).{0,25}(?:اود\s+الاستمرار|ارغب\s+بالاستمرار)/.test(n);
}

function executedUnrequestedScopedMutation(actions: ActionResult[], turn: InterpretedTurn) {
  const requested = new Set(turn.requestedActions);
  return actions.find((x) => x.executed
    && ["cancel_application", "request_refund", "stop_refund", "reopen_application", "change_device", "change_application_data"].includes(x.action)
    && !requested.has(x.action)) || null;
}

function hasAlienTracking(reply: string, truth: TruthBundle) {
  const current = truth.application?.trackingId ? String(truth.application.trackingId).toUpperCase() : null;
  if (!current) return false;
  const ids = Array.from(String(reply || "").matchAll(/\bAM-\d{8,}\b/gi)).map((m) => m[0].toUpperCase());
  return ids.some((id) => id !== current);
}

function buildReviewTimingReply(input: { truth: TruthBundle; state: ConversationState; turn: InterpretedTurn }) {
  const app = input.truth.application;
  const p = input.truth.policy;
  const pendingManual = String(input.state.pendingActionPayload?._manualStatus || "") === "awaiting_admin" ? input.state.pendingAction : null;
  if (pendingManual && pendingActionIsCurrentTurnFocus({ action: pendingManual, turn: input.turn })) {
    const labels: Record<string,string> = {
      reopen_application: "إعادة فتح الطلب",
      stop_refund: "إيقاف الاسترداد",
      change_device: "تعديل الجهاز وإعادة الحسبة",
      change_application_data: "تعديل بيانات الطلب",
      cancel_application: "إلغاء الطلب",
      request_refund: "طلب الاسترداد",
    };
    return `طلب ${labels[pendingManual] || "التعديل"} بانتظار تنفيذ الإدارة على نفس الملف. ما عندي وقت ثابت وموثق لتنفيذه، لذلك ما بدي أعطيك موعد من عندي. الحالة الحالية ما بتتغير عندي إلا بعد التنفيذ الفعلي.`;
  }
  if (!app) {
    const tracking = input.state.activeTrackingId;
    const bound = tracking ? `طلبك ${tracking} مربوط بالمحادثة، لكن ما عندي نتيجة موافقة جديدة موثقة بهاللحظة. ` : "";
    return `${bound}${normalizedReviewWindow(p.normalReviewWindow)}، وحاليًا في ضغط مراجعات شديد وبعض الملفات بتتأخر أكثر من الطبيعي. ما عندي موعد نهائي موثق أقدر أضمنه.`;
  }
  const stage = applicationJourneyStage(app);
  if (stage === "cancelled") return "الطلب متوقف/ملغي حاليًا، لذلك ما في مراجعة فعالة ماشية عليه الآن. إذا كان في طلب إعادة فتح، بضل بانتظار التنفيذ الفعلي قبل ما أحكي عن مدة مراجعة جديدة.";
  if (stage === "refund_requested") return "الاسترداد مسجل وقيد المعالجة. ما عندي موعد تحويل ثابت وموثق أقدر أضمنه، وبعتمد فقط التنفيذ الفعلي لما يتم.";
  if (stage === "preliminary_approved_waiting_decision") return `الموافقة المبدئية صدرت، لكن الدراسة النهائية ما بتبدأ قبل اختيار الاستمرار وفتح الملف. بعد هالخطوة ${normalizedReviewWindow(p.normalReviewWindow)}، وحاليًا في ضغط مراجعات قد يطيل بعض الملفات.`;
  const paidConfirmed = paymentHistoricallyConfirmed(app);
  const paid = paidConfirmed ? "الدفع مؤكد إداريًا، وما في داعي تعيد الدفع أو ترفع الوصل. " : "";
  const safeLabel = safeStatusLabelForConfirmedPayment(input.truth);
  const status = safeLabel ? `طلبك ${safeLabel}. ` : (paidConfirmed ? "الملف مكمل بالمرحلة المسجلة عليه. " : "");
  return `${paid}${status}${normalizedReviewWindow(p.normalReviewWindow)}، لكن حاليًا في ضغط مراجعات شديد وبعض الملفات بتتأخر أكثر من الطبيعي. ما عندي موعد نهائي موثق أقدر أضمنه.`;
}

function buildProductReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const products = links.relevant.products || "https://www.ameenfinance.co/products";
  return `التوفر والسعر الحاليين مرجعهم صفحة المنتجات الرسمية، وما بدي أأكد موديل معيّن من غير بيانات محدثة. شوف الأجهزة الموجودة مباشرة من هون:\n${products}`;
}

function buildTrustReply(input: { truth: TruthBundle }) {
  return buildSafeLegalTrustReply(input.truth);
}

function buildStatusReply(input: { truth: TruthBundle }) {
  const app = input.truth.application;
  if (!app) return "ما عندي طلب موثوق مربوط بهالرسالة هسا، وما بدي أخمّن عليك بحالة طلب غير مؤكدة.";
  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_approved_waiting_decision") {
    return `طلبك أخذ موافقة مبدئية ولسا مش نهائية. إذا بدك تكمل للدراسة النهائية، الخطوة التالية فتح الملف ورسومه ${input.truth.policy.fileOpeningFeeJod} دنانير؛ منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. إذا بدك نكمل اكتبلي: أود الاستمرار.`;
  }
  if (stage === "preliminary_review") return "طلبك قيد المراجعة المبدئية، وما في خطوة دفع أو حضور مطلوبة منك هسا.";
  if (["final_review", "under_review"].includes(stage)) return "طلبك قيد الدراسة النهائية، وما في خطوة ناقصة منك حسب الحالة الحالية. أول شي منتظره هسا هو قرار المراجعة النهائية.";
  if (stage === "refund_requested") return "طلب الاسترداد مسجل وقيد المعالجة، وما في خطوة ناقصة منك حسب الحالة الحالية.";
  if (stage === "cancelled") return "الطلب متوقف/ملغي حاليًا، وما في دراسة فعالة ماشية عليه الآن.";
  return `حالة طلبك الآن: ${customerFacingStatusLabel(app)}.`;
}

function buildTrackingReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  if (links.relevant.tracking) return `أكيد، هذا رابط التتبع الرسمي لطلبك:
${links.relevant.tracking}`;
  return "ما عندي رابط تتبع مرتبط بطلب موثوق هسا، وما رح أعطيك رابط عام ممكن يوديك لطلب غلط.";
}

function buildSiteIssueReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const products = links.relevant.products || "https://www.ameenfinance.co/products";
  return `فهمتك؛ المشكلة بالموقع نفسه، مش بالمستندات. جرّب صفحة المنتجات الرسمية مباشرة من المتصفح:
${products}
إذا ظل نفس الخطأ، ابعث نص رسالة الخطأ أو صورة الشاشة وبنركز على مشكلة الموقع نفسها.`;
}

function buildReceiptConfirmationReply(input: { truth: TruthBundle; turn: InterpretedTurn }) {
  const decision = paymentDisclosureDecision({
    application: input.truth.application,
    customerText: input.turn.rawText,
    explicitContinuationThisTurn: false,
  });
  if (decision.alreadyPaid || paymentHistoricallyConfirmed(input.truth.application)) return "تمام، الدفع مؤكد إداريًا على طلبك، وما في عليك أي دفعة أو وصل جديد. الملف مكمل حسب مرحلته الحالية.";
  if (decision.receiptPending || input.truth.application?.documents?.paymentReceiptUploaded === true) return "تمام، وصل الدفع موجود على ملفك وبانتظار مراجعة الإدارة. ما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية؛ أول ما يتم اعتماده بتتحدث حالة الطلب.";
  return "تمام، وصلتني متابعتك بخصوص الوصل. تأكيد الدفع النهائي يتم يدويًا بعد مراجعة الإثبات المرفوع من الرابط الرسمي، وما رح أعتبر الدفع مؤكد قبل ما يظهر الاعتماد على الملف.";
}

function buildSafeRefundTimingReply() {
  return "ما عندي مدة ثابتة وموثقة أقدر أضمنها للاسترداد. الإجراء إله مراجعة وتنفيذ إداري، وأول ما يتم التحويل فعليًا بنبلغك مباشرة؛ لذلك ما بدي أعطيك رقم أيام أو حد زمني من عندي.";
}

function buildDelayComplaintReply(input: { truth: TruthBundle }) {
  const app = input.truth.application;
  if (!app) return "فاهم إن الانتظار طول. ما عندي طلب موثوق مربوط هسا حتى أعطيك مدة تخص ملفك، وما بدي أخمّن عليك.";
  return `فاهم إن الانتظار طول. طلبك ${customerFacingStatusLabel(app)}، وما في موعد نهائي موثق أقدر أضمنه. ${normalizedReviewWindow(input.truth.policy.normalReviewWindow)}، وحاليًا في ضغط مراجعات شديد وبعض الملفات بتتأخر أكثر من الطبيعي.`;
}

function buildRefundMeaningReply(input: { truth: TruthBundle }) {
  const app = input.truth.application;
  if (!app) return "الاسترداد يعني إرجاع مبلغ مدفوع بعد توقف الطلب. ما عندي طلب موثوق مربوط هسا حتى أحدد إذا في استرداد فعلي على ملفك.";
  const stage = applicationJourneyStage(app);
  if (stage === "refund_requested") {
    return "الاسترداد الظاهر على ملفك يعني إن الطلب ما عاد ماشي حاليًا كطلب تقسيط عادي، ومسار إرجاع المبلغ المدفوع مفتوح وقيد المعالجة. إذا إنت ما كنت تقصد الإلغاء وبدك تكمل بالجهاز، لازم يتوقف مسار الاسترداد ويُعاد فتح الطلب إداريًا؛ ما رح أقول إن الطلب رجع شغال قبل ما تتحدث حالته فعليًا.";
  }
  return "الاسترداد هو مسار إرجاع مبلغ مدفوع بعد إلغاء/توقف الطلب. بعتمد فقط الحالة الفعلية المسجلة على ملفك لتحديد إذا هذا المسار مفتوح عندك أو لا.";
}

function buildCommercialPauseReply() {
  return "تمام، بنخلي خطوة الاستمرار لبعدين. ما في دفع مطلوب هسا، وما رح أرسل تعليمات تحويل على قرار مؤجل. لما تقرر تكمل لاحقًا بنعتمد حالة الطلب وقتها بدون ضغط.";
}

function buildOrderChangeReply(input: { truth: TruthBundle; retracted?: boolean }) {
  if (input.retracted) return "تمام، فهمت إنك تراجعت عن التعديل. ما رح أعتبر أي لون أو جهاز تغيّر من المحادثة، والطلب يبقى على بياناته الحالية لحد ما يظهر تعديل فعلي موثق.";
  const paid = paymentHistoricallyConfirmed(input.truth.application);
  const payment = paid ? " الدفع الحالي مؤكد إداريًا، فما في داعي تعيد الدفع أو ترفع الوصل لمجرد طلب التعديل." : "";
  return `ممكن تطلب تعديل اللون أو المواصفات، لكن التعديل نفسه يحتاج تنفيذ إداري وما بنعتبره صار من المحادثة. القيمة الحالية على الطلب بتظل هي المعتمدة لحد ما تتحدث فعليًا.${payment} وإذا التعديل أثر على السعر أو الحسبة، بنعتمد الحسبة الجديدة فقط بعد ما تظهر رسميًا.`;
}

function buildMultiDeviceReply() {
  return "ما بقدر أضمن موافقة على أكثر من جهاز أو على عدد معيّن. كل طلب إضافي إله دراسة وموافقة مستقلة، وموافقة جهاز واحد ما تعني موافقة تلقائية على أجهزة ثانية.";
}

function buildMapLocationReply(truth: TruthBundle) {
  return `ما عندي رابط خريطة رسمي موثق أبعثه، وما رح أرسل رابط الموقع الإلكتروني كأنه موقع على الخريطة. العنوان العام المتاح هو ${truth.policy.generalLocation}، والحضور للمكتب فقط بموعد رسمي مؤكد.`;
}

function buildManagementInfoReply() {
  return "إذا قصدك اسم المدير أو المسؤول الإداري/المالي، ما عندي اسم رسمي موثق ومخوّل أذكره بالمحادثة. بقدر أكمل معك على طلبك من نفس واتساب وأعطيك المعلومات المؤكدة على الملف.";
}

function buildProductPriceStructureReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const products = links.relevant.products || "https://www.ameenfinance.co/products";
  return `السعر وحسبة الأقساط بنعتمدهم من صفحة المنتج والحسبة اللي تظهر وقت التقديم؛ ما رح أفترض إن أي رقم ظاهر هو سعر نقدي أو إجمالي تقسيط إذا الصفحة نفسها ما وضحته. التفاصيل المحدثة من هون:
${products}`;
}

function buildRefundFollowupReply(turn: InterpretedTurn) {
  const q = normalized(turn.rawText);
  if (/(?:نفس\s+الرد|نفس\s+الجواب)/.test(q)) return "صحيح، لأن ما ظهر تحديث فعلي جديد على الاسترداد. بدل ما أعيد نفس الفقرة: ما عندي مدة موثقة أقدر أحددها، وما في خطوة ناقصة منك الآن. أول ما يتغير التنفيذ فعليًا بنعطيك التحديث الجديد.";
  return "الاسترداد ما زال قيد المعالجة، وما عندي مدة ثابتة وموثقة أقدر أحددها للتحويل. ما في خطوة ناقصة منك الآن؛ وأول ما يصير تنفيذ فعلي بنعطيك التحديث بدل ما أكرر عليك نفس الكلام.";
}

function buildPhoneContactReply() {
  return "المتابعة الأساسية للطلبات من نفس واتساب. ما عندي رقم هاتف إضافي رسمي موثق أقدر أعطيك إياه، لذلك ما رح أختلق رقم أو أقول إن ما في رقم للشركة بشكل عام.";
}

function buildGeneralRequirementsReply() {
  return "إذا سؤالك هل الهوية لحالها بتكفي: لا، إثبات الدخل من المتطلبات الأساسية مع الهوية. بيانات الكفيل مش شرط ثابت لكل طلب وبتتحدد حسب دراسة الملف. وأي مستند حساس بنطلبه فقط من الرابط الرسمي الآمن، مش عبر واتساب.";
}

function buildFinancingStructureReply() {
  return "التقسيط عند الأمين للأقساط مش قرض بنكي من جهتنا. التقديم بيكون مباشرة على طلب الجهاز عبر الموقع، وبعدها الملف بيمر بالمراجعة حسب الشروط. من الأساسيات الهوية وإثبات الدخل، وبيانات الكفيل ممكن تُطلب حسب حالة الملف فقط.";
}

function buildInstallmentAdjustmentReply() {
  return "إذا قصدك تدفع مبلغ أكبر من القسط الشهري أو دفعة أكبر أو أكثر من قسط مرة وحدة: ما عندي سياسة موثقة أقدر أقول منها إنك تختار دفعة أولى عالية أو إن المبلغ الإضافي يخفض سعر الجهاز تلقائيًا. القاعدة المؤكدة إن القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد، وأي تغيير بالحسبة أو آلية السداد لازم يكون مثبتًا على الطلب أو بالعقد. وسؤالك هذا مش عن رسوم فتح الملف.";
}

function buildApplicationFormIssueReply() {
  return "واضح إن المشكلة أثناء تعبئة الطلب قبل ما يكتمل، لذلك ما بحتاج منك رقم تتبع. ابعث نص رسالة الخطأ أو اسم الخانة اللي بتوقف عندها، وإذا عندك صورة للشاشة ابعثها وبنركز على سبب توقف النموذج نفسه. لا تدخل بيانات غير صحيحة حتى يمر النموذج.";
}

function buildNoPriorApplicationReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const products = links.relevant.products || "https://www.ameenfinance.co/products";
  return `تمام، بما إنه ما عندك طلب سابق ما بحتاج منك رقم تتبع. إذا بدك تبدأ طلب جديد، ابدأ من صفحة المنتجات الرسمية وكمل نموذج التقديم:
${products}`;
}

function buildSafeGuarantorReply() {
  return "بيانات الكفيل مش شرط ثابت لكل طلب وبتتحدد حسب دراسة الملف. ما عندي معيار موثق أقدر أقول منه إن الكفيل لازم أو مش لازم يكون موظف، ولا بعتبره حلًا تلقائيًا لغياب إثبات الدخل. إذا احتاج الملف بيانات كفيل أو مستند إضافي بنطلبه بشكل محدد عبر الرابط الرسمي الآمن.";
}

function buildSafeEligibilityReply() {
  return "ما بقدر أحكم على الأهلية من عدد الأجهزة أو من معيار واحد من عندي. القبول بيتحدد بعد دراسة الطلب نفسه وفق المتطلبات المعتمدة، وما رح أنسب قرار القبول لمعايير غير موثقة بالمحادثة.";
}

function buildConfirmedPaymentReply(input: { truth: TruthBundle; turn: InterpretedTurn; state: ConversationState }) {
  if (reviewTimingQuestion(input.turn)) return buildReviewTimingReply({ truth: input.truth, turn: input.turn, state: input.state });
  const safeLabel = safeStatusLabelForConfirmedPayment(input.truth);
  return safeLabel
    ? `الدفع مؤكد إداريًا على الطلب، وما في داعي تعيد الدفع أو ترفع الوصل. الحالة الحالية: ${safeLabel}.`
    : "الدفع مؤكد إداريًا على الطلب، وما في داعي تعيد الدفع أو ترفع الوصل. الملف مكمل حسب مرحلته الحالية، ومراجعة الملف نفسها هي اللي بتستمر بعد الدفع.";
}

function buildCurrentPaymentExecutionReply(input: { truth: TruthBundle; turn: InterpretedTurn }) {
  const links = buildOfficialLinkContext(input.turn, input.truth);
  const receipt = links.relevant.receipt ? `\nبعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${links.relevant.receipt}` : "";
  return `تمام، هيك بنكمّل. رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير فقط؛ منفصلة عن ثمن الجهاز والقسط الأول، ومستردة عبر المسار الرسمي إذا ألغيت بعد دفع مؤكد. ${currentFileOpeningPaymentRule()}${receipt}\nتأكيد الدفع النهائي يتم يدويًا بعد مراجعة الوصل، والقسط الأول مش مطلوب الآن.`;
}

function buildReplacement(input: {
  reply: string;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  actions: ActionResult[];
  paymentViolation: boolean;
  legacyPaymentDestination: boolean;
  unsupportedOperationalPromise: boolean;
  unsupportedRefundEta: boolean;
  repeatedMutationPrompt: boolean;
  repeatedEmpathy: boolean;
  paymentRegression: boolean;
  legalTruthViolation: boolean;
  trustCommercialNudgeViolation: boolean;
  unsupportedEligibility: boolean;
  reviewTimingMissingDetails: boolean;
}) {
  const decision = paymentDisclosureDecision({
    application: input.truth.application,
    customerText: input.turn.rawText,
    explicitContinuationThisTurn: input.turn.requestedActions.includes("continue_application") || input.turn.topics.includes("continuation"),
  });
  if (progressedCommercialStage(input.truth, decision) && postContinuationPaymentDeferralText(input.turn.rawText)) return buildPostContinuationDeferralReply(input.turn.rawText);
  if (progressedCommercialStage(input.truth, decision) && postContinuationAcknowledgementText(input.turn.rawText)) return "تمام، الله يعطيك العافية.";
  if (reviewMeaningQuestionText(input.turn.rawText)) return buildReviewMeaningReply(input.truth);
  if (paymentHistoricallyConfirmed(input.truth.application) && keepCurrentReviewDecisionText(input.turn.rawText)) return buildKeepCurrentReviewReply(input.truth);
  if (commercialPauseTurn(input.turn, input.state)) return buildCommercialPauseReply();
  if (paymentFailureOrDestinationProblemText(input.turn.rawText)) {
    const links = buildOfficialLinkContext(input.turn, input.truth);
    return buildPaymentFailureRecoveryReply({
      turn: input.turn,
      truth: input.truth,
      receiptLink: links.relevant.receipt || null,
    });
  }
  if (input.legacyPaymentDestination) {
    if (decision.paymentExecutionDetailsAllowed) return buildCurrentPaymentExecutionReply({ truth: input.truth, turn: input.turn });
    if (decision.alreadyPaid) return "الدفع مؤكد إداريًا على طلبك، فما في داعي لأي بيانات تحويل جديدة.";
    if (decision.receiptPending) return "وصل الدفع موجود على الملف وبانتظار مراجعة الإدارة، فما في داعي لأي تحويل جديد.";
  }
  if (orderChangeRetractionText(input.turn.rawText)) return buildOrderChangeReply({ truth: input.truth, retracted: true });
  if (orderChangeRequestText(input.turn.rawText)) return buildOrderChangeReply({ truth: input.truth });
  if (multipleDeviceEligibilityQuestionText(input.turn.rawText, input.state.lastCustomerText)) return buildMultiDeviceReply();
  if (productPriceStructureQuestionText(input.turn.rawText)) return buildProductPriceStructureReply({ turn: input.turn, truth: input.truth });
  if (mapLocationRequestText(input.turn.rawText)) return buildMapLocationReply(input.truth);
  if (managementInfoQuestionText(input.turn.rawText)) return buildManagementInfoReply();
  if (refundTimingContextualFollowup(input.turn, input.truth)) return buildRefundFollowupReply(input.turn);
  if (phoneContactQuestionText(input.turn.rawText)) return buildPhoneContactReply();
  if (punctuationOnlyTurnText(input.turn.rawText)) return "أنا معك.";
  if (contractingPartyQuestionText(input.turn.rawText)) return buildSafeContractingPartyReply();
  if (registrationOrLicensingQuestionText(input.turn.rawText)) return buildSafeRegistrationReply(input.truth);
  if (safetyTrustQuestionText(input.turn.rawText) || input.trustCommercialNudgeViolation || input.legalTruthViolation) return buildSafeLegalTrustReply(input.truth);
  if (input.paymentRegression) return buildConfirmedPaymentReply({ truth: input.truth, turn: input.turn, state: input.state });
  if (input.reviewTimingMissingDetails) return buildReviewTimingReply({ truth: input.truth, state: input.state, turn: input.turn });
  if (applicationFormIssueTurn(input.turn)) return buildApplicationFormIssueReply();
  if (noPriorApplicationTurn(input.turn)) return buildNoPriorApplicationReply({ turn: input.turn, truth: input.truth });
  if (financingStructureTurn(input.turn)) return buildFinancingStructureReply();
  if (generalRequirementsTurn(input.turn)) return buildGeneralRequirementsReply();
  if (installmentAdjustmentTurn(input.turn)) return buildInstallmentAdjustmentReply();
  if (unsupportedGuarantorAcceptanceRule(input.reply)) return buildSafeGuarantorReply();
  if (input.unsupportedEligibility) return buildSafeEligibilityReply();
  if (input.unsupportedRefundEta || (input.repeatedMutationPrompt && refundTimingQuestion(input.turn))) return buildSafeRefundTimingReply();
  if ((input.unsupportedOperationalPromise || input.repeatedMutationPrompt) && delayComplaint(input.turn)) return buildDelayComplaintReply({ truth: input.truth });
  if (input.repeatedEmpathy) return withoutRepeatedEmpathyOpener(input.reply);
  if (input.paymentViolation) {
    if (decision.alreadyPaid) return "الدفع مؤكد إداريًا على طلبك، فما في داعي لأي دفعة أو وصل جديد. الملف مكمل بالمرحلة المسجلة عليه.";
    if (decision.receiptPending) return "وصل الدفع موجود على الملف وبانتظار مراجعة الإدارة، فما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية.";
    if (applicationJourneyStage(input.truth.application) === "preliminary_approved_waiting_decision") return `الموافقة الحالية مبدئية. رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير بتصير فقط إذا اخترت الاستمرار، وهي منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. تفاصيل التحويل بنعطيك إياها بعد قرار الاستمرار.`;
    return `رسوم فتح الملف ${input.truth.policy.fileOpeningFeeJod} دنانير مرتبطة بمرحلة ما بعد الموافقة المبدئية واختيار الاستمرار. ما رح أعطيك بيانات تحويل قبل ما تكون الخطوة مفتوحة فعليًا على الطلب.`;
  }
  if (socialCloseTurn(input.turn)) return "العفو، الله يعطيك العافية.";
  if (receiptUploadConfirmation(input.turn)) return buildReceiptConfirmationReply({ truth: input.truth, turn: input.turn });
  if (trackingLinkRequest(input.turn)) return buildTrackingReply({ turn: input.turn, truth: input.truth });
  if (siteIssue(input.turn)) return buildSiteIssueReply({ turn: input.turn, truth: input.truth });
  if (refundMeaningQuestion(input.turn)) return buildRefundMeaningReply({ truth: input.truth });
  if (wantsContinueAfterCancellation(input.turn) && applicationJourneyStage(input.truth.application) === "refund_requested") return buildRefundMeaningReply({ truth: input.truth });
  if (customerClaimsPaid(input.turn)) {
    if (decision.alreadyPaid) return "تمام، الدفع مؤكد إداريًا على طلبك، فما في داعي تعيد الدفع أو ترفع وصل جديد.";
    if (decision.receiptPending) return "تمام، الوصل موجود على الملف وبانتظار اعتماد الإدارة، فما في داعي تعيد الدفع أو ترفعه مرة ثانية.";
    return "وصلتني إنك بتقول إنك دفعت. الرسالة نفسها ما بتعتبر تأكيد دفع إداري، وبنفس الوقت ما رح أطلب منك تدفع مرة ثانية لمجرد إن التأكيد ما ظهر عندي هسا. بعتمد حالة الدفع الفعلية على الملف أول ما تتحدث.";
  }
  if (directProductAvailabilityQuestion(input.turn)) return buildProductReply({ turn: input.turn, truth: input.truth });
  if (reviewTimingQuestion(input.turn)) return buildReviewTimingReply({ truth: input.truth, state: input.state, turn: input.turn });
  if (trustConcern(input.turn)) return buildTrustReply({ truth: input.truth });
  if (humanRequest(input.turn)) return "فاهم إنك بدك تحكي مع شخص مباشرة. المتابعة الرسمية لدى الأمين للطلب من نفس واتساب، وما رح أوهمك بتحويل أو اتصال إذا ما في تحويل فعلي. احكيلي شو الإجراء أو المعلومة اللي بدك إياها وبعطيك الجواب الموجود على الطلب بدون تدوير.";
  if (decision.paymentExecutionDetailsAllowed || decision.receiptPending || decision.alreadyPaid) return "رغبتك بالاستمرار مسجلة بالفعل، فما في داعي تعيد خطوة «أود الاستمرار». جاوبني بالنقطة اللي بدك تعرفها وبكمل معك من المرحلة الحالية.";
  return buildStatusReply({ truth: input.truth });
}

/**
 * Final deterministic egress gate. The writer/verifier can improve language,
 * but this gate owns the last word on application scope, payment disclosure,
 * unsupported trust claims, and known robotic escape phrases.
 */
export function enforceFinalResponseGate(input: {
  reply: string | null;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  actions: ActionResult[];
  applicationChanged: boolean;
}) : FinalResponseGateResult {
  const reply = String(input.reply || "").trim();
  const violations: string[] = [];
  let severity: "none" | "warning" | "p0" = "none";

  const paymentDecision = paymentDisclosureDecision({
    application: input.truth.application,
    customerText: input.turn.rawText,
    explicitContinuationThisTurn: input.turn.requestedActions.includes("continue_application") || input.turn.topics.includes("continuation"),
  });
  const legacyPaymentDestination = Boolean(reply && containsLegacyFileOpeningPaymentDestination(reply));
  const paymentFailureTurn = paymentFailureOrDestinationProblemText(input.turn.rawText);
  const paymentFailureRecoveryMissing = paymentFailureTurn && !paymentFailureRecoveryReplyIsCurrent(reply, paymentDecision);
  if (paymentFailureRecoveryMissing) {
    violations.push("payment_failure_recovery_required");
    severity = "p0";
  }
  const paymentLeak = Boolean(reply && containsRestrictedPaymentExecutionDetail(reply, input.truth.policy) && !paymentDecision.paymentExecutionDetailsAllowed);
  if (paymentLeak) {
    violations.push(`payment_execution_details_not_allowed:${paymentDecision.reason}`);
    severity = "p0";
  }
  if (legacyPaymentDestination) {
    violations.push("legacy_payment_destination_forbidden");
    severity = "p0";
  }
  if (customerTextIsNonFeePaymentContext(input.turn.rawText) && containsRestrictedPaymentExecutionDetail(reply, input.truth.policy)) {
    if (!violations.includes("non_fee_payment_context_leaked_file_opening_details")) violations.push("non_fee_payment_context_leaked_file_opening_details");
    severity = "p0";
  }
  if (reply && roboticPhrase(reply)) violations.push("robotic_escape_phrase");
  if (directProductAvailabilityQuestion(input.turn) && /(?:ابعث|ابعت|ارسل|أرسل).{0,35}(?:رقم\s+التتبع|رقم\s+الطلب)/.test(normalized(reply))) violations.push("product_question_wrong_tracking_fallback");
  if (receiptUploadConfirmation(input.turn) && !/(?:وصل|اثبات\s+الدفع|الدفع).{0,45}(?:بانتظار|مراجعه|مراجعة|موكد|مؤكد|اعتماد|اعتماده)|(?:بانتظار|مراجعه|مراجعة|موكد|مؤكد|اعتماد).{0,45}(?:وصل|الدفع)/.test(normalized(reply))) violations.push("receipt_confirmation_status_not_answered");
  if (receiptUploadConfirmation(input.turn) && /رسوم\s+فتح\s+الملف.{0,18}(?:5|٥|خمس)/.test(normalized(reply))) violations.push("receipt_confirmation_replayed_fee_education");
  if (socialCloseTurn(input.turn) && /(?:حاله\s+طلبك|حالة\s+طلبك|رقم\s+طلبك|قيد\s+الدراسه|قيد\s+الدراسة|رابط\s+التتبع|رسوم\s+فتح\s+الملف)/.test(normalized(reply))) violations.push("social_close_should_not_dump_status");
  if (continuationStageRegression(reply, input.truth)) violations.push("continuation_stage_regression");
  const legalTruthViolation = unsupportedLegalEntityClaim(reply, input.truth)
    || (trustConcern(input.turn) && /(?:جهة\s+معروفه|جهة\s+معروفة|مسجلين\s+قانونيا|مسجلين\s+قانونيًا|مرخصين|مرخصة)/.test(normalized(reply)));
  if (legalTruthViolation) {
    violations.push("unsupported_legal_registration_or_contracting_entity_claim");
    // Backward-compatible integrity label retained for Phase 7.3.0 regression tests/telemetry.
    violations.push("unsupported_trust_or_registration_claim");
  }
  const trustCommercialNudgeViolation = legalOrTrustQuestionText(input.turn.rawText)
    && !explicitFeePolicyQuestionText(input.turn.rawText)
    && (trustLegalCommercialNudge(reply) || containsFiveJodFeeExplanation(reply) || containsRestrictedPaymentExecutionDetail(reply, input.truth.policy));
  if (trustCommercialNudgeViolation) violations.push("trust_or_legal_turn_must_not_push_commercial_step");
  if (contractingPartyQuestionText(input.turn.rawText) && !/(?:العقد).{0,45}(?:بين|مباشره|مباشرة).{0,35}(?:الشركه|الشركة).{0,25}(?:العميل)|(?:العقد).{0,45}(?:الشركه|الشركة).{0,25}(?:العميل)/.test(normalized(reply))) {
    violations.push("contracting_party_question_not_answered");
  }
  if (customerClaimsPaid(input.turn) && /(?:لسه|لسا|ما).{0,40}(?:وصل|وصلت).{0,25}(?:مرحله|مرحلة).{0,25}(?:رسوم|الدفع)|(?:ما\s+في|لا\s+يوجد).{0,25}(?:مرحله|مرحلة).{0,20}(?:دفع|رسوم)/.test(normalized(reply))) {
    violations.push("customer_payment_claim_contradicted_by_stage_template");
  }
  const paymentRegression = confirmedPaymentRegressedToPending(reply, input.truth);
  if (paymentRegression) {
    violations.push("confirmed_payment_regressed_to_receipt_pending");
    severity = "p0";
  }
  if (paymentHistoricallyConfirmed(input.truth.application) && /(?:ما\s+في|لا\s+يوجد|مش\s+موجود).{0,28}(?:دفع\s+موكد|دفع\s+مؤكد|دفع).{0,20}(?:اصلا|أصلا)?/.test(normalized(reply))) {
    violations.push("historically_confirmed_payment_cannot_be_denied");
    severity = "p0";
  }
  if (trackingLinkRequest(input.turn) && !/(?:https?:\/\/|رابط\s+التتبع)/i.test(reply)) violations.push("tracking_link_request_not_answered");
  if (siteIssue(input.turn) && /(?:ابعث|ابعت|ارسل).{0,30}(?:رقم\s+التتبع|رقم\s+الطلب)/.test(normalized(reply))) violations.push("site_issue_wrong_tracking_fallback");
  if ((applicationFormIssueTurn(input.turn) || noPriorApplicationTurn(input.turn)) && /(?:ابعث|ابعت|ارسل|بدي|لازم).{0,35}(?:رقم\s+التتبع|رقم\s+الطلب)|(?:ما\s+عندي|ما\s+في).{0,35}(?:طلب\s+موثوق|طلب\s+مربوط)/.test(normalized(reply))) violations.push("no_application_or_form_issue_wrong_tracking_fallback");
  if ((generalRequirementsTurn(input.turn) || financingStructureTurn(input.turn)) && /(?:ما\s+عندي|ما\s+في).{0,45}(?:طلب\s+موثوق|خطوه\s+دفع|خطوة\s+دفع)|(?:ابعث|ابعت).{0,30}(?:رقم\s+التتبع|رقم\s+الطلب)/.test(normalized(reply))) violations.push("general_requirements_not_answered");
  if (installmentAdjustmentTurn(input.turn) && (containsRestrictedPaymentExecutionDetail(reply, input.truth.policy) || /رسوم\s+فتح\s+الملف|خطوه\s+دفع|خطوة\s+دفع/.test(normalized(reply)))) violations.push("installment_adjustment_misrouted_to_file_opening_payment");
  if (unsupportedGuarantorAcceptanceRule(reply)) violations.push("unsupported_guarantor_acceptance_rule");
  const unsupportedEligibility = unsupportedEligibilityDecisionRule(reply);
  if (unsupportedEligibility) violations.push("unsupported_eligibility_decision_rule");
  const reviewTimingMissingDetails = reviewTimingAbandonedForMissingDetails(reply, input.turn);
  if (reviewTimingMissingDetails) violations.push("review_timing_abandoned_for_missing_details");
  if (refundMeaningQuestion(input.turn) && /(?:طلب\s+الاسترداد\s+مسجل|ما\s+في\s+خطوه\s+ناقصه)/.test(normalized(reply))) violations.push("refund_meaning_question_not_answered");
  if (wantsContinueAfterCancellation(input.turn) && applicationJourneyStage(input.truth.application) === "refund_requested" && /(?:الطلب\s+(?:شغال|مكمل|طبيعي)|ما\s+لغينا|ما\s+انلغي)/.test(normalized(reply))) {
    violations.push("refund_state_falsely_claimed_active");
    severity = "p0";
  }
  if (input.applicationChanged && hasAlienTracking(reply, input.truth)) violations.push("old_application_tracking_leaked_after_switch");

  const crossApplicationMutation = input.applicationChanged ? executedUnrequestedScopedMutation(input.actions, input.turn) : null;
  if (crossApplicationMutation) {
    violations.push(`cross_application_mutation_executed:${crossApplicationMutation.action}`);
    severity = "p0";
  }
  const mutationExecutedFromQuestion = input.actions.find((x) => x.executed
    && ["cancel_application","request_refund"].includes(x.action)
    && mutationQuestion(x.action as any, input.turn.rawText));
  if (mutationExecutedFromQuestion) {
    violations.push(`mutation_executed_from_question:${mutationExecutedFromQuestion.action}`);
    severity = "p0";
  }

  const unsupportedOperationalPromise = unsupportedExpeditePromise(reply) || mutationExecutionPromiseWithoutReceipt(reply, input.actions);
  if (unsupportedOperationalPromise) violations.push("unsupported_operational_promise_without_execution");
  const unsupportedRefundEta = unsupportedRefundEtaClaim(reply, input.turn);
  if (unsupportedRefundEta) violations.push("unsupported_refund_eta_certainty");
  const repeatedMutationPrompt = repeatedMutationCta(reply, input.turn);
  if (repeatedMutationPrompt) violations.push("repeated_mutation_cta_without_current_request");
  const repeatedEmpathy = repeatedEmpathyOpener(reply, input.state);
  if (repeatedEmpathy) violations.push("repeated_empathy_opener");

  const progressedCommercial = progressedCommercialStage(input.truth, paymentDecision);
  const postContinuationDeferral = progressedCommercial && postContinuationPaymentDeferralText(input.turn.rawText);
  const postContinuationAck = progressedCommercial && postContinuationAcknowledgementText(input.turn.rawText);
  if ((postContinuationDeferral || postContinuationAck) && (containsRestrictedPaymentExecutionDetail(reply, input.truth.policy) || containsFiveJodFeeExplanation(reply))) {
    violations.push(postContinuationDeferral ? "post_continuation_deferral_must_not_replay_payment" : "post_continuation_ack_must_not_replay_payment");
    severity = "p0";
  }
  if (postContinuationAck && /(?:رغبتك\s+بالاستمرار\s+مسجله|رغبتك\s+بالاستمرار\s+مسجلة|جاوبني\s+بالنقطه|جاوبني\s+بالنقطة|تفاصيل\s+الطلب\s+مش\s+كامله|تفاصيل\s+الطلب\s+مش\s+كاملة)/.test(normalized(reply))) {
    violations.push("post_continuation_ack_wrong_stage_fallback");
  }
  if (reviewMeaningQuestionText(input.turn.rawText) && /(?:تفاصيل\s+الطلب\s+مش\s+كامله|تفاصيل\s+الطلب\s+مش\s+كاملة|ما\s+بدي\s+اخمن\s+بحاله|ما\s+بدي\s+أخمن\s+بحالة)/.test(normalized(reply))) {
    violations.push("review_meaning_question_abandoned_for_missing_details");
  }
  if (paymentHistoricallyConfirmed(input.truth.application) && keepCurrentReviewDecisionText(input.turn.rawText) && /(?:تفاصيل\s+الطلب\s+مش\s+كامله|تفاصيل\s+الطلب\s+مش\s+كاملة|اود\s+الاستمرار|أود\s+الاستمرار|رغبتك\s+بالاستمرار\s+مسجله|رغبتك\s+بالاستمرار\s+مسجلة)/.test(normalized(reply))) {
    violations.push("keep_review_decision_not_acknowledged");
  }

  const commercialPause = commercialPauseTurn(input.turn, input.state);
  if (commercialPause && (containsRestrictedPaymentExecutionDetail(reply, input.truth.policy) || containsFiveJodFeeExplanation(reply) || /(?:اخترت|قررت).{0,18}(?:تكمل|الاستمرار)|(?:اود|أود)\s+الاستمرار/.test(normalized(reply)))) {
    violations.push("deferred_or_declined_continuation_must_not_open_payment");
    severity = "p0";
  }
  if ((orderChangeRequestText(input.turn.rawText) || orderChangeRetractionText(input.turn.rawText)) && unsafeOrderChangeExecutionClaim(reply, input.actions)) violations.push("order_change_claimed_without_execution");
  if (multipleDeviceEligibilityQuestionText(input.turn.rawText, input.state.lastCustomerText) && unsupportedMultiDeviceGuarantee(reply)) violations.push("multiple_device_eligibility_guaranteed_without_truth");
  if (mapLocationRequestText(input.turn.rawText) && /https?:\/\/(?:www\.)?ameenfinance\.co(?:\/|\s|$)/i.test(reply) && !/(?:ما\s+عندي|لا\s+يوجد).{0,25}(?:رابط\s+خريطه|رابط\s+خريطة)/.test(normalized(reply))) violations.push("website_url_misrepresented_as_map_location");
  if (managementInfoQuestionText(input.turn.rawText) && /(?:طلبك|الاسترداد|قيد\s+المعالجه|قيد\s+المعالجة).{0,50}(?:الحاله|الحالة|قيد)/.test(normalized(reply))) violations.push("management_question_wrong_status_fallback");
  if (phoneContactQuestionText(input.turn.rawText) && unsupportedPhoneAbsenceClaim(reply)) violations.push("unsupported_phone_absence_claim");
  if (productPriceStructureQuestionText(input.turn.rawText) && /(?:السعر\s+الاساسي|السعر\s+الأساسي).{0,25}(?:بدون\s+التقسيط)|(?:بتعتمد|تعتمد).{0,30}(?:الدفعه\s+الاولي|الدفعة\s+الأولى)/.test(normalized(reply))) violations.push("unsupported_product_price_or_downpayment_structure_claim");
  if (installmentAdjustmentTurn(input.turn) && /(?:دفعه\s+اولي|دفعة\s+أولى|دفعة\s+اولي).{0,30}(?:اعلى|أعلى|اكبر|أكبر).{0,35}(?:بتخفف|تخفف|بتقلل|تقلل).{0,30}(?:السعر|سعر\s+الجهاز)|(?:بتعتمد|تعتمد).{0,35}(?:الدفعه\s+الاولي|الدفعة\s+الأولى)|(?:اختار|تختار|بتختار).{0,25}(?:دفعه\s+اولي|دفعة\s+أولى|الدفعة\s+الأولى)/.test(normalized(reply))) violations.push("unsupported_product_price_or_downpayment_structure_claim");
  if (refundTimingContextualFollowup(input.turn, input.truth) && /^(?:طلب\s+الاسترداد\s+مسجل\s+وقيد\s+المعالجه|طلب\s+الاسترداد\s+مسجل\s+وقيد\s+المعالجة)/.test(normalized(reply))) violations.push("refund_followup_repeated_status_template");
  if (punctuationOnlyTurnText(input.turn.rawText) && /(?:طلبك|الاسترداد|قيد\s+الدراسه|قيد\s+الدراسة|حاله\s+الطلب|حالة\s+الطلب)/.test(normalized(reply))) violations.push("punctuation_only_turn_should_not_dump_status");

  const optOut = /(?:لا\s+ارغب|لا\s+أرغب|لا\s+اريد|لا\s+أريد|ما\s+بدي|مش\s+حاب).{0,35}(?:استمر|الاستمرار|اكمل|أكمل)/.test(normalized(input.turn.rawText));
  if (optOut && (containsRestrictedPaymentExecutionDetail(reply, input.truth.policy) || /(?:أود\s+الاستمرار|بدك\s+تكمل|هل\s+تود\s+الاستمرار)/.test(reply))) {
    violations.push("opt_out_must_not_trigger_continuation_or_payment");
    severity = "p0";
  }

  if (!reply) violations.push("empty_final_reply");
  if (violations.length && severity === "none") severity = "warning";

  return {
    pass: violations.length === 0,
    violations,
    replacementReply: violations.length ? buildReplacement({
      reply,
      turn: input.turn,
      state: input.state,
      truth: input.truth,
      actions: input.actions,
      paymentViolation: paymentLeak,
      legacyPaymentDestination,
      unsupportedOperationalPromise,
      unsupportedRefundEta,
      repeatedMutationPrompt,
      repeatedEmpathy,
      paymentRegression,
      legalTruthViolation,
      trustCommercialNudgeViolation,
      unsupportedEligibility,
      reviewTimingMissingDetails,
    }) : null,
    severity,
  };
}
