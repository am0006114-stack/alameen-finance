const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
let passed = 0, failed = 0;
const ok = (cond, msg) => cond ? (passed++, console.log(`PASS ${passed}: ${msg}`)) : (failed++, console.error(`FAIL: ${msg}`));

const policyPath = path.join(root, 'app/api/whatsapp/webhook/_lib/v4-os/commercialFunnelPolicy.ts');
const bridgePath = path.join(root, 'app/api/whatsapp/webhook/_lib/v4-os/commercialContinuationBridge.ts');
const adapterPath = path.join(root, 'app/api/whatsapp/webhook/_lib/v4-os/modelAdapter.ts');
const policy = fs.readFileSync(policyPath, 'utf8');
const bridge = fs.readFileSync(bridgePath, 'utf8');
const adapter = fs.readFileSync(adapterPath, 'utf8');

ok(/preliminary_approved_waiting_decision/.test(policy), 'fast path is gated to preliminary approval waiting-decision stage');
ok(/q === "1"/.test(policy), 'numeric CTA 1 is a deterministic continuation shortcut');
ok(/نعم\\s\+اعتمد|نعم\s+اعتمد/.test(policy), 'natural نعم اعتمد continuation is recognized');
ok(/requestedAction: isContinue \? "continue_application" : null/.test(policy), 'continuation shortcut becomes the canonical continue_application action');
ok(/إذا حاب تكمل للدراسة النهائية، رسوم فتح الملف 5 دنانير، وهي مستردة إذا ما صدرت الموافقة النهائية\. للمتابعة اكتب 1\./.test(policy), 'pre-payment CTA is intentionally short');
ok(!/إذا حاب تكمل للدراسة النهائية[^\n]{0,260}تمييز الطلبات الجادة/.test(policy), 'fee rationale is not injected into the initial CTA');
ok(/feeReasonQuestion/.test(policy) && /تمييز الطلبات الجادة/.test(policy), 'fee rationale exists only on the explicit why-fee path');
ok(/resolveCommercialFastPathUnderstanding/.test(adapter), 'model adapter checks deterministic commercial understanding first');
ok(adapter.indexOf('resolveCommercialFastPathUnderstanding') < adapter.indexOf('understandingProvider.generate'), 'commercial shortcut is evaluated before any understanding-model call');
ok(adapter.indexOf('buildCommercialFastPathDraft') < adapter.indexOf('writerProvider.generate'), 'short funnel answers are emitted before any writer-model call');
ok(/commercial deterministic fastpath/.test(adapter) && /accepted: true, score: 1/.test(adapter), 'deterministic funnel answers skip paid critic-model calls');
ok(/persistExplicitContinuation/.test(bridge), 'continuation still uses the frozen persistence backplane');
ok(/fileOpeningPaymentWriterTruth/.test(bridge), 'payment destinations still come from the frozen canonical payment source');
ok(/applicationReceiptUrl/.test(bridge), 'receipt upload remains bound through the canonical link source');
ok(/Orange Money:/.test(bridge) && /CliQ:/.test(bridge) && /المستفيد:/.test(bridge), 'post-1 payment handoff contains only actionable payment data');
ok(!/(0788500337|PAYAMEEEN|AMEEN1ST|AM500337)/.test(bridge), 'V4 does not duplicate payment numbers or aliases in its own source');
ok(!/ضغط المراجعات|يومين إلى 3|يومين الى 3|الجمعة والسبت/.test(policy), 'short commercial CTA does not dump unrelated review policy');

console.log(`\nV4 COMMERCIAL FUNNEL FASTPATH SELFTEST: assertions=${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
