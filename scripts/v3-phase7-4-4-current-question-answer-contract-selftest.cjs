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
function label(app){const s=stageOf(app);return({preliminary_review:'قيد المراجعة المبدئية',preliminary_approved_waiting_decision:'موافقة مبدئية',continuation_confirmed_fee_due:'تم تسجيل رغبتك بالاستمرار',payment_proof_pending_admin:'إثبات الدفع بانتظار مراجعة الإدارة',payment_confirmed_under_review:'قيد الدراسة النهائية',cancelled:'الطلب ملغي',refund_requested:'الاسترداد قيد المعالجة',refund_completed:'تم الاسترداد'})[s]||'قيد المتابعة'}
function commercial(app){const s=stageOf(app); if(!app)return'no_application'; if(s==='payment_confirmed_under_review')return'already_paid'; if(s==='payment_proof_pending_admin')return'payment_pending_admin'; if(s==='continuation_confirmed_fee_due')return'payment_ready'; return'not_ready'}
function load(file,mocks){const src=read(file);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:file});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const module={exports:{}};const req=id=>{if(Object.prototype.hasOwnProperty.call(mocks,id))return mocks[id];throw new Error(`unmocked ${id}`)};new Function('require','module','exports',out.outputText)(req,module,module.exports);return module.exports;}
const policy={normalReviewWindow:'المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل',paymentMethodRule:'التحويل عبر CliQ إلى PAYAMEEEN أو AMEEN1ST أو AM500337 أو الرقم 0788500337 مع مراجعة اسم المستفيد ABDUL RAHMAN ALHARAHSHEH.'};
const app=(status='customer_confirmed_continue',extra={})=>({id:'a1',trackingId:'AM-1788772932842',status,paymentStatus:'pending_payment',paymentConfirmedAt:null,...extra});
const truth=(a)=>({application:a,policy});
const state={role:{currentRole:'abdullah'},facts:[],openLoops:[],pendingAction:null,pendingActionPayload:null,lastCustomerText:null,lastAssistantText:null};
function turn(raw,topics=[],requestedActions=[]){return{turnId:'t1',rawText:raw,normalizedText:normalizeArabic(raw),acts:[],topics,requestedActions,sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:1,warnings:[]}}
const cq=load(`${V3}/currentQuestionAnswerContract.ts`,{
  './applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:label},
  './commercialProgression':{continuationCommercialState:commercial},
  './linkIntegrity':{buildOfficialLinkContext:(_t,tr)=>({relevant:{tracking:tr.application?`https://www.ameenfinance.co/track?tracking=${tr.application.trackingId}&phone=0790000000`:null,receipt:tr.application?`https://www.ameenfinance.co/receipt?tracking=${tr.application.trackingId}&phone=0790000000`:null}})},
  './text':{normalizeArabic}, './types':{}
});

ok(cq.directPaymentExecutionQuestion(turn('ادفع هلأ',['payment_fee'])),'detects bare pay-now question');
ok(cq.directPaymentExecutionQuestion(turn('هلا بحول المصاري',['payment_status'])),'detects colloquial transfer-now question');
ok(cq.directPaymentExecutionQuestion(turn('طيب أدفع الآن',['payment_method'])),'detects polite direct pay-now question');
ok(!cq.directPaymentExecutionQuestion(turn('بدي ادفع قسطين بدل قسط',['installment_amount'])),'does not confuse installment adjustment with 5 JOD payment');
ok(cq.postContinuationProgressQuestion(turn('كده الطلب كمل ولا')),'detects post-continuation progress question');
ok(cq.postContinuationProgressQuestion(turn('شو ناقص هسا')),'detects what-remains question');
ok(cq.postContinuationProgressQuestion(turn('هيك الملف خلص ولا')),'detects colloquial completion question');
ok(!cq.postContinuationProgressQuestion(turn('بدي اكمل الطلب',['continuation'],['continue_application'])),'does not steal explicit continuation action');
ok(cq.conciseStatusQuestion(turn('شو صار؟',['application_status'])),'detects short status question');
ok(cq.conciseStatusQuestion(turn('تحديث؟',['application_status'])),'detects one-word update question');
ok(cq.conciseStatusQuestion(turn('شو صار بالطلب\nمعلق عند ٩٢ بال ١٠٠\nمن امبارح\nبالله عليك شوفلي حل',['application_status','review_timing'])),'detects burst status + delay complaint');
ok(!cq.conciseStatusQuestion(turn('إلغاء الطلب',['cancellation'],['cancel_application'])),'does not override sensitive mutation');
let m=cq.mediaEnvelopeTurn(turn('تم استلام صورة من العميل بدون تعليق.',['unknown'])); ok(m.image&&!m.voice,'detects inbound image envelope');
m=cq.mediaEnvelopeTurn(turn('تم استلام رسالة صوتية من العميل. لا يوجد تفريغ نصي تلقائي للصوت حاليًا.',['unknown'])); ok(m.voice&&!m.image,'detects inbound voice envelope');

let r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('ادفع هلأ',['payment_fee']),state,truth:truth(app())});
ok(/هسا بتقدر تدفع/.test(r||'')&&/5 دنانير/.test(r||'')&&/PAYAMEEEN/.test(r||'')&&/receipt\?tracking=/.test(r||''),'bare pay-now receives actionable current fee answer');
ok(!/رغبتك بالاستمرار مسجلة/.test(r||''),'pay-now answer never collapses to continuation boilerplate');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('ادفع هلأ',['payment_fee']),state,truth:truth(app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-10'}))});
ok(/الدفع مؤكد إداريًا/.test(r||'')&&!/PAYAMEEEN/.test(r||''),'confirmed payment blocks duplicate collection');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('ادفع هلأ',['payment_fee']),state,truth:truth(app('customer_confirmed_continue',{paymentStatus:'pending_payment_confirmation'}))});
ok(/بانتظار اعتماد الإدارة/.test(r||'')&&!/PAYAMEEEN/.test(r||''),'receipt-pending truth blocks duplicate collection');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('ادفع هلأ',['payment_fee']),state,truth:truth(app('preliminary_qualified',{paymentStatus:null,preliminaryQualifiedAt:'2026-09-10'}))});
ok(/لازم يكون قرار الاستمرار مسجل/.test(r||'')&&!/PAYAMEEEN/.test(r||''),'pre-continue payment question does not leak destination');

r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('كده الطلب كمل ولا',['application_status']),state,truth:truth(app())});
ok(/لسا ما دخل الدراسة النهائية/.test(r||'')&&/5 دنانير/.test(r||'')&&/receipt\?tracking=/.test(r||''),'post-continuation completion question explains exact remaining step');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('كده الطلب كمل ولا',['application_status']),state,truth:truth(app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-10'}))});
ok(/خطوة فتح الملف مكتملة/.test(r||'')&&/قيد الدراسة النهائية/.test(r||''),'post-payment completion question answers yes with current stage');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('شو صار؟',['application_status']),state,truth:truth(app())});
ok(/الخطوة الحالية فتح الملف/.test(r||'')&&/5 دنانير/.test(r||''),'short status at fee-due stage answers current stage, not stale continuation');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('تحديث؟',['application_status']),state,truth:truth(app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-10'}))});
ok(/قيد الدراسة النهائية/.test(r||'')&&/الدفع مؤكد إداريًا/.test(r||''),'short update after payment answers final-review truth');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('شو صار بالطلب\nمعلق عند ٩٢ بال ١٠٠\nمن امبارح',['application_status','review_timing']),state,truth:truth(app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-10'}))});
ok(/ضغط المراجعات/.test(r||'')&&/موعد نهائي مؤكد/.test(r||''),'delay burst receives timing context without fake ETA');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('تحديث؟',['application_status']),state,truth:truth(app('submitted',{paymentStatus:null}))});
ok(/قيد المراجعة المبدئية/.test(r||''),'short update in preliminary review returns correct stage');

r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('تم استلام رسالة صوتية من العميل. لا يوجد تفريغ نصي تلقائي للصوت حاليًا.',['unknown']),state,truth:truth(app())});
ok(/ما قدرت أسمعها/.test(r||'')&&!/قدرتش/.test(r||''),'voice fallback is Jordanian, not Egyptian negation');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('تم استلام صورة من العميل بدون تعليق.',['unknown']),state,truth:truth(app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-10'}))});
ok(/الدفع عندك مؤكد إداريًا/.test(r||'')&&!/تفاصيل الطلب مش كاملة/.test(r||''),'image after confirmed payment keeps application continuity');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('تم استلام صورة من العميل بدون تعليق.',['unknown']),state,truth:truth(app())});
ok(/صورة واتساب ما بنعتمدها/.test(r||'')&&/receipt\?tracking=/.test(r||''),'image at fee-due stage routes receipt safely');
r=cq.buildCurrentQuestionAnswerContractReply({turn:turn('تم استلام صورة من العميل بدون تعليق.',['unknown']),state,truth:truth(app('submitted',{paymentStatus:null}))});
ok(/مستند حساس/.test(r||'')&&/مشكلة بالموقع/.test(r||''),'generic image gets context-preserving clarification instead of missing-details fallback');

ok(cq.replyViolatesCurrentQuestionAnswerContract({turn:turn('ادفع هلأ',['payment_fee']),truth:truth(app()),reply:'رغبتك بالاستمرار مسجلة بالفعل، جاوبني بالنقطة اللي بدك تعرفها'}),'gate rejects 7.4.3 pay-now regression');
ok(cq.replyViolatesCurrentQuestionAnswerContract({turn:turn('كده الطلب كمل ولا',['application_status']),truth:truth(app()),reply:'اختيار الاستمرار مسجل بالفعل. ما في داعي تعيد أود الاستمرار'}),'gate rejects post-continuation non-answer');
ok(cq.replyViolatesCurrentQuestionAnswerContract({turn:turn('شو صار؟',['application_status']),truth:truth(app()),reply:'رغبتك بالاستمرار مسجلة بالفعل، فما في داعي تعيد خطوة أود الاستمرار'}),'gate rejects short-status continuation boilerplate');
ok(cq.replyViolatesCurrentQuestionAnswerContract({turn:turn('تم استلام صورة من العميل بدون تعليق.',['unknown']),truth:truth(app()),reply:'تفاصيل الطلب مش كاملة عندي بهاللحظة'}),'gate rejects media missing-details fallback');
ok(cq.replyViolatesCurrentQuestionAnswerContract({turn:turn('تم استلام رسالة صوتية من العميل.',['unknown']),truth:truth(app()),reply:'وصلتني بس ما قدرتش أسمعها'}),'gate rejects Egyptian voice phrasing');
ok(!cq.replyViolatesCurrentQuestionAnswerContract({turn:turn('ادفع هلأ',['payment_fee']),truth:truth(app()),reply:'نعم، هسا بتقدر تدفع رسوم فتح الملف 5 دنانير'}),'gate accepts direct pay-now answer');

const runtime=read(`${V3}/runtimeLive.ts`), gate=read(`${V3}/finalResponseGate.ts`), zero=read(`${V3}/zeroFallback.ts`), writer=read(`${V3}/writerContract.ts`), types=read(`${V3}/types.ts`), human=read(`${V3}/humanFirstConversationAuthority.ts`), cqsrc=read(`${V3}/currentQuestionAnswerContract.ts`);
ok(runtime.includes('buildCurrentQuestionAnswerContractReply'),'runtime imports current-question answer contract');
ok(runtime.indexOf('currentQuestionReply')<runtime.indexOf('humanAuthorityReply'),'current-question contract is computed before human authority');
ok(runtime.indexOf('} else if (currentQuestionReply) {')<runtime.indexOf('} else if (humanAuthorityReply) {'),'current-question reply pre-empts human authority/recovery/writer');
ok(zero.includes('buildCurrentQuestionAnswerContractReply'),'zero fallback honors current-question contract');
ok(zero.indexOf('if (currentQuestion) return currentQuestion')<zero.indexOf('if (humanAuthority) return humanAuthority'),'zero fallback prioritizes current question over stale authority');
ok(gate.includes('current_question_answer_contract_violation'),'final egress gate has current-question violation telemetry');
ok(gate.indexOf('const currentQuestionRepair')<gate.indexOf('const journeyRepair'),'final repair answers current question before generic journey repair');
ok(writer.includes('CURRENT QUESTION ANSWER CONTRACT'),'writer is explicitly bound to answer the current question');
ok(writer.includes('ما قدرتش/ما سمعتش/ما فهمتش'),'writer forbids Egyptian negation variants');
ok(human.includes('(?:ادفع|أدفع|احول|أحول|بدفع|بحول)'), 'human commercial authority recognizes short pay-now forms');
ok(types.includes('v3.0.0-phase7.4.4-current-question-answer-contract'),'runtime version identifies Phase 7.4.4');
ok(types.includes('v3.0.0-phase7.4.3-action-commercial-human-authority'),'7.4.3 compatibility anchor retained');
ok(cqsrc.includes('hasSensitiveMutation')&&cqsrc.includes('return null'),'current-question layer cannot pre-empt sensitive mutation execution/confirmation');
ok(!runtime.includes('LIVE_SCOPED_MUTATIONS.add'),'7.4.4 does not expand Real Actions');
const all=[runtime,gate,zero,writer,types,human,cqsrc].join('\n');
ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE TABLE)\b/i.test(all),'7.4.4 introduces no SQL mutation');
console.log(`RESULT: ${passed}/${passed+failed} PASS`);if(failed)process.exit(1);
