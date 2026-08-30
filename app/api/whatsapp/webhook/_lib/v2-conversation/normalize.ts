export function v2Normalize(value: string | null | undefined) {
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

export function v2Compact(value: string | null | undefined) {
  return v2Normalize(value).replace(/[\s\-_.،,!?؟:;؛'"“”()[\]{}]+/g, "");
}

export function v2HasAny(value: string, needles: string[]) {
  const text = v2Normalize(value);
  return needles.some((needle) => text.includes(v2Normalize(needle)));
}

export function v2Language(value: string): "ar" | "en" | "mixed" {
  const text = String(value || "");
  const hasAr = /[\u0600-\u06ff]/.test(text);
  const hasEn = /[a-z]/i.test(text);
  if (hasAr && hasEn) return "mixed";
  if (hasEn) return "en";
  return "ar";
}

export function uniqueStrings<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}
