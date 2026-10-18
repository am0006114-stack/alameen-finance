const fs = require('fs');
const path = require('path');
let ts; try { ts = require('typescript'); } catch { ts = require('/opt/hostedtoolcache/node/22.23.3/x64/lib/node_modules/typescript'); }

const root = process.argv[2] || process.cwd();
let passed = 0, failed = 0;
const ok = (condition, message) => condition
  ? (passed++, console.log(`PASS ${passed}: ${message}`))
  : (failed++, console.error(`FAIL: ${message}`));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const base = 'app/api/whatsapp/webhook/_lib/v3-os/';
const runtime = read(base + 'runtimeLive.ts');
const kernel = read(base + 'nativeConversationKernel.ts');
const control = read(base + 'humanOsControl.ts');
const interpreter = read(base + 'interpreter.ts');
const semanticAuthority = read(base + 'semanticAuthority.ts');
const actionPlane = read(base + 'actionPlane.ts');
const continuation = read(base + 'continuationPersistence.ts');
const mutationGate = read(base + 'mutationConfirmationGate.ts');
const singleAuthority = read(base + 'singleConversationAuthority.ts');

function transpiles(rel) {
  const result = ts.transpileModule(read(rel), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: rel,
  });
  const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) console.error(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('\n'));
  return errors.length === 0;
}

// Single-writer routing and bounded generation.
ok(/enabled:\s*false/.test(control), 'multi-writer HumanConversationOS is disabled for Phase 17');
ok(runtime.includes('return runLegacyV3ProductionLive(input);'), 'live wrapper falls through to native-kernel runtime');
ok(runtime.includes('nativeKernelInitial = await runNativeConversationKernel'), 'native kernel writes the normal conversational candidate');
ok(runtime.includes('replyAttempts < 2'), 'native regeneration is bounded');
ok(kernel.includes('أنت سلطة الحوار الوحيدة لهذه الرسالة'), 'native prompt declares one conversational authority');
ok(kernel.includes('جاوب كل سؤال مادي في الرسالة الحالية'), 'native prompt requires complete mixed-turn coverage');
ok(kernel.includes('لا تبدّل السؤال إلى status أقدم'), 'native prompt rejects stale-topic replacement');
ok(kernel.includes('اقرأ فقاعات واتساب كسياق واحد'), 'native prompt treats bubble sequences as one conversation');
ok(kernel.includes('عرّف باسم الموظف الحالي فقط'), 'identity stays in employee persona');
ok(kernel.includes('لا تقل صراحة إنك إنسان حقيقي'), 'persona does not make a false literal-human claim');

// Persona/staff language must not become a deterministic handoff topic that can
// invoke the canned criticalOperationalFallbackReply before the native composer.
ok(!interpreter.includes('add("request_role","human_request"'), 'deterministic interpreter no longer creates human_request handoff acts');
ok(!interpreter.includes('add("request_role","manager_request"'), 'deterministic interpreter no longer creates manager_request handoff acts');
ok(interpreter.includes('if (manager) explicitRoleRequest = "omran"'), 'manager language selects Omran as persona instead of a synthetic handoff');
ok(semanticAuthority.includes('phase17_conversation_role_routing_owned_by_native_composer'), 'model-emitted generic staff/manager routing is stripped before deterministic preservation');
ok(semanticAuthority.includes('roleOnlyTopics = new Set(["human_request", "manager_request"])'), 'semantic authority isolates generic human/manager routing topics from action authority');

// Truth/action safety remains deterministic even after the conversational cutover.
ok(runtime.includes('enforceMutationConfirmationGate'), 'mutation confirmation gate remains in native runtime');
ok(runtime.includes('executeActions'), 'transactional action execution remains in native runtime');
ok(runtime.includes('persistExplicitContinuation'), 'commercial continuation persistence remains in native runtime');
ok(runtime.includes('customer_continue_payment_ready'), 'continuation still emits the payment-ready operational event');
ok(runtime.includes('buildInformedCommercialDisclosureReply'), 'protected informed disclosure remains available');
ok(runtime.includes('buildMandatoryFiveJodContinuationReply'), 'protected 5-JOD payment step remains available');
ok(kernel.includes('PROTECTED_5_JOD_JOURNEY'), 'native writer prompt preserves the protected 5-JOD journey');
ok(kernel.includes('لا ترسل بيانات Orange Money/CliQ أو رابط الوصل قبل informed continuation المسموح'), 'payment destinations stay hidden before informed continuation');
ok(kernel.includes('containsRestrictedPaymentExecutionDetail'), 'native validator checks restricted payment execution details');
ok(kernel.includes('false_cancel_completion_claim'), 'native validator blocks false cancellation completion');
ok(kernel.includes('false_refund_completion_claim'), 'native validator blocks false refund completion');
ok(kernel.includes('false_payment_confirmation_claim'), 'native validator blocks false payment confirmation');
ok(actionPlane.includes('executeActions'), 'action plane still exposes deterministic action execution');
ok(continuation.includes('persistExplicitContinuation'), 'continuation persistence implementation remains present');
ok(mutationGate.includes('enforceMutationConfirmationGate'), 'mutation confirmation implementation remains present');

// Phase 18.6: a generative/model act is never sufficient mutation authority.
ok(mutationGate.includes('mutationActionCorroboratedByCurrentTurn'), 'mutation gate corroborates every planned real mutation against the current customer turn');
ok(mutationGate.includes('const corroboratedInputActions = input.actions.filter'), 'uncorroborated model/planner mutations are removed before confirmation planning');
ok(!mutationGate.includes('semanticMutationRequest(action.action, input.turn)'), 'semantic/model mutation requests cannot directly authorize a real mutation');
ok(!mutationGate.includes('semanticMutationRequest(action, input.turn)'), 'fallback mutation scan is deterministic-current-turn only');
ok(mutationGate.includes('A bare "نعم" is not'), 'reopen reversal no longer accepts a bare affirmative');
ok(mutationGate.includes('pending === "reopen_application"') && mutationGate.includes('explicitMutationRequest("cancel_application"'), 'explicit cancel/refund clears stale pending reopen authority');
ok(actionPlane.includes('currentTurnMutationAuthorityBlocker'), 'action plane has a final current-turn mutation authority boundary');
ok(actionPlane.includes('current_turn_explicit_action_name_required'), 'real reversal execution requires the current turn to name the action');
ok(actionPlane.includes('conflicting_current_turn_mutation_directions'), 'opposite mutation directions are blocked at the execution boundary');

// Phase 18.6: common live questions use grounded business/application truth instead of internal fallback prose.
ok(singleAuthority.includes('| "application_status"'), 'single authority has application status truth coverage');
ok(singleAuthority.includes('| "review_timing"'), 'single authority has review timing truth coverage');
ok(singleAuthority.includes('| "monthly_installment_amount"'), 'single authority has monthly installment amount truth coverage');
ok(singleAuthority.includes('| "application_change_status"'), 'single authority can cover status + modification questions in one plan');
ok(singleAuthority.includes('المعدل الطبيعي للمراجعة من يومين إلى 3 أيام تشغيلية'), 'review timing uses the approved 2-3 operating day baseline with caveat');
ok(singleAuthority.includes('monthlyPayment'), 'installment amount comes from authoritative application truth');
ok(!singleAuthority.includes('المعلومة المحددة اللازمة للجواب مش موجودة عندي ضمن الحقيقة الموثقة الحالية'), 'internal grounded-unknown wording is retired from customer output');

// No internal technical identity should be customer-facing from the model path.
ok(kernel.includes('/\\bAI\\b/i') && kernel.includes('/ذكاء\\s*اصطناعي/i'), 'native validator blocks AI/internal identity leakage');
ok(kernel.includes('false_literal_human_handoff_claim'), 'native validator blocks fake human/handoff claims');

for (const rel of [
  base + 'humanOsControl.ts',
  base + 'interpreter.ts',
  base + 'semanticAuthority.ts',
  base + 'nativeConversationKernel.ts',
  base + 'mutationConfirmationGate.ts',
  base + 'actionPlane.ts',
  base + 'singleConversationAuthority.ts',
  base + 'runtimeLive.ts',
]) ok(transpiles(rel), `${rel} transpiles clean`);

console.log(`\nPhase 17/18.6 native safety assertions: ${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);