const fs=require('fs'); const path=require('path'); const vm=require('vm'); const ts=require('typescript');
const root=process.argv[2]||'/mnt/data/alameen_current_85';
const runtime=path.join(root,'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const kernel=path.join(root,'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');
const ops=path.join(root,'app/api/whatsapp/webhook/_lib/v3-os/operationsAutopilot.ts');
let pass=0,fail=0;
function ok(name,cond){ if(cond){console.log('PASS:',name);pass++;}else{console.log('FAIL:',name);fail++;} }
function text(f){return fs.readFileSync(f,'utf8')}
function transpile(f,moduleKind=ts.ModuleKind.ESNext){const out=ts.transpileModule(text(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:moduleKind,esModuleInterop:true},reportDiagnostics:true,fileName:f}); const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); return {out:out.outputText,errors};}
const r=text(runtime), k=text(kernel), o=text(ops);
ok('runtime transpiles',transpile(runtime).errors.length===0);
ok('kernel transpiles',transpile(kernel).errors.length===0);
ok('operations autopilot transpiles',transpile(ops).errors.length===0);
ok('old dead-end generic fallback removed from V3 runtime',!r.includes('تفاصيل الطلب مش كاملة عندي بهاللحظة، وما بدي أخمّن'));
ok('critical deterministic authority helper exists',r.includes('preserveCriticalDeterministicAuthority'));
ok('optional DialogueAct.action is narrowed before Set<ActionKey>.has',r.includes('(act.action !== undefined && CRITICAL_DETERMINISTIC_ACTIONS.has(act.action))') && r.includes('(action): action is ActionKey => action !== undefined && action !== "none"'));
for(const a of ['cancel_application','request_refund','stop_refund','reopen_application','change_device','change_application_data']) ok(`critical anchor preserves ${a}`,r.includes(`"${a}"`));
ok('critical authority is re-applied after native interpretation',/turn = preserveCriticalDeterministicAuthority\(turn, deterministicAnchor\);/.test(r));
ok('critical operational reply owns egress before model draft',r.includes('criticalOperationalReply || nativeKernelInitial.reply'));
ok('critical operational reply blocks model refresh',r.includes('&& !criticalOperationalReply)'));
ok('fallback receives final turn and action results',/customerText: effectiveCustomerText,\s*turn,\s*actions,/m.test(r));
ok('stop-refund no longer loops endlessly on generic fallback',r.includes('ما رح أطلب منك تعيد نفس التأكيد كل مرة'));
ok('combined cancel+refund confirmation is explicit',r.includes('ألغي الطلب الحالي وأطلب استرداد الرسوم'));
ok('paid/unpaid modification routing remains deterministic',r.includes('buildApplicationModificationRoutingReply'));
ok('kernel forbids generic incomplete-details fallback',k.includes('تفاصيل\\s+الطلب\\s+مش\\s+كاملة'));
ok('kernel forbids fake direct file ownership',k.includes('false_literal_human_handoff_claim') && k.includes('متابع\\s+طلبك'));
ok('kernel forbids proactive appointment offer',k.includes('unsupported_appointment_offer'));
ok('kernel forbids unsupported customer social proof',k.includes('unsupported_social_proof'));
ok('kernel protects Fri+Sat office truth',k.includes('الجمعة والسبت عطلة تشغيلية للمكتب') && k.includes('unsupported_office_hours_or_saturday_open_claim'));
const compiled=transpile(ops,ts.ModuleKind.CommonJS); const sandbox={module:{exports:{}},exports:{},require,console}; sandbox.exports=sandbox.module.exports; vm.runInNewContext(compiled.out,sandbox,{filename:'operationsAutopilot.js'}); const api=sandbox.module.exports;
for(const phrase of ['اعطيني احول مصاري وين','وين احول كليك','بدي ادفع رسوم ٥','عطيني وين ادفع مصاري','كيف بدي ادفع']) ok(`payment P0 detects: ${phrase}`,api.isPaymentPriorityCustomerText(phrase,'payment_method')===true);
ok('payment P0 rejects refusal',api.isPaymentPriorityCustomerText('ما بدي ادفع','payment_method')===false);
console.log(`Phase 8.6 focused assertions: ${pass+fail}; passed=${pass}; failed=${fail}`); process.exit(fail?1:0);
