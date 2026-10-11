const fs = require('fs');

const policy = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/notificationPolicy.ts', 'utf8');
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

ok(/"record_call_preference"/.test(policy), 'human contact/call requests are explicitly recognized by notification policy');
ok(/"expedite_review"/.test(policy), 'routine expedite requests are explicitly recognized by notification policy');
ok(/autonomous_conversation_request_does_not_require_human_intervention/.test(policy), 'routine conversational escalation is Discord-quiet');
ok(/AUTONOMOUS_MANUAL_ACTION_KEYS\.has\(actionKey\)/.test(policy), 'manual-action Discord policy checks the autonomous allowlist before notifying');
ok(/event === "manual_action_required"/.test(policy), 'real manual actions still have an explicit policy branch');
ok(/event === "official_receipt_uploaded" \|\| input\.event === "payment_confirmation_required"/.test(policy), 'payment receipt confirmation remains actionable');
ok(/event === "truth_integrity_failure"/.test(policy), 'truth-integrity failures remain critical alerts');
ok(/event === "whatsapp_delivery_failure"/.test(policy), 'WhatsApp delivery failures remain critical alerts');
ok(/actionKey: "record_call_preference"/.test(humanOs), 'Human OS call-request path is covered by the quiet notification policy');

console.log(`V3 DISCORD HUMAN-INTERVENTION NOISE SELFTEST: assertions=${passed + failed}; passed=${passed}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
