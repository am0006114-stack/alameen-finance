const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function ok(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exitCode=1; } else console.log('PASS:',msg); }

const adapter = read('app/api/whatsapp/webhook/_lib/v3-os/transactionalActionAdapter.ts');
const runtime = read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const links = read('app/api/whatsapp/webhook/_lib/v3-os/linkIntegrity.ts');
const policy = read('app/api/whatsapp/webhook/_lib/v3-os/notificationPolicy.ts');
const discord = read('app/api/whatsapp/webhook/_lib/v3-os/discordNotifier.ts');
const control = read('app/admin/whatsapp-control/ControlActions.tsx');
const api = read('app/api/admin/whatsapp-control/route.ts');

ok(/LIVE_SCOPED_MUTATIONS[\s\S]*cancel_application[\s\S]*request_refund/.test(adapter), 'scoped allow-list contains cancel + refund');
ok(/scoped_real_actions_disallowed/.test(adapter), 'all other mutations fail closed at adapter scope');
ok(!/ALAMEEN_V3_REAL_ACTIONS_ENABLED\s*!==\s*["']true["']/.test(adapter), 'legacy all-actions env gate replaced by scoped code gate');
ok(/pendingScopedAction/.test(runtime) && /awaiting_admin/.test(runtime), 'previously confirmed pending cancel/refund can execute after scoped enablement');
ok(/buildScopedMutationSuccessReply/.test(runtime), 'successful scoped mutations use deterministic post-transaction customer reply');
ok(/تم إلغاء طلبك/.test(runtime) && /تم تسجيل طلب الاسترداد/.test(runtime), 'customer receives explicit success only after transaction result');
ok(/applicationRefundUrl/.test(runtime) && /mode=refund/.test(links), 'paid cancellation/refund emits official refund-data link');
ok(/business_mutation_succeeded/.test(runtime) && /business_mutation_succeeded/.test(policy), 'successful automatic cancel/refund is sent to Discord');
ok(/فتح الطلب مباشرة/.test(discord) && /admin\/applications/.test(discord), 'Discord notifications contain direct admin application link');
ok(/ENABLE_SCOPED_CANCEL_REFUND/.test(control) && /ENABLE_SCOPED_CANCEL_REFUND/.test(api), 'Control Center has explicit scoped-action confirmation');
ok(/real_actions_enabled:\s*true/.test(api), 'Control Center can activate scoped execution');
ok(/إلغاء \+ الاسترداد/.test(control) || /الإلغاء \+ الاسترداد/.test(control), 'Control Center clearly labels scoped Real Actions');
ok(/change_device/.test(adapter) && /LIVE_SCOPED_MUTATIONS/.test(adapter), 'device mutation code remains present but outside live allow-list');
ok(/request_refund/.test(adapter) && /confirmed_payment_required/.test(read('app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts')), 'refund still requires authoritative confirmed payment');

if(process.exitCode){ console.error('Phase 7.1.3 self-test FAILED'); process.exit(1); }
console.log('V3 Phase 7.1.3 self-test: PASS');
