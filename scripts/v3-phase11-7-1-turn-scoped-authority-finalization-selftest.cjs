const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const tr=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}
const rel={
  obligations:'app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts',
  commercial:'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
  human:'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts',
  arbiter:'app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts',
  semantic:'app/api/whatsapp/webhook/_lib/v3-os/semanticQuestionLocks.ts',
  humanTurn:'app/api/whatsapp/webhook/_lib/v3-os/currentHumanTurnAuthority.ts',
  gate:'app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts',
};
for(const [name,file] of Object.entries(rel))ok(fs.existsSync(path.join(root,file)),`${name} source exists`);
const src={};for(const [k,v] of Object.entries(rel))src[k]=read(v);
const L=file=>loadTs(path.join(root,'app/api/whatsapp/webhook/_lib/v3-os',file));
const interpreter=L('interpreter.ts'),arbiter=L('responseArbiter.ts'),obligations=L('answerObligations.ts'),commercial=L('informedCommercialContinuation.ts'),humanTurn=L('currentHumanTurnAuthority.ts'),gate=L('mutationConfirmationGate.ts'),policy=L('policy.ts'),stateMod=L('state.ts');
const policyTruth=policy.getV3Policy();
const baseApp={id:'app-1171',trackingId:'AM-1790774373025',status:'preliminary_qualified',paymentStatus:null,paymentConfirmedAt:null,phone:'0776328429',deviceName:'iPhone 15'};
const feeApp={...baseApp,status:'customer_confirmed_continue',paymentStatus:'pending_payment'};
const reviewApp={...baseApp,status:'under_review',paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-20T00:00:00Z'};
const cancelledApp={...baseApp,status:'cancelled',paymentStatus:'cancelled'};
const refundApp={...cancelledApp,paymentStatus:'refund_requested'};
const mkTruth=application=>({application,ambiguousApplications:[],contactAccess:'full',policy:policyTruth,degraded:false,readWarnings:[]});
let baseState=stateMod.emptyState('962776328429');baseState={...baseState,activeApplicationId:baseApp.id,activeTrackingId:baseApp.trackingId,lastAssistantText:'طلبك قيد المراجعة.',lastCustomerText:'شو صار بالطلب'};
const turn=(text,id='x')=>interpreter.interpretTurn({turnId:id,customerText:text});
const arb=(text,candidate,state=baseState,app=baseApp,id='x')=>arbiter.arbitrateProductionReply({candidate,turn:turn(text,id),state,truth:mkTruth(app),actions:[]});

// A. One explicit current question owns one answer, regardless of stale candidate/lock.
for(const [text,label,must,forbid] of [
  ['اين افرعكم','location',/(?:عمّان|عمان).*(?:شارع المدينة|شارع المدينه)/,/اكتب المطلوب نفسه/],
  ['بدي فرع','branch',/(?:عمّان|عمان).*(?:شارع المدينة|شارع المدينه)/,/اكتب المطلوب نفسه/],
  ['في عن اقساط عن طريق البنك العربي الاسلامي؟','bank channel',/(?:البنك العربي الإسلامي|بنك معيّن|برنامج تقسيط)/,/الهوية وإثبات الدخل من الأساسيات/],
  ['طيب ال 15 كم بطلع علي اقساط؟','installment quote',/(?:القسط الشهري|الحسبة الرسمية)/,/استرداد|ترجع الرسوم/],
  ['متى التسليم ؟','delivery timing',/(?:موعد التسليم|الموافقة النهائية|الاستلام)/,/اكتب المطلوب نفسه/],
]){
  const r=arb(text,'معك عمران، ما عندي تحويل لموظف. اكتب المطلوب نفسه.',baseState,baseApp,`a-${label}`);
  ok(r.obligation==='answer_bundle',`${label}: explicit question has deterministic answer-bundle authority`);
  ok(Boolean(r.reply)&&must.test(r.reply),`${label}: current question is answered directly`);
  ok(!forbid.test(r.reply||''),`${label}: stale/cross-domain candidate is rejected`);
}

// B. Social/greeting turns expire old semantic authority.
let staleState={...baseState,lastAssistantText:'الهوية وإثبات الدخل والكفيل حسب الدراسة.',lastCustomerText:'هل بحتاج كفيل'};
let r=arb('تمام شكرا','بيانات الكفيل مش شرط ثابت لكل طلب.',staleState,reviewApp,'social');
ok(r.obligation==='social_closure','social closure owns the new turn');
ok(/(?:العفو|الله يعطيك العافية)/.test(r.reply||''),'social closure is short and human');
ok(!/(?:الكفيل|إثبات الدخل)/.test(r.reply||''),'social closure does not repeat stale topic');
r=arb('مرحبا','مستند مصدر الدخل ما بينبعث على واتساب.',staleState,reviewApp,'greeting');
ok(r.obligation==='social_greeting','literal greeting owns the new turn');
ok(/(?:أهلين|اهلين|وسهلين|تفضل)/.test(r.reply||''),'greeting gets greeting reply');
ok(!/مصدر الدخل/.test(r.reply||''),'greeting does not inherit old income-document topic');
r=arb('ممكن سؤال','طلبك قيد الدراسة النهائية.',staleState,reviewApp,'openq');
ok(r.obligation==='current_human_turn','open question prompt outranks old status');
ok(/تفضل.*(?:سؤالك|سوالك)/.test(r.reply||''),'open question prompt invites the actual question');

// C. WhatsApp link routing question is not a human-call request.
const waTurn=turn('بضغط على رابط الواتس بضل يحولني على الرقم الثاني كيف اخليه على هاد الرقم','wa-link');
const waAuth=humanTurn.resolveCurrentHumanTurnAuthority({turn:waTurn,state:baseState,truth:mkTruth(baseApp)});
ok(waAuth.kind==='whatsapp_link_routing_issue','WhatsApp wrong-number link issue has its own current-turn authority');
r=arbiter.arbitrateProductionReply({candidate:'ما عندي تحويل لمكالمة أو لموظف منفصل.',turn:waTurn,state:baseState,truth:mkTruth(baseApp),actions:[]});
ok(r.obligation==='current_human_turn','WhatsApp link issue is not swallowed by direct-call/human-agent handling');
ok(/(?:رابط واتساب|رقم واتساب|الرقم الثاني|الرقم الحالي)/.test(r.reply||''),'WhatsApp routing reply addresses the actual link/number issue');

// D. Five-JOD commercial path is state-aware and does not loop on consent.
let prelimTruth=mkTruth(baseApp);
let firstTurn=turn('أود الاستمرار','cont-first');
let firstBundle=obligations.resolveAnswerBundle({turn:firstTurn,state:baseState,truth:prelimTruth});
let firstReply=obligations.buildAnswerBundleReply({bundle:firstBundle,turn:firstTurn,state:baseState,truth:prelimTruth});
ok(Boolean(firstReply)&&commercial.resemblesFullCommercialDisclosure(firstReply),'first continuation after preliminary approval delivers the full five-JOD disclosure');
let deliveredState=commercial.markCommercialDisclosureDelivered(baseState,prelimTruth,'cont-first');
ok(commercial.commercialDisclosureDelivered(deliveredState,prelimTruth)===true,'commercial disclosure is durable for the exact application');
for(const text of ['أود الاستمرار','موافق','كيف احولك خمسه','لا الرسوم بدفعها']){
  const rr=arb(text,'اكتب: أود الاستمرار.',deliveredState,baseApp,`pay-${text}`);
  ok(rr.obligation==='answer_bundle',`post-disclosure ${text}: current commercial intent owns the turn`);
  ok(/(?:Orange Money|CliQ|PAYAMEEEN)/.test(rr.reply||''),`post-disclosure ${text}: official payment data opens without another consent loop`);
  ok(!/اكتب:\s*أود الاستمرار/.test(rr.reply||''),`post-disclosure ${text}: consent is not requested again`);
}
r=arb('هاض المبلغ مسترد؟','رسوم فتح الملف 5 دنانير وهاي بيانات الدفع.',deliveredState,baseApp,'refundability');
ok(r.obligation==='answer_bundle','five-JOD refundability is a current explicit question');
ok(/مسترد/.test(r.reply||'')&&/الموافقة النهائية/.test(r.reply||''),'five-JOD refundability gets the refundability truth');
ok(!/Orange Money|PAYAMEEEN/.test(r.reply||''),'refundability question is not replaced by payment template');
r=arb('ما فهمت انت بدك مني ٥ هسه','لا، ما بدك تدفع شي هسه.',deliveredState,baseApp,'due-now');
ok(r.obligation==='answer_bundle','five-JOD due-now question has current-turn authority');
ok(/(?:نعم|إذا قرارك)/.test(r.reply||'')&&/(?:5|٥)/.test(r.reply||'')&&/رسوم فتح الملف/.test(r.reply||'')&&/قبل الدراسة النهائية/.test(r.reply||''),'after disclosure/continuation, five-JOD due-now answer is correct');
r=arb('انا حاط بطلب الجهاز بدون دفعه اولى','الطلب بيضل بانتظار فتح الملف.',deliveredState,feeApp,'down');
ok(r.obligation==='answer_bundle','device down-payment question has current-turn authority');
ok(/دفعة أولى.*(?:اختيارية|0)/.test(r.reply||''),'device down payment is correctly separate and optional');
ok(/رسوم فتح الملف/.test(r.reply||''),'reply explicitly distinguishes file-opening fee from device down payment');

// E. Interest decimal storage is rendered as a human percentage, not 100x too small.
const rateApp={...reviewApp,interestRate:0.15};
r=arb('كم نسب الفائده على ايفون','نسبة الربح 0.15%.',baseState,rateApp,'rate');
ok(r.obligation==='answer_bundle','interest/rate question has explicit authority');
ok(/15%/.test(r.reply||''),'stored decimal 0.15 is rendered as 15%');
ok(!/0\.15%/.test(r.reply||''),'stored decimal is never rendered as 0.15%');

// F. Business/trust questions before payment answer available facts, not commercial pressure template.
r=arb('قبل ما أدفع 5 دنانير بدي الاسم القانوني ورقم التسجيل والترخيص وعنوان المكتب وهل المبلغ مسترد؟','ما رح أضغط عليك تدفع هسا.',baseState,baseApp,'identity');
ok(r.obligation==='answer_bundle','business identity/refundability multi-question owns the turn');
ok(new RegExp(policyTruth.businessName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(r.reply||''),'business identity answer states documented business name');
ok(/(?:عمّان|عمان)/.test(r.reply||''),'business identity answer states documented general location');
ok(/مسترد/.test(r.reply||''),'business identity/refundability answer covers five-JOD refundability');
ok(!/ما رح أضغط عليك تدفع هسا/.test(r.reply||''),'trust question is not replaced by a no-pressure commercial template');

// G. Reopen cancelled request: direct question + scoped bare yes after exact prompt.
const cancelledTruth=mkTruth(cancelledApp);
r=arb('هل استطيع اعادة تفعيله ام اقدم طلب جديد','الهوية وإثبات الدخل من الأساسيات.',baseState,cancelledApp,'reopen-q');
ok(r.obligation==='answer_bundle','reopen-vs-new-request question has current-turn authority');
ok(/(?:إعادة فتح|اعادة فتح|الطلب ملغي)/.test(r.reply||''),'reopen question answers the cancelled-request choice');
let reopenState={...baseState,pendingAction:'reopen_application',pendingActionPayload:{_mutationConfirmationRequired:true,_scopeApplicationId:cancelledApp.id,_scopeTrackingId:cancelledApp.trackingId,_scopeWaId:baseState.waId},lastAssistantText:`فهمت عليك: بدك تتراجع عن الإلغاء وترجع تفتح نفس الطلب ${cancelledApp.trackingId}. للتأكيد النهائي اكتب: نعم، بدي أعيد فتح الطلب وأكمل عليه.`};
let yesTurn=turn('نعم','reopen-yes');
let reopenGate=gate.enforceMutationConfirmationGate({actions:[],turn:yesTurn,state:reopenState,truth:cancelledTruth});
ok(reopenGate.confirmedAction==='reopen_application','bare yes is accepted only for an active scoped reopen confirmation loop');
ok(reopenGate.actions.some(a=>a.action==='reopen_application'&&a.requiresConfirmation===false),'scoped reopen confirmation produces the executable reopen action');
let unsafeCancelState={...reopenState,pendingAction:'cancel_application',pendingActionPayload:{_mutationConfirmationRequired:true,_scopeApplicationId:cancelledApp.id,_scopeTrackingId:cancelledApp.trackingId,_scopeWaId:baseState.waId},lastAssistantText:'للتأكيد اكتب: نعم، ألغي الطلب.'};
let cancelGate=gate.enforceMutationConfirmationGate({actions:[],turn:yesTurn,state:unsafeCancelState,truth:mkTruth(reviewApp)});
ok(cancelGate.confirmedAction!=='cancel_application','bare yes remains forbidden for destructive cancellation');

// H. Refund form trouble answers the process problem and never promises unsupported follow-up.
r=arb('الرابط فتح بس ما في خانات اعبي بياناتي','خليني أتأكد من هالنقطة وبتابعها معك.',baseState,cancelledApp,'refund-form');
ok(r.obligation==='refund_process_problem','refund form/link failure gets refund-process authority');
ok(/(?:الرابط|حقول|خانات|الصفحة)/.test(r.reply||''),'refund form problem reply addresses the missing fields');
ok(!/(?:خليني أتأكد|برجعلك|بتابعها معك)/.test(r.reply||''),'refund form repair makes no unsupported promise to check/follow up');

// I. UI-vs-backend truth conflict is acknowledged instead of overwritten.
r=arb('بس بعطيني بانتظار فتح الملف','طلبك قيد الدراسة النهائية.',baseState,reviewApp,'sync');
ok(r.obligation==='answer_bundle','UI/backend status conflict has direct-answer authority');
ok(/(?:ظاهر عندك|الواجهة|مختلف|مزامنة)/.test(r.reply||''),'status conflict is explicitly acknowledged');

// J. Final egress commercial state is attached to the reply that actually won arbitration.
ok(/commercial consent state follows the reply that actually wins/.test(src.human),'Human OS documents final-egress commercial-state authority');
ok(/resemblesFullCommercialDisclosure\(reply\)/.test(src.human)&&/markCommercialDisclosureDelivered\(reduced/.test(src.human),'winning full disclosure is persisted after final arbitration');
ok(/resemblesPostDisclosurePaymentReply\(reply\)/.test(src.human)&&/markCommercialDisclosureAcknowledged\(reduced/.test(src.human),'winning payment package acknowledges commercial continuation after final arbitration');
ok(/currentQuestionFirst\.has\(obligation\)/.test(src.arbiter),'current explicit-question obligations outrank semantic stage locks');
ok(/single_question/.test(src.obligations),'single explicit questions are first-class deterministic answer bundles');

// K. Changed sources parse clean and no cross-project contamination was introduced.
for(const file of Object.values(rel))transpile(file);
ok(!/orangmoney\.com/i.test(Object.values(src).join('\n')),'cross-project literals are absent');

console.log(`\nV3 PHASE 11.7.1 SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed)process.exit(1);
console.log('Turn-scoped authority finalization + five-JOD state truth: PASS');
