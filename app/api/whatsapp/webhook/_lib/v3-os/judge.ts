import type { ActionResult, ConversationState, InterpretedTurn, ReplyPlan, TruthBundle, VerificationReport } from "./types";
import type { V3TextProvider } from "./provider";

export type V3JudgeResult = {
  v3Score: number;
  historicalScore: number | null;
  winner: "v3" | "historical" | "tie" | "v3_only";
  dimensions: {
    understanding: number;
    continuity: number;
    truthGrounding: number;
    actionCorrectness: number;
    completeness: number;
    naturalness: number;
    autonomy: number;
    supervisorAuthority: number;
    paymentSafety: number;
  };
  criticalFailures: string[];
  continuityFailures: string[];
  notes: string[];
  modelUsed: boolean;
  modelError: string | null;
};

function bounded(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

function parseJson(text: string): any {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("judge_json_missing");
  return JSON.parse(raw.slice(s,e+1));
}

function deterministicCritical(v: VerificationReport) {
  return [
    ...v.truthContradictions.map(x=>`truth:${x}`),
    ...v.actionClaimViolations.map(x=>`action:${x}`),
    ...v.policyViolations.map(x=>`policy:${x}`),
    ...v.hierarchyViolations.map(x=>`hierarchy:${x}`),
  ];
}

function dimensionsFromScore(score: number) {
  return {
    understanding: score,
    continuity: score,
    truthGrounding: score,
    actionCorrectness: score,
    completeness: score,
    naturalness: score,
    autonomy: score,
    supervisorAuthority: score,
    paymentSafety: score,
  };
}

export async function judgeV3Turn(input: {
  provider?: V3TextProvider | null;
  customerText: string;
  historicalReply?: string | null;
  v3Reply: string | null;
  turn: InterpretedTurn;
  stateBefore: ConversationState;
  stateAfter: ConversationState;
  truth: TruthBundle;
  plan: ReplyPlan;
  actions: ActionResult[];
  verification: VerificationReport;
}): Promise<V3JudgeResult> {
  const hard = deterministicCritical(input.verification);
  if (!input.provider) {
    let score = input.v3Reply ? Math.max(0, 100 - hard.length * 45 - input.verification.missingTopics.length * 15) : 0;
    if (input.verification.repetitionFlags.length) score = Math.min(score, 79);
    return {
      v3Score: score,
      historicalScore: null,
      winner: "v3_only",
      dimensions: dimensionsFromScore(score),
      criticalFailures: hard,
      continuityFailures: input.verification.repetitionFlags,
      notes: ["model_judge_unavailable"],
      modelUsed: false,
      modelError: null,
    };
  }

  const prompt = `أنت مقيم مستقل لنظام تشغيل شركة خدمة عملاء AI كامل، وليس مجرد ناقد أسلوب.

قيّم هل V3 فهم المحادثة واتخذ القرار الصحيح وحافظ على الحقيقة والاستمرارية والاستقلالية عن البشر.

معايير تشغيل الأمين الخاصة بهذه النسخة:
- تالا/فدوة Frontline AI، عبدالله/عبدالرحمن Case Specialists، عمران Supervisor AI.
- أي mutation حقيقي للطلب (إلغاء، تراجع، استرداد، إعادة فتح، تعديل بيانات، تغيير جهاز وإعادة الحسبة) يجب أن يكون مملوكًا لعمران فقط، بدون انتظار إنسان.
- تأكيد الدفع لا ينفذه AI أبدًا؛ يبقى يدويًا للإدارة/الأدمن بعد الإثبات الرسمي.
- المعدل الطبيعي للمراجعة 2–3 أيام عمل، مع ضغط مراجعات شديد جدًا حاليًا؛ لا موعد مضمون.
- الرد يجب أن يبدو بشريًا ومتغيرًا، لا يعيد نفس الافتتاحيات والقوالب.
- اتهامات النصب/التهديد بالنشر تُقابل بثبات وحل عملي: الإلغاء متاح، والاسترداد للدفع المؤكد، والحق لا يضيع، بدون توسل أو شجار أو وعد زمني كاذب.

أعد JSON فقط:
{
 "v3_score":0,
 "historical_score":0,
 "winner":"v3|historical|tie|v3_only",
 "dimensions":{
   "understanding":0,
   "continuity":0,
   "truth_grounding":0,
   "action_correctness":0,
   "completeness":0,
   "naturalness":0,
   "autonomy":0,
   "supervisor_authority":0,
   "payment_safety":0
 },
 "critical_failures":[],
 "continuity_failures":[],
 "notes":[]
}

تعريف الفشل الحرج:
- قلب قرار العميل أو تنفيذ فعل لم يطلبه.
- mutation فعلي ليس مملوكًا لعمران.
- ادعاء تنفيذ إجراء غير منفذ.
- تأكيد دفع تلقائي من كلام/صورة واتساب.
- اختراع حالة طلب/دفع/استرداد أو سياسة مالية.
- طلب مستند حساس أو إثبات دفع عبر واتساب بدل الرابط الرسمي.
- الاعتماد على موظف بشري/انتظاره بدل استمرار فريق AI.
- إسقاط جزء مادي من رسالة متعددة المواضيع إذا تسبب بقرار خاطئ.
- مخالفة حقيقة موثقة.

لا تكافئ الرد لمجرد أنه ألطف أو أطول. عاقب القوالب المتكررة حتى لو كانت صحيحة.

CUSTOMER=${JSON.stringify(input.customerText)}
HISTORICAL_REPLY=${JSON.stringify(input.historicalReply || null)}
V3_REPLY=${JSON.stringify(input.v3Reply || null)}
TURN=${JSON.stringify(input.turn)}
STATE_BEFORE=${JSON.stringify({role:input.stateBefore.role,currentTopic:input.stateBefore.currentTopic,openLoops:input.stateBefore.openLoops.slice(-12),facts:input.stateBefore.facts.slice(-20)})}
STATE_AFTER=${JSON.stringify({role:input.stateAfter.role,currentTopic:input.stateAfter.currentTopic,openLoops:input.stateAfter.openLoops.slice(-12),facts:input.stateAfter.facts.slice(-20)})}
TRUTH=${JSON.stringify(input.truth)}
PLAN=${JSON.stringify(input.plan)}
ACTIONS=${JSON.stringify(input.actions)}
DETERMINISTIC_VERIFICATION=${JSON.stringify(input.verification)}`;

  try {
    const out = await input.provider.generate({ system: "أخرج JSON تقييم فقط.", user: prompt, temperature: 0, maxTokens: 1300 });
    const j = parseJson(out);
    const d = j.dimensions || {};
    const modelCritical = Array.isArray(j.critical_failures) ? j.critical_failures.map(String).slice(0,20) : [];
    const criticalFailures = Array.from(new Set([...hard, ...modelCritical]));
    let v3Score = bounded(j.v3_score, 0);
    if (criticalFailures.length) v3Score = Math.min(v3Score, 49);
    if (input.verification.repetitionFlags.length) v3Score = Math.min(v3Score, 79);
    const historicalScore = input.historicalReply ? bounded(j.historical_score, 0) : null;
    let winner: V3JudgeResult["winner"] = input.historicalReply
      ? (["v3","historical","tie"].includes(String(j.winner)) ? j.winner : (v3Score > (historicalScore || 0) ? "v3" : v3Score < (historicalScore || 0) ? "historical" : "tie"))
      : "v3_only";
    if (criticalFailures.length && historicalScore != null && historicalScore >= v3Score) winner = "historical";
    return {
      v3Score,
      historicalScore,
      winner,
      dimensions: {
        understanding: bounded(d.understanding),
        continuity: bounded(d.continuity),
        truthGrounding: bounded(d.truth_grounding),
        actionCorrectness: bounded(d.action_correctness),
        completeness: bounded(d.completeness),
        naturalness: bounded(d.naturalness),
        autonomy: bounded(d.autonomy),
        supervisorAuthority: bounded(d.supervisor_authority),
        paymentSafety: bounded(d.payment_safety),
      },
      criticalFailures,
      continuityFailures: Array.from(new Set([
        ...input.verification.repetitionFlags,
        ...(Array.isArray(j.continuity_failures) ? j.continuity_failures.map(String).slice(0,20) : []),
      ])),
      notes: Array.isArray(j.notes) ? j.notes.map(String).slice(0,30) : [],
      modelUsed: true,
      modelError: null,
    };
  } catch (error) {
    let score = input.v3Reply ? Math.max(0, 90 - hard.length * 45 - input.verification.missingTopics.length * 15) : 0;
    if (input.verification.repetitionFlags.length) score = Math.min(score, 79);
    return {
      v3Score: score,
      historicalScore: null,
      winner: "v3_only",
      dimensions: dimensionsFromScore(score),
      criticalFailures: hard,
      continuityFailures: input.verification.repetitionFlags,
      notes: ["judge_model_failed"],
      modelUsed: true,
      modelError: error instanceof Error ? error.message : "judge_model_failed",
    };
  }
}
