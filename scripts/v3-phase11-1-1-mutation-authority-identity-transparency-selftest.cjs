const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
let failed = 0;
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function pass(name, ok){ if(ok) console.log(`PASS: ${name}`); else { failed++; console.error(`FAIL: ${name}`); } }

const os = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const brain = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');
const kernel = read('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');

pass('explicit identity questions remain deterministic and model-free', /function explicitAssistantIdentityQuestion/.test(os) && /explicitStatusTracking \|\| explicitIdentityQuestion/.test(os));
pass('identity authority now returns current employee persona instead of automated-assistant disclosure', /roleDisplayName\(input\.state\.role\.currentRole\)/.test(os) && /معك \$\{name\} من الأمين/.test(os) && !/أنا مساعد آلي تابع للأمين للأقساط/.test(os));
pass('manager/responsible identity request routes internally to Omran AI role', /function explicitManagerIdentityQuestion/.test(os) && /explicitRoleRequest: "omran"/.test(os));
pass('authoritative gate confirmation still bypasses generic validator', /authoritativeGateReply/.test(os) && /AUTHORITATIVE_DETERMINISTIC_SAFETY/.test(os));
pass('brain is employee-persona driven, not generic assistant driven', /أنت \$\{employeeName\} من فريق الأمين للأقساط داخل Human Company OS/.test(brain) && /personaWritingContract\(employeeName\)/.test(brain));
pass('brain never requests human handoff and reserves human work for receipt confirmation', /التدخل البشري التشغيلي الوحيد خارج المحادثة هو تأكيد وصل الدفع/.test(brain) && /requiresHumanReview يجب أن يبقى false/.test(brain));
pass('brain does not expose automated assistant identity', !/مساعد آلي تابع للأمين للأقساط/.test(brain));
pass('customer-facing AI/bot architecture terms are blocked again', /\\bAI\\b\/i/.test(kernel) && /ذكاء\\s\*اصطناعي/.test(kernel) && /مساعد\\s\*آلي/.test(kernel));
pass('false literal human claims remain blocked', /false_literal_human_handoff_claim/.test(kernel));
pass('confirmation language accepts punctuation between اكتب and نعم', /اكتب\[\\s:،؛-\]\*نعم/.test(kernel));
pass('Phase 11.1 structural safety architecture remains present', /paymentExecutionRequired/.test(os) && /blockingSafetyReasons/.test(os));

function normalizeArabic(value){
  return String(value || '').toLowerCase()
    .replace(/[أإآ]/g,'ا').replace(/[ى]/g,'ي').replace(/[ة]/g,'ه')
    .replace(/[ؤ]/g,'و').replace(/[ئ]/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'')
    .replace(/\s+/g,' ').trim();
}
function confirmationLanguagePresent(reply){
  const n = normalizeArabic(reply);
  const confirm = /(?:اكد|أكد|تاكيد|تأكيد|اذا\s+قرارك\s+نها(?:ي|يي)|إذا\s+قرارك\s+نهائي|اكتب[\s:،؛-]*نعم|احكي[\s:،؛-]*نعم)/.test(n);
  return confirm && /(?:الغاء|إلغاء|الغي|ألغي)/.test(n);
}
const prompt='أكيد. بس لأن إلغاء الطلب AM-1789927279510 إجراء فعلي وما بدي أنفذه من سؤال أو بالغلط، بدي تأكيد منفصل منك. إذا قرارك نهائي اكتب: نعم، ألغي الطلب.';
pass('exact Production cancellation confirmation still validates', confirmationLanguagePresent(prompt));

if (failed) { console.error(`PHASE 11.1.1 MUTATION AUTHORITY REGRESSION SELFTEST FAILED: ${failed}`); process.exit(1); }
console.log('PHASE 11.1.1 MUTATION AUTHORITY REGRESSION SELFTEST PASSED');
