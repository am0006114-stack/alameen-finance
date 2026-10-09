const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(process.cwd(),'node_modules','typescript'))}
const root=process.argv[2]||process.cwd(),cache=new Map();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
function load(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let p=path.resolve(path.dirname(abs),spec);if(!path.extname(p))p+='.ts';return load(p)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}
const dir=path.join(root,'app/api/whatsapp/webhook/_lib/v4-os');const {runV4ConversationTurn}=load(path.join(dir,'conversationKernel.ts'));const {emptyV4WorkingMemory}=load(path.join(dir,'workingMemory.ts'));
const U=(over={})=>({meaningSummary:'رسالة العميل الحالية',currentGoal:'contact',explicitQuestions:[],neededFactKeys:[],requestedAction:null,actionDisposition:'none',requestedPersona:null,references:[],emotion:'neutral',urgency:'normal',topicChanged:false,customerRejectedPreviousAnswer:false,customerWantsBrevity:false,noReplyRequested:false,identityQuestion:false,humanContactRequested:false,socialClosure:false,confidence:1,warnings:[],...over});
const truth={applicationId:'app-1',trackingId:'AM-1',facts:{'application.exists':{key:'application.exists',value:true,source:'database',confidence:1,customerVisible:true}},verifiedActionReceipts:[]};
const accepted={accepted:true,score:1,reasons:[],repairInstructions:[]};
function model(understanding,draftText='معك عمران من فريق الأمين، احكيلي شو بدك وأنا مكمل معك.'){return{async understand(){return understanding},async compose(req){return{text:draftText,decision:req.decision,claims:[{kind:'identity',text:'معك عمران من فريق الأمين'}],answeredQuestions:req.understanding.explicitQuestions,usedFactKeys:[],notes:[]}},async critique(){return accepted}}}
(async()=>{
 let humanCalls=0;
 const escalation={async request(){humanCalls++;return{recorded:true,receiptId:'human-1',reply:'أكيد. سجلت طلبك للتواصل مع موظف فعلي. لحد ما يدخل موظف فعلي أنا مكمل معك هون.',blocker:null}}};
 let r=await runV4ConversationTurn({turnId:'p1',burstText:'وين عمران',memory:emptyV4WorkingMemory('wa-p','abdullah'),truth,model:model(U({currentGoal:'named_persona'})),humanEscalationExecutor:escalation});
 ok(humanCalls===0,'named Omran request never triggers real-human escalation bridge');
 ok(r.memory.persona==='omran'&&/معك عمران/.test(r.reply||''),'named Omran request stays inside AI team persona continuity');
 ok(r.humanEscalation===null,'named persona request has no fake human-escalation receipt');

 r=await runV4ConversationTurn({turnId:'h1',burstText:'لا بدي موظف حقيقي احكي معه',memory:emptyV4WorkingMemory('wa-h','abdullah'),truth,model:model(U({currentGoal:'real_human_contact'}),'unused'),humanEscalationExecutor:escalation});
 ok(humanCalls===1,'explicit real-human request invokes durable escalation bridge exactly once');
 ok(r.humanEscalation&&r.humanEscalation.recorded,'durable human request returns recorded receipt state');
 ok(r.decision==='ESCALATE'&&/سجلت طلبك/.test(r.reply||''),'customer is told escalation was registered only after durable receipt');
 ok(!/(دخل الموظف|حولتك لموظف|معك موظف حقيقي)/.test(r.reply||''),'reply never pretends a real employee already joined');
 ok(r.critic.accepted,'receipt-backed human escalation passes final critic');

 const failedEscalation={async request(){return{recorded:false,receiptId:null,reply:'طلبك بالتواصل مع موظف فعلي واضح، بس ما قدرت أثبت تسجيل التحويل هاللحظة، لذلك ما رح أقول إنه تم.',blocker:'ledger_unavailable'}}};
 r=await runV4ConversationTurn({turnId:'h2',burstText:'بدي موظف حقيقي',memory:emptyV4WorkingMemory('wa-h2','tala'),truth,model:model(U({currentGoal:'real_human_contact'}),'unused'),humanEscalationExecutor:failedEscalation});
 ok(r.humanEscalation&&!r.humanEscalation.recorded,'failed escalation stays unrecorded');
 ok(/ما قدرت أثبت/.test(r.reply||'')&&!/سجلت طلبك/.test(r.reply||''),'failed escalation does not create a false success claim');
 console.log(`\nV4 HUMAN ESCALATION SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);if(failed)process.exit(1)
})().catch(e=>{console.error(e&&e.stack?e.stack:String(e));process.exit(1)});
