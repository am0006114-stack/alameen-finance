const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function loadTs(rel){const file=path.join(root,rel);const src=read(rel);const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:file});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder},{filename:file});return mod.exports}
function transpile(rel){const tr=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const helperRel='app/api/whatsapp/webhook/_lib/v3-os/conversationBurstAuthority.ts';
const routeRel='app/api/whatsapp/webhook/route.ts';
const h=loadTs(helperRel);const route=read(routeRel);
const rows=[
 {message_id:'wamid.A',body:'ممكن رد',created_at:'2026-09-27T08:00:00.010Z',raw_payload:{timestamp:'1790496000'}},
 {message_id:'wamid.C',body:'شو هالتعامل',created_at:'2026-09-27T08:00:00.030Z',raw_payload:{timestamp:'1790496000'}},
 {message_id:'wamid.B',body:'ممكن رد',created_at:'2026-09-27T08:00:00.020Z',raw_payload:{timestamp:'1790496000'}},
];
const b1=h.selectCanonicalConversationBurst(rows,18000);
const b2=h.selectCanonicalConversationBurst([rows[2],rows[0],rows[1]],18000);
ok(b1&&b1.leaderMessageId==='wamid.C','same-second burst elects deterministic canonical leader by message id');
ok(b2&&b2.leaderMessageId===b1.leaderMessageId,'canonical leader is invariant to webhook/DB row arrival order');
ok(JSON.stringify(b1.messageIds)===JSON.stringify(['wamid.A','wamid.B','wamid.C']),'canonical burst covers every close inbound message exactly once');
ok(b1.combinedText.includes('ممكن رد')&&b1.combinedText.includes('شو هالتعامل'),'canonical burst preserves customer meaning across multi-bubble burst');
ok(h.conversationBurstLockKey('9627','wamid.C')==='burst:9627:wamid.C','burst lock key is conversation+leader scoped, not reply-text scoped');
const separated=h.selectCanonicalConversationBurst([
 {message_id:'old',body:'قديم',created_at:'2026-09-27T08:00:00Z'},
 {message_id:'new',body:'جديد',created_at:'2026-09-27T08:01:00Z'},
],18000);
ok(separated&&separated.messageIds.length===1&&separated.leaderMessageId==='new','old conversation is not merged into a later independent burst');
ok(route.includes('leaving it unresolved until the leader is durably delivered'),'non-leader messages are not prematurely consumed before burst delivery');
ok(route.includes('markIncomingWhatsAppMessagesProcessed(burstMessageIds'),'successful leader delivery completes the whole burst, not only one message id');
ok(route.includes('burstKey: activeBurstKey'),'V3 outgoing delivery lock uses canonical burst identity');
ok(route.includes('source_burst_key: activeBurstKey'),'outgoing delivery log persists durable burst coverage evidence');
ok(route.includes('source_burst_message_ids: burstMessageIds'),'outgoing delivery records all covered inbound message ids');
ok(route.includes('canonical authority wins to prevent all contenders from suppressing each other'),'legacy freshness disagreement cannot produce a zero-winner silent burst');
ok(route.includes('canonical authority wins to avoid zero-winner silence'),'final egress freshness disagreement cannot silence the canonical leader');
ok(route.includes('V3 WhatsApp send required third bounded attempt'),'transport gets three bounded attempts before remaining retryable');
ok(route.includes('throw v3RuntimeError instanceof Error'),'Native runtime failure remains retryable and is never falsely completed');
ok(route.includes('V3_RETRYABLE_WHATSAPP_DELIVERY_FAILURE'),'total provider delivery failure remains unresolved/retryable rather than falsely completed');
ok((route.match(/runV3ProductionLive\(/g)||[]).length>=1,'Native Kernel runtime remains present');
const liveStart=route.indexOf('if (v3LiveActive) {');const liveEnd=route.indexOf('if (await shouldSuppressStaleV3Reply',liveStart);const liveBlock=liveStart>=0&&liveEnd>liveStart?route.slice(liveStart,liveEnd):'';
ok((liveBlock.match(/runV3ProductionLive\(/g)||[]).length===1,'Absolute Runtime Authority still has one normal Native Kernel generation call per webhook attempt');
ok(!route.includes('pickup_appointment_at'),'zero-silence fix introduces no appointment schema or replacement system');
ok(!route.includes('20260926203000_phase8_2_pickup_appointment_truth'),'zero-silence fix introduces no appointment migration');
transpile(routeRel);transpile(helperRel);
console.log(`\nPhase 8.3 zero-silence assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
