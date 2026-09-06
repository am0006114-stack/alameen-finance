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
function app(status='customer_confirmed_continue',extra={}){ return {id:'app1',trackingId:'AM-1000000000001',fullName:'Test',phone:'0790000000',status,paymentStatus:'pending_payment',paymentConfirmedAt:null,paymentReference:null,deviceId:null,deviceName:'iPhone 17 Pro Max',devicePrice:900,installmentMonths:36,downPayment:0,interestRate:15,monthlyPayment:36.69,totalWithInterest:1320,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:'2026-09-01T00:00:00Z',paidClickedAt:null,documents:{loaded:true,types:[],identityComplete:true,salarySlipUploaded:true,guarantorIdentityComplete:null,guarantorDataComplete:null,paymentReceiptUploaded:false},...extra}; }
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,fileOpeningFeeTiming:'',fileOpeningFeePurposeRule:'رسوم فتح الملف',fileOpeningFeeRefundRule:'مستردة عبر المسار الرسمي بعد دفع مؤكد',continuationReassuranceRule:'',firstInstallmentRule:'أول قسط بعد شهر من الاستلام وتوقيع العقد',pickupRule:'',secureDocumentsRule:'',independenceStatement:'الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق.',paymentAliases:['AMEEENPAY','AMENPAY'],paymentWalletType:'Orange Money',paymentBeneficiaryName:'ABDUL RAHMAN ALHARAHSHEH',paymentMethodRule:'التحويل إلى AMEEENPAY أو AMENPAY',paymentConfirmationRule:'',normalReviewWindow:'من يومين إلى 3 أيام عمل',reviewPressureLevel:'severe',severePressureRule:'',refundPressureRule:'',disputeResolutionRule:'',autonomousSupervisorRule:'',forbiddenClaims:[]};
function truth(a=app()){ return {confidence:'authoritative',source:'current_message_tracking',application:a,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}; }
function stageOf(a){ if(!a) return 'no_application'; const s=String(a.status||'').toLowerCase(); if(s==='preliminary_qualified') return 'preliminary_approved_waiting_decision'; if(['customer_confirmed_continue','under_review'].includes(s)) return 'final_review'; if(s==='cancelled') return 'cancelled'; if(s==='refund_requested') return 'refund_requested'; return s||'unknown'; }
function paid(a){ return Boolean(a && (a.paymentConfirmedAt || ['confirmed','paid','payment_confirmed'].includes(String(a.paymentStatus||'').toLowerCase()))); }

const files=['contextualTurnResolver.ts','conversationRecovery.ts','paymentEligibilityFirewall.ts','mutationConfirmationGate.ts','writerContract.ts','finalResponseGate.ts'].map(rel);
for(const f of files){ const out=ts.transpileModule(read(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:f}); const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); ok(errs.length===0,'TypeScript syntax '+f); }

const ctx=loadTs(rel('contextualTurnResolver.ts'),{'./text':{normalizeArabic}});
let r=ctx.contextualTurnSignals({turn:turn('هسا اذا صار واتفقنا عادي لو زودت الدفعات تبعت القسط الشهري ؟'),state:state(),recentTurns:[]});
ok(r.installmentAdjustment,'monthly-installment increase question gets semantic subtype');
ok(r.topics.includes('installment_amount'),'monthly-installment increase question gets installment topic');
r=ctx.contextualTurnSignals({turn:turn('عن طريق بنك وشو الشروط المطلوبه'),state:state(),recentTurns:[]});
ok(r.financingStructure,'bank-financing structure question detected');
ok(r.topics.includes('requirements'),'bank-financing structure maps to requirements, not fee payment');
r=ctx.contextualTurnSignals({turn:turn('لازم كشف راتب بزبطش بس ع الهويه'),state:state(),recentTurns:[]});
ok(r.generalRequirements,'identity-only / salary-slip requirement question detected');
r=ctx.contextualTurnSignals({turn:turn('ماعندي طلب سابق'),state:state(),recentTurns:[]});
ok(r.noPriorApplication,'explicit no-prior-application statement detected');
r=ctx.contextualTurnSignals({turn:turn('حطيت كلشي بس ماكمل'),state:state({lastAssistantText:'ابعث صورة للشاشة إذا الموقع وقف'}),recentTurns:[]});
ok(r.applicationFormIssue && r.siteIssue,'stuck application form detected as site/form issue');
r=ctx.contextualTurnSignals({turn:turn('انا سورية ما عم بقدر احط كل معلوماتي'),state:state(),recentTurns:[]});
ok(r.foreignApplicantFormIssue && r.siteIssue,'foreign applicant form blocker detected without inventing eligibility');

const pay=loadTs(rel('paymentEligibilityFirewall.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf},
  './paymentTruth':{hasAuthoritativePaymentConfirmation:paid},
  './text':{normalizeArabic},
});
let d=pay.paymentDisclosureDecision({application:app(),customerText:'عادي لو زودت الدفعات تبعت القسط الشهري؟',explicitContinuationThisTurn:false});
ok(!d.paymentExecutionDetailsAllowed && d.reason==='non_fee_payment_context','generic payment intent cannot expose 5 JOD details for installment question');
ok(pay.customerTextIsNonFeePaymentContext('عن طريق بنك وشو الشروط المطلوبه'),'bank/requirements question is non-fee payment context');
d=pay.paymentDisclosureDecision({application:app(),customerText:'كيف ادفع رسوم فتح الملف 5 دنانير؟',explicitContinuationThisTurn:false});
ok(d.paymentExecutionDetailsAllowed,'explicit 5 JOD question remains eligible after persisted continuation');
d=pay.paymentDisclosureDecision({application:app('preliminary_qualified',{paymentStatus:null}),customerText:'أود الاستمرار',explicitContinuationThisTurn:true});
ok(d.paymentExecutionDetailsAllowed,'core 5 JOD continuation path remains open');

const mut=loadTs(rel('mutationConfirmationGate.ts'),{'./text':{normalizeArabic}});
function planned(action){ return {action,sourceActId:'a1',requiresConfirmation:false,authority:'ai_planned',requiredRole:'omran',payload:null}; }
let mg=mut.enforceMutationConfirmationGate({actions:[planned('cancel_application')],turn:turn('بدي الغي الطلب',['cancellation']),state:state(),truth:truth(app('under_review',{paymentStatus:'payment_confirmed',paymentConfirmedAt:'2026-09-01T00:00:00Z'}))});
ok(mg.actions.some(a=>a.action==='cancel_application' && a.requiresConfirmation),'fresh cancellation request still requires separate confirmation');
ok((mg.confirmationPrompt||'').includes('نعم، ألغي الطلب'),'fresh cancellation request gets exact confirmation prompt');
const pendingState=state({pendingAction:'cancel_application',pendingActionPayload:{_mutationConfirmationRequired:true,_mutationAction:'cancel_application',_scopeApplicationId:'app1',_scopeTrackingId:'AM-1000000000001',_scopeTurnId:'t0'},lastAssistantText:'أكيد. بدي تأكيد منفصل منك. إذا قرارك نهائي اكتب: نعم، ألغي الطلب.'});
mg=mut.enforceMutationConfirmationGate({actions:[],turn:turn('نعم إلغي طلب',['application_status']),state:pendingState,truth:truth(app('under_review'))});
ok(mg.confirmedAction==='cancel_application','confirmation works even when classifier labels second turn order_status');
ok(mg.actions.some(a=>a.action==='cancel_application' && a.requiresConfirmation===false),'confirmed cancellation is injected for execution');
const lostPending=state({pendingAction:null,pendingActionPayload:null,lastAssistantText:'أكيد. بدي تأكيد منفصل منك. إذا قرارك نهائي اكتب: نعم، ألغي الطلب.'});
mg=mut.enforceMutationConfirmationGate({actions:[],turn:turn('نعم إلغي طلب',['application_status']),state:lostPending,truth:truth(app('under_review'))});
ok(mg.confirmedAction==='cancel_application','two-step confirmation recovers from lost pending token using immediately previous exact prompt');
ok(mg.actions.some(a=>a.action==='cancel_application' && !a.requiresConfirmation),'recovered confirmation can execute only on current authoritative app');
mg=mut.enforceMutationConfirmationGate({actions:[planned('cancel_application')],turn:turn('بدي الغي الطلب',['cancellation']),state:state({activeApplicationId:null,activeTrackingId:null}),truth:truth(null)});
ok(mg.actions.length===0,'no authoritative application means no mutation is staged');
ok((mg.informationalReply||'').includes('رقم التتبع'),'missing application asks to identify exact request instead of fake confirmation');
mg=mut.enforceMutationConfirmationGate({actions:[],turn:turn('نعم إلغي طلب',['application_status']),state:state({activeApplicationId:null,activeTrackingId:null,lastAssistantText:'أكيد. بدي تأكيد منفصل منك. إذا قرارك نهائي اكتب: نعم، ألغي الطلب.'}),truth:truth(null)});
ok(mg.actions.length===0,'confirmation can never execute without authoritative application truth');
ok((mg.informationalReply||'').includes('ما عندي طلب موثوق'),'missing application confirmation fails closed with actionable explanation');

const gate=loadTs(rel('finalResponseGate.ts'),{
  './applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:(a)=>stageOf(a)},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{products:'https://www.ameenfinance.co/products',tracking:'https://www.ameenfinance.co/track?tracking=AM-1000000000001&phone=0790000000'}})},
  './paymentEligibilityFirewall':pay,
  './mutationConfirmationGate':{mutationQuestion:()=>false,pendingActionIsCurrentTurnFocus:()=>false},
  './truthSnapshotLock':{paymentHistoricallyConfirmed:(a)=>paid(a) || String(a?.status||'').toLowerCase()==='refund_requested'},
  './text':{normalizeArabic},
});
function runGate({reply,raw,a=app(),topics=[],requestedActions=[]}){ const t=turn(raw,topics); t.requestedActions=requestedActions; return gate.enforceFinalResponseGate({reply,turn:t,state:state(),truth:truth(a),actions:[],applicationChanged:false}); }
let g=runGate({reply:'تمام، حول 5 دنانير على AMEEENPAY وارفع الوصل من https://www.ameenfinance.co/receipt?x=1',raw:'عادي لو زودت الدفعات تبعت القسط الشهري؟',topics:['payment_method'],a:app()});
ok(!g.pass && g.severity==='p0','installment question leaking file-opening payment details is P0 blocked');
ok(g.violations.includes('non_fee_payment_context_leaked_file_opening_details'),'semantic payment leak has explicit integrity violation');
ok((g.replacementReply||'').includes('مبلغ أكبر من القسط الشهري'),'payment leak replacement answers the actual installment question');
g=runGate({reply:'إذا عندك طلب سابق ابعث رقم التتبع مرة واحدة',raw:'ماعندي طلب سابق',topics:['application_status'],a:null});
ok(!g.pass && g.violations.includes('no_application_or_form_issue_wrong_tracking_fallback'),'no-prior-application statement cannot loop back to tracking');
ok((g.replacementReply||'').includes('/products'),'no-prior-application replacement starts clean application path');
g=runGate({reply:'إذا عندك طلب سابق ابعث رقم التتبع',raw:'حطيت كلشي بس ماكمل',topics:['website'],a:null});
ok(!g.pass && g.violations.includes('no_application_or_form_issue_wrong_tracking_fallback'),'stuck form cannot be routed to tracking fallback');
ok((g.replacementReply||'').includes('اسم الخانة'),'form issue replacement asks for useful diagnostic detail');
g=runGate({reply:'ما عندي طلب موثوق مربوط بهالرسالة هسا',raw:'يعني بزبط ع الهويه فقط ؟',topics:['requirements'],a:null});
ok(!g.pass && g.violations.includes('general_requirements_not_answered'),'general requirements question cannot be rejected for lack of application');
ok((g.replacementReply||'').includes('إثبات الدخل'),'general requirements replacement answers identity-only question');
g=runGate({reply:'ما في عندي خطوة دفع موثقة ومفتوحة على الحالة الحالية',raw:'عن طريق بنك وشو الشروط المطلوبه',topics:['requirements'],a:null});
ok(!g.pass && g.violations.includes('general_requirements_not_answered'),'bank/requirements question cannot fall into payment firewall boilerplate');
ok((g.replacementReply||'').includes('مش قرض بنكي'),'financing structure replacement answers bank question directly');
g=runGate({reply:'الكفيل ما لازم يكون موظف، المهم يكون قادر على التغطية وحركة الحساب بتساعد',raw:'لازم الكفيل يكون موظف؟',topics:['requirements'],a:app()});
ok(!g.pass && g.violations.includes('unsupported_guarantor_acceptance_rule'),'unsupported guarantor employment/coverage rule is blocked');
ok((g.replacementReply||'').includes('مش شرط ثابت لكل طلب'),'guarantor replacement stays within documented conditional policy');
g=runGate({reply:'إذا قصدك تدفع مبلغ أكبر من القسط الشهري، ما عندي قاعدة موثقة أقدر أقول إنها تلقائيًا تغيّر مدة العقد.',raw:'عادي لو زودت الدفعات تبعت القسط الشهري؟',topics:['installment_amount'],a:app()});
ok(g.pass,'clean installment answer passes final gate');
g=runGate({reply:'إذا سؤالك هل الهوية لحالها بتكفي: لا، إثبات الدخل من المتطلبات الأساسية مع الهوية.',raw:'بزبط ع الهويه فقط؟',topics:['requirements'],a:null});
ok(g.pass,'clean general requirements answer passes without application truth');

const cr=read(rel('conversationRecovery.ts'));
const wc=read(rel('writerContract.ts'));
const fg=read(rel('finalResponseGate.ts'));
const pf=read(rel('paymentEligibilityFirewall.ts'));
const mc=read(rel('mutationConfirmationGate.ts'));
ok(cr.includes('dialogueSignals.installmentAdjustment'),'conversation recovery owns installment-adjustment subtype');
ok(cr.includes('dialogueSignals.noPriorApplication'),'conversation recovery owns no-prior-application veto');
ok(cr.includes('dialogueSignals.applicationFormIssue'),'conversation recovery owns application-form support path');
ok(cr.includes('إثبات الدخل من المتطلبات الأساسية'),'conversation recovery has direct requirements truth');
ok(pf.includes('non_fee_payment_context'),'payment firewall owns semantic non-fee payment block');
ok(mc.includes('recoverableConfirmation'),'mutation gate recovers exact second confirmation after pending-token loss');
ok(mc.includes('pendingScopeMatchesTruth'),'mutation confirmation remains scoped to current authoritative application');
ok(wc.includes('intent=payment'),'writer contract explicitly forbids generic payment intent from exposing 5 JOD path');
ok(wc.includes('VETO صريح على tracking/status fallback'),'writer contract honors no-prior-application statement');
ok(wc.includes('لا تضع شروط قبول للكفيل من عندك'),'writer contract forbids invented guarantor criteria');
ok(fg.includes('non_fee_payment_context_leaked_file_opening_details'),'final gate independently blocks semantic 5 JOD leakage');
ok(fg.includes('no_application_or_form_issue_wrong_tracking_fallback'),'final gate independently blocks no-app tracking loop');
ok(fg.includes('unsupported_guarantor_acceptance_rule'),'final gate independently blocks invented guarantor criteria');

console.log(`SELFTEST PASSED ${passed}/${passed} - V3 PHASE 7.3.4 SEMANTIC ROUTING + MUTATION RECOVERY`);
