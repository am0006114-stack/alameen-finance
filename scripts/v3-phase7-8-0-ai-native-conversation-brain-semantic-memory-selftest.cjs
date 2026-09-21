const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
let ts; try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cache=new Map();
function load(rel){let file=path.isAbsolute(rel)?rel:path.join(root,rel);if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';}
 if(cache.has(file))return cache.get(file).exports;const src=fs.readFileSync(file,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(file,mod);function req(id){if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';return load(p)} if(id==='@/lib/supabaseAdmin') return {supabaseAdmin:{}}; throw new Error(`unexpected external require ${id}`)}vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder},{filename:file});return mod.exports}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
function normHash(rel){let b=fs.readFileSync(path.join(root,rel));let a=[];for(let i=0;i<b.length;i++){if(b[i]===13){if(i+1<b.length&&b[i+1]===10)i++;a.push(10)}else a.push(b[i])}return crypto.createHash('sha256').update(Buffer.from(a)).digest('hex')}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const types=read(b+'types.ts'), writer=read(b+'writerContract.ts'), model=read(b+'modelInterpreter.ts'), runtime=read(b+'runtimeLive.ts'), ti=read(b+'turnIntegrity.ts'), verifier=read(b+'verifier.ts'), route=read('app/api/whatsapp/webhook/route.ts');
ok(types.includes('v3.0.0-phase7.8.0-ai-native-conversation-brain-semantic-memory'),'runtime version identifies 7.8.0');
ok(types.includes('v3.0.0-phase7.7.2-fresh-turn-open-loop-egress-integrity'),'7.7.2 compatibility anchor preserved');
ok(types.includes('SemanticTurnFrame')&&types.includes('SemanticMemoryState'),'semantic frame and persistent memory are first-class V3 state types');
ok(model.includes('منطقة العمل الأردن')&&model.includes('محفظة سويس'),'interpreter is explicitly Jordan-aware and unknown-entity-role aware');
ok(model.includes('semantic.currentQuestion')&&model.includes('answerObligations'),'interpreter emits current-question answer obligations');
ok(writer.includes('PHASE 7.8.0 AI-NATIVE CONVERSATION BRAIN')&&writer.includes('AI_NATIVE_SEMANTIC_MEMORY'),'writer consumes semantic frame and semantic memory');
ok(writer.includes('ذاكرة محادثة **وليست مصدر حقيقة تشغيلية**')&&writer.includes('assistantAnswer قديم'),'semantic memory improves continuity without becoming operational truth');
ok(writer.includes('ممنوع ادعاء «رح أراجع مع الإدارة'),'writer blocks unsupported future admin-review promises');
ok(runtime.includes('semanticWriterPreferred')&&runtime.includes('AI-NATIVE SEMANTIC ANSWER GATE'),'runtime prefers AI-native semantic writer and verifies semantic coverage');
ok(runtime.includes('FINAL SEMANTIC EGRESS VETO')&&runtime.includes('ai_native_final_semantic_egress_rescue'),'actual final egress is semantically re-verified after downstream arbiters');
ok(runtime.includes('semanticContinueVeto')&&runtime.includes('semanticConfirmsContinuation'),'continuation decision is governed by semantic authority');
ok(ti.includes('Math.max(1800')&&ti.includes('220'),'final egress requires a materially wider quiet window plus edge recheck');
ok(route.includes('quietMs: 450'),'7.7.2 route-call compatibility anchor preserved while turnIntegrity enforces stronger minimum');
ok(verifier.includes('unsupported_future_admin_followup_claim'),'deterministic verifier blocks invented future admin follow-up');
ok(normHash(b+'paymentDestinationOverride.ts')==='6f915ad10d4565ee09e8e73f3f1cf8a6054147d471a0484d8c2fec63f6ea1335','payment destination source remains exactly preserved');
ok(normHash('app/api/whatsapp/webhook/route.ts')==='bd1ebf07bf79ebe03246590e047fe78d5dff1bfa515158c80599c2408ec625b0','7.7.2 route/burst transaction layer remains exactly preserved');
ok(normHash(b+'transactionalActionAdapter.ts')==='b9b65f7965f2683de86f61ed70e6e2975ddf36f43f10769772131e27b8509dce','Real Actions transactional adapter scope remains exactly preserved');

const authority=load(b+'semanticAuthority.ts');
function semTurn(decision='unknown'){return {turnId:'t1',rawText:'بس يطلع القرار انو بزبط او لا بستمر',normalizedText:'',acts:[{id:'a',type:'request_action',topic:'continuation',text:'x',action:'continue_application',value:null,confidence:.9,source:'deterministic'}],topics:['continuation'],requestedActions:['continue_application'],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.9,warnings:[],semantic:{meaningSummary:'العميل يؤجل قرار الاستمرار',customerGoal:'انتظار قرار',currentQuestion:null,answerObligations:[],references:[],entities:[],decision:{continuation:decision,cancellation:'unknown',refund:'unknown',aliasConfirmation:'unknown',condition:'نتيجة مراجعة الإدارة'},correctionOfPrevious:false,socialClosure:false,requiresExternalFact:false,externalFactNeeded:null,answerMode:'direct',confidence:.95,warnings:[]}}}
let deferred=authority.enforceSemanticDecisionAuthority(semTurn('deferred'));
ok(!deferred.requestedActions.includes('continue_application')&&!deferred.acts.some(a=>a.action==='continue_application'),'deferred continuation cannot survive as continue action');
ok(authority.semanticContinuationVeto(semTurn('conditional'))===true,'conditional continuation is a hard current-turn veto');
ok(authority.semanticConfirmsContinuation(semTurn('confirmed'))===true,'explicit semantic continuation can positively authorize the commercial decision');

const memory=load(b+'semanticMemory.ts');
const empty={waId:'9627',semanticMemory:memory.emptySemanticMemory()};
const walletTurn={...semTurn('unknown'),turnId:'wallet1',rawText:'انا عندي محفظة سويس بزبط ابعت منها صح',semantic:{meaningSummary:'يسأل هل يستطيع دفع رسوم الملف من محفظة سويس',customerGoal:'دفع رسوم فتح الملف',currentQuestion:'هل أستطيع تحويل رسوم فتح الملف من محفظة سويس؟',answerObligations:['أجب عن مصدر التحويل','لا تخترع توافق المحفظة'],references:[{surface:'منها',refersTo:'محفظة سويس',confidence:.98}],entities:[{surface:'محفظة سويس',kind:'wallet_or_payment_app',role:'source_payment_instrument',knownFactStatus:'unknown',countryHint:'unknown',confidence:.96}],decision:{continuation:'unknown',cancellation:'unknown',refund:'unknown',aliasConfirmation:'unknown',condition:null},correctionOfPrevious:true,socialClosure:false,requiresExternalFact:true,externalFactNeeded:'توافق محفظة سويس مع Orange Money/CliQ',answerMode:'grounded_reasoning',confidence:.96,warnings:[]}};
let mem=memory.updateSemanticMemoryFromTurn({state:empty,turn:walletTurn});
ok(mem.activeQuestion&&mem.activeQuestion.includes('محفظة سويس'),'semantic memory persists the active human question');
ok(mem.entries.some(e=>e.kind==='entity'&&e.value.includes('محفظة سويس')),'semantic memory persists unknown entities without renaming them');
ok(mem.entries.some(e=>e.kind==='reference'&&e.value.includes('محفظة سويس')),'semantic memory persists pronoun/reference resolution');
const finalized=memory.finalizeSemanticMemoryAfterReply({state:{...empty,semanticMemory:mem},turn:walletTurn,reply:'جواب',answered:true});
ok(finalized.activeQuestion===null&&finalized.episodes.some(e=>e.assistantAnswer==='جواب'),'answered semantic question closes while episodic answer memory is retained');
ok(finalized.episodes.length<=24&&finalized.entries.length<=80,'semantic memory is bounded for durable long-running conversations');

const rescue=load(b+'semanticRescue.ts');
const truth={application:{id:'a',trackingId:'AM-1',status:'customer_confirmed_continue',paymentStatus:'pending',paymentConfirmedAt:null},policy:{fileOpeningFeeJod:5}};
let rr=rescue.buildSemanticFailClosedReply({turn:walletTurn,truth});
ok(rr&&rr.includes('محفظة سويس')&&rr.includes('0788500337')&&rr.includes('PAYAMEEEN')&&!rr.includes('كشف راتب'),'unknown wallet rescue answers payment-source meaning without converting it to income evidence');
const installmentTurn={...walletTurn,semantic:{...walletTurn.semantic,entities:[],currentQuestion:'كل شهر كيف أسدد القسط؟ اقتطاع بنك ولا تحويل؟',answerObligations:['اشرح قناة سداد القسط الشهري'],correctionOfPrevious:false}};
rr=rescue.buildSemanticFailClosedReply({turn:installmentTurn,truth:{...truth,application:{...truth.application,status:'under_review'}}});
ok(rr&&rr.includes('القسط الشهري')&&!rr.includes('5 دنانير')&&!rr.includes('0788500337'),'monthly-installment-channel rescue cannot leak file-fee payment instructions');

const interp=load(b+'modelInterpreter.ts');
const provider={generate:async()=>JSON.stringify({acts:[{type:'ask',topic:'payment_method',action:'none',value:'source_wallet_interoperability',confidence:.92}],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,warnings:[],semantic:walletTurn.semantic})};
(async()=>{
 const state={waId:'9627',currentTopic:'payment_method',pendingAction:null,role:{currentRole:'tala',tier:'frontline',reason:'x',sinceTurnId:null,introduced:false},openLoops:[],facts:[],lastCustomerText:null,lastAssistantText:'هاي خيارات الدفع',semanticMemory:memory.emptySemanticMemory()};
 const parsed=await interp.interpretTurnWithAi({turnId:'it1',customerText:'انا عندي محفظة سويس بزبط ابعت منها صح',state,recentTurns:[],provider});
 ok(parsed.turn.semantic&&parsed.turn.semantic.currentQuestion.includes('محفظة سويس'),'model interpreter parses semantic currentQuestion from structured AI output');
 ok(parsed.turn.semantic&&parsed.turn.semantic.entities[0].kind==='wallet_or_payment_app','model interpreter preserves unknown wallet entity role');

 for(const f of [b+'types.ts',b+'semanticMemory.ts',b+'semanticAuthority.ts',b+'semanticReplyVerifier.ts',b+'semanticRescue.ts',b+'modelInterpreter.ts',b+'state.ts',b+'stateStore.ts',b+'linkIntegrity.ts',b+'writerContract.ts',b+'verifier.ts',b+'turnIntegrity.ts',b+'runtimeLive.ts']) transpile(f);
 console.log(`\n7.8.0 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
