import { calculateInstallment } from "@/lib/installments";
import { products } from "@/lib/products";
import type { ApplicationTruth } from "./types";
import { normalizeArabic } from "./text";

function compact(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : null;
}

function normalizeCatalogText(value: string) {
  return normalizeArabic(value)
    .replace(/آيفون|ايفون|أيفون/g, "iphone")
    .replace(/سامسونج/g, "samsung")
    .replace(/هونر/g, "honor")
    .replace(/تكنو/g, "tecno")
    .replace(/برو\s*ماكس/g, "pro max")
    .replace(/برو/g, "pro")
    .replace(/بلس/g, "plus")
    .replace(/الترا|ألترا/g, "ultra")
    .replace(/اير|أير/g, "air")
    .replace(/فليب/g, "flip")
    .replace(/(?:^|\s)اس\s*(\d{1,2})(?=\s|$)/g, " s$1")
    .replace(/(?:^|\s)اي\s*(\d{1,2})(?=\s|$)/g, " a$1")
    .replace(/(?:^|\s)زد\s*فليب/g, " z flip")
    .replace(/\b(\d{2,4})\s*(?:جيجا|gb)\b/g, "$1gb")
    .replace(/\+/g, " plus ")
    .replace(/\b5g\b/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productAliases(product: (typeof products)[number]) {
  const base = [product.name, product.id, `${product.name} ${product.model}`];
  return Array.from(new Set(base.flatMap(v => {
    const n = normalizeCatalogText(v);
    return [n, n.replace(/\s+5g\b/g, "").trim()];
  }).filter(Boolean)));
}

export function resolveRequestedProduct(text: string) {
  const target = normalizeCatalogText(text);
  const matches: Array<{ product: (typeof products)[number]; alias: string }> = [];
  for (const product of products) {
    for (const alias of productAliases(product)) {
      if (alias.length >= 4 && target.includes(alias)) matches.push({ product, alias });
    }
  }
  matches.sort((a,b) => b.alias.length - a.alias.length || b.product.name.length - a.product.name.length);
  if (!matches.length) return { product: null, ambiguous: [] as string[] };
  const topLen = matches[0].alias.length;
  const top = matches.filter(x => x.alias.length === topLen);
  const ids = Array.from(new Set(top.map(x => x.product.id)));
  if (ids.length > 1) return { product: null, ambiguous: top.map(x => `${x.product.name} ${x.product.model}`) };
  return { product: top[0].product, ambiguous: [] as string[] };
}

function requestedMonths(text: string, fallback: number | null) {
  const n = normalizeArabic(text);
  const match = n.match(/(?:مده|مدة|على|تقسيط|قسط)\s*(?:ال)?\s*(\d{1,2})\s*(?:شهر|اشهر)|(?:^|\s)(6|12|18|24|30|36)\s*(?:شهر|اشهر)/);
  const months = Number(match?.[1] || match?.[2] || 0);
  if (Number.isInteger(months) && months >= 3 && months <= 36) return months;
  return fallback;
}

function requestedDownPayment(text: string, fallback: number | null, price: number) {
  const n = normalizeArabic(text);
  const m = n.match(/(?:دفعة|دفعه|مقدم|مقدمه|مقدمة)[^0-9]{0,20}(\d+(?:\.\d+)?)/);
  const value = m ? Number(m[1]) : fallback;
  if (value == null || !Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.min(Number(value), price));
}

export function calculateRequestedDeviceChange(app: ApplicationTruth, text: string) {
  const resolved = resolveRequestedProduct(text);
  if (!resolved.product) {
    return { ok: false as const, blocker: resolved.ambiguous.length ? `device_ambiguous:${resolved.ambiguous.join("|")}` : "exact_catalog_device_required" };
  }
  const months = requestedMonths(text, app.installmentMonths);
  if (!months) return { ok: false as const, blocker: "installment_months_required_for_recalculation" };
  const downPayment = requestedDownPayment(text, app.downPayment, resolved.product.price);
  const calc = calculateInstallment({ price: resolved.product.price, months, downPayment });
  const deviceName = `${resolved.product.name} - ${resolved.product.model}`;
  return {
    ok: true as const,
    product: resolved.product,
    payload: {
      device_id: resolved.product.id,
      device_name: deviceName,
      device_price: resolved.product.price,
      installment_months: months,
      down_payment: calc.downPayment,
      interest_rate: calc.interestRate,
      monthly_payment: calc.monthly,
      total_with_interest: calc.totalWithInterest,
    },
    truthPatch: {
      deviceId: resolved.product.id,
      deviceName,
      devicePrice: compact(resolved.product.price),
      installmentMonths: months,
      downPayment: compact(calc.downPayment),
      interestRate: compact(calc.interestRate),
      monthlyPayment: compact(calc.monthly),
      totalWithInterest: compact(calc.totalWithInterest),
    },
    summary: `تم تغيير الجهاز إلى ${deviceName} وإعادة الحسبة تلقائيًا: السعر ${compact(resolved.product.price)} د.أ، المدة ${months} شهر، المقدم ${compact(calc.downPayment)} د.أ، والقسط الشهري التقريبي ${compact(calc.monthly)} د.أ.`,
  };
}

function jordanPhoneFromText(text: string) {
  const raw = String(text || "");
  const m = raw.match(/(?:\+?962|00962|0)?7[789]\d{7}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  if (digits.startsWith("00962")) return `0${digits.slice(5)}`;
  if (digits.startsWith("962")) return `0${digits.slice(3)}`;
  if (digits.startsWith("7") && digits.length === 9) return `0${digits}`;
  return /^07[789]\d{7}$/.test(digits) ? digits : null;
}

export function extractApplicationPatch(text: string) {
  const raw = String(text || "").trim();
  const n = normalizeArabic(raw);
  const patch: Record<string, string | number> = {};

  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email && /ايميل|email|البريد/.test(n)) patch.email = email.toLowerCase();

  const phone = jordanPhoneFromText(raw);
  if (phone && /رقم|هاتف|تلفون|موبايل|واتساب/.test(n)) patch.phone = phone;

  const salary = n.match(/(?:راتب|الراتب)[^0-9]{0,20}(\d{2,5})/)?.[1];
  if (salary) {
    const value = Number(salary);
    if (value >= 100 && value <= 20000) patch.salary = value;
  }

  const nameMatch = raw.match(/(?:الاسم|اسمي)\s*(?:الصحيح|الجديد|هو|:)\s*([^\n،,]{3,80})/i);
  if (nameMatch) {
    const name = nameMatch[1].replace(/\s+/g," ").trim();
    if (/^[\p{L}\s.'-]{3,80}$/u.test(name)) patch.full_name = name;
  }

  return patch;
}
