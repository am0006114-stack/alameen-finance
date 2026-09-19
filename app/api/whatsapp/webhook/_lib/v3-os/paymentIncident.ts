import { normalizeArabic } from "./text";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type PaymentIncidentKind = "none" | "beneficiary_name_mismatch";

export function detectPaymentIncident(value: string | null | undefined): PaymentIncidentKind {
  const q = n(value);
  if (!q) return "none";
  const paid = /(?:حولت|حوّلت|دفعت|عملت\s+تحويل)/.test(q);
  const name = /(?:الاسم|اسم\s+المستفيد|المستفيد)/.test(q);
  const mismatch = /(?:غلط|مختلف|مش\s+نفس|غير|ما\s+طلع|طلع\s+غير)/.test(q);
  return paid && name && mismatch ? "beneficiary_name_mismatch" : "none";
}

export function buildPaymentIncidentReply(input: { kind: PaymentIncidentKind; expectedBeneficiary: string }) {
  if (input.kind !== "beneficiary_name_mismatch") return null;
  return `وقف أي تحويل إضافي هسا وما تدفع مرة ثانية. إذا اسم المستفيد اللي ظهر عند التحويل مختلف عن الاسم الرسمي ${input.expectedBeneficiary}، لازم نراجع التحويل أولًا. رسالتك بتثبت إنك بلغتني بالمشكلة، لكنها مش تأكيد دفع إداري بحد ذاتها. رفعت الحالة للإدارة للمراجعة، وبنكمل معك على نفس الطلب بدون ما نطلب منك تعيد الدفع.`;
}
