import type { ApplicationRecord, CustomerIntent } from "./types";
import { normalizeArabicText } from "./text";

const NOISE = new Set([
  "بدي", "اريد", "أريد", "اكمل", "أكمل", "افتح", "أفتح", "ملف", "طلب", "الطلب", "الي", "اللي",
  "باسم", "اسم", "مش", "مو", "لا", "انا", "أنا", "اخوي", "اخي", "أخي", "اختي", "أختي", "هذا", "هاي",
]);

function normalize(value: string) {
  return normalizeArabicText(String(value || ""))
    .replace(/[؟?!.,،؛:;"'“”()\[\]{}\-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !NOISE.has(token));
}

function nameTokens(app: ApplicationRecord) {
  return tokens(String(app.full_name || ""));
}

export function findExplicitlyNamedApplication(text: string, applications: ApplicationRecord[]) {
  const message = normalize(text);
  const messageTokens = new Set(tokens(text));
  if (!message || !messageTokens.size || !applications.length) return null;

  const ranked = applications
    .map((app) => {
      const appTokens = nameTokens(app);
      if (!appTokens.length) return { app, score: 0, matched: 0, total: 0 };
      const fullName = normalize(String(app.full_name || ""));
      const exactPhrase = fullName.length >= 3 && message.includes(fullName);
      const explicitlyRejected = fullName.length >= 3 && [
        `مش ${fullName}`, `مو ${fullName}`, `ليس ${fullName}`, `مش باسم ${fullName}`, `مو باسم ${fullName}`,
      ].some((phrase) => message.includes(phrase));
      const matched = appTokens.filter((token) => messageTokens.has(token)).length;
      const coverage = matched / appTokens.length;
      const score = (exactPhrase ? 100 : 0) + matched * 20 + coverage * 10 - (explicitlyRejected ? 250 : 0);
      return { app, score, matched, total: appTokens.length };
    })
    .filter((item) => item.matched >= 2 || item.score >= 100)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  return ranked[0].app;
}

export function applicationChoicesNeedDisambiguation(applications: ApplicationRecord[]) {
  if (applications.length <= 1) return false;
  const names = new Set(applications.map((app) => normalize(String(app.full_name || ""))).filter(Boolean));
  return names.size > 1;
}

export function isApplicationSpecificIntent(intent: CustomerIntent) {
  return new Set<string>([
    "order_status", "review_time", "delivery", "payment", "payment_amount", "payment_method", "payment_timing",
    "payment_recipient", "payment_next_step", "payment_review_time", "payment_objection", "payment_link_issue",
    "refund", "stop_refund", "cancel_refund_request", "cancel_request", "cancel_confirmed", "continue_decision",
    "keep_request", "decline_decision", "reopen_cancelled_request", "reopen_cancelled_confirmed", "requirements",
    "document_upload", "document_followup", "media_upload", "receipt_upload_confirmation", "receipt_upload_needed",
    "application_data_correction", "application_data_correction_confirmed", "device_change", "device_change_cancelled",
    "device_change_confirmed", "complaint", "payment_dispute", "site_issue", "tracking_link_request",
  ]).has(String(intent));
}

export function applicationDisambiguationReply(applications: ApplicationRecord[]) {
  const rows = applications.slice(0, 4).map((app, index) => {
    const name = String(app.full_name || "الطلب").trim();
    const tracking = String(app.tracking_id || app.id || "").trim();
    return `${index + 1}. ${name}${tracking ? ` — ${tracking}` : ""}`;
  });
  return `عندي أكثر من طلب مرتبط بنفس رقم التواصل، وما بدي أختار واحد وأعطيك معلومة عن الطلب الغلط.\n\n${rows.join("\n")}\n\nاكتب اسم صاحب الطلب أو رقم التتبع اللي بدك نكمل عليه، وبثبت نفس الطلب للمحادثة.`;
}
