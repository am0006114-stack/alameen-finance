const fs=require('fs'),path=require('path'),vm=require('vm');
let ts; try{ts=require('typescript')}catch{ts=require(path.join(process.env.APPDATA||'','npm/node_modules/typescript'))}
const root=process.argv[2]||process.cwd(); let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:rel});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(errs.length===0,`${rel} TypeScript syntax/transpile diagnostics clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));return out.outputText;}
function run(rel,stubs={}){const js=transpile(rel);const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>{if(id in stubs)return stubs[id];throw new Error(`unexpected require ${id} from ${rel}`)},console,process:{env:{}},Date,Map,Set,URL,setTimeout,clearTimeout});return mod.exports;}
const base='app/api/whatsapp/webhook/_lib/v3-os/';
const files={types:base+'types.ts',truth:base+'productionTruth.ts',interpreter:base+'interpreter.ts',model:base+'modelInterpreter.ts',unified:base+'unifiedConversationDecisionPlane.ts',bundle:base+'answerObligations.ts',arb:base+'responseArbiter.ts',writer:base+'writerContract.ts',mutation:base+'mutationConfirmationGate.ts',pay:base+'paymentDestinationOverride.ts'};
const src=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,read(v)]));

ok(src.types.includes('v3.0.0-phase7.5.9.3-contact-isolation-current-intent-multiact-integrity'),'runtime version identifies Phase 7.5.9.3');
ok(src.types.includes('v3.0.0-phase7.5.9.2-final-regression-safe-human-judgment-runtime-safety-continuity'),'7.5.9.2 compatibility anchor preserved');
ok(src.writer.includes('مسار 5 JOD لا يتغير تحت أي ظرف'),'5 JOD writer contract remains frozen');
ok(src.pay.includes('0788500337')&&src.pay.includes('PAYAMEEEN')&&src.pay.includes('AMEEN1ST')&&src.pay.includes('AM500337')&&src.pay.includes('ABDUL RAHMAN ALHARAHSHEH'),'canonical 5 JOD payment destinations remain unchanged');

const normalize=x=>String(x||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
function normPhone(v){let d=String(v||'').replace(/\D/g,'');if(d.startsWith('00962'))d=d.slice(5);else if(d.startsWith('962'))d=d.slice(3);if(d.startsWith('7')&&d.length===9)d='0'+d;return /^07[789]\d{7}$/.test(d)?d:''}
function waPhone(v){const local=normPhone(v);return local?`962${local.slice(1)}`:''}

// CONTACT ISOLATION — typed phone/tracking must never authorize another sender's application.
const foreignApp={id:'foreign-1',tracking_id:'AM-1789692622369',phone:'0775262859',status:'preliminary_application',payment_status:null,full_name:'Foreign Customer'};
function appQuery(){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:foreignApp,error:null})},in(){return q}};return q}
const supabase={from(table){if(table==='applications')return appQuery(); if(table==='documents'){const q={select(){return q},eq(){return Promise.resolve({data:[],error:null})}};return q;} throw new Error('unexpected table '+table)}};
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,normalReviewWindow:'من يومين لـ3 أيام عمل',severePressureRule:'ضغط مراجعات'};
const resolveTruth=({state})=>({confidence:'none',source:'none',application:null,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()});
const prod=run(files.truth,{'@/lib/supabaseAdmin':{supabaseAdmin:supabase},'../text':{normalizeJordanPhone:normPhone,normalizeWhatsAppToSend:waPhone},'./types':{},'./truth':{resolveTruth}});
ok(prod.contactPhonesMatch('0775262859','962775262859')===true,'same Jordan contact matches across local/WhatsApp formats');
ok(prod.contactPhonesMatch('0775262859','962777999136')===false,'different WhatsApp sender does not match application phone');
ok(prod.suppliedPhoneConflictsWithSender('962777999136','0775262859')===true,'typed foreign phone is detected as contact-identity conflict');
ok(src.truth.includes('phone numbers typed inside a customer message')&&src.truth.includes('contact_identity_mismatch_current_tracking'),'production truth contains hard cross-number disclosure guard');
ok(src.arb.includes('contact_identity_mismatch')&&src.arb.includes('ما بقدر أعرض تفاصيل هذا الطلب أو حالته من هون'),'arbiter owns privacy-safe cross-number response');

// CURRENT INTENT SUPERSESSION — reversal of cancellation must not become a fresh cancel/refund.
function hasAny(s,arr){return arr.some(x=>s.includes(normalize(x)))}
function isQuestion(t){const q=normalize(t);return /[؟?]/.test(String(t||''))||/(?:^|\s)(شو|كيف|ليش|ليه|متى|امتى|وين|اين|كم|قديش|هل|ممكن|بقدر|بنفع)(?:\s|$)/.test(q)}
const interp=run(files.interpreter,{'./types':{},'./text':{normalizeArabic:normalize,hasAny,isQuestion}});
for(const text of ['بطلت الغي','اريد الغاء طلب الالغاء','تراجعت عن الإلغاء']){
  const t=interp.interpretTurn({turnId:'undo',customerText:text});
  ok(!t.requestedActions.includes('cancel_application'),`undo text never becomes cancel_application: ${text}`);
  ok(t.requestedActions.includes('reopen_application'),`undo text becomes manual reopen request when no pending confirmation: ${text}`);
}
const model=run(files.model,{'./types':{},'./interpreter':interp,'./provider':{},'./text':{normalizeArabic:normalize},'./currentTurnAuthority':{explicitContactRequestText:()=>false}});
const pendingState={currentTopic:'cancellation',pendingAction:'cancel_application',pendingActionPayload:{_manualStatus:'awaiting_customer_cancel_confirmation'},role:{},openLoops:[],facts:[],lastCustomerText:'تمام ألغي الطلب',lastAssistantText:'أكد الإلغاء'};

const unified=run(files.unified,{'./text':{normalizeArabic:normalize},'./types':{}});
let meaning=unified.resolveUnifiedMeaningLock({turn:{rawText:'بطلت الغي'},state:{pendingAction:null},truth:{application:{status:'refund_requested',paymentStatus:'refund_requested'}}});
ok(meaning.kind==='undo_cancel_or_refund','already-open refund + "بطلت الغي" is a hard undo intent, not stale refund care');
let reply=unified.lockedMeaningReply({meaning,turn:{rawText:'بطلت الغي'},truth:{application:{status:'refund_requested',paymentStatus:'refund_requested'},policy}})||'';
ok(/تنفيذ إداري|تنفيذ اداري/.test(reply)&&/ما رح أسجل إلغاء أو استرداد جديد/.test(reply),'undo reply states manual execution and blocks a new cancel/refund');
meaning=unified.resolveUnifiedMeaningLock({turn:{rawText:'بطلت الغي'},state:{pendingAction:'cancel_application'},truth:{application:{status:'preliminary_application',paymentStatus:null}}});
ok(meaning.kind==='cancel_confirmation_declined','reversal during pending cancel is treated as declining that confirmation');
reply=unified.lockedMeaningReply({meaning,turn:{rawText:'بطلت الغي'},truth:{application:{status:'preliminary_application'},policy}})||'';
ok(/ما رح أنفذ إلغاء جديد|ما رح انفذ الغاء جديد/.test(normalize(reply)),'pending-cancel decline does not claim admin reopen is needed');
const mutationGate=run(files.mutation,{'./text':{normalizeArabic:normalize},'./applicationJourney':{applicationJourneyStage:()=> 'preliminary_review'},'./unifiedConversationDecisionPlane':{stopRefundKeepRequest:unified.stopRefundKeepRequest},'./types':{}});
const pendingMutationState={...pendingState,pendingActionPayload:{_mutationConfirmationRequired:true,_mutationAction:'cancel_application'}};
const gateResult=mutationGate.enforceMutationConfirmationGate({actions:[],turn:interp.interpretTurn({turnId:'gate-undo',customerText:'بطلت الغي'}),state:pendingMutationState,truth:{application:{id:'app-1',trackingId:'AM-TEST-1',status:'preliminary_application'},policy:{}}});
ok(gateResult.clearPendingConfirmation===true,'pending cancel reversal clears mutation confirmation token');
ok(gateResult.actions.length===0&&gateResult.confirmedAction===null,'pending cancel reversal executes no mutation');

// MULTI-ACT ANSWER OBLIGATIONS — replay AMRO production failures.
const stageOf=app=>app&&app.__stage||'preliminary_review';
const label=app=>stageOf(app)==='preliminary_review'?'قيد المراجعة المبدئية':'قيد المتابعة';
const links={baseUrl:'https://www.ameenfinance.co',relevant:{products:'https://www.ameenfinance.co/products'}};
const bundles=run(files.bundle,{'./applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:label},'./linkIntegrity':{buildOfficialLinkContext:()=>links},'./text':{normalizeArabic:normalize},'./types':{}});
const truth={application:{__stage:'preliminary_review',installmentMonths:36,monthlyPayment:75},policy:{requirementsGuidanceRule:'الهوية وإثبات الدخل من الأساسيات.',secureDocumentsRule:'المستندات الحساسة عبر الرابط الرسمي فقط.',commercialStructureRule:'البيع مرابحة.',firstInstallmentRule:'القسط الأول بعد شهر من الاستلام وتوقيع العقد.',fileOpeningFeeJod:5,generalLocation:'عمّان – شارع المدينة المنورة',normalReviewWindow:'من يومين لـ3 أيام عمل',severePressureRule:'في ضغط مراجعات شديد.'}};
let turn={rawText:'انا قدمت على طلب لو دفعت دفعة اولى بقدر اخد الجهاز بدون فائدة وادفع كل شهر 75 دينار\nو وين موقع المحل',topics:['first_installment','office_location'],sentiment:'calm'};
let bundle=bundles.resolveAnswerBundle({turn,state:{},truth});
ok(bundle.kind==='multi_question','down-payment + monthly target + office location becomes one multi-question obligation');
ok(bundle.reasons.includes('downPayment')&&bundle.reasons.includes('monthlyTarget')&&bundle.reasons.includes('officeLocation'),'all material AMRO sub-questions are preserved in obligation checklist');
reply=bundles.buildAnswerBundleReply({bundle,turn,state:{},truth})||'';
ok(/ما في دفعة أولى/.test(reply),'multi-act answer directly answers down-payment question');
ok(/75/.test(reply)&&/الحسبة|الحسبه/.test(normalize(reply)),'multi-act answer handles requested monthly target without promising it');
ok(/شارع المدينة المنورة/.test(reply)&&/موعد رسمي/.test(reply),'multi-act answer includes office location and appointment rule in same reply');
turn={rawText:'انا بدي ادفع دفعة اولى واخد الجهاز على ست اشهر او اقل تقريبا ممكن يختلف سعر الجهاز ؟',topics:['installment_duration','product_price'],sentiment:'calm'};
bundle=bundles.resolveAnswerBundle({turn,state:{},truth});
ok(bundle.kind==='multi_question','down-payment + short term + price-change question becomes multi-question obligation');
ok(bundle.reasons.includes('downPayment')&&bundle.reasons.includes('installmentDuration')&&bundle.reasons.includes('priceChange'),'duration and price-change are not dropped behind fee/down-payment logic');
reply=bundles.buildAnswerBundleReply({bundle,turn,state:{},truth})||'';
ok(/6 أشهر|6 اشهر|6/.test(reply)&&/الحسبة الرسمية|الحسبه الرسميه/.test(normalize(reply)),'short-term request gets a bounded, non-invented answer');
ok(/سعر الجهاز/.test(reply)&&/ما عندي قاعدة موثقة/.test(reply),'price-change question gets explicit non-invented answer');

// HUMAN OUTPUT DEDUPE — replay Sino duplicate empathy.
const sino=`معك حق تتضايق إذا حاسس إنك عم تستنى أكثر من اللازم أو عم تسمع نفس الحالة بدون نتيجة جديدة. خليني أعطيك المفيد مباشرة.\n\nمفهوم إنك متضايق، وخصوصًا لما تضل تنتظر بدون نتيجة نهائية ظاهرة.\n\nطلب الاسترداد مسجل فعلًا وقيد المعالجة، وما في عليك طلب جديد تعيده من ناحيتك.`;
const cleaned=unified.sanitizeUnifiedEgressReply(sino);
ok(cleaned.includes('معك حق تتضايق'),'first empathy paragraph is preserved');
ok(!cleaned.includes('مفهوم إنك متضايق'),'adjacent duplicate empathy paragraph is removed');
ok(cleaned.includes('طلب الاسترداد مسجل فعلًا'),'operational truth paragraph is preserved while deduping empathy');

// Static hardening checks and syntax diagnostics.
ok(src.model.includes('«بطلت ألغي»')&&src.model.includes('reopen_application'),'model interpreter prompt teaches cancellation reversal semantics');
ok(src.writer.includes('contact identity mismatch')&&src.writer.includes('أكثر من سؤال مادي')&&src.writer.includes('فقرتين تعاطف متتاليتين'),'writer contract preserves contact isolation, multi-act coverage, and single-empathy composition');
ok(src.arb.includes('0 baseline')===false,'runtime code contains no validator-only/test harness leakage');
for(const rel of [files.types,files.truth,files.interpreter,files.model,files.unified,files.bundle,files.arb,files.writer,files.mutation]) transpile(rel);

(async()=>{
  const pending=await model.interpretTurnWithAi({turnId:'pending-undo',customerText:'بطلت الغي',state:pendingState,recentTurns:[],provider:null});
  ok(!pending.turn.requestedActions.includes('cancel_application'),'pending cancellation reversal clears cancel action');
  ok(!pending.turn.requestedActions.includes('reopen_application'),'pending cancellation reversal does not create unnecessary manual reopen');
  ok(pending.turn.acts.some(a=>a.type==='deny'&&a.topic==='cancellation'),'pending cancellation reversal is recorded as explicit deny');

  const state={activeApplicationId:null,activeTrackingId:null,lastVerifiedApplication:null};
  const cross=await prod.resolveV3ProductionTruth({waId:'962777999136',customerText:'رقم التتبع AM-1789692622369\nرقم الهاتف 0775262859',state,recentTurns:[],topics:['application_status']});
  ok(cross.application===null,'cross-number tracking lookup returns no application truth');
  ok((cross.readWarnings||[]).includes('contact_identity_mismatch_current_tracking'),'cross-number tracking lookup emits contact-isolation warning');
  ok(!(cross.readWarnings||[]).some(x=>String(x).includes('failed')),'contact-isolation block is deliberate, not a DB failure fallback');

  console.log(`\n7.5.9.3 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
