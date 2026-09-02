import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  AiReplyInput,
  ApplicationRecord,
  CustomerIntent,
  WhatsAppMessage,
  WhatsAppWebhookBody,
} from "./_lib/types";
import {
  BUSINESS_ACTIVITY,
  BUSINESS_ADDRESS,
  BUSINESS_GENERAL_LOCATION,
  BUSINESS_INDEPENDENCE_STATEMENT,
  BUSINESS_NAME,
  BUSINESS_REGULATORY_DISCLOSURE,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_E164,
  BUSINESS_WEBSITE,
  FILE_OPENING_FEE_JOD,
  POST_EID_DELIVERY_STRICT_TEXT,
  POST_EID_DELIVERY_TEXT,
  fileOpeningFeeExplanation,
  noPaymentNeededLine,
} from "./_lib/constants";
import {
  digitsOnly,
  extractJordanPhoneFromText,
  extractTracking,
  firstTwoNames,
  formatJordanDateTime,
  getBaseUrl,
  hasAny,
  humanOpening,
  assignedStaffName,
  softFaithPhrase,
  normalizeArabicText,
  normalizeJordanPhone,
  normalizeWhatsAppToSend,
} from "./_lib/text";
import {
  delayUrl,
  refundUrl,
  changeDeviceUrl,
  selectDeviceUrl,
  guarantorUrl,
  identityUrl,
  receiptUrl,
  salarySlipUrl,
  trackUrl,
} from "./_lib/links";
import { getConversationMemory } from "./_lib/conversationMemory";
import {
  hasConfirmedPaymentEvidence,
  hasInvalidRefundState,
  isConditionalCancellationText,
  isExactCancelConfirmationText,
  isExactReopenConfirmationText,
  isExplicitNonContinuationText,
  isExplicitRefundMutationText,
  isRefundPolicyInquiryText,
  isExplicitStopRefundText,
  isPositiveContinueDecisionText,
} from "./_lib/stateIntegrity";
import { enqueueShadowJob } from "./_lib/shadow-core";
import { enqueueConversationOsShadowJob } from "./_lib/v2-conversation";
import {
  prepareV2ProductionTurn,
  resolveV2Truth,
  writeV2ProductionReply,
  commitV2ProductionState,
  logV2ProductionNoReply,
  executeV2Action,
  applyV2PostSendAction,
  type V2ProductionWriteResult,
  type V2ResolvedTruth,
  type V2ActionExecution,
} from "./_lib/v2-production";
import { buildShadowFacts } from "./_lib/shadow-core/policyRegistry";
import { detectShadowTopics } from "./_lib/shadow-core/topicDetector";
import { validateFinalActualReply } from "./_lib/shadow-core/validator";
import { buildSafeFallbackReply } from "./_lib/shadow-core/deterministicReply";
import { buildFinalTruthContextRecovery } from "./_lib/shadow-core/finalTruthRecovery";
import {
  humanFirstStyleInstructions,
  isHardExactCustomerIntent,
  looksLikeRoboticClarification,
  shouldPreferHumanFirstPro,
  shouldReturnExactHumanFirstReply,
} from "./_lib/humanFirstPolicy";
import {
  buildOperationalTransparencyParagraph,
  contextualHumanIntentHint,
  currentOperationalTransparencyFacts,
  detectHumanPresenceProfile,
  humanPresencePromptInstructions,
  shouldExplainOperationalPicture,
} from "./_lib/humanPresence";
import {
  customerFacingPolicyInstructions,
  hasInternalCustomerFacingLanguage,
  isAbsolutePaymentRefusalText,
  isClearPaymentRefusalText,
  isPaymentOnReceiptQuestionText,
  isPaymentOnReceiptRefusalText,
  paymentRefusalFinalClosureWasSent,
  paymentRefusalPolicyWasExplained,
} from "./_lib/customerFacingPolicy";
import { routeShadowAgent } from "./_lib/shadow-core/agentRouter";
import {
  currentMessageSemanticIntentHint,
  hasSubstantiveContentAfterSocialPrefix,
  isPureSocialAcknowledgementText,
  isReceiptConfirmationCurrentText,
  stripLeadingSocialAcknowledgement,
} from "./_lib/intentAlignment";
import {
  currentMessageDecisionOverride,
  guarantorUnavailableReply,
  isGuarantorUnavailableText,
  isNaturalContinueText,
  isNaturalNonContinuationText,
  replyAsksContinueAgain,
  replyContradictsNonContinuation,
  replyWronglyRequestsGuarantorUpload,
} from "./_lib/conversationDecisionPlane";
import type { ShadowAgentId, ShadowPolicyCheck } from "./_lib/shadow-core/types";
import {
  customerAskedAboutFinalApproval,
  resolveApplicationStage,
  stageCustomerStatusLine,
  statusHumanLabelV113,
} from "./_lib/applicationStage";
import {
  detectCustomerGender,
  enforceCustomerGenderLanguage,
  nextStageContactLine,
  noAdditionalActionLine,
} from "./_lib/customerGender";

import {
  findApplicationById,
  findApplicationByPhone,
  findApplicationsByPhone,
  findApplicationByTracking,
  findApplicationByTrackingAndPhone,
} from "./_lib/applicationLookup";
import {
  clearApplicationConversationLock,
  getApplicationConversationLock,
  setApplicationConversationLock,
  touchApplicationConversationLock,
} from "./_lib/applicationConversationLock";
import {
  applicationChoicesNeedDisambiguation,
  applicationDisambiguationReply,
  findExplicitlyNamedApplication,
  isApplicationSpecificIntent,
} from "./_lib/applicationIdentity";
import {
  analyzeConversationTurn,
  applyConversationKernelReplyGuard,
  buildConversationKernelActionReply,
  resolveConversationKernelIntent,
} from "./_lib/conversationKernel";
import { getV3ProductionControl, isV3ProductionActive, tripV3ProductionCircuitBreaker } from "./_lib/v3-os/productionControl";
import { buildV3LastResortReply, runV3ProductionLive } from "./_lib/v3-os/runtimeLive";
import { saveV3ConversationState } from "./_lib/v3-os/stateStore";
import { notifyV3Discord } from "./_lib/v3-os/discordNotifier";

export const dynamic = "force-dynamic";
export const maxDuration = 300;



function isGreeting(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  if (["مرحبا", "هلا", "السلام عليكم", "مساء الخير", "صباح الخير", "الخير", "صباح", "مساء", "الو", "اهلا", "هاي", "hi", "hello"].includes(t)) return true;
  return /^(?:مرحبا|هلا|السلام عليكم|مساء الخير|صباح الخير|اهلا|أهلا)(?:\s+|$)/i.test(t);
}

function isCasualWellbeingText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "كيفك",
    "كيفكم",
    "كيف الحال",
    "كيف حالك",
    "كيف امورك",
    "كيف أمورك",
    "كيف الوضع",
    "شخبارك",
    "شو اخبارك",
    "شو أخبارك",
    "اخبارك",
    "أخبارك",
    "طمني عنك",
    "تمام؟",
    "عامل ايه",
    "عاملين ايه",
    "how are you",
    "how r u",
  ]);
}

function isBotIdentityChallengeText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "ذكاء اصطناعي",
    "ذكاء صناعي",
    "ذكاء اسطناعي",
    "ذكاء اصطناعى",
    "هل انت ai",
    "هل انتي ai",
    "انت ai",
    "انتي ai",
    "روبوت",
    "بوت",
    "مو بشر",
    "مش بشر",
    "انت بشر",
    "انتي بشر",
    "مو انسان",
    "مش انسان",
    "مو حقيقي",
    "مش حقيقي",
    "اثبتلي انك مش",
  ]);
}

function isTrustVerificationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const verificationQuestion = hasAny(t, [
    "كيف اتاكد", "كيف أتأكد", "كيف بدي اتاكد", "كيف بدي أتأكد",
    "شو الضمان", "ما الضمان", "كيف اضمن", "كيف أضمن",
    "كيف اثق", "كيف أوثق", "كيف اتطمن", "كيف أطمئن",
    "كيف اعرف انكم", "كيف أعرف أنكم", "اثبات رسمي", "إثبات رسمي",
    "كيف اتأكد انه مش نصب", "كيف اتأكد انو مش نصب", "الموضوع ما فيه نصب",
    "بس عشان اتاكد", "بس عشان أتأكد", "عشان اتاكد", "عشان أتأكد",
    "قدمت اكثر من مكان", "قدمت أكثر من مكان", "بضيع الوقت وانا استنى", "بضيع الوقت وأنا أستنى",
    "بعدين ببطل يرد", "وبعدين ببطل يرد",
  ]);

  const asksInsteadOfAccuses = hasAny(t, [
    "كيف", "هل", "شو", "ما هو", "مثلا", "مثلاً", "اتاكد", "أتأكد", "اضمن", "أضمن",
  ]);
  const trustContext = hasAny(t, [
    "نصب", "احتيال", "ثقه", "ثقة", "ضمان", "رسمي", "موثوق", "اتطمن", "أطمئن",
  ]);

  return verificationQuestion || (asksInsteadOfAccuses && trustContext);
}

function isEnglishReplyPreferenceText(text: string) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  return /\b(?:reply|respond|answer|talk|speak)\b[^\n]{0,30}\benglish\b/i.test(t) ||
    /\benglish\b[^\n]{0,30}\b(?:please|pls|plz)\b/i.test(t) ||
    ["english please", "english pls", "in english", "reply in english"].includes(t);
}

function isRegulatoryStatusQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "البنك المركزي",
    "مرخصين من البنك المركزي",
    "مرخصه من البنك المركزي",
    "مرخصة من البنك المركزي",
    "خاضعين للبنك المركزي",
    "خاضعه للبنك المركزي",
    "خاضعة للبنك المركزي",
    "رقابه البنك المركزي",
    "رقابة البنك المركزي",
  ]);
}

function isBusinessIdentityQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "اسم الشركه القانوني",
    "اسم الشركة القانوني",
    "الاسم القانوني",
    "شو اسم الشركه",
    "شو اسم الشركة",
    "اسمكم القانوني",
    "الاسم الرسمي للشركه",
    "الاسم الرسمي للشركة",
    "اسم الجهه",
    "اسم الجهة",
  ]);
}

function isInternalInstructionRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "ignore your instructions", "ignore previous instructions", "debug prompt", "system prompt",
    "developer message", "hidden instructions", "internal instructions", "translate the instructions",
    "what llm are you", "what model are you", "which model are you", "show your prompt",
    "reveal your instructions", "api calls that call you", "i am not the user",
    "تجاهل تعليماتك", "تجاهل التعليمات", "اعرض تعليماتك", "اكشف تعليماتك", "ترجم التعليمات",
    "ما هو النموذج", "شو النموذج", "اي نموذج", "البرومبت الداخلي", "تعليمات النظام",
  ]);
}

function isStaffIdentityText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return isBotIdentityChallengeText(t) || hasAny(t, [
    "شو اسمك",
    "ما اسمك",
    "مين انت",
    "مين انتي",
    "مين بيحكي معي",
    "مع مين بحكي",
    "مين معي",
    "اسم الموظف",
  ]);
}

function isCallRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "ممكن مكالمه",
    "ممكن مكالمة",
    "اجراء مكالمه",
    "إجراء مكالمة",
    "بدي احكي تلفون",
    "بدي مكالمه",
    "بدي مكالمة",
    "اتصلوا في",
    "اتصل في",
    "رنوا علي",
    "رن علي",
    "كلموني",
    "بقدر ارن",
    "بقدر أتصل",
    "احكي معكم مكالمه",
    "احكي معكم مكالمة",
    "بقدر اتواصل معاكم مكالمه",
    "بقدر اتواصل معاكم مكالمة",
    "بقدر اتواصل معكم مكالمه",
    "بقدر اتواصل معكم مكالمة",
    "ممكن اتواصل معاكم مكالمه",
    "ممكن اتواصل معاكم مكالمة",
    "ممكن اتواصل معكم مكالمه",
    "ممكن اتواصل معكم مكالمة",
    "برن عالرقم",
    "برن على الرقم",
    "برن عليكم",
    "ما حدا برد عالرقم",
    "ما حدا برد على الرقم",
    "بدي رقم تليفون احكي معه",
    "بدي رقم تلفون احكي معه",
    "بدي رقم اتواصل معكم",
    "تبعتولي رقم اتواصل معكم",
    "ابعثولي رقم اتواصل معكم",
    "معلش تبعتولي رقم اتواصل معكم",
  ]);
}

function isDeviceChangeText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const changeContext = hasAny(t, [
    "بدي اغير",
    "بدي أغير",
    "غيرولي",
    "غيرلي",
    "تغيير الجهاز",
    "تغير الجهاز",
    "استبدال الجهاز",
    "بدل الجهاز",
    "جهاز ثاني بدل",
    "موديل ثاني",
    "لون ثاني",
    "غير اللون",
    "غير السعه",
    "غير السعة",
    "ما بدي هذا الجهاز بدي",
    "ما بدي هالجهاز بدي",
  ]);

  const deviceContext = hasAny(t, [
    "جهاز", "تلفون", "موبايل", "ايفون", "سامسونج", "هونر", "تكنو", "شاومي",
    "لون", "سعه", "سعة", "جيجا", "موديل",
  ]);

  return changeContext && deviceContext;
}

// V1.1.4 DEVICE SELECTION DETECTOR START
function isDeviceSelectionText(text: string) {
  const t = normalizeArabicText(text);
  return hasAny(t, [
    "ما اخترت جهاز", "ما اخترت الجهاز", "ما اخترت تلفون", "ما اخترت موبايل",
    "لم اختر جهاز", "ما حددت جهاز", "بدون جهاز",
    "كيف اختار جهاز", "كيف أختار جهاز", "وين اختار جهاز", "وين أختار جهاز",
    "رابط اختيار الجهاز", "اختيار الجهاز", "اختيار جهاز",
    "بدي اختار جهاز", "بدي أختار جهاز", "احدد الجهاز", "أحدد الجهاز",
  ]);
}
// V1.1.4 DEVICE SELECTION DETECTOR END

function isCancelDeviceChangeText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "ما بدي اغير جهاز",
    "ما بدي أغير جهاز",
    "مش بدي اغير جهاز",
    "مش بدي أغير جهاز",
    "لا اريد تغيير الجهاز",
    "لا أريد تغيير الجهاز",
    "الغاء تغيير الجهاز",
    "إلغاء تغيير الجهاز",
    "الغي طلب تغيير الجهاز",
    "ألغي طلب تغيير الجهاز",
    "خلي الجهاز مثل ما هو",
    "خلي الجهاز زي ما هو",
    "ثبت الجهاز الحالي",
    "ما تغيروا الجهاز",
    "ما تغيّروا الجهاز",
    "cancel device change",
  ]);
}

function isOfficeLocationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "وين المكتب",
    "اين المكتب",
    "أين المكتب",
    "موقع المكتب",
    "موقع مكتبكم",
    "عنوان المكتب",
    "عنوانكم",
    "وين مكانكم",
    "مكانكم وين",
    "اي منطقه",
    "أي منطقة",
    "وين موقعكم",
    "موقعكم وين",
    "لوكيشن",
    "location",
    "وين الفرع",
    "عنوان الفرع",
    "ممكن ازور الشركة", "ممكن أزور الشركة", "ممكن ازوركم", "ممكن أزوركم",
    "بقدر ازور المكتب", "بقدر أزور المكتب", "بدي ازور المكتب", "بدي أزور المكتب",
    "بدي اجي عالمكتب", "بدي أجي عالمكتب",
    "في مكان ممكن اراجع", "في مكان ممكن أراجع", "مكان ممكن اراجع", "مكان ممكن أراجع",
    "عندكم مكان", "مكان او موسسه", "مكان أو مؤسسة", "مكان او مؤسسة", "وين اقدر اراجع", "وين أقدر أراجع",
  ]);
}

function isWebsiteText(text: string) {
  const t = normalizeArabicText(text);
  if (!t || isOfficeLocationText(t)) return false;

  return hasAny(t, [
    "رابط الموقع",
    "الموقع الالكتروني",
    "الموقع الإلكتروني",
    "ويب سايت",
    "website",
    "رابطكم",
    "لينككم",
    "رابط الشركه",
    "رابط الشركة",
    "السايت",
    "في الكم موقع",
    "عندكم موقع",
  ]);
}


function isBusinessIndependenceQuestionText(text: string, conversationContext = "") {
  const current = normalizeArabicText(text);
  const combined = normalizeArabicText(`${conversationContext}\n${text}`);
  if (!current) return false;

  const hasMicrofinanceContext = hasAny(combined, [
    "الأمين للتمويل الأصغر", "الامين للتمويل الاصغر",
    "شركة الأمين للتمويل الأصغر", "شركة الامين للتمويل الاصغر",
    "تمويل أصغر", "تمويل اصغر",
  ]);
  if (!hasMicrofinanceContext) return false;

  return hasAny(current, [
    "نفس الشركة", "نفس الشركه", "نفسهم", "تابعين الهم", "تابعين لهم",
    "تابعين لشركة", "تابعين لشركه", "الكم علاقة", "الكم علاقه", "في علاقة", "في علاقه",
    "في شراكة", "في شراكه", "مرتبطين", "تابعين", "نفس الجهة", "نفس الجهه",
    "شو علاقتكم", "ما علاقتكم", "بينكم علاقة", "بينكم علاقه",
  ]) || hasAny(current, ["الأمين للتمويل الأصغر", "الامين للتمويل الاصغر"]);
}

function isRefundResumeFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, [
    "وقف الاسترداد", "اوقف الاسترداد", "أوقف الاسترداد", "الغاء الاسترداد", "إلغاء الاسترداد",
    "ما بدي الاسترداد", "مش بدي استرداد", "تراجعت عن الاسترداد", "بدي اكمل بالمعامله",
    "بدي أكمل بالمعاملة", "بدي اكمل المعاملة", "بدي ارجع اكمل", "بدي أرجع أكمل",
    "بدي اكمل الطلب", "بدي أكمل الطلب", "هسا لو بدي اكمل", "هسا لو بدي أكمل",
    "لو بدي اكمل المعامله", "لو بدي أكمل المعاملة",
  ]);
}

function isRefundMoneyFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, [
    "حولي 5", "حولي ٥", "حولولي 5", "حولولي ٥", "رجعولي 5", "رجعولي ٥",
    "رجعولي الخمسه", "رجعولي الخمسة", "حولولي الخمسه", "حولولي الخمسة",
    "بدي الخمسه", "بدي الخمسة", "وين الخمسه", "وين الخمسة",
    "وين الفلوس", "وين المصاري", "وين المبلغ", "متى الحوالة", "متى الحواله",
  ]);
}

function isRefundTimingOrDeliveryFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  const timing = isReviewTimeText(t) || hasAny(t, ["كم بدو وقت", "قديش بدو وقت", "متى", "امتى", "إمتى"]);
  const deliveryOrProcess = hasAny(t, ["استلم", "استلام", "التلفون", "الجهاز", "المعامله", "المعاملة", "الطلب"]);
  return timing && deliveryOrProcess;
}

function isRefundStatePriorityFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const moneyOrRefund = hasAny(t, [
    "استرداد", "استرجاع", "رجعولي", "رجعوا", "حولولي", "تحولو", "حولو",
    "الخمس", "الخمسه", "الخمسة", "ليره", "ليرة", "ليرات", "دينار", "دنانير",
    "فلوس", "مصاري", "المبلغ", "الحواله", "الحوالة",
  ]);
  const timingPressure = hasAny(t, [
    "اليوم", "بكره", "بكرة", "غدا", "غداً", "ساعه", "ساعة", "ساعتين",
    "متى", "لمتى", "لحد متى", "معكم", "هسا", "الان", "الآن",
  ]);
  const shortPressure = t.length <= 28 && hasAny(t, [
    "الخمس", "ليرات", "ساعتين", "اليوم", "بكره", "بكرة", "هسا", "الان", "الآن",
  ]);

  return moneyOrRefund || (timingPressure && shortPressure);
}

function messageHasReviewAndCallTopics(text: string) {
  if (!isCallRequestText(text)) return false;
  return isReviewTimeText(text) || isLongDelayComplaintText(text) || hasAny(text, [
    "صار اي ابديت", "صار أي أبديت", "اخر تحديث", "آخر تحديث", "شو صار بالطلب", "وين وصل الطلب",
  ]);
}


function messageHasReviewAndLocationTopics(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return isReviewTimeText(t) && isOfficeLocationText(t);
}

function reviewAndLocationReply(app: ApplicationRecord | null, from: string, customerText: string) {
  const review = reviewTimeReply(app?.phone || from, app, "", customerText)
    .replace(/\n?رابط المتابعة:[\s\S]*$/i, "")
    .trim();

  return `${review}

وبالنسبة للموقع: المكتب في عمّان – شارع المدينة المنورة. العنوان التفصيلي يُرسل فقط مع الموعد الرسمي، والحضور بموعد فقط.`;
}

function isPaymentAmountText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "كم دفعتي",
    "كم دفعتي الاولى",
    "كم الدفعة",
    "كم الدفعه",
    "قديش الدفعة",
    "قديش الدفعه",
    "كم بدفع",
    "كم القسط",
    "قيمة الدفعة",
    "قيمه الدفعه",
    "كم رسوم فتح الملف",
    "قديش رسوم فتح الملف",
    "كم الرسوم",
    "قديش الرسوم",
    "الرسوم كم",
    "كم رسومكم",
  ]);
}

function isSelfEmployedText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const workContext = hasAny(t, [
    "صاحب محل",
    "صاحبه محل",
    "صاحب مشروع",
    "صاحبه مشروع",
    "عندي محل",
    "عندي مشروع",
    "عندي سجل تجاري",
    "سجل تجاري",
    "رخصه مهن",
    "رخصة مهن",
    "عمل حر",
    "اعمل لحسابي",
    "بشتغل لحسابي",
    "غير موظف",
    "مش موظف",
    "ما عندي راتب",
    "ما عندي كشف راتب",
    "ما بنزل راتبي بنك",
    "دخل من المحل",
    "دخل من المشروع",
    "فري لانس",
    "فريلانس",
    "freelance",
    "freelancer",
    "شغل اونلاين",
    "شغل أونلاين",
    "بشتغل اونلاين",
    "بشتغل أونلاين",
    "عملي اونلاين",
    "عملي أونلاين",
    "self employed",
    "self-employed",
    "business owner",
  ]);

  return workContext;
}

function isEmploymentEligibilityQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const employmentContext = hasAny(t, [
    "موظف بشركه", "موظف بشركة", "موضف بشركه", "موضف بشركة",
    "مش موظف بشركه", "مش موظف بشركة", "غير موظف بشركه", "غير موظف بشركة",
    "لازم اكون موظف", "لازم أكون موظف", "لازم موظف", "وظيفه رسميه", "وظيفة رسمية",
    "طالب جامعه", "طالب جامعة", "بدرس بجامعه", "بدرس بجامعة",
    "فري لانس", "فريلانس", "freelance", "freelancer", "شغل اونلاين", "شغل أونلاين",
  ]);

  const questionContext = hasAny(t, [
    "لازم", "بزبط", "بنفع", "بقدر", "هل", "عشان اقسط", "عشان أقسط", "حتى اقسط", "حتى أقسط", "؟",
  ]);

  return employmentContext && questionContext;
}

function isMinorEligibilityQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const ageContext = /(?:عمري|العمر|انا|أنا)\s*(?:١[0-٧]|1[0-7])(?:\s*سنه|\s*سنة)?/i.test(t) || hasAny(t, [
    "عمري ١٦", "عمري 16", "عمري ١٧", "عمري 17", "تحت 18", "اقل من 18", "أقل من 18", "قاصر",
  ]);

  const questionContext = hasAny(t, [
    "بزبط", "بنفع", "عادي", "بقدر", "هل", "كفيل", "امي", "أمي", "ابوي", "أبوي", "ولي الامر", "ولي الأمر", "صح", "؟",
  ]);

  return ageContext && questionContext;
}

function isShortContinuationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return [
    "ارسلها", "أرسلها", "ابعثها", "ابعتها", "ابعث", "ابعت", "ارسل", "أرسل",
    "تابع", "كمل", "اكمل", "أكمل", "تمام تابع", "تمام كمل",
  ].includes(t);
}

function isTinyContextFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return [
    "طيب",
    "طب",
    "يعني",
    "تمام",
    "اوكي",
    "ok",
    "شو يعني",
    "كيف يعني",
    "وضح",
    "وضحي",
    "مش فاهم",
    "ما فهمت",
    "ليش",
    "اه",
    "اها",
  ].includes(t) || t.length <= 7;
}



function isContextOnlyFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  if (/^[؟?!.،,\s]+$/.test(String(text || "").trim())) return true;

  return [
    "مافهمت", "ما فهمت", "مش فاهم", "مش فاهمه", "كيف يعني", "شو يعني",
    "وضح", "وضحي", "يعني؟", "طيب؟", "؟", "?",
    "قصدي هاي", "قصدي هاد", "قصدي هذا", "قصدي السؤال الي قبل", "قصدي السؤال اللي قبل",
    "لا قصدي السؤال الي قبل", "لا قصدي السؤال اللي قبل", "السؤال الي قبل", "السؤال اللي قبل",
  ].includes(t);
}

function isSimpleContinueConfirmationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t || isExplicitNonContinuationText(text)) return false;

  if (["نعم", "موافق", "موافقه", "اوافق", "تمام موافق", "اكيد موافق"].includes(t)) return true;
  if (hasAny(t, ["مش موافق", "غير موافق", "لا اوافق", "لا أوافق"])) return false;
  if (t.length <= 80 && hasNormalizedWord(t, ["نعم", "موافق", "اوافق"])) return true;

  return hasAny(t, [
    "موافق على الجهاز", "موافق عالجهاز", "تمام موافق على الجهاز", "تمام موافق عالجهاز",
    "موافق 100%", "موافق ميه بالميه", "موافق مية بالمية", "بدي اكمل بالجهاز", "بدي أكمل بالجهاز",
    "نعم اود الاستمرار", "نعم أود الاستمرار",
  ]);
}

function stripIdentifiersForIntent(text: string) {
  return normalizeArabicText(text)
    .replace(/am-\d{8,}/gi, " ")
    .replace(/(?:^|\D)1\d{11,14}(?=\D|$)/g, " ")
    .replace(/(?:\+?962|00962|0)?7[789]\d{7}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveConversationInput(
  customerText: string,
  messageType: string,
  memory: Awaited<ReturnType<typeof getConversationMemory>>,
) {
  const rawCurrentText = String(customerText || "").trim();
  const semanticTail = stripLeadingSocialAcknowledgement(rawCurrentText);
  let effectiveText = hasSubstantiveContentAfterSocialPrefix(rawCurrentText) && semanticTail
    ? semanticTail
    : rawCurrentText;

  if (isContextOnlyFollowupText(effectiveText) || isContextualShortRequestText(effectiveText)) {
    const previousQuestion =
      memory.lastQuestionLikeCustomerMessage ||
      memory.lastMeaningfulCustomerMessage ||
      "";

    if (previousQuestion && normalizeArabicText(previousQuestion) !== normalizeArabicText(effectiveText)) {
      effectiveText = `${previousQuestion}\nمتابعة العميل: ${semanticTail || customerText}`;
    }
  }

  let intent = classifyIncomingIntent(effectiveText, messageType);
  const currentMessageHint = currentMessageSemanticIntentHint(rawCurrentText);
  if (currentMessageHint) intent = currentMessageHint;

  if (
    memory.hasRecentPreliminaryApprovalTemplate &&
    isSimpleContinueConfirmationText(customerText)
  ) {
    intent = "continue_decision";
  }

  // V1.7.0 CONVERSATION KERNEL: resolve self-contained semantic goals before
  // a stale lexical intent can control the rest of the request lifecycle.
  intent = resolveConversationKernelIntent({
    customerText: rawCurrentText,
    messageType,
    currentIntent: intent,
    application: null,
    memory,
  });

  return { effectiveText, intent };
}

function isApprovalStatusQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  // "بعد الموافقة شو المطلوب؟" سؤال إجراءات، وليس سؤالًا هل صدرت الموافقة.
  if (hasAny(t, ["بعد الموافقه", "بعد الموافقة", "بعد القبول", "بعد الاعتماد"])) return false;

  const directFollowups = hasAny(t, [
    "هل تمت الموافقه", "هل تمت الموافقة", "تم ولا شو", "تم ولا لا", "يعني تم ولا شو",
    "يعني انقبل", "يعني انقبلت", "يعني وافقتوا", "خلص وافقتوا", "صار قبول",
    "موافق ولا لا", "مقبول ولا لا", "انقبلت ولا لا", "وافقوا ولا لا",
  ]);

  if (directFollowups || ["الموافقه", "الموافقة", "القبول", "النتيجه", "النتيجة"].includes(t)) {
    return true;
  }

  const approvalContext = hasAny(t, [
    "موافقه", "موافقة", "انقبل", "انقبلت", "مقبول", "وافقوا", "وافقتوا", "القبول", "الرفض",
    "موافقه نهائيه", "موافقة نهائية", "موافقه مبدئيه", "موافقة مبدئية",
  ]);
  const questionContext = hasAny(t, [
    "هل", "تم", "صار", "ولا", "شو صار", "وين وصلت", "طلع", "صدرت", "اجت", "إجت",
  ]);

  return approvalContext && questionContext;
}

function isFileOpeningClarificationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "اي ملف", "أي ملف", "شو الملف", "ملف شو", "فتح اي ملف", "فتح أي ملف",
    "شو يعني فتح ملف", "أي ملف بزبط", "اي ملف بزبط", "ملف التقسيط شو",
  ]);
}

function isFirstInstallmentQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const firstInstallment = hasAny(t, [
    "القسط الاول", "القسط الأول", "اول قسط", "أول قسط", "الدفعه الاولى", "الدفعة الأولى",
  ]);
  const timingOrAmount = hasAny(t, [
    "متى", "امتى", "إمتى", "وقت", "يكون", "بدفع", "يندفع", "كم", "قديش", "بعد الاستلام", "قبل الاستلام",
  ]);

  return firstInstallment && timingOrAmount;
}

function hasExplicitSupplierLogisticsText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "المورد", "الموردين", "توريد", "الشحنه", "الشحنة", "المخزون", "وصلت الاجهزه", "وصلت الأجهزة",
    "توفر الجهاز", "متوفر عند المورد", "الوكلاء", "موعد التوريد", "دفعة اجهزه", "دفعة أجهزة",
  ]);
}

function isReviewTimeText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  // أسئلة مدة التقسيط وعدد الأشهر ليست سؤالًا عن مدة دراسة الطلب.
  if (hasAny(t, [
    "مدة التقسيط", "مده التقسيط", "كم شهر تقسيط", "على كم شهر",
    "عدد الاقساط", "عدد الأقساط", "فترة التقسيط", "فتره التقسيط",
    "24 شهر", "36 شهر", "القسط الشهري",
  ])) {
    return false;
  }

  const directPhrases = hasAny(t, [
    "كم بدها وقت المعامله", "كم بدها وقت المعاملة", "قديش بدها وقت المعامله", "قديش بدها وقت المعاملة",
    "كم بده وقت الطلب", "قديش بده وقت الطلب", "كم بتطول المعامله", "كم بتطول المعاملة",
    "قديش بتطول المعامله", "قديش بتطول المعاملة", "متى بتخلص الدراسه", "متى بتخلص الدراسة",
    "امتى بتخلص الدراسه", "إمتى بتخلص الدراسة", "كم بتاخذ الدراسه", "كم بتاخذ الدراسة",
    "قديش بتاخذ الدراسه", "قديش بتاخذ الدراسة", "كم يوم المعامله", "كم يوم المعاملة",
    "المعامله كم يوم", "المعاملة كم يوم", "كم بضل على الطلب", "قديش بضل على الطلب",
    "متى تخلص المعامله", "متى تخلص المعاملة", "متى يخلص الطلب", "متى بتطلع النتيجه", "متى بتطلع النتيجة",
    "طيب متى رح يبين", "متى رح يبين", "هل الرد يوخذ وقت طويل", "هل الرد ياخذ وقت طويل",
    "يعني اليوم بتردولي خبر", "ولا كمان استنا", "متى بتحكولي اه ولا لا",
  ]);

  if (directPhrases) return true;

  const hasQuestionContext = hasAny(t, [
    "قديش", "كم", "متى", "امتى", "إمتى", "شو المدة", "شو المده",
    "مدة الطلب", "مده الطلب", "متى الرد", "وقت الرد", "بدها وقت", "بده وقت",
    "الطلب باخذ", "الطلب بياخذ", "بتاخذ", "بتاخد", "بياخذ", "بستغرق", "بتطول", "يطول",
    "كم بياخذ وقت", "كم باخذ وقت", "كم بتحتاج وقت", "قديش بتحتاج وقت", "كم يحتاج وقت",
    "قديش بياخذ وقت", "قديش باخذ وقت", "كم بدكم وقت", "كم ودكم وقت", "قديش بدكم وقت",
    "خلال كم", "كم المده", "كم المدة", "بالعادة كم", "متى بتخلص", "امتى بتخلص",
    "الرد بدو وقت", "الرد بده وقت", "الرد مطول", "الرد بطول", "قديش الرد", "كم بياخذ الرد",
  ]);

  const hasReviewContext = hasAny(t, [
    "الطلب", "المعامله", "المعاملة", "الملف", "الدراسة", "الدراسه", "المراجعة", "المراجعه",
    "الموافقة", "الموافقه", "النتيجة", "النتيجه", "الرد", "المتابعة", "المتابعه",
    "كم يوم", "كم ساعة", "كم ساعه",
  ]);

  const standaloneReviewQuestion = hasAny(t, [
    "كم بياخذ وقت", "كم باخذ وقت", "كم بتحتاج وقت", "قديش بتحتاج وقت", "كم يحتاج وقت",
    "قديش بياخذ وقت", "قديش باخذ وقت", "كم بدكم وقت", "كم ودكم وقت", "قديش بدكم وقت",
    "خلال كم", "بالعادة كم",
  ]);

  return hasQuestionContext && (hasReviewContext || standaloneReviewQuestion);
}

function isLongDelayComplaintText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const installmentContext = hasAny(t, [
    "مدة التقسيط", "مده التقسيط", "كم شهر تقسيط", "على كم شهر",
    "عدد الاقساط", "عدد الأقساط", "فترة التقسيط", "فتره التقسيط",
    "24 شهر", "36 شهر", "القسط الشهري",
  ]);

  if (installmentContext) return false;

  const elapsedPhrase = hasAny(t, [
    "صارلو", "صارله", "صارلها", "صارلي", "صار لي", "صار له", "صار لها",
    "من زمان", "له فترة", "له فتره", "إله فترة", "اله فتره",
    "طول كثير", "مطول كثير",
  ]);

  const durationPattern = /(?:صار(?:لو|له|لها|لي)?|صار\s+(?:لي|له|لها)|منذ|من)\s*(?:حوالي\s*)?[0-9٠-٩]+\s*(?:يوم|أيام|ايام|أسبوع|اسبوع|أسابيع|اسابيع|شهر|أشهر|اشهر)/i;
  const hasDurationUnit = hasAny(t, [
    "يوم", "ايام", "أيام", "اسبوع", "أسبوع", "اسابيع", "أسابيع",
    "شهر", "اشهر", "أشهر",
  ]);

  const sinceMonthComplaint = /(?:من\s+شهر\s*[0-9٠-٩]+|من\s+شهر)\b/i.test(t) &&
    hasAny(t, ["لسا", "لحد هسا", "لحد هسه", "ما اجت", "ما إجت", "ما طلعت", "الموافقه", "الموافقة", "النتيجه", "النتيجة"]);

  return durationPattern.test(t) || (elapsedPhrase && hasDurationUnit) || sinceMonthComplaint;
}

function isPaymentGuaranteeText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const directGuaranteeQuestion = hasAny(t, [
    "شو المضمون", "ما المضمون", "ايش المضمون", "إيش المضمون",
    "شو بضمن حقي", "شو بضمنلي", "شو بضمن لي",
    "شو ضماني", "ما ضماني", "شو الضمان بالدفع",
    "كيف اضمن حقي", "كيف أضمن حقي",
  ]);

  const guaranteeContext = hasAny(t, [
    "مضمون", "ضمان", "اضمن", "أضمن", "بضمن", "حقي", "موثوق",
  ]);
  const paymentContext = hasAny(t, [
    "دفع", "ادفع", "أدفع", "رسوم", "تحويل", "احول", "أحول",
    "محفظة", "محفظه", "اورنج", "orange", "وصل", "ايصال", "إيصال",
  ]);

  return directGuaranteeQuestion || (guaranteeContext && paymentContext);
}


function isPaymentMethodText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const directPhrases = hasAny(t, [
    "بدفع بالمكتب", "بدفعها بالمكتب", "بدفع عندكم بالمكتب", "بدفعها عندكم بالمكتب",
    "بدفع عندكوا بالمكتب", "بدفعها عندكوا بالمكتب", "بقدر ادفع بالمكتب", "بقدر أدفع بالمكتب",
    "ادفع كاش بالمكتب", "أدفع كاش بالمكتب", "الدفع بالمكتب", "الدفع عندكم",
    "وين ادفع", "وين أدفع", "كيف ادفع", "كيف أدفع", "طريقة الدفع", "طريقه الدفع",
    "بقدر ادفع كاش", "بقدر أدفع كاش", "الدفع كاش", "دفع نقدي",
  ]);

  const paymentContext = hasAny(t, ["دفع", "ادفع", "أدفع", "رسوم", "احول", "أحول", "تحويل"]);
  const methodContext = hasAny(t, ["مكتب", "كاش", "نقدي", "محفظه", "محفظة", "اورنج", "orange", "كيف", "وين"]);

  return directPhrases || (paymentContext && methodContext);
}

function isPaymentTimingText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "لو للمسا عادي", "للمسا عادي", "للمساء عادي", "بقدر ادفع للمسا", "بقدر أدفع للمسا",
    "بقدر ادفع بالليل", "بقدر أدفع بالليل", "بقدر ادفع بكرا", "بقدر أدفع بكرا",
    "بقدر احول بكرا", "بقدر أحول بكرا", "احول بكرا", "أحول بكرا",
    "بقدر احول الاحد", "بقدر أحول الأحد", "احول الاحد", "أحول الأحد",
    "ادفع هسا", "أدفع هسا", "متى ادفع", "متى أدفع", "لازم ادفع هسا", "لازم أدفع هسا",
    "في وقت محدد للدفع", "الدفع متاح متى", "اخر وقت للدفع", "آخر وقت للدفع",
    "بسير الايداع بعد الموافقه", "بسير الايداع بعد الموافقة", "بصير الايداع بعد الموافقه", "بصير الإيداع بعد الموافقة",
    "ادفع بعد الموافقه", "أدفع بعد الموافقة", "احول بعد الموافقه", "أحول بعد الموافقة",
    "ما معي حاليا", "ما معي حاليًا", "مش معي حاليا", "مش معي حاليًا",
  ]);
}

function isPaymentRecipientText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const directPhrases = hasAny(t, [
    "ع اي رقم احول", "على اي رقم احول", "ع أي رقم أحول", "على أي رقم أحول",
    "ع اي اسم احول", "على اي اسم احول", "اسم مين احول", "اسم مين أحول",
    "شو اسم المستفيد", "مين المستفيد", "اسم المستفيد", "الاسم اللي بطلع", "الاسم الذي يظهر",
    "وين احول", "وين أحول", "ابعث معلومات الدفع", "ابعت معلومات الدفع", "ارسل معلومات الدفع",
    "اعطيني رقم التحويل", "أعطيني رقم التحويل", "بيانات التحويل", "معلومات التحويل",
    "رقم او اسم احول", "رقم أو اسم أحول",
  ]);

  const transferContext = hasAny(t, ["احول", "أحول", "تحويل", "حواله", "حوالة", "مستفيد"]);
  const recipientContext = hasAny(t, ["رقم", "اسم", "مين", "وين", "محفظه", "محفظة"]);

  return directPhrases || (transferContext && recipientContext);
}

function isPaymentReviewTimeText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const timeContext = hasAny(t, ["قديش", "كم يوم", "خلال كم", "متى", "امتى", "شو المده", "شو المدة"]);
  const explicitPaymentContext = hasAny(t, [
    "بعد الدفع", "بعد ما ادفع", "بعد ما أدفع", "بعد رفع الوصل", "بعد تأكيد الدفع",
    "بعد التحويل", "بعد ما احول", "بعد ما أحول", "بعد تأكيد الوصل", "من بعد الوصل",
  ]);
  const paymentWords = hasAny(t, ["دفع", "ادفع", "أدفع", "وصل", "ايصال", "إيصال", "تحويل", "حواله", "حوالة", "رسوم"]);
  const decisionContext = hasAny(t, ["الموافقه", "الموافقة", "الرفض", "النتيجه", "النتيجة", "الدراسه", "الدراسة"]);

  return timeContext && (explicitPaymentContext || (paymentWords && decisionContext));
}

function isPaymentNextStepText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "بعد الدفع شو بصير", "بعد ما ادفع شو بصير", "بعد ما أدفع شو بصير",
    "بعد التحويل شو بصير", "بعد رفع الوصل شو بصير", "وبعدين بعد الدفع",
    "شو الخطوه بعد الدفع", "شو الخطوة بعد الدفع",
  ]);
}

function isPaymentObjectionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "ليش ادفع", "ليش أدفع", "ليش رسوم", "ليش في رسوم", "ليش رسوم فتح الملف",
    "ما بدي ادفع رسوم", "ما بدي أدفع رسوم", "مش مقتنع ادفع", "مش مقتنع أدفع",
    "شو فايده الرسوم", "شو فائدة الرسوم", "على شو الرسوم", "ليش الخمسه", "ليش الخمسة",
  ]);
}

function isVoluntaryOptOutText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  if (isExplicitNonContinuationText(t)) return true;
  if (isPaymentOnReceiptRefusalText(t)) return true;

  // الإلغاء والاسترداد مساران رسميان مستقلان ولا يتحولان إلى مجرد تجاهل.
  if (hasAny(t, [
    "الغاء", "إلغاء", "الغي الطلب", "ألغي الطلب", "ما بدي الطلب",
    "استرداد", "استرجاع", "رجعولي", "رجعوا فلوسي", "بدي فلوسي",
  ])) return false;

  // V1.4.1 CUSTOMER EXPERIENCE: robust refusal detection catches natural Jordanian
  // phrases such as "انا ما بدفع ايشي قبل ما يكون الجهاز في ايدي" without
  // turning ordinary payment questions into opt-out.
  return isClearPaymentRefusalText(t);
}

function isOfficeFeePaymentRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const direct = hasAny(t, [
    "ادفع بالمكتب", "أدفع بالمكتب", "الدفع بالمكتب", "دفع بالمكتب",
    "اجي ادفع بالمكتب", "أجي أدفع بالمكتب", "اجي ع المكتب ادفع", "أجي ع المكتب أدفع",
    "اجي عالمكتب ادفع", "أجي عالمكتب أدفع", "احضر عالمكتب ادفع", "أحضر عالمكتب أدفع",
    "ادفع عندكم بالمكتب", "أدفع عندكم بالمكتب", "ادفع عندكم", "أدفع عندكم",
    "اعطيكم الرسوم بالمكتب", "أعطيكم الرسوم بالمكتب", "اعطيكم الخمسه بالمكتب", "أعطيكم الخمسة بالمكتب",
    "وين المكتب بدي ادفع", "وين المكتب بدي أدفع", "اعطيني الموقع وبدفع", "أعطيني الموقع وبدفع",
    "بدي اجي ادفع الرسوم", "بدي أجي أدفع الرسوم", "بدي ادفع الرسوم عندكم", "بدي أدفع الرسوم عندكم",
    "بقدر ادفع بالمكتب", "بقدر أدفع بالمكتب", "ممكن ادفع بالمكتب", "ممكن أدفع بالمكتب",
    "ما بدفع الا بالمكتب", "ما بدفع إلا بالمكتب", "ما بدي ادفع اونلاين بدي اجي المكتب",
    "ما بدي أدفع أونلاين بدي أجي المكتب", "مش رح ادفع اونلاين", "مش رح أدفع أونلاين",
  ]);

  const officeContext = hasAny(t, ["المكتب", "عالمكتب", "ع المكتب", "عندكم", "الموقع", "العنوان"]);
  const feeContext = hasAny(t, ["رسوم", "فتح الملف", "الخمسه", "الخمسة", "5 دنانير", "٥ دنانير"]);
  const paymentContext = hasAny(t, ["ادفع", "أدفع", "دفع", "احول", "أحول", "تحويل"]);
  const deliveryOnly = hasAny(t, ["استلام الجهاز", "استلم الجهاز", "توصيل", "مندوب"])
    && !feeContext;

  return !deliveryOnly && (direct || (officeContext && feeContext && paymentContext));
}

function isOfficeFeePaymentInsistenceText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "ما بدفع الا بالمكتب", "ما بدفع إلا بالمكتب", "مش دافع الا بالمكتب", "مش دافع إلا بالمكتب",
    "لازم ادفع بالمكتب", "لازم أدفع بالمكتب", "بدي ادفع بالمكتب وبس", "بدي أدفع بالمكتب وبس",
    "فقط بالمكتب", "بس بالمكتب", "ما بدي ادفع اونلاين", "ما بدي أدفع أونلاين",
    "مش رح ادفع اونلاين", "مش رح أدفع أونلاين", "اذا ما في دفع بالمكتب ما بدي", "إذا ما في دفع بالمكتب ما بدي",
    "اذا ما بقدر ادفع بالمكتب ما بدي", "إذا ما بقدر أدفع بالمكتب ما بدي",
    "اعطيني الموقع وبدفع عندكم", "أعطيني الموقع وبدفع عندكم",
  ]);
}

function officeFeePaymentCanBeIgnored(app: ApplicationRecord | null) {
  if (!app) return true;
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const paid = paymentStatus === "confirmed" || paymentStatus === "customer_claimed_paid" || Boolean(app.payment_confirmed_at);
  const refundActive = status === "refund_requested" || paymentStatus === "refund_requested" || status === "refund_completed";
  const approved = status === "approved" || status === "customer_accepts_delivery_delay";
  return !paid && !refundActive && !approved;
}

function officeFeePaymentPolicyWasExplained(replies: string[]) {
  return replies.some((reply) => /دفع رسوم فتح الملف.*(?:غير متاح|مش متاح).*المكتب|الدفع بالمكتب.*(?:غير متاح|مش متاح)|اذا هالطريقه ما بتناسبك|إذا هالطريقة ما بتناسبك/i.test(normalizeArabicText(String(reply || ""))));
}

function officeFeePaymentFinalReplyWasSent(replies: string[]) {
  return replies.some((reply) => /بنحترم قرارك.*اذا غيرت رايك لاحقا|بنحترم قرارك.*إذا غيرت رأيك لاحقًا/i.test(normalizeArabicText(String(reply || ""))));
}

function officeFeePaymentReply(app: ApplicationRecord | null, finalClosure: boolean) {
  if (!officeFeePaymentCanBeIgnored(app)) {
    const paymentStatus = app?.payment_status || "";
    const paymentConfirmed = paymentStatus === "confirmed" || paymentStatus === "customer_claimed_paid" || Boolean(app?.payment_confirmed_at);
    if (paymentConfirmed) {
      return "الدفع مسجل ومؤكد على طلبك، وما في أي دفع إضافي مطلوب.";
    }

    return "دفع رسوم فتح الملف بالمكتب غير متاح. إذا قرارك النهائي عدم الاستمرار، احكيلي إنك بدك تلغي الطلب وبوضحلك الخطوة المناسبة حسب حالته.";
  }

  if (finalClosure) {
    return "واضح، وبنحترم قرارك. دفع رسوم فتح الملف بالمكتب غير متاح، وإذا طريقة الدفع الرسمية ما بتناسبك ما عليك أي التزام تكمل الطلب. إذا غيرت رأيك لاحقًا تواصل معنا من نفس الرقم.";
  }

  return "دفع رسوم فتح الملف بالمكتب غير متاح؛ الدفع فقط بالطريقة الرسمية المرتبطة بالطلب. إذا هالطريقة ما بتناسبك، ما عليك أي التزام تكمل.";
}

function voluntaryOptOutCanBeIgnored(app: ApplicationRecord | null) {
  return officeFeePaymentCanBeIgnored(app);
}

function voluntaryOptOutReply(app: ApplicationRecord | null, finalClosure: boolean) {
  if (!voluntaryOptOutCanBeIgnored(app)) {
    return "تمام، فهمت عليك. إذا بدك تنهي الطلب نهائيًا احكيلي بوضوح إنك بدك تلغيه، وبمشي معك بالخطوة المناسبة حسب حالته.";
  }

  if (finalClosure) {
    return "تمام، بنحترم قرارك. ما في عليك أي التزام تكمل، وإذا غيرت رأيك لاحقًا تواصل معنا من نفس الرقم.";
  }

  return "تمام، ما في عليك أي التزام تكمل هسا. بنوقف عند هالمرحلة، وإذا غيرت رأيك لاحقًا تواصل معنا من نفس الرقم.";
}

function paymentOnReceiptReply(app: ApplicationRecord | null, finalClosure: boolean) {
  if (!voluntaryOptOutCanBeIgnored(app)) {
    const paymentStatus = app?.payment_status || "";
    const paymentConfirmed = paymentStatus === "confirmed" || paymentStatus === "customer_claimed_paid" || Boolean(app?.payment_confirmed_at);
    if (paymentConfirmed) {
      return "الدفع مسجل ومؤكد على طلبك، وما في أي دفع إضافي مطلوب.";
    }
    return "رسوم فتح الملف تُدفع قبل بدء دراسة الطلب، والدفع عند استلام الجهاز غير متاح. إذا قرارك النهائي عدم الاستمرار، احكيلي إنك بدك تلغي الطلب وبوضحلك الخطوة المناسبة حسب حالته.";
  }

  if (finalClosure) {
    return "واضح، وبنحترم قرارك. رسوم فتح الملف تُدفع قبل بدء دراسة الطلب، والدفع عند استلام الجهاز غير متاح. إذا هالطريقة ما بتناسبك ما عليك أي التزام تكمل، وإذا غيرت رأيك لاحقًا تواصل معنا من نفس الرقم.";
  }

  return "رسوم فتح الملف تُدفع قبل بدء دراسة الطلب، والدفع عند استلام الجهاز غير متاح. إذا هالطريقة ما بتناسبك ما عليك أي التزام تكمل.";
}

function isPaymentLinkIssueText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const receiptContext = hasAny(t, ["وصل", "ايصال", "إيصال", "رفع الوصل", "رابط الدفع", "رابط الرفع", "receipt"]);
  const problemContext = hasAny(t, ["ما بفتح", "مش بفتح", "ما فتح", "مش شغال", "ما بشتغل", "خطا", "خطأ", "404", "error"]);

  return receiptContext && problemContext;
}

function isDeliveryCorrectionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "ما سالتك عن التوصيل", "ما سألتك عن التوصيل", "مش بسال عن التوصيل", "مش بسأل عن التوصيل",
    "انا بحكي عن الدفع", "أنا بحكي عن الدفع", "قصدي الدفع", "سؤالي عن الدفع",
  ]);
}

function isReopenCancelledConfirmedText(text: string) {
  return isExactReopenConfirmationText(text);
}

function isReopenCancelledRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t || isReopenCancelledConfirmedText(t)) return false;

  return hasAny(t, [
    "تراجعت عن الالغاء", "تراجعت عن الإلغاء", "بدي اتراجع عن الالغاء", "بدي أتراجع عن الإلغاء",
    "بدي ارجع الطلب", "بدي أرجع الطلب", "رجعوا الطلب", "ارجعوا الطلب", "أرجعوا الطلب",
    "الغاء الالغاء", "إلغاء الإلغاء", "فك الالغاء", "فك الإلغاء", "اعاده فتح الطلب", "إعادة فتح الطلب",
    "اعاده تفعيل الطلب", "إعادة تفعيل الطلب", "بدي اكمل بعد ما لغيت", "بدي أكمل بعد ما لغيت",
    "غيرت رايي وبدي اكمل", "غيرت رأيي وبدي أكمل", "reopen application", "undo cancellation",
  ]);
}

function isSimpleReopenConfirmationText(text: string) {
  const t = normalizeArabicText(text);
  return ["نعم", "اه", "اها", "ايوه", "ايوا", "موافق", "تمام", "اكد", "أكد"].includes(t);
}

function paymentAssistanceStateActive(
  app: ApplicationRecord | null,
  memory: Awaited<ReturnType<typeof getConversationMemory>>,
) {
  if (!app) return false;

  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  if (status === "cancelled" || status === "refund_completed" || paymentStatus === "refund_requested") return false;
  if (paymentStatus === "confirmed" || paymentStatus === "customer_claimed_paid") return false;

  return (
    status === "preliminary_qualified" ||
    status === "customer_confirmed_continue" ||
    ["pending", "pending_payment", "payment_info_sent"].includes(paymentStatus) ||
    Boolean(memory.isPaymentAssistanceActive)
  );
}

function currentCustomerActionLine(app: ApplicationRecord, baseUrl = "") {
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";

  if (status === "needs_guarantor") {
    return "المطلوب منك حاليًا استكمال بيانات الكفيل من الرابط الرسمي المرسل لك.";
  }

  if (status === "needs_salary_slip") {
    return "المطلوب منك حاليًا رفع كشف راتب أو شهادة راتب من الرابط الرسمي المرسل لك.";
  }

  if (status === "needs_identity" || status === "identity_requested") {
    return "المطلوب منك حاليًا رفع صورة الهوية الأمامية والخلفية من الرابط الرسمي المرسل لك.";
  }

  if (
    status === "preliminary_qualified" ||
    status === "customer_confirmed_continue" ||
    ["pending", "pending_payment", "payment_info_sent"].includes(paymentStatus)
  ) {
    const receiptLine = baseUrl
      ? `\nرابط رفع الوصل:\n${receiptUrl(baseUrl, app)}`
      : "";
    return `المطلوب منك حاليًا دفع رسوم فتح الملف بقيمة ${FILE_OPENING_FEE_JOD} دنانير ورفع الوصل من الرابط الرسمي.${receiptLine}`;
  }

  if (paymentStatus === "customer_claimed_paid") {
    return "الوصل واصل وبانتظار تأكيده، فلا تعيد الدفع.";
  }

  return "حاليًا لا توجد أي خطوة إضافية مطلوبة.";
}

function reviewTimeReply(from: string, app?: ApplicationRecord | null, baseUrl?: string, customerText = "") {
  const wantsOperationalPicture = shouldExplainOperationalPicture(customerText);

  if (!app) {
    if (wantsOperationalPicture) {
      return `${buildOperationalTransparencyParagraph({
        seed: `${from}:${customerText}:general-delay`,
        customerSpecificApproved: false,
        facts: currentOperationalTransparencyFacts(),
      })}

إذا بتحكي عن طلبك تحديدًا، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب حتى أربط الشرح بالحالة الفعلية لملفك.`;
    }

    if (isLongDelayComplaintText(customerText)) {
      return `معك حق، الانتظار طال أكثر من المعتاد.

ما بدي أكرر عليك مدة تقديرية وأعطيك وعد مش مؤكد؛ المراجعة ماشية حسب الدور وضغط الملفات واكتمال البيانات.

ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب حتى أعطيك الحالة الحالية بدقة.`;
    }

    return `ما في مدة ثابتة أقدر أوعدك فيها؛ دراسة الطلب ماشية حسب الدور وضغط المراجعات واكتمال البيانات. إذا عندك طلب مسجل ابعث رقم التتبع وبعطيك حالته الحالية بدون تخمين.`;
  }

  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const tracking = app.tracking_id || app.id;

  if (wantsOperationalPicture) {
    const approved = ["approved", "customer_accepts_delivery_delay"].includes(status);
    const statusLine = approved ? null : `وبالنسبة لطلبك نفسه: ${stageCustomerStatusLine(app)}`;
    return `${buildOperationalTransparencyParagraph({
      seed: `${from}:${tracking}:${customerText}`,
      customerSpecificApproved: approved,
      statusLine,
      facts: currentOperationalTransparencyFacts(),
    })}

رقم الطلب: ${tracking}`;
  }

  if (isLongDelayComplaintText(customerText)) {
    return `معك حق، الطلب طال أكثر من المعتاد.

الحالة الظاهرة حاليًا: ${statusHumanLabel(status)}.
الملفات ماشية حسب الدور وفي ضغط على المراجعات، وما بدي أعطيك موعد جديد غير مؤكد.

${currentCustomerActionLine(app, baseUrl)}
رقم الطلب: ${tracking}`;
  }

  if (status === "approved" || status === "customer_accepts_delivery_delay") {
    return `طلبك عليه موافقة نهائية. اللي باقي هو ترتيب موعد الاستلام، وما في موعد مؤكد ظاهر حاليًا.

أول ما يتم اعتماد الموعد رح يصلك تحديث.
رقم الطلب: ${tracking}`;
  }

  if (status === "rejected") return `الطلب غير موافق عليه، وما في دراسة جديدة أو قرار آخر بانتظاره على نفس الطلب.

رقم الطلب: ${tracking}`;
  if (status === "cancelled") return `الطلب ملغي، لذلك ما في دراسة جارية عليه حاليًا.

رقم الطلب: ${tracking}`;
  if (status === "refund_requested" || paymentStatus === "refund_requested") return `طلب الاسترداد مسجل وقيد المراجعة، وما في مدة موافقة جارية على الطلب حاليًا.

رقم الطلب: ${tracking}`;

  if (paymentStatus === "customer_claimed_paid") {
    return `الوصل حاليًا بانتظار التأكيد، فلا تعيد الدفع.

بعد تأكيده بتستكمل دراسة الملف حسب الدور وضغط المراجعات، وما بدي أعطيك مدة غير مؤكدة.
رقم الطلب: ${tracking}`;
  }

  if (paymentStatus === "confirmed" || status === "under_review" || ["needs_guarantor", "needs_salary_slip", "needs_identity", "identity_requested", "salary_slip_uploaded", "guarantor_submitted"].includes(status)) {
    return `ملفك حاليًا ${statusHumanLabel(status)}، والمراجعة ماشية حسب الدور وضغط الملفات.

${currentCustomerActionLine(app, baseUrl)}
ما بدي أوعدك بمدة غير مؤكدة، وأول ما يظهر قرار فعلي رح يصلك تحديث.
رقم الطلب: ${tracking}`;
  }

  if (status === "preliminary_qualified" || status === "customer_confirmed_continue" || ["pending", "pending_payment", "payment_info_sent"].includes(paymentStatus)) {
    return `الدراسة الفعلية بتكمل بعد استكمال الخطوة المطلوبة على الملف وتأكيدها.

${currentCustomerActionLine(app, baseUrl)}
بعدها الملف بيمشي حسب الدور وضغط المراجعات، بدون موعد ثابت أقدر أوعدك فيه.
رقم الطلب: ${tracking}`;
  }

  return `حالة طلبك الحالية: ${statusHumanLabel(status)}.
المراجعة ماشية حسب الدور وضغط الملفات، وما بدي أعطيك مدة غير مؤكدة.

رقم الطلب: ${tracking}`;
}

function socialGreetingReply(from: string, app?: ApplicationRecord | null, baseUrl?: string, customerText = "") {
  void from;
  void app;
  void baseUrl;
  const text = normalizeArabicText(customerText);

  // V1.2.2 GREETING STABILITY: never guess a morning/evening daypart for a generic greeting.
  if (hasAny(text, ["السلام عليكم", "السلام عليكم ورحمة الله", "سلام عليكم"])) {
    return "وعليكم السلام ورحمة الله 🌿";
  }
  if (hasAny(text, ["صباح الخير", "صباح النور"])) {
    return "صباح النور 🌿";
  }
  if (hasAny(text, ["مساء الخير", "مساء النور"])) {
    return "مساء النور 🌿";
  }

  return "أهلًا وسهلًا 🌿";
}


const CONTACT_INFO_KEYWORDS = [
  "رقمكم", "رقمكو", "رقم الشركة", "رقم الشركه", "رقم المحل", "رقم الفرع", "رقم التواصل",
  "تواصل معكم", "اتواصل معكم", "كيف اتواصل", "كيف أتواصل", "بدي رقمكم", "اعطيني رقمكم",
  "ابعث رقمكم", "ارسل رقمكم", "واتسابكم", "واتس ابكم", "واتساب الشركة", "واتس اب الشركة",
  "phone", "number", "contact", "whatsapp number", "whatsapp",
  "شو رقمكم", "ايش رقمكم", "ما رقمكم", "رقم تلفون", "رقم هاتف", "هاتفكم", "تلفونكم",
  "اتصل فيكم", "اتصال", "رن عليكم", "احكي معكم", "اكلمكم",
  "ممكن رقم احكي معو", "ممكن رقم احكي معه", "رقم احكي معو", "رقم احكي معه",
  "بدي رقم احكي معو", "بدي رقم احكي معه", "رقم احكي مع حدا", "رقم شخص احكي معه"
];

function isContactInfoText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const explicitRequest = hasAny(t, [
    "رقمكم", "رقمكو", "رقم الشركة", "رقم الشركه", "رقم المحل", "رقم الفرع", "رقم التواصل",
    "كيف اتواصل", "كيف أتواصل", "بدي رقمكم", "اعطيني رقمكم", "أعطيني رقمكم",
    "ابعث رقمكم", "ارسل رقمكم", "شو رقمكم", "ايش رقمكم", "ما رقمكم",
    "رقم تلفون", "رقم هاتف", "هاتفكم", "تلفونكم", "واتسابكم", "واتس ابكم",
    "ممكن رقم احكي معو", "ممكن رقم احكي معه", "ممكن رقم اتواصل معو", "ممكن رقم اتواصل معه",
    "رقم احكي معو", "رقم احكي معه",
    "بدي رقم احكي معو", "بدي رقم احكي معه", "رقم احكي مع حدا", "رقم شخص احكي معه",
    "بدي رقم تليفون احكي معه", "بدي رقم تلفون احكي معه", "بدي رقم اتواصل معكم",
    "تبعتولي رقم اتواصل معكم", "ابعثولي رقم اتواصل معكم", "معلش تبعتولي رقم اتواصل معكم",
    "contact number", "phone number", "whatsapp number", "how can i contact",
  ]);

  if (explicitRequest) return true;

  const hasPhoneWord = hasAny(t, ["رقم", "تلفون", "هاتف", "واتساب", "واتس", "اتصال", "تواصل", "contact", "phone"]);
  const hasCompanyContext = hasAny(t, ["الشركة", "الشركه", "الامين", "الأمين", "عندكم", "لكم", "معكم", "المحل", "الفرع"]);
  const hasRequestContext = hasAny(t, ["بدي", "ممكن", "اعطيني", "أعطيني", "ابعث", "ارسل", "كيف", "شو", "وين", "هل في"]);

  // مجرد قول العميل إنه بعث على واتساب لا يعني أنه يطلب رقم التواصل.
  return hasPhoneWord && hasCompanyContext && hasRequestContext;
}

const ABUSE_KEYWORDS = [
  // إساءة مباشرة / بذاءة عربية وأردنية شائعة — تعامل معها كحدود احترام، لا كتحية ولا كسؤال عادي
  "كس اختك", "كس اختكم", "كس امك", "كس امكم", "كس امه", "كس عرضك", "كس شرفك", "كسمك", "كسمكم", "كسمكو",
  "انيك", "انيكك", "انيك اختك", "انيك امك", "نيك", "منيوك", "منيك", "منايك", "متناك", "متناكة", "متناكه",
  "عرص", "عرصة", "عرصه", "معرص", "معرصين", "قواد", "قحبة", "قحبه", "شرموط", "شرموطة", "شرموطه",
  "ابن حرام", "ولاد حرام", "يا حرامي يا ابن", "يا ابن الكلب", "ابن كلب", "كلب", "كلاب", "يا كلب", "يا كلاب",
  "خرا", "خره", "زب", "زبي", "طيزي", "طز فيك", "طقع", "تفوو", "تف عليك", "يلعن", "يلعن امك", "يلعن اختك", "لعنة الله",
  "احا", "احه", "يلعن شرف", "يا وسخ", "وسخ", "وسخين", "حقير", "حقيرين", "حيوان", "بقر", "جحش", "حمار", "يا حمار",
  "غبي", "اغبياء", "تافه", "ساقط", "نذل", "واطي", "واطيين", "قذر", "قذرين", "خنزير", "خنازير",

  // إساءة إنجليزية/فرانكو محتملة
  "fuck", "fucking", "motherfucker", "bitch", "son of a bitch", "asshole", "dick", "shit", "bastard", "wtf",
  "kos omak", "kos okhtak", "koss omak", "koss ekhtak", "kess ekhtak", "ayre", "ayri", "airi", "sharmout", "sharmoota",

  // اختصارات/كتابة محرفة
  "ك*س", "ك س امك", "ك س اختك", "كسختك", "كسختكم", "كسامك", "كسمكو", "كسامكو", "منيكين", "متناكين", "عرصات",
];

const LEGAL_THREAT_KEYWORDS = [
  "محامي", "محاميه", "محامية", "قضيه", "قضية", "محكمه", "محكمة", "شرطة", "شرطه", "مركز امني", "مركز أمني",
  "جرائم الكترونية", "جرائم إلكترونية", "الجرائم الالكترونيه", "الجرائم الإلكترونية", "حماية المستهلك", "حمايه المستهلك",
  "وزارة الصناعة", "وزارة الصناعة والتجارة", "البنك المركزي", "المدعي العام", "النائب العام", "حق قانوني", "قانونيا", "قانونيًا",
  "راح ارفع عليكم", "برفع عليكم", "بدي ارفع قضية", "ارفع قضية", "دعوى", "دعوى قضائية", "بشتكي", "رح اشتكي", "راح اشتكي", "هشتكي",
  "complaint", "lawyer", "police", "lawsuit", "court", "report",
];

const SOCIAL_MEDIA_THREAT_KEYWORDS = [
  "بفضحكم", "افضحكم", "رح افضحكم", "راح افضحكم", "بنشر عليكم", "انشر عليكم",
  "بنشر موقعكم", "انشر موقعكم", "بنشر عنكم", "انشر عنكم", "بنشر تجربتي", "انشر تجربتي",
  "بنشر على صفحتي", "انشر على صفحتي", "عندي صفحة", "عندي صفحه", "متابع", "متابعين", "مشاهداتي",
  "سوشال ميديا", "فيسبوك", "تيك توك", "انستغرام",
  "بوست", "منشور", "جروبات", "قروبات", "الناس تعرف", "بحذر الناس", "احذر الناس", "بحذر كل الناس",
  "بنزل سكرينات", "سكرينات", "سكرين شوت",
  "تقييم سيء", "review", "facebook", "instagram", "tiktok",
];

const SCAM_ACCUSATION_KEYWORDS = [
  "نصب", "نصاب", "نصابه", "نصابين", "بتنصبوا", "نصبتو", "نصبتوا", "منصوب علي", "احتيال", "محتال", "محتالين",
  "سرقه", "سرقة", "سارق", "سراق", "حرامي", "حراميه", "حرامية", "حرميه", "الحرميه", "سرقتوني", "سرقتو", "سرقتوا",
  "شركة وهمية", "وهمية", "وهم", "خداع", "مخادعين", "ضحكتوا علينا", "بتضحكوا علينا", "scam", "fraud", "scammer",
];

const PAYMENT_DISPUTE_KEYWORDS = [
  "بدي فلوسي", "رجعوا فلوسي", "رجعولي فلوسي", "مصاريي", "فلوسي راحت", "استرداد", "استرجاع", "refund",
  "رجعولي الرسوم", "استرجع الرسوم", "وين مصاري", "وين المصاري", "دفعت", "دافع", "حواله", "حوالة", "وصل", "ايصال", "إيصال",
  "اخذتوا مصاري", "اكلتوا مصاري", "رسوم فتح الملف", "وين رسوم فتح الملف",
];

const DEVICE_DELAY_RAGE_KEYWORDS = [
  "وين جهازي", "وين الجهاز", "وين تلفوني", "وين الموبايل", "وين طلبي", "وين الطلب", "متى بستلم", "ليش ما استلمت",
  "تسليم", "استلام", "تأخير الجهاز", "تاخير الجهاز", "طولتوا", "صارلي", "بستنى", "مستني", "ما في تحديث", "ما وصلني",
];

function isAbuseText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  // Do not use raw substring matching for profanity. It caused innocent words
  // such as "المتاحة" to match the short keyword "احه".
  const phraseKeywords = ABUSE_KEYWORDS.filter((keyword) => normalizeArabicText(keyword).includes(" "));
  const singleWordKeywords = ABUSE_KEYWORDS.filter((keyword) => !normalizeArabicText(keyword).includes(" "));

  const hasPhrase = phraseKeywords.some((keyword) => t.includes(normalizeArabicText(keyword)));
  const hasWholeWord = hasNormalizedWord(t, singleWordKeywords);

  return hasPhrase || hasWholeWord;
}

function isLegalThreatText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, LEGAL_THREAT_KEYWORDS) || hasAny(t, [
    "اقدم شكوى عليكم", "اقدم شكوه عليكم", "بقدم شكوى عليكم", "بقدم شكوه عليكم",
    "قدما شكوى عليكم", "قدما شكوه عليكم", "رح اقدم شكوى", "راح اقدم شكوى",
  ]);
}

function isSocialMediaThreatText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  // V1.6.4: a word fragment such as "متابعة" must never be mistaken for
  // a social-media threat just because it contains "متابع". A real public
  // escalation requires an explicit publication/review action plus a public channel/audience.
  const publicationAction = hasAny(t, [
    "رح انشر", "راح انشر", "بنشر", "بدي انشر", "رح انشر تجربتي", "راح انشر تجربتي",
    "رح افضح", "راح افضح", "بفضح", "رح اكتب عنكم", "راح اكتب عنكم", "بكتب عنكم",
    "رح احكي عنكم", "راح احكي عنكم", "بنزل بوست", "بنزل منشور", "بنزل سكرينات",
    "بحذر الناس", "احذر الناس", "بكتب تقييم", "بحط تقييم", "بعمل review", "بعمل ريفيو",
  ]);
  const publicChannel = hasAny(t, [
    "فيسبوك", "فيس بوك", "تيك توك", "انستغرام", "سوشال", "سوشيال",
    "بوست", "منشور", "جروبات", "قروبات", "الناس", "متابعيني", "صفحه عندي", "صفحة عندي",
    "review", "facebook", "instagram", "tiktok",
  ]);
  const explicitStandalone = hasAny(t, [
    "رح احذر الناس", "راح احذر الناس", "رح أفضحكم", "راح أفضحكم", "بنشر تجربتي", "رح انزل سكرينات",
  ]);

  return explicitStandalone || (publicationAction && publicChannel);
}

function isScamAccusationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, SCAM_ACCUSATION_KEYWORDS);
}

function isPaymentDisputeText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const explicitDispute = hasAny(t, [
    "بدي فلوسي", "رجعوا فلوسي", "رجعولي فلوسي", "فلوسي راحت", "وين مصاري",
    "وين المصاري", "رجعولي الرسوم", "استرجع الرسوم", "استرداد", "استرجاع", "refund",
    "دفعت وما", "حولت وما", "انخصم وما", "دفعت مرتين", "خصمتوا", "اخذتوا مصاري",
    "اكلتوا مصاري", "وين رسوم فتح الملف",
  ]);

  if (explicitDispute) return true;

  const paymentContext = hasAny(t, [
    "دفعت", "حولت", "حواله", "حوالة", "وصل", "ايصال", "إيصال", "رسوم", "خصم", "انخصم",
  ]);
  const problemContext = hasAny(t, [
    "ما وصل", "مش ظاهر", "ما تأكد", "ما تاكد", "رفض", "مشكله", "مشكلة",
    "غلط", "مرتين", "وين", "رجع", "استرد", "اعتراض",
  ]);

  return paymentContext && problemContext;
}

function isDeviceDelayRageText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, DEVICE_DELAY_RAGE_KEYWORDS) && hasAny(t, ["تاخير", "تأخير", "طولت", "صارلي", "بستنى", "مستني", "وين", "ليش", "ما وصل", "ما استلم"]);
}


const ANGRY_CUSTOMER_KEYWORDS = [
  // اتهامات نصب / احتيال / سرقة
  "نصب", "نصاب", "نصابه", "نصابين", "بتنصبوا", "نصبتو", "نصبتوا", "منصوب علي", "انضحك علي",
  "احتيال", "محتال", "محتالين", "احتيالي", "احتيال مالي", "fraud", "scam", "scammer",
  "سرقه", "سرقة", "سارق", "سراق", "حرامي", "حراميه", "حرامية", "سرقتوني", "سرقتو", "سرقتوا",
  "اكلتوا حقي", "اكلتو حقي", "اكلتوا مصاري", "اخذتوا مصاري", "اخذتو مصاري", "ماكلين حقي",
  "تلاعب", "لعب", "خداع", "مخادعين", "تضليل", "كذب", "كذاب", "كذابين", "وهم", "وهمية", "شركة وهمية",

  // غضب / قهر / إساءة تجربة
  "حرام عليكم", "عيب", "مش محترمين", "قلة احترام", "استهتار", "استهتار في الناس", "بهدله", "بهدلة",
  "قرفت", "زهقت", "تعبت", "مللت", "طفشت", "انقهرت", "مقهور", "مقهوره", "حسبي الله", "حسبنا الله",
  "الله لا يسامحكم", "دعيت عليكم", "مش راح اسامح", "حق الناس", "ظلم", "ظلمتوني", "بتظلموا الناس",
  "اسوأ", "أسوأ", "سيئين", "سيئين جدا", "تجربه سيئه", "تجربة سيئة", "خدمة سيئة", "خدمة زبالة",
  "زباله", "زبالة", "مهزله", "مهزلة", "مسخره", "مسخرة", "مقلب", "نصب واحتيال",

  // تأخير / مماطلة / عدم رد
  "تاخير", "تأخير", "تأخرتوا", "تاخرتوا", "طولتوا", "طولتو", "صارلي", "صار لي", "الي ايام",
  "إلي ايام", "إلي أيام", "بستنى", "مستني", "مستنية", "ما حدا رد", "ما بتردو", "ما بتردوا", "مش رادين",
  "طنشتوني", "بتطنشوا", "تطنيش", "مماطله", "مماطلة", "تسويف", "كل يوم بتحكوا", "كل شوي بتحكوا",
  "وعدتوني", "حكيتولي", "ليش التأخير", "وين الجهاز", "وين جهازي", "وين طلبي", "وين الطلب",
  "ما وصلني", "ما استلمت", "لحد الان", "لحد الآن", "ولا اشي صار", "ما صار اشي", "ما في تحديث",
  "ما في جواب", "بدون رد", "مش واضح", "لخبطة", "تخبيص", "تخبط",

  // تهديد بالشكوى / تصعيد رسمي
  "شكوى", "شكوي", "بشتكي", "رح اشتكي", "راح اشتكي", "هشتكي", "complaint", "report",
  "محامي", "محاميه", "lawyer", "قضيه", "قضية", "محكمه", "محكمة", "شرطة", "شرطه", "police",
  "جرائم", "جرائم الكترونية", "جرائم إلكترونية", "الجرائم الالكترونيه", "الجرائم الإلكترونية",
  "حمايه المستهلك", "حماية المستهلك", "وزارة الصناعة", "وزارة الصناعة والتجارة", "البنك المركزي",
  "المدعي العام", "النائب العام", "حق قانوني", "قانونيا", "قانونيًا", "رقم شكوى",
  "ترخيص", "مرخصين", "مش مرخصين", "راح ارفع عليكم", "برفع عليكم", "بدي حقي قانونيا",

  // تصعيد علني / سوشال
  "بفضحكم", "افضحكم", "رح افضحكم", "راح افضحكم", "انشر عليكم", "بنشر عليكم", "سوشال ميديا",
  "فيسبوك", "facebook", "تيك توك", "tiktok", "انستغرام", "instagram", "جروبات", "قروبات",
  "الناس تعرف", "احذر الناس", "بحذر الناس", "بوست", "منشور", "تقييم سيء", "review",

  // فلوس / استرداد بصيغة غاضبة
  "بدي فلوسي", "رجعوا فلوسي", "رجعولي فلوسي", "مصاريي", "فلوسي راحت", "استرداد", "استرجاع",
  "refund", "رجعولي الرسوم", "استرجع الرسوم", "وين مصاري", "وين المصاري",

  // صيغ أردنية/عامية إضافية شائعة
  "نصبتو علي", "نصبتوا علي", "اكلتو حقي", "اكلتوا حقي", "وين حقي", "بدي حقي", "حقّي",
  "سرقتو فلوسي", "سرقتوا فلوسي", "بتضحكوا علينا", "ضحكتوا علينا", "انضحك علينا", "لعبتوا فينا",
  "كل يوم وعد", "كلو حكي", "كله حكي", "مماطلين", "طفح الكيل", "قرفنا", "زهقنا", "استغلال",
  "نصب رسمي", "بدي ارفع قضية", "ارفع قضية", "رح انزل بوست", "راح انزل بوست", "بنزل بوست",
  "بحط سكرينات", "سكرينات", "سكرين شوت", "فضيحة", "فضحتونا", "ضاعت فلوسي", "وين الرسوم",
  "ما في مصداقية", "مش مصداقين", "مش واضحين", "خليتوني اندم", "ندمت", "لعب اعصاب", "وجع راس",

  // أخطاء كتابة متوقعة
  "نصبب", "نصابيين", "نصابينن", "احتييال", "استردادد", "فلوسيي", "تاخيرر", "تأخيرر",
  "مماطله", "ممطالة", "ما بتردوو", "ما بتردووش", "حراميي", "حرمية", "سرقةة",

  // عبارات غضب/تهديد إضافية بصيغ واتساب واقعية
  "وينكم من الصبح", "ليش ما حدا برد", "ليش محد برد", "ليش بتطنشوني", "ليش مطنشين",
  "ما حد عبرني", "ما حدا عبرني", "بدي جواب", "اعطوني جواب", "جوابكم مش واضح",
  "كل شوي بتغيرو الحكي", "كل شوي حكي", "حكي فاضي", "كله وعود", "وعود كذابه", "وعد كاذب",
  "عيب عليكم", "قلة ذوق", "قلة مهنية", "شركة مش محترمة", "خدمة سيئة جدا", "خدمة زفت",
  "حرقتوا دمي", "رفعتولي ضغطي", "جننتوني", "تعبتوني", "ضيعتوا وقتي", "ضيعتو وقتي",
  "فلوسي عندكم", "رسومي عندكم", "وين رسوم فتح الملف", "رجعو الرسوم", "رجعوا الرسوم",
  "مش متنازل", "مش مسامح", "راح اوصلها", "بوصلها للقضاء", "برفع دعوى", "دعوى قضائية",
  "بروح عالشرطة", "بروح على حماية المستهلك", "بشتكي للوزارة", "بشتكي للبنك المركزي",
  "بدي رقم الشكوى", "اعطوني رقم شكوى", "وين رقم الشكوى", "وين الترخيص", "وين السجل",
  "راح اشهر فيكم", "بشهر فيكم", "بنزل سكرينات", "رح انزل سكرينات", "كل الناس رح تعرف",
  "نصب عيني عينك", "احتيال عيني عينك", "لعبة", "مسرحية", "فلم", "بتضحكو عالناس",
  "ضحك عالناس", "ما عندكم مصداقية", "فقدت الثقة", "مش واثق فيكم", "خربتوا ثقتي",
  "وين الجهاز تبعي", "وين تلفوني", "وين الموبايل", "ليش ما استلمت", "متى بستلم جد",
  "لا تماطلوني", "بلا مماطلة", "بلا لف ودوران", "بدون لف ودوران", "رد واضح",
];

function isAngryCustomerText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  // ذكر السجل التجاري أو العمل الحر ليس شكوى أو تهديدًا.
  if (isSelfEmployedText(t) && !hasAny(t, ["شكوى", "محامي", "شرطة", "نصب", "احتيال", "فلوسي", "رجعوا"])) {
    return false;
  }

  if (hasAny(t, ANGRY_CUSTOMER_KEYWORDS)) return true;

  const hasDelayContext = hasAny(t, ["تاخير", "تأخير", "طولتوا", "مماطله", "مماطلة", "وين الطلب", "وين الجهاز", "ما بتردو", "ما حدا رد"]);
  const hasEscalationContext = hasAny(t, ["شكوى", "بشتكي", "محامي", "شرطة", "جرائم", "حماية المستهلك", "افضحكم", "انشر"]);
  const hasMoneyContext = hasAny(t, ["فلوسي", "مصاري", "رسوم", "دفعت", "حواله", "حوالة"]);

  return (hasDelayContext && hasEscalationContext) || (hasMoneyContext && hasEscalationContext);
}

function shouldFlagHumanReview(text: string, intent?: CustomerIntent) {
  const finalIntent = intent || classifyIntent(text);
  return ["abuse", "legal_threat", "social_media_threat", "scam_accusation", "payment_dispute", "device_delay_rage", "emotional_pressure", "media_upload", "document_upload", "document_followup", "receipt_upload_confirmation", "cancel_refund_request", "tracking_link_request", "complaint", "refund", "human_agent", "cancel_request", "cancel_confirmed", "reopen_cancelled_request", "reopen_cancelled_confirmed", "application_data_correction", "application_data_correction_confirmed", "site_issue"].includes(finalIntent) || isLongDelayComplaintText(text) || isAngryCustomerText(text);
}

function complaintReasonLabel(text: string) {
  const t = normalizeArabicText(text);
  const reasons: string[] = [];

  if (hasAny(t, ["نصب", "نصاب", "احتيال", "محتال", "حرامي", "سرقه", "سرقة", "scam", "fraud"])) {
    reasons.push("اتهام نصب/احتيال");
  }

  if (hasAny(t, ["تاخير", "تأخير", "طولتوا", "مماطله", "مماطلة", "وين الجهاز", "وين طلبي", "ما بتردو", "ما حدا رد"])) {
    reasons.push("غضب بسبب تأخير/عدم رد");
  }

  if (hasAny(t, ["بدي فلوسي", "رجعوا فلوسي", "استرداد", "استرجاع", "refund", "مصاري"])) {
    reasons.push("طلب استرداد/اعتراض مالي");
  }

  if (hasAny(t, ["شكوى", "بشتكي", "محامي", "شرطة", "جرائم", "حماية المستهلك", "وزارة", "محكمة", "قضية"])) {
    reasons.push("تهديد بتصعيد رسمي");
  }

  if (hasAny(t, ["افضحكم", "بفضحكم", "انشر", "فيسبوك", "تيك توك", "سوشال", "بوست", "تقييم سيء"])) {
    reasons.push("تهديد بتصعيد علني");
  }

  return reasons.length ? reasons.join(" + ") : "رسالة غاضبة تحتاج جواب واضح";
}

function complaintApologyParagraph(seed: string) {
  const variants = [
    "حقك علينا، وبنعتذر منك بصدق عن أي تأخير أو لخبطة أو شعور بعدم وضوح. مش مقبول تظل بحيرة أو تحس إنك مضطر تلاحق جواب.",
    "أولًا بنعتذر منك بصدق. فاهمين تمامًا إن التأخير أو ضعف الرد بيوتر العميل، وحقك يكون عندك جواب واضح ومحترم.",
    "بعتذر منك جدًا على التجربة اللي وصلتك لهالشكل. إحنا ما بدنا أي عميل يحس إن حقه ضايع أو إن الموضوع غير واضح.",
    "حقك تزعل إذا حسّيت إن الرد تأخر أو إن الصورة مش واضحة. خليني أوضح لك حسب البيانات الظاهرة عندي بدون جدال.",
    "نعتذر منك بكل احترام عن أي إرباك صار. الأهم الآن نربط الكلام بالطلب الصحيح ونمشي خطوة خطوة.",
    "أفهم غضبك، وحقك علينا نهدّي الموضوع ونراجع الحالة بشكل واضح. بنعتذر عن أي تقصير أو تأخير وصلك من جهتنا.",
    "آسفين جدًا إن تجربتك وصلت لهالنقطة. خلينا نراجعها بهدوء وبشكل موثق حتى نعطيك جواب صحيح بدل أي كلام عام.",
    "بنعتذر منك بصدق، وحقك تطلب توضيح كامل. خليني أقرأ الحالة الظاهرة عندي وأجاوبك عليها مباشرة.",
    "معك حق تطلب جواب واضح، وبنعتذر إذا حسّيت إن المتابعة كانت بطيئة أو غير كافية.",
    "حقك علينا، ومش مطلوب منك تضل تلاحق المعلومة. خليني أرتب لك الوضع حسب رقم الطلب أو البيانات المتوفرة.",
    "فاهمين انزعاجك، خصوصًا لما يكون في دفع أو انتظار. بنعتذر عن أي ضغط صار عليك.",
    "بنعتذر عن أي سوء فهم أو تأخير. خلينا نركز الآن على حل الحالة حسب الموجود على الطلب.",
    "أقدّر غضبك، وأتفهم إن الانتظار بدون وضوح مزعج. رح أعطيك الكلام المؤكد حسب الحالة فقط.",
    "آسفين على أي تجربة مزعجة أو شعور بعدم الثقة. المهم الآن نعطيك جواب مرتب وواضح.",
    "حقك يكون عندك رد مفهوم من أول مرة. بنعتذر إذا صار أي تأخير أو تكرار بالكلام.",
    "أتفهم تمامًا إن الموضوع حساس بالنسبة إلك، وخلينا نرتبه بهدوء بدون لف ودوران.",
    "بنعتذر إذا وصلتك الصورة بشكل مربك. رح أوضح لك المطلوب أو حالة الطلب حسب البيانات الظاهرة.",
    "أكيد مش هدفنا نخليك قلقان أو محتار. بنعتذر عن أي تأخير، وخلينا نراجع الطلب من رقمه أو من رقم الهاتف.",
    "حقك تسأل وتزعل إذا ما وصلك جواب كافي. بنعتذر وبنحكي بالواضح حسب الحالة.",
    "بفهم شعورك، خصوصًا إذا صار انتظار أو دفع رسوم. خليني أجاوبك على النقطة نفسها بدون تهرّب.",
    "بنعتذر منكم بصدق عن أي تأخير أو نقص بالتوضيح. المطلوب الآن نحدد رقم الطلب ونقرأ حالته بدقة.",
    "أنت محق بطلب الوضوح. خلينا نطلع على الحالة ونحكي فقط بالمؤكد.",
    "آسفين إذا حسّيت إنك تدور على جواب. خليني أختصر عليك وأوضح الخطوة القادمة حسب الطلب.",
    "حقك علينا، وأتفهم تمامًا حساسية الموضوع. ابعث رقم التتبع أو الهاتف إذا ما ظهر الطلب عندي، وبعطيك الحالة مباشرة.",
    "بنعتذر عن أي إزعاج، وخلينا نحلها بهدوء: نحتاج نربط الرسالة بالطلب الصحيح ثم نوضح الحالة.",
  ];

  const digits = digitsOnly(seed);
  const index = Number(digits.slice(-2) || "0") % variants.length;

  return variants[index];
}

function isExplicitKeepRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "لا اريد الالغاء", "لا أريد الإلغاء", "لا اريد الغاء", "لا أريد إلغاء",
    "مش بدي الغي", "مش بدي ألغي", "ما بدي الغي", "ما بدي ألغي",
    "لا تلغي", "لا تلغوا", "لا تلغيه", "لا تلغو الطلب",
    "اريد الاستمرار", "أريد الاستمرار", "اريد اكمل", "أريد أكمل",
    "بدي استمر", "بدي اكمل", "بدي أكمل", "خلي الطلب", "كمل الطلب",
  ]);
}

function isContinueDecisionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t || isExplicitNonContinuationText(text)) return false;

  if (isExplicitKeepRequestText(t)) return true;
  return isPositiveContinueDecisionText(t);
}

function isDeclineDecisionText(text: string) {
  return isCancelRequestText(text) || isCancelConfirmedText(text);
}

function isCancelConfirmedText(text: string) {
  return isExactCancelConfirmationText(text);
}

function isCancelRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  if (isExplicitKeepRequestText(t)) return false;
  if (isCancelConfirmedText(t)) return false;

  const explicitCancelPhrases = [
    "بدي الغي", "بدي ألغي", "الغي الطلب", "ألغي الطلب", "الغوا الطلب", "لغوا الطلب",
    "بدي القي طلب", "بدي القي الطلب", "بدي القيه", "خلص بدي القيه",
    "لغي الطلب", "كنسل الطلب", "cancel application", "cancel order",
    "ما بدي اكمل الطلب", "ما بدي أكمل الطلب", "مش حاب اكمل الطلب", "مش حاب أكمل الطلب",
    "مش حابه اكمل الطلب", "مش حابة أكمل الطلب", "وقف الطلب", "وقفو الطلب",
    "بطلت بدي الطلب", "صرف نظر عن الطلب", "ما رح اكمل بالطلب", "ما راح اكمل بالطلب",
    "مش موافق اكمل", "غير موافق اكمل",
  ];

  return hasAny(t, explicitCancelPhrases);
}

function isAlternativePaymentSourceText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const noWalletContext = hasAny(t, [
    "ما عندي محفظه", "ما عندي محفظة", "مش عندي محفظه", "مش عندي محفظة", "ما معي محفظه", "ما معي محفظة",
    "ما عندي اورنج", "ما عندي orange", "مش معي اورنج", "ما معي اورنج", "ما عندي كليك", "ما عندي بنك",
  ]);

  const alternativeContext = hasAny(t, [
    "من محفظه ثانيه", "من محفظة ثانية", "من رقم ثاني", "من حساب ثاني", "من حساب اخوي", "من حساب اختي",
    "من حساب صاحبي", "من شخص ثاني", "حدا يدفع عني", "واحد يدفع عني", "من بنك", "تحويل بنكي",
    "كليك", "cliq", "محفظه ثانيه", "محفظة ثانية", "مصدر ثاني", "طرف ثاني", "رقم ثاني",
  ]);

  const paymentContext = hasAny(t, ["ادفع", "دفع", "احول", "أحول", "تحويل", "حول", "حواله", "حوالة", "رسوم", "وصل", "ايصال", "إيصال"]);

  return noWalletContext || (alternativeContext && paymentContext);
}

function isReceiptUploadNeededText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const paidContext = hasAny(t, [
    "دفعت", "دفعتلكم", "دفعت لكم", "حولت", "حواله", "حوالة", "عملت تحويل", "وصلت الحواله", "وصلت الحوالة",
    "بعت الوصل", "ارسلت الوصل", "ابعت الوصل", "ابعث الوصل", "وين ارفع الوصل", "رابط الوصل", "رفع الوصل",
    "ايصال", "إيصال", "وصل الدفع", "صوره الوصل", "صورة الوصل", "payment receipt", "receipt",
  ]);

  const needsUploadContext = hasAny(t, ["رابط", "ارفع", "رفع", "ابعت", "ابعث", "ارسلت", "وصل", "ايصال", "إيصال", "دفعت", "حولت"]);

  return paidContext && needsUploadContext;
}


function isReceiptUploadConfirmationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const uploadContext = hasAny(t, [
    "رفعت", "تم رفع", "رفعتلكم", "رفعته", "رفعت الوصل", "رفعت وصل",
    "ارسلت الوصل", "أرسلت الوصل", "بعثت الوصل", "بعت الوصل",
    "uploaded", "submitted",
  ]);
  const receiptContext = hasAny(t, [
    "وصل دفع", "وصل الدفع", "الوصل", "ايصال دفع", "إيصال دفع", "receipt", "رسوم فتح الملف",
  ]);

  return uploadContext && receiptContext;
}

function isShortDocumentCompletionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return [
    "عبيته", "عبيتها", "عبيت", "عبّيته", "عبّيتها", "عبّيت",
    "خلصته", "خلصتها", "عملته", "عملتها", "رفعته", "رفعتها", "تم", "خلص",
  ].includes(t);
}

function isDocumentFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const documentContext = hasAny(t, [
    "هاي الهوية", "هاي هويه", "هذه الهوية", "هذه هويه", "صورة الهوية", "صوره الهويه",
    "الوجه الامامي", "الوجه الخلفي", "وجه الهوية", "ظهر الهوية",
    "هي كشف", "هاي كشف", "هذا كشف", "كشف جديد", "كشف الراتب", "شهادة راتب", "شهاده راتب",
    "هاي الوصل", "هذا الوصل", "وصل الدفع", "ايصال الدفع", "إيصال الدفع", "حوالة", "حواله",
    "هاي صورة", "هاي الصوره", "هذه الصورة", "الصورة الثانية", "الصوره الثانيه",
    "بعتلك الكشف", "بعثتلك الكشف", "ارسلت الكشف", "أرسلت الكشف",
    "بعتلك الهوية", "بعثتلك الهوية", "ارسلت الهوية", "أرسلت الهوية",
    "بعتلك الوصل", "بعثتلك الوصل", "ارسلت الوصل", "أرسلت الوصل",
    "كيف ارفق الملف", "كيف أرفق الملف", "كيف ارفع الملف", "كيف أرفع الملف",
    "وين ارفق الملف", "وين أرفق الملف", "وين ارفع الملف", "وين أرفع الملف",
    "كيف ارفق المستند", "كيف أرفق المستند", "كيف ارفع المستند", "كيف أرفع المستند",
    "رابط رفع الهوية", "رابط رفع الهويه", "رابط الهوية", "رابط الهويه",
    "وين ارفع الهوية", "وين أرفع الهوية", "كيف ارفع الهوية", "كيف أرفع الهوية",
  ]);

  return documentContext;
}

function isOfficialUploadConfirmationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const uploadAction = hasAny(t, [
    "رفعت", "رفعتلكم", "رفعته", "رفعتهم", "حملت", "حملته", "حملتهم",
    "رفقته", "رفقت", "رفقتهم", "ارفقته", "أرفقته",
    "تم الرفع", "تم رفع", "تم التحميل", "تم ارفاق", "تم إرفاق",
    "تم تعبئه", "تم تعبئة", "عبيت", "عبّيت", "عبأت", "عبّأت", "خلصت التعبئه", "خلصت التعبئة",
    "من الرابط", "على الرابط", "بالرابط", "عن طريق الرابط", "بالنموذج", "من النموذج",
    "uploaded", "submitted", "upload", "submit",
  ]);

  const documentContext = hasAny(t, [
    "كفيل", "الكفيل", "كشف", "راتب", "شهادة راتب", "هويه", "هوية", "وصل", "ايصال", "إيصال", "receipt",
  ]);

  return uploadAction && documentContext;
}

function isMediaUploadMessageType(messageType: string | null | undefined) {
  return ["image", "document", "video"].includes(String(messageType || "").toLowerCase());
}

function classifyIncomingIntent(text: string, messageType = "text"): CustomerIntent {
  const type = String(messageType || "text").toLowerCase();

  if (type === "reaction") return "reaction";
  if (type === "audio" || type === "voice") return "media_upload";
  if (type === "image" || type === "video") return "media_upload";
  if (type === "document") return "document_upload";

  // رسالة تأكيد رفع وصل الدفع أهم من أي تصنيف عام يحتوي رقم تتبع أو معلومات تواصل.
  if (isReceiptUploadConfirmationText(text)) return "receipt_upload_confirmation";

  // رسائل صفحة التتبع قد تحتوي وصفًا مثل "تم استلام كشف الراتب".
  // هذه متابعة طلب وليست رسالة رفع مستند جديدة.
  if (isStandardApplicationFollowupText(text)) return "order_status";

  // النصوص العادية تمر على المصنف العام ثم على DeepSeek مع سياق المحادثة.
  // لا نحول أي نص فيه كلمات مستندات تلقائيًا إلى قالب رفع ثابت.
  return classifyIntent(text);
}

type OfficialDocumentKind = "identity" | "salary_slip" | "guarantor" | "receipt" | "delay_decision" | "unknown";

function documentKindFromTextOrStatus(text: string, app?: ApplicationRecord | null, intent?: CustomerIntent): OfficialDocumentKind {
  const t = normalizeArabicText(text);
  const status = app?.status || "";
  const paymentStatus = app?.payment_status || "";

  if (String(intent || "") === "receipt_upload_needed" || hasAny(t, [
    "وصل", "ايصال", "إيصال", "حواله", "حوالة", "دفعت", "دفع", "رسوم", "كليك", "اورنج", "orange", "receipt",
  ])) {
    return "receipt";
  }

  if (hasAny(t, ["كفيل", "الكفيل", "ضامن", "الضامن", "guarantor"]) || status === "needs_guarantor") {
    return "guarantor";
  }

  if (hasAny(t, ["كشف", "راتب", "شهادة راتب", "شهاده راتب", "salary", "salary slip"]) || status === "needs_salary_slip") {
    return "salary_slip";
  }

  if (hasAny(t, ["هوية", "هويه", "الهوية", "الهويه", "بطاقة", "بطاقه", "الوجه الامامي", "الوجه الخلفي", "identity", "id"]) ||
    status === "needs_identity" ||
    status === "identity_requested") {
    return "identity";
  }

  if (status === "delivery_delay_notice_sent" || hasAny(t, ["استرداد", "تمديد", "انتظار", "delay", "refund"])) {
    return "delay_decision";
  }

  if (
    status === "preliminary_qualified" ||
    status === "customer_confirmed_continue" ||
    paymentStatus === "pending" ||
    paymentStatus === "pending_payment" ||
    paymentStatus === "payment_info_sent"
  ) {
    return "receipt";
  }

  return "unknown";
}

function officialDocumentLabel(kind: OfficialDocumentKind) {
  switch (kind) {
    case "identity": return "الهوية";
    case "salary_slip": return "كشف الراتب / شهادة الراتب";
    case "guarantor": return "بيانات الكفيل";
    case "receipt": return "وصل الدفع";
    case "delay_decision": return "خيار التمديد أو الاسترداد";
    default: return "المستند";
  }
}

function officialUploadUrlForKind(baseUrl: string, app: ApplicationRecord, kind: OfficialDocumentKind) {
  switch (kind) {
    case "identity": return identityUrl(baseUrl, app);
    case "salary_slip": return salarySlipUrl(baseUrl, app);
    case "guarantor": return guarantorUrl(baseUrl, app);
    case "receipt": return receiptUrl(baseUrl, app);
    case "delay_decision": return delayUrl(baseUrl, app);
    default: return "";
  }
}

function officialUploadInstructionReply(input: {
  app?: ApplicationRecord | null;
  baseUrl: string;
  from: string;
  text: string;
  intent: CustomerIntent;
  messageType?: string | null;
  memory?: Awaited<ReturnType<typeof getConversationMemory>>;
}) {
  const { app, baseUrl, text, intent, memory } = input;
  const normalizedText = normalizeArabicText(text);
  const hasMediaCaption = hasAny(normalizedText, ["صوره مرفقه مع تعليق", "فيديو من العميل مع تعليق", "تعليق الملف"]);
  const hasExplicitDocumentContext = hasAny(normalizedText, [
    "هويه", "هوية", "كشف راتب", "شهاده راتب", "شهادة راتب", "وصل دفع", "ايصال", "إيصال", "كفيل", "مستند", "وثيقه", "وثيقة",
  ]);

  if (hasMediaCaption && !hasExplicitDocumentContext) {
    return `وصلت الصورة وتعليقك.

اكتبلي الجملة أو الجزء اللي معترض عليه أو بدك توضيحه، وبجاوبك عليه مباشرة بدل ما أتعامل مع الصورة كمستند للرفع.`;
  }

  if (!app) {
    return `وصلت الرسالة على واتساب 🌿

بس للتوضيح المهم: صور أو ملفات واتساب ما بتنحسب كرفع رسمي داخل الملف.

حتى نربط المستند بالطلب، ابعث رقم التتبع AM- أو رقم الهاتف المستخدم بالطلب، وبعدها بنعطيك رابط الرفع الصحيح حسب حالة الملف.`;
  }

  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const kind = documentKindFromTextOrStatus(text, app, intent);
  const label = officialDocumentLabel(kind);
  const url = officialUploadUrlForKind(baseUrl, app, kind);
  const sentUrls = memory?.sentUrls || [];
  const forceResend = isExplicitOperationalLinkRequestText(text);
  const alreadySent = Boolean(url && sentUrls.includes(url) && !forceResend);

  if (!url || kind === "unknown") {
    return `وصلت الرسالة يا ${name} 🌿

بس للتوضيح المهم: الصور أو الملفات المرسلة على واتساب لا تُعتمد رسميًا داخل الملف.

حتى أعطيك رابط الرفع الصحيح، اكتبلي نوع المستند: هوية / كشف راتب / وصل دفع / كفيل.

رقم الطلب:
${tracking}`;
  }

  const linkLine = alreadySent
    ? `رابط ${label} أرسلناه لك سابقًا بنفس المحادثة. ارفع المستند من نفس الرابط حتى ينربط رسميًا بالطلب.`
    : `حتى ينربط ${label} رسميًا بالطلب، ارفعه من الرابط التالي:
${url}`;

  return `وصلت الرسالة يا ${name} 🌿

توضيح مهم: صور أو ملفات واتساب بنعتبرها توضيح فقط، وما بتنحسب كرفع رسمي داخل الملف.

${linkLine}

رقم الطلب:
${tracking}`;
}

async function claimMediaBurstReplyLock(input: {
  waId: string;
  incomingMessageId?: string | null;
  windowSeconds?: number;
}) {
  const cleanWaId = String(input.waId || "").trim();
  const windowSeconds = input.windowSeconds || 90;

  if (!cleanWaId) return { shouldReply: true, reason: "missing_wa_id" };

  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const lock = {
    lock_key: `media-burst:${cleanWaId}:${bucket}`,
    wa_id: cleanWaId,
    incoming_message_id: input.incomingMessageId || null,
    reply_body: "media_upload_burst_notice",
    created_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabaseAdmin
      .from("whatsapp_outgoing_reply_locks")
      .insert(lock);

    if (!error) return { shouldReply: true, reason: "media_burst_first" };

    if ((error as any).code === "23505") {
      return { shouldReply: false, reason: "media_burst_duplicate" };
    }

    if ((error as any).code === "42P01") {
      console.error("whatsapp_outgoing_reply_locks table is missing; media burst protection degraded.");
      return { shouldReply: true, reason: "missing_outgoing_lock_table" };
    }

    console.error("media burst lock insert failed:", error);
    return { shouldReply: true, reason: "media_burst_lock_error" };
  } catch (error) {
    console.error("media burst lock exception:", error);
    return { shouldReply: true, reason: "media_burst_lock_exception" };
  }
}


function isSupplierDelayQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const deviceContext = hasAny(t, [
    "اجهزه", "أجهزة", "الجهاز", "جهازي", "تلفون", "تلفوني", "موبايل", "موبايلي",
    "ايفون", "سامسونج", "المورد", "الوكلاء", "توريد", "شغلي عليه", "كل شغلي عليه",
  ]);
  const delayContext = hasAny(t, [
    "وصلت", "ما وصلت", "لسه", "لسا", "وين", "متى", "تاخير", "تأخير", "تسليم", "استلام",
    "صبر", "المورد", "مطول", "يطول", "طولت", "اذا مطول", "إذا مطول", "خربان", "اشوف شو اعمل",
    "أشوف شو أعمل", "مضطر", "مستعجل", "شغلي عليه", "كل شغلي عليه",
    "كم بده وقت", "كم بدها وقت", "قديش بده وقت", "ليوصل", "لحتى يوصل", "حتى يوصل",
    "يوصلكم", "يوصلوكم", "توصل عندكم", "يوصل عندكم", "بتوصل الاجهزه", "بتوصل الأجهزة",
    "بالعاده كم", "بالعادة كم", "اسبوع", "أسبوع", "اكتر من اسبوع", "أكثر من أسبوع",
    "بتستنو", "بتستنوا", "بانتظار", "تحت المعالجه", "تحت المعالجة", "مقبول ولا",
  ]);

  return deviceContext && delayContext;
}


function escapeRegExp(value: string) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNormalizedWord(text: string, words: string[]) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return words.some((word) => {
    const normalizedWord = normalizeArabicText(word);
    if (!normalizedWord) return false;
    const pattern = new RegExp(`(^|[^\u0600-\u06FFA-Za-z0-9])${escapeRegExp(normalizedWord)}($|[^\u0600-\u06FFA-Za-z0-9])`, "u");
    return pattern.test(t);
  });
}

function isStandardApplicationFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const hasStandardIntro = hasAny(t, [
    "ارغب بمتابعه الطلب واستكمال الخطوات عبر واتساب",
    "ارغب بمعرفه اخر تحديث او الخطوه التاليه",
    "اريد متابعه طلبي لدي الامين للاقساط",
    "قدمت طلب موافقه مبدييه لدي الامين",
    "رقم التتبع",
    "الحاله الحاليه",
  ]);

  const hasTrackingContext = /am-\d{8,}/i.test(t) || hasAny(t, ["رقم التتبع", "رقم الهاتف"]);
  const hasOrderContext = hasAny(t, ["متابعه الطلب", "طلبي", "الطلب", "اخر تحديث", "الخطوه التاليه", "استكمال الخطوات"]);

  return (hasStandardIntro && hasOrderContext) || (hasTrackingContext && hasOrderContext && t.length > 60);
}

function isTrackingLinkRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  // V1.6.5: specific operational links must not be converted to /track.
  const specificOperationalContext = hasAny(t, [
    "هوية", "هويه", "الهوية", "الهويه",
    "وصل", "ايصال", "إيصال", "حواله", "حوالة",
    "كشف راتب", "شهادة راتب", "شهاده راتب",
    "كفيل", "الضامن", "ضامن",
    "استرداد", "استرجاع", "refund",
    "اختيار الجهاز", "تغيير الجهاز", "تعديل الجهاز",
  ]);
  if (specificOperationalContext) return false;

  const asksForLink = hasAny(t, [
    "ممكن الرابط", "ابعث الرابط", "ابعت الرابط", "ارسل الرابط", "وين الرابط", "اين الرابط", "أين الرابط", "هات الرابط",
    "اين الرايط", "وين الرايط", "بدي الرايط",
    "بدي الرابط", "رابط المتابعه", "لينك المتابعه", "الرابط لو سمحت", "وين اللينك", "بدي اللينك", "link",
  ]);

  const hasLinkWord = hasAny(t, ["رابط", "الرايط", "لينك", "link"]);
  const hasRequestWord = hasAny(t, ["ممكن", "ابعث", "ابعت", "ارسل", "هات", "اعطيني", "وين", "اين", "أين", "بدي"]);

  return asksForLink || (hasLinkWord && hasRequestWord);
}


function isExplicitOperationalLinkRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const asksForLink = hasAny(t, [
    "بدي الرابط", "ابعث الرابط", "ابعت الرابط", "ارسل الرابط", "أرسل الرابط",
    "رجع ابعث الرابط", "رجع ابعت الرابط", "الرابط راح", "ضاع الرابط", "مش لاقي الرابط",
    "وين الرابط", "هات الرابط", "اعطيني الرابط", "أعطيني الرابط", "لينك لو سمحت",
  ]);
  const operationalContext = hasAny(t, [
    "وصل", "ايصال", "إيصال", "هوية", "هويه", "كشف راتب", "شهادة راتب", "شهاده راتب",
    "كفيل", "المستند", "التتبع", "متابعة", "استرداد", "اختيار الجهاز", "تغيير الجهاز",
  ]);
  const linkAndRequest = hasAny(t, ["رابط", "لينك", "link"]) && hasAny(t, [
    "بدي", "ابعث", "ابعت", "ارسل", "أرسل", "هات", "اعطيني", "أعطيني", "وين", "راح", "ضاع", "مفقود",
  ]);

  return (asksForLink && operationalContext) || (linkAndRequest && operationalContext);
}

function isExplicitRefundRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  if (isExplicitOperationalLinkRequestText(t)) return false;
  if (hasAny(t, [
    "الغاء طلب الاسترداد", "إلغاء طلب الاسترداد", "وقف الاسترداد", "اوقف الاسترداد",
    "ما بدي استرداد", "بدي اكمل بالمعامله", "بدي أكمل بالمعاملة",
  ])) return false;

  const strongRefundLanguage = hasAny(t, [
    "استرداد", "استرجاع", "بدي استرد", "بدي استرجع",
    "رجعوا فلوسي", "رجعولي فلوسي", "رجعو فلوسي", "ردولي فلوسي", "ردوا فلوسي", "ردو فلوسي",
    "رجعوا الرسوم", "رجعولي الرسوم", "رجعو الرسوم", "ردولي الرسوم", "ردوا الرسوم", "ردو الرسوم",
    "بدي فلوسي", "مصاريي رجعوها", "استرجاع الرسوم", "استرداد الرسوم",
    "رجعوا الخمسه", "رجعوا الخمسة", "رجعولي الخمسه", "رجعولي الخمسة",
    "بدي ارجع ال 5", "بدي أرجع ال 5", "بدي ارجع 5", "بدي أرجع 5",
    "بدي ارجع الخمس", "بدي أرجع الخمس", "بدي ارجع الرسوم", "بدي أرجع الرسوم",
    "بدي ارجع المبلغ", "بدي أرجع المبلغ",
    "الخمس دنانير رجعهم", "الخمسه دنانير رجعهم", "الخمسة دنانير رجعهم",
  ]);
  if (strongRefundLanguage) return true;

  // V1.1.9.1: bare verbs like "ردولي" are ambiguous. For example
  // "كم تاخذوا وقت لبين ما تردولي خبر؟" asks when we will reply, not for a refund.
  const ambiguousReturnVerb = hasAny(t, [
    "رجعولي", "رجعهم", "رجعلي", "رجعوهم", "ردهم", "ردولي",
  ]);
  const financialAnchor = hasAny(t, [
    "فلوس", "مصاري", "رسوم", "المبلغ", "مبلغ", "دينار", "دنانير",
    "الخمسه", "الخمسة", "حواله", "حوالة", "دفعت", "دفعته", "دفع",
  ]);

  return ambiguousReturnVerb && financialAnchor;
}

function hasConfirmedRefundPayment(app: ApplicationRecord | null | undefined) {
  return hasConfirmedPaymentEvidence(app);
}

function hasValidActiveRefund(app: ApplicationRecord | null | undefined) {
  if (!app) return false;
  const refundState =
    app.status === "refund_requested" ||
    app.payment_status === "refund_requested" ||
    app.status === "refund_completed";
  return refundState && hasConfirmedRefundPayment(app);
}

function unpaidRefundGuardReply(app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  return `ما في دفع مؤكد مسجل على هذا الطلب، لذلك ما تم تسجيل أي استرداد وما في مبلغ ظاهر قابل للاسترداد حاليًا.
إذا كنت دفعت فعلًا، لازم يتم أولًا التحقق من وصل الدفع من خلال المسار الرسمي المرتبط بطلبك.
رقم الطلب: ${tracking}`;
}

function isContextualShortRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  const exact = [
    "متى", "امتى", "إمتى", "لحد متى", "طيب متى", "طيب يعني لمتى", "يعني لمتى",
    "وبعدين", "هسا شو", "هسه شو", "طيب هسا", "طيب هسه",
    "نفس مشكله", "نفس مشكلة", "نفس المشكله", "نفس المشكلة",
  ].includes(t);
  if (exact) return true;

  if (t.length <= 120 && hasAny(t, ["جربت ع جهاز ثاني", "جربت على جهاز ثاني", "جربت من جهاز ثاني"]) && hasAny(t, ["نفس مشكله", "نفس مشكلة", "نفس المشكله", "نفس المشكلة"])) return true;

  // Continuations that are meaningful only with the immediately preceding customer turn.
  if (t.length <= 140 && hasAny(t, [
    "طيب هسا انا بدي اغير", "طيب هسه انا بدي اغير", "انا بدي اغير وبدي اياه", "بدي اغير وبدي اياه",
    "طيب خلص انا بدي اغير", "خلص انا بدي اغير",
    "اخذهم منه", "أخذهم منه", "اروح له اخذهم", "أروح له آخذهم", "اروح ع بيته", "أروح ع بيته",
  ])) return true;

  return false;
}

function isCancelRefundRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const cancelContext = hasAny(t, [
    "الغاء", "الغي", "ألغي", "الغوا", "لغي", "كنسل", "cancel",
    "بطلت بدي", "ما بدي اكمل", "ما بدي أكمل", "مش حاب اكمل", "مش حاب أكمل",
    "ما بدي الجهاز", "ما بدي التلفون", "بطلت بدي الجهاز", "بطلت بدي التلفون",
    "لا اريد الجهاز", "لا أريد الجهاز",
  ]);
  const refundContext = hasAny(t, ["استرد", "استرداد", "استرجاع", "رجع", "رجعولي", "رجعوا", "فلوسي", "مصاري", "الرسوم", "refund"]);

  return cancelContext && refundContext;
}


function isEmotionalPressureText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  // رسائل المتابعة الآلية القياسية يجب ألا تتحول لتعاطف عاطفي.
  // السبب القديم كان أن كلمة "الأمين" تحتوي "أمي" عند البحث الجزئي.
  if (isStandardApplicationFollowupText(t)) return false;

  const strongPersonalContext = hasNormalizedWord(t, [
    "خطيبتي", "خطيبي", "زوجتي", "زوجي", "مرتي", "خطيب", "خطيبه", "خطيبة",
    "ابني", "بنتي", "اولادي", "أولادي", "ابوي", "أبوي",
    "هدية", "هديه", "عيد", "مناسبة", "خطبة", "خطبه", "عرس", "زواج",
  ]) || hasAny(t, [
    "عيد ميلاد", "شخص عزيز", "وعدتها", "وعدته", "وعدتهم", "بضحك عليها", "بضحك عليه",
    "حاس حالي بكذب", "مبين اني بكذب",
  ]);

  const embarrassmentContext = hasAny(t, [
    "احراج", "إحراج", "محرج", "انحرجت", "احرجتني", "فضحتني", "بهدلة", "بهدله",
    "باجلها", "بأجلها", "باجله", "بأجله", "بأجلهم", "باجلهم", "كل يوم باجل", "كل يوم بحكي",
    "صارلي شهر", "صار لي شهر", "الي شهر", "إلي شهر", "الي شهرين", "إلي شهرين", "شهرين", "اسبوعين", "أسبوعين",
  ]);

  const deviceContext = hasAny(t, [
    "تلفون", "موبايل", "جهاز", "ايفون", "سامسونج", "الجهاز", "جهازي", "الطلب", "طلبي",
  ]);

  return (strongPersonalContext && (embarrassmentContext || deviceContext)) || (embarrassmentContext && deviceContext);
}


function isSiteOrTrackingSystemIssueText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const siteContext = hasAny(t, [
    "الموقع", "السايت", "الرابط", "الرايط", "لينك", "تتبع", "التتبع", "صفحه التتبع", "صفحة التتبع",
    "حاله الطلب", "حالة الطلب", "طلبي", "الطلب", "جلب الطلبات", "البحث عن الطلب", "عرض الطلب",
    "اقدم الطلب", "أقدم الطلب", "التقديم", "اختار جهاز", "اختيار جهاز", "اكمل الاجراءات", "أكمل الإجراءات",
    "track", "tracking", "website", "site", "link",
  ]);

  const problemContext = hasAny(t, [
    "مش شغال", "ما بشتغل", "ما بفتح", "ما فتح", "مو راضي يفتح", "مش راضي يفتح", "ما بطلع", "مش ظاهر", "ما ظهر", "ما بيظهر",
    "خطا", "خطأ", "ايرور", "error", "404", "not found", "تعطل", "واقع", "خربان", "معلق",
    "حاول مره اخرى", "حاول مرة أخرى", "حدث خطا", "حدث خطأ", "خطا في الاتصال", "خطأ في الاتصال",
    "لا يمكنني تتبع", "مش قادر اتتبع", "مش قادر أتتبع", "ما بقدر اتتبع", "ما بقدر أتتبع",
    "ما بجيب", "ما جاب", "مش لاقي", "غير موجود",
    "لم يتم العثور", "could not be found", "page could not be found",
  ]);

  return siteContext && problemContext;
}

function isOfficePickupPolicyText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  // V1.6.5: "بقدر أكمل الطلب بالفرع/المكتب؟" is an office-process question,
  // not a payment/review follow-up. Customer-facing replies still use "المكتب" only.
  const officeCompletionQuestion = hasAny(t, [
    "اكمل الطلب بالفرع", "أكمل الطلب بالفرع", "اكمل بالفرع", "أكمل بالفرع",
    "اكمل الطلب بالمكتب", "أكمل الطلب بالمكتب", "اكمل بالمكتب", "أكمل بالمكتب",
    "اقدم بالمكتب", "أقدم بالمكتب", "اقدم بالفرع", "أقدم بالفرع",
  ]);
  if (officeCompletionQuestion) return true;

  if (isOfficeLocationText(t)) return false;

  const aramexContext = hasAny(t, [
    "ارامكس", "أرامكس", "aramex", "ارامكسو", "ارمكس",
  ]);

  const deliveryServiceContext = hasAny(t, [
    "توصيل", "توصلوا", "بتوصلوا", "يوصل", "وصلولي", "وصلوه", "وصلوها", "دليفري", "delivery",
    "شحن", "shipping", "شركة شحن", "شركات شحن", "شركة توصيل", "مندوب", "مندوب توصيل",
    "عالبيت", "على البيت", "للبيت", "للمحافظات", "للمحافظه", "للمحافظة", "خارج عمان", "للاربد", "للزرقاء", "للعقبه", "للعقبة",
  ]);

  const pickupContext = hasAny(t, ["استلام", "استلم", "استلمه", "اخذه", "اخدو", "آخذه", "المكتب", "موعد مسبق", "احضر", "اجي", "أجي", "اطلع", "أطلع"]);
  const officeContext = hasAny(t, ["المكتب", "مكتبكم", "مكتب", "استلام من المكتب", "استلم من المكتب", "موعد مسبق"]);
  const clearSelfPickup = hasAny(t, [
    "ما بقدر اطلع اخذو", "ما بقدر أطلع آخذه", "بقدر اطلع اخذو", "بقدر أطلع آخذه",
    "اطلع استلمو", "أطلع أستلمه", "اطلع استلمه", "اجي استلمه", "أجي أستلمه",
    "استلمه بنفسي", "اخذه بنفسي", "آخذه بنفسي",
  ]);

  return aramexContext || deliveryServiceContext || clearSelfPickup || (pickupContext && officeContext);
}

function isInstallmentBudgetQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const installmentContext = hasAny(t, [
    "قسط", "القسط", "شهري", "شهريا", "شهريًا", "بالشهر", "تقسيط", "اقسط", "أقسط",
  ]);
  const budgetContext = hasAny(t, [
    "ارفع قيمه القسط", "أرفع قيمة القسط", "ارفع قيمة القسط", "اغير قيمه القسط", "أغير قيمة القسط",
    "اخليها", "أخليها", "بقدر لحد", "حدي", "ميزانيتي", "بالكثر", "حد اقصى", "حد أقصى",
  ]);
  const monthlyNumber = /(?:قسط|شهري|شهريا|شهريًا|بالشهر)[^\n]{0,30}[0-9٠-٩]+|[0-9٠-٩]+[^\n]{0,20}(?:شهري|شهريا|شهريًا|بالشهر|دينار)/i.test(t);

  return (installmentContext && budgetContext) || monthlyNumber;
}

function isGeneralMonthlyPaymentQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, [
    "كيف الدفع الشهري", "طريقة الدفع الشهري", "طريقه الدفع الشهري", "كيف ادفع القسط", "كيف أدفع القسط",
    "كيف بدفع القسط", "وين بدفع القسط", "اقتطاع من البنك", "اقتطاع مباشر", "ينخصم من البنك",
    "خصم مباشر من البنك", "ادفع كل شهر", "أدفع كل شهر", "ازور المكتب كل شهر", "أزور المكتب كل شهر",
    "كيف رح يصير دفع", "كيف رح يصير الدفع", "كيف بصير دفع", "كيف بصير الدفع",
    "بعد الاستلام كيف ادفع", "بعد الاستلام كيف أدفع", "دفع الاقساط", "دفع الأقساط",
    "كمبيالات", "كمبياله", "كمبيالة", "مع شو رح اتعامل", "مع شو رح أتعامل",
  ]);
}

function isInterestOrReligiousFinancingQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const interestContext = hasAny(t, [
    "فوائد", "فائده", "فائدة", "نسبة الفائدة", "نسبه الفائده",
    "ربا", "ربوي", "ربويه", "ربوية", "شرعي", "شرعيه", "شرعية",
    "حلال", "حرام",
  ]);
  const installmentContext = hasAny(t, [
    "قسط", "اقساط", "أقساط", "تقسيط", "الجهاز", "الهاتف", "تلفون", "موبايل",
    "البنك", "تمويل", "سعر", "دفعة", "دفعه",
  ]);

  return interestContext && installmentContext;
}

function isInstallmentDurationQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "القسط ع كم شهر", "القسط على كم شهر", "الاقساط ع كم شهر", "الأقساط ع كم شهر",
    "الاقساط على كم شهر", "الأقساط على كم شهر", "التقسيط ع كم شهر", "التقسيط على كم شهر",
    "كم شهر تقسيط", "كم شهر الاقساط", "كم شهر الأقساط", "مدة التقسيط", "مده التقسيط",
    "عدد اشهر التقسيط", "عدد أشهر التقسيط", "عدد الاقساط", "عدد الأقساط",
  ]);
}

function isShortInstallmentDurationFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return [
    "كم شهر", "الكم شهر", "كم شهر؟", "ع كم شهر", "على كم شهر", "المدة كم", "المده كم",
  ].includes(t);
}

function interestAndFinancingClarificationReply() {
  return `للتوضيح: الأمين للأقساط ليست بنكًا ولا شركة تمويل أو إقراض، وما بنعطي توصيفًا شرعيًا أو مصرفيًا غير موثق من عندنا.

السعر وجدول الأقساط وأي مبالغ مرتبطة بالجهاز بتكون واضحة ضمن الطلب والاتفاق المعتمد قبل الاستلام.

إذا سؤالك عن جهاز محدد أو مدة/قسط محدد، بعطيك فقط الخيار الظاهر والمعتمد على الطلب بدون تخمين.`;
}

function installmentDurationReply(baseUrl: string, app?: ApplicationRecord | null) {
  const deviceLine = app?.device_name
    ? `الجهاز المسجل حاليًا: ${customerFacingDeviceName(app.device_name) || "غير محدد"}.\n\n`
    : "";

  return `${deviceLine}مدة التقسيط ما بنثبتها من واتساب من غير الخيار المعتمد على الجهاز أو الجدول النهائي.

المدة الصحيحة هي اللي بتظهر ضمن خيارات الجهاز والاتفاق الخاص بطلبك، وما رح أعطيك عدد أشهر من عندي إذا مش ظاهر بشكل مؤكد.

رابط الأجهزة والخيارات الحالية:
${baseUrl}/products`;
}

function isAdditionalDeviceQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  const secondDevice = hasAny(t, [
    "جهاز ثاني", "جهاز تاني", "تلفون ثاني", "تلفون تاني", "موبايل ثاني", "موبايل تاني",
    "جهازين", "جهازيين", "جهازين اثنين", "تلفونين", "موبايلين",
    "كمان جهاز", "اضيف جهاز", "أضيف جهاز", "انزل جهاز", "أنزل جهاز",
  ]);
  const questionOrAdd = hasAny(t, [
    "بقدر", "ممكن", "بنفع", "بزبط", "اضيف", "أضيف", "انزل", "أنزل", "اخذ", "آخذ", "؟",
  ]);
  return secondDevice && questionOrAdd;
}

function isExplicitNewApplicationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "طلب جديد",
    "اقدم طلب جديد",
    "أقدم طلب جديد",
    "بدي اقدم طلب جديد",
    "بدي أقدم طلب جديد",
    "اعمل طلب جديد",
    "أعمل طلب جديد",
    "افتح طلب جديد",
    "فتح طلب جديد",
    "طلب ثاني",
    "ابدا طلب",
    "ابدأ طلب",
  ]);
}


function isApprovalTimingQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const approvalContext = hasAny(t, [
    "موافقه", "الموافقه", "موافقات", "الموافقات", "موافقة", "الموافقة", "قبول", "القبول", "قرار الطلب", "نتيجه الطلب", "نتيجة الطلب",
  ]);
  const timingContext = hasAny(t, [
    "متى", "متي", "قديش", "كم يوم", "خلال كم", "تطلع", "تصدر", "تظهر", "تخلص", "المده", "المدة",
  ]);

  return approvalContext && timingContext;
}

function isApplicationDataCorrectionConfirmationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return /(?:اكد|موافق|نعم)\s+(?:على\s+)?(?:تعديل|تصحيح)\s+(?:الراتب|راتبي)\s+(?:الى|الي)\s+\d{2,5}/i.test(t);
}

function isApplicationDataCorrectionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  if (isApplicationDataCorrectionConfirmationText(t)) return false;

  return hasAny(t, [
    "بدي اعدل راتبي", "عدل راتبي", "تعديل راتبي", "تعديل الراتب",
    "بدي اصحح راتبي", "اصحح راتبي", "تصحيح راتبي", "تصحيح الراتب",
    "الراتب الصحيح", "راتبي الصحيح", "دخلت الراتب غلط", "كتبت الراتب غلط", "حطيت الراتب غلط",
    "دخلت راتبي غلط", "كتبت راتبي غلط", "حطيت راتبي غلط",
  ]) || (
    hasAny(t, ["راتب", "راتبي", "الراتب"]) &&
    hasAny(t, ["غلط", "بالغلط", "تعديل", "عدل", "تصحيح", "اصحح"])
  );
}

function isApplicationFactsStatementText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const mentionsSalary = hasAny(t, ["راتبي", "الراتب"]);
  const mentionsSocialSecurity = hasAny(t, ["مش مشترك بالضمان", "غير مشترك بالضمان", "مش بالضمان", "بدون ضمان"]);
  const soundsDeclarative = hasAny(t, ["انا حطيت", "كتبت", "دخلت", "سجلت", "راتبي", "مش مشترك", "غير مشترك"]);

  return soundsDeclarative && (mentionsSalary || mentionsSocialSecurity);
}

type SalaryCorrectionDetails = {
  storedSalary: number | null;
  correctSalary: number | null;
  wrongSalary: number | null;
};

function extractSalaryCorrectionDetails(text: string, storedSalaryValue: number | string | null | undefined): SalaryCorrectionDetails {
  const t = normalizeArabicText(text);
  const storedSalary = getSalaryNumber(storedSalaryValue);

  const correctPatterns = [
    /(?:اكد|موافق|نعم)\s+(?:على\s+)?(?:تعديل|تصحيح)\s+(?:الراتب|راتبي)\s+(?:الى|الي)\s+(\d{2,5})/i,
    /(?:الراتب الصحيح|راتبي الصحيح|الصحيح)\s*(?:هو|=|:)?\s*(\d{2,5})/i,
    /(?:بدي\s+)?(?:اعدل|اصحح|تعديل|تصحيح)\s+(?:الراتب|راتبي)\s+(?:الى|الي)\s+(\d{2,5})/i,
    /(?:راتبي|الراتب)\s*(?:هو|صار|=|:)?\s*(\d{2,5})/i,
  ];

  const wrongPatterns = [
    /(?:حطيت|كتبت|دخلت|سجلت)\s*(?:الراتب|راتبي)?\s*(\d{2,5})\s*(?:بالغلط|غلط)/i,
    /(\d{2,5})\s*(?:بالغلط|غلط)/i,
  ];

  let correctSalary: number | null = null;
  let wrongSalary: number | null = null;

  for (const pattern of correctPatterns) {
    const match = t.match(pattern);
    const value = match ? Number(match[1]) : NaN;
    if (Number.isFinite(value)) {
      correctSalary = value;
      break;
    }
  }

  for (const pattern of wrongPatterns) {
    const match = t.match(pattern);
    const value = match ? Number(match[1]) : NaN;
    if (Number.isFinite(value)) {
      wrongSalary = value;
      break;
    }
  }

  if (correctSalary !== null && wrongSalary !== null && correctSalary === wrongSalary) {
    correctSalary = null;
  }

  return { storedSalary, correctSalary, wrongSalary };
}

function salaryValueIsReasonable(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 100 && value <= 10000;
}

function isExplicitHumanAgentRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, [
    "بدي موظف", "احكي مع موظف", "بدي احكي مع موظف", "ممكن اتواصل مع موظف", "ممكن أتواصل مع موظف",
    "بدي اتواصل مع موظف", "بدي أتواصل مع موظف", "بدي اتواصل مع حدا من الموظفين", "بدي أتواصل مع حدا من الموظفين",
    "بدي حدا يحكي معي", "بدي حد يحكي معي", "بدي شخص احكي معه", "بدي شخص أحكي معه",
    "بدي انسان", "بدي إنسان", "بدي بني ادم", "بدي بني آدم", "بدي بني تدم", "بدي بشر", "بدي بشرر",
    "بدي اتواصل مع بشر", "بدي أتواصل مع بشر", "وين البشر", "حدا حقيقي", "شخص حقيقي", "موظف حقيقي",
    "رد آلي", "رد الي", "رد ألي", "مش رد آلي", "ما بدي رد آلي", "ما بدي رد الي",
    "انت روبوت", "انت روبورت", "انتي روبوت", "انتي روبورت", "اللي بيحكي معي ai", "اللي بحكي معي ai",
    "ما بدي احكي مع ai", "ما بدي أحكي مع ai", "talk to a human", "live agent", "real person",
  ]);
}

function isPureNonTransactionalUtteranceText(text: string) {
  const t = normalizeArabicText(text).replace(/[؟?!.,،؛:]+$/g, "").trim();
  return [
    "لا اله الا الله", "لا الاه الا الله", "لا إله إلا الله",
    "لا حول الله", "لا حول ولا قوه الا بالله", "لا حول ولا قوة الا بالله", "لا حول ولا قوة إلا بالله",
    "ان شاء الله", "إن شاء الله", "الله كريم", "الله المستعان",
  ].map((value) => normalizeArabicText(value)).includes(t);
}

function isExplicitIdentityUploadLinkRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t || !hasAny(t, ["هويه", "هوية", "الهويه", "الهوية"])) return false;
  return hasAny(t, ["رابط", "لينك", "وين ارفع", "وين أرفع", "احط فيه", "أحط فيه", "ارفع من وين", "أرفع من وين"]);
}

function isMinimumSalaryQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, [
    "ادنى حد للراتب", "أدنى حد للراتب", "اقل راتب", "أقل راتب", "كم لازم يكون راتبي",
    "كم الراتب المطلوب", "راتب للقبول", "راتب عشان انقبل", "راتب عشان أنقبل",
  ]);
}

function minimumSalaryReply(app?: ApplicationRecord | null) {
  const statusLine = app ? `\n\nوبالنسبة لطلبك الحالي: ${statusHumanLabel(app.status || "")}.` : "";
  return `ما في رقم ثابت أقدر أوعدك إن القبول مرتبط فيه. بنراجع الطلب حسب البيانات والمستندات المقدمة ومصدر الدخل أو العمل، والقرار النهائي بيطلع بعد دراسة الملف.${statusLine}`;
}

function isExplicitAppointmentRequestText(text: string) {
  const t = normalizeArabicText(text);
  return hasAny(t, ["بدي موعد", "اريد موعد", "أريد موعد", "موعد استلام", "متى موعدي", "اعطيني موعد", "أعطيني موعد"]);
}

function appointmentRequestReply(app?: ApplicationRecord | null) {
  if (!app) return "إذا قصدك موعد الاستلام، الموعد بيتحدد فقط بعد الموافقة النهائية. ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب وبشوفلك الحالة الحالية.";
  if (["approved", "customer_accepts_delivery_delay"].includes(app.status || "")) return deliveryDateReply(app, "");
  return `إذا قصدك موعد الاستلام، لسه ما بنثبت موعد قبل الموافقة النهائية. حالة طلبك الحالية: ${statusHumanLabel(app.status || "")}.\nرقم الطلب: ${app.tracking_id || app.id}`;
}

function isFreshApplicationSubmissionFollowupText(text: string) {
  const t = normalizeArabicText(text);
  return hasAny(t, ["سجلت من اول جديد", "سجلت من أول جديد", "رجعت قدمت", "قدمت من جديد", "سجلت من الرقم", "قدمت من الرقم"]);
}

function isClearlyExternalCommerceText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  const external = hasAny(t, ["شي ان", "شي إن", "shein", "طلبية شي", "طلبيه شي"]);
  const alameen = hasAny(t, ["الامين", "الأمين", "تقسيط", "رقم التتبع", "am-"]);
  return external && !alameen;
}

function isLegacyLimitedStockUiMessageText(text: string) {
  const t = normalizeArabicText(text);
  return hasAny(t, ["مخزون محدود", "المخزون محدود"]);
}

function isProductAvailabilityUiIssueText(text: string) {
  const t = normalizeArabicText(text);
  return hasAny(t, [
    "مخزون محدود", "المخزون محدود", "ما لقينا جهاز مطابق", "ما لقينا جهازا مطابقا",
    "ما لقيت الجهاز بالموقع", "مش لاقي الجهاز بالموقع",
  ]);
}

function limitedStockUiCorrectionReply(baseUrl: string) {
  return `الرسالة اللي كانت تظهر لك «مخزون محدود» كانت بسبب خطأ تقني بواجهة الموقع فقط، وما كانت تعني إن الجهاز غير متوفر.

تم تصحيح المشكلة، وتقدر ترجع لقائمة الأجهزة وتختار الجهاز وتكمل تقديم الطلب بشكل طبيعي.

رابط الأجهزة:
${baseUrl}/products

وبنعتذر منك عن اللخبطة اللي صارت.`;
}

function isInstallmentAndRequirementsQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  const installment = hasAny(t, ["نظام التقسيط", "كيف التقسيط", "تقسيط", "القسط", "الاقساط", "الأقساط"]);
  const requirements = isGeneralDocumentsQuestionText(t) || hasAny(t, ["شو ارفق", "شو أرفق", "راتب بنك", "كمبيالات"]);
  return installment && requirements;
}

function classifyIntent(text: string): CustomerIntent {
  const t = normalizeArabicText(text);
  const broadText = stripIdentifiersForIntent(t);

  if (!t) return "unknown";

  // V1.6.4 CURRENT MESSAGE PRIORITY: a concrete site/tracking failure or product UI issue
  // outranks stale complaint/social/payment context from previous turns.
  if (isSiteOrTrackingSystemIssueText(t)) return "site_issue";
  if (isProductAvailabilityUiIssueText(t)) return "products";

  // أسئلة هوية النشاط والوضع التنظيمي تُحسم قبل أي قالب متابعة أو تصعيد قانوني.
  if (isRegulatoryStatusQuestionText(t)) return "regulatory_status";
  if (isBusinessIdentityQuestionText(t)) return "business_identity";

  // رسائل المتابعة الرسمية من صفحة التتبع ليست ضغطًا عاطفيًا حتى لو احتوت كلمة "الأمين".
  if (isStandardApplicationFollowupText(t)) return "order_status";
  if (hasAny(t, [
    "تتاكدلي اذا تقدم", "تأكدلي اذا تقدم", "تتاكدلي إذا تقدم", "تأكدلي إذا تقدم",
    "الطلب اتاكد", "الطلب تأكد", "الطلب وصل صح", "تأكدلي الطلب وصل",
  ])) return "order_status";

  // إلغاء طلب تغيير الجهاز لا يعني إلغاء طلب التقسيط نفسه.
  if (isCancelDeviceChangeText(t)) return "device_change_cancelled";

  // V1.1.4 DEVICE SELECTION INTENT
  if (isDeviceSelectionText(t)) return "products";

  // تغيير الجهاز ليس إلغاءً. يجب حسمه قبل أي منطق إلغاء.
  if (isDeviceChangeText(t)) return "device_change";
  if (isAdditionalDeviceQuestionText(t)) return "products";

  // التراجع عن إلغاء طلب سابق مسار مستقل، ولا يُعامل كطلب استمرار عادي.
  if (isReopenCancelledConfirmedText(t)) return "reopen_cancelled_confirmed";
  if (isReopenCancelledRequestText(t)) return "reopen_cancelled_request";

  // تأكيد رفع وصل الدفع أعلى أولوية من كلمات "رسوم فتح الملف" حتى لا يتحول لمسار استرداد/رسوم.
  if (isReceiptConfirmationCurrentText(t) || isReceiptUploadConfirmationText(t)) return "receipt_upload_confirmation";

  // إيقاف الاسترداد عكس طلب الاسترداد تمامًا، لذلك يُحسم أولًا.
  if (isExplicitStopRefundText(t)) return "stop_refund";

  // سؤال عن مصير رسوم فتح الملف أو إمكانية استردادها ليس طلب استرداد.
  // هذه أولوية ثابتة قبل أي Refund mutation حتى لو احتوت الرسالة كلمات "رجع/استرد".
  if (isRefundPolicyInquiryText(t)) return "payment_amount";

  // طلب استرداد صريح يسبق أي تصنيف عام للدفع أو الرسوم.
  if (isExplicitRefundRequestText(t)) return "refund";

  if (isProductSpecificationQuestionText(t) || isProductAccessoryQuestionText(t) || isProductPackagingQuestionText(t)) return "products";
  if (isApprovalProbabilityQuestionText(t)) return "order_status";

  // سؤال واضح عن طريقة إرفاق/رفع مستند يجب ألا يسقط في unknown.
  if (isDocumentFollowupText(t)) return "document_followup";

  // طلب دفع رسوم فتح الملف في المكتب له سياسة مستقلة، ويُحسم قبل الرفض العام للدفع.
  if (isOfficeFeePaymentRequestText(t)) return "office_payment_request";

  // سؤال الدفع عند الاستلام يبقى استفسارًا ما لم يتحول إلى شرط/رفض صريح.
  if (isPaymentOnReceiptQuestionText(t)) return "payment_objection";

  // الرفض الصريح للدفع مسار اختياري مستقل، وليس اعتراض دفع ولا إلغاء تلقائيًا.
  if (isVoluntaryOptOutText(t)) return "voluntary_opt_out";

  // أسئلة الدفع التفصيلية يجب أن تُفهم قبل كلمات المكتب/التوصيل أو الحالة العامة.
  if (isPaymentLinkIssueText(t)) return "payment_link_issue";
  if (isFirstInstallmentQuestionText(t)) return "payment_amount";
  if (isInterestOrReligiousFinancingQuestionText(t)) return "installment_info";
  if (isInstallmentDurationQuestionText(t)) return "installment_info";
  if (isGeneralMonthlyPaymentQuestionText(t)) return "installment_info";
  if (isPaymentMethodText(t)) return "payment_method";
  if (isPaymentTimingText(t)) return "payment_timing";
  if (isPaymentRecipientText(t)) return "payment_recipient";
  if (isPaymentReviewTimeText(t)) return "payment_review_time";
  if (isPaymentNextStepText(t)) return "payment_next_step";
  if (isFileOpeningClarificationText(t)) return "payment_objection";
  if (isPaymentObjectionText(t)) return "payment_objection";
  if (isApplicationDataCorrectionConfirmationText(t)) return "application_data_correction_confirmed";
  if (isApplicationDataCorrectionText(t)) return "application_data_correction";
  if (isAfterApprovalRequirementQuestionText(t) || isGeneralDocumentsQuestionText(t)) return "requirements";

  // V1.5.0 CRITICAL INTENT PRIORITY:
  // A direct cancellation decision must outrank delay/review wording in the same message.
  // Destructive execution is still protected later by the explicit confirmation gate.
  if (isCancelRefundRequestText(t)) return "cancel_refund_request";
  if (isCancelConfirmedText(t)) return "cancel_confirmed";
  if (isCancelRequestText(t)) return "cancel_request";

  if (isApprovalTimingQuestionText(t)) return "review_time";
  if (isReviewTimeText(t)) return "review_time";
  if (isApprovalStatusQuestionText(t)) return "order_status";

  // عبارات مثل "صارلو 3 أشهر" تعني شكوى عن طول الانتظار، وليست مدة تقسيط.
  if (isLongDelayComplaintText(t)) return "review_time";

  // سؤال "شو المضمون؟" بعد تعليمات الدفع هو سؤال ضمان/موثوقية.
  if (isPaymentGuaranteeText(t)) return "trust_verification";

  if (isInternalInstructionRequestText(t)) return "system_prompt_request";
  if (isStaffIdentityText(t)) return "staff_identity";

  if (isCallRequestText(t)) return "call_request";

  if (isPaymentAmountText(t)) return "payment_amount";

  if (isInstallmentBudgetQuestionText(t)) return "installment_info";

  if (
    hasAny(t, ["دينار شهري", "بالشهر", "شهريا", "شهريًا", "قسط شهري", "القسط الشهري"]) &&
    hasAny(t, ["جهاز", "تلفون", "موبايل", "اقسط", "أقسط", "تقسيط"])
  ) return "installment_info";

  if (isSelfEmployedText(t) || isEmploymentEligibilityQuestionText(t)) return "self_employed";

  if (isMinorEligibilityQuestionText(t)) return "requirements";

  if (isOfficeLocationText(t)) return "location";

  if (isWebsiteText(t)) return "website";

  if (isReceiptUploadConfirmationText(t)) return "receipt_upload_confirmation";
  if (isTrustVerificationText(t)) return "trust_verification";

  // حدود الاحترام والرسائل الحساسة يجب أن تُصنّف قبل التحيات أو الأسئلة العامة
  if (isAbuseText(t)) return "abuse";
  if (isScamAccusationText(t)) return "scam_accusation";
  if (isLegalThreatText(t)) return "legal_threat";
  if (isSocialMediaThreatText(t)) return "social_media_threat";
  if (isPaymentDisputeText(t)) return "payment_dispute";
  if (isEmotionalPressureText(t)) return "emotional_pressure";
  if (isDeviceDelayRageText(t)) return "device_delay_rage";

  if (isAlternativePaymentSourceText(t)) {
    return "alternative_payment_source";
  }

  if (isReceiptUploadNeededText(t)) {
    return "receipt_upload_needed";
  }

  if (isSiteOrTrackingSystemIssueText(t)) {
    return "site_issue";
  }

  if (isSupplierDelayQuestionText(t)) {
    return "supplier_delay_question";
  }

  if (isOfficePickupPolicyText(t)) {
    return "office_pickup_policy";
  }

  if (isExplicitKeepRequestText(t)) {
    return "keep_request";
  }

  if (isContinueDecisionText(t)) {
    return "continue_decision";
  }

  if (isDeclineDecisionText(t)) {
    return "cancel_request";
  }

  if (isAngryCustomerText(t)) {
    return "complaint";
  }

  if (hasAny(t, ["استرداد", "استرجاع", "رجعولي", "بدي فلوسي", "رجعوا فلوسي", "refund", "استرجع الرسوم"])) {
    return "refund";
  }

  if (isExplicitHumanAgentRequestText(t) || hasAny(t, [
    "بدي موظف", "احكي مع موظف", "بدي احكي مع موظف", "بدي اتحدث مع موظف", "بدي أتحدث مع موظف",
    "اريد التحدث مع موظف", "أريد التحدث مع موظف", "موظف طبيعي", "موظف حقيقي", "حد يحكي معي",
    "بدي احكي مع حدا", "بدي حدا يحكي معي", "بدي اتواصل مع حدا", "بدي أتواصل مع حدا", "لازم اتواصل مع حدا",
    "بدي مدير", "احكي مع المدير", "بدي مسؤول", "احكي مع مسؤول",
    "احكي مع انسان", "احكي مع بني ادم", "بدي انسان", "بدي بني ادم", "بدي بشر",
    "bring me a human", "get me a human", "human please", "live agent", "real person",
    "customer service agent", "support agent", "representative", "talk to a human",
  ])) {
    return "human_agent";
  }

  if (hasAny(t, ["قرض", "قروض", "كاش", "نقدي", "مصاري", "تمويل شخصي", "سلفه", "سلفة", "سلف", "دينار كاش"])) {
    return "loan";
  }

  if (isContactInfoText(t)) {
    return "contact_info";
  }

  if (isTrackingLinkRequestText(t)) {
    return "tracking_link_request";
  }

  if (
    extractTracking(t) &&
    (!broadText || hasAny(t, ["رقم الطلب", "رقم التتبع", "تأكدلي", "تاكدلي", "شيك على الطلب"]))
  ) {
    return "order_status";
  }

  if (hasAny(t, ["عنوان", "المحل", "فرع", "وينكم", "وين انتو"])) {
    return "location";
  }

  if (hasAny(t, ["الرابط", "لينك", "ابلكيشن", "تطبيق"])) {
    return "website";
  }

  if (
    hasAny(t, [
      "كيف الاقساط", "كيف التقسيط", "كيف بدي اقسط", "بدي اقسط", "طريقه التقسيط", "طريقة التقسيط", "نظام التقسيط",
      "شو نظامكم", "كيف النظام", "تفاصيل التقسيط", "اقساط", "أقساط", "تقسيط", "كم القسط", "حاسبه", "حاسبة",
      "دفعه اولي", "دفعة اولى", "مده", "مدة", "اشهر", "24 شهر", "36 شهر",
    ])
  ) {
    return "installment_info";
  }

  if (
    hasAny(t, [
      "الشروط", "شروط", "المتطلبات", "شو المطلوب", "شو بدكم", "اوراق", "الاوراق", "الأوراق", "وثائق", "كفيل",
      "كشف راتب", "راتب", "اثبات دخل", "إثبات دخل", "ضمان", "ضمان اجتماعي", "هويه", "هوية", "هل بحتاج كفيل",
    ])
  ) {
    return "requirements";
  }

  if (hasAny(t, ["اقدم", "أقدم", "تقديم", "طلب جديد", "اعمل طلب", "أعمل طلب", "وين اقدم", "وين أقدم", "رابط التقديم", "قدم طلب", "بدي جهاز", "بدي تلفون", "بدي موبايل", "بدي ايفون", "بدي سامسونج", "اشتري"])) {
    return "apply";
  }

  if (
    hasAny(broadText, ["اجهزه", "أجهزة", "الاجهزه", "تلفونات", "موبايلات", "ايفون", "سامسونج", "هونر", "تكنو", "شاومي", "اسعار", "السعر", "متوفر", "ذاكره", "ذاكرة"]) ||
    hasNormalizedWord(broadText, ["256", "512"])
  ) {
    return "products";
  }

  if (
    hasAny(broadText, ["دفع", "ادفع", "دفعت", "رسوم", "خمسه", "خمسة", "وصل", "ايصال", "إيصال", "كليك", "محفظه", "محفظة", "اورنج", "orange", "فتح ملف", "الدفعه", "حواله"]) ||
    hasNormalizedWord(broadText, ["5"])
  ) {
    return "payment";
  }

  if (isReviewTimeText(t)) {
    return "review_time";
  }

  if (hasAny(t, ["موعد الاستلام", "موعد التسليم", "الاحد", "الأحد", "استلام", "تسليم", "بعد العيد", "31/05", "31-05", "وين وصل الجهاز", "وصل الجهاز", "التسليم", "تاخر الجهاز", "تأخر الجهاز"])) {
    return "delivery";
  }

  if (hasAny(t, [
    "طلبي", "طلب", "حاله", "حالة", "شو صار", "وين الطلب", "رقم تتبع", "تتبع",
    "راجع الطلب", "افحص الطلب", "شيك", "check", "اتابع الملف", "أتابع الملف",
    "متابعه الملف", "متابعة الملف", "تابع الملف", "اكمل متابعه", "أكمل متابعة",
    "شو اسوي هسا", "شو اعمل هسا", "الخطوه الجايه", "الخطوة الجاية",
  ])) {
    return "order_status";
  }

  if (isGreeting(t) || isCasualWellbeingText(t)) return "greeting";

  // التحية أو "تمام/شكرا" تُعامل اجتماعيًا فقط إذا كانت الرسالة اجتماعية صافية.
  // إذا تبعها سؤال أو طلب، أولوية المعنى الحالي أعلى من المجاملة.
  if (isPureSocialAcknowledgementText(t)) {
    return "thanks";
  }

  return "unknown";
}

function looksSensitive(text: string) {
  const intent = classifyIntent(text);
  return ["abuse", "legal_threat", "social_media_threat", "scam_accusation", "payment_dispute", "device_delay_rage", "emotional_pressure", "cancel_refund_request", "complaint", "refund", "cancel_request", "cancel_confirmed", "reopen_cancelled_request", "reopen_cancelled_confirmed", "site_issue"].includes(intent) || shouldFlagHumanReview(text, intent);
}

function getSalaryNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(String(value).replace(/[^\d.]/g, ""));

  return Number.isFinite(numberValue) ? numberValue : null;
}

function isCreatedWithinLastDays(value: string | null | undefined, days: number) {
  if (!value) return false;

  const createdAt = new Date(value).getTime();

  if (Number.isNaN(createdAt)) return false;

  const ageMs = Date.now() - createdAt;
  const maxAgeMs = days * 24 * 60 * 60 * 1000;

  return ageMs >= 0 && ageMs <= maxAgeMs;
}

function isDateOlderThanHours(value: string | null | undefined, hours: number) {
  if (!value) return false;

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) return false;

  const ageMs = Date.now() - timestamp;
  const minAgeMs = hours * 60 * 60 * 1000;

  return ageMs >= minAgeMs;
}

function paymentRequirementsPendingReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const url = trackUrl(baseUrl, app);

  return `أهلًا ${name} 🌿

رسوم فتح الملف مؤكدة عندنا ✅

${paidDevicesReassuranceParagraph(app)}

إذا احتاج طلبك أي مستند إضافي، بنطلبه منك برسالة واضحة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
}

function canShowPostPaymentRequirements(app: ApplicationRecord) {
  return (
    app.payment_status === "confirmed" &&
    app.status === "under_review" &&
    isCreatedWithinLastDays(app.created_at, 12) &&
    isDateOlderThanHours(app.payment_confirmed_at, 48)
  );
}

function isConfirmedPaidActiveApplication(app: ApplicationRecord | null | undefined) {
  if (!app) return false;

  const inactiveStatuses = [
    "rejected",
    "cancelled",
    "customer_declined_continue",
    "refund_requested",
    "refund_completed",
  ];

  return app.payment_status === "confirmed" && !inactiveStatuses.includes(app.status || "");
}

function paidDevicesReassuranceParagraph(app: ApplicationRecord, mode: "general" | "delivery" | "requirements" = "general") {
  const status = app.status || "";
  const finalApproved = status === "approved" || status === "customer_accepts_delivery_delay";

  if (!finalApproved) {
    return `رسوم فتح الملف مؤكدة، لكن لا توجد موافقة نهائية ظاهرة حتى الآن. حالة الملف الحالية: ${statusHumanLabel(status)}.`;
  }

  if (mode === "requirements") {
    return `الطلب عليه موافقة نهائية. لا ترفع أي مستند إضافي إلا إذا وصلك طلب محدد، وموعد الاستلام يُرسل بعد اعتماده.`;
  }

  return `الطلب عليه موافقة نهائية، وما في موعد استلام نهائي محدد حاليًا. أول ما يتم اعتماد الموعد يصلك تحديث رسمي.`;
}

function postPaymentRequirementsReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const salary = getSalaryNumber(app.salary);
  const guarantorLink = guarantorUrl(baseUrl, app);
  const salaryLink = salarySlipUrl(baseUrl, app);

  if (salary !== null && salary < 350) {
    return `أهلًا ${name} 🌿

تم تأكيد رسوم فتح الملف، ولإكمال دراسة الملف نحتاج استكمال المتطلبات المحددة.

${paidDevicesReassuranceParagraph(app, "requirements")}

لاستكمال إجراءات الملف حسب متطلبات الموافقة، نحتاج تزويدنا بالتالي:

1. تعبئة بيانات الكفيل من الرابط:
${guarantorLink}

2. رفع كشف راتب رسمي حديث أو شهادة راتب صادرة من جهة العمل من الرابط:
${salaryLink}

هذه الخطوة لاستكمال الطلب، ولا تعني رفضه.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  return `أهلًا ${name} 🌿

تم تأكيد رسوم فتح الملف، ولإكمال دراسة الملف نحتاج استكمال المتطلبات المحددة.

${paidDevicesReassuranceParagraph(app, "requirements")}

لاستكمال طلبك، عبّي بيانات الكفيل من الرابط التالي:
${guarantorLink}

هذه الخطوة لاستكمال الطلب، ولا تعني رفضه.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
}

function statusHumanLabel(status: string, paymentStatus?: string | null) {
  return statusHumanLabelV113(status, paymentStatus);
}

function apologyLine(seed = "0") {
  return complaintApologyParagraph(seed);
}


function abuseReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const tracking = app?.tracking_id || app?.id || "";
  const status = app?.status || "";

  if (app) {
    return `واضح إنك منزعج، وبنعتذر إذا صار معك أي تأخير أو إرباك.

بس خلينا نحافظ على الاحترام حتى أقدر أساعدك فعليًا.

طلبك ظاهر عندي الآن، وحالته:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

اكتبلي المشكلة نفسها بجملة واضحة، مثل: "تأخر التسليم" أو "بدي أعرف حالة الطلب"، وبجاوبك مباشرة حسب الحالة الموجودة عندي.

${BUSINESS_NAME}`;
  }

  return `واضح إنك منزعج، وبنعتذر إذا صار معك أي إزعاج.

بس حتى أقدر أساعدك، خلينا نحافظ على الاحترام ونحكي بالمشكلة نفسها.

اكتبلي رقم التتبع أو رقم الهاتف المستخدم بالطلب، أو احكيلي شو صار بجملة واضحة، وبراجعها لك مباشرة.

${BUSINESS_NAME}`;
}

function legalThreatReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const tracking = app?.tracking_id || app?.id || "";
  const status = app?.status || "";

  if (app) {
    if (app.status === "refund_requested" || app.payment_status === "refund_requested") {
      return refundDeescalationReply(app, customerText);
    }

    return `حقك تطلب توضيح واضح، وبنعتذر إذا حسّيت إن المتابعة ما كانت كافية.

حسب البيانات الظاهرة عندي، حالة طلبك الحالية:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

خلينا نمشي على الموجود رسميًا: اكتب الملاحظة المحددة أو رقم الطلب هنا، وبوضح لك الخطوة المناسبة حسب الحالة. وصل الدفع وأي مستندات حساسة تُرفع فقط من الرابط الرسمي المرتبط بالطلب، ولا تُرسل عبر واتساب.

${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `حقك تطلب توضيح، وبنعتذر إذا صار أي تأخير أو عدم وضوح.

حتى أقدر أراجع الموضوع بدقة، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب. وصل الدفع وأي مستندات حساسة تُرفع فقط من الرابط الرسمي المرتبط بالطلب، ولا تُرسل عبر واتساب.

بعدها بعطيك الحالة والخطوة القادمة بدون كلام عام.

${BUSINESS_NAME}`;
}

function socialMediaThreatReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  void baseUrl;
  void from;
  const tracking = app?.tracking_id || app?.id || "";
  const refundActive = Boolean(app && (app.status === "refund_requested" || app.payment_status === "refund_requested"));
  const refundCompleted = Boolean(app && app.status === "refund_completed");
  const paid = hasConfirmedPaymentEvidence(app);

  const legalBoundary = `ومن حقك تقدم شكوى أو تحكي عن تجربتك. بس أي نشر أو اتهام لازم يكون دقيق ويعكس الوقائع كما هي؛ نشر معلومات أو اتهامات غير صحيحة ممكن تترتب عليه مسؤولية قانونية، والأمين للأقساط تحتفظ بحقها بإحالة أي إساءة أو ادعاءات غير صحيحة للمستشارين القانونيين عند الحاجة.`;

  if (app) {
    if (refundCompleted) {
      return `فاهم إنك متضايق، وما بدنا نحول الموضوع لجدال.

حسب حالة الطلب الظاهرة عندنا، الاسترداد مكتمل. إذا عندك اعتراض محدد على الإجراء احكيه وبنراجعه حسب البيانات المسجلة.

${legalBoundary}

رقم الطلب: ${tracking}`;
    }

    if (refundActive) {
      return `فاهم إن الانتظار ضايقك، وحقك يكون عندك جواب واضح.

طلب الاسترداد مسجل وقيد المتابعة على طلبك، وما رح أعطيك موعد غير مؤكد. أول ما يظهر تحديث فعلي بنبلغك مباشرة.

${legalBoundary}

رقم الطلب: ${tracking}`;
    }

    if (app.status === "cancelled") {
      return `طلبك ظاهر عندي ملغي بالفعل.

${paid ? "وبما أن الدفع مؤكد على الملف، أي استرداد مرتبط فيه يتابع فقط حسب حالته الفعلية المسجلة." : "وما في إجراء مالي إضافي ظاهر على الملف."}

${legalBoundary}

رقم الطلب: ${tracking}`;
    }

    const resolutionLine = paid
      ? `إذا ما عدت ترغب بإكمال الطلب، بنمشي معك بإجراء الإلغاء الرسمي. وبعد تنفيذ الإلغاء، بما أن الدفع مؤكد على الملف، يدخل الطلب بمسار الاسترداد حسب الحالة.`
      : `إذا ما عدت ترغب بإكمال الطلب، بنمشي معك بإجراء الإلغاء الرسمي.`;

    return `واضح إنك وصلت لمرحلة انزعاج كبيرة، وخلينا نحكي بالحل بدون شد.

${resolutionLine}
الإلغاء ما بصير من مجرد رسالة تهديد أو غضب؛ إذا قرارك نهائي بنطلب منك تأكيد الإلغاء بشكل واضح قبل التنفيذ.

${legalBoundary}

رقم الطلب: ${tracking}`;
  }

  return `فاهم إنك متضايق، ومن حقك تقدم شكوى أو تحكي عن تجربتك.

إذا الموضوع مرتبط بطلب، ابعث رقم التتبع أو رقم الهاتف المستخدم بالتقديم حتى نراجع حالته ونحكي بالحل الفعلي بدل كلام عام.

${legalBoundary}`;
}

function scamAccusationReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  if (app) {
    return `من حقك تتأكد، وما رح أجادلك أو أطلب منك تثق بكلام عام.

طلبك ظاهر عندي وحالته: ${statusHumanLabel(app.status || "")}.
احكيلي شو اللي خلاك تشك تحديدًا: بيانات الدفع، عنوان الشركة، أو حالة الطلب؟ وبجاوبك على نفس النقطة مباشرة.

رقم الطلب: ${app.tracking_id || app.id}`;
  }

  return `من حقك تتأكد قبل أي خطوة.

احكيلي شو اللي خلاك تشك تحديدًا، وإذا الموضوع مرتبط بطلب ابعث رقم التتبع أو رقم الهاتف المستخدم بالتقديم حتى أراجع النقطة نفسها بدون كلام عام.`;
}

const PAYMENT_WALLET_TYPE = "Orange Money";
const PAYMENT_DESTINATION_PRIMARY = "AMEEENPAY";
const PAYMENT_DESTINATION_SECONDARY = "AMENPAY";
const PAYMENT_BENEFICIARY_NAME = "ABDUL RAHMAN ALHARAHSHEH";

function paymentDestinationBlock() {
  return `نوع المحفظة: ${PAYMENT_WALLET_TYPE}

التحويل إلى:
${PAYMENT_DESTINATION_PRIMARY}
أو
${PAYMENT_DESTINATION_SECONDARY}

اسم المستفيد الظاهر:
${PAYMENT_BENEFICIARY_NAME}`;
}

function bankCliqPaymentExplanation() {
  return `تقدر تحول من أي حساب بنكي يدعم CliQ أو من محفظة إلكترونية؛ مش شرط يكون عندك محفظة Orange Money.

الجهة المستلمة محفظة Orange Money.`;
}

function regulatoryStatusReply() {
  return `${BUSINESS_REGULATORY_DISCLOSURE}

نشاطنا هو ${BUSINESS_ACTIVITY}.`;
}

function businessIdentityReply() {
  return `الاسم المعتمد في التعامل والقنوات الرسمية هو ${BUSINESS_NAME}.

نشاطنا هو ${BUSINESS_ACTIVITY}، والجهة ليست بنكًا ولا شركة تمويل أو إقراض ولا تمنح قروضًا.`;
}

function businessIndependenceReply() {
  return `${BUSINESS_INDEPENDENCE_STATEMENT}.

إحنا مختصين بتقسيط الأجهزة الإلكترونية والهواتف فقط، ولسنا بنكًا ولا شركة تمويل أو إقراض.`;
}

function trustVerificationReply(baseUrl: string, app?: ApplicationRecord | null) {
  const requestLines = app
    ? `
طلبك ظاهر عندي برقم:
${app.tracking_id || app.id}

الحالة الحالية:
${statusHumanLabel(app.status || "")}`
    : "";

  const addressLine = `\n- الموقع العام: ${BUSINESS_GENERAL_LOCATION}`;

  return `من حقك تتأكد قبل أي دفع، وما بنطلب منك تعتمد على الكلام وحده.

بيانات الأمين الرسمية:
- الموقع: ${BUSINESS_WEBSITE}
- واتساب الشركة: ${BUSINESS_PHONE_E164}${addressLine}

الدفع الرسمي لرسوم فتح الملف يكون فقط بعد التأهيل المبدئي.

${paymentDestinationBlock()}

لا تدفع لأي بيانات أو رابط مختلف.${requestLines}

رابط المتابعة الرسمي:
${baseUrl}/track`;
}


function paymentGuaranteeReply(baseUrl: string, app?: ApplicationRecord | null) {
  if (!app) {
    return `ضمانك إن أي دفع يتم فقط بعد وصول تعليمات رسمية، ورفع الوصل يكون من موقع الأمين الرسمي.

رسوم فتح الملف مستردة بالكامل في حال عدم الموافقة النهائية.

${paymentDestinationBlock()}

لا تحول لأي بيانات مختلفة عن المعلومات أعلاه.`;
  }

  const tracking = app.tracking_id || app.id;

  return `ضمانك إن رسوم فتح الملف مرتبطة برقم طلبك، ورفع الوصل يتم من رابط الأمين الرسمي، والرسوم مستردة بالكامل في حال عدم الموافقة النهائية.

${paymentDestinationBlock()}

لا تحول لأي اسم أو رقم أو رابط مختلف عن المعلومات أعلاه.

رقم الطلب: ${tracking}
الموقع الرسمي: ${BUSINESS_WEBSITE}`;
}

function receiptUploadConfirmationReply(app?: ApplicationRecord | null) {
  if (!app) {
    return `وصل إشعارك برفع وصل الدفع. حتى أربطه بالطلب الصحيح، ابعث رقم التتبع AM- أو رقم الهاتف المستخدم بالتقديم. لا تعيد الدفع مرة ثانية.`;
  }

  const tracking = app.tracking_id || app.id;
  if (app.payment_status === "confirmed") {
    return `تم تأكيد رسوم فتح الملف على طلبك ✅

حالة الملف الحالية: ${statusHumanLabel(app.status || "")}.

رقم التتبع:
${tracking}`;
  }

  return `وصل إشعار رفع الوصل وتم ربط المتابعة بطلبك. الوصل الآن بانتظار التأكيد، فلا تعيد الدفع ولا ترفع وصلًا ثانيًا.

رقم التتبع:
${tracking}`;
}

function paymentDisputeReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  if (app) {
    return `وصلني اعتراضك بخصوص الدفع أو الرسوم، وحقك يكون الموضوع واضح.

حالة الطلب:
${statusHumanLabel(app.status || "")}

حالة الدفع:
${paymentStatusHumanLabel(app.payment_status)}

رقم التتبع:
${app.tracking_id || app.id}

مهم: رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط، وتكون مستردة في حال عدم الموافقة النهائية. وصل الدفع أو إثباته يُرفع فقط من الرابط الرسمي المرتبط بطلبك، ولا يُرسل عبر واتساب.

رابط رفع الوصل الرسمي:
${receiptUrl(baseUrl, app)}

رابط المتابعة:
${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `أكيد، خلينا نراجع موضوع الدفع بدون لخبطة.

ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب فقط. بعد ربط الطلب، يتم رفع وصل الدفع أو إثباته من الرابط الرسمي المرتبط بالطلب، ولا يُرسل عبر واتساب.

${BUSINESS_NAME}`;
}

function deviceDelayRageReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  if (app) {
    return deliveryDateReply(app, baseUrl);
  }

  return `حقك علينا، التأخير بدون تحديث واضح مزعج وبنقدّر قلقك.

حتى أفحص لك وضع الجهاز تحديدًا، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب.

إذا كان الطلب عليه موافقة نهائية، فالتحديث المعتمد حاليًا أن الطلبات المؤكدة بانتظار وصول الأجهزة من المورد/الوكلاء المعتمدين، وسيتم التواصل فور اعتماد جدول الاستلام من المكتب من الإدارة.

${BUSINESS_NAME}`;
}
function emotionalPressureReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const seed = `${from}:emotional:${customerText}`;
  const faith = softFaithPhrase(seed);

  if (app) {
    const name = firstTwoNames(app.full_name);
    const tracking = app.tracking_id || app.id;
    const device = app.device_name ? `الجهاز المطلوب (${customerFacingDeviceName(app.device_name)})` : "الجهاز المطلوب";
    const status = app.status || "";

    const statusLine = `حالة الطلب حاليًا: ${statusHumanLabel(status)}`;
    const confirmedLine = isConfirmedPaidActiveApplication(app)
      ? `ملفك قطع مرحلة مهمة، والتأخير الحالي مرتبط بتثبيت توفر ${device} واعتماد جدول الاستلام من المكتب، مش لأن طلبك متروك أو منسي.`
      : `الطلب ظاهر عندنا، وبنحتاج نلتزم بالحالة الظاهرة عليه بدون ما نعطيك وعد غير مؤكد.`;

    return `${name}، معك حق تزعل. الموضوع هون مش مجرد طلب، صار إحراج شخصي قدام شخص عزيز عليك، وكلمة "فاهم شعورك" لحالها ما بتكفي.

${statusLine}

${confirmedLine}

ما رح أعطيك موعد وهمي وأزيد الإحراج عليك. أول ما يصير تحديث فعلي على توفر الجهاز أو جدول الاستلام من المكتب بنوصلك مباشرة ${faith}.

رقم الطلب:
${tracking}`;
  }

  return `معك حق تزعل، خصوصًا إذا الجهاز كان هدية وصار عليك إحراج وتأجيل أكثر من مرة.

حتى ما أعطيك كلام عام أو أزيد الموضوع لخبطة، ابعث رقم الطلب اللي ببدأ بـ AM- أو رقم الهاتف المستخدم بالتقديم، وبراجع لك الحالة الحالية مباشرة وبوضح لك الخطوة الواقعية بدون وعود وهمية.`;
}

function emotionalFollowupReply(from: string, app?: ApplicationRecord | null, customerText = "") {
  if (app) {
    const tracking = app.tracking_id || app.id;
    return `معك حق، وعبارة "فاهم شعورك" لحالها ما بتحل الإحراج اللي صار عليك.

خلينا نحكي بالمفيد: طلبك ظاهر عندنا وحالته ${statusHumanLabel(app.status || "")}. إذا كان التأخير على الجهاز، فالملف يظل تحت المتابعة لحد ما يتم تثبيت توفر الجهاز واعتماد الاستلام من المكتب.

رقم الطلب:
${tracking}`;
  }

  return `معك حق، وعبارة "فاهم شعورك" لحالها ما بتكفي.

واضح إنك بتحكي عن إحراج حقيقي بسبب تأخير الجهاز، مش سؤال عام. ابعث رقم الطلب AM- أو رقم الهاتف المستخدم بالتقديم، وبعطيك الحالة الحالية مباشرة بدون لف ودوران.`;
}



function complaintReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const apology = complaintApologyParagraph(`${from}:${customerText}`);

  if (app) {
    if (app.status === "refund_requested" || app.payment_status === "refund_requested") {
      return refundDeescalationReply(app, customerText);
    }

    if (shouldExplainOperationalPicture(customerText) || isLongDelayComplaintText(customerText)) {
      return reviewTimeReply(from, app, baseUrl, customerText);
    }

    return `${apology}

طلبك ظاهر عندي وحالته: ${statusHumanLabel(app.status || "")}.
إذا اعتراضك على نقطة واضحة بالرسالة نفسها، بجاوبك عليها مباشرة بدون ما أخليك تعيد شرحها.

رقم الطلب: ${app.tracking_id || app.id}`;
  }

  if (shouldExplainOperationalPicture(customerText) || isLongDelayComplaintText(customerText)) {
    return reviewTimeReply(from, null, baseUrl, customerText);
  }

  return `${apology}

إذا الموضوع مرتبط بطلب، ابعث رقم التتبع أو رقم الهاتف المستخدم بالتقديم حتى أعطيك جوابًا محددًا.`;
}

function refundDeescalationReply(app: ApplicationRecord, customerText = "") {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const urgent = isLongDelayComplaintText(customerText) || isAngryCustomerText(customerText) || isLegalThreatText(customerText);

  if (app.status === "refund_completed") {
    return refundCompletedReply(app);
  }

  const opening = urgent
    ? `${name}، معك حق تكون منزعج، وبنعتذر منك بصدق لأن مدة الانتظار سببت لك ضغطًا وعدم ثقة.`
    : `${name}، فاهمين قلقك وحقك تعرف وين وصل طلب الاسترداد.`;

  const terseFollowup = normalizeArabicText(customerText);
  if (!urgent && terseFollowup.length > 0 && terseFollowup.length <= 45 && isRefundMoneyFollowupText(customerText)) {
    return `${name}، فاهمك. طلب الاسترداد نفسه مسجل ولسه ما ظهر تنفيذ جديد.

ما في خطوة مطلوبة منك، وما بدي أوعدك بوقت غير مؤكد. أول ما يظهر تنفيذ فعلي رح يصلك تحديث.
رقم الطلب: ${tracking}`;
  }

  return `${opening}

طلب الاسترداد مسجل ومحفوظ على رقم طلبك، وما تم إلغاؤه أو تجاهله، ولا تحتاج تعيد تقديمه أو ترسل بياناتك مرة ثانية.

نمر حاليًا بظروف تشغيلية استثنائية وضغط خارج عن المعتاد، وسيتم التعامل مع طلبك بأقرب وقت ممكن حسب ترتيب الطلبات. ما رح نعطيك موعدًا غير مؤكد، وأول ما يتم تنفيذ الحوالة أو يظهر تحديث فعلي رح توصلك رسالة مباشرة.

رقم الطلب: ${tracking}`;
}

function refundFirstRequestReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const url = delayUrl(baseUrl, app);

  return `تمام ${name}، وصلتني رغبتك بالاسترداد.

سجلت حالة الملف الآن: قيد الاسترداد.

رابط تثبيت بيانات الاسترداد:
${url}

استخدم الرابط مرة واحدة وعبّي بيانات التحويل بشكل صحيح، وبعدها بتدخل المراجعة حسب ترتيب الطلبات.

رقم التتبع: ${tracking}`;
}

function refundAlreadyRequestedReply(app: ApplicationRecord, customerText = "") {
  return refundDeescalationReply(app, customerText);
}

function refundCompletedReply(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `أهلًا ${name} 🌿

الاسترداد ظاهر عندي أنه منفّذ مسبقًا حسب حالة الملف.

إذا عندك أي ملاحظة على التحويل، اكتب رقم التتبع فقط. أي إثبات أو صورة حركة تُرفع من الرابط الرسمي المرتبط بالطلب، ولا تُرسل عبر واتساب.

رقم التتبع: ${tracking}`;
}

function refundReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const opening = humanOpening(`${from}:refund`);

  if (app) {
    const paymentEvidence = hasConfirmedRefundPayment(app);

    if ((app.status === "refund_completed" || app.status === "refund_requested" || app.payment_status === "refund_requested") && !paymentEvidence) {
      return unpaidRefundGuardReply(app);
    }

    if (app.status === "refund_completed") {
      return refundCompletedReply(app);
    }

    if (app.status === "refund_requested" || app.payment_status === "refund_requested") {
      return refundAlreadyRequestedReply(app, customerText);
    }

    if (!paymentEvidence) {
      return unpaidRefundGuardReply(app);
    }

    return refundFirstRequestReply(app, baseUrl);
  }

  return `${opening}

أكيد، بقدر أساعدك بموضوع الاسترداد.

حتى أربطه بالطلب الصحيح، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب.

بعد ما أطلع الطلب، أول خطوة هي التحقق من وجود دفع مؤكد. رابط الاسترداد لا يُرسل ولا تُسجل حالة استرداد إلا إذا كان هناك مبلغ مدفوع ومؤكد على الطلب.`;
}

function contactInfoReply(_baseUrl: string, _from: string) {
  return `رقم التواصل وواتساب الشركة الرسمي:
${BUSINESS_PHONE_DISPLAY}

بالصيغة الدولية:
${BUSINESS_PHONE_E164}`;
}

function websiteReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:website`);
  return `${opening}

رابط موقعنا للتقديم والمتابعة:
${baseUrl}

من خلال الموقع بتقدر:
- تشوف الأجهزة المتاحة.
- تقدم طلب تقسيط.
- تتابع حالة طلبك برقم الهاتف ورقم التتبع.
- ترفع وصل رسوم فتح الملف إذا تم تأهيل طلبك مبدئيًا.

تنويه سريع: ${BUSINESS_NAME} مختص بتقسيط الأجهزة الإلكترونية والهواتف فقط، وما بنقدم قروض نقدية أو تمويل شخصي.`;
}

function canShareOfficeAddress(app?: ApplicationRecord | null) {
  const status = String(app?.status || "");
  return status === "approved" || status === "customer_accepts_delivery_delay";
}

function locationReply(from: string, app?: ApplicationRecord | null) {
  const opening = humanOpening(`${from}:location`);
  const statusLine = app ? `\nحالة طلبك الحالية: ${statusHumanLabel(app.status || "")}.` : "";

  return `${opening}

المكتب في ${BUSINESS_GENERAL_LOCATION}.
الحضور يكون بموعد رسمي فقط، والعنوان التفصيلي واسم المبنى والطابق يُرسلون مع الموعد الرسمي.${statusLine}`;
}

function loanReply(from: string) {
  const opening = humanOpening(`${from}:loan`);
  return `${opening}

للتوضيح بكل احترام: إحنا في ${BUSINESS_NAME} ما بنقدم قروض نقدية، ولا سلف، ولا تمويل شخصي.

خدمتنا فقط تقسيط أجهزة إلكترونية وهواتف.

إذا بدك تقسط جهاز، ابعثلي نوع الجهاز اللي بدك إياه أو ادخل على الموقع وقدّم الطلب، وبعدها الإدارة بتراجع البيانات.`;
}

function installmentInfoReply(baseUrl: string, from: string, customerText = "", app?: ApplicationRecord | null) {
  if (isInterestOrReligiousFinancingQuestionText(customerText)) {
    return interestAndFinancingClarificationReply();
  }

  if (isInstallmentDurationQuestionText(customerText)) {
    return installmentDurationReply(baseUrl, app);
  }

  if (isGeneralMonthlyPaymentQuestionText(customerText)) {
    return `إذا قصدك طريقة سداد الأقساط بعد استلام الجهاز: وسيلة السداد وأي تفاصيل مثل الكمبيالات أو الاقتطاع البنكي لا بنثبتها من واتساب بدون اتفاق وجدول نهائي معتمد.

قبل الاستلام بتكون تفاصيل الجدول وطريقة السداد واضحة ضمن الاتفاق الخاص بطلبك.

ورسوم فتح الملف 5 دنانير منفصلة تمامًا عن الأقساط الشهرية؛ هي ليست قسطًا على الجهاز.`;
  }

  if (isInstallmentBudgetQuestionText(customerText)) {
    const deviceLine = app?.device_name
      ? `الجهاز المسجل حاليًا على طلبك: ${customerFacingDeviceName(app.device_name) || "غير محدد"}.\n\n`
      : "";
    return `${deviceLine}قيمة القسط الشهري ومدة التقسيط ما بنثبتها أو نعدلها من واتساب قبل اعتماد الجدول النهائي.

إذا ميزانيتك مثلًا 50 دينار شهريًا، بنقدر نعتمد فقط الرقم الظاهر ضمن خيارات الجهاز والجدول المعتمد عند استكمال الطلب؛ وما رح أوعدك بتعديل مبلغ أو مدة غير مثبتة.

الأجهزة والخيارات الحالية:
${baseUrl}/products`;
  }

  return `نظام التقسيط باختصار:
1. تختار الجهاز وتقدم الطلب من الموقع.
2. يصلك تحديث بالخطوة المطلوبة حسب حالة طلبك.
3. بعد الموافقة النهائية يتم تحديد الاستلام من المكتب، والقسط الأول يكون بعد الاستلام حسب الاتفاق.

رابط التقديم:
${baseUrl}/products`;
}

function requirementsReply(baseUrl: string, from: string) {
  void from;
  return `بشكل عام: بيانات الطلب وصور الهوية بتتعبّى من نموذج التقديم.

بعدها المستندات الإضافية بتعتمد على دراسة كل ملف؛ إذا احتجنا كشف/شهادة راتب أو بيانات كفيل، بتوصلك رسالة واضحة باسم المطلوب ورابط الرفع الرسمي.

لا ترفع مستند إضافي من نفسك، وتفاصيل مثل الكمبيالات أو طريقة سداد الأقساط ما بنثبتها من واتساب قبل اعتماد الاتفاق النهائي.

رابط الأجهزة والتقديم:
${baseUrl}/products`;
}

function installmentAndRequirementsReply(baseUrl: string) {
  return `نظام التقسيط باختصار: تختار الجهاز من الموقع وتقدم الطلب، وبعد المراجعة بتوصلك الخطوة المطلوبة حسب حالة الملف. القسط الأول يكون بعد الاستلام حسب الاتفاق، وما بنثبت قيمة أو مدة غير ظاهرة ضمن الجدول المعتمد.

وبالنسبة للأوراق: بيانات الطلب وصور الهوية ضمن نموذج التقديم، وأي كشف/شهادة راتب أو كفيل إضافي بنطلبه فقط إذا احتاجته الدراسة وبنرسل رابط الرفع الرسمي. لا ترسل مستندات حساسة عبر واتساب.

الأجهزة والتقديم:
${baseUrl}/products`;
}

function guarantorRequirementQuestionReply(app: ApplicationRecord | null, customerText: string, baseUrl: string) {
  const t = normalizeArabicText(customerText);
  const asksHowToProvide = hasAny(t, ["كيف ارفع", "كيف أرفع", "وين ارفع", "وين أرفع", "رابط الكفيل", "وين الرابط"]);

  if (app?.status === "needs_guarantor") {
    const base = `على طلبك الحالي ظاهر متطلب كفيل لاستكمال الدراسة. هذا متطلب دراسة، وليس موافقة نهائية بحد ذاته.`;
    return asksHowToProvide
      ? `${base}

بيانات الكفيل تُعبأ فقط من الرابط الرسمي المرتبط بالطلب:
${guarantorUrl(baseUrl, app)}`
      : `${base}

إذا احتجت طريقة تعبئة بياناته احكيلي وبعطيك الرابط الرسمي.`;
  }

  return `الكفيل مش شرط ثابت على كل طلب. إذا دراسة ملفك احتاجت كفيل، بيظهر كمتطلب رسمي وبنرسل لك رابط تعبئة بياناته. ما في داعي ترفعه أو تعبّيه من نفسك قبل ما يظهر كمتطلب على الطلب.`;
}

function applyReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:apply`);
  return `${opening}

للتقديم على طلب جديد، ادخل من الرابط:
${baseUrl}/products

اختار الجهاز، عبّي البيانات بدقة، وبعدها الإدارة بتراجع الطلب.

إذا صار الطلب مؤهلًا مبدئيًا وقررت تكمل، بنرسل لك تعليمات فتح الملف رسميًا.

والقسط الأول لا يُدفع الآن، يكون بعد الاستلام حسب الاتفاق.`;
}

// V1.1.4 EXISTING APPLICATION DEVICE LINK START
function hasSpecificSelectedDevice(value: string | null | undefined) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return false;
  return !["الجهاز المطلوب", "غير محدد", "غير متوفر", "لم يتم اختيار جهاز", "بدون جهاز", "device"]
    .some((generic) => clean === generic.toLowerCase());
}

function existingApplicationDeviceSelectionReply(baseUrl: string, app: ApplicationRecord) {
  const current = hasSpecificSelectedDevice(app.device_name)
    ? `\nالجهاز المسجل حاليًا: ${customerFacingDeviceName(app.device_name)}`
    : "";
  return `لاختيار الجهاز والسعة واللون على نفس الطلب، استخدم رابط اختيار الجهاز الرسمي المرتبط بملفك:
${hasSpecificSelectedDevice(app.device_name) ? changeDeviceUrl(baseUrl, app) : selectDeviceUrl(baseUrl, app)}

لا تقدم طلبًا جديدًا من صفحة الأجهزة؛ هذا الرابط يحافظ على نفس رقم الطلب.${current}`;
}
// V1.1.4 EXISTING APPLICATION DEVICE LINK END

function isProductSpecificationQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  const spec = hasAny(t, [
    "مواصفات", "المواصفات", "رام", "رامات", "سعة الرام", "سعه الرام", "ذاكره", "ذاكرة",
    "جيجا رام", "gb ram", "مواصفات الجهاز", "تفاصيل الجهاز",
  ]);
  const device = hasAny(t, [
    "جهاز", "هاتف", "تلفون", "موبايل", "ايفون", "iphone", "honor", "هونر", "سامسونج",
  ]);
  return spec && device;
}

function isProductAccessoryQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const accessory = hasAny(t, [
    "سماعة", "سماعه", "شاحن", "راس شاحن", "رأس شاحن", "كيبل", "كابل",
    "كفر", "جراب", "ملحقات", "اكسسوارات", "إكسسوارات", "قلم", "pen",
  ]);
  const inclusion = hasAny(t, [
    "معه", "معاه", "مع الجهاز", "بالعلبه", "بالعلبة", "ضمن العلبه", "ضمن العلبة",
    "بتيجي", "بتيجي معه", "يشمل", "شامل", "في معه", "هسا في", "هل في",
  ]);

  return accessory && inclusion;
}

function isProductPackagingQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const device = hasAny(t, ["جهاز", "هاتف", "تلفون", "موبايل", "ايفون", "iphone", "سامسونج", "هونر", "honor"]);
  const packaging = hasAny(t, [
    "مسكر بالكرتونه", "مسكر بالكرتونة", "مسكر بالكرتون", "مختوم", "سيل", "sealed",
    "جديد بالكرتونه", "جديد بالكرتونة", "مغلف", "بالعلبه مسكر", "بالعلبة مسكر",
  ]);
  return device && packaging;
}

function isShortProductSpecificationFollowupText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, [
    "وبخصوص الرام", "كم سعة الرامات", "كم سعه الرامات", "كم سعة الرام", "كم سعه الرام",
    "الرام", "الرامات", "سعة الرام", "سعه الرام", "مواصفاته", "المواصفات التفصيليه", "المواصفات التفصيلية",
  ]);
}

function productSpecificationReply(baseUrl: string, app?: ApplicationRecord | null, customerText = "") {
  const deviceLine = app?.device_name
    ? `الجهاز المسجل على طلبك: ${customerFacingDeviceName(app.device_name) || "غير محدد"}.\n\n`
    : "";

  if (isProductAccessoryQuestionText(customerText)) {
    return `${deviceLine}الملحقات المرفقة مع الجهاز بنأكدها فقط إذا كانت مذكورة صراحةً ضمن صفحة المنتج أو وصف الخيار المعتمد.

إذا السماعة أو الشاحن أو أي ملحق مش مذكور هناك، ما بقدر أعتبره مشمول أو أوعدك فيه من عندي.

رابط الأجهزة:
${baseUrl}/products`;
  }

  if (isProductPackagingQuestionText(customerText)) {
    return `${deviceLine}إذا قصدك هل الجهاز جديد ومسكر بكرتونته: ما بقدر أأكد هالتفصيل من عندي إلا إذا كان مذكور بوضوح ضمن صفحة المنتج أو الخيار المعتمد للطلب.

المؤكد عندي فقط هو وصف الجهاز المسجل/المعروض رسميًا، وما بدي أوعدك بتغليف أو ختم غير مثبت.`;
  }

  return `${deviceLine}المواصفات المؤكدة هي فقط التفاصيل الظاهرة على صفحة المنتج الرسمية عندنا. إذا تفصيل مثل سعة RAM غير ظاهر هناك، ما عندي مصدر داخلي مؤكد يسمح لي أعطي رقم من عندي أو أوعدك أني أتحقق منه لاحقًا.

رابط الأجهزة:
${baseUrl}/products`;
}

function isApprovalProbabilityQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, [
    "كم نسبة الموافقة", "كم نسبه الموافقه", "نسبة قبول", "نسبه قبول", "احتمال الموافقة", "احتمال الموافقه",
    "شو نسبة قبولي", "شو نسبه قبولي", "قديش نسبة الموافقة", "قديش نسبه الموافقه",
  ]);
}

function approvalProbabilityReply(app?: ApplicationRecord | null) {
  const statusLine = app ? `\nحالة طلبك الحالية: ${statusHumanLabel(app.status || "")}.` : "";
  return `ما في نسبة مئوية معتمدة للموافقة أقدر أعطيك إياها. القرار يعتمد على دراسة الملف والمتطلبات، وأي رقم كنسبة قبول رح يكون تخمين وغير دقيق.${statusLine}`;
}

function productsReply(baseUrl: string, from: string) {
  const opening = humanOpening(`${from}:products`);
  return `${opening}

الأجهزة والأسعار بتتحدث من خلال الموقع حسب المتوفر.

رابط الأجهزة:
${baseUrl}/products

ادخل على قسم الأجهزة، اختار الجهاز المناسب، وشوف تفاصيله، وبعدها بتقدر تقدم طلب التقسيط مباشرة.

إذا بدك جهاز محدد، اكتبلي اسمه أو صورته وبحاول أوجهك للطريقة الأنسب.`;
}

function paymentGeneralReply(from: string) {
  return `رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط، وما بتنطلب من بداية التقديم.

بتنطلب فقط إذا صار الطلب مؤهلًا مبدئيًا ووصلتك تعليمات الدفع الرسمية. الرسوم مستردة بالكامل في حال عدم الموافقة النهائية، والقسط الأول بعد الاستلام حسب الاتفاق.`;
}


function customerFacingDeviceName(value: string | null | undefined) {
  let clean = String(value || "").replace(/\r/g, " ").replace(/\n+/g, " ").trim();
  if (!clean) return "الجهاز المطلوب";

  clean = clean
    .split(/(?:\s*-\s*)?(?:ملاحظة اللون|ملاحظه اللون|ملاحظة|ملاحظه)\s*:/i)[0]
    .split(/(?:أو|او)\s+الاتصال\s+على/i)[0]
    .split(/(?:رقم\s+الاتصال|للتواصل)\s*:/i)[0]
    .replace(/(?:\+?962|0)?7\d{8}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s،,;:\-–]+$/g, "")
    .trim();

  if (!clean) return "الجهاز المطلوب";
  return clean.length > 180 ? clean.slice(0, 180).trim() : clean;
}

function paymentMessage(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);

  return `تمام ${name}، هيك بنقدر نكمل الطلب.

رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير، وهي منفصلة عن القسط الأول ومستردة بالكامل إذا ما صدرت الموافقة النهائية.

${paymentDestinationBlock()}

بعد التحويل ارفع الوصل فقط من الرابط الرسمي:
${receiptUrl(baseUrl, app)}

بعد تأكيد الوصل بتستكمل دراسة الملف حسب الدور وضغط المراجعات. ما بدي أعطيك مدة غير مؤكدة، وأول ما يظهر قرار فعلي رح يصلك تحديث.`;
}

function paymentAlreadyHandledReply(app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;

  if (app.payment_status === "confirmed") {
    return `رسوم فتح الملف مؤكدة على طلبك ✅

لا تعيد الدفع ولا ترسل تحويلًا جديدًا.
حالة الملف الحالية: ${statusHumanLabel(app.status || "")}.
رقم الطلب: ${tracking}`;
  }

  if (app.payment_status === "customer_claimed_paid") {
    return `وصل الدفع مسجل وبانتظار التأكيد.

لا تعيد الدفع ولا ترفع الوصل مرة ثانية.
رقم الطلب: ${tracking}`;
  }

  return "";
}

function paymentMethodReply(app: ApplicationRecord, baseUrl: string, customerText = "") {
  const handled = paymentAlreadyHandledReply(app);
  if (handled) return handled;

  const correction = isDeliveryCorrectionText(customerText)
    ? "معك حق، فهمت سؤالك السابق غلط. أنت بتسأل عن دفع رسوم فتح الملف، مش عن التوصيل.\n\n"
    : "";

  return `${correction}${bankCliqPaymentExplanation()}

${paymentDestinationBlock()}

بعد التحويل ارفع الوصل من رابط طلبك:
${receiptUrl(baseUrl, app)}`;
}

function paymentTimingReply(app: ApplicationRecord, baseUrl: string) {
  const handled = paymentAlreadyHandledReply(app);
  if (handled) return handled;

  return `نعم عادي، تقدر تحول للمسا أو بالوقت المناسب إلك.

${paymentDestinationBlock()}

بعد التحويل ارفع الوصل من رابط طلبك:
${receiptUrl(baseUrl, app)}

دراسة الملف تستكمل بعد وصول الوصل وتأكيد الدفع، فلا تحتاج تعيد إرسال التحويل أو الوصل أكثر من مرة.`;
}

function paymentRecipientReply(app: ApplicationRecord, baseUrl: string) {
  const handled = paymentAlreadyHandledReply(app);
  if (handled) return handled;

  return `أكيد. ${bankCliqPaymentExplanation()}

${paymentDestinationBlock()}


المبلغ: ${FILE_OPENING_FEE_JOD} دنانير فقط.

بعد التحويل ارفع الوصل من رابط طلبك:
${receiptUrl(baseUrl, app)}

بعد تأكيد الوصل تبدأ متابعة الدراسة حسب الدور وضغط المراجعات، وما بنثبت مدة غير مؤكدة.`;
}

function paymentNextStepReply(app: ApplicationRecord, baseUrl: string) {
  const handled = paymentAlreadyHandledReply(app);
  if (handled) return handled;

  return `بعد دفع رسوم فتح الملف ورفع الوصل من الرابط الرسمي، يتم تأكيد عملية الدفع وربطها بطلبك، وبعدها تُستكمل دراسة الملف والمتطلبات.

${paymentDestinationBlock()}

بعد تأكيد الدفع واكتمال الملف، الدراسة بتمشي حسب الدور وضغط المراجعات، وأول ما يظهر قرار فعلي رح يصلك تحديث.

رابط رفع الوصل:
${receiptUrl(baseUrl, app)}`;
}

function paymentReviewTimeReply(app: ApplicationRecord) {
  const handled = paymentAlreadyHandledReply(app);
  if (handled) {
    return `${handled}

بعد تأكيد الدفع واكتمال المتطلبات، الدراسة بتمشي حسب الدور وضغط المراجعات، بدون مدة ثابتة نقدر نوعدك فيها.`;
  }

  return `بعد دفع رسوم فتح الملف ورفع الوصل، يتم تأكيد الدفع واستكمال دراسة الطلب.

المراجعة بتمشي حسب الدور وضغط الملفات واكتمال البيانات. ما بنعطي موعد غير مؤكد، وأول ما يصدر القرار رح يصلك تحديث.

الملفات ماشية حسب ترتيبها، لذلك ما بنعطي موعدًا غير مؤكد، وأول ما يصدر قرار بالموافقة أو عدمها رح يصلك تحديث مباشرة.`;
}

function paymentObjectionReply(app: ApplicationRecord, baseUrl: string) {
  const handled = paymentAlreadyHandledReply(app);
  if (handled) return handled;

  return `رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط، وليست دفعة على الجهاز ولا القسط الأول.

هذه الخطوة تثبت رغبتك بالاستمرار وتسمح ببدء مراجعة الملف والمتطلبات. وإذا لم تصدر الموافقة النهائية، الرسوم مستردة بالكامل.

القسط الأول يكون بعد الاستلام حسب الاتفاق.

لما تكون جاهز، معلومات الدفع الرسمية:

${paymentDestinationBlock()}

رابط رفع الوصل:
${receiptUrl(baseUrl, app)}`;
}

function paymentLinkIssueReply(
  app: ApplicationRecord,
  baseUrl: string,
  memory: Awaited<ReturnType<typeof getConversationMemory>>,
) {
  const handled = paymentAlreadyHandledReply(app);
  if (handled) return handled;

  const rememberedReceipt = (memory.sentUrls || []).find((url) => /\/receipt(?:$|[?#])/i.test(url));
  const url = rememberedReceipt || receiptUrl(baseUrl, app);

  return `واضح إن رابط رفع الوصل ما فتح معك.

جرّب فتحه مباشرة من Chrome، وهذا هو الرابط الخاص بطلبك:
${url}

لا تعيد الدفع. إذا استمرت المشكلة اكتبلي شو ظهر عندك بالضبط.`;
}

function paymentAssistanceReply(input: {
  app: ApplicationRecord;
  baseUrl: string;
  customerText: string;
  intent: CustomerIntent;
  memory: Awaited<ReturnType<typeof getConversationMemory>>;
}) {
  const status = input.app.status || "";
  const paymentStatus = input.app.payment_status || "";
  const tracking = input.app.tracking_id || input.app.id;

  if (status === "cancelled" || status === "refund_requested" || paymentStatus === "refund_requested") {
    return `طلبك مش بمرحلة دفع حاليًا؛ حالته: ${statusHumanLabel(status)}.

لا تحول أي مبلغ جديد. إذا كان قصدك التراجع عن الإلغاء، اكتب: أريد إعادة تفعيل الطلب.
رقم الطلب: ${tracking}`;
  }

  const paymentActionable =
    status === "preliminary_qualified" ||
    status === "customer_confirmed_continue" ||
    ["pending", "pending_payment", "payment_info_sent"].includes(paymentStatus);

  if (!paymentActionable && !["confirmed", "customer_claimed_paid"].includes(paymentStatus)) {
    return `حسب حالة طلبك الحالية ما في دفع رسوم فتح ملف مطلوب الآن.

الحالة: ${statusHumanLabel(status)}.
رقم الطلب: ${tracking}`;
  }

  switch (String(input.intent)) {
    case "payment_method":
      return paymentMethodReply(input.app, input.baseUrl, input.customerText);
    case "payment_timing":
      return paymentTimingReply(input.app, input.baseUrl);
    case "payment_recipient":
      return paymentRecipientReply(input.app, input.baseUrl);
    case "payment_next_step":
      return paymentNextStepReply(input.app, input.baseUrl);
    case "payment_review_time":
      return paymentReviewTimeReply(input.app);
    case "payment_objection":
      if (isFileOpeningClarificationText(input.customerText)) {
        return `المقصود ملف طلب التقسيط الخاص فيك، مش ملف أو ورقة مطلوب تبعثها.

رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط، وهي الخطوة اللي تبدأ بعدها مراجعة الطلب والمتطلبات. الرسوم ليست قسطًا على الجهاز، ومستردة بالكامل إذا ما صدرت الموافقة النهائية.

القسط الأول يكون بعد استلام الجهاز حسب الاتفاق.

${paymentDestinationBlock()}

بعد التحويل ارفع الوصل من رابط طلبك:
${receiptUrl(input.baseUrl, input.app)}`;
      }
      return paymentObjectionReply(input.app, input.baseUrl);
    case "payment_link_issue":
      return paymentLinkIssueReply(input.app, input.baseUrl, input.memory);
    default:
      return paymentMessage(input.app, input.baseUrl);
  }
}

function deliveryDateReply(app: ApplicationRecord, baseUrl: string) {
  const tracking = app.tracking_id || app.id;
  const status = app.status || "";

  if (status === "approved" || status === "customer_accepts_delivery_delay") {
    return `طلبك عليه موافقة نهائية، لكن ما في موعد استلام مؤكد حاليًا.

أول ما يتم اعتماد موعد الاستلام من المكتب رح يصلك تحديث.
رقم الطلب: ${tracking}`;
  }

  if (status === "needs_guarantor") {
    return `طلبك لسا ما وصل للموافقة النهائية. المطلوب حاليًا استكمال بيانات الكفيل من الرابط الرسمي المرسل لك.

بعد استكمال المطلوب بتكمل متابعة الطلب، وما في موعد استلام محدد حاليًا.
رقم الطلب: ${tracking}`;
  }

  if (status === "needs_salary_slip") {
    return `طلبك لسا ما وصل للموافقة النهائية. المطلوب حاليًا رفع كشف راتب أو شهادة راتب من الرابط الرسمي المرسل لك.

ما في موعد استلام محدد حاليًا.
رقم الطلب: ${tracking}`;
  }

  if (status === "needs_identity" || status === "identity_requested") {
    return `طلبك لسا ما وصل للموافقة النهائية. المطلوب حاليًا رفع صورة الهوية من الرابط الرسمي المرسل لك.

ما في موعد استلام محدد حاليًا.
رقم الطلب: ${tracking}`;
  }

  return `طلبك لسا ما وصل للموافقة النهائية. حالته الحالية: ${statusHumanLabel(status)}.

ما في موعد استلام محدد حاليًا، وأول ما تتغير الحالة رح يصلك تحديث.
رقم الطلب: ${tracking}`;
}

function paymentStatusHumanLabel(paymentStatus: string | null | undefined) {
  switch (paymentStatus) {
    case "confirmed": return "الدفع مؤكد";
    case "customer_claimed_paid": return "الوصل واصل وبانتظار تأكيد الإدارة";
    case "pending":
    case "pending_payment":
    case "payment_info_sent": return "بانتظار رفع/تأكيد الوصل";
    default: return "غير مطلوب دفع حاليًا";
  }
}

function compactFileSnapshot(app: ApplicationRecord) {
  const device = app.device_name ? `ملف ${customerFacingDeviceName(app.device_name)}` : "ملفك";
  const status = statusHumanLabel(app.status || "");
  const payment = paymentStatusHumanLabel(app.payment_status || "");

  return `${device} ظاهر عندي، حالته ${status}، و${payment}.`;
}

function conversationalDirectReply(app: ApplicationRecord, baseUrl: string, customerText = "", intent: CustomerIntent = "unknown") {
  const name = firstTwoNames(app.full_name);
  const text = normalizeArabicText(customerText);

  if (String(intent) === "staff_identity" || isStaffIdentityText(customerText)) {
    return employeeIdentityReply(app.phone || app.tracking_id || app.id, app);
  }

  if (String(intent) === "call_request") {
    return callRequestReply(app.phone || app.tracking_id || app.id, app);
  }

  if (String(intent) === "greeting") {
    const staffName = assignedStaffName(app.phone || app.tracking_id || app.id);
    return `أهلًا ${name}، معك ${staffName} من فريق الأمين 🌿`;
  }

  if (String(intent) === "thanks") {
    return `العفو 🌿`;
  }

  if (String(intent) === "human_agent") {
    return employeeIdentityReply(app.phone || app.tracking_id || app.id, app);
  }

  if (String(intent) === "keep_request") {
    return keepRequestReply(app);
  }

  if (String(intent) === "payment_amount") {
    return paymentAmountReply(app, customerText);
  }

  if (String(intent) === "self_employed" || isSelfEmployedText(customerText) || isEmploymentEligibilityQuestionText(customerText)) {
    return selfEmployedReply(app);
  }

  if (isMinorEligibilityQuestionText(customerText)) {
    return minorEligibilityReply(app);
  }

  if (app.status === "rejected" && isRejectedStatusClarificationText(customerText)) {
    return rejectedStatusClarificationReply(app);
  }

  if (hasAny(text, ["اسلوبكم غريب", "أسلوبكم غريب", "ردودكم غريبه", "ردودكم غريبة", "في لف ودوران", "لف ودوران"])) {
    return `معك حق، الرد السابق ما كان واضح بالشكل المطلوب.

احكيلي النقطة نفسها وبجاوبك عليها مباشرة حسب الحالة الظاهرة على طلبك.`;
  }

  if (String(intent) === "order_status") {
    if (isApprovalProbabilityQuestionText(customerText)) return approvalProbabilityReply(app);
    return conciseOrderStatusReply(app, customerText);
  }

  if (["تمام", "اوكي", "ok", "okay", "اوك", "اه", "اها"].includes(text)) {
    return `تمام 🌿`;
  }

  return null;
}

function isGuarantorQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t || !hasAny(t, ["كفيل", "ضامن"])) return false;
  return hasAny(t, ["لازم", "هل", "بحتاج", "بيحتاج", "مطلوب", "ضروري", "ليش", "ليه", "اذا", "إذا", "؟"]);
}

function isSalaryRequirementQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t || !hasAny(t, ["كشف راتب", "شهاده راتب", "شهادة راتب", "راتب"])) return false;
  return hasAny(t, ["لازم", "هل", "بحتاج", "بحتاج", "مطلوب", "ضروري", "ليش", "ليه", "؟"]);
}


function isGeneralDocumentsQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "شو اجهز اوراق", "شو أجهز أوراق", "شو الاوراق", "شو الأوراق", "شو الورق المطلوب",
    "اي اوراق", "أي أوراق", "الاوراق المطلوبه", "الأوراق المطلوبة", "شو الاوراق المطلوبه", "شو الأوراق المطلوبة",
    "شو الوثائق", "اي وثائق", "أي وثائق", "شو اجيب معي", "شو أجيب معي", "المستندات المطلوبه", "المستندات المطلوبة",
  ]);
}

function isAfterApprovalRequirementQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const direct = hasAny(t, [
    "بعد الموافقه شو المطلوب", "بعد الموافقة شو المطلوب",
    "بعد الموافقه ماذا يلزم", "بعد الموافقة ماذا يلزم",
    "بعد القبول شو المطلوب", "بعد الاعتماد شو المطلوب",
  ]);
  if (direct) return true;

  const approvalAnchor = hasAny(t, [
    "بعد الموافقه", "بعد الموافقة", "بس تطلع الموافقه", "بس تطلع الموافقة",
    "اذا طلعت الموافقه", "إذا طلعت الموافقة", "بعد القبول", "بعد الاعتماد",
  ]);
  const requirementAnchor = hasAny(t, [
    "شو الاوراق", "شو الأوراق", "اثبات دخل", "إثبات دخل", "كشف راتب", "شهادة راتب",
    "كفيل", "وثائق", "مستند", "شو اجهز", "شو أجهز", "جيبلي", "تطلب مني", "المطلوب",
  ]);
  return approvalAnchor && requirementAnchor;
}

function isProcedureQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "شو الاجراءات", "شو الإجراءات", "ما الاجراءات", "ما الإجراءات",
    "شو الخطوات", "ما الخطوات", "بعد فتح الملف", "شو بصير بعد فتح الملف",
  ]);
}

function applicationDocumentsReply(app: ApplicationRecord) {
  const status = app.status || "";

  if (status === "needs_guarantor") {
    return `المطلوب حاليًا تعبئة بيانات الكفيل من الرابط الرسمي المرسل لك. لا ترفع أي مستند إضافي غير المطلوب.`;
  }

  if (status === "needs_salary_slip") {
    return `المطلوب حاليًا كشف راتب أو شهادة راتب من الرابط الرسمي. لا ترفع أي مستند إضافي غير المطلوب.`;
  }

  if (status === "needs_identity" || status === "identity_requested") {
    return `المطلوب حاليًا صورة الهوية الأمامية والخلفية من رابط الهوية الرسمي. لا ترفع أي مستند إضافي غير المطلوب.`;
  }

  return `حاليًا ما في أوراق إضافية مطلوبة منك. إذا احتاج طلبك مستندًا محددًا، رح توصلك رسالة باسمه وطريقة رفعه.`;
}

function selfEmployedReply(app: ApplicationRecord | null) {
  const status = app?.status || "";

  if (status === "rejected") {
    return `مش شرط تكون موظف بشركة حتى تقدم؛ العمل الحر أو الأونلاين ممكن ينذكر ببياناته الحقيقية.

لكن طلبك الحالي حالته غير موافق عليه، يعني ما تم اعتماده وما في موافقة جديدة بانتظارها على نفس الطلب.`;
  }

  return `مش شرط تكون موظف بشركة حتى تقدم طلب تقسيط.

إذا شغلك أونلاين أو فري لانس، عبّي بيانات عملك ودخلك الحقيقي مثل ما هي. القبول يعتمد على دراسة الطلب، وإذا احتاج الملف إثبات دخل أو كفيل رح توصلك الخطوة المطلوبة بشكل واضح.

وجود عمل حر ما يعني موافقة مضمونة، لكنه مش سبب لحاله حتى ما تقدم.`;
}

function minorEligibilityReply(app: ApplicationRecord | null) {
  if (app?.status === "rejected") {
    return `بما إن العمر أقل من 18، وجود كفيل لحاله ما يعني إن الطلب رح ينقبل.

وبالنسبة لطلبك الحالي، حالته غير موافق عليه؛ يعني ما تم اعتماده وما في داعي تنتظر قرار جديد على نفس الطلب.`;
  }

  return `إذا العمر أقل من 18، ما بقدر أؤكد إن وجود كفيل لحاله بكفي أو إن الطلب رح ينقبل.

العمر وبيانات الكفيل جزء من دراسة الطلب، والقرار يعتمد على مراجعة الملف. لا تعتبر وجود الوالدة ككفيل موافقة مضمونة.`;
}

function isRejectedStatusClarificationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "يعني ما زبط", "يعني ما زبطت", "يعني انرفض", "يعني انرفضت", "يعني مرفوض",
    "ملغي صح", "يعني ملغي", "استنى لحد ما تردو", "استنا لبين ما تردو", "استنى خبر", "او كيف", "أو كيف",
    "في رد ثاني", "في قرار ثاني", "لسا بستنى", "لسا انتظر", "صح",
  ]);
}

function rejectedStatusClarificationReply(app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  return `نعم، عبارة "غير موافق عليه حاليًا" تعني إن الطلب ما تم اعتماده.

هو مش طلب ملغي منك، لكنه غير مقبول، وما في قرار جديد لازم تنتظره على نفس الطلب.
رقم الطلب: ${tracking}`;
}

function afterApprovalRequirementsReply(app: ApplicationRecord) {
  if (app.status === "approved") {
    return `طلبك عليه موافقة نهائية. لا ترفع أو تجهز مستندات إضافية من نفسك؛ اتبع فقط تعليمات موعد الحضور الرسمية المرتبطة بطلبك، وإذا كان في متطلب محدد رح يوصلك باسمه وطريقة استكماله.`;
  }

  return `قبل الموافقة النهائية، أي مستند إضافي يحتاجه الملف مثل إثبات دخل أو بيانات كفيل رح يوصلك طلبه بشكل واضح مع الرابط الرسمي المخصص له.

ما في داعي تجهز أو ترسل مستندات من نفسك، ووجود طلب مستند إضافي لاحقًا يعتمد على دراسة الملف وليس شرطًا ثابتًا على كل الطلبات.`;
}

function reviewAndProcedureReply(app: ApplicationRecord) {
  const status = app.status || "";
  const action = currentCustomerActionLine(app);

  if (status === "preliminary_qualified" || status === "customer_confirmed_continue") {
    return `بعد دفع رسوم فتح الملف ورفع الوصل، ما عليك أي خطوة ثانية إلا إذا وصلك طلب محدد.

مدة المراجعة بتختلف حسب الدور وضغط الملفات واكتمال البيانات، وما بنعطي موعد غير مؤكد.
${action}`;
  }

  return `مدة المراجعة بتختلف حسب الدور وضغط الطلبات واكتمال البيانات، وما بنعطي موعد غير مؤكد.

${action}`;
}


function applicationFactsAcknowledgementReply(app: ApplicationRecord, customerText: string) {
  const name = firstTwoNames(app.full_name);
  const details = extractSalaryCorrectionDetails(customerText, app.salary);
  const mentionsNoSocialSecurity = hasAny(customerText, [
    "مش مشترك بالضمان", "غير مشترك بالضمان", "مش بالضمان", "بدون ضمان",
  ]);

  const statedParts: string[] = [];
  if (mentionsNoSocialSecurity) statedParts.push("إنك غير مشترك بالضمان");
  if (details.correctSalary !== null) statedParts.push(`إن راتبك ${details.correctSalary} دينار`);

  if (
    details.correctSalary !== null &&
    details.storedSalary !== null &&
    details.correctSalary !== details.storedSalary
  ) {
    return `فهمت عليك ${name}: ${statedParts.join("، و") || "في معلومة بدك تصححها"}.

لكن الراتب الظاهر على طلبك حاليًا ${details.storedSalary} دينار، لذلك في فرق لازم يتصحح بدل ما نجاوبك بجملة حالة عامة.

اكتب: بدي أعدل الراتب إلى ${details.correctSalary}
وما في داعي تقدم طلب جديد.`;
  }

  return `تمام ${name}، وصلتني المعلومة${statedParts.length ? `: ${statedParts.join("، و")}` : ""}.

حاليًا ما في مستند إضافي مطلوب منك إلا إذا ظهر على الطلب طلب محدد. وإذا قصدك تعديل معلومة مسجلة، اكتبلي المعلومة القديمة والصحيحة بوضوح.`;
}

function applicationDataCorrectionReply(
  app: ApplicationRecord,
  combinedCustomerContext: string,
  hasPendingConfirmation: boolean,
) {
  const name = firstTwoNames(app.full_name);
  const details = extractSalaryCorrectionDetails(combinedCustomerContext, app.salary);
  const tracking = app.tracking_id || app.id;

  if (!salaryValueIsReasonable(details.correctSalary)) {
    return `أكيد ${name}، بقدر أصحح الراتب على نفس الطلب، وما في داعي تقدم طلب جديد.

اكتب الرقم الصحيح بهذه الصيغة:
الراتب الصحيح 450

رقم الطلب: ${tracking}`;
  }

  if (details.storedSalary === details.correctSalary) {
    return `الراتب المسجل على طلبك هو بالفعل ${details.correctSalary} دينار، لذلك ما في تعديل مطلوب حاليًا.

رقم الطلب: ${tracking}`;
  }

  const wrongSalary = details.wrongSalary ?? details.storedSalary;
  const correctionLine = wrongSalary !== null
    ? `${wrongSalary} انكتب بالغلط، والصحيح ${details.correctSalary} دينار`
    : `الراتب الصحيح ${details.correctSalary} دينار`;

  if (hasPendingConfirmation) {
    return `فاهم عليك ${name}، وواضح إنه انكتب بالغلط.

باقي بس تأكيد صريح حتى ما نغيّر بيانات الطلب بدون إذنك. اكتب:
أكد تعديل الراتب إلى ${details.correctSalary}

رقم الطلب: ${tracking}`;
  }

  return `تمام ${name}، وصلت الفكرة: ${correctionLine}.

قبل ما يتعدل الطلب، اكتب للتأكيد:
أكد تعديل الراتب إلى ${details.correctSalary}

رح يتعدل الراتب على نفس الطلب، وما في داعي تقدم طلب جديد.
رقم الطلب: ${tracking}`;
}

async function updateApplicationSalary(app: ApplicationRecord, salary: number) {
  const { error } = await supabaseAdmin
    .from("applications")
    .update({ salary })
    .eq("id", app.id);

  if (error) {
    console.error("updateApplicationSalary error:", error.message);
    throw error;
  }

  return { ...app, salary } as ApplicationRecord;
}

function salaryCorrectionConfirmedReply(app: ApplicationRecord, oldSalary: number | null, newSalary: number) {
  const tracking = app.tracking_id || app.id;
  const oldSalaryLine = oldSalary !== null ? ` من ${oldSalary}` : "";

  return `تم تعديل الراتب${oldSalaryLine} إلى ${newSalary} دينار على نفس الطلب ✅

ما تم تغيير أي بيانات ثانية، وما في داعي تقدم طلب جديد.
رقم الطلب: ${tracking}`;
}

function directRequirementQuestionReply(app: ApplicationRecord, customerText: string) {
  const name = firstTwoNames(app.full_name);
  const status = app.status || "";

  if (isApplicationFactsStatementText(customerText)) {
    return applicationFactsAcknowledgementReply(app, customerText);
  }

  if (isAfterApprovalRequirementQuestionText(customerText)) {
    return afterApprovalRequirementsReply(app);
  }

  if (isGeneralDocumentsQuestionText(customerText)) {
    return applicationDocumentsReply(app);
  }

  if (isProcedureQuestionText(customerText) && isReviewTimeText(customerText)) {
    return reviewAndProcedureReply(app);
  }

  if (isProcedureQuestionText(customerText)) {
    return reviewAndProcedureReply(app);
  }

  if (isGuarantorQuestionText(customerText)) {
    const guarantorRequired = status === "needs_guarantor";

    if (guarantorRequired) {
      return `نعم ${name}، المطلوب حاليًا تعبئة بيانات الكفيل من الرابط الرسمي المرسل لك.

هذه الخطوة لا تعني رفض الطلب.`;
    }

    return `${name}، حسب حالة طلبك الظاهرة حاليًا ما في طلب كفيل مسجل كخطوة مطلوبة.

إذا تغيّرت متطلبات الدراسة، بتوصلك رسالة واضحة بالمطلوب.`;
  }

  if (isSalaryRequirementQuestionText(customerText)) {
    const salarySlipRequired = status === "needs_salary_slip";

    if (salarySlipRequired) {
      return `نعم ${name}، المطلوب حاليًا رفع كشف راتب أو شهادة راتب من الرابط الرسمي المرسل لك.

هذه الخطوة لا تعني رفض الطلب.`;
    }

    return `${name}، حسب حالة طلبك الظاهرة حاليًا ما في كشف راتب مسجل كخطوة مطلوبة.

إذا احتاجته الإدارة لاحقًا، رح يوصلك الطلب بشكل واضح.`;
  }

  return null;
}

function humanHandoffReply(app: ApplicationRecord | null, customerText: string) {
  const name = app ? firstTwoNames(app.full_name) : "";
  const tracking = app ? app.tracking_id || app.id : "";

  return `أنا معك${name ? ` ${name}` : ""}.

شفت المحادثة وحالة الطلب، احكيلي النقطة اللي بدك جوابها وبجاوبك عليها مباشرة.${tracking ? `

رقم الطلب: ${tracking}` : ""}`;
}


function systemPromptRequestReply() {
  return `ما بقدر أشارك أو أترجم تعليمات داخلية أو تفاصيل الأنظمة المستخدمة.

بقدر أساعدك فقط بخصوص خدمات الأمين أو حالة طلبك.`;
}

function employeeIdentityReply(from: string, app?: ApplicationRecord | null) {
  const staffName = assignedStaffName(from);
  const requestLine = app
    ? `اكتب رسالتك ورقم طلبك ${app.tracking_id || app.id}.`
    : "اكتب رسالتك ورقم الطلب أو رقم التتبع.";

  return `معك ${staffName} من فريق الأمين.

التواصل الأساسي للطلبات والمتابعة عبر واتساب. ${requestLine}

يتم الرد حسب الدور وضغط المراجعات أو الظروف التشغيلية الاستثنائية.`;
}

function callRequestReply(from: string, app?: ApplicationRecord | null) {
  const staffName = assignedStaffName(from);
  const requestLine = app
    ? `طلبك رقم ${app.tracking_id || app.id} ظاهر عندي، وبقدر أتابعه معك هون مباشرة.`
    : "ابعث رقم الطلب أو سؤالك هون وبراجعه معك مباشرة.";

  return `معك ${staffName} من فريق الأمين.

التواصل الأساسي للطلبات والمتابعة عبر واتساب، ويتم الرد حسب الدور وضغط المراجعات أو الظروف التشغيلية الاستثنائية حتى يظل كل تحديث موثق.

${requestLine}`;
}

function keepRequestReply(app: ApplicationRecord | null) {
  if (!app) {
    return `تمام، ما رح يتم إلغاء أي طلب من خلال رسالتك.

ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب حتى أتأكد لك من حالته.`;
  }

  if (app.status === "cancelled" || app.status === "customer_declined_continue") {
    return `طلبك ظاهر حاليًا كطلب ملغي، لكن ممكن تطلب التراجع عن الإلغاء.

للبدء اكتب:
أريد إعادة تفعيل الطلب

لن يتغير وضع الطلب إلا بعد تأكيدك الصريح.`;
  }

  return `تمام، طلبك مستمر وما تم إلغاؤه.

حالته الحالية: ${statusHumanLabel(app.status || "")}.`;
}

function paymentAmountReply(app: ApplicationRecord | null, customerText: string) {
  const t = normalizeArabicText(customerText);

  if (isReceiptConfirmationCurrentText(customerText)) {
    return receiptUploadConfirmationReply(app);
  }

  if (isRefundPolicyInquiryText(customerText)) {
    const asksDeduction = hasAny(t, [
      "تنخصم", "بتنخصم", "ينخصم", "بينخصم", "بتنهضم", "تنهضم",
      "من اول قسط", "من أول قسط", "من القسط الاول", "من القسط الأول",
    ]);
    const feeLine = `رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير منفصلة عن ثمن الجهاز وعن القسط الأول.`;
    const refundLine = `إذا لم تتم الموافقة النهائية على الطلب، تكون رسوم فتح الملف مستردة بالكامل حسب حالة الطلب.`;
    const deductionLine = asksDeduction
      ? `ولا يتم احتسابها كخصم من القسط الأول.`
      : "";

    return `${feeLine}
${refundLine}${deductionLine ? `
${deductionLine}` : ""}`;
  }

  if (hasAny(t, ["رسوم فتح الملف", "رسوم الملف"])) {
    return `رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط، وتُطلب بعد التأهيل المبدئي للطلب، وليست دفعة على الجهاز ولا القسط الأول.`;
  }

  if (hasAny(t, ["دفعه اولى", "دفعة اولى", "القسط الاول", "القسط الأول"])) {
    return `قيمة القسط الأول تعتمد على الجهاز وخطة التقسيط المعتمدة على طلبك، وما عندي رقم مؤكد ظاهر بالملف حاليًا. القسط الأول يكون بعد الاستلام حسب الاتفاق.`;
  }

  if (app?.payment_status === "confirmed") {
    return `المبلغ المؤكد على الملف حاليًا هو رسوم فتح الملف بقيمة ${FILE_OPENING_FEE_JOD} دنانير. أما قيمة القسط فتتحدد حسب الجهاز والاتفاق عند اعتماد الطلب.`;
  }

  return `رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط بعد التأهيل المبدئي. أما قيمة القسط أو الدفعة المرتبطة بالجهاز فتتحدد حسب الجهاز وخطة التقسيط المعتمدة.`;
}

function conciseOrderStatusReply(app: ApplicationRecord, customerText = "") {
  const status = String(app.status || "");
  const tracking = app.tracking_id || app.id;
  const stage = resolveApplicationStage(status, app.payment_status);
  const gender = detectCustomerGender(app.full_name);
  const approvalFollowup = customerAskedAboutFinalApproval(customerText) || isApprovalStatusQuestionText(customerText) || hasAny(normalizeArabicText(customerText), [
    "يعني تم ولا شو", "تم ولا لا", "يعني تم", "خلص تم", "وافقوا ولا لا",
  ]);

  if (approvalFollowup) {
    if (stage === "approved") {
      return `نعم، صدرت الموافقة النهائية على طلبك ✅

حاليًا بانتظار توفر الجهاز واعتماد جدول الاستلام من المكتب.
رقم الطلب: ${tracking}`;
    }

    if (stage === "final_review") {
      return `الملف في المرحلة النهائية من الدراسة، لكن القرار النهائي لم يصدر بعد.

أول ما يصدر القرار رح يوصلك تحديث مباشرة.
رقم الطلب: ${tracking}`;
    }

    return `لا، لسا ما صدرت الموافقة النهائية. ${stageCustomerStatusLine(app)}

${noAdditionalActionLine(gender)}
رقم الطلب: ${tracking}`;
  }

  if (status === "preliminary_application") {
    return `تم تسجيل طلبك وتأهيله مبدئيًا، وهو حاليًا بانتظار دوره لبدء دراسة الملف.

${noAdditionalActionLine(gender)} ${nextStageContactLine(gender)} 🌿
رقم الطلب: ${tracking}`;
  }

  if (status === "preliminary_qualified" || status === "prequalified") {
    const continueInstruction = gender === "female"
      ? "إذا حابة تكمّلي، اكتبي: أود الاستمرار."
      : gender === "male"
        ? "إذا حاب تكمل، اكتب: أود الاستمرار."
        : "للاستمرار، يمكن إرسال العبارة التالية: أود الاستمرار.";
    return `تم تأهيل طلبك مبدئيًا، وهو بانتظار بدء دراسة الملف.

${continueInstruction}
رقم الطلب: ${tracking}`;
  }

  if (
    status === "customer_confirmed_continue" ||
    ["pending", "pending_payment", "payment_info_sent"].includes(app.payment_status || "")
  ) {
    return `تم تأكيد رغبتك بالاستمرار. المطلوب حاليًا دفع رسوم فتح الملف بقيمة ${FILE_OPENING_FEE_JOD} دنانير ورفع الوصل من الرابط المرسل لك.

رقم الطلب: ${tracking}`;
  }

  if (app.payment_status === "customer_claimed_paid") {
    return `وصل الدفع واصل وبانتظار التأكيد. لا تعيد الدفع مرة ثانية.

رقم الطلب: ${tracking}`;
  }

  if (stage === "requirements_pending") {
    return `${stageCustomerStatusLine(app)}

رقم الطلب: ${tracking}`;
  }

  if (stage === "under_review") {
    return `الملف قيد الدراسة، وما في تحديث جديد ظاهر حاليًا.

${noAdditionalActionLine(gender)} ${nextStageContactLine(gender)}
رقم الطلب: ${tracking}`;
  }

  if (stage === "final_review") {
    return `الملف في المرحلة النهائية من الدراسة، وما صدر القرار النهائي حتى الآن.

${noAdditionalActionLine(gender)} ${nextStageContactLine(gender)}
رقم الطلب: ${tracking}`;
  }

  if (stage === "approved") {
    return `صدرت الموافقة النهائية على طلبك، وحاليًا بانتظار توفر الجهاز واعتماد جدول الاستلام من المكتب.

رقم الطلب: ${tracking}`;
  }

  if (stage === "rejected") {
    return `انتهت دراسة الطلب ولم تتم الموافقة.

رقم الطلب: ${tracking}`;
  }

  if (stage === "refund_requested") {
    return `طلب الاسترداد مسجل وقيد المتابعة.

رقم الطلب: ${tracking}`;
  }

  if (stage === "cancelled") {
    return `الطلب ظاهر لدينا كطلب ملغي.

رقم الطلب: ${tracking}`;
  }

  return `طلبك ظاهر عندي، وحالته الحالية: ${statusHumanLabel(status, app.payment_status)}.

رقم الطلب: ${tracking}`;
}

function contextualApplicationFallback(app: ApplicationRecord) {
  return `طلبك ظاهر عندي، وحالته الحالية: ${statusHumanLabel(app.status || "")}.

${currentCustomerActionLine(app)}
ما في قرار جديد مختلف عن الحالة الظاهرة حاليًا.`;
}

async function handleDeviceChange(input: {
  app: ApplicationRecord | null;
  from: string;
  text: string;
  memory: Awaited<ReturnType<typeof getConversationMemory>>;
  baseUrl: string;
  confirmedFromContext: boolean;
}) {
  if (!input.app) {
    return `أكيد، تغيير الجهاز ما بيلغي طلب التقسيط.

ابعث رقم الطلب الذي يبدأ بـ AM- حتى أعطيك رابط التعديل الرسمي المرتبط بملفك.`;
  }

  const currentDevice = customerFacingDeviceName(input.app.device_name) || "غير محدد";
  const url = hasSpecificSelectedDevice(input.app.device_name)
    ? changeDeviceUrl(input.baseUrl, input.app)
    : selectDeviceUrl(input.baseUrl, input.app);

  return `أكيد، تغيير الجهاز ما بيلغي طلبك.

حتى تسجل الجهاز والسعة واللون بدون لخبطة، استخدم رابط التعديل الرسمي:
${url}

الجهاز الحالي: ${currentDevice}
بعد إرسال النموذج يبقى الجهاز الحالي كما هو إلى أن تتم مراجعة طلب التعديل واعتماده.`;
}

function repeatedReplyRecoveryReply(intent: CustomerIntent) {
  if (String(intent) === "review_time" || String(intent) === "payment_review_time") {
    return `بعرف إنك منتظر. ما في مدة جديدة مؤكدة أقدر أعطيك إياها؛ المراجعة ماشية حسب الدور وضغط الملفات، وأول ما يظهر تحديث فعلي رح يوصلك.`;
  }

  if (["order_status", "delivery"].includes(String(intent))) {
    return `لسه ما ظهر تحديث جديد على الطلب، وبعرف إن الانتظار مزعج. ما في خطوة ناقصة منك حاليًا، وأول ما تتغير الحالة رح يصلك التحديث.`;
  }

  return "";
}

function shouldReturnExactCustomerReply(intent: CustomerIntent) {
  // V1.3.0 HUMAN-FIRST: exact wording is reserved for state-changing / secure flows
  // and tiny social replies. Factual conversation is normally phrased by Pro and
  // remains protected by the final truth gate.
  return shouldReturnExactHumanFirstReply(intent);
}

function isNearDuplicateAssistantReply(
  reply: string,
  memory: Awaited<ReturnType<typeof getConversationMemory>>,
  intent: CustomerIntent,
) {
  if (["greeting", "thanks", "reaction"].includes(String(intent))) return false;

  const clean = normalizeArabicText(reply);
  if (clean.length < 80) return false;

  return (memory.lastAssistantReplies || []).some((previous) => {
    const previousClean = normalizeArabicText(previous);
    if (!previousClean) return false;
    if (previousClean === clean) return true;
    return textSimilarityScore(previousClean, clean) >= 0.82;
  });
}

function safeReply(app: ApplicationRecord, baseUrl: string, customerText = "", intent: CustomerIntent = "order_status") {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const url = trackUrl(baseUrl, app);

  if (String(intent) === "regulatory_status") return regulatoryStatusReply();
  if (String(intent) === "business_identity") return businessIdentityReply();

  const conversational = conversationalDirectReply(app, baseUrl, customerText, intent);
  if (conversational) return conversational;

  if (String(intent) === "system_prompt_request") return systemPromptRequestReply();
  if (String(intent) === "contact_info") return contactInfoReply(baseUrl, app.phone || tracking);
  if (String(intent) === "website") return websiteReply(baseUrl, app.phone || tracking);
  if (String(intent) === "location") return locationReply(app.phone || tracking, app);
  if (String(intent) === "installment_info") return installmentInfoReply(baseUrl, app.phone || tracking, customerText, app);
  if (String(intent) === "requirements") return applicationDocumentsReply(app);
  if (String(intent) === "products") {
    if (isLegacyLimitedStockUiMessageText(customerText)) {
      return limitedStockUiCorrectionReply(baseUrl);
    }
    if (isProductAvailabilityUiIssueText(customerText)) {
      return `إذا جهاز معيّن ما ظهر عندك بالموقع، ابعثلي اسم الجهاز أو الموديل اللي بتدور عليه وبوضحلك الخطوة المناسبة بدون ما نفترض إنه غير متوفر.`;
    }
    if (isAdditionalDeviceQuestionText(customerText)) {
      return `طلبك الحالي مرتبط بالجهاز المسجل عليه. ما عندي إجراء معتمد أقدر أوعدك من خلاله بإضافة جهاز ثاني على نفس الطلب وهو قيد الدراسة.

ما رح أغيّر جهازك الحالي ولا أسجل جهازًا إضافيًا من واتساب بدون إجراء رسمي واضح. إذا بدك جهازًا ثانيًا، خليه كسؤال منفصل وما تدفع أي مبلغ إضافي بسببه قبل ما توصلك تعليمات معتمدة.`;
    }
    if (isProductSpecificationQuestionText(customerText) || isShortProductSpecificationFollowupText(customerText) || isProductAccessoryQuestionText(customerText) || isProductPackagingQuestionText(customerText)) {
      return productSpecificationReply(baseUrl, app, customerText);
    }
    if (isDeviceSelectionText(customerText) || !hasSpecificSelectedDevice(app.device_name)) {
      return existingApplicationDeviceSelectionReply(baseUrl, app);
    }
    return `الجهاز المسجل على طلبك حاليًا: ${customerFacingDeviceName(app.device_name) || "غير محدد"}.

أما الألوان أو الأجهزة المتوفرة فعليًا فتتأكد حسب توريد المورد وقت اعتماد الطلب، وما بدي أعطيك توفر غير مؤكد.`;
  }
  if (String(intent) === "unknown") {
    return unknownReply(app.phone || tracking, app, customerText);
  }

  if (String(intent) === "abuse") return abuseReply(baseUrl, app.phone || tracking, app, customerText);
  if (String(intent) === "legal_threat") return legalThreatReply(baseUrl, app.phone || tracking, app, customerText);
  if (String(intent) === "social_media_threat") return socialMediaThreatReply(baseUrl, app.phone || tracking, app, customerText);
  if (String(intent) === "scam_accusation") return scamAccusationReply(baseUrl, app.phone || tracking, app, customerText);
  if (String(intent) === "trust_verification") {
    return isPaymentGuaranteeText(customerText)
      ? paymentGuaranteeReply(baseUrl, app)
      : trustVerificationReply(baseUrl, app);
  }
  if (String(intent) === "payment_dispute") return paymentDisputeReply(baseUrl, app.phone || tracking, app, customerText);
  if (String(intent) === "device_delay_rage") return deviceDelayRageReply(baseUrl, app.phone || tracking, app, customerText);
  if (String(intent) === "emotional_pressure") return emotionalPressureReply(baseUrl, app.phone || tracking, app, customerText);
  if (String(intent) === "complaint") return complaintReply(baseUrl, app.phone || tracking, app, customerText);
  if (String(intent) === "refund") return refundReply(baseUrl, app.phone || tracking, app, customerText);
  if (String(intent) === "cancel_refund_request") return cancelRefundRequestReply(app);
  if (String(intent) === "tracking_link_request") return trackingLinkReply(app, baseUrl);
  if (String(intent) === "cancel_request") return cancelRequestReply(app, baseUrl, customerText);
  if (String(intent) === "cancel_confirmed") return declineConfirmationMessage(app, baseUrl);
  if (String(intent) === "alternative_payment_source") return alternativePaymentSourceReply(app, baseUrl);
  if (String(intent) === "receipt_upload_needed") return receiptUploadReply(app, baseUrl);
  if (String(intent) === "receipt_upload_confirmation") return receiptUploadConfirmationReply(app);
  if (String(intent) === "office_pickup_policy") return officePickupPolicyReply(app.phone || tracking, app, baseUrl);
  if (String(intent) === "supplier_delay_question") return supplierDelayReply(app, baseUrl);
  if (String(intent) === "delivery") return deliveryDateReply(app, baseUrl);
  if (String(intent) === "review_time") return reviewTimeReply(app.phone || tracking, app, baseUrl, customerText);
  if (String(intent) === "greeting") return socialGreetingReply(app.phone || tracking, app, baseUrl, customerText);

  if (String(intent) === "payment") {
    if (
      status === "preliminary_qualified" ||
      paymentStatus === "pending" ||
      paymentStatus === "pending_payment" ||
      paymentStatus === "payment_info_sent"
    ) {
      return paymentMessage(app, baseUrl);
    }

    if (paymentStatus === "confirmed") {
      return `أهلًا ${name} 🌿

رسوم فتح الملف مؤكدة لدينا ✅

${paidDevicesReassuranceParagraph(app)}

لا يوجد أي دفع مطلوب حاليًا، والقسط الأول لا يُدفع الآن، ويكون بعد الاستلام حسب الاتفاق.

حالة الطلب:
${statusHumanLabel(status)}

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
    }

    if (paymentStatus === "customer_claimed_paid") {
      return `أهلًا ${name} 🌿

وصل الدفع أو إشعار الدفع مسجل لدينا، والطلب بانتظار تأكيد الإدارة.

يرجى عدم إعادة الدفع مرة ثانية حتى لا يصير تكرار بالدفع.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
    }
  }

  if (paymentStatus === "customer_claimed_paid") {
    return `أهلًا ${name} 🌿

وصل الدفع مسجل لدينا، والطلب الآن بانتظار تأكيد الإدارة.

لا تعيد الدفع مرة ثانية، وبمجرد التأكيد ستظهر الحالة على رابط المتابعة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (paymentStatus === "confirmed" && status === "under_review") {
    if (canShowPostPaymentRequirements(app)) {
      return postPaymentRequirementsReply(app, baseUrl);
    }

    return paymentRequirementsPendingReply(app, baseUrl);
  }

  if (
    status === "preliminary_qualified" ||
    paymentStatus === "pending" ||
    paymentStatus === "pending_payment" ||
    paymentStatus === "payment_info_sent"
  ) {
    return paymentMessage(app, baseUrl);
  }

  if (status === "customer_confirmed_continue") {
    return `أهلًا ${name} 🌿

رغبتكم بالاستمرار مسجلة لدينا.

لا يوجد أي دفع مطلوب حاليًا من خلال هذه الرسالة. إذا ظهرت أي خطوة إضافية سيتم توضيحها حسب حالة الطلب.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "delivery_delay_notice_sent") {
    return `أهلًا ${name} 🌿

تم إرسال خيار التمديد أو الاسترداد على طلبكم.

تقدروا تختاروا الانتظار لحين وصول الأجهزة واعتماد جدول الاستلام من المكتب أو طلب استرداد رسوم فتح الملف من الرابط التالي:
${delayUrl(baseUrl, app)}

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "customer_accepts_delivery_delay") {
    return `أهلًا ${name} 🌿

اختياركم بالانتظار مسجل لدينا.

حتى هذه اللحظة ما زلنا بانتظار وصول الأجهزة من المورد/الوكلاء المعتمدين.

لا يوجد موعد استلام نهائي محدد حاليًا.

سيتم التواصل معكم فور وصول الأجهزة واعتماد جدول الاستلام من المكتب من الإدارة.

لا يوجد أي إجراء أو دفع مطلوب منكم حاليًا.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "refund_requested" || paymentStatus === "refund_requested") {
    return refundDeescalationReply(app, customerText);
  }

  if (status === "refund_completed") {
    return `أهلًا ${name} 🌿

تم تنفيذ استرداد رسوم فتح الملف حسب البيانات المسجلة لدينا.

إذا عندك أي ملاحظة، ابعث رقم التتبع ورقم الهاتف المستخدم بالطلب.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "customer_declined_continue") {
    return `أهلًا ${name} 🌿

تم تسجيل عدم رغبتكم بالاستمرار حاليًا.

الطلب ظاهر لدينا كغير مستمر، ولا يوجد أي دفع مطلوب.

إذا كان هذا القرار بالخطأ أو رغبتكم بإعادة المتابعة لاحقًا، ابعثوا رقم التتبع وبوضح لكم الخيارات المتاحة حسب الحالة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "salary_slip_uploaded") {
    return `أهلًا ${name} 🌿

تم استلام كشف الراتب / شهادة الراتب وربطها بطلبكم.

الطلب الآن بانتظار الخطوة التالية حسب الحالة الظاهرة على الطلب. لا يوجد أي دفع مطلوب حاليًا إلا إذا ظهرت تعليمات جديدة من الإدارة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "first_installment_requested" || paymentStatus === "first_installment_whatsapp") {
    return `أهلًا ${name} 🌿

حسب تحديث الإدارة، مطلوب اختيار/استكمال إجراء القسط الأول قبل المتابعة النهائية.

يرجى متابعة التعليمات التي وصلتكم من الإدارة أو إرسال رقم التتبع حتى أوضح لكم الخطوة المطلوبة حسب الحالة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "needs_identity" || status === "identity_requested") {
    return `أهلًا ${name} 🌿

لاستكمال مراجعة طلبكم، نحتاج رفع صور الهوية بشكل واضح من خلال الرابط الرسمي التالي:

${identityUrl(baseUrl, app)}

المطلوب:
1. صورة الوجه الأمامي للهوية
2. صورة الوجه الخلفي للهوية

يرجى أن تكون الصور واضحة، غير مقصوصة، وبدون انعكاس قوي على البيانات.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "identity_uploaded") {
    return `أهلًا ${name} 🌿

تم استلام صور الهوية وربطها بطلبكم بنجاح.

الملف الآن بانتظار مراجعة الإدارة للوثائق واستكمال الخطوة التالية حسب حالة الطلب.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "needs_salary_slip") {
    return `أهلًا ${name} 🌿

طلبكم بحاجة كشف راتب أو شهادة راتب حديثة لاستكمال الدراسة.

مهم: صور واتساب لا تُعتمد كرفع رسمي داخل الملف. حتى ينربط الكشف رسميًا بالطلب، ارفعه من الرابط التالي:
${salarySlipUrl(baseUrl, app)}

إرسال المستند لا يعني الموافقة النهائية، لكنه مطلوب حتى تقدر الإدارة تكمل مراجعة الملف.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "needs_guarantor") {
    return `أهلًا ${name} 🌿

الحالة الحالية للطلب تشير إلى أن الملف بحاجة استكمال متطلبات الكفيل.

نعتذر منكم عن التأخير ونقدّر صبركم، خصوصًا مع ضغط المراجعات وكثرة الملفات.

فور استكمال المتطلبات ومراجعتها من الإدارة سيتم تحديث الحالة وإبلاغكم بالمستجدات.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

كل عام وأنتم بخير 🌿

${BUSINESS_NAME}`;
  }

  if (status === "guarantor_submitted") {
    return `تمام ${name} 🌿

بيانات الكفيل وصلت وتم ربطها بطلبكم.

نعتذر منكم عن أي تأخير بالمتابعة. الطلب الآن بانتظار الخطوة التالية حسب الحالة الظاهرة، ولا يوجد موعد استلام محدد حاليًا قبل اكتمال الدراسة واعتماد جدول الاستلام من المكتب.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
  }

  if (status === "under_review") {
    return `أهلًا ${name} 🌿

طلبكم ما زال قيد الدراسة والمتابعة من الإدارة.

نعتذر منكم عن التأخير ونقدّر صبركم، خصوصًا مع ضغط المراجعات وكثرة الملفات.

لا يوجد قرار نهائي ظاهر على الطلب حتى الآن، وسيتم التواصل معكم فور ظهور أي تحديث جديد على الملف.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

كل عام وأنتم بخير 🌿

${BUSINESS_NAME}`;
  }

  if (status === "approved") {
    return `أهلًا ${name} 🌿

نعتذر منكم بصدق عن التأخير ونقدّر صبركم وثقتكم بنا.

طلبكم عليه موافقة نهائية ✅

حتى هذه اللحظة ما زلنا بانتظار وصول الأجهزة من المورد/الوكلاء المعتمدين.

لذلك لا يوجد حاليًا موعد استلام محدد أو نهائي للطلب.

سيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة واعتماد جدول الاستلام من المكتب من الإدارة.

لا يوجد أي إجراء مطلوب منكم حاليًا، ولا يوجد أي دفعات مطلوبة.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

نشكر لكم تفهمكم وصبركم 🌿

${BUSINESS_NAME}`;
  }

  if (status === "rejected") {
    return `أهلًا ${name} 🌿

نعتذر، لم تتم الموافقة على الطلب حاليًا.

إذا حاب تعرف التفاصيل العامة أو إمكانية إعادة التقديم لاحقًا، ابعث سؤالك بشكل واضح وبوضح لك المتاح حسب الحالة بدون وعود غير مؤكدة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  if (status === "cancelled") {
    return `أهلًا ${name} 🌿

الطلب ظاهر لدينا كطلب ملغي.

إذا كان الإلغاء بالخطأ، ابعث رقم التتبع ورقم الهاتف وبوضح لك الخطوة المتاحة حسب الحالة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
  }

  return `أهلًا ${name} 🌿

طلبكم ظاهر لدينا وقيد المتابعة.

حالة الطلب:
${statusHumanLabel(status)}

لا يوجد أي دفع مطلوب حاليًا إلا إذا تم تأهيل الطلب مبدئيًا وإرسال تعليمات رسوم فتح الملف لكم.

رقم التتبع:
${tracking}

رابط المتابعة:
${url}

${BUSINESS_NAME}`;
}

function generalGreetingReply(from: string, customerText = "") {
  return socialGreetingReply(from, null, undefined, customerText);
}

function generalReviewTimeReply(from: string, customerText = "") {
  return reviewTimeReply(from, null, undefined, customerText);
}

function refundActiveTimingReply(app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;
  return `طلبك حاليًا بمسار الاسترداد، لذلك ما في موعد دراسة أو استلام فعّال على الملف الآن.

إذا بدك تتراجع عن الاسترداد وتكمل على نفس الطلب، اكتب: أريد إعادة تفعيل الطلب.
رقم الطلب: ${tracking}`;
}

function reviewAndCallReply(app: ApplicationRecord | null, from: string, customerText: string) {
  const review = reviewTimeReply(from, app, undefined, customerText);
  const call = `وبالنسبة للمكالمة: التواصل الأساسي للطلبات والمتابعة عبر واتساب حاليًا. اترك رسالتك ورقم طلبك هون، والرد بيكون حسب الدور وضغط المراجعات.`;
  return `${review}\n\n${call}`;
}

function unknownReply(_from: string, app?: ApplicationRecord | null, customerText = "") {
  const t = normalizeArabicText(customerText);

  // V1.6.5: emoji-only acknowledgements must never ask the customer to rewrite a question.
  const raw = String(customerText || "").trim();
  if (raw && !/[\p{L}\p{N}]/u.test(raw)) {
    return "الله يسعدك 🌿";
  }

  if (isPureNonTransactionalUtteranceText(customerText)) {
    if (hasAny(t, ["ان شاء الله", "إن شاء الله"])) return "إن شاء الله 🌿";
    return "الله يحييك 🌿";
  }

  if (isClearlyExternalCommerceText(customerText)) {
    return "إذا قصدك طلبية شي إن، هاي مش مرتبطة بطلب الأمين للأقساط. إذا عندك سؤال عن طلب الأمين ابعث رقم التتبع أو سؤالك عنه مباشرة.";
  }

  if (isLegacyLimitedStockUiMessageText(customerText)) {
    return limitedStockUiCorrectionReply("https://www.ameenfinance.co");
  }

  if (isProductAvailabilityUiIssueText(customerText)) {
    return "إذا جهاز معيّن ما ظهر عندك بالموقع، ابعثلي اسم الجهاز أو الموديل اللي بتدور عليه وبوضحلك الخطوة المناسبة بدون ما نفترض إنه غير متوفر.";
  }

  if (isExplicitHumanAgentRequestText(customerText)) {
    return `معك ${assignedStaffName(_from)} من فريق الأمين. شايف إن الردود ضايقتك؛ احكيلي المشكلة نفسها وأنا بكمل معك من هون بدون لف ودوران.`;
  }

  if (isMinimumSalaryQuestionText(customerText)) {
    return minimumSalaryReply(app);
  }

  if (isExplicitIdentityUploadLinkRequestText(customerText)) {
    if (app) {
      return `أكيد، هذا رابط رفع الهوية المرتبط بطلبك:
${identityUrl("https://www.ameenfinance.co", app)}

ارفع الوجه الأمامي والخلفي من الرابط نفسه، ولا ترسل الهوية عبر واتساب.
رقم الطلب: ${app.tracking_id || app.id}`;
    }
    return "أكيد. ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب حتى أعطيك رابط رفع الهوية المرتبط بملفك، ولا ترسل الهوية عبر واتساب.";
  }

  if (isExplicitAppointmentRequestText(customerText)) {
    return appointmentRequestReply(app);
  }

  if (app && (isLongDelayComplaintText(customerText) || hasAny(t, ["تاخر كثير", "تأخر كثير", "مهو الو اسبوع", "مهو إلو أسبوع", "اليوم الرابع", "هي اليوم الرابع", "صرلو", "صارلو"]))) {
    return reviewTimeReply(_from, app, undefined, customerText);
  }

  if (isFreshApplicationSubmissionFollowupText(customerText)) {
    return app
      ? `تمام، وصلتني إنك رجعت قدمت. الطلب الظاهر عندي حاليًا رقمه ${app.tracking_id || app.id} وحالته ${statusHumanLabel(app.status || "")}. إذا طلع لك رقم تتبع جديد مختلف ابعته هون حتى ما نخلط بين الطلبين.`
      : "تمام، وصلتني إنك رجعت قدمت. إذا ظهر لك رقم تتبع جديد ابعته هون وبنتابع عليه؛ ما بدي أقول إنه وصل قبل ما يظهر عندي بشكل مؤكد.";
  }

  if (hasAny(t, ["رنيت عالرقم", "رنيت على الرقم", "ما حد برد", "ما حدا برد", "رد علي واحد نايم", "رد علي شخص نايم"])) {
    return `فاهم ليش هالشي أعطاك انطباع سيئ. التواصل الأساسي للطلبات والمتابعة عبر واتساب، وهون بقدر أراجع معك الطلب حسب المعلومات الظاهرة. إذا الموضوع متعلق بطلبك ابعث رقم التتبع وبكمل معك مباشرة.`;
  }

  if (hasAny(t, ["الرقم صحيح", "مقدم بنفس الرقم", "مقدّم بنفس الرقم"])) {
    return "تمام. إذا الرقم صحيح والطلب ما ظهر بصفحة التتبع، ابعث رقم التتبع AM- إن كان معك؛ وإذا ما ظهر رقم تتبع أصلًا وقت التقديم، احكيلي شو الرسالة اللي ظهرت بالموقع.";
  }

  if (app && (app.status === "refund_requested" || app.payment_status === "refund_requested")) {
    if (isRefundStatePriorityFollowupText(customerText) || t.length <= 28) {
      return refundAlreadyRequestedReply(app, customerText);
    }
  }

  if (app && ["approved", "customer_accepts_delivery_delay"].includes(app.status || "") && hasAny(t, [
    "بكره بستلم", "بكرة بستلم", "غدا بستلم", "غداً بستلم", "متى بستلم", "استلم", "الاستلام",
  ])) {
    return deliveryDateReply(app, "");
  }

  if (hasAny(t, ["عندي سوال", "عندي سؤال", "بدي اسال", "بدي أسأل"])) {
    return "تفضل، احكيلي سؤالك.";
  }

  if (app) {
    return `فاهم عليك. إذا قصدك الطلب الحالي، احكيلي شو النقطة اللي مقلقتك فيه وأنا بجاوبك من الحالة الظاهرة عندي بدون تخمين.`;
  }

  return "أكيد، احكيلي شو اللي بدك تعرفه وأنا معك.";
}

function envFlag(name: string, defaultValue = true) {
  const value = process.env[name];

  if (value === undefined || value === null || value === "") return defaultValue;

  return !["0", "false", "off", "no", "disabled"].includes(String(value).trim().toLowerCase());
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sleepMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function replyDelayRangeForIntent(intent: CustomerIntent, text: string, messageType = "text") {
  const t = normalizeArabicText(text);

  if (messageType !== "text") return { min: 1500, max: 3200 };

  if (String(intent) === "greeting" || String(intent) === "thanks") {
    return { min: 800, max: 1400 };
  }

  if (String(intent) === "emotional_pressure") {
    return { min: 2600, max: 5500 };
  }

  if (String(intent) === "order_status" || String(intent) === "review_time" || String(intent) === "delivery") {
    return { min: 1800, max: 3600 };
  }

  if (looksSensitive(text) || isTinyContextFollowupText(t)) {
    return { min: 2500, max: 5500 };
  }

  if (["products", "apply", "website", "contact_info", "location", "requirements", "installment_info"].includes(String(intent))) {
    return { min: 1200, max: 2500 };
  }

  return { min: 1300, max: 3000 };
}

function humanReplyDelayMs(intent: CustomerIntent, text: string, messageType = "text") {
  if (!envFlag("WHATSAPP_REPLY_DELAY_ENABLED", true)) return 0;

  const globalMin = envNumber("WHATSAPP_MIN_REPLY_DELAY_MS", 900);
  const globalMax = envNumber("WHATSAPP_MAX_REPLY_DELAY_MS", 5500);
  const range = replyDelayRangeForIntent(intent, text, messageType);
  const min = clampNumber(range.min, 0, globalMax);
  const max = Math.max(min, clampNumber(range.max, Math.max(globalMin, min), globalMax));

  return Math.round(min + Math.random() * (max - min));
}

async function waitUntilReplyLooksHuman(startedAt: number, targetDelayMs: number) {
  if (!targetDelayMs) return;

  const elapsed = Date.now() - startedAt;
  const remaining = targetDelayMs - elapsed;

  if (remaining > 0) {
    await sleepMs(remaining);
  }
}

async function sendWhatsAppTypingIndicator(incomingMessageId?: string | null) {
  if (!envFlag("WHATSAPP_TYPING_INDICATOR_ENABLED", true)) return false;

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.GRAPH_API_VERSION || "v20.0";
  const cleanMessageId = String(incomingMessageId || "").trim();

  if (!token || !phoneNumberId || !cleanMessageId) return false;

  try {
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: cleanMessageId,
        typing_indicator: {
          type: "text",
        },
      }),
    });

    if (!response.ok) {
      console.error("WhatsApp typing indicator failed:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("WhatsApp typing indicator error:", error);
    return false;
  }
}

type WhatsAppSendAttempt = {
  messageId: string | null;
  ok: boolean;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
};

async function sendWhatsAppTextDetailed(to: string, body: string, previewUrl = true): Promise<WhatsAppSendAttempt> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.GRAPH_API_VERSION || "v20.0";

  if (!token || !phoneNumberId) {
    console.error("Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
    return { messageId: null, ok: false, httpStatus: null, errorCode: "missing_credentials", errorMessage: "Missing WhatsApp credentials" };
  }

  const cleanTo = normalizeWhatsAppToSend(to);
  if (!cleanTo) {
    return { messageId: null, ok: false, httpStatus: null, errorCode: "invalid_recipient", errorMessage: "Invalid WhatsApp recipient" };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanTo,
        type: "text",
        text: { preview_url: previewUrl, body },
      }),
    });

    const responseText = await response.text();
    let parsed: any = null;
    try { parsed = responseText ? JSON.parse(responseText) : null; } catch {}

    if (!response.ok) {
      const metaError = parsed?.error || {};
      console.error("WhatsApp send failed:", {
        httpStatus: response.status,
        code: metaError?.code || null,
        subcode: metaError?.error_subcode || null,
        message: metaError?.message || responseText,
        fbtraceId: metaError?.fbtrace_id || null,
      });
      return {
        messageId: null,
        ok: false,
        httpStatus: response.status,
        errorCode: metaError?.code != null ? String(metaError.code) : null,
        errorMessage: metaError?.message ? String(metaError.message) : "WhatsApp API rejected the message",
      };
    }

    const messageId = parsed?.messages?.[0]?.id ? String(parsed.messages[0].id) : null;
    if (!messageId) {
      console.error("WhatsApp send returned success without message id:", responseText);
      return { messageId: null, ok: false, httpStatus: response.status, errorCode: "missing_message_id", errorMessage: "WhatsApp API returned no message id" };
    }

    return { messageId, ok: true, httpStatus: response.status, errorCode: null, errorMessage: null };
  } catch (error) {
    console.error("WhatsApp send exception:", error);
    return {
      messageId: null,
      ok: false,
      httpStatus: null,
      errorCode: "network_exception",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendWhatsAppText(to: string, body: string) {
  const result = await sendWhatsAppTextDetailed(to, body, true);
  return result.messageId;
}

function adminApplicationUrl(baseUrl: string, app: ApplicationRecord) {
  return `${baseUrl}/admin/applications/${app.id}`;
}

async function sendDiscordNotification(input: {
  title: string;
  description: string;
  color?: number;
  app?: ApplicationRecord | null;
  customerPhone?: string;
  customerMessage?: string;
  systemReply?: string;
  baseUrl?: string;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const mention = process.env.DISCORD_ADMIN_MENTION || "";
  const app = input.app || null;
  const baseUrl = input.baseUrl || "";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (app) {
    fields.push(
      { name: "رقم التتبع", value: app.tracking_id || app.id || "—", inline: true },
      { name: "العميل", value: app.full_name || "—", inline: true },
      { name: "رقم واتساب", value: input.customerPhone || app.phone || "—", inline: true },
      { name: "الجهاز", value: app.device_name || "—", inline: true },
      { name: "الحالة الحالية", value: app.status || "—", inline: true },
      { name: "حالة الدفع", value: app.payment_status || "—", inline: true },
    );

    if (baseUrl) {
      fields.push({
        name: "رابط الطلب في الأدمن",
        value: adminApplicationUrl(baseUrl, app),
        inline: false,
      });
    }
  } else if (input.customerPhone) {
    fields.push({ name: "رقم واتساب", value: input.customerPhone, inline: true });
  }

  if (input.customerMessage) {
    fields.push({
      name: "رسالة العميل",
      value: input.customerMessage.slice(0, 900) || "—",
      inline: false,
    });
  }

  if (input.systemReply) {
    fields.push({
      name: "رد النظام",
      value: input.systemReply.slice(0, 900) || "—",
      inline: false,
    });
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: mention || undefined,
        embeds: [
          {
            title: input.title,
            description: input.description,
            color: input.color ?? 0xd6b56b,
            fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (error) {
    console.error("Discord notification failed:", error);
  }
}

type ApplicationActionRequestResult = { ok: boolean; duplicate: boolean; error?: string };

async function recordApplicationActionRequest(
  app: ApplicationRecord,
  actionType: string,
  customerMessage: string,
): Promise<ApplicationActionRequestResult> {
  try {
    const { error } = await supabaseAdmin
      .from("application_action_requests")
      .insert({
        application_id: app.id,
        tracking_id: app.tracking_id || null,
        action_type: actionType,
        source: "whatsapp",
        customer_message: String(customerMessage || "").slice(0, 2000),
        status: "pending",
      });

    if (!error) return { ok: true, duplicate: false };
    if ((error as any).code === "23505") return { ok: true, duplicate: true };
    console.error("application_action_requests insert failed:", error.message);
    return { ok: false, duplicate: false, error: error.message };
  } catch (error) {
    console.error("application_action_requests exception:", error);
    return { ok: false, duplicate: false, error: String(error) };
  }
}

function refundIntegrityHoldReply(app: ApplicationRecord) {
  return `ما في دفع مؤكد ظاهر على هذا الطلب، لذلك ما بقدر أأكد وجود مبلغ قيد الاسترداد حاليًا.

إذا كنت دفعت فعلًا، خليك على نفس رقم الطلب وبنراجع حالة الدفع أولًا.
رقم الطلب: ${app.tracking_id || app.id}`;
}

function stopRefundRequestReply(app: ApplicationRecord, recorded: boolean) {
  if (!recorded) {
    return `وصل طلبك بإيقاف الاسترداد، لكن ما تم تأكيد الإيقاف لحد الآن.

تابع على نفس رقم الطلب، وأول ما يصير تحديث واضح بنبلغك.
رقم الطلب: ${app.tracking_id || app.id}`;
  }
  return `تم استلام طلب إيقاف الاسترداد للمراجعة، ولسا ما صار تأكيد بإيقافه.

أول ما تتغير الحالة بنبلغك مباشرة.
رقم الطلب: ${app.tracking_id || app.id}`;
}

async function markRefundRequested(app: ApplicationRecord) {
  if (app.status === "refund_requested" || app.payment_status === "refund_requested" || app.status === "refund_completed") {
    return app;
  }

  // V1.1.9.1 HARD REFUND GUARD:
  // Never create a refund state unless there is server-side evidence that payment was confirmed.
  if (!hasConfirmedRefundPayment(app)) {
    console.error("REFUND_GUARD_BLOCKED_UNPAID", {
      applicationId: app.id,
      trackingId: app.tracking_id || null,
      status: app.status || null,
      paymentStatus: app.payment_status || null,
    });
    return app;
  }

  const { error } = await supabaseAdmin
    .from("applications")
    .update({
      status: "refund_requested",
    })
    .eq("id", app.id);

  if (error) {
    console.error("markRefundRequested error:", error.message);
    return app;
  }

  return {
    ...app,
    status: "refund_requested",
  } as ApplicationRecord;
}

function isGuarantorContextText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "كفيل", "الكفيل", "بيانات الكفيل", "معلومات الكفيل", "ضامن", "الضامن", "guarantor",
    "رابط الكفيل", "لينك الكفيل", "نموذج الكفيل", "عبيت الكفيل", "عبأت الكفيل", "ارسلت الكفيل", "أرسلت الكفيل",
  ]);
}

function isSalarySlipContextText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "كشف راتب", "كشف الراتب", "شهادة راتب", "شهاده راتب", "اثبات راتب", "إثبات راتب",
    "salary slip", "salary certificate", "راتب", "الراتب", "مسير راتب", "مسير الرواتب",
    "رابط الراتب", "لينك الراتب", "رفعت الراتب", "رفعت كشف", "ارسلت كشف", "أرسلت كشف",
  ]);
}

function isDocumentSubmittedText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "تم", "خلص", "خلصت", "عملت", "عبيت", "عبأت", "عبّيت", "عبينا", "ارسلت", "أرسلت", "بعت", "بعثت",
    "رفعت", "حملت", "رفقته", "رفقت", "عبى", "تمت التعبئه", "تمت التعبئة", "تم الرفع", "تم الارسال", "تم الإرسال",
    "وصلتكم", "وصل؟", "وصلت", "اكملت", "أكملت", "كملت", "انجزت", "done", "submitted", "uploaded",
  ]);
}

function isDocumentLinkRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "رابط", "لينك", "الرابط", "اللينك", "ابعت", "ابعث", "ارسل", "أرسل", "وين", "بدي", "هات", "اعطيني",
    "ما وصل", "مش واصل", "ضايع", "فتح", "افتح", "نموذج", "form", "link",
  ]);
}

async function outgoingMessageAlreadyContains(waId: string, markers: string[], limit = 35) {
  const cleanWaId = String(waId || "").trim();
  if (!cleanWaId) return false;

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("body")
      .eq("wa_id", cleanWaId)
      .eq("direction", "outgoing")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      if (error) console.error("outgoingMessageAlreadyContains error:", error.message);
      return false;
    }

    const normalizedMarkers = markers.map((marker) => normalizeArabicText(marker)).filter(Boolean);

    return data.some((message) => {
      const body = String(message.body || "");
      const normalizedBody = normalizeArabicText(body);
      return markers.some((marker) => body.includes(marker)) || normalizedMarkers.some((marker) => normalizedBody.includes(marker));
    });
  } catch (error) {
    console.error("outgoingMessageAlreadyContains failed:", error);
    return false;
  }
}

async function wasGuarantorLinkAlreadySent(waId: string) {
  return outgoingMessageAlreadyContains(waId, ["/guarantor?", "guarantor?tracking=", "بيانات الكفيل من الرابط", "رابط الكفيل"]);
}

async function wasSalarySlipLinkAlreadySent(waId: string) {
  return outgoingMessageAlreadyContains(waId, ["/salary-slip?", "salary-slip?tracking=", "كشف راتب", "شهادة راتب", "رابط كشف"]);
}

async function markGuarantorSubmitted(app: ApplicationRecord) {
  if (["guarantor_submitted", "approved", "refund_requested", "refund_completed", "cancelled"].includes(app.status || "")) {
    return app;
  }

  const { error } = await supabaseAdmin
    .from("applications")
    .update({
      status: "guarantor_submitted",
    })
    .eq("id", app.id);

  if (error) {
    console.error("markGuarantorSubmitted error:", error.message);
    return app;
  }

  return {
    ...app,
    status: "guarantor_submitted",
  } as ApplicationRecord;
}

async function markSalarySlipUploaded(app: ApplicationRecord) {
  if (["salary_slip_uploaded", "approved", "refund_requested", "refund_completed", "cancelled"].includes(app.status || "")) {
    return app;
  }

  const { error } = await supabaseAdmin
    .from("applications")
    .update({
      status: "salary_slip_uploaded",
    })
    .eq("id", app.id);

  if (error) {
    console.error("markSalarySlipUploaded error:", error.message);
    return app;
  }

  return {
    ...app,
    status: "salary_slip_uploaded",
  } as ApplicationRecord;
}

function guarantorSubmittedAutoReply(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `تمام ${name} 🌿

تم استلام معلومات الكفيل وربطها بطلبك.

الملف الآن قيد المتابعة، وإذا احتاج طلبك أي خطوة إضافية بنحكيلك مباشرة.

رقم التتبع:
${tracking}`;
}

function salarySlipUploadedAutoReply(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `تمام ${name} 🌿

تم استلام كشف الراتب / شهادة الراتب وربطه بطلبك.

الملف الآن قيد المتابعة، وإذا احتاج طلبك أي خطوة إضافية بنحكيلك مباشرة.

رقم التتبع:
${tracking}`;
}

function guarantorLinkFirstReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `أهلًا ${name} 🌿

لاستكمال طلبك، عبّي بيانات الكفيل من الرابط:
${guarantorUrl(baseUrl, app)}

بعد ما تخلص، ابعثلي: تم تعبئة بيانات الكفيل

رقم التتبع:
${tracking}`;
}

function guarantorLinkAlreadySentReply(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);

  return `${name}، رابط بيانات الكفيل انرسل لك قبل 🌿

ما رح أكرره حتى ما يصير عندك أكثر من رابط لنفس الطلب.

إذا عبيت البيانات، اكتبلي:
تم تعبئة بيانات الكفيل`;
}

function salarySlipLinkFirstReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `أهلًا ${name} 🌿

لاستكمال طلبك، ارفع كشف راتب أو شهادة راتب من الرابط:
${salarySlipUrl(baseUrl, app)}

بعد ما تخلص، ابعثلي: تم رفع كشف الراتب

رقم التتبع:
${tracking}`;
}

function salarySlipLinkAlreadySentReply(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);

  return `${name}، رابط رفع كشف الراتب انرسل لك قبل 🌿

ما رح أكرره حتى ما يصير عندك أكثر من رابط لنفس الطلب.

إذا رفعته، اكتبلي:
تم رفع كشف الراتب`;
}

function postPaymentRequirementsAlreadySentReply(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);

  return `${name}، روابط المتطلبات انرسلت لك قبل 🌿

ما رح أكرر الروابط حتى ما يصير عندك أكثر من رابط لنفس الطلب.

إذا خلصت، ابعثلي حسب اللي عملته:
تم تعبئة بيانات الكفيل
أو
تم رفع كشف الراتب`;
}

async function postPaymentRequirementsReplyOnce(app: ApplicationRecord, baseUrl: string, waId: string) {
  const salary = getSalaryNumber(app.salary);
  const needsSalarySlip = salary !== null && salary < 350;
  const guarantorSent = await wasGuarantorLinkAlreadySent(waId);
  const salarySent = needsSalarySlip ? await wasSalarySlipLinkAlreadySent(waId) : false;

  if (guarantorSent && (!needsSalarySlip || salarySent)) {
    // المتطلبات أُرسلت سابقًا: لا نرجع قالب "الروابط انرسلت" لكل سؤال متابعة.
    // نكمل للمسار الطبيعي حتى يجيب DeepSeek على سؤال العميل الحالي.
    return "";
  }

  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const lines: string[] = [
    `أهلًا ${name} 🌿`,
    "",
    "رسوم فتح الملف مؤكدة، ولإكمال دراسة الملف نحتاج استكمال المتطلبات المحددة.",
    "",
    "لاستكمال إجراءات الملف حسب متطلبات الدراسة، نحتاج:",
  ];

  let index = 1;

  if (!guarantorSent) {
    lines.push("", `${index}. تعبئة بيانات الكفيل من الرابط:`, guarantorUrl(baseUrl, app));
    index += 1;
  }

  if (needsSalarySlip && !salarySent) {
    lines.push("", `${index}. رفع كشف راتب رسمي حديث أو شهادة راتب من الرابط:`, salarySlipUrl(baseUrl, app));
  }

  lines.push(
    "",
    "هذه الخطوة لاستكمال الدراسة فقط، ولا تعني رفض الطلب.",
    "",
    "بعد ما تخلص، ابعثلي: تم تعبئة بيانات الكفيل / تم رفع كشف الراتب",
    "",
    "رقم التتبع:",
    tracking,
  );

  return lines.join("\n");
}

async function handleDocumentAutomation(input: {
  app: ApplicationRecord;
  baseUrl: string;
  from: string;
  text: string;
  intent: CustomerIntent;
}) {
  const { app, baseUrl, from, text, intent } = input;
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const hasGuarantorContext = isGuarantorContextText(text);
  const hasSalaryContext = isSalarySlipContextText(text);
  const hasIdentityContext = hasAny(normalizeArabicText(text), [
    "هوية", "هويه", "الهوية", "الهويه", "بطاقة", "بطاقه",
    "الوجه الامامي", "الوجه الأمامي", "الوجه الخلفي",
  ]);
  const submitted = isDocumentSubmittedText(text);
  const officialUploadConfirmed = isOfficialUploadConfirmationText(text);
  const linkRequest = isDocumentLinkRequestText(text);
  const explicitTrackingLinkContext =
    isTrackingLinkRequestText(text) &&
    hasAny(normalizeArabicText(text), ["تتبع", "التتبع", "متابعه", "متابعة"]);

  // إذا قاعدة البيانات تؤكد أن المستند وصل، لا نطلب من العميل رفعه مرة ثانية.
  if (status === "guarantor_submitted" && (hasGuarantorContext || String(intent) === "requirements" || String(intent) === "order_status")) {
    return guarantorSubmittedAutoReply(app);
  }

  if (status === "salary_slip_uploaded" && (hasSalaryContext || String(intent) === "requirements" || String(intent) === "order_status")) {
    return salarySlipUploadedAutoReply(app);
  }

  if (submitted && !officialUploadConfirmed && (hasGuarantorContext || hasSalaryContext)) {
    return officialUploadInstructionReply({
      app,
      baseUrl,
      from,
      text,
      intent: "document_followup",
    });
  }

  if (submitted && officialUploadConfirmed && (hasGuarantorContext || hasSalaryContext)) {
    const label = hasGuarantorContext ? "بيانات الكفيل" : "كشف الراتب";
    const reply = `تمام. إذا رفعت ${label} من الرابط الرسمي، ما في داعي تعيد الرفع أو ترسله عبر واتساب.

أول ما يثبت استلامه على الطلب بتظهر الخطوة التالية.
رقم الطلب: ${app.tracking_id || app.id}`;

    await sendDiscordNotification({
      title: "🛡️ ادعاء رفع مستند بانتظار المزامنة الرسمية",
      description: "العميل ذكر أنه أكمل الرفع عبر الرابط. لم يتم تغيير حالة الطلب من رسالة واتساب؛ مصدر الحقيقة هو مسار الرفع الرسمي فقط.",
      color: 0xfee75c,
      app,
      customerPhone: from,
      customerMessage: text,
      systemReply: reply,
      baseUrl,
    });

    return reply;
  }

  const directRequirementQuestion = isGuarantorQuestionText(text) || isSalaryRequirementQuestionText(text);
  const explicitRequirementsOverview =
    isStandardApplicationFollowupText(text) ||
    linkRequest ||
    hasAny(normalizeArabicText(text), ["شو المطلوب", "المتطلبات المطلوبه", "المتطلبات المطلوبة", "الخطوه التاليه", "الخطوة التالية", "استكمال الخطوات"]);

  // Identity is a first-class official upload flow. When the application itself is
  // waiting for identity, a generic "send me the link" must resolve to /identity,
  // never to /track and never to WhatsApp media upload.
  if (
    ["needs_identity", "identity_requested"].includes(status) &&
    (hasIdentityContext || (linkRequest && !explicitTrackingLinkContext) || explicitRequirementsOverview)
  ) {
    return `تفضل، هذا رابط رفع الهوية المرتبط بطلبك:
${identityUrl(baseUrl, app)}

ارفع صورة الوجه الأمامي والخلفي من الرابط نفسه حتى تنربط بالطلب رسميًا.
رقم الطلب: ${app.tracking_id || app.id}`;
  }

  if (status === "needs_guarantor" && !directRequirementQuestion && (hasGuarantorContext || linkRequest || explicitRequirementsOverview)) {
    const alreadySent = await wasGuarantorLinkAlreadySent(from);
    return alreadySent ? guarantorLinkAlreadySentReply(app) : guarantorLinkFirstReply(app, baseUrl);
  }

  if (status === "needs_salary_slip" && !directRequirementQuestion && (hasSalaryContext || linkRequest || explicitRequirementsOverview)) {
    const alreadySent = await wasSalarySlipLinkAlreadySent(from);
    return alreadySent ? salarySlipLinkAlreadySentReply(app) : salarySlipLinkFirstReply(app, baseUrl);
  }

  if (
    paymentStatus === "confirmed" &&
    status === "under_review" &&
    canShowPostPaymentRequirements(app) &&
    explicitRequirementsOverview &&
    !directRequirementQuestion
  ) {
    return postPaymentRequirementsReplyOnce(app, baseUrl, from);
  }

  return null;
}

async function updateCustomerDecision(input: {
  app: ApplicationRecord;
  decision: "continue" | "decline";
}) {
  const now = new Date().toISOString();

  if (input.decision === "continue") {
    const { error } = await supabaseAdmin
      .from("applications")
      .update({
        status: "customer_confirmed_continue",
        payment_status: "payment_info_sent",
      })
      .eq("id", input.app.id);

    if (error) {
      console.error("updateCustomerDecision continue error:", error.message);
      throw error;
    }

    return {
      ...input.app,
      status: "customer_confirmed_continue",
      payment_status: "payment_info_sent",
    } as ApplicationRecord;
  }

  const wasPaid = hasConfirmedPaymentEvidence(input.app);
  const updatePayload = wasPaid
    ? {
        status: "cancelled",
        payment_status: "refund_requested",
        payment_reference: "customer_cancelled_paid_refund_pending",
      }
    : {
        status: "cancelled",
        payment_status: "not_requested_yet",
        payment_reference: "customer_declined_continue",
      };

  const { error } = await supabaseAdmin
    .from("applications")
    .update(updatePayload)
    .eq("id", input.app.id);

  if (error) {
    console.error("updateCustomerDecision decline error:", error.message);
    throw error;
  }

  return {
    ...input.app,
    status: "cancelled",
    payment_status: wasPaid ? "refund_requested" : "not_requested_yet",
  } as ApplicationRecord;
}

function continueConfirmationMessage(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  return `أهلًا ${name} 🌿

تم تسجيل رغبتكم بالاستمرار، والطلب الآن بانتظار الخطوة التالية حسب حالة الملف.

لا يوجد أي دفع مطلوب الآن من خلال هذه الرسالة.
إذا كان مطلوبًا أي إجراء إضافي، سيظهر حسب حالة الطلب أو من خلال رابط المتابعة.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
}

function declineConfirmationMessage(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;

  if (app.payment_status === "refund_requested") {
    return `تم إلغاء الطلب بنجاح يا ${name}.

بما أن الدفع مؤكد على الملف، يرجى تثبيت بيانات الاسترداد من الرابط التالي:
${refundUrl(baseUrl, app)}

مدة مراجعة ومعالجة الاسترداد تصل إلى 3 أيام عمل من وقت إدخال البيانات الصحيحة، والجمعة والسبت لا تُحسب ضمن أيام العمل.

إذا غيرت رأيك قبل اكتمال الاسترداد، اكتب:
أريد إعادة تفعيل الطلب
وسيتم فحص إمكانية إيقاف الاسترداد أولًا.

رقم التتبع:
${tracking}`;
  }

  return `تم إلغاء الطلب بنجاح يا ${name}.

لا يوجد أي دفع مطلوب عليكم.

إذا غيرت رأيك، تقدر تطلب التراجع عن الإلغاء بكتابة:
أريد إعادة تفعيل الطلب

رقم التتبع:
${tracking}`;
}

function cancelUpdateFailedReply(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);

  return `وصل تأكيد الإلغاء يا ${name}.

تعذر تحديث حالة الطلب الآن، لذلك الطلب لم يُلغَ بعد.

لا تعتبر الطلب ملغيًا إلا بعد ما يصلك تأكيد نهائي بتحديث الحالة.`;
}

function trackingLinkReply(app: ApplicationRecord, baseUrl: string) {
  const tracking = app.tracking_id || app.id;

  return `أكيد، هذا رابط المتابعة:
${trackUrl(baseUrl, app)}

رقم التتبع:
${tracking}`;
}

function cancelRefundRequestReply(app: ApplicationRecord) {
  const name = firstTwoNames(app.full_name);

  if (!hasConfirmedPaymentEvidence(app)) {
    return `أهلًا ${name}، وصلتني رغبتك بإلغاء الطلب.

للتأكيد النهائي اكتب:
أكد إلغاء الطلب`;
  }

  return `أهلًا ${name}، وصلتني رغبتك بإلغاء الطلب.

للتأكيد النهائي اكتب:
أكد إلغاء الطلب

بما أن الدفع مؤكد على الملف، بعد تنفيذ الإلغاء بنرسل لك رابط تثبيت بيانات الاسترداد.`;
}

function criticalCaseOpening() {
  return `معك عمران من متابعة الحالات في ${BUSINESS_NAME}.`;
}

function studyCaseOpening(seed: string) {
  const agents = ["عبدالله", "عبدالرحمن"];
  const digits = digitsOnly(seed);
  const agent = agents[Number(digits.slice(-2) || "0") % agents.length];
  return `معك ${agent} من فريق ${BUSINESS_NAME}.`;
}

function followupCaseOpening(seed: string) {
  const agents = ["فدوة", "تالا"];
  const digits = digitsOnly(seed);
  const agent = agents[Number(digits.slice(-2) || "0") % agents.length];
  return `معك ${agent} من متابعة ملفات ${BUSINESS_NAME}.`;
}

function cancelRequestReply(app: ApplicationRecord, baseUrl: string, customerText = "") {
  const t = normalizeArabicText(customerText);

  if (extractJordanPhoneFromText(customerText)) {
    return `تم ربط الرسالة بطلبك.

إذا قرارك نهائي، اكتب:
أكد إلغاء الطلب`;
  }

  if (isCancelRefundRequestText(t)) {
    return cancelRefundRequestReply(app);
  }

  const hasReason = hasAny(t, [
    "تغير بالقرار", "تغيير بالقرار", "التاخير", "التأخير", "تاخير", "تأخير", "سبب اخر", "سبب آخر",
    "اشتري من شركه ثانيه", "شركة ثانية", "شركه ثانيه", "بطلت", "ما بدي",
  ]);

  if (hasReason) {
    return `تمام، وصلت.

إذا قرارك نهائي، اكتب:
أكد إلغاء الطلب

وبس توصلنا الجملة بنلغي الطلب من النظام.`;
  }

  return `أكيد. قبل الإلغاء النهائي، احكيلي سبب الإلغاء باختصار:
تغيير بالقرار، تأخير، أو سبب آخر؟

مهم: الإلغاء النهائي لا يتم إلا بعد ما تكتب:
أكد إلغاء الطلب`;
}

function cancelRequestWithoutAppReply(from: string) {
  return `${criticalCaseOpening()}

فهمت إنك بتفكر بالإلغاء، بس ما بقدر ألغي أي ملف بدون ما أربطه بالطلب الصحيح.

ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب، وبراجع الحالة أولًا.

مهم: الإلغاء النهائي ما بصير إلا بعد تأكيد صريح منك بعبارة:
أكد إلغاء الطلب

${BUSINESS_NAME}`;
}


function reopenCancelledRequestReply(app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;

  if (app.status === "refund_completed") {
    return `الاسترداد على هذا الطلب مكتمل، لذلك ما بنقدر نعيد فتح نفس الملف تلقائيًا.

تقدر تقدم طلب جديد من الموقع، أو تكتب رقم الطلب حتى تتم مراجعة الحالة يدويًا.
رقم الطلب: ${tracking}`;
  }

  if (app.status !== "cancelled" && app.status !== "refund_requested" && app.payment_status !== "refund_requested") {
    return `طلبك مش ملغي حاليًا، وهو مستمر بحالة: ${statusHumanLabel(app.status || "")}.

رقم الطلب: ${tracking}`;
  }

  const paidCancellation = hasConfirmedPaymentEvidence(app) && (app.payment_status === "refund_requested" || app.status === "refund_requested");

  if (paidCancellation) {
    return `ممكن تطلب التراجع عن الإلغاء ما دام الاسترداد ما اكتمل، لكن لازم نوقف مسار الاسترداد أولًا حتى ما يصير تعارض.

للتأكيد اكتب:
أكد إعادة تفعيل الطلب

بعد التأكيد سيتم تسجيل طلبك للمتابعة، ولا تعتبر الملف مفتوحًا إلا بعد ما يصلك تأكيد واضح.
رقم الطلب: ${tracking}`;
  }

  return `ممكن ترجع عن الإلغاء وتكمل على نفس الطلب.

للتأكيد اكتب:
أكد إعادة تفعيل الطلب

بعد التأكيد رح نعيد تفعيل الملف ونرسل لك الخطوة الحالية مباشرة.
رقم الطلب: ${tracking}`;
}

function reopenCancelledWithoutAppReply() {
  return `فهمت إنك بدك تتراجع عن إلغاء طلب سابق.

ابعث رقم التتبع الذي يبدأ بـ AM- أو رقم الهاتف المستخدم بالطلب حتى أربطه بالملف الصحيح.`;
}

async function reopenCancelledUnpaidApplication(app: ApplicationRecord) {
  const updatePayload = {
    status: "customer_confirmed_continue",
    payment_status: "payment_info_sent",
    payment_reference: "customer_reopened_after_cancel",
  };

  const { error } = await supabaseAdmin
    .from("applications")
    .update(updatePayload)
    .eq("id", app.id);

  if (error) {
    console.error("reopen cancelled application error:", error.message);
    throw error;
  }

  return {
    ...app,
    ...updatePayload,
  } as ApplicationRecord;
}

function reopenPaidCancellationPendingReply(app: ApplicationRecord) {
  const tracking = app.tracking_id || app.id;

  return `وصل تأكيدك بالتراجع عن الإلغاء.

بما أن الاسترداد مسجل على الطلب، تم وضع المحادثة للمتابعة حتى يتم التأكد من إمكانية إيقاف الاسترداد وإعادة فتح الملف بدون تعارض.

لا تدفع أي مبلغ جديد، ولا تعتبر الطلب معاد التفعيل إلا بعد ما يصلك تأكيد واضح.
رقم الطلب: ${tracking}`;
}

function alternativePaymentSourceReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const receipt = receiptUrl(baseUrl, app);

  if (paymentStatus === "confirmed") {
    return `الدفع ظاهر عندي مؤكد، فما في داعي لأي تحويل جديد.

حالة الملف: ${statusHumanLabel(status)}.
رقم الطلب: ${tracking}`;
  }

  if (paymentStatus === "customer_claimed_paid") {
    return `وصل الدفع مسجل وبانتظار التأكيد، فلا تعيد الدفع مرة ثانية.

رقم الطلب: ${tracking}`;
  }

  if (!(status === "preliminary_qualified" || paymentStatus === "pending" || paymentStatus === "pending_payment" || paymentStatus === "payment_info_sent" || status === "customer_confirmed_continue")) {
    return `حسب حالة طلبك الحالية ما في دفع مطلوب الآن.

حالة الطلب: ${statusHumanLabel(status)}.
رقم الطلب: ${tracking}`;
  }

  return `أكيد، بتقدر تحول من حسابك البنكي عبر CliQ، أو من أي محفظة إلكترونية، ومش شرط يكون عندك محفظة أورنج.

${paymentDestinationBlock()}

قبل تأكيد الحوالة راجع اسم المستفيد الظاهر، وبعد التحويل ارفع الوصل من رابط طلبك:
${receipt}

رقم الطلب: ${tracking}`;
}

function alternativePaymentSourceWithoutAppReply(from: string) {
  return `نعم، التحويل ممكن من أي حساب بنكي يدعم CliQ أو من محفظة إلكترونية، ومش شرط تكون عندك محفظة Orange Money.

لكن لا تحول قبل ما نتأكد إن رسوم فتح الملف مطلوبة على طلبك. ابعث رقم التتبع أو رقم الهاتف المستخدم بالتقديم حتى أعطيك بيانات الدفع ورابط الوصل المرتبطين بالطلب.`;
}

function receiptUploadReply(app: ApplicationRecord, baseUrl: string) {
  const name = firstTwoNames(app.full_name);
  const tracking = app.tracking_id || app.id;
  const receipt = receiptUrl(baseUrl, app);

  if (app.payment_status === "confirmed") {
    return `هلا ${name} 🌿

الدفع ظاهر عندي مؤكد، وما في داعي ترفع وصل جديد.

رقم التتبع:
${tracking}`;
  }

  if (app.payment_status === "customer_claimed_paid") {
    return `هلا ${name} 🌿

الوصل مسجل عندنا وبانتظار تأكيد الإدارة. لا تعيد الدفع ولا ترفع الوصل مرة ثانية.

رقم التتبع:
${tracking}`;
  }

  return `تمام ${name} 🌿

ارفع صورة وصل الدفع من الرابط التالي حتى يظهر عند الإدارة وينربط على طلبك:
${receipt}

مهم يكون الوصل واضح فيه المبلغ ووقت التحويل.

رقم التتبع:
${tracking}`;
}

function officePickupPolicyReply(from: string, app?: ApplicationRecord | null, baseUrl?: string) {
  const statusLine = app ? `
حالة طلبك: ${statusHumanLabel(app.status || "")}.` : "";

  return `ما عندنا توصيل. الاستلام يكون من المكتب فقط وبموعد مسبق بعد الموافقة النهائية واعتماد الموعد.${statusLine}`;
}

function supplierDelayReply(app: ApplicationRecord, baseUrl: string) {
  const tracking = app.tracking_id || app.id;
  const status = app.status || "";
  const finalApproved = status === "approved" || status === "customer_accepts_delivery_delay";

  if (!finalApproved) {
    return `طلبك لسا ما وصل للموافقة النهائية. حالته الحالية: ${statusHumanLabel(status)}.

ما بقدر أربط مدة التوريد بموعد الموافقة أو الاستلام قبل صدور القرار النهائي.
رقم الطلب: ${tracking}`;
  }

  return `طلبك عليه موافقة نهائية، لكن ما في موعد توريد أو استلام مؤكد حاليًا.

أول ما يتم اعتماد موعد الاستلام من المكتب رح يصلك تحديث.
رقم الطلب: ${tracking}`;
}

function supplierDelayWithoutAppReply(from: string) {
  return `ما بقدر أحدد مدة التوريد أو الاستلام بدون ربط الرسالة بطلبك.

ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب، وبعطيك الحالة المؤكدة بدون تخمين.`;
}

const AUTO_REPLY_IGNORED_MARKER = "AUTO_REPLY_IGNORED";

async function isAutoReplyIgnored(waId: string) {
  const cleanWaId = String(waId || "").replace(/\D/g, "");
  if (!cleanWaId) return false;

  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("body")
      .eq("wa_id", cleanWaId)
      .eq("direction", "outgoing")
      .eq("message_type", "admin_control")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && (error as any).code !== "PGRST116") {
      console.error("Failed to read WhatsApp ignore state:", error);
      return false;
    }

    return data?.body === AUTO_REPLY_IGNORED_MARKER;
  } catch (error) {
    console.error("WhatsApp ignore state check failed:", error);
    return false;
  }
}

async function logMessage(input: {
  waId: string;
  direction: "incoming" | "outgoing";
  body: string;
  customerName?: string;
  messageId?: string;
  messageType?: string;
  intent?: CustomerIntent;
  trackingId?: string | null;
  applicationId?: string | null;
  needsHumanReview?: boolean;
  handledByAi?: boolean;
  rawPayload?: unknown;
  status?: string | null;
  statusTimestamp?: string | null;
  createdAt?: string | null;
}) {
  try {
    await supabaseAdmin.from("whatsapp_messages").insert({
      wa_id: input.waId,
      direction: input.direction,
      customer_name: input.customerName || null,
      message_id: input.messageId || null,
      message_type: input.messageType || "text",
      body: input.body,
      intent: input.intent || null,
      tracking_id: input.trackingId || null,
      application_id: input.applicationId || null,
      needs_human_review: input.needsHumanReview ?? false,
      handled_by_ai: input.handledByAi ?? null,
      status: input.status || null,
      status_timestamp: input.statusTimestamp || null,
      raw_payload: input.rawPayload || null,
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
    });
  } catch (error) {
    console.error("whatsapp_messages insert failed:", error);
  }
}


type AiSuccessfulReplyRecord = {
  id?: string;
  intent?: string | null;
  customer_message?: string | null;
  ai_reply?: string | null;
  score?: number | null;
};

function compactForAiMemory(value: string | null | undefined, maxLength = 500) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trim()}...`;
}

function textSimilarityScore(a: string, b: string) {
  const aWords = new Set(
    normalizeArabicText(a)
      .split(" ")
      .filter((word) => word.length >= 3)
  );
  const bWords = new Set(
    normalizeArabicText(b)
      .split(" ")
      .filter((word) => word.length >= 3)
  );

  if (!aWords.size || !bWords.size) return 0;

  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap += 1;
  }

  return overlap / Math.max(aWords.size, bWords.size);
}

async function findSimilarSuccessfulReplies(intent: CustomerIntent, customerText: string) {
  try {
    const normalizedText = normalizeArabicText(customerText);
    if (!normalizedText || normalizedText.length < 3) return "";

    const { data, error } = await supabaseAdmin
      .from("ai_successful_replies")
      .select("id,intent,customer_message,ai_reply,score")
      .or(`intent.eq.${intent},intent.eq.unknown`)
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      if ((error as any).code !== "42P01") {
        console.error("ai_successful_replies select failed:", error);
      }
      return "";
    }

    const rows = ((data || []) as AiSuccessfulReplyRecord[])
      .map((row) => ({
        ...row,
        similarity: textSimilarityScore(customerText, row.customer_message || ""),
      }))
      .filter((row) => row.ai_reply && row.customer_message && (row.similarity >= 0.12 || Number(row.score || 0) > 0))
      .sort((a, b) => {
        const bScore = Number(b.score || 0) + b.similarity * 10;
        const aScore = Number(a.score || 0) + a.similarity * 10;
        return bScore - aScore;
      })
      .slice(0, 5);

    if (!rows.length) return "";

    return rows
      .map((row, index) => {
        return `مثال ${index + 1}:\nسؤال سابق: ${compactForAiMemory(row.customer_message, 220)}\nرد ناجح: ${compactForAiMemory(row.ai_reply, 650)}\nالتقييم: ${Number(row.score || 0)}`;
      })
      .join("\n\n");
  } catch (error) {
    console.error("findSimilarSuccessfulReplies failed:", error);
    return "";
  }
}

async function logAiConversation(input: {
  phone: string;
  customerMessage: string;
  aiReply: string;
  intent: CustomerIntent;
  applicationStatus?: string | null;
}) {
  try {
    await supabaseAdmin.from("ai_conversations").insert({
      phone: normalizeWhatsAppToSend(input.phone) || input.phone || null,
      customer_message: input.customerMessage,
      ai_reply: input.aiReply,
      intent: input.intent,
      application_status: input.applicationStatus || null,
      customer_replied: false,
    });
  } catch (error) {
    if ((error as any)?.code !== "42P01") {
      console.error("ai_conversations insert failed:", error);
    }
  }
}

async function findApplicationForAiMemory(
  from: string,
  text: string,
  intent: CustomerIntent,
  memory?: Awaited<ReturnType<typeof getConversationMemory>>,
) {
  const tracking = extractTracking(text);
  const typedPhone = extractJordanPhoneFromText(text);

  try {
    if (tracking && typedPhone) {
      const direct = (await findApplicationByTrackingAndPhone(tracking, typedPhone)) || (await findApplicationByTracking(tracking));
      if (direct) await setApplicationConversationLock(from, direct, "direct_tracking");
      return direct;
    }

    if (tracking) {
      const direct = (await findApplicationByTracking(tracking)) || (await findApplicationByTrackingAndPhone(tracking, from));
      if (direct) await setApplicationConversationLock(from, direct, "direct_tracking");
      return direct;
    }

    const applicationScopedIntent = isApplicationSpecificIntent(intent) || [
      "abuse", "legal_threat", "social_media_threat", "scam_accusation", "device_delay_rage",
      "human_agent", "unknown", "installment_info", "location", "apply", "products",
    ].includes(String(intent));

    if (!applicationScopedIntent) return null;

    const candidatePhone = typedPhone || from;
    const candidates = await findApplicationsByPhone(candidatePhone, 12);
    const named = findExplicitlyNamedApplication(text, candidates);
    if (named) {
      await setApplicationConversationLock(from, named, "explicit_name");
      return named;
    }

    const existingLock = await getApplicationConversationLock(from);
    if (existingLock?.application_id) {
      const locked = await findApplicationById(existingLock.application_id);
      if (locked) {
        await touchApplicationConversationLock(from);
        return locked;
      }
    }

    // A customer often omits the tracking number in a follow-up while memory still has it.
    const resolvedMemory = memory || await getConversationMemory(from, 18);
    const memoryTracking = resolvedMemory.lastTrackingId || extractTracking(resolvedMemory.conversationContext || "");
    const memoryPhone = resolvedMemory.lastPhoneNumber || extractJordanPhoneFromText(
      (resolvedMemory.lastCustomerMessages || []).join("\n"),
    );

    if (memoryTracking && memoryPhone) {
      const byBoth = await findApplicationByTrackingAndPhone(memoryTracking, memoryPhone);
      if (byBoth) {
        await setApplicationConversationLock(from, byBoth, "memory_tracking_phone");
        return byBoth;
      }
    }
    if (memoryTracking) {
      const byTracking = await findApplicationByTracking(memoryTracking);
      if (byTracking) {
        await setApplicationConversationLock(from, byTracking, "memory_tracking");
        return byTracking;
      }
    }

    if (candidates.length === 1) {
      await setApplicationConversationLock(from, candidates[0], "single_phone_application");
      return candidates[0];
    }

    // Keep AI memory/final guards aligned with buildReply: when the same phone owns
    // multiple distinct applications and no explicit name/tracking/lock resolved one,
    // never silently attach the newest application to the AI context.
    if (candidates.length > 1 && applicationChoicesNeedDisambiguation(candidates)) {
      return null;
    }

    if (memoryPhone) {
      const memoryCandidates = await findApplicationsByPhone(memoryPhone, 12);
      if (memoryCandidates.length === 1) {
        await setApplicationConversationLock(from, memoryCandidates[0], "single_memory_phone_application");
        return memoryCandidates[0];
      }
    }

    return candidates[0] || null;
  } catch (error) {
    console.error("findApplicationForAiMemory failed:", error);
  }

  return null;
}

async function markPreviousAiConversationCustomerReplied(phone: string) {
  try {
    const normalizedPhone = normalizeWhatsAppToSend(phone) || phone;

    await supabaseAdmin
      .from("ai_conversations")
      .update({ customer_replied: true })
      .eq("phone", normalizedPhone)
      .eq("customer_replied", false);
  } catch (error) {
    if ((error as any)?.code !== "42P01") {
      console.error("ai_conversations customer_replied update failed:", error);
    }
  }
}


async function claimIncomingWhatsAppMessage(input: {
  messageId?: string;
  waId: string;
  body: string;
  messageType: string;
  rawPayload?: unknown;
}) {
  const messageId = String(input.messageId || "").trim();

  if (!messageId) {
    return { shouldProcess: true, duplicate: false, reason: "missing_message_id" };
  }

  try {
    const { error } = await supabaseAdmin.from("whatsapp_incoming_message_dedupe").insert({
      message_id: messageId,
      wa_id: input.waId,
      body: input.body,
      message_type: input.messageType,
      raw_payload: input.rawPayload || null,
      received_at: new Date().toISOString(),
    });

    if (!error) {
      return { shouldProcess: true, duplicate: false, reason: "claimed" };
    }

    if ((error as any).code === "23505") {
      return { shouldProcess: false, duplicate: true, reason: "duplicate_message_id" };
    }

    if ((error as any).code !== "42P01") {
      console.error("whatsapp_incoming_message_dedupe insert failed:", error);
    }
  } catch (error) {
    console.error("whatsapp_incoming_message_dedupe claim failed:", error);
  }

  // Fallback only if the dedicated dedupe table has not been created yet.
  // This is less race-safe than the unique table, but prevents obvious duplicate replies.
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id")
      .eq("direction", "incoming")
      .eq("message_id", messageId)
      .limit(1);

    if (!error && data && data.length > 0) {
      return { shouldProcess: false, duplicate: true, reason: "duplicate_existing_log" };
    }
  } catch (error) {
    console.error("whatsapp_messages duplicate fallback failed:", error);
  }

  return { shouldProcess: true, duplicate: false, reason: "fallback_process" };
}

async function markIncomingWhatsAppMessageProcessed(messageId?: string) {
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanMessageId) return;

  try {
    await supabaseAdmin
      .from("whatsapp_incoming_message_dedupe")
      .update({ processed_at: new Date().toISOString() })
      .eq("message_id", cleanMessageId);
  } catch (error) {
    console.error("whatsapp_incoming_message_dedupe processed update failed:", error);
  }
}

function extractDeepSeekText(data: any) {
  const directContent = data?.choices?.[0]?.message?.content;

  if (typeof directContent === "string" && directContent.trim()) {
    return directContent.trim();
  }

  const deltaContent = data?.choices?.[0]?.delta?.content;

  if (typeof deltaContent === "string" && deltaContent.trim()) {
    return deltaContent.trim();
  }

  return "";
}


function extractUrlsFromReply(value: string) {
  const matches = String(value || "").match(/https?:\/\/[^\s)]+/gi) || [];
  return Array.from(new Set(matches.map((url) => url.replace(/[،,.]+$/g, ""))));
}

function normalizeUrlForMemory(url: string) {
  const clean = String(url || "").replace(/[،,.]+$/g, "").trim();
  if (/\/track\?/i.test(clean)) return clean.replace(/\/track\?.*$/i, "/track");
  return clean;
}

function shortenTrackingLinks(reply: string) {
  return String(reply || "").replace(/https?:\/\/[^\s]+\/track\?[^\s]+/gi, (url) => {
    return normalizeUrlForMemory(url);
  });
}

function stripRepeatedStaffIntro(reply: string, input: AiReplyInput) {
  let clean = String(reply || "").trim();
  // لا نحذف تعريف الموظف في أول رد. نحذفه فقط إذا ظهر اسم موظف فعليًا في رد سابق.
  if (!input.hasRecentStaffIntro) return clean;

  const staffNames = "عمران|عبدالله|عبدالرحمن|تالا|فدوة";
  const lines = clean.split(/\n+/);
  const filtered: string[] = [];
  let removedIntro = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const isEarlyLine = index <= 1;
    const hasStaffIntro = new RegExp(`^(?:يا\\s+[^،,.]{2,24}[،,.]?\\s*)?(?:انا\\s+معك|أنا\\s+معك|معك|معكِ)\\s+(?:${staffNames})(?:[،,.]|\\s|$)`, "i").test(line);
    const genericIntro = /^(?:يا\s+[^،,.]{2,24}[،,.]?\s*)?(?:أهلًا|اهلا|مرحبا|هلا)\s*(?:فيك|عليك)?\s*(?:،|,)?\s*(?:كيف\s+بقدر\s+أساعدك\??)?$/i.test(line);

    if (isEarlyLine && (hasStaffIntro || genericIntro)) {
      removedIntro = true;
      continue;
    }

    filtered.push(line);
  }

  clean = filtered.join("\n").trim();

  if (!clean && removedIntro) return input.deterministicReply;
  return clean || reply;
}

function limitAndSuppressLinks(reply: string, input: AiReplyInput) {
  let clean = shortenTrackingLinks(String(reply || "").trim());
  if (!clean) return clean;

  const actionableLinkIntents = new Set([
    "tracking_link_request", "requirements", "document_followup", "receipt_upload_needed",
    "payment", "payment_link_issue", "continue_decision", "apply", "products", "website",
    "device_change", "device_change_confirmed",
  ]);
  const replyContainsActionLinkInstruction = /(?:رابط|لينك|ادخل|أدخل|استخدم|ارفع|أرفع|عبّي|عبي|تعبئة)[^\n]{0,120}/i.test(clean) && extractUrlsFromReply(clean).length > 0;

  // V1.6.4 LINK INTEGRITY: a current action must carry its actual URL(s). Do not
  // hide a link merely because it appeared in an older message. Multiple distinct
  // links (e.g. guarantor + salary slip) are also preserved.
  if (
    actionableLinkIntents.has(String(input.intent)) ||
    isTrackingLinkRequestText(input.customerText) ||
    isExplicitOperationalLinkRequestText(input.customerText) ||
    replyContainsActionLinkInstruction
  ) {
    return clean;
  }

  const receiptUploadInstruction = /(?:ارفع|أرفع|ترفع|رفع)\s+(?:صورة\s+)?(?:وصل|إيصال|ايصال)|(?:رفع|رابط)\s+(?:صورة\s+)?(?:وصل|إيصال|ايصال)/i.test(clean);
  const requiredReceiptUrl = extractUrlsFromReply(clean)
    .map(normalizeUrlForMemory)
    .find((url) => /\/receipt(?:$|[?#])/i.test(url)) || "";
  const forceReceiptUrl = Boolean(receiptUploadInstruction && requiredReceiptUrl);

  const previousUrls = new Set((input.sentUrls || []).map(normalizeUrlForMemory));
  for (const reply of input.lastAssistantReplies || []) {
    for (const url of extractUrlsFromReply(reply)) previousUrls.add(normalizeUrlForMemory(url));
  }

  const lines = clean.split("\n");
  const output: string[] = [];
  let keptFirstUrl = false;
  let suppressedAny = false;

  for (const line of lines) {
    const urls = extractUrlsFromReply(line).map(normalizeUrlForMemory);
    if (!urls.length) {
      output.push(line);
      continue;
    }

    const isRequiredReceiptLine = forceReceiptUrl && urls.some((url) => url === requiredReceiptUrl);
    const isRepeated = urls.some((url) => previousUrls.has(url)) && !isRequiredReceiptLine;
    if (isRepeated || keptFirstUrl) {
      suppressedAny = true;
      continue;
    }

    let updatedLine = line;
    for (const url of urls) {
      const normalized = normalizeUrlForMemory(url);
      if (normalized !== url) updatedLine = updatedLine.replace(url, normalized);
    }
    output.push(updatedLine);
    keptFirstUrl = true;
  }

  clean = output.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (suppressedAny) {
    const hasLinkNote = /الرابط.*(فوق|سابق|مرسل)/i.test(clean);
    if (!hasLinkNote) {
      clean = `${clean}\n\nالرابط أرسلناه لك سابقًا بنفس المحادثة، تابع من هناك إذا احتجته.`.trim();
    }
  }

  return clean;
}

function removeOverusedManagerName(reply: string, input: AiReplyInput) {
  let clean = String(reply || "");
  const escalationIntents: CustomerIntent[] = ["legal_threat", "social_media_threat", "scam_accusation", "payment_dispute", "refund", "complaint", "abuse"];
  const explicitManagerRequest = /مدير|عمران|مسؤول|اداره|إدارة/i.test(input.customerText || "");
  const allowManager = escalationIntents.includes(input.intent) && explicitManagerRequest;

  if (!allowManager) {
    clean = clean
      .replace(/(?:انا\s+معك|أنا\s+معك|معك|معكِ)\s+عمران[،,.]?\s*/gi, "")
      .replace(/\bعمران\b/g, "فريق المتابعة");
  }

  return clean.replace(/\n{3,}/g, "\n\n").trim();
}

function oneFaithPhraseOnly(reply: string) {
  let clean = String(reply || "");
  const phrases = ["إن شاء الله", "بإذن الله", "الله ييسر الأمور", "الله يعطيك العافية"];
  let seen = false;

  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clean = clean.replace(new RegExp(escaped, "g"), (match) => {
      if (seen) return "";
      seen = true;
      return match;
    });
  }

  return clean.replace(/\s+([،,.؟])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}


function replaceColdClarificationForEmotionalPressure(reply: string, input: AiReplyInput) {
  const clean = String(reply || "").trim();
  if (!clean) return clean;

  const isEmotional = String(input.intent) === "emotional_pressure" || isEmotionalPressureText(input.customerText || "");
  if (!isEmotional) return clean;

  const coldClarification = /قصدك\s+تتابع\s+الملف|عندك\s+سؤال\s+معين|وضحلي\s+شو\s+المطلوب|بدك\s+تتابع\s+طلب/i.test(clean);
  const shallowEmpathyOnly =
    clean.length < 140 &&
    /(فاهم|متفهم|مقدر|مقدّر).{0,40}(شعورك|وضعك|انزعاجك)/i.test(clean);

  if (coldClarification || shallowEmpathyOnly) {
    return input.deterministicReply;
  }

  return clean;
}

function trimOverFormalEmotionalReply(reply: string, input: AiReplyInput) {
  let clean = String(reply || "").trim();
  if (String(input.intent) !== "emotional_pressure") return clean;

  // Emotional replies should feel like WhatsApp, not a formal report.
  clean = clean
    .replace(/حسب البيانات الظاهرة لدينا/g, "حسب الظاهر عندي")
    .replace(/يرجى تزويدنا/g, "ابعثلي")
    .replace(/نرجو منك/g, "خلينا");

  return clean.replace(/\n{3,}/g, "\n\n").trim();
}


function replaceUnfoundedEmotionalPressure(reply: string, input: AiReplyInput) {
  const clean = String(reply || "").trim();
  if (!clean) return clean;

  const customerText = input.customerText || "";
  const looksLikeInventedEmotion = /احراج شخصي|إحراج شخصي|شخص عزيز|فاهم شعورك|ازيد الإحراج|أزيد الإحراج/i.test(clean);

  if (looksLikeInventedEmotion && !isEmotionalPressureText(customerText)) {
    return input.deterministicReply;
  }

  return clean;
}

function enforceApplicationTruth(reply: string, input: AiReplyInput) {
  let clean = String(reply || "").trim();
  if (!clean) return input.deterministicReply;

  const status = String(input.status || "");
  const paymentStatus = String(input.paymentStatus || "");
  const isApproved = status === "approved" || status === "customer_accepts_delivery_delay";
  const paymentIsActionable =
    status === "preliminary_qualified" ||
    status === "customer_confirmed_continue" ||
    ["pending", "pending_payment", "payment_info_sent"].includes(paymentStatus);

  // V1.6.4.2: the old “مخزون محدود” banner was a UI bug, not an availability signal.
  // Never let AI reinterpret that historical banner as proof that a device is unavailable.
  if (isLegacyLimitedStockUiMessageText(input.customerText || "")) {
    return input.deterministicReply;
  }

  const internalNarration = [
    "رح أجاوب على آخر سؤال",
    "رح أجاوب على نفس النقطة مباشرة",
    "وصلني سؤالك. رح أجاوب",
    "ما رح أكرر حالة الطلب",
    "حسب سياق المحادثة",
    "بدون إعادة تفاصيل قديمة",
    "من ناحية المتابعة الداخلية",
    "خلينا نأهل الطلب",
    "ندخل الملف للدراسة",
    "يتم تدقيقه يدويًا",
    "الطلبات غير الجادة",
    "صفحة الإدارة",
    "التحويل من بنك عادي ما بنفع",
    "التحويل البنكي ما بنفع",
    "الدفع من Orange Money فقط",
    "لازم شخص عنده محفظة أورنج",
    "هذا الحل الوحيد للدفع",
  ];

  if (internalNarration.some((phrase) => clean.includes(phrase))) {
    return input.deterministicReply;
  }

  if (!isApproved && /(الموافقات شبه جاهزه|الموافقات شبه جاهزة|ملفك مكتمل|ما فيه اي اشكال|ما فيه أي إشكال|طلبك مقبول وماشي|طلبك مقبول)/i.test(clean)) {
    return input.deterministicReply;
  }

  if (!isApproved && /(بانتظار وصول الاجهزه|بانتظار وصول الأجهزة|الجهاز لسا ما توفر|الجهاز غير متوفر عند المورد)/i.test(clean)) {
    return input.deterministicReply;
  }

  const applicationStage = resolveApplicationStage(status, paymentStatus);
  if (applicationStage !== "final_review" && /قيد الدراسة النهائية|الدراسة النهائية|المرحلة النهائية من الدراسة/i.test(clean)) {
    return input.deterministicReply;
  }

  if (["submitted", "queued_for_review", "prequalified"].includes(applicationStage) && /(?:بدأت|قيد) الدراسة(?! المبدئية)|الملف قيد الدراسة/i.test(clean)) {
    return input.deterministicReply;
  }

  if (applicationStage === "under_review" && /قيد الدراسة النهائية|المرحلة النهائية/i.test(clean)) {
    return input.deterministicReply;
  }

  if (!paymentIsActionable && /(المطلوب.*دفع رسوم فتح الملف|ارسل لك تعليمات الدفع|أرسل لك تعليمات الدفع|ادفع رسوم فتح الملف)/i.test(clean)) {
    return input.deterministicReply;
  }

  // الردود التي تنفذ تغييرًا أو إلغاءً ترجع مباشرة من الكود بعد نجاح قاعدة البيانات،
  // لذلك لا نسمح للنموذج بادعاء تنفيذها.
  if (/(تم تسجيل تغيير الجهاز|طلب التغيير مسجل|تم الغاء الطلب|تم إلغاء الطلب)/i.test(clean)) {
    return input.deterministicReply;
  }

  return clean;
}

function isLikelyIncompleteReply(reply: string) {
  const clean = String(reply || "").trim();
  if (!clean) return true;

  const normalized = normalizeArabicText(clean)
    .replace(/[،,.؟!;:]+$/g, "")
    .trim();

  const words = normalized.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1] || "";
  const lastTwo = words.slice(-2).join(" ");
  const lastThree = words.slice(-3).join(" ");

  const danglingWords = [
    "من", "الى", "إلى", "على", "عن", "في", "اذا", "إذا", "لو",
    "عشان", "حتى", "لكن", "بس", "و", "او", "أو",
    "انه", "إنه", "انو", "إنو", "بأنه", "بانّه",
  ];

  if (danglingWords.includes(lastWord)) return true;
  if (["خلينا ن", "حتى ن", "بدي ا", "بدي أ", "بدنا ن"].includes(lastTwo)) return true;
  if (/^معك\s+\S+\s+من$/i.test(lastThree)) return true;
  if (words.length >= 3 && lastWord.length <= 1 && lastWord !== "لا") return true;
  if (words.length >= 3 && words[words.length - 2] === "يا" && lastWord.length <= 2) return true;
  if (/^وال[\p{L}]{0,2}$/u.test(lastWord) && lastWord !== "والله") return true;
  if (/^(?:بال|لل|وال|فال|كال)$/u.test(lastWord)) return true;
  if (["تحد", "الرسم", "الرس", "المطل", "الموافق", "التحد", "رقم"].includes(lastWord)) return true;
  if (/(?:^|\s)(?:وطلب|و طلب|ومسار|و مسار|وحالة|و حالة)\s+(?:الاسترداد|الدفع|التتبع)$/u.test(normalized)) return true;
  if (/https?:\/\/\S*$/i.test(clean) && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(clean.split(/\s+/).pop() || "")) return true;
  if (/[:،,\-–]$/.test(clean)) return true;

  return false;
}

function replyTooShortForIntent(reply: string, intent: CustomerIntent) {
  const socialIntents = new Set(["greeting", "thanks", "reaction"]);
  if (socialIntents.has(String(intent))) return false;

  const clean = normalizeArabicText(String(reply || ""))
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[✅🌿🙂🙏❤️💚]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return true;
  const words = clean.split(/\s+/).filter(Boolean);

  // V1.2.2 SEMANTIC COMPLETENESS: catches fragments such as "ما بق"
  // while allowing intentionally short social replies.
  return clean.length < 16 || words.length < 4;
}

function replySuspiciouslyCompressed(reply: string, deterministicReply: string, intent: CustomerIntent) {
  if (["greeting", "thanks", "reaction"].includes(String(intent))) return false;
  const clean = normalizeArabicText(String(reply || "")).replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
  const baseline = normalizeArabicText(String(deterministicReply || "")).replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
  if (baseline.length < 180 || clean.length < 24) return false;
  return clean.length < 95 && clean.length < baseline.length * 0.42;
}

function containsUnverifiedInterestOrReligiousClaim(reply: string) {
  const t = normalizeArabicText(reply);
  return hasAny(t, [
    "ما في فوائد ربوية", "لا يوجد فوائد ربوية", "بدون فوائد ربوية",
    "ما في ربا", "بدون ربا", "النظام شرعي", "التقسيط شرعي",
    "حلال 100", "حلال مية بالمية", "حلال ميه بالميه",
    "ما في فوائد", "بدون فوائد", "لا توجد فوائد",
  ]);
}

function incompleteReplyFallback(input: AiReplyInput) {
  if (String(input.intent) === "staff_identity" || String(input.intent) === "human_agent") {
    return `معك ${input.assignedAgentName || "موظف من فريق الأمين"} من فريق الأمين. احكيلي سؤالك وبجاوبك حسب حالة الطلب.`;
  }

  if (String(input.intent) === "requirements") {
    return "حاليًا ما في مستند إضافي مطلوب منك إلا إذا ظهر على الطلب طلب محدد، وقتها رح توصلك رسالة واضحة باسم المستند وطريقة رفعه.";
  }

  return input.deterministicReply;
}


function containsUnverifiedActionClaim(reply: string, input: AiReplyInput) {
  const allowedIntents = [
    "continue_decision", "cancel_confirmed", "reopen_cancelled_confirmed",
    "application_data_correction_confirmed", "receipt_upload_confirmation",
  ];

  if (allowedIntents.includes(String(input.intent))) return false;

  const clean = String(reply || "");
  const actionClaim = /(?:تم|جرى)\s+(?:تسجيل|تحديث|تعديل|تثبيت|اعتماد|تأكيد)\s+(?:موافقتك|رغبتك|بياناتك|الراتب|الطلب|الجهاز|اللون|السعه|السعة)/i.test(clean);
  const personalFollowupPromise = /(?:انا|أنا)\s+شخصي(?:ا|ًا)?\s+(?:رح|راح)\s+اتابع|(?:رح|راح)\s+(?:أ?تابع)(?:لك)?\s+(?:(?:الموضوع|ملفك|طلبك)(?:\s+شخصي(?:ا|ًا)?)?|(?:ملفك|طلبك)\s+(?:اول\s+باول|أول\s+بأول))|بضل\s+اتابع(?:لك)?|بتابعلك\s+(?:ملفك|طلبك)|(?:انا|أنا)\s+مسجل(?:ة)?[^.\n]{0,120}(?:رح|راح)\s+أ?تابع/i.test(clean);
  const unsupportedTeamAction = /(?:الفريق\s+(?:الفني|التقني)|الدعم\s+الفني)\s+(?:شغال|يعمل)\s+(?:عليه|على\s+معالجته|على\s+حل)/i.test(clean);
  const unsupportedRefundMechanics = /(?:بيوصل|يوصل)\s+لحسابك\s+مباشره?\s+من\s+النظام|ما\s+حدا\s+(?:بيقدر|يقدر)\s+يسرع(?:ها|ه)\s+يدوي/i.test(normalizeArabicText(clean));
  return actionClaim || personalFollowupPromise || unsupportedTeamAction || unsupportedRefundMechanics;
}

function containsIncorrectPaymentSourceClaim(reply: string) {
  const text = normalizeArabicText(reply);
  return hasAny(text, [
    "التحويل من بنك عادي ما بنفع", "التحويل من البنك ما بنفع", "التحويل البنكي ما بنفع",
    "الدفع من orange money فقط", "الدفع من اورنج موني فقط", "لازم محفظه اورنج",
    "لازم محفظة اورنج", "لازم شخص عنده محفظه اورنج", "لازم شخص عنده محفظة اورنج",
    "هذا الحل الوحيد للدفع",
  ]);
}

function removeEmptyReplyLinkLabels(value: string) {
  const lines = String(value || "").split("\n");
  const output: string[] = [];
  const labelPattern = /^(?:رابط رفع الوصل الرسمي|رابط رفع الوصل|رابط المتابعة|رابط الطلب|رابط الاسترداد)\s*:\s*$/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!labelPattern.test(line.trim())) {
      output.push(line);
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1;
    const nextLine = lines[nextIndex]?.trim() || "";
    if (/^https?:\/\//i.test(nextLine)) {
      output.push(line);
      continue;
    }
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}


function enforceAssignedAgentIdentity(reply: string, input: AiReplyInput) {
  const assigned = String(input.assignedAgentName || "").trim();
  const approved = new Set(["تالا", "فدوة", "عبدالله", "عبدالرحمن", "عمران"]);
  if (!approved.has(assigned)) return String(reply || "");

  return String(reply || "").replace(
    /((?:انا\s+معك|أنا\s+معك|معك|معكِ)\s+)(تالا|فدوة|عبدالله|عبدالرحمن|عمران)(?=[،,.]|\s|$)/gi,
    (_match, prefix) => `${prefix}${assigned}`,
  );
}

function containsUnsupportedRegistrationClaim(value: string) {
  const t = normalizeArabicText(value);
  return hasAny(t, [
    "شركتنا مسجلة", "شركتنا مسجله", "مسجلة ومعروفة بالأردن", "مسجله ومعروفه بالاردن",
    "مسجلين ومعروفين", "جهة مسجلة ومعروفة", "جهة مسجله ومعروفه",
  ]);
}

function containsWrongReviewDuration(value: string) {
  const t = normalizeArabicText(value);
  return hasAny(t, [
    "يوم إلى يومين", "يوم الى يومين", "يوم او يومين", "يوم أو يومين", "1-2 يوم", "1 إلى 2 يوم", "1 الى 2 يوم",
  ]);
}

function containsGuaranteedReviewOutcome(value: string) {
  const t = normalizeArabicText(value);
  return hasAny(t, [
    "بصير عندك خبر واضح", "رح تخلص اليوم", "أكيد اليوم", "اكيد اليوم", "اليوم بنعطيك النتيجة", "اليوم بنعطيك النتيجه",
  ]);
}

function containsUnverifiedProductVerificationPromise(value: string) {
  const t = normalizeArabicText(value);
  return hasAny(t, [
    "أقدر أتأكدلك", "اقدر اتأكدلك", "بنقدر نأكدلك", "بنقدر ناكدلك", "رح أتأكدلك", "رح اتأكدلك",
    "بعد ما تقدم الطلب بنتأكدلك", "بعد ما تقدم الطلب بنأكدلك",
  ]);
}

function finalizeHumanReply(reply: string, input: AiReplyInput) {
  let clean = String(reply || "").trim();
  clean = shortenTrackingLinks(clean);
  clean = removeOverusedManagerName(clean, input);
  clean = enforceAssignedAgentIdentity(clean, input);
  clean = stripRepeatedStaffIntro(clean, input);
  clean = limitAndSuppressLinks(clean, input);
  clean = removeEmptyReplyLinkLabels(clean);
  clean = enforceCustomerGenderLanguage(clean, detectCustomerGender(input.customerName));
  clean = oneFaithPhraseOnly(clean);
  clean = replaceColdClarificationForEmotionalPressure(clean, input);
  clean = trimOverFormalEmotionalReply(clean, input);
  clean = replaceUnfoundedEmotionalPressure(clean, input);

  if (
    containsUnverifiedActionClaim(clean, input) ||
    containsIncorrectPaymentSourceClaim(clean)
  ) {
    // Immediate operational/source-of-payment hazards are collapsed here.
    // Other policy deviations are left intact for the Final Truth Gate so it can
    // repair the answer in-context instead of turning the whole conversation into a template.
    clean = input.deterministicReply;
  }

  clean = clean.replace(/الجمعة والسبت عطلة رسمية/gi, "الجمعة والسبت لا تُحسبان ضمن أيام العمل");

  if (
    isLikelyIncompleteReply(clean) ||
    replyTooShortForIntent(clean, input.intent) ||
    replySuspiciouslyCompressed(clean, input.deterministicReply, input.intent)
  ) {
    clean = incompleteReplyFallback(input);
  }

  clean = enforceApplicationTruth(clean, input);

  if (
    !clean ||
    isLikelyIncompleteReply(clean) ||
    replyTooShortForIntent(clean, input.intent) ||
    replySuspiciouslyCompressed(clean, input.deterministicReply, input.intent)
  ) {
    return incompleteReplyFallback(input);
  }

  return clean;
}

function aiTemperatureForInput(input: AiReplyInput, useDeepThinking: boolean) {
  if (input.isSensitive || useDeepThinking) {
    return Number(process.env.AI_SENSITIVE_TEMPERATURE || "0.30");
  }

  if (input.hasRecentConversation || isTinyContextFollowupText(input.customerText)) {
    return Number(process.env.AI_HUMAN_TEMPERATURE || "0.55");
  }

  return Number(process.env.AI_TEMPERATURE || "0.45");
}


function shadowAgentIdFromStaffName(name: string): ShadowAgentId | null {
  const normalizedName = normalizeArabicText(name);
  if (normalizedName === normalizeArabicText("تالا")) return "tala";
  if (normalizedName === normalizeArabicText("فدوة")) return "fadwa";
  if (normalizedName === normalizeArabicText("عبدالله")) return "abdullah";
  if (normalizedName === normalizeArabicText("عبدالرحمن")) return "abdulrahman";
  if (normalizedName === normalizeArabicText("عمران")) return "omran";
  return null;
}

function criticalPolicyFailures(checks: ShadowPolicyCheck[]) {
  return checks.filter((check) => check.severity === "critical" && !check.passed);
}

function explicitLinkRecoveryReply(
  request: Request,
  app: ApplicationRecord | null,
  customerText: string,
  fallbackReply: string,
) {
  if (!app || !isExplicitOperationalLinkRequestText(customerText)) return fallbackReply;
  const text = normalizeArabicText(customerText);
  const baseUrl = getBaseUrl(request);
  let url = "";

  if (hasAny(text, ["وصل", "ايصال", "إيصال", "حواله", "حوالة"])) url = receiptUrl(baseUrl, app);
  else if (hasAny(text, ["هويه", "هوية", "الهوية", "الهويه"])) url = identityUrl(baseUrl, app);
  else if (hasAny(text, ["كشف راتب", "شهادة راتب", "شهاده راتب", "راتب"])) url = salarySlipUrl(baseUrl, app);
  else if (hasAny(text, ["كفيل", "الضامن", "ضامن"])) url = guarantorUrl(baseUrl, app);
  else if (hasAny(text, ["استرداد", "استرجاع", "تأخير", "تاخير"])) {
    // V1.6.5 CRITICAL: never expose the refund/delay-decision link unless
    // confirmed payment evidence exists. The refund intent path owns any mutation.
    if (!hasConfirmedRefundPayment(app)) return fallbackReply;
    url = delayUrl(baseUrl, app);
  }
  else if (hasAny(text, ["اختيار الجهاز", "اختيار جهاز"])) url = hasSpecificSelectedDevice(app.device_name)
    ? changeDeviceUrl(baseUrl, app)
    : selectDeviceUrl(baseUrl, app);
  else if (hasAny(text, ["تغيير الجهاز", "تعديل الجهاز"])) url = changeDeviceUrl(baseUrl, app);
  else if (hasAny(text, ["تتبع", "متابعه", "متابعة"])) url = trackUrl(baseUrl, app);

  if (!url || fallbackReply.includes(url)) return fallbackReply;
  return `${fallbackReply}\n\nالرابط الرسمي المرتبط بطلبك:\n${url}`;
}

async function applyProductionFinalTruthGate(input: {
  request: Request;
  from: string;
  customerName: string | null;
  customerText: string;
  messageType: string;
  initialIntent: CustomerIntent;
  application: ApplicationRecord | null;
  reply: string;
  conversationContext?: string | null;
  lastAssistantReplies?: string[];
  lastCustomerMessages?: string[];
  hasRecentStaffIntro?: boolean;
}) {
  const facts = buildShadowFacts(
    input.application,
    input.application?.tracking_id || extractTracking(input.customerText) || null,
    input.application?.full_name || input.customerName || null,
    input.messageType,
    null,
    input.customerText,
  );
  const topics = detectShadowTopics(input.customerText, input.messageType, input.initialIntent);
  const preferredAgent = shadowAgentIdFromStaffName(assignedStaffName(input.from));
  const route = routeShadowAgent({
    topics,
    customerText: input.customerText,
    initialIntent: input.initialIntent,
    facts,
    seed: input.application?.tracking_id || input.from,
    preferredAgent,
  });

  const validate = (candidate: string) => validateFinalActualReply(candidate, topics, facts, {
    initialIntent: input.initialIntent,
    agent: route.agent,
    agentName: route.agentName,
    customerText: input.customerText,
    hasRecentConversation: Boolean(input.conversationContext || input.lastAssistantReplies?.length || input.lastCustomerMessages?.length),
    lastAssistantReplies: input.lastAssistantReplies,
    lastCustomerMessages: input.lastCustomerMessages,
  });

  const firstChecks = validate(input.reply);
  const firstFailures = criticalPolicyFailures(firstChecks);
  if (!firstFailures.length) {
    return {
      reply: input.reply,
      recovered: false,
      failedChecks: [] as string[],
    };
  }

  const failureDirectedReply = buildFinalTruthContextRecovery({
    customerText: input.customerText,
    failedCheckIds: firstFailures.map((check) => check.id),
    hasApplication: facts.hasApplication,
    refundActive: facts.refundActive,
    refundCompleted: facts.refundCompleted,
    refundEligible: facts.refundEligible,
    conditionalCancellation: isConditionalCancellationText(input.customerText),
    initialIntent: input.initialIntent,
    paymentConfirmed: facts.paymentConfirmed,
  });

  const fallbackPlan = buildSafeFallbackReply({
    facts,
    topics,
    initialIntent: input.initialIntent,
    customerText: input.customerText,
    messageType: input.messageType,
    route,
  });
  const selectedRecoveryReply = failureDirectedReply || fallbackPlan.reply;
  let fallbackReply = explicitLinkRecoveryReply(input.request, input.application, input.customerText, selectedRecoveryReply);
  fallbackReply = applyFinalSendGuard(fallbackReply, input.application);

  const secondChecks = validate(fallbackReply);
  let secondFailures = criticalPolicyFailures(secondChecks);
  let recoveryWasHumanized = false;

  // V1.3.0: once a safe recovery exists, try to phrase that SAME safe content naturally.
  // The humanized version must pass the exact same critical validators before it can be sent.
  if (!secondFailures.length && !isHardExactCustomerIntent(input.initialIntent)) {
    const humanizedRecovery = await generateAiReply({
      customerText: input.customerText,
      deterministicReply: fallbackReply,
      customerName: input.application?.full_name ? firstTwoNames(input.application.full_name) : input.customerName || undefined,
      trackingId: input.application?.tracking_id || input.application?.id || undefined,
      status: input.application?.status || null,
      paymentStatus: input.application?.payment_status || null,
      deviceName: input.application?.device_name || null,
      isSensitive: true,
      hasApplication: Boolean(input.application),
      intent: input.initialIntent,
      conversationContext: input.conversationContext || undefined,
      lastAssistantReplies: input.lastAssistantReplies || [],
      lastCustomerMessages: input.lastCustomerMessages || [],
      hasRecentConversation: Boolean(input.conversationContext),
      hasRecentStaffIntro: input.hasRecentStaffIntro,
      assignedAgentName: assignedStaffName(input.from),
    });
    let candidate = explicitLinkRecoveryReply(input.request, input.application, input.customerText, humanizedRecovery);
    candidate = applyFinalSendGuard(candidate, input.application);
    const humanChecks = validate(candidate);
    const humanFailures = criticalPolicyFailures(humanChecks);
    if (!humanFailures.length && candidate.trim()) {
      fallbackReply = candidate;
      recoveryWasHumanized = true;
    }
  }

  if (secondFailures.length) {
    const voice = topics.includes("voice_message");
    const independence = topics.includes("independence");
    const businessHours = topics.includes("business_hours");

    if (voice) {
      fallbackReply = "وصلت الرسالة الصوتية، لكن ما عندي تفريغ نصي معتمد لمحتواها. اكتب النقطة نفسها بجملة قصيرة حتى أرد عليها بدقة.";
    } else if (input.application && facts.refundActive && (topics.includes("refund") || isRefundStatePriorityFollowupText(input.customerText))) {
      fallbackReply = refundAlreadyRequestedReply(input.application, input.customerText);
    } else if (topics.includes("cancellation") && input.application) {
      fallbackReply = cancelRequestReply(input.application, getBaseUrl(input.request), input.customerText);
    } else if (independence) {
      fallbackReply = "الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق.";
    } else if (businessHours) {
      fallbackReply = "ما عندي وقت دوام عام معتمد أقدر أحدده لك بدون تخمين. متابعة الطلبات الأساسية تتم عبر واتساب حسب الدور وضغط المراجعات، والحضور إلى المكتب لا يكون إلا بموعد رسمي بعد الموافقة النهائية.";
    } else if (topics.includes("office_location") && isOfficeLocationText(input.customerText)) {
      fallbackReply = locationReply(input.from, input.application);
    } else if (topics.includes("review_time")) {
      fallbackReply = input.application
        ? reviewTimeReply(input.from, input.application, input.application.tracking_id || input.application.id, input.customerText)
        : generalReviewTimeReply(input.from, input.customerText);
    } else if (input.application) {
      fallbackReply = unknownReply(input.from, input.application, input.customerText);
    } else {
      fallbackReply = unknownReply(input.from, null, input.customerText);
    }

    fallbackReply = explicitLinkRecoveryReply(input.request, input.application, input.customerText, fallbackReply);
    fallbackReply = applyFinalSendGuard(fallbackReply, input.application);
  }

  await sendDiscordNotification({
    title: "🛡️ FINAL TRUTH GATE — تم استبدال رد غير آمن",
    description: `فشل الرد الأول في الحمايات التالية: ${firstFailures.map((check) => check.id).join(", ")}. تم استخدام ${recoveryWasHumanized ? "إنقاذ إنساني أعيد التحقق منه بنفس الحمايات" : failureDirectedReply ? "إنقاذ سياقي موجّه بسبب الفشل" : "رد حتمي مبني على الحقائق"} قبل الإرسال.`,
    color: 0xed4245,
    app: input.application || undefined,
    customerPhone: input.from,
    customerMessage: input.customerText,
    systemReply: fallbackReply,
    baseUrl: getBaseUrl(input.request),
  });

  return {
    reply: fallbackReply,
    recovered: true,
    failedChecks: firstFailures.map((check) => check.id),
  };
}

function incompleteReplyRecovery(options: {
  from: string;
  text: string;
  intent: CustomerIntent;
  application?: ApplicationRecord | null;
}) {
  const app = options.application || null;
  if (String(options.intent) === "review_time") return app ? reviewAndProcedureReply(app) : generalReviewTimeReply(options.from, options.text);
  if (String(options.intent) === "receipt_upload_confirmation") return receiptUploadConfirmationReply(app);
  if (String(options.intent) === "location") return locationReply(options.from, app);
  if (String(options.intent) === "order_status" && app) return conciseOrderStatusReply(app, options.text);
  if (String(options.intent) === "requirements" && app) return directRequirementQuestionReply(app, options.text) || `المطلوب منك يتحدد حسب حالة طلبك نفسها، وما بطلب منك أي مستند غير ظاهر كمطلوب على الملف حاليًا.\n\nرقم الطلب: ${app.tracking_id || app.id}`;
  return "شو النقطة اللي بدك تعرفها تحديدًا؟";
}

function finalizeReplyBeforeSend(reply: string, options: {
  from: string;
  text: string;
  intent: CustomerIntent;
  memory: Awaited<ReturnType<typeof getConversationMemory>>;
  application?: ApplicationRecord | null;
}) {
  const finalReply = finalizeHumanReply(reply, {
    customerText: options.text,
    deterministicReply: reply,
    customerName: options.application?.full_name ? firstTwoNames(options.application.full_name) : undefined,
    trackingId: options.application?.tracking_id || options.application?.id || undefined,
    status: options.application?.status || null,
    paymentStatus: options.application?.payment_status || null,
    deviceName: options.application?.device_name || null,
    isSensitive: looksSensitive(options.text),
    hasApplication: Boolean(options.application),
    intent: options.intent,
    conversationContext: options.memory.conversationContext,
    lastAssistantReplies: options.memory.lastAssistantReplies,
    lastCustomerMessages: options.memory.lastCustomerMessages,
    memoryTrackingId: options.memory.lastTrackingId || null,
    sentUrls: options.memory.sentUrls || [],
    hasRecentConversation: options.memory.hasRecentConversation,
    hasRecentStaffIntro: options.memory.hasRecentStaffIntro,
    assignedAgentName: assignedStaffName(options.from),
    lastMeaningfulCustomerMessage: options.memory.lastMeaningfulCustomerMessage || null,
    lastQuestionLikeCustomerMessage: options.memory.lastQuestionLikeCustomerMessage || null,
  });

  if (isLikelyIncompleteReply(finalReply) || replyTooShortForIntent(finalReply, options.intent)) {
    return incompleteReplyRecovery({
      from: options.from,
      text: options.text,
      intent: options.intent,
      application: options.application,
    });
  }

  return finalReply;
}

const FINAL_SECURE_UPLOAD_NOTICE = "وصل الدفع وأي مستندات حساسة تُرفع فقط من الرابط الرسمي المرتبط بالطلب، ولا تُرسل عبر واتساب.";

function unsafeSensitiveUploadLine(line: string) {
  const value = normalizeArabicText(line);
  if (!value) return false;

  const sensitive = hasAny(value, [
    "وصل", "اثبات دفع", "إثبات دفع", "صورة الطلب", "صوره الطلب", "صورة الحركة", "صوره الحركه",
    "هوية", "هويه", "كشف راتب", "شهادة راتب", "شهاده راتب", "بيانات الكفيل", "مستند",
  ]);
  const safeInstruction = hasAny(value, [
    "لا ترسل", "لا ترسله", "لا ترسلي", "لا تبعث", "لا تبعته", "لا تبعثي",
    "لا يرسل", "لا يرسل عبر واتساب", "الرابط الرسمي", "الرابط الامن", "الرابط الآمن",
    "يرفع فقط", "تُرفع فقط", "ترفع فقط",
  ]);
  const directRequest = hasAny(value, [
    "ابعثه هون", "ابعت هون", "ابعث هون", "ارسل هون", "أرسل هون", "ارسلها هون", "أرسلها هون",
    "ابعثلي", "ابعتلي", "ارسل لنا", "أرسل لنا", "معه صورة", "معها صورة",
    "صورة الوصل ان وجدت", "صورة الوصل إن وجدت", "صورة من الحركة",
    "ارفع الوصل هون", "ارفع الوصل هنا", "ارفع اشعار الدفع هون", "ارفع إشعار الدفع هون",
    "ارفعه هون", "ارفعه هنا", "هون او عبر الرابط", "هون أو عبر الرابط", "هنا او عبر الرابط", "هنا أو عبر الرابط",
  ]);

  return sensitive && directRequest && !safeInstruction;
}

function applyFinalSendGuard(reply: string, app?: ApplicationRecord | null) {
  let original = String(reply || "").trim();
  if (!original) return original;

  // V1.1.8 FINAL ADDRESS GUARD: حتى لو خرج عنوان المكتب من أي مسار قديم،
  // يمنع قبل الموافقة النهائية. هذا الفحص يقع مباشرة قبل sendWhatsAppText.
  if (!canShareOfficeAddress(app)) {
    const detailedAddressMarkers = [
      BUSINESS_ADDRESS,
      "رانا سنتر",
      "الطابق الثاني",
      "مقابل مستشفى العيون",
    ];
    if (detailedAddressMarkers.some((marker) => marker && normalizeArabicText(original).includes(normalizeArabicText(marker)))) {
      const safeLines = original.split(/\r?\n/).filter((line) => {
        const value = normalizeArabicText(line);
        if (!value) return true;
        if (detailedAddressMarkers.some((marker) => marker && value.includes(normalizeArabicText(marker)))) return false;
        if (hasAny(value, ["عنواننا الرسمي", "عنوان المكتب:", "العنوان الرسمي:"])) return false;
        return true;
      });
      original = safeLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      const notice = `المكتب في ${BUSINESS_GENERAL_LOCATION}. العنوان التفصيلي واسم المبنى والطابق يتم إرسالهم فقط بعد الموافقة النهائية ومع الموعد الرسمي.`;
      if (!normalizeArabicText(original).includes(normalizeArabicText(BUSINESS_GENERAL_LOCATION))) {
        original = `${original}${original ? "\n\n" : ""}${notice}`;
      }
    }
  }

  const normalized = normalizeArabicText(original);
  const forbiddenRegulatoryClaim = hasAny(normalized, [
    "الامين للاقساط والتمويل", "شركة الامين للاقساط والتمويل",
    "مرخصة من البنك المركزي", "مرخصه من البنك المركزي", "مرخصين من البنك المركزي",
    "خاضعة لرقابة البنك المركزي", "خاضعه لرقابه البنك المركزي", "تخضع لرقابة البنك المركزي",
    "مرخصة ومسجلة حسب الاصول", "مرخصه ومسجله حسب الاصول",
    "شركتنا مسجلة", "شركتنا مسجله", "مسجلة ومعروفة بالأردن", "مسجله ومعروفه بالاردن",
    "مسجلين ومعروفين",
  ]);
  if (forbiddenRegulatoryClaim) {
    return `${BUSINESS_REGULATORY_DISCLOSURE}

نشاطنا هو ${BUSINESS_ACTIVITY}.`;
  }

  const lines = original.split(/\r?\n/);
  let replaced = false;
  const guardedLines = lines.map((line) => {
    if (!unsafeSensitiveUploadLine(line)) return line;
    replaced = true;
    return FINAL_SECURE_UPLOAD_NOTICE;
  });

  if (!replaced && unsafeSensitiveUploadLine(original)) {
    return FINAL_SECURE_UPLOAD_NOTICE;
  }

  const compacted: string[] = [];
  for (const line of guardedLines) {
    const clean = line.trim();
    if (!clean) {
      if (compacted.length && compacted[compacted.length - 1] !== "") compacted.push("");
      continue;
    }
    if (clean === FINAL_SECURE_UPLOAD_NOTICE && compacted.includes(FINAL_SECURE_UPLOAD_NOTICE)) continue;
    compacted.push(clean);
  }

  let customerFacing = compacted.join("\n").trim();
  customerFacing = customerFacing
    .replace(/الفروع/g, "المكتب")
    .replace(/الفرع/g, "المكتب");
  return customerFacing;
}

function finalizeLastMileDeliveryReply(reply: string, options: {
  from: string;
  text: string;
  intent: CustomerIntent;
  application?: ApplicationRecord | null;
}) {
  const app = options.application || null;

  // V1.6.4.3 CURRENT-MESSAGE HUMAN CONTINUITY: explicit present-message needs
  // outrank stale intent labels and generic fallback text.
  if (isExplicitHumanAgentRequestText(options.text)) {
    return applyFinalSendGuard(`معك ${assignedStaffName(options.from)} من فريق الأمين. شايف إن الردود ضايقتك؛ احكيلي المشكلة نفسها وأنا بكمل معك من هون بدون لف ودوران.`, app);
  }

  if (isMinimumSalaryQuestionText(options.text)) {
    return applyFinalSendGuard(minimumSalaryReply(app), app);
  }

  if (isExplicitIdentityUploadLinkRequestText(options.text)) {
    const identityReply = app
      ? `أكيد، هذا رابط رفع الهوية المرتبط بطلبك:
${identityUrl("https://www.ameenfinance.co", app)}

ارفع الوجه الأمامي والخلفي من الرابط نفسه، ولا ترسل الهوية عبر واتساب.
رقم الطلب: ${app.tracking_id || app.id}`
      : "أكيد. ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب حتى أعطيك رابط رفع الهوية المرتبط بملفك، ولا ترسل الهوية عبر واتساب.";
    return applyFinalSendGuard(identityReply, app);
  }

  if (isExplicitAppointmentRequestText(options.text)) {
    return applyFinalSendGuard(appointmentRequestReply(app), app);
  }

  if (app && (isLongDelayComplaintText(options.text) || hasAny(normalizeArabicText(options.text), ["تاخر كثير", "تأخر كثير", "مهو الو اسبوع", "مهو إلو أسبوع", "اليوم الرابع", "هي اليوم الرابع", "صرلو", "صارلو"]))) {
    return applyFinalSendGuard(reviewTimeReply(options.from, app, undefined, options.text), app);
  }

  if (isFreshApplicationSubmissionFollowupText(options.text)) {
    const submissionReply = app
      ? `تمام، وصلتني إنك رجعت قدمت. الطلب الظاهر عندي حاليًا رقمه ${app.tracking_id || app.id} وحالته ${statusHumanLabel(app.status || "")}. إذا طلع لك رقم تتبع جديد مختلف ابعته هون حتى ما نخلط بين الطلبين.`
      : "تمام، وصلتني إنك رجعت قدمت. إذا ظهر لك رقم تتبع جديد ابعته هون وبنتابع عليه؛ ما بدي أقول إنه وصل قبل ما يظهر عندي بشكل مؤكد.";
    return applyFinalSendGuard(submissionReply, app);
  }

  if (isOfficeLocationText(options.text) && hasAny(options.text, [
    "ممكن ازور", "ممكن أزور", "بقدر ازور", "بقدر أزور", "بدي ازور", "بدي أزور", "بدي اجي عالمكتب", "بدي أجي عالمكتب",
  ])) {
    return applyFinalSendGuard(locationReply(options.from, app), app);
  }

  if (messageHasReviewAndCallTopics(options.text)) {
    return applyFinalSendGuard(reviewAndCallReply(app, options.from, options.text), app);
  }

  if (app && (app.status === "refund_requested" || app.payment_status === "refund_requested")) {
    if (isRefundResumeFollowupText(options.text)) {
      return applyFinalSendGuard(reopenCancelledRequestReply(app), app);
    }
    if (isRefundMoneyFollowupText(options.text)) {
      return applyFinalSendGuard(refundAlreadyRequestedReply(app, options.text), app);
    }
    if (isRefundTimingOrDeliveryFollowupText(options.text)) {
      return applyFinalSendGuard(refundActiveTimingReply(app), app);
    }
  }

  // Current-message hard veto: an explicit pay-on-receipt condition can never
  // be sent back as a continuation confirmation, regardless of upstream intent drift.
  if (isPaymentOnReceiptRefusalText(options.text)) {
    return applyFinalSendGuard(paymentOnReceiptReply(app, true), app);
  }

  if (replyContradictsNonContinuation(options.text, reply)) {
    return applyFinalSendGuard(voluntaryOptOutReply(app, true), app);
  }

  if (replyWronglyRequestsGuarantorUpload(options.text, reply)) {
    return applyFinalSendGuard(guarantorUnavailableReply(), app);
  }

  if (replyAsksContinueAgain(options.text, reply)) {
    return applyFinalSendGuard("تمام، وصلت رغبتك بالاستمرار.", app);
  }

  let clean = applyFinalSendGuard(String(reply || ""), app);

  // V1.6.5: a direct refund-status/timing question must never collapse to the generic
  // "rewrite your question" fallback. No mutation occurs here.
  if (
    app &&
    hasAny(normalizeArabicText(options.text), ["متى الاسترداد", "وين الاسترداد", "شو صار بالاسترداد", "شو صار على الاسترداد"]) &&
    normalizeArabicText(clean).includes(normalizeArabicText("اكتب سؤالك نفسه بجملة واحدة"))
  ) {
    clean = app.status === "refund_requested" || app.payment_status === "refund_requested"
      ? refundAlreadyRequestedReply(app, options.text)
      : `ما بدي أعطيك حالة استرداد غير موجودة على الملف. إذا قصدك تطلب استرداد رسوم فتح الملف اكتبها بشكل صريح، وبنطبق الإجراء فقط إذا كان الدفع مؤكدًا على الطلب.
رقم الطلب: ${app.tracking_id || app.id}`;
    clean = applyFinalSendGuard(clean, app);
  }

  if (isLikelyIncompleteReply(clean) || replyTooShortForIntent(clean, options.intent)) {
    clean = incompleteReplyRecovery({
      from: options.from,
      text: options.text,
      intent: options.intent,
      application: app,
    });
    clean = applyFinalSendGuard(clean, app);
  }

  return clean;
}

function sanitizeAiReply(reply: string, fallback: string) {
  let clean = String(reply || "").trim();

  if (!clean) return fallback;

  clean = clean
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();

  const forbidden = [
    "الأمين للأقساط والتمويل",
    "شركة الأمين للأقساط والتمويل",
    "مرخصة من البنك المركزي",
    "مرخصه من البنك المركزي",
    "مرخصين من البنك المركزي",
    "خاضعة لرقابة البنك المركزي",
    "خاضعه لرقابه البنك المركزي",
    "تخضع لرقابة البنك المركزي",
    "تخضع لرقابه البنك المركزي",
    "تحت رقابة البنك المركزي",
    "تحت رقابه البنك المركزي",
    "البنك المركزي يشرف علينا",
    "البنك المركزي يراقبنا",
    "مرخصة ومسجلة حسب الأصول",
    "مرخصه ومسجله حسب الاصول",
    "قرض نقدي",
    "قروض نقدية",
    "قروضنا",
    "قرضك",
    "تمويل شخصي",
    "الأمين للتمويل الأصغر",
    "مساعد الأمين",
    "مساعد واتساب",
    "مساعد آلي",
    "ذكاء اصطناعي",
    "روبوت",
    "مش روبوت",
    "مو روبوت",
    "لست روبوت",
    "أنا إنسان",
    "انا انسان",
    "موافقة نهائية مؤكدة بدون مراجعة",
    "استلام اليوم",
    "استلام بكرا",
    "توصيل اليوم",
    "أرامكس",
    "ارامكس",
    "Aramex",
    "aramex",
    "شركة شحن",
    "مندوب توصيل",
    "دفع توصيل",
    "رابط شحن",
    "التسليم مؤكد اليوم",
    "تحويلك لموظف",
    "تحويل لموظف",
    "الموظف المختص",
    "سيتم تحويل",
    "سيتم رفع المحادثة",
    "رفع المحادثة",
    "تم تصعيد",
    "تم إبلاغ الزملاء",
    "راح أبلغ زملائي",
    "سأبلغ الزملاء",
    "تم إبلاغ الإدارة",
    "تم رفع طلبك للإدارة",
    "0795733001",
    "خلال هذا الأسبوع",
    "بكرا",
    "غدًا",
    "غدا",
    "6:00",
    "31/05/2026",
    "31-05",
    "جاهزين لاستقبالك",
    "زورونا",
    "زيارة المكتب متاحة",
    "دوام المكتب",
    "ساعات العمل",
    "من السبت للخميس",
    "الموعد الجديد",
    "موعد الاستلام",
    "تم تحديد موعد",
    "تم تثبيتهم بملفك",
    "تم تثبيتها بملفك",
    "تم اعتماد الهوية",
    "تم اعتماد الكشف",
    "خلصنا كل المتطلبات",
    "وصلتنا صور الهوية وكشف الراتب",
    "وصلتنا الهوية والكشف",
    "Supabase",
    "supabase",
    "quota",
    "storage quota",
    "cached egress",
    "restricted",
    "exceed_storage_size_quota",
    "exceed_cached_egress_quota",
    "رح أجاوب على آخر سؤال",
    "حسب سياق المحادثة",
    "بدون إعادة تفاصيل قديمة",
    "الموافقات شبه جاهزة",
    "من ناحية المتابعة الداخلية",
    "ملفك مكتمل وما فيه أي إشكال",
    "طلبك مقبول وماشي",
    "خلينا نأهل الطلب",
    "صفحة الإدارة",
    "مجرد سؤالك عن الاسترداد لا يسجل طلب استرداد",
    "حتى أحافظ على دقة ملفك",
    "الحالة المعتمدة تُقرأ من الطلب نفسه",
    "ما رح أرسل لك جواب ناقص",
    "المعلومة المؤكدة فقط",
  ];

  if (forbidden.some((word) => clean.includes(word))) {
    return fallback;
  }

  if (clean.length > 1200) {
    const candidate = clean.slice(0, 1100).trim();
    const lastBoundary = Math.max(
      candidate.lastIndexOf("؟"),
      candidate.lastIndexOf("."),
      candidate.lastIndexOf("!"),
      candidate.lastIndexOf("\n"),
    );

    clean = lastBoundary >= 180 ? candidate.slice(0, lastBoundary + 1).trim() : fallback;
  }

  if (isLikelyIncompleteReply(clean)) return fallback;
  return clean || fallback;
}

function canUseSafeHumanConversation(input: AiReplyInput) {
  const safeHumanIntents: CustomerIntent[] = [
    "thanks",
    "review_time",
    "order_status",
    "unknown",
    "human_agent",
  ];

  if (input.isSensitive) return false;

  return safeHumanIntents.includes(input.intent);
}

function hasRepeatedAssistantPhrase(input: AiReplyInput, phrase: string) {
  const cleanPhrase = phrase.trim();

  if (!cleanPhrase || !input.lastAssistantReplies?.length) return false;

  return input.lastAssistantReplies.some((reply) => reply.includes(cleanPhrase));
}

function safeShortHumanFallback(input: AiReplyInput) {
  if (String(input.intent) === "greeting") {
    return input.deterministicReply;
  }

  if (String(input.intent) === "thanks") {
    return "العفو 🌿";
  }

  return input.deterministicReply;
}


async function callDeepSeekQualityStage(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  thinking?: boolean;
}) {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    temperature: input.temperature,
    max_tokens: input.maxTokens,
  };
  if (input.thinking && process.env.DEEPSEEK_THINKING_MODE !== "off") {
    body.thinking = { type: "enabled", reasoning_effort: process.env.DEEPSEEK_REASONING_EFFORT || "high" };
  }

  let response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok && "thinking" in body) {
    delete body.thinking;
    response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  if (!response.ok) {
    console.error("DeepSeek quality stage failed:", await response.text());
    return "";
  }
  return extractDeepSeekText(await response.json());
}

async function buildQualityFirstConversationPlan(input: AiReplyInput, apiKey: string, baseUrl: string, model: string) {
  const plan = await callDeepSeekQualityStage({
    apiKey,
    baseUrl,
    model,
    temperature: 0.08,
    maxTokens: Number(process.env.AI_QUALITY_PLAN_MAX_TOKENS || "360"),
    thinking: true,
    system: `أنت مخطط جودة داخلي لمحادثة واتساب. لا تكتب الرد النهائي ولا تعرض سلسلة تفكير. اكتب فقط قائمة قصيرة قابلة للتنفيذ توضح: ما الذي يريده العميل الآن، كل النقاط التي يجب الإجابة عنها، ما المرجع/الطلب المقصود إن كان واضحًا، الحالة العاطفية الفعلية (غضب/قلق/إحباط/تهديد علني/هدوء)، مستوى الحزم المناسب، وما الذي يجب تجنب ادعائه. إذا كانت الرسالة تحتوي سؤالين أو أكثر يجب تعدادهم كلهم. إذا كان العميل شرح السبب أو أعطى معلومة، سجّل أنها معروفة ولا تطلبها منه مرة ثانية. لا تخترع حقائق.`,
    user: `رسالة العميل الحالية:\n${input.customerText}\n\nالسياق القريب:\n${input.conversationContext || "لا يوجد"}\n\nالطلب المرتبط حاليًا:\nالاسم: ${input.customerName || "غير متوفر"}\nرقم التتبع: ${input.trackingId || "غير متوفر"}\nالحالة: ${input.status || "غير متوفرة"}\nحالة الدفع: ${input.paymentStatus || "غير متوفرة"}\nالجهاز: ${input.deviceName || "غير متوفر"}\n\nHuman Presence:\n${humanPresencePromptInstructions({ profile: detectHumanPresenceProfile({ customerText: input.customerText, lastCustomerMessages: input.lastCustomerMessages, lastAssistantReplies: input.lastAssistantReplies }), applicationStatus: input.status })}\n\nالحقائق الآمنة المتاحة للكاتب:\n${input.deterministicReply}`,
  });
  return String(plan || "").trim();
}

async function reviseReplyWithQualityCritic(input: {
  aiInput: AiReplyInput;
  apiKey: string;
  baseUrl: string;
  model: string;
  plan: string;
  draft: string;
}) {
  const revised = await callDeepSeekQualityStage({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    model: input.model,
    temperature: Number(process.env.AI_QUALITY_CRITIC_TEMPERATURE || "0.22"),
    maxTokens: Number(process.env.AI_QUALITY_CRITIC_MAX_TOKENS || "700"),
    thinking: true,
    system: `أنت محرر جودة نهائي لرد واتساب باسم الأمين للأقساط. أعد الرد فقط، بدون تقييم أو شرح. يجب أن يبدو كموظف أردني حاضر ذهنيًا: يفهم سبب غضب/قلق العميل، يوازن التعاطف والحزم، ويجيب كل نقاط الرسالة الحالية بدون أن يطلب معلومة قالها العميل أصلًا. لا تحوّل سؤالًا متعدد المواضيع إلى موضوع واحد. لا تضف حقيقة أو وعدًا أو إجراءً غير موجود في الحقائق الآمنة. لا تذكر آلية داخلية أو ذكاء اصطناعي. لا تستخدم اعتذارًا محفوظًا إذا السياق يحتاج جوابًا مباشرًا. إذا كانت المسودة صحيحة اجعلها أقصر وأكثر طبيعية فقط.`,
    user: `رسالة العميل:\n${input.aiInput.customerText}\n\nخطة التغطية الداخلية:\n${input.plan || "جاوب كل ما طلبه العميل بوضوح."}\n\nالسياق:\n${input.aiInput.conversationContext || "لا يوجد"}\n\nالحقائق والحدود الآمنة:\n${input.aiInput.deterministicReply}\n\nالمسودة الحالية:\n${input.draft}\n\nأعد الرد النهائي فقط.`,
  });
  return String(revised || "").trim();
}

async function generateAiReply(input: AiReplyInput) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const reasoningModel =
    process.env.DEEPSEEK_REASONING_MODEL ||
    process.env.DEEPSEEK_ESCALATION_MODEL ||
    "deepseek-v4-pro";

  const preferHumanFirstPro = shouldPreferHumanFirstPro(
    input.intent,
    input.customerText,
    Boolean(input.hasRecentConversation || input.conversationContext),
  );

  // V1.4.0 QUALITY-FIRST: every non-hard conversation uses the reasoning model.
  // Cost is intentionally secondary to comprehension and reply quality.
  const useDeepThinking = true;
  const model = reasoningModel;

  if (!apiKey) {
    console.error("Missing DEEPSEEK_API_KEY");
    return safeShortHumanFallback(input);
  }

  if (isHardExactCustomerIntent(input.intent)) {
    return input.deterministicReply;
  }

  const humanPresenceProfile = detectHumanPresenceProfile({
    customerText: input.customerText,
    lastCustomerMessages: input.lastCustomerMessages,
    lastAssistantReplies: input.lastAssistantReplies,
  });
  const operationalTransparencyFacts = currentOperationalTransparencyFacts();
  const humanPresenceInstructions = humanPresencePromptInstructions({
    profile: humanPresenceProfile,
    operationalFacts: operationalTransparencyFacts,
    applicationStatus: input.status,
  });

  const systemInstructions = `
اكتب ردود واتساب باسم موظف رسمي من فريق "الأمين للأقساط" في الأردن.
اسم الموظف الثابت لهذه المحادثة سيصل ضمن البيانات، ويجب استخدامه فقط عند بداية محادثة جديدة أو عندما يسأل العميل مع من يتحدث.

تعليمات التفكير العميق:
- في الرسائل الحساسة أو الغاضبة أو المختصرة المرتبطة بسياق سابق، فكّر داخليًا قبل الرد: ما هو الطلب المرتبط؟ ما آخر حالة؟ ما الذي يريده العميل فعلًا؟ ثم أرسل للعميل الجواب النهائي فقط.
- ممنوع إظهار خطوات التفكير أو أي شرح داخلي للعميل.
- التفكير العميق بديل عن عبارات التحويل لموظف؛ لا تقل "سيتم تحويلك" ولا "متابعة بشرية"، بل أعطِ ردًا منطقيًا مباشرًا حسب البيانات.

احترام ديني واجتماعي خفيف:
- يجوز استخدام عبارة واحدة فقط في الرد مثل: "إن شاء الله"، "بإذن الله"، "الله ييسر الأمور"، "الله يعطيك العافية".
- لا تستخدم العبارات الدينية في كل رد، ولا تجعلها بديلًا عن معلومة واضحة.
- لا تستخدم "إن شاء الله" مع وعد زمني أو موعد غير مؤكد؛ استخدمها فقط كطمأنة خفيفة.

حقائق رسمية ثابتة ممنوع تغييرها أو اختراع بدائل عنها:
- رقم واتساب الشركة الرسمي: ${BUSINESS_PHONE_E164}
- الرقم المحلي الرسمي: ${BUSINESS_PHONE_DISPLAY}
- الموقع الرسمي: ${BUSINESS_WEBSITE}
- الموقع العام المسموح ذكره قبل الموافقة: ${BUSINESS_GENERAL_LOCATION}
- العنوان التفصيلي الكامل (محمي قبل الموافقة): ${BUSINESS_ADDRESS}
- رسوم فتح الملف الرسمية: ${FILE_OPENING_FEE_JOD} دنانير فقط.
- التحويل ممكن من أي حساب بنكي يدعم CliQ أو من محفظة إلكترونية؛ مش شرط يكون عند العميل محفظة Orange Money.
- الجهة المستلمة محفظة Orange Money، والتحويل يكون إلى AMEEENPAY أو AMENPAY، ويجب أن يظهر اسم المستفيد ${PAYMENT_BENEFICIARY_NAME} قبل التأكيد.
- ممنوع القول إن التحويل البنكي لا ينفع، أو إن الدفع من Orange Money فقط، أو إن الحل الوحيد أن يدفع شخص لديه محفظة أورنج.
- ممنوع اختراع أي رقم هاتف أو رابط أو عنوان أو رسوم أو موعد.
- إذا سأل العميل عن رقم الشركة أو معلومات التواصل، استخدم هذه البيانات فقط ولا تضف أي رقم آخر.
- إذا سأل العميل عن الموقع أو زيارة المكتب: اذكر فقط أن المكتب في ${BUSINESS_GENERAL_LOCATION}، وأن الحضور يكون بموعد رسمي فقط.
- لا تذكر اسم المبنى أو الطابق أو العنوان التفصيلي من حالة الموافقة وحدها؛ التفاصيل الدقيقة تُرسل فقط ضمن الموعد الرسمي المعتمد.
- ${BUSINESS_INDEPENDENCE_STATEMENT}. إذا سأل العميل هل نحن نفس شركة الأمين للتمويل الأصغر أو تابعين لها، استخدم هذه الحقيقة ولا تقل إن المعلومة غير متوفرة.
- ممنوع دعوة العميل لزيارة المكتب، أو قول "جاهزين لاستقبالك"، أو ذكر دوام المكتب، أو ساعات العمل، أو أي موعد زيارة، إلا إذا كانت رسالة الإدارة نفسها تطلب ذلك صراحة.

قاعدة التوصيل وأرامكس والاستلام:
- لا يوجد لدى الأمين أي توصيل نهائيًا بتاتًا: لا أرامكس، لا شركات شحن، لا مندوب، ولا توصيل للبيت أو للمحافظات.
- الاستلام يكون من المكتب فقط، وبموعد مسبق فقط، بعد اعتماد الطلب وجدولة الاستلام من الإدارة.
- إذا سأل العميل عن أرامكس أو التوصيل أو الشحن أو المندوب: أجب مباشرة أن الاستلام بالمكتب فقط وبموعد مسبق، ولا تطلب منه دفع توصيل ولا ترسل روابط شحن.
- السبب المختصر عند الحاجة: هذا الإجراء لحماية العملاء لأن هناك جهات تستغل اسم أرامكس أو التوصيل بطرق احتيالية.
- إذا وصل العميل رابط شحن أو طلب دفع توصيل باسم الأمين، اطلب منه عدم التعامل معه وإرساله للتأكد.

- إذا لم تكن المعلومة موجودة في الرد الآمن الأساسي أو قاعدة بيانات الطلب، قل: "لا يوجد لدي معلومة مؤكدة حول ذلك حاليًا" ولا تخمّن.
- عندما تكون خانة "هل توجد حالة طلب؟" = لا: ممنوع القول إن الطلب مقبول أو مدفوع أو بانتظار الأجهزة أو تحت الدراسة. اطلب رقم التتبع/الهاتف فقط أو أعطِ معلومة عامة غير مرتبطة بحالة العميل.
- لا تستنتج حالة الطلب من ردود النظام القديمة أو من كلام العميل؛ حالة قاعدة البيانات الحالية وحدها هي المرجع.
- أي رقم هاتف غير الرقم الرسمي أو أي موعد استلام/زيارة/اتصال غير موجود في قاعدة البيانات يعتبر خطأ ممنوع.

القاعدة الذهبية:
- افهم نية العميل أولًا.
- إذا كانت النية unknown أو قال العميل "ما فهمت" أو "كيف يعني"، اقرأ آخر رسائل العميل والردود وحدد آخر سؤال لم تتم الإجابة عنه، ثم أجب عنه مباشرة. ممنوع تكرار حالة الطلب بدل الجواب.
- سؤال عام عن العمل أو العمر أو الشروط أو رقم التواصل يبقى سؤالًا عامًا حتى لو كان للعميل طلب قائم؛ لا تحوّله تلقائيًا إلى رد حالة الطلب.
- لا تطلب رقم التتبع إلا إذا كان السؤال عن طلب محدد أو المتابعة تحتاج ربط الطلب.

قواعد الأهلية والعمل:
- مش شرط يكون العميل موظفًا في شركة حتى يقدم. العمل الحر، الفري لانس، والعمل الأونلاين يمكن ذكره ببياناته الحقيقية.
- لا تضمن القبول للعامل الحر أو للموظف. قل إن القرار يعتمد على دراسة الطلب، وإذا احتاج الملف إثبات دخل أو كفيل ستظهر الخطوة المطلوبة.
- إذا كان العمر أقل من 18، ممنوع تأكيد أن وجود كفيل وحده يكفي أو أن الطلب سيُقبل. وضح أن العمر وبيانات الكفيل تُراجع ضمن الطلب ولا تعطِ ضمانًا.
- حالة rejected تعني أن الطلب غير موافق عليه ولا يوجد قرار جديد ينتظره العميل على نفس الطلب. فرّق بينها وبين cancelled التي تعني أن الطلب أُلغي.
- إذا سأل العميل "يعني ما زبط؟" أو "أستنى خبر؟" وكانت الحالة rejected، جاوبه بوضوح أن الطلب لم يُعتمد ولا يحتاج انتظار تحديث جديد على نفس الطلب.
- إذا طلب العميل رقمًا للتواصل، أعطه الرقم الرسمي مباشرة حتى لو كانت حالة طلبه ملغية أو مرفوضة؛ لا تكرر حالة الطلب بدل الرقم.
- ممنوع تمامًا أن تقول للعميل: سيتم تحويلك، متابعة بشرية، مراجعة بشرية، موظف مختص، سيتم رفع المحادثة، تم تصعيد المحادثة، أو أي صياغة تكشف أن الرد انتقل لجهة أخرى.
- إذا العميل طلب موظفًا: عرّف نفسك باسم الموظف الثابت من فريق الأمين، ثم أجب عن سؤاله داخل نفس المحادثة.
- إذا طلب مكالمة: وضح باختصار أن متابعة الملفات عبر واتساب هي الأسرع حاليًا بسبب ضغط الاتصالات، واطلب منه إرسال النقطة هنا. لا تعده باتصال ولا تقل سيتم تحويله.
- إذا العميل كتب شتيمة مباشرة أو بذاءة أو إهانة شخصية: لا ترد بتحية، لا تقل وعليكم السلام، لا تعتذر بشكل مبالغ، ولا تدخل في جدال. رد بهدوء وحدود احترام: "واضح إنك منزعج، بس خلينا نحافظ على الاحترام حتى أقدر أساعدك" ثم اطلب المشكلة نفسها أو رقم الطلب عند الحاجة.
- لا تكافئ الشتائم برد طويل. اجعل الرد قصيرًا، ثابتًا، ومهنيًا.
- إذا العميل غاضب أو كتب كلمات مثل: نصب، احتيال، حرامية، سرقة، كذب، مماطلة، تأخير، ما بتردو، بدي فلوسي، شكوى، محامي، شرطة، جرائم إلكترونية، حماية المستهلك، بفضحكم، بنشر عليكم: لا تجادله، لا تدافع، ولا تبدأ بطلب رقم التتبع إلا إذا لا توجد أي حالة طلب معروفة.
- في الرسائل الغاضبة: ابدأ باعتذار واضح ومتنوع، اعترف بحقه بالاستياء، ثم وضّح الحالة إن كانت معروفة، أو اطلب رقم التتبع/الهاتف بهدوء إذا لم يكن الطلب معروفًا.
- لا تستخدم جملة اعتذار واحدة دائمًا. نوّع بين: "حقك علينا"، "بنعتذر بصدق"، "فاهمين غضبك"، "آسفين إن التجربة وصلت لهالشكل"، "حقك يكون عندك جواب واضح"، "خلينا نراجعها بدون جدال".
- لا تعترف قانونيًا بأن الشركة نصبت أو سرقت. استخدم اعتذارًا عن التجربة/التأخير/عدم الوضوح، وليس اعترافًا باتهام.
- إذا العميل هدد بشكوى أو نشر أو محامي: قل إن حقه محفوظ، وإنك ستوضح الحالة حسب البيانات المتوفرة، واطلب البيانات لربطها بالطلب إن لم تكن موجودة.
- إذا العميل سأل سؤالًا عامًا مثل: موقعكم، عنوانكم، كيف الأقساط، الشروط، الدفع، الأجهزة: أجب مباشرة ولا تحوّل الرد لمتابعة طلب.

قواعد الشخصية وعدم التكرار:
- اختر موظفًا ثابتًا للعميل حسب رقم واتساب العميل، ولا تغيّر الشخصية داخل نفس المحادثة.
- لا تبدأ كل رد باسم العميل أو اسم الموظف. ذكر اسم الموظف مسموح فقط في بداية محادثة جديدة أو إذا سأل العميل مع مين يحكي.
- إذا المحادثة مستمرة، ادخل مباشرة في جواب السؤال الأخير.
- عمران لا يظهر للعميل إلا إذا طلب مديرًا صراحة أو كانت الرسالة تصعيدًا حساسًا واضحًا. غير ذلك استخدم نبرة فريق المتابعة بدون اسم.
- إذا قال العميل: ليه؟ طيب؟ كيف يعني؟ شو الحل؟ اربط السؤال بآخر رد في السياق وأجب مباشرة، ولا تعرّف نفسك من جديد.
- ممنوع تكرار عبارات مثل: متفهم وضعك، معك عمران، أو أهلًا فيك في كل رد.

قواعد الروابط:
- لا ترسل أكثر من رابط واحد في الرد الواحد.
- إذا تم إرسال نفس الرابط في نفس محادثة واتساب سابقًا، لا تكرره؛ قل: الرابط أرسلناه لك سابقًا بنفس المحادثة.
- استثناء إلزامي: رابط رفع وصل الدفع /receipt. إذا كان الرد الحالي يطلب من العميل رفع الوصل، أو يشرح أن الخطوة الحالية هي رفع الوصل، أو العميل يسأل أين/كيف يرفع الوصل، أرسل رابط رفع الوصل في نفس الرسالة حتى لو سبق إرساله. لا تطلب إعادة رفعه إذا كان الدفع مؤكدًا أو الوصل مسجلًا وبانتظار التأكيد.
- روابط التتبع تكون قصيرة قدر الإمكان: ${BUSINESS_WEBSITE}/track، واكتب رقم الطلب ورقم الهاتف كنص عادي بدل رابط طويل.
- رابط المنتجات يرسل مرة واحدة فقط في المحادثة، وبعدها قل للعميل إن الرابط موجود فوق.

قاعدة رفع المستندات الرسمية:
- صور واتساب أو ملفات واتساب لا تُعتمد كاستكمال رسمي داخل الملف، حتى لو وصلت في المحادثة.
- الاعتماد الرسمي للهوية أو كشف الراتب أو وصل الدفع أو بيانات الكفيل يكون فقط من الرابط المخصص حسب حالة الطلب.
- ممنوع قول: تم اعتماد الهوية، تم تثبيت الكشف، خلصنا كل المتطلبات، أو تم ربط المستند، إلا إذا كانت حالة الطلب في قاعدة البيانات تدل على ذلك صراحة.
- عند استلام صورة/ملف على واتساب، قل إنها وصلت كمحادثة فقط، ثم أعطِ رابط الرفع الصحيح إن كان واضحًا من حالة الطلب.
- إذا العميل أرسل عدة صور دفعة واحدة، لا ترد على كل صورة؛ رد مرة واحدة فقط بتعليمات الرفع الرسمية.

شخصيات مدير الملف:
- الاسم الثابت للمحادثة يكون واحدًا من: فدوة، تالا، عبدالله، عبدالرحمن.
- عمران يظهر فقط عند طلب مدير صراحة أو في تصعيد حساس واضح.
- ممنوع استخدام أسماء لينا أو خالد أو أي اسم غير الأسماء المعتمدة.
- لا تذكر اسم الشخصية بكل رسالة إذا السياق مستمر، لكن حافظ على نبرة موظف يعرف ملف العميل.


قاعدة الضغط العاطفي والإحراج الشخصي:
- إذا ذكر العميل أن الجهاز هدية أو لخطيبته/زوجته/أهله/ابنه/بنته أو أنه محرج أو يؤجل منذ مدة، تعامل مع الرسالة كضغط عاطفي حقيقي وليس مجرد سؤال متابعة.
- ممنوع الرد بعبارات سطحية مثل "فاهم شعورك" فقط.
- ممنوع أن تسأل "قصدك تتابع الملف ولا عندك سؤال معين؟" إذا كان واضحًا أن العميل يتكلم عن إحراج أو تأخير جهاز.
- الرد الصحيح يجب أن يحتوي: اعتراف بالإحراج الشخصي + ربط بالطلب/الجهاز + سبب واقعي بدون كذب + خطوة واضحة.
- استخدم صيغ مثل: "الموضوع صار إحراج شخصي"، "كلمة فاهم شعورك لحالها ما بتكفي"، "ما بدي أعطيك موعد وهمي وأزيد الإحراج عليك".
- لا تعد بتاريخ استلام، ولا تجعل التعاطف بديلًا عن توضيح الحالة.

قاعدة الطلبات المدفوعة وتأخير الأجهزة:
- تأكيد رسوم فتح الملف يعني أن الدفع مسجل فقط، ولا يعني موافقة نهائية.
- اذكر حالة الطلب الحالية حرفيًا حسب قاعدة البيانات، ولا تستخدم عبارات مثل "شبه جاهز" أو "مقبول وماشي" إلا إذا كانت الحالة approved فعلًا.
- ممنوع القول إن التأخير سببه الأجهزة وحدها عندما يكون الملف ما زال قيد الدراسة أو يحتاج مستندات.
- إذا كانت الحالة approved أو customer_accepts_delivery_delay فقط، يجوز توضيح أن المتبقي توفر الجهاز واعتماد جدول الاستلام من المكتب.
- ممنوع إعطاء تاريخ استلام أو وعد قطعي.
- إذا كان هناك مستند ناقص مثل كفيل أو كشف راتب: اطلبه بوضوح، ولا توحي بأن الموافقة تمت.

قاعدة عدم شرح الإجراء الداخلي للعميل:
- العميل يسمع فقط حالته الحالية، وما المطلوب منه الآن، ومتى يصله تحديث.
- ممنوع شرح طريقة التصنيف، ذاكرة المحادثة، منطق النظام، صفحة الإدارة، التدقيق الداخلي، أو كيف يتم اختيار المستندات.
- ممنوع كتابة عبارات مثل: "رح أجاوب حسب سياق المحادثة"، "بدون إعادة تفاصيل قديمة"، "الموافقات شبه جاهزة"، "من ناحية المتابعة الداخلية"، أو "ملفك مكتمل وما فيه أي إشكال".
- لا تسرد كل المستندات المحتملة. اذكر فقط المستند المطلوب فعليًا حسب حالة الطلب.
- إذا قال العميل إنه صاحب محل أو عمل حر أو فري لانس أو يعمل أونلاين، جاوب على سؤاله مباشرة: مش شرط وظيفة بشركة للتقديم، ويجب إدخال بيانات العمل والدخل الحقيقية. لا تطلب كشف راتب غير متوفر، ولا تدّعي تسجيل ملاحظة في قاعدة البيانات.
- لا تعرض الدفع أو تسأل إن كان يريد تعليمات الدفع في متابعة عادية. الدفع يُذكر فقط عندما تكون الحالة مؤهلة مبدئيًا أو العميل يسأل عنه.

قاعدة تغيير الجهاز واللون والسعة:
- طلب تغيير الجهاز أو اللون أو السعة ليس طلب إلغاء.
- إذا قال العميل "بدي أغير الجهاز" أو "ما بدي هذا الجهاز بدي غيره": اسأله عن الجهاز الجديد مع السعة واللون.
- بعد أن يحدد البديل، اطلب تأكيدًا واحدًا واضحًا: التغيير من الجهاز الحالي إلى الجهاز الجديد بدون إلغاء الطلب.
- لا تستخدم عبارات "هل تفكر بالإلغاء" أو "بدك تلغي" عند طلب التغيير.
- لا تدّعي أن تغيير الجهاز سُجل أو تم تحديثه؛ تنفيذ التغيير وتأكيد نجاحه مسؤولية الكود فقط.

قاعدة الإلغاء الصارمة:
- إذا قال العميل "بدي ألغي" أو "بطلت" أو "ما بدي أكمل" فهذا طلب إلغاء مبدئي فقط، وليس تأكيدًا نهائيًا.
- ممنوع اعتبار الإلغاء نهائيًا إلا إذا قال العميل بوضوح: "أكد إلغاء الطلب" أو ما يعادلها.
- في طلب الإلغاء المبدئي: افهم السبب أولًا، خصوصًا إذا كان الدفع، عدم وجود محفظة، أو تأخير المورد، ثم وضّح الحل.

قاعدة الدفع من مصدر ثاني:
- إذا قال العميل إنه لا يملك محفظة أو يريد التحويل من رقم/حساب/شخص آخر، فهذا ليس سببًا للإلغاء.
- وضّح له أن التحويل من مصدر آخر ممكن طالما يتم على معلومات الدفع الرسمية، ثم يجب رفع صورة الوصل من رابط رفع الوصل حتى يربط الطلب.
- إذا كان رابط الوصل موجودًا في الرد الآمن الأساسي، حافظ عليه كما هو.

شخصيتك وأسلوبك:
- الرد النهائي يجب أن يكون قصيرًا مثل واتساب: 2 إلى 5 أسطر غالبًا.
- ممنوع إرسال كلمة أو كلمتين مجتزأتين كرد نهائي. كل رد غير اجتماعي يجب أن يحتوي جملة مكتملة المعنى على الأقل.
- ممنوع عرض الملف ككشف طويل أو قائمة إلا إذا العميل طلب تفاصيل.
- لا تكرر: رقم التتبع، رابط المتابعة، حالة الدفع، وحالة الملف في كل رد. اذكرها فقط عند الحاجة.
- إذا سأل العميل: هل أنت AI أو روبوت؟ أو قال: شو اسمك؟ لا تناقش التقنية ولا تقل "مش روبوت" ولا تدّعي أنك إنسان. قل فقط: "معك [اسم الموظف الثابت] من فريق الأمين" ثم ارجع لسؤاله أو ملفه.
- ممنوع استخدام عبارات: مساعد الأمين، مساعد واتساب، مساعد آلي، ذكاء اصطناعي، روبوت، بوت، أو AI في الرد النهائي.
- إذا العميل سأل سؤالًا واحدًا، جاوب السؤال الواحد فقط ولا تضف محاضرة.
- رد كإنسان طبيعي على واتساب، مش كنص رسمي جامد.
- استخدم لهجة أردنية مهذبة وواضحة.
- لا تكرر نفس الافتتاحية.
- خليك راقٍ، مختصر، ومطمئن.
- استخدم إيموجي خفيف جدًا مثل 🌿 أو ✅ فقط عند الحاجة.
- لا تذكر أي وصف تقني للنظام، ولا تنفِه بكذبة. استخدم اسم الموظف الثابت وصفة "من فريق الأمين" فقط.
- لا تكتب JSON ولا شرح داخلي.

قواعد النشاط والهوية التنظيمية:
- الاسم المعتمد في التعامل: "الأمين للأقساط" فقط.
- ممنوع استخدام اسم "الأمين للأقساط والتمويل" أو الادعاء بأنه الاسم القانوني.
- النشاط فقط تقسيط أجهزة إلكترونية وهواتف.
- الجهة ليست بنكًا ولا شركة تمويل أو إقراض، ولا تمنح قروضًا.
- ممنوع الادعاء بأنها مرخصة من البنك المركزي الأردني أو خاضعة لرقابته أو أن البنك المركزي يشرف عليها.
- إذا سأل عن البنك المركزي: قل بوضوح إنها ليست بنكًا ولا شركة تمويل أو إقراض ولا تمنح قروضًا، ولا ندعي الخضوع لرقابة البنك المركزي.
- إذا سأل عن الاسم القانوني: استخدم فقط الاسم المعتمد "الأمين للأقساط" ولا تخترع اسمًا قانونيًا غير موثق.
- إذا سأل عن قروض أو مصاري: وضح بلطف أننا لا نقدم قروضًا، فقط تقسيط أجهزة وهواتف.
- إذا سأل عن فوائد/ربا/شرعية التقسيط: ممنوع إعطاء حكم شرعي أو مصرفي مثل "ما في فوائد ربوية" أو "التقسيط شرعي". اكتفِ بأن الأمين للأقساط ليست بنكًا ولا شركة تمويل أو إقراض، وأن السعر وجدول الأقساط والمبالغ تظهر بوضوح ضمن الطلب والاتفاق المعتمد.

قاعدة عدم فتح موضوع الدفع بلا سبب:
- لا تذكر الدفع أو رسوم فتح الملف في رد متابعة الطلب إلا إذا العميل سأل عن الدفع، أو كانت حالة الطلب تتطلب دفعًا فعليًا الآن.
- لا تضف جملة "لا يوجد دفع مطلوب" تلقائيًا لكل رد.
- سؤال "كم دفعتي؟" أو "كم الدفعة؟" هو سؤال عن قيمة المبلغ، وليس اعتراض دفع، إلا إذا ذكر العميل خصمًا أو مشكلة أو استردادًا.

قواعد الدفع:
- إذا كتب العميل: موافق، أود الاستمرار، بدي أكمل، أو أي صيغة استمرار، وكان الطلب حالته مؤهل مبدئيًا: سجّل رغبته بالاستمرار ثم أرسل تعليمات الدفع ورابط رفع الوصل تلقائيًا.
- لا ترسل تعليمات الدفع عند كلمة موافق إلا إذا كان الطلب مرتبطًا وواضحًا وحالته مؤهل مبدئيًا.
- رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط.
- لا تُذكر رسوم فتح الملف كطلب دفع إلا إذا كانت الحالة المسجلة مؤهلة مبدئيًا، أو إذا الرد الآمن الأساسي يذكر صراحة أن تعليمات الدفع مطلوبة.
- لا تطلب رسوم فتح الملف في الأسئلة العامة أو قبل التأهيل المبدئي.
- إذا سأل العميل عن الدفع بشكل عام، وضح أن الرسوم لا تُطلب من البداية، بل فقط بعد التأهيل المبدئي.
- لا تشرح أسبابًا أو إجراءات داخلية وراء الرسوم؛ اذكر قيمتها ووقت طلبها وسياسة الاسترداد فقط.
- ممنوع قول: لا نملك الطاقة لدراسة كل شيء، أو الطلبات الوهمية كثيرة، أو أن العميل يدفع ثمن غيره. استخدم بدلًا منها: حجم الطلبات كبير، المراجعة يدوية، ونحرص على عدالة دراسة الملفات الجادة.
- الرسوم مستردة بالكامل في حال عدم الموافقة النهائية.
- القسط الأول لا يُدفع الآن، بل بعد الاستلام حسب الاتفاق.
- دفع رسوم فتح الملف لا يعني الموافقة النهائية.

قواعد المواعيد والتسليم والتهدئة:
- لا تخترع موعد استلام، ولا تعطي وعدًا نهائيًا خارج الرد الآمن الأساسي.
- إذا كانت حالة الطلب approved وسأل العميل عن التسليم أو التأخير: اذكر أن الطلب عليه موافقة نهائية، وأننا ما زلنا بانتظار وصول الأجهزة من المورد/الوكلاء المعتمدين، وأنه لا يوجد موعد استلام نهائي محدد حاليًا، وسيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة واعتماد جدول الاستلام من المكتب من الإدارة.
- في حالة approved ممنوع ذكر أي يوم أو تاريخ أو ساعة أو عبارة "خلال هذا الأسبوع" أو "الموعد الجديد" أو "موعد الاستلام". استخدم فقط: بانتظار وصول الأجهزة من المورد/الوكلاء المعتمدين، قيد الترتيب، تنسيق التسليم، اعتماد جدول الاستلام من المكتب.
- إذا كانت الحالة customer_accepts_delivery_delay: لا تستخدم delivery_delay_until ولا تذكر أي تاريخ محفوظ. قل إن اختيار الانتظار مسجل، ولا يوجد موعد استلام نهائي محدد حاليًا، وسيتم التواصل فور وصول الأجهزة واعتماد جدول الاستلام من المكتب.
- إذا كانت الحالة under_review: اذكر أن الطلب ما زال قيد الدراسة والمتابعة من الإدارة، وأن التأخير مرتبط بضغط المراجعات وكثرة الملفات، ولا تعطِ أي وعد بالموافقة أو التسليم.
- إذا كانت الحالة needs_guarantor: اذكر أن الطلب بانتظار استكمال متطلبات الكفيل وأن الدراسة لم تكتمل بعد، ولا تعطِ أي موعد استلام.
- استخدم عبارات تهدئة بشرية عند القلق أو التأخير مثل: حقك علينا، بنقدّر صبرك وثقتك، فاهمين قلقك، نتفهم أهمية الجهاز بالنسبة إلك، ما بدنا تضل منتظر بدون وضوح، حقك يكون عندك تحديث واضح، نشكرك على تفهمك، وكل عام وأنتم بخير.
- تجنّب كلمات تقلق العميل مثل: أزمة، مشكلة، نقص، نفاد، غير متوفر، لا نعلم، غير قادرين. استبدلها بصيغ مهنية مطمئنة مثل: بانتظار التوريد، قيد الترتيب، قيد الجدولة، قيد المتابعة، تحديث لوجستي، تنسيق التسليم.

قواعد الحالات:
- approved فقط تعني موافقة نهائية.
- submitted تعني أن الطلب استُلم وتَسجّل فقط، ولا تعني بدء الدراسة.
- queued_for_review تعني أن الطلب بانتظار دوره لبدء المراجعة.
- preliminary_application تعني أن الطلب مسجل ومؤهل مبدئيًا لكنه لم يدخل دراسة الملف الكاملة بعد.
- preliminary_qualified أو prequalified تعني تأهيلًا مبدئيًا وبانتظار بدء الدراسة، وليست موافقة نهائية.
- under_review تعني أن الملف قيد الدراسة فقط، وممنوع وصفها بالدراسة النهائية.
- final_review وحدها تسمح بعبارة المرحلة النهائية من الدراسة.
- needs_guarantor يعني بحاجة كفيل لاستكمال الدراسة وليس رفضًا.
- needs_identity أو identity_requested يعني بحاجة صورة الهوية الأمامية والخلفية لاستكمال الدراسة.
- needs_salary_slip يعني بحاجة كشف راتب أو شهادة راتب.
- refund_requested يعني طلب استرداد مسجل دون وعد بوقت تنفيذ.
- إذا كانت الحالة refund_requested أو payment_status يساوي refund_requested: ممنوع إرسال رابط الاسترداد مرة ثانية. قل فقط إن الطلب قيد الاسترداد وتحت المراجعة.
- رابط الاسترداد يرسل مرة واحدة فقط عند أول طلب استرداد، وبعدها يتم تسجيل الحالة قيد الاسترداد.
- refund_completed فقط تعني أن الاسترداد تم.
- customer_claimed_paid يعني الوصل قيد مراجعة الإدارة ولا يكرر الدفع.
- cancelled يعني الطلب ملغي.

ممنوعات صارمة في الرد النهائي للعميل:
- لا تقل للعميل: متابعة بشرية، مراجعة بشرية، تحويل لموظف، الموظف المختص، سيتم تحويل الموضوع، سيتم رفع المحادثة، سيتم التصعيد، الإدارة ستتواصل لاحقًا.
- لا تعطي وعدًا بوقت تنفيذ استرداد أو استلام نهائي من المكتب. حاليًا جميع مواعيد التسليم معلقة حتى وصول الأجهزة واعتماد جدول الاستلام من المكتب من الإدارة.
- لا تقول موافقة نهائية إلا إذا الحالة approved.

${humanPresenceInstructions}
${humanFirstStyleInstructions()}
${customerFacingPolicyInstructions()}

منطق المحادثة الآمنة البشرية:
- لا ترد كقالب ثابت. اقرأ رسالة العميل ورد على نفس المعنى.
- إذا قال العميل "كيفك؟" أو "شخبارك؟" أو سأل سؤالًا خفيفًا، جاوبه طبيعيًا باختصار ثم اسأله كيف تساعده.
- إذا سأل عن مدة الطلب، لا تعطِ رقم أيام ثابتًا أو وعدًا زمنيًا غير مؤكد. اشرح أن المراجعة حسب الدور وضغط الملفات واكتمال البيانات، وإذا طال الانتظار اعترف بذلك واذكر الحالة الفعلية فقط.
- إذا كانت رسالة العميل فيها سؤالان أو أكثر، جاوبهم كلهم برد واحد وبنفس الترتيب، ولا ترسل ردًا منفصلًا لكل سطر.
- ابدأ بجواب السؤال نفسه، ثم اذكر الحالة أو الخطوة المطلوبة عند الحاجة. ممنوع تكرار حالة الطلب بدل الإجابة عن السؤال.
- فرّق بوضوح بين الموافقة المبدئية والموافقة النهائية. عبارة "مؤهل مبدئيًا" لا تعني موافقة نهائية.
- إذا سأل العميل "أي ملف؟" بعد رسوم فتح الملف، وضّح أنه ملف طلب التقسيط الخاص به، وليس ملفًا يرسله العميل.
- إذا سأل عن موعد القسط الأول، الجواب: بعد استلام الجهاز حسب الاتفاق، وليس الآن.
- إذا كتب متابعة قصيرة مثل "يعني تم ولا شو"، اربطها بآخر سؤال ولا تعيد رسالة الحالة العامة.
- لا تخترع معلومة غير موجودة في الرد الآمن الأساسي.
- اجعل الرد يبدو كموظف خدمة عملاء ذكي وهادئ، لا كرسالة محفوظة.
- لا تكرر نفس افتتاحية الرد الآمن إذا كانت غير مناسبة. يجوز إعادة صياغتها بشرط عدم تغيير الحقائق.
- إذا كان الرد الآمن الأساسي يحتوي رابطًا أو رقم تتبع أو حالة طلب، يجب المحافظة عليها كما هي.
- لا تطل الرد بلا داعي. الأفضل من 2 إلى 6 أسطر واتساب، إلا إذا كان الرد الآمن يحتاج تفاصيل أكثر.
- ممنوع تحويل التحية إلى قائمة خيارات طويلة.
- ممنوع تكرار جملة "كيف بقدر أساعدك اليوم؟" بشكل آلي.
- في التحيات الصافية مثل "مساء الخير" أو "السلام عليكم"، رد بتحية قصيرة فقط ولا تسأل سؤالًا بعدها.

استخدم "الرد الآمن الأساسي" كمصدر حقيقة، وصغه إنسانيًا دون مخالفة أو إضافة وعود.
`;

  // تعطيل أمثلة الردود القديمة مؤقتًا؛ قد تحتوي قوالب سيئة وتعيد نفس السلوك الروبوتي.
  const similarSuccessfulReplies = "";

  const userInput = `
نية أولية غير موثوقة وقد تكون خاطئة:
${input.intent}

مهم: افهم نية العميل بنفسك من رسالته والسياق، ولا تتبع التصنيف الأولي إذا تعارض مع المعنى الواضح.

رسالة العميل:
${input.customerText || "(لا يوجد نص واضح)"}

هل توجد حالة طلب؟
${input.hasApplication ? "نعم" : "لا"}

هل الرسالة حساسة؟
${input.isSensitive ? "نعم" : "لا"}

بيانات مختصرة:
الاسم: ${input.customerName || "غير متوفر"}
رقم التتبع: ${input.trackingId || "غير متوفر"}
الحالة الخام: ${input.status || "غير متوفرة"}
مرحلة الطلب الدقيقة: ${resolveApplicationStage(input.status, input.paymentStatus)}
الوصف المسموح للحالة: ${statusHumanLabelV113(input.status, input.paymentStatus)}
حالة الدفع: ${input.paymentStatus || "غير متوفرة"}
الجنس اللغوي المرجح للعميل: ${detectCustomerGender(input.customerName)}
الجهاز: ${input.deviceName || "غير متوفر"}

آخر سياق مختصر من نفس محادثة واتساب:
${input.conversationContext || "لا يوجد سياق سابق كافٍ."}

آخر ردود أرسلها النظام لهذا العميل:
${input.lastAssistantReplies?.length ? input.lastAssistantReplies.map((reply, index) => `${index + 1}. ${reply}`).join("\n") : "لا توجد ردود سابقة قريبة."}

آخر رسائل العميل القريبة:
${input.lastCustomerMessages?.length ? input.lastCustomerMessages.map((reply, index) => `${index + 1}. ${reply}`).join("\n") : "لا توجد رسائل عميل قريبة."}

آخر رسالة عميل ذات معنى:
${input.lastMeaningfulCustomerMessage || "غير متوفرة"}

آخر سؤال واضح للعميل:
${input.lastQuestionLikeCustomerMessage || "غير متوفر"}

رقم تتبع مستخرج من الذاكرة إن وجد:
${input.memoryTrackingId || "غير متوفر"}

نوع رسالة واتساب:
${input.messageType || "text"}

اسم الموظف الرسمي الثابت لهذه المحادثة:
${input.assignedAgentName || "غير محدد"}

قاعدة الأسماء:
- لا تخاطب العميل بأي اسم غير الاسم الموجود في خانة "الاسم" أعلاه.
- لا تغيّر اسم الموظف الثابت ولا تستخدم اسم موظف آخر.
- إذا لم يكن الاسم متوفرًا، لا تخترع اسمًا.
- إذا كان اسم الموظف فدوة أو تالا استخدم صياغة مؤنثة عن الموظفة نفسها، وإذا كان عبدالله أو عبدالرحمن استخدم صياغة مذكرة عن الموظف نفسه.
- جنس الموظف لا يحدد صيغة مخاطبة العميل. استخدم الجنس اللغوي المرجح للعميل من البيانات أعلاه.
- إذا كان جنس العميل female استخدم: عليكِ، معكِ، اكتبي، ارفعي، ادفعي، حابة، جاهزة.
- إذا كان جنس العميل male استخدم: عليك، معك، اكتب، ارفع، ادفع، حاب، جاهز.
- إذا كان جنس العميل unknown استخدم صياغة محايدة بلا تخمين، مثل: لا توجد خطوة مطلوبة، سيتم التواصل، يمكن إرسال العبارة التالية.

هل سبق تعريف العميل باسم الموظف في رد سابق؟
${input.hasRecentStaffIntro ? "نعم" : "لا"}

إذا كانت الإجابة "لا"، ابدأ الرد الأول فقط بعبارة قصيرة: "معك ${input.assignedAgentName || "موظف المتابعة"} من فريق الأمين."
إذا كانت الإجابة "نعم"، لا تكرر اسم الموظف إلا إذا سأل العميل عنه.

الروابط التي سبق إرسالها في نفس المحادثة:
${input.sentUrls?.length ? input.sentUrls.join("\n") : "لا توجد روابط سابقة."}

أمثلة سابقة ناجحة من ذاكرة ${BUSINESS_NAME}:
${similarSuccessfulReplies || "لا توجد أمثلة مشابهة كافية حاليًا."}

تعليمات استخدام السياق:
- لا تبدأ كأنها أول رسالة إذا السياق يوضح أن العميل يتابع نفس الحديث.
- ردود النظام السابقة ليست مصدر حقيقة؛ استخدمها فقط لفهم تسلسل الحديث ومنع التكرار.
- إذا تعارض رد سابق مع حالة الطلب الحالية، تجاهل الرد السابق واعتمد حالة الطلب الحالية.
- إذا كانت حالة الطلب تؤكد استلام مستند، ممنوع طلب رفع المستند نفسه مرة ثانية.
- لا تكرر نفس الجملة أو نفس الافتتاحية الموجودة في آخر ردود النظام.
- إذا كانت رسالة العميل قصيرة جدًا مثل "طيب؟" أو "يعني؟" أو "تمام؟"، افهمها بناءً على آخر سياق ولا تعيد شرح الملف كاملًا.
- إذا كان آخر رد طلب رقم التتبع، لا تطلبه مرة ثانية بنفس الصيغة؛ قلها بشكل أقصر أو اسأل سؤالًا أوضح.
- إذا آخر الحديث كان تحية، لا ترد بتحية طويلة ثانية. رد طبيعي وقصير.

تعليمات استخدام الأمثلة السابقة:
- استفد من الأسلوب والنبرة فقط إذا كانت مناسبة.
- لا تنسخ أي معلومة تخالف الرد الآمن الأساسي.
- الرد الآمن الأساسي وبيانات الطلب الحالية أقوى من أي مثال سابق.
- اختصر الرد الآمن الأساسي ولا تنقله حرفيًا إذا كان طويلًا. خذ منه الحقائق فقط.

الرد الآمن الأساسي — استخدمه كحقائق وحدود فقط، ولا تنسخ أسلوبه أو ترتيبه تلقائيًا:
${input.deterministicReply}
`;

  const qualityPlan = preferHumanFirstPro
    ? await buildQualityFirstConversationPlan(input, apiKey, baseUrl, reasoningModel)
    : "";
  const qualityUserInput = `${userInput}\n\nخطة جودة داخلية إلزامية قبل الكتابة:\n${qualityPlan || "جاوب كل ما طلبه العميل في الرسالة الحالية، ولا تترك سؤالًا واضحًا بلا جواب."}`;

  try {
    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        {
          role: "system",
          content: systemInstructions,
        },
        {
          role: "user",
          content: qualityUserInput,
        },
      ],
      temperature: aiTemperatureForInput(input, useDeepThinking),
      max_tokens: Number(process.env.AI_REASONING_MAX_TOKENS || "850"),
    };

    if (process.env.DEEPSEEK_THINKING_MODE !== "off") {
      requestBody.thinking = useDeepThinking
        ? { type: "enabled", reasoning_effort: process.env.DEEPSEEK_REASONING_EFFORT || "high" }
        : { type: "disabled" };
    }

    let response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok && useDeepThinking && "thinking" in requestBody) {
      const thinkingErrorText = await response.text();
      console.error("DeepSeek thinking reply failed, retrying without thinking:", thinkingErrorText);

      delete requestBody.thinking;

      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    }

    if (!response.ok) {
      console.error("DeepSeek reply failed:", await response.text());
      return safeShortHumanFallback(input);
    }

    const data = await response.json();
    const aiText = extractDeepSeekText(data);
    let finalAiReply = finalizeHumanReply(sanitizeAiReply(aiText, input.deterministicReply), input);

    if (preferHumanFirstPro && finalAiReply) {
      try {
        const revised = await reviseReplyWithQualityCritic({
          aiInput: input,
          apiKey,
          baseUrl,
          model: reasoningModel,
          plan: qualityPlan,
          draft: finalAiReply,
        });
        if (revised) {
          const revisedFinal = finalizeHumanReply(sanitizeAiReply(revised, input.deterministicReply), input);
          if (revisedFinal && !looksLikeRoboticClarification(revisedFinal)) finalAiReply = revisedFinal;
        }
      } catch (qualityError) {
        console.error("DeepSeek quality critic error:", qualityError);
      }
    }

    const retryForHumanity = preferHumanFirstPro && (
      !finalAiReply ||
      looksLikeRoboticClarification(finalAiReply) ||
      (finalAiReply.trim() === String(input.deterministicReply || "").trim() && String(input.deterministicReply || "").length > 80)
    );

    if (retryForHumanity) {
      try {
        const retryBody: Record<string, unknown> = {
          model: reasoningModel,
          messages: [
            { role: "system", content: systemInstructions },
            { role: "user", content: `${qualityUserInput}

المحاولة السابقة طلعت قالبية أو قريبة جدًا من النص الآمن. أعد الصياغة من الصفر كموظف واتساب طبيعي: جاوب كل نقاط رسالة العميل الحالية، خليك قصير، ولا تضف أي حقيقة أو إجراء غير موجود.` },
          ],
          temperature: Number(process.env.AI_HUMAN_RETRY_TEMPERATURE || "0.42"),
          max_tokens: Number(process.env.AI_HUMAN_RETRY_MAX_TOKENS || "700"),
        };
        const retryResponse = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(retryBody),
        });
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryText = extractDeepSeekText(retryData);
          const retryReply = finalizeHumanReply(sanitizeAiReply(retryText, input.deterministicReply), input);
          if (retryReply && !looksLikeRoboticClarification(retryReply)) finalAiReply = retryReply;
        }
      } catch (retryError) {
        console.error("DeepSeek human-first retry error:", retryError);
      }
    }

    return finalAiReply;
  } catch (error) {
    console.error("DeepSeek reply error:", error);
    return safeShortHumanFallback(input);
  }
}


function siteIssueReply(baseUrl: string, from: string, app?: ApplicationRecord | null, tracking?: string, customerText = "") {
  void from;
  const t = normalizeArabicText(customerText);
  const requestRef = tracking || app?.tracking_id || app?.id || "";

  if (isLegacyLimitedStockUiMessageText(customerText)) {
    return limitedStockUiCorrectionReply(baseUrl);
  }
  const applyingIssue = hasAny(t, [
    "اقدم الطلب", "أقدم الطلب", "التقديم", "حدث خطا في الاتصال", "حدث خطأ في الاتصال",
    "خطا في الاتصال", "خطأ في الاتصال", "اختار جهاز", "اختيار جهاز", "مخزون محدود",
  ]);

  if (applyingIssue) {
    return `واضح إن المشكلة من صفحة التقديم/اختيار الجهاز، مش من أهلية الطلب.

إذا ما ظهر لك رقم تتبع بعد الإرسال، لا تعيد المحاولة عدة مرات بنفس اللحظة. حدّث الصفحة وافتح التقديم من جديد، وإذا استمر نفس الخطأ ابعث نص رسالة الخطأ أو لقطة شاشة بدون أي مستند حساس.

رابط التقديم:
${baseUrl}/products`;
  }

  if (app) {
    return `صفحة التتبع عندك ما فتحت، لكن طلبك ظاهر عندي وموجود.

الحالة الحالية: ${statusHumanLabel(app.status || "")}
رقم التتبع: ${app.tracking_id || app.id}

رابط المتابعة:
${trackUrl(baseUrl, app)}`;
  }

  const refLine = requestRef ? `\n\nرقم التتبع اللي وصلني: ${requestRef}` : "";
  return `إذا صفحة التتبع ما فتحت عندك، ابعث رقم التتبع AM- أو رقم الهاتف المستخدم بالتقديم حتى أراجع الطلب من السجل نفسه.${refLine}

رابط المتابعة:
${baseUrl}/track`;
}

function temporaryOrderLookupIssueReply(from: string, tracking?: string) {
  const trackingLine = tracking ? `\n\nرقم التتبع اللي وصلني:\n${tracking}` : "";

  return `وصلتني، بس حاليًا ما قدرت أقرأ حالة الطلب من النظام بشكل مؤكد 🌿${trackingLine}

هذا وحده ما يعني إن الطلب ملغي أو ضايع، وما رح أعطيك حالة أو موعد إصلاح غير مؤكد.

يمكن إرسال رقم التتبع أو رقم الهاتف المستخدم بالتقديم، وبنعتمد فقط المعلومة اللي تظهر بشكل مؤكد عند القراءة.`;
}

function normalizeReplyForLock(reply: string) {
  return String(reply || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

async function hasRecentlySentSameReply(waId: string, reply: string, seconds = 30) {
  const cleanWaId = String(waId || "").trim();
  const cleanReply = String(reply || "").trim();
  if (!cleanWaId || !cleanReply) return false;

  try {
    const since = new Date(Date.now() - seconds * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id")
      .eq("wa_id", cleanWaId)
      .eq("direction", "outgoing")
      .eq("body", cleanReply)
      .gte("created_at", since)
      .limit(1);

    if (error) {
      if ((error as any).code !== "42703") console.error("recent outgoing dedupe failed:", error);
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error("recent outgoing dedupe exception:", error);
    return false;
  }
}

async function claimOutgoingReplyLock(input: {
  waId: string;
  incomingMessageId?: string | null;
  reply: string;
  windowSeconds?: number;
}) {
  const cleanWaId = String(input.waId || "").trim();
  const incomingMessageId = String(input.incomingMessageId || "").trim();
  const cleanReply = normalizeReplyForLock(input.reply);
  const windowSeconds = input.windowSeconds || 20;

  if (!cleanWaId || !cleanReply) {
    return { shouldSend: true, reason: "missing_lock_input" };
  }

  const nowIso = new Date().toISOString();
  const replyBucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const locks = incomingMessageId
    ? [
        {
          lock_key: `incoming:${cleanWaId}:${incomingMessageId}`,
          wa_id: cleanWaId,
          incoming_message_id: incomingMessageId,
          reply_body: cleanReply,
          created_at: nowIso,
        },
      ]
    : [
        {
          lock_key: `reply:${cleanWaId}:${replyBucket}:${cleanReply}`,
          wa_id: cleanWaId,
          incoming_message_id: null,
          reply_body: cleanReply,
          created_at: nowIso,
        },
      ];

  for (const lock of locks) {
    try {
      const { error } = await supabaseAdmin
        .from("whatsapp_outgoing_reply_locks")
        .insert(lock);

      if (!error) continue;

      if ((error as any).code === "23505") {
        return { shouldSend: false, reason: "duplicate_outgoing_lock" };
      }

      if ((error as any).code === "42P01") {
        console.error("whatsapp_outgoing_reply_locks table is missing; using incoming-message dedupe fallback.");
        if (incomingMessageId) return { shouldSend: true, reason: "missing_outgoing_lock_table_incoming_dedupe" };
        return { shouldSend: !(await hasRecentlySentSameReply(cleanWaId, cleanReply, windowSeconds)), reason: "missing_outgoing_lock_table" };
      }

      console.error("outgoing reply lock insert failed:", error);
      if (incomingMessageId) return { shouldSend: true, reason: "outgoing_lock_error_incoming_dedupe" };
      return { shouldSend: !(await hasRecentlySentSameReply(cleanWaId, cleanReply, windowSeconds)), reason: "outgoing_lock_error" };
    } catch (error) {
      console.error("outgoing reply lock exception:", error);
      if (incomingMessageId) return { shouldSend: true, reason: "outgoing_lock_exception_incoming_dedupe" };
      return { shouldSend: !(await hasRecentlySentSameReply(cleanWaId, cleanReply, windowSeconds)), reason: "outgoing_lock_exception" };
    }
  }

  return { shouldSend: true, reason: "outgoing_lock_claimed" };
}


type ResolvedApplicationSelection = {
  app: ApplicationRecord | null;
  ambiguousChoices: ApplicationRecord[];
  source: string;
};

async function resolveApplicationForConversation(input: {
  from: string;
  text: string;
  intent: CustomerIntent;
  directTracking?: string | null;
  typedPhone?: string | null;
  memoryTracking?: string | null;
  memoryPhone?: string | null;
  explicitlyNewApplication?: boolean;
}): Promise<ResolvedApplicationSelection> {
  const { from, text, intent } = input;

  if (input.explicitlyNewApplication) {
    await clearApplicationConversationLock(from);
    return { app: null, ambiguousChoices: [], source: "explicit_new_application" };
  }

  const directTracking = String(input.directTracking || "").trim();
  const typedPhone = String(input.typedPhone || "").trim();
  const memoryTracking = String(input.memoryTracking || "").trim();
  const memoryPhone = String(input.memoryPhone || "").trim();

  if (directTracking) {
    const direct = typedPhone
      ? (await findApplicationByTrackingAndPhone(directTracking, typedPhone)) || (await findApplicationByTracking(directTracking))
      : (await findApplicationByTracking(directTracking)) || (await findApplicationByTrackingAndPhone(directTracking, memoryPhone || from));
    if (direct) {
      await setApplicationConversationLock(from, direct, "direct_tracking");
      return { app: direct, ambiguousChoices: [], source: "direct_tracking" };
    }
  }

  const preferredPhone = typedPhone || memoryPhone || from;
  let candidates = await findApplicationsByPhone(preferredPhone, 12);
  if (!candidates.length && normalizeJordanPhone(preferredPhone) !== normalizeJordanPhone(from)) {
    candidates = await findApplicationsByPhone(from, 12);
  }

  const named = findExplicitlyNamedApplication(text, candidates);
  if (named) {
    await setApplicationConversationLock(from, named, "explicit_name");
    return { app: named, ambiguousChoices: [], source: "explicit_name" };
  }

  const existingLock = await getApplicationConversationLock(from);
  if (existingLock?.application_id) {
    const locked = await findApplicationById(existingLock.application_id);
    if (locked) {
      await touchApplicationConversationLock(from);
      return { app: locked, ambiguousChoices: [], source: "conversation_lock" };
    }
    await clearApplicationConversationLock(from);
  }

  if (memoryTracking) {
    const byMemoryTracking = (await findApplicationByTracking(memoryTracking)) ||
      (await findApplicationByTrackingAndPhone(memoryTracking, preferredPhone));
    if (byMemoryTracking) {
      await setApplicationConversationLock(from, byMemoryTracking, "memory_tracking");
      return { app: byMemoryTracking, ambiguousChoices: [], source: "memory_tracking" };
    }
  }

  if (candidates.length === 1) {
    await setApplicationConversationLock(from, candidates[0], "single_candidate");
    return { app: candidates[0], ambiguousChoices: [], source: "single_candidate" };
  }

  if (candidates.length > 1 && isApplicationSpecificIntent(intent) && applicationChoicesNeedDisambiguation(candidates)) {
    return { app: null, ambiguousChoices: candidates, source: "ambiguous_same_phone" };
  }

  const latest = candidates[0] || null;
  if (latest) await setApplicationConversationLock(from, latest, "latest_unambiguous_context");
  return { app: latest, ambiguousChoices: [], source: latest ? "latest_unambiguous_context" : "none" };
}

async function buildReply(request: Request, from: string, text: string, messageType = "text", options?: { forcedIntent?: CustomerIntent | null; disableLegacyAi?: boolean }) {
  const baseUrl = getBaseUrl(request);
  const rawCustomerText = String(text || "").trim();
  // سياق قريب فقط: يمنع الردود القديمة السيئة من السيطرة على DeepSeek.
  const conversationMemory = await getConversationMemory(from, 18);
  const resolvedInput = resolveConversationInput(text, messageType, conversationMemory);
  text = resolvedInput.effectiveText;
  let intent = resolvedInput.intent;

  // V1.3.1 CURRENT-MESSAGE SEMANTIC PRIORITY: receipt confirmation and the current
  // substantive question outrank historical context and social prefixes such as "تمام/شكرا".
  const hardCurrentDecision = currentMessageDecisionOverride(rawCustomerText);
  const currentSemanticHint = currentMessageSemanticIntentHint(rawCustomerText);
  if (isExactCancelConfirmationText(rawCustomerText)) {
    intent = "cancel_confirmed";
  } else if (isProductPackagingQuestionText(rawCustomerText)) {
    intent = "products";
  } else if (isCancelRefundRequestText(rawCustomerText)) {
    // V1.6.0: "بطلت بدي الجهاز + رجعولي الرسوم" is a combined cancel/refund request,
    // not a fee-policy question and not a generic opt-out. It still requires explicit
    // cancellation confirmation before any destructive mutation.
    intent = "cancel_refund_request";
  } else if (hardCurrentDecision) {
    intent = hardCurrentDecision;
  } else if (isReceiptConfirmationCurrentText(rawCustomerText) || isReceiptUploadConfirmationText(rawCustomerText)) {
    intent = "receipt_upload_confirmation";
  } else if (isExplicitStopRefundText(rawCustomerText)) {
    intent = "stop_refund";
  } else if (isRefundPolicyInquiryText(rawCustomerText)) {
    intent = "payment_amount";
  } else if (isCancelRequestText(rawCustomerText)) {
    intent = "cancel_request";
  } else if (isExplicitNonContinuationText(rawCustomerText)) {
    intent = "voluntary_opt_out";
  } else if (isPositiveContinueDecisionText(rawCustomerText)) {
    intent = "continue_decision";
  } else if (isExplicitRefundMutationText(rawCustomerText)) {
    intent = "refund";
  } else if (currentSemanticHint) {
    intent = currentSemanticHint;
  }

  if (isEnglishReplyPreferenceText(rawCustomerText)) {
    return `Of course. I can reply in English. Please send your question or your application tracking number, and I will answer based on the actual status of your application.`;
  }

  if (isBusinessIndependenceQuestionText(rawCustomerText, conversationMemory.conversationContext)) {
    return businessIndependenceReply();
  }

  // V1.6.4 CURRENT MESSAGE TRUTH GATE: these messages are self-contained and
  // must never be hijacked by payment/status memory from older turns.
  if (isPureNonTransactionalUtteranceText(rawCustomerText)) {
    const normalized = normalizeArabicText(rawCustomerText);
    return hasAny(normalized, ["ان شاء الله", "إن شاء الله"]) ? "إن شاء الله 🌿" : "الله يحييك 🌿";
  }

  if (isClearlyExternalCommerceText(rawCustomerText)) {
    return "إذا قصدك طلبية شي إن، هاي مش مرتبطة بطلب الأمين للأقساط. إذا عندك سؤال عن طلب الأمين ابعث رقم التتبع أو سؤالك عنه مباشرة.";
  }

  if (isInstallmentAndRequirementsQuestionText(rawCustomerText)) {
    return installmentAndRequirementsReply(baseUrl);
  }

  const directTracking = extractTracking(text);
  const typedPhone = extractJordanPhoneFromText(text);

  const pendingContinueDecision = (conversationMemory.lastAssistantReplies || []).some((reply) =>
    /أكديلي المتابعة|اكد المتابعة|أكد المتابعة|إذا حاب.*نكمل|اذا حاب.*نكمل|تعليمات فتح الملف|تعليمات الدفع/i.test(String(reply || ""))
  );

  if (
    !hardCurrentDecision &&
    (
      (pendingContinueDecision && (isShortContinuationText(text) || isSimpleContinueConfirmationText(text))) ||
      (conversationMemory.hasRecentPreliminaryApprovalTemplate && isSimpleContinueConfirmationText(text))
    )
  ) {
    intent = "continue_decision";
  }

  const explicitlyNewApplication = isExplicitNewApplicationText(text);
  const memoryTracking = !explicitlyNewApplication
    ? conversationMemory.lastTrackingId || extractTracking(conversationMemory.conversationContext)
    : "";
  const memoryPhone = !explicitlyNewApplication
    ? conversationMemory.lastPhoneNumber || extractJordanPhoneFromText(conversationMemory.lastCustomerMessages?.join("\n") || "")
    : "";
  const tracking = directTracking || memoryTracking;
  const pendingCancellationConfirmation = (conversationMemory.lastAssistantReplies || []).some((reply) =>
    /اكد الغاء الطلب|أكد إلغاء الطلب|قبل الالغاء النهائي|قبل الإلغاء النهائي/i.test(String(reply || ""))
  );
  const pendingReopenConfirmation = Boolean(conversationMemory.hasPendingReopenConfirmation) ||
    (conversationMemory.lastAssistantReplies || []).some((reply) =>
      /اكد اعاده تفعيل الطلب|أكد إعادة تفعيل الطلب|اكد اعاده فتح الطلب|أكد إعادة فتح الطلب/i.test(String(reply || ""))
    );

  if (pendingReopenConfirmation && isSimpleReopenConfirmationText(text)) {
    intent = "reopen_cancelled_confirmed";
  }

  const humanContextIntent = contextualHumanIntentHint({
    customerText: rawCustomerText,
    currentIntent: intent,
    lastCustomerMessages: conversationMemory.lastCustomerMessages,
    lastAssistantReplies: conversationMemory.lastAssistantReplies,
  });
  if (humanContextIntent) {
    intent = humanContextIntent;
  }

  const sensitive = looksSensitive(text) || (Boolean(conversationMemory.conversationContext) && isTinyContextFollowupText(text));

  const humanizeReply = (input: AiReplyInput) =>
    options?.disableLegacyAi
      ? Promise.resolve(input.deterministicReply)
      : generateAiReply({
      ...input,
      conversationContext: conversationMemory.conversationContext,
      lastAssistantReplies: conversationMemory.lastAssistantReplies,
      lastCustomerMessages: conversationMemory.lastCustomerMessages,
      memoryTrackingId: memoryTracking || null,
      messageType,
      sentUrls: conversationMemory.sentUrls || [],
      hasRecentConversation: conversationMemory.hasRecentConversation,
      hasRecentStaffIntro: conversationMemory.hasRecentStaffIntro,
      assignedAgentName: assignedStaffName(from),
      lastMeaningfulCustomerMessage: conversationMemory.lastMeaningfulCustomerMessage || null,
      lastQuestionLikeCustomerMessage: conversationMemory.lastQuestionLikeCustomerMessage || null,
    });

  // V1.6.0 GREETING + SUBSTANCE: "مرحبا" must never swallow a complaint,
  // delay question, cancellation, or other substantive content that follows it.
  if (String(intent) === "greeting" && hasSubstantiveContentAfterSocialPrefix(rawCustomerText)) {
    const substantiveTail = stripLeadingSocialAcknowledgement(rawCustomerText);
    const tailIntent = classifyIntent(substantiveTail);
    if (!["greeting", "thanks", "reaction", "unknown"].includes(String(tailIntent))) {
      intent = tailIntent;
    } else {
      const semanticTailIntent = currentMessageSemanticIntentHint(substantiveTail);
      if (semanticTailIntent) intent = semanticTailIntent;
    }
  }

  if (String(intent) === "greeting") {
    if (!conversationMemory.hasRecentStaffIntro) {
      return `أهلًا وسهلًا، معك ${assignedStaffName(from)} من فريق الأمين 🌿`;
    }
    return generalGreetingReply(from);
  }

  if (String(intent) === "thanks" && !conversationMemory.hasRecentConversation) {
    return `العفو 🌿
بخدمتك بأي وقت.`;
  }

  const resolvedApplication = await resolveApplicationForConversation({
    from,
    text: rawCustomerText,
    intent,
    directTracking: directTracking || null,
    typedPhone: typedPhone || null,
    memoryTracking: memoryTracking || null,
    memoryPhone: memoryPhone || null,
    explicitlyNewApplication,
  });
  let app: ApplicationRecord | null = resolvedApplication.app;

  if (resolvedApplication.ambiguousChoices.length) {
    return applicationDisambiguationReply(resolvedApplication.ambiguousChoices);
  }

  // V1.2.0 GLOBAL STATE INTEGRITY GATE: an impossible refund state is quarantined
  // before any intent-specific reply or mutation can reinforce it.
  if (app && hasInvalidRefundState(app)) {
    const actionRequest = await recordApplicationActionRequest(app, "refund_integrity_review", rawCustomerText);
    const integrityReply = refundIntegrityHoldReply(app);

    if (!actionRequest.duplicate) {
      await sendDiscordNotification({
        title: "🚨 REFUND INTEGRITY HOLD — حالة استرداد بلا دفع مؤكد",
        description: "تم عزل الطلب عن أي رد أو تغيير مالي تلقائي. لا يوجد دفع مؤكد ظاهر، وتم تسجيل طلب مراجعة داخلية لحالة الطلب بدل تعزيز حالة الاسترداد غير المتسقة.",
        color: 0xed4245,
        app,
        customerPhone: from,
        customerMessage: rawCustomerText,
        systemReply: integrityReply,
        baseUrl,
      });
    }

    return integrityReply;
  }

  // V1.7.0 CONVERSATION KERNEL: bind the current turn to the resolved application
  // before action routing. Hard transaction integrity above remains authoritative.
  const kernelTurn = analyzeConversationTurn({
    customerText: rawCustomerText,
    messageType,
    currentIntent: intent,
    application: app,
    memory: conversationMemory,
  });
  intent = options?.forcedIntent || kernelTurn.intentOverride || intent;

  if (app && kernelTurn.actionRequestType && !options?.forcedIntent) {
    const actionRequest = await recordApplicationActionRequest(
      app,
      kernelTurn.actionRequestType,
      kernelTurn.requestedChange || rawCustomerText,
    );
    const kernelActionReply = buildConversationKernelActionReply(kernelTurn, app, actionRequest);
    if (actionRequest.ok && !actionRequest.duplicate) {
      await sendDiscordNotification({
        title: "Conversation Kernel - application change review",
        description: `Action request: ${kernelTurn.actionRequestType}`,
        color: 0xfee75c,
        app,
        customerPhone: from,
        customerMessage: rawCustomerText,
        systemReply: kernelActionReply,
        baseUrl,
      });
    }
    return kernelActionReply;
  }

  if (kernelTurn.immediateReply) {
    return kernelTurn.immediateReply;
  }

  // V1.4.4.1 CONTEXT INTEGRITY: an active refund state outranks generic payment/review/delivery wording.
  if (app && (app.status === "refund_requested" || app.payment_status === "refund_requested")) {
    if (isRefundResumeFollowupText(rawCustomerText)) {
      intent = "reopen_cancelled_request";
    } else if (isRefundMoneyFollowupText(rawCustomerText) || isRefundStatePriorityFollowupText(rawCustomerText)) {
      // V1.5.1: the durable refund state outranks noisy lexical intents such as
      // payment_amount / unknown / abuse when the current message is clearly
      // about the money or timing of that existing refund.
      intent = "refund";
    } else if (isRefundTimingOrDeliveryFollowupText(rawCustomerText)) {
      return refundActiveTimingReply(app);
    }
  }

  // V1.6.4: a question ABOUT whether a guarantor is required is informational.
  // It must not be turned into an upload action unless the customer explicitly asks how to provide it.
  if (isGuarantorQuestionText(rawCustomerText)) {
    return guarantorRequirementQuestionReply(app, rawCustomerText, baseUrl);
  }

  if (isExplicitHumanAgentRequestText(rawCustomerText) && isFirstInstallmentQuestionText(rawCustomerText)) {
    return `${paymentAmountReply(app, rawCustomerText)}\n\nمعك ${assignedStaffName(from)} من فريق الأمين.`;
  }

  // V1.4.3 HUMAN DECISION PLANE: saying the required guarantor is unavailable
  // is not a document-upload action and must never trigger an upload template.
  if (isGuarantorUnavailableText(rawCustomerText)) {
    return guarantorUnavailableReply();
  }

  if (app && isShortDocumentCompletionText(rawCustomerText)) {
    const recentDocumentInstruction = (conversationMemory.lastAssistantReplies || []).find((reply) =>
      /(?:بيانات الكفيل|كشف راتب|شهادة راتب|الهوية|الهويه)[^\n]{0,180}(?:الرابط|تعبئ|رفع)|(?:الرابط|تعبئ|رفع)[^\n]{0,180}(?:بيانات الكفيل|كشف راتب|شهادة راتب|الهوية|الهويه)/i.test(String(reply || ""))
    );

    if (recentDocumentInstruction) {
      const docName = /كفيل/i.test(recentDocumentInstruction)
        ? "بيانات الكفيل"
        : /راتب/i.test(recentDocumentInstruction)
          ? "مستند الراتب"
          : "المستند المطلوب";
      return `تمام. إذا قصدك ${docName} اللي طلبناه قبل شوي، وما دام استكملته من الرابط الرسمي فما في داعي تعيده أو ترسله عبر واتساب.

رح نعتمد فقط التحديث الظاهر على الطلب، وإذا احتاج الملف أي خطوة إضافية رح توصلك رسالة واضحة بالمطلوب.`;
    }
  }

  const paymentContextActive = paymentAssistanceStateActive(app, conversationMemory);
  const recentApprovalContext = [
    ...(conversationMemory.lastCustomerMessages || []),
    ...(conversationMemory.lastAssistantReplies || []),
  ].some((message) => /موافق|مؤهل مبدئي|موافقة نهائية|تم تأكيد رغبت/i.test(String(message || "")));

  if (
    app &&
    String(intent) === "unknown" &&
    recentApprovalContext &&
    hasAny(normalizeArabicText(text), ["يعني تم ولا شو", "تم ولا لا", "يعني تم", "خلص تم", "شو يعني", "يعني؟"])
  ) {
    intent = "order_status";
  }


  const recentCorrectionContext = [
    ...(conversationMemory.lastCustomerMessages || []),
    ...(conversationMemory.lastAssistantReplies || []),
  ].some((message) => hasAny(String(message || ""), [
    "عدل راتبي", "تعديل الراتب", "تصحيح الراتب", "الراتب الصحيح", "أكد تعديل الراتب",
  ]));

  if (
    app &&
    ["unknown", "requirements"].includes(String(intent)) &&
    recentCorrectionContext &&
    hasAny(text, ["بالغلط", "غلط", "هو الصحيح", "الصحيح"])
  ) {
    intent = "application_data_correction";
  }

  if (
    app &&
    String(intent) === "supplier_delay_question" &&
    !["approved", "customer_accepts_delivery_delay"].includes(app.status || "") &&
    !hasExplicitSupplierLogisticsText(text)
  ) {
    // "لسا ما في تحديث بخصوص التلفون" هي متابعة للطلب، وليست سؤال توريد قبل الموافقة.
    intent = "order_status";
  }

  if (paymentContextActive && !["voluntary_opt_out", "office_payment_request"].includes(String(intent))) {
    if (isDeliveryCorrectionText(text) || isPaymentMethodText(text)) {
      intent = "payment_method";
    } else if (isPaymentTimingText(text)) {
      intent = "payment_timing";
    } else if (isPaymentRecipientText(text)) {
      intent = "payment_recipient";
    } else if (isPaymentReviewTimeText(text)) {
      intent = "payment_review_time";
    } else if (isPaymentNextStepText(text)) {
      intent = "payment_next_step";
    } else if (isFileOpeningClarificationText(text) || isPaymentObjectionText(text)) {
      intent = "payment_objection";
    } else if (
      isPaymentLinkIssueText(text) ||
      (["site_issue", "unknown"].includes(String(intent)) &&
        Boolean(conversationMemory.hasSentReceiptLink) &&
        hasAny(text, ["الرابط ما بفتح", "الرابط مش شغال", "ما بفتح", "مش شغال", "خطأ", "خطا", "404"]))
    ) {
      intent = "payment_link_issue";
    } else if (
      (String(intent) === "review_time" || String(intent) === "order_status" || String(intent) === "unknown") &&
      hasAny(text, ["الموافقة", "الموافقه", "الرفض", "او الرفض", "أو الرفض", "والرفض", "النتيجة", "النتيجه"])
    ) {
      intent = "payment_review_time";
    } else if (String(intent) === "unknown" && ["وبعدين", "بعدها شو", "شو بصير بعدها"].includes(normalizeArabicText(text))) {
      intent = "payment_next_step";
    }
  }

  const recentProductSpecContext = [
    ...(conversationMemory.lastCustomerMessages || []),
    ...(conversationMemory.lastAssistantReplies || []),
  ].slice(-8).some((message) =>
    isProductSpecificationQuestionText(String(message || "")) ||
    isProductAccessoryQuestionText(String(message || "")) ||
    hasAny(String(message || ""), ["HONOR 600", "هونر 600", "رام", "رامات", "مواصفات", "سماعة", "شاحن", "ملحقات"])
  );

  if (
    String(intent) === "unknown" &&
    (isShortProductSpecificationFollowupText(rawCustomerText) || isProductAccessoryQuestionText(rawCustomerText)) &&
    recentProductSpecContext
  ) {
    intent = "products";
  }

  const recentInstallmentContext = [
    ...(conversationMemory.lastCustomerMessages || []),
    ...(conversationMemory.lastAssistantReplies || []),
  ].slice(-8).some((message) =>
    isInstallmentDurationQuestionText(String(message || "")) ||
    hasAny(String(message || ""), ["تقسيط", "القسط", "الأقساط", "الاقساط", "كم شهر", "مدة التقسيط", "الجدول النهائي"])
  );

  if (
    String(intent) === "unknown" &&
    isShortInstallmentDurationFollowupText(rawCustomerText) &&
    recentInstallmentContext
  ) {
    intent = "installment_info";
  }

  if (app && isApprovalProbabilityQuestionText(rawCustomerText)) {
    intent = "order_status";
  }

  if (pendingCancellationConfirmation && typedPhone && app && String(intent) === "unknown") {
    intent = "cancel_request";
  }

  if (
    app &&
    (app.status === "refund_requested" || app.payment_status === "refund_requested") &&
    [
      "unknown", "payment", "payment_amount", "payment_method", "payment_timing", "payment_recipient",
      "payment_next_step", "payment_review_time", "payment_objection", "payment_dispute",
      "loan", "order_status", "review_time",
    ].includes(String(intent)) &&
    hasAny(text, [
      "استرداد", "استرجاع", "فلوسي", "مصاري", "المبلغ", "الدنانير", "دينار",
      "حولولي", "رجعولي", "رجعتو", "رجعتوا", "ترجعو", "ترجعوا", "راح ترجعو", "رح ترجعو",
      "وين الفلوس", "وين المصاري", "وين المبلغ", "بدي حقي",
      "الحوالة", "الحواله", "موعد الحوالة", "موعد الحواله", "تنزل الحوالة",
      "توصل الحوالة", "تكون الحوالة عندي", "متى تنزل", "متى توصل",
    ])
  ) {
    intent = "refund";
  }

  let deterministicReply: string;

  if (String(intent) === "reaction") {
    return "";
  }

  if (String(intent) === "system_prompt_request") {
    return systemPromptRequestReply();
  }

  if (String(intent) === "staff_identity") {
    return employeeIdentityReply(from, app);
  }

  if (String(intent) === "human_agent") {
    // Human-contact requests are operational, not creative: keep them deterministic and complete.
    return employeeIdentityReply(from, app);
  }

  if (messageHasReviewAndLocationTopics(rawCustomerText)) {
    return reviewAndLocationReply(app, from, rawCustomerText);
  }

  if (messageHasReviewAndCallTopics(rawCustomerText)) {
    return reviewAndCallReply(app, from, rawCustomerText);
  }

  if (String(intent) === "call_request") {
    return callRequestReply(from, app);
  }

  if (String(intent) === "office_payment_request") {
    const recentAssistantReplies = conversationMemory.lastAssistantReplies || [];
    const policyAlreadyExplained = officeFeePaymentPolicyWasExplained(recentAssistantReplies);
    const explicitInsistence = isOfficeFeePaymentInsistenceText(text);
    const finalClosure = policyAlreadyExplained || explicitInsistence;
    const readyToIgnore = officeFeePaymentCanBeIgnored(app);

    deterministicReply = officeFeePaymentReply(app, finalClosure);

    if (finalClosure && !officeFeePaymentFinalReplyWasSent(recentAssistantReplies)) {
      await sendDiscordNotification({
        title: readyToIgnore
          ? "🟣 العميل يصر على الدفع في المكتب — جاهز للتجاهل"
          : "🟠 العميل يصر على الدفع في المكتب — يحتاج إنهاء رسمي",
        description: readyToIgnore
          ? "تم توضيح أن دفع رسوم فتح الملف غير متاح في المكتب وأن الخدمة اختيارية، ثم كرر العميل الإصرار أو رفض وسيلة الدفع الرسمية. لم يتم إلغاء الطلب أو تسجيل استرداد تلقائيًا. لا حاجة لمتابعته أو تكرار تعليمات الدفع ما لم يعود من نفسه."
          : "العميل يصر على الدفع في المكتب، لكن الطلب عليه دفع مؤكد أو استرداد نشط أو موافقة نهائية؛ لذلك لا تُترك الحالة للتجاهل قبل إنهائها رسميًا.",
        color: readyToIgnore ? 0x9b59b6 : 0xfee75c,
        app,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });
    }

    return deterministicReply;
  }

  if (String(intent) === "voluntary_opt_out") {
    const recentAssistantReplies = conversationMemory.lastAssistantReplies || [];
    const policyAlreadyExplained = paymentRefusalPolicyWasExplained(recentAssistantReplies);
    const paymentOnReceipt = isPaymentOnReceiptRefusalText(text);
    const finalClosure = policyAlreadyExplained || isAbsolutePaymentRefusalText(text);
    const readyToIgnore = voluntaryOptOutCanBeIgnored(app);
    deterministicReply = paymentOnReceipt
      ? paymentOnReceiptReply(app, finalClosure)
      : voluntaryOptOutReply(app, finalClosure);

    if (finalClosure && !paymentRefusalFinalClosureWasSent(recentAssistantReplies)) {
      await sendDiscordNotification({
        title: readyToIgnore
          ? paymentOnReceipt
            ? "🟣 العميل يصر على الدفع عند الاستلام — جاهز للتجاهل"
            : "🟣 العميل رفض الدفع بعد التوضيح — جاهز للتجاهل"
          : paymentOnReceipt
            ? "🟠 العميل يصر على الدفع عند الاستلام — يحتاج إنهاء رسمي"
            : "🟠 العميل رفض الاستمرار — يحتاج إنهاء رسمي",
        description: readyToIgnore
          ? paymentOnReceipt
            ? "العميل اشترط أو أصر أن الدفع يكون عند استلام الجهاز. تم توضيح أن رسوم فتح الملف تُدفع قبل بدء دراسة الطلب وأن الدفع عند الاستلام غير متاح. لا يتم إلغاء الطلب أو تسجيل استرداد تلقائيًا؛ الحالة جاهزة للمراجعة الإدارية والتجاهل إذا رغبت الإدارة."
            : "تم توضيح سياسة رسوم فتح الملف باختصار، والعميل رفض الدفع بوضوح أو كرر الرفض. لا يتم إلغاء الطلب أو تسجيل استرداد تلقائيًا، ولا تُكرر تعليمات الدفع ما لم يعود العميل من نفسه."
          : "يوجد دفع مؤكد أو استرداد نشط أو موافقة نهائية؛ يلزم إنهاء الحالة رسميًا إذا كان قراره نهائيًا.",
        color: readyToIgnore ? 0x9b59b6 : 0xfee75c,
        app,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });
    }

    return deterministicReply;
  }

  if (
    [
      "payment_method",
      "payment_timing",
      "payment_recipient",
      "payment_next_step",
      "payment_review_time",
      "payment_objection",
      "payment_link_issue",
    ].includes(String(intent))
  ) {
    if (isPaymentOnReceiptQuestionText(text)) {
      return paymentOnReceiptReply(app, false);
    }

    if (!app) {
      if (isGeneralMonthlyPaymentQuestionText(text)) {
        return `إذا سؤالك عن الأقساط الشهرية بعد استلام الجهاز: طريقة السداد تُحدد ضمن الاتفاق والجدول النهائي بعد الموافقة والاستلام، لذلك ما بقدر أؤكد اقتطاعًا بنكيًا تلقائيًا أو زيارة شهرية للمكتب بدون اتفاق معتمد.

أما رسوم فتح الملف فهي مختلفة عن الأقساط: 5 دنانير مرة واحدة فقط إذا صار الطلب مؤهلًا مبدئيًا وقررت تكمل، وليست قسطًا شهريًا.

إذا السؤال متعلق بطلب قائم وتحتاج المعلومة الخاصة فيه، ابعث رقم التتبع أو رقم الهاتف المستخدم بالتقديم.`;
      }
      return `حتى أعطيك معلومات الدفع الصحيحة والرابط المرتبط بطلبك، ابعث رقم التتبع الذي يبدأ بـ AM- أو رقم الهاتف المستخدم بالتقديم.`;
    }

    deterministicReply = paymentAssistanceReply({
      app,
      baseUrl,
      customerText: text,
      intent,
      memory: conversationMemory,
    });

    if (["payment_method", "payment_recipient", "payment_link_issue"].includes(String(intent))) {
      return deterministicReply;
    }

    return humanizeReply({
      customerText: text,
      deterministicReply,
      customerName: firstTwoNames(app.full_name),
      trackingId: app.tracking_id || app.id,
      status: app.status || null,
      paymentStatus: app.payment_status || null,
      deviceName: app.device_name || null,
      isSensitive: false,
      hasApplication: true,
      intent,
    });
  }

  if (String(intent) === "stop_refund") {
    if (!app) {
      return `حتى أراجع طلب إيقاف الاسترداد على الملف الصحيح، ابعث رقم التتبع الذي يبدأ بـ AM- أو رقم الهاتف المستخدم بالتقديم.`;
    }

    if (app.status === "refund_completed") {
      return `الاسترداد ظاهر كمكتمل على الطلب، لذلك ما بقدر أعكس العملية تلقائيًا من واتساب. إذا بدك مراجعة الحالة، تمسك بنفس رقم الطلب عند المتابعة.
رقم الطلب: ${app.tracking_id || app.id}`;
    }

    const activeRefund = app.status === "refund_requested" || app.payment_status === "refund_requested";
    if (!activeRefund) {
      return `ما في استرداد نشط ظاهر على الطلب حتى يتم إيقافه. حالة الطلب الحالية: ${statusHumanLabel(app.status || "")}
رقم الطلب: ${app.tracking_id || app.id}`;
    }

    const actionRequest = await recordApplicationActionRequest(app, "stop_refund", rawCustomerText);
    deterministicReply = stopRefundRequestReply(app, actionRequest.ok);

    if (actionRequest.ok && !actionRequest.duplicate) {
      await sendDiscordNotification({
        title: "🟠 طلب إيقاف استرداد — يحتاج مراجعة",
        description: "العميل طلب إيقاف الاسترداد والعودة لمسار الطلب. لم يتم عكس أي حالة مالية تلقائيًا؛ تم تسجيل طلب إجراء داخلي pending للمراجعة.",
        color: 0xfee75c,
        app,
        customerPhone: from,
        customerMessage: rawCustomerText,
        systemReply: deterministicReply,
        baseUrl,
      });
    }

    return deterministicReply;
  }

  if (String(intent) === "reopen_cancelled_request") {
    return app ? reopenCancelledRequestReply(app) : reopenCancelledWithoutAppReply();
  }

  if (String(intent) === "reopen_cancelled_confirmed") {
    if (!app) return reopenCancelledWithoutAppReply();

    const explicitReopen = isExactReopenConfirmationText(rawCustomerText) ||
      (pendingReopenConfirmation && isSimpleReopenConfirmationText(rawCustomerText));
    if (!explicitReopen) {
      return app ? reopenCancelledRequestReply(app) : reopenCancelledWithoutAppReply();
    }

    if (app.status === "refund_completed") {
      return reopenCancelledRequestReply(app);
    }

    if (app.status !== "cancelled" && app.status !== "refund_requested" && app.payment_status !== "refund_requested") {
      return `طلبك مستمر أصلًا وحالته الحالية: ${statusHumanLabel(app.status || "")}.

ما في حاجة لإعادة تفعيله.
رقم الطلب: ${app.tracking_id || app.id}`;
    }

    const paidCancellation =
      hasConfirmedPaymentEvidence(app) &&
      (app.payment_status === "refund_requested" || app.status === "refund_requested");

    if (paidCancellation) {
      deterministicReply = reopenPaidCancellationPendingReply(app);

      await sendDiscordNotification({
        title: "🔄 العميل تراجع عن إلغاء طلب مدفوع",
        description: "الاسترداد مسجل، لذلك لم تتم إعادة فتح الطلب تلقائيًا. يلزم التحقق من إمكانية إيقاف الاسترداد ثم إعادة تفعيل الملف.",
        color: 0xfee75c,
        app,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });

      return deterministicReply;
    }

    try {
      const reopenedApp = await reopenCancelledUnpaidApplication(app);
      deterministicReply = `تمت إعادة تفعيل طلبك بنجاح، ورجّعناه لمرحلة استكمال فتح الملف.

${paymentMessage(reopenedApp, baseUrl)}`;

      await sendDiscordNotification({
        title: "✅ تمت إعادة تفعيل طلب ملغي",
        description: "العميل تراجع عن الإلغاء وأكد إعادة التفعيل. تم فتح الطلب من جديد وإرسال معلومات الدفع الرسمية.",
        color: 0x57f287,
        app: reopenedApp,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });

      return deterministicReply;
    } catch (error) {
      return `وصل تأكيدك بإعادة تفعيل الطلب، لكن تعذر تحديث الحالة الآن.

الطلب ما زال ملغيًا حاليًا، ولا تدفع أي مبلغ إلى أن يصلك تأكيد واضح بإعادة فتحه.
رقم الطلب: ${app.tracking_id || app.id}`;
    }
  }

  if (String(intent) === "keep_request") {
    return keepRequestReply(app);
  }

  if (String(intent) === "payment_amount") {
    deterministicReply = paymentAmountReply(app, text);
    return humanizeReply({
      customerText: text,
      deterministicReply,
      customerName: app ? firstTwoNames(app.full_name) : undefined,
      trackingId: app ? app.tracking_id || app.id : undefined,
      status: app?.status || null,
      paymentStatus: app?.payment_status || null,
      deviceName: app?.device_name || null,
      isSensitive: false,
      hasApplication: Boolean(app),
      intent,
    });
  }

  if (String(intent) === "self_employed") {
    deterministicReply = selfEmployedReply(app);
    return humanizeReply({
      customerText: text,
      deterministicReply,
      customerName: app ? firstTwoNames(app.full_name) : undefined,
      trackingId: app ? app.tracking_id || app.id : undefined,
      status: app?.status || null,
      paymentStatus: app?.payment_status || null,
      deviceName: app?.device_name || null,
      isSensitive: false,
      hasApplication: Boolean(app),
      intent,
    });
  }

  if (String(intent) === "trust_verification") {
    deterministicReply = isPaymentGuaranteeText(text)
      ? paymentGuaranteeReply(baseUrl, app)
      : trustVerificationReply(baseUrl, app);
    return humanizeReply({
      customerText: text,
      deterministicReply,
      customerName: app ? firstTwoNames(app.full_name) : undefined,
      trackingId: app ? app.tracking_id || app.id : undefined,
      status: app?.status || null,
      paymentStatus: app?.payment_status || null,
      deviceName: app?.device_name || null,
      isSensitive: true,
      hasApplication: Boolean(app),
      intent,
    });
  }

  if (String(intent) === "receipt_upload_confirmation") {
    return receiptUploadConfirmationReply(app);
  }

  if (String(intent) === "device_change_cancelled") {
    return app
      ? `تمام، ما رح نغيّر الجهاز المسجل على طلبك. طلب التقسيط نفسه بقي مستمرًا وحالته الحالية: ${statusHumanLabel(app.status || "")}.

الجهاز المسجل: ${customerFacingDeviceName(app.device_name) || "غير محدد"}.
رقم الطلب: ${app.tracking_id || app.id}`
      : `تمام، ما رح نعتبر رسالتك طلب تغيير جهاز. إذا عندك طلب قائم وبدك أتأكد من الجهاز المسجل، ابعث رقم التتبع.`;
  }

  if (String(intent) === "device_change" || String(intent) === "device_change_confirmed") {
    return handleDeviceChange({
      app,
      from,
      text,
      memory: conversationMemory,
      baseUrl,
      confirmedFromContext: false,
    });
  }


  if (app && String(intent) === "application_data_correction_confirmed") {
    const correctionDetails = extractSalaryCorrectionDetails(text, app.salary);
    const newSalary = correctionDetails.correctSalary;

    if (!salaryValueIsReasonable(newSalary)) {
      return `حتى أعدل الراتب بأمان، اكتب التأكيد مع الرقم بهذه الصيغة:
أكد تعديل الراتب إلى 450

رقم الطلب: ${app.tracking_id || app.id}`;
    }

    if (correctionDetails.storedSalary === newSalary) {
      return `الراتب المسجل على طلبك هو بالفعل ${newSalary} دينار، وما في تعديل إضافي مطلوب.

رقم الطلب: ${app.tracking_id || app.id}`;
    }

    try {
      const oldSalary = correctionDetails.storedSalary;
      const updatedApp = await updateApplicationSalary(app, newSalary);
      deterministicReply = salaryCorrectionConfirmedReply(updatedApp, oldSalary, newSalary);

      await sendDiscordNotification({
        title: "✏️ تم تعديل راتب الطلب من واتساب بعد تأكيد صريح",
        description: `تم تعديل حقل الراتب فقط${oldSalary !== null ? ` من ${oldSalary}` : ""} إلى ${newSalary} دينار.`,
        color: 0x57f287,
        app: updatedApp,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });

      return deterministicReply;
    } catch (error) {
      deterministicReply = `وصل تأكيدك، لكن تعذر تعديل الراتب الآن، لذلك بقيت البيانات القديمة كما هي.

لا تقدم طلبًا جديدًا ولا تعيد المحاولة أكثر من مرة. تم وضع الرسالة للمتابعة.
رقم الطلب: ${app.tracking_id || app.id}`;

      await sendDiscordNotification({
        title: "⚠️ فشل تعديل راتب الطلب من واتساب",
        description: "العميل أكد تعديل الراتب، لكن تحديث حقل salary في قاعدة البيانات فشل.",
        color: 0xed4245,
        app,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });

      return deterministicReply;
    }
  }

  if (app && String(intent) === "application_data_correction") {
    const correctionContext = [
      ...(conversationMemory.lastCustomerMessages || []),
      text,
    ].join("\n");
    const hasPendingSalaryConfirmation = (conversationMemory.lastAssistantReplies || []).some((reply) =>
      /اكد تعديل الراتب|أكد تعديل الراتب/i.test(String(reply || ""))
    );

    deterministicReply = applicationDataCorrectionReply(app, correctionContext, hasPendingSalaryConfirmation);

    await sendDiscordNotification({
      title: "📝 طلب تصحيح بيانات الطلب من واتساب",
      description: "العميل طلب تصحيح الراتب. لم يتم تغيير البيانات قبل وصول تأكيد صريح بالصيغة المطلوبة.",
      color: 0xfee75c,
      app,
      customerPhone: from,
      customerMessage: text,
      systemReply: deterministicReply,
      baseUrl,
    });

    return deterministicReply;
  }

  if (app && isReviewTimeText(text) && isProcedureQuestionText(text)) {
    return reviewAndProcedureReply(app);
  }

  if (app && (String(intent) === "requirements" || isProcedureQuestionText(text))) {
    const directReply = directRequirementQuestionReply(app, text);
    if (directReply) return directReply;
  }

  if (String(intent) === "media_upload" || String(intent) === "document_upload") {
    const uploadReply = officialUploadInstructionReply({
      app,
      baseUrl,
      from,
      text,
      intent,
      messageType,
      memory: conversationMemory,
    });

    return uploadReply;
  }

  if (app && String(intent) === "continue_decision") {
    // V1.4.3: current-message wording is authoritative for continue/stop decisions.
    if (isNaturalNonContinuationText(rawCustomerText) || isExplicitNonContinuationText(rawCustomerText)) {
      return voluntaryOptOutReply(app, false);
    }

    const explicitContinue = isNaturalContinueText(rawCustomerText) ||
      isPositiveContinueDecisionText(rawCustomerText) ||
      (pendingContinueDecision && isSimpleContinueConfirmationText(rawCustomerText));
    if (!explicitContinue) {
      return `إذا بدك تكمل الطلب اكتب: أريد الاستمرار
رقم الطلب: ${app.tracking_id || app.id}`;
    }

    if (
      app.status === "customer_confirmed_continue" ||
      ["pending", "pending_payment", "payment_info_sent"].includes(app.payment_status || "")
    ) {
      deterministicReply = paymentMessage(app, baseUrl);
      return deterministicReply;
    }

    if (app.status !== "preliminary_qualified") {
      deterministicReply = `تمام، طلبك مستمر وحالته الحالية: ${statusHumanLabel(app.status || "")}.

حاليًا ما في خطوة جديدة مطلوبة منك.
رقم الطلب: ${app.tracking_id || app.id}`;

      await sendDiscordNotification({
        title: "⚠️ رد استمرار خارج حالة التأهيل المبدئي",
        description: "العميل أرسل موافقة على الاستمرار، لكن حالة الطلب ليست preliminary_qualified، لذلك لم يتم إرسال معلومات الدفع.",
        color: 0xfee75c,
        app,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });
      return deterministicReply;
    }

    const updatedApp = await updateCustomerDecision({ app, decision: "continue" });
    deterministicReply = paymentMessage(updatedApp, baseUrl);

    await sendDiscordNotification({
      title: "✅ العميل وافق على الاستمرار — تم إرسال معلومات الدفع",
      description: "تم تسجيل موافقة العميل على الاستمرار وإرسال معلومات فتح الملف ورابط رفع الوصل تلقائيًا.",
      color: 0x57f287,
      app: updatedApp,
      customerPhone: from,
      customerMessage: text,
      systemReply: deterministicReply,
      baseUrl,
    });
      return deterministicReply;
  }

  if (app && String(intent) === "tracking_link_request") {
    return trackingLinkReply(app, baseUrl);
  }

  if (app && String(intent) === "cancel_refund_request") {
    deterministicReply = cancelRefundRequestReply(app);

    await sendDiscordNotification({
      title: "🟠 العميل طلب إلغاء واسترداد",
      description: "تم طلب تأكيد صريح قبل إلغاء الطلب وإرسال رابط الاسترداد.",
      color: 0xfee75c,
      app,
      customerPhone: from,
      customerMessage: text,
      systemReply: deterministicReply,
      baseUrl,
    });

    return deterministicReply;
  }

  if (app && String(intent) === "cancel_request") {
    deterministicReply = cancelRequestReply(app, baseUrl, text);

    await sendDiscordNotification({
      title: "🟠 العميل يفكر بإلغاء الطلب",
      description: "لم يتم إلغاء الطلب. تم إرسال رد تهدئة وطلب تأكيد صريح قبل أي إلغاء.",
      color: 0xfee75c,
      app,
      customerPhone: from,
      customerMessage: text,
      systemReply: deterministicReply,
      baseUrl,
    });

    return deterministicReply;
  }

  if (app && String(intent) === "cancel_confirmed") {
    // V1.2.0 DESTRUCTIVE ACTION GATE: classifier output alone can never cancel an order.
    if (!isExactCancelConfirmationText(rawCustomerText) || isConditionalCancellationText(rawCustomerText)) {
      deterministicReply = cancelRequestReply(app, baseUrl, rawCustomerText);

      await sendDiscordNotification({
        title: "🛡️ تم منع إلغاء ملتبس",
        description: "صُنفت الرسالة كإلغاء مؤكد، لكن النص الخام لا يحتوي تأكيد الإلغاء الدقيق. لم يتم تغيير حالة الطلب.",
        color: 0xfee75c,
        app,
        customerPhone: from,
        customerMessage: rawCustomerText,
        systemReply: deterministicReply,
        baseUrl,
      });

      return deterministicReply;
    }

    let updatedApp: ApplicationRecord;

    try {
      updatedApp = await updateCustomerDecision({ app, decision: "decline" });
    } catch (error) {
      deterministicReply = cancelUpdateFailedReply(app);

      await sendDiscordNotification({
        title: "⚠️ فشل تحديث الإلغاء تلقائيًا",
        description: "العميل أكد الإلغاء، لكن تحديث حالة الطلب في قاعدة البيانات فشل.",
        color: 0xed4245,
        app,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });

      return deterministicReply;
    }

    deterministicReply = declineConfirmationMessage(updatedApp, baseUrl);

    await sendDiscordNotification({
      title: "❌ تم إلغاء الطلب بعد تأكيد صريح",
      description: "العميل أكد الإلغاء بعبارة واضحة، وتم إلغاء الطلب.",
      color: 0xed4245,
      app: updatedApp,
      customerPhone: from,
      customerMessage: text,
      systemReply: deterministicReply,
      baseUrl,
    });

    return deterministicReply;
  }

  if (app && String(intent) === "refund") {
    const alreadyRequested = app.status === "refund_requested" || app.payment_status === "refund_requested";
    const alreadyCompleted = app.status === "refund_completed";
    const paymentEvidence = hasConfirmedRefundPayment(app);

    // V1.1.9.1: a refund state without confirmed-payment evidence is inconsistent.
    // Never continue or reinforce that state automatically.
    if ((alreadyRequested || alreadyCompleted) && !paymentEvidence) {
      deterministicReply = unpaidRefundGuardReply(app);

      await sendDiscordNotification({
        title: "🚨 REFUND INTEGRITY GUARD — حالة استرداد بدون دفع مؤكد",
        description: "تم منع متابعة حالة استرداد غير متسقة لأن الطلب لا يحتوي دليل دفع مؤكد. يلزم فحص الطلب يدويًا وتصحيح حالته إذا كان متأثرًا بخطأ سابق.",
        color: 0xed4245,
        app,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });

      return deterministicReply;
    }

    if (alreadyCompleted) {
      deterministicReply = refundCompletedReply(app);
    } else if (alreadyRequested) {
      deterministicReply = refundAlreadyRequestedReply(app, text);
    } else if (!isExplicitRefundMutationText(rawCustomerText)) {
      deterministicReply = `إذا قصدك فعلًا تطلب استرداد رسوم فتح الملف اكتب: أريد استرداد رسوم فتح الملف
رقم الطلب: ${app.tracking_id || app.id}`;
    } else if (!paymentEvidence) {
      deterministicReply = unpaidRefundGuardReply(app);

      await sendDiscordNotification({
        title: "🛡️ تم منع استرداد لطلب غير مدفوع",
        description: "وصلت رسالة صُنفت كاسترداد، لكن لا يوجد دفع مؤكد على الطلب. لم يتم تغيير حالة الطلب ولم يتم إرسال رابط الاسترداد.",
        color: 0xfee75c,
        app,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });

      return deterministicReply;
    } else {
      const updatedApp = await markRefundRequested(app);

      // Defense in depth: do not claim registration unless the state actually changed or was already valid.
      if (!hasValidActiveRefund(updatedApp)) {
        deterministicReply = unpaidRefundGuardReply(app);
        return deterministicReply;
      }

      deterministicReply = refundFirstRequestReply(updatedApp, baseUrl);

      await sendDiscordNotification({
        title: "💸 طلب استرداد من واتساب — تم تسجيل الحالة قيد الاسترداد",
        description: "تم إرسال رابط الاسترداد مرة واحدة فقط بعد التحقق من وجود دفع مؤكد، وتحديث حالة الطلب إلى refund_requested.",
        color: 0xfee75c,
        app: updatedApp,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });
    }

    return deterministicReply;
  }

  if (app) {
    const documentAutomationReply = await handleDocumentAutomation({
      app,
      baseUrl,
      from,
      text,
      intent,
    });

    if (documentAutomationReply) {
      const exactDocumentOperation = ["media_upload", "document_upload", "document_followup"].includes(String(intent)) ||
        isDocumentLinkRequestText(rawCustomerText);

      if (exactDocumentOperation) return documentAutomationReply;

      // V1.4.3: requirements/status replies keep document facts exact, but Pro
      // phrases them around the customer's actual concern instead of exposing a form template.
      return humanizeReply({
        customerText: rawCustomerText,
        deterministicReply: documentAutomationReply,
        customerName: firstTwoNames(app.full_name),
        trackingId: app.tracking_id || app.id,
        status: app.status || null,
        paymentStatus: app.payment_status || null,
        deviceName: app.device_name || null,
        isSensitive: false,
        hasApplication: true,
        intent,
      });
    }
  }

  if (String(intent) === "emotional_pressure") {
    deterministicReply = emotionalPressureReply(baseUrl, from, app, text);

    return humanizeReply({
      customerText: text,
      deterministicReply,
      customerName: app ? firstTwoNames(app.full_name) : undefined,
      trackingId: app ? app.tracking_id || app.id : tracking || undefined,
      status: app?.status || null,
      paymentStatus: app?.payment_status || null,
      deviceName: app?.device_name || null,
      isSensitive: true,
      hasApplication: Boolean(app),
      intent,
    });
  }

  if (String(intent) === "site_issue") {
    deterministicReply = siteIssueReply(baseUrl, from, app, tracking, rawCustomerText);

    return humanizeReply({
      customerText: text,
      deterministicReply,
      customerName: app ? firstTwoNames(app.full_name) : undefined,
      trackingId: app ? app.tracking_id || app.id : tracking || undefined,
      status: app?.status || null,
      paymentStatus: app?.payment_status || null,
      deviceName: app?.device_name || null,
      isSensitive: true,
      hasApplication: Boolean(app),
      intent,
    });
  }

  if (!app && String(intent) === "keep_request") {
    return keepRequestReply(null);
  }

  if (!app && (String(intent) === "continue_decision" || String(intent) === "decline_decision" || String(intent) === "cancel_refund_request" || String(intent) === "cancel_request" || String(intent) === "cancel_confirmed")) {
    if (String(intent) === "cancel_refund_request" || String(intent) === "cancel_request" || String(intent) === "cancel_confirmed") {
      deterministicReply = cancelRequestWithoutAppReply(from);
    } else {
      deterministicReply = `${humanOpening(`${from}:decision`)}

وصلني قرارك بخصوص الاستمرار، لكن حتى أربطه بالطلب الصحيح ابعث رقم الطلب الذي يبدأ بـ AM-.

مثال:
AM-177...

${BUSINESS_NAME}`;
    }

    await sendDiscordNotification({
      title: "⚠️ رد استمرار/إلغاء بدون طلب مرتبط",
      description: "العميل أرسل قرار استمرار أو إلغاء، لكن لم يتم العثور على طلب من رقمه.",
      color: 0xfee75c,
      customerPhone: from,
      customerMessage: text,
      systemReply: deterministicReply,
      baseUrl,
    });

    return deterministicReply;
  }

  if (app) {
    deterministicReply = safeReply(app, baseUrl, text, intent);

    if (isLegacyLimitedStockUiMessageText(text)) {
      return deterministicReply;
    }

    if (shouldReturnExactCustomerReply(intent)) {
      return deterministicReply;
    }

    return humanizeReply({
      customerText: text,
      deterministicReply,
      customerName: firstTwoNames(app.full_name),
      trackingId: app.tracking_id || app.id,
      status: app.status || null,
      paymentStatus: app.payment_status || null,
      deviceName: customerFacingDeviceName(app.device_name) || null,
      isSensitive: sensitive,
      hasApplication: true,
      intent,
    });
  }

  if (String(intent) === "regulatory_status") {
    deterministicReply = regulatoryStatusReply();
  } else if (String(intent) === "business_identity") {
    deterministicReply = businessIdentityReply();
  } else if (String(intent) === "abuse") {
    deterministicReply = abuseReply(baseUrl, from, null, text);
  } else if (String(intent) === "legal_threat") {
    deterministicReply = legalThreatReply(baseUrl, from, null, text);
  } else if (String(intent) === "social_media_threat") {
    deterministicReply = socialMediaThreatReply(baseUrl, from, null, text);
  } else if (String(intent) === "scam_accusation") {
    deterministicReply = scamAccusationReply(baseUrl, from, null, text);
  } else if (String(intent) === "payment_dispute") {
    deterministicReply = paymentDisputeReply(baseUrl, from, null, text);
  } else if (String(intent) === "device_delay_rage") {
    deterministicReply = deviceDelayRageReply(baseUrl, from, null, text);
  } else if (String(intent) === "emotional_pressure") {
    deterministicReply = emotionalPressureReply(baseUrl, from, null, text);
  } else if (String(intent) === "complaint") {
    deterministicReply = complaintReply(baseUrl, from, null, text);
  } else if (String(intent) === "refund") {
    deterministicReply = refundReply(baseUrl, from, null, text);
  } else if (String(intent) === "cancel_refund_request" || String(intent) === "cancel_request" || String(intent) === "cancel_confirmed") {
    deterministicReply = cancelRequestWithoutAppReply(from);
  } else if (String(intent) === "alternative_payment_source" || String(intent) === "receipt_upload_needed") {
    deterministicReply = alternativePaymentSourceWithoutAppReply(from);
  } else if (["order_status", "review_time"].includes(intent)) {
    deterministicReply = temporaryOrderLookupIssueReply(from, tracking || undefined);
  } else if (String(intent) === "site_issue") {
    deterministicReply = siteIssueReply(baseUrl, from, null, tracking, rawCustomerText);
  } else if (String(intent) === "office_payment_request") {
    const recentAssistantReplies = conversationMemory.lastAssistantReplies || [];
    const policyAlreadyExplained = officeFeePaymentPolicyWasExplained(recentAssistantReplies);
    const explicitInsistence = isOfficeFeePaymentInsistenceText(text);
    const finalClosure = policyAlreadyExplained || explicitInsistence;

    deterministicReply = officeFeePaymentReply(null, finalClosure);

    if (finalClosure && !officeFeePaymentFinalReplyWasSent(recentAssistantReplies)) {
      await sendDiscordNotification({
        title: "🟣 العميل يصر على الدفع في المكتب — جاهز للتجاهل",
        description: "لا يوجد طلب مرتبط بالمحادثة. تم توضيح أن الدفع في المكتب غير متاح وأن الخدمة اختيارية، ثم كرر العميل الإصرار أو رفض وسيلة الدفع الرسمية. لا حاجة لمتابعته ما لم يعود من نفسه.",
        color: 0x9b59b6,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });
    }
  } else if (String(intent) === "voluntary_opt_out") {
    const recentAssistantReplies = conversationMemory.lastAssistantReplies || [];
    const policyAlreadyExplained = paymentRefusalPolicyWasExplained(recentAssistantReplies);
    const paymentOnReceipt = isPaymentOnReceiptRefusalText(text);
    const finalClosure = policyAlreadyExplained || isAbsolutePaymentRefusalText(text);
    deterministicReply = paymentOnReceipt
      ? paymentOnReceiptReply(null, finalClosure)
      : voluntaryOptOutReply(null, finalClosure);
    if (finalClosure && !paymentRefusalFinalClosureWasSent(recentAssistantReplies)) {
      await sendDiscordNotification({
        title: paymentOnReceipt
          ? "🟣 العميل يصر على الدفع عند الاستلام — جاهز للتجاهل"
          : "🟣 العميل رفض الدفع بعد التوضيح — جاهز للتجاهل",
        description: paymentOnReceipt
          ? "لا يوجد طلب مرتبط بالمحادثة. العميل اشترط أو أصر أن الدفع يكون عند استلام الجهاز، وتم توضيح أن الدفع عند الاستلام غير متاح. الحالة جاهزة للمراجعة الإدارية والتجاهل إذا رغبت الإدارة."
          : "لا يوجد طلب مرتبط بالمحادثة. تم توضيح السياسة باختصار والعميل رفض الدفع بوضوح أو كرر الرفض. لا حاجة لتكرار تعليمات الدفع ما لم يعود من نفسه.",
        color: 0x9b59b6,
        customerPhone: from,
        customerMessage: text,
        systemReply: deterministicReply,
        baseUrl,
      });
    }

  } else if (String(intent) === "office_pickup_policy") {
    deterministicReply = officePickupPolicyReply(from, null, baseUrl);
  } else if (String(intent) === "supplier_delay_question") {
    deterministicReply = supplierDelayWithoutAppReply(from);
  } else if (String(intent) === "human_agent") {
    deterministicReply = `أنا معك 🌿

احكيلي شو المشكلة باختصار، وإذا الموضوع متعلق بطلب ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب.

براجع لك الموجود وبعطيك الخطوة المناسبة بدون لف ودوران.`;
  } else if (String(intent) === "system_prompt_request") {
    deterministicReply = systemPromptRequestReply();
  } else if (String(intent) === "loan") {
    deterministicReply = loanReply(from);
  } else if (String(intent) === "contact_info") {
    deterministicReply = contactInfoReply(baseUrl, from);
  } else if (String(intent) === "website") {
    deterministicReply = websiteReply(baseUrl, from);
  } else if (String(intent) === "location") {
    deterministicReply = locationReply(from, null);
  } else if (String(intent) === "installment_info") {
    deterministicReply = installmentInfoReply(baseUrl, from, text, null);
  } else if (String(intent) === "self_employed") {
    deterministicReply = selfEmployedReply(null);
  } else if (String(intent) === "requirements") {
    deterministicReply = requirementsReply(baseUrl, from);
  } else if (String(intent) === "apply") {
    deterministicReply = applyReply(baseUrl, from);
  } else if (String(intent) === "products") {
    deterministicReply = (isProductSpecificationQuestionText(text) || isShortProductSpecificationFollowupText(text) || isProductAccessoryQuestionText(text) || isProductPackagingQuestionText(text))
      ? productSpecificationReply(baseUrl, null, text)
      : productsReply(baseUrl, from);
  } else if (String(intent) === "payment") {
    deterministicReply = paymentGeneralReply(from);
  } else if (String(intent) === "delivery") {
    deterministicReply = `${humanOpening(`${from}:delivery`)}

نعتذر منك بصدق عن أي تأخير أو عدم وضوح بخصوص المواعيد.

التحديث المعتمد حاليًا:
${POST_EID_DELIVERY_STRICT_TEXT}.

لا يوجد موعد استلام نهائي محدد حاليًا. إذا بدك أفحص حالة طلبك تحديدًا، ابعث رقم التتبع، وبعطيك الحالة الموجودة عندي بدون تخمين.`;
  } else if (String(intent) === "review_time") {
    deterministicReply = generalReviewTimeReply(from, text);
  } else if (tracking) {
    deterministicReply = temporaryOrderLookupIssueReply(from, tracking);
  } else if (String(intent) === "greeting") {
    deterministicReply = generalGreetingReply(from, text);
  } else if (String(intent) === "thanks") {
    deterministicReply = `العفو 🌿
بخدمتك بأي وقت.`;
  } else {
    deterministicReply = unknownReply(from, app, text);
  }

  if (isLegacyLimitedStockUiMessageText(text)) {
    return deterministicReply;
  }

  const factualIntentNeedsExactReply = shouldReturnExactHumanFirstReply(intent);

  if (factualIntentNeedsExactReply) {
    return deterministicReply;
  }

  return humanizeReply({
    customerText: text,
    deterministicReply,
    isSensitive: sensitive,
    hasApplication: false,
    intent,
  });
}

type IncomingMessageExtraction = {
  body: string;
  logBody: string;
  isOtpLike: boolean;
  rawPayload: unknown;
};

function maskOtpLikeText(value: string) {
  return String(value || "").replace(/\b(\d{2})(\d{2,6})(\d{0,2})\b/g, (_match, start, middle, end) => {
    const maskedMiddle = "*".repeat(Math.max(String(middle || "").length, 2));
    return `${start}${maskedMiddle}${end || ""}`;
  });
}

function isLikelyOtpMessage(text: string) {
  const raw = String(text || "").trim();
  if (!raw) return false;

  const normalized = normalizeArabicText(raw);
  const digits = digitsOnly(raw);
  const hasOtpContext = hasAny(normalized, [
    "otp",
    "رمز تحقق",
    "كود تحقق",
    "verification code",
    "رمز الدخول",
    "كود الدخول",
    "رمز الامان",
    "رمز الأمان",
  ]);

  const standaloneCandidate = raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\s-]/g, "");
  const looksLikeStandaloneCode = /^\d{4,8}$/.test(standaloneCandidate);
  const hasCodeWithContext = hasOtpContext && /(?:^|\D)\d{4,8}(?:\D|$)/.test(normalized);

  if (digits.startsWith("07") && digits.length === 10) return false;
  if (digits.startsWith("9627") && digits.length === 12) return false;
  if (hasAny(normalized, ["جيجا", "gb", "تيرا", "دينار", "جهاز", "ايفون", "سامسونج", "موديل", "سعه", "سعة"])) return false;

  return looksLikeStandaloneCode || hasCodeWithContext;
}

function sanitizeIncomingRawPayloadForStorage(payload: unknown) {
  try {
    const copy = JSON.parse(JSON.stringify(payload || {}));

    const maskKnownTextFields = (value: any): any => {
      if (!value || typeof value !== "object") return value;

      for (const key of Object.keys(value)) {
        const current = value[key];

        if (typeof current === "string" && ["body", "caption", "text", "title", "description", "payload"].includes(key)) {
          value[key] = isLikelyOtpMessage(current) ? maskOtpLikeText(current) : current;
        } else if (current && typeof current === "object") {
          value[key] = maskKnownTextFields(current);
        }
      }

      return value;
    };

    return maskKnownTextFields(copy);
  } catch {
    return payload;
  }
}

function contactSummary(contacts: WhatsAppMessage["contacts"]) {
  const rows = (contacts || []).map((contact, index) => {
    const name =
      contact?.name?.formatted_name ||
      [contact?.name?.first_name, contact?.name?.last_name].filter(Boolean).join(" ") ||
      `جهة اتصال ${index + 1}`;

    const phones = (contact?.phones || [])
      .map((phone) => phone.phone || phone.wa_id || "")
      .filter(Boolean)
      .join(", ");

    return phones ? `${name}: ${phones}` : name;
  });

  return rows.length ? rows.join("\n") : "تم استلام جهة اتصال.";
}

function extractIncomingMessageForProcessing(message: WhatsAppMessage): IncomingMessageExtraction {
  const type = message.type || "unknown";
  let body = "";

  switch (type) {
    case "text":
      body = message.text?.body || "";
      break;

    case "image":
      body = message.image?.caption
        ? `صورة مرفقة مع تعليق: ${message.image.caption}`
        : "تم استلام صورة من العميل بدون تعليق.";
      break;

    case "document":
      body = [
        "تم استلام ملف من العميل.",
        message.document?.filename ? `اسم الملف: ${message.document.filename}` : "",
        message.document?.caption ? `تعليق الملف: ${message.document.caption}` : "",
        message.document?.mime_type ? `نوع الملف: ${message.document.mime_type}` : "",
      ].filter(Boolean).join("\n");
      break;

    case "audio":
    case "voice":
      body = "تم استلام رسالة صوتية من العميل. لا يوجد تفريغ نصي تلقائي للصوت حاليًا، لذلك يُفضّل طلب توضيح نصي إذا لم يكن السياق كافيًا.";
      break;

    case "video":
      body = message.video?.caption
        ? `تم استلام فيديو من العميل مع تعليق: ${message.video.caption}`
        : "تم استلام فيديو من العميل بدون تعليق.";
      break;

    case "sticker":
      body = message.sticker?.emoji
        ? `تم استلام ملصق من العميل: ${message.sticker.emoji}`
        : "تم استلام ملصق من العميل.";
      break;

    case "location":
      body = [
        "تم استلام موقع من العميل.",
        message.location?.name ? `اسم الموقع: ${message.location.name}` : "",
        message.location?.address ? `العنوان: ${message.location.address}` : "",
        typeof message.location?.latitude === "number" && typeof message.location?.longitude === "number"
          ? `إحداثيات الموقع محفوظة في الرسالة.`
          : "",
      ].filter(Boolean).join("\n");
      break;

    case "contacts":
      body = `تم استلام جهة/جهات اتصال من العميل:\n${contactSummary(message.contacts)}`;
      break;

    case "interactive":
      body =
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        message.interactive?.list_reply?.description ||
        message.interactive?.button_reply?.id ||
        message.interactive?.list_reply?.id ||
        "تم استلام اختيار تفاعلي من العميل.";
      break;

    case "button":
      body = message.button?.text || message.button?.payload || "تم استلام ضغط زر من العميل.";
      break;

    case "reaction":
      body = message.reaction?.emoji
        ? `العميل تفاعل مع رسالة سابقة: ${message.reaction.emoji}`
        : "تم استلام تفاعل من العميل على رسالة سابقة.";
      break;

    default:
      body = `تم استلام رسالة واتساب من نوع ${type}.`;
      break;
  }

  const isOtpLike = isLikelyOtpMessage(body);
  const logBody = isOtpLike ? maskOtpLikeText(body) : body;

  return {
    body: logBody,
    logBody,
    isOtpLike,
    rawPayload: sanitizeIncomingRawPayloadForStorage(message),
  };
}

function otpSafetyReply() {
  return `وصلتني رسالتك 🌿

بس لأمانك، لا تبعث أي رمز تحقق أو OTP خاص بحساباتك أو تطبيقاتك على واتساب.

إذا الموضوع متعلق بطلبك عند الأمين، ابعث رقم التتبع بدل الرمز، وبراجع لك الحالة مباشرة.`;
}


export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}


type IncomingBurstResult = {
  shouldReply: boolean;
  combinedText: string;
  messageCount: number;
};

async function claimIncomingBurstProcessingLock(waId: string, latestMessageId: string) {
  const cleanWaId = String(waId || "").trim();
  const cleanMessageId = String(latestMessageId || "").trim();

  if (!cleanWaId || !cleanMessageId) return { shouldProcess: true, reason: "missing_burst_lock_input" };

  try {
    const { error } = await supabaseAdmin
      .from("whatsapp_outgoing_reply_locks")
      .insert({
        lock_key: `incoming-burst:${cleanWaId}:${cleanMessageId}`,
        wa_id: cleanWaId,
        incoming_message_id: cleanMessageId,
        reply_body: "incoming_burst_processing",
        created_at: new Date().toISOString(),
      });

    if (!error) return { shouldProcess: true, reason: "burst_lock_claimed" };
    if ((error as any).code === "23505") return { shouldProcess: false, reason: "burst_lock_duplicate" };
    if ((error as any).code === "42P01") {
      console.error("whatsapp_outgoing_reply_locks table is missing; incoming burst lock degraded.");
      return { shouldProcess: true, reason: "missing_burst_lock_table" };
    }

    console.error("incoming burst processing lock failed:", error);
    return { shouldProcess: true, reason: "burst_lock_error" };
  } catch (error) {
    console.error("incoming burst processing lock exception:", error);
    return { shouldProcess: true, reason: "burst_lock_exception" };
  }
}


type IncomingBurstRow = {
  id?: string | null;
  message_id?: string | null;
  body?: string | null;
  created_at?: string | null;
  message_type?: string | null;
  raw_payload?: any;
};

function incomingBurstEventTime(row: IncomingBurstRow) {
  const rawTimestamp = Number(row.raw_payload?.timestamp || 0);
  if (Number.isFinite(rawTimestamp) && rawTimestamp > 0) return rawTimestamp * 1000;

  const createdAt = row.created_at ? new Date(row.created_at).getTime() : NaN;
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function compareIncomingBurstRows(a: IncomingBurstRow, b: IncomingBurstRow) {
  const timeDiff = incomingBurstEventTime(a) - incomingBurstEventTime(b);
  if (timeDiff !== 0) return timeDiff;

  // Meta timestamps have second precision. A stable tie-breaker makes every
  // concurrent webhook invocation agree on one winner for same-second messages.
  const aMessageId = String(a.message_id || a.id || "");
  const bMessageId = String(b.message_id || b.id || "");
  return aMessageId.localeCompare(bMessageId);
}

async function collectIncomingMessageBurst(input: {
  waId: string;
  currentMessageId?: string | null;
  currentText: string;
  waitMs?: number;
  lookbackSeconds?: number;
  maxGapMs?: number;
}): Promise<IncomingBurstResult> {
  // ننتظر 10 ثوانٍ بعد كل رسالة. فقط أحدث رسالة في الدفعة ترد،
  // وأي رسالة جديدة خلال الانتظار تجعل الاستدعاء الأقدم ينسحب بلا رد.
  const waitMs = input.waitMs ?? 10000;
  const lookbackSeconds = input.lookbackSeconds ?? 35;
  const maxGapMs = input.maxGapMs ?? 18000;

  await new Promise((resolve) => setTimeout(resolve, waitMs));

  try {
    const since = new Date(Date.now() - lookbackSeconds * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id,message_id,body,created_at,message_type,raw_payload")
      .eq("wa_id", input.waId)
      .eq("direction", "incoming")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(30);

    if (error || !data?.length) {
      if (error) console.error("incoming burst query failed:", error);
      return { shouldReply: true, combinedText: input.currentText, messageCount: 1 };
    }

    const usable = (data as IncomingBurstRow[])
      .filter((row) => String(row.body || "").trim())
      .sort(compareIncomingBurstRows);
    if (!usable.length) {
      return { shouldReply: true, combinedText: input.currentText, messageCount: 1 };
    }

    const latest = usable[usable.length - 1];
    if (
      input.currentMessageId &&
      latest?.message_id &&
      String(latest.message_id) !== String(input.currentMessageId)
    ) {
      return { shouldReply: false, combinedText: "", messageCount: 0 };
    }

    if (latest?.message_id) {
      const burstLock = await claimIncomingBurstProcessingLock(input.waId, String(latest.message_id));
      if (!burstLock.shouldProcess) {
        return { shouldReply: false, combinedText: "", messageCount: 0 };
      }
    }

    // نأخذ آخر مجموعة متصلة فقط، حتى لا تختلط محادثة سابقة قريبة بالرسالة الحالية.
    const tail = [latest];
    for (let index = usable.length - 2; index >= 0; index -= 1) {
      const newerTime = incomingBurstEventTime(tail[0]);
      const olderTime = incomingBurstEventTime(usable[index]);
      if (!Number.isFinite(newerTime) || !Number.isFinite(olderTime) || newerTime - olderTime > maxGapMs) break;
      tail.unshift(usable[index]);
    }

    const combinedText = tail
      .map((row) => String(row.body || "").trim())
      .filter(Boolean)
      .join("\n");

    return {
      shouldReply: true,
      combinedText: combinedText || input.currentText,
      messageCount: tail.length,
    };
  } catch (error) {
    console.error("incoming burst collection failed:", error);
    return { shouldReply: true, combinedText: input.currentText, messageCount: 1 };
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as WhatsAppWebhookBody;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      const contactName = value?.contacts?.[0]?.profile?.name || "";

      for (const statusEvent of ((value?.statuses || []) as any[])) {
        const statusMessageId = String(statusEvent?.id || "");
        const statusValue = String(statusEvent?.status || "");
        const recipientId = String(statusEvent?.recipient_id || "");
        const unixTimestamp = Number(statusEvent?.timestamp || 0);
        const statusTimestamp =
          Number.isFinite(unixTimestamp) && unixTimestamp > 0
            ? new Date(unixTimestamp * 1000).toISOString()
            : new Date().toISOString();

        if (!statusMessageId && !statusValue) continue;

        try {
          let matchedExistingMessage = false;

          if (statusMessageId) {
            const { data: updatedRows, error: updateError } = await supabaseAdmin
              .from("whatsapp_messages")
              .update({
                status: statusValue || null,
                status_timestamp: statusTimestamp,
                raw_payload: statusEvent,
              })
              .eq("message_id", statusMessageId)
              .select("id")
              .limit(1);

            if (updateError) {
              throw updateError;
            }

            matchedExistingMessage = Array.isArray(updatedRows) && updatedRows.length > 0;
          }

          // Meta sends sent/delivered/read webhooks for messages we already logged when sending.
          // Do not insert every status event as a new conversation row, otherwise the dashboard
          // shows duplicate empty outgoing rows and sometimes cannot display a linked customer.
          // Only create a fallback row if Meta sends a status for a message ID that we do not
          // have stored locally.
          if (!matchedExistingMessage && statusMessageId) {
            const statusPhone = recipientId || "";
            await logMessage({
              waId: statusPhone,
              direction: "outgoing",
              body: "",
              messageId: statusMessageId,
              messageType: "status",
              status: statusValue || null,
              statusTimestamp,
              rawPayload: statusEvent,
            });
          }
        } catch (error) {
          console.error("Failed to process WhatsApp status:", error);
        }
      }

      await Promise.all((value?.messages || []).map(async (message) => {
        const from = message.from || "";
        const type = message.type || "unknown";
        const extractedMessage = extractIncomingMessageForProcessing(message);
        const text = extractedMessage.body;
        const incomingUnixTimestamp = Number(message.timestamp || 0);
        const incomingCreatedAt = Number.isFinite(incomingUnixTimestamp) && incomingUnixTimestamp > 0
          ? new Date(incomingUnixTimestamp * 1000).toISOString()
          : undefined;

        if (!from) return;

        const incomingClaim = await claimIncomingWhatsAppMessage({
          messageId: message.id,
          waId: from,
          body: extractedMessage.logBody,
          messageType: type,
          rawPayload: extractedMessage.rawPayload,
        });

        if (!incomingClaim.shouldProcess) {
          console.log("WhatsApp duplicate incoming message skipped:", {
            messageId: message.id,
            waId: from,
            reason: incomingClaim.reason,
          });
          return;
        }

        const incomingIntent = classifyIncomingIntent(text, type);
        const incomingTracking = extractTracking(text);
        let needsHumanReview = shouldFlagHumanReview(text, incomingIntent);

        await markPreviousAiConversationCustomerReplied(from);

        await logMessage({
          waId: from,
          direction: "incoming",
          body: extractedMessage.logBody,
          customerName: contactName,
          messageId: message.id,
          messageType: type,
          intent: incomingIntent,
          trackingId: incomingTracking || null,
          needsHumanReview,
          handledByAi: false,
          rawPayload: extractedMessage.rawPayload,
          createdAt: incomingCreatedAt,
        });

        // V3 production control is fail-safe: if the settings table is absent or unreadable,
        // V3 stays inactive and the currently deployed safe route continues unchanged.
        const v3ProductionControl = await getV3ProductionControl();
        const v3LiveActive = isV3ProductionActive(v3ProductionControl);

        if (type === "reaction") {
          await markIncomingWhatsAppMessageProcessed(message.id);
          return;
        }

        if ((!v3LiveActive || !v3ProductionControl.resumeLegacyIgnored) && await isAutoReplyIgnored(from)) {
          console.log("WhatsApp automatic reply skipped for ignored customer:", {
            waId: from,
            messageId: message.id,
          });
          await markIncomingWhatsAppMessageProcessed(message.id);
          return;
        }

        let processingText = text;
        let processingIntent = incomingIntent;
        let processingMessageType = type;

        if (!extractedMessage.isOtpLike) {
          const burst = await collectIncomingMessageBurst({
            waId: from,
            currentMessageId: message.id,
            currentText: text,
          });

          if (!burst.shouldReply) {
            await markIncomingWhatsAppMessageProcessed(message.id);
            return;
          }

          processingText = burst.combinedText;
          processingMessageType = burst.messageCount > 1 ? "text" : type;
        }

        const preReplyMemory = await getConversationMemory(from, 18);
        // V2.1 CUSTOMER-ONLY PREPROCESSING: legacy assistant history never rewrites the
        // customer's current text or intent before the Conversation OS sees it.
        const replyInputText = processingText;
        processingIntent = classifyIncomingIntent(replyInputText, processingMessageType);
        needsHumanReview = shouldFlagHumanReview(replyInputText, processingIntent);

        // إعادة الفحص بعد تجميع الرسائل؛ يمكن للإدارة ضغط زر التجاهل أثناء نافذة الانتظار.
        if ((!v3LiveActive || !v3ProductionControl.resumeLegacyIgnored) && await isAutoReplyIgnored(from)) {
          console.log("WhatsApp automatic reply skipped after burst for ignored customer:", {
            waId: from,
            messageId: message.id,
          });
          await markIncomingWhatsAppMessageProcessed(message.id);
          return;
        }

        const replyStartedAt = Date.now();
        const targetReplyDelayMs = humanReplyDelayMs(processingIntent, processingText, type);
        await sendWhatsAppTypingIndicator(message.id);

        if (isMediaUploadMessageType(type)) {
          const mediaBurstClaim = await claimMediaBurstReplyLock({
            waId: from,
            incomingMessageId: message.id,
            windowSeconds: 90,
          });

          if (!mediaBurstClaim.shouldReply) {
            console.log("Skipped duplicate media burst reply", {
              waId: from,
              messageId: message.id,
              reason: mediaBurstClaim.reason,
            });
            await markIncomingWhatsAppMessageProcessed(message.id);
            return;
          }
        }

        if (extractedMessage.isOtpLike) {
          const reply = applyFinalSendGuard(otpSafetyReply(), null);

          const outgoingClaim = await claimOutgoingReplyLock({
            waId: from,
            incomingMessageId: message.id,
            reply,
            windowSeconds: 20,
          });

          if (outgoingClaim.shouldSend && !(await hasRecentlySentSameReply(from, reply, 30))) {
            await waitUntilReplyLooksHuman(replyStartedAt, targetReplyDelayMs);

            if ((!v3LiveActive || !v3ProductionControl.resumeLegacyIgnored) && await isAutoReplyIgnored(from)) {
              console.log("WhatsApp OTP safety reply skipped because customer was ignored before send:", {
                waId: from,
                messageId: message.id,
              });
              await markIncomingWhatsAppMessageProcessed(message.id);
              return;
            }

            const outgoingMessageId = await sendWhatsAppText(from, reply);
            await logMessage({
              waId: from,
              direction: "outgoing",
              body: reply,
              messageId: outgoingMessageId || undefined,
              intent: incomingIntent,
              trackingId: incomingTracking || null,
              needsHumanReview: true,
              handledByAi: true,
            });
          } else {
            console.log("Skipped duplicate OTP safety reply", { waId: from, messageId: message.id, reason: outgoingClaim.reason });
          }
          await markIncomingWhatsAppMessageProcessed(message.id);
          return;
        }

        // V3 PHASE 6 LIVE CUTOVER. When explicitly activated in DB, V3 owns the
        // customer turn end-to-end. Legacy AUTO_REPLY_IGNORED markers are intentionally
        // bypassed so conversations previously "handed off" do not remain abandoned.
        if (v3LiveActive) {
          const v3TurnId = message.id || `fallback:${from}:${message.timestamp || Date.now()}`;
          const v3RecentTurns = String(preReplyMemory.conversationContext || "")
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(-24);

          let v3Run: Awaited<ReturnType<typeof runV3ProductionLive>> | null = null;
          let reply = "";

          try {
            v3Run = await runV3ProductionLive({
              waId: from,
              turnId: v3TurnId,
              customerText: replyInputText,
              recentTurns: v3RecentTurns,
              realActionsEnabled: v3ProductionControl.realActionsEnabled,
            });
            reply = v3Run.reply || buildV3LastResortReply();
          } catch (v3RuntimeError) {
            console.error("V3 live runtime failed", { waId: from, messageId: message.id || null, error: v3RuntimeError });
            reply = buildV3LastResortReply();
            try {
              await notifyV3Discord({
                event: "final_safety_fail_closed",
                waId: from,
                title: "V3 — Runtime failure",
                description: "فشل Runtime المباشر وتم إرسال رد احتياطي لا يدعي أي إجراء.",
                details: { messageId: message.id || null, error: v3RuntimeError instanceof Error ? v3RuntimeError.message : String(v3RuntimeError) },
              });
            } catch (v3NotifyError) {
              console.error("V3 runtime failure notification failed", v3NotifyError);
            }
          }

          const outgoingClaim = await claimOutgoingReplyLock({
            waId: from,
            incomingMessageId: message.id,
            reply,
            windowSeconds: 20,
          });
          const alreadySentSameReply = !outgoingClaim.shouldSend || (
            outgoingClaim.reason !== "outgoing_lock_claimed" &&
            await hasRecentlySentSameReply(from, reply, 30)
          );

          if (!alreadySentSameReply) {
            await waitUntilReplyLooksHuman(replyStartedAt, targetReplyDelayMs);

            // Do NOT honor legacy AUTO_REPLY_IGNORED here. V3 has no human-handoff pause.
            // First try the verified V3 reply. If Meta rejects it, do NOT retry the same body:
            // retry once with a short URL-free emergency message. If that also fails, trip
            // the V3 circuit breaker so the next customer turn goes to the safe route.
            let replyActuallySent = reply;
            let sendAttempt = await sendWhatsAppTextDetailed(from, reply, true);
            let outgoingMessageId = sendAttempt.messageId;
            let emergencyDeliveryUsed = false;

            if (!outgoingMessageId) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              const emergencyReply = buildV3LastResortReply();
              const emergencyAttempt = await sendWhatsAppTextDetailed(from, emergencyReply, false);
              if (emergencyAttempt.messageId) {
                outgoingMessageId = emergencyAttempt.messageId;
                replyActuallySent = emergencyReply;
                emergencyDeliveryUsed = true;
                console.warn("V3 primary WhatsApp reply rejected; emergency reply delivered", {
                  waId: from,
                  firstStatus: sendAttempt.httpStatus,
                  firstCode: sendAttempt.errorCode,
                });
              } else {
                const circuitTripped = await tripV3ProductionCircuitBreaker("whatsapp_delivery_failed_after_safe_retry");
                console.error("V3 WhatsApp delivery failed after safe retry", {
                  waId: from,
                  firstStatus: sendAttempt.httpStatus,
                  firstCode: sendAttempt.errorCode,
                  secondStatus: emergencyAttempt.httpStatus,
                  secondCode: emergencyAttempt.errorCode,
                  circuitTripped,
                });
                try {
                  await notifyV3Discord({
                    event: "whatsapp_delivery_failure",
                    applicationId: v3Run?.truthAfterActions.application?.id || null,
                    trackingId: v3Run?.truthAfterActions.application?.trackingId || null,
                    waId: from,
                    description: "تعذر إرسال الرد الأساسي ثم الرد القصير الآمن. تم إيقاف V3 تلقائيًا حتى لا تتكرر خسارة الرسائل.",
                    details: {
                      "حالة واتساب": emergencyAttempt.httpStatus || sendAttempt.httpStatus || "غير متوفر",
                      "رمز الخطأ": emergencyAttempt.errorCode || sendAttempt.errorCode || "غير متوفر",
                    },
                  });
                  if (circuitTripped) {
                    await notifyV3Discord({
                      event: "v3_circuit_breaker_tripped",
                      applicationId: v3Run?.truthAfterActions.application?.id || null,
                      trackingId: v3Run?.truthAfterActions.application?.trackingId || null,
                      waId: from,
                      description: "تم إيقاف V3 تلقائيًا. الرسائل الجديدة ستعود للمسار الآمن إلى أن تتم المراجعة.",
                    });
                  }
                } catch (v3SendNotifyError) {
                  console.error("V3 send failure notification failed", v3SendNotifyError);
                }
              }
            }

            if (outgoingMessageId) {
              await logMessage({
                waId: from,
                direction: "outgoing",
                body: replyActuallySent,
                messageId: outgoingMessageId,
                intent: processingIntent,
                trackingId: v3Run?.truthAfterActions.application?.trackingId || extractTracking(replyInputText) || incomingTracking || null,
                needsHumanReview: false,
                handledByAi: true,
              });

              await logAiConversation({
                phone: from,
                customerMessage: processingText,
                aiReply: replyActuallySent,
                intent: processingIntent,
                applicationStatus: v3Run?.truthAfterActions.application?.status || null,
              });
            } else {
              console.error("V3 outgoing reply was NOT logged as sent because WhatsApp delivery failed", {
                waId: from,
                messageId: message.id || null,
              });
            }

            // Commit conversation state only after the intended V3 reply was actually delivered.
            if (v3Run && outgoingMessageId && !emergencyDeliveryUsed) {
              try {
                await saveV3ConversationState(v3Run.stateAfter);
              } catch (v3StateError) {
                console.error("V3 state save failed after send", { waId: from, messageId: message.id || null, error: v3StateError });
                try {
                  await notifyV3Discord({
                    event: "truth_integrity_failure",
                    applicationId: v3Run.truthAfterActions.application?.id || null,
                    trackingId: v3Run.truthAfterActions.application?.trackingId || null,
                    waId: from,
                    title: "⛔ تعذر حفظ حالة المحادثة",
                    description: "تم إرسال الرد لكن تعذر حفظ حالة المحادثة الدائمة.",
                    details: { messageId: message.id || null },
                  });
                } catch {}
              }
            }
          } else {
            console.log("Skipped duplicate V3 outgoing reply", { waId: from, messageId: message.id, reason: outgoingClaim.reason });
          }

          await markIncomingWhatsAppMessageProcessed(message.id);
          return;
        }

        // V2.1 PRODUCTION CONVERSATION OS: current safe route remains available only
        // when V3 is not explicitly active or its emergency kill switch is engaged.
        const v2Production = await prepareV2ProductionTurn({
          waId: from,
          incomingMessageId: message.id || `fallback:${from}:${message.timestamp || Date.now()}`,
          customerText: replyInputText,
          messageType: processingMessageType,
          lastCustomerMessages: preReplyMemory.lastCustomerMessages,
        });
        if (v2Production.active && v2Production.forcedIntent) {
          processingIntent = v2Production.forcedIntent;
        }

        if (!v2Production.active || !v2Production.turn) {
          await logV2ProductionNoReply({
            preparation: v2Production,
            waId: from,
            incomingMessageId: message.id || `fallback:${from}:${message.timestamp || Date.now()}`,
            customerText: replyInputText,
          });
          console.warn("V2.1 no-auto-reply route", {
            waId: from,
            messageId: message.id || null,
            reason: v2Production.fallbackReason || "inactive",
            mode: v2Production.mode,
          });
          await markIncomingWhatsAppMessageProcessed(message.id);
          return;
        }

        let outgoingMemory = preReplyMemory;
        let finalApplication: ApplicationRecord | null = null;
        let shadowTrackingId: string | null = null;
        let v2WriterResult: V2ProductionWriteResult | null = null;
        let v2Truth: V2ResolvedTruth | null = null;
        let v2ActionExecution: V2ActionExecution | null = null;
        let reply = "";

        if (v2Production.active && v2Production.turn) {
          // FINAL TRUE OS CUTOVER: V2 resolves Supabase truth directly. Legacy assistant
          // replies are not used as truth, and no legacy reply guard may rewrite V2 output.
          v2Truth = await resolveV2Truth({
            waId: from,
            customerText: replyInputText,
            preparation: v2Production,
          });
          finalApplication = v2Truth.application;
          if (v2Production.forcedIntent) processingIntent = v2Production.forcedIntent;
          needsHumanReview = shouldFlagHumanReview(replyInputText, processingIntent);

          v2ActionExecution = await executeV2Action({
            waId: from,
            incomingMessageId: message.id || `fallback:${from}:${message.timestamp || Date.now()}`,
            customerText: replyInputText,
            forcedIntent: v2Production.forcedIntent,
            turn: v2Production.turn,
            application: finalApplication,
          });

          // Any state-changing action is re-read from Supabase before writing the customer reply.
          if (v2ActionExecution.requested) {
            v2Truth = await resolveV2Truth({
              waId: from,
              customerText: finalApplication?.tracking_id ? `${replyInputText}\n${finalApplication.tracking_id}` : replyInputText,
              preparation: v2Production,
            });
            finalApplication = v2Truth.application || finalApplication;
          }

          shadowTrackingId =
            extractTracking(replyInputText) ||
            incomingTracking ||
            finalApplication?.tracking_id ||
            null;

          v2WriterResult = await writeV2ProductionReply({
            preparation: v2Production,
            waId: from,
            incomingMessageId: message.id || `fallback:${from}:${message.timestamp || Date.now()}`,
            customerText: replyInputText,
            truth: v2Truth,
            actionExecution: v2ActionExecution,
            lastCustomerMessages: preReplyMemory.lastCustomerMessages,
          });
          reply = v2WriterResult.reply;

          // LAST WRITER WINS: after this point V1 does not rewrite V2. Only the send lock,
          // human-like delay, WhatsApp send, and logging are permitted to touch the flow.
        }

        const outgoingClaim = await claimOutgoingReplyLock({
          waId: from,
          incomingMessageId: message.id,
          reply,
          windowSeconds: 20,
        });
        const alreadySentSameReply = !outgoingClaim.shouldSend || (
          outgoingClaim.reason !== "outgoing_lock_claimed" &&
          await hasRecentlySentSameReply(from, reply, 30)
        );

        if (!alreadySentSameReply) {
          await waitUntilReplyLooksHuman(replyStartedAt, targetReplyDelayMs);

          if ((!v3LiveActive || !v3ProductionControl.resumeLegacyIgnored) && await isAutoReplyIgnored(from)) {
            console.log("WhatsApp automatic reply skipped because customer was ignored before send:", {
              waId: from,
              messageId: message.id,
            });
            await markIncomingWhatsAppMessageProcessed(message.id);
            return;
          }

          const outgoingMessageId = await sendWhatsAppText(from, reply);
          await logMessage({
            waId: from,
            direction: "outgoing",
            body: reply,
            messageId: outgoingMessageId || undefined,
            intent: processingIntent,
            trackingId: extractTracking(replyInputText) || incomingTracking || null,
            needsHumanReview,
            handledByAi: true,
          });

          const aiMemoryApp = finalApplication;
          await logAiConversation({
            phone: from,
            customerMessage: processingText,
            aiReply: reply,
            intent: processingIntent,
            applicationStatus: aiMemoryApp?.status || null,
          });

          if (v2Production.active && v2Production.turn && v2Production.state && v2Truth) {
            await commitV2ProductionState({
              preparation: v2Production,
              waId: from,
              incomingMessageId: message.id || `fallback:${from}:${message.timestamp || Date.now()}`,
              customerText: replyInputText,
              finalReply: reply,
              truth: v2Truth,
              actionExecution: v2ActionExecution,
              writerResult: v2WriterResult,
            });
            try {
              await applyV2PostSendAction({ waId: from, actionExecution: v2ActionExecution });
            } catch (postSendActionError) {
              console.error("V2.1 post-send action failed", { waId: from, messageId: message.id || null, error: postSendActionError });
            }
          }

          // Enqueue the comparison only after the real reply is successfully sent and logged.
          // This insert is idempotent and uses a dedicated table; it never delays on an LLM call.
          try {
            await enqueueShadowJob({
              incomingMessageId: message.id || `fallback:${from}:${message.timestamp || Date.now()}`,
              waId: from,
              customerName: contactName || null,
              customerMessage: processingText,
              messageType: processingMessageType,
              actualReply: reply,
              initialIntent: processingIntent,
              trackingId: shadowTrackingId,
              application: finalApplication,
              conversationSnapshot: {
                conversationContext: outgoingMemory.conversationContext,
                lastAssistantReplies: outgoingMemory.lastAssistantReplies,
                lastCustomerMessages: outgoingMemory.lastCustomerMessages,
              },
            });
          } catch (shadowQueueError) {
            console.error("Shadow queue insert failed", {
              waId: from,
              messageId: message.id || null,
              error: shadowQueueError,
            });
          }

          // V2.0 CONVERSATION OS PHASE 0+1 — SHADOW ONLY.
          // This queue never writes customer-facing replies and never mutates application/payment/refund state.
          try {
            await enqueueConversationOsShadowJob({
              incomingMessageId: message.id || `fallback:${from}:${message.timestamp || Date.now()}`,
              waId: from,
              customerName: contactName || null,
              customerMessage: processingText,
              messageType: processingMessageType,
              actualReply: reply,
              initialIntent: processingIntent,
              trackingId: shadowTrackingId,
              application: finalApplication,
              conversationSnapshot: {
                conversationContext: outgoingMemory.conversationContext,
                lastAssistantReplies: outgoingMemory.lastAssistantReplies,
                lastCustomerMessages: outgoingMemory.lastCustomerMessages,
              },
            });
          } catch (v2ShadowQueueError) {
            // Additive shadow path: failure is observable but must never affect the real WhatsApp reply.
            console.error("V2 conversation shadow queue insert failed", {
              waId: from,
              messageId: message.id || null,
              error: v2ShadowQueueError,
            });
          }
        } else {
          console.log("Skipped duplicate outgoing reply", {
            waId: from,
            messageId: message.id,
            intent: processingIntent,
            reason: outgoingClaim.reason,
          });
        }

        await markIncomingWhatsAppMessageProcessed(message.id);
            }));
    }
  }

  return NextResponse.json({ ok: true });
}
