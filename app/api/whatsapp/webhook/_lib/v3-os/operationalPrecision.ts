import { normalizeArabic } from "./text";

export type ExplicitDocumentUploadKind = "identity" | "salarySlip" | "guarantor";

const WEEKDAY_AR: Record<string, string> = {
  Sunday: "الأحد",
  Monday: "الاثنين",
  Tuesday: "الثلاثاء",
  Wednesday: "الأربعاء",
  Thursday: "الخميس",
  Friday: "الجمعة",
  Saturday: "السبت",
};

function latinFold(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstToken(value: string | null | undefined) {
  return String(value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
}

export function safeCustomerFirstName(applicationFullName: string | null | undefined, profileName: string | null | undefined) {
  const appFirst = firstToken(applicationFullName);
  if (!appFirst) return null;
  const profile = String(profileName || "").trim();
  if (!profile) return appFirst;

  const appFold = latinFold(appFirst);
  const profileFold = latinFold(profile);
  if (!appFold || !profileFold) return null;

  const profileTokens = profileFold.split(/\s+/).filter(Boolean);
  return profileTokens.includes(appFold) || profileFold === appFold ? appFirst : null;
}

export function ammanWeeklyDay(date = new Date()) {
  const english = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Amman",
  }).format(date);
  return {
    english,
    arabic: WEEKDAY_AR[english] || english,
    officeWeeklyHoliday: english === "Friday" || english === "Saturday",
  };
}

export function weeklyOperationsSnapshot(date = new Date()) {
  const day = ammanWeeklyDay(date);
  return {
    ...day,
    requestsAcceptedEveryDay: true,
    officeAttendanceRequiresOfficialAppointment: true,
    officeAppointmentMayNotBeCoordinatedByChat: true,
  };
}

const ARABIC_WEEKDAY_TO_ENGLISH: Array<[RegExp, string]> = [
  [/(?:الاحد|الأحد)/, "Sunday"],
  [/(?:الاثنين|الإثنين)/, "Monday"],
  [/(?:الثلاثاء)/, "Tuesday"],
  [/(?:الاربعاء|الأربعاء)/, "Wednesday"],
  [/(?:الخميس)/, "Thursday"],
  [/(?:الجمعه|الجمعة)/, "Friday"],
  [/(?:السبت)/, "Saturday"],
];

export function resolveOfficeScheduleTarget(text: string | null | undefined, now = new Date()) {
  const q = normalizeArabic(String(text || ""));
  const explicit = ARABIC_WEEKDAY_TO_ENGLISH.find(([pattern]) => pattern.test(q));
  if (explicit) {
    const english = explicit[1];
    return {
      reference: "named_day" as const,
      english,
      arabic: WEEKDAY_AR[english] || english,
      officeWeeklyHoliday: english === "Friday" || english === "Saturday",
    };
  }

  const base = new Date(now);
  const asksTomorrow = /(?:بكره|بكرة|غدا|غدًا)/.test(q);
  if (asksTomorrow) base.setTime(base.getTime() + 24 * 60 * 60 * 1000);
  const day = ammanWeeklyDay(base);
  return { ...day, reference: asksTomorrow ? "tomorrow" as const : "today" as const };
}

function asksWeeklySchedule(text: string | null | undefined) {
  const q = normalizeArabic(String(text || ""));
  return /(?:ايام|أيام)\s*الدوام|دوامكم|متى\s*الدوام|شو\s*(?:ايام|أيام)\s*الدوام/.test(q);
}

function asksOfficeHours(text: string | null | undefined) {
  const q = normalizeArabic(String(text || ""));
  return /(?:ساعات|اوقات|أوقات)\s*الدوام|من\s*الساعه|من\s*الساعة|للساعه|للساعة|متى\s*(?:بتفتحوا|بتسكروا|بتغلقوا)/.test(q);
}

export function asksOfficeSchedule(text: string | null | undefined) {
  const q = normalizeArabic(String(text || ""));
  if (asksWeeklySchedule(q) || asksOfficeHours(q)) return true;
  const dayWord = /(?:اليوم|هسا|هسه|بكره|بكرة|غدا|غدًا|الاحد|الأحد|الاثنين|الإثنين|الثلاثاء|الاربعاء|الأربعاء|الخميس|الجمعه|الجمعة|السبت)/.test(q);
  const scheduleWord = /(?:دوام|فاتحين|مفتوح|مسكر|مغلق|عطله|عطلة)/.test(q);
  return scheduleWord && (dayWord || /(?:عندكم|المكتب|اليوم)/.test(q));
}

export function officeScheduleCustomerReply(text: string | null | undefined, now = new Date()) {
  if (asksOfficeHours(text)) {
    return "أيام دوام المكتب حسب الجدول الأسبوعي من الأحد للخميس، والجمعة والسبت عطلة. استقبال الطلبات والمتابعة عبر الموقع وواتساب مستمر يوميًا. ساعات الدوام التفصيلية مش موثقة عندي الآن، والحضور للمكتب فقط بموعد رسمي مؤكد.";
  }
  if (asksWeeklySchedule(text)) {
    return "دوام المكتب أسبوعيًا من الأحد للخميس، والجمعة والسبت عطلة. استقبال الطلبات والمتابعة عبر الموقع وواتساب مستمر يوميًا، والحضور للمكتب فقط بموعد رسمي مؤكد.";
  }
  const d = resolveOfficeScheduleTarget(text, now);
  const prefix = d.reference === "tomorrow" ? `بكرة ${d.arabic}` : d.reference === "named_day" ? d.arabic : `اليوم ${d.arabic}`;
  if (d.officeWeeklyHoliday) {
    return `${prefix} عطلة للمكتب حسب الدوام الأسبوعي، لكن استقبال الطلبات والمتابعة عبر الموقع وواتساب مستمر بشكل طبيعي. الحضور للمكتب فقط بموعد رسمي مؤكد.`;
  }
  return `${prefix} من أيام دوام المكتب حسب الجدول الأسبوعي. استقبال الطلبات والمتابعة عبر الموقع وواتساب مستمر يوميًا، والحضور للمكتب فقط بموعد رسمي مؤكد.`;
}

export function appointmentCoordinationOverclaim(text: string | null | undefined) {
  const q = normalizeArabic(String(text || ""));
  return /(?:بنسق|بننسق|بنسقلك|بنسق\s+معك|بنحدد|بحدد|بنرتب|منرتب|بحجز|بنحجز|بحجزلك|بعطيك|بثبت|بنثبت)[^\n]{0,35}(?:موعد|حضور)|(?:تعال|تعالي|اجي|أجي|احضر|احضري)[^\n]{0,25}(?:اليوم|بكره|بكرة|المكتب)(?![^\n]{0,30}موعد\s+رسمي)/.test(q);
}

export function bankStatementDurationQuestion(text: string | null | undefined) {
  const q = normalizeArabic(String(text || ""));
  const statement = /كشف\s*(?:حساب|البنك|بنكي)|bank\s*statement/i.test(q);
  if (!statement) return false;
  return /(?:كم|قديش|اقل|أقل|الحد\s*الادنى|الحد\s*الأدنى|مده|مدة|شهر|شهرين|اشهر|أشهر|يكفي|بكفي|كافي)/.test(q);
}

export function bankStatementDurationCustomerReply() {
  return "ما عندي حد أدنى ثابت وموثق لمدة كشف الحساب البنكي أقدر أؤكده لك. المدة المطلوبة بتتحدد حسب دراسة الملف، وإذا احتاجت المراجعة كشف حساب رح يوصلك المطلوب بالمدة المحددة.";
}

export function explicitDocumentUploadKind(text: string | null | undefined): ExplicitDocumentUploadKind | null {
  const q = normalizeArabic(String(text || ""));
  const wantsLinkOrUpload =
    /(?:رابط|لينك|link|كيف|وين|من\s+وين|بدي)[^\n]{0,45}(?:ارفع|أرفع|رفع|احمل|أحمّل|تحميل)/.test(q) ||
    /(?:ارفع|أرفع|رفع|احمل|أحمّل|تحميل)[^\n]{0,45}(?:رابط|لينك|الموقع|site)/.test(q);
  if (!wantsLinkOrUpload) return null;
  if (/(?:كشف|شهاده|شهادة|مفردات)\s*راتب/.test(q)) return "salarySlip";
  if (/(?:الهويه|الهوية|صوره\s*الهويه|صورة\s*الهوية)/.test(q)) return "identity";
  if (/(?:الكفيل|هويه\s*الكفيل|هوية\s*الكفيل|بيانات\s*الكفيل)/.test(q)) return "guarantor";
  return null;
}

export function productAvailabilityOverclaim(text: string | null | undefined) {
  const q = normalizeArabic(String(text || ""));
  const availability = /(?:متوفر|متوفرين|متاح|متاحين|موجود|موجودين|غير\s*متوفر|مش\s*متوفر)/.test(q);
  const product = /(?:ايفون|آيفون|iphone|سامسونج|samsung|هونر|honor|تكنو|tecno|شاومي|xiaomi|الجهاز|الموديل|برو|ماكس)/i.test(q);
  return availability && product;
}
