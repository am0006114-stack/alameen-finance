const fs=require('fs'),path=require('path'),vm=require('vm');
let ts; try{ts=require('typescript')}catch{try{ts=require(path.join(process.env.APPDATA||'','npm/node_modules/typescript'))}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}}
const root=process.argv[2]||process.cwd(); let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));
const cache=new Map();
function load(rel,overrides={}){
  let file=path.isAbsolute(rel)?rel:path.join(root,rel);
  if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';}
  const cacheKey=file+'::'+Object.keys(overrides).sort().join('|'); if(cache.has(cacheKey))return cache.get(cacheKey).exports;
  const src=fs.readFileSync(file,'utf8'); const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});
  const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); if(errs.length)throw new Error(`${file}: ${errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')}`);
  const mod={exports:{}}; cache.set(cacheKey,mod);
  function req(id){if(Object.prototype.hasOwnProperty.call(overrides,id))return overrides[id];if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';else if(!fs.existsSync(p))throw new Error(`missing ${id} from ${file}`);return load(p,overrides);}throw new Error(`unexpected external require ${id} from ${file}`)}
  vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder},{filename:file}); return mod.exports;
}
function transpile(rel){const src=read(rel);const r=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} TypeScript syntax/transpile clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));}
const base='app/api/whatsapp/webhook/_lib/v3-os/';
const f={types:base+'types.ts',mutation:base+'mutationConfirmationGate.ts',action:base+'actionPlane.ts',tx:base+'transactionalActionAdapter.ts',contactApp:base+'applicationContactIdentity.ts',truth:base+'productionTruth.ts',constraints:base+'conversationConstraints.ts',incident:base+'paymentIncident.ts',human:base+'humanCompanyRuntime.ts',arbiter:base+'responseArbiter.ts',runtime:base+'runtimeLive.ts',writer:base+'writerContract.ts',link:base+'linkIntegrity.ts',discord:base+'discordNotifier.ts',admin:'app/admin/applications/[id]/page.tsx',migration:'supabase/migrations/20260919133000_v3_phase760_application_whatsapp_contacts.sql',pay:base+'paymentDestinationOverride.ts'};
for(const rel of Object.values(f))ok(exists(rel),`required file exists: ${rel}`);
const src=Object.fromEntries(Object.entries(f).map(([k,v])=>[k,read(v)]));
ok(src.types.includes('v3.0.0-phase7.6.0-human-company-runtime-identity-action-safety-conversation-control'),'runtime version identifies 7.6.0');
ok(src.types.includes('v3.0.0-phase7.5.9.4-human-contact-isolation-continuity'),'7.5.9.4 compatibility anchor preserved');
ok(src.pay.includes('0788500337')&&src.pay.includes('PAYAMEEEN')&&src.pay.includes('AMEEN1ST')&&src.pay.includes('AM500337')&&src.pay.includes('ABDUL RAHMAN ALHARAHSHEH'),'5 JOD destinations frozen');
ok(src.migration.includes('whatsapp_application_contacts')&&src.migration.includes("status IN ('approved','rejected')")&&src.migration.includes('confirmation_turn_id')&&src.migration.includes('UNIQUE (application_id, wa_id)'),'persistent WhatsApp alias schema records customer-confirmed auto-link audit and is unique per app+WA');
ok(src.migration.includes('ENABLE ROW LEVEL SECURITY'),'WhatsApp alias table has RLS enabled');
ok(src.admin.includes('reviewWhatsAppAliasAction')&&src.admin.includes('معتمد تلقائيًا بعد تأكيد العميل'),'admin page shows auto-approved aliases and keeps manual revoke/restore control');
const aliasAdminBlock=src.admin.slice(src.admin.indexOf('async function reviewWhatsAppAliasAction'),src.admin.indexOf('async function updateContactOnlyAction')); ok(!/\.from\("applications"\)/.test(aliasAdminBlock)&&!/phone\s*:/.test(aliasAdminBlock),'alias approval does not overwrite applications.phone');
ok(src.discord.includes('رقم الهاتف الأساسي'),'Discord action alerts include primary application phone');
ok(src.runtime.includes('link_whatsapp_alias')&&src.runtime.includes('_autoContactAliasPrompt'),'runtime stages automatic two-step WhatsApp-alias action from safe preview');
ok(!src.runtime.includes('requestApplicationWhatsAppAlias'),'runtime no longer waits for admin approval to link customer-confirmed WhatsApp alias');
ok(src.writer.includes('نعم اعتمد الرقم')&&src.writer.includes('contactAccess=full/source=approved_contact_alias'),'writer contract requires action-specific customer confirmation before full alias access');
ok(src.writer.includes('CONVERSATION_CONSTRAINTS='),'writer receives durable human conversation constraints');
ok(src.writer.includes('لا تقل "أنا إنسان"'),'no-false-human-identity compatibility rule preserved');

const normalize=x=>String(x||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
const stateBase={version:'x',waId:'962775573841',activeApplicationId:'app1',activeTrackingId:'AM-1789311690014',currentTopic:null,currentGoal:null,role:{currentRole:'omran',tier:'supervisor',reason:'test',sinceTurnId:'t0',introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:'t0',lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,conversationConstraints:{noLinks:false,whatsappOnly:false,avoidRepetition:false,sourceTurnId:null,updatedAt:null},updatedAt:new Date().toISOString()};
const app={id:'app1',trackingId:'AM-1789311690014',fullName:'Yousef',phone:'0793393352',email:'y@test',status:'under_review',paymentStatus:'confirmed',paymentConfirmedAt:'2026-09-14T00:00:00Z',paymentReference:'p',deviceId:'d',deviceName:'iPhone 17 - 256GB',devicePrice:768.55,installmentMonths:36,downPayment:0,interestRate:null,monthlyPayment:24.55,totalWithInterest:null,salary:500,deliveryDelayUntil:null,guarantorName:'G',guarantorPhone:'0790000000',guarantorNationalId:'N',preliminaryQualifiedAt:'2026-09-12',paidClickedAt:'2026-09-14',documents:{loaded:true,types:[],identityComplete:true,salarySlipUploaded:true,guarantorIdentityComplete:false,guarantorDataComplete:false,paymentReceiptUploaded:true}};
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,fileOpeningFeeTiming:'after preliminary approval and explicit continue',fileOpeningFeePurposeRule:'file opening',fileOpeningFeeRefundRule:'refundable official path',continuationReassuranceRule:'',commercialStructureRule:'murabaha',additionalFeesRule:'none',requirementsGuidanceRule:'',firstInstallmentRule:'after one month',pickupRule:'office only',secureDocumentsRule:'official link only',independenceStatement:'مستقلة',paymentAliases:['PAYAMEEEN','AMEEN1ST','AM500337'],paymentWalletType:'Orange Money',paymentBeneficiaryName:'ABDUL RAHMAN ALHARAHSHEH',paymentMethodRule:'',paymentConfirmationRule:'manual',normalReviewWindow:'2-3 business days',reviewPressureLevel:'severe',severePressureRule:''};
const truth=(access='full')=>({confidence:'authoritative',source:access==='safe_preview'?'tracking_safe_preview':'current_message_tracking',contactAccess:access,application:{...app},ambiguousApplications:[],policy,fetchedAt:new Date().toISOString(),readWarnings:access==='safe_preview'?['contact_identity_mismatch_current_tracking','contact_identity_safe_preview']:[]});
function turn(text,topics=['unknown'],actions=[]){return {turnId:'t1',rawText:text,normalizedText:normalize(text),acts:[],topics,requestedActions:actions,sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:1,warnings:[]}}

// P0 mutation confirmation / action ownership.
const mut=load(f.mutation);
let pending={...stateBase,pendingAction:'cancel_application',pendingActionPayload:{_mutationConfirmationRequired:true,_mutationAction:'cancel_application',_scopeApplicationId:'app1',_scopeTrackingId:'AM-1789311690014',_scopeTurnId:'old',_scopeWaId:stateBase.waId},lastAssistantText:'تمام، هاي بيانات الدفع الرسمية ورسوم فتح الملف 5 دنانير.'};
let g=mut.enforceMutationConfirmationGate({actions:[{action:'cancel_application',sourceActId:'x',requiresConfirmation:false,authority:'ai_planned',requiredRole:'omran',payload:null}],turn:turn('تم',['acknowledgement'],['cancel_application']),state:pending,truth:truth()});
ok(g.confirmedAction===null,'P0 generic تم never confirms cancellation');
ok(!g.actions.some(x=>x.action==='cancel_application'&&!x.requiresConfirmation),'P0 generic تم cannot produce executable cancellation');
ok(g.clearPendingConfirmation===true,'stale pending cancellation is cleared when assistant already moved to payment');
pending={...pending,lastAssistantText:'قبل ما أنفذ، اكتب: نعم، ألغي الطلب.'};
g=mut.enforceMutationConfirmationGate({actions:[{action:'cancel_application',sourceActId:'x',requiresConfirmation:false,authority:'ai_planned',requiredRole:'omran',payload:null}],turn:turn('نعم',['acknowledgement'],['cancel_application']),state:pending,truth:truth()});
ok(g.confirmedAction===null,'bare نعم is not enough for a real cancellation');
g=mut.enforceMutationConfirmationGate({actions:[{action:'cancel_application',sourceActId:'x',requiresConfirmation:true,authority:'ai_planned',requiredRole:'omran',payload:null}],turn:turn('نعم، ألغي الطلب',['cancellation'],['cancel_application']),state:pending,truth:truth()});
const confirmed=g.actions.find(x=>x.action==='cancel_application'&&!x.requiresConfirmation);
ok(g.confirmedAction==='cancel_application'&&!!confirmed,'explicit action-named cancellation confirmation succeeds');
ok(confirmed&&confirmed.payload&&confirmed.payload._mutationConfirmedOnTurn==='t1','confirmed mutation carries exact confirmation turn');
ok(confirmed&&confirmed.payload&&confirmed.payload._scopeWaId===stateBase.waId,'confirmed mutation carries exact sender ownership');
let wrong={...pending,waId:'962700000000'};
g=mut.enforceMutationConfirmationGate({actions:[],turn:turn('نعم، ألغي الطلب',['cancellation'],['cancel_application']),state:wrong,truth:truth()});
ok(g.confirmedAction===null||g.clearPendingConfirmation===true,'cross-sender pending mutation cannot be confirmed');

// WhatsApp alias is a third scoped Real Action with the same two-step discipline.
let aliasPending={...stateBase,pendingAction:'link_whatsapp_alias',pendingActionPayload:{_mutationConfirmationRequired:true,_mutationAction:'link_whatsapp_alias',_scopeApplicationId:'app1',_scopeTrackingId:'AM-1789311690014',_scopeTurnId:'old',_scopeWaId:stateBase.waId,_aliasWaId:stateBase.waId},lastAssistantText:'إذا هذا رقم واتسابك اكتب: نعم، اعتمد الرقم.'};
g=mut.enforceMutationConfirmationGate({actions:[{action:'link_whatsapp_alias',sourceActId:'x',requiresConfirmation:true,authority:'deterministic',requiredRole:'omran',payload:{_autoContactAliasPrompt:true,_aliasWaId:stateBase.waId}}],turn:turn('نعم',['acknowledgement'],[]),state:aliasPending,truth:truth('safe_preview')});
ok(g.confirmedAction===null,'bare نعم never confirms WhatsApp alias linking');
g=mut.enforceMutationConfirmationGate({actions:[{action:'link_whatsapp_alias',sourceActId:'x',requiresConfirmation:true,authority:'deterministic',requiredRole:'omran',payload:{_autoContactAliasPrompt:true,_aliasWaId:stateBase.waId}}],turn:turn('نعم اعتمد الرقم',['application_correction'],[]),state:aliasPending,truth:truth('safe_preview')});
const aliasConfirmed=g.actions.find(x=>x.action==='link_whatsapp_alias'&&!x.requiresConfirmation);
ok(g.confirmedAction==='link_whatsapp_alias'&&!!aliasConfirmed,'action-named نعم اعتمد الرقم confirms alias linking');
ok(aliasConfirmed&&aliasConfirmed.payload&&aliasConfirmed.payload._aliasWaId===stateBase.waId,'confirmed alias mutation is locked to current WhatsApp sender');
let aliasFirst=mut.enforceMutationConfirmationGate({actions:[{action:'link_whatsapp_alias',sourceActId:'x',requiresConfirmation:true,authority:'deterministic',requiredRole:'omran',payload:{_autoContactAliasPrompt:true,_aliasWaId:stateBase.waId}}],turn:turn('AM-1789311690014',['application_status'],[]),state:stateBase,truth:truth('safe_preview')});
ok(/لقيت الطلب/.test(aliasFirst.confirmationPrompt||'')&&/نعم، اعتمد الرقم/.test(aliasFirst.confirmationPrompt||''),'safe-preview tracking automatically offers one-step alias confirmation with useful order preview');

const actionPlane=load(f.action);
(async()=>{
 let calls=0; const adapter={execute:async()=>{calls++;return {success:true,mutationId:'m1',summary:'executed'}}};
 let exactAction={action:'cancel_application',sourceActId:'x',requiresConfirmation:false,authority:'deterministic',requiredRole:'omran',payload:{_scopeApplicationId:'app1',_scopeTrackingId:'AM-1789311690014',_scopeWaId:stateBase.waId,_mutationConfirmedOnTurn:'t1'}};
 let rr=await actionPlane.executeActions({actions:[exactAction],state:stateBase,truth:truth(),adapter,allowMutation:true});
 ok(calls===1&&rr[0].outcome==='executed','real mutation executes only with exact application/tracking/sender/confirmation scope');
 calls=0; rr=await actionPlane.executeActions({actions:[{...exactAction,payload:{...exactAction.payload,_scopeWaId:'962700000000'}}],state:stateBase,truth:truth(),adapter,allowMutation:true});
 ok(calls===0&&rr[0].blocker==='mutation_sender_scope_required','wrong WhatsApp sender blocks real mutation before adapter');
 calls=0; const noConfirm={...exactAction,payload:{...exactAction.payload,_mutationConfirmedOnTurn:null}}; rr=await actionPlane.executeActions({actions:[noConfirm],state:stateBase,truth:truth(),adapter,allowMutation:true});
 ok(calls===0&&rr[0].blocker==='explicit_action_named_confirmation_required','missing explicit confirmation turn blocks real mutation');
 calls=0; rr=await actionPlane.executeActions({actions:[exactAction],state:stateBase,truth:truth('safe_preview'),adapter,allowMutation:true});
 ok(calls===0&&rr[0].blocker==='full_contact_identity_required_for_mutation','safe-preview alternate contact cannot execute cancellation/refund');
 calls=0; const aliasAction={action:'link_whatsapp_alias',sourceActId:'a1',requiresConfirmation:false,authority:'deterministic',requiredRole:'omran',payload:{_scopeApplicationId:'app1',_scopeTrackingId:'AM-1789311690014',_scopeWaId:stateBase.waId,_aliasWaId:stateBase.waId,_mutationConfirmedOnTurn:'t1'}};
 rr=await actionPlane.executeActions({actions:[aliasAction],state:stateBase,truth:truth('safe_preview'),adapter,allowMutation:true});
 ok(calls===1&&rr[0].outcome==='executed','confirmed WhatsApp alias can execute from safe-preview truth while other mutations stay blocked');
 calls=0; rr=await actionPlane.executeActions({actions:[{...aliasAction,payload:{...aliasAction.payload,_aliasWaId:'962700000000'}}],state:stateBase,truth:truth('safe_preview'),adapter,allowMutation:true});
 ok(calls===0&&rr[0].blocker==='alias_sender_scope_required','alias action cannot link a different WhatsApp number than current sender');

 // Conversation constraints persist human instructions.
 const cc=load(f.constraints);
 let cs=cc.updateConversationConstraints({state:{...stateBase},customerText:'مابدي روابط',turnId:'c1'});
 ok(cs.conversationConstraints.noLinks===true,'no-links preference persists in conversation state');
 ok(!cc.applyConversationConstraintsToReply({state:cs,reply:'الحالة نفسها\nhttps://www.ameenfinance.co/track\nوبنكمل هون'}).includes('http'),'no-links egress removes links deterministically');
 cs=cc.updateConversationConstraints({state:cs,customerText:'بس ابعتلي واتس لا ترن مكالمة',turnId:'c2'});
 ok(cs.conversationConstraints.whatsappOnly===true,'WhatsApp-only preference persists');
 cs=cc.updateConversationConstraints({state:cs,customerText:'ما تعيد نفس الحكي مش نسخ لصق',turnId:'c3'});
 ok(cs.conversationConstraints.avoidRepetition===true,'do-not-repeat preference persists');
 cs=cc.updateConversationConstraints({state:cs,customerText:'ابعتلي الرابط',turnId:'c4'});
 ok(cs.conversationConstraints.noLinks===false,'explicit later link request clears no-links constraint');

 // Human-company current-turn semantics.
 const hc=load(f.human);
 ok(hc.resolveHumanCompanyOverride({turn:turn('إذا دفعت قسطين بنفس الشهر بدل قسط واحد، بزبط؟'),state:stateBase,truth:truth()})==='installment_adjustment','two-installment question overrides bad payment classifier');
 const inst=hc.buildHumanCompanyOverrideReply({kind:'installment_adjustment',state:stateBase,truth:truth()});
 ok(!/5\s*دنانير|رسوم\s+فتح\s+الملف/.test(inst),'installment-adjustment answer never hijacks into 5 JOD path');
 ok(hc.resolveHumanCompanyOverride({turn:turn('بس يتم موافقتي ابعتلي واتس لا ترن مكالمه'),state:stateBase,truth:truth()})==='whatsapp_only_preference','WhatsApp-not-call instruction is understood literally');
 ok(/واتساب فقط/.test(hc.buildHumanCompanyOverrideReply({kind:'whatsapp_only_preference',state:stateBase,truth:truth()})),'WhatsApp-only reply does not invert the preference');
 ok(hc.resolveHumanCompanyOverride({turn:turn('حسب الموقع حكولي ١٧ الشهر الموافقه صح؟'),state:stateBase,truth:truth()})==='specific_approval_date_claim','Arabic-digit website approval date is understood as date claim');
 ok(hc.resolveHumanCompanyOverride({turn:turn('من اي بنك كشف الحساب و بنفع زين كاش ؟'),state:stateBase,truth:truth()})==='income_proof_source','bank + Zain Cash question gets direct semantic ownership');
 ok(/Zain Cash/.test(hc.buildHumanCompanyOverrideReply({kind:'income_proof_source',state:stateBase,truth:truth()})),'income evidence reply directly addresses Zain Cash');
 ok(hc.resolveHumanCompanyOverride({turn:turn('بتعرف رقم الجرائم الإلكترونية؟'),state:stateBase,truth:truth()})==='official_external_number','external official-number question does not leak into requirements/status');
 ok(!/911/.test(hc.buildHumanCompanyOverrideReply({kind:'official_external_number',state:stateBase,truth:truth()})),'unverified cybercrime number is not invented');
 const sensitiveTruth=truth(); sensitiveTruth.application.status='needs_identity';
 ok(hc.resolveHumanCompanyOverride({turn:turn('تم استلام صورة من العميل بدون تعليق.'),state:stateBase,truth:sensitiveTruth})==='sensitive_document_on_whatsapp','image received while identity is required triggers sensitive-document guard');
 ok(/ما بنعتمده من واتساب/.test(hc.buildHumanCompanyOverrideReply({kind:'sensitive_document_on_whatsapp',state:stateBase,truth:sensitiveTruth})),'sensitive document is rejected from WhatsApp as official intake');

 // Financial incident plane.
 const pi=load(f.incident);
 ok(pi.detectPaymentIncident('حولت الفلوس و الاسم طلع غلط')==='beneficiary_name_mismatch','wrong beneficiary after transfer is detected as payment incident');
 ok(pi.detectPaymentIncident('دفعت والاسم مختلف')==='beneficiary_name_mismatch','beneficiary mismatch works with short customer phrasing');
 const pir=pi.buildPaymentIncidentReply({kind:'beneficiary_name_mismatch',expectedBeneficiary:'ABDUL RAHMAN ALHARAHSHEH'});
 ok(/ما تدفع مرة ثانية/.test(pir)&&/ABDUL RAHMAN ALHARAHSHEH/.test(pir),'payment incident reply stops duplicate payment and states official beneficiary');

 // Actual production response-arbiter kernel: raw human meaning vetoes a wrong classifier/candidate.
 const arb=load(f.arbiter);
 const badTurn=turn('إذا دفعت قسطين بنفس الشهر بدل قسط واحد، بزبط؟',['receipt_upload'],[]);
 const ar=arb.arbitrateProductionReply({candidate:'وصلتني إنك بتقول إنك دفعت. تأكيد الدفع النهائي إداري.',turn:badTurn,state:stateBase,truth:truth(),actions:[]});
 ok(ar.repaired===true&&/كامل الرصيد|أكثر من قسط/.test(ar.reply||''),'production egress repairs exact AlKhidma bad-classifier replay');
 ok(!/بتقول إنك دفعت|رسوم فتح الملف/.test(ar.reply||''),'production egress removes false paid/5-JOD hijack');
 const wturn=turn('بس يتم موافقتي ابعتلي واتس لا ترن مكالمه',['unknown'],[]);
 const wr=arb.arbitrateProductionReply({candidate:'فاهم إنك بدك نحكي باتصال عشان توضح الصورة.',turn:wturn,state:stateBase,truth:truth(),actions:[]});
 ok(/واتساب فقط/.test(wr.reply||'')&&!/بدك نحكي باتصال/.test(wr.reply||''),'production egress repairs Wateen call-preference inversion');
 const pturn=turn('حولت و الاسم طلع غلط',['payment_status'],[]);
 const pr=arb.arbitrateProductionReply({candidate:'الحالة قيد الدراسة النهائية.',turn:pturn,state:stateBase,truth:truth(),actions:[]});
 ok(/ما تدفع مرة ثانية/.test(pr.reply||''),'production egress payment-incident plane outranks status template');

 // Contact identity request grammar.
 const cai=load(f.contactApp,{'@/lib/supabaseAdmin':{supabaseAdmin:{from(){throw new Error('db not expected')}}}});
 ok(cai.explicitCurrentWhatsAppAliasRequest('اعتمد هذا الرقم للواتساب على طلبي')===true,'explicit current WhatsApp alias request is recognized');
 ok(cai.explicitCurrentWhatsAppAliasRequest('هذا رقمي للواتساب وبدي أتابع عليه')===true,'natural ownership + WhatsApp wording is recognized');
 ok(cai.explicitCurrentWhatsAppAliasRequest('0775339860')===false,'bare phone number cannot self-authorize alias');

 // Persistent auto-approved alias behavior with fake database.
 let aliasRow=null; let seq=0;
 function aliasFrom(){let filters={};let mode='select',upsertPayload=null;const q={select(){return q},eq(k,v){filters[k]=v;return q},order(){return q},limit(){return q},upsert(p){mode='upsert';upsertPayload=p;aliasRow={...(aliasRow||{}),...p,id:aliasRow?.id||`alias-${++seq}`};return q},maybeSingle(){if(mode==='upsert')return Promise.resolve({data:{id:aliasRow.id,status:aliasRow.status},error:null});return Promise.resolve({data:aliasRow,error:null})}};return q}
 cache.clear(); const caiDb=load(f.contactApp,{'@/lib/supabaseAdmin':{supabaseAdmin:{from(t){if(t!=='whatsapp_application_contacts')throw new Error(t);return aliasFrom()}}}});
 let rq=await caiDb.approveApplicationWhatsAppAlias({applicationId:'app1',trackingId:'AM-1789311690014',waId:'962775573841',requestedByWaId:'962775573841',requestText:'اعتماد رقم واتساب الحالي',confirmationTurnId:'t1',confirmationText:'نعم اعتمد الرقم'});
 ok(rq.ok&&rq.alreadyApproved===false,'explicitly confirmed WhatsApp alias is approved immediately without admin wait');
 ok(aliasRow&&aliasRow.status==='approved'&&aliasRow.approved_by==='customer_explicit_confirmation','alias persistence records customer-explicit approval source');
 ok(aliasRow&&aliasRow.confirmation_turn_id==='t1'&&aliasRow.confirmation_text==='نعم اعتمد الرقم','alias persistence keeps confirmation turn and text for audit');
 rq=await caiDb.approveApplicationWhatsAppAlias({applicationId:'app1',trackingId:'AM-1789311690014',waId:'962775573841',confirmationTurnId:'t2',confirmationText:'نعم اعتمد الرقم'});
 ok(rq.ok&&rq.alreadyApproved===true,'repeating an already-approved alias is idempotent');
 const approved=await caiDb.approvedWhatsAppAliasForApplication({applicationId:'app1',waId:'962775573841'});
 ok(approved&&approved.status==='approved','customer-confirmed alias resolves as durable application contact');

 // Production truth: tracking from another number gives safe preview, approved alias gives full truth.
 function normPhone(v){let d=String(v||'').replace(/\D/g,'');if(d.startsWith('00962'))d=d.slice(5);else if(d.startsWith('962'))d=d.slice(3);if(d.startsWith('7')&&d.length===9)d='0'+d;return /^07[789]\d{7}$/.test(d)?d:''}
 function waPhone(v){const local=normPhone(v);return local?`962${local.slice(1)}`:''}
 const appRow={id:'app1',created_at:'2026-09-13',tracking_id:'AM-1789311690014',full_name:'Yousef Full',phone:'0793393352',email:'secret@example.com',status:'under_review',payment_status:'confirmed',payment_confirmed_at:'2026-09-14',payment_reference:'secretref',device_id:'d',device_name:'iPhone 17 - 256GB',device_price:768.55,installment_months:36,down_payment:0,interest_rate:null,monthly_payment:24.55,total_with_interest:883.8,salary:500,delivery_delay_until:null,guarantor_name:'G',guarantor_phone:'0790000000',guarantor_national_id:'NN',preliminary_qualified_at:'2026-09-12',paid_clicked_at:'2026-09-14'};
 function appQuery(){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:appRow,error:null})},in(){return q}};return q}
 const supabase={from(t){if(t==='applications')return appQuery();if(t==='documents'){const d={select(){return d},eq(){return Promise.resolve({data:[],error:null})}};return d}throw new Error('unexpected '+t)}};
 let aliasApproved=false;
 const prod=load(f.truth,{'@/lib/supabaseAdmin':{supabaseAdmin:supabase},'../text':{normalizeJordanPhone:normPhone,normalizeWhatsAppToSend:waPhone},'./applicationContactIdentity':{approvedWhatsAppAliasForApplication:async()=>aliasApproved?{status:'approved'}:null,approvedApplicationIdsForWhatsApp:async()=>[]}});
 let pt=await prod.resolveV3ProductionTruth({waId:'962775573841',customerText:'AM-1789311690014',state:{...stateBase,activeApplicationId:null,activeTrackingId:null,contactResolution:null},recentTurns:[],topics:['application_status']});
 ok(pt.contactAccess==='safe_preview'&&pt.source==='tracking_safe_preview','cross-number tracking resolves safe operational preview instead of dead-end');
 ok(pt.application&&pt.application.deviceName==='iPhone 17 - 256GB'&&pt.application.status==='under_review','safe preview exposes useful device/status information');
 ok(pt.application&&pt.application.fullName===null&&pt.application.phone===null&&pt.application.email===null&&pt.application.salary===null,'safe preview redacts direct personal/sensitive identity fields');
 aliasApproved=true;
 pt=await prod.resolveV3ProductionTruth({waId:'962775573841',customerText:'AM-1789311690014',state:{...stateBase,activeApplicationId:null,activeTrackingId:null,contactResolution:null},recentTurns:[],topics:['application_status']});
 ok(pt.contactAccess==='full'&&pt.source==='approved_contact_alias','customer-confirmed approved alias unlocks full application truth');
 ok(pt.application&&pt.application.fullName==='Yousef Full','approved alias restores normal application access');

 // Runtime/admin architecture static invariants.
 ok(src.runtime.includes('truthBeforeActions.contactAccess === "safe_preview"')&&src.runtime.includes('link_whatsapp_alias')&&src.runtime.includes('_autoContactAliasPrompt'),'runtime stages alias confirmation automatically from safe-preview contact flow');
 ok(src.tx.includes('approveApplicationWhatsAppAlias')&&src.tx.includes('link_whatsapp_alias'),'transactional adapter executes customer-confirmed alias as a scoped Real Action');
 ok(src.runtime.includes('تم اعتماد رقم واتساب تابع للطلب تلقائيًا'),'successful alias action emits Discord audit notification without approval dependency');
 ok(src.runtime.includes('payment_incident_review'),'financial incident emits dedicated admin action');
 ok(src.runtime.includes('applyConversationConstraintsToReply'),'human constraints are enforced at true egress');
 ok(src.runtime.includes('truthAfterActions.contactAccess !== "safe_preview"'),'safe-preview alternate contact cannot enter 5 JOD continuation progression');
 ok(src.action.includes('_scopeWaId')&&src.action.includes('explicit_action_named_confirmation_required'),'real action plane enforces sender + named confirmation ownership');
 ok(src.mutation.includes('generic acknowledgements are never mutation consent'),'mutation gate documents P0 generic-ack safety rule');
 ok(src.admin.includes('preferredWhatsAppPhone'),'admin outbound messaging prefers approved WhatsApp alias without changing primary phone');
 ok(src.admin.includes('إلغاء اعتماد هذا الرقم'),'admin can revoke an auto-linked alias after the fact');
 ok(src.admin.includes('رقم الهاتف الأساسي يبقى كما هو'),'admin UI explicitly preserves primary application phone');
 ok(src.incident.includes('ما تدفع مرة ثانية'),'financial incident path forbids duplicate payment');
 ok(src.human.includes('ما عندي رقم رسمي موثق للجرائم الإلكترونية'),'external official-number reply fails closed instead of inventing facts');
 ok(src.link.includes('conversationConstraints'),'sanitized writer context carries human conversation constraints');

 // All changed TS/TSX must at least parse cleanly in package before real-project tsc/build.
 const changed=[f.types,f.mutation,f.action,f.tx,f.contactApp,f.truth,f.constraints,f.incident,f.human,f.arbiter,f.runtime,f.writer,f.link,f.discord,f.admin,base+'currentHumanTurnAuthority.ts',base+'state.ts',base+'stateStore.ts',base+'truth.ts'];
 for(const rel of changed)transpile(rel);

 console.log(`\n7.6.0 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
