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
ok(informed.includes('\u0647\u0644 \u062a\u0631\u063a\u0628 \u0628\u0627\u0644\u0627\u0633\u062a\u0645\u0631\u0627\u0631 \u0644\u0644\u062f\u0631\u0627\u0633\u0629 \u0627\u0644\u0646\u0647\u0627\u0626\u064a\u0629\u061f'),'preliminary approval has an explicit continue decision question');
ok(informed.includes('1 - \u0646\u0639\u0645'),'decision screen exposes deterministic numeric 1 continue CTA');
ok(informed.includes('2 - \u0644\u0627'),'decision screen exposes deterministic numeric 2 decline CTA');
ok(!informed.includes('\u062a\u0645\u064a\u064a\u0632 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0631\u0627\u063a\u0628\u064a\u0646 \u0641\u0639\u0644\u064b\u0627 \u0628\u0627\u0644\u0627\u0633\u062a\u0645\u0631\u0627\u0631'),'initial decision screen no longer contains the long fee rationale newspaper');
ok(!informed.includes('\u0636\u063a\u0637 \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0627\u062a'),'initial decision screen no longer dumps unrelated review-pressure policy');
ok(informed.includes('numericContinuationShortcutText') && /\(\?:1\|\u0661\)/.test(informed),'both ASCII 1 and Arabic 1 remain deterministic continuation shortcuts');
ok(recovery.includes('const numericDecisionDecline') && recovery.includes('(?:2|\\u0662)'),'ASCII 2 and Arabic 2 are contextual decline shortcuts only on the decision screen');
ok(/asksStatusOrNextStep/.test(informed) && /asksStatusOrNextStep\(input\.turn\)/.test(informed),'preliminary status and next-step questions are owned by the decision screen');

ok(/const paymentConfirmed = hasAuthoritativePaymentConfirmation\(truth\.application\)/.test(links),'link policy derives authoritative payment confirmation first');
ok(/if \(paymentConfirmed && \(turnNeeds\("tracking"/.test(links),'tracking link is not issued before authoritative payment confirmation');
ok(/\.\.\.\(paymentConfirmed \? \[`\$\{baseUrl\}\/track`\] : \[\]\)/.test(links),'public /track is removed from the pre-payment allow-list');

ok(!/status === "preliminary_qualified" \|\|\s*status === "customer_confirmed_continue"/.test(commercial),'preliminary approval alone is no longer payment_ready');
ok(/status === "customer_confirmed_continue"/.test(commercial),'persisted continuation remains payment_ready');
ok(/\["preliminary_qualified", "customer_confirmed_continue"\]\.includes\(status\)/.test(persistence) && /\.eq\("status", "preliminary_qualified"\)/.test(persistence),'persistence layer still accepts preliminary_qualified as the durable decision source and scopes the write to that exact state');

ok(/const aliasAffirmative = bareAffirmative/.test(mutation),'WhatsApp alias confirmation has a dedicated contextual affirmative path');
ok(/\u0646\u0639\u0645\|\u0627\u0647/.test(mutation) && /\u0627\u0639\u062a\u0645\u062f\|\u0627\u0631\u0628\u0637/.test(mutation),'natural yes/adopt wording is recognized only inside the alias confirmation loop');
ok(/aliasLoopActive/.test(mutation) && /lastAssistantAskedForConfirmation/.test(mutation),'broader alias wording still requires an active scoped confirmation prompt');

ok(/if \(commercial === "payment_ready"\)/.test(recovery),'payment handoff requires post-persistence commercial state');
ok(!/if \(isContinuationRevenueReady\(app\)\) \{\s*\/\/ Phase 9\.1 P0: once informed continuation/.test(recovery),'preliminary eligibility cannot directly expose payment destinations');
ok(/currentFileOpeningPaymentRule/.test(recovery) && /applicationReceiptUrl/.test(recovery),'post-decision payment data and receipt link still use canonical frozen sources');
ok(!/(0788500337|PAYAMEEEN|AMEEN1ST|AM500337)/.test(informed),'new decision module does not duplicate payment credentials');
ok(/fileOpeningPaymentWriterTruth/.test(destinations) || /PAYAMEEEN/.test(destinations),'canonical payment destination source remains present and unchanged');

console.log(`\nV3 COMMERCIAL FUNNEL DECISIVE SELFTEST: assertions=${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
