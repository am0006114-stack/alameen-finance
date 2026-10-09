import { deterministicFinalCritic, mergeCriticResults } from "./finalCritic";
import { humanStyleInstructions, personaIdentityReply, PERSONA_NAMES } from "./humanBehaviorPolicy";
import { applyProcedureResolution, markProcedureExecution, resolveV4Procedure } from "./procedureEngine";
import { applyTurnUnderstanding, finalizeV4Memory } from "./workingMemory";
import { enforceCurrentTurnUnderstanding } from "./understandingGuard";
import type {
  V4ActionExecutionResult,
  V4ActionExecutor,
  V4ActionName,
  V4CriticResult,
  V4Decision,
  V4DraftResponse,
  V4ModelAdapter,
  V4ProcedureResolution,
  V4TruthBundle,
  V4TurnResult,
  V4WorkingMemory,
} from "./types";

function confirmationPrompt(action: V4ActionName, trackingId: string | null) {
  const id = trackingId ? ` ${trackingId}` : "";
  switch (action) {
    case "cancel_application": return `طلب الإلغاء واضح${id}. لأنه إجراء فعلي، أكدلي مرة واحدة: نعم، ألغي الطلب.`;
    case "request_refund": return `طلب استرداد الرسوم واضح${id}. أكدلي مرة واحدة: نعم، أريد استرداد الرسوم.`;
    case "stop_refund": return `طلب إيقاف الاسترداد واضح${id}. أكدلي مرة واحدة إنك تريد إيقاف طلب الاسترداد.`;
    case "change_application_data": return `فهمت التعديل المطلوب${id}. قبل ما أسجل التعديل للمراجعة الإدارية، أكدلي مرة واحدة إنك بدك نبدأ تسجيله.`;
    case "change_device": return `فهمت إنك بدك تغيّر الجهاز${id}. أكدلي مرة واحدة إنك بدك نسجل طلب تغيير الجهاز للمراجعة.`;
    case "reopen_application": return `طلب إعادة فتح الطلب واضح${id}. أكدلي مرة واحدة إنك بدك نعيد فتحه.`;
    case "link_whatsapp_alias": return `إذا هذا رقم واتسابك وبدك نعتمده كرقم متابعة تابع للطلب${id}، أكدلي مرة واحدة: نعم، اعتمد الرقم.`;
    default: return `الإجراء واضح${id}. أكدلي مرة واحدة إنك بدك ننفذه.`;
  }
}

function executionReply(result: V4ActionExecutionResult) {
  if (result.executed) return result.summary || "تم تنفيذ الإجراء فعليًا وتسجيله على الطلب.";
  return result.error ? `ما تم تنفيذ الإجراء. السبب المثبت عندي: ${result.error}` : "ما تم تنفيذ الإجراء، وما رح أدّعي إنه تم قبل وجود نتيجة فعلية.";
}

function deterministicDraft(input: {
  decision: V4Decision;
  memory: V4WorkingMemory;
  procedure: V4ProcedureResolution;
  truth: V4TruthBundle;
  actionResult: V4ActionExecutionResult | null;
  identityQuestion: boolean;
  explicitQuestions: string[];
}): V4DraftResponse | null {
  if (input.actionResult) {
    return {
      text: executionReply(input.actionResult),
      decision: "ACT",
      claims: input.actionResult.executed
        ? [{ kind: "action", text: input.actionResult.summary || "تم تنفيذ الإجراء", action: input.actionResult.action }]
        : [],
      answeredQuestions: [],
      usedFactKeys: [],
      notes: ["deterministic action receipt reply"],
    };
  }

  if (input.procedure.needsConfirmation && input.procedure.action) {
    return {
      text: confirmationPrompt(input.procedure.action, input.truth.trackingId),
      decision: "ASK",
      claims: [],
      answeredQuestions: [],
      usedFactKeys: [],
      notes: ["single-confirmation procedure contract"],
    };
  }

  if (input.decision === "SILENCE") {
    return { text: null, decision: "SILENCE", claims: [], answeredQuestions: [], usedFactKeys: [], notes: ["customer requested silence"] };
  }

  if (input.identityQuestion) {
    const name = PERSONA_NAMES[input.memory.persona];
    return {
      text: personaIdentityReply(input.memory.persona),
      decision: "ANSWER",
      claims: [{ kind: "identity", text: `معك ${name} من فريق الأمين` }],
      answeredQuestions: input.explicitQuestions.length ? input.explicitQuestions : ["identity"],
      usedFactKeys: [],
      notes: ["human-presence identity reply without explicit human/non-AI claim"],
    };
  }

  return null;
}

function chooseDecision(input: {
  understanding: Awaited<ReturnType<V4ModelAdapter["understand"]>>;
  procedure: V4ProcedureResolution;
}) {
  if (input.procedure.shouldExecute) return "ACT" as const;
  if (input.procedure.needsConfirmation) return "ASK" as const;
  if (input.understanding.noReplyRequested) return "SILENCE" as const;
  if (input.understanding.humanContactRequested) return "ESCALATE" as const;
  if (input.understanding.explicitQuestions.length || input.understanding.currentGoal || input.understanding.identityQuestion || input.understanding.requestedPersona) return "ANSWER" as const;
  if (input.understanding.socialClosure) return "ACKNOWLEDGE" as const;
  return "ANSWER" as const;
}

function acceptedCritic(): V4CriticResult {
  return { accepted: true, score: 1, reasons: [], repairInstructions: [] };
}

export async function runV4ConversationTurn(input: {
  turnId: string;
  burstText: string;
  memory: V4WorkingMemory;
  truth: V4TruthBundle;
  model: V4ModelAdapter;
  actionExecutor?: V4ActionExecutor | null;
}): Promise<V4TurnResult> {
  const modelUnderstanding = await input.model.understand({ burstText: input.burstText, memory: input.memory, truth: input.truth });
  const understanding = enforceCurrentTurnUnderstanding({ burstText: input.burstText, model: modelUnderstanding, memory: input.memory });
  let memory = applyTurnUnderstanding({ memory: input.memory, turnId: input.turnId, customerText: input.burstText, understanding });

  const procedure = resolveV4Procedure({ memory, turnId: input.turnId, understanding });
  memory = applyProcedureResolution({ memory, turnId: input.turnId, resolution: procedure });

  let actionResult: V4ActionExecutionResult | null = null;
  let truth = input.truth;
  if (procedure.shouldExecute && procedure.action) {
    if (!input.actionExecutor) {
      actionResult = { action: procedure.action, executed: false, receiptId: null, summary: null, error: "action executor is not connected" };
    } else {
      actionResult = await input.actionExecutor.execute({
        action: procedure.action,
        payload: memory.pendingProcedure?.payload || null,
        truth: input.truth,
        turnId: input.turnId,
      });
    }
    memory = markProcedureExecution({ memory, turnId: input.turnId, executed: actionResult.executed, error: actionResult.error });
    truth = {
      ...truth,
      verifiedActionReceipts: [
        ...truth.verifiedActionReceipts,
        { action: actionResult.action, executed: actionResult.executed, receiptId: actionResult.receiptId, summary: actionResult.summary },
      ],
    };
  }

  const decision = chooseDecision({ understanding, procedure });
  const hardDraft = deterministicDraft({ decision, memory, procedure, truth, actionResult, identityQuestion: understanding.identityQuestion, explicitQuestions: understanding.explicitQuestions });

  let draft = hardDraft || await input.model.compose({
    burstText: input.burstText,
    understanding,
    memory,
    truth,
    decision,
    procedure,
    repairInstructions: humanStyleInstructions({ understanding, memory }),
  });

  const deterministicCritic = deterministicFinalCritic({ burstText: input.burstText, understanding, memory, truth, draft });
  const modelCritic = hardDraft ? acceptedCritic() : await input.model.critique({ burstText: input.burstText, understanding, memory, truth, draft });
  let critic = mergeCriticResults(deterministicCritic, modelCritic);

  // One bounded repair pass only. The system must never spin in an answer loop.
  if (!critic.accepted && !hardDraft) {
    const repairInstructions = Array.from(new Set([
      ...humanStyleInstructions({ understanding, memory }),
      ...critic.repairInstructions,
      ...critic.reasons.map((r) => `اصلح: ${r}`),
    ]));
    draft = await input.model.compose({
      burstText: input.burstText,
      understanding,
      memory,
      truth,
      decision,
      procedure,
      repairInstructions,
    });
    const deterministicRetry = deterministicFinalCritic({ burstText: input.burstText, understanding, memory, truth, draft });
    const modelRetry = await input.model.critique({ burstText: input.burstText, understanding, memory, truth, draft });
    critic = mergeCriticResults(deterministicRetry, modelRetry);
  }

  // Fail closed: a rejected draft is never sent just because it sounds plausible.
  const reply = critic.accepted ? draft.text : null;
  memory = finalizeV4Memory({
    memory,
    turnId: input.turnId,
    customerText: input.burstText,
    meaningSummary: understanding.meaningSummary,
    assistantText: reply,
    answeredQuestions: critic.accepted ? draft.answeredQuestions : [],
    explainedFactKeys: critic.accepted ? draft.usedFactKeys : [],
  });

  return { reply, decision, understanding, memory, procedure, actionResult, critic };
}
