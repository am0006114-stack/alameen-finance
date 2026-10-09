import type { V4TruthBundle, V4TurnUnderstanding } from "./types";
import { normalizeForFingerprint } from "./workingMemory";

const CORE_KEYS = new Set([
  "business.name",
  "application.exists",
  "application.tracking_id",
  "application.journey_stage",
]);

function addPrefix(keys: Set<string>, truth: V4TruthBundle, prefix: string) {
  for (const key of Object.keys(truth.facts)) if (key.startsWith(prefix)) keys.add(key);
}

/**
 * The writer should not stare at every commercial truth on every turn. This lens
 * narrows authoritative facts to the current customer goal, reducing cross-topic
 * contamination while keeping the full TruthBundle available to the critic.
 */
export function relevantFactKeys(input: {
  burstText: string;
  understanding: V4TurnUnderstanding;
  truth: V4TruthBundle;
}) {
  const q = normalizeForFingerprint(`${input.burstText} ${input.understanding.currentGoal || ""} ${input.understanding.explicitQuestions.join(" ")}`);
  const keys = new Set<string>(CORE_KEYS);

  for (const key of input.understanding.neededFactKeys || []) {
    if (input.truth.facts[key]?.customerVisible) keys.add(key);
  }

  if (/(?:موقع|وينكم|عنوان|لوكيشن|location)/.test(q)) {
    keys.add("business.location.general");
  }
  if (/(?:موقعكم الرسمي|الموقع الرسمي|website|ويبسايت|رابط الموقع)/.test(q)) {
    keys.add("business.website");
    keys.add("business.products_url");
  }
  if (/(?:منتج|جهاز|ايفون|iphone|سامسونج|سعر|المنتجات)/i.test(q)) {
    keys.add("business.products_url");
    keys.add("application.device_name");
    keys.add("application.device_price");
  }
  if (/(?:حاله|حالة|طلبي|طلب|موافق|موافقه|الموافقة|انقبل|رفض)/.test(q)) {
    keys.add("application.status.customer");
    keys.add("application.status.raw");
  }
  if (/(?:متى|مده|مدة|مراجعه|مراجعة|دراسه|دراسة|وقت|اليوم|بكره|بكرة)/.test(q)) {
    keys.add("review.normal_window");
    keys.add("review.pressure");
    keys.add("review.severe_pressure_rule");
  }
  if (/(?:استلم|استلام|تسليم|توصيل|الجهاز يوصل|موعد الاستلام)/.test(q)) {
    keys.add("pickup.rule");
    keys.add("recent_release.rule");
    keys.add("application.delivery_delay_until");
    keys.add("application.device_name");
  }
  if (/(?:قسط|اقساط|أقساط|تقسيط|شهر|36|٣٦|12|١٢|فائده|فائدة|ربح)/.test(q)) {
    keys.add("installment.first_rule");
    addPrefix(keys, input.truth, "application.installment_");
    keys.add("application.interest_rate");
    keys.add("application.monthly_payment");
    keys.add("application.total_with_interest");
    keys.add("application.device_price");
  }
  if (/(?:5|٥|رسوم|فتح الملف|دفع|ادفع|أدفع|احول|أحول|حواله|حوالة|كليك|cliq|اورنج|orange)/i.test(q)) {
    addPrefix(keys, input.truth, "fee.opening.");
    addPrefix(keys, input.truth, "payment.");
    keys.add("application.payment_confirmed");
    keys.add("application.payment_status");
    keys.add("application.receipt_upload_link");
  }
  if (/(?:وصل|ايصال|إيصال|اثبات حواله|إثبات حوالة|صوره الحواله|صورة الحوالة)/.test(q)) {
    keys.add("application.receipt_upload_link");
    keys.add("payment.confirmation_rule");
    keys.add("application.payment_confirmed");
    keys.add("application.payment_status");
    keys.add("application.documents");
  }
  if (/(?:استرداد|استرجاع|رجعولي|رجعلي|المصاري|الرسوم ترجع)/.test(q)) {
    keys.add("fee.opening.refund_rule");
    keys.add("refund.pressure_rule");
    keys.add("application.payment_confirmed");
    keys.add("application.payment_status");
    keys.add("application.refund_link");
    keys.add("application.status.customer");
  }
  if (/(?:شرط|شروط|مطلوب|متطلبات|راتب|دخل|كشف|سجل تجاري|كابتن|كفيل)/.test(q)) {
    keys.add("requirements.guidance");
    keys.add("documents.secure_rule");
    keys.add("application.documents");
  }
  if (/(?:تتبع|متابعه|متابعة|رابط الطلب)/.test(q)) {
    keys.add("application.tracking_link");
    keys.add("business.tracking_url");
    keys.add("application.status.customer");
  }
  if (/(?:حقيقي|نصاب|نصب|ثقه|ثقة|شركة|مرخص|ترخيص|فيسبوك|انستغرام|instagram|facebook)/i.test(q)) {
    keys.add("business.name");
    keys.add("business.website");
    keys.add("business.independence");
    keys.add("business.commercial_structure");
  }

  return Array.from(keys).filter((key) => Boolean(input.truth.facts[key]?.customerVisible));
}

export function lensTruthBundle(input: {
  burstText: string;
  understanding: V4TurnUnderstanding;
  truth: V4TruthBundle;
}): V4TruthBundle {
  const selected = new Set(relevantFactKeys(input));
  return {
    ...input.truth,
    facts: Object.fromEntries(Object.entries(input.truth.facts).filter(([key, fact]) => selected.has(key) && fact.customerVisible)),
  };
}
