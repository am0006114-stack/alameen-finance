const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const root=process.argv[2]||process.cwd();
const V3='app/api/whatsapp/webhook/_lib/v3-os';
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0,failed=0;
function ok(v,m){if(v){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}}
function normalizeArabic(value){return String(value||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/ة/g,'ه')}
function stageOf(app){
  if(!app)return'unbound'; const s=String(app.status||'').toLowerCase(),p=String(app.paymentStatus||'').toLowerCase();
  if(['refund_completed','refunded'].includes(s)||['refund_completed','refunded'].includes(p))return'refund_completed';
  if(s==='refund_requested'||p==='refund_requested')return'refund_requested';
  if(['cancelled','customer_declined_continue','rejected'].includes(s))return'cancelled';
  if(app.paymentConfirmedAt||['confirmed','paid','payment_confirmed'].includes(p))return'payment_confirmed_under_review';
  if(['customer_claimed_paid','pending_payment_confirmation'].includes(p))return'payment_proof_pending_admin';
  if(s==='customer_confirmed_continue'||['pending','pending_payment','payment_info_sent'].includes(p))return'continuation_confirmed_fee_due';
  if(s==='preliminary_qualified'||app.preliminaryQualifiedAt)return'preliminary_approved_waiting_decision';
  if(['','submitted','preliminary_application'].includes(s))return'preliminary_review';
  return'other';
}
function commercial(app){
  const st=stageOf(app); if(!app)return'no_application'; if(st==='payment_confirmed_under_review')return'already_paid'; if(st==='payment_proof_pending_admin')return'payment_pending_admin'; if(st==='continuation_confirmed_fee_due'||st==='preliminary_approved_waiting_decision'&&String(app.status)==='customer_confirmed_continue')return'payment_ready'; if(String(app.status)==='customer_confirmed_continue'||['pending','pending_payment','payment_info_sent'].includes(String(app.paymentStatus||'')))return'payment_ready'; return'not_ready';
}
function load(file,mocks){const src=read(file);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:file});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const module={exports:{}};const req=id=>{if(Object.prototype.hasOwnProperty.call(mocks,id))return mocks[id];throw new Error(`unmocked ${id}`)};new Function('require','module','exports',out.outputText)(req,module,module.exports);return module.exports;}
const policy={
  fileOpeningFeeJod:5,
  commercialStructureRule:'نظام التعامل عند الأمين للأقساط مرابحة وليس قرضًا ربويًا.',
  additionalFeesRule:'لا توجد دفعة أولى على الجهاز، ولا تأمين، ولا رسوم عقد أو رسوم إدارية إضافية غير رسوم فتح الملف 5 دنانير. القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد.',
  requirementsGuidanceRule:'الهوية وإثبات الدخل من الأساسيات. بيانات الكفيل ليست شرطًا ثابتًا لكل طلب، والملف القوي قد يمشي بدون كفيل حسب الدراسة. إذا ما في كشف أو شهادة راتب، ممكن تُذكر/تُرفع بدائل مناسبة لطبيعة الدخل مثل كشف حساب بنكي أو عقد عمل أو مستند رسمي يوضح مصدر الدخل، والدراسة تحدد المقبول النهائي حسب حالة الملف.',
  paymentMethodRule:'التحويل إلى PAYAMEEEN أو AMEEN1ST أو AM500337 أو الرقم 0788500337، مع مراجعة اسم المستفيد ABDUL RAHMAN ALHARAHSHEH.',
};
const app=(status='customer_confirmed_continue',extra={})=>({id:'a1',trackingId:'AM-1788963263038',status,paymentStatus:'pending_payment',paymentConfirmedAt:null,installmentMonths:36,totalWithInterest:1320.83,documents:{identityComplete:false},...extra});
const truth=(a)=>({application:a,policy});
const state={role:{currentRole:'omran',introduced:false},facts:[],openLoops:[],pendingAction:null,pendingActionPayload:null,lastCustomerText:null,lastAssistantText:null};
const h=load(`${V3}/humanFirstConversationAuthority.ts`,{
  './applicationJourney':{applicationJourneyStage:stageOf},
  './commercialProgression':{continuationCommercialState:commercial},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{tracking:'https://www.ameenfinance.co/track?tracking=AM-1788963263038&phone=0780000000',receipt:'https://www.ameenfinance.co/receipt?tracking=AM-1788963263038&phone=0780000000'}})},
  './hierarchy':{roleDisplayName:()=> 'عمران'},
  './text':{normalizeArabic},
  './types':{},
});
function turn(raw,topics=[],requestedActions=[]){return{turnId:'t1',rawText:raw,normalizedText:normalizeArabic(raw),acts:[],topics,requestedActions,sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:1,warnings:[]}}

ok(h.cancellationStatusQuestionText('تم الغاء الطلب صح ؟'),'detects cancellation-status confirmation question');
ok(h.cancellationStatusQuestionText('اعطيني دليل انك الغيت الطلب'),'detects proof-of-cancellation question');
ok(h.currentFeePaymentQuestionText('احول المصاري هلأ؟'),'detects pay-now question');
ok(h.currentFeePaymentQuestionText('بدي ادفع الخمس دنانير'),'detects explicit 5 JOD payment question');
ok(h.feeDeferralOrNoMoneyText('بدي اكمل بس اسا ما معي مصاري'),'detects cannot-pay-now continuation');
ok(h.feeDeferralOrNoMoneyText('بسير ادفع 5 دنانير مع القسط؟'),'detects fee deferral to installment');
ok(h.feeVsFirstInstallmentConfusionText('طيب انت قلت مافي دفعه اولى'),'detects fee vs first-installment confusion');
ok(h.aiIdentityQuestionText('انتا Ai صح ؟'),'detects direct AI identity question');
ok(h.falseLiteralHumanIdentityClaim('هههه لا والله، أنا موظف عادي'),'blocks false literal human claim');
ok(h.expediteTodayText('مايصير تمشيها اليوم'),'detects colloquial expedite-today request');
ok(h.websiteDocumentAcknowledgementText('لا انا صورتها عالموقع'),'detects website identity upload acknowledgement');
ok(h.requirementsHelpText('كيف اخلي ملفي قوي'),'detects file-strength guidance question');
ok(h.requirementsHelpText('ما عندي شهادة راتب شو الحل'),'detects income-proof alternative question');
ok(h.multiCommercialFaqText('نظامكم مرابحة ولا ربوي؟ في دفعة أولى أو تأمين؟ وفي غرامة لو تأخر القسط؟'),'detects multi-question commercial FAQ');

let r=h.buildHumanFirstConversationAuthorityReply({turn:turn('الغيت الطلب صح؟',['cancellation']),state,truth:truth(app('cancelled',{paymentStatus:null})),actions:[]});
ok(/ملغي بالفعل/.test(r||''),'already-cancelled question answers yes instead of asking confirmation');
ok(/track\?tracking=/.test(r||''),'cancellation verification includes official tracking proof when available');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('تم الغاء الطلب صح؟',['cancellation']),state,truth:truth(app('cancelled',{paymentStatus:'refund_requested'})),actions:[]});
ok(/الاسترداد مسجل/.test(r||''),'refund_requested cancellation status includes refund truth');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('بدي ادفع الخمس دنانير',['payment_fee']),state,truth:truth(app()),actions:[]});
ok(/المطلوب 5 دنانير/.test(r||'')&&/PAYAMEEEN/.test(r||'')&&/receipt\?tracking=/.test(r||''),'explicit pay-now gets current payment instructions and receipt link');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('بدي اكمل بس اسا ما معي مصاري',['continuation']),state,truth:truth(app()),actions:[]});
ok(/ما في مشكلة ولا ضغط/.test(r||'')&&!/PAYAMEEEN/.test(r||''),'cannot-pay-now gets human pause without dumping transfer aliases');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('بسير ادفع 5 دنانير مع القسط؟',['payment_timing']),state,truth:truth(app()),actions:[]});
ok(/ما بتنضاف على القسط الأول/.test(r||'')||/ما بتتأجل معه/.test(r||''),'fee cannot be deferred to first installment');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('طيب انت قلت مافي دفعه اولى',['first_installment']),state,truth:truth(app()),actions:[]});
ok(/ما في دفعة أولى/.test(r||'')&&/5 دنانير مش دفعة أولى/.test(r||''),'clarifies no down payment vs 5 JOD fee');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('بدي ادفع الخمس',['payment_fee']),state,truth:truth(app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-09'})),actions:[]});
ok(/الدفع مؤكد إداريًا/.test(r||'')&&/ما في داعي/.test(r||''),'confirmed payment never recollects fee');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('نظامكم مرابحة ولا ربوي؟ في دفعة أولى أو تأمين؟ الجهاز ياباني؟ في غرامة تأخير؟ وبزبط سنتين؟'),state,truth:truth(app()),actions:[]});
ok(/مرابحة/.test(r||'')&&/لا توجد دفعة أولى/.test(r||'')&&/منشأ الجهاز/.test(r||'')&&/التأخير/.test(r||'')&&/24 شهر/.test(r||''),'multi-commercial FAQ answers every material question in one response');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('كيف اخلي ملفي قوي'),state,truth:truth(app('submitted',{paymentStatus:null})),actions:[]});
ok(/الملف القوي قد يمشي بدون كفيل/.test(r||'')&&/كشف حساب/.test(r||''),'approved requirements guidance is preserved');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('انتا Ai صح ؟'),state,truth:truth(app()),actions:[]});
ok(/معك عمران من فريق الأمين/.test(r||'')&&!/موظف عادي/.test(r||''),'AI question receives safe human-first persona reply without false identity');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('بدي انيكك',['abuse']),state,truth:truth(null),actions:[]});
ok(/بدون إساءة/.test(r||'')&&!/طلب موثوق/.test(r||''),'abuse-only turn gets human boundary instead of missing-application fallback');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('مايصير تمشيها اليوم'),state,truth:truth(app('submitted',{paymentStatus:null})),actions:[]});
ok(/ما بقدر أضمن قرار اليوم/.test(r||'')&&!/تفاصيل الطلب مش كاملة/.test(r||''),'expedite request is answered directly without missing-details escape');
r=h.buildHumanFirstConversationAuthorityReply({turn:turn('لا انا صورتها عالموقع'),state,truth:truth(app('submitted',{paymentStatus:null,documents:{identityComplete:true}})),actions:[]});
ok(/الهوية ظاهرة مكتملة/.test(r||''),'website identity upload gets direct acknowledgement when truth confirms');

ok(h.replyMisalignedWithHumanFirstAuthority({turn:turn('بدي ادفع الخمس'),state,truth:truth(app()),reply:'رغبتك بالاستمرار مسجلة بالفعل، جاوبني بالنقطة اللي بدك تعرفها'}),'payment question rejects continuation boilerplate');
ok(h.replyMisalignedWithHumanFirstAuthority({turn:turn('الغيت الطلب صح؟'),state,truth:truth(app('cancelled',{paymentStatus:null})),reply:'اكتب نعم ألغي الطلب للتأكيد'}),'cancelled-status question rejects repeated confirmation prompt');
ok(h.replyMisalignedWithHumanFirstAuthority({turn:turn('انتا Ai صح ؟'),state,truth:truth(app()),reply:'أنا موظف عادي مثلي مثل غيري'}),'AI question rejects false literal human identity');
ok(h.replyMisalignedWithHumanFirstAuthority({turn:turn('بدي انيكك',['abuse']),state,truth:truth(null),reply:'ما عندي طلب موثوق مربوط بهالرسالة'}),'abuse-only turn rejects unrelated application fallback');

const runtime=read(`${V3}/runtimeLive.ts`), gate=read(`${V3}/finalResponseGate.ts`), mutation=read(`${V3}/mutationConfirmationGate.ts`), writer=read(`${V3}/writerContract.ts`), planner=read(`${V3}/planner.ts`), policySrc=read(`${V3}/policy.ts`), types=read(`${V3}/types.ts`), journey=read(`${V3}/applicationJourney.ts`), zero=read(`${V3}/zeroFallback.ts`), resolver=read(`${V3}/contextualTurnResolver.ts`);
ok(runtime.includes('applyAuthoritativeActionConversationMemory'),'runtime persists authoritative executed-action memory');
ok(runtime.includes('buildHumanFirstConversationAuthorityReply'),'runtime has high-confidence human conversation authority layer');
ok(runtime.indexOf('humanAuthorityReply')<runtime.indexOf('prioritizeRecovery && recoveryReply'),'human authority pre-empts stale recovery fallback');
ok(runtime.includes('appendSafeIdentityAnswerIfAsked'),'multi-act action + AI identity can keep action truth and safe identity answer');
ok(mutation.includes('alreadyCancelled')&&mutation.includes('ما في داعي تعيد طلب الإلغاء'),'mutation gate blocks repeated cancellation after authoritative cancellation');
ok(gate.includes('human_first_current_turn_authority_violation'),'final gate owns human-first current-turn mismatch');
ok(gate.includes('false_literal_human_identity_claim'),'final gate blocks false literal human identity');
ok(zero.includes('buildHumanFirstConversationAuthorityReply'),'zero fallback also honors current human authority');
ok(policySrc.includes('commercialStructureRule')&&policySrc.includes('مرابحة وليس قرضًا ربويًا'),'approved advertising structure is encoded as policy truth');
ok(policySrc.includes('additionalFeesRule')&&policySrc.includes('لا توجد دفعة أولى'),'approved no-down-payment/additional-fee ad truth is encoded');
ok(policySrc.includes('requirementsGuidanceRule')&&policySrc.includes('الملف القوي قد يمشي بدون كفيل'),'user-approved requirements guidance is encoded');
ok(writer.includes('CURRENT TURN AUTHORITY مطلق')&&writer.includes('ما معي هسا'),'writer contract explicitly prioritizes current commercial question over continuation state');
ok(writer.includes('لا تقل "أنا إنسان"')||writer.includes('لا تقل "أنا إنسان"'),'writer contract retains no-false-human-identity rule');
ok(planner.includes('requirementsGuidanceRule'),'planner uses approved requirements guidance');
ok(resolver.includes('مرابحه|مرابحة|ربوي|ربا'),'single murabaha/riba question is recognized as financing structure');
ok(journey.includes('return "الطلب ملغي"'),'cancelled application gets unambiguous customer-facing label');
ok(types.includes('v3.0.0-phase7.4.3-action-commercial-human-authority'),'runtime version identifies 7.4.3');
ok(!runtime.includes('LIVE_SCOPED_MUTATIONS.add'),'7.4.3 does not expand Real Actions');
const all=[runtime,gate,mutation,writer,planner,policySrc,types,journey,zero,resolver,read(`${V3}/humanFirstConversationAuthority.ts`),read(`${V3}/actionConversationMemory.ts`)].join('\n');
ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE TABLE)\b/i.test(all),'7.4.3 source introduces no SQL mutation');
console.log(`RESULT: ${passed}/${passed+failed} PASS`);if(failed)process.exit(1);
