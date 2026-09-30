const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const tr=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}
const rel={
 human:'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts',
 gate:'app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts',
 arbiter:'app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts',
 semantic:'app/api/whatsapp/webhook/_lib/v3-os/semanticQuestionLocks.ts',
 commercial:'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
 contract:'app/api/whatsapp/webhook/_lib/v3-os/currentQuestionAnswerContract.ts',
 interpreter:'app/api/whatsapp/webhook/_lib/v3-os/interpreter.ts',
};
for(const [name,file] of Object.entries(rel))ok(fs.existsSync(path.join(root,file)),`${name} source exists`);
const human=read(rel.human),gateSrc=read(rel.gate),arbiterSrc=read(rel.arbiter),semanticSrc=read(rel.semantic),commercialSrc=read(rel.commercial),contractSrc=read(rel.contract);
const L=file=>loadTs(path.join(root,'app/api/whatsapp/webhook/_lib/v3-os',file));
const interpreter=L('interpreter.ts'),arbiter=L('responseArbiter.ts'),gate=L('mutationConfirmationGate.ts'),semantic=L('semanticQuestionLocks.ts'),commercial=L('informedCommercialContinuation.ts'),contract=L('currentQuestionAnswerContract.ts'),policy=L('policy.ts'),stateMod=L('state.ts');
const policyTruth=policy.getV3Policy();
const baseApp={id:'app-1',trackingId:'AM-1790196677295',status:'under_review',paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-29T00:00:00Z',phone:'0770512951'};
const mkTruth=application=>({application,ambiguousApplications:[],contactAccess:'full',policy:policyTruth,degraded:false,readWarnings:[]});
let baseState=stateMod.emptyState('962770512951');baseState={...baseState,activeApplicationId:'app-1',activeTrackingId:baseApp.trackingId,lastAssistantText:'طلبك حالته الآن قيد الدراسة النهائية.'};

// RC-07 production failure: the model may not erase a deterministic current question.
ok(/function preserveDeterministicCurrentQuestionAuthority/.test(human),'Human OS defines deterministic current-question preservation');
ok(/turn = preserveDeterministicCurrentQuestionAuthority\(deterministicAnchor, turn\)/.test(human),'deterministic question is restored after Human Brain interpretation');
ok(/import \{ arbitrateProductionReply \} from "\.\/responseArbiter"/.test(human),'Human OS imports final response arbiter');
ok(/const arbitration = arbitrateProductionReply\(/.test(human),'Human OS invokes final response arbiter before egress safety');
ok(/authoritativeArbiterReply/.test(human),'arbiter repairs are treated as deterministic final authority');
for(const q of ['وقت المراجعه؟','وقت المراجعة','وقت الموافقه ؟','متى ينتهي ملفي من الدراسه','متى تنتهي دراسة الملف؟','اي تاريخ يكون القرار']){
  const turn=interpreter.interpretTurn({turnId:`q-${passed}`,customerText:q});
  ok(turn.topics.includes('review_timing'),`deterministic interpreter recognizes review timing: ${q}`);
  const result=arbiter.arbitrateProductionReply({candidate:'أنا معك على الطلب. آخر رسالة ما قدرت أحدد منها المطلوب بشكل كافي.',turn,state:baseState,truth:mkTruth(baseApp),actions:[]});
  ok(['review_timing','current_human_turn','current_question_contract'].includes(result.obligation),`arbiter owns current review question: ${q}`);
  ok(Boolean(result.reply)&&!/اكتب المطلوب|ما قدرت أحدد/.test(result.reply),`review timing repairs generic fallback: ${q}`);
}
const nextStepTurn=interpreter.interpretTurn({turnId:'next-step',customerText:'الخطوة التاليه'});
ok(nextStepTurn.topics.includes('application_status'),'standalone next-step phrase is deterministic application-status question');
ok(contract.directNextStepQuestion(nextStepTurn)===true,'current-question contract recognizes standalone next-step phrase');
const nextStepRepair=arbiter.arbitrateProductionReply({candidate:'أنا معك على الطلب. آخر رسالة ما قدرت أحدد منها المطلوب بشكل كافي.',turn:nextStepTurn,state:baseState,truth:mkTruth(baseApp),actions:[]});
ok(Boolean(nextStepRepair.reply)&&!/اكتب المطلوب|ما قدرت أحدد/.test(nextStepRepair.reply),'standalone next-step question is repaired to a concrete stage answer');
ok(/ما في عليك خطوة مالية/.test(nextStepRepair.reply||''),'under-review next-step answer says no additional financial step is due');

// RC-08 production failure: authoritative truth closes destructive confirmation loops.
ok(/function mutationAlreadySatisfied/.test(gateSrc),'mutation gate has satisfied-truth authority');
ok(/action === "request_refund"[\s\S]*refund_requested[\s\S]*refund_completed/.test(gateSrc),'refund requested/completed truth satisfies request_refund');
ok(/action === "cancel_application"[\s\S]*cancelled[\s\S]*refund_requested[\s\S]*refund_completed/.test(gateSrc),'cancel/refund truth satisfies cancel_application');
const refundApp={...baseApp,status:'cancelled',paymentStatus:'refund_requested'};
const refundTruth=mkTruth(refundApp);
const modelRefundTurn={...interpreter.interpretTurn({turnId:'refund-data',customerText:'0772703539 اورنج موني باسم osama'}),topics:['refund'],requestedActions:['request_refund'],acts:[{id:'model-refund',type:'request_action',topic:'refund',text:'0772703539 اورنج موني باسم osama',confidence:.9,action:'request_refund',value:null,source:'model'}]};
const refundGate=gate.enforceMutationConfirmationGate({actions:[{action:'request_refund',sourceActId:'model-refund',requiresConfirmation:false,authority:'model',requiredRole:'omran',payload:null}],turn:modelRefundTurn,state:{...baseState,pendingAction:'request_refund',pendingActionPayload:{_mutationConfirmationRequired:true}},truth:refundTruth});
ok(refundGate.actions.length===0,'already-open refund suppresses model-inferred duplicate refund action');
ok(refundGate.confirmationPrompt===null,'already-open refund cannot reopen refund confirmation prompt');
ok(refundGate.clearPendingConfirmation===true,'already-open refund clears stale pending confirmation state');
const modelCancelTurn={...interpreter.interpretTurn({turnId:'cancel-time',customerText:'كم بحتاج وقت'}),topics:['cancellation'],requestedActions:['cancel_application'],acts:[{id:'model-cancel',type:'request_action',topic:'cancellation',text:'كم بحتاج وقت',confidence:.8,action:'cancel_application',value:null,source:'model'}]};
const cancelGate=gate.enforceMutationConfirmationGate({actions:[{action:'cancel_application',sourceActId:'model-cancel',requiresConfirmation:false,authority:'model',requiredRole:'omran',payload:null}],turn:modelCancelTurn,state:{...baseState,pendingAction:'cancel_application',pendingActionPayload:{_mutationConfirmationRequired:true}},truth:refundTruth});
ok(cancelGate.actions.length===0,'already-cancelled/refund truth suppresses model-inferred duplicate cancel action');
ok(cancelGate.confirmationPrompt===null,'already-cancelled/refund truth cannot reopen cancel confirmation');
const timeTurn=interpreter.interpretTurn({turnId:'refund-time',customerText:'كم بحتاج وقت'});
const timeRepair=arbiter.arbitrateProductionReply({candidate:'أكدلي: نعم، ألغي الطلب',turn:timeTurn,state:{...baseState,lastAssistantText:'طلبك ملغي بالفعل، وطلب الاسترداد مسجل وقيد المعالجة.'},truth:refundTruth,actions:[]});
ok(timeRepair.obligation==='refund_timing','refund-stage ambiguous timing question is owned as refund timing');
ok(Boolean(timeRepair.reply)&&!/أكد|ألغي الطلب|الغي الطلب/.test(timeRepair.reply),'refund timing cannot fall back into cancellation confirmation');

// Refund process problem is a question about an existing action, not a new mutation.
ok(/refund_process_problem/.test(arbiterSrc),'response arbiter has refund process-problem obligation');
const linkTurn=interpreter.interpretTurn({turnId:'refund-link',customerText:'الرابط هذا ما فيه مكان ادخل فيه بيانات استرداد'});
const linkRepair=arbiter.arbitrateProductionReply({candidate:'أكد الاسترداد مرة ثانية',turn:linkTurn,state:baseState,truth:refundTruth,actions:[]});
ok(linkRepair.obligation==='refund_process_problem','broken refund form is classified as process problem');
ok(Boolean(linkRepair.reply)&&/طلب الاسترداد مسجل فعلًا/.test(linkRepair.reply),'refund form problem preserves existing refund truth');
ok(Boolean(linkRepair.reply)&&/لا تبعث بيانات الاسترداد الحساسة على واتساب/.test(linkRepair.reply),'refund form problem protects sensitive data from WhatsApp');
ok(Boolean(linkRepair.reply)&&!/أكد.*استرداد|تأكيد.*استرداد/.test(linkRepair.reply),'refund process problem never asks for duplicate refund confirmation');

// Five-JOD stage: direct payment-source question, stage awareness, and no internal-policy leakage.
ok(/sourceCompatibility/.test(semanticSrc),'payment semantic lock recognizes source-bank/wallet compatibility questions');
const feeApp={...baseApp,status:'customer_confirmed_continue',paymentStatus:'pending_payment',paymentConfirmedAt:null};
const feeTruth=mkTruth(feeApp);
const bankTurn=interpreter.interpretTurn({turnId:'bank-source',customerText:'بزبط احولهم من بنك الاتحاد؟'});
const bankLock=semantic.resolveSemanticQuestionLock({turn:bankTurn,truth:feeTruth});
ok(bankLock.kind==='file_opening_payment_method','bank-source question enters file-opening payment authority');
const bankReply=semantic.buildSemanticQuestionLockReply({lock:bankLock,turn:bankTurn,truth:feeTruth});
ok(Boolean(bankReply)&&/مش اسم البنك اللي بتحول منه/.test(bankReply),'bank-source question answers the actual compatibility question');
ok(Boolean(bankReply)&&/ما عندي توثيق يخليني أضمن توافق بنك بعينه/.test(bankReply),'bank-source answer does not invent bank compatibility');
ok(Boolean(bankReply)&&/PAYAMEEEN|AMEEN1ST|AM500337/.test(bankReply),'bank-source answer still exposes documented CliQ destinations');
ok(!/لا تفترض توافق محفظة\/بنك/.test(bankReply||''),'customer payment answer does not leak internal policy instruction');
const normalPaymentReply=commercial.buildPostDisclosurePaymentReply(feeTruth,'https://www.ameenfinance.co/receipt?tracking=AM-1790196677295');
ok(!normalPaymentReply.includes('لا تفترض توافق محفظة/بنك'),'normal five-JOD payment reply strips internal policy-only instruction');
ok(/Orange Money/.test(normalPaymentReply)&&/CliQ/.test(normalPaymentReply),'normal five-JOD payment reply preserves official payment channels');
ok(/تأكيد الدفع النهائي يتم يدويًا/.test(normalPaymentReply),'normal five-JOD payment reply preserves manual confirmation truth');

// Preserve recent architecture.
ok(/durableIngressTurnFreshness/.test(human),'Phase 11.5 durable ingress freshness remains intact');
ok(/currentTurnStillOwnsConversation/.test(human),'Phase 11.4 ownership checks remain intact');
ok(/syntheticMediaGroundedReply/.test(human),'Phase 11.6 media routing remains intact');
ok(!/orangmoney\.com/i.test(human+gateSrc+arbiterSrc+semanticSrc+commercialSrc+contractSrc),'cross-project literals are absent');
for(const file of [rel.human,rel.gate,rel.arbiter,rel.semantic,rel.commercial,rel.contract,rel.interpreter])transpile(file);
console.log(`\nV3 PHASE 11.6.1 SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed)process.exit(1);
console.log('Final response authority + satisfied mutation truth + five-JOD payment-path repair: PASS');
