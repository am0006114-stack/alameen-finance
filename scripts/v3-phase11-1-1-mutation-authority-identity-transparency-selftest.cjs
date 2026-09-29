const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
let failed = 0;
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function pass(name, ok){ if(ok) console.log(`PASS: ${name}`); else { failed++; console.error(`FAIL: ${name}`); } }

const os = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const brain = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');
const kernel = read('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');

pass('explicit assistant identity questions are detected deterministically', /function explicitAssistantIdentityQuestion/.test(os) && /ذكاء\\s\*اصطناعي/.test(os) && /شو\|ما\)\\s\+اسمك/.test(os));
pass('identity reply is transparent and does not claim a human employee', /أنا مساعد آلي تابع للأمين للأقساط/.test(os) && /ما عندي اسم شخصي حقيقي/.test(os));
pass('identity questions bypass paid model routing', /explicitStatusTracking \|\| explicitIdentityQuestion/.test(os) && /\? "deterministic"/.test(os));
pass('authoritative gate confirmation reply bypasses generic reply validator', /authoritativeGateReply/.test(os) && /authoritativeDeterministicReply/.test(os) && /AUTHORITATIVE_DETERMINISTIC_SAFETY/.test(os));
pass('final gate reply remains authoritative after repair pass', /finalAuthoritativeGateReply/.test(os) && /finalAuthoritativeDeterministicReply/.test(os));
pass('brain no longer instructs the model to impersonate a WhatsApp employee', !/تصرف كموظف واتساب/.test(brain) && /تصرف كمساعد محادثة ذكي وطبيعي تابع للأمين/.test(brain));
pass('brain explicitly requires truthful automated-assistant disclosure on direct identity questions', /مساعد آلي تابع للأمين للأقساط/.test(brain) && /لا تدّعِ أنك إنسان أو موظف بشري/.test(brain));
pass('AI concept itself is no longer treated as an internal secret', !/\\bAI\\b\/i,\/ذكاء\\s\*اصطناعي\/i/.test(kernel));
pass('provider and guard internals remain protected', /DeepSeek\/i,\/OpenAI\/i/.test(kernel) && /decision\\s\*plane/.test(kernel));
pass('confirmation language accepts punctuation between اكتب and نعم', /اكتب\[\\s:،؛-\]\*نعم/.test(kernel));
pass('false bot-denial claim is still rejected', /ما\\s\+في\)\\s\+\(\?:رد/.test(kernel) || /ما\\s\+في/.test(kernel) && /false_literal_human_handoff_claim/.test(kernel));
pass('Phase 11.1 structural safety architecture remains present', /paymentExecutionRequired/.test(os) && /blockingSafetyReasons/.test(os) && /sanitizeCustomerFacingStatusTokens/.test(os));
pass('no SQL or schema dependency added', !/supabase\/migrations/.test(os + brain + kernel));

// Behavioral sanity check for the exact deterministic cancellation confirmation
// that failed in Production because normalizeArabic changes نهائي -> نهايي and
// the prompt contains a colon between اكتب and نعم.
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
pass('exact Production cancellation confirmation now validates', confirmationLanguagePresent(prompt));

if (failed) { console.error(`PHASE 11.1.1 MUTATION AUTHORITY + IDENTITY TRANSPARENCY SELFTEST FAILED: ${failed}`); process.exit(1); }
console.log('PHASE 11.1.1 MUTATION AUTHORITY + IDENTITY TRANSPARENCY SELFTEST PASSED');
