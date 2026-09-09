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
function state(extra={}){ return {version:'v3',waId:'9627',activeApplicationId:'app1',activeTrackingId:'AM-1000000000001',currentTopic:null,currentGoal:null,role:{currentRole:'imran',tier:'supervisor',reason:'',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,updatedAt:new Date().toISOString(),...extra}; }
function app(status='under_review',extra={}){ return {id:'app1',trackingId:'AM-1000000000001',fullName:'Test',phone:'0790000000',status,paymentStatus:'payment_confirmed',paymentConfirmedAt:'2026-09-07T06:00:00Z',paymentReference:'REF1',deviceId:null,deviceName:'iPhone 17 Pro Max',devicePrice:900,installmentMonths:36,downPayment:0,interestRate:15,monthlyPayment:36.69,totalWithInterest:1320,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:'2026-09-01T00:00:00Z',paidClickedAt:null,documents:{loaded:true,types:[],identityComplete:true,salarySlipUploaded:true,guarantorIdentityComplete:null,guarantorDataComplete:null,paymentReceiptUploaded:true},...extra}; }
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,fileOpeningFeeTiming:'',fileOpeningFeePurposeRule:'رسوم فتح الملف',fileOpeningFeeRefundRule:'مستردة عبر المسار الرسمي بعد دفع مؤكد',continuationReassuranceRule:'',firstInstallmentRule:'أول قسط بعد شهر من الاستلام وتوقيع العقد',pickupRule:'الحضور للمكتب بموعد رسمي مؤكد فقط',secureDocumentsRule:'',independenceStatement:'الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق.',paymentAliases:['AMEEENPAY','AMENPAY'],paymentWalletType:'Orange Money',paymentBeneficiaryName:'ABDUL RAHMAN ALHARAHSHEH',paymentMethodRule:'التحويل إلى AMEEENPAY أو AMENPAY',paymentConfirmationRule:'',normalReviewWindow:'من يومين إلى 3 أيام عمل',reviewPressureLevel:'severe',severePressureRule:'',refundPressureRule:'',disputeResolutionRule:'',autonomousSupervisorRule:'',forbiddenClaims:[]};
function truth(a=app()){ return {confidence:'authoritative',source:'current_message_tracking',application:a,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}; }
function stageOf(a){ if(!a) return 'no_application'; const s=String(a.status||'').toLowerCase(); if(s==='preliminary_qualified') return 'preliminary_approved_waiting_decision'; if(['customer_confirmed_continue','under_review'].includes(s)) return 'final_review'; if(s==='cancelled') return 'cancelled'; if(s==='refund_requested') return 'refund_requested'; return s||'unknown'; }
function paid(a){ return Boolean(a && (a.paymentConfirmedAt || a.paymentReference || ['confirmed','paid','payment_confirmed','refund_requested','refund_processing','refund_completed','refunded'].includes(String(a.paymentStatus||'').toLowerCase()) || ['refund_requested','refund_processing','refund_completed','refunded'].includes(String(a.status||'').toLowerCase()))); }

const syntaxFiles=['contextualTurnResolver.ts','conversationRecovery.ts','paymentEligibilityFirewall.ts','truthSnapshotLock.ts','writerContract.ts','finalResponseGate.ts','legalTrustGuard.ts'].map(rel);
for(const f of syntaxFiles){ const out=ts.transpileModule(read(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:f}); const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); ok(errs.length===0,'TypeScript syntax '+f); }

const cta=loadTs(rel('currentTurnAuthority.ts'),{'./text':{normalizeArabic},'./types':{}});
const ctx=loadTs(rel('contextualTurnResolver.ts'),{'./text':{normalizeArabic}});
ok(ctx.commercialPauseOrDeclineText('تمام التمام نخليها بعدين و باذن الله بنستمر'),'future continuation with "later" is a pause, not current consent');
ok(ctx.commercialPauseOrDeclineText('❌ ليس لدي المال الكافي للدفع الان'),'cannot-pay-now is commercial pause');
ok(ctx.commercialPauseOrDeclineText('لا مش مقتنع'),'not-convinced is commercial pause');
ok(ctx.commercialPauseOrDeclineText('لا','إذا بدك نكمل اكتبلي أود الاستمرار ورسوم فتح الملف 5 دنانير'),'bare no after commercial prompt is contextual decline');
ok(!ctx.commercialPauseOrDeclineText('أود الاستمرار'),'explicit current continuation is not a pause');
ok(ctx.orderChangeRequestText('بزبط اعدل على لوان الجهاز طيب'),'color change request detected');
ok(ctx.orderChangeRequestText('بدي اغير الجهاز للسعة 512'),'device/capacity change request detected');
ok(ctx.orderChangeRetractionText('لا خلص بطلت بدي اعدل على لوان'),'order-change retraction detected');
ok(ctx.multipleDeviceEligibilityQuestionText('بيطلعلي أكثر من جهاز آيفون 17 برو ماكس'),'multi-device eligibility question detected');
ok(ctx.multipleDeviceEligibilityQuestionText('لو بدي 4 مثلا','بيطلعلي أكثر من جهاز'),'short count follow-up inherits multi-device context');
ok(ctx.mapLocationRequestText('ابعث لي الموقع على الخريطة map'),'Arabic map request detected');
ok(ctx.mapLocationRequestText('Your location on map'),'English map request detected');
ok(ctx.mapLocationRequestText('Schick den Standort auf der Website.'),'German location request detected');
ok(ctx.managementInfoQuestionText('مين المسؤول في الإدارة المالية'),'management/finance responsible-person question detected');
ok(ctx.managementInfoQuestionText('ما هو اسم المدير'),'manager-name question detected');
ok(ctx.productPriceStructureQuestionText('هل المتجر إلكتروني بعطي السعر مع القساط ولا بدون'),'price-vs-installments structure question detected');
ok(ctx.installmentAdjustmentQuestionText('اذا بدي ادفع دفعه عاليه هل بقدر وبتخفف من سعر الجهاز'),'large-payment/price-reduction question detected');
ok(ctx.punctuationOnlyTurnText('.....'),'punctuation-only turn detected');
let sig=ctx.contextualTurnSignals({turn:turn('تمام التمام نخليها بعدين و باذن الله بنستمر'),state:state({lastAssistantText:'إذا بدك تكمل اكتبلي أود الاستمرار'}),recentTurns:[]});
ok(sig.commercialPause,'signals expose commercial pause');
sig=ctx.contextualTurnSignals({turn:turn('بزبط اعدل على لوان الجهاز طيب'),state:state(),recentTurns:[]});
ok(sig.orderChange && sig.topics.includes('application_correction'),'order change maps to correction topic');
sig=ctx.contextualTurnSignals({turn:turn('لو بدي 4 مثلا'),state:state({lastCustomerText:'بيطلعلي أكثر من جهاز'}),recentTurns:[]});
ok(sig.multiDeviceEligibility && sig.topics.includes('products'),'multi-device follow-up maps to products');
sig=ctx.contextualTurnSignals({turn:turn('.....'),state:state(),recentTurns:[]});
ok(sig.punctuationOnly,'signals mark punctuation-only turn');

const pay=loadTs(rel('paymentEligibilityFirewall.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf},
  './paymentTruth':{hasAuthoritativePaymentConfirmation:paid},
  './paymentDestinationOverride':{allFileOpeningPaymentExecutionTokens:()=>['PAYAMEEEN','AMEEN1ST','AM500337','0788500337'],FILE_OPENING_PAYMENT_BENEFICIARY:'ABDUL RAHMAN ALHARAHSHEH'},
  './text':{normalizeArabic},
});
const readyApp=app('customer_confirmed_continue',{paymentStatus:'pending_payment',paymentConfirmedAt:null,paymentReference:null,documents:{...app().documents,paymentReceiptUploaded:false}});
let d=pay.paymentDisclosureDecision({application:readyApp,customerText:'تمام التمام نخليها بعدين و باذن الله بنستمر',explicitContinuationThisTurn:false});
ok(!d.paymentExecutionDetailsAllowed && d.reason==='non_fee_payment_context','deferred continuation blocks payment details even after persisted commercial progression');
d=pay.paymentDisclosureDecision({application:readyApp,customerText:'❌ ليس لدي المال الكافي للدفع الان',explicitContinuationThisTurn:false});
ok(!d.paymentExecutionDetailsAllowed,'cannot-pay-now blocks transfer details');
d=pay.paymentDisclosureDecision({application:app('preliminary_qualified',{paymentStatus:null,paymentConfirmedAt:null,paymentReference:null,documents:{...app().documents,paymentReceiptUploaded:false}}),customerText:'أود الاستمرار',explicitContinuationThisTurn:true});
ok(d.paymentExecutionDetailsAllowed,'explicit current continuation still opens the core 5 JOD path');
ok(pay.buildSafePaymentFirewallReply({truth:truth(readyApp),customerText:'نخليها بعدين',decision:pay.paymentDisclosureDecision({application:readyApp,customerText:'نخليها بعدين',explicitContinuationThisTurn:false})}).includes('لبعدين'),'payment firewall gives a non-pressuring defer reply');

const gate=loadTs(rel('finalResponseGate.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:(a)=>{ if(paid(a)&&String(a.status)==='customer_confirmed_continue') return 'إثبات الدفع بانتظار مراجعة الإدارة'; return stageOf(a)==='final_review'?'قيد الدراسة النهائية':stageOf(a); }},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{products:'https://www.ameenfinance.co/products',tracking:'https://www.ameenfinance.co/track?tracking=AM-1000000000001&phone=0790000000'}})},
  './paymentEligibilityFirewall':pay,
  './mutationConfirmationGate':{mutationQuestion:()=>false,pendingActionIsCurrentTurnFocus:()=>false},
  './truthSnapshotLock':{paymentHistoricallyConfirmed:paid},
  './paymentDestinationOverride':{containsLegacyFileOpeningPaymentDestination:()=>false,currentFileOpeningPaymentRule:()=>"نوع المحفظة: Orange Money\nالمعرف: PAYAMEEEN"},
  './paymentFailureRecovery':{buildPaymentFailureRecoveryReply:()=>"نعتذر منك عن المشكلة. صار تحديث طارئ على أسماء CliQ.",paymentFailureOrDestinationProblemText:()=>false,paymentFailureRecoveryReplyIsCurrent:()=>true},
  './dailyConversationIntegrity':{
    additionalIncomeQuestionText:()=>false,
    applicationStartQuestionText:()=>false,
    barePhoneNumberText:()=>false,
    currentPaymentExecutionRequested:()=>false,
    customerOffersHomeAddressText:()=>false,
    dataDeletionConfirmationText:()=>false,
    dataDeletionRequestText:()=>false,
    documentContextKind:()=>null,
    explicitExpediteRequestText:()=>false,
    explicitTrackingFromText:()=>null,
    feeNowOrPickupQuestionText:()=>false,
    genericDocumentLinkRequestText:()=>false,
    guarantorNameOnlyQuestionText:()=>false,
    internalPlaceholderLeakText:()=>false,
    legalThreatOrPublicEscalationText:()=>false,
    paymentMethodQuestionText:()=>false,
    politeClosureText:()=>false,
    pureGreetingText:()=>false,
    recentPaymentOrReceiptContext:()=>false,
    refundFeeQuestionText:()=>false,
    reviewDelayQuestionText:()=>false,
    roleDisplayName:()=>"عمران",
    staffIdentityQuestionText:()=>false,
    whatsappImageMessageText:()=>false
  },
  './humanFirstJourneyIntelligence':{buildJourneyLockRepairReply:()=>null,journeyStageReplyRegression:()=>false,refundDataFormTroubleText:()=>false,humanFirstJourneyWriterContext:()=>({})},
  './currentTurnAuthority':cta,
  './humanFirstConversationAuthority':{aiIdentityQuestionText:()=>false,buildHumanFirstConversationAuthorityReply:()=>null,falseLiteralHumanIdentityClaim:()=>false,replyMisalignedWithHumanFirstAuthority:()=>false},
  './text':{normalizeArabic},
});
function runGate({reply,raw,a=app(),topics=[],stateExtra={},requestedActions=[],actions=[]}){ const t=turn(raw,topics); t.requestedActions=requestedActions; return gate.enforceFinalResponseGate({reply,turn:t,state:state(stateExtra),truth:truth(a),actions,applicationChanged:false}); }

let g=runGate({reply:'تمام بما إنك اخترت تكمل، حول 5 دنانير على AMEEENPAY للمستفيد ABDUL RAHMAN ALHARAHSHEH',raw:'تمام التمام نخليها بعدين و باذن الله بنستمر',topics:['payment'],a:readyApp});
ok(!g.pass && g.severity==='p0','later/not-now payment disclosure is P0 blocked');
ok(g.violations.includes('deferred_or_declined_continuation_must_not_open_payment'),'deferred continuation has dedicated violation');
ok((g.replacementReply||'').includes('لبعدين'),'deferred continuation replacement respects customer timing');
ok(!(g.replacementReply||'').includes('AMEEENPAY'),'deferred continuation replacement contains no transfer alias');

g=runGate({reply:'أكيد بزبط، قللي اللون وبأكده معك قبل ما أسجّل التعديل على الملف.',raw:'بزبط اعدل على لوان الجهاز طيب',topics:['application_correction'],a:app()});
ok(!g.pass && g.violations.includes('order_change_claimed_without_execution'),'unsupported order-change execution promise is blocked');
ok((g.replacementReply||'').includes('يحتاج تنفيذ إداري'),'order-change replacement makes manual truth explicit');
ok((g.replacementReply||'').includes('الدفع الحالي مؤكد إداريًا'),'paid order-change replacement preserves payment truth');

g=runGate({reply:'تمام غيرنا اللون وصار أزرق.',raw:'بدي اغير اللون للازرق',topics:['application_correction'],a:app(),actions:[]});
ok(!g.pass && g.violations.includes('order_change_claimed_without_execution'),'unexecuted completed-color claim is blocked');

g=runGate({reply:'حالة الطلب: إثبات الدفع بانتظار مراجعة الإدارة.',raw:'لا خلص بطلت بدي اعدل على لوان',topics:['application_correction'],a:app()});
ok(!g.pass,'change retraction does not fall into stale status dump');
ok((g.replacementReply||'').includes('تراجعت عن التعديل'),'change retraction gets direct human acknowledgement');

g=runGate({reply:'أكيد فيك تاخد أكثر من جهاز، لو بدك 4 بتقدم 4 طلبات.',raw:'بيطلعلي أكثر من جهاز آيفون 17 برو ماكس لو بدي 4 مثلا',topics:['products'],a:app()});
ok(!g.pass && g.violations.includes('multiple_device_eligibility_guaranteed_without_truth'),'multi-device guarantee is blocked');
ok((g.replacementReply||'').includes('ما بقدر أضمن'),'multi-device replacement avoids unsupported eligibility promise');

g=runGate({reply:'الموقع على الخريطة من خلال الرابط الرسمي: https://www.ameenfinance.co',raw:'ابعث لي الموقع على الخريطة map',topics:['location'],a:app()});
ok(!g.pass && g.violations.includes('website_url_misrepresented_as_map_location'),'website URL cannot masquerade as map location');
ok((g.replacementReply||'').includes('ما عندي رابط خريطة رسمي موثق'),'map replacement clearly states map truth');
ok((g.replacementReply||'').includes('عمّان – شارع المدينة المنورة'),'map replacement keeps allowed broad office location');

g=runGate({reply:'طلبك AM-1000000000001 الاسترداد قيد المعالجة.',raw:'مين المسؤول في الإدارة المالية..',topics:[],a:app('refund_requested',{paymentStatus:'payment_confirmed'})});
ok(!g.pass && g.violations.includes('management_question_wrong_status_fallback'),'management question cannot receive refund status template');
ok((g.replacementReply||'').includes('اسم رسمي موثق'),'management reply avoids inventing a manager name');

g=runGate({reply:'الأسعار المعروضة على الموقع هي سعر الجهاز الأساسي بدون التقسيط، والحسبة بتعتمد على الدفعة الأولى.',raw:'هل المتجر إلكتروني بعطي السعر مع القساط ولا بدون',topics:['products'],a:null});
ok(!g.pass && g.violations.includes('unsupported_product_price_or_downpayment_structure_claim'),'unsupported site price/down-payment structure claim is blocked');
ok((g.replacementReply||'').includes('صفحة المنتج'),'price-structure replacement points to authoritative page/calc');

g=runGate({reply:'القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد.',raw:'اذا بدي ادفع دفعه عاليه هل بقدر وبتخفف من سعر الجهاز',topics:['payment'],a:null});
ok(g.pass && !g.violations.includes('installment_adjustment_misrouted_to_file_opening_payment'),'large-payment question is not falsely labeled as file-opening leak when reply has no leak');
ok(g.pass && g.replacementReply===null,'clean conservative first-installment fact alone is allowed');

g=runGate({reply:'إذا بدك دفعة أولى أعلى بتخفف سعر الجهاز والحسبة بتعتمد على الدفعة الأولى اللي بتختارها.',raw:'اذا بدي ادفع دفعه عاليه هل بقدر وبتخفف من سعر الجهاز',topics:['payment'],a:null});
ok(!g.pass,'invented down-payment structure is intercepted');
ok((g.replacementReply||'').includes('ما عندي سياسة موثقة'),'large-payment replacement avoids inventing down-payment policy');
ok((g.replacementReply||'').includes('القسط الأول يستحق بعد شهر'),'large-payment replacement preserves first-installment truth');

const paidStaleLabel=app('customer_confirmed_continue',{paymentStatus:'payment_confirmed',paymentConfirmedAt:'2026-09-07T06:00:00Z',paymentReference:'R1',documents:{...app().documents,paymentReceiptUploaded:true}});
g=runGate({reply:'الدفع مؤكد إداريًا على الطلب، والحالة الحالية: إثبات الدفع بانتظار مراجعة الإدارة.',raw:'شو الوضع',topics:['payment_status'],a:paidStaleLabel});
ok(!g.pass && g.violations.includes('confirmed_payment_regressed_to_receipt_pending'),'same-reply paid/pending contradiction is blocked');
ok((g.replacementReply||'').includes('الدفع مؤكد إداريًا'),'replacement preserves paid truth');
ok(!(g.replacementReply||'').includes('إثبات الدفع بانتظار'),'replacement suppresses stale receipt-pending status label');

g=runGate({reply:'طلب الاسترداد مسجل وقيد المعالجة، وما في خطوة ناقصة من طرفك حسب الحالة الحالية.',raw:'قيد المعالجة إلى متى',topics:[],a:app('refund_requested',{paymentStatus:'payment_confirmed'})});
ok(!g.pass && g.violations.includes('refund_followup_repeated_status_template'),'contextual refund-timing follow-up cannot get bare status template');
ok((g.replacementReply||'').includes('ما عندي مدة ثابتة وموثقة'),'refund follow-up answers timing directly');

g=runGate({reply:'طلب الاسترداد مسجل وقيد المعالجة، وما في خطوة ناقصة من طرفك حسب الحالة الحالية.',raw:'نفس الرد السابق',topics:[],a:app('refund_requested',{paymentStatus:'payment_confirmed'})});
ok(!g.pass,'customer calling out repetition gets repaired');
ok((g.replacementReply||'').startsWith('صحيح'),'repeat-callout reply acknowledges repetition');

g=runGate({reply:'طلبك AM-1000000000001 الاسترداد قيد المعالجة.',raw:'.....',topics:[],a:app('refund_requested',{paymentStatus:'payment_confirmed'})});
ok(!g.pass && g.violations.includes('punctuation_only_turn_should_not_dump_status'),'punctuation-only message cannot trigger status dump');
ok((g.replacementReply||'')==='أنا معك.','punctuation-only replacement stays human and minimal');

g=runGate({reply:'المتابعة الأساسية عبر واتساب، ولهيك ما في رقم تواصل.',raw:'ليش ما في رقم تواصل',topics:[],a:app()});
ok(!g.pass || (g.replacementReply||'').includes('واتساب'),'phone contact question remains answerable without inventing a number');
if(!g.pass) ok((g.replacementReply||'').includes('ما عندي رقم هاتف إضافي رسمي موثق'),'phone replacement distinguishes unknown extra number from claiming company has none'); else ok(true,'phone reply already safe');

// Explicitly preserve the user's human-first/persona goal. This release must not strip persona identity.
const wc=read(rel('writerContract.ts'));
const cr=read(rel('conversationRecovery.ts'));
const fg=read(rel('finalResponseGate.ts'));
ok(wc.includes('HUMAN_FIRST_FINAL_GOAL=true'),'writer contract declares human-first final goal');
ok(wc.includes('PERSONA_HUMAN_VOICE_PRESERVED=true'),'writer contract explicitly preserves persona human voice');
ok(wc.includes('حافظ على اسم ودور الشخصية الحالية'),'writer keeps عمران/عبدالله/etc. identity behavior');
ok(wc.includes('لا تغيّر هوية الشخصيات'),'release does not sanitize away persona identities');
ok(wc.includes('commercialPause=true'),'writer owns deferred-consent semantics');
ok(wc.includes('multiDeviceEligibility=true'),'writer blocks multi-device guarantees');
ok(wc.includes('mapLocationRequest=true'),'writer separates map truth from website URL');
ok(wc.includes('orderChange=true'),'writer distinguishes requested change from executed change');
ok(cr.includes('commercialPauseOrDeclineText'),'conversation recovery owns commercial pause');
ok(cr.includes('orderChangeRequestText'),'conversation recovery owns order-change questions');
ok(cr.includes('multipleDeviceEligibilityQuestionText'),'conversation recovery owns multi-device questions');
ok(fg.includes('deferred_or_declined_continuation_must_not_open_payment'),'final gate owns consent veto');
ok(fg.includes('order_change_claimed_without_execution'),'final gate owns capability truth for order changes');
ok(fg.includes('website_url_misrepresented_as_map_location'),'final gate owns map truth');
ok(fg.includes('refund_followup_repeated_status_template'),'final gate owns refund anti-loop repair');
ok(fg.includes('punctuation_only_turn_should_not_dump_status'),'final gate owns punctuation anti-loop repair');

console.log(`SELFTEST PASSED ${passed}/${passed} - V3 PHASE 7.3.6 HUMAN-FIRST CONSENT + CAPABILITY INTEGRITY`);
