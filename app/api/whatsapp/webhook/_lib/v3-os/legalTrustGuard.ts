import { normalizeArabic } from "./text";
import type { PolicyTruth, TruthBundle } from "./types";

function normalized(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

export function registrationOrLicensingQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:مسجلين|مسجله|مسجلة|مسجل|معتمدين|معتمده|معتمدة|مرخصين|مرخصه|مرخصة|ترخيص|سجل\s+تجاري|السجل\s+التجاري|مسجله\s+بالحكومه|مسجلة\s+بالحكومة|الحكومه|الحكومة).{0,45}(?:الشركه|الشركة|الجهه|الجهة|انتو|انتم|عندكم)?|(?:الشركه|الشركة|الجهه|الجهة|انتو|انتم).{0,45}(?:مسجل|معتمد|مرخص|ترخيص|سجل\s+تجاري|الحكومه|الحكومة)/.test(q);
}

export function contractingPartyQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:مين|من).{0,30}(?:الشركه|الشركة|الجهه|الجهة).{0,35}(?:القانونيه|القانونية).{0,40}(?:العقد|باسمها)|(?:العقد).{0,35}(?:باسم\s+مين|باسم\s+من|مع\s+مين|مع\s+من|بين\s+مين|بين\s+من|طرف|الطرف)|(?:مين|من).{0,25}(?:طرف\s+العقد|اطراف\s+العقد|أطراف\s+العقد)|(?:هل|هو).{0,25}(?:البنك|شركة\s+تمويل|شركه\s+تمويل).{0,30}(?:طرف|بالعقد|في\s+العقد)/.test(q);
}

export function safetyTrustQuestionText(value: string | null | undefined) {
  const q = normalized(value);
  return /(?:هل|يعني|صراحه|صراحة)?.{0,12}(?:امنه|آمنة|امن|آمن|موثوقه|موثوقة|موثوق|مضمونه|مضمونة)|(?:نصب|نصاب|نصابين|احتيال|مصداقيه|مصداقية|ثقه|ثقة|فيد\s*باك|feedback|خايف|خايفه|خايفة|متخوف|متخوفه|متخوفة)/i.test(q);
}

export function legalOrTrustQuestionText(value: string | null | undefined) {
  return registrationOrLicensingQuestionText(value)
    || contractingPartyQuestionText(value)
    || safetyTrustQuestionText(value);
}

export function buildSafeContractingPartyReply() {
  return "العقد بيكون مباشرة بين الشركة والعميل، ومش مع بنك أو شركة تمويل خارجية كطرف بالعقد. أما الاسم القانوني المثبت على العقد، المرجع هو الاسم المكتوب في العقد وبيانات الشركة الرسمية؛ ما رح أخمّن باسم قانوني من الاسم التشغيلي وحده.";
}

export function buildSafeRegistrationReply(policy: PolicyTruth) {
  return `بالنسبة للتسجيل أو الترخيص أو الاعتماد، ما عندي حقيقة موثقة ضمن بيانات المحادثة أقدر أأكد منها رقم تسجيل أو جهة ترخيص، لذلك ما رح أخمّن. اللي بقدر أؤكده هو: ${policy.independenceStatement}`;
}

export function buildSafeTrustReply(truth: TruthBundle) {
  return `مفهوم إنك بدك تطمّن قبل ما تكمل. ما رح أعطيك ضمان عام أو أؤكد تسجيل/ترخيص بدون حقيقة موثقة. اللي بقدر أؤكده إن التعامل على الطلب بيكون مباشرة مع الشركة، وكل حالة دفع أو تعديل أو موافقة بنعتبرها صحيحة فقط لما تكون مثبتة فعليًا على الطلب. ${truth.policy.independenceStatement}`;
}

export function unsupportedLegalEntityClaim(reply: string, policy?: PolicyTruth | null) {
  const n = normalized(reply);
  const business = normalized(policy?.businessName || "");
  const assertsRegistered = /(?:احنا|نحن|الشركه|الشركة|الجهه|الجهة).{0,35}(?:مسجلين|مسجله|مسجلة|مرخصين|مرخصه|مرخصة|معتمدين|معتمده|معتمدة)|(?:مسجلين|مرخصين|معتمدين).{0,25}(?:قانونيا|قانونيًا|بالحكومه|بالحكومة|رسميا|رسميًا)/.test(n);
  const assertsLegalName = /(?:الاسم\s+القانوني|الشركه\s+القانونيه|الشركة\s+القانونية).{0,35}(?:هو|هي|اسمها)|(?:العقد).{0,30}(?:رح|راح|بيكون|بكون).{0,20}(?:باسم)/.test(n)
    && Boolean(business) && n.includes(business);
  return assertsRegistered || assertsLegalName;
}

export function trustLegalCommercialNudge(reply: string) {
  const n = normalized(reply);
  return /(?:رسوم\s+فتح\s+الملف|(?:5|٥)\s*(?:دنانير|دينار)|اود\s+الاستمرار|أود\s+الاستمرار|بدك\s+تكمل|بانتظارك\s+تدفع|ادفع\s+رسوم|دفع\s+رسوم|حول\s+المبلغ|حوّل\s+المبلغ|\/receipt)/.test(n);
}
