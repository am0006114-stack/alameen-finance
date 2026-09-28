const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(process.argv[2] || process.cwd());
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const hash = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel)).toString('utf8').replace(/\r\n?/g,'\n')).digest('hex');
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`PASS: ${name}`); }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const route = read('app/api/whatsapp/webhook/route.ts');
const runtime = read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const adapter = read('app/api/whatsapp/webhook/_lib/v3-os/transactionalActionAdapter.ts');
const discord = read('app/api/whatsapp/webhook/_lib/v3-os/discordNotifier.ts');
const recovery = read('app/api/admin/whatsapp-control/recover/route.ts');
const page = read('app/admin/whatsapp-control/page.tsx');
const actions = read('app/admin/whatsapp-control/ControlActions.tsx');
const control = read('app/api/admin/whatsapp-control/route.ts');
const opsRel = 'app/api/whatsapp/webhook/_lib/v3-os/operationsAutopilot.ts';
const opsSource = read(opsRel);

check('8.5 runtime version marker present', control.includes('phase8.5-never-silent-revenue-priority-ops-autopilot'));
check('revenue priority detects post-disclosure payment turn', runtime.includes('paymentPriorityAfterDisclosure'));
check('revenue priority uses durable disclosure evidence plus recent dialogue evidence', runtime.includes('commercialDisclosureDelivered(boundState, truthBeforeActions) || recentCommercialDisclosureEvidence'));
check('payment-ready turn bypasses provider draft latency', runtime.includes('buildMandatoryFiveJodContinuationReply(turn, truthBeforeActions)'));
check('payment-ready turn becomes continuation authority', (runtime.match(/paymentPriorityAfterDisclosure/g) || []).length >= 5);
check('provider refresh cannot overwrite direct payment-priority reply', runtime.includes('actionOrTruthChangedAfterInitialDraft && !paymentPriorityAfterDisclosure'));
check('runtime contains NEVER-SILENT fail-open policy', runtime.includes('PHASE 8.5 NEVER-SILENT EGRESS'));
check('runtime no longer nulls a failed reply', !runtime.includes('reply = null;'));
check('runtime deterministic fail-open uses authoritative truth/state', runtime.includes('buildV3LastResortReply({') && runtime.includes('truth: truthAfterActions') && runtime.includes('state: conversationState'));
check('runtime final liveness requires a reply rather than model-validator success', runtime.includes('const finalSafetyPass = !plan.shouldRespond || Boolean(reply);'));

check('receipt link action is treated as non-mutating deterministic success', adapter.includes('planned.action === "generate_receipt_link"') && adapter.includes('بدون تعديل قاعدة البيانات'));
check('secure upload link action is treated as non-mutating deterministic success', adapter.includes('planned.action === "generate_secure_upload_link"'));
const mutationLiteral = (adapter.match(/const MUTATIONS = new Set\(\[([\s\S]*?)\]\);/) || [,''])[1];
check('receipt link action is not added to mutation allow-list', !mutationLiteral.includes('generate_receipt_link'));

check('payment-priority turns remove cosmetic human delay', route.includes('return { min: 0, max: 180 };'));
check('runtime crash gets transport fail-open reply instead of throw', route.includes('Phase 8.5 fail-open transport fallback will answer') && route.includes('reply = buildV3LastResortReply();'));
check('historical AUTO_REPLY_IGNORED markers cannot silence customers', (route.match(/isAutoReplyIgnored\(from\)/g) || []).length === 0);
check('nonleader waits for durable leader delivery', route.includes('waitForDurableBurstDelivery') && route.includes('V3_RETRYABLE_NONLEADER_AWAITING_DELIVERY'));
check('superseded leader is never marked complete before durable newer reply', route.includes('V3_RETRYABLE_SUPERSEDED_BURST') && route.includes('if (delivered)'));
check('burst durable wait is bounded to allow concurrent leader to finish', route.includes('input.waitMs ?? 12_000'));
check('final canonical barrier uses superseded settle/retry', (route.match(/settleSupersededIncomingOrRetry/g) || []).length >= 3);

check('Discord loads recent customer conversation automatically', discord.includes('loadConversationSummary'));
check('Discord shows last customer message', discord.includes('آخر رسالة من العميل'));
check('Discord shows recent customer messages', discord.includes('آخر رسائل العميل'));
check('Discord shows waiting age', discord.includes('مدة انتظار العميل'));
check('Discord tells operator what to do now', discord.includes('المطلوب منك الآن'));
check('Discord manual action title is business-readable', discord.includes('يحتاج تنفيذ الإدارة'));
check('Discord delivery-failure title explicitly says customer waits', discord.includes('واتساب لم يرسل الرد — العميل ينتظر'));
check('Discord scoped blocker is translated to Arabic action guidance', discord.includes('scoped_real_actions_disallowed:'));

check('recovery uses operational classifier', recovery.includes('classifyRecoveryCandidate'));
check('recovery sorts payment priority first', recovery.includes('a.recovery.priority - b.recovery.priority'));
check('recovery rechecks live pending state immediately before send', recovery.includes('stillPendingImmediatelyBeforeRecovery'));
check('recovery marks its source metadata for audit', recovery.includes('recovery_class') && recovery.includes('source_incoming_message_id'));
check('recovery no longer sends old social/reaction noise', opsSource.includes('social_closure_or_reaction'));
check('recovery payment stays eligible through WhatsApp freeform window', opsSource.includes('revenue_payment_priority'));
check('old generic questions are not resurrected hours later', opsSource.includes('question_too_old_for_unsolicited_recovery'));
check('control-center pending list uses same recovery classifier', page.includes('classifyRecoveryCandidate'));
check('control-center describes Never-Silent + payment priority', page.includes('Never-Silent') && page.includes('الجاهزون للدفع'));
check('manual disable V3 button removed from ordinary UI', !actions.includes('إيقاف V3 / المسار الآمن'));
check('recovery UI is explicitly emergency-only', actions.includes('Emergency Recovery — احتياط فقط'));
check('recovery UI states payment customers are first', actions.includes('الجاهزين للدفع أولًا'));

// Pure helper behavior tests.
const compiled = ts.transpileModule(opsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require, console });
const ops = mod.exports;
check('"عطيني وين ادفع" is revenue priority without intent dependency', ops.isPaymentPriorityCustomerText('عطيني وين ادفع مصاري', 'unknown') === true);
check('"وين رابط الدفع" is revenue priority without intent dependency', ops.isPaymentPriorityCustomerText('وين رابط الدفع', 'unknown') === true);
check('"ممكن اعرف كيف بدي ادفع" is revenue priority without intent dependency', ops.isPaymentPriorityCustomerText('ممكن اعرف كيف بدي ادفع', 'unknown') === true);
check('"طيب أنا بدي ادفع كيف" is revenue priority without intent dependency', ops.isPaymentPriorityCustomerText('طيب أنا بدي ادفع كيف', 'unknown') === true);
check('"ما بدي ادفع" is NOT revenue priority', ops.isPaymentPriorityCustomerText('ما بدي ادفع هسا', 'payment_method') === false);
check('"ليش ادفع" is NOT revenue priority', ops.isPaymentPriorityCustomerText('ليش ادفع الخمسة', 'payment_method') === false);
check('payment recovery priority is zero', ops.classifyRecoveryCandidate({ body:'كيف بدي ادفع', intent:'payment_method', messageType:'text', ageMs: 8*60*60*1000 }).priority === 0);
check('reaction is never a recovery candidate', ops.classifyRecoveryCandidate({ body:'👍', intent:'unknown', messageType:'reaction', ageMs: 1000 }).eligible === false);
check('short social closure is never a recovery candidate', ops.classifyRecoveryCandidate({ body:'تمام', intent:'unknown', messageType:'text', ageMs: 1000 }).eligible === false);
check('recent question remains recoverable', ops.classifyRecoveryCandidate({ body:'طيب كيف ممكن اوقفه؟', intent:'unknown', messageType:'text', ageMs: 20*60*1000 }).eligible === true);
check('stale generic question is not resurrected', ops.classifyRecoveryCandidate({ body:'شو صار', intent:'unknown', messageType:'text', ageMs: 4*60*60*1000 }).eligible === false);

// Byte-protect the business conversation/payment writer that Phase 8.5 intentionally does not touch.
check('Phase 8.4 native conversation kernel byte-protected', hash('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts') === 'a42ecbcc04dddf34db110a43d690f7451b00ad302529d42db2cd05605c6f9f70');
check('Phase 8.3 canonical burst selector byte-protected', hash('app/api/whatsapp/webhook/_lib/v3-os/conversationBurstAuthority.ts') === '98a2ffb3a228642ef147d12133ad14073f004d8766bd31bb9c776995a69d9a53');

console.log(`Phase 8.5 assertions: ${passed + failed}; passed=${passed}; failed=${failed}`);
process.exit(failed ? 1 : 0);
