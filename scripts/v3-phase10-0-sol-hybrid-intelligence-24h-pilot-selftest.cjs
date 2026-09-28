const fs = require('fs');
const path = require('path');
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const checks = [];
function ok(name, cond){ if(!cond) throw new Error(`FAIL: ${name}`); checks.push(name); }

const router = read('app/api/whatsapp/webhook/_lib/v3-os/semanticComplexityRouter.ts');
const sol = read('app/api/whatsapp/webhook/_lib/v3-os/solHybridRuntime.ts');
const runtime = read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const admin = read('app/api/admin/whatsapp-control/route.ts');
const ui = read('app/admin/whatsapp-control/ControlActions.tsx');
const page = read('app/admin/whatsapp-control/page.tsx');
const types = read('app/api/whatsapp/webhook/_lib/v3-os/types.ts');

ok('phase10 version stamp', types.includes('phase10.0-sol-hybrid-intelligence-24h-pilot'));
ok('router has Sol threshold', /score\s*>=\s*5\s*\?\s*"sol"/.test(router));
ok('payment explicitly protected from Sol', router.includes('payment_method') && router.includes('explicit_operational_fast_path'));
ok('core autonomous actions protected from Sol', ['cancel_application','request_refund','stop_refund','reopen_application','link_whatsapp_alias'].every(x=>router.includes(x)));
ok('manual device/data paths not forced to Sol', router.includes('change_device') && router.includes('change_application_data'));
ok('repair/failure signal can escalate', router.includes('customer_repair_signal') && router.includes('previous_answer_failed_customer'));
ok('long/multi-intent reasoning can escalate', router.includes('long_customer_story') && router.includes('multiple_requested_actions'));
ok('Sol uses GPT-5.6 Sol', sol.includes('gpt-5.6-sol'));
ok('Sol uses Responses API', sol.includes('/v1/responses'));
ok('Sol uses medium reasoning only on routed complex turns', sol.includes('reasoning: { effort: "medium" }'));
ok('prompt caching key enabled with Responses API compatible parameters', sol.includes('prompt_cache_key') && !sol.includes('prompt_cache_options'));
ok('GPT-5.6 Sol request omits unsupported temperature', !/temperature\s*:/.test(sol));
ok('pilot is 24h', sol.includes('SOL_HYBRID_DEFAULT_HOURS = 24'));
ok('pilot default cap is $5', sol.includes('SOL_HYBRID_DEFAULT_BUDGET_USD = 5'));
ok('hard reserve cap per Sol call', sol.includes('SOL_CALL_RESERVE_USD = 0.05'));
ok('Sol usage stored in existing ai usage table', sol.includes('whatsapp_v3_ai_usage'));
ok('no SQL/schema requirement in Phase10 module', !sol.match(/alter\s+table|create\s+table/i));
ok('runtime defaults to Phase9.1 DeepSeek provider', runtime.includes('v3WriterProviderFromEnv()'));
ok('runtime only switches provider on Sol route', runtime.includes('solHybridControl.active && hybridDecision.route === "sol"'));
ok('runtime fail-open returns to Phase9.1 provider', runtime.includes('using Phase 9.1 provider'));
ok('individual Sol call falls back to Phase9.1 DeepSeek', runtime.includes('falling back to Phase 9.1 DeepSeek') && runtime.includes('phase91KernelProvider.generate(req)'));
ok('payment priority deterministic path preserved', runtime.includes('paymentPriorityAfterDisclosure') && runtime.includes('buildMandatoryFiveJodContinuationReply'));
ok('admin can start pilot', admin.includes('start_sol_hybrid_pilot') && admin.includes('START_SOL_HYBRID_24H'));
ok('admin can stop pilot immediately', admin.includes('stop_sol_hybrid_pilot') && admin.includes('stopSolHybridPilot'));
ok('control UI exposes immediate rollback', ui.includes('رجوع فوري إلى Phase 9.1 / DeepSeek'));
ok('control UI shows spend telemetry', ui.includes('Estimated spend') && ui.includes('solHybridEstimatedCostUsd'));
ok('control page reads live Sol metrics', page.includes('getSolHybridMetrics'));

console.log(`PASS ${checks.length}/${checks.length} - V3 Phase 10.0 Sol Hybrid Intelligence 24h Pilot`);
for (const c of checks) console.log(`  ✓ ${c}`);
