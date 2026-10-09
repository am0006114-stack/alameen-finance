import { proposedAnswerRepeatsLast, proposedAnswerRepeatsRejected } from "./workingMemory";
import type { V4CriticResult, V4DraftResponse, V4TruthBundle, V4TurnUnderstanding, V4WorkingMemory } from "./types";

function hasExecutedReceipt(truth: V4TruthBundle, action: string | null | undefined) {
  if (!action) return false;
  return truth.verifiedActionReceipts.some((r) => r.action === action && r.executed);
}

function deterministicClaimFailures(draft: V4DraftResponse, truth: V4TruthBundle) {
  const failures: string[] = [];
  for (const claim of draft.claims) {
    if (claim.kind === "fact") {
      if (!claim.factKey || !truth.facts[claim.factKey] || !truth.facts[claim.factKey].customerVisible) {
        failures.push(`unsupported business fact claim: ${claim.text}`);
      }
    }
    if (claim.kind === "action") {
      if (!hasExecutedReceipt(truth, claim.action)) failures.push(`action claim has no executed receipt: ${claim.text}`);
    }
    if (claim.kind === "timing") {
      if (!claim.factKey || !truth.facts[claim.factKey]) failures.push(`timing claim has no authoritative fact: ${claim.text}`);
    }
  }
  return failures;
}

function deceptiveIdentity(text: string | null | undefined) {
  const q = String(text || "");
  return /(?:انا|أنا)\s+(?:انسان|إنسان|بني\s+ادم|بني\s+آدم|موظف\s+بشري|بشر)|(?:مش|مو)\s+(?:بوت|ذكاء\s+اصطناعي|رد\s+الي|رد\s+آلي)/i.test(q);
}

export function deterministicFinalCritic(input: {
  burstText: string;
  understanding: V4TurnUnderstanding;
  memory: V4WorkingMemory;
  truth: V4TruthBundle;
  draft: V4DraftResponse;
}): V4CriticResult {
  const reasons: string[] = [];
  const repairInstructions: string[] = [];

  reasons.push(...deterministicClaimFailures(input.draft, input.truth));

  if (deceptiveIdentity(input.draft.text)) {
    reasons.push("response explicitly claims human/non-AI identity");
    repairInstructions.push("عرّف الشخصية بعبارة: معك فلان من فريق الأمين، من دون ادعاء صريح أنك إنسان أو نفي أنك نظام ذكاء اصطناعي.");
  }

  if (input.understanding.noReplyRequested && input.draft.decision !== "SILENCE") {
    reasons.push("customer explicitly requested no reply");
    repairInstructions.push("اسكت ما لم يوجد تنفيذ أو إيصال إجراء يجب إبلاغ العميل به.");
  }

  if (input.understanding.explicitQuestions.length && input.draft.decision === "ANSWER" && input.draft.answeredQuestions.length === 0) {
    reasons.push("draft did not mark any current explicit question as answered");
    repairInstructions.push("جاوب السؤال الحالي أولًا قبل أي سياق قديم.");
  }

  if (input.understanding.customerRejectedPreviousAnswer && proposedAnswerRepeatsRejected(input.memory, input.draft.text)) {
    reasons.push("draft repeats an answer the customer explicitly rejected");
    repairInstructions.push("لا تعيد نفس المعلومة أو القالب؛ أعطِ الجديد فقط أو قل بصراحة إنه لا يوجد تحديث جديد.");
  }

  if (input.understanding.topicChanged && proposedAnswerRepeatsLast(input.memory, input.draft.text)) {
    reasons.push("topic changed but draft repeats the previous answer");
    repairInstructions.push("اترك الموضوع السابق وجاوب الهدف الجديد فقط.");
  }

  if (input.understanding.customerWantsBrevity && String(input.draft.text || "").length > 320) {
    reasons.push("customer requested a brief/direct answer but draft is too long");
    repairInstructions.push("اختصر إلى جواب مباشر من سطر أو سطرين، ثم نقطة واحدة لازمة فقط إن وجدت.");
  }

  if (input.draft.text && /(?:تم\s+التواصل\s+مع\s+الاداره|تم\s+التواصل\s+مع\s+الإدارة|المشرف\s+شاف|تم\s+تسريع|رح\s+تطلع\s+اليوم)/.test(input.draft.text)) {
    const hasAnyActionReceipt = input.truth.verifiedActionReceipts.some((r) => r.executed);
    if (!hasAnyActionReceipt) {
      reasons.push("draft contains a verifiable operational claim without an action receipt");
      repairInstructions.push("استبدل ادعاء التنفيذ بحضور محادثي غير قابل للتحقق مثل: أنا ماسك الموضوع معك / خليني أرتبه إلك.");
    }
  }

  const accepted = reasons.length === 0;
  const score = accepted ? 1 : Math.max(0, 1 - reasons.length * 0.18);
  return { accepted, score, reasons, repairInstructions };
}

export function mergeCriticResults(a: V4CriticResult, b: V4CriticResult): V4CriticResult {
  const reasons = Array.from(new Set([...a.reasons, ...b.reasons]));
  const repairInstructions = Array.from(new Set([...a.repairInstructions, ...b.repairInstructions]));
  return {
    accepted: a.accepted && b.accepted && reasons.length === 0,
    score: Math.min(a.score, b.score),
    reasons,
    repairInstructions,
  };
}
