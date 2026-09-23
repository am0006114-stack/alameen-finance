import { normalizeArabic } from "./text";

export const ALAMEEN_FIRST_INSTALLMENT_RULE =
  "القسط الأول يستحق بعد شهر من تاريخ توقيع العقد، وتاريخ توقيع العقد هو نفسه تاريخ استلام الجهاز.";

export const ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE =
  "سداد الأقساط الشهرية يكون حسب تفضيل العميل: عبر CliQ، أو تحويل بنكي، أو بالحضور إلى الموقع الذي تم فيه توقيع العقد والدفع هناك.";

export const ALAMEEN_CONTRACT_RECEIPT_DATE_RULE =
  "تاريخ توقيع العقد هو نفسه تاريخ استلام الجهاز.";

export const IPHONE18_PICKUP_RULE =
  "بالنسبة لأجهزة iPhone 18 Pro وiPhone 18 Pro Max، الاستلام يكون بعد شهر من الموافقة النهائية، ومن المكتب وبموعد رسمي مؤكد فقط؛ لا يوجد توصيل.";

export const IPHONE18_WARRANTY_RULE =
  "أجهزة iPhone 18 Pro وiPhone 18 Pro Max المعروضة لدى الأمين نسخة الشرق الأوسط، وكفالتها iSYSTEMS الأردن.";

export const IPHONE18_COLORS = ["أسود", "فضي", "جليدي", "عنّابي"] as const;

export const IPHONE18_PRODUCTS = [
  { id: "iphone-18-pro-256", model: "iPhone 18 Pro", capacity: "256GB", priceJod: 1199 },
  { id: "iphone-18-pro-512", model: "iPhone 18 Pro", capacity: "512GB", priceJod: 1399 },
  { id: "iphone-18-pro-1tb", model: "iPhone 18 Pro", capacity: "1TB", priceJod: 1799 },
  { id: "iphone-18-pro-2tb", model: "iPhone 18 Pro", capacity: "2TB", priceJod: 2399 },
  { id: "iphone-18-pro-max-256", model: "iPhone 18 Pro Max", capacity: "256GB", priceJod: 1299 },
  { id: "iphone-18-pro-max-512", model: "iPhone 18 Pro Max", capacity: "512GB", priceJod: 1499 },
  { id: "iphone-18-pro-max-1tb", model: "iPhone 18 Pro Max", capacity: "1TB", priceJod: 1899 },
  { id: "iphone-18-pro-max-2tb", model: "iPhone 18 Pro Max", capacity: "2TB", priceJod: 2499 },
] as const;

function compact(value: string) {
  return normalizeArabic(String(value || ""))
    .toLowerCase()
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isIphone18Question(value: string | null | undefined) {
  const q = compact(String(value || ""));
  return /(?:iphone|ايفون|آيفون)\s*18|18\s*(?:pro|برو|بروماكس|برو ماكس)/i.test(q);
}

function requestedCapacity(value: string) {
  const q = compact(value);
  if (/(?:^|\s)(?:256|٢٥٦)(?:\s|$)|256\s*(?:gb|جيجا)/i.test(q)) return "256GB";
  if (/(?:^|\s)(?:512|٥١٢)(?:\s|$)|512\s*(?:gb|جيجا)/i.test(q)) return "512GB";
  if (/(?:^|\s)(?:1\s*tb|1tb|١\s*تيرا|تيرا\s*1|تيرا\s*١)/i.test(q)) return "1TB";
  if (/(?:^|\s)(?:2\s*tb|2tb|٢\s*تيرا|تيرا\s*2|تيرا\s*٢)/i.test(q)) return "2TB";
  return null;
}

function requestedModel(value: string) {
  const q = compact(value);
  if (/(?:pro\s*max|برو\s*ماكس|بروماكس)/i.test(q)) return "iPhone 18 Pro Max";
  if (/(?:pro|برو)/i.test(q)) return "iPhone 18 Pro";
  return null;
}

function priceList(model: "iPhone 18 Pro" | "iPhone 18 Pro Max") {
  return IPHONE18_PRODUCTS.filter((x) => x.model === model)
    .map((x) => `${x.capacity} بسعر ${x.priceJod.toLocaleString("en-US")} د.أ`)
    .join("، ");
}

export function buildIphone18AuthoritativeReply(value: string | null | undefined): string | null {
  const raw = String(value || "");
  if (!isIphone18Question(raw)) return null;
  const q = compact(raw);
  const model = requestedModel(raw);
  const capacity = requestedCapacity(raw);
  const parts: string[] = [];

  const asksColors = /(?:لون|الوان|الألوان|الوانه|ألوانه)/.test(q);
  const asksWarranty = /(?:كفال|ضمان|نسخت|نسخه|نسخة|شرق\s*اوسط|الشرق\s*الأوسط|الشرق\s*الاوسط|isystems)/i.test(q);
  const asksDiscount = /(?:خصم|5\s*%|٥\s*٪|خمسه\s*بالم)/.test(q);
  const asksPickup = /(?:متى|استلم|استلام|توصيل|يوصل|وصلني|فوري|متوفر\s*هسا|مخزون|متاح)/.test(q);
  const asksInstallment = /(?:قسط|قسطه|القسط|شهري|بالشهر)/.test(q);
  const asksPrice = /(?:سعر|بكم|قديش|كم)/.test(q);

  if (asksPrice) {
    if (model && capacity) {
      const product = IPHONE18_PRODUCTS.find((x) => x.model === model && x.capacity === capacity);
      if (product) parts.push(`${product.model} ${product.capacity} سعره الحالي ${product.priceJod.toLocaleString("en-US")} د.أ. السعر نهائي حاليًا قبل حسبة التقسيط وما عليه خصم 5%.`);
    } else if (model) {
      parts.push(`${model}: ${priceList(model)}. الأسعار نهائية حاليًا قبل حسبة التقسيط وما عليها خصم 5%.`);
    } else {
      parts.push(`iPhone 18 Pro: ${priceList("iPhone 18 Pro")}.

iPhone 18 Pro Max: ${priceList("iPhone 18 Pro Max")}.
الأسعار نهائية حاليًا قبل حسبة التقسيط وما عليها خصم 5%.`);
    }
  }

  if (asksColors) parts.push(`الألوان المعتمدة حاليًا لأجهزة iPhone 18 Pro وPro Max هي: ${IPHONE18_COLORS.join("، ")}.`);
  if (asksWarranty) parts.push(IPHONE18_WARRANTY_RULE);
  if (asksDiscount && !asksPrice) parts.push("لا، iPhone 18 Pro وiPhone 18 Pro Max ما عليهم خصم 5%. الأسعار المعروضة لهم نهائية قبل حسبة التقسيط، وخصم 5% مخصص لأجهزة iPhone السابقة حسب الكتالوج.");
  if (asksPickup) parts.push(`${IPHONE18_PICKUP_RULE} وجود الجهاز ضمن الكتالوج يعني إنه معروض للتقديم، مش وعد بمخزون أو استلام فوري.`);
  if (asksInstallment && !asksPrice) parts.push("سعر أجهزة iPhone 18 مثبت، لكن رقم القسط الشهري لازم يطلع من الحسبة/الطلب الرسمي المعتمد؛ ما بحسبه من السعر لحاله ولا بطبق خصم 5% عليه.");

  if (parts.length) return parts.join("\n\n");
  return `iPhone 18 Pro وiPhone 18 Pro Max موجودين ضمن الأجهزة المعروضة للتقديم. الألوان: ${IPHONE18_COLORS.join("، ")}. ${IPHONE18_WARRANTY_RULE} ${IPHONE18_PICKUP_RULE}`;
}

export function businessTruthForPrompt() {
  return {
    firstInstallment: ALAMEEN_FIRST_INSTALLMENT_RULE,
    installmentPaymentChannels: ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE,
    contractAndReceiptDate: ALAMEEN_CONTRACT_RECEIPT_DATE_RULE,
    iphone18: {
      products: IPHONE18_PRODUCTS,
      colors: IPHONE18_COLORS,
      warranty: IPHONE18_WARRANTY_RULE,
      pickup: IPHONE18_PICKUP_RULE,
      discountPercent: 0,
      delivery: false,
    },
  };
}
