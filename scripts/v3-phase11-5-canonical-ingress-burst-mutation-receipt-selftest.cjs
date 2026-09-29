const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd(); let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const tr=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const tsCache=new Map();
function loadLocalTs(abs){abs=path.resolve(abs);if(tsCache.has(abs))return tsCache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};tsCache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadLocalTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}

const rel={
 worker:'app/api/internal/whatsapp-live-ingress/worker/route.ts',
 route:'app/api/whatsapp/webhook/route.ts',
 burst:'app/api/whatsapp/webhook/_lib/v3-os/conversationBurstAuthority.ts',
 ingress:'app/api/whatsapp/webhook/_lib/v3-os/durableIngress.ts',
 human:'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts',
 interpreter:'app/api/whatsapp/webhook/_lib/v3-os/interpreter.ts',
 receipt:'app/api/whatsapp/webhook/_lib/v3-os/manualMutationReceipt.ts',
 migration:'supabase/migrations/20260810123000_application_transition_integrity_layer.sql',
};
for(const [name,file] of Object.entries(rel)) ok(fs.existsSync(path.join(root,file)),`${name} source exists`);
const worker=read(rel.worker),route=read(rel.route),burst=read(rel.burst),ingress=read(rel.ingress),human=read(rel.human),interpreter=read(rel.interpreter),receipt=read(rel.receipt),migration=read(rel.migration);

// RC-01: canonical burst authority includes durable queued/processing ingress, not only processed whatsapp_messages.
ok(/from\("whatsapp_messages"\)[\s\S]*from\("whatsapp_live_ingress_jobs"\)/.test(route),'canonical burst reads processed history plus durable ingress queue');
ok(/\.in\("status", \["queued", "processing", "retry_wait"\]\)/.test(route),'canonical burst sees queued/processing/retry_wait durable turns');
ok(/pendingIngressMessageIds/.test(route),'canonical burst records which leader is still pending in ingress');
ok(/leaderPendingInIngress/.test(route),'burst result exposes pending durable leader authority');
ok(/durableWorkerRequest && burst\.leaderPendingInIngress[\s\S]*markIncomingWhatsAppMessageProcessed\(message\.id\)/.test(route),'old durable-worker job yields immediately to already-durable newer leader');
ok(/const verifiedDurableWorkerRequests = new WeakSet<Request>\(\)/.test(route) && /verifyDurableIngressWorkerToken\(workerToken\)[\s\S]*verifiedDurableWorkerRequests\.add\(request\)/.test(route),'durable-worker yield privilege is bound to an authenticated request, not a spoofable header');
ok(/yieldToDurableIngress\?: boolean/.test(route),'superseded-settle path has explicit durable-worker yield mode');
ok(/input\.yieldToDurableIngress && leaderPendingInIngress[\s\S]*markIncomingWhatsAppMessageProcessed\(currentMessageId\)/.test(route),'pre-send supersession can safely yield without deadlocking on newer queued leader');
ok((route.match(/yieldToDurableIngress: durableWorkerRequest/g)||[]).length>=2,'both pre-lock and final-egress supersession checks use durable-worker yield authority');
ok(/const immediate = await readCanonicalIncomingBurst/.test(route) && /if \(immediateResult && !immediateResult\.shouldReply\) return immediateResult/.test(route),'older turn checks durable leader before quiet-window wait');
ok(/const waitMs = input\.waitMs \?\? 1200/.test(route),'leader quiet window is bounded and reduced from legacy 3.5s');
ok(route.includes('if (currentText && /^[.،,!?؟…ـ\\-\\s]+$/.test(currentText))'),'punctuation-only turn bypasses burst leader stealing');

// Worker drain: preserve one-row-per-wa_id SQL claim while draining same-customer backlog in one invocation.
ok(/const maxClaimPasses = 8/.test(worker),'worker has bounded multi-pass drain');
ok(/const maxJobsPerInvocation = 24/.test(worker),'worker has bounded total job budget');
ok(/while \(claimPasses < maxClaimPasses && results\.length < maxJobsPerInvocation\)/.test(worker),'worker repeats durable claim waves');
ok((worker.match(/claim_whatsapp_live_ingress_jobs/g)||[]).length>=1,'worker still uses existing SQL lease RPC');
ok(/Promise\.all\(jobs\.map/.test(worker),'different conversations may remain parallel inside each claim wave');
ok(!/setInterval|setTimeout\([^)]*60_000/.test(worker),'worker drain does not wait for one-minute cron between same-customer jobs');

// RC-02: Human OS freshness checks upstream durable queue before action and before final egress.
ok(/export async function durableIngressTurnFreshness/.test(ingress),'durable ingress freshness resolver exists');
ok(/whatsapp_live_ingress_jobs/.test(ingress) && /newer_durable_inbound/.test(ingress),'freshness authority is based on pending durable ingress jobs');
ok(/conversationBurstAuthorityEligible/.test(ingress),'reaction/punctuation noise cannot supersede substantive turn freshness');
ok(/const ingressFreshness = await durableIngressTurnFreshness/.test(human),'Human OS ownership combines durable ingress freshness');
ok(/stateOwnershipLost \|\| !ingressFreshness\.fresh/.test(human),'upstream newer inbound can revoke current Human OS ownership');
const preAction=human.indexOf('const ownershipBeforeActions = await currentTurnStillOwnsConversation');const execute=human.indexOf('const actions = await executeActions');
ok(preAction>=0&&execute>preAction,'ownership is rechecked before action execution');
const preEgress=human.indexOf('const ownershipBeforeEgress = await currentTurnStillOwnsConversation');const finalize=human.indexOf('finalizeStateSemanticMemory',preEgress);
ok(preEgress>=0&&finalize>preEgress,'ownership is rechecked again before final reply/state commit');

// Burst helper behavior: durable receive time resolves same-second ordering; noise cannot own a burst.
const h=loadLocalTs(path.join(root,rel.burst));
const sameSecond=[
 {message_id:'wamid.Z',body:'اول',created_at:'2026-09-30T00:00:00.100Z',authority_received_at:'2026-09-30T00:00:00.100Z',raw_payload:{timestamp:'1790726400'}},
 {message_id:'wamid.A',body:'ثاني',created_at:'2026-09-30T00:00:00.300Z',authority_received_at:'2026-09-30T00:00:00.300Z',raw_payload:{timestamp:'1790726400'}},
];
const b=h.selectCanonicalConversationBurst(sameSecond,18000);
ok(b&&b.leaderMessageId==='wamid.A','same-second canonical leader follows durable receipt order before message-id tie breaker');
ok(b&&b.combinedText==='اول\nثاني','canonical burst preserves multi-bubble customer meaning in durable order');
ok(h.conversationBurstAuthorityEligible({message_id:'r',body:'',message_type:'reaction',raw_payload:{type:'reaction'}})===false,'reaction cannot steal conversation ownership');
ok(h.conversationBurstAuthorityEligible({message_id:'dot',body:'...',message_type:'text'})===false,'punctuation-only bubble cannot steal conversation ownership');
ok(h.conversationBurstAuthorityEligible({message_id:'q',body:'بدي جهازين',message_type:'text'})===true,'substantive customer bubble remains eligible for ownership');

// RC-04: payment relative to receipt is an explicit semantic relation, not generic delivery.
const i=loadLocalTs(path.join(root,rel.interpreter));
const paymentOnReceipt=i.interpretTurn({turnId:'p1',customerText:'بدفع بس استلم التلفون'});
ok(paymentOnReceipt.topics.includes('payment_timing'),'historical payment-on-receipt failure maps to payment_timing');
ok(!paymentOnReceipt.topics.includes('delivery'),'payment-on-receipt statement no longer collapses to delivery mechanics');
const pickup=i.interpretTurn({turnId:'p2',customerText:'وين استلم الجهاز'});
ok(pickup.topics.includes('delivery'),'real pickup question remains delivery');
const both=i.interpretTurn({turnId:'p3',customerText:'متى استلم بعد ما ادفع'});
ok(both.topics.includes('delivery')&&both.topics.includes('payment_timing'),'genuine two-obligation question preserves both delivery and payment timing');
ok(/enforcePaymentReceiptSemantics\(turn, input\.customerText\)/.test(human),'post-model Human OS reapplies payment/receipt semantic guard');
ok(/paymentRelativeReceiptGroundedReply/.test(human) && /مش دفعة عند استلام الجهاز/.test(human),'payment-relative reply answers fee timing without delivery fallback');

// RC-03: runtime degradation remains contextual instead of generic request erasure.
ok(/interpretTurn as interpretV3Turn/.test(route),'route imports deterministic turn interpreter for contextual rescue');
ok(/resolveV3ProductionTruth/.test(route),'route resolves authoritative truth for contextual rescue');
ok(/buildV3LastResortReply\(\{[\s\S]*truth: rescueTruth[\s\S]*state: prior[\s\S]*customerText: replyInputText[\s\S]*turn: rescueTurn/.test(route),'runtime failure feeds truth/state/current turn into last-resort writer');

// RC-05: manual application-data changes get a durable operational receipt; they are not customer-state mutations.
ok(/application_action_requests/.test(receipt),'manual mutation receipt uses existing action-request table');
ok(/source: "whatsapp_v3_human_os"/.test(receipt),'manual mutation receipt has auditable Human OS source');
ok(/status: "pending"/.test(receipt),'manual mutation receipt is explicitly pending');
ok(/23505/.test(receipt) && /already_pending/.test(receipt),'duplicate manual request reuses existing pending authority');
ok(!/update\([\s\S]*applications|from\("applications"\)[\s\S]*\.update/.test(receipt),'manual receipt module never mutates application truth');
ok(/contactAccess !== "full"/.test(receipt),'manual mutation receipt requires full contact binding');
ok(/change_application_data/.test(human) && /_manualMutationConfirmationRequired/.test(human),'model-inferred application-data change can persist a scoped confirmation open-loop');
ok(/contextualAcknowledgement/.test(human) && /previousAskedForChangeConfirmation/.test(human),'short confirmation is accepted only inside the scoped manual-change prompt');
ok(/confirmedPendingMutation === "change_application_data"[\s\S]*pendingAction: null/.test(human),'confirmed manual change clears its pending open-loop');
ok(/recordManualMutationReceipt/.test(human),'confirmed/direct manual application-data request is durably recorded');
const preManualReceipt=human.indexOf('const ownershipBeforeManualReceipt = await currentTurnStillOwnsConversation');
const recordManualReceipt=human.indexOf('manualMutationReceipt = await recordManualMutationReceipt');
ok(preManualReceipt>=0&&recordManualReceipt>preManualReceipt,'ownership is rechecked at the exact durable manual-receipt boundary');
ok(/ownership_lost_before_manual_receipt/.test(human),'manual receipt side effect has a dedicated supersession reason');
ok(/event: "manual_action_required"/.test(human),'durable manual receipt emits actionable Discord notification');
ok(/التعديل نفسه لم يُنفذ بعد/.test(receipt),'customer reply explicitly distinguishes request receipt from executed mutation');
ok(/ما قدرت أسجل طلب التنفيذ الآن/.test(receipt),'failed receipt never claims the manual change started');
ok(/create table if not exists public\.application_action_requests/.test(migration),'existing migration proves receipt table predates Phase 11.5');

// Phase 11.2 and 11.4 critical invariants remain intact.
ok(/const paymentConfirmed = hasAuthoritativePaymentConfirmation\(app\)/.test(human),'paid-only secure device-change authority remains intact');
ok(/const secureDeviceLink = paymentConfirmed[\s\S]*buildSecureDeviceChangeUrl[\s\S]*: null/.test(human),'secure device link remains impossible without authoritative payment');
ok(/human_os_superseded_by_newer_turn/.test(human),'Phase 11.4 superseded-turn journal behavior remains intact');
ok(/currentTurnShouldIgnorePendingAction/.test(human),'Phase 11.4 pending-action focus guard remains intact');
ok(!/orangmoney\.com/i.test(human+receipt+route),'cross-project literals do not enter Phase 11.5');

for(const file of [rel.worker,rel.route,rel.burst,rel.ingress,rel.human,rel.interpreter,rel.receipt]) transpile(file);
console.log(`\nV3 PHASE 11.5 SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed)process.exit(1);
console.log('Canonical ingress burst ownership + ingress-aware freshness + contextual rescue + payment/receipt semantics + manual mutation receipt: PASS');
