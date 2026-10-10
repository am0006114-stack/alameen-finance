const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
let passed = 0, failed = 0;
const ok = (cond, msg) => cond ? (passed++, console.log(`PASS ${passed}: ${msg}`)) : (failed++, console.error(`FAIL: ${msg}`));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const informed = read('app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts');
const links = read('app/api/whatsapp/webhook/_lib/v3-os/linkIntegrity.ts');
const commercial = read('app/api/whatsapp/webhook/_lib/v3-os/commercialProgression.ts');
const mutation = read('app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts');
const recovery = read('app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts');
const persistence = read('app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts');
const destinations = read('app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts');

ok(/2026-10-concise-decision-v3/.test(informed), 'old commercial disclosure state is invalidated for the new concise decision contract');
ok(/هل ترغب بالاستمرار للدراسة النهائية/.test(informed), 'preliminary approval has an explicit continue decision question');
ok(/1 - نعم، أريد الاستمرار/.test(informed), 'decision screen exposes the deterministic numeric 1 CTA');
ok(/لا أريد الاستمرار/.test(informed), 'decision screen exposes a safe explicit decline choice');
ok(!/تمييز العملاء الراغبين فعلًا بالاستمرار/.test(informed), 'initial decision screen no longer contains the long fee rationale newspaper');
ok(!/ضغط المراجعات/.test(informed), 'initial decision screen no longer dumps unrelated review-pressure policy');
ok(/numericContinuationShortcutText/.test(informed) && /\(\?:1\|١\)/.test(informed), 'both ASCII 1 and Arabic ١ remain deterministic continuation shortcuts');
ok(/asksStatusOrNextStep/.test(informed) && /asksStatusOrNextStep\(input\.turn\)/.test(informed), 'preliminary status and next-step questions are owned by the decision screen');

ok(/const paymentConfirmed = hasAuthoritativePaymentConfirmation\(truth\.application\)/.test(links), 'link policy derives authoritative payment confirmation first');
ok(/if \(paymentConfirmed && \(turnNeeds\("tracking"/.test(links), 'tracking link is not issued before authoritative payment confirmation');
ok(/\.\.\.\(paymentConfirmed \? \[`\$\{baseUrl\}\/track`\] : \[\]\)/.test(links), 'public /track is removed from the pre-payment allow-list');

ok(!/status === "preliminary_qualified" \|\|\s*status === "customer_confirmed_continue"/.test(commercial), 'preliminary approval alone is no longer payment_ready');
ok(/status === "customer_confirmed_continue"/.test(commercial), 'persisted continuation remains payment_ready');
ok(/status === "preliminary_qualified"/.test(persistence), 'persistence layer still accepts preliminary_qualified as the durable decision source');

ok(/const aliasAffirmative = bareAffirmative/.test(mutation), 'WhatsApp alias confirmation has a dedicated contextual affirmative path');
ok(/نعم\|اه\|ايوه\|اكيد\|موافق/.test(mutation) && /اعتمد\|اربط\|ثبت\|سجل/.test(mutation), 'natural نعم اعتمد is recognized only inside the alias confirmation loop');
ok(/aliasLoopActive/.test(mutation) && /lastAssistantAskedForConfirmation/.test(mutation), 'broader alias wording still requires an active scoped confirmation prompt');

ok(/if \(commercial === "payment_ready"\)/.test(recovery), 'payment handoff requires post-persistence commercial state');
ok(!/if \(isContinuationRevenueReady\(app\)\) \{\s*\/\/ Phase 9\.1 P0: once informed continuation/.test(recovery), 'preliminary eligibility cannot directly expose payment destinations');
ok(/currentFileOpeningPaymentRule/.test(recovery) && /applicationReceiptUrl/.test(recovery), 'post-decision payment data and receipt link still use canonical frozen sources');
ok(!/(0788500337|PAYAMEEEN|AMEEN1ST|AM500337)/.test(informed), 'new decision module does not duplicate payment credentials');
ok(/fileOpeningPaymentWriterTruth/.test(destinations) || /PAYAMEEEN/.test(destinations), 'canonical payment destination source remains present and unchanged');

console.log(`\nV3 COMMERCIAL FUNNEL DECISIVE SELFTEST: assertions=${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
