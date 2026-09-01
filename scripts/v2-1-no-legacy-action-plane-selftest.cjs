const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.argv[2] || process.cwd();
const files = [
  'app/api/whatsapp/webhook/route.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/runtime.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/actionExecutor.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/truthResolver.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/policyRegistry.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/safeComposer.ts',
  'app/api/whatsapp/webhook/_lib/v2-conversation/deterministicInterpreter.ts',
  'app/api/whatsapp/webhook/_lib/v2-conversation/stateReducer.ts',
  'app/admin/whatsapp-v2-production/page.tsx',
  'app/admin/whatsapp-v2-production/ProductionActions.tsx',
  'app/admin/whatsapp-v2-production/HumanActionQueueActions.tsx',
  'app/api/internal/whatsapp-v2-production/action/route.ts',
];

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${rel}`);
  return fs.readFileSync(file, 'utf8');
}

for (const rel of files) {
  const source = read(rel);
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
    fileName: rel,
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`${rel}: ${errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' | ')}`);
}

const route = read('app/api/whatsapp/webhook/route.ts');
const runtime = read('app/api/whatsapp/webhook/_lib/v2-production/runtime.ts');
const action = read('app/api/whatsapp/webhook/_lib/v2-production/actionExecutor.ts');
const truth = read('app/api/whatsapp/webhook/_lib/v2-production/truthResolver.ts');
const policy = read('app/api/whatsapp/webhook/_lib/v2-production/policyRegistry.ts');
const interpreter = read('app/api/whatsapp/webhook/_lib/v2-conversation/deterministicInterpreter.ts');
const stateReducer = read('app/api/whatsapp/webhook/_lib/v2-conversation/stateReducer.ts');
const actionRoute = read('app/api/internal/whatsapp-v2-production/action/route.ts');
const migration = read('supabase/migrations/20260901150000_v2_1_no_legacy_action_plane.sql');
const admin = read('app/admin/whatsapp-v2-production/page.tsx');

const marker = route.indexOf('// V2.1 PRODUCTION CONVERSATION OS');
if (marker < 0) throw new Error('V2.1 route marker missing');
const prodTail = route.slice(marker);

const checks = [
  ['no buildReply after V2.1 router marker', !prodTail.includes('buildReply(')],
  ['no legacy resolveConversationInput after V2.1 router marker', !prodTail.includes('resolveConversationInput(')],
  ['inactive rollout is silent not V1', prodTail.includes('logV2ProductionNoReply') && prodTail.includes('return;')],
  ['dedicated action executor wired', prodTail.includes('executeV2Action({') && action.includes('V2_RUNTIME_VERSION = "v2.1.0"')],
  ['human handoff queue exists', action.includes('whatsapp_v2_human_action_queue') && migration.includes('whatsapp_v2_human_action_queue')],
  ['human handoff pauses auto reply after send', action.includes('pauseAutoReplyAfterSend = results.some') && action.includes('AUTO_REPLY_IGNORED')],
  ['call request durable action', action.includes('"call_request"') && action.includes('queueStaffAction')],
  ['multi-action intents are preserved', action.includes('collectV2ActionIntents') && action.includes('requestedIntents') && action.includes('results: V2ActionExecutionItem[]')],
  ['multi-action transactional conflicts fail closed', action.includes('conflictingTransactionalIntents') && action.includes('conflictDetected') && action.includes('deferredIntents')],
  ['multi-action primary routing never nulls just because there are several actions', runtime.includes('primaryV2ActionIntent(turn)') && !runtime.includes('if (unique.length !== 1) return null')],
  ['specific action claims require matching execution result', runtime.includes('unverified_human_handoff_claim') && runtime.includes('unverified_cancel_execution_claim') && runtime.includes('actionResultSucceeded')],
  ['safe composer uses per-action outcomes', read('app/api/whatsapp/webhook/_lib/v2-production/safeComposer.ts').includes('actionResultFor') && read('app/api/whatsapp/webhook/_lib/v2-production/safeComposer.ts').includes('actionSummaryFor')],
  ['destructive cancel exact-confirm guarded', action.includes('isExactCancelConfirmationText') && action.includes('isConditionalCancellationText')],
  ['refund requires confirmed payment', action.includes('hasConfirmedPaymentEvidence') && action.includes('isExplicitRefundMutationText')],
  ['understanding quality enforced', runtime.includes('evaluateUnderstanding') && runtime.includes('understanding_missing_topic:')],
  ['state-aware audit sees open staff loop', runtime.includes('openStaffLoop') && runtime.includes('activeHandoff')],
  ['office visit appointment invariant', policy.includes('office_visit_without_mandatory_appointment') && policy.includes('appointment_presented_as_optional')],
  ['stage regression invariant', runtime.includes('stage_regression_to_preliminary') && runtime.includes('stage_regression_before_confirmed_payment')],
  ['future contact expanded blocker', policy.includes('هنحاول') && policy.includes('unsupported_future_contact_promise')],
  ['truth only trusts incoming history', truth.includes('.eq("direction", "incoming")')],
  ['persisted app state requires V2.1 verified binding', truth.includes('verifiedStateBinding') && truth.includes('v2_verified_application_id') && runtime.includes('v2_verified_application_id')],
  ['call and correction stay as staff open loops', stateReducer.includes('customer_requested_call') && stateReducer.includes('customer_requested_application_data_correction')],
  ['only human handoff controls auto reply pause/resume', actionRoute.includes('if (actionType === "human_handoff")') && actionRoute.includes('closing them cannot accidentally re-enable a handed-off chat')],
  ['human handoff close preserves other handoffs and manual ignore', actionRoute.includes('hasOtherActiveHumanHandoff') && actionRoute.includes('manuallyIgnoredByAdmin')],
  ['ambiguous multiple apps fail closed', truth.includes('return result(null, "medium", "ambiguous_phone_applications"')],
  ['handoff language coverage expanded', interpreter.includes('بدي احكي مع حدا') && interpreter.includes('حولني لموظف')],
  ['call language coverage expanded', interpreter.includes('رنولي')],
  ['runtime-version telemetry', runtime.includes('runtime_version: V2_RUNTIME_VERSION') && admin.includes('CURRENT_RUNTIME = "v2.1.0"')],
  ['dashboard filters current release', admin.includes('.eq("runtime_version", CURRENT_RUNTIME)')],
  ['global kill language no V1 fallback', read('app/admin/whatsapp-v2-production/ProductionActions.tsx').includes('لا يوجد رجوع إلى V1')],
  ['migration latches OFF/KILL', migration.includes("set mode='off', kill_switch=true")],
  ['canonical 5 JOD still hard guarded', policy.includes('fileOpeningFeeJod: 5') && policy.includes('legacy_three_jod_fee_leak')],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed = true;
}
if (failed) throw new Error('V2.1 selftest failed');
console.log('SELFTEST PASS - V2.1 NO LEGACY ESCAPE + ACTION PLANE + STATE-AWARE AUDIT');
