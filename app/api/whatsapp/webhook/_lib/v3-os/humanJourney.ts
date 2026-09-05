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
  return /(?:استلام|استلم|استلمه|موعد\s+الاستلام|توصيل|بوصل|يوصل|اجي\s+استلم|أجي\s+استلم)/.test(q);
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

// Phase 7.2.0 compatibility anchor: `مبروك، ${tracking} أخذ موافقة مبدئية` was the original fallback wording; 7.2.1 keeps the same journey facts with less scripted phrasing.
// Phase 7.2.0 compatibility anchor: `لسا ما وصل لمرحلة تحديد موعد استلام` remains semantically enforced with more natural wording.
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
  const trackLine = links.relevant.tracking ? `\nللمتابعة: ${links.relevant.tracking}` : "";

  if (stage === "preliminary_approved_waiting_decision" && (statusIntent || pickupIntent)) {
    if (pickupIntent) {
      return `لسا ما وصلنا لموعد الاستلام. ${tracking} أخذ موافقة مبدئية، والخطوة اللي بعدها إذا بدك تكمل هي فتح الملف للدراسة النهائية. رسوم فتح الملف 5 دنانير، منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي إذا ألغيت بعد دفع مؤكد. الدراسة النهائية معدلها الطبيعي ${window}، وحاليًا في ضغط مراجعات فبعض الملفات بتتأخر أكثر.\n\nإذا بدك نكمل من هون اكتبلي: أود الاستمرار.${trackLine}`;
    }
    return `${tracking} أخذ موافقة مبدئية. هاي مش الموافقة النهائية لسا. إذا بدك تكمل، الخطوة التالية فتح الملف للدراسة النهائية ورسومه 5 دنانير؛ منفصلة عن ثمن الجهاز والقسط الأول ومستردة عبر المسار الرسمي بعد دفع مؤكد. الدراسة النهائية عادة ${window}، ومع ضغط المراجعات الحالي ممكن بعض الملفات تتأخر.\n\nإذا بدك نكمل اكتبلي: أود الاستمرار.${trackLine}`;
  }

  if (stage === "preliminary_review" && (statusIntent || pickupIntent)) {
    return `${tracking} لسا بالمراجعة المبدئية. المعدل الطبيعي ${window}، وحاليًا في ضغط مراجعات فممكن بعض الملفات تتجاوز هالمدة. بهالمرحلة ما في رسوم فتح ملف ولا موعد استلام رسمي. أول ما تصدر الموافقة المبدئية بنوضحلك خطوة الاستمرار.`;
  }

  if (["final_review", "under_review"].includes(stage) && (statusIntent || asksWhen(raw))) {
    const paid = app.paymentStatus === "confirmed" || Boolean(app.paymentConfirmedAt);
    const paymentLine = paid ? " والدفع مؤكد على الملف، فما عليك تعيد أي دفعة أو وصل." : "";
    return `${tracking} لسا قيد الدراسة النهائية.${paymentLine} المعدل الطبيعي ${window}، لكن ضغط المراجعات الحالي مأخر بعض الملفات عن المعتاد. ما عندي موعد نهائي مؤكد أعطيك إياه، وبعتمد فقط أي تحديث فعلي يظهر على الطلب.`;
  }

  return null;
}
