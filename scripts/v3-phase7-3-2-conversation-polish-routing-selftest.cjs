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
function loadTs(file,mocks={}){ const code=ts.transpileModule(read(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:file}).outputText; const module={exports:{}}; const req=(id)=>{if(Object.prototype.hasOwnProperty.call(mocks,id)) return mocks[id]; throw new Error(`Unmocked require ${id} from ${file}`)}; new Function('require','module','exports',code)(req,module,module.exports); return module.exports; }
function turn(raw,topics=[]){ return {turnId:'t1',rawText:raw,normalizedText:normalizeArabic(raw),acts:[],topics,requestedActions:[],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.9,warnings:[]}; }
function state(){ return {version:'v3',waId:'9627',activeApplicationId:'app1',activeTrackingId:'AM-1000000000001',currentTopic:null,currentGoal:null,role:{currentRole:'tala',tier:'frontline',reason:'',sinceTurnId:null,introduced:false},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,updatedAt:new Date().toISOString()}; }
function app(status='preliminary_qualified',extra={}){ return {id:'app1',trackingId:'AM-1000000000001',fullName:'Test',phone:'0790000000',status,paymentStatus:null,paymentConfirmedAt:null,paymentReference:null,deviceId:null,deviceName:'iPhone 14',devicePrice:500,installmentMonths:36,downPayment:0,interestRate:15,monthlyPayment:16,totalWithInterest:575,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:'2026-09-01T00:00:00Z',paidClickedAt:null,documents:{loaded:true,types:[],identityComplete:true,salarySlipUploaded:true,guarantorIdentityComplete:null,guarantorDataComplete:null,paymentReceiptUploaded:false},...extra}; }
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,fileOpeningFeeTiming:'',fileOpeningFeePurposeRule:'',fileOpeningFeeRefundRule:'',continuationReassuranceRule:'',firstInstallmentRule:'أول قسط بعد شهر من الاستلام وتوقيع العقد',pickupRule:'',secureDocumentsRule:'',independenceStatement:'الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق.',paymentAliases:['AMEEENPAY','AMENPAY'],paymentWalletType:'Orange Money',paymentBeneficiaryName:'ABDUL RAHMAN ALHARAHSHEH',paymentMethodRule:'',paymentConfirmationRule:'',normalReviewWindow:'المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل',reviewPressureLevel:'severe',severePressureRule:'',refundPressureRule:'',disputeResolutionRule:'',autonomousSupervisorRule:'',forbiddenClaims:[]};
function truth(a=app()){ return {confidence:'authoritative',source:'current_message_tracking',application:a,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}; }
const files=['contextualTurnResolver.ts','conversationRecovery.ts','finalResponseGate.ts','writerContract.ts','zeroFallback.ts'].map(rel);
for(const f of files){ const out=ts.transpileModule(read(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:f}); const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); ok(errs.length===0,'TypeScript syntax '+f); }

const ctx=loadTs(rel('contextualTurnResolver.ts'),{'./text':{normalizeArabic}});
for(const q of ['في ايفون 14','في آيفون 14؟','ايفون 14 كم سعرو','iphone 14 بكم','سامسونج كم سعره','عندكم هونر؟']){
  const r=ctx.contextualTurnSignals({turn:turn(q),state:state(),recentTurns:[]});
  ok(r.productAvailability,`general product inquiry detected: ${q}`);
  ok(r.topics.includes('products'),`general product inquiry gets products topic: ${q}`);
}
for(const q of ['متى الموافقة','دفعت الرسوم','اعطيني رابط التتبع']){
  const r=ctx.contextualTurnSignals({turn:turn(q),state:state(),recentTurns:[]});
  ok(!r.productAvailability,`non-product turn not misrouted: ${q}`);
}

function stageOf(a){ if(!a) return 'no_application'; const s=String(a.status||'').toLowerCase(); if(s==='preliminary_qualified') return 'preliminary_approved_waiting_decision'; if(['customer_confirmed_continue','under_review'].includes(s)) return 'final_review'; if(s==='cancelled') return 'cancelled'; if(s==='refund_requested') return 'refund_requested'; return s||'unknown'; }
function paid(a){ return Boolean(a && (a.paymentConfirmedAt || ['confirmed','paid','payment_confirmed'].includes(String(a.paymentStatus||'').toLowerCase()))); }
const pay=loadTs(rel('paymentEligibilityFirewall.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf},
  './paymentTruth':{hasAuthoritativePaymentConfirmation:paid},
  './text':{normalizeArabic},
});
const gate=loadTs(rel('finalResponseGate.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:(a)=>stageOf(a)},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{products:'https://www.ameenfinance.co/products',tracking:'https://www.ameenfinance.co/track?tracking=AM-1000000000001&phone=0790000000'}})},
  './paymentEligibilityFirewall':pay,
  './mutationConfirmationGate':{mutationQuestion:()=>false,pendingActionIsCurrentTurnFocus:()=>false},
  './truthSnapshotLock':{paymentHistoricallyConfirmed:(a)=>paid(a) || String(a?.status||'').toLowerCase()==='refund_requested'},
  './text':{normalizeArabic},
});
function runGate({reply,raw,a=app(),topics=[],requestedActions=[]}){ const t=turn(raw,topics); t.requestedActions=requestedActions; return gate.enforceFinalResponseGate({reply,turn:t,state:state(),truth:truth(a),actions:[],applicationChanged:false}); }

let g=runGate({reply:'إذا سؤالك عام ابعث رقم التتبع',raw:'في ايفون 14',topics:['products'],a:null});
ok(!g.pass && g.violations.includes('product_question_wrong_tracking_fallback'),'product availability cannot fall back to tracking request');
ok((g.replacementReply||'').includes('/products'),'product availability replacement links products page');
g=runGate({reply:'إذا سؤالك عام ابعث رقم التتبع',raw:'ايفون 14 كم سعرو',topics:['products'],a:null});
ok(!g.pass && g.violations.includes('product_question_wrong_tracking_fallback'),'product price question cannot fall back to tracking request');
ok((g.replacementReply||'').includes('/products'),'product price replacement links products page');

const continued=app('customer_confirmed_continue',{paymentStatus:'pending_payment'});
g=runGate({reply:'إذا بدك نكمل اكتبلي أود الاستمرار',raw:'بدي اتواصل مكالمة اذا سمحت',topics:['human_request'],a:continued});
ok(!g.pass && g.violations.includes('continuation_stage_regression'),'post-continuation CTA regression is blocked');
ok(!(g.replacementReply||'').includes('أود الاستمرار'),'replacement never asks continuation again');
ok((g.replacementReply||'').includes('واتساب'),'call request is still answered after CTA regression repair');
const pendingReceipt=app('customer_confirmed_continue',{paymentStatus:'pending_payment',documents:{...app().documents,paymentReceiptUploaded:true}});
g=runGate({reply:'إذا بدك تكمل اكتبلي أود الاستمرار',raw:'شو صار بالوصل',topics:['payment_status'],a:pendingReceipt});
ok(!g.pass && g.violations.includes('continuation_stage_regression'),'receipt-pending customer cannot be sent backward to continuation');
const alreadyPaid=app('under_review',{paymentStatus:'payment_confirmed',paymentConfirmedAt:'2026-09-06T10:00:00Z',documents:{...app().documents,paymentReceiptUploaded:true}});
g=runGate({reply:'إذا بدك تكمل اكتبلي أود الاستمرار',raw:'شو وضعي',topics:['application_status'],a:alreadyPaid});
ok(!g.pass && g.violations.includes('continuation_stage_regression'),'paid customer cannot be sent backward to continuation');

const receiptText='أهلًا، أنا تركيه خالد\nرفعت وصل دفع رسوم فتح الملف وأرغب بمتابعة التأكيد.';
g=runGate({reply:'أكيد، هذا رابط التتبع الرسمي لطلبك: https://www.ameenfinance.co/track',raw:receiptText,a:pendingReceipt});
ok(!g.pass && g.violations.includes('receipt_confirmation_status_not_answered'),'receipt confirmation must answer receipt status');
ok((g.replacementReply||'').includes('بانتظار مراجعة الإدارة'),'pending receipt replacement states admin review');
g=runGate({reply:'رقم طلبك AM-1، الحالة الآن قيد الدراسة. رسوم فتح الملف 5 دنانير وهي منفصلة عن ثمن الجهاز.',raw:receiptText,a:pendingReceipt});
ok(!g.pass && g.violations.includes('receipt_confirmation_replayed_fee_education'),'receipt confirmation does not replay fee education');
g=runGate({reply:'تمام، الدفع مؤكد إداريًا على طلبك.',raw:receiptText,a:alreadyPaid});
ok(g.pass,'authoritatively confirmed receipt gets concise valid confirmation');
g=runGate({reply:'تمام، وصل الدفع موجود على ملفك وبانتظار مراجعة الإدارة.',raw:receiptText,a:pendingReceipt});
ok(g.pass,'pending receipt gets concise valid status');

for(const q of ['يسلمو','شكرا','يعطيك العافيه','تمام يسلمو']){
  g=runGate({reply:'حالة طلبك الآن: قيد الدراسة النهائية.',raw:q,topics:['thanks'],a:alreadyPaid});
  ok(!g.pass && g.violations.includes('social_close_should_not_dump_status'),`social close blocks status dump: ${q}`);
  ok((g.replacementReply||'').includes('الله يعطيك العافية'),`social close gets short human reply: ${q}`);
}
g=runGate({reply:'العفو، الله يعطيك العافية.',raw:'يسلمو',topics:['thanks'],a:alreadyPaid});
ok(g.pass,'clean social close passes');

const cr=read(rel('conversationRecovery.ts'));
const zf=read(rel('zeroFallback.ts'));
const wc=read(rel('writerContract.ts'));
const fg=read(rel('finalResponseGate.ts'));
ok(cr.includes('explicitReceiptUploadConfirmationText'),'conversation recovery has deterministic receipt confirmation detector');
ok(cr.includes('dialogueSignals.productAvailability'),'conversation recovery directly handles general product inquiries');
ok(cr.includes('normalizedReviewWindow'),'conversation recovery deduplicates review-window wording');
ok(!cr.includes('المعدل الطبيعي للمراجعة ${p.normalReviewWindow}'),'old duplicated review-window construction removed from conversation recovery');
ok(zf.includes('explicitReceiptUploadConfirmation'),'zero fallback has receipt confirmation contract');
ok(zf.includes('topics.has("products")'),'zero fallback can route generic products topic without tracking fallback');
ok(zf.includes('!["payment_ready","payment_pending_admin","already_paid"].includes'),'zero fallback blocks continuation CTA after commercial progression');
ok(wc.includes('COMMERCIAL_CONTINUATION_STATE'),'writer receives persisted commercial continuation state');
ok(wc.includes('ممنوع تمامًا ترجع تطلب منه "أود الاستمرار"'),'writer contract forbids backward continuation CTA');
ok(wc.includes('لا تكتفِ برابط التتبع ولا تعيد شرح فلسفة رسوم الـ5 دنانير'),'writer contract standardizes receipt confirmation UX');
ok(wc.includes('رسائل الإغلاق الاجتماعي'),'writer contract keeps social closes social');
ok(fg.includes('continuation_stage_regression'),'final gate enforces no backward commercial step');
ok(fg.includes('receipt_confirmation_status_not_answered'),'final gate enforces receipt state answer');
ok(fg.includes('receipt_confirmation_replayed_fee_education'),'final gate blocks fee lecture after receipt upload');
ok(fg.includes('social_close_should_not_dump_status'),'final gate blocks status dump on social close');
ok(fg.includes('normalizedReviewWindow'),'final gate deduplicates review-window wording');
ok(!fg.includes('المعدل الطبيعي للمراجعة ${p.normalReviewWindow}'),'old duplicated review-window construction removed from final gate');

console.log(`SELFTEST PASSED ${passed}/${passed} - V3 PHASE 7.3.2 CONVERSATION POLISH + ROUTING FIXES`);
