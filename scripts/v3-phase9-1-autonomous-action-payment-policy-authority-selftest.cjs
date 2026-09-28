const fs=require('fs'); const path=require('path'); const Module=require('module'); const ts=require('typescript');
const root=path.resolve(process.argv[2]||process.cwd());
let pass=0,fail=0;
function ok(name,cond,details=''){ if(cond){console.log('PASS:',name);pass++;} else {console.log('FAIL:',name,details||'');fail++;} }
function text(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
function transpile(rel,moduleKind=ts.ModuleKind.ESNext,jsx=ts.JsxEmit.Preserve){const f=path.join(root,rel); const out=ts.transpileModule(text(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:moduleKind,jsx,esModuleInterop:true},reportDiagnostics:true,fileName:f}); return (out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);}
const oldTs=Module._extensions['.ts'];
Module._extensions['.ts']=function(mod,filename){const source=fs.readFileSync(filename,'utf8'); const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true},fileName:filename,reportDiagnostics:false}).outputText; mod._compile(out,filename);};
function load(rel){return require(path.join(root,rel));}

const managed=[
'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
'app/api/whatsapp/webhook/_lib/v3-os/operationsAutopilot.ts',
'app/api/whatsapp/webhook/_lib/v3-os/interpreter.ts',
'app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts',
'app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts',
'app/api/whatsapp/webhook/_lib/v3-os/transactionalActionAdapter.ts',
'app/api/whatsapp/webhook/_lib/v3-os/applicationModificationRouting.ts',
'app/api/whatsapp/webhook/_lib/v3-os/manualActionPolicy.ts',
'app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts',
'app/api/whatsapp/webhook/_lib/v3-os/linkIntegrity.ts',
'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts',
'app/api/whatsapp/webhook/_lib/v3-os/singleConversationAuthority.ts',
'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts',
'app/api/whatsapp/webhook/_lib/v3-os/planner.ts',
'app/api/whatsapp/webhook/_lib/v3-os/finalResponseGate.ts',
'app/api/whatsapp/webhook/_lib/v3-os/types.ts',
'app/api/admin/whatsapp-control/route.ts',
'app/admin/whatsapp-control/ControlActions.tsx',
];
for(const f of managed) ok(`transpile ${f}`,transpile(f).length===0);

const ops=load('app/api/whatsapp/webhook/_lib/v3-os/operationsAutopilot.ts');
const informed=load('app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts');
const links=load('app/api/whatsapp/webhook/_lib/v3-os/linkIntegrity.ts');
const gate=load('app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts');
const interp=load('app/api/whatsapp/webhook/_lib/v3-os/interpreter.ts');
const single=load('app/api/whatsapp/webhook/_lib/v3-os/singleConversationAuthority.ts');
const modification=load('app/api/whatsapp/webhook/_lib/v3-os/applicationModificationRouting.ts');
const policy=load('app/api/whatsapp/webhook/_lib/v3-os/policy.ts');
const payment=load('app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts');
const stateApi=load('app/api/whatsapp/webhook/_lib/v3-os/state.ts');

function app(over={}){return {id:'app-1',trackingId:'AM-1790591868948',phone:'0772913512',fullName:'فرح زيدان',status:'preliminary_qualified',paymentStatus:'pending',paymentConfirmedAt:null,paymentReference:null,deviceId:'iphone15plus',deviceName:'iPhone 15 Plus - 256GB',devicePrice:700,installmentMonths:36,downPayment:0,interestRate:null,monthlyPayment:null,totalWithInterest:null,salary:null,deliveryDelayUntil:null,documents:{loaded:true,types:[],identityComplete:true,salarySlipUploaded:true,guarantorIdentityComplete:null,guarantorDataComplete:null,paymentReceiptUploaded:false},...over};}
function truth(overApp={}){return {confidence:'authoritative',source:'conversation_binding',contactAccess:'full',application:app(overApp),ambiguousApplications:[],policy:policy.getV3Policy(),fetchedAt:new Date().toISOString()};}
function turn(raw,topics=[],requestedActions=[],semantic=null,id='t1'){return {turnId:id,rawText:raw,normalizedText:raw,acts:[],topics,requestedActions,sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:0.99,warnings:[],semantic};}
function baseState(t=truth()){const s=stateApi.emptyState('962772913512'); s.activeApplicationId=t.application.id; s.activeTrackingId=t.application.trackingId; return s;}

// P0 payment corpus from real production incident.
const disclosure=informed.buildInformedCommercialDisclosureReply(truth());
const paymentCorpus=[
 ['كيف بقدر ادفعهم','payment_method'],
 ['طيب بدي ادفع الرسوم كيف','payment_method'],
 ['دفع رسوم فتح الملف 5 دنانير كيف بقدر ادفعهم إلكم؟','payment_method'],
 ['دفع دفع','payment'],
 ['كيف بقدر استكمل الإجراءات','unknown'],
 ['وين احول كليك','payment_method'],
 ['بدي ادفع رسوم ٥','payment'],
];
for(const [phrase,intent] of paymentCorpus) ok(`payment priority corpus: ${phrase}`,ops.isPaymentPriorityCustomerText(phrase,intent,disclosure)===true);
ok('contextual referenced payment data resolves after disclosure offer',ops.isPaymentPriorityCustomerText('اها ابعثلي إياهم','unknown',disclosure)===true);
ok('payment refusal is not revenue priority',ops.isPaymentPriorityCustomerText('ما بدي ادفع','payment_method',disclosure)===false);
ok('payment why-question is not payment execution',ops.isPaymentPriorityCustomerText('ليش ادفع 5 دنانير','payment_fee',disclosure)===false);

const unknownPaymentTurn=turn('اها ابعثلي إياهم',['unknown'],[],null,'pay-1');
const receiptUrl=links.applicationReceiptUrl(truth());
const paymentReply=informed.buildPostDisclosurePaymentReply(truth(),receiptUrl);
for(const token of ['0788500337','PAYAMEEEN','AMEEN1ST','AM500337','ABDUL RAHMAN ALHARAHSHEH','/receipt?tracking=AM-1790591868948&phone=0772913512']) ok(`payment reply contains ${token}`,paymentReply.includes(token));
ok('payment reply labels Orange Money correctly',/Orange Money[\s\S]*0788500337/.test(paymentReply));
ok('payment reply labels CliQ correctly',/CliQ[\s\S]*PAYAMEEEN[\s\S]*AMEEN1ST[\s\S]*AM500337/.test(paymentReply));
ok('payment reply retains admin confirmation truth',/(?:يدوي|يدويًا).{0,35}(?:مراجعة|الوصل)/.test(paymentReply));
ok('payment reply has no generic missing-info fallback',!/(?:المعلومة.*مش موجودة|ما قدرت أحدد|اكتب المطلوب نفسه)/.test(paymentReply));
const protectedViolations=links.detectReplyLinkViolations({reply:paymentReply,turn:unknownPaymentTurn,truth:truth(),allowProtectedPaymentReceipt:true});
ok('protected payment receipt passes official-link integrity',!protectedViolations.some(x=>String(x).startsWith('url_not_issued_by_v3_truth')),protectedViolations.join(','));

// Disclosure is positive-only: unrelated location question must not trigger 5-JOD disclosure.
const prelimState=baseState();
const locationTurn=interp.interpretTurn({turnId:'loc-1',customerText:'موقع شركتكم'});
ok('location turn recognized as office location',locationTurn.topics.includes('office_location'));
ok('unrelated location question does not trigger commercial disclosure',informed.shouldExplainCommercialStep({state:prelimState,truth:truth(),turn:locationTurn,explicitContinuationIntent:false})===false);
const payAfterObservedDisclosure=turn('كيف بقدر ادفعهم',['payment_method'],[],null,'pay-observed');
ok('transcript evidence prevents duplicate disclosure after state-persistence lag',informed.shouldExplainCommercialStep({state:prelimState,truth:truth(),turn:payAfterObservedDisclosure,explicitContinuationIntent:true,observedFullDisclosure:true})===false);
const locationReply=single.buildSingleConversationAuthorityReply({turn:locationTurn,state:prelimState,truth:truth()})||'';
ok('location reply gives general area',/عمّان|عمان/.test(locationReply)&&/شارع المدينة المنورة|شارع المدينه المنوره/.test(locationReply));
ok('location reply keeps detailed-address appointment gate',/العنوان التفصيلي/.test(locationReply)&&/موعد رسمي مؤكد/.test(locationReply));
ok('location reply explains why full address is gated',/(?:مش|ليس).*نقطة استقبال|بدون تنسيق|الجهاز.*العقد.*جاهز/s.test(locationReply));

const deliveryTurn=interp.interpretTurn({turnId:'del-1',customerText:'كيف آلية الاستلام؟'});
ok('delivery turn recognized',deliveryTurn.topics.includes('delivery'));
const deliveryReply=single.buildSingleConversationAuthorityReply({turn:deliveryTurn,state:prelimState,truth:truth()})||'';
ok('delivery answer is pickup mechanics, not installment payment channels',/الاستلام/.test(deliveryReply)&&/موعد رسمي مؤكد/.test(deliveryReply)&&/(?:ما في|لا يوجد).*توصيل/.test(deliveryReply)&&!/سداد الأقساط الشهرية/.test(deliveryReply));

// Five autonomous core actions, with one action-specific confirmation then executable action.
const actionCases=[
 ['cancel_application','بدي الغي الطلب','نعم الغي الطلب الحالي'],
 ['request_refund','بدي استرد الرسوم','نعم اريد استرداد الرسوم'],
 ['stop_refund','بدي أوقف طلب الاسترداد وأرجع أكمل','نعم بدي أوقف طلب الاسترداد وأرجع أكمل طلب التقسيط'],
 ['reopen_application','تراجعت عن الإلغاء وبدي أكمل نفس الطلب','نعم بدي أعيد فتح الطلب وأكمل عليه'],
];
for(const [action,request,confirm] of actionCases){
  const t=truth(action==='request_refund'?{paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-28T10:00:00Z'}:action==='stop_refund'?{status:'refund_requested',paymentStatus:'refund_requested',paymentConfirmedAt:'2026-09-28T10:00:00Z'}:action==='reopen_application'?{status:'cancelled',paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-28T10:00:00Z'}:{});
  let s=baseState(t);
  const firstTurn=interp.interpretTurn({turnId:`${action}-1`,customerText:request});
  const first=gate.enforceMutationConfirmationGate({actions:[],turn:firstTurn,state:s,truth:t});
  ok(`${action} first turn asks exactly one confirmation`,Boolean(first.confirmationPrompt)&&first.actions.some(a=>a.action===action&&a.requiresConfirmation===true));
  const staged=first.actions.find(a=>a.action===action);
  s.pendingAction=action; s.pendingActionPayload=staged?.payload||null; s.lastAssistantText=first.confirmationPrompt; s.lastTurnId=firstTurn.turnId; s.lastCustomerText=request;
  const secondTurn=interp.interpretTurn({turnId:`${action}-2`,customerText:confirm});
  const second=gate.enforceMutationConfirmationGate({actions:[],turn:secondTurn,state:s,truth:t});
  const executable=second.actions.find(a=>a.action===action);
  ok(`${action} confirmation becomes executable`,second.confirmedAction===action&&Boolean(executable)&&executable.requiresConfirmation===false&&Boolean(executable.payload?._mutationConfirmedOnTurn));
  ok(`${action} does not ask confirmation again after valid confirmation`,second.confirmationPrompt===null);
}

// Already-cancelled truth cannot open another cancellation loop.
{
  const t=truth({status:'cancelled',paymentStatus:'pending'}); const s=baseState(t); const tr=interp.interpretTurn({turnId:'cancelled-1',customerText:'الغي الطلب'});
  const g=gate.enforceMutationConfirmationGate({actions:[],turn:tr,state:s,truth:t});
  ok('already-cancelled request produces information, not a confirmation loop',!g.confirmationPrompt&&Boolean(g.informationalReply)&&g.actions.every(a=>a.action!=='cancel_application'));
}

// Manual-only changes always route to official Facebook, never cancel/reapply.
for(const sample of ['بدي اغير الجهاز الى ايفون 18 برو ماكس','بدي اعدل اللون','بدي اغير رقم الهاتف على الطلب']){
  const d=modification.resolveApplicationModificationRoute({topics:['application_correction'],requestedActions:[],customerText:sample,hasApplication:true,paymentConfirmed:false,trackingId:'AM-1',registeredPhone:'0790000000'});
  ok(`manual modification routes to Facebook: ${sample}`,d.route==='facebook_manual');
  const r=modification.buildApplicationModificationRoutingReply({topics:['application_correction'],requestedActions:[],customerText:sample,hasApplication:true,paymentConfirmed:false,trackingId:'AM-1',registeredPhone:'0790000000'})||'';
  ok(`manual modification reply names official Facebook: ${sample}`,/صفحة الأمين الرسمية على فيسبوك/.test(r)&&!/(?:الغ|إلغاء).{0,60}(?:قدم|طلب جديد)/.test(r));
}

// Static architecture invariants and DB executor support.
const adapter=text('app/api/whatsapp/webhook/_lib/v3-os/transactionalActionAdapter.ts');
const actionPlane=text('app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts');
const runtime=text('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const recoverySource=text('app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts');
const kernel=text('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');
const business=text('app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts');
const control=text('app/api/admin/whatsapp-control/route.ts');
const ui=text('app/admin/whatsapp-control/ControlActions.tsx');
const types=text('app/api/whatsapp/webhook/_lib/v3-os/types.ts');
const migration=text('supabase/migrations/20260901193000_v3_phase5_transactional_audit_infra.sql');
for(const a of ['cancel_application','request_refund','stop_refund','reopen_application','link_whatsapp_alias']){
  ok(`adapter allow-lists ${a}`,adapter.includes(`"${a}"`));
  ok(`action plane ownership guards ${a}`,actionPlane.includes(`"${a}"`));
}
ok('existing audited RPC supports stop_refund',migration.includes("'stop_refund'"));
ok('existing audited RPC supports reopen_application',migration.includes("'reopen_application'"));
ok('no SQL/schema change needed for Phase 9.1 executor expansion',migration.includes("p_action_type IN ('stop_refund','reopen_application','continue_application')"));
ok('runtime version is Phase 9.1',types.includes('v3.0.0-phase9.1-autonomous-action-payment-policy-authority'));
ok('runtime protects deterministic post-disclosure payment step',runtime.includes('authoritativeCommercialJourneyReply')&&runtime.includes('protectedFiveJodStep'));
ok('runtime deterministic payment writer uses bound receipt URL and canonical destinations',recoverySource.includes('applicationReceiptUrl(truth)')&&recoverySource.includes('currentFileOpeningPaymentRule()'));
ok('runtime keeps current-turn payment priority after disclosure',runtime.includes('paymentPriorityAfterDisclosure'));
ok('kernel accepts protected deterministic receipt link',kernel.includes('allowProtectedPaymentReceipt'));
ok('office truth contains full-address gate and rationale',business.includes('العنوان التفصيلي وتعليمات الوصول تُرسل فقط مع الموعد الرسمي المؤكد')&&business.includes('المكتب ليس نقطة استقبال مفتوحة'));
ok('Control API enables the five autonomous actions explicitly',control.includes('ENABLE_AUTONOMOUS_CORE_ACTIONS')&&control.includes('Real Actions الخمسة'));
ok('Control UI labels manual modifications as Facebook-only',ui.includes('صفحة الأمين الرسمية على فيسبوك'));

console.log(`Phase 9.1 assertions: ${pass+fail}; passed=${pass}; failed=${fail}`);
Module._extensions['.ts']=oldTs;
process.exit(fail?1:0);
