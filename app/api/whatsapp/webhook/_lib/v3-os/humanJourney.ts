import { applicationJourneyStage } from "./applicationJourney";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

function asksStatusOrNextStep(value: string | null | undefined) {
  const q = n(value);
  return /(?:شو\s+صار|وين\s+وصل|حاله\s+الطلب|حالة\s+الطلب|طلبي|الطلب|الموافقه|الموافقة|الخطوه\s+التاليه|الخطوة\s+التالية|شو\s+ضل|شو\s+المطلوب|متى\s+الاستلام|امتى\s+الاستلام|متى\s+استلم|امتى\s+استلم)/.test(q) || /AM-\d{8,}/i.test(String(value || ""));
}

function asksWhen(value: string | null | undefined) {
  const q = n(value);
  return /^(?:طيب\s+)?(?:متى|امتى|ايمتى|لايمتا|لامتى)(?:\s+\w+){0,4}$/.test(q) || /(?:متى|امتى|ايمتى).{0,28}(?:استلم|الاستلام|الموافقه|الموافقة|القرار|يخلص|تخلص)/.test(q);
}

function asksPickup(value: string | null | undefined) {
  const q = n(value);
  return /(?:استلام|استلم|استلمه|استلمه|موعد\s+الاستلام|توصيل|بوصل|يوصل|اجي\s+استلم|أجي\s+استلم)/.test(q);
}

function explicitOptOut(value: string | null | undefined) {
  const q = n(value);
  return /(?:لا\s+ارغب|لا\s+أرغب|مش\s+حاب|مش\s+حابه|ما\s+بدي|لا\s+اريد|لا\s+أريد).{0,30}(?:استمرار|اكمل|أكمل|تكمل|المتابعه|المتابعة)/.test(q);
}

function recentContext(state: ConversationState, recentTurns?: string[]) {
  if (String(state.lastAssistantText || "").trim()) return n(state.lastAssistantText);
  const assistant = [...(recentTurns || [])].reverse().find((x) => /^(?:الأمين|الامين|assistant)\s*:/i.test(String(x || "")));
  return n(assistant || "");
}

function shortWhenFromContext(input: { turn: InterpretedTurn; state: ConversationState; recentTurns?: string[] }) {
  if (!asksWhen(input.turn.rawText)) return false;
  const ctx = recentContext(input.state, input.recentTurns);
  return /(?:الاستلام|الموافقه|الموافقة|المراجعه|المراجعة|الدراسه|الدراسة|موعد)/.test(ctx);
}

function reviewWindow(truth: TruthBundle) {
  return truth.policy.normalReviewWindow || "من يومين لـ3 أيام عمل";
}

export function buildHumanJourneyReply(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  recentTurns?: string[];
}) {
  const app = input.truth.application;
  if (!app) return null;

  const stage = applicationJourneyStage(app);
  const raw = input.turn.rawText;
  const statusIntent = asksStatusOrNextStep(raw) || shortWhenFromContext(input);
  const pickupIntent = asksPickup(raw) || shortWhenFromContext(input);
  const hasSensitiveAction = input.turn.requestedActions.some((a) =>
    ["cancel_application", "request_refund", "stop_refund", "reopen_application", "change_device", "change_application_data"].includes(a),
  );
  if (hasSensitiveAction || explicitOptOut(raw)) return null;

  const links = buildOfficialLinkContext(input.turn, input.truth);
  const tracking = app.trackingId ? `طلبك ${app.trackingId}` : "طلبك";
  const window = reviewWindow(input.truth);
  const pressure = "وحاليًا في ضغط مراجعات، فبعض الملفات ممكن تتجاوز هالمدة بدون ما نعطيك موعد غير مؤكد.";

  if (stage === "preliminary_approved_waiting_decision" && (statusIntent || pickupIntent)) {
    const trackingLink = links.relevant.tracking ? `\nوللمتابعة من عندك:\n${links.relevant.tracking}` : "";
    if (pickupIntent) {
      return `${tracking} حاصل على موافقة مبدئية ✅ ولسا ما وصل لمرحلة تحديد موعد استلام.\n\nإذا حاب تكمل، الخطوة التالية فتح الملف للدراسة النهائية. رسوم فتح الملف 5 دنانير، وهي منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي إذا ألغيت بعد دفع مؤكد. بعد رفع الوصل واعتماده تبدأ الدراسة النهائية؛ المعدل الطبيعي ${window}، ${pressure}\n\nإذا بدك نكمل، اكتبلي: أود الاستمرار.${trackingLink}`;
    }
    return `مبروك، ${tracking} أخذ موافقة مبدئية ✅\n\nإذا حاب تكمل، الخطوة التالية فتح الملف للدراسة النهائية. رسوم فتح الملف 5 دنانير، وهي منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي إذا ألغيت بعد دفع مؤكد. بعد رفع الوصل واعتماده تبدأ الدراسة النهائية؛ المعدل الطبيعي ${window}، ${pressure}\n\nإذا بدك نكمل، اكتبلي: أود الاستمرار.${trackingLink}`;
  }

  if (stage === "preliminary_review" && (statusIntent || pickupIntent)) {
    return `${tracking} لسا بالمراجعة المبدئية. المعدل الطبيعي ${window}، ${pressure}\n\nبهالمرحلة ما في دفع مطلوب وما في موعد استلام رسمي. أول ما تصدر الموافقة المبدئية بنوضحلك خطوة الاستمرار قبل أي إجراء مالي.`;
  }

  if (["final_review", "under_review"].includes(stage) && (statusIntent || asksWhen(raw))) {
    const paid = app.paymentStatus === "confirmed" || Boolean(app.paymentConfirmedAt);
    const paymentLine = paid ? " الدفع مؤكد على الملف، وما عليك تعيد أي دفعة أو وصل." : "";
    return `${tracking} قيد الدراسة النهائية.${paymentLine}\n\nالمعدل الطبيعي ${window}، ${pressure}\nما عندي موعد نهائي أقدر أضمنه، وأول ما تتغير الحالة فعليًا بنعطيك التحديث الصحيح.`;
  }

  return null;
}
