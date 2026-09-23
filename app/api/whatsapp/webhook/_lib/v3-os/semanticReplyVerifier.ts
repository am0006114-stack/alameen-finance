import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";
import type { V3TextProvider } from "./provider";
import { applicationJourneyStage } from "./applicationJourney";
import { businessTruthForPrompt } from "./businessTruthRegistry";

export type SemanticReplyCheck = {
  pass: boolean;
  checked: boolean;
  answersCurrentQuestion: boolean;
  staleTopic: boolean;
  invertedDecision: boolean;
  unknownEntityMisread: boolean;
  missingObligations: string[];
  repairInstruction: string | null;
  confidence: number;
  modelError: string | null;
};

function parseJson(text: string) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("semantic_reply_verifier_json_missing");
  return JSON.parse(raw.slice(start, end + 1)) as any;
}

function bool(v: unknown) { return v === true || String(v).toLowerCase() === "true"; }
function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.7; }
function list(v: unknown, max = 10) { return Array.isArray(v) ? v.map(String).filter(Boolean).slice(0,max) : []; }

export function semanticVerificationWarranted(turn: InterpretedTurn) {
  const f = turn.semantic;
  if (!f || f.confidence < 0.62 || f.socialClosure) return false;
  return Boolean(
    f.currentQuestion ||
    f.answerObligations.length ||
    f.correctionOfPrevious ||
    f.decision.continuation !== "unknown" ||
    f.entities.some((entity) => entity.knownFactStatus === "unknown")
  );
}

export async function verifySemanticReply(input: {
  provider?: V3TextProvider | null;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  reply: string;
}): Promise<SemanticReplyCheck> {
  const frame = input.turn.semantic;
  if (!input.provider || !frame || !semanticVerificationWarranted(input.turn)) {
    return { pass: true, checked: false, answersCurrentQuestion: true, staleTopic: false, invertedDecision: false, unknownEntityMisread: false, missingObligations: [], repairInstruction: null, confidence: 1, modelError: null };
  }

  const truthSummary = {
    journeyStage: applicationJourneyStage(input.truth.application),
    contactAccess: input.truth.contactAccess || "none",
    status: input.truth.application?.status || null,
    paymentStatus: input.truth.application?.paymentStatus || null,
    paymentConfirmed: Boolean(input.truth.application?.paymentConfirmedAt),
    trackingId: input.truth.application?.trackingId || null,
    deviceName: input.truth.application?.deviceName || null,
    fileOpeningFeeJod: input.truth.policy.fileOpeningFeeJod,
    paymentAliases: input.truth.policy.paymentAliases,
    paymentWalletType: input.truth.policy.paymentWalletType,
    paymentBeneficiaryName: input.truth.policy.paymentBeneficiaryName,
    businessTruthRegistry: businessTruthForPrompt(),
  };

  const prompt = `أنت بوابة دلالية نهائية قبل إرسال رد واتساب لعميل في الأردن. لا تكتب ردًا للعميل. قيّم فقط هل CANDIDATE يجيب **المعنى الحالي** بدون الرجوع لموضوع قديم.

أعد JSON فقط:
{
  "pass":true,
  "answersCurrentQuestion":true,
  "staleTopic":false,
  "invertedDecision":false,
  "unknownEntityMisread":false,
  "missingObligations":[],
  "repairInstruction":null,
  "confidence":0.95
}

قواعد حاسمة:
- SEMANTIC_FRAME هو مرجع فهم كلام العميل. الحقيقة التشغيلية تأتي من TRUTH_SUMMARY فقط.
- إذا currentQuestion موجود ولم يُجب عنه الرد مباشرة، pass=false.
- إذا الرد يجيب topic قديم بدل السؤال الحالي أو correctionOfPrevious، staleTopic=true وpass=false.
- continuation=deferred أو conditional يعني أن العميل **لم يختر الاستمرار الآن**. أي رد يفترض أنه اختار الاستمرار أو يفتح الدفع الآن = invertedDecision=true.
- continuation=declined يعني ممنوع تحويله إلى استمرار.
- إذا journeyStage=preliminary_approved_waiting_decision وCOMMERCIAL_DISCLOSURE.status ليست delivered/acknowledged، حتى لو continuation=confirmed لا يجوز القفز مباشرة إلى بيانات الدفع. الرد الصحيح يشرح أولًا الرسوم وسببها والاسترداد وأنها ليست ضمان موافقة، ثم يترك للعميل تأكيد الاستمرار في رسالة لاحقة.
- entity غير موثقة مثل اسم محفظة/تطبيق: يجوز فهم وظيفتها من الجملة، لكن ممنوع استبدالها بكيان آخر أو اختراع معلومات عنها. إذا سأل العميل هل يمكن التحويل "منها"، الجواب يجب أن يتعامل مع سؤال مصدر التحويل/التوافق، لا أن يقلبه إلى إثبات دخل أو بنك.
- إذا الحقيقة لا تثبت توافق خدمة خارجية، الرد الجيد يشرح الشرط بشكل عام ولا يخترع نعم/لا مطلقة.
- كل answerObligations التزامات مستقلة.
- BUSINESS_TRUTH_REGISTRY داخل TRUTH_SUMMARY حقيقة موثقة للشركة: استخدمها لتقييم القسط الأول، طرق سداد الأقساط الشهرية، وحقائق iPhone 18. لا تعتبرها معرفة خارجية.
- لا تعاقب الرد لأنه مختصر إذا جاوب المطلوب وحافظ على الحقيقة.

SEMANTIC_FRAME=${JSON.stringify(frame)}
COMMERCIAL_DISCLOSURE=${JSON.stringify(input.state.commercialDisclosure || null)}
SEMANTIC_MEMORY=${JSON.stringify(input.state.semanticMemory ? {
    activeGoal: input.state.semanticMemory.activeGoal,
    activeQuestion: input.state.semanticMemory.activeQuestion,
    lastMeaningSummary: input.state.semanticMemory.lastMeaningSummary,
    continuationDecision: input.state.semanticMemory.continuationDecision,
    continuationCondition: input.state.semanticMemory.continuationCondition,
    episodes: input.state.semanticMemory.episodes.slice(-6),
  } : null)}
TRUTH_SUMMARY=${JSON.stringify(truthSummary)}
CUSTOMER=${JSON.stringify(input.turn.rawText)}
CANDIDATE=${JSON.stringify(input.reply)}`;

  try {
    const out = await input.provider.generate({ system: "قيّم المطابقة الدلالية فقط وأخرج JSON.", user: prompt, temperature: 0, maxTokens: 650 });
    const parsed = parseJson(out);
    const missing = list(parsed.missingObligations);
    const answers = parsed.answersCurrentQuestion === undefined ? missing.length === 0 : bool(parsed.answersCurrentQuestion);
    const stale = bool(parsed.staleTopic);
    const inverted = bool(parsed.invertedDecision);
    const entityMisread = bool(parsed.unknownEntityMisread);
    const pass = bool(parsed.pass) && answers && !stale && !inverted && !entityMisread && missing.length === 0;
    return {
      pass,
      checked: true,
      answersCurrentQuestion: answers,
      staleTopic: stale,
      invertedDecision: inverted,
      unknownEntityMisread: entityMisread,
      missingObligations: missing,
      repairInstruction: parsed.repairInstruction == null ? null : String(parsed.repairInstruction).slice(0,700),
      confidence: num(parsed.confidence),
      modelError: null,
    };
  } catch (error) {
    // Semantic judge failure must not become a customer outage. Existing deterministic
    // truth/verifier/final gates remain authoritative safety layers.
    return { pass: true, checked: true, answersCurrentQuestion: true, staleTopic: false, invertedDecision: false, unknownEntityMisread: false, missingObligations: [], repairInstruction: null, confidence: 0, modelError: error instanceof Error ? error.message : String(error) };
  }
}
