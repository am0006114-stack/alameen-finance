const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function file(rel) {
  return path.join(root, rel);
}

function patchOnce(rel, marker, before, after) {
  const target = file(rel);
  let source = fs.readFileSync(target, 'utf8');
  if (source.includes(marker)) {
    console.log(`PATCH ALREADY APPLIED: ${rel} :: ${marker}`);
    return;
  }
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`PATCH ANCHOR MISSING: ${rel} :: ${marker}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`PATCH ANCHOR NOT UNIQUE: ${rel} :: ${marker}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
  fs.writeFileSync(target, source, 'utf8');
  console.log(`PATCHED: ${rel} :: ${marker}`);
}

// 1) FINAL revenue invariant. No later validator/fail-open may erase the canonical
// 5-JOD execution payload after continuation was durably persisted.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
  'P0_20261022_FINAL_FIVE_JOD_EGRESS_INVARIANT',
  `  // The deterministic fail-open reply is accepted for liveness even when the\n`,
  `  // P0_20261022_FINAL_FIVE_JOD_EGRESS_INVARIANT\n  // This runs AFTER every bounded model repair and fail-open writer. If this turn\n  // durably opened the continuation/payment stage, nothing may replace the full\n  // payment destinations + request-specific receipt link on final egress.\n  const finalFiveJodEgressInvariant = Boolean(\n    plan.shouldRespond\n    && continuationPersistenceConfirmed\n    && applicationJourneyStage(truthAfterActions.application) === "continuation_confirmed_fee_due"\n    && (continuationDecisionThisTurn || postApprovalAnyInboundTrigger || continuationPersistence.updated)\n  );\n  if (finalFiveJodEgressInvariant) {\n    reply = protectedFiveJodReply || buildMandatoryFiveJodContinuationReply(turn, truthAfterActions);\n    fallbackUsed = true;\n    nativeValidation = validateNativeConversationReply({\n      reply,\n      turn,\n      state: conversationState,\n      truth: truthAfterActions,\n      actions,\n      recentTurns: scopedRecentTurns,\n      customerText: effectiveCustomerText,\n      disclosureRequiredThisTurn: false,\n      protectedFiveJodStep: true,\n    });\n  }\n\n  // The deterministic fail-open reply is accepted for liveness even when the\n`
);

// 2) The mandatory 5-JOD block must answer the real commercial contingency too.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts',
  'P0_20261022_FIVE_JOD_REFUND_CONTINGENCY',
  'مستردة عبر المسار الرسمي إذا ألغيت بعد دفع مؤكد.',
  'مستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية، أو إذا ألغيت بعد دفع مؤكد. /* P0_20261022_FIVE_JOD_REFUND_CONTINGENCY */'
);

// 3) Post-payment Telegram migration may never swallow a WhatsApp mutation
// confirmation or create a no-response dead end.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/telegramMigration.ts',
  'P0_20261022_WHATSAPP_CONFIRMATION_OWNS_TURN',
  `  if (!text) {\n    return { owner: "whatsapp", reason: "critical_fallback_empty_text" };\n  }\n\n  const telegramRefusal = [\n`,
  `  if (!text) {\n    return { owner: "whatsapp", reason: "critical_fallback_empty_text" };\n  }\n\n  // P0_20261022_WHATSAPP_CONFIRMATION_OWNS_TURN\n  // A short confirmation can be the second step of cancel/refund/alias/reopen.\n  // Migration has no authority to consume it before the mutation gate sees it.\n  if (/^(?:نعم|اه|ايوه|yes|موافق|موافقه|اكيد|تاكيد|تأكيد)$/.test(text)) {\n    return { owner: "whatsapp", reason: "critical_fallback_mutation_confirmation" };\n  }\n\n  const telegramAvailabilityProblem = [\n    "هل ضروري تلجرام", "هل لازم تلجرام", "ضروري تلجرام", "لازم تلجرام",\n    "هل ضروري تليجرام", "هل لازم تليجرام", "ضروري تليجرام", "لازم تليجرام",\n    "ما عندي تلجرام", "ما عندي تليجرام", "ما بنزل عندي التلجرام",\n    "ما بنزل عندي التليجرام", "ما بقدر انزل تلجرام", "ما بقدر انزل تليجرام",\n  ];\n  if (includesAny(text, telegramAvailabilityProblem)) {\n    return { owner: "whatsapp", reason: "critical_fallback_telegram_unavailable_or_question" };\n  }\n\n  const telegramRefusal = [\n`
);

patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/telegramMigration.ts',
  'P0_20261022_MIGRATION_ONLY_HANDLES_WHEN_SENT',
  `  return prepareMigrationSend({\n    app,\n    waId: canonical,\n    sourceKey: \`wa-inbound:\${String(input.sourceMessageId || "unknown")}\`,\n  });\n}\n`,
  `  const migration = await prepareMigrationSend({\n    app,\n    waId: canonical,\n    sourceKey: \`wa-inbound:\${String(input.sourceMessageId || "unknown")}\`,\n  });\n\n  // P0_20261022_MIGRATION_ONLY_HANDLES_WHEN_SENT\n  // Cooldown/exhausted/reservation/send failures are migration state, not a valid\n  // customer response. Fall through to V3 whenever Telegram sent nothing.\n  if (!migration.sent) {\n    return { ...migration, handled: false, suppressed: true };\n  }\n  return migration;\n}\n`
);

// 4) Payment closing: hypothetical payment is not a paid claim; questions about
// losing the 5 JOD if approval fails are trust/contingency questions and must
// expose the complete canonical payment payload at fee-due stage.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/paymentClosingGuard.ts',
  'P0_20261022_HYPOTHETICAL_PAYMENT_IS_NOT_CLAIM',
  `  const paymentClaimQuestion = /^(?:هل|هو)\\s+تم\\s+التحويل(?:\\s|$)/.test(q);\n  const claimedPaid = !paymentClaimNegated && !paymentClaimQuestion\n    && /(?:^|\\s)(?:حولت|دفعت|تم\\s+التحويل|عملت\\s+تحويل|بعثت\\s+المبلغ|ارسلت\\s+المبلغ)(?:\\s|$)/.test(q);\n`,
  `  const paymentClaimQuestion = /^(?:هل|هو)\\s+تم\\s+التحويل(?:\\s|$)/.test(q);\n  // P0_20261022_HYPOTHETICAL_PAYMENT_IS_NOT_CLAIM\n  const paymentClaimHypothetical = /(?:^|\\s)(?:اذا|لو)\\s+[^\\n]{0,45}(?:حولت|دفعت|عملت\\s+تحويل)(?:\\s|$)/.test(q);\n  const claimedPaid = !paymentClaimNegated && !paymentClaimQuestion && !paymentClaimHypothetical\n    && /(?:^|\\s)(?:حولت|دفعت|تم\\s+التحويل|عملت\\s+تحويل|بعثت\\s+المبلغ|ارسلت\\s+المبلغ)(?:\\s|$)/.test(q);\n`
);

patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/paymentClosingGuard.ts',
  'P0_20261022_APPROVAL_CONTINGENCY_IS_PAYMENT_TRUST',
  `  const trustConcern = /(?:شو\\s+عرفني|شو\\s+بضمنلي|شو\\s+بدو\\s+يضمنلي|شو\\s+يضمنلي|مين\\s+بضمنلي|موثوق|موثوقه|مضمون|مضمونه|نصب|نصاب|احتيال|خايف|متخوف|اطمن|اطمئن|ثقه|ثقة|مصداقيه|مصداقية)/.test(q);\n  if (trustConcern) return "trust";\n`,
  `  const trustConcern = /(?:شو\\s+عرفني|شو\\s+بضمنلي|شو\\s+بدو\\s+يضمنلي|شو\\s+يضمنلي|مين\\s+بضمنلي|موثوق|موثوقه|مضمون|مضمونه|نصب|نصاب|احتيال|خايف|متخوف|اطمن|اطمئن|ثقه|ثقة|مصداقيه|مصداقية)/.test(q);\n  // P0_20261022_APPROVAL_CONTINGENCY_IS_PAYMENT_TRUST\n  const approvalContingency = /(?:اذا|لو).{0,35}(?:ما|لم).{0,24}(?:تمت|تتم|طلعت|صدرت).{0,24}(?:الموافقه|الموافقة)/.test(q);\n  if (trustConcern || approvalContingency) return "trust";\n`
);

patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/paymentClosingGuard.ts',
  'P0_20261022_TRUST_REPLY_INCLUDES_DESTINATIONS',
  `  return \`حقك تطمّن قبل ما تحول. المطلوب بهالمرحلة \${fee} دنانير فقط رسوم فتح الملف، مش دفعة أولى ولا قسط أول. اسم المستفيد المعتمد في بيانات التحويل الحالية هو \${beneficiary}؛ إذا ظهر اسم مختلف لا تكمل التحويل. بعد التحويل بترفع الوصل من الرابط الرسمي المرتبط بنفس طلبك حتى ينراجع الدفع، وما بنعتبر الدفع مؤكد من رسالة واتساب وحدها. الرسوم مستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية، أو إذا قررت تلغي بعد دفع مؤكد.\\n\${receipt}\`;\n`,
  `  // P0_20261022_TRUST_REPLY_INCLUDES_DESTINATIONS\n  return \`حقك تطمّن قبل ما تحول. المطلوب بهالمرحلة \${fee} دنانير فقط رسوم فتح الملف، مش دفعة أولى ولا قسط أول. الرسوم مستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية، أو إذا قررت تلغي بعد دفع مؤكد.\\n\${destinations}\\n\${receipt}\\nتأكيد الدفع النهائي يتم بعد مراجعة الوصل؛ رسالة واتساب لحالها مش تأكيد دفع إداري.\`;\n`
);

// 5) Explicit installment amount questions outrank incidental words like "ادفع"
// or a mentioned duration. This fixes known truth being present but not answered.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/singleConversationAuthority.ts',
  'P0_20261022_INSTALLMENT_AMOUNT_CURRENT_TEXT_PRIORITY',
  `function asksMonthlyInstallmentAmount(turn: InterpretedTurn) {\n  const q = n(combinedQuestion(turn));\n  const amountQuestion = /(?:كم|قديش|شو).{0,20}(?:القسط|قسط)|(?:القسط|قسطه|قسطو).{0,20}(?:كم|قديش|[0-9٠-٩]{1,4})/.test(q);\n  const methodQuestion = /(?:كيف|طريقه|طريقة|اسدد|أسدد|ادفع|أدفع|تحويل|اقتطاع|كليك|cliq|بنك|كاش|نقد)/i.test(q);\n  const durationQuestion = /(?:مده|مدة|شهر|سنه|سنة|سنتين).{0,20}(?:تقسيط|قسط)|(?:تقسيط|قسط).{0,20}(?:مده|مدة|شهر|سنه|سنة|سنتين)/.test(q);\n  return (hasTopic(turn, "installment_amount") || amountQuestion) && !methodQuestion && !durationQuestion;\n}\n`,
  `function asksMonthlyInstallmentAmount(turn: InterpretedTurn) {\n  const raw = n(turn.rawText);\n  const q = n(combinedQuestion(turn));\n  // P0_20261022_INSTALLMENT_AMOUNT_CURRENT_TEXT_PRIORITY\n  const explicitCurrentAmountQuestion = /(?:كم|قديش|شو).{0,22}(?:القسط|قسط)|(?:القسط|قسطه|قسطو).{0,22}(?:كم|قديش)|(?:على\\s*(?:12|١٢|24|٢٤|36|٣٦)\\s*شهر).{0,28}(?:كم|قديش).{0,18}(?:اول|أول)\\s+(?:دفعه|دفعة)/.test(raw);\n  const explicitMethodQuestion = /(?:كيف|وين|طريقه|طريقة).{0,18}(?:ادفع|أدفع|اسدد|أسدد|احول|أحول)/.test(raw);\n  if (explicitCurrentAmountQuestion && !explicitMethodQuestion) return true;\n  const amountQuestion = /(?:كم|قديش|شو).{0,20}(?:القسط|قسط)|(?:القسط|قسطه|قسطو).{0,20}(?:كم|قديش|[0-9٠-٩]{1,4})/.test(q);\n  const methodQuestion = /(?:كيف|طريقه|طريقة|اسدد|أسدد|ادفع|أدفع|تحويل|اقتطاع|كليك|cliq|بنك|كاش|نقد)/i.test(q);\n  const durationQuestion = /(?:مده|مدة|شهر|سنه|سنة|سنتين).{0,20}(?:تقسيط|قسط)|(?:تقسيط|قسط).{0,20}(?:مده|مدة|شهر|سنه|سنة|سنتين)/.test(q);\n  return (hasTopic(turn, "installment_amount") || amountQuestion) && !methodQuestion && !durationQuestion;\n}\n`
);

patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/singleConversationAuthority.ts',
  'P0_20261022_FIVE_WORD_FEE_NOT_MONTHLY_METHOD',
  `  const feeOnly = /(?:رسوم\\s*فتح\\s*الملف|الخمس|5\\s*دنانير|٥\\s*دنانير)/.test(q)\n`,
  `  // P0_20261022_FIVE_WORD_FEE_NOT_MONTHLY_METHOD\n  const feeOnly = /(?:رسوم\\s*فتح\\s*الملف|الخمس|خمس\\s*دنانير|5\\s*دنانير|٥\\s*دنانير)/.test(q)\n`
);

// 6) Validator must force a repair when an authoritative installment amount is
// known but an explicit amount question receives no number.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts',
  'P0_20261022_MISSING_INSTALLMENT_AMOUNT_IS_INVALID',
  `  const amounts = monthlyAmountsFromReply(input.reply);\n  if (!amounts.length) return null;\n\n  const app = input.truth.application;\n  const requestedMonths = requestedInstallmentMonths(input.customerText);\n  const authoritativeMonths = Number(app?.installmentMonths || 0) || null;\n  const authoritativeMonthly = Number(app?.monthlyPayment || 0) || null;\n`,
  `  const amounts = monthlyAmountsFromReply(input.reply);\n  const app = input.truth.application;\n  const requestedMonths = requestedInstallmentMonths(input.customerText);\n  const authoritativeMonths = Number(app?.installmentMonths || 0) || null;\n  const authoritativeMonthly = Number(app?.monthlyPayment || 0) || null;\n  // P0_20261022_MISSING_INSTALLMENT_AMOUNT_IS_INVALID\n  const current = normalizeArabic(input.customerText);\n  const explicitAmountQuestion = /(?:كم|قديش|شو).{0,22}(?:القسط|قسط)|(?:على\\s*(?:12|١٢|24|٢٤|36|٣٦)\\s*شهر).{0,28}(?:كم|قديش).{0,18}(?:اول|أول)\\s+(?:دفعه|دفعة)/.test(current);\n  if (!amounts.length) {\n    if (authoritativeMonthly && explicitAmountQuestion) return "monthly_installment_amount_missing";\n    return null;\n  }\n`
);

// 7) A future operational promise is unsupported regardless of the topic classifier.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts',
  'P0_20261022_NO_ASYNC_PROMISES',
  `  if (criticalPromiseTruth && unsupportedFutureOperationalPromise) reasons.push("unsupported_future_operational_promise");\n`,
  `  // P0_20261022_NO_ASYNC_PROMISES\n  if (unsupportedFutureOperationalPromise) reasons.push("unsupported_future_operational_promise");\n`
);

// 8) Retire the known generic fallback phrase so link/requirements questions get
// one bounded repair instead of a non-answer.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts',
  'P0_20261022_GENERIC_FALLBACK_IS_NOT_AN_ANSWER',
  `  /فهمت\\s+سؤالك\\s+الحالي[^.]{0,160}بدون\\s+تخمين/i,/الحالة\\s+اللي\\s+ظاهرة\\s+على\\s+الطلب\\s+هي\\s+اللي\\s+بعتمدها/i,\n`,
  `  /فهمت\\s+سؤالك\\s+الحالي[^.]{0,160}بدون\\s+تخمين/i,/الحالة\\s+اللي\\s+ظاهرة\\s+على\\s+الطلب\\s+هي\\s+اللي\\s+بعتمدها/i,\n  // P0_20261022_GENERIC_FALLBACK_IS_NOT_AN_ANSWER\n  /ما\\s+عندي\\s+تحديث\\s+مؤكد\\s+كافي\\s+عن\\s+هالنقطه/i,\n`
);

// 9) Current DB refund truth dominates stale cross-channel memory.
patchOnce(
  'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts',
  'P0_20261022_REFUND_TRUTH_DOMINATES_MEMORY',
  `  const truthAlreadyRefundedOrRequested = ["refund_requested", "refund_completed"].includes(authoritativeStage);\n`,
  `  const truthAlreadyRefundedOrRequested = ["refund_requested", "refund_completed"].includes(authoritativeStage);\n  // P0_20261022_REFUND_TRUTH_DOMINATES_MEMORY\n  if (!truthAlreadyRefundedOrRequested && /(?:طلب\\s+الاسترداد.{0,30}(?:مسجل|قيد\\s+المعالجه|قيد\\s+المعالجة)|الاسترداد.{0,30}(?:مسجل|قيد\\s+المعالجه|قيد\\s+المعالجة)|التحويل.{0,25}(?:لسا|لسه)\\s+ما\\s+تم)/.test(n)) reasons.push("stale_refund_claim_against_current_truth");\n  if (truthAlreadyRefundedOrRequested && /(?:للتاكيد\\s+النهائي|للتأكيد\\s+النهائي|اكتب).{0,55}(?:استرداد|استرجاع)/.test(n)) reasons.push("redundant_refund_confirmation_against_current_truth");\n`
);

console.log('P0 conversation-integrity production patch applied successfully.');
