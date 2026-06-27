import { BUSINESS_NAME } from "./constants";

export function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

export function digitsOnly(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeArabicText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

export function hasAny(text: string, keywords: string[]) {
  const t = normalizeArabicText(text);
  return keywords.some((word) => t.includes(normalizeArabicText(word)));
}

export function normalizeJordanPhone(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("00962") && digits.length === 14) return `0${digits.slice(5)}`;
  if (digits.startsWith("962") && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.startsWith("7") && digits.length === 9) return `0${digits}`;
  return digits;
}

export function normalizeWhatsAppToSend(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("00962")) return digits.slice(2);
  if (digits.startsWith("962")) return digits;
  if (digits.startsWith("07") && digits.length === 10) return `962${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `962${digits}`;
  return digits;
}

export function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "عميلنا الكريم";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

export function formatJordanDateTime(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("ar-JO", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function extractTracking(text: string) {
  const matches = String(text || "").match(/AM-\d{8,}/gi) || [];
  return matches.length ? matches[matches.length - 1].toUpperCase() : "";
}

export function extractJordanPhoneFromText(text: string) {
  const raw = String(text || "");
  const candidates = raw.match(/(?:\+?962|00962|0)?7[789]\d{7}/g) || [];

  for (const candidate of candidates) {
    const normalized = normalizeJordanPhone(candidate);
    if (/^07[789]\d{7}$/.test(normalized)) {
      return normalized;
    }
  }

  return "";
}

const agentNames = [
  "تالا",
  "فدوة",
  "لينا",
  "عبدالله",
  "خالد",
  "عبدالرحمن",
];

export function pickAgentName(seed: string) {
  const digits = digitsOnly(seed);
  const last = Number(digits.slice(-2) || "0");
  return agentNames[last % agentNames.length];
}

export function humanOpening(seed: string) {
  const variants = [
    "تمام، وصلتني 🌿",
    "وصلتني، خلينا نراجعها بهدوء 🌿",
    "فاهم عليك، خليني أوضحلك 🌿",
    "حاضر، براجع معك نفس النقطة 🌿",
    "تمام، خلينا نربطها بالطلب الصحيح 🌿",
    "وصلت، خلينا نحكي بالمؤكد 🌿",
    "معك، وبعطيك الواضح بدون لف ودوران 🌿",
    "تمام، خطوة خطوة وبنوضحها 🌿",
  ];

  const digits = digitsOnly(seed);
  const last = Number(digits.slice(-2) || "0");

  return variants[last % variants.length];
}

export function softFaithPhrase(seed: string) {
  const variants = [
    "بإذن الله",
    "إن شاء الله",
    "الله ييسر الأمور",
    "الله يعطيك العافية",
  ];

  const digits = digitsOnly(seed);
  const last = Number(digits.slice(-2) || "0");

  return variants[last % variants.length];
}
