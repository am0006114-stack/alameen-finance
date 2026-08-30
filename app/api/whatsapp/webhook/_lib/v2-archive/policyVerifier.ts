import { normalizeArabicText } from "../text";
import { hasInternalCustomerFacingLanguage } from "../customerFacingPolicy";

function n(value: string | null | undefined) {
  return normalizeArabicText(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function isLowValueArchiveNoise(value: string | null | undefined, messageType?: string | null) {
  const raw = String(value || "").trim();
  const text = n(raw);
  if (!text) return true;

  if (String(messageType || "").toLowerCase() === "unsupported") return true;

  return [
    "this is a text message",
    "this is a message",
    "text message",
    "تم استلام رساله واتساب من نوع unsupported",
    "تم استلام رسالة واتساب من نوع unsupported",
  ].some((needle) => text === n(needle));
}

export function isSimpleSocialArchiveTurn(value: string | null | undefined) {
  const text = n(value);
  if (!text) return false;
  return new Set([
    "مرحبا", "هلا", "اهلا", "اهلين", "السلام عليكم", "صباح الخير", "مساء الخير",
    "شكرا", "شكراً", "مشكور", "يسلمو", "تسلم", "العفو",
  ].map(n)).has(text);
}

export function archiveReplyPolicyViolations(value: string | null | undefined) {
  const raw = String(value || "");
  const text = n(raw);
  if (!text) return [] as string[];

  const violations: string[] = [];

  // Canonical operating identity is exactly "الأمين للأقساط".
  if (text.includes(n("الأمين للأقساط والتمويل")) || text.includes(n("الامين للاقساط والتمويل"))) {
    violations.push("forbidden_business_name_alameen_installments_and_finance");
  }

  if (/\bpayamen\b/i.test(raw)) {
    violations.push("forbidden_payment_alias_payamen");
  }

  if (hasInternalCustomerFacingLanguage(raw)) {
    violations.push("internal_system_language_leak");
  }

  const claimsLicensed = [
    "مرخص من البنك المركزي", "مرخصه من البنك المركزي", "مرخصة من البنك المركزي",
    "خاضع لرقابه البنك المركزي", "خاضعه لرقابه البنك المركزي", "خاضعة لرقابة البنك المركزي",
  ].some((needle) => text.includes(n(needle)));
  const explicitNegation = [
    "لسنا مرخصين", "ليست مرخصه", "ليست مرخصة", "لا ندعي", "لا تدعي",
    "لسنا خاضعين", "ليست خاضعه", "ليست خاضعة",
  ].some((needle) => text.includes(n(needle)));
  if (claimsLicensed && !explicitNegation) violations.push("unsupported_central_bank_claim");

  const financePositiveClaim = [
    "نحن شركه تمويل", "نحن شركة تمويل", "الأمين شركه تمويل", "الأمين شركة تمويل",
    "الامين شركه تمويل", "الامين شركة تمويل",
  ].some((needle) => text.includes(n(needle)));
  if (financePositiveClaim) violations.push("unsupported_finance_company_claim");

  const sendsSensitiveOnWhatsapp = [
    "ابعث الهويه هون", "ابعث الهوية هون", "ارسل الهويه هون", "أرسل الهوية هون",
    "ابعث كشف الراتب هون", "ارسل كشف الراتب هون", "ابعث الوصل هون", "ارسل الوصل هون",
    "ابعث الهويه عالواتساب", "ابعث الهوية عالواتساب", "ارسل الهويه عالواتساب", "أرسل الهوية عالواتساب",
  ].some((needle) => text.includes(n(needle)));
  if (sendsSensitiveOnWhatsapp) violations.push("sensitive_document_requested_on_whatsapp");

  return uniq(violations);
}
