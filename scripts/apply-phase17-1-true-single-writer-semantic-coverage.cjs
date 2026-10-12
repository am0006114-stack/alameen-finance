const fs = require('fs');

const files = {
  runtime: 'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
  kernel: 'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts',
  verifier: 'app/api/whatsapp/webhook/_lib/v3-os/semanticReplyVerifier.ts',
  types: 'app/api/whatsapp/webhook/_lib/v3-os/types.ts',
};

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value, 'utf8'); }
function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, got ${count}`);
  return text.replace(from, to);
}
function replaceRegexOnce(text, re, to, label) {
  const matches = [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one regex match, got ${matches.length}`);
  return text.replace(re, to);
}

// 1) Semantic frame: make payment meaning explicit instead of inferring execution from keywords.
{
  let s = read(files.types);
  s = replaceOnce(
    s,
    '  answerObligations: string[];\n  references:',
    '  answerObligations: string[];\n  paymentIntent: "execute_now" | "access_problem" | "method_question" | "status_or_proof" | "none";\n  references:',
    'types.paymentIntent',
  );
  write(files.types, s);
}

// 2) Native writer: enumerate every material obligation and classify payment access separately from execution.
{
  let s = read(files.kernel);
  s = replaceOnce(
    s,
    '  answerObligations?: unknown;\n  references?: unknown;',
    '  answerObligations?: unknown;\n  paymentIntent?: unknown;\n  references?: unknown;',
    'kernel.ModelPayload.paymentIntent',
  );
  s = replaceOnce(
    s,
    '  const answerMode = ["direct","grounded_reasoning","clarify","social"].includes(String(payload.answerMode))\n    ? String(payload.answerMode) as SemanticTurnFrame["answerMode"] : "direct";\n\n  return {',
    '  const answerMode = ["direct","grounded_reasoning","clarify","social"].includes(String(payload.answerMode))\n    ? String(payload.answerMode) as SemanticTurnFrame["answerMode"] : "direct";\n  const paymentIntent = ["execute_now","access_problem","method_question","status_or_proof","none"].includes(String(payload.paymentIntent))\n    ? String(payload.paymentIntent) as SemanticTurnFrame["paymentIntent"] : "none";\n\n  return {',
    'kernel.semanticFrame.paymentIntent.parse',
  );
  s = replaceOnce(
    s,
    '    answerObligations: safeStringArray(payload.answerObligations),\n    references:',
    '    answerObligations: safeStringArray(payload.answerObligations),\n    paymentIntent,\n    references:',
    'kernel.semanticFrame.paymentIntent.output',
  );
  s = replaceOnce(
    s,
    '  "answerObligations":["..."],\n  "references":[],',
    '  "answerObligations":["..."],\n  "paymentIntent":"execute_now|access_problem|method_question|status_or_proof|none",\n  "references":[],',
    'kernel.prompt.schema.paymentIntent',
  );
  s = replaceOnce(
    s,
    '- جاوب كل سؤال مادي في الرسالة الحالية. لا تبدّل السؤال إلى status أقدم.\n',
    '- جاوب كل سؤال مادي في الرسالة الحالية. لا تبدّل السؤال إلى status أقدم.\n- answerObligations لازم تحتوي بندًا مستقلًا لكل سؤال/طلب/اعتراض قابل للجواب في CUSTOMER_MESSAGE، حتى لو الرسالة خلطت أكثر من موضوع. لا تختزل الرسالة إلى موضوع واحد.\n- paymentIntent=access_problem عندما العميل يقول إن وسيلة الدفع المقترحة غير متوفرة/غير قابلة للاستخدام عنده ويسأل ماذا يفعل؛ هذا ليس موافقة تنفيذ دفع ولا طلبًا لإعادة نفس بيانات الدفع. paymentIntent=execute_now فقط عندما يريد تنفيذ الدفع الآن أو يطلب بيانات التحويل للتنفيذ بدون عائق وصول معلن. method_question للاستفسار عن الطرق، status_or_proof لما يتكلم عن دفع/وصل حصل بالفعل.\n- إذا العميل يقول إنه لا يملك وسيلة الدفع المذكورة، حل مشكلة الوصول أولًا ولا ترد بإعادة نفس الوسيلة كأنها جواب كامل. وإذا في نفس الرسالة سؤال هوية/اسم الموظف، جاوب النقطتين معًا.\n',
    'kernel.prompt.material-obligations',
  );
  s = replaceOnce(
    s,
    'OPERATIONAL_CONTEXT=${JSON.stringify(input.operationalContext || {})}\nPROFILE_NAME=',
    'OPERATIONAL_CONTEXT=${JSON.stringify(input.operationalContext || {})}\n- OPERATIONAL_CONTEXT.legacyPaymentPrioritySignal إن ظهر فهو إشارة telemetry فقط، وليس إذنًا لتجاوز CUSTOMER_MESSAGE أو لإثبات continuation أو لكتابة قالب دفع.\n- إذا OPERATIONAL_CONTEXT.protectedFiveJodStep=true، حافظ على حقائق الدفع المطلوبة لكن لا تسقط أي answerObligation أخرى من نفس الرسالة.\nPROFILE_NAME=',
    'kernel.prompt.operational-signals',
  );
  write(files.kernel, s);
}

// 3) Semantic verifier: independently inspect CUSTOMER, not just the model's own obligation list.
{
  let s = read(files.verifier);
  s = replaceRegexOnce(
    s,
    /export function semanticVerificationWarranted\(turn: InterpretedTurn\) \{[\s\S]*?\n\}/,
`export function semanticVerificationWarranted(turn: InterpretedTurn) {
  const f = turn.semantic;
  if (!f || f.socialClosure) return false;
  const raw = String(turn.rawText || "").trim();
  const explicitQuestionSurface = /[؟?]/.test(raw);
  const materiallySpecific = raw.length >= 8 && !/^(?:تمام|اوك|اوكي|شكرا|شكرًا|يسلمو|مرحبا|هلا)$/i.test(raw);
  return Boolean(
    f.currentQuestion ||
    f.answerObligations.length ||
    f.correctionOfPrevious ||
    f.decision.continuation !== "unknown" ||
    f.entities.some((entity) => entity.knownFactStatus === "unknown") ||
    explicitQuestionSurface ||
    materiallySpecific
  );
}`,
    'verifier.warranted',
  );
  s = replaceOnce(
    s,
    '- كل answerObligations التزامات مستقلة.\n',
    '- كل answerObligations التزامات مستقلة، لكن لا تثق أنها كاملة: اقرأ CUSTOMER بنفسك واستخرج كل سؤال/طلب/اعتراض مستقل. إذا CUSTOMER يحتوي نقطتين ماديتين والرد أجاب واحدة فقط، pass=false وضع الثانية في missingObligations.\n- إذا CUSTOMER يسأل عن هوية/اسم من يتحدث معه ضمن رسالة فيها سؤال خدمة آخر، يجب أن يغطي CANDIDATE الهوية باختصار ويغطي سؤال الخدمة أيضًا؛ تغطية واحد فقط فشل.\n- إذا CUSTOMER يقول إنه لا يملك/لا يستطيع استخدام وسيلة الدفع المطروحة ويسأل كيف يدفع، مجرد إعادة نفس بيانات CliQ/المحفظة لا يحل access problem ويجب أن يفشل.\n- إذا CUSTOMER واضح ومحدد، رد عام من نوع «اكتب المطلوب/حدد سؤالك/احكيلي شو بدك» يعتبر answersCurrentQuestion=false حتى لو صيغ بكلمات جديدة غير موجودة في blacklist.\n',
    'verifier.independent-coverage',
  );
  write(files.verifier, s);
}

// 4) Runtime: no revenue/payment writer bypass. Native Kernel writes normal dialogue; deterministic code only validates/actions/emergency truth.
{
  let s = read(files.runtime);
  s = replaceOnce(
    s,
    'import type { SemanticReplyCheck } from "./semanticReplyVerifier";',
    'import { verifySemanticReply, type SemanticReplyCheck } from "./semanticReplyVerifier";',
    'runtime.import.verifySemanticReply',
  );
  s = replaceOnce(
    s,
    '  "application_correction",\n  "human_request",\n  "manager_request",\n]);',
    '  "application_correction",\n]);',
    'runtime.no-human-critical-topic',
  );
  s = replaceRegexOnce(
    s,
    /\n  if \(turn\.explicitRoleRequest === "staff" \|\| turn\.explicitRoleRequest === "manager"[\s\S]*?\n  \}\n\n  return null;/,
    '\n  return null;',
    'runtime.remove-human-deterministic-reply',
  );

  s = replaceRegexOnce(
    s,
    /  \/\/ PHASE 8\.5 REVENUE PRIORITY:[\s\S]*?\n  if \(nativeKernelInitial\.modelUsed\) \{/,
`  // PHASE 17.1 TRUE SINGLE WRITER: legacy payment priority is telemetry/context only.
  // It must never bypass the Native Conversation Kernel or write customer-facing prose.
  const recentCommercialDisclosureEvidence = [boundState.lastAssistantText || "", ...scopedRecentTurns.slice(-6)]
    .some((line) => resemblesFullCommercialDisclosure(String(line || "")));
  const directPaymentContinuationIntent = isPaymentPriorityCustomerText(effectiveCustomerText, turn.topics.join(","), boundState.lastAssistantText);
  const paymentPriorityAfterDisclosure = truthBeforeActions.contactAccess !== "safe_preview"
    && (commercialDisclosureDelivered(boundState, truthBeforeActions) || recentCommercialDisclosureEvidence)
    && directPaymentContinuationIntent
    && !semanticContinuationVeto(turn)
    && !explicitDoNotContinueText(effectiveCustomerText, boundState.lastAssistantText);

  nativeKernelInitial = await runNativeConversationKernel({
    provider: kernelProvider,
    customerText: effectiveCustomerText,
    turnId: input.turnId,
    state: boundState,
    truth: truthBeforeActions,
    recentTurns: scopedRecentTurns,
    profileName: input.profileName,
    deterministicAnchor: turn,
    operationalContext: {
      hybridIntelligence: {
        route: hybridDecision.route,
        score: hybridDecision.score,
        reasons: hybridDecision.reasons,
        fastPathProtected: hybridDecision.fastPathProtected,
        pilotActive: Boolean(solHybridControl?.active),
      },
      legacyPaymentPrioritySignal: paymentPriorityAfterDisclosure,
    },
  });
  if (nativeKernelInitial.modelUsed) {`,
    'runtime.remove-payment-writer-bypass',
  );

  s = replaceOnce(
    s,
    '  const numericContinuationShortcut = applicationJourneyStage(truthBeforeActions.application) === "preliminary_approved_waiting_decision"\n    && numericContinuationShortcutText(effectiveCustomerText);\n  const rawContinuationIntent =',
    '  const paymentIntentThisTurn = turn.semantic?.paymentIntent || "none";\n  const paymentExecutionIntentThisTurn = paymentIntentThisTurn === "execute_now";\n  const paymentAccessProblemThisTurn = paymentIntentThisTurn === "access_problem";\n  const numericContinuationShortcut = applicationJourneyStage(truthBeforeActions.application) === "preliminary_approved_waiting_decision"\n    && numericContinuationShortcutText(effectiveCustomerText);\n  const rawContinuationIntent =',
    'runtime.payment-intent-signals',
  );
  s = replaceOnce(
    s,
    '      || explicitContinuationText(effectiveCustomerText)\n      || directPaymentContinuationIntent\n      || paymentPriorityAfterDisclosure\n      || numericContinuationShortcut',
    '      || explicitContinuationText(effectiveCustomerText)\n      || paymentExecutionIntentThisTurn\n      || numericContinuationShortcut',
    'runtime.raw-continuation-no-legacy-payment-signal',
  );
  s = replaceOnce(
    s,
    '      || explicitContinuationText(effectiveCustomerText)\n      || paymentPriorityAfterDisclosure\n      || numericContinuationShortcut',
    '      || explicitContinuationText(effectiveCustomerText)\n      || paymentExecutionIntentThisTurn\n      || numericContinuationShortcut',
    'runtime.continuation-decision-no-legacy-payment-signal',
  );

  s = replaceRegexOnce(
    s,
    /  \/\/ PHASE 9\.1 POLICY-BOUNDED RUNTIME AUTHORITY EGRESS:[\s\S]*?\n  const answeredTopics =/,
`  // PHASE 17.1 TRUE SINGLE WRITER + SEMANTIC COVERAGE:
  // Native Kernel owns normal prose. Deterministic code may execute hard actions,
  // validate truth, or provide a transparent outage fallback; it cannot replace a
  // normal mixed-turn answer with a payment/status template.
  const protectedFiveJodStep = continuationRevenueReadyAtDecision
    && !paymentAccessProblemThisTurn
    && (paymentExecutionIntentThisTurn
      || numericContinuationShortcut
      || turn.requestedActions.includes("continue_application")
      || turn.semantic?.decision.continuation === "confirmed");
  const criticalOperationalReply = criticalOperationalFallbackReply({
    truth: truthAfterActions,
    state: conversationState,
    customerText: effectiveCustomerText,
    turn,
    actions,
  });
  let reply: string | null = plan.shouldRespond ? (criticalOperationalReply || nativeKernelInitial.reply) : null;
  let verification: VerificationReport = PASS;
  let semanticCheck: SemanticReplyCheck = { pass: true, checked: false, answersCurrentQuestion: true, staleTopic: false, invertedDecision: false, unknownEntityMisread: false, missingObligations: [], repairInstruction: null, confidence: 1, modelError: null };
  let replyAttempts = nativeKernelInitial.modelUsed ? 1 : 0;
  let fallbackUsed = false;
  let failOpenReasons: string[] = [];

  const operationalContext = {
    hybridIntelligence: {
      route: hybridDecision.route,
      score: hybridDecision.score,
      reasons: hybridDecision.reasons,
      fastPathProtected: hybridDecision.fastPathProtected,
      pilotActive: Boolean(solHybridControl?.active),
    },
    legacyPaymentPrioritySignal: paymentPriorityAfterDisclosure,
    paymentIntentThisTurn,
    paymentAccessProblemThisTurn,
    paymentExecutionIntentThisTurn,
    mutationConfirmationRequired: Boolean(mutationGate.confirmationPrompt),
    mutationConfirmationPromptMeaning: mutationGate.confirmationPrompt || null,
    mutationInformationalMeaning: mutationGate.informationalReply || null,
    blockedQuestionAction: mutationGate.blockedQuestionAction || null,
    manualDisposition,
    paymentIncident: paymentIncident !== "none" ? paymentIncident : null,
    paymentIncidentSafetyMeaning: paymentIncidentReply,
    actions,
    disclosureRequiredThisTurn,
    protectedFiveJodStep,
    continuationDecisionThisTurn,
    applicationJourneyStage: applicationJourneyStage(truthAfterActions.application),
    paymentConfirmed: hasAuthoritativePaymentConfirmation(truthAfterActions.application),
  };

  const actionOrTruthChangedAfterInitialDraft = Boolean(
    mutationGate.confirmationPrompt
    || mutationGate.informationalReply
    || paymentIncidentReply
    || manualDisposition.kind !== "none"
    || actions.some((x) => x.outcome !== "none" && x.outcome !== "dry_run")
    || continuationPersistence.updated
  );

  if (plan.shouldRespond && kernelProvider && actionOrTruthChangedAfterInitialDraft && !criticalOperationalReply) {
    const refreshed = await runNativeConversationKernel({
      provider: kernelProvider,
      customerText: effectiveCustomerText,
      turnId: input.turnId,
      state: conversationState,
      truth: truthAfterActions,
      recentTurns: scopedRecentTurns,
      profileName: input.profileName,
      deterministicAnchor: turn,
      actionResults: actions,
      validationFailures: [
        ...(mutationGate.confirmationPrompt ? [\`ACTION_CONFIRMATION_REQUIRED=\${mutationGate.confirmationPrompt}\`] : []),
        ...(mutationGate.informationalReply ? [\`ACTION_INFORMATIONAL_RESULT=\${mutationGate.informationalReply}\`] : []),
        ...(paymentIncidentReply ? [\`PAYMENT_INCIDENT_SAFETY=\${paymentIncidentReply}\`] : []),
      ],
      operationalContext,
    });
    replyAttempts++;
    if (refreshed.reply) reply = refreshed.reply;
  }

  let nativeValidation = validateNativeConversationReply({
    reply,
    turn,
    state: conversationState,
    truth: truthAfterActions,
    actions,
    recentTurns: scopedRecentTurns,
    customerText: effectiveCustomerText,
    disclosureRequiredThisTurn,
    protectedFiveJodStep,
  });

  // First bounded repair: truth/action violations only. The writer remains Native Kernel.
  if (plan.shouldRespond && !nativeValidation.pass && kernelProvider && replyAttempts < 2 && !criticalOperationalReply) {
    const repaired = await runNativeConversationKernel({
      provider: kernelProvider,
      customerText: effectiveCustomerText,
      turnId: input.turnId,
      state: conversationState,
      truth: truthAfterActions,
      recentTurns: scopedRecentTurns,
      profileName: input.profileName,
      deterministicAnchor: turn,
      actionResults: actions,
      validationFailures: nativeValidation.reasons,
      operationalContext,
    });
    replyAttempts++;
    if (repaired.reply) reply = repaired.reply;
    nativeValidation = validateNativeConversationReply({
      reply,
      turn,
      state: conversationState,
      truth: truthAfterActions,
      actions,
      recentTurns: scopedRecentTurns,
      customerText: effectiveCustomerText,
      disclosureRequiredThisTurn,
      protectedFiveJodStep,
    });
  }

  // Semantic coverage is an independent judge. It reads CUSTOMER itself and may not
  // trust the writer's own obligation list as complete.
  if (plan.shouldRespond && nativeValidation.pass && reply && kernelProvider && !criticalOperationalReply) {
    semanticCheck = await verifySemanticReply({
      provider: kernelProvider,
      turn,
      state: conversationState,
      truth: truthAfterActions,
      reply,
    });
  }

  // Second bounded repair: only when semantic coverage says a current-turn
  // obligation was missed/stale/inverted. No deterministic prose is substituted.
  if (plan.shouldRespond && nativeValidation.pass && !semanticCheck.pass && kernelProvider && replyAttempts < 3 && !criticalOperationalReply) {
    const semanticFailures = [
      \`SEMANTIC_MISSING_OBLIGATIONS=\${JSON.stringify(semanticCheck.missingObligations)}\`,
      \`SEMANTIC_REPAIR_INSTRUCTION=\${semanticCheck.repairInstruction || "answer every material current-turn obligation"}\`,
      \`SEMANTIC_CURRENT_QUESTION_REQUIRED=\${semanticCheck.answersCurrentQuestion ? "covered" : "missing"}\`,
    ];
    const repaired = await runNativeConversationKernel({
      provider: kernelProvider,
      customerText: effectiveCustomerText,
      turnId: input.turnId,
      state: conversationState,
      truth: truthAfterActions,
      recentTurns: scopedRecentTurns,
      profileName: input.profileName,
      deterministicAnchor: turn,
      actionResults: actions,
      validationFailures: semanticFailures,
      operationalContext,
    });
    replyAttempts++;
    if (repaired.reply) reply = repaired.reply;
    nativeValidation = validateNativeConversationReply({
      reply,
      turn,
      state: conversationState,
      truth: truthAfterActions,
      actions,
      recentTurns: scopedRecentTurns,
      customerText: effectiveCustomerText,
      disclosureRequiredThisTurn,
      protectedFiveJodStep,
    });
    if (nativeValidation.pass && reply) {
      semanticCheck = await verifySemanticReply({
        provider: kernelProvider,
        turn,
        state: conversationState,
        truth: truthAfterActions,
        reply,
      });
    }
  }

  const materialQuestionMarks = (effectiveCustomerText.match(/[؟?]/g) || []).length;
  const mixedMaterialTurn = (turn.semantic?.answerObligations.length || 0) > 1 || materialQuestionMarks > 1;
  const fullyAccepted = nativeValidation.pass && semanticCheck.pass;

  // Emergency liveness only after the writer/repair path is exhausted. Never route
  // a mixed turn into a deterministic payment template. The old generic last-resort
  // writer is intentionally not used here.
  if (plan.shouldRespond && (!reply || !fullyAccepted)) {
    failOpenReasons = [
      ...nativeValidation.reasons,
      ...(!semanticCheck.pass ? [\`semantic:\${semanticCheck.missingObligations.join("|") || semanticCheck.repairInstruction || "coverage_failed"}\`] : []),
    ];
    if (!mixedMaterialTurn && !reply && disclosureRequiredThisTurn) {
      reply = buildInformedCommercialDisclosureReply(truthAfterActions);
      fallbackUsed = true;
    } else if (!mixedMaterialTurn && !reply && protectedFiveJodStep) {
      reply = buildMandatoryFiveJodContinuationReply(turn, truthAfterActions);
      fallbackUsed = true;
    } else {
      reply = "صار خلل مؤقت منعني أكمل جوابك بشكل صحيح هاللحظة. رسالتك محفوظة بنفس المحادثة، وما رح أجاوبك بجواب ناقص أو أرجعك لموضوع ثاني. جرّب ابعتها مرة ثانية بعد شوي.";
      fallbackUsed = true;
    }
  }

  verification = fallbackUsed
    ? PASS
    : fullyAccepted
      ? PASS
      : { ...PASS, pass: false, policyViolations: [...nativeValidation.reasons, ...semanticCheck.missingObligations] };

  const finalSafetyPass = !plan.shouldRespond || Boolean(reply && verification.pass);
  const obligations = turn.semantic?.answerObligations || [];
  const missing = new Set(semanticCheck.missingObligations || []);
  const replyProvenance = {
    writer: criticalOperationalReply ? "critical_truth_action" : fallbackUsed ? "transparent_failure_fallback" : "native_kernel",
    bypass: null,
    legacyPaymentPrioritySignal: paymentPriorityAfterDisclosure,
    paymentIntent: paymentIntentThisTurn,
    obligations,
    covered: semanticCheck.checked ? obligations.filter((item) => !missing.has(item)) : obligations,
    semanticChecked: semanticCheck.checked,
    semanticPass: semanticCheck.pass,
    nativeValidationPass: nativeValidation.pass,
    attempts: replyAttempts,
  } as const;
  console.info("V3_REPLY_PROVENANCE", JSON.stringify({ waId: input.waId, turnId: input.turnId, ...replyProvenance, failOpenReasons }));

  const answeredTopics =`,
    'runtime.true-single-writer-egress',
  );

  s = replaceOnce(
    s,
    '  realActionsEnabled: boolean;\n  humanOs?: {',
    '  realActionsEnabled: boolean;\n  replyProvenance?: {\n    writer: "native_kernel" | "critical_truth_action" | "transparent_failure_fallback";\n    bypass: null;\n    legacyPaymentPrioritySignal: boolean;\n    paymentIntent: SemanticTurnFrame["paymentIntent"];\n    obligations: string[];\n    covered: string[];\n    semanticChecked: boolean;\n    semanticPass: boolean;\n    nativeValidationPass: boolean;\n    attempts: number;\n  };\n  humanOs?: {',
    'runtime.type.provenance',
  );
  s = replaceOnce(
    s,
    'import type { ActionKey, ActionResult, ConversationState, InterpretedTurn, OsRunResult, TruthBundle, VerificationReport } from "./types";',
    'import type { ActionKey, ActionResult, ConversationState, InterpretedTurn, OsRunResult, SemanticTurnFrame, TruthBundle, VerificationReport } from "./types";',
    'runtime.import.SemanticTurnFrame',
  );
  s = replaceOnce(
    s,
    '    fallbackUsed,\n    realActionsEnabled: input.realActionsEnabled,',
    '    fallbackUsed,\n    replyProvenance,\n    realActionsEnabled: input.realActionsEnabled,',
    'runtime.return.provenance',
  );
  write(files.runtime, s);
}

console.log('PHASE 17.1 PATCH APPLIED');
