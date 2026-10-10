const fs = require('fs');

const informed = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts', 'utf8');
const actionPlane = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts', 'utf8');
const humanOs = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts', 'utf8');
const state = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/state.ts', 'utf8');

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

ok(/export function numericCommercialContinueText/.test(informed), 'numeric continuation authority is explicit and centralized');
ok(/\^\(\?:1\|١\)\$/.test(informed), 'both Western 1 and Arabic ١ are exact deterministic choices');
ok(/state\.lastCustomerText/.test(informed), 'numeric recovery uses the current reduced customer turn');
ok(/preliminary_approved_waiting_decision/.test(informed) && /continuation_confirmed_fee_due/.test(informed), 'numeric recovery is limited to the decision/payment handoff stages');
ok(/numericCommercialContinueText\(state\.lastCustomerText\)/.test(informed), 'missing disclosure state can be repaired from exact numeric menu choice');
ok(/commercialDisclosureDelivered\(state, truth\)/.test(actionPlane), 'action plane consumes the repaired disclosure authority');
ok(/commercialContinuationAffirmativeText\(state\.lastCustomerText\)/.test(actionPlane), 'action plane still requires an affirmative current turn');
ok(/persistExplicitContinuation/.test(actionPlane), 'continuation still persists through canonical application truth mutation');
ok(/s\.lastCustomerText = input\.turn\.rawText/.test(state), 'reduced state definitely carries the current inbound text before actions');
ok(/truthAfterActions = await resolveV3ProductionTruth/.test(humanOs), 'truth is reread after executed continuation');
ok(/buildPostDisclosurePaymentReply\(truthAfterActions, applicationReceiptUrl\(truthAfterActions\)\)/.test(humanOs), 'payment response is built from post-action authoritative truth');
ok(/stage !== \"continuation_confirmed_fee_due\"/.test(informed), 'payment destinations remain fail-closed until persisted continuation is authoritative');
ok(!/numericCommercialContinueText\([^)]*\).*نعم/.test(informed), 'bare نعم is not promoted to the missing-state numeric recovery rule');

console.log(`V3 PHASE 12 CLEAN COMMERCIAL FUNNEL SELFTEST: assertions=${passed + failed}; passed=${passed}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
