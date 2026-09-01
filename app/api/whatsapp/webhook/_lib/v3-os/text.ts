export function normalizeArabic(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ").trim();
}

export function hasAny(text: string, values: string[]) {
  const n = normalizeArabic(text);
  return values.some((v) => n.includes(normalizeArabic(v)));
}

export function isQuestion(text: string) {
  const n = normalizeArabic(text);
  return /[؟?]/.test(text) || /(?:^|\s)(شو|كيف|ليش|ليه|متى|امتى|وين|اين|كم|قديش|هل|ممكن|بقدر|بنفع)(?:\s|$)/.test(n);
}
