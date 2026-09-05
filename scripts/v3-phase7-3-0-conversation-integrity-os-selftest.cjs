const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = process.argv[2] || process.cwd();
const V3 = 'app/api/whatsapp/webhook/_lib/v3-os';
function rel(name){ return `${V3}/${name}`; }
function read(file){ return fs.readFileSync(path.join(root,file),'utf8'); }
let passed = 0;
function ok(cond,msg){ if(!cond) throw new Error('FAIL: '+msg); passed++; console.log('PASS:',msg); }

const files = [
  rel('applicationScopeLock.ts'),
  rel('contextualTurnResolver.ts'),
  rel('paymentEligibilityFirewall.ts'),
  rel('finalResponseGate.ts'),
  rel('integrityTelemetry.ts'),
  rel('conversationRecovery.ts'),
  rel('runtimeLive.ts'),
  rel('verifier.ts'),
  rel('writerContract.ts'),
  rel('zeroFallback.ts'),
];
const src = Object.fromEntries(files.map(f=>[f,read(f)]));
for(const [f,s] of Object.entries(src)){
  const out=ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:f});
  const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  ok(errs.length===0,'TypeScript syntax '+f);
}

function normalizeArabic(value){
  return String(value||'').toLowerCase()
    .replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
    .replace(/[ًٌٍَُِّْـ]/g,'').replace(/ة/g,'ه');
}
function loadTs(file,mocks={}){
  const code=ts.transpileModule(read(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  const req=(id)=>{ if(Object.prototype.hasOwnProperty.call(mocks,id)) return mocks[id]; throw new Error(`Unmocked require ${id} from ${file}`); };
  new Function('require','module','exports',code)(req,module,module.exports);
  return module.exports;
}
function baseTurn(raw){ return {turnId:'t1',rawText:raw,normalizedText:normalizeArabic(raw),acts:[],topics:[],requestedActions:[],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.9,warnings:[]}; }
function baseState(){ return {version:'v3.0.0-phase7.1.1-truth-locked-actions',waId:'9627',activeApplicationId:null,activeTrackingId:null,currentTopic:null,currentGoal:null,role:{currentRole:'tala',tier:'frontline',reason:'',sinceTurnId:null,introduced:false},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,updatedAt:new Date().toISOString()}; }
function app(status='preliminary_qualified',extra={}){ return {id:'app-new',trackingId:'AM-1788618061022',fullName:'Test User',phone:'0790000000',status,paymentStatus:null,paymentConfirmedAt:null,paymentReference:null,deviceId:null,deviceName:'iPhone 16',devicePrice:654.55,installmentMonths:24,downPayment:0,interestRate:15,monthlyPayment:27.71,totalWithInterest:null,salary:null,deliveryDelayUntil:null,documents:{loaded:true,types:[],identityComplete:true,salarySlipUploaded:true,guarantorIdentityComplete:null,guarantorDataComplete:null,paymentReceiptUploaded:false},...extra}; }
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,fileOpeningFeeTiming:'',fileOpeningFeePurposeRule:'',fileOpeningFeeRefundRule:'',continuationReassuranceRule:'',firstInstallmentRule:'أول قسط بعد شهر من الاستلام وتوقيع العقد',pickupRule:'الاستلام من المكتب فقط بموعد رسمي',secureDocumentsRule:'',independenceStatement:'الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق.',paymentAliases:['AMEEENPAY','AMENPAY'],paymentWalletType:'Orange Money',paymentBeneficiaryName:'ABDUL RAHMAN ALHARAHSHEH',paymentMethodRule:'حوّل عبر CliQ إلى AMEEENPAY أو AMENPAY',paymentConfirmationRule:'',normalReviewWindow:'من يومين لـ3 أيام عمل',reviewPressureLevel:'severe',severePressureRule:'',refundPressureRule:'',disputeResolutionRule:'',autonomousSupervisorRule:'',forbiddenClaims:[]};
function truth(a){ return {confidence:a?'authoritative':'none',source:a?'current_message_tracking':'none',application:a||null,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}; }

// Execute the actual contextual resolver with only its runtime dependency mocked.
const ctx = loadTs(rel('contextualTurnResolver.ts'),{'./text':{normalizeArabic}});
const timingCases=[
  'متى بتردولي خبر','بدي اعرف متى بتحكولي قبلتو طلبي او لا','متى الموافقة بتيجي','متى يخلص الطلب','امتى القرار يطلع',
  'للحين ما صدر موافقه','صارلي اسبوع استنى','متى بتتغير الحالة','متى النتيجة','قديش بده وقت للمراجعة'
];
for(const q of timingCases){ const r=ctx.contextualTurnSignals({turn:baseTurn(q),state:baseState(),recentTurns:[]}); ok(r.reviewTiming,`context review timing: ${q}`); }
let st=baseState(); st.lastAssistantText='إذا سؤالك عن وقت المراجعة بعطيك المدة حسب حالة الطلب';
for(const q of ['اه','نعم','طيب']){ const r=ctx.contextualTurnSignals({turn:baseTurn(q),state:st,recentTurns:[]}); ok(r.reviewTiming,`short affirmative keeps timing context: ${q}`); }
for(const q of ['موجود ايفون 11؟','متوفر آيفون 13 برو ماكس','عندكم iphone 16','في عندكم جهاز سامسونج؟','ايفون 11 موجود عندكم؟']){ const r=ctx.contextualTurnSignals({turn:baseTurn(q),state:baseState(),recentTurns:[]}); ok(r.productAvailability,`general product availability: ${q}`); }
for(const q of ['شو يضمن حقي','مبينه نصبه','لا يوجد مصداقية لديكم','انتو مسجلين قانونيا صح؟','خايفة من النصب']){ const r=ctx.contextualTurnSignals({turn:baseTurn(q),state:baseState(),recentTurns:[]}); ok(r.trustConcern,`trust concern detected: ${q}`); }
for(const q of ['اريد شخص اتكلم معاه','بدي موظف احكي معه','حولني على شخص','بدي حدا يرد علي']){ const r=ctx.contextualTurnSignals({turn:baseTurn(q),state:baseState(),recentTurns:[]}); ok(r.humanRequest,`human request detected: ${q}`); }
for(const q of ['دفعت الرسوم انا','حولت الخمسه','تم الدفع','رفعت الوصل']){ const r=ctx.contextualTurnSignals({turn:baseTurn(q),state:baseState(),recentTurns:[]}); ok(r.paymentStatusClaim,`customer payment claim detected: ${q}`); }
for(const q of ['شو الخطوة التالية','الخطوة التالية','شو ضل','طيب وبعدين']){ const r=ctx.contextualTurnSignals({turn:baseTurn(q),state:baseState(),recentTurns:[]}); ok(r.nextStep,`next-step follow-up detected: ${q}`); }

// Execute the actual application scope lock.
const scope = loadTs(rel('applicationScopeLock.ts'),{'./text':{normalizeArabic}});
let old=baseState(); old.activeApplicationId='app-old'; old.activeTrackingId='AM-1787000000000'; old.pendingAction='cancel_application'; old.pendingActionPayload={_manualStatus:'awaiting_admin'}; old.currentTopic='cancellation'; old.openLoops=[{id:'x'}]; old.facts=[{key:'device'}]; old.lastAssistantText='old context';
let sr=scope.scopeStateToCurrentApplication({state:old,truth:truth(app()),customerText:'مرحبا طلبي AM-1788618061022'});
ok(sr.applicationChanged,'explicit new tracking creates application boundary');
ok(sr.state.pendingAction===null,'old pending cancel is cleared on application switch');
ok(sr.state.pendingActionPayload===null,'old pending payload is cleared on application switch');
ok(sr.state.openLoops.length===0 && sr.state.facts.length===0,'old application loops/facts reset');
ok(sr.state.lastAssistantText===null,'old assistant context reset on application switch');
ok(sr.droppedPendingAction==='cancel_application','scope lock reports dropped dangerous action');
let phoneResolved=baseState(); phoneResolved.activeApplicationId='app-old'; phoneResolved.activeTrackingId='AM-1787000000000'; phoneResolved.pendingAction='cancel_application'; phoneResolved.pendingActionPayload={_scopeApplicationId:'app-old'};
const phoneTruth={...truth(app()),source:'unique_phone_match'};
sr=scope.scopeStateToCurrentApplication({state:phoneResolved,truth:phoneTruth,customerText:'مرحبا بدي اتابع طلبي'});
ok(sr.applicationChanged && sr.state.pendingAction===null,'application identity switch via authoritative phone resolution also clears old pending action');
let same=baseState(); same.activeApplicationId='app-new'; same.activeTrackingId='AM-1788618061022'; same.pendingAction='cancel_application'; same.pendingActionPayload={_manualStatus:'awaiting_admin',_scopeApplicationId:'app-new'};
sr=scope.scopeStateToCurrentApplication({state:same,truth:truth(app()),customerText:'AM-1788618061022'});
ok(!sr.applicationChanged && sr.state.pendingAction==='cancel_application','same-application scoped pending action remains valid');
let mism=baseState(); mism.activeApplicationId='app-new'; mism.activeTrackingId='AM-1788618061022'; mism.pendingAction='request_refund'; mism.pendingActionPayload={_manualStatus:'awaiting_admin',_scopeApplicationId:'app-other'};
sr=scope.scopeStateToCurrentApplication({state:mism,truth:truth(app()),customerText:'متابعة طلبي'});
ok(sr.state.pendingAction===null && sr.reason==='pending_action_scope_mismatch','payload scope mismatch is rejected');
let legacy=baseState(); legacy.pendingAction='cancel_application'; legacy.pendingActionPayload={_manualStatus:'awaiting_admin'};
sr=scope.scopeStateToCurrentApplication({state:legacy,truth:truth(app()),customerText:'AM-1788618061022'});
ok(sr.state.pendingAction===null,'unprovable legacy pending action is rejected on explicit tracking');
let staleTurn=baseTurn('مرحباً، قدمت طلب موافقة مبدئية AM-1788618061022'); staleTurn.acts=[{id:'a',type:'request_action',topic:'cancellation',text:staleTurn.rawText,action:'cancel_application',confidence:.7,source:'model'}]; staleTurn.topics=['application_status','cancellation']; staleTurn.requestedActions=['cancel_application'];
let scopedTurn=scope.scopeTurnToCurrentApplication({turn:staleTurn,applicationChanged:true});
ok(!scopedTurn.requestedActions.includes('cancel_application'),'stale cancel intent removed from new application turn');
ok(!scopedTurn.topics.includes('cancellation'),'stale cancellation topic removed from new application turn');
ok(scopedTurn.warnings.includes('application_scope_reset'),'application scope reset is visible to downstream writer');
let cancelTurn=baseTurn('الغوا الطلب AM-1788618061022'); cancelTurn.acts=[{id:'a',type:'request_action',topic:'cancellation',text:cancelTurn.rawText,action:'cancel_application',confidence:.99,source:'deterministic'}]; cancelTurn.topics=['cancellation']; cancelTurn.requestedActions=['cancel_application'];
scopedTurn=scope.scopeTurnToCurrentApplication({turn:cancelTurn,applicationChanged:true});
ok(scopedTurn.requestedActions.includes('cancel_application'),'explicit current-turn cancel survives scope reset');
const filteredStalePlan=scope.filterPlannedActionsForApplicationScope({actions:[{action:'cancel_application',sourceActId:'x',requiresConfirmation:false,authority:'deterministic',requiredRole:'omran'}],turn:staleTurn,applicationChanged:true});
ok(filteredStalePlan.actions.length===0 && filteredStalePlan.dropped[0]?.action==='cancel_application','planned stale scoped action is blocked before execution on application switch');
const filteredExplicitPlan=scope.filterPlannedActionsForApplicationScope({actions:[{action:'cancel_application',sourceActId:'x',requiresConfirmation:false,authority:'deterministic',requiredRole:'omran'}],turn:scopedTurn,applicationChanged:true});
ok(filteredExplicitPlan.actions.length===1 && filteredExplicitPlan.dropped.length===0,'explicit current-turn scoped action remains executable on application switch');
const stamped=scope.stampActionScope({action:'cancel_application',sourceActId:'a',requiresConfirmation:false,authority:'deterministic',requiredRole:'omran',payload:null},truth(app()),'t77');
ok(stamped.payload._scopeApplicationId==='app-new','planned action is stamped with application id');
ok(stamped.payload._scopeTrackingId==='AM-1788618061022','planned action is stamped with tracking id');
ok(stamped.payload._scopeTurnId==='t77','planned action is stamped with turn id');
ok(scope.pendingActionMatchesCurrentApplication({state:same,truth:truth(app())}),'scoped pending action matches same application');

// Execute the actual payment firewall with controlled truth helpers.
function stageOf(a){
  if(!a) return 'no_application';
  const s=String(a.status||'').toLowerCase();
  if(s==='preliminary_application') return 'preliminary_review';
  if(s==='preliminary_qualified') return 'preliminary_approved_waiting_decision';
  if(s==='cancelled') return 'cancelled';
  if(s==='refund_requested') return 'refund_requested';
  if(['under_review','customer_confirmed_continue'].includes(s)) return 'final_review';
  return s || 'unknown';
}
function paid(a){ return Boolean(a && (a.paymentConfirmedAt || ['confirmed','paid','payment_confirmed'].includes(String(a.paymentStatus||'').toLowerCase()))); }
const pay = loadTs(rel('paymentEligibilityFirewall.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf},
  './paymentTruth':{hasAuthoritativePaymentConfirmation:paid},
  './text':{normalizeArabic},
});
let pd=pay.paymentDisclosureDecision({application:null,customerText:'كيف الدفع',explicitContinuationThisTurn:false});
ok(!pd.paymentExecutionDetailsAllowed,'no application never exposes payment destination');
pd=pay.paymentDisclosureDecision({application:app('preliminary_qualified'),customerText:'كيف الدفع',explicitContinuationThisTurn:false});
ok(!pd.paymentExecutionDetailsAllowed && pd.feeExplanationAllowed,'preliminary approval explains fee but hides execution details');
pd=pay.paymentDisclosureDecision({application:app('preliminary_qualified'),customerText:'أود الاستمرار',explicitContinuationThisTurn:true});
ok(pd.paymentExecutionDetailsAllowed && pd.receiptLinkAllowed,'explicit continuation opens payment execution details');
pd=pay.paymentDisclosureDecision({application:app('customer_confirmed_continue',{paymentStatus:'pending_payment'}),customerText:'كيف احول',explicitContinuationThisTurn:false});
ok(pd.paymentExecutionDetailsAllowed,'persisted continuation keeps payment details available');
pd=pay.paymentDisclosureDecision({application:app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-05T10:00:00Z'}),customerText:'كيف احول',explicitContinuationThisTurn:false});
ok(!pd.paymentExecutionDetailsAllowed && pd.alreadyPaid,'confirmed payment blocks duplicate payment instructions');
pd=pay.paymentDisclosureDecision({application:app('customer_confirmed_continue',{documents:{...app().documents,paymentReceiptUploaded:true}}),customerText:'كيف احول',explicitContinuationThisTurn:false});
ok(!pd.paymentExecutionDetailsAllowed && pd.receiptPending,'pending receipt blocks duplicate payment instructions');
ok(pay.containsRestrictedPaymentExecutionDetail('حول إلى AMEEENPAY',policy),'alias recognized as restricted payment detail');
ok(pay.containsRestrictedPaymentExecutionDetail('اسم المستفيد ABDUL RAHMAN ALHARAHSHEH',policy),'beneficiary recognized as restricted payment detail');
ok(pay.containsRestrictedPaymentExecutionDetail('https://www.ameenfinance.co/receipt?tracking=AM-1',policy),'receipt URL recognized as restricted payment detail');
ok(!pay.containsRestrictedPaymentExecutionDetail('رسوم فتح الملف 5 دنانير ومستردة',policy),'fee explanation alone is allowed before continuation');

// Execute the final response gate.
const gate = loadTs(rel('finalResponseGate.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:(a)=>stageOf(a)},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{products:'https://www.ameenfinance.co/products'}})},
  './paymentEligibilityFirewall':pay,
  './text':{normalizeArabic},
});
function gateRun({reply,raw='متابعة',a=app('preliminary_qualified'),topics=[],actions=[],changed=false,state=baseState()}){ const turn={...baseTurn(raw),topics,requestedActions:topics.includes('continuation')?['continue_application']:[]}; return gate.enforceFinalResponseGate({reply,turn,state,truth:truth(a),actions,applicationChanged:changed}); }
let gr=gateRun({reply:'حوّل إلى AMEEENPAY وبعدها ارفع https://www.ameenfinance.co/receipt?tracking=x',raw:'كيف الدفع'});
ok(!gr.pass && gr.severity==='p0','final gate blocks payment destination before continuation');
ok(gr.replacementReply && !gr.replacementReply.includes('AMEEENPAY'),'payment leak replacement removes restricted alias');
gr=gateRun({reply:'إذا سؤالك عام ابعث رقم التتبع',raw:'موجود ايفون 11؟',topics:['products'],a:null});
ok(!gr.pass && gr.violations.includes('product_question_wrong_tracking_fallback'),'final gate blocks tracking fallback on general product question');
ok(gr.replacementReply.includes('/products'),'product fallback points to official products page');
gr=gateRun({reply:'الأمين جهة معروفة ومسجلين قانونيا',raw:'شو يضمن حقي؟',topics:['trust']});
ok(!gr.pass && gr.violations.includes('unsupported_trust_or_registration_claim'),'unsupported trust/legal claim is blocked');
gr=gateRun({reply:'الطلب AM-1787000000000 لسا قيد المراجعة',raw:'طلبي AM-1788618061022',changed:true});
ok(!gr.pass && gr.violations.includes('old_application_tracking_leaked_after_switch'),'old tracking cannot leak after application switch');
gr=gateRun({reply:'تم إلغاء طلبك',raw:'طلبي AM-1788618061022',changed:true,actions:[{action:'cancel_application',outcome:'executed',executed:true,authoritativeSummary:null,mutationId:'m',blocker:null}]});
ok(!gr.pass && gr.severity==='p0' && gr.violations.some(x=>x.startsWith('cross_application_mutation_executed')),'cross-application mutation is P0 fail-closed');
const explicitCancelGateTurn={...baseTurn('الغوا الطلب AM-1788618061022'),topics:['cancellation'],requestedActions:['cancel_application']};
gr=gate.enforceFinalResponseGate({reply:'تم إلغاء طلبك AM-1788618061022 بنجاح.',turn:explicitCancelGateTurn,state:baseState(),truth:truth(app('cancelled')),actions:[{action:'cancel_application',outcome:'executed',executed:true,authoritativeSummary:null,mutationId:'m',blocker:null}],applicationChanged:true});
ok(gr.pass,'explicit cancel on newly selected current application is not falsely treated as cross-application mutation');
gr=gateRun({reply:'حول 5 دنانير إلى AMEEENPAY',raw:'لا أرغب بالاستمرار'});
ok(!gr.pass && gr.severity==='p0','explicit opt-out can never emit payment instructions');
gr=gateRun({reply:'الطلب لسا ما وصل لمرحلة رسوم فتح الملف',raw:'دفعت الرسوم انا',topics:['payment_status']});
ok(!gr.pass && gr.violations.includes('customer_payment_claim_contradicted_by_stage_template'),'customer payment claim cannot be denied by stale stage template');
ok(gr.replacementReply.includes('بتقول إنك دفعت'),'payment-claim replacement acknowledges customer without false confirmation');
gr=gateRun({reply:'تمام، هيك بنكمّل. رسوم فتح الملف 5 دنانير، حول إلى AMEEENPAY.',raw:'أود الاستمرار',topics:['continuation']});
ok(gr.pass,'explicit continuation may expose approved payment destination');
gr=gateRun({reply:'طلبك قيد الدراسة النهائية. المعدل الطبيعي من يومين لـ3 أيام عمل وفي ضغط مراجعات.',raw:'متى بتردولي خبر',a:app('under_review'),topics:['review_timing']});
ok(gr.pass,'clean review timing reply passes final gate');
gr=gateRun({reply:'الطلب AM-1788618061022 مربوط بالمحادثة. احكيلي النقطة اللي بدك تعرفها',raw:'متى؟',a:app('under_review'),topics:['review_timing']});
ok(!gr.pass && gr.violations.includes('robotic_escape_phrase'),'known robotic escape phrase is blocked');

// Static architecture ordering and invariants.
const rt=src[rel('runtimeLive.ts')], cr=src[rel('conversationRecovery.ts')], zf=src[rel('zeroFallback.ts')], vr=src[rel('verifier.ts')], wc=src[rel('writerContract.ts')], sl=src[rel('applicationScopeLock.ts')], pf=src[rel('paymentEligibilityFirewall.ts')], fg=src[rel('finalResponseGate.ts')], ct=src[rel('contextualTurnResolver.ts')], tel=src[rel('integrityTelemetry.ts')];
ok(rt.includes('scopeStateToCurrentApplication'),'runtime imports central application scope lock');
ok(rt.indexOf('scopeStateToCurrentApplication') < rt.indexOf('buildReplyPlan({ turn, state: boundState'),'application scope is resolved before planning');
ok(rt.indexOf('buildReplyPlan({ turn, state: boundState') < rt.indexOf('executeActions({'),'planning occurs after scope reset and before execution');
ok(rt.includes('pendingActionMatchesCurrentApplication'),'pending scoped actions require exact application match');
ok(rt.includes('plan.actions.map((action) => stampActionScope'),'all planned actions receive application/turn scope');
ok(rt.includes('filterPlannedActionsForApplicationScope'),'runtime blocks unrequested scoped actions before execution on application switch');
ok(rt.includes('planned_action_scope_blocked'),'blocked planned actions emit P0 telemetry before execution');
ok(rt.includes('const scopedRecentTurns = scopeResult.applicationChanged ? [] : safeRecentTurns'),'old conversation history is cut at application boundary');
ok(rt.includes('pending_action_scope_blocked'),'scope violations emit structured telemetry');
ok(rt.includes('منع انتقال إجراء من طلب سابق إلى طلب جديد'),'scope violation emits actionable Discord alert');
ok(rt.includes('const protectedFiveJodStep = continuationRevenueReadyAtDecision'),'7.2.1 protected 5 JOD decision remains intact');
ok(rt.indexOf('FINAL 5 JOD REVENUE INVARIANT') < rt.indexOf('let finalGate = enforceFinalResponseGate'),'final integrity gate runs after protected 5 JOD invariant');
ok(rt.includes('verification.pass && finalGate.pass'),'send safety requires both verifier and final gate');
ok(rt.includes('stampPendingPayloadScope(manualStatePayload'),'new manual pending state is application scoped');
ok(rt.includes('LIVE_SCOPED_MUTATIONS'),'existing scoped Real Actions architecture retained');
ok(rt.includes('cancel_application') && rt.includes('request_refund'),'cancel/refund real-action references retained');
ok(!rt.includes('رقم الطلب المرتبط بالمحادثة عندي'),'runtime no longer contains old robotic tracking phrase');
ok(sl.includes('_scopeApplicationId') && sl.includes('_scopeTrackingId') && sl.includes('_scopeTurnId'),'scope metadata includes application tracking and turn');
ok(sl.includes('application_identity_switch'),'scope lock records application identity switch reason');
ok(sl.includes('legacy_pending_action_scope_unproven'),'legacy pending actions fail safe when scope cannot be proven');
ok(sl.includes('acts = input.turn.acts.filter'),'stale interpreted actions are stripped on application switch');
ok(sl.includes('filterPlannedActionsForApplicationScope'),'application scope module provides pre-execution planned-action gate');
ok(pf.includes('paymentExecutionDetailsAllowed'),'payment firewall has explicit execution-details permission');
ok(pf.includes('payment_already_confirmed'),'payment firewall blocks already-confirmed duplicate charge');
ok(pf.includes('receipt_pending_admin'),'payment firewall blocks receipt-pending duplicate charge');
ok(pf.includes('awaiting_explicit_continuation'),'payment firewall differentiates fee transparency from transfer permission');
ok(fg.includes('payment_execution_details_not_allowed'),'final egress gate enforces payment firewall');
ok(fg.includes('cross_application_mutation_executed'),'final egress gate detects impossible cross-application mutation');
ok(fg.includes('old_application_tracking_leaked_after_switch'),'final egress gate prevents old tracking leakage');
ok(fg.includes('customer_payment_claim_contradicted_by_stage_template'),'final gate protects customer payment claims from stale stage template');
ok(tel.includes('[V3_CONVERSATION_INTEGRITY]'),'structured integrity telemetry marker exists');
ok(rt.includes('severity: finalGate.severity === "none" ? "info" : finalGate.severity'),'final-gate telemetry maps non-incident severity to info for TypeScript compatibility');
ok(cr.includes('contextualTurnSignals'),'conversation recovery uses deterministic contextual dialogue resolver');
ok(cr.includes('contextual_followup'),'short follow-ups preserve context explicitly');
ok(cr.includes('product_availability'),'general product questions get a deterministic topic');
ok(cr.includes('trust_concern'),'trust concern is not lost behind another intent');
ok(cr.includes('customer_claimed_payment'),'customer payment claim gets explicit dialogue fact');
ok(cr.includes('فاهم إنك بدك تحكي مع حدا مباشرة'),'human request has a dedicated non-looping response');
ok(cr.includes('explicitDoNotContinueText'),'opt-out veto retained');
ok(cr.includes('buildMandatoryFiveJodContinuationReply'),'mandatory 5 JOD reply retained');
ok(wc.includes('PAYMENT_EXECUTION_DETAILS_ALLOWED'),'writer receives payment firewall decision');
ok(wc.includes('APPLICATION_SCOPE_RESET'),'writer is told when application context resets');
ok(wc.includes('ولا تطلب منه دفعًا ثانيًا'),'writer contract protects payment claim from duplicate charge');
ok(wc.includes('productAvailability=true'),'writer handles general product availability directly');
ok(wc.includes('trustConcern=true'),'writer handles trust concern in same turn');
ok(wc.includes('الرسالة الواحدة قد تحتوي طلب إجراء + تخوف/شكوى + سؤال'),'writer contract explicitly supports multi-topic turns');
ok(wc.includes('تجنب افتراض جنس العميل'),'writer avoids unsupported gender assumptions');
ok(vr.includes('payment_firewall_blocked_execution_details'),'verifier independently enforces payment firewall');
ok(vr.includes('product_question_wrong_tracking_fallback'),'verifier rejects product-to-tracking fallback');
ok(vr.includes('unsupported_trust_or_registration_claim'),'verifier rejects unsupported trust/legal claims');
ok(vr.includes('robotic_generic_fallback_language'),'verifier keeps robotic-language rejection');
ok(zf.includes('paymentDisclosureDecision'),'zero fallback uses same central payment firewall');
ok(zf.includes('dialogueSignals.productAvailability'),'zero fallback handles product questions directly');
ok(zf.includes('dialogueSignals.trustConcern'),'zero fallback handles trust concerns directly');
ok(zf.includes('dialogueSignals.paymentStatusClaim'),'zero fallback acknowledges customer payment claims safely');
ok(!zf.includes('رقم الطلب المرتبط بالمحادثة عندي'),'zero fallback old robotic tracking phrase remains removed');
ok(ct.includes('shortAffirmative') && ct.includes('contextIsTiming'),'context resolver links short yes/طيب to prior timing topic');
ok(ct.includes('productAvailability') && ct.includes('trustConcern') && ct.includes('paymentStatusClaim'),'context resolver covers product/trust/payment claim domains');

console.log(`SELFTEST PASSED ${passed}/${passed} - V3 PHASE 7.3.0 CONVERSATION INTEGRITY OS`);
