const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(process.cwd(),'node_modules','typescript'))}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}
const L=file=>loadTs(path.join(root,'app/api/whatsapp/webhook/_lib/v4-os',file));
const memoryMod=L('workingMemory.ts');
const procedureMod=L('procedureEngine.ts');
const criticMod=L('finalCritic.ts');
const humanMod=L('humanBehaviorPolicy.ts');
const guardMod=L('understandingGuard.ts');
const lensMod=L('truthLens.ts');
const kernel=L('conversationKernel.ts');

const truth={applicationId:'app-v4',trackingId:'AM-V4-001',facts:{
  'application.exists':{key:'application.exists',value:true,source:'database',confidence:1,customerVisible:true},
  'application.tracking_id':{key:'application.tracking_id',value:'AM-V4-001',source:'database',confidence:1,customerVisible:true},
  'application.journey_stage':{key:'application.journey_stage',value:'payment_confirmed_under_review',source:'database',confidence:1,customerVisible:true},
  'application.status.customer':{key:'application.status.customer',value:'قيد الدراسة النهائية',source:'database',confidence:1,customerVisible:true},
  'business.location.general':{key:'business.location.general',value:'عمّان – شارع المدينة المنورة',source:'policy',confidence:1,customerVisible:true},
  'business.website':{key:'business.website',value:'https://www.ameenfinance.co',source:'system',confidence:1,customerVisible:true},
  'fee.opening.amount_jod':{key:'fee.opening.amount_jod',value:5,source:'policy',confidence:1,customerVisible:true},
  'payment.beneficiary':{key:'payment.beneficiary',value:'TEST BENEFICIARY',source:'policy',confidence:1,customerVisible:true},
  'review.normal_window':{key:'review.normal_window',value:'2-3 operational days',source:'policy',confidence:1,customerVisible:true},
},verifiedActionReceipts:[]};
const U=(over={})=>({meaningSummary:'رسالة العميل الحالية',currentGoal:'answer_current_question',explicitQuestions:[],neededFactKeys:[],requestedAction:null,actionDisposition:'none',requestedPersona:null,references:[],emotion:'neutral',urgency:'normal',topicChanged:false,customerRejectedPreviousAnswer:false,customerWantsBrevity:false,noReplyRequested:false,identityQuestion:false,humanContactRequested:false,socialClosure:false,confidence:.99,warnings:[],...over});
const accepted={accepted:true,score:1,reasons:[],repairInstructions:[]};
function modelFor(turns,draft){let i=0;return{async understand(){return turns[Math.min(i++,turns.length-1)]},async compose(req){return typeof draft==='function'?draft(req):draft||{text:'جواب مباشر.',decision:req.decision,claims:[],answeredQuestions:req.understanding.explicitQuestions,usedFactKeys:[],notes:[]}},async critique(){return accepted}}}

(async()=>{
  let mem=memoryMod.emptyV4WorkingMemory('wa-v4','abdullah');
  ok(mem.activeGoal===null&&mem.persona==='abdullah','V4 working memory starts clean with stable persona');

  mem=memoryMod.applyTurnUnderstanding({memory:mem,turnId:'t1',customerText:'متى بستلم الجهاز؟',understanding:U({currentGoal:'delivery_timing',explicitQuestions:['متى بستلم الجهاز؟']})});
  ok(mem.activeGoal==='delivery_timing','current customer goal becomes working-memory authority');
  ok(mem.openQuestions.some(q=>q.active&&!q.answered),'current explicit question is active');
  mem=memoryMod.applyTurnUnderstanding({memory:mem,turnId:'t2',customerText:'طيب متى بعرف اذا انقبلت؟',understanding:U({currentGoal:'approval_timing',explicitQuestions:['متى بعرف اذا انقبلت؟'],topicChanged:true})});
  ok(mem.activeGoal==='approval_timing'&&mem.activeGoalTurnId==='t2','fresh goal replaces stale topic authority');
  ok(mem.openQuestions.filter(q=>q.active&&!q.answered).length===1,'old unanswered question becomes historical instead of owning fresh turn');

  const locationLens=lensMod.lensTruthBundle({burstText:'وين موقعكم؟',understanding:U({currentGoal:'location',explicitQuestions:['وين موقعكم؟']}),truth});
  ok(Boolean(locationLens.facts['business.location.general']),'truth lens exposes current location fact');
  ok(!locationLens.facts['payment.beneficiary']&&!locationLens.facts['fee.opening.amount_jod'],'location question cannot see unrelated payment facts');
  const requestedLens=lensMod.lensTruthBundle({burstText:'خبرني عن هالنقطة',understanding:U({neededFactKeys:['review.normal_window']}),truth});
  ok(Boolean(requestedLens.facts['review.normal_window']),'explicit neededFactKeys can request an existing authoritative fact');

  const first=procedureMod.resolveV4Procedure({memory:mem,turnId:'r1',understanding:U({requestedAction:'request_refund',actionDisposition:'request',currentGoal:'refund'})});
  ok(first.needsConfirmation&&!first.shouldExecute,'refund requires exactly one separate confirmation turn');
  mem=procedureMod.applyProcedureResolution({memory:mem,turnId:'r1',resolution:first});
  const second=procedureMod.resolveV4Procedure({memory:mem,turnId:'r2',understanding:U({requestedAction:'request_refund',actionDisposition:'confirm',currentGoal:'refund'})});
  ok(second.shouldExecute&&!second.needsConfirmation,'explicit second-turn refund confirmation executes instead of asking again');

  const repeatSecond=procedureMod.resolveV4Procedure({memory:{...mem,pendingProcedure:{...mem.pendingProcedure,state:'confirmation_required'}},turnId:'r3',understanding:U({requestedAction:'request_refund',actionDisposition:'request',currentGoal:'refund'})});
  ok(repeatSecond.shouldExecute,'repeating the same explicit action on the confirmation turn cannot create a confirmation loop');

  const pendingCancel={...mem,pendingProcedure:{name:'cancel_application',state:'confirmation_required',requestedAtTurnId:'c1',confirmedAtTurnId:null,executedAtTurnId:null,payload:null,lastError:null}};
  const freshQuestion=procedureMod.resolveV4Procedure({memory:pendingCancel,turnId:'c2',understanding:U({currentGoal:'delivery_timing',explicitQuestions:['متى بستلم إذا كملت؟'],topicChanged:true})});
  ok(!freshQuestion.needsConfirmation&&!freshQuestion.shouldExecute&&freshQuestion.action===null,'fresh question cannot be hijacked by stale pending cancellation');
  ok(pendingCancel.pendingProcedure.state==='confirmation_required','pending procedure remains safely available for later explicit decision');

  let guarded=guardMod.enforceCurrentTurnUnderstanding({burstText:'وين عمران',model:U({currentGoal:'contact'}),memory:memoryMod.emptyV4WorkingMemory('wa-g1','abdullah')});
  ok(guarded.requestedPersona==='omran'&&!guarded.humanContactRequested,'named team persona request routes internally instead of fake human escalation');
  guarded=guardMod.enforceCurrentTurnUnderstanding({burstText:'لا بدي موظف حقيقي احكي معه',model:U({currentGoal:'contact'}),memory:memoryMod.emptyV4WorkingMemory('wa-g2','abdullah')});
  ok(guarded.humanContactRequested&&guarded.requestedPersona===null,'explicit real-human request stays a real escalation request');
  guarded=guardMod.enforceCurrentTurnUnderstanding({burstText:'ضاغط عليك لحالك جاوبني بدون فلسفة',model:U(),memory:memoryMod.emptyV4WorkingMemory('wa-g3','abdullah')});
  ok(guarded.customerWantsBrevity,'deterministic human-language guard catches direct brevity request');

  ok(humanMod.personaIdentityReply('abdullah').startsWith('معك عبدالله من فريق الأمين'),'identity reply uses named Al Ameen persona');
  ok(!/(أنا|انا)\s+(إنسان|انسان)|مش\s+بوت/.test(humanMod.personaIdentityReply('abdullah')),'identity reply stays human in style without explicit deceptive human claim');

  let r=await kernel.runV4ConversationTurn({turnId:'id1',burstText:'انت بني آدم ولا رد آلي؟',memory:memoryMod.emptyV4WorkingMemory('wa-id','abdullah'),truth,model:modelFor([U({identityQuestion:true,currentGoal:'identity',explicitQuestions:['انت بني آدم ولا رد آلي؟']})])});
  ok(r.reply&&r.reply.includes('معك عبدالله من فريق الأمين'),'kernel answers identity challenge with human team presence');
  ok(r.critic.accepted,'identity response passes final critic');

  r=await kernel.runV4ConversationTurn({turnId:'sil1',burstText:'مافي داعي للرد',memory:memoryMod.emptyV4WorkingMemory('wa-sil','fadwa'),truth,model:modelFor([U({noReplyRequested:true,currentGoal:null})])});
  ok(r.reply===null&&r.decision==='SILENCE','explicit no-reply request produces real silence');

  r=await kernel.runV4ConversationTurn({turnId:'p1',burstText:'وين عمران',memory:memoryMod.emptyV4WorkingMemory('wa-p','abdullah'),truth,model:modelFor([U({currentGoal:'named_persona'})],req=>({text:'معك عمران من فريق الأمين، احكيلي شو بدك وأنا مكمل معك.',decision:req.decision,claims:[{kind:'identity',text:'معك عمران من فريق الأمين'}],answeredQuestions:[],usedFactKeys:[],notes:[]}))});
  ok(r.memory.persona==='omran'&&/معك عمران/.test(r.reply||''),'named persona request switches conversational persona without external handoff');

  const exec={async execute(input){return{action:input.action,executed:true,receiptId:'receipt-1',summary:'تم تسجيل طلب الاسترداد فعليًا.',error:null}}};
  let refundMem=memoryMod.emptyV4WorkingMemory('wa-ref','omran');
  r=await kernel.runV4ConversationTurn({turnId:'rr1',burstText:'رجعولي الخمسة',memory:refundMem,truth,model:modelFor([U({requestedAction:'request_refund',actionDisposition:'request',currentGoal:'refund'})]),actionExecutor:exec});
  ok(r.procedure.needsConfirmation&&/أكدلي مرة واحدة/.test(r.reply||''),'first refund request asks for one confirmation');
  refundMem=r.memory;
  r=await kernel.runV4ConversationTurn({turnId:'rr2',burstText:'نعم اريد استرداد الرسوم',memory:refundMem,truth,model:modelFor([U({requestedAction:'request_refund',actionDisposition:'confirm',currentGoal:'refund'})]),actionExecutor:exec});
  ok(r.actionResult&&r.actionResult.executed,'second-turn refund confirmation reaches Action Executor');
  ok(/تم تسجيل طلب الاسترداد فعليًا/.test(r.reply||''),'executed refund reply is grounded in action receipt');
  ok(r.memory.pendingProcedure&&r.memory.pendingProcedure.state==='executed','procedure memory records executed state and cannot loop');

  let rejectMem=memoryMod.emptyV4WorkingMemory('wa-rep','abdullah');
  rejectMem.lastAssistantText='طلبك قيد الدراسة النهائية والمعدل الطبيعي يومين إلى ثلاثة أيام.';
  rejectMem.lastAssistantFingerprint=memoryMod.answerFingerprint(rejectMem.lastAssistantText);
  rejectMem.rejectedAnswerFingerprints=[rejectMem.lastAssistantFingerprint];
  rejectMem.repetitionSensitivity=6;
  let c=criticMod.deterministicFinalCritic({burstText:'بلا هالحكي',understanding:U({customerRejectedPreviousAnswer:true,currentGoal:'status',emotion:'frustrated'}),memory:rejectMem,truth,draft:{text:rejectMem.lastAssistantText,decision:'ANSWER',claims:[],answeredQuestions:['status'],usedFactKeys:[],notes:[]}});
  ok(!c.accepted&&c.reasons.some(x=>x.includes('repeats')),'repetition firewall rejects an answer the customer already rejected');

  c=criticMod.deterministicFinalCritic({burstText:'بدون فلسفة: نعم ولا؟',understanding:U({customerWantsBrevity:true,currentGoal:'yes_no',explicitQuestions:['نعم ولا؟']}),memory:memoryMod.emptyV4WorkingMemory('wa-short'),truth,draft:{text:'أ'.repeat(400),decision:'ANSWER',claims:[],answeredQuestions:['نعم ولا؟'],usedFactKeys:[],notes:[]}});
  ok(!c.accepted&&c.reasons.some(x=>x.includes('too long')),'brevity contract blocks long philosophical replies');

  c=criticMod.deterministicFinalCritic({burstText:'رح تبلغني بالاسترداد لما يتم او لا؟',understanding:U({currentGoal:'refund_notification',explicitQuestions:['رح تبلغني بالاسترداد لما يتم او لا؟']}),memory:memoryMod.emptyV4WorkingMemory('wa-yn'),truth,draft:{text:'طلب الاسترداد قيد المعالجة وما عندي وقت ثابت.',decision:'ANSWER',claims:[],answeredQuestions:['رح تبلغني بالاسترداد لما يتم او لا؟'],usedFactKeys:[],notes:[]}});
  ok(!c.accepted&&c.reasons.some(x=>x.includes('yes/no')),'yes/no question must get a direct answer first');

  c=criticMod.deterministicFinalCritic({burstText:'شو صار؟',understanding:U({currentGoal:'status',explicitQuestions:['شو صار؟']}),memory:memoryMod.emptyV4WorkingMemory('wa-action'),truth,draft:{text:'تمت الموافقة.',decision:'ANSWER',claims:[{kind:'action',text:'تمت الموافقة',action:'continue_application'}],answeredQuestions:['شو صار؟'],usedFactKeys:[],notes:[]}});
  ok(!c.accepted&&c.reasons.some(x=>x.includes('no executed receipt')),'final critic blocks unsupported action/execution claims');

  c=criticMod.deterministicFinalCritic({burstText:'هل عندكم انستغرام؟',understanding:U({currentGoal:'social',explicitQuestions:['هل عندكم انستغرام؟']}),memory:memoryMod.emptyV4WorkingMemory('wa-social'),truth,draft:{text:'نعم، عندنا صفحة إنستغرام رسمية.',decision:'ANSWER',claims:[],answeredQuestions:['هل عندكم انستغرام؟'],usedFactKeys:[],notes:[]}});
  ok(!c.accepted&&c.reasons.some(x=>x.includes('public presence')),'critic blocks invented social pages and public-presence claims');

  c=criticMod.deterministicFinalCritic({burstText:'انت انسان؟',understanding:U({identityQuestion:true,currentGoal:'identity',explicitQuestions:['انت انسان؟']}),memory:memoryMod.emptyV4WorkingMemory('wa-human'),truth,draft:{text:'أنا إنسان مش بوت.',decision:'ANSWER',claims:[],answeredQuestions:['انت انسان؟'],usedFactKeys:[],notes:[]}});
  ok(!c.accepted&&c.reasons.some(x=>x.includes('human/non-AI identity')),'final critic blocks explicit deceptive human-identity claim');

  const newGoalMem={...rejectMem,activeGoal:'location'};
  c=criticMod.deterministicFinalCritic({burstText:'وين موقعكم؟',understanding:U({currentGoal:'location',topicChanged:true,explicitQuestions:['وين موقعكم؟']}),memory:newGoalMem,truth,draft:{text:rejectMem.lastAssistantText,decision:'ANSWER',claims:[],answeredQuestions:['وين موقعكم؟'],usedFactKeys:[],notes:[]}});
  ok(!c.accepted&&c.reasons.some(x=>x.includes('topic changed')),'fresh topic cannot be answered by stale previous-topic template');

  r=await kernel.runV4ConversationTurn({turnId:'goal1',burstText:'وين موقعكم؟',memory:memoryMod.emptyV4WorkingMemory('wa-goal','tala'),truth,model:modelFor([U({currentGoal:'location',explicitQuestions:['وين موقعكم؟'],topicChanged:true,neededFactKeys:['business.location.general']})],(req)=>({text:'الموقع العام: عمّان – شارع المدينة المنورة.',decision:req.decision,claims:[{kind:'fact',text:'عمّان – شارع المدينة المنورة',factKey:'business.location.general'}],answeredQuestions:['وين موقعكم؟'],usedFactKeys:['business.location.general'],notes:[]}))});
  ok(r.critic.accepted&&/شارع المدينة المنورة/.test(r.reply||''),'grounded current-question answer passes truth-aware critic');
  ok(r.memory.episodes.length===1&&r.memory.episodes[0].goal==='location','accepted turn is written to bounded episodic conversation memory');

  console.log(`\nALAMEEN V4 HUMAN AI CONVERSATION OS SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
  if(failed)process.exit(1);
})().catch(e=>{console.error(e&&e.stack?e.stack:String(e));process.exit(1)});
