const fs=require('fs'),path=require('path'),vm=require('vm');
let ts; try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cache=new Map();
function load(rel){let file=path.isAbsolute(rel)?rel:path.join(root,rel);if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';}
 if(cache.has(file))return cache.get(file).exports;const src=fs.readFileSync(file,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(file,mod);function req(id){if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';return load(p)} if(id==='@/lib/supabaseAdmin') return {supabaseAdmin:{}}; throw new Error(`unexpected external require ${id}`)}vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder},{filename:file});return mod.exports}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const types=read(b+'types.ts'), writer=read(b+'writerContract.ts'), route=read('app/api/whatsapp/webhook/route.ts'), ti=read(b+'turnIntegrity.ts'), gateSrc=read(b+'mutationConfirmationGate.ts'), arbiterSrc=read(b+'responseArbiter.ts'), dailySrc=read(b+'dailyConversationIntegrity.ts'), runtime=read(b+'runtimeLive.ts');
ok(types.includes('v3.0.0-phase7.7.2-fresh-turn-open-loop-egress-integrity'),'runtime version identifies 7.7.2');
ok(types.includes('v3.0.0-phase7.7.1-payment-journey-continuity-human-repair'),'7.7.1 compatibility anchor preserved');
ok(writer.includes('PHASE 7.7.2 FRESH-TURN AUTHORITY'),'writer carries fresh-turn contract');
ok(writer.includes('PHASE 7.7.2 OPEN-LOOP COMPLETION'),'writer carries open-loop completion contract');
ok(writer.includes('PHASE 7.7.2 EGRESS FRESHNESS'),'writer carries egress freshness contract');
ok(route.includes('waitForV3EgressFreshnessBarrier')&&route.includes('quietMs: 450'),'route requires final egress quiet-window freshness barrier');
ok(ti.includes('Final egress freshness barrier')&&ti.includes('setTimeout'),'turn-integrity layer rechecks latest inbound after a quiet window');
ok(gateSrc.includes('contextualAliasOpenLoopConfirmation'),'alias confirmation is owned by an explicit pending open-loop');
ok(arbiterSrc.includes('social_closure')&&arbiterSrc.includes('fresh-turn social closure vetoed stale previous-topic answer'),'arbiter has deterministic social-closure authority');
ok(runtime.includes('enforceFreshTurnAuthority'),'runtime applies fresh-turn authority before state reduction/planning');
ok(dailySrc.includes('رجاءا')&&dailySrc.includes('استعجلو'),'production expedite wording is recognized');

const fresh=load(b+'freshTurnAuthority.ts');
function turn(text,acts=[],topics=[],actions=[]){return {turnId:'t',rawText:text,normalizedText:text,acts,topics,requestedActions:actions,sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:1,warnings:[]}}
const social=turn('تمام ان شاء الله',[{id:'a',type:'acknowledge',topic:'acknowledgement',text:'تمام ان شاء الله',action:'none',value:null,confidence:1,source:'resolved'}],['acknowledgement']);
ok(fresh.pureSocialClosureTurn(social)===true,'pure acknowledgement closes socially instead of reopening previous review topic');
const material=turn('تمام وكم وقت بعدها لحتى اعرف الموافقه',[{id:'a',type:'acknowledge',topic:'acknowledgement',text:'تمام',action:'none',value:null,confidence:1,source:'resolved'},{id:'b',type:'ask',topic:'review_timing',text:'كم وقت',action:'none',value:null,confidence:1,source:'resolved'}],['acknowledgement','review_timing']);
ok(fresh.pureSocialClosureTurn(material)===false,'acknowledgement plus material question cannot be collapsed to social closure');
let contextual=fresh.enforceFreshTurnAuthority({turn:turn('او الرفض',[],['unknown']),state:{lastCustomerText:'وكم وقت بعدها لحتى اعرف الموافقه'}});
ok(contextual.topics.includes('review_timing'),'immediate contextual fragment "او الرفض" keeps the prior review-timing question');
const daily=load(b+'dailyConversationIntegrity.ts');
ok(daily.explicitExpediteRequestText('ف رجاءا تستعجلو بل طلب')===true,'production corpus: polite expedite request is detected');

const gate=load(b+'mutationConfirmationGate.ts');
const app={id:'app1',trackingId:'AM-1780935176273',status:'customer_confirmed_continue',paymentStatus:'pending'};
const truth={application:app,contactAccess:'safe_preview'};
const baseState={waId:'962781085605',activeApplicationId:'app1',activeTrackingId:'AM-1780935176273',pendingAction:'link_whatsapp_alias',pendingActionPayload:{_mutationConfirmationRequired:true,_mutationAction:'link_whatsapp_alias',_scopeApplicationId:'app1',_scopeTrackingId:'AM-1780935176273',_scopeWaId:'962781085605'},contactResolution:{status:'awaiting_alias_confirmation',trackingId:'AM-1780935176273',explanation:'alternate_number',updatedAt:new Date().toISOString()},lastAssistantText:'إذا هذا واتسابك وبدك أعتمده كرقم تابع لنفس الطلب، اكتب: نعم، اعتمد الرقم.'};
let g=gate.enforceMutationConfirmationGate({actions:[{action:'link_whatsapp_alias',sourceActId:'x',requiresConfirmation:true,authority:'deterministic',requiredRole:'tala',payload:{_autoContactAliasPrompt:true,_aliasWaId:'962781085605'}}],turn:turn('نعم'),state:baseState,truth});
ok(g.confirmedAction==='link_whatsapp_alias'&&g.actions.some(a=>a.action==='link_whatsapp_alias'&&!a.requiresConfirmation),'bare yes completes only the explicit alias open-loop on the same application');
const cancelState={...baseState,pendingAction:'cancel_application',pendingActionPayload:{_mutationConfirmationRequired:true,_mutationAction:'cancel_application',_scopeApplicationId:'app1',_scopeTrackingId:'AM-1780935176273',_scopeWaId:'962781085605'},contactResolution:null,lastAssistantText:'إذا قرارك نهائي اكتب: نعم، ألغي الطلب.'};
g=gate.enforceMutationConfirmationGate({actions:[{action:'cancel_application',sourceActId:'x',requiresConfirmation:true,authority:'deterministic',requiredRole:'omran',payload:{}}],turn:turn('نعم'),state:cancelState,truth});
ok(g.confirmedAction!== 'cancel_application','bare yes still cannot confirm cancellation');

for(const f of [b+'types.ts',b+'freshTurnAuthority.ts',b+'dailyConversationIntegrity.ts',b+'mutationConfirmationGate.ts',b+'responseArbiter.ts',b+'turnIntegrity.ts',b+'runtimeLive.ts',b+'writerContract.ts','app/api/whatsapp/webhook/route.ts']) transpile(f);
console.log(`\n7.7.2 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
