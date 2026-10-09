const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(process.cwd(),'node_modules','typescript'))}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}
const bridge=loadTs(path.join(root,'app/api/whatsapp/webhook/_lib/v4-os/stateMemoryBridge.ts'));
const V4=loadTs(path.join(root,'app/api/whatsapp/webhook/_lib/v4-os/types.ts'));
const state={
  version:'v3-test',waId:'962790000000',activeApplicationId:'app-1',activeTrackingId:'AM-1',currentTopic:'complaint',currentGoal:'approval_timing',
  role:{currentRole:'omran',tier:'supervisor',reason:'test',sinceTurnId:'t-old',introduced:true},openLoops:[],facts:[],pendingAction:'request_refund',pendingActionPayload:{_scopeApplicationId:'app-1',_scopeTrackingId:'AM-1',_scopeWaId:'962790000000'},
  lastTurnId:'t3',lastCustomerText:'بلا هالحكي',lastAssistantText:'طلبك قيد الدراسة النهائية.',consecutiveRiskTurns:2,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,
  conversationConstraints:{noLinks:false,whatsappOnly:false,avoidRepetition:true,sourceTurnId:'t3',updatedAt:new Date().toISOString()},
  humanRelationship:{lastEmotion:'frustrated',lastConcern:'delay',frustrationStreak:4,delayTurnCount:3,warmTurnCount:0,lastGreetingTurnId:null,updatedAt:new Date().toISOString()},
  semanticMemory:{revision:3,activeGoal:'approval_timing',activeQuestion:'متى بعرف اذا انقبلت؟',activeQuestionTurnId:'t3',lastMeaningSummary:'يسأل عن القرار',continuationDecision:'unknown',continuationCondition:null,entries:[{key:'continuation',value:'confirmed',kind:'decision',confidence:1,sourceTurnId:'t1',updatedAt:new Date().toISOString()}],episodes:[{turnId:'t2',customerMeaning:'يسأل عن مدة المراجعة',currentQuestion:'متى القرار؟',customerGoal:'review_timing',continuationDecision:'unknown',assistantAnswer:'المراجعة قيد العمل.',createdAt:new Date().toISOString()}],updatedAt:new Date().toISOString()},
  commercialDisclosure:null,updatedAt:new Date().toISOString()
};
const memory=bridge.loadV4MemoryFromConversationState(state);
ok(memory.version===V4.V4_OS_VERSION,'migration produces V4 memory version');
ok(memory.persona==='omran','existing named persona continuity is preserved');
ok(memory.activeGoal==='approval_timing','active conversational goal migrates');
ok(memory.openQuestions.length===1&&memory.openQuestions[0].active,'active unanswered question migrates');
ok(memory.lastAssistantFingerprint,'last answer fingerprint is reconstructed for repetition firewall');
ok(memory.frustrationStreak===4&&memory.repetitionSensitivity>=4,'frustration and anti-repetition posture migrate');
ok(memory.customerDecisions.some(x=>x.key==='continuation'),'safe semantic decisions migrate');
ok(memory.episodes.length===1&&memory.episodes[0].goal==='review_timing','recent semantic episodes migrate');
ok(memory.pendingProcedure===null,'destructive V3 pending mutation is never inherited into V4');
const attached=bridge.attachV4MemoryToConversationState(state,memory);
ok(attached.v4ConversationMemory&&attached.v4ConversationMemory.version===V4.V4_OS_VERSION,'V4 memory embeds in existing JSON conversation state without SQL migration');
const loadedAgain=bridge.loadV4MemoryFromConversationState(attached);
ok(loadedAgain.activeGoal===memory.activeGoal&&loadedAgain.persona===memory.persona,'embedded V4 memory round-trips cleanly');
console.log(`\nV4 STATE MEMORY BRIDGE SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed)process.exit(1);
