const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(process.cwd(),'node_modules','typescript'))}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}
const base=path.join(root,'app/api/whatsapp/webhook/_lib/v4-os');
const critic=loadTs(path.join(base,'finalCritic.ts'));
const memoryMod=loadTs(path.join(base,'workingMemory.ts'));
const truth={applicationId:'app',trackingId:'AM-1',facts:{'application.exists':{key:'application.exists',value:true,source:'database',confidence:1,customerVisible:true}},verifiedActionReceipts:[]};
const understanding={meaningSummary:'تهديد بالنشر بسبب الغضب',currentGoal:'complaint_recovery',explicitQuestions:[],neededFactKeys:[],requestedAction:null,actionDisposition:'none',requestedPersona:null,references:[],emotion:'angry',urgency:'normal',topicChanged:true,customerRejectedPreviousAnswer:true,customerWantsBrevity:false,noReplyRequested:false,identityQuestion:false,humanContactRequested:false,socialClosure:false,confidence:1,warnings:[]};
const memory=memoryMod.emptyV4WorkingMemory('wa-hotfix','abdullah');
let r=critic.deterministicFinalCritic({burstText:'مرحبا يا شركة النصابين - رح افضحكم على كل صفحات الفيسبوك',understanding,memory,truth,draft:{text:'فاهم إنك ناوي تنشر اللي صار على فيسبوك، واعتراضك واضح. خليني أمسك المشكلة نفسها معك.',decision:'ANSWER',claims:[],answeredQuestions:[],usedFactKeys:[],notes:[]}});
ok(r.accepted,'customer Facebook threat can be acknowledged without being mistaken for a company social-page claim');
r=critic.deterministicFinalCritic({burstText:'هل عندكم انستغرام؟',understanding:{...understanding,currentGoal:'social',emotion:'neutral',topicChanged:false,customerRejectedPreviousAnswer:false,explicitQuestions:['هل عندكم انستغرام؟']},memory,truth,draft:{text:'نعم، عندنا صفحة إنستغرام رسمية.',decision:'ANSWER',claims:[],answeredQuestions:['هل عندكم انستغرام؟'],usedFactKeys:[],notes:[]}});
ok(!r.accepted&&r.reasons.some(x=>x.includes('public presence')),'invented official social page remains blocked');
const runtime=fs.readFileSync(path.join(base,'productionRuntime.ts'),'utf8');
ok(/fallbackCustomerIsAngryOrDistrustful/.test(runtime)&&/ما رح أرجعك لقالب حالة الطلب/.test(runtime),'emergency fallback has complaint-aware recovery instead of stale status');
ok(runtime.indexOf('fallbackCustomerIsAngryOrDistrustful(customerText)')<runtime.indexOf('fallbackCustomerAskedForStatus(customerText)'),'complaint fallback has priority over application-status fallback');
console.log(`\nV4 PUBLIC-THREAT HOTFIX SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);if(failed)process.exit(1);
