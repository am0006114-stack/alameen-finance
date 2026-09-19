const fs=require('fs'),path=require('path'),vm=require('vm');
let ts; try{ts=require('typescript')}catch{try{ts=require(path.join(process.env.APPDATA||'','npm/node_modules/typescript'))}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}}
const root=process.argv[2]||process.cwd(); let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:rel});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(errs.length===0,`${rel} TypeScript syntax/transpile diagnostics clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));return out.outputText;}
function run(rel,stubs={}){const js=transpile(rel);const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>{if(id in stubs)return stubs[id];throw new Error(`unexpected require ${id} from ${rel}`)},console,process:{env:{}},Date,Map,Set,URL,setTimeout,clearTimeout});return mod.exports;}
const base='app/api/whatsapp/webhook/_lib/v3-os/';
const files={
 types:base+'types.ts',identity:base+'contactIdentity.ts',identityStore:base+'contactIdentityStore.ts',truth:base+'productionTruth.ts',state:base+'state.ts',stateStore:base+'stateStore.ts',runtime:base+'runtimeLive.ts',context:base+'contextualTurnResolver.ts',recovery:base+'conversationRecovery.ts',firewall:base+'paymentEligibilityFirewall.ts',final:base+'finalResponseGate.ts',writer:base+'writerContract.ts',link:base+'linkIntegrity.ts',pay:base+'paymentDestinationOverride.ts'
};
const src=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,read(v)]));
ok(src.types.includes('v3.0.0-phase7.6.0-human-company-runtime-identity-action-safety-conversation-control'),'newer runtime preserves 7.5.10 behavioral contract under 7.6.0');
ok(src.types.includes('v3.0.0-phase7.5.9.4-human-contact-isolation-continuity'),'7.5.9.4 compatibility anchor preserved');
ok(src.pay.includes('0788500337')&&src.pay.includes('PAYAMEEEN')&&src.pay.includes('AMEEN1ST')&&src.pay.includes('AM500337')&&src.pay.includes('ABDUL RAHMAN ALHARAHSHEH'),'5 JOD destinations remain frozen');
const normalize=x=>String(x||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
function normalizeWa(v){let d=String(v||'').replace(/\D/g,'');if(d.startsWith('00962'))d=d.slice(5);else if(d.startsWith('962'))d=d.slice(3);if(d.startsWith('0'))d=d.slice(1);return d.length===9&&d.startsWith('7')?'962'+d:d;}
const identity=run(files.identity,{'../text':{normalizeArabicText:normalize,normalizeWhatsAppToSend:normalizeWa},'./types':{}});
const primary='962793393352',aliasLocal='0775573841',alias='962775573841';
ok(identity.extractExplicitAlternateContactAuthorization(`الرقم هاض رقمي الي هو ${aliasLocal} لما احكي معكو من هناك ردو علي`,primary)===alias,'registered-sender explicit ownership + future-use wording extracts one alternate alias');
ok(identity.extractExplicitAlternateContactAuthorization(aliasLocal,primary)===null,'merely typing a phone number never authorizes an alias');
ok(identity.extractExplicitAlternateContactAuthorization(`هذا رقمي ${aliasLocal}`,primary)===null,'ownership statement without future-use authorization is insufficient');
ok(identity.extractExplicitAlternateContactAuthorization(`لما ابعت من ${aliasLocal} ردو علي`,primary)===null,'future-use request without ownership statement is insufficient');
const binding=identity.makeVerifiedContactBinding({aliasWaId:alias,primaryWaId:primary});
let state={verifiedContactBinding:binding,contactResolution:null};
ok(identity.verifiedContactBindingValidForSender(state,alias)===true,'verified alias is valid only on the alias sender state');
ok(identity.verifiedContactBindingValidForSender(state,'962781111111')===false,'different sender cannot reuse verified alias binding');
ok(identity.verifiedPrimaryWaId(state,alias)===primary,'verified alias resolves deterministic primary identity');
ok(identity.bindingAllowsApplication(state,alias,'0793393352',(a,b)=>normalizeWa(a)===normalizeWa(b))===true,'verified alias authorizes only an application owned by verified primary');
ok(identity.bindingAllowsApplication(state,alias,'0790000000',(a,b)=>normalizeWa(a)===normalizeWa(b))===false,'verified alias does not authorize a different application owner');
state={verifiedContactBinding:null,contactResolution:{status:'blocked_mismatch',trackingId:'AM-1789311690014',explanation:'different_whatsapp',updatedAt:'x'}};
state=identity.markContactResolution({state,status:'awaiting_admin_update',customerText:'رقمي ما عليه واتساب'});
ok(state.contactResolution.status==='awaiting_admin_update','blocked mismatch can advance to durable admin-update contact state');
ok(state.contactResolution.trackingId==='AM-1789311690014','contact-resolution transition preserves known tracking id');
ok(state.contactResolution.explanation==='no_whatsapp','contact-resolution memory records the customer reason');

// Persisted alias store: use existing conversation-state table abstraction only, never applications mutation.
const memory=new Map();
const stateStoreStub={loadV3ConversationState:async id=>memory.get(id)||null,saveV3ConversationState:async s=>{memory.set(s.waId,s)}};
const emptyState=waId=>({waId,verifiedContactBinding:null,contactResolution:null,facts:[],openLoops:[],role:{},updatedAt:new Date().toISOString()});
const store=run(files.identityStore,{'./state':{emptyState},'./stateStore':stateStoreStub,'./contactIdentity':identity});

function normPhone(v){let d=String(v||'').replace(/\D/g,'');if(d.startsWith('00962'))d=d.slice(5);else if(d.startsWith('962'))d=d.slice(3);if(d.startsWith('7')&&d.length===9)d='0'+d;return /^07[789]\d{7}$/.test(d)?d:''}
function waPhone(v){const local=normPhone(v);return local?`962${local.slice(1)}`:''}
const app={id:'app-y',tracking_id:'AM-1789311690014',phone:'0793393352',status:'under_review',payment_status:'confirmed',full_name:'Yousef',device_name:'iPhone 17'};
function appQuery(){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:app,error:null})},in(){return q}};return q}
const supabase={from(table){if(table==='applications')return appQuery(); if(table==='documents'){const q={select(){return q},eq(){return Promise.resolve({data:[],error:null})}};return q;} throw new Error('unexpected '+table)}};
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,normalReviewWindow:'من يومين لـ3 أيام عمل'};
const resolveTruth=({state})=>({confidence:'none',source:'none',application:null,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()});
const productionTruthStubs=(approved)=>({'@/lib/supabaseAdmin':{supabaseAdmin:supabase},'../text':{normalizeJordanPhone:normPhone,normalizeWhatsAppToSend:waPhone},'./types':{},'./truth':{resolveTruth},'./contactIdentity':identity,'./applicationContactIdentity':{approvedWhatsAppAliasForApplication:async({applicationId,waId})=>Boolean(approved&&applicationId==='app-y'&&normalizeWa(waId)===alias),approvedApplicationIdsForWhatsApp:async waId=>approved&&normalizeWa(waId)===alias?['app-y']:[]}});
const prodBlocked=run(files.truth,productionTruthStubs(false));
const prodApproved=run(files.truth,productionTruthStubs(true));

// Semantic grounding and payment-path separation.
const context=run(files.context,{'./text':{normalizeArabic:normalize},'./types':{}});
ok(context.installmentAdjustmentQuestionText('صار معي المبلغ كامل للجهاز هل بقدر ادفعو مرة وحدة')===true,'full device payoff is recognized as installment-adjustment question');
ok(context.installmentAdjustmentQuestionText('حبيت ادفع 49 دينار يعني شهر عن شهرين')===true,'two-installments-in-one-month question is recognized');
ok(context.deviceModelReferenceQuestionText('نعم 17 عادي و 16 عادي','أي جهاز أو موديل معين وأسعاره؟')===true,'16/17 shorthand is grounded as device models in device context');
ok(context.incomeEvidenceSourceQuestionText('من اي بنك كشف الحساب و بنفع زين كاش ؟')===true,'bank + Zain Cash income-evidence question is recognized');
const firewall=run(files.firewall,{'./applicationJourney':{applicationJourneyStage:()=> 'final_review'},'./paymentTruth':{hasAuthoritativePaymentConfirmation:()=>true},'./text':{normalizeArabic:normalize},'./types':{},'./paymentDestinationOverride':{allFileOpeningPaymentExecutionTokens:()=>['PAYAMEEEN','AMEEN1ST','AM500337','0788500337'],FILE_OPENING_PAYMENT_BENEFICIARY:'ABDUL RAHMAN ALHARAHSHEH'}});
ok(firewall.customerTextIsNonFeePaymentContext('صار معي المبلغ كامل للجهاز هل بقدر ادفعو مرة وحدة')===true,'full payoff context cannot leak 5 JOD execution details');
ok(firewall.customerTextIsNonFeePaymentContext('بدل 24 ادفع 48 يعني شهر عن شهرين')===true,'extra-installment context cannot leak 5 JOD execution details');

// Static architecture invariants.
ok(src.truth.includes('approved_contact_alias')&&src.truth.includes('approvedWhatsAppAliasForApplication'),'production truth supports deterministic persisted alias approval without typed-number self-authorization');
ok(src.identityStore.includes('whatsapp_v3_conversation_state')===false&&src.identityStore.includes('saveV3ConversationState'),'alias persistence uses existing state-store abstraction, not a new table/schema');
ok(!/\b(?:insert|alter\s+table|create\s+table|drop\s+table)\b/i.test(src.identity+'\n'+src.identityStore),'new contact identity modules contain no SQL migration');
ok(src.runtime.includes('awaiting_alias_confirmation')&&src.runtime.includes('link_whatsapp_alias'),'runtime preserves durable contact problem and upgrades it to explicit two-step alias confirmation');
ok(src.runtime.includes('applications.phone is never changed by this flow'),'runtime explicitly preserves primary application phone while linking WhatsApp alias');
ok(src.writer.includes('CONTACT_IDENTITY_CONTEXT=')&&src.writer.includes('CONTACT RESOLUTION MEMORY'),'writer sees durable verified contact and open contact-resolution state');
ok(src.writer.includes('CURRENT QUESTION DOMINANCE')&&src.writer.includes('STRAY RESPONSE FIREWALL'),'writer contract requires human current-question dominance and bans unrelated paragraphs');
ok(src.link.includes('verifiedContactBinding')&&src.link.includes('contactResolution'),'sanitized writer state carries safe contact-identity context');
ok(src.final.includes('stray_legal_response_without_current_obligation'),'final egress detects unsolicited legal/registration paragraph');
ok(src.final.includes('device_model_reference_misread_as_age'),'final egress blocks iPhone model shorthand being rewritten as age');
ok(src.final.includes('income_evidence_source_question_not_answered'),'final egress requires direct bank/e-wallet evidence answer');
ok(src.final.includes('installment_adjustment_misrouted_to_file_opening_payment'),'final egress protects installment questions from 5 JOD hijack');
ok(src.recovery.includes('قصدك موديلات الآيفون')&&src.recovery.includes('Zain Cash'),'conversation recovery has bounded semantic repair for both production failures');
ok(!src.runtime.includes('update({ phone:'),'7.5.10 primary-phone protection remains: runtime does not overwrite application.phone');

const changed=[files.types,files.identity,files.identityStore,files.truth,files.state,files.stateStore,files.runtime,files.context,files.recovery,files.firewall,files.final,files.writer,files.link];
for(const rel of changed) transpile(rel);

(async()=>{
  let r=await store.persistVerifiedAlternateContact({primaryWaId:primary,aliasWaId:alias});
  ok(r.ok===true&&!r.conflict,'registered sender can persist one verified alternate alias');
  const aliasState=memory.get(alias);
  ok(aliasState&&aliasState.verifiedContactBinding.primaryWaId===primary,'alias state persistently records verified primary identity');
  ok(aliasState.contactResolution.status==='verified_alias','alias state records resolved verified-alias contact status');
  r=await store.persistVerifiedAlternateContact({primaryWaId:'962789999999',aliasWaId:alias});
  ok(r.ok===false&&r.conflict===true,'existing alias cannot be silently rebound to another primary identity');
  const aliasTruthState={...aliasState,activeApplicationId:null,activeTrackingId:null,lastVerifiedApplication:null};
  const t=await prodApproved.resolveV3ProductionTruth({waId:alias,customerText:'AM-1789311690014',state:aliasTruthState,recentTurns:[],topics:['application_status']});
  ok(t.application&&t.application.trackingId==='AM-1789311690014','durably approved alternate sender can resolve its application truth');
  ok(t.source==='approved_contact_alias','truth provenance explicitly records approved-contact-alias authorization');
  const unverified={...aliasTruthState,verifiedContactBinding:null};
  const blocked=await prodBlocked.resolveV3ProductionTruth({waId:alias,customerText:'AM-1789311690014',state:unverified,recentTurns:[],topics:['application_status']});
  ok(blocked.application&&blocked.application.trackingId==='AM-1789311690014'&&blocked.contactAccess==='safe_preview','same alternate sender gets only safe operational preview before deterministic alias approval');
  console.log(`\n7.5.10 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`); process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
