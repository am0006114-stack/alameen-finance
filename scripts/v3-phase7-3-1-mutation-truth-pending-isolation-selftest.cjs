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
function state(){ return {version:'v3.0.0-phase7.1.1-truth-locked-actions',waId:'9627',activeApplicationId:'app1',activeTrackingId:'AM-1000000000001',currentTopic:null,currentGoal:null,role:{currentRole:'tala',tier:'frontline',reason:'',sinceTurnId:null,introduced:false},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,updatedAt:new Date().toISOString()}; }
function app(extra={}){ return {id:'app1',trackingId:'AM-1000000000001',fullName:'Test',phone:'0790000000',status:'under_review',paymentStatus:'payment_confirmed',paymentConfirmedAt:'2026-09-05T00:00:00Z',paymentReference:'ref',deviceId:null,deviceName:'iPhone',devicePrice:700,installmentMonths:36,downPayment:0,interestRate:15,monthlyPayment:20,totalWithInterest:720,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:'2026-09-01T00:00:00Z',paidClickedAt:null,documents:{loaded:true,types:['receipt'],identityComplete:true,salarySlipUploaded:true,guarantorIdentityComplete:null,guarantorDataComplete:null,paymentReceiptUploaded:true},...extra}; }
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,fileOpeningFeeTiming:'',fileOpeningFeePurposeRule:'',fileOpeningFeeRefundRule:'',continuationReassuranceRule:'',firstInstallmentRule:'',pickupRule:'',secureDocumentsRule:'',independenceStatement:'',paymentAliases:['AMEEENPAY','AMENPAY'],paymentWalletType:'Orange Money',paymentBeneficiaryName:'ABDUL RAHMAN ALHARAHSHEH',paymentMethodRule:'',paymentConfirmationRule:'',normalReviewWindow:'من يومين لـ3 أيام عمل',reviewPressureLevel:'severe',severePressureRule:'',refundPressureRule:'',disputeResolutionRule:'',autonomousSupervisorRule:'',forbiddenClaims:[]};
function truth(a=app()){ return {confidence:'authoritative',source:'current_message_tracking',application:a,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}; }
function turn(raw){ return {turnId:'t1',rawText:raw,normalizedText:normalizeArabic(raw),acts:[],topics:[],requestedActions:[],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.9,warnings:[]}; }
const files=['mutationConfirmationGate.ts','truthSnapshotLock.ts','contextualTurnResolver.ts','conversationRecovery.ts','finalResponseGate.ts','runtimeLive.ts','writerContract.ts','zeroFallback.ts'].map(rel);
for(const f of files){ const out=ts.transpileModule(read(f),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:f}); const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); ok(errs.length===0,'TypeScript syntax '+f); }

const mg=loadTs(rel('mutationConfirmationGate.ts'),{'./text':{normalizeArabic}});
const cancelAction={action:'cancel_application',sourceActId:'a',requiresConfirmation:false,authority:'ai_planned',requiredRole:'omran',payload:null};
let r=mg.enforceMutationConfirmationGate({actions:[cancelAction],turn:turn('طيب بزبط الغي؟'),state:state(),truth:truth()});
ok(r.actions.length===0,'cancellation question cannot reach action plane');
ok(r.blockedQuestionAction==='cancel_application','cancellation question is explicitly classified as non-consent');
ok(/ما اعتبرته طلب إلغاء/.test(r.informationalReply||''),'customer receives natural informational cancellation answer');

r=mg.enforceMutationConfirmationGate({actions:[],turn:turn('بدي ألغي الطلب'),state:state(),truth:truth()});
ok(r.actions.length===1 && r.actions[0].action==='cancel_application','explicit cancellation request is deterministically staged');
ok(r.actions[0].requiresConfirmation===true,'first cancellation turn requires confirmation');
ok(r.actions[0].payload._mutationConfirmationRequired===true,'confirmation requirement is persisted in action payload');
ok(/تأكيد منفصل/.test(r.confirmationPrompt||''),'first cancellation turn asks separate confirmation');

let s=state(); s.pendingAction='cancel_application'; s.pendingActionPayload={_mutationConfirmationRequired:true,_scopeApplicationId:'app1'}; s.lastAssistantText='للتأكيد قبل ما أنفذ الإلغاء: أكدلي إذا بدك ألغي الطلب';
r=mg.enforceMutationConfirmationGate({actions:[],turn:turn('نعم، ألغي الطلب'),state:s,truth:truth()});
ok(r.confirmedAction==='cancel_application','second explicit confirmation resolves pending cancellation');
ok(r.actions.some(x=>x.action==='cancel_application' && x.requiresConfirmation===false),'confirmed cancellation is injected for this turn only');

r=mg.enforceMutationConfirmationGate({actions:[cancelAction],turn:turn('بديش الغي، سألتك بس'),state:s,truth:truth()});
ok(r.actions.length===0 && r.clearPendingConfirmation,'customer correction clears pending cancellation');

r=mg.enforceMutationConfirmationGate({actions:[],turn:turn('اعطيني رابط التتبع'),state:s,truth:truth()});
ok(r.clearPendingConfirmation,'unrelated substantive turn expires dangerous pending confirmation');
ok(!r.confirmedAction,'unrelated turn never confirms mutation');

const refundAction={...cancelAction,action:'request_refund'};
r=mg.enforceMutationConfirmationGate({actions:[refundAction],turn:turn('كيف بقدر استرد الرسوم؟'),state:state(),truth:truth()});
ok(r.actions.length===0 && r.blockedQuestionAction==='request_refund','refund how-to question cannot create refund request');
r=mg.enforceMutationConfirmationGate({actions:[],turn:turn('بدي استرد الرسوم'),state:state(),truth:truth()});
ok(r.actions[0]?.action==='request_refund' && r.actions[0].requiresConfirmation,'refund request also requires two-step confirmation');

const tl=loadTs(rel('truthSnapshotLock.ts'),{});
let prev=state(); prev.lastVerifiedApplication={application:app(),fetchedAt:new Date().toISOString()};
let degraded=app({paymentConfirmedAt:null,paymentReference:null,paymentStatus:'refund_requested',documents:{loaded:true,types:[],identityComplete:null,salarySlipUploaded:null,guarantorIdentityComplete:null,guarantorDataComplete:null,paymentReceiptUploaded:false}});
let locked=tl.stabilizeTruthSnapshot({truth:truth(degraded),state:prev});
ok(locked.application.paymentConfirmedAt==='2026-09-05T00:00:00Z','confirmed payment timestamp is monotonic across truth refreshes');
ok(locked.application.paymentReference==='ref','payment reference is monotonic across truth refreshes');
ok(locked.application.documents.paymentReceiptUploaded===true,'receipt evidence cannot disappear on later truth read');
ok(tl.paymentHistoricallyConfirmed(degraded),'refund_requested itself proves historical payment confirmation for response safety');

const ctx=loadTs(rel('contextualTurnResolver.ts'),{'./text':{normalizeArabic}});
let c=ctx.contextualTurnSignals({turn:turn('يا رجل الموقع تبعكم مش راضي يفتح'),state:state(),recentTurns:[]});
ok(c.siteIssue && c.topics.includes('website'),'site issue is resolved deterministically');
c=ctx.contextualTurnSignals({turn:turn('اعطيني رابط التتبع لطلبي'),state:state(),recentTurns:[]});
ok(c.trackingLinkRequest && c.topics.includes('tracking'),'tracking link request is resolved deterministically');
c=ctx.contextualTurnSignals({turn:turn('شو هاذ الاسترداد تبع شو'),state:state(),recentTurns:[]});
ok(c.refundMeaning && c.topics.includes('refund'),'refund meaning question is preserved as semantic topic');
c=ctx.contextualTurnSignals({turn:turn('بديش الغي، بدي اكمل'),state:state(),recentTurns:[]});
ok(c.continueAfterCancellation && c.topics.includes('reopen'),'customer correction after cancellation becomes reopen context');

const rt=read(rel('runtimeLive.ts')), fg=read(rel('finalResponseGate.ts')), zf=read(rel('zeroFallback.ts')), wc=read(rel('writerContract.ts')), cr=read(rel('conversationRecovery.ts'));
ok(rt.includes('enforceMutationConfirmationGate'),'runtime has central mutation confirmation gate');
ok(rt.indexOf('enforceMutationConfirmationGate({') < rt.indexOf('executeActions({'),'mutation confirmation gate runs before action plane');
ok(rt.includes('NEVER auto-executed merely because the customer sent another message'),'historical awaiting_admin mutation auto-execution is disabled');
ok(!/actionsToExecute\.push\(stampActionScope\(\{[\s\S]{0,450}pendingScopedAction/.test(rt),'pending scoped action is not implicitly pushed into execution');
ok(rt.includes('actionsToExecute.length && actionNeedsTruthRefresh'),'truth refresh follows actual execution set, including injected confirmation action');
ok(rt.includes('stabilizeTruthSnapshot'),'single stabilized truth snapshot is used by runtime');
ok(rt.includes('manualReply && manualReplyRelevant'),'manual pending action cannot monopolize unrelated turns');
ok(zf.includes('pendingActionIsCurrentTurnFocus'),'zero fallback also isolates pending manual action');
ok(fg.includes('mutation_executed_from_question'),'final egress gate independently blocks mutation from a question');
ok(fg.includes('historically_confirmed_payment_cannot_be_denied'),'final egress gate blocks payment-history contradictions');
ok(fg.includes('tracking_link_request_not_answered'),'final gate enforces direct tracking-link answers');
ok(fg.includes('refund_meaning_question_not_answered'),'final gate enforces explanation of refund meaning');
ok(wc.includes('الإلغاء والاسترداد الحقيقيان يحتاجان طلبًا صريحًا ثم تأكيدًا منفصلًا'),'writer contract knows two-step mutation rule');
ok(wc.includes('pending action يدوي في STATE هو معلومة خلفية فقط'),'writer contract prevents pending-action monopoly');
ok(cr.includes('المشكلة اللي بتحكي عنها بالموقع نفسه'),'site issue has deterministic human recovery');
ok(cr.includes('هذا رابط التتبع الرسمي لطلبك'),'tracking request has deterministic direct reply');
ok(cr.includes('الاسترداد يعني إن الطلب ما عاد ماشي حاليًا كطلب تقسيط عادي'),'refund meaning gets direct human explanation');

console.log(`SELFTEST PASSED ${passed}/${passed} - V3 PHASE 7.3.1 MUTATION CONFIRMATION + SINGLE TRUTH + PENDING ISOLATION`);
