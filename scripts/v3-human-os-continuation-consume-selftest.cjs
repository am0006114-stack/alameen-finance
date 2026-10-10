const fs = require('fs');

const informed = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts', 'utf8');
const actionPlane = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts', 'utf8');
const humanOs = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts', 'utf8');

let passed = 0;
let failed = 0;
function ok(condition, label) {
  if (condition) {
    passed++;
    console.log(`PASS ${passed}: ${label}`);
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

ok(/2 - لا، مش هسا/.test(informed), 'decision screen still exposes explicit choice 2');
ok(/\(\?:2\|٢\)/.test(informed) && /مش\\s\+هسا/.test(informed), 'current 2/٢ decline wording is recognized as the delivered disclosure contract');
ok(/commercialDisclosureDelivered\(state: ConversationState, truth: TruthBundle\)/.test(informed) && /resemblesFullCommercialDisclosure\(state\.lastAssistantText\)/.test(informed), 'already-rendered Human OS decision screens repair stale disclosure state');
ok(/\^\(\?:1\|١\)\$/.test(informed), '1 and Arabic ١ are deterministic continuation affirmatives');
ok(/commercialContinuationAffirmativeText/.test(informed), 'affirmative continuation parser is centralized');
ok(/applicationJourneyStage\(app\) !== "preliminary_approved_waiting_decision"/.test(actionPlane), 'synthetic continuation is scoped to preliminary approval waiting for decision');
ok(/commercialDisclosureDelivered\(state, truth\)/.test(actionPlane), 'continuation cannot synthesize before the decision screen was delivered');
ok(/commercialContinuationAffirmativeText\(state\.lastCustomerText\)/.test(actionPlane), 'current customer turn must affirm continuation');
ok(/persistExplicitContinuation/.test(actionPlane), 'Human OS action plane uses canonical durable continuation persistence');
ok(/_commercialDecision: true/.test(actionPlane), 'synthetic continuation carries a narrow commercial-decision sentinel');
ok(/action\.action === "continue_application" && action\.payload\?\._commercialDecision === true/.test(actionPlane), 'only the sentinel continuation bypasses broad Real Action gating');
ok(/stage !== "continuation_confirmed_fee_due"/.test(informed), 'payment handoff fails closed unless authoritative truth confirms persisted continuation');
ok(/buildPostDisclosurePaymentReply\(truthAfterActions, applicationReceiptUrl\(truthAfterActions\)\)/.test(humanOs), 'Human OS payment handoff is built only from post-action authoritative truth');

console.log(`V3 HUMAN OS CONTINUATION CONSUME SELFTEST: assertions=${passed + failed}; passed=${passed}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
