import type { V3TextProvider } from "../v3-os/provider";
import { HUMAN_BEHAVIOR_PRINCIPLES, PERSONA_NAMES, WHITE_LIE_BOUNDARY, humanStyleInstructions } from "./humanBehaviorPolicy";
import type {
  V4CriticResult,
  V4Decision,
  V4DraftClaim,
  V4DraftResponse,
  V4ModelAdapter,
  V4Persona,
  V4ProcedureResolution,
  V4TruthBundle,
  V4TurnUnderstanding,
  V4WorkingMemory,
} from "./types";

function jsonObject(raw: string) {
  const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("v4_json_missing");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown) { const s = text(value); return s || null; }
function bool(value: unknown) { return value === true; }
function confidence(value: unknown) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.75; }
function strings(value: unknown, max = 12) { return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, max) : []; }

const EMOTIONS = new Set(["neutral", "warm", "confused", "frustrated", "angry", "anxious", "distrustful", "pleading"]);
const ACTIONS = new Set(["cancel_application", "request_refund", "stop_refund", "change_application_data", "change_device", "reopen_application", "link_whatsapp_alias", "record_human_contact_request", "continue_application"]);
const DISPOSITIONS = new Set(["request", "confirm", "deny", "conditional", "none"]);
const DECISIONS = new Set(["ANSWER", "ACT", "ASK", "ESCALATE", "ACKNOWLEDGE", "SILENCE"]);
const CLAIM_KINDS = new Set(["fact", "action", "timing", "identity", "emotion", "courtesy"]);
const PERSONAS = new Set<V4Persona>(["tala", "fadwa", "abdullah", "abdulrahman", "omran", "khaled"]);

function compactMemory(memory: V4WorkingMemory) {
  return {
    persona: memory.persona,
    activeGoal: memory.activeGoal,
    openQuestions: memory.openQuestions.filter((q) => !q.answered && q.active).slice(-8),
    pendingProcedure: memory.pendingProcedure,
    customerDecisions: memory.customerDecisions.slice(-12),
    factsAlreadyExplained: memory.factsAlreadyExplained.slice(-25),
    rejectedAnswerFingerprints: memory.rejectedAnswerFingerprints.slice(-8),
    currentEmotion: memory.currentEmotion,
    frustrationStreak: memory.frustrationStreak,
    humanContactRequested: memory.humanContactRequested,
    prefersBriefReplies: memory.prefersBriefReplies,
    repetitionSensitivity: memory.repetitionSensitivity,
    lastCustomerText: memory.lastCustomerText,
    lastAssistantText: memory.lastAssistantText,
    recentEpisodes: memory.episodes.slice(-8),
  };
}

function compactTruth(truth: V4TruthBundle) {
  return {
    applicationId: truth.applicationId,
    trackingId: truth.trackingId,
    facts: Object.fromEntries(Object.entries(truth.facts).filter(([, v]) => v.customerVisible).map(([k, v]) => [k, v.value])),
    verifiedActionReceipts: truth.verifiedActionReceipts,
  };
}

function toUnderstanding(payload: Record<string, unknown>): V4TurnUnderstanding {
  const emotion = text(payload.emotion);
  const requestedAction = text(payload.requestedAction);
  const actionDisposition = text(payload.actionDisposition);
  const requestedPersona = text(payload.requestedPersona) as V4Persona;
  return {
    meaningSummary: text(payload.meaningSummary) || "رسالة العميل الحالية",
    currentGoal: nullableText(payload.currentGoal),
    explicitQuestions: strings(payload.explicitQuestions, 8),
    requestedAction: ACTIONS.has(requestedAction) ? requestedAction as V4TurnUnderstanding["requestedAction"] : null,
    actionDisposition: DISPOSITIONS.has(actionDisposition) ? actionDisposition as V4TurnUnderstanding["actionDisposition"] : "none",
    requestedPersona: PERSONAS.has(requestedPersona) ? requestedPersona : null,
    references: Array.isArray(payload.references) ? payload.references.slice(0, 12).map((r) => {
      const x = r && typeof r === "object" ? r as Record<string, unknown> : {};
      return { surface: text(x.surface), refersTo: nullableText(x.refersTo), confidence: confidence(x.confidence) };
    }).filter((r) => r.surface) : [],
    emotion: EMOTIONS.has(emotion) ? emotion as V4TurnUnderstanding["emotion"] : "neutral",
    urgency: text(payload.urgency) === "urgent" ? "urgent" : "normal",
    topicChanged: bool(payload.topicChanged),
    customerRejectedPreviousAnswer: bool(payload.customerRejectedPreviousAnswer),
    customerWantsBrevity: bool(payload.customerWantsBrevity),
    noReplyRequested: bool(payload.noReplyRequested),
    identityQuestion: bool(payload.identityQuestion),
    humanContactRequested: bool(payload.humanContactRequested),
    socialClosure: bool(payload.socialClosure),
    confidence: confidence(payload.confidence),
    warnings: strings(payload.warnings, 10),
  };
}

function toClaims(value: unknown): V4DraftClaim[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((row) => {
    const x = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const kind = text(x.kind);
    const action = text(x.action);
    return {
      kind: CLAIM_KINDS.has(kind) ? kind as V4DraftClaim["kind"] : "courtesy",
      text: text(x.text),
      factKey: nullableText(x.factKey),
      action: ACTIONS.has(action) ? action as V4DraftClaim["action"] : null,
    };
  }).filter((x) => x.text);
}

function toDraft(payload: Record<string, unknown>, requestedDecision: V4Decision): V4DraftResponse {
  const decision = text(payload.decision);
  return {
    text: nullableText(payload.text),
    decision: DECISIONS.has(decision) ? decision as V4Decision : requestedDecision,
    claims: toClaims(payload.claims),
    answeredQuestions: strings(payload.answeredQuestions, 10),
    usedFactKeys: strings(payload.usedFactKeys, 30),
    notes: strings(payload.notes, 10),
  };
}

function toCritic(payload: Record<string, unknown>): V4CriticResult {
  return {
    accepted: payload.accepted === true,
    score: confidence(payload.score),
    reasons: strings(payload.reasons, 20),
    repairInstructions: strings(payload.repairInstructions, 20),
  };
}

function understandSystem() {
  return `أنت عقل فهم المحادثة في ALAMEEN V4. لا تكتب ردًا للعميل. افهم burst واتساب كاملًا كفكرة بشرية واحدة.\n\nقواعد حاسمة:\n- الرسالة الحالية أقوى من أي موضوع قديم.\n- intent labels القديمة ليست سلطة ولا تعتمد عليها.\n- افصل بين سؤال، طلب إجراء، تأكيد إجراء، شرط مستقبلي، اعتراض، مزاح، وإغلاق.\n- إذا كان هناك pendingProcedure، افهم هل الرسالة الحالية تؤكده أو ترفضه أو تغيّر الموضوع. السؤال الجديد لا يعتبر تأكيدًا للإجراء القديم.\n- عبارة مثل "نعم اريد استرداد الرسوم" بعد طلب تأكيد الاسترداد هي confirm وليست طلبًا جديدًا.\n- "بدي افتح الملف" ليست reopen_application.\n- طلب شخصية من الفريق مثل "وين عمران" أو "بدي عبدالله" = requestedPersona، وليس طلب إنسان خارجي.\n- فقط طلب موظف/إنسان حقيقي صراحة = humanContactRequested.\n- "انت بني آدم ولا رد آلي" = identityQuestion.\n- "بدون فلسفة/من الآخر/خلصني" = customerWantsBrevity.\n- "مافي داعي للرد/لا ترد" = noReplyRequested إذا لم تتضمن إجراء يجب تنفيذه.\n- إذا رفض العميل الرد السابق، customerRejectedPreviousAnswer=true حتى لو استخدم سخرية أو عصبية.\n\nأرجع JSON فقط بالمفاتيح:\nmeaningSummary,currentGoal,explicitQuestions,requestedAction,actionDisposition,requestedPersona,references,emotion,urgency,topicChanged,customerRejectedPreviousAnswer,customerWantsBrevity,noReplyRequested,identityQuestion,humanContactRequested,socialClosure,confidence,warnings.`;
}

function composeSystem(input: { memory: V4WorkingMemory; understanding: V4TurnUnderstanding; decision: V4Decision; repairInstructions?: string[] }) {
  const personaName = PERSONA_NAMES[input.memory.persona];
  return `أنت ${personaName} من فريق الأمين للأقساط داخل ALAMEEN V4. مهمتك أن تتصرف كأفضل موظف خدمة عملاء خبير: حاضر، فاهم، ذاكرته ممتازة، سريع، طبيعي، وغير روبوتي.\n\nهدف البشرية: 200% في الأسلوب والحضور، مع صفر اختلاق في الحقائق القابلة للتحقق.\n\n${HUMAN_BEHAVIOR_PRINCIPLES.map((x) => `- ${x}`).join("\n")}\n\nمسموح في الحضور الاجتماعي: ${WHITE_LIE_BOUNDARY.allowed.join(", ")}.\nممنوع اختلاق: ${WHITE_LIE_BOUNDARY.forbidden.join(", ")}.\n\n${humanStyleInstructions({ understanding: input.understanding, memory: input.memory }).map((x) => `- ${x}`).join("\n")}\n\nقرار المخطط لهذه الدورة: ${input.decision}.\n${input.repairInstructions?.length ? `تعليمات إصلاح إلزامية:\n${input.repairInstructions.map((x) => `- ${x}`).join("\n")}` : ""}\n\nأرجع JSON فقط:\n{text,decision,claims:[{kind,text,factKey,action}],answeredQuestions,usedFactKeys,notes}\nكل fact claim يجب أن يذكر factKey موجودًا في الحقيقة. كل action claim يجب أن يذكر action. claims من نوع emotion/courtesy لا تحتاج factKey.`;
}

function criticSystem() {
  return `أنت ناقد الإخراج النهائي لـ ALAMEEN V4. لا تحسن الرد ولا تجامله؛ قرر هل يصلح للإرسال. ارفضه إذا:\n- لم يجب السؤال الحالي مباشرة.\n- أعاد موضوعًا قديمًا بعد تغيير الهدف.\n- كرر جوابًا رفضه العميل.\n- فلسف والعميل طلب اختصارًا.\n- أجاب سؤال نعم/لا بدون نعم/لا أو جواب حاسم في البداية.\n- ادعى تنفيذًا أو موافقة أو دفعًا أو استردادًا أو اتصالًا أو موعدًا غير مثبت.\n- اخترع شركة/ترخيص/فرع/رقم/مورد/توفر.\n- قال صراحة إنه إنسان أو نفى أنه نظام آلي.\n- صار روبوتيًا أو مؤسسيًا بلا داعٍ.\nأرجع JSON فقط: {accepted,score,reasons,repairInstructions}.`;
}

export function createV4ModelAdapter(input: { understandingProvider: V3TextProvider; writerProvider: V3TextProvider; criticProvider: V3TextProvider }): V4ModelAdapter {
  return {
    async understand(req) {
      const raw = await input.understandingProvider.generate({
        system: understandSystem(),
        user: JSON.stringify({ burst: req.burstText, memory: compactMemory(req.memory), truth: compactTruth(req.truth) }),
        temperature: 0.05,
        maxTokens: 950,
      });
      return toUnderstanding(jsonObject(raw));
    },

    async compose(req) {
      const raw = await input.writerProvider.generate({
        system: composeSystem({ memory: req.memory, understanding: req.understanding, decision: req.decision, repairInstructions: req.repairInstructions }),
        user: JSON.stringify({
          burst: req.burstText,
          understanding: req.understanding,
          memory: compactMemory(req.memory),
          truth: compactTruth(req.truth),
          procedure: req.procedure as V4ProcedureResolution,
        }),
        temperature: 0.5,
        maxTokens: 1100,
      });
      return toDraft(jsonObject(raw), req.decision);
    },

    async critique(req) {
      const raw = await input.criticProvider.generate({
        system: criticSystem(),
        user: JSON.stringify({ burst: req.burstText, understanding: req.understanding, memory: compactMemory(req.memory), truth: compactTruth(req.truth), draft: req.draft }),
        temperature: 0,
        maxTokens: 700,
      });
      return toCritic(jsonObject(raw));
    },
  };
}
