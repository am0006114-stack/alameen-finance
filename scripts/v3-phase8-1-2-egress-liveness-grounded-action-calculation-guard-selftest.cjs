const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cache=new Map();
function load(rel){let file=path.isAbsolute(rel)?rel:path.join(root,rel);if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';else if(fs.existsSync(file)&&fs.statSync(file).isDirectory()&&fs.existsSync(path.join(file,'index.ts')))file=path.join(file,'index.ts');}if(cache.has(file))return cache.get(file).exports;const src=fs.readFileSync(file,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(file,mod);function req(id){if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';else if(fs.existsSync(p)&&fs.statSync(p).isDirectory()&&fs.existsSync(path.join(p,'index.ts')))p=path.join(p,'index.ts');return load(p)}if(id==='@/lib/supabaseAdmin')return{supabaseAdmin:{}};if(['crypto','fs','path'].includes(id))return require(id);throw new Error(`unexpected external require ${id} from ${file}`)}vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder,AbortController,fetch:async()=>{throw new Error('network disabled')}},{filename:file});return mod.exports}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const live=load(b+'egressLiveness.ts');
const kernel=load(b+'nativeConversationKernel.ts');
const routeSrc=read('app/api/whatsapp/webhook/route.ts');
const kernelSrc=read(b+'nativeConversationKernel.ts');
const liveSrc=read(b+'egressLiveness.ts');

// Incoming webhook liveness lease: a row existing is not proof that a customer turn completed.
const now=Date.parse('2026-09-26T08:00:00.000Z');
ok(live.decideDuplicateIncomingClaim({processedAt:'2026-09-26T07:59:30.000Z',receivedAt:'2026-09-26T07:59:00.000Z',nowMs:now})==='processed','processed incoming duplicate is safely deduped');
ok(live.decideDuplicateIncomingClaim({processedAt:null,receivedAt:'2026-09-26T07:59:40.000Z',nowMs:now,leaseMs:45000})==='retry_later','recent unprocessed duplicate remains in-flight and asks Meta to retry later');
ok(live.decideDuplicateIncomingClaim({processedAt:null,receivedAt:'2026-09-26T07:58:30.000Z',nowMs:now,leaseMs:45000})==='reclaim','stale unprocessed duplicate becomes reclaimable instead of being lost forever');
ok(live.decideDuplicateIncomingClaim({processedAt:null,receivedAt:null,nowMs:now})==='reclaim','unprocessed duplicate with missing lease timestamp is recoverable');
ok(live.duplicateOutgoingLockMeansDelivered({lockClaimed:false,recentOutgoingExists:true})===true,'duplicate outgoing lock counts as delivered only when an actual recent outgoing row exists');
ok(live.duplicateOutgoingLockMeansDelivered({lockClaimed:false,recentOutgoingExists:false})===false,'orphan outgoing lock cannot suppress a retry');
ok(live.duplicateOutgoingLockMeansDelivered({lockClaimed:true,recentOutgoingExists:false})===false,'fresh outgoing lock claim still sends normally');

// Static route invariants: fail-closed paths now request transport retry instead of consuming turns silently.
ok(routeSrc.includes('WHATSAPP_RETRYABLE_UNPROCESSED_INCOMING'),'route makes unprocessed duplicate webhook retryable');
ok(routeSrc.includes('duplicate_unprocessed_reclaimed'),'route can reclaim stale unprocessed incoming claims without SQL changes');
ok(routeSrc.includes('burst_lock_duplicate_advisory'),'stale burst lock is advisory and cannot strand a latest turn');
ok(routeSrc.includes('V3_RETRYABLE_NO_VALIDATED_REPLY'),'no validated Native reply no longer marks inbound processed silently');
ok(routeSrc.includes('throw v3RuntimeError instanceof Error'),'Native runtime exception propagates so Meta can retry');
ok(routeSrc.includes('V3_RETRYABLE_WHATSAPP_DELIVERY_FAILURE'),'double WhatsApp send failure keeps the inbound turn retryable');
ok(!routeSrc.includes('tripV3ProductionCircuitBreaker("whatsapp_delivery_failed_after_safe_retry")'),'single transport failure no longer cuts over to legacy by tripping V3 before retry');
ok(routeSrc.includes('duplicateOutgoingLockMeansDelivered'),'outgoing lock is verified against actual delivery log before suppressing send');

const policy=load(b+'policy.ts').getV3Policy();
function app(over={}){return{id:'app-1',trackingId:'AM-1',fullName:'Test',phone:'0790000000',email:null,status:'under_review',paymentStatus:'paid',paymentConfirmedAt:'2026-09-20T00:00:00Z',paymentReference:'x',deviceId:null,deviceName:'iPhone 18 Pro Max - 256GB',devicePrice:1299,installmentMonths:36,downPayment:0,interestRate:15,monthlyPayment:41.50,totalWithInterest:null,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:null,paidClickedAt:null,documents:null,...over}}
function truth(application=app()){return{confidence:'authoritative',source:'current_message_tracking',contactAccess:'full',application,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}}
function state(){return{version:'v3.0.0-phase8.1.2-egress-liveness-grounded-action-calculation-guard',waId:'9627',activeApplicationId:'app-1',activeTrackingId:'AM-1',currentTopic:null,currentGoal:null,role:{currentRole:'imran',tier:'supervisor',reason:'x',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,conversationConstraints:{},semanticMemory:null,commercialDisclosure:null,humanRelationship:null,updatedAt:new Date().toISOString()}}
function turn(text,topics=[],actions=[]){return{turnId:'t',rawText:text,normalizedText:text,acts:[],topics,requestedActions:actions,sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.95,warnings:[],semantic:null}}
const validate=(reply,customerText,topics=[],over={})=>kernel.validateNativeConversationReply({reply,turn:over.turn||turn(customerText,topics,over.requestedActions||[]),state:state(),truth:over.truth||truth(),actions:over.actions||[],recentTurns:[],customerText,disclosureRequiredThisTurn:false,protectedFiveJodStep:false});

// Grounded installment calculations: current authoritative figure may be quoted; hypothetical derived figures may not.
ok(validate('القسط الشهري المسجل على طلبك حاليًا 41.50 دينار على 36 شهر.','كم القسط الشهري؟',['installment_amount']).pass,'authoritative current monthly payment can be quoted');
ok(!validate('لو خليتيه 12 شهر، القسط الشهري بيطلع حوالي 124.42 دينار.','لو بدي اخليه 12 شهر كم بدفع شهري؟',['installment_duration','installment_amount']).pass,'hypothetical duration cannot invent a recalculated monthly amount');
ok(!validate('القسط الشهري بيطلع 55 دينار.','كم القسط الشهري؟',['installment_amount']).pass,'monthly amount that disagrees with authoritative application truth is rejected');
ok(!validate('القسط الشهري تقريبًا 41.50 دينار.','كم القسط الشهري؟',['installment_amount'],{truth:truth(app({monthlyPayment:null}))}).pass,'monthly number is blocked when authoritative monthlyPayment is absent');
ok(validate('مدة طلبك الحالية 36 شهر. إذا بدك 12 شهر لازم تتحدث الحسبة رسميًا قبل ما أعطيك رقم شهري جديد.','لو بدي اخليه 12 شهر كم بدفع شهري؟',['installment_duration','installment_amount']).pass,'different-duration request can be answered without inventing a calculation');

// Application mutation grounding: names/personas cannot stand in for an executed action.
ok(!validate('أكيد، تعديل اللون بعمله عمران مباشرة وما بتحتاجي أي إجراء منك.','بدي اغير اللون للعنابي',['device_change'],{requestedActions:['change_device']}).pass,'staff-name promise cannot masquerade as executed color/device mutation');
ok(validate('وصلني طلب تغيير اللون للعنابي، بس ما بعتبره متغير على الطلب قبل ما يتنفذ فعليًا ويتحدث بالملف.','بدي اغير اللون للعنابي',['device_change'],{requestedActions:['change_device']}).pass,'requested change is cleanly separated from authoritative executed state');

ok(kernelSrc.includes('لا تحسب قسطًا شهريًا من سعر الجهاز أو نسبة مرابحة من عندك'),'kernel prompt forbids hand-derived installment calculations');
ok(kernelSrc.includes('لا تقل «بعمله عمران»'),'kernel prompt forbids persona-based fake mutation execution');
ok(liveSrc.includes('DEFAULT_INCOMING_PROCESSING_LEASE_MS'),'liveness helper uses a bounded processing lease rather than a permanent claim');
ok(!routeSrc.includes('buildV3LastResortReply({ truth:'),'Phase 8.1.2 does not reintroduce legacy conversational fallback into live V3 egress');

for(const f of ['app/api/whatsapp/webhook/route.ts',b+'egressLiveness.ts',b+'nativeConversationKernel.ts'])transpile(f);
console.log(`\nPhase 8.1.2 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
