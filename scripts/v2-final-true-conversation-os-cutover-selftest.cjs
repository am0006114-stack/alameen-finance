const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.argv[2] || process.cwd();
const files = [
  'app/api/whatsapp/webhook/route.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/runtime.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/index.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/truthResolver.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/policyRegistry.ts',
  'app/api/whatsapp/webhook/_lib/v2-production/safeComposer.ts',
];

function read(rel) {
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) throw new Error(`missing ${rel}`);
  return fs.readFileSync(f, 'utf8');
}

for (const rel of files) {
  const source = read(rel);
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
    fileName: rel,
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    throw new Error(`${rel} syntax diagnostics: ${errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join(' | ')}`);
  }
}

const route = read('app/api/whatsapp/webhook/route.ts');
const runtime = read('app/api/whatsapp/webhook/_lib/v2-production/runtime.ts');
const truth = read('app/api/whatsapp/webhook/_lib/v2-production/truthResolver.ts');
const policy = read('app/api/whatsapp/webhook/_lib/v2-production/policyRegistry.ts');
const safe = read('app/api/whatsapp/webhook/_lib/v2-production/safeComposer.ts');

const checks = [
  ['true cutover branch exists', route.includes('FINAL TRUE OS CUTOVER')],
  ['last writer wins exists', route.includes('LAST WRITER WINS')],
  ['V2 resolves direct truth', route.includes('resolveV2Truth({')],
  ['legacy action text discarded', route.includes('Its customer-facing text is discarded')],
  ['runtime does not accept deterministicReply', !runtime.includes('deterministicReply: string')],
  ['runtime excludes legacy assistant replies', runtime.includes('lastAssistantReplies: []')],
  ['direct Supabase applications truth', truth.includes('.from("applications")')],
  ['direct WhatsApp tracking truth', truth.includes('.from("whatsapp_messages")')],
  ['5 JOD canonical policy', policy.includes('fileOpeningFeeJod: 5')],
  ['3 JOD leak blocker', policy.includes('legacy_three_jod_fee_leak')],
  ['first installment canonical wording', policy.includes('بعد شهر من استلام الجهاز وتوقيع العقد')],
  ['OpenAI semantic auditor', runtime.includes('production_semantic_audit') && runtime.includes('https://api.openai.com/v1/responses')],
  ['truth-only fail closed', runtime.includes('composeV2TruthOnlyReply') && runtime.includes('writer_failure_truth_only_fallback')],
  ['unnecessary continue question guard', runtime.includes('unnecessary_continue_question')],
  ['no-payment claim guard', runtime.includes('unsupported_no_payment_due_claim')],
  ['safe composer never 3 JOD', !/(?:3|٣)\s*دنانير/.test(safe)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
if (failed.length) throw new Error(`selftest failed: ${failed.map(([n]) => n).join(', ')}`);
console.log('SELFTEST PASS - V2 FINAL TRUE CONVERSATION OS CUTOVER');
