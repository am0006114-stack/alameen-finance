const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cache=new Map();
function load(rel){let file=path.isAbsolute(rel)?rel:path.join(root,rel);if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';else if(fs.existsSync(file)&&fs.statSync(file).isDirectory()&&fs.existsSync(path.join(file,'index.ts')))file=path.join(file,'index.ts');}if(cache.has(file))return cache.get(file).exports;const src=fs.readFileSync(file,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(file,mod);function req(id){if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';else if(fs.existsSync(p)&&fs.statSync(p).isDirectory()&&fs.existsSync(path.join(p,'index.ts')))p=path.join(p,'index.ts');return load(p)}if(id==='@/lib/supabaseAdmin')return{supabaseAdmin:{from(){throw new Error('DB disabled in selftest')}}};if(['crypto','fs','path'].includes(id))return require(id);throw new Error(`unexpected external require ${id} from ${file}`)}vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Intl,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder,AbortController,fetch:async()=>{throw new Error('network disabled')}},{filename:file});return mod.exports}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const live=load(b+'egressLiveness.ts');
const kernel=load(b+'nativeConversationKernel.ts');
const routeSrc=read('app/api/whatsapp/webhook/route.ts');
const kernelSrc=read(b+'nativeConversationKernel.ts');

// Atomic egress: delivery evidence is tied to exact inbound identity, never regenerated reply text.
ok(live.deliveredOutgoingMarker('wamid.X')==='DELIVERED:wamid.X','provider message id becomes a durable outgoing-lock marker');
ok(live.providerMessageIdFromDeliveredMarker('DELIVERED:wamid.X')==='wamid.X','durable marker recovers provider message id');
ok(live.providerMessageIdFromDeliveredMarker('some reply body')===null,'ordinary lock body is not delivery proof');
ok(live.outgoingDeliveryEvidence({providerMessageIdFromLock:'wamid.X',sourceOutgoingRowExists:false})===true,'provider marker proves delivery');
ok(live.outgoingDeliveryEvidence({providerMessageIdFromLock:null,sourceOutgoingRowExists:true})===true,'source-linked outgoing log proves delivery');
ok(live.outgoingDeliveryEvidence({providerMessageIdFromLock:null,sourceOutgoingRowExists:false})===false,'orphan lock alone is not delivery proof');
ok(live.decideDuplicateOutgoingLock({replyBody:'DELIVERED:wamid.X',createdAt:'2026-09-26T10:00:00Z',nowMs:Date.parse('2026-09-26T10:05:00Z')})==='delivered','delivered outgoing lock never resends');
ok(live.decideDuplicateOutgoingLock({replyBody:'draft',createdAt:'2026-09-26T10:00:30Z',nowMs:Date.parse('2026-09-26T10:01:00Z'),leaseMs:90000})==='inflight','fresh outgoing lock blocks concurrent duplicate send');
ok(live.decideDuplicateOutgoingLock({replyBody:'draft',createdAt:'2026-09-26T09:58:00Z',nowMs:Date.parse('2026-09-26T10:01:00Z'),leaseMs:90000})==='reclaim','stale orphan outgoing lock becomes reclaimable');
ok(routeSrc.includes('source_incoming_message_id'),'outgoing log is linked durably to exact inbound message id');
ok(routeSrc.includes('markOutgoingReplyLockDelivered'),'Meta provider id is persisted immediately after successful send');
ok(routeSrc.includes('durableOutgoingDeliveryForIncoming'),'retry checks inbound-linked durable delivery instead of regenerated reply equality');
const liveStart=routeSrc.indexOf('if (v3LiveActive) {');
const liveEnd=routeSrc.indexOf('if (await shouldSuppressStaleV3Reply', liveStart);
const liveBlock=liveStart>=0&&liveEnd>liveStart?routeSrc.slice(liveStart,liveEnd):'';
ok((liveBlock.match(/runV3ProductionLive\(/g)||[]).length===1,'Absolute Runtime Authority: one Native Kernel runtime call per webhook attempt');
ok(!liveBlock.includes('for (let attempt = 1; attempt <= 2; attempt += 1)'),'no same-webhook answer regeneration loop');
ok(routeSrc.includes('V3_RETRYABLE_DELIVERY_NOT_DURABLE'),'successful Meta send is not silently treated complete without durable evidence');
ok(routeSrc.includes('V3_RETRYABLE_OUTGOING_INFLIGHT'),'fresh duplicate outgoing lock requests retry instead of racing a second send');
ok(routeSrc.includes('duplicate_outgoing_lock_reclaimed'),'stale orphan outgoing lock uses compare-and-swap reclaim');

const policy=load(b+'policy.ts').getV3Policy();
function app(over={}){return{id:'app-1',trackingId:'AM-1',fullName:'Test',phone:'0790000000',email:null,status:'under_review',paymentStatus:'paid',paymentConfirmedAt:'2026-09-20T00:00:00Z',paymentReference:'x',deviceId:null,deviceName:'iPhone 18 Pro Max - 256GB',devicePrice:1299,installmentMonths:36,downPayment:200,interestRate:15,monthlyPayment:35,totalWithInterest:null,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:null,paidClickedAt:null,documents:null,...over}}
function truth(application=app()){return{confidence:'authoritative',source:'current_message_tracking',contactAccess:'full',application,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}}
function state(){return{version:'v3.0.0-phase8.2-atomic-egress-down-payment-human-staff',waId:'9627',activeApplicationId:'app-1',activeTrackingId:'AM-1',currentTopic:null,currentGoal:null,role:{currentRole:'imran',tier:'supervisor',reason:'x',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,conversationConstraints:{},semanticMemory:null,commercialDisclosure:null,humanRelationship:null,updatedAt:new Date().toISOString()}}
function baseSemantic(over={}){return{meaningSummary:'x',customerGoal:null,currentQuestion:null,answerObligations:[],references:[],entities:[],decision:{continuation:'unknown',cancellation:'unknown',refund:'unknown',aliasConfirmation:'unknown',condition:null},correctionOfPrevious:false,socialClosure:false,requiresExternalFact:false,externalFactNeeded:null,answerMode:'direct',confidence:.95,warnings:[],...over}}
function turn(text,topics=[],actions=[],semantic=null){return{turnId:'t',rawText:text,normalizedText:text,acts:[],topics,requestedActions:actions,sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.95,warnings:[],semantic}}
const validate=(reply,customerText,topics=[],over={})=>kernel.validateNativeConversationReply({reply,turn:over.turn||turn(customerText,topics,over.requestedActions||[],over.semantic||null),state:state(),truth:over.truth||truth(),actions:over.actions||[],recentTurns:[],customerText,disclosureRequiredThisTurn:false,protectedFiveJodStep:false});

// Down-payment truth: use the application TruthBundle already produced by the existing system.
ok(validate('الدفعة الأولى المسجلة على طلبك 200 دينار. وإذا بدك تغيرها ما بنعدلها من واتساب؛ بنقدر نمشي بمسار إلغاء الطلب الحالي وبعدها تقدم طلب جديد بالمبلغ اللي بدك إياه.','كم الدفعة الأولى المسجلة عندي؟',['installment_amount']).pass,'authoritative application down payment may be stated exactly');
ok(!validate('الدفعة الأولى المسجلة على طلبك 100 دينار.','كم الدفعة الأولى المسجلة عندي؟',['installment_amount']).pass,'wrong application down-payment amount is rejected');
ok(!validate('نظامنا ما فيه دفعة أولى على الجهاز.','بقدر ادفع 200 دينار دفعة أولى؟',['installment_amount']).pass,'obsolete no-down-payment system policy is rejected');
ok(validate('الدفعة الأولى اختيارية عند التقديم، وإنت بتختار المبلغ اللي بناسبك. وجودها بقلل الرصيد المتبقي، بس القسط الشهري النهائي لازم يطلع من الحسبة الرسمية.','بقدر ادفع 200 دينار دفعة أولى؟',['installment_amount']).pass,'correct optional down-payment policy is allowed without hand-derived installment');
ok(!validate('تم تعديل الدفعة الأولى على طلبك لـ200 دينار.','غيرلي الدفعة الأولى',['installment_amount']).pass,'WhatsApp cannot falsely claim down-payment mutation completion');
ok(kernelSrc.includes('TRUTH.application.downPayment'),'Native Kernel prompt reads existing application down-payment truth');
ok(kernelSrc.includes('الدفعة الأولى هنا ليست «القسط الأول»'),'down payment is explicitly separated from the first-installment policy');
ok(kernelSrc.includes('القسط الأول يبقى مستحقًا بعد شهر من استلام الجهاز وتوقيع العقد'),'existing first-installment timing is preserved');

// Current-turn refusal/cancel must never be inverted back into fee disclosure.
const declinedTurn=turn('لا أرغب بالاستمرار',['continuation'],[],baseSemantic({decision:{continuation:'declined',cancellation:'unknown',refund:'unknown',aliasConfirmation:'unknown',condition:null}}));
ok(!validate('قبل ما نثبت الاستمرار، في رسوم فتح ملف 5 دنانير وإذا بدك تكمل أكدلي.','لا أرغب بالاستمرار',['continuation'],{turn:declinedTurn}).pass,'explicit non-continuation cannot be inverted into 5-JOD disclosure');

// Staff identities are Human Company OS identities, without false literal-human claims.
ok(validate('معك عمران من الأمين، احكيلي شو النقطة اللي بدك نراجعها بملفك.','مين معي؟',['human_request']).pass,'employee persona may introduce itself naturally by name');
ok(!validate('أنا عمران من الأمين، شخص حقيقي ومش رد آلي.','انتا رد الي ولا بني ادم؟',['human_request']).pass,'literal-human/anti-bot claim is rejected');
ok(kernelSrc.includes('هي هويات موظفي الأمين داخل Human Company OS'),'Native Kernel treats staff names as employee identities inside the Company OS');

// Repair invariant: Phase 8.2 must NOT create a second appointment system or schema.
ok(!kernelSrc.includes('pickup_appointment_at'),'no invented pickup_appointment_at schema dependency exists in Native Kernel');
ok(!kernelSrc.includes('applicationOperationalTruth'),'no invented applicationOperationalTruth appointment adapter remains');
ok(!kernelSrc.includes('ADMIN_APPOINTMENT_AUTHORITY'),'no invented appointment authority prompt block remains');
ok(!routeSrc.includes('مصدر الموعد الوحيد هو الموعد المثبت من الإدارة على الطلب في Supabase'),'R4 invented appointment prompt was removed from route');
ok(routeSrc.includes('قواعد المواعيد والتسليم والتهدئة:\n- لا تخترع موعد استلام، ولا تعطي وعدًا نهائيًا خارج الرد الآمن الأساسي.'),'existing appointment/delivery guidance remains on its pre-R4 path');
ok(!fs.existsSync(path.join(root,b+'applicationOperationalTruth.ts')),'obsolete invented appointment adapter was removed');
ok(!fs.existsSync(path.join(root,'supabase/migrations/20260926203000_phase8_2_pickup_appointment_truth.sql')),'obsolete invented appointment migration was removed');

for(const f of ['app/api/whatsapp/webhook/route.ts',b+'egressLiveness.ts',b+'nativeConversationKernel.ts'])transpile(f);
console.log(`\nPhase 8.2 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
