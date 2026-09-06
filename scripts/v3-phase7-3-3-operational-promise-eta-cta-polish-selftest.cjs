
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
function state(lastAssistantText=null){ return {version:'v3',waId:'9627',activeApplicationId:'app1',activeTrackingId:'AM-1000000000001',currentTopic:null,currentGoal:null,role:{currentRole:'tala',tier:'frontline',reason:'',sinceTurnId:null,introduced:false},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText,consecutiveRiskTurns:0,lastVerifiedApplication:null,updatedAt:new Date().toISOString()}; }
function app(status='under_review',extra={}){ return {id:'app1',trackingId:'AM-1000000000001',fullName:'Test',phone:'0790000000',status,paymentStatus:'payment_confirmed',paymentConfirmedAt:'2026-09-06T10:00:00Z',paymentReference:null,deviceId:null,deviceName:'iPhone 17 Pro Max',devicePrice:500,installmentMonths:36,downPayment:0,interestRate:15,monthlyPayment:16,totalWithInterest:575,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:'2026-09-01T00:00:00Z',paidClickedAt:null,documents:{loaded:true,types:[],identityComplete:true,salarySlipUploaded:true,guarantorIdentityComplete:null,guarantorDataComplete:null,paymentReceiptUploaded:true},...extra}; }
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,fileOpeningFeeTiming:'',fileOpeningFeePurposeRule:'',fileOpeningFeeRefundRule:'',continuationReassuranceRule:'',firstInstallmentRule:'أول قسط بعد شهر من الاستلام وتوقيع العقد',pickupRule:'',secureDocumentsRule:'',independenceStatement:'الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق.',paymentAliases:['AMEEENPAY','AMENPAY'],paymentWalletType:'Orange Money',paymentBeneficiaryName:'ABDUL RAHMAN ALHARAHSHEH',paymentMethodRule:'',paymentConfirmationRule:'',normalReviewWindow:'المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل',reviewPressureLevel:'severe',severePressureRule:'',refundPressureRule:'',disputeResolutionRule:'',autonomousSupervisorRule:'',forbiddenClaims:[]};
function truth(a=app()){ return {confidence:'authoritative',source:'current_message_tracking',application:a,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}; }
for(const f of [rel('finalResponseGate.ts'),rel('writerContract.ts'),rel('zeroFallback.ts')]){ const out=ts.transpileModule(read(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:f}); const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); ok(errs.length===0,'TypeScript syntax '+f); }

function stageOf(a){ if(!a) return 'no_application'; const s=String(a.status||'').toLowerCase(); if(s==='preliminary_qualified') return 'preliminary_approved_waiting_decision'; if(['customer_confirmed_continue','under_review'].includes(s)) return 'final_review'; if(s==='cancelled') return 'cancelled'; if(s==='refund_requested') return 'refund_requested'; return s||'unknown'; }
function paid(a){ return Boolean(a && (a.paymentConfirmedAt || ['confirmed','paid','payment_confirmed'].includes(String(a.paymentStatus||'').toLowerCase()))); }
const pay=loadTs(rel('paymentEligibilityFirewall.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf},
  './paymentTruth':{hasAuthoritativePaymentConfirmation:paid},
  './text':{normalizeArabic},
});
const gate=loadTs(rel('finalResponseGate.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:(a)=>stageOf(a)==='final_review'?'قيد الدراسة النهائية':stageOf(a)},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{products:'https://www.ameenfinance.co/products',tracking:'https://www.ameenfinance.co/track?tracking=AM-1000000000001&phone=0790000000'}})},
  './paymentEligibilityFirewall':pay,
  './mutationConfirmationGate':{mutationQuestion:()=>false,pendingActionIsCurrentTurnFocus:()=>false},
  './truthSnapshotLock':{paymentHistoricallyConfirmed:(a)=>paid(a) || String(a?.status||'').toLowerCase()==='refund_requested'},
  './text':{normalizeArabic},
});
function runGate({reply,raw,a=app(),topics=[],requestedActions=[],lastAssistantText=null,actions=[]}){ const t=turn(raw,topics); t.requestedActions=requestedActions; return gate.enforceFinalResponseGate({reply,turn:t,state:state(lastAssistantText),truth:truth(a),actions,applicationChanged:false}); }

let g=runGate({
  reply:'معك حق، والانتظار صار طويل. إذا بدك، أقدر أرفع ملاحظة استعجال على ملفك؟',
  raw:'بيكفي مماطلة',
  topics:['complaint']
});
ok(!g.pass && g.violations.includes('unsupported_operational_promise_without_execution'),'unsupported expedite promise is blocked');
ok(!(g.replacementReply||'').includes('استعجال'),'replacement removes unsupported expedite offer');

g=runGate({
  reply:'أنا رح أرفع طلب الإلغاء والاسترداد للإدارة لتتم معالجته.',
  raw:'يا ريت ترجعو ال 5 دنانير وما بدي اتعامل معكم',
  topics:['refund']
});
ok(!g.pass && g.violations.includes('unsupported_operational_promise_without_execution'),'refund execution promise without receipt is blocked');

g=runGate({
  reply:'الاسترداد ما رح يوخذ سنة، وبالتأكيد مش هالقد.',
  raw:'وكم يوم اجراء الاسترداد',
  topics:['refund']
});
ok(!g.pass && g.violations.includes('unsupported_refund_eta_certainty'),'unsupported refund ETA certainty is blocked');
ok((g.replacementReply||'').includes('ما عندي مدة ثابتة وموثقة'),'refund timing replacement states no documented fixed duration');
ok(!(g.replacementReply||'').includes('سنة'),'refund timing replacement avoids invented upper bound');

g=runGate({
  reply:'معك حق، 12 يوم فترة طويلة. بدك أرفع طلب الإلغاء والاسترداد الآن؟',
  raw:'12 يوم صارو',
  topics:['complaint'],
  lastAssistantText:'هل تريد أن أتابع إجراء الإلغاء والاسترداد الآن؟'
});
ok(!g.pass && g.violations.includes('repeated_mutation_cta_without_current_request'),'mutation CTA is not repeated on unrelated delay follow-up');
ok(!(g.replacementReply||'').includes('بدك أرفع'),'delay replacement does not re-push mutation CTA');

g=runGate({
  reply:'ما عندي مدة محددة. بدك أرفع طلب الإلغاء والاسترداد هسا؟',
  raw:'وكم يوم اجراء الاسترداد',
  topics:['refund']
});
ok(!g.pass && g.violations.includes('repeated_mutation_cta_without_current_request'),'refund timing question is answered without repeated CTA');
ok((g.replacementReply||'').includes('ما عندي مدة ثابتة وموثقة'),'refund timing CTA replacement answers the actual timing question');

g=runGate({
  reply:'إذا قرارك نهائي، هل تريد أن أتابع طلب الاسترداد؟',
  raw:'بدي استرد الرسوم',
  topics:['refund'],
  requestedActions:['request_refund']
});
ok(g.pass,'one confirmation CTA remains allowed on a fresh explicit refund request');

g=runGate({
  reply:'معك حق، 12 يوم فترة طويلة فعلًا، وما عندي موعد نهائي موثق.',
  raw:'12 يوم صارو',
  topics:['complaint'],
  lastAssistantText:'معك حق، والانتظار صار طويل فعلًا.'
});
ok(!g.pass && g.violations.includes('repeated_empathy_opener'),'back-to-back معك حق opener is polished');
ok(!(g.replacementReply||'').startsWith('معك حق'),'replacement varies repeated empathy opener');

g=runGate({
  reply:'معك حق، والانتظار صار طويل فعلًا.',
  raw:'بيكفي مماطلة',
  topics:['complaint'],
  lastAssistantText:'أهلاً فيك.'
});
ok(g.pass,'first natural empathy opener remains allowed');

const wc=read(rel('writerContract.ts'));
const fg=read(rel('finalResponseGate.ts'));
const zf=read(rel('zeroFallback.ts'));
ok(wc.includes('ممنوع عرض قدرة تشغيلية غير موجودة'),'writer contract forbids unsupported operational capabilities');
ok(wc.includes('ممنوع حتى النفي الزمني'),'writer contract forbids invented refund upper bounds');
ok(wc.includes('لا تعيد CTA الإلغاء/الاسترداد'),'writer contract forbids repeated mutation CTA');
ok(wc.includes('لا تبدأ ردين متتاليين بنفس عبارة "معك حق"'),'writer contract varies empathy openers');
ok(fg.includes('unsupported_operational_promise_without_execution'),'final gate owns unsupported promise guard');
ok(fg.includes('unsupported_refund_eta_certainty'),'final gate owns refund ETA guard');
ok(fg.includes('repeated_mutation_cta_without_current_request'),'final gate owns repeated mutation CTA guard');
ok(fg.includes('repeated_empathy_opener'),'final gate owns empathy repetition polish');
ok(zf.includes('rawAsksRefundTiming'),'zero fallback detects refund timing directly');
ok(zf.includes('ما عندي مدة ثابتة وموثقة أقدر أضمنها للاسترداد'),'zero fallback has deterministic safe refund timing answer');

console.log(`SELFTEST PASSED ${passed}/${passed} - V3 PHASE 7.3.3 OPERATIONAL PROMISE + ETA + CTA POLISH`);
