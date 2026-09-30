const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const tr=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}

const rel={
 human:'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts',
 interpreter:'app/api/whatsapp/webhook/_lib/v3-os/interpreter.ts',
 ingress:'app/api/whatsapp/webhook/_lib/v3-os/durableIngress.ts',
 receipt:'app/api/whatsapp/webhook/_lib/v3-os/manualMutationReceipt.ts',
};
for(const [name,file] of Object.entries(rel))ok(fs.existsSync(path.join(root,file)),`${name} source exists`);
const human=read(rel.human),interpreter=read(rel.interpreter),ingress=read(rel.ingress),receipt=read(rel.receipt);
const i=loadTs(path.join(root,rel.interpreter));

// Production evidence RC-06: transport-generated media notices must never be read as customer delivery questions.
ok(i.syntheticMediaNoticeKind('تم استلام صورة من العميل بدون تعليق.')==='image','textless image transport notice is recognized structurally');
ok(i.syntheticMediaNoticeKind('تم استلام رسالة صوتية من العميل. لا يوجد تفريغ نصي تلقائي للصوت حاليًا، لذلك يُفضّل طلب توضيح نصي إذا لم يكن السياق كافيًا.')==='voice','voice transport notice is recognized structurally');
ok(i.syntheticMediaNoticeKind('تم استلام فيديو من العميل بدون تعليق.')==='video','video transport notice is recognized structurally');
ok(i.syntheticMediaNoticeKind('تم استلام ملف من العميل.\nاسم الملف: id.pdf')==='document','document transport notice is recognized structurally');
ok(i.syntheticMediaNoticeKind('تم استلام ملصق من العميل: 👍')==='sticker','sticker transport notice is recognized structurally');
ok(i.syntheticMediaSemanticText('تم استلام صورة من العميل بدون تعليق.')==='','textless image has no invented semantic customer text');
ok(i.syntheticMediaSemanticText('صورة مرفقة مع تعليق: وين استلم الجهاز')==='وين استلم الجهاز','image caption is separated from transport envelope');
ok(i.syntheticMediaSemanticText('تم استلام فيديو من العميل مع تعليق: كم وقت المراجعة')==='كم وقت المراجعة','video caption is separated from transport envelope');
ok(i.syntheticMediaSemanticText('تم استلام ملف من العميل.\nتعليق الملف: بدي اعرف مدة الدراسة')==='بدي اعرف مدة الدراسة','document caption is separated from transport envelope');
const image=i.interpretTurn({turnId:'m1',customerText:'تم استلام صورة من العميل بدون تعليق.'});
ok(!image.topics.includes('delivery'),'textless image no longer becomes delivery');
ok(image.topics.includes('unknown'),'textless image remains a neutral acknowledgement turn');
const voice=i.interpretTurn({turnId:'m2',customerText:'تم استلام رسالة صوتية من العميل. لا يوجد تفريغ نصي تلقائي للصوت حاليًا، لذلك يُفضّل طلب توضيح نصي إذا لم يكن السياق كافيًا.'});
ok(!voice.topics.includes('delivery'),'voice notice no longer becomes delivery because it contains the word استلام');
const captionPickup=i.interpretTurn({turnId:'m3',customerText:'صورة مرفقة مع تعليق: وين استلم الجهاز'});
ok(captionPickup.topics.includes('delivery'),'real customer meaning inside a media caption is still interpreted');
const captionPayment=i.interpretTurn({turnId:'m4',customerText:'صورة مرفقة مع تعليق: بدفع بس استلم التلفون'});
ok(captionPayment.topics.includes('payment_timing'),'payment-vs-receipt meaning inside caption maps to payment timing');
ok(!captionPayment.topics.includes('delivery'),'payment-vs-receipt caption does not collapse to delivery');

// Production evidence RC-07: explicit current-question concepts should answer directly instead of generic fallback.
const review=i.interpretTurn({turnId:'q1',customerText:'وقت المراجعة'});
ok(review.topics.includes('review_timing'),'elliptical وقت المراجعة is a direct review-timing question');
const study=i.interpretTurn({turnId:'q2',customerText:'مدة الدراسة'});
ok(study.topics.includes('review_timing'),'elliptical مدة الدراسة is a direct review-timing question');
const decision=i.interpretTurn({turnId:'q3',customerText:'متى النتيجة'});
ok(decision.topics.includes('review_timing'),'decision-result timing concept is handled structurally');
const unrelated=i.interpretTurn({turnId:'q4',customerText:'رقم الطلب'});
ok(!unrelated.topics.includes('review_timing'),'unrelated short noun phrase is not forced into review timing');

// Human OS must acknowledge textless media directly and skip an unnecessary model call.
ok(/function syntheticMediaGroundedReply/.test(human),'Human OS has deterministic media acknowledgement authority');
ok(/kind === "voice"[\s\S]*ما عندي تفريغ نصي/.test(human),'voice reply truthfully states no transcription is available');
ok(/kind === "image"[\s\S]*ما بقدر أحدد المطلوب منها لحالها/.test(human),'textless image asks for the actual customer goal instead of inventing delivery');
ok(/authoritativeSyntheticMediaReply\) \? "deterministic"/.test(human),'textless media bypasses paid conversational interpretation');
ok(/authoritativeTrackingReply \|\| authoritativeIdentityReply \|\| authoritativeSyntheticMediaReply/.test(human),'media acknowledgement has explicit final reply priority');
ok((human.match(/authoritativeSyntheticMediaReply \|\| authoritativeDeviceChangeReply/g)||[]).length>=2,'media reply remains authoritative through both safety passes');

// Production evidence RC-08: a durable mutation receipt closes the confirmation loop.
ok(/function reconcilePendingMutationWithAuthoritativeTruth/.test(human),'pending mutation state reconciles against authoritative application truth');
ok(/state\.pendingAction === "request_refund"[\s\S]*refund_requested[\s\S]*refund_completed/.test(human),'already-open/completed refund truth clears stale refund confirmation');
ok(/state\.pendingAction === "cancel_application"[\s\S]*cancelled[\s\S]*refund_requested[\s\S]*refund_completed/.test(human),'cancelled/refund truth clears stale cancellation confirmation');
ok(/stateWorking = reconcilePendingMutationWithAuthoritativeTruth\(stateWorking, truthBeforeActions\)/.test(human),'truth reconciliation happens before pending confirmation interpretation');
ok(/function closePendingMutationAfterReceipt/.test(human),'successful action receipt has a dedicated pending-loop closer');
ok(/\["executed", "already_done"\]\.includes\(result\.outcome\)/.test(human),'executed/already-done mutation receipts close pending state');
ok(/\["awaiting_admin", "already_pending"\]\.includes\(input\.manualReceipt\.status\)/.test(human),'durably recorded manual mutation receipt closes its confirmation loop');
const closeIndex=human.indexOf('reduced = closePendingMutationAfterReceipt');
const truthAfterIndex=human.indexOf('let truthAfterActions = truthBeforeActions');
ok(closeIndex>=0&&truthAfterIndex>closeIndex,'pending loop closes immediately after action/receipt and before reply truth refresh');

// Preserve prior architectural fixes and critical truth boundaries.
ok(/durableIngressTurnFreshness/.test(human)&&/newer_durable_inbound/.test(ingress),'Phase 11.5 ingress-aware freshness remains intact');
ok(/currentTurnStillOwnsConversation/.test(human),'Phase 11.4 turn ownership remains intact');
ok(/const paymentConfirmed = hasAuthoritativePaymentConfirmation\(app\)/.test(human),'Phase 11.2 paid-only device-change authority remains intact');
ok(/manual application-data change request durably recorded; customer data not mutated/.test(human),'manual mutation receipt still distinguishes receipt from execution');
ok(/التعديل نفسه لم يُنفذ بعد/.test(receipt),'manual mutation customer truth remains execution-safe');
ok(!/orangmoney\.com/i.test(human+interpreter+receipt),'cross-project literals do not enter Phase 11.6');

for(const file of [rel.human,rel.interpreter])transpile(file);
console.log(`\nV3 PHASE 11.6 SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed)process.exit(1);
console.log('Media semantic routing + mutation receipt closure + explicit current-question authority: PASS');
