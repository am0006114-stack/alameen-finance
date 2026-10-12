const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log(`PASS ${passed}: ${msg}`); }
  else { failed++; console.error(`FAIL: ${msg}`); }
}

const base = 'app/api/whatsapp/webhook/_lib/v3-os/';
const runtime = read(base + 'runtimeLive.ts');
const kernel = read(base + 'nativeConversationKernel.ts');
const verifier = read(base + 'semanticReplyVerifier.ts');
const types = read(base + 'types.ts');
const corpus = JSON.parse(read('scripts/v3-phase17-golden-conversation-corpus.json'));

ok(types.includes('paymentIntent?: "execute_now" | "access_problem" | "method_question" | "status_or_proof" | "none"'), 'semantic frame exposes backward-compatible explicit payment intent');
ok(kernel.includes('"paymentIntent":"execute_now|access_problem|method_question|status_or_proof|none"'), 'writer must classify payment intent');
ok(kernel.includes('paymentIntent=access_problem'), 'writer distinguishes payment access problem from execution');
ok(kernel.includes('answerObligations لازم تحتوي بندًا مستقلًا لكل سؤال/طلب/اعتراض'), 'writer enumerates every material obligation');

ok(!runtime.includes('if (paymentPriorityAfterDisclosure && isContinuationRevenueReady'), 'legacy revenue fast path cannot bypass Native Kernel');
ok(runtime.includes('PHASE 17.1 TRUE SINGLE WRITER: legacy payment priority is telemetry/context only'), 'payment priority is explicitly signal-only');
ok(runtime.includes('legacyPaymentPrioritySignal: paymentPriorityAfterDisclosure'), 'legacy payment priority is passed only as model context/telemetry');
ok(runtime.includes('const paymentAccessProblemThisTurn = paymentIntentThisTurn === "access_problem"'), 'runtime knows access problem structurally');
ok(runtime.includes('const paymentExecutionIntentThisTurn = paymentIntentThisTurn === "execute_now"'), 'runtime separates execution from access problem');
ok(runtime.includes('const protectedFiveJodStep = continuationRevenueReadyAtDecision\n    && !paymentAccessProblemThisTurn'), 'access problem cannot trigger protected payment template semantics');

const rawContinuation = runtime.match(/const rawContinuationIntent =[\s\S]*?const disclosureRequiredThisTurn/);
ok(Boolean(rawContinuation), 'raw continuation block located');
ok(Boolean(rawContinuation && !rawContinuation[0].includes('directPaymentContinuationIntent')), 'legacy payment keyword detector cannot decide continuation');
ok(Boolean(rawContinuation && !rawContinuation[0].includes('paymentPriorityAfterDisclosure')), 'legacy payment priority cannot decide continuation');
ok(Boolean(rawContinuation && rawContinuation[0].includes('paymentExecutionIntentThisTurn')), 'structured model payment execution intent may participate in continuation');

ok(runtime.includes('semanticCheck = await verifySemanticReply'), 'semantic coverage verifier is wired into live egress');
ok(runtime.includes('SEMANTIC_MISSING_OBLIGATIONS='), 'missing material obligations trigger writer recomposition');
ok(runtime.includes('replyAttempts < 3'), 'bounded semantic recomposition exists');
ok(runtime.includes('const mixedMaterialTurn = (turn.semantic?.answerObligations.length || 0) > 1 || materialQuestionMarks > 1'), 'mixed material turns are explicitly protected');
ok(runtime.includes('if (!mixedMaterialTurn && !reply && protectedFiveJodStep)'), 'deterministic payment emergency cannot replace a mixed-turn reply');
ok(runtime.includes('writer: criticalOperationalReply ? "critical_truth_action" : fallbackUsed ? "transparent_failure_fallback" : "native_kernel"'), 'reply provenance records the actual writer');
ok(runtime.includes('console.info("V3_REPLY_PROVENANCE"'), 'reply provenance is emitted for runtime traceability');

const liveEgress = runtime.split('PHASE 17.1 TRUE SINGLE WRITER + SEMANTIC COVERAGE:')[1] || '';
ok(!liveEgress.includes('reply = buildV3LastResortReply('), 'old generic last-resort bot writer is not used in Phase 17.1 live egress');
ok(!runtime.includes('if (turn.explicitRoleRequest === "staff" || turn.explicitRoleRequest === "manager"'), 'staff/manager request cannot trigger deterministic canned reply');

ok(verifier.includes('لا تثق أنها كاملة: اقرأ CUSTOMER بنفسك'), 'semantic judge independently derives obligations from customer message');
ok(verifier.includes('رد عام من نوع «اكتب المطلوب/حدد سؤالك/احكيلي شو بدك»'), 'semantic judge rejects rephrased generic clarification for a clear question');
ok(verifier.includes('مجرد إعادة نفس بيانات CliQ/المحفظة لا يحل access problem'), 'semantic judge rejects payment-template repetition for unavailable rails');

const mixed = corpus.cases.find((x) => x.id === 'payment_access_plus_identity_covers_both');
ok(Boolean(mixed), 'production mixed payment+identity failure remains in golden corpus');
ok(Boolean(mixed && mixed.mustCover.includes('payment access problem') && mixed.mustCover.includes('current employee persona name')), 'golden mixed turn requires both payment access and employee identity');

console.log(`\nPhase 17.1 assertions: ${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
