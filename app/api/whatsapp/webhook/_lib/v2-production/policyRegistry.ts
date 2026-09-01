export const V2_POLICY_VERSION = "2026-09-01-final-os";

export const V2_POLICY = {
  businessName: "الأمين للأقساط",
  generalLocation: "عمّان – شارع المدينة المنورة",
  website: "https://www.ameenfinance.co",
  fileOpeningFeeJod: 5,
  fileOpeningFeeTiming: "تُطلب فقط بعد التأهيل المبدئي إذا اختار العميل الاستمرار",
  firstInstallment: "القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد",
  delivery: "لا يوجد توصيل؛ الاستلام من المكتب بموعد",
  paymentAliases: ["AMEEENPAY", "AMENPAY"] as const,
  paymentBeneficiary: "ABDUL RAHMAN ALHARAHSHEH",
  independence:
    "الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق",
  forbiddenBusinessNames: ["الأمين للأقساط والتمويل"],
  forbiddenPaymentAliases: ["PAYAMEN", "PAYAMEEN", "AMEENPAY"],
} as const;

export function policyTruthForPrompt() {
  return {
    version: V2_POLICY_VERSION,
    business_name: V2_POLICY.businessName,
    general_location: V2_POLICY.generalLocation,
    website: V2_POLICY.website,
    file_opening_fee_jod: V2_POLICY.fileOpeningFeeJod,
    file_opening_fee_timing: V2_POLICY.fileOpeningFeeTiming,
    first_installment_rule: V2_POLICY.firstInstallment,
    delivery_policy: V2_POLICY.delivery,
    payment_aliases: V2_POLICY.paymentAliases,
    payment_beneficiary: V2_POLICY.paymentBeneficiary,
    independence_statement: V2_POLICY.independence,
  };
}

export function v2PolicyViolations(reply: string) {
  const text = String(reply || "");
  const compact = text.replace(/\s+/g, " ").trim();
  const violations = new Set<string>();

  if (!compact) violations.add("empty_reply");
  if (compact.length > 1800) violations.add("reply_too_long");

  for (const name of V2_POLICY.forbiddenBusinessNames) {
    if (text.includes(name)) violations.add("forbidden_business_name");
  }
  for (const alias of V2_POLICY.forbiddenPaymentAliases) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(text)) violations.add("forbidden_payment_alias");
  }

  if (/(?:رسوم|فتح\s*الملف)[^\n]{0,50}(?:3|٣)\s*(?:دنانير|دينار|JD|JOD)?/i.test(text)) {
    violations.add("legacy_three_jod_fee_leak");
  }
  if (/(?:رسوم\s*فتح\s*الملف)[^\n]{0,50}(?:عند\s*(?:الاستلام|الحضور)|بالمكتب|في\s*المكتب)/i.test(text)) {
    violations.add("wrong_file_fee_timing");
  }
  if (/(?:القسط|الدفعة)\s*(?:الأول|الاول|الأولى|الاولى)[^\n]{0,90}(?:عند\s*الاستلام|بعد\s*الاستلام\s*(?:مباشرة)?)(?![^\n]{0,40}(?:شهر))/i.test(text)) {
    violations.add("wrong_first_installment_timing");
  }
  if (/(?:ارسل|أرسل|ابعث|ابعت|حط|ارفع|أرفع)[^\n]{0,50}(?:الوصل|الإيصال|الايصال|صورة\s*الدفع)[^\n]{0,40}(?:هون|هنا|واتساب|الواتساب)/i.test(text)) {
    violations.add("payment_proof_over_whatsapp");
  }
  if (/(?:توصيل|مندوب)[^\n]{0,60}(?:الجهاز|الهاتف|الموبايل)/i.test(text) && !/(?:لا\s*(?:يوجد|في)|ما\s*في)[^\n]{0,35}(?:توصيل)/i.test(text)) {
    violations.add("delivery_policy_violation");
  }
  if (/(?:رح|سوف|سيتم|بمجرد|أول\s*ما)[^\n]{0,80}(?:نتواصل|يتواصل|يصلك|نرجعلك|أرجعلك|نبلغك|إشعار|اشعار)/i.test(text)) {
    violations.add("unsupported_future_contact_promise");
  }

  if (/(?:ذكاء\s*اصطناعي|AI|DeepSeek|OpenAI|الحارس|validator|prompt|system\s*prompt)/i.test(text)) {
    violations.add("internal_or_ai_language");
  }
  if (/إذا\s+(?:عندك|عندكم)\s+(?:أي|اي)\s+استفسار[^\n]{0,30}(?:أنا|انا)\s+(?:جاهز|جاهزة)/i.test(text)) {
    violations.add("robotic_generic_closer");
  }

  return Array.from(violations);
}
