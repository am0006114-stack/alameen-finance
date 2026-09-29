const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
let failed = 0;
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function pass(name, ok){ if(ok) console.log(`PASS: ${name}`); else { failed++; console.error(`FAIL: ${name}`); } }

const os = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const brain = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');
const kernel = read('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');
const decision = read('app/api/whatsapp/webhook/_lib/v3-os/humanDecisionPlane.ts');
const hierarchy = read('app/api/whatsapp/webhook/_lib/v3-os/hierarchy.ts');

pass('AI employee hierarchy remains Fadwa/Tala/Abdullah/Abdulrahman/Omran', /displayName: "تالا"/.test(hierarchy) && /displayName: "فدوة"/.test(hierarchy) && /displayName: "عبدالله"/.test(hierarchy) && /displayName: "عبدالرحمن"/.test(hierarchy) && /displayName: "عمران"/.test(hierarchy));
pass('Human OS resolves employee role before brain call', /stateWorking = \{ \.\.\.stateWorking, role: resolveAiRole\(stateWorking, deterministicAnchor\) \}/.test(os));
pass('identity reply uses current employee name and never generic automated-assistant label', /roleDisplayName\(input\.state\.role\.currentRole\)/.test(os) && /معك \$\{name\} من الأمين/.test(os) && !/مساعد آلي تابع للأمين/.test(os));
pass('responsible/manager request is an internal Omran role switch, not human handoff', /explicitManagerQuestion/.test(os) && /explicitRoleRequest: "omran"/.test(os));
pass('brain receives current employee identity in compact truth', /employeeName: roleDisplayName\(state\.role\.currentRole\)/.test(brain) && /employeeTier: state\.role\.tier/.test(brain));
pass('brain uses persona writing contract for current employee', /personaWritingContract\(employeeName\)/.test(brain) && /حافظ على شخصية \$\{employeeName\}/.test(brain));
pass('Khaled calming personality is restored as an overlay for angry/complaint turns', /personaWritingContract\("خالد"\)/.test(brain) && /CALMING_OVERLAY/.test(brain));
pass('brain explicitly forbids human handoff and keeps conversation autonomous', /بدون انتظار موظف بشري/.test(brain) && /لا تدّعِ تحويلًا لموظف بشري/.test(brain));
pass('only manual payment receipt confirmation can request human operational checkpoint', /manual_payment_receipt_confirmation_only/.test(decision) && /paymentReceiptUploaded/.test(decision) && !/legal_or_public_escalation/.test(decision) && !/brain_requested_human_judgment/.test(decision));
pass('AI/bot/model architecture cannot leak to customer-facing replies', /\\bAI\\b\/i/.test(kernel) && /ذكاء\\s\*اصطناعي/.test(kernel) && /مساعد\\s\*آلي/.test(kernel) && /بوت\/i/.test(kernel));
pass('kernel tells identity questions to use employee persona instead of automated disclosure', /عرّف باسم الموظف الحالي فقط/.test(kernel) && /لا تقل «مساعد آلي»/.test(kernel));
pass('literal human claims and fake human transfers remain prohibited', /false_literal_human_handoff_claim/.test(kernel));
pass('no SQL/schema dependency introduced', !/supabase\/migrations/.test(os + brain + kernel + decision));

if (failed) { console.error(`PHASE 11.1.2 AI EMPLOYEE PERSONA AUTHORITY RESTORATION SELFTEST FAILED: ${failed}`); process.exit(1); }
console.log('PHASE 11.1.2 AI EMPLOYEE PERSONA AUTHORITY RESTORATION SELFTEST PASSED');
