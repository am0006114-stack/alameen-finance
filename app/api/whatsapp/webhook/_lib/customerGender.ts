import { normalizeArabicText } from "./text";

export type CustomerGender = "male" | "female" | "unknown";

const FEMALE_ARABIC_NAMES = new Set([
  "ايه", "ايه", "آيه", "آية", "اية", "هديل", "رسل", "هبه", "هبة", "ساره", "سارة",
  "رنا", "تالا", "فاطمه", "فاطمة", "لمى", "لما", "ريم", "رؤى", "روان", "دانا",
  "فرح", "لين", "ليان", "مريم", "زينه", "زينة", "شهد", "ربى", "عبير", "عائشه", "عائشة",
  "دعاء", "اسراء", "إسراء", "امل", "أمل", "سلمى", "ميس", "ميساء", "ميسون", "منى", "منال",
  "نسرين", "نادين", "نانسي", "يارا", "لارا", "لانا", "ديما", "ديمه", "ديمة", "جنى", "جودي",
  "رهف", "رغد", "رزان", "رولا", "رند", "رندة", "رنده", "نورا", "نوره", "نورة", "اسماء", "أسماء",
  "وفاء", "صفاء", "هناء", "سناء", "علا", "غدير", "غزل", "مرح", "ملك", "ملاك", "حنين", "حلا",
  "هلا", "شيماء", "سهى", "سها", "سمر", "سميرة", "سميره", "ناديا", "نادية", "ناديه", "بشرى",
  "كوثر", "خديجة", "خديجه", "رقية", "رقيه", "زينب", "بتول", "ايمان", "إيمان", "ايات", "آيات",
]);

const MALE_ARABIC_NAMES = new Set([
  "محمد", "احمد", "أحمد", "محمود", "مصطفى", "خالد", "هاشم", "عبدالله", "عبدالرحمن", "عبد الرحمن",
  "عمر", "علي", "حسن", "حسين", "يوسف", "ياسر", "ياسين", "رامي", "سامر", "سامي", "مروان", "معاذ",
  "معن", "مالك", "ماهر", "بسام", "غسان", "فراس", "فادي", "فهد", "فيصل", "طارق", "تامر", "ثائر",
  "جمال", "حازم", "حمزه", "حمزة", "راشد", "رائد", "زياد", "زيد", "سعد", "سعيد", "سلطان",
  "شادي", "صالح", "عامر", "عادل", "عباس", "عثمان", "عدي", "علاء", "عماد", "عمران", "قيس", "لؤي",
  "ليث", "مؤيد", "نايف", "ناصر", "نبيل", "نضال", "هاني", "هيثم", "وليد", "يزن", "يحيى", "باسل", "حسام", "يعقوب", "موسى", "عبادة", "عباده", "عبيدة", "عبيده", "ابراهيم",
  "إبراهيم", "اسماعيل", "إسماعيل", "اياد", "إياد", "ادهم", "أدهم", "انس", "أنس", "اوس", "أوس",
]);

const FEMALE_LATIN_NAMES = new Set([
  "aya", "ayah", "hadeel", "rusul", "russul", "sara", "sarah", "rana", "tala", "fatima", "fatma",
  "reem", "rawan", "dana", "farah", "leen", "layan", "mariam", "maryam", "zainab", "zeinab",
  "lama", "lamaa", "ruba", "heba", "hiba", "amal", "esraa", "israa", "manal", "yasmin", "yasmine",
]);

const MALE_LATIN_NAMES = new Set([
  "mohammad", "mohamed", "mohammed", "ahmad", "ahmed", "mahmoud", "mustafa", "khaled", "hashem",
  "abdullah", "omar", "ali", "hassan", "hussein", "yousef", "yusuf", "rami", "samer", "fadi", "yazan", "basel", "hossam", "hussam", "yacoub", "yaqub", "zaid", "zayd", "abood", "mousa",
]);

const MALE_TAA_MARBUTA_EXCEPTIONS = new Set([
  "حمزه", "حمزة", "اسامه", "أسامة", "طلحه", "طلحة", "معاويه", "معاوية", "عكرمه", "عكرمة", "خليفه", "خليفة", "عبادة", "عباده", "عبيدة", "عبيده",
]);

function firstNameToken(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const cleaned = raw
    .replace(/[👷🏻‍♀️👷‍♀️👩🏻👩👧🏻👧💗🌿✅❤❤️]/gu, " ")
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ")[0] || "";
}

export function detectCustomerGender(
  applicationName?: string | null,
  profileName?: string | null,
): CustomerGender {
  const token = firstNameToken(applicationName) || firstNameToken(profileName);
  if (!token) return "unknown";

  const latin = token.toLowerCase();
  if (/^[a-z'-]+$/i.test(token)) {
    if (FEMALE_LATIN_NAMES.has(latin)) return "female";
    if (MALE_LATIN_NAMES.has(latin) || /(?:mohammad|mohamed|mohammed|ahmad|ahmed)$/.test(latin)) return "male";
    return "unknown";
  }

  const normalized = normalizeArabicText(token);
  if (normalized === "عبد" && String(applicationName || profileName || "").trim().split(/\s+/).length > 1) return "male";
  if (FEMALE_ARABIC_NAMES.has(token) || FEMALE_ARABIC_NAMES.has(normalized)) return "female";
  if (MALE_ARABIC_NAMES.has(token) || MALE_ARABIC_NAMES.has(normalized)) return "male";

  if ((token.endsWith("ة") || token.endsWith("ه")) && !MALE_TAA_MARBUTA_EXCEPTIONS.has(token) && !MALE_TAA_MARBUTA_EXCEPTIONS.has(normalized)) {
    return "female";
  }

  return "unknown";
}

export function noAdditionalActionLine(gender: CustomerGender): string {
  if (gender === "female") return "حاليًا ما عليكِ أي خطوة إضافية.";
  if (gender === "male") return "حاليًا ما عليك أي خطوة إضافية.";
  return "حاليًا لا توجد أي خطوة إضافية مطلوبة.";
}

export function nextStageContactLine(gender: CustomerGender): string {
  if (gender === "female") return "وعند انتقال الطلب للمرحلة التالية أو ظهور أي متطلب رح نتواصل معكِ عبر واتساب.";
  if (gender === "male") return "وعند انتقال الطلب للمرحلة التالية أو ظهور أي متطلب رح نتواصل معك عبر واتساب.";
  return "وعند انتقال الطلب للمرحلة التالية أو ظهور أي متطلب سيتم التواصل عبر واتساب.";
}

export function enforceCustomerGenderLanguage(value: string, gender: CustomerGender): string {
  let reply = String(value || "");

  if (gender === "female") {
    reply = reply
      .replace(/(?:^|\s)تقدر\s+تحول(?=\s|[،,.؟!:]|$)/g, (match) => `${match.startsWith(" ") ? " " : ""}بتقدري تحولي`)
      .replace(/(?:^|\s)بتقدر\s+تحول(?=\s|[،,.؟!:]|$)/g, (match) => `${match.startsWith(" ") ? " " : ""}بتقدري تحولي`)
      .replace(/إذا حاب(?=\s|[،,.؟!:]|$)/g, "إذا حابة")
      .replace(/اذا حاب(?=\s|[،,.؟!:]|$)/g, "إذا حابة")
      .replace(/إذا كنت جاهز(?=\s|[،,.؟!:]|$)/g, "إذا كنتِ جاهزة")
      .replace(/اذا كنت جاهز(?=\s|[،,.؟!:]|$)/g, "إذا كنتِ جاهزة")
      .replace(/(^|\s)اكتب:\s*/g, "$1اكتبي: ")
      .replace(/(^|\s)ارفع(?=\s|[،,.؟!:]|$)/g, "$1ارفعي")
      .replace(/(^|\s)ادفع(?=\s|[،,.؟!:]|$)/g, "$1ادفعي")
      .replace(/(^|\s)حول(?=\s|[،,.؟!:]|$)/g, "$1حوّلي")
      .replace(/(^|\s)حوّل(?=\s|[،,.؟!:]|$)/g, "$1حوّلي")
      .replace(/(^|\s)ابعث(?=\s|[،,.؟!:]|$)/g, "$1ابعثي")
      .replace(/ما عليك أي خطوة/g, "ما عليكِ أي خطوة")
      .replace(/نتواصل معك(?!ِ)/g, "نتواصل معكِ");
  } else if (gender === "male") {
    reply = reply
      .replace(/(?:^|\s)بتقدري\s+تحولي(?=\s|[،,.؟!:]|$)/g, (match) => `${match.startsWith(" ") ? " " : ""}بتقدر تحول`)
      .replace(/إذا حابة(?=\s|[،,.؟!:]|$)/g, "إذا حاب")
      .replace(/اذا حابة(?=\s|[،,.؟!:]|$)/g, "إذا حاب")
      .replace(/إذا كنتِ جاهزة(?=\s|[،,.؟!:]|$)/g, "إذا كنت جاهز")
      .replace(/اذا كنتِ جاهزة(?=\s|[،,.؟!:]|$)/g, "إذا كنت جاهز")
      .replace(/(^|\s)اكتبي:\s*/g, "$1اكتب: ")
      .replace(/(^|\s)ارفعي(?=\s|[،,.؟!:]|$)/g, "$1ارفع")
      .replace(/(^|\s)ادفعي(?=\s|[،,.؟!:]|$)/g, "$1ادفع")
      .replace(/(^|\s)حوّلي(?=\s|[،,.؟!:]|$)/g, "$1حوّل")
      .replace(/(^|\s)ابعثي(?=\s|[،,.؟!:]|$)/g, "$1ابعث")
      .replace(/ما عليكِ أي خطوة/g, "ما عليك أي خطوة")
      .replace(/نتواصل معكِ/g, "نتواصل معك");
  } else {
    reply = reply
      .replace(/(?:^|\s)(?:تقدر\s+تحول|بتقدر\s+تحول|بتقدري\s+تحولي)(?=\s|[،,.؟!:]|$)/g, (match) => `${match.startsWith(" ") ? " " : ""}التحويل متاح`)
      .replace(/إذا حاب(?:ة)?(?=\s|[،,.؟!:]|$)/g, "للاستمرار")
      .replace(/اذا حاب(?:ة)?(?=\s|[،,.؟!:]|$)/g, "للاستمرار")
      .replace(/إذا كنتِ? جاهز(?:ة)?(?=\s|[،,.؟!:]|$)/g, "عند الجاهزية")
      .replace(/اذا كنتِ? جاهز(?:ة)?(?=\s|[،,.؟!:]|$)/g, "عند الجاهزية")
      .replace(/ما عليكِ? أي خطوة إضافية/g, "لا توجد أي خطوة إضافية مطلوبة")
      .replace(/(^|\s)اكتب(?:ي)?:\s*/g, "$1يمكن إرسال العبارة التالية: ");
  }

  return reply;
}

export function hasGenderLanguageMismatch(value: string, gender: CustomerGender): boolean {
  const reply = String(value || "");
  const masculine = /(?:إذا|اذا) حاب(?=\s|[،,.؟!:]|$)|(?:إذا|اذا) كنت جاهز(?=\s|[،,.؟!:]|$)|(?:^|\s)(?:تقدر|بتقدر)\s+تحول(?=\s|[،,.؟!:]|$)|(?:^|\s)اكتب:|(?:^|\s)ارفع(?=\s|[،,.؟!:]|$)|(?:^|\s)ادفع(?=\s|[،,.؟!:]|$)|(?:^|\s)ابعث(?=\s|[،,.؟!:]|$)|ما عليك أي خطوة/;
  const feminine = /(?:إذا|اذا) حابة(?=\s|[،,.؟!:]|$)|(?:إذا|اذا) كنتِ جاهزة(?=\s|[،,.؟!:]|$)|(?:^|\s)بتقدري\s+تحولي(?=\s|[،,.؟!:]|$)|(?:^|\s)اكتبي:|(?:^|\s)ارفعي(?=\s|[،,.؟!:]|$)|(?:^|\s)ادفعي(?=\s|[،,.؟!:]|$)|(?:^|\s)ابعثي(?=\s|[،,.؟!:]|$)|ما عليكِ أي خطوة/;
  if (gender === "female") return masculine.test(reply);
  if (gender === "male") return feminine.test(reply);
  return masculine.test(reply) || feminine.test(reply);
}
