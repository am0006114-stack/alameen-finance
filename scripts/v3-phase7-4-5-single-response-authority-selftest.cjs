const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const root=process.argv[2]||process.cwd();
const V3='app/api/whatsapp/webhook/_lib/v3-os';
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0,failed=0;
function ok(v,m){if(v){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}}
function normalizeArabic(value){return String(value||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s+/g,' ').trim()}
function stageOf(app){
  if(!app)return'unbound'; const s=String(app.status||'').toLowerCase(),p=String(app.paymentStatus||'').toLowerCase();
  if(['refund_completed','refunded'].includes(s)||['refund_completed','refunded'].includes(p))return'refund_completed';
  if(s==='refund_requested'||p==='refund_requested')return'refund_requested';
  if(['cancelled','customer_declined_continue','rejected'].includes(s))return'cancelled';
  if(['approved','final_approved','ready_for_pickup','ready_for_contract','delivery_ready'].includes(s))return'approved';
  if(app.paymentConfirmedAt||['confirmed','paid','payment_confirmed'].includes(p))return'payment_confirmed_under_review';
  if(['customer_claimed_paid','pending_payment_confirmation'].includes(p))return'payment_proof_pending_admin';
  if(s==='customer_confirmed_continue'||['pending','pending_payment','payment_info_sent'].includes(p))return'continuation_confirmed_fee_due';
  if(s==='preliminary_qualified'||app.preliminaryQualifiedAt)return'preliminary_approved_waiting_decision';
  if(['','submitted','preliminary_application'].includes(s))return'preliminary_review';
  return'other';
}
function label(app){return({preliminary_review:'قيد المراجعة المبدئية',preliminary_approved_waiting_decision:'موافقة مبدئية',continuation_confirmed_fee_due:'تم تسجيل رغبتك بالاستمرار',payment_proof_pending_admin:'إثبات الدفع بانتظار مراجعة الإدارة',payment_confirmed_under_review:'قيد الدراسة النهائية',approved:'موافق عليه',cancelled:'الطلب ملغي',refund_requested:'الاسترداد قيد المعالجة',refund_completed:'تم الاسترداد'})[stageOf(app)]||'قيد المتابعة'}
function load(file,mocks){const src=read(file);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:file});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const module={exports:{}};const req=id=>{if(Object.prototype.hasOwnProperty.call(mocks,id))return mocks[id];throw new Error(`unmocked ${id}`)};new Function('require','module','exports',out.outputText)(req,module,module.exports);return module.exports;}
const policy={
  businessName:'الأمين للأقساط', generalLocation:'عمّان – شارع المدينة المنورة', fileOpeningFeeJod:5,
  normalReviewWindow:'المعدل الطبيعي من يومين لـ3 أيام عمل', severePressureRule:'حاليًا في ضغط مراجعات شديد جدًا وقد تتأخر بعض الملفات أكثر من المعدل الطبيعي.',
  requirementsGuidanceRule:'الهوية وإثبات الدخل من الأساسيات. بيانات الكفيل ليست شرطًا ثابتًا لكل طلب، والملف القوي قد يمشي بدون كفيل حسب الدراسة. إذا ما في كشف أو شهادة راتب، ممكن تُذكر/تُرفع بدائل مناسبة لطبيعة الدخل مثل كشف حساب بنكي أو عقد عمل أو مستند رسمي يوضح مصدر الدخل، والدراسة تحدد المقبول النهائي حسب حالة الملف.'
};
const app=(status='customer_confirmed_continue',extra={})=>({id:'a1',trackingId:'AM-1789000000000',status,paymentStatus:'pending_payment',paymentConfirmedAt:null,fullName:'عميل تجريبي',...extra});
const truth=(a)=>({application:a,ambiguousApplications:[],policy});
const state=(extra={})=>({version:'x',waId:'9627',activeApplicationId:'a1',activeTrackingId:'AM-1789000000000',currentTopic:null,currentGoal:null,role:{currentRole:'abdullah',tier:'case_specialist',reason:'x',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,updatedAt:'x',...extra});
function turn(raw,topics=[],requestedActions=[]){return{turnId:'t1',rawText:raw,normalizedText:normalizeArabic(raw),acts:[],topics,requestedActions,sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:1,warnings:[]}}
const cqMock={buildCurrentQuestionAnswerContractReply:({turn:t})=>/ادفع/.test(normalizeArabic(t.rawText))?'نعم، هسا بتقدر تدفع رسوم فتح الملف 5 دنانير.':null};
const humanMock={aiIdentityQuestionText:(v)=>/(انت|إنت).{0,10}(ذكاء|روبوت|بوت)/.test(normalizeArabic(v)),buildHumanFirstConversationAuthorityReply:({turn:t})=>/(انت|إنت).{0,10}(ذكاء|روبوت|بوت)/.test(normalizeArabic(t.rawText))?'معك عبدالله من فريق الأمين، احكيلي المطلوب مباشرة.':null};
const arb=load(`${V3}/responseArbiter.ts`,{
  './applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:label},
  './linkIntegrity':{buildOfficialLinkContext:(_t,tr)=>({baseUrl:'https://www.ameenfinance.co',relevant:{tracking:tr.application?`https://www.ameenfinance.co/track?tracking=${tr.application.trackingId}&phone=0790000000`:null,products:'https://www.ameenfinance.co/products'}})},
  './text':{normalizeArabic}, './currentQuestionAnswerContract':cqMock, './humanFirstConversationAuthority':humanMock, './types':{}
});
function ar(raw,candidate,a=app(),topics=[],actions=[],s=state(),forceRepair=false){return arb.arbitrateProductionReply({candidate,turn:turn(raw,topics),state:s,truth:truth(a),actions,forceRepair})}

ok(arb.responseHasKnownBadFallbackSignature('رغبتك بالاستمرار مسجلة بالفعل، فما في داعي تعيد الخطوة'),'detects stale continuation boilerplate');
ok(arb.responseHasKnownBadFallbackSignature('تفاصيل الطلب مش كاملة عندي بهاللحظة'),'detects missing-details fallback');
ok(arb.responseHasKnownBadFallbackSignature('رقم الطلب المرتبط بالمحادثة عندي AM-1. ما رح أطلبه منك مرة ثانية؛ اكتب سؤالك'),'detects known-tracking deflection');
ok(arb.responseHasKnownBadFallbackSignature('ما في تحديث جديد عن آخر رد. إذا عندك نقطة جديدة احكيلي'),'detects no-update deflection');
ok(!arb.responseHasKnownBadFallbackSignature('طلبك قيد الدراسة النهائية، وما في عليك خطوة الآن.'),'does not flag a direct grounded answer');

let r=ar('اعطيني رابط التتبع لطلبي','طلبك واضح: إعادة فتح الطلب بانتظار الإدارة');
ok(r.obligation==='tracking_link','tracking-link request becomes current obligation');
ok(/track\?tracking=/.test(r.reply||''),'tracking-link request receives official tracking URL');
ok(!/إعادة فتح/.test(r.reply||''),'pending reopen context cannot hijack tracking-link answer');

r=ar('رقم للتواصل','تفاصيل الطلب مش كاملة عندي بهاللحظة',null,['call_request']);
ok(r.obligation==='contact_channel','contact question is independent of application binding');
ok(/واتساب الحالي/.test(r.reply||''),'contact question receives direct channel answer');
ok(!/تفاصيل الطلب/.test(r.reply||''),'contact answer never falls to missing application details');

r=ar('هس انا طلبي مقدم صحيح','اختيار الاستمرار مسجل بالفعل');
ok(r.obligation==='application_exists','application-submitted yes/no becomes explicit obligation');
ok(/^نعم/.test(r.reply||'')&&/مسجل عندنا/.test(r.reply||''),'application-submitted question gets direct yes answer');

r=ar('هل الطلب انقبل ولا لا','رغبتك بالاستمرار مسجلة بالفعل',app('preliminary_qualified',{paymentStatus:null,preliminaryQualifiedAt:'x'}));
ok(r.obligation==='approval_status','approval yes/no detected independently of stale continuation');
ok(/موافقة مبدئية/.test(r.reply||'')&&/مش موافقة نهائية/.test(r.reply||''),'preliminary approval is answered as preliminary, not final');
r=ar('هل الطلب انقبل ولا لا','تفاصيل الطلب مش كاملة',app('approved',{paymentStatus:null}));
ok(/نعم/.test(r.reply||'')&&/موافق عليه/.test(r.reply||''),'final approval receives direct yes');

r=ar('شو مش ناوين يخلصو هالملف','رغبتك بالاستمرار مسجلة بالفعل',app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'x'}),['review_timing']);
ok(r.obligation==='review_timing','delay complaint becomes timing obligation');
ok(/يومين/.test(r.reply||'')&&/موعد نهائي مؤكد/.test(r.reply||''),'timing answer includes baseline + pressure + no fake ETA');

r=ar('شو الاسترداد تبع شو','طلب الاسترداد مسجل وقيد المعالجة',app('refund_requested',{paymentStatus:'refund_requested'}));
ok(r.obligation==='refund_meaning','refund meaning question detected');
ok(/الاسترداد يعني إرجاع مبلغ/.test(r.reply||''),'refund meaning is explained instead of repeated status');

r=ar('انا سوري معي هوية ابناء اردنيات وما عندي شهادة راتب، بقدر اقدم؟','طلبك السابق ملغي بالفعل',app('cancelled',{paymentStatus:null}),['requirements']);
ok(r.obligation==='general_eligibility','new/general eligibility outranks stale cancelled journey');
ok(/القرار النهائي حسب دراسة الملف/.test(r.reply||'')&&/كشف حساب بنكي/.test(r.reply||''),'eligibility answer uses approved requirements guidance');
ok(!/طلبك.*ملغي/.test(r.reply||''),'old cancelled application does not become answer to new eligibility question');

r=ar('من وين اقدم طلب جديد؟','طلبك القديم ملغي',app('cancelled',{paymentStatus:null}));
ok(r.obligation==='application_start','new application start is recognized despite old application');
ok(/products/.test(r.reply||''),'application-start reply points to official products flow');

r=ar('ادفع هلأ','رغبتك بالاستمرار مسجلة بالفعل',app(),['payment_fee']);
ok(r.obligation==='current_question_contract','7.4.4 contract remains an obligation source');
ok(/5 دنانير/.test(r.reply||'')&&!/رغبتك بالاستمرار/.test(r.reply||''),'pay-now current question repairs stale continuation');

r=ar('انت ذكاء اصطناعي؟','تفاصيل الطلب مش كاملة عندي',app(),['human_request']);
ok(r.obligation==='identity','identity question becomes direct obligation');
ok(/فريق الأمين/.test(r.reply||'')&&!/تفاصيل الطلب/.test(r.reply||''),'identity question is answered without application fallback');

r=ar('تم استلام صورة من العميل بدون تعليق.','تفاصيل الطلب مش كاملة عندي',app(),['receipt_upload']);
ok(r.obligation==='media','media envelope receives continuity obligation');
ok(/وصلني المرفق/.test(r.reply||'')&&!/تفاصيل الطلب/.test(r.reply||''),'media no longer collapses into missing-details fallback');

r=ar('شو صار بالطلب','رغبتك بالاستمرار مسجلة بالفعل',app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'x'}),['application_status']);
ok(r.obligation==='application_status','application status remains explicit obligation');
ok(/قيد الدراسة النهائية/.test(r.reply||'')&&!/رغبتك بالاستمرار/.test(r.reply||''),'status answer reflects current truth, not continuation state');

r=ar('Dear Omar, Good day. Please note the shipment has been released. Kind regards, DHL','تفاصيل الطلب مش كاملة عندي',null,[]);
ok(r.obligation==='foreign_content_clarification','pasted unrelated external content is recognized as content, not application lookup');
ok(/وصلني النص/.test(r.reply||'')&&!/تفاصيل الطلب/.test(r.reply||''),'foreign content gets human clarification instead of order fallback');

r=ar('شو صار بالطلب','طلبك قيد الدراسة النهائية، والدفع مؤكد إداريًا.',app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'x'}),['application_status']);
ok(!r.repaired,'responsive human candidate is preserved rather than templated over');
r=ar('رقم للتواصل','المتابعة الأساسية للطلبات من خلال واتساب الحالي.',null,['call_request']);
ok(!r.repaired,'responsive contact candidate is preserved');

const executed=[{action:'cancel_application',outcome:'executed',executed:true,authoritativeSummary:'تم الإلغاء',mutationId:'m1',blocker:null}];
r=ar('نعم الغي الطلب','تم إلغاء طلبك بنجاح',app('cancelled',{paymentStatus:null}),['cancellation'],executed);
ok(r.obligation==='mutation_truth'&&!r.repaired&&/تم إلغاء/.test(r.reply||''),'executed mutation truth cannot be overwritten by conversational arbiter');
r=ar('الغاء الطلب','أكيد، اكتب نعم ألغي الطلب',app(),['cancellation'],[],state(),false);
ok(r.obligation==='mutation_truth'&&!r.repaired,'current sensitive mutation remains owned by confirmation/action gates');
r=ar('تمام','تمام، الله يعطيك العافية',app(),['thanks']);
ok(r.obligation==='none'&&!r.repaired,'non-question social turn remains untouched');

const mut=load(`${V3}/mutationConfirmationGate.ts`,{
  './text':{normalizeArabic}, './applicationJourney':{applicationJourneyStage:stageOf}, './types':{}
});
const cancelState=state({lastAssistantText:'أكيد. إذا قرارك نهائي اكتب: نعم، ألغي الطلب.'});
ok(mut.explicitMutationConfirmation({action:'cancel_application',value:'كتبت نعم مليون مرة',state:cancelState}),'pending cancel confirmation understands frustrated contextual yes');
ok(mut.explicitMutationConfirmation({action:'cancel_application',value:'نعم مليون مرة',state:cancelState}),'pending cancel confirmation accepts emphatic yes');
ok(mut.explicitMutationConfirmation({action:'cancel_application',value:'اه يا معلم',state:cancelState}),'pending cancel confirmation accepts short colloquial yes with filler');
const refundState=state({lastAssistantText:'إذا قرارك نهائي اكتب: نعم، أريد استرداد الرسوم.'});
ok(mut.explicitMutationConfirmation({action:'request_refund',value:'حكيت نعم من قبل',state:refundState}),'pending refund confirmation recovers repeated yes from context');
ok(!mut.explicitMutationConfirmation({action:'cancel_application',value:'ليش ألغي الطلب؟',state:cancelState}),'question about cancellation is never treated as confirmation');

const runtime=read(`${V3}/runtimeLive.ts`), gate=read(`${V3}/finalResponseGate.ts`), writer=read(`${V3}/writerContract.ts`), types=read(`${V3}/types.ts`), arbSrc=read(`${V3}/responseArbiter.ts`), mutation=read(`${V3}/mutationConfirmationGate.ts`);
ok(runtime.includes('arbitrateProductionReply'),'runtime imports single response authority');
ok(runtime.indexOf('const arbitration = arbitrateProductionReply')<runtime.indexOf('let finalGate = enforceFinalResponseGate'),'arbiter runs immediately before final egress gate');
ok(runtime.includes('single_response_authority_repair'),'arbiter repairs are visible in integrity telemetry');
ok(gate.includes('arbitrateProductionReply'),'final response repair path also uses same arbiter');
ok(gate.indexOf('const arbitration = arbitrateProductionReply')<gate.indexOf('const currentQuestionRepair = buildCurrentQuestionAnswerContractReply'),'single arbiter repair precedes legacy layered repair order');
ok(gate.includes('single_response_authority_stale_or_missing_details_reply'),'final gate rejects known stale/missing-detail signatures');
ok(writer.includes('SINGLE RESPONSE AUTHORITY'),'writer contract encodes one current-answer authority');
ok(writer.includes('السؤال الحالي')&&writer.includes('سياقًا فقط'),'writer treats old journey state as context, not answer');
ok(types.includes('v3.0.0-phase7.4.5-single-response-authority'),'runtime version identifies Phase 7.4.5');
ok(types.includes('v3.0.0-phase7.4.4-current-question-answer-contract'),'7.4.4 compatibility anchor retained');
ok(mutation.includes('contextualYes'),'mutation confirmation keeps frustrated/repeated yes semantics');
ok(arbSrc.includes('mutation/action truth remains authoritative'),'arbiter explicitly preserves transactional action truth');
ok(!runtime.includes('LIVE_SCOPED_MUTATIONS.add'),'7.4.5 does not expand Real Actions');
const all=[runtime,gate,writer,types,arbSrc,mutation].join('\n');
ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE TABLE)\b/i.test(all),'7.4.5 introduces no SQL mutation');

console.log(`RESULT: ${passed}/${passed+failed} PASS`);if(failed)process.exit(1);
