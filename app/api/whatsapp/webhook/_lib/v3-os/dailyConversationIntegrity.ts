import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn } from "./types";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

function contextText(state?: ConversationState | null, recentTurns?: string[]) {
  return n([
    state?.lastAssistantText || "",
    state?.lastCustomerText || "",
    ...(recentTurns || []).slice(-10),
  ].filter(Boolean).join("\n"));
}

export function pureGreetingText(value: string | null | undefined) {
  const q = n(value);
  return /^(?:مرحبا|مرحبت|هلا|اهلا|أهلا|السلام\s+عليكم|سلام|يسعد\s+اوقاتك|يسعد\s+أوقاتك|مسا\s+الخير|مساء\s+الخير|صباح\s+الخير)$/.test(q);
}

export function politeClosureText(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const q = n(value);
  if (!q && !raw) return false;
  if (/^(?:تمام|تم|اوك|اوكي|أوك|أوكي|شكرا|شكرًا|شكراً|يسلمو|تسلم|الله\s+يعافيك|يعطيك\s+العافيه|يعطيك\s+العافية|الله\s+يعطيك\s+العافيه|الله\s+يعطيك\s+العافية|ان\s+شاء\s+الله|إن\s+شاء\s+الله|تمام\s+ان\s+شاء\s+الله|تمام\s+إن\s+شاء\s+الله|العفو)$/.test(q)) return true;
  if (/^(?:👍|👍🏻|❤️|❤|🌹|🙏|🙏🏻|👌|✅|☑️|😁|🙂|😊)+$/u.test(raw)) return true;
  const hasThanks = /(?:شكرا|شكرًا|شكراً|تسلم|الله\s+يعافيك|يعطيك\s+العافيه|يعطيك\s+العافية)/.test(q);
  const hasWish = /(?:ان\s+شاء\s+الله|إن\s+شاء\s+الله|يارب|يا\s+رب)/.test(q);
  const hasCommandOrQuestion = /(?:\?|؟|بدي|اريد|أريد|متى|امتى|ايمتى|كيف|وين|ليش|الغي|إلغاء|استرداد|دفع|ادفع|أدفع|تحويل|كليك|cliq|استعجال|سرعه|سرعة|حاله\s+استثنائيه|حالة\s+استثنائية)/i.test(String(value || ""));
  return (hasThanks || hasWish) && !hasCommandOrQuestion && q.length <= 120;
}

export function staffIdentityQuestionText(value: string | null | undefined, context?: string | null) {
  const q = n(value);
  const ctx = n(context);
  if (/(?:مع\s+مين\s+بحكي|مين\s+معي|انت\s+مين|إنت\s+مين|شو\s+اسمك|اسمك\s+شو|مين\s+حضرتك|موظف\s+ولا|ذكاء\s+اصطناعي|ذكاء\s+اصطناعي|ai\b)/i.test(q)) return true;
  return /^(?:انت|إنت|انت\?|إنت\?)$/.test(q) && /(?:مين|ذكاء\s+اصطناعي|ai|اسمك)/i.test(ctx);
}

export function roleDisplayName(role: string | null | undefined) {
  const names: Record<string,string> = {
    tala: "تالا",
    fadwa: "فدوة",
    abdullah: "عبدالله",
    abdulrahman: "عبدالرحمن",
    omran: "عمران",
  };
  return names[String(role || "").toLowerCase()] || "عبدالله";
}

export function feeNowOrPickupQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:لازم|المطلوب|هسا|الان|الآن).{0,28}(?:ادفع|أدفع|دفع).{0,28}(?:الخمسه|الخمسة|5|٥|رسوم)|(?:ادفع|أدفع|دفع).{0,28}(?:الخمسه|الخمسة|5|٥|رسوم).{0,35}(?:هسا|الان|الآن|عند\s+الاستلام|لاحقا|لاحقًا)|(?:الخمسه|الخمسة|5|٥).{0,25}(?:هسا|الان|الآن|عند\s+الاستلام|متى)|(?:القسط\s+الاول|القسط\s+الأول).{0,35}(?:الاستلام|استلم|متى|هسا|الان|الآن)|(?:هسا\s+بس\s+ادفع|الان\s+بس\s+ادفع).{0,20}(?:الخمسه|الخمسة|5|٥)/.test(q);
}

export function paymentMethodQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:كيف|وين|طريقه|طريقة|على\s+مين|لمين).{0,30}(?:ادفع|أدفع|احول|أحول|تحويل|رسوم|الخمسه|الخمسة|5|٥)|(?:كليك|cliq|محفظه|محفظة|اسم\s+المستفيد|معرف|alias).{0,35}(?:ادفع|دفع|تحويل|الخمسه|الخمسة|5|٥)?|(?:ادفع|أدفع|احول|أحول).{0,30}(?:كليك|cliq|محفظه|محفظة|اسم|معرف|رقم)/i.test(q);
}

export function refundFeeQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:اذا|إذا|لو).{0,30}(?:توقف|توقيف|الغاء|إلغاء|الغي|ألغي|انلغى|انلغي).{0,40}(?:يرجع|ترجع|استرد|استرجع|ارجاع|إرجاع).{0,35}(?:5|٥|الخمسه|الخمسة|رسوم\s+فتح\s+الملف)|(?:5|٥|الخمسه|الخمسة|رسوم\s+فتح\s+الملف).{0,40}(?:يرجع|ترجع|استرد|استرجع|ارجاع|إرجاع).{0,35}(?:الغاء|إلغاء|توقف|توقيف)|(?:هل\s+يتم|هل).{0,25}(?:ارجاع|إرجاع|استرداد).{0,30}(?:5|٥|رسوم\s+فتح\s+الملف)/.test(q);
}

export function dataDeletionRequestText(value: string | null | undefined) {
  const q = n(value);
  return /(?:امحي|إمحي|امسح|إمسح|احذف|إحذف|حذف).{0,35}(?:البيانات|البيانات\s+الشخصيه|البيانات\s+الشخصية|معلوماتي|بياناتي)|(?:بدي|اريد|أريد).{0,25}(?:حذف|مسح).{0,25}(?:بياناتي|معلوماتي|البيانات)/.test(q);
}

export function dataDeletionConfirmationText(value: string | null | undefined, context?: string | null) {
  const q = n(value);
  const ctx = n(context);
  return /^(?:نعم|اه|أه|ايوه|أيوه|اكد|أكد|موافق|تمام)$/.test(q)
    && /(?:حذف|مسح).{0,35}(?:بياناتك|بياناتك\s+الشخصيه|بياناتك\s+الشخصية|معلوماتك)|(?:تأكيد).{0,25}(?:حذف|مسح)/.test(ctx);
}

export function explicitExpediteRequestText(value: string | null | undefined) {
  const q = n(value);
  return /(?:بلغ|بلّغ|وصل|وصلوا|احكي|احكوا).{0,35}(?:الاداره|الإدارة).{0,40}(?:مستعجل|مستعجله|مستعجلة|استعجال|سرعه|سرعة)|(?:بدي|بدنا|لو\s+سمحت|لو\s+سمحتوا).{0,30}(?:استعجال|تسريع|تسرعوا|تستعجلوا).{0,30}(?:القرار|المراجعه|المراجعة|الموافقه|الموافقة)?|(?:اعملوني|اعملولي).{0,25}(?:حاله|حالة)\s+استثنائيه|(?:حاله|حالة)\s+استثنائيه.{0,25}(?:لو\s+سمحت|بدي)/.test(q);
}

export function customerOffersHomeAddressText(value: string | null | undefined) {
  const q = n(value);
  return /(?:بعطيكم|بعطيك|اعطيكم|أعطيكم|اعطيك|أعطيك).{0,35}(?:عنوان\s+بيتي|عنوان\s+البيت|موقع\s+بيتي)|(?:عنوان\s+بيتي|عنوان\s+البيت).{0,35}(?:بدقه|بدقة|كامل)/.test(q);
}

export function genericDocumentLinkRequestText(value: string | null | undefined, state?: ConversationState | null, recentTurns?: string[]) {
  const q = n(value);
  const ctx = contextText(state, recentTurns);
  const direct = /^(?:ابعثلي|ابعتلي|اعطيني|أعطيني|ارسللي|أرسللي)\s+رابط$/.test(q)
    || /^(?:رابط\s+الرفع|رابط\s+المستندات|رابط\s+رفع\s+المستندات)$/.test(q);
  const contextualYes = /^(?:اه|أه|نعم|ايوه|أيوه|تمام)$/.test(q)
    && /(?:بدك|حاب|تريد).{0,25}(?:رابط).{0,25}(?:رفع|المستندات|اثبات\s+الدخل|إثبات\s+الدخل|كشف\s+الراتب|الكفيل|الهويه|الهوية)/.test(ctx);
  return (direct || contextualYes) && /(?:مستند|وثيقه|وثيقة|كشف\s+راتب|اثبات\s+دخل|إثبات\s+دخل|كفيل|هويه|هوية|رفع)/.test(ctx);
}

export type DocumentContextKind = "identity" | "salarySlip" | "guarantor" | "ambiguous" | null;

export function documentContextKind(state?: ConversationState | null, recentTurns?: string[]): DocumentContextKind {
  const ctx = contextText(state, recentTurns);
  const identity = /(?:الهويه|الهوية|صوره\s+الهويه|صورة\s+الهوية)/.test(ctx);
  const salary = /(?:كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب|اثبات\s+دخل|إثبات\s+دخل|مصدر\s+دخل|دخل\s+اضافي|دخل\s+إضافي)/.test(ctx);
  const guarantor = /(?:كفيل|بيانات\s+الكفيل)/.test(ctx);
  const kinds = [identity ? "identity" : null, salary ? "salarySlip" : null, guarantor ? "guarantor" : null].filter(Boolean);
  if (kinds.length > 1) return "ambiguous";
  return (kinds[0] as DocumentContextKind) || null;
}

export function guarantorNameOnlyQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:بيانات\s+كفيل|الكفيل).{0,35}(?:بس|فقط).{0,20}(?:اسمه|اسمو|الاسم)|(?:بس|فقط).{0,20}(?:اسم\s+الكفيل)/.test(q);
}

export function whatsappImageMessageText(value: string | null | undefined) {
  const q = n(value);
  return /(?:تم\s+استلام\s+صوره\s+من\s+العميل|تم\s+استلام\s+صورة\s+من\s+العميل)/.test(q);
}

export function recentPaymentOrReceiptContext(state?: ConversationState | null, recentTurns?: string[]) {
  const ctx = contextText(state, recentTurns);
  return /(?:دفعت|دفع|وصل\s+الدفع|رفع\s+الوصل|ارفع\s+الوصل|إرفع\s+الوصل|رسوم\s+فتح\s+الملف|5\s+دنانير|٥\s+دنانير)/.test(ctx);
}

export function reviewDelayQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:في\s+احتمال|ممكن).{0,30}(?:تخلص|ينتهي|يخلص).{0,25}(?:اليوم|بكره|بكرة)|(?:ليش|شو\s+سبب).{0,25}(?:التاخر|التأخر|تاخير|تأخير)|(?:طولت|طولو|طولتوا|طولتو).{0,35}(?:الاجراءات|الإجراءات|المراجعه|المراجعة|الطلب)|(?:صارلي|الي|إلي).{0,25}(?:يوم|يومين|اسبوع|أسبوع|شهر|شهور).{0,30}(?:مقدم|باعث|مستني|انتظر)|(?:متى|امتى|ايمتى|قديش|كم).{0,35}(?:تخلص|تنتهي|الموافقه|الموافقة|المراجعه|المراجعة|القرار)/.test(q);
}

export function internalPlaceholderLeakText(value: string | null | undefined) {
  const raw = String(value || "");
  return /\bOFFICIAL_LINKS\b|\bPLACEHOLDER\b|\bTODO\b|\[رابط[^\]]*(?:إذا\s+توفر|اذا\s+توفر|OFFICIAL|placeholder)[^\]]*\]|\[URL_REDACTED[^\]]*\]|\[CUSTOMER_URL_REDACTED[^\]]*\]/i.test(raw);
}

export function currentPaymentExecutionRequested(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (turn.requestedActions.includes("continue_application") || turn.topics.includes("continuation")) return true;
  if (paymentMethodQuestionText(turn.rawText)) return true;
  if (/(?:بدي|اريد|أريد).{0,25}(?:ادفع|أدفع|احول|أحول).{0,25}(?:الخمسه|الخمسة|5|٥|رسوم\s+فتح\s+الملف)/.test(q)) return true;
  return false;
}

export function applicationStartQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:كيف|من\s+وين|وين).{0,24}(?:اقدم|أقدم|التقديم|اعمل\s+طلب|أعمل\s+طلب)|(?:بدي|حاب|حابه|حابة).{0,20}(?:اقدم|أقدم|اعمل\s+طلب|أعمل\s+طلب)|(?:اقدم|أقدم).{0,24}(?:عن\s+طريق\s+الرابط|من\s+الرابط|بالرابط)|(?:طريقة|طريقه).{0,20}(?:التقديم)/.test(q);
}

export function legalThreatOrPublicEscalationText(value: string | null | undefined) {
  const q = n(value);
  return /(?:الشرطه|الشرطة|محكمه|محكمة|شكوى|اشتك|أشتك|افضح|أفضح|تشهير|انشر|أنشر|المنصات).{0,55}(?:عليكم|عنكم|معكم)?|(?:بدي|راح|رح).{0,35}(?:اجيب|أجيب).{0,20}(?:الشرطه|الشرطة)/.test(q);
}

export function additionalIncomeQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:بقدر|ممكن|بدي|حاب).{0,25}(?:اضيف|أضيف|ارفع|أرفع).{0,30}(?:مصدر\s+دخل|دخل\s+اضافي|دخل\s+إضافي|اثبات\s+دخل\s+اضافي|إثبات\s+دخل\s+إضافي)|(?:مصدر\s+دخل|دخل\s+اضافي|دخل\s+إضافي).{0,35}(?:اضيف|أضيف|ارفع|أرفع|بقدر|ممكن)/.test(q);
}

export function barePhoneNumberText(value: string | null | undefined) {
  const raw = String(value || "").replace(/\D/g, "");
  return raw.length >= 9 && raw.length <= 13 && /^\+?\d[\d\s-]*$/.test(String(value || "").trim());
}

export function explicitTrackingFromText(value: string | null | undefined) {
  const match = String(value || "").match(/\bAM-\d{8,}\b/i);
  return match ? match[0].toUpperCase() : null;
}
