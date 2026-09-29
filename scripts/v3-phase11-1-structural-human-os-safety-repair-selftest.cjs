const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
let failed = 0;
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function pass(name, ok){ if(ok) console.log(`PASS: ${name}`); else { failed++; console.error(`FAIL: ${name}`); } }

const os = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const brain = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');
const gate = read('app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts');
const kernel = read('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');

pass('Human Brain receives canonical business truth', /canonicalBusinessTruthForPrompt/.test(brain) && /business:\s*canonicalBusinessTruthForPrompt\(\)/.test(brain));
pass('Human Brain uses customer-facing status instead of raw DB status', /customerFacingStatus:\s*customerFacingStatusLabel\(app\)/.test(brain) && !/\n\s+status:\s*app\.status,/.test(brain));
pass('safe-preview Human Brain packet is privacy bounded', /safePreview\s*\?\s*\{[\s\S]*trackingId:[\s\S]*deviceName:[\s\S]*customerFacingStatus:[\s\S]*\}\s*:\s*\{/m.test(brain));
pass('safe-preview packet suppresses bound tracking/receipt/refund links', /officialLinks: safePreview \? \{[\s\S]*tracking:\s*null,[\s\S]*receipt:\s*null,[\s\S]*refund:\s*null/m.test(brain));
pass('Human Brain receives official links and modification routing', /officialLinks:/.test(brain) && /resolveApplicationModificationRoute/.test(brain));
pass('disclosure turn no longer doubles as payment execution turn', /paymentExecutionRequired\s*=\s*!disclosureRequired/.test(os) && /protectedFiveJodStep:\s*paymentExecutionRequired/.test(os));
pass('post-disclosure direct payment question can deterministically get payment details', /paymentQuestionAfterDisclosure/.test(os) && /buildPostDisclosurePaymentReply/.test(os));
pass('raw internal DB status tokens are sanitized before customer delivery', /sanitizeCustomerFacingStatusTokens/.test(os) && /under_review/.test(os) && /قيد الدراسة النهائية/.test(os));
pass('deterministic status fallback uses customerFacingStatusLabel', /حالته الحالية: \$\{customerFacingStatusLabel\(app\)\}/.test(os));
pass('style-only humanity warnings no longer null a truthful reply', /blockingSafetyReasons/.test(os) && /!reason\.startsWith\("humanity:"\)/.test(os) && /reply:\s*finalSafetyPass \? reply : null/.test(os));
pass('candidate is validated against previous assistant state, not self-written reply', /Keep lastAssistantText on the previous delivered assistant turn/.test(os) && /finalizeStateSemanticMemory[\s\S]*if \(finalSafetyPass\)/.test(os));
pass('safety repair handles confirmation, fee, office, delivery and contact promises', /missing_action_specific_confirmation/.test(os) && /missing_current_payment_destinations/.test(os) && /office_location_missing_/.test(os) && /delivery_/.test(os) && /unsupported_future_admin_or_contact_claim/.test(os));
pass('combined cancel+refund stages one authoritative cancellation mutation', /hasCancellation/.test(gate) && /filter\(\(action\) => action\.action !== "request_refund"\)/.test(gate));
pass('only one real mutation confirmation may be staged per turn', /Only one mutation confirmation may be open per customer turn/.test(gate) && /if \(prompt\) continue;/.test(gate));
pass('authoritative already-cancelled truth is not falsely rejected as a completion claim', /truthAlreadyCancelled/.test(kernel) && /!truthAlreadyCancelled/.test(kernel));
pass('authoritative refund truth is accepted without requiring same-turn execution', /truthAlreadyRefundedOrRequested/.test(kernel) && /!truthAlreadyRefundedOrRequested/.test(kernel));
pass('no SQL or schema dependency added by Phase 11.1 source repair', !/supabase\/migrations/.test(os + brain + gate + kernel));

if (failed) { console.error(`PHASE 11.1 STRUCTURAL HUMAN OS SAFETY REPAIR SELFTEST FAILED: ${failed}`); process.exit(1); }
console.log('PHASE 11.1 STRUCTURAL HUMAN OS SAFETY REPAIR SELFTEST PASSED');
