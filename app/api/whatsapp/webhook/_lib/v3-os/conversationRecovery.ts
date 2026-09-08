import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { continuationCommercialState } from "./commercialProgression";
import { isContinuationRevenueReady } from "./continuationPersistence";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { normalizeArabic } from "./text";
import type { ConversationState, DialogueAct, InterpretedTurn, TruthBundle } from "./types";
import { applicationFormIssueText, commercialPauseOrDeclineText, contextualTurnSignals, explicitNoPriorApplicationText, financingStructureQuestionText, foreignApplicantGeneralFormIssueText, generalRequirementsQuestionText, installmentAdjustmentQuestionText, managementInfoQuestionText, mapLocationRequestText, multipleDeviceEligibilityQuestionText, orderChangeRequestText, orderChangeRetractionText, productPriceStructureQuestionText, punctuationOnlyTurnText } from "./contextualTurnResolver";
import { buildSafeContractingPartyReply, buildSafeRegistrationReply, buildSafeTrustReply, contractingPartyQuestionText, registrationOrLicensingQuestionText, safetyTrustQuestionText } from "./legalTrustGuard";
import { paymentHistoricallyConfirmed } from "./truthSnapshotLock";
import { currentFileOpeningPaymentRule } from "./paymentDestinationOverride";
import { buildPaymentFailureRecoveryReply, paymentFailureOrDestinationProblemText } from "./paymentFailureRecovery";
import { additionalIncomeQuestionText, applicationStartQuestionText, barePhoneNumberText, customerOffersHomeAddressText, dataDeletionConfirmationText, dataDeletionRequestText, documentContextKind, explicitExpediteRequestText, feeNowOrPickupQuestionText, genericDocumentLinkRequestText, guarantorNameOnlyQuestionText, legalThreatOrPublicEscalationText, paymentMethodQuestionText, politeClosureText, pureGreetingText, recentPaymentOrReceiptContext, refundFeeQuestionText, reviewDelayQuestionText, roleDisplayName, staffIdentityQuestionText, whatsappImageMessageText } from "./dailyConversationIntegrity";

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

function postContinuationStageOpen(truth: TruthBundle) {
  const app = truth.application;
  return Boolean(app && (isContinuationRevenueReady(app) || paymentHistoricallyConfirmed(app) || app.documents?.paymentReceiptUploaded));
}

function postContinuationAcknowledgementText(value: string | null | undefined) {
  if (politeClosureText(value)) return true;
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

function buildKeepReviewReply(truth: TruthBundle) {
  const paid = paymentHistoricallyConfirmed(truth.application);
  const payment = paid ? " والدفع مؤكد إداريًا." : "";
  return `تمام، بنكمل على الطلب الحالي وما رح أبدأ إلغاء أو استرداد من هالحكي.${payment} بخصوص إنك بدك حل قريب: ما عندي موعد مؤكد أضمنه، وأول ما يصدر قرار فعلي رح يصلك التحديث.`;
}


function buildStaffIdentityReply(state: ConversationState) {
  const name = roleDisplayName(state.role.currentRole);
  return `معك ${name} من الأمين للأقساط، تفضل.`;
}

function buildFeeTimingReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const app = input.truth.application;
  const commercial = continuationCommercialState(app);
  const firstInstallment = "القسط الأول مش عند الاستلام؛ يستحق بعد شهر من استلام الجهاز وتوقيع العقد.";
  if (paymentHistoricallyConfirmed(app) || commercial === "already_paid") {
    return `الدفع مؤكد إداريًا على طلبك، فما في داعي تدفع 5 دنانير مرة ثانية. ${firstInstallment}`;
  }
  if (commercial === "payment_pending_admin" || app?.documents?.paymentReceiptUploaded) {
    return `وصل الدفع موجود على الملف وبانتظار مراجعة الإدارة، فما في داعي تدفع مرة ثانية. ${firstInstallment}`;
  }

  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_approved_waiting_decision") {
    return `رسوم فتح الملف 5 دنانير ما بتنطلب قبل اختيار الاستمرار. إذا قررت تكمل، بتدفعها لفتح الدراسة النهائية، مش عند الاستلام. ${firstInstallment}`;
  }

  if (isContinuationRevenueReady(app)) {
    if (paymentMethodQuestionText(input.turn.rawText)) {
      const syntheticTurn: InterpretedTurn = {
        ...input.turn,
        topics: Array.from(new Set([...input.turn.topics, "payment_method", "receipt_upload"])) as InterpretedTurn["topics"],
      };
      const links = buildOfficialLinkContext(syntheticTurn, input.truth);
      const receipt = links.relevant.receipt
        ? `\nبعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${links.relevant.receipt}`
        : "";
      return `نعم، بهالمرحلة المطلوب 5 دنانير رسوم فتح الملف حتى تبدأ الدراسة النهائية. ${currentFileOpeningPaymentRule({ includeApology: false })}${receipt}\n${firstInstallment}`;
    }
    return `نعم، بعد ما اخترت الاستمرار المطلوب بهالمرحلة فقط 5 دنانير رسوم فتح الملف حتى تبدأ الدراسة النهائية. ${firstInstallment}`;
  }

  return `رسوم فتح الملف مرتبطة بمرحلة ما بعد الموافقة المبدئية واختيار الاستمرار، وما رح أطلب منك مبلغ قبل ما تكون الخطوة مفتوحة فعليًا على الطلب. ${firstInstallment}`;
}

function buildRefundFeeQuestionReply(truth: TruthBundle) {
  const app = truth.application;
  const stage = applicationJourneyStage(app);
  const paid = paymentHistoricallyConfirmed(app);

  if (stage === "refund_requested") {
    return "رسوم فتح الملف المدفوعة داخلة بمسار الاسترداد الحالي. الاسترداد قيد المعالجة، وما في خطوة ناقصة منك حسب الحالة الحالية.";
  }
  if (stage === "cancelled" && paid) {
    return "بما إن الطلب ملغي والدفع مؤكد، رسوم فتح الملف بتدخل مسار الاسترداد الرسمي. ما رح أقول إن التحويل تم قبل ما يظهر التنفيذ الفعلي.";
  }
  if (paid) {
    return "إذا قررت تلغي الطلب لاحقًا وطلبت الإلغاء بشكل صريح وأكدته، رسوم فتح الملف المدفوعة بتدخل مسار الاسترداد الرسمي. سؤالك الحالي لحاله ما بوقف الطلب وما بنفذ إلغاء.";
  }
  return "إذا ما في دفع مؤكد على الطلب، ما بيكون في مبلغ مدفوع نفتح له استرداد. وسؤالك الحالي لحاله ما بوقف الطلب ولا بنفذ إلغاء.";
}

function buildDocumentLinkReply(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  recentTurns?: string[];
}) {
  const kind = documentContextKind(input.state, input.recentTurns);
  if (kind === "ambiguous") {
    return "أكيد، بس حدّدلي أي رابط بدك بالضبط: رفع الهوية، إثبات الدخل/كشف الراتب، ولا بيانات الكفيل؟ ما بدي أعطيك رابط غلط.";
  }
  if (!kind) {
    return "أكيد، بس حدّدلي أي مستند بدك ترفعه حتى أعطيك الرابط الرسمي المرتبط بالطلب، وما رح أستخدم رابط الوصل أو التتبع بدل رابط المستند.";
  }
  if (!input.truth.application) {
    return "رابط رفع المستند لازم يكون مرتبط بطلب فعلي. إذا عندك رقم تتبع ابعثه، وإذا لسا ما قدمت ابدأ من صفحة المنتجات الرسمية أولًا.";
  }

  const textByKind = {
    identity: "رفع الهوية",
    salarySlip: "رفع إثبات الدخل",
    guarantor: "رفع بيانات الكفيل",
  } as const;
  const rawByKind = {
    identity: "رابط رفع الهوية",
    salarySlip: "رابط رفع كشف الراتب",
    guarantor: "رابط رفع بيانات الكفيل",
  } as const;
  const syntheticTurn: InterpretedTurn = {
    ...input.turn,
    rawText: rawByKind[kind],
    topics: Array.from(new Set([...input.turn.topics, "requirements"])) as InterpretedTurn["topics"],
  };
  const links = buildOfficialLinkContext(syntheticTurn, input.truth);
  const url = links.relevant[kind];
  if (url) return `أكيد، هذا رابط ${textByKind[kind]} الرسمي المرتبط بطلبك:\n${url}`;
  return `رابط ${textByKind[kind]} مش متاح على حالة الطلب الحالية بشكل موثق. ما رح أختلق رابط، وما تبعث المستند على واتساب.`;
}

function buildReceiptImageReply(input: {
  turn: InterpretedTurn;
  truth: TruthBundle;
}) {
  const app = input.truth.application;
  if (paymentHistoricallyConfirmed(app)) {
    return "الدفع مؤكد إداريًا على طلبك، فما في داعي تعيد الدفع أو ترفع وصل جديد.";
  }
  const syntheticTurn: InterpretedTurn = {
    ...input.turn,
    rawText: "رفع وصل الدفع",
    topics: Array.from(new Set([...input.turn.topics, "receipt_upload", "payment_confirmation"])) as InterpretedTurn["topics"],
  };
  const links = buildOfficialLinkContext(syntheticTurn, input.truth);
  if (links.relevant.receipt) {
    return `وصلت الصورة على واتساب، لكن اعتماد وصل دفع رسوم فتح الملف لازم يكون من الرابط الرسمي المرتبط بالطلب، وما بنعتبر صورة واتساب رفعًا رسميًا:\n${links.relevant.receipt}`;
  }
  return "وصلت الصورة على واتساب، لكن ما رح أعتبرها رفع وصل رسمي أو تأكيد دفع. رابط الوصل المرتبط بطلبك مش متاح عندي هسا بشكل موثق، وما رح أعطيك رابط عام بدل الصحيح.";
}

function buildExpediteReply(truth: TruthBundle) {
  const app = truth.application;
  const paid = paymentHistoricallyConfirmed(app) ? " والدفع مؤكد إداريًا." : "";
  const status = app ? ` طلبك حالته ${customerFacingStatusLabel(app)}.${paid}` : "";
  return `وصلتني إنك طالب استعجال واضح.${status} ما رح أوعدك بموعد أو أقول إن الأولوية تغيرت قبل تنفيذ الإدارة فعليًا. أول ما يصدر قرار موثق بنبلغك.`;
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
  const foreignIdentity = /(?:سوري|سوريه|سورية|مصري|مصريه|مصرية|فلسطيني|فلسطينيه|فلسطينية|عراقي|عراقيه|عراقية|اجنبي|أجنبي|اجنبيه|أجنبية|غير\s+اردني|غير\s+أردني|جواز\s+سفر|اقامه|إقامة|رقم\s+الاقامه|رقم\s+الإقامة|رقم\s+قومي)/.test(q);
  const fieldProblem = /(?:الرقم\s+الوطني|national\s*id).{0,80}(?:10|١٠|عشر)|(?:14|١٤|اربعه\s+عشر|أربعة\s+عشر).{0,40}(?:رقم|خانه|خانة)|(?:لا\s+تقبل|ما\s+بتقبل|لا\s+استطيع|ما\s+بقدر|ما\s+عم\s+بقدر|مش\s+قادر).{0,70}(?:الطلب|التقديم|الخانه|الخانة|المعلومات|البيانات)/.test(q);
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
  return /(?:المستندات|الاوراق|الأوراق|المتطلبات|الشروط|كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب|الهويه|الهوية)/.test(normalized(value)) || generalRequirementsQuestionText(value);
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
  const commercialPause = commercialPauseOrDeclineText(turn.rawText, contextText(input.state, input.recentTurns));
  const explicitStop = explicitDoNotContinueText(turn.rawText) || commercialPause;
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

  if (dialogueSignals.commercialPause) {
    acts = acts.filter((a) => a.action !== "continue_application" && !["continuation","payment_method","payment_recipient","payment_timing","payment_fee","receipt_upload"].includes(a.topic));
  }

  if (dialogueSignals.orderChangeRetraction) {
    acts = acts.filter((a) => !["change_device","change_application_data"].includes(String(a.action || "")) && !["device_change","device_recalculation"].includes(a.topic));
    addAct(acts, turn, { type: "ask", topic: "application_correction", confidence: 0.997, action: "none", value: "order_change_retracted" });
  } else if (dialogueSignals.orderChange) {
    addAct(acts, turn, { type: "ask", topic: "application_correction", confidence: 0.997, action: "none", value: "order_change_request" });
  }

  if (dialogueSignals.multiDeviceEligibility) addAct(acts, turn, { type: "ask", topic: "products", confidence: 0.997, action: "none", value: "multiple_devices_eligibility" });
  if (dialogueSignals.productPriceStructure) addAct(acts, turn, { type: "ask", topic: "products", confidence: 0.997, action: "none", value: "product_price_structure" });

  // Phase 7.3.4: explicit "I do not have a previous application" is a routing veto.
  // Never let a weak model order_status/tracking label override what the customer just said.
  if (dialogueSignals.noPriorApplication) {
    acts = acts.filter((a) => !["application_status", "tracking"].includes(a.topic) && !["cancel_application", "request_refund", "reopen_application"].includes(String(a.action || "")));
  }

  if (dialogueSignals.applicationFormIssue || dialogueSignals.foreignApplicantFormIssue) {
    acts = acts.filter((a) => !["application_status", "tracking"].includes(a.topic));
    addAct(acts, turn, { type: "ask", topic: "website", confidence: 0.997, action: "none", value: dialogueSignals.foreignApplicantFormIssue ? "foreign_form_issue" : "application_form_issue" });
  }

  if (dialogueSignals.generalRequirements || dialogueSignals.financingStructure) {
    acts = acts.filter((a) => !["payment_method", "payment_recipient", "payment_timing", "payment_fee", "application_status", "tracking", "continuation"].includes(a.topic) && a.action !== "continue_application");
    addAct(acts, turn, { type: "ask", topic: "requirements", confidence: 0.997, action: "none", value: dialogueSignals.financingStructure ? "financing_structure" : "general_requirements" });
  }

  if (dialogueSignals.installmentAdjustment) {
    // Generic intent=payment must never reinterpret a monthly-installment question as
    // permission to expose the 5 JOD transfer path or as a continuation decision.
    acts = acts.filter((a) => !["payment_method", "payment_recipient", "payment_timing", "payment_fee", "receipt_upload", "payment_confirmation", "continuation"].includes(a.topic) && a.action !== "continue_application");
    addAct(acts, turn, { type: "ask", topic: "installment_amount", confidence: 0.997, action: "none", value: "installment_adjustment" });
  }

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

  if (paymentFailureOrDestinationProblemText(turn.rawText)) {
    addAct(acts, turn, { type: "ask", topic: "payment_method", confidence: 0.999, action: "none", value: "payment_failure_or_destination_problem" });
  }

  const identityContext = contextText(input.state, input.recentTurns);
  if (staffIdentityQuestionText(turn.rawText, identityContext)) {
    addAct(acts, turn, { type: "request_role", topic: "human_request", confidence: 0.999, action: "none", value: "staff_identity_question" });
  }
  if (feeNowOrPickupQuestionText(turn.rawText)) {
    addAct(acts, turn, { type: "ask", topic: "payment_timing", confidence: 0.999, action: "none", value: "file_opening_fee_timing" });
    addAct(acts, turn, { type: "ask", topic: "first_installment", confidence: 0.999, action: "none", value: "first_installment_timing" });
  }
  if (refundFeeQuestionText(turn.rawText)) {
    addAct(acts, turn, { type: "ask", topic: "refund", confidence: 0.999, action: "none", value: "file_opening_fee_refund_question" });
  }
  if (dataDeletionRequestText(turn.rawText) || dataDeletionConfirmationText(turn.rawText, input.state.lastAssistantText)) {
    addAct(acts, turn, { type: "ask", topic: "application_correction", confidence: 0.999, action: "none", value: "personal_data_deletion_request" });
  }
  if (explicitExpediteRequestText(turn.rawText)) {
    addAct(acts, turn, { type: "complaint", topic: "review_timing", confidence: 0.999, action: "none", value: "explicit_expedite_request" });
  }
  if (reviewDelayQuestionText(turn.rawText)) {
    addAct(acts, turn, { type: "ask", topic: "review_timing", confidence: 0.998, action: "none", value: "review_delay_question" });
  }
  if (genericDocumentLinkRequestText(turn.rawText, input.state, input.recentTurns) || guarantorNameOnlyQuestionText(turn.rawText)) {
    addAct(acts, turn, { type: "ask", topic: "requirements", confidence: 0.998, action: "none", value: "document_link_or_guarantor_detail" });
  }

  if (dialogueSignals.siteIssue) {
    addAct(acts, turn, { type: "ask", topic: "website", confidence: 0.995, action: "none", value: "site_issue" });
  }
  if (dialogueSignals.trackingLinkRequest) {
    addAct(acts, turn, { type: "ask", topic: "tracking", confidence: 0.995, action: "none", value: "tracking_link_request" });
  }
  if (dialogueSignals.refundMeaning) {
    addAct(acts, turn, { type: "ask", topic: "refund", confidence: 0.995, action: "none", value: "refund_meaning" });
  }
  if (dialogueSignals.continueAfterCancellation) {
    addAct(acts, turn, { type: "request_action", topic: "reopen", confidence: 0.995, action: "reopen_application", value: "customer_wants_resume_after_cancel" });
    if (/(?:الغي|وقف).{0,24}(?:مسار\s+)?(?:الاسترداد|الاسترجاع)/.test(normalized(turn.rawText))) {
      addAct(acts, turn, { type: "request_action", topic: "refund", confidence: 0.995, action: "stop_refund", value: "customer_requests_stop_refund" });
    }
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
    return `تمام، هيك بنكمّل. رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير فقط؛ منفصلة عن ثمن الجهاز والقسط الأول، ومستردة عبر المسار الرسمي إذا ألغيت بعد دفع مؤكد. ${currentFileOpeningPaymentRule()}${upload}\nتأكيد الدفع النهائي يتم يدويًا بعد مراجعة الوصل، والقسط الأول مش مطلوب الآن.`;
  }
  if (commercial === "no_application") return "تمام، فهمت إنك بدك تستمر، بس ما عندي طلب موثوق مربوط بالمحادثة الآن. ما رح أعطيك بيانات دفع قبل ربط الطلب الصحيح.";
  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_review") return "وصلت رغبتك بالاستمرار، لكن الطلب لسا بالمراجعة المبدئية. رسوم فتح الملف ما بتنفتح قبل صدور الموافقة المبدئية، لذلك ما في دفع مطلوب هسا.";
  return `رغبتك بالاستمرار واضحة. حالة الطلب الحالية ${customerFacingStatusLabel(app)}، لكن ما عندي خطوة مالية موثقة أقدر أفتحها على هالحالة. ما رح أطلب منك أي مبلغ قبل ما تكون الخطوة مثبتة على الطلب.`;
}

export function buildMandatoryFiveJodContinuationReply(turn: InterpretedTurn, truth: TruthBundle) {
  return continuationReply(turn, truth);
}

function normalizedReviewWindow(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل";
  return /المعدل\s+الطبيعي/.test(normalized(raw)) ? raw : `المعدل الطبيعي للمراجعة ${raw}`;
}

function explicitReceiptUploadConfirmationText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:رفعت|حملت|حمّلت|ارسلت|بعثت).{0,24}(?:وصل|اثبات\s+الدفع)|(?:وصل\s+دفع).{0,28}(?:رفعت|حملت|ارسلت|بعثت)|(?:ارغب|بدي).{0,25}(?:متابعه|تاكيد).{0,25}(?:الوصل|الدفع)/.test(q);
}

// Legacy Phase 7.1.6 invariant retained for compatibility: ما رح أدعي إني حولتك لموظف unless an actual transfer exists.
function reviewTimingReply(truth: TruthBundle, humanRequest: boolean) {
  const app = truth.application;
  const p = truth.policy;
  const state = app ? `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الآن ${customerFacingStatusLabel(app)}. ` : "";
  const human = humanRequest ? "أنا متابع معك من نفس الواتساب، وبعطيك الموجود فعليًا على الطلب بدون ما أوعدك بشي مش مؤكد. " : "";
  const payment = app && paymentHistoricallyConfirmed(app) ? "الدفع مؤكد إداريًا، وما في داعي تعيد الدفع أو ترفع الوصل. " : "";
  return `${human}${payment}${state}${normalizedReviewWindow(p.normalReviewWindow)}، لكن حاليًا ضغط المراجعات شديد وبعض الملفات بتتجاوز هالمدة. ما عندي موعد نهائي أقدر أضمنه.`;
}

export function shouldPrioritizeConversationRecovery(input: { turn: InterpretedTurn; state: ConversationState; recentTurns?: string[] }) {
  const signals = contextualTurnSignals({ turn: input.turn, state: input.state, recentTurns: input.recentTurns });
  return explicitDoNotContinueText(input.turn.rawText)
    || isNewApplicationFlow(input)
    || explicitContinuationText(input.turn.rawText)
    || contextualContinuationYes(input.turn, input.state, input.recentTurns)
    || foreignApplicantFormBlocker(input.turn.rawText)
    || showroomBrowsingRequest(input.turn.rawText)
    || explicitContactNumberChangeRequest(input.turn.rawText)
    || signals.siteIssue
    || signals.productAvailability
    || signals.noPriorApplication
    || signals.applicationFormIssue
    || signals.foreignApplicantFormIssue
    || signals.generalRequirements
    || signals.financingStructure
    || signals.installmentAdjustment
    || signals.commercialPause
    || signals.orderChange
    || signals.orderChangeRetraction
    || signals.multiDeviceEligibility
    || signals.mapLocationRequest
    || signals.managementInfoQuestion
    || signals.productPriceStructure
    || signals.punctuationOnly
    || signals.registrationQuestion
    || signals.contractingPartyQuestion
    || signals.safetyTrustQuestion
    || explicitReceiptUploadConfirmationText(input.turn.rawText)
    || paymentFailureOrDestinationProblemText(input.turn.rawText)
    || pureGreetingText(input.turn.rawText)
    || applicationStartQuestionText(input.turn.rawText)
    || legalThreatOrPublicEscalationText(input.turn.rawText)
    || additionalIncomeQuestionText(input.turn.rawText)
    || barePhoneNumberText(input.turn.rawText)
    || staffIdentityQuestionText(input.turn.rawText, input.state.lastCustomerText)
    || politeClosureText(input.turn.rawText)
    || feeNowOrPickupQuestionText(input.turn.rawText)
    || refundFeeQuestionText(input.turn.rawText)
    || dataDeletionRequestText(input.turn.rawText)
    || dataDeletionConfirmationText(input.turn.rawText, input.state.lastAssistantText)
    || explicitExpediteRequestText(input.turn.rawText)
    || customerOffersHomeAddressText(input.turn.rawText)
    || genericDocumentLinkRequestText(input.turn.rawText, input.state, input.recentTurns)
    || guarantorNameOnlyQuestionText(input.turn.rawText)
    || (whatsappImageMessageText(input.turn.rawText) && recentPaymentOrReceiptContext(input.state, input.recentTurns))
    || reviewDelayQuestionText(input.turn.rawText)
    || postContinuationAcknowledgementText(input.turn.rawText)
    || postContinuationPaymentDeferralText(input.turn.rawText)
    || reviewMeaningQuestionText(input.turn.rawText)
    || keepCurrentReviewDecisionText(input.turn.rawText)
    || signals.trackingLinkRequest
    || signals.refundMeaning
    || signals.continueAfterCancellation;
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
  const stopContinuation = explicitDoNotContinueText(raw) || commercialPauseOrDeclineText(raw, input.state.lastAssistantText);
  const continuation = !stopContinuation && !newApplication && !newApplicationContext && (explicitContinuationText(raw) || contextualContinuationYes(input.turn, input.state, input.recentTurns));
  const human = humanRequestText(raw);
  const dialogueSignals = contextualTurnSignals({ turn: input.turn, state: input.state, recentTurns: input.recentTurns });
  const identityContext = contextText(input.state, input.recentTurns);

  if (staffIdentityQuestionText(raw, identityContext)) {
    return buildStaffIdentityReply(input.state);
  }

  if (pureGreetingText(raw)) {
    return "أهلاً فيك، كيف أقدر أساعدك؟";
  }

  if (legalThreatOrPublicEscalationText(raw)) {
    const paid = paymentHistoricallyConfirmed(input.truth.application);
    const stage = applicationJourneyStage(input.truth.application);
    const status = input.truth.application ? ` حالة طلبك الحالية ${customerFacingStatusLabel(input.truth.application)}.` : "";
    const refund = paid ? " وإذا قررت الإلغاء فعليًا وكان الدفع مؤكد، مسار الاسترداد الرسمي يفتح بعد الإلغاء المؤكد." : "";
    const cancelled = stage === "cancelled" ? " الطلب ظاهر ملغي حاليًا." : "";
    return `فاهم إنك معترض ومتوتر من الموضوع.${status}${cancelled} إذا بدك تلغي، اطلب الإلغاء بشكل صريح وبطلب منك تأكيد منفصل قبل أي تنفيذ.${refund} التهديد أو الشكوى بحد ذاتها ما بعتبرها طلب إلغاء، وما رح أوعدك بشي غير منفذ.`;
  }

  if (dataDeletionConfirmationText(raw, input.state.lastAssistantText)) {
    return "تأكيدك واضح. حذف البيانات إجراء إداري منفصل عن إلغاء الطلب، وما رح أقول إن بياناتك انحذفت قبل ما يتم التنفيذ الفعلي.";
  }

  if (dataDeletionRequestText(raw)) {
    return "أكيد، حذف البيانات الشخصية إجراء منفصل عن إلغاء الطلب. إذا قصدك فعليًا حذف بياناتك من النظام، اكتب: نعم، أؤكد طلب حذف بياناتي. وما رح أقول إن الحذف تم قبل التنفيذ الإداري الفعلي.";
  }

  if (explicitExpediteRequestText(raw)) {
    return buildExpediteReply(input.truth);
  }

  if (customerOffersHomeAddressText(raw)) {
    return "ما في داعي تبعث عنوان بيتك على واتساب. إذا احتاج الطلب أي بيانات إضافية بنطلبها من المسار الرسمي المناسب، والحضور للمكتب نفسه بكون فقط بموعد رسمي مؤكد.";
  }

  if (refundFeeQuestionText(raw)) {
    return buildRefundFeeQuestionReply(input.truth);
  }

  if (feeNowOrPickupQuestionText(raw)) {
    return buildFeeTimingReply({ turn: input.turn, truth: input.truth });
  }

  if (additionalIncomeQuestionText(raw)) {
    if (!input.truth.application) {
      return "ممكن تطلب إضافة إثبات دخل إضافي، بس لازم يكون ضمن طلب فعلي ومن الرابط الرسمي المناسب؛ ما بنستلم إثباتات الدخل على واتساب. وما بقدر أضمن إن مصدر الدخل الإضافي يغيّر قرار الموافقة بحد ذاته.";
    }
    const syntheticTurn: InterpretedTurn = {
      ...input.turn,
      rawText: "رابط رفع كشف الراتب",
      topics: Array.from(new Set([...input.turn.topics, "requirements"])) as InterpretedTurn["topics"],
    };
    const docLinks = buildOfficialLinkContext(syntheticTurn, input.truth);
    return docLinks.relevant.salarySlip
      ? `ممكن تطلب إضافة إثبات دخل إضافي، بس ما بنعتبره مضاف من واتساب. ارفعه من الرابط الرسمي المرتبط بطلبك:
${docLinks.relevant.salarySlip}
وما بقدر أضمن إن المستند الإضافي يغيّر قرار الموافقة بحد ذاته.`
      : "ممكن تطلب إضافة إثبات دخل إضافي، بس ما بنعتبره مضاف من واتساب. رابط إثبات الدخل الإضافي مش متاح على حالة طلبك الحالية بشكل موثق، وما رح أختلق رابط أو أطلب منك تبعث المستند هون.";
  }

  if (barePhoneNumberText(raw) && input.truth.application) {
    return "وصل الرقم. ما رح أعتبره تغييرًا لرقم التواصل من مجرد إرساله؛ إذا قصدك تعديل الرقم المسجل على الطلب اطلب التغيير صراحةً، ولحد ما يتنفذ إداريًا بضل الرقم الموجود على الطلب هو المعتمد.";
  }

  if (genericDocumentLinkRequestText(raw, input.state, input.recentTurns)) {
    return buildDocumentLinkReply({
      turn: input.turn,
      state: input.state,
      truth: input.truth,
      recentTurns: input.recentTurns,
    });
  }

  if (guarantorNameOnlyQuestionText(raw)) {
    return "بيانات الكفيل مش شرط ثابت لكل طلب، وإذا انطلبت ما بقدر أأكد إن الاسم لحاله بكفي؛ بنعتمد فقط البيانات المطلوبة فعليًا على الملف ومن الرابط الرسمي الآمن.";
  }

  if (whatsappImageMessageText(raw) && recentPaymentOrReceiptContext(input.state, input.recentTurns)) {
    return buildReceiptImageReply({ turn: input.turn, truth: input.truth });
  }

  if (reviewDelayQuestionText(raw)) {
    return reviewTimingReply(input.truth, human);
  }

  if (applicationStartQuestionText(raw)) {
    const products = `${links.baseUrl}/products`;
    return `التقديم يبدأ من صفحة المنتجات الرسمية: اختار الجهاز وكمل طلب الموافقة المبدئية من هون:
${products}
بعد إرسال الطلب بيطلع لك رقم تتبع خاص فيه.`;
  }

  if (politeClosureText(raw)) {
    return "العفو، الله يعطيك العافية.";
  }

  if (dialogueSignals.contractingPartyQuestion || contractingPartyQuestionText(raw)) {
    return buildSafeContractingPartyReply();
  }

  if (dialogueSignals.registrationQuestion || registrationOrLicensingQuestionText(raw)) {
    return buildSafeRegistrationReply(input.truth.policy);
  }

  if (dialogueSignals.safetyTrustQuestion || safetyTrustQuestionText(raw)) {
    return buildSafeTrustReply(input.truth);
  }

  if (postContinuationStageOpen(input.truth) && postContinuationPaymentDeferralText(raw)) {
    return buildPostContinuationDeferralReply(raw);
  }

  if (postContinuationStageOpen(input.truth) && postContinuationAcknowledgementText(raw)) {
    return "تمام، الله يعطيك العافية.";
  }

  if (reviewMeaningQuestionText(raw)) {
    return buildReviewMeaningReply(input.truth);
  }

  if (paymentHistoricallyConfirmed(input.truth.application) && keepCurrentReviewDecisionText(raw)) {
    return buildKeepReviewReply(input.truth);
  }

  if (dialogueSignals.commercialPause || commercialPauseOrDeclineText(raw, input.state.lastAssistantText)) {
    return "تمام، بنخلي خطوة الاستمرار لبعدين. ما في دفع مطلوب هسا، وما رح أرسل تعليمات تحويل على قرار مؤجل. لما تقرر تكمل لاحقًا بنعتمد حالة الطلب وقتها بدون ضغط.";
  }

  if (paymentFailureOrDestinationProblemText(raw)) {
    return buildPaymentFailureRecoveryReply({
      turn: input.turn,
      truth: input.truth,
      receiptLink: links.relevant.receipt || null,
    });
  }

  if (dialogueSignals.orderChangeRetraction || orderChangeRetractionText(raw)) {
    return "تمام، فهمت إنك تراجعت عن التعديل. ما رح أعتبر أي لون أو جهاز تغيّر من المحادثة، والطلب يبقى على بياناته الحالية لحد ما يظهر تعديل فعلي موثق.";
  }

  if (dialogueSignals.orderChange || orderChangeRequestText(raw)) {
    const paid = paymentHistoricallyConfirmed(input.truth.application);
    const payment = paid ? " والدفع الحالي مؤكد إداريًا، فما في داعي تعيد الدفع أو ترفع الوصل لمجرد طلب التعديل." : "";
    return `ممكن تطلب تعديل اللون أو المواصفات، بس التعديل نفسه ما بنعتبره منفذ من المحادثة؛ يحتاج تنفيذ إداري على الطلب، والقيمة الحالية في الطلب بتظل هي المعتمدة لحد ما تتحدث فعليًا.${payment} إذا التعديل أثر على السعر أو الحسبة، بنعتمد الحسبة الجديدة فقط بعد ما تظهر رسميًا على الطلب.`;
  }

  if (dialogueSignals.multiDeviceEligibility || multipleDeviceEligibilityQuestionText(raw, input.state.lastCustomerText)) {
    return "ما بقدر أضمن موافقة على أكثر من جهاز أو على عدد معيّن مثل 4 أجهزة. كل طلب إضافي إله دراسة وموافقة مستقلة، وموافقة جهاز واحد ما تعني موافقة تلقائية على أجهزة ثانية.";
  }

  if (dialogueSignals.productPriceStructure || productPriceStructureQuestionText(raw)) {
    const products = links.relevant.products || "https://www.ameenfinance.co/products";
    return `بالنسبة للسعر المعروض وحسبة الأقساط، المرجع هو صفحة المنتج والحسبة اللي تظهر وقت التقديم؛ ما رح أفترض إن أي رقم ظاهر هو سعر نقدي أو إجمالي تقسيط إذا الصفحة نفسها ما وضحته. شوف تفاصيل الجهاز من هون:
${products}`;
  }

  if (dialogueSignals.mapLocationRequest || mapLocationRequestText(raw)) {
    return `ما عندي رابط خريطة رسمي موثق أبعثه، وما رح أرسل رابط الموقع الإلكتروني كأنه موقع على الخريطة. العنوان العام المتاح هو ${input.truth.policy.generalLocation}، والحضور للمكتب فقط بموعد رسمي مؤكد.`;
  }

  if (dialogueSignals.managementInfoQuestion || managementInfoQuestionText(raw)) {
    return "إذا قصدك اسم المدير أو المسؤول الإداري/المالي، ما عندي اسم رسمي موثق ومخوّل أذكره بالمحادثة. بقدر أكمل معك على طلبك من نفس واتساب وأعطيك فقط المعلومات المؤكدة على الملف.";
  }

  if (dialogueSignals.punctuationOnly || punctuationOnlyTurnText(raw)) {
    return "أنا معك.";
  }

  if (dialogueSignals.foreignApplicantFormIssue || foreignApplicantGeneralFormIssueText(raw)) {
    return "فهمت: المشكلة صارت أثناء تعبئة الطلب لأن بياناتك غير أردنية أو النموذج ما قبل بعض الخانات. لا تدخل بيانات غير صحيحة ولا تستبدل الرقم الوطني برقم جواز/إقامة من عندك. ما عندي مسار بديل موثق خارج النموذج أقدر أضمنه؛ ابعث اسم الخانة اللي واقفة أو نص رسالة الخطأ/صورة الشاشة، وبنحدد المشكلة نفسها بدون ما أطلب رقم تتبع لأن الطلب لسا ما اكتمل.";
  }

  if (dialogueSignals.applicationFormIssue || applicationFormIssueText(raw, input.state.lastAssistantText)) {
    return "واضح إن المشكلة أثناء تعبئة الطلب قبل ما يكتمل، لذلك ما بحتاج منك رقم تتبع. لا تعيد إدخال بيانات عشوائية. ابعث نص رسالة الخطأ أو اسم الخانة اللي بتوقف عندها، وإذا عندك صورة للشاشة ابعثها وبنركز على سبب توقف النموذج نفسه.";
  }

  if (dialogueSignals.financingStructure || financingStructureQuestionText(raw)) {
    return "التقسيط عند الأمين للأقساط مش قرض بنكي من جهتنا. التقديم بيكون مباشرة على طلب الجهاز عبر الموقع، وبعدها الملف بيمر بالمراجعة حسب الشروط. من الأساسيات الهوية وإثبات الدخل، وبيانات الكفيل ممكن تُطلب حسب حالة الملف فقط؛ والمستندات الحساسة بتنرفع من الرابط الرسمي الآمن، مش واتساب.";
  }

  if (dialogueSignals.generalRequirements || generalRequirementsQuestionText(raw)) {
    return "الهوية وإثبات الدخل من المتطلبات الأساسية. بيانات الكفيل مش شرط ثابت لكل طلب، وإذا انطلبت بنطلب البيانات المطلوبة حسب حالة الملف وما بقدر أأكد إن اسم الكفيل لحاله بكفي. وأي مستند حساس بنستلمه فقط من الرابط الرسمي الآمن، مش عبر واتساب.";
  }

  if (dialogueSignals.installmentAdjustment || installmentAdjustmentQuestionText(raw)) {
    return "إذا قصدك تدفع مبلغ أكبر من القسط الشهري أو دفعة أكبر أو أكثر من قسط مرة وحدة: ما عندي سياسة موثقة أقدر أقول منها إنك تختار دفعة أولى عالية أو إن المبلغ الإضافي يخفض سعر الجهاز تلقائيًا. القاعدة المؤكدة إن القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد، وأي تغيير بالحسبة أو آلية السداد لازم يكون مثبتًا على الطلب أو بالعقد. وسؤالك هذا مش عن رسوم فتح الملف، لذلك ما رح أخلطه معها.";
  }

  if (dialogueSignals.noPriorApplication || explicitNoPriorApplicationText(raw)) {
    const products = links.relevant.products || "https://www.ameenfinance.co/products";
    return `تمام، بما إنه ما عندك طلب سابق ما بحتاج منك رقم تتبع. إذا بدك تبدأ طلب جديد، ابدأ من صفحة المنتجات الرسمية واختار الجهاز وكمل نموذج التقديم:
${products}
وإذا المشكلة إن النموذج ما بكمل، احكيلي اسم الخانة أو رسالة الخطأ بدل رقم التتبع.`;
  }

  if (dialogueSignals.trackingLinkRequest) {
    if (links.relevant.tracking) return `أكيد، هذا رابط التتبع الرسمي لطلبك:
${links.relevant.tracking}`;
    return "فاهم إنك بدك رابط التتبع. ما عندي رابط مرتبط بطلب موثوق هسا، وما رح أعطيك رابط عام ممكن يوديك لطلب غلط.";
  }

  if (dialogueSignals.siteIssue) {
    const products = links.relevant.products || "https://www.ameenfinance.co/products";
    return `فهمتك؛ المشكلة اللي بتحكي عنها بالموقع نفسه، مش إنك أرسلت مستند. جرّب تفتح صفحة المنتجات الرسمية مباشرة من المتصفح:
${products}
إذا ظل نفس الخطأ ظاهر، ابعثلي نص رسالة الخطأ أو صورة الشاشة وبجاوبك على المشكلة نفسها بدون ما أطلب منك رقم تتبع إذا ما عندك طلب.`;
  }

  if (dialogueSignals.productAvailability) {
    const products = links.relevant.products || "https://www.ameenfinance.co/products";
    return `إذا سؤالك عن توفر موديل أو سعره الحالي، المرجع هو صفحة المنتجات الرسمية لأن التوفر والأسعار ممكن يتغيروا. شوف الموجود والسعر المحدث من هون:
${products}`;
  }

  if (explicitReceiptUploadConfirmationText(raw)) {
    const app = input.truth.application;
    const commercial = continuationCommercialState(app);
    if (paymentHistoricallyConfirmed(app) || commercial === "already_paid") return "تمام، الدفع مؤكد إداريًا على طلبك، وما في عليك أي دفعة أو وصل جديد. الملف مكمل حسب مرحلته الحالية.";
    if (commercial === "payment_pending_admin" || app?.documents?.paymentReceiptUploaded) return "تمام، وصل الدفع موجود على ملفك وبانتظار مراجعة الإدارة. ما في داعي تعيد الدفع أو ترفع الوصل مرة ثانية؛ أول ما يتم اعتماده بتتحدث حالة الطلب.";
    return "تمام، وصلتني متابعتك بخصوص الوصل. تأكيد الدفع النهائي يتم يدويًا بعد مراجعة الإثبات المرفوع من الرابط الرسمي، وما رح أعتبر الدفع مؤكد قبل ما يظهر الاعتماد على الملف.";
  }

  if (dialogueSignals.refundMeaning) {
    const stage = applicationJourneyStage(input.truth.application);
    if (stage === "refund_requested") return "الاسترداد يعني إن الطلب ما عاد ماشي حاليًا كطلب تقسيط عادي، ومسار إرجاع المبلغ المدفوع مفتوح وقيد المعالجة. إذا إنت ما كنت تقصد الإلغاء وبدك تكمل بالجهاز، لازم يتوقف الاسترداد ويُعاد فتح الطلب إداريًا؛ ما رح أقول إنه رجع شغال قبل ما تتحدث الحالة فعليًا.";
    return "الاسترداد هو مسار إرجاع مبلغ مدفوع بعد إلغاء أو توقف الطلب. إذا سؤالك عن سبب ظهوره على طلبك، بعتمد الحالة الفعلية المسجلة وما بخمّن بسبب مش موثق.";
  }

  if (dialogueSignals.continueAfterCancellation && applicationJourneyStage(input.truth.application) === "refund_requested") {
    return "فهمتك: إنت ما بدك الإلغاء وبدك تكمل بالجهاز. حسب الحالة الفعلية هسا الطلب غير مستمر ومسار الاسترداد مفتوح. إعادة فتح الطلب وإيقاف الاسترداد يحتاجان تنفيذًا إداريًا، وما رح أقول إن الطلب رجع شغال إلا بعد ما تتحدث الحالة فعليًا.";
  }

  if (stopContinuation) {
    return "تمام، ما في أي إلزام عليك تكمل، وما رح أفتح خطوة دفع أو أرسل تعليمات 5 دنانير طالما قرارك إنك ما بدك تستمر. إذا غيرت رأيك لاحقًا، بنمشي من الحالة الفعلية للطلب وقتها.";
  }

  if (foreignApplicantFormBlocker(raw)) {
    return "فهمت المشكلة بالضبط. إذا النموذج يطلب رقمًا وطنيًا أردنيًا وأنت ما عندك الرقم المطلوب، ما عندي مسار بديل موثق أقدر أطلب منك تحط فيه رقم الجواز أو الإقامة أو أي رقم أجنبي مكانه. لا تختصر الرقم ولا تغيّره حتى يمر النموذج. ابعث اسم الخانة أو رسالة الخطأ نفسها، وبنحدد المشكلة بدون ما نخترع طريقة غير معتمدة.";
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
