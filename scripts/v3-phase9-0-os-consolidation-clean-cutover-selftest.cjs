const fs=require('fs'); const path=require('path'); const vm=require('vm'); const ts=require('typescript');
const root=process.argv[2]||process.cwd();
let pass=0,fail=0;
function ok(name,cond){ if(cond){console.log('PASS:',name);pass++;} else {console.log('FAIL:',name);fail++;} }
function text(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
function transpile(rel,moduleKind=ts.ModuleKind.ESNext,jsx=ts.JsxEmit.Preserve){const f=path.join(root,rel); const out=ts.transpileModule(text(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:moduleKind,jsx,esModuleInterop:true},reportDiagnostics:true,fileName:f}); return (out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);}
const files=[
'app/api/whatsapp/webhook/route.ts',
'app/api/whatsapp/webhook/_lib/conversationMemory.ts',
'app/api/whatsapp/webhook/_lib/v3-os/policy.ts',
'app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts',
'app/api/whatsapp/webhook/_lib/v3-os/canonicalTruthManifest.ts',
'app/api/whatsapp/webhook/_lib/v3-os/productionControl.ts',
'app/api/whatsapp/webhook/_lib/v3-os/operationsAutopilot.ts',
'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts',
'app/api/whatsapp/webhook/_lib/v3-os/types.ts',
'app/api/admin/whatsapp-control/route.ts',
'app/api/admin/whatsapp-control/recover/route.ts',
'app/api/admin/whatsapp/ignore/route.ts',
'app/admin/whatsapp/page.tsx',
'app/admin/whatsapp-control/ControlActions.tsx',
'app/admin/whatsapp-control/page.tsx',
'app/api/cron/preliminary-approval/route.ts',
];
for(const f of files) ok(`transpile ${f}`,transpile(f).length===0);
const types=text('app/api/whatsapp/webhook/_lib/v3-os/types.ts');
const policy=text('app/api/whatsapp/webhook/_lib/v3-os/policy.ts');
const business=text('app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts');
const manifest=text('app/api/whatsapp/webhook/_lib/v3-os/canonicalTruthManifest.ts');
const kernel=text('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');
const control=text('app/api/whatsapp/webhook/_lib/v3-os/productionControl.ts');
const route=text('app/api/whatsapp/webhook/route.ts');
const mem=text('app/api/whatsapp/webhook/_lib/conversationMemory.ts');
const ops=text('app/api/whatsapp/webhook/_lib/v3-os/operationsAutopilot.ts');
const adminControl=text('app/api/admin/whatsapp-control/route.ts');
const recover=text('app/api/admin/whatsapp-control/recover/route.ts');
const ignore=text('app/api/admin/whatsapp/ignore/route.ts');
const waPage=text('app/admin/whatsapp/page.tsx');
const ccPage=text('app/admin/whatsapp-control/page.tsx');
const ccActions=text('app/admin/whatsapp-control/ControlActions.tsx');
const cron=text('app/api/cron/preliminary-approval/route.ts');
ok('runtime version is Phase 9 single source',types.includes('v3.0.0-phase9.0-os-consolidation-clean-cutover'));
ok('canonical manifest exists',manifest.includes('canonicalBusinessTruthForPrompt'));
ok('canonical manifest includes down payment truth',manifest.includes('ALAMEEN_DOWN_PAYMENT_RULE'));
ok('canonical manifest preserves first-installment rule',manifest.includes('ALAMEEN_FIRST_INSTALLMENT_RULE'));
ok('first installment remains one month after receipt/signing',business.includes('القسط الأول يستحق بعد شهر من تاريخ توقيع العقد'));
ok('canonical manifest includes payment destination truth',manifest.includes('fileOpeningPaymentWriterTruth'));
ok('kernel receives one canonical business manifest',kernel.includes('business: canonicalBusinessTruthForPrompt()'));
ok('kernel no longer serializes raw policy into model truth',!kernel.includes('policy: input.truth.policy'));
ok('kernel payment prompt references canonical truth instead of hardcoded aliases',kernel.includes('TRUTH.business.payment.destination'));
ok('kernel down-payment prompt references canonical truth',kernel.includes('TRUTH.business.installments.downPaymentRule'));
ok('policy does not claim no down payment',!policy.includes('لا توجد دفعة أولى على الجهاز'));
ok('policy derives down-payment rule from canonical business truth',policy.includes('ALAMEEN_DOWN_PAYMENT_RULE'));
ok('policy derives payment destinations from canonical payment module',policy.includes('currentFileOpeningPaymentRule()'));
ok('valid PAYAMEEEN is not a forbidden claim',!policy.match(/forbiddenClaims:[\s\S]*?"PAYAMEEEN"/));
ok('business truth states Friday and Saturday office holiday',business.includes('الجمعة والسبت عطلة تشغيلية للمكتب'));
ok('production control safe default keeps Conversation OS live',/SAFE_DEFAULT[\s\S]*liveEnabled:\s*true[\s\S]*realActionsEnabled:\s*false/.test(control));
ok('circuit breaker disables mutations without V1 demotion',/tripV3ProductionCircuitBreaker[\s\S]*live_enabled:\s*true[\s\S]*kill_switch:\s*false[\s\S]*real_actions_enabled:\s*false/.test(control));
ok('webhook Conversation OS is unconditional for normal turns',route.includes('const v3ConversationOsActive = true as const'));
ok('one normal Native runtime call remains in webhook', (route.match(/runV3ProductionLive\(/g)||[]).length===1);
ok('canonical non-leader waits for durable leader delivery',route.includes('waitForDurableBurstDelivery') && route.includes('V3_RETRYABLE_NONLEADER_AWAITING_DELIVERY'));
ok('superseded leader waits for durable newer-leader delivery',route.includes('settleSupersededIncomingOrRetry'));
ok('real actions remain gated by live control',route.includes('const v3RealActionsEnabled = v3LiveActive && v3ProductionControl.realActionsEnabled'));
ok('V3 runtime receives gated real action flag',route.includes('realActionsEnabled: v3RealActionsEnabled'));
ok('degraded liveness reply persists conversation state',route.includes('degradedStateAfter = {') && route.includes('const stateToPersist = v3Run?.stateAfter || degradedStateAfter'));
ok('state persistence failure keeps inbound retryable',route.includes('V3_RETRYABLE_STATE_PERSISTENCE_FAILURE'));
ok('retry repairs state without sending duplicate reply',route.includes('retryStateToPersist') && route.includes('alreadyDeliveredForIncoming'));
ok('transcript filters admin control rows',mem.includes('type === "admin_control"'));
ok('transcript filters synthetic template events',mem.includes('type === "template_event"'));
ok('preliminary template is logged as template_event',cron.includes('message_type: "template_event"'));
ok('recovery endpoint is diagnostic only',recover.includes('diagnosticOnly: true'));
ok('recovery endpoint has no Meta sender',!recover.includes('graph.facebook.com') && !recover.includes('sendWhatsAppText') && !recover.includes('runV3ProductionLive'));
ok('recovery diagnostic reads semantic conversation state',recover.includes('whatsapp_v3_conversation_state') && recover.includes('openLoops'));
ok('ambiguous short confirmations are not hard social closures',!ops.match(/\(\?:[^\n]*تمام[^\n]*تم[^\n]*ماشي[^\n]*خلص/));
ok('legacy ignore endpoint retired',ignore.includes('status: 410') && ignore.includes('تم إلغاء تحكم تجاهل العميل'));
ok('WhatsApp admin UI no longer imports IgnoreCustomerButton',!waPage.includes('IgnoreCustomerButton'));
ok('control API uses current runtime version',adminControl.includes('V3_OS_VERSION') && !adminControl.includes('phase8.5'));
ok('enable replies does not silently disable real actions',!/action === "enable_replies"[\s\S]{0,260}real_actions_enabled:\s*false/.test(adminControl));
ok('enable real actions no longer toggles reply mode',/action === "enable_real_actions"[\s\S]{0,360}Object\.assign\(patch, \{ real_actions_enabled: true \}\)/.test(adminControl));
ok('Control Center labels Recovery as diagnostics only',ccActions.includes('Unresolved Diagnostics — تشخيص فقط'));
ok('Control Center reads semantic open loops',ccPage.includes('semanticOpen') && ccPage.includes('openLoops'));
ok('Control Center shows actual source runtime version',ccPage.includes('{V3_OS_VERSION}'));

// Execute operationsAutopilot to prove ambiguous confirmations are not discarded.
const compiled=ts.transpileModule(ops,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},fileName:'operationsAutopilot.ts'}).outputText;
const sandbox={module:{exports:{}},exports:{},require,console}; sandbox.exports=sandbox.module.exports; vm.runInNewContext(compiled,sandbox,{filename:'operationsAutopilot.js'}); const api=sandbox.module.exports;
for(const phrase of ['تم','تمام','ماشي','خلص']) ok(`ambiguous confirmation remains recoverable context candidate: ${phrase}`,api.isSocialClosureCustomerText(phrase,'text')===false);
ok('pure reaction still closes socially',api.isSocialClosureCustomerText('👍','reaction')===true);
ok('payment priority still detects direct payment ask',api.isPaymentPriorityCustomerText('وين احول كليك','payment_method')===true);
ok('payment refusal still not payment priority',api.isPaymentPriorityCustomerText('ما بدي ادفع','payment_method')===false);

const runtime=text('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
ok('8.6 critical deterministic authority preserved',runtime.includes('preserveCriticalDeterministicAuthority'));
for(const a of ['cancel_application','request_refund','stop_refund','reopen_application','change_device','change_application_data']) ok(`critical action preserved: ${a}`,runtime.includes(`"${a}"`));
ok('8.6 dead-end incomplete-details fallback remains removed',!runtime.includes('تفاصيل الطلب مش كاملة عندي بهاللحظة، وما بدي أخمّن'));
ok('8.6 critical operational reply still owns egress',runtime.includes('criticalOperationalReply || nativeKernelInitial.reply'));
ok('kernel still blocks fake direct file ownership',kernel.includes('false_literal_human_handoff_claim'));
ok('kernel still blocks unsupported appointment offer',kernel.includes('unsupported_appointment_offer'));
ok('kernel still blocks unsupported social proof',kernel.includes('unsupported_social_proof'));

console.log(`Phase 9.0 assertions: ${pass+fail}; passed=${pass}; failed=${fail}`); process.exit(fail?1:0);
