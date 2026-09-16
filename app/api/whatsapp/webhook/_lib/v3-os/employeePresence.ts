export type HumanEmployeePresenceContext = {
  fullCompanyEmployeeMode: true;
  directIdentityQuestion: boolean;
  sideHelpRequest: boolean;
  externalLinkPresent: boolean;
  capabilityMenuForbidden: true;
  keepCurrentPersona: true;
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildHumanEmployeePresenceContext(rawText: string): HumanEmployeePresenceContext {
  const q = normalize(rawText);
  const directIdentityQuestion = /(?:انت|انتي|حضرتك|هذا|هاظ).{0,24}(?:ذكاء\s*اصطناعي|ai|روبوت|بوت)|(?:ذكاء\s*اصطناعي|ai|روبوت|بوت).{0,24}(?:انت|انتي|حضرتك)/i.test(q);
  const sideHelpRequest = /(?:اشرح|فسر|فهمني|لخص|اختصر|ترجم|اكتبلي|اكتب لي|رد\s+عليه|شو\s+يعني|ما\s+معنى|وضحلي|وضّحلي)/.test(q);
  const externalLinkPresent = /https?:\/\//i.test(rawText || "");
  return {
    fullCompanyEmployeeMode: true,
    directIdentityQuestion,
    sideHelpRequest,
    externalLinkPresent,
    capabilityMenuForbidden: true,
    keepCurrentPersona: true,
  };
}
