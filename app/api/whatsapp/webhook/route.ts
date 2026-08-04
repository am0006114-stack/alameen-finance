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
  guarantorUrl,
  identityUrl,
  receiptUrl,
  salarySlipUrl,
  trackUrl,
} from "./_lib/links";
import { getConversationMemory } from "./_lib/conversationMemory";
import { enqueueShadowJob } from "./_lib/shadow-core";

import {
  findApplicationByPhone,
  findApplicationByTracking,
  findApplicationByTrackingAndPhone,
} from "./_lib/applicationLookup";

export const dynamic = "force-dynamic";



function isGreeting(text: string) {
  const t = normalizeArabicText(text);
  return ["مرحبا", "هلا", "السلام عليكم", "مساء الخير", "صباح الخير", "الو", "اهلا", "هاي", "hi", "hello"].includes(t);
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
  ]);

  const asksInsteadOfAccuses = hasAny(t, [
    "كيف", "هل", "شو", "ما هو", "مثلا", "مثلاً", "اتاكد", "أتأكد", "اضمن", "أضمن",
  ]);
  const trustContext = hasAny(t, [
    "نصب", "احتيال", "ثقه", "ثقة", "ضمان", "رسمي", "موثوق", "اتطمن", "أطمئن",
  ]);

  return verificationQuestion || (asksInsteadOfAccuses && trustContext);
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
    "برن عالرقم",
    "برن على الرقم",
    "برن عليكم",
    "ما حدا برد عالرقم",
    "ما حدا برد على الرقم",
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
  ].includes(t);
}

function isSimpleContinueConfirmationText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

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
  let effectiveText = String(customerText || "").trim();

  if (isContextOnlyFollowupText(effectiveText)) {
    const previousQuestion =
      memory.lastQuestionLikeCustomerMessage ||
      memory.lastMeaningfulCustomerMessage ||
      "";

    if (previousQuestion && normalizeArabicText(previousQuestion) !== normalizeArabicText(effectiveText)) {
      effectiveText = `${previousQuestion}\nمتابعة العميل: ${customerText}`;
    }
  }

  let intent = classifyIncomingIntent(effectiveText, messageType);

  if (
    memory.hasRecentPreliminaryApprovalTemplate &&
    isSimpleContinueConfirmationText(customerText)
  ) {
    intent = "continue_decision";
  }

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
  ]);

  if (directPhrases) return true;

  const hasQuestionContext = hasAny(t, [
    "قديش", "كم", "متى", "امتى", "إمتى", "شو المدة", "شو المده",
    "مدة الطلب", "مده الطلب", "متى الرد", "وقت الرد", "بدها وقت", "بده وقت",
    "الطلب باخذ", "الطلب بياخذ", "بتاخذ", "بتاخد", "بياخذ", "بستغرق", "بتطول", "يطول",
    "كم بياخذ وقت", "كم باخذ وقت", "كم بتحتاج وقت", "قديش بتحتاج وقت", "كم يحتاج وقت",
    "قديش بياخذ وقت", "قديش باخذ وقت", "كم بدكم وقت", "كم ودكم وقت", "قديش بدكم وقت",
    "خلال كم", "كم المده", "كم المدة", "بالعادة كم", "متى بتخلص", "امتى بتخلص",
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

  return durationPattern.test(t) || (elapsedPhrase && hasDurationUnit);
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
    "ادفع هسا", "أدفع هسا", "متى ادفع", "متى أدفع", "لازم ادفع هسا", "لازم أدفع هسا",
    "في وقت محدد للدفع", "الدفع متاح متى", "اخر وقت للدفع", "آخر وقت للدفع",
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
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "اكد اعاده تفعيل الطلب", "أكد إعادة تفعيل الطلب", "اكد إعادة تفعيل الطلب",
    "اكد اعاده فتح الطلب", "أكد إعادة فتح الطلب", "نعم رجع الطلب", "نعم ارجع الطلب",
    "نعم أرجع الطلب", "موافق رجع الطلب", "confirm reopen", "reopen confirmed",
  ]);
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

function currentCustomerActionLine(app: ApplicationRecord) {
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
    return `المطلوب منك حاليًا دفع رسوم فتح الملف بقيمة ${FILE_OPENING_FEE_JOD} دنانير ورفع الوصل من الرابط الرسمي.`;
  }

  if (paymentStatus === "customer_claimed_paid") {
    return "الوصل واصل وبانتظار تأكيده، فلا تعيد الدفع.";
  }

  return "حاليًا ما عليك أي خطوة إضافية.";
}

function reviewTimeReply(from: string, app?: ApplicationRecord | null, baseUrl?: string, customerText = "") {
  if (!app) {
    if (isLongDelayComplaintText(customerText)) {
      return `معك حق، الانتظار طال أكثر من المعتاد.

مدة المراجعة المعتادة من يومين إلى 3 أيام عمل حسب ضغط الطلبات واكتمال البيانات، والجمعة والسبت ما بتنحسب.

ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب حتى أعطيك الحالة الحالية بدقة.`;
    }

    return `مدة دراسة الطلب عادةً من يومين إلى 3 أيام عمل حسب ضغط المراجعات واكتمال البيانات، والجمعة والسبت ما بتنحسب.`;
  }

  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const tracking = app.tracking_id || app.id;

  if (isLongDelayComplaintText(customerText)) {
    return `معك حق، الطلب طال أكثر من المدة المعتادة.

الحالة الظاهرة حاليًا: ${statusHumanLabel(status)}.
حاليًا في ضغط كبير على مراجعة الملفات، والطلبات ماشية حسب ترتيبها، وهذا أثر على سرعة الرد.

ما بدي أعطيك موعد غير مؤكد، وأول ما يظهر قرار فعلي رح يصلك تحديث.
رقم الطلب: ${tracking}`;
  }

  if (status === "approved" || status === "customer_accepts_delivery_delay") {
    return `طلبك عليه موافقة نهائية. سؤال المدة هنا صار متعلق بموعد الاستلام، وما في موعد استلام مؤكد حاليًا.

أول ما يتم اعتماد الموعد رح يصلك تحديث.
رقم الطلب: ${tracking}`;
  }

  if (status === "rejected") {
    return `الطلب غير موافق عليه، وما في دراسة جديدة أو قرار آخر بانتظاره على نفس الطلب.

رقم الطلب: ${tracking}`;
  }

  if (status === "cancelled") {
    return `الطلب ملغي، لذلك ما في دراسة جارية عليه حاليًا.

رقم الطلب: ${tracking}`;
  }

  if (status === "refund_requested" || paymentStatus === "refund_requested") {
    return `طلب الاسترداد مسجل وقيد المراجعة، وما في مدة دراسة موافقة جارية على الطلب حاليًا.

رقم الطلب: ${tracking}`;
  }

  if (paymentStatus === "customer_claimed_paid") {
    return `الوصل حاليًا بانتظار التأكيد، فلا تعيد الدفع.

بعد تأكيد الوصل تُستكمل دراسة الملف، والنتيجة عادةً تحتاج من يومين إلى 3 أيام عمل حسب ضغط المراجعات واكتمال المتطلبات، والجمعة والسبت ما بتنحسب.

رقم الطلب: ${tracking}`;
  }

  if (paymentStatus === "confirmed" || status === "under_review" || ["needs_guarantor", "needs_salary_slip", "needs_identity", "identity_requested", "salary_slip_uploaded", "guarantor_submitted"].includes(status)) {
    return `دراسة الملف عادةً تحتاج من يومين إلى 3 أيام عمل حسب ضغط المراجعات واكتمال المتطلبات، والجمعة والسبت ما بتنحسب.

حالة طلبك الحالية: ${statusHumanLabel(status)}.
${currentCustomerActionLine(app)}
رقم الطلب: ${tracking}`;
  }

  if (
    status === "preliminary_qualified" ||
    status === "customer_confirmed_continue" ||
    ["pending", "pending_payment", "payment_info_sent"].includes(paymentStatus)
  ) {
    return `المدة المعتادة للدراسة من يومين إلى 3 أيام عمل، وتبدأ بعد رفع وصل رسوم فتح الملف وتأكيده. الجمعة والسبت ما بتنحسب.

${currentCustomerActionLine(app)}
رقم الطلب: ${tracking}`;
  }

  return `مدة دراسة الطلب عادةً من يومين إلى 3 أيام عمل حسب ضغط المراجعات واكتمال البيانات، والجمعة والسبت ما بتنحسب.

حالة طلبك الحالية: ${statusHumanLabel(status)}.
رقم الطلب: ${tracking}`;
}

function socialGreetingReply(from: string, app?: ApplicationRecord | null, baseUrl?: string) {
  const variants = [
    "مساء النور 🌿",
    "يا هلا، مساء الخير 🌿",
    "وعليكم السلام ورحمة الله 🌿",
    "هلا فيك 🌿",
    "أهلًا وسهلًا 🌿",
    "صباح النور 🌿",
  ];

  const digits = digitsOnly(from);
  return variants[Number(digits.slice(-2) || "0") % variants.length];
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
  "بفضحكم", "افضحكم", "رح افضحكم", "راح افضحكم", "بنشر عليكم", "انشر عليكم", "سوشال ميديا", "فيسبوك", "تيك توك", "انستغرام",
  "بوست", "منشور", "جروبات", "قروبات", "الناس تعرف", "بحذر الناس", "احذر الناس", "بنزل سكرينات", "سكرينات", "سكرين شوت",
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
  return hasAny(t, LEGAL_THREAT_KEYWORDS);
}

function isSocialMediaThreatText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  return hasAny(t, SOCIAL_MEDIA_THREAT_KEYWORDS);
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
  if (!t) return false;

  if (isExplicitKeepRequestText(t)) return true;

  // لا تعتبر "تمام" أو "أوك" أو "نعم" قرار استمرار بمفردها.
  return hasAny(t, [
    "اود الاستمرار", "أود الاستمرار", "ارغب بالاستمرار", "أرغب بالاستمرار",
    "اريد الاستمرار", "أريد الاستمرار",
    "بدي استمر", "بدي اكمل", "بدي أكمل", "تمام كمل", "تمام اكمل",
    "خلينا نكمل", "نكمل بالطلب", "كمل بالطلب", "اكمل بالطلب", "استمر بالطلب",
    "افتح الملف", "افتحو الملف", "افتحولي الملف", "بدي افتح الملف",
    "بدي ادفع رسوم فتح الملف", "ابعث تعليمات الدفع", "ابعت تعليمات الدفع",
    "ارسل تعليمات الدفع", "جاهز ادفع رسوم فتح الملف",
    "موافق على الجهاز", "موافق عالجهاز", "تمام موافق على الجهاز", "تمام موافق عالجهاز",
    "موافق 100%", "موافق ميه بالميه", "موافق مية بالمية",
    "confirm continue", "continue application", "yes continue",
  ]);
}

function isDeclineDecisionText(text: string) {
  return isCancelRequestText(text) || isCancelConfirmedText(text);
}

function isCancelConfirmedText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const confirmationPhrases = [
    "اكد الغاء الطلب", "اكد الغاء", "اكد الالغاء", "اكد الإلغاء", "أكد إلغاء الطلب", "أكد الإلغاء",
    "نعم اكد الغاء", "نعم الغي نهائيا", "نعم ألغي نهائيًا", "الغيه نهائيا", "الغيه نهائيًا",
    "الغوا نهائيا", "الغوا نهائيًا", "الغاء نهائي", "إلغاء نهائي", "متاكد بدي الغي", "متأكد بدي ألغي",
    "متاكد الغي", "متأكد ألغي", "خلص الغي نهائي", "خلص ألغي نهائي", "cancel confirmed",
    "confirm cancel", "yes cancel", "cancel it permanently",
  ];

  const hasConfirmation = hasAny(t, confirmationPhrases);
  const hasCancelContext = hasAny(t, ["الغاء", "الغي", "الغيه", "الغوا", "cancel", "كنسل"]);
  const hasFinalContext = hasAny(t, ["اكد", "أكد", "نعم", "نهائي", "نهائيا", "متاكد", "متأكد", "confirm", "yes"]);

  return hasConfirmation || (hasCancelContext && hasFinalContext);
}

function isCancelRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;
  if (isExplicitKeepRequestText(t)) return false;
  if (isCancelConfirmedText(t)) return false;

  const explicitCancelPhrases = [
    "بدي الغي", "بدي ألغي", "الغي الطلب", "ألغي الطلب", "الغوا الطلب", "لغوا الطلب",
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
  const alreadySent = Boolean(url && sentUrls.includes(url));

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

  const asksForLink = hasAny(t, [
    "ممكن الرابط", "ابعث الرابط", "ابعت الرابط", "ارسل الرابط", "وين الرابط", "هات الرابط",
    "بدي الرابط", "رابط المتابعه", "لينك المتابعه", "الرابط لو سمحت", "link",
  ]);

  const hasLinkWord = hasAny(t, ["رابط", "لينك", "link"]);
  const hasRequestWord = hasAny(t, ["ممكن", "ابعث", "ابعت", "ارسل", "هات", "اعطيني", "وين", "بدي"]);

  return asksForLink || (hasLinkWord && hasRequestWord);
}

function isCancelRefundRequestText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  const cancelContext = hasAny(t, ["الغاء", "الغي", "ألغي", "الغوا", "لغي", "كنسل", "cancel"]);
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
    "الموقع", "السايت", "الرابط", "لينك", "تتبع", "التتبع", "صفحه التتبع", "صفحة التتبع",
    "حاله الطلب", "حالة الطلب", "طلبي", "الطلب", "جلب الطلبات", "البحث عن الطلب", "عرض الطلب",
    "track", "tracking", "website", "site", "link",
  ]);

  const problemContext = hasAny(t, [
    "مش شغال", "ما بشتغل", "ما بفتح", "ما فتح", "ما بطلع", "مش ظاهر", "ما ظهر", "ما بيظهر",
    "خطا", "خطأ", "ايرور", "error", "404", "not found", "تعطل", "واقع", "خربان", "معلق",
    "حاول مره اخرى", "حاول مرة أخرى", "حدث خطا", "حدث خطأ", "ما بجيب", "ما جاب", "مش لاقي",
    "لم يتم العثور", "could not be found", "page could not be found",
  ]);

  return siteContext && problemContext;
}

function isOfficePickupPolicyText(text: string) {
  const t = normalizeArabicText(text);
  if (!t || isOfficeLocationText(t)) return false;

  const aramexContext = hasAny(t, [
    "ارامكس", "أرامكس", "aramex", "ارامكسو", "ارمكس",
  ]);

  const deliveryServiceContext = hasAny(t, [
    "توصيل", "توصلوا", "بتوصلوا", "يوصل", "وصلولي", "وصلوه", "وصلوها", "دليفري", "delivery",
    "شحن", "shipping", "شركة شحن", "شركات شحن", "شركة توصيل", "مندوب", "مندوب توصيل",
    "عالبيت", "على البيت", "للبيت", "للمحافظات", "للمحافظه", "للمحافظة", "خارج عمان", "للاربد", "للزرقاء", "للعقبه", "للعقبة",
  ]);

  const pickupContext = hasAny(t, ["استلام", "استلم", "استلمه", "المكتب", "موعد مسبق", "احضر", "اجي", "أجي"]);
  const officeContext = hasAny(t, ["المكتب", "مكتبكم", "مكتب", "استلام من المكتب", "استلم من المكتب", "موعد مسبق"]);

  return aramexContext || deliveryServiceContext || (pickupContext && officeContext);
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
    "جهاز ثاني",
    "تلفون ثاني",
    "موبايل ثاني",
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

function classifyIntent(text: string): CustomerIntent {
  const t = normalizeArabicText(text);
  const broadText = stripIdentifiersForIntent(t);

  if (!t) return "unknown";

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

  // تغيير الجهاز ليس إلغاءً. يجب حسمه قبل أي منطق إلغاء.
  if (isDeviceChangeText(t)) return "device_change";

  // التراجع عن إلغاء طلب سابق مسار مستقل، ولا يُعامل كطلب استمرار عادي.
  if (isReopenCancelledConfirmedText(t)) return "reopen_cancelled_confirmed";
  if (isReopenCancelledRequestText(t)) return "reopen_cancelled_request";

  // أسئلة الدفع التفصيلية يجب أن تُفهم قبل كلمات المكتب/التوصيل أو الحالة العامة.
  if (isPaymentLinkIssueText(t)) return "payment_link_issue";
  if (isFirstInstallmentQuestionText(t)) return "payment_amount";
  if (isPaymentMethodText(t)) return "payment_method";
  if (isPaymentTimingText(t)) return "payment_timing";
  if (isPaymentRecipientText(t)) return "payment_recipient";
  if (isPaymentReviewTimeText(t)) return "payment_review_time";
  if (isPaymentNextStepText(t)) return "payment_next_step";
  if (isFileOpeningClarificationText(t)) return "payment_objection";
  if (isPaymentObjectionText(t)) return "payment_objection";
  if (isApplicationDataCorrectionConfirmationText(t)) return "application_data_correction_confirmed";
  if (isApplicationDataCorrectionText(t)) return "application_data_correction";
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

  if (isSelfEmployedText(t) || isEmploymentEligibilityQuestionText(t)) return "self_employed";

  if (isMinorEligibilityQuestionText(t)) return "requirements";

  if (isOfficeLocationText(t)) return "location";

  if (isWebsiteText(t)) return "website";

  if (isReceiptUploadConfirmationText(t)) return "receipt_upload_confirmation";
  if (isTrustVerificationText(t)) return "trust_verification";

  // قرارات الإلغاء والاسترداد تشغيلية ويجب أن تُحسم قبل أي تصنيف حساس آخر.
  if (isCancelRefundRequestText(t)) return "cancel_refund_request";

  if (isCancelConfirmedText(t)) {
    return "cancel_confirmed";
  }

  if (isCancelRequestText(t)) {
    return "cancel_request";
  }

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

  if (hasAny(t, [
    "بدي موظف", "احكي مع موظف", "موظف طبيعي", "موظف حقيقي", "حد يحكي معي",
    "بدي احكي مع حدا", "بدي حدا يحكي معي",
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
      "كشف راتب", "راتب", "ضمان", "ضمان اجتماعي", "هويه", "هوية", "هل بحتاج كفيل",
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

  if (hasAny(t, ["شكرا", "شكراً", "اشكرك", "أشكرك", "شكرك", "شكرا الك", "يسلمو", "تسلم", "تمام", "يعطيك العافيه", "يعطيكم العافيه", "مشكور"])) {
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

تم تأكيد رسوم فتح الملف، وطلبكم الآن قيد الدراسة النهائية.

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

تم تأكيد رسوم فتح الملف، وطلبكم الآن قيد الدراسة النهائية.

${paidDevicesReassuranceParagraph(app, "requirements")}

لاستكمال طلبك، عبّي بيانات الكفيل من الرابط التالي:
${guarantorLink}

هذه الخطوة لاستكمال الطلب، ولا تعني رفضه.

رقم التتبع:
${tracking}

${BUSINESS_NAME}`;
}

function statusHumanLabel(status: string) {
  switch (status) {
    case "preliminary_qualified": return "مؤهل مبدئيًا";
    case "customer_confirmed_continue": return "تم تأكيد رغبتكم بالاستمرار";
    case "customer_declined_continue": return "العميل لا يرغب بالاستمرار";
    case "under_review": return "قيد الدراسة النهائية";
    case "approved": return "موافقة نهائية";
    case "rejected": return "غير موافق عليه حاليًا";
    case "needs_identity": return "بانتظار صورة الهوية";
    case "identity_requested": return "بانتظار صورة الهوية";
    case "identity_uploaded": return "تم استلام صور الهوية";
    case "needs_salary_slip": return "بانتظار كشف راتب / شهادة راتب";
    case "salary_slip_uploaded": return "تم استلام كشف الراتب";
    case "first_installment_requested": return "بانتظار دفع القسط الأول";
    case "needs_guarantor": return "بانتظار بيانات كفيل";
    case "guarantor_submitted": return "تم استلام بيانات الكفيل";
    case "customer_accepts_delivery_delay": return "تم اختيار الانتظار لحين وصول الأجهزة واعتماد جدول الاستلام من المكتب";
    case "delivery_delay_notice_sent": return "بانتظار اختيار التمديد أو الاسترداد";
    case "refund_requested": return "طلب استرداد مسجل";
    case "refund_completed": return "تم تنفيذ الاسترداد";
    case "cancelled": return "طلب ملغي";
    default: return "قيد المتابعة";
  }
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
  if (app) {
    if (app.status === "refund_requested" || app.payment_status === "refund_requested") {
      return refundDeescalationReply(app, customerText);
    }

    return `فاهمين إنك منزعج، وحقك يكون عندك تحديث واضح قبل ما تضطر تصعّد الموضوع بأي مكان.

حالة طلبك الحالية:
${statusHumanLabel(app.status || "")}

رقم التتبع:
${app.tracking_id || app.id}

خلينا نحلها بهدوء: احكيلي النقطة المحددة اللي مضايقتك — تأخير، دفع، تسليم، أو مستند ناقص — وبوضحها لك حسب البيانات الظاهرة.

رابط المتابعة:
${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `فاهمين انزعاجك، وحقك يكون عندك جواب واضح.

قبل أي تصعيد، ابعثلي رقم التتبع أو رقم الهاتف المستخدم بالطلب، وبراجعها لك مباشرة وأعطيك الحالة الحالية والخطوة المطلوبة.

${BUSINESS_NAME}`;
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
const PAYMENT_DESTINATION_PRIMARY = "AMENPAY";
const PAYMENT_DESTINATION_SECONDARY = "PAYAMEN";
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

function trustVerificationReply(baseUrl: string, app?: ApplicationRecord | null) {
  const requestLines = app
    ? `
طلبك ظاهر عندي برقم:
${app.tracking_id || app.id}

الحالة الحالية:
${statusHumanLabel(app.status || "")}`
    : "";

  const addressLine = app && (app.status === "approved" || app.status === "customer_accepts_delivery_delay")
    ? `\n- عنوان المكتب: ${BUSINESS_ADDRESS}`
    : "";

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

مهم: رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط، وتكون مستردة في حال عدم الموافقة النهائية. وإذا كان عندك وصل أو إثبات دفع، ابعثه هون حتى نربطه بالحالة الصحيحة.

رابط المتابعة:
${trackUrl(baseUrl, app)}

${BUSINESS_NAME}`;
  }

  return `أكيد، خلينا نراجع موضوع الدفع بدون لخبطة.

ابعثلي رقم التتبع أو رقم الهاتف المستخدم بالطلب، ومعه صورة الوصل إن وجدت، وبوضح لك هل الدفع مسجل وما هي الحالة الحالية.

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

    return `${apology}

طلبك ظاهر عندي وحالته: ${statusHumanLabel(app.status || "")}.
احكيلي الاعتراض نفسه بجملة واضحة — دفع، تأخير، موافقة، أو معلومات تواصل — وبجاوبك على نفس النقطة مباشرة.

رقم الطلب: ${app.tracking_id || app.id}`;
  }

  return `${apology}

احكيلي المشكلة نفسها بجملة واضحة، وإذا مرتبطة بطلب ابعث رقم التتبع أو رقم الهاتف المستخدم بالتقديم حتى أعطيك جوابًا محددًا.`;
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

إذا عندك أي ملاحظة على التحويل، ابعث رقم التتبع وصورة من الحركة حتى نراجعها.

رقم التتبع: ${tracking}`;
}

function refundReply(baseUrl: string, from: string, app?: ApplicationRecord | null, customerText = "") {
  const opening = humanOpening(`${from}:refund`);

  if (app) {
    if (app.status === "refund_completed") {
      return refundCompletedReply(app);
    }

    if (app.status === "refund_requested" || app.payment_status === "refund_requested") {
      return refundAlreadyRequestedReply(app, customerText);
    }

    return refundFirstRequestReply(app, baseUrl);
  }

  return `${opening}

أكيد، بقدر أساعدك بموضوع الاسترداد.

حتى أربطه بالطلب الصحيح، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب.

بعد ما أطلع الطلب، بعطيك رابط الاسترداد الصحيح مرة واحدة وبسجّل الحالة قيد الاسترداد.`;
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

function locationReply(from: string) {
  const opening = humanOpening(`${from}:location`);
  return `${opening}

عنواننا الرسمي:
${BUSINESS_ADDRESS}

للتواصل عبر واتساب:
${BUSINESS_PHONE_DISPLAY}

ملاحظة مهمة: زيارة المكتب لا تتم إلا إذا وصلتك رسالة واضحة من الإدارة تطلب الحضور أو تحدد موعدًا لذلك.

إذا عندك طلب قائم، ابعث رقم التتبع أو رقم الهاتف المستخدم بالطلب وبراجع الحالة مباشرة.`;
}

function loanReply(from: string) {
  const opening = humanOpening(`${from}:loan`);
  return `${opening}

للتوضيح بكل احترام: إحنا في ${BUSINESS_NAME} ما بنقدم قروض نقدية، ولا سلف، ولا تمويل شخصي.

خدمتنا فقط تقسيط أجهزة إلكترونية وهواتف.

إذا بدك تقسط جهاز، ابعثلي نوع الجهاز اللي بدك إياه أو ادخل على الموقع وقدّم الطلب، وبعدها الإدارة بتراجع البيانات.`;
}

function installmentInfoReply(baseUrl: string, from: string) {
  return `نظام التقسيط باختصار:
1. تختار الجهاز وتقدم الطلب من الموقع.
2. يصلك تحديث بالخطوة المطلوبة حسب حالة طلبك.
3. بعد الموافقة النهائية يتم تحديد الاستلام من المكتب، والقسط الأول يكون بعد الاستلام حسب الاتفاق.

رابط التقديم:
${baseUrl}/products`;
}

function requirementsReply(baseUrl: string, from: string) {
  return `المستندات المطلوبة تختلف حسب حالة كل طلب، لذلك لا ترفع أي ورقة من نفسك.

قدّم الطلب أولًا، وإذا احتاج ملفك مستندًا محددًا رح توصلك رسالة باسمه ورابط رفعه.

رابط التقديم:
${baseUrl}/products`;
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
  const tracking = app.tracking_id || app.id;
  const device = customerFacingDeviceName(app.device_name);

  return `تمام ${name}، طلبك مؤهل مبدئيًا ونقدر نبدأ باستكمال دراسة الملف.

الجهاز: ${device}
رقم الطلب: ${tracking}

رسوم فتح الملف ${FILE_OPENING_FEE_JOD} دنانير فقط. هي ليست قسطًا على الجهاز، ودفعها هو الخطوة التي تثبت رغبتك بالاستمرار وتسمح ببدء مراجعة الملف والمتطلبات.

الرسوم مستردة بالكامل في حال عدم الموافقة النهائية، والقسط الأول لا يُدفع الآن؛ يكون بعد استلام الجهاز حسب الاتفاق.

${bankCliqPaymentExplanation()}

${paymentDestinationBlock()}


بعد التحويل ارفع الوصل من رابط طلبك:
${receiptUrl(baseUrl, app)}

بعد تأكيد الوصل تُستكمل الدراسة، والنتيجة عادةً تحتاج من يومين إلى 3 أيام عمل حسب ضغط المراجعات واكتمال المتطلبات، والجمعة والسبت ما بتنحسب.`;
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

بعد تأكيد الوصل تبدأ متابعة الدراسة، وعادةً تحتاج النتيجة من يومين إلى 3 أيام عمل حسب الضغط واكتمال المتطلبات.`;
}

function paymentNextStepReply(app: ApplicationRecord, baseUrl: string) {
  const handled = paymentAlreadyHandledReply(app);
  if (handled) return handled;

  return `بعد دفع رسوم فتح الملف ورفع الوصل من الرابط الرسمي، يتم تأكيد عملية الدفع وربطها بطلبك، وبعدها تُستكمل دراسة الملف والمتطلبات.

${paymentDestinationBlock()}

النتيجة عادةً تحتاج من يومين إلى 3 أيام عمل حسب ضغط المراجعات واكتمال الملف، والجمعة والسبت ما بتنحسب.

رابط رفع الوصل:
${receiptUrl(baseUrl, app)}`;
}

function paymentReviewTimeReply(app: ApplicationRecord) {
  const handled = paymentAlreadyHandledReply(app);
  if (handled) {
    return `${handled}

بعد تأكيد الدفع واكتمال المتطلبات، الدراسة عادةً تحتاج من يومين إلى 3 أيام عمل حسب ضغط المراجعات، والجمعة والسبت ما بتنحسب.`;
  }

  return `بعد دفع رسوم فتح الملف ورفع الوصل، يتم تأكيد الدفع واستكمال دراسة الطلب.

النتيجة عادةً تحتاج من يومين إلى 3 أيام عمل حسب ضغط المراجعات واكتمال البيانات، والجمعة والسبت ما بتنحسب.

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
  return hasAny(t, ["لازم", "هل", "بحتاج", "بحتاج", "مطلوب", "ضروري", "ليش", "ليه", "؟"]);
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
    "شو اجهز اوراق", "شو أجهز أوراق", "شو الاوراق", "شو الأوراق",
    "اي اوراق", "أي أوراق", "الاوراق المطلوبه", "الأوراق المطلوبة",
    "شو الوثائق", "اي وثائق", "أي وثائق", "شو اجيب معي", "شو أجيب معي",
  ]);
}

function isAfterApprovalRequirementQuestionText(text: string) {
  const t = normalizeArabicText(text);
  if (!t) return false;

  return hasAny(t, [
    "بعد الموافقه شو المطلوب", "بعد الموافقة شو المطلوب",
    "بعد الموافقه ماذا يلزم", "بعد الموافقة ماذا يلزم",
    "بعد القبول شو المطلوب", "بعد الاعتماد شو المطلوب",
  ]);
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
    return `بعد الموافقة النهائية ما عليك ترفع أوراق جديدة من نفسك. عند اعتماد موعد الاستلام بتحضر للمكتب بالهوية الأصلية، ويتم توقيع العقد واستكمال القسط الأول حسب الاتفاق.`;
  }

  return `طلبك حاليًا لم يصل للموافقة النهائية بعد. إذا تمت الموافقة، بنرسل لك موعد الاستلام والتعليمات المحددة، وعادةً يكون المطلوب الحضور بالهوية الأصلية لتوقيع العقد واستكمال القسط الأول حسب الاتفاق.`;
}

function reviewAndProcedureReply(app: ApplicationRecord) {
  const status = app.status || "";
  const action = currentCustomerActionLine(app);

  if (status === "preliminary_qualified" || status === "customer_confirmed_continue") {
    return `بعد دفع رسوم فتح الملف ورفع الوصل، ما عليك أي خطوة ثانية إلا إذا وصلك طلب محدد.

مدة المراجعة عادةً من يومين إلى ثلاث أيام عمل، والجمعة والسبت ما بتنحسب.
${action}`;
  }

  return `مدة المراجعة عادةً من يومين إلى ثلاث أيام عمل حسب ضغط الطلبات واكتمال البيانات، والجمعة والسبت ما بتنحسب.

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
  const statusLine = app ? `\nطلبك ظاهر عندي وحالته: ${statusHumanLabel(app.status || "")}.` : "";

  return `معك ${staffName} من فريق الأمين.${statusLine}

تفضل، شو النقطة اللي بدك أراجعها؟`;
}

function callRequestReply(from: string, app?: ApplicationRecord | null) {
  const staffName = assignedStaffName(from);
  const requestLine = app
    ? `طلبك رقم ${app.tracking_id || app.id} ظاهر عندي، وبقدر أتابعه معك هون مباشرة.`
    : "ابعث رقم الطلب أو سؤالك هون وبراجعه معك مباشرة.";

  return `معك ${staffName} من فريق الأمين.

حاليًا بسبب ضغط الاتصالات، متابعة الملفات عبر واتساب هي الأسرع والأدق حتى يظل كل تحديث موثق.

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
  const status = app.status || "";
  const tracking = app.tracking_id || app.id;
  const approvalFollowup = isApprovalStatusQuestionText(customerText) || hasAny(normalizeArabicText(customerText), [
    "يعني تم ولا شو", "تم ولا لا", "يعني تم", "خلص تم", "وافقوا ولا لا",
  ]);

  if (approvalFollowup) {
    if (status === "approved" || status === "customer_accepts_delivery_delay") {
      return `نعم، صدرت الموافقة النهائية على طلبك ✅

حاليًا بانتظار توفر الجهاز واعتماد جدول الاستلام من المكتب.
رقم الطلب: ${tracking}`;
    }

    if (status === "preliminary_qualified") {
      return `تمت الموافقة المبدئية فقط، أما الموافقة النهائية لسا ما صدرت.

إذا حاب تكمل، اكتب: أود الاستمرار.
رقم الطلب: ${tracking}`;
    }

    if (status === "customer_confirmed_continue" || ["pending", "pending_payment", "payment_info_sent"].includes(app.payment_status || "")) {
      return `الموافقة المبدئية تمت، لكن الموافقة النهائية لسا ما صدرت.

المطلوب حاليًا دفع رسوم فتح الملف بقيمة ${FILE_OPENING_FEE_JOD} دنانير ورفع الوصل، وبعد تأكيده تبدأ الدراسة النهائية.
رقم الطلب: ${tracking}`;
    }

    if (status === "under_review") {
      return `لا، لسا ما صدرت الموافقة النهائية. طلبك حاليًا قيد الدراسة والمتابعة.

أول ما يصدر القرار رح يوصلك تحديث مباشرة.
رقم الطلب: ${tracking}`;
    }

    return `لسا ما صدرت الموافقة النهائية. حالة طلبك الحالية: ${statusHumanLabel(status)}.

${currentCustomerActionLine(app)}
رقم الطلب: ${tracking}`;
  }

  if (status === "preliminary_qualified") {
    return `طلبك مؤهل مبدئيًا. إذا بدك تكمل، اكتب: أود الاستمرار.

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

  if (status === "needs_guarantor") {
    return `طلبك حاليًا بحاجة استكمال بيانات الكفيل حتى تكمل الدراسة.

رقم الطلب: ${tracking}`;
  }

  if (status === "needs_salary_slip") {
    return `طلبك حاليًا بحاجة كشف راتب أو شهادة راتب لاستكمال الدراسة.

رقم الطلب: ${tracking}`;
  }

  if (status === "salary_slip_uploaded") {
    return `تم استلام كشف الراتب، والملف الآن بانتظار الخطوة التالية من الدراسة.

رقم الطلب: ${tracking}`;
  }

  if (status === "guarantor_submitted") {
    return `تم استلام بيانات الكفيل، والملف الآن قيد المتابعة والدراسة.

رقم الطلب: ${tracking}`;
  }

  if (status === "approved") {
    return `طلبك عليه موافقة نهائية، وحاليًا بانتظار توفر الجهاز واعتماد جدول الاستلام من المكتب.

رقم الطلب: ${tracking}`;
  }

  if (status === "under_review") {
    return `طلبك ما زال قيد الدراسة والمتابعة، وما في تحديث جديد ظاهر على الملف حاليًا.

رقم الطلب: ${tracking}`;
  }

  if (status === "refund_requested" || app.payment_status === "refund_requested") {
    return `طلب الاسترداد مسجل وقيد المراجعة.

رقم الطلب: ${tracking}`;
  }

  if (status === "cancelled") {
    return `الطلب ظاهر لدينا كطلب ملغي.

رقم الطلب: ${tracking}`;
  }

  return `طلبك ظاهر عندي، وحالته الحالية: ${statusHumanLabel(status)}.

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
  const url = changeDeviceUrl(input.baseUrl, input.app);

  return `أكيد، تغيير الجهاز ما بيلغي طلبك.

حتى تسجل الجهاز والسعة واللون بدون لخبطة، استخدم رابط التعديل الرسمي:
${url}

الجهاز الحالي: ${currentDevice}
بعد إرسال النموذج يبقى الجهاز الحالي كما هو إلى أن تتم مراجعة طلب التعديل واعتماده.`;
}

function repeatedReplyRecoveryReply(intent: CustomerIntent) {
  if (String(intent) === "review_time" || String(intent) === "payment_review_time") {
    return `مدة دراسة الطلب عادةً من يومين إلى 3 أيام عمل حسب ضغط المراجعات واكتمال البيانات، والجمعة والسبت ما بتنحسب.`;
  }

  if (["order_status", "delivery"].includes(String(intent))) {
    return `فاهم إنك بتتابع لأنك منتظر، لكن ما في تحديث جديد مختلف عن آخر حالة ظاهرة حاليًا.

إذا سؤالك عن نقطة محددة مثل الموافقة أو القسط أو المطلوب منك، اكتبها وبجاوبك عليها مباشرة.`;
  }

  return "";
}

function shouldReturnExactCustomerReply(intent: CustomerIntent) {
  // نخلي الرد الحرفي فقط للمسارات التي تنفذ إجراءً فعليًا أو تحتوي بيانات يجب ألا يعيد النموذج صياغتها.
  // باقي الأسئلة تمر على DeepSeek ليصيغها كحوار طبيعي مع إبقاء الرد الآمن مصدر الحقيقة.
  return [
    "regulatory_status",
    "business_identity",
    "payment_method",
    "payment_recipient",
    "payment_link_issue",
    "reopen_cancelled_request",
    "reopen_cancelled_confirmed",
    "receipt_upload_confirmation",
    "review_time",
    "payment_review_time",
    "continue_decision",
    "decline_decision",
    "cancel_confirmed",
    "cancel_refund_request",
    "refund",
    "office_pickup_policy",
    "tracking_link_request",
    "contact_info",
    "website",
    "location",
    "staff_identity",
    "system_prompt_request",
    "call_request",
    "alternative_payment_source",
    "media_upload",
    "document_upload",
    "document_followup",
    "reaction",
  ].includes(String(intent));
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
  if (String(intent) === "location") return locationReply(app.phone || tracking);
  if (String(intent) === "installment_info") return installmentInfoReply(baseUrl, app.phone || tracking);
  if (String(intent) === "requirements") return applicationDocumentsReply(app);
  if (String(intent) === "products") {
    return `الجهاز المسجل على طلبك حاليًا: ${customerFacingDeviceName(app.device_name) || "غير محدد"}.

أما الألوان أو الأجهزة المتوفرة فعليًا فتتأكد حسب توريد المورد وقت اعتماد الطلب، وما بدي أعطيك توفر غير مؤكد.`;
  }
  if (String(intent) === "unknown") {
    return unknownReply(app.phone || tracking);
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
  if (String(intent) === "greeting") return socialGreetingReply(app.phone || tracking, app, baseUrl);

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

function generalGreetingReply(from: string) {
  return socialGreetingReply(from, null, undefined);
}

function generalReviewTimeReply(from: string, customerText = "") {
  return reviewTimeReply(from, null, undefined, customerText);
}

function unknownReply(from: string) {
  const variants = [
    "وصلتني الرسالة، لكن معناها مش واضح عندي. اكتب النقطة بكلمتين مثل: حالة الطلب، الدفع، التوريد، أو الإلغاء.",
    "حتى أعطيك جواب صحيح، اكتب السؤال كامل بجملة واحدة أو ابعث رقم التتبع إذا الموضوع متعلق بطلب.",
    "الرسالة قصيرة وما قدرت أحدد المقصود منها. اكتب مثلًا: متى الرد؟ أو كم الرسوم؟ أو بدي ألغي.",
    "ما بدي أخمّن وأعطيك معلومة غلط. اكتب السؤال بجملة قصيرة وواضحة.",
  ];

  const digits = digitsOnly(from);
  return variants[Number(digits.slice(-2) || "0") % variants.length];
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

async function sendWhatsAppText(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.GRAPH_API_VERSION || "v20.0";

  if (!token || !phoneNumberId) {
    console.error("Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
    return null;
  }

  const cleanTo = normalizeWhatsAppToSend(to);
  if (!cleanTo) return null;

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
      text: { preview_url: true, body },
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error("WhatsApp send failed:", responseText);
    return null;
  }

  try {
    const data = JSON.parse(responseText);
    return data?.messages?.[0]?.id || null;
  } catch {
    return null;
  }
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

async function markRefundRequested(app: ApplicationRecord) {
  if (app.status === "refund_requested" || app.payment_status === "refund_requested" || app.status === "refund_completed") {
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
    "رسوم فتح الملف مؤكدة، والملف الآن قيد الدراسة النهائية.",
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
  const submitted = isDocumentSubmittedText(text);
  const officialUploadConfirmed = isOfficialUploadConfirmationText(text);
  const linkRequest = isDocumentLinkRequestText(text);

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

  if (submitted && officialUploadConfirmed && hasGuarantorContext) {
    const updatedApp = await markGuarantorSubmitted(app);
    const reply = guarantorSubmittedAutoReply(updatedApp);

    await sendDiscordNotification({
      title: "✅ تم استلام معلومات الكفيل تلقائيًا",
      description: "العميل أكد تعبئة معلومات الكفيل عبر واتساب، وتم تحديث حالة الطلب تلقائيًا إلى guarantor_submitted.",
      color: 0x57f287,
      app: updatedApp,
      customerPhone: from,
      customerMessage: text,
      systemReply: reply,
      baseUrl,
    });

    return reply;
  }

  if (submitted && officialUploadConfirmed && hasSalaryContext) {
    const updatedApp = await markSalarySlipUploaded(app);
    const reply = salarySlipUploadedAutoReply(updatedApp);

    await sendDiscordNotification({
      title: "✅ تم استلام كشف الراتب تلقائيًا",
      description: "العميل أكد رفع كشف الراتب عبر واتساب، وتم تحديث حالة الطلب تلقائيًا إلى salary_slip_uploaded.",
      color: 0x57f287,
      app: updatedApp,
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
    await supabaseAdmin
      .from("applications")
      .update({
        status: "customer_confirmed_continue",
        payment_status: "payment_info_sent",
      })
      .eq("id", input.app.id);

    return {
      ...input.app,
      status: "customer_confirmed_continue",
      payment_status: "payment_info_sent",
    } as ApplicationRecord;
  }

  const wasPaid = input.app.payment_status === "confirmed";
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

  return `أهلًا ${name}، وصلتني رغبتك بإلغاء الطلب وطلب الاسترداد.

للتأكيد النهائي اكتب:
أكد إلغاء الطلب

بعد التأكيد، إذا كان الدفع مؤكدًا على الملف بنلغي الطلب ونرسل لك رابط تثبيت بيانات الاسترداد.`;
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

  const paidCancellation = app.payment_status === "refund_requested" || app.payment_reference === "customer_cancelled_paid_refund_pending";

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

async function findApplicationForAiMemory(from: string, text: string, intent: CustomerIntent) {
  const tracking = extractTracking(text);
  const typedPhone = extractJordanPhoneFromText(text);

  try {
    if (tracking && typedPhone) {
      return (await findApplicationByTrackingAndPhone(tracking, typedPhone)) || (await findApplicationByTracking(tracking));
    }

    if (tracking) {
      return (await findApplicationByTracking(tracking)) || (await findApplicationByTrackingAndPhone(tracking, from));
    }

    if ([
      "order_status",
      "delivery",
      "payment",
      "payment_method",
      "payment_timing",
      "payment_recipient",
      "payment_next_step",
      "payment_review_time",
      "payment_objection",
      "payment_link_issue",
      "reopen_cancelled_request",
      "reopen_cancelled_confirmed",
      "refund",
      "complaint",
      "abuse",
      "legal_threat",
      "social_media_threat",
      "scam_accusation",
      "payment_dispute",
      "device_delay_rage",
      "continue_decision",
      "decline_decision",
      "cancel_request",
      "cancel_confirmed",
      "alternative_payment_source",
      "receipt_upload_needed",
      "office_pickup_policy",
      "site_issue",
      "supplier_delay_question",
      "apply",
      "products",
      "human_agent",
      "unknown",
    ].includes(intent)) {
      return await findApplicationByPhone(from);
    }
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

  if (String(input.intent) === "tracking_link_request") {
    return clean;
  }

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

    const isRepeated = urls.some((url) => previousUrls.has(url));
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
  ];

  if (danglingWords.includes(lastWord)) return true;
  if (["خلينا ن", "حتى ن", "بدي ا", "بدي أ", "بدنا ن"].includes(lastTwo)) return true;
  if (/^معك\s+\S+\s+من$/i.test(lastThree)) return true;
  if (/https?:\/\/\S*$/i.test(clean) && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(clean.split(/\s+/).pop() || "")) return true;
  if (/[:،,\-–]$/.test(clean)) return true;

  return false;
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

  return /(?:تم|جرى)\s+(?:تسجيل|تحديث|تعديل|تثبيت|اعتماد|تأكيد)\s+(?:موافقتك|رغبتك|بياناتك|الراتب|الطلب|الجهاز|اللون|السعه|السعة)/i.test(String(reply || ""));
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

function finalizeHumanReply(reply: string, input: AiReplyInput) {
  let clean = String(reply || "").trim();
  clean = shortenTrackingLinks(clean);
  clean = removeOverusedManagerName(clean, input);
  clean = stripRepeatedStaffIntro(clean, input);
  clean = limitAndSuppressLinks(clean, input);
  clean = oneFaithPhraseOnly(clean);
  clean = replaceColdClarificationForEmotionalPressure(clean, input);
  clean = trimOverFormalEmotionalReply(clean, input);
  clean = replaceUnfoundedEmotionalPressure(clean, input);

  if (containsUnverifiedActionClaim(clean, input) || containsIncorrectPaymentSourceClaim(clean)) {
    clean = input.deterministicReply;
  }

  if (isLikelyIncompleteReply(clean)) {
    clean = incompleteReplyFallback(input);
  }

  clean = enforceApplicationTruth(clean, input);

  if (!clean || isLikelyIncompleteReply(clean)) {
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

function finalizeReplyBeforeSend(reply: string, options: {
  from: string;
  text: string;
  intent: CustomerIntent;
  memory: Awaited<ReturnType<typeof getConversationMemory>>;
}) {
  const finalReply = finalizeHumanReply(reply, {
    customerText: options.text,
    deterministicReply: reply,
    isSensitive: looksSensitive(options.text),
    hasApplication: false,
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

  if (isLikelyIncompleteReply(finalReply)) {
    return `وصلت رسالتك، لكن ما بدي أرسل لك جواب ناقص أو غير مؤكد.

ابعث رقم الطلب إذا الموضوع متعلق بملفك، أو اكتب النقطة بجملة واحدة وبجاوبك عليها مباشرة.`;
  }

  return finalReply;
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

async function generateAiReply(input: AiReplyInput) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const defaultModel = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const reasoningModel =
    process.env.DEEPSEEK_REASONING_MODEL ||
    process.env.DEEPSEEK_ESCALATION_MODEL ||
    "deepseek-v4-pro";

  const reasoningIntents: CustomerIntent[] = [
    "abuse",
    "legal_threat",
    "social_media_threat",
    "scam_accusation",
    "trust_verification",
    "payment_dispute",
    "device_delay_rage",
    "emotional_pressure",
    "media_upload",
    "document_upload",
    "document_followup",
    "complaint",
    "refund",
    "cancel_request",
    "cancel_confirmed",
    "site_issue",
    "human_agent",
  ];

  const contextNeedsReasoning =
    Boolean(input.conversationContext) &&
    (isTinyContextFollowupText(input.customerText) || String(input.intent) === "unknown" || String(input.intent) === "human_agent");

  const useDeepThinking =
    input.isSensitive ||
    reasoningIntents.includes(input.intent) ||
    contextNeedsReasoning;

  const model = useDeepThinking ? reasoningModel : defaultModel;

  if (!apiKey) {
    console.error("Missing DEEPSEEK_API_KEY");
    return safeShortHumanFallback(input);
  }

  const strictDeterministicIntents: CustomerIntent[] = [
    "contact_info",
    "location",
    "website",
    "office_pickup_policy",
    "staff_identity",
    "system_prompt_request",
    "call_request",
    "alternative_payment_source",
    "payment_amount",
    "trust_verification",
    "receipt_upload_confirmation",
    "review_time",
    "payment_review_time",
    "supplier_delay_question",
  ];

  if (strictDeterministicIntents.includes(input.intent)) {
    return input.deterministicReply;
  }

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
- العنوان الرسمي: ${BUSINESS_ADDRESS}
- رسوم فتح الملف الرسمية: ${FILE_OPENING_FEE_JOD} دنانير فقط.
- التحويل ممكن من أي حساب بنكي يدعم CliQ أو من محفظة إلكترونية؛ مش شرط يكون عند العميل محفظة Orange Money.
- الجهة المستلمة محفظة Orange Money، والتحويل يكون إلى AMENPAY أو PAYAMEN، ويجب أن يظهر اسم المستفيد ${PAYMENT_BENEFICIARY_NAME} قبل التأكيد.
- ممنوع القول إن التحويل البنكي لا ينفع، أو إن الدفع من Orange Money فقط، أو إن الحل الوحيد أن يدفع شخص لديه محفظة أورنج.
- ممنوع اختراع أي رقم هاتف أو رابط أو عنوان أو رسوم أو موعد.
- إذا سأل العميل عن رقم الشركة أو معلومات التواصل، استخدم هذه البيانات فقط ولا تضف أي رقم آخر.
- إذا سأل العميل عن العنوان أو الموقع الجغرافي، أعطِ العنوان الرسمي فقط مع ملاحظة أن زيارة المكتب لا تتم إلا إذا وصلت للعميل رسالة واضحة من الإدارة تطلب الحضور أو تحدد موعدًا لذلك.
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
- under_review ليست موافقة.
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

منطق المحادثة الآمنة البشرية:
- لا ترد كقالب ثابت. اقرأ رسالة العميل ورد على نفس المعنى.
- إذا قال العميل "كيفك؟" أو "شخبارك؟" أو سأل سؤالًا خفيفًا، جاوبه طبيعيًا باختصار ثم اسأله كيف تساعده.
- إذا سأل عن مدة الطلب، اذكر: من يومين إلى ثلاث أيام عمل حسب الضغط واكتمال البيانات، والجمعة والسبت عطلة رسمية ولا تُحسب.
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
الحالة: ${input.status || "غير متوفرة"}
حالة الدفع: ${input.paymentStatus || "غير متوفرة"}
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
- إذا كان اسم الموظف فدوة أو تالا استخدم صياغة مؤنثة عند الحاجة، وإذا كان عبدالله أو عبدالرحمن استخدم صياغة مذكرة.

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

الرد الآمن الأساسي الذي يجب الالتزام به وعدم مخالفته:
${input.deterministicReply}
`;

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
          content: userInput,
        },
      ],
      temperature: aiTemperatureForInput(input, useDeepThinking),
      max_tokens: useDeepThinking
        ? Number(process.env.AI_REASONING_MAX_TOKENS || "650")
        : Number(process.env.AI_MAX_TOKENS || "420"),
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

    return finalizeHumanReply(sanitizeAiReply(aiText, input.deterministicReply), input);
  } catch (error) {
    console.error("DeepSeek reply error:", error);
    return safeShortHumanFallback(input);
  }
}


function siteIssueReply(from: string, app?: ApplicationRecord | null, tracking?: string) {
  const requestRef = tracking || app?.tracking_id || app?.id || "";
  const appLine = app
    ? `\n\nالطلب مربوط عندنا على رقم التتبع:\n${app.tracking_id || app.id}\n\nالحالة الظاهرة حاليًا:\n${statusHumanLabel(app.status || "")}`
    : requestRef
      ? `\n\nرقم التتبع اللي وصلني:\n${requestRef}`
      : "";

  return `وصلتني ملاحظتك بخصوص التتبع 🌿

في خلل تقني مؤقت في نظام عرض الطلبات/التتبع، والفريق التقني شغال على معالجته حاليًا.

للتوضيح، هذا الخلل لا يعني إلغاء الطلب ولا ضياع البيانات. ملفات العملاء محفوظة، وأي تحديث رسمي على الطلب بيتم من خلال رقم التتبع أو رقم الهاتف المستخدم بالتقديم.${appLine}

إذا احتجت نراجع الحالة من طرفنا، ابعث رقم التتبع أو رقم الهاتف المستخدم بالتقديم، وبنحكي لك بالموجود بدون تخمين.`;
}

function temporaryOrderLookupIssueReply(from: string, tracking?: string) {
  const trackingLine = tracking ? `\n\nرقم التتبع اللي وصلني:\n${tracking}` : "";

  return `وصلتني، بس حاليًا ما قدرت أقرأ حالة الطلب من النظام بشكل مؤكد 🌿${trackingLine}

هذا لا يعني إن الطلب ملغي أو ضايع؛ أحيانًا يصير خلل مؤقت في عرض/قراءة حالة الطلب.

تأكد من رقم التتبع أو ابعث رقم الهاتف المستخدم بالتقديم، وبنراجع الحالة المتوفرة من طرفنا أول ما ترجع القراءة لطبيعتها.`;
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

async function buildReply(request: Request, from: string, text: string, messageType = "text") {
  const baseUrl = getBaseUrl(request);
  // سياق قريب فقط: يمنع الردود القديمة السيئة من السيطرة على DeepSeek.
  const conversationMemory = await getConversationMemory(from, 18);
  const resolvedInput = resolveConversationInput(text, messageType, conversationMemory);
  text = resolvedInput.effectiveText;
  let intent = resolvedInput.intent;
  const directTracking = extractTracking(text);
  const typedPhone = extractJordanPhoneFromText(text);

  const pendingContinueDecision = (conversationMemory.lastAssistantReplies || []).some((reply) =>
    /أكديلي المتابعة|اكد المتابعة|أكد المتابعة|إذا حاب.*نكمل|اذا حاب.*نكمل|تعليمات فتح الملف|تعليمات الدفع/i.test(String(reply || ""))
  );

  if (
    (pendingContinueDecision && (isShortContinuationText(text) || isSimpleContinueConfirmationText(text))) ||
    (conversationMemory.hasRecentPreliminaryApprovalTemplate && isSimpleContinueConfirmationText(text))
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

  const sensitive = looksSensitive(text) || (Boolean(conversationMemory.conversationContext) && isTinyContextFollowupText(text));

  const humanizeReply = (input: AiReplyInput) =>
    generateAiReply({
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

  let app: ApplicationRecord | null = null;

  if (tracking && typedPhone) {
    app = await findApplicationByTrackingAndPhone(tracking, typedPhone);
    if (!app) app = await findApplicationByTracking(tracking);
  } else if (tracking) {
    app = await findApplicationByTracking(tracking);
    if (!app) app = await findApplicationByTrackingAndPhone(tracking, typedPhone || memoryPhone || from);
  } else if (typedPhone) {
    app = await findApplicationByPhone(typedPhone);
    if (!app && normalizeJordanPhone(typedPhone) !== normalizeJordanPhone(from)) {
      app = await findApplicationByPhone(from);
    }
  } else if (memoryPhone && !explicitlyNewApplication) {
    app = await findApplicationByPhone(memoryPhone);
    if (!app && normalizeJordanPhone(memoryPhone) !== normalizeJordanPhone(from)) {
      app = await findApplicationByPhone(from);
    }
  } else if (!explicitlyNewApplication && (
    String(intent) === "order_status" ||
    String(intent) === "delivery" ||
    String(intent) === "payment" ||
    String(intent) === "requirements" ||
    String(intent) === "application_data_correction" ||
    String(intent) === "application_data_correction_confirmed" ||
    String(intent) === "self_employed" ||
    String(intent) === "refund" ||
    String(intent) === "complaint" ||
    String(intent) === "abuse" ||
    String(intent) === "legal_threat" ||
    String(intent) === "social_media_threat" ||
    String(intent) === "scam_accusation" ||
    String(intent) === "payment_dispute" ||
    String(intent) === "device_delay_rage" ||
    String(intent) === "emotional_pressure" ||
    String(intent) === "media_upload" ||
    String(intent) === "document_upload" ||
    String(intent) === "document_followup" ||
    String(intent) === "continue_decision" ||
    String(intent) === "keep_request" ||
    String(intent) === "decline_decision" ||
    String(intent) === "cancel_request" ||
    String(intent) === "cancel_confirmed" ||
    String(intent) === "alternative_payment_source" ||
    String(intent) === "receipt_upload_needed" ||
    String(intent) === "receipt_upload_confirmation" ||
    String(intent) === "trust_verification" ||
    String(intent) === "supplier_delay_question" ||
    String(intent) === "site_issue" ||
    String(intent) === "review_time" ||
    String(intent) === "human_agent" ||
    String(intent) === "staff_identity" ||
    String(intent) === "call_request" ||
    String(intent) === "payment_amount" ||
    String(intent) === "payment_method" ||
    String(intent) === "payment_timing" ||
    String(intent) === "payment_recipient" ||
    String(intent) === "payment_next_step" ||
    String(intent) === "payment_review_time" ||
    String(intent) === "payment_objection" ||
    String(intent) === "payment_link_issue" ||
    String(intent) === "reopen_cancelled_request" ||
    String(intent) === "reopen_cancelled_confirmed" ||
    String(intent) === "device_change" ||
    String(intent) === "device_change_cancelled" ||
    String(intent) === "device_change_confirmed" ||
    String(intent) === "unknown" ||
    String(intent) === "thanks" ||
    String(intent) === "apply" ||
    String(intent) === "products"
  )) {
    app = await findApplicationByPhone(from);
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

  if (paymentContextActive) {
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

  if (pendingCancellationConfirmation && typedPhone && app && String(intent) === "unknown") {
    intent = "cancel_request";
  }

  if (
    app &&
    (app.status === "refund_requested" || app.payment_status === "refund_requested") &&
    ["unknown", "payment", "payment_amount", "loan", "order_status", "review_time"].includes(String(intent)) &&
    hasAny(text, [
      "استرداد", "استرجاع", "فلوسي", "مصاري", "المبلغ", "الدنانير", "دينار",
      "حولولي", "رجعولي", "وين الفلوس", "وين المصاري", "وين المبلغ", "بدي حقي",
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
    deterministicReply = employeeIdentityReply(from, app);

    return humanizeReply({
      customerText: text,
      deterministicReply,
      customerName: app ? firstTwoNames(app.full_name) : undefined,
      trackingId: app ? app.tracking_id || app.id : tracking || undefined,
      status: app?.status || null,
      paymentStatus: app?.payment_status || null,
      deviceName: app?.device_name || null,
      isSensitive: false,
      hasApplication: Boolean(app),
      intent,
    });
  }

  if (String(intent) === "call_request") {
    return callRequestReply(from, app);
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
    if (!app) {
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

  if (String(intent) === "reopen_cancelled_request") {
    return app ? reopenCancelledRequestReply(app) : reopenCancelledWithoutAppReply();
  }

  if (String(intent) === "reopen_cancelled_confirmed") {
    if (!app) return reopenCancelledWithoutAppReply();

    if (app.status === "refund_completed") {
      return reopenCancelledRequestReply(app);
    }

    if (app.status !== "cancelled" && app.status !== "refund_requested" && app.payment_status !== "refund_requested") {
      return `طلبك مستمر أصلًا وحالته الحالية: ${statusHumanLabel(app.status || "")}.

ما في حاجة لإعادة تفعيله.
رقم الطلب: ${app.tracking_id || app.id}`;
    }

    const paidCancellation =
      app.payment_status === "refund_requested" ||
      app.payment_reference === "customer_cancelled_paid_refund_pending";

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
    return paymentAmountReply(app, text);
  }

  if (String(intent) === "self_employed") {
    return selfEmployedReply(app);
  }

  if (String(intent) === "trust_verification") {
    if (isPaymentGuaranteeText(text)) {
      return paymentGuaranteeReply(baseUrl, app);
    }
    return trustVerificationReply(baseUrl, app);
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

    if (alreadyCompleted) {
      deterministicReply = refundCompletedReply(app);
    } else if (alreadyRequested) {
      deterministicReply = refundAlreadyRequestedReply(app, text);
    } else {
      const updatedApp = await markRefundRequested(app);
      deterministicReply = refundFirstRequestReply(updatedApp, baseUrl);

      await sendDiscordNotification({
        title: "💸 طلب استرداد من واتساب — تم تسجيل الحالة قيد الاسترداد",
        description: "تم إرسال رابط الاسترداد مرة واحدة فقط وتحديث حالة الطلب تلقائيًا إلى refund_requested.",
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
      return documentAutomationReply;
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
    deterministicReply = siteIssueReply(from, app, tracking);

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
    deterministicReply = siteIssueReply(from, null, tracking);
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
    deterministicReply = locationReply(from);
  } else if (String(intent) === "installment_info") {
    deterministicReply = installmentInfoReply(baseUrl, from);
  } else if (String(intent) === "self_employed") {
    deterministicReply = selfEmployedReply(null);
  } else if (String(intent) === "requirements") {
    deterministicReply = requirementsReply(baseUrl, from);
  } else if (String(intent) === "apply") {
    deterministicReply = applyReply(baseUrl, from);
  } else if (String(intent) === "products") {
    deterministicReply = productsReply(baseUrl, from);
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
    deterministicReply = generalGreetingReply(from);
  } else if (String(intent) === "thanks") {
    deterministicReply = `العفو 🌿
بخدمتك بأي وقت.`;
  } else {
    deterministicReply = unknownReply(from);
  }

  const factualIntentNeedsExactReply = [
    "regulatory_status",
    "business_identity",
    "contact_info",
    "website",
    "location",
    "self_employed",
    "system_prompt_request",
    "office_pickup_policy",
    "loan",
    "greeting",
    "media_upload",
    "document_upload",
    "document_followup",
    "reaction",
  ].includes(intent);

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

        if (type === "reaction") {
          await markIncomingWhatsAppMessageProcessed(message.id);
          return;
        }

        if (await isAutoReplyIgnored(from)) {
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
        const resolvedProcessingInput = resolveConversationInput(
          processingText,
          processingMessageType,
          preReplyMemory,
        );
        const replyInputText = resolvedProcessingInput.effectiveText;
        processingIntent = resolvedProcessingInput.intent;
        needsHumanReview = shouldFlagHumanReview(replyInputText, processingIntent);

        // إعادة الفحص بعد تجميع الرسائل؛ يمكن للإدارة ضغط زر التجاهل أثناء نافذة الانتظار.
        if (await isAutoReplyIgnored(from)) {
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
          const reply = otpSafetyReply();

          const outgoingClaim = await claimOutgoingReplyLock({
            waId: from,
            incomingMessageId: message.id,
            reply,
            windowSeconds: 20,
          });

          if (outgoingClaim.shouldSend && !(await hasRecentlySentSameReply(from, reply, 30))) {
            await waitUntilReplyLooksHuman(replyStartedAt, targetReplyDelayMs);

            if (await isAutoReplyIgnored(from)) {
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

        // Capture a stable snapshot for the independent Shadow queue.
        // The model is never called from the WhatsApp webhook.
        const shadowApplication = await findApplicationForAiMemory(from, processingText, processingIntent);
        const shadowTrackingId =
          extractTracking(processingText) ||
          incomingTracking ||
          shadowApplication?.tracking_id ||
          null;

        const rawReply = await buildReply(request, from, replyInputText, processingMessageType);
        const outgoingMemory = await getConversationMemory(from);
        let reply = finalizeReplyBeforeSend(rawReply, {
          from,
          text: replyInputText,
          intent: processingIntent,
          memory: outgoingMemory,
        });

        if (isNearDuplicateAssistantReply(reply, outgoingMemory, processingIntent)) {
          const recoveryReply = repeatedReplyRecoveryReply(processingIntent);

          // في متابعة الحالة فقط نختصر الرد إلى "لا يوجد تحديث جديد".
          // أما الأسئلة الأخرى فلا نطلب من العميل إعادة سؤاله ولا نستبدل الجواب بقالب عام.
          if (recoveryReply) {
            reply = recoveryReply;
          }

          await sendDiscordNotification({
            title: "🔁 تم اكتشاف رد قريب من رد سابق",
            description: recoveryReply
              ? "تم اختصار رد متابعة الحالة لأن الحالة لم تتغير."
              : "تم رصد التشابه دون استبدال جواب العميل بقالب عام.",
            color: 0xfee75c,
            customerPhone: from,
            customerMessage: processingText,
            systemReply: reply,
            baseUrl: getBaseUrl(request),
          });
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

          if (await isAutoReplyIgnored(from)) {
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

          const aiMemoryApp = shadowApplication;
          await logAiConversation({
            phone: from,
            customerMessage: processingText,
            aiReply: reply,
            intent: processingIntent,
            applicationStatus: aiMemoryApp?.status || null,
          });

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
              application: shadowApplication,
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
