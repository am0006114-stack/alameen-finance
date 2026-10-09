const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(process.cwd(),'node_modules','typescript'))}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,process},{filename:abs});return mod.exports}
const care=loadTs(path.join(root,'app/api/whatsapp/webhook/_lib/v4-os/humanCarePlaybook.ts'));
const memory=loadTs(path.join(root,'app/api/whatsapp/webhook/_lib/v4-os/workingMemory.ts'));
const U=(over={})=>({meaningSummary:'رسالة العميل',currentGoal:'status',explicitQuestions:[],neededFactKeys:[],requestedAction:null,actionDisposition:'none',requestedPersona:null,references:[],emotion:'neutral',urgency:'normal',topicChanged:false,customerRejectedPreviousAnswer:false,customerWantsBrevity:false,noReplyRequested:false,identityQuestion:false,humanContactRequested:false,socialClosure:false,confidence:.99,warnings:[],...over});
function modes(text,u=U(),m=memory.emptyV4WorkingMemory('wa','abdullah')){m.lastCustomerText=text;return care.detectHumanCareModes({burstText:text,understanding:u,memory:m})}
ok(modes('صرلي 26 يوم وانا بستنى',U({emotion:'frustrated'})).includes('wait_fatigue'),'long-wait fatigue is recognized');
ok(modes('اذا ما طلعتلي موافقه بتروح الرسوم عالفاضي؟').includes('payment_anxiety'),'fee-loss anxiety is recognized');
ok(modes('يعني راحت علي المصاري؟',U({currentGoal:'refund'})).includes('refund_anxiety'),'refund anxiety is recognized');
ok(modes('انتم نصابين ولا شركة حقيقية؟',U({emotion:'distrustful'})).includes('distrust'),'trust/scam suspicion is recognized');
ok(modes('ضاغط عليك لحالك جاوبني بدون فلسفة',U({customerWantsBrevity:true,emotion:'angry'})).includes('direct_answer_only'),'explicit no-philosophy request forces direct-answer mode');
ok(modes('بدي اروح اشوف محل ثاني اذا رح نضل هيك').includes('threat_to_leave'),'conditional churn threat is recognized without turning it into an action');
ok(modes('يا حمار وين عمران',U({emotion:'angry'})).includes('insult_without_disengagement'),'insult is treated as service-recovery context, not an argument');
const mem=memory.emptyV4WorkingMemory('wa2','abdullah');mem.repetitionSensitivity=6;mem.lastAssistantText='نفس الرد';
ok(modes('بلا هالحكي',U({customerRejectedPreviousAnswer:true,emotion:'frustrated'}),mem).includes('repetition_break'),'explicit rejection activates repetition break');
const directives=care.humanCareDirectives({burstText:'صرلي 26 يوم وبلا هالحكي',understanding:U({customerRejectedPreviousAnswer:true,emotion:'frustrated'}),memory:mem});
ok(directives.directives.some(x=>x.includes('لا يوجد تحديث'))||directives.directives.some(x=>x.includes('لا يوجد جديد')),'care directives prefer honest no-update language over template repetition');
console.log(`\nV4 HUMAN CARE PLAYBOOK SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);if(failed)process.exit(1);
