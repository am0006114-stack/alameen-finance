const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = process.argv[2] || process.cwd();
const V3 = 'app/api/whatsapp/webhook/_lib/v3-os';
function rel(name){ return `${V3}/${name}`; }
function read(file){ return fs.readFileSync(path.join(root,file),'utf8'); }
let passed=0;
function ok(cond,msg){ if(!cond) throw new Error('FAIL: '+msg); passed++; console.log('PASS:',msg); }
function normalizeArabic(value){ return String(value||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/ة/g,'ه'); }
function loadTs(file,mocks={}){ const out=ts.transpileModule(read(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:file}); const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); if(errs.length) throw new Error(`TS ${file}: `+errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')); const module={exports:{}}; const req=(id)=>{if(Object.prototype.hasOwnProperty.call(mocks,id)) return mocks[id]; throw new Error(`Unmocked require ${id} from ${file}`)}; new Function('require','module','exports',out.outputText)(req,module,module.exports); return module.exports; }
function turn(raw,topics=[]){ return {turnId:'t1',rawText:raw,normalizedText:normalizeArabic(raw),acts:[],topics,requestedActions:[],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.9,warnings:[]}; }
function state(extra={}){ return {version:'v3',waId:'9627',activeApplicationId:'app1',activeTrackingId:'AM-1000000000001',currentTopic:null,currentGoal:null,role:{currentRole:'tala',tier:'frontline',reason:'',sinceTurnId:null,introduced:false},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,updatedAt:new Date().toISOString(),...extra}; }
function app(status='under_review',extra={}){ return {id:'app1',trackingId:'AM-1000000000001',fullName:'Test',phone:'0790000000',status,paymentStatus:'payment_confirmed',paymentConfirmedAt:'2026-09-07T06:00:00Z',paymentReference:'REF1',deviceId:null,deviceName:'iPhone 17 Pro Max',devicePrice:900,installmentMonths:36,downPayment:0,interestRate:15,monthlyPayment:36.69,totalWithInterest:1320,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:'2026-09-01T00:00:00Z',paidClickedAt:null,documents:{loaded:true,types:[],identityComplete:true,salarySlipUploaded:true,guarantorIdentityComplete:null,guarantorDataComplete:null,paymentReceiptUploaded:true},...extra}; }
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,fileOpeningFeeTiming:'',fileOpeningFeePurposeRule:'رسوم فتح الملف',fileOpeningFeeRefundRule:'مستردة عبر المسار الرسمي بعد دفع مؤكد',continuationReassuranceRule:'',firstInstallmentRule:'أول قسط بعد شهر من الاستلام وتوقيع العقد',pickupRule:'',secureDocumentsRule:'',independenceStatement:'الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق.',paymentAliases:['AMEEENPAY','AMENPAY'],paymentWalletType:'Orange Money',paymentBeneficiaryName:'ABDUL RAHMAN ALHARAHSHEH',paymentMethodRule:'التحويل إلى AMEEENPAY أو AMENPAY',paymentConfirmationRule:'',normalReviewWindow:'من يومين إلى 3 أيام عمل',reviewPressureLevel:'severe',severePressureRule:'',refundPressureRule:'',disputeResolutionRule:'',autonomousSupervisorRule:'',forbiddenClaims:[]};
function truth(a=app()){ return {confidence:'authoritative',source:'current_message_tracking',application:a,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}; }
function stageOf(a){ if(!a) return 'no_application'; const s=String(a.status||'').toLowerCase(); if(s==='preliminary_qualified') return 'preliminary_approved_waiting_decision'; if(['customer_confirmed_continue','under_review'].includes(s)) return 'final_review'; if(s==='cancelled') return 'cancelled'; if(s==='refund_requested') return 'refund_requested'; return s||'unknown'; }
function paid(a){ return Boolean(a && (a.paymentConfirmedAt || a.paymentReference || ['confirmed','paid','payment_confirmed','refund_requested','refund_processing','refund_completed','refunded'].includes(String(a.paymentStatus||'').toLowerCase()) || ['refund_requested','refund_processing','refund_completed','refunded'].includes(String(a.status||'').toLowerCase()))); }

const syntaxFiles=[
  'contextualTurnResolver.ts','conversationRecovery.ts','paymentEligibilityFirewall.ts','truthSnapshotLock.ts',
  'writerContract.ts','finalResponseGate.ts','legalTrustGuard.ts'
].map(rel);
for(const f of syntaxFiles){ const out=ts.transpileModule(read(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:f}); const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); ok(errs.length===0,'TypeScript syntax '+f); }

const ctx=loadTs(rel('contextualTurnResolver.ts'),{'./text':{normalizeArabic}});
let r=ctx.contextualTurnSignals({turn:turn('هل عندكم فيد باك و مسجلين و معتمدين؟'),state:state(),recentTurns:[]});
ok(r.registrationQuestion,'registration/accreditation question detected');
ok(r.trustConcern && r.topics.includes('legal'),'registration question maps to trust + legal');
r=ctx.contextualTurnSignals({turn:turn('مين الشركة القانونية الي رح يكون العقد باسمها؟'),state:state(),recentTurns:[]});
ok(r.contractingPartyQuestion,'contracting-party question detected');
ok(r.topics.includes('legal'),'contracting-party question gets legal topic');
r=ctx.contextualTurnSignals({turn:turn('تمام بس هل هي آمنة ولا لا؟'),state:state(),recentTurns:[]});
ok(r.safetyTrustQuestion && r.trustConcern,'safety/trust question detected');
r=ctx.contextualTurnSignals({turn:turn('انا طالبة جامعة وما عندي كشف راتب'),state:state(),recentTurns:[]});
ok(r.generalRequirements,'student/no salary-slip is requirements context');
r=ctx.contextualTurnSignals({turn:turn('بيزبط'),state:state({lastCustomerText:'انا طالبة جامعة وما عندي كشف راتب'}),recentTurns:[]});
ok(r.generalRequirements,'short "بيزبط" follows prior requirements context');

const legal=loadTs(rel('legalTrustGuard.ts'),{'./text':{normalizeArabic}});
ok(legal.contractingPartyQuestionText('العقد باسم مين؟'),'legal guard detects contract-name question');
ok(legal.registrationOrLicensingQuestionText('انتو مسجلين بالحكومة؟'),'legal guard detects registration question');
ok(legal.safetyTrustQuestionText('خايفة يكون نصب'),'legal guard detects scam concern');
let legalReply=legal.buildSafeContractingPartyReply();
ok(legalReply.includes('بين الشركة والعميل'),'safe contract reply states direct company-customer contract');
ok(!legalReply.includes('العقد رح يكون باسم الأمين للأقساط'),'safe contract reply does not invent legal entity name');
ok(legal.unsupportedLegalEntityClaim('العقد رح يكون باسم الأمين للأقساط',policy),'operating name cannot be promoted to legal contracting name');
ok(legal.trustLegalCommercialNudge('طلبك شغال وبانتظارك تدفع رسوم فتح الملف 5 دنانير'),'trust guard detects commercial nudge');

const pay=loadTs(rel('paymentEligibilityFirewall.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf},
  './paymentTruth':{hasAuthoritativePaymentConfirmation:paid},
  './text':{normalizeArabic},
});
let d=pay.paymentDisclosureDecision({application:app('customer_confirmed_continue',{paymentStatus:'pending_payment',paymentConfirmedAt:null,paymentReference:null,documents:{...app().documents,paymentReceiptUploaded:false}}),customerText:'مين الشركة القانونية الي رح يكون العقد باسمها؟',explicitContinuationThisTurn:false});
ok(!d.paymentExecutionDetailsAllowed && d.reason==='non_fee_payment_context','legal question cannot expose payment execution details after continuation');
d=pay.paymentDisclosureDecision({application:app('customer_confirmed_continue',{paymentStatus:'pending_payment',paymentConfirmedAt:null,paymentReference:null,documents:{...app().documents,paymentReceiptUploaded:false}}),customerText:'هل هي آمنة؟',explicitContinuationThisTurn:false});
ok(!d.paymentExecutionDetailsAllowed && d.reason==='non_fee_payment_context','trust question cannot expose payment execution details after continuation');
d=pay.paymentDisclosureDecision({application:app('customer_confirmed_continue',{paymentStatus:'pending_payment',paymentConfirmedAt:null,paymentReference:null,documents:{...app().documents,paymentReceiptUploaded:false}}),customerText:'ليش رسوم فتح الملف 5 دنانير؟',explicitContinuationThisTurn:false});
ok(!d.paymentExecutionDetailsAllowed && d.feeExplanationAllowed && d.reason==='fee_explanation_only','fee-why question explains fee without replaying transfer details');
d=pay.paymentDisclosureDecision({application:app('customer_confirmed_continue',{paymentStatus:'pending_payment',paymentConfirmedAt:null,paymentReference:null,documents:{...app().documents,paymentReceiptUploaded:false}}),customerText:'كيف ادفع رسوم فتح الملف 5 دنانير؟',explicitContinuationThisTurn:false});
ok(d.paymentExecutionDetailsAllowed,'explicit how-to-pay fee question remains eligible after continuation');
d=pay.paymentDisclosureDecision({application:app('preliminary_qualified',{paymentStatus:null,paymentConfirmedAt:null,paymentReference:null,documents:{...app().documents,paymentReceiptUploaded:false}}),customerText:'أود الاستمرار',explicitContinuationThisTurn:true});
ok(d.paymentExecutionDetailsAllowed,'core continuation still opens 5 JOD execution path');

const snap=loadTs(rel('truthSnapshotLock.ts'));
const previous=app('under_review',{paymentStatus:'payment_confirmed',paymentConfirmedAt:'2026-09-07T06:00:00Z',paymentReference:'REF1'});
const regressed=app('under_review',{paymentStatus:'pending_payment',paymentConfirmedAt:null,paymentReference:null});
let st=snap.stabilizeTruthSnapshot({truth:truth(regressed),state:null,previousTruth:truth(previous)});
ok(st.application.paymentConfirmedAt==='2026-09-07T06:00:00Z','truth snapshot preserves confirmed-at timestamp');
ok(st.application.paymentReference==='REF1','truth snapshot preserves payment reference');
ok(st.application.paymentStatus==='payment_confirmed','truth snapshot prevents payment status regression to pending');
ok(snap.paymentHistoricallyConfirmed(st.application),'stabilized truth remains authoritatively paid');

const gate=loadTs(rel('finalResponseGate.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:(a)=>stageOf(a)==='final_review'?'قيد الدراسة النهائية':stageOf(a)},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{products:'https://www.ameenfinance.co/products',tracking:'https://www.ameenfinance.co/track?tracking=AM-1000000000001&phone=0790000000'}})},
  './paymentEligibilityFirewall':pay,
  './mutationConfirmationGate':{mutationQuestion:()=>false,pendingActionIsCurrentTurnFocus:()=>false},
  './truthSnapshotLock':{paymentHistoricallyConfirmed:paid},
  './text':{normalizeArabic},
});
function runGate({reply,raw,a=app(),topics=[],stateExtra={},requestedActions=[]}){ const t=turn(raw,topics); t.requestedActions=requestedActions; return gate.enforceFinalResponseGate({reply,turn:t,state:state(stateExtra),truth:truth(a),actions:[],applicationChanged:false}); }

let g=runGate({
  reply:'وصل الدفع اللي رفعته وصلنا، وهو الآن بانتظار مراجعة الإدارة للاعتماد النهائي.',
  raw:'طيب مطولة الاجرات',
  topics:['review_timing'],
  a:app()
});
ok(!g.pass && g.severity==='p0','confirmed payment cannot regress to receipt awaiting approval');
ok(g.violations.includes('confirmed_payment_regressed_to_receipt_pending'),'payment regression has explicit P0 violation');
ok((g.replacementReply||'').includes('الدفع مؤكد إداريًا'),'payment-regression replacement preserves confirmed payment truth');
ok(!(g.replacementReply||'').includes('الوصل') || !(g.replacementReply||'').includes('بانتظار مراجعة الإدارة'),'payment-regression replacement does not put receipt back into pending');

g=runGate({
  reply:'وصول الوصل مؤكد، لكنه بانتظار اعتماد الإدارة.',
  raw:'شو صار بالدفع',
  topics:['payment_status'],
  a:app()
});
ok(!g.pass && g.violations.includes('confirmed_payment_regressed_to_receipt_pending'),'confirmed payment regression blocked outside timing turns too');

g=runGate({
  reply:'العقد رح يكون باسم الأمين للأقساط.',
  raw:'مين الشركة القانونية الي رح يكون العقد باسمها؟',
  topics:['legal'],
  a:app()
});
ok(!g.pass && g.violations.includes('unsupported_legal_registration_or_contracting_entity_claim'),'unsupported legal entity name is blocked');
ok((g.replacementReply||'').includes('بين الشركة والعميل'),'contracting-party replacement states the confirmed relationship');
ok((g.replacementReply||'').includes('الاسم القانوني المثبت على العقد'),'contracting-party replacement defers legal name to official contract');

g=runGate({
  reply:'إحنا مسجلين قانونيًا ومعتمدين.',
  raw:'انتو مسجلين ومعتمدين؟',
  topics:['legal','trust'],
  a:app()
});
ok(!g.pass && g.violations.includes('unsupported_legal_registration_or_contracting_entity_claim'),'unsupported registration/accreditation claim is blocked');
ok((g.replacementReply||'').includes('ما عندي حقيقة موثقة'),'registration replacement explicitly avoids guessing');

g=runGate({
  reply:'طلبك شغال وبانتظارك تدفعي رسوم فتح الملف 5 دنانير، وإذا بدك كملي واكتبي أود الاستمرار.',
  raw:'تمام بس هل هي آمنة ولا لا؟',
  topics:['trust'],
  a:app('customer_confirmed_continue',{paymentStatus:'pending_payment',paymentConfirmedAt:null,paymentReference:null,documents:{...app().documents,paymentReceiptUploaded:false}})
});
ok(!g.pass && g.violations.includes('trust_or_legal_turn_must_not_push_commercial_step'),'trust question cannot be turned into 5 JOD commercial nudge');
ok(!(g.replacementReply||'').includes('5 دنانير'),'trust replacement stays on trust question without fee nudge');

g=runGate({
  reply:'العقد بيكون مباشرة بين الشركة والعميل، ومش مع بنك أو شركة تمويل خارجية كطرف بالعقد. الاسم القانوني المرجع فيه هو العقد نفسه.',
  raw:'العقد مع مين؟',
  topics:['legal'],
  a:app()
});
ok(g.pass,'clean direct-contract answer passes');

g=runGate({
  reply:'تفاصيل الطلب مش كاملة عندي بهاللحظة، وما بدي أخمّن.',
  raw:'قبول طلب متا سيتم',
  topics:['review_timing'],
  a:null,
  stateExtra:{activeApplicationId:'app1',activeTrackingId:'AM-1788711369486'}
});
ok(!g.pass && g.violations.includes('review_timing_abandoned_for_missing_details'),'timing question cannot be abandoned just because current details are incomplete');
ok((g.replacementReply||'').includes('AM-1788711369486'),'timing replacement preserves known active tracking scope');
ok((g.replacementReply||'').includes('من يومين إلى 3 أيام عمل'),'timing replacement still answers timing safely');

g=runGate({
  reply:'بيانات الكفيل ممكن تكون هي الحل المناسب بما إنك طالبة.',
  raw:'انا طالبة وما عندي كشف راتب، بيزبط؟',
  topics:['requirements'],
  a:null
});
ok(!g.pass && g.violations.includes('unsupported_guarantor_acceptance_rule'),'guarantor cannot be presented as automatic solution');
ok((g.replacementReply||'').includes('مش شرط ثابت'),'safe guarantor replacement keeps conditional policy');

g=runGate({
  reply:'الأهلية بتعتمد على دراسة الملف من ناحية الدخل والالتزامات.',
  raw:'ممكن تشيك إذا يطلعلي لاني ماخذ جهازين؟',
  topics:['products'],
  a:null
});
ok(!g.pass && g.violations.includes('unsupported_eligibility_decision_rule'),'invented eligibility criteria are blocked');
ok((g.replacementReply||'').includes('ما بقدر أحكم على الأهلية'),'eligibility replacement avoids invented decision criteria');

g=runGate({
  reply:'بيانات الكفيل قد تُطلب حسب حالة الملف، والقرار النهائي بعد الدراسة.',
  raw:'لازم كفيل؟',
  topics:['requirements'],
  a:null
});
ok(g.pass,'clean conditional guarantor answer passes');

const cr=read(rel('conversationRecovery.ts'));
const wc=read(rel('writerContract.ts'));
const fg=read(rel('finalResponseGate.ts'));
const pf=read(rel('paymentEligibilityFirewall.ts'));
const tslock=read(rel('truthSnapshotLock.ts'));
ok(cr.includes('dialogueSignals.contractingPartyQuestion'),'conversation recovery owns contracting-party questions');
ok(cr.includes('dialogueSignals.registrationQuestion'),'conversation recovery owns registration questions');
ok(cr.includes('paymentHistoricallyConfirmed(app)'),'conversation recovery protects confirmed-payment receipt handling');
ok(wc.includes('PAYMENT_CONFIRMED_TRUTH'),'writer receives explicit monotonic payment truth');
ok(wc.includes('DIRECT_CONTRACT_RULE'),'writer receives direct company-customer contract rule');
ok(wc.includes('POLICY.businessName اسم تشغيلي'),'writer distinguishes operating name from legal entity name');
ok(wc.includes('لا تحوّل الرد إلى تذكير بالـ5 دنانير'),'writer trust context forbids fee nudge');
ok(wc.includes('لا تقل إن الكفيل "هو الحل"'),'writer forbids guarantor-as-solution claim');
ok(fg.includes('confirmed_payment_regressed_to_receipt_pending'),'final gate owns monotonic payment egress guard');
ok(fg.includes('unsupported_legal_registration_or_contracting_entity_claim'),'final gate owns legal truth guard');
ok(fg.includes('trust_or_legal_turn_must_not_push_commercial_step'),'final gate owns trust commercial-nudge guard');
ok(fg.includes('review_timing_abandoned_for_missing_details'),'final gate owns timing continuity guard');
ok(fg.includes('unsupported_eligibility_decision_rule'),'final gate owns eligibility-criteria guard');
ok(pf.includes('fee_explanation_only'),'payment firewall separates fee explanation from transfer execution');
ok(tslock.includes('previousConfirmed && !currentConfirmed'),'truth snapshot makes payment confirmation monotonic');

console.log(`SELFTEST PASSED ${passed}/${passed} - V3 PHASE 7.3.5 LEGAL TRUTH + MONOTONIC PAYMENT + TRUST GUARD`);
