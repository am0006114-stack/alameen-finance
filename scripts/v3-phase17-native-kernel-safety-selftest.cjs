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
const actionPlane = read(base + 'actionPlane.ts');
const continuation = read(base + 'continuationPersistence.ts');
const mutationGate = read(base + 'mutationConfirmationGate.ts');

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

// No internal technical identity should be customer-facing from the model path.
ok(kernel.includes('/\\bAI\\b/i') && kernel.includes('/ذكاء\\s*اصطناعي/i'), 'native validator blocks AI/internal identity leakage');
ok(kernel.includes('false_literal_human_handoff_claim'), 'native validator blocks fake human/handoff claims');

for (const rel of [
  base + 'humanOsControl.ts',
  base + 'nativeConversationKernel.ts',
  base + 'runtimeLive.ts',
]) ok(transpiles(rel), `${rel} transpiles clean`);

console.log(`\nPhase 17 native safety assertions: ${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
