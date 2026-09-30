const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const tr=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}
const rel={
 route:'app/api/whatsapp/webhook/route.ts',
 human:'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts',
 arbiter:'app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts',
 semantic:'app/api/whatsapp/webhook/_lib/v3-os/semanticQuestionLocks.ts',
 contract:'app/api/whatsapp/webhook/_lib/v3-os/currentQuestionAnswerContract.ts',
 obligations:'app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts',
 humanTurn:'app/api/whatsapp/webhook/_lib/v3-os/currentHumanTurnAuthority.ts',
 gate:'app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts',
 decision:'app/api/whatsapp/webhook/_lib/v3-os/unifiedConversationDecisionPlane.ts',
};
for(const [name,file] of Object.entries(rel))ok(fs.existsSync(path.join(root,file)),`${name} source exists`);
const routeSrc=read(rel.route),humanSrc=read(rel.human),arbiterSrc=read(rel.arbiter),semanticSrc=read(rel.semantic),contractSrc=read(rel.contract),obligationsSrc=read(rel.obligations),humanTurnSrc=read(rel.humanTurn),gateSrc=read(rel.gate),decisionSrc=read(rel.decision);
const L=file=>loadTs(path.join(root,'app/api/whatsapp/webhook/_lib/v3-os',file));
const interpreter=L('interpreter.ts'),arbiter=L('responseArbiter.ts'),semantic=L('semanticQuestionLocks.ts'),contract=L('currentQuestionAnswerContract.ts'),obligations=L('answerObligations.ts'),humanTurn=L('currentHumanTurnAuthority.ts'),gate=L('mutationConfirmationGate.ts'),decision=L('unifiedConversationDecisionPlane.ts'),policy=L('policy.ts'),stateMod=L('state.ts');
const policyTruth=policy.getV3Policy();
const baseApp={id:'app-117',trackingId:'AM-1789311690014',status:'under_review',paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-20T00:00:00Z',phone:'0793393352'};
const feeApp={...baseApp,status:'customer_confirmed_continue',paymentStatus:'pending_payment',paymentConfirmedAt:null};
const proofApp={...baseApp,status:'customer_confirmed_continue',paymentStatus:'pending_payment_confirmation',paymentConfirmedAt:null};
const refundApp={...baseApp,status:'cancelled',paymentStatus:'refund_requested'};
const mkTruth=application=>({application,ambiguousApplications:[],contactAccess:'full',policy:policyTruth,degraded:false,readWarnings:[]});
let baseState=stateMod.emptyState('962793393352');baseState={...baseState,activeApplicationId:baseApp.id,activeTrackingId:baseApp.trackingId,lastAssistantText:'طلبك قيد الدراسة النهائية.',lastCustomerText:'شو صار بالطلب'};
const turn=(text,id='x')=>interpreter.interpretTurn({turnId:id,customerText:text});

// A. Current explicit meaning outranks commercial stage.
ok(decision.downPaymentQuestion('ما بدي ادفع دفعة أولى')===true,'no-down-payment wording is classified as a down-payment question/decision');
ok(decision.downPaymentQuestion('بديش ادفع دفعة أولى')===true,'colloquial no-down-payment wording is recognized');
const downTurn=turn('ما بدي ادفع دفعة أولى','down');
const downResult=arbiter.arbitrateProductionReply({candidate:'بما إن رسوم فتح الملف هي الخطوة، الطلب بيضل بانتظار فتح الملف.',turn:downTurn,state:baseState,truth:mkTruth(feeApp),actions:[]});
ok(Boolean(downResult.reply)&&/ما في دفعة أولى|دفعة أولى.*(?:0|اختيار)/.test(downResult.reply),'down-payment refusal is answered as device down payment, not five-JOD refusal');
ok(!/الطلب بيضل بانتظار فتح الملف/.test(downResult.reply||''),'five-JOD continuation stage cannot hijack down-payment meaning');

for(const [text,label] of [['شو شروط التقديم ع التلفون؟','requirements'],['هل بحتاج كفيل ؟','guarantor'],['شو شروط العقد','contract']]){
  const t=turn(text,`q-${label}`);
  const r=arbiter.arbitrateProductionReply({candidate:'رسوم فتح الملف 5 دنانير، وهاي بيانات الدفع الرسمية: Orange Money...',turn:t,state:baseState,truth:mkTruth(feeApp),actions:[]});
  ok(Boolean(r.reply),`${label} question gets a reply`);
  if(label==='requirements') ok(/(?:الهوية|اثبات الدخل|إثبات الدخل)/.test(r.reply),`requirements question answers requirements`);
  if(label==='guarantor') ok(/(?:الكفيل|كفيل)/.test(r.reply),`guarantor question answers guarantor policy`);
  if(label==='contract') ok(/(?:مرابحه|مرابحة|القسط الأول|العقد)/.test(r.reply),`contract question answers contract/commercial terms`);
  ok(!/^رسوم فتح الملف 5 دنانير، وهاي بيانات الدفع الرسمية/.test(r.reply),`${label} question is not replaced by payment template`);
}

// B. Media authority is strictly current-turn, never stale topic/candidate authority.
ok(!/turn\.topics\.includes\("receipt_upload"\)/.test(arbiterSrc.match(/function isMediaEnvelope[\s\S]*?\n}/)?.[0]||''),'arbiter media envelope does not trust stale receipt_upload topic');
const hala={...turn('اوكيه ياريت تبعتولي','hala'),topics:['receipt_upload']};
const halaR=arbiter.arbitrateProductionReply({candidate:'وصلني المرفق. إذا هو لتوضيح مشكلة أو سؤال اكتبلي شو بدك.',turn:hala,state:baseState,truth:mkTruth(baseApp),actions:[]});
ok(Boolean(halaR.reply)&&!/وصلني المرفق|وصلتني الرسالة الصوتية/.test(halaR.reply),'stale media candidate is vetoed on a text-only follow-up');
ok(/تحديث|متابعه|متابعة/.test(halaR.reply||''),'text-only follow-up remains in conversation/status context');
const hady={...turn('هسا استنى بس؟','hady'),topics:['receipt_upload']};
ok(contract.receiptFollowupQuestion(hady)===true,'receipt follow-up question is explicitly recognized');
const hadyR=arbiter.arbitrateProductionReply({candidate:'وصلني المرفق. اكتبلي شو بدك.',turn:hady,state:baseState,truth:mkTruth(proofApp),actions:[]});
ok(Boolean(hadyR.reply)&&/بانتظار اعتماد الإدارة|بانتظار.*الإدارة/.test(hadyR.reply),'receipt follow-up answers payment-proof stage');
ok(!/وصلني المرفق/.test(hadyR.reply||''),'receipt follow-up cannot collapse to generic media reply');
const literalVoice=turn('تم استلام رسالة صوتية من العميل. لا يوجد تفريغ نصي تلقائي للصوت حاليًا، لذلك يُفضّل طلب توضيح نصي إذا لم يكن السياق كافيًا.','voice');
const voiceR=arbiter.arbitrateProductionReply({candidate:'ما في توصيل.',turn:literalVoice,state:baseState,truth:mkTruth(baseApp),actions:[]});
ok(voiceR.obligation==='media' || /الصوت/.test(voiceR.reply||''),'literal voice envelope still routes as media');
ok(/(?:رسالة صوتية|الصوتية|اكتبلي)/.test(voiceR.reply||''),'literal voice envelope asks for textual clarification');

// C. Delivery/location policy may answer only a delivery/location question.
const sameDay={...turn('القصد ممكن تصدر الموافقه بنفس اليوم؟','same-day'),topics:['delivery']};
const sameDayR=arbiter.arbitrateProductionReply({candidate:'ما في توصيل. الاستلام من المكتب بعد الموافقة النهائية.',turn:sameDay,state:baseState,truth:mkTruth(baseApp),actions:[]});
ok(Boolean(sameDayR.reply)&&!/ما في توصيل/.test(sameDayR.reply),'stale delivery topic cannot hijack approval-timing question');
ok(/(?:يومين|3 أيام|موعد|مراجعات|قرار)/.test(sameDayR.reply||''),'same-day approval question gets review-timing truth');
ok(/explicitDeliveryOrPickupQuestionText/.test(humanSrc),'Human OS safety repair is gated by literal delivery/pickup question');
ok(!/if \(turn\.topics\.includes\("office_location"\)\) return true/.test(semanticSrc),'office semantic lock cannot be owned by stale topic alone');

// D. Multi-question bundle covers payment method + location in one reply.
const rahma=turn('كيف تستلمو الرسوم؟ وين موقع الشركة؟','rahma');
const bundle=obligations.resolveAnswerBundle({turn:rahma,state:baseState,truth:mkTruth(feeApp)});
ok(bundle.kind==='multi_question','payment-method + location is recognized as one multi-question turn');
const bundleReply=obligations.buildAnswerBundleReply({bundle,turn:rahma,state:baseState,truth:mkTruth(feeApp)});
ok(Boolean(bundleReply)&&/Orange Money|CliQ|PAYAMEEEN/.test(bundleReply),'multi-question reply answers how fees are received');
ok(Boolean(bundleReply)&&/(?:عمان|عمّان).*(?:شارع المدينة|شارع المدينه)/.test(bundleReply),'multi-question reply also answers company location');

// E. Human-agent request and long-delay anomaly own the current turn.
const agent=turn('بدي بني ادم اتفاهم معه','agent');
const agentA=humanTurn.resolveCurrentHumanTurnAuthority({turn:agent,state:baseState,truth:mkTruth(baseApp)});
ok(agentA.kind==='direct_call_request','explicit human-agent request is recognized as a direct human/contact request');
const agentR=arbiter.arbitrateProductionReply({candidate:'طلبك قيد الدراسة النهائية. المعدل يومين إلى 3 أيام.',turn:agent,state:baseState,truth:mkTruth(baseApp),actions:[]});
ok(agentR.obligation==='current_human_turn','human-agent request outranks status/review template');
ok(Boolean(agentR.reply)&&/(?:اتصال|مكالمة|واتساب|احكيلي)/.test(agentR.reply),'human-agent request receives truthful channel handling');
for(const q of ['صارلي 18 يوم بستنى','اكثر من شهر وانا بستنى']){
  const t=turn(q,`delay-${passed}`);
  const a=humanTurn.resolveCurrentHumanTurnAuthority({turn:t,state:baseState,truth:mkTruth(baseApp)});
  ok(a.kind==='long_delay_anomaly',`long delay anomaly recognized: ${q}`);
  const r=arbiter.arbitrateProductionReply({candidate:'المعدل الطبيعي يومين إلى 3 أيام عمل.',turn:t,state:baseState,truth:mkTruth(baseApp),actions:[]});
  ok(Boolean(r.reply)&&/متجاوز|تجاوز/.test(r.reply),`long delay gets anomaly-aware answer: ${q}`);
  ok(!/إذا طلبك من شهر 8/.test(r.reply||''),`long-delay repair does not invent month-8 history: ${q}`);
}

// F. Conditional future cancellation is not an immediate destructive mutation.
const conditional='لو سمحت ادا تأخر اكثر بدي الغي الطلب';
ok(gate.mutationQuestion('cancel_application',conditional)===true,'conditional cancellation is detected as a question, not consent');
ok(gate.explicitMutationRequest('cancel_application',conditional)===false,'conditional future cancellation is not an explicit current cancel request');
const conditionalTurn={...turn(conditional,'conditional'),requestedActions:['cancel_application'],acts:[{id:'m1',type:'request_action',topic:'cancellation',text:conditional,confidence:.9,action:'cancel_application',value:null,source:'model'}]};
const conditionalGate=gate.enforceMutationConfirmationGate({actions:[{action:'cancel_application',sourceActId:'m1',requiresConfirmation:false,authority:'model',requiredRole:'omran',payload:null}],turn:conditionalTurn,state:baseState,truth:mkTruth(baseApp)});
ok(conditionalGate.actions.length===0,'conditional future cancellation does not execute a cancel action');
ok(conditionalGate.confirmationPrompt===null,'conditional future cancellation does not open a cancel-confirmation loop');
const conditionalR=arbiter.arbitrateProductionReply({candidate:'أكدلي: نعم، ألغي الطلب.',turn:conditionalTurn,state:baseState,truth:mkTruth(baseApp),actions:[]});
ok(Boolean(conditionalR.reply)&&!/أكدلي.*ألغي|نعم، ألغي/.test(conditionalR.reply),'conditional cancellation reply does not demand immediate cancellation confirmation');

// G. Existing refund truth remains closed, preserving 11.6.1.
const refundTruth=mkTruth(refundApp);
const refundTime=turn('متى يتم اعاده الرسوم','refund-time');
const refundR=arbiter.arbitrateProductionReply({candidate:'أكدلي مرة ثانية إنك بدك استرداد.',turn:refundTime,state:baseState,truth:refundTruth,actions:[]});
ok(refundR.obligation==='refund_timing' || refundR.obligation==='refund_human_care','existing refund timing remains owned by refund truth');
ok(Boolean(refundR.reply)&&/مسجل|قيد المعالجة|تحويل/.test(refundR.reply),'existing refund remains registered/processing');
ok(!/أكدلي.*استرداد/.test(refundR.reply||''),'refund truth never reopens duplicate confirmation');

// H. Canonical turn closure: answered bubbles are excluded; all unanswered bubbles share one authority window.
ok(/source_incoming_message_id/.test(routeSrc)&&/source_burst_message_ids/.test(routeSrc),'route reads outgoing source linkage for canonical turn closure');
ok(/answeredIncomingMessageIds/.test(routeSrc),'route builds answered incoming-message set');
ok(/answeredIncomingMessageIds\.has\(id\)/.test(routeSrc),'already-answered incoming bubbles are excluded');
ok(/answeredIncomingMessageIds\.has\(id\)/.test(routeSrc.match(/for \(const job of[\s\S]*?return \{/)?.[0]||routeSrc),'queued ingress also excludes already-answered bubbles');
ok(/lookbackSeconds \* 1000/.test(routeSrc)&&/unansweredTurnGapMs/.test(routeSrc),'unanswered customer bubbles share the full canonical-turn lookback window');
ok(/selectCanonicalConversationBurst\([\s\S]*unansweredTurnGapMs/.test(routeSrc),'canonical burst selection uses unanswered-turn authority window');
ok(/durableIngressTurnFreshness/.test(humanSrc),'durable ingress freshness remains active after canonical-turn consolidation');
ok(/currentTurnStillOwnsConversation/.test(humanSrc),'final turn ownership remains active');

// I. Source-level precedence invariants.
ok(/literal current customer question owns the answer/.test(arbiterSrc),'arbiter documents current-question precedence');
ok(arbiterSrc.indexOf('if (answerBundle.kind !== "none") return "answer_bundle";') < arbiterSrc.indexOf('if (semanticQuestionLock.kind !== "none") return semanticQuestionLock.kind;'),'multi/current-question bundle outranks semantic stage locks');
ok(/staleMediaCandidateOnTextTurn/.test(arbiterSrc),'arbiter contains stale-media candidate veto');
ok(/receiptFollowupQuestion/.test(contractSrc),'current-question contract includes receipt follow-up authority');
ok(/feePaymentMethod/.test(obligationsSrc),'answer obligations include fee payment-method question');
ok(/بني\\s\+ادم/.test(humanTurnSrc),'human-turn authority recognizes human-person phrasing');
ok(/conditionalFutureMutationText/.test(arbiterSrc),'arbiter blocks conditional future mutation from owning response');
ok(/(?:لو\|اذا\|ادا)/.test(gateSrc),'mutation gate handles colloquial conditional spelling');

// J. All changed TS sources parse and old critical architecture remains.
for(const file of Object.values(rel).filter(f=>f.endsWith('.ts')))transpile(file);
ok(!/orangmoney\.com/i.test([routeSrc,humanSrc,arbiterSrc,semanticSrc,contractSrc,obligationsSrc,humanTurnSrc,gateSrc,decisionSrc].join('\n')),'cross-project literals are absent');

console.log(`\nV3 PHASE 11.7 SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed)process.exit(1);
console.log('Authority precedence + canonical unanswered-turn closure: PASS');
