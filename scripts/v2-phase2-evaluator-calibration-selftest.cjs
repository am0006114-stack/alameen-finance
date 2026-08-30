const fs = require('fs');
const path = require('path');

const root = process.argv[2];
if (!root) throw new Error('Project root argument required');
const ts = require(path.join(root, 'node_modules', 'typescript'));
const files = [
  'app/api/whatsapp/webhook/_lib/v2-archive/evaluator.ts',
  'app/api/whatsapp/webhook/_lib/v2-archive/providers.ts',
  'app/api/whatsapp/webhook/_lib/v2-archive/policyVerifier.ts',
  'app/admin/whatsapp-v2-lab/page.tsx',
];
for (const rel of files) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) throw new Error(`Missing ${rel}`);
  const src = fs.readFileSync(full, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName: rel,
  });
  const errors = (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const msg = errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n');
    throw new Error(`${rel} transpile failed:\n${msg}`);
  }
}
const evaluator = fs.readFileSync(path.join(root, files[0]), 'utf8');
const providers = fs.readFileSync(path.join(root, files[1]), 'utf8');
const verifier = fs.readFileSync(path.join(root, files[2]), 'utf8');
const page = fs.readFileSync(path.join(root, files[3]), 'utf8');
const checks = [
  [evaluator.includes('normalizeJudgeScoreScale'), 'score scale repair missing'],
  [evaluator.includes('archiveReplyPolicyViolations'), 'local policy verifier missing'],
  [evaluator.includes('isLowValueArchiveNoise'), 'noise skip missing'],
  [providers.includes('كل حقول الدرجات من 0 إلى 100'), 'judge 0-100 rubric missing'],
  [providers.includes('الأمين للأقساط والتمويل') && providers.includes('خطأ حرج'), 'forbidden business name judge rule missing'],
  [verifier.includes('forbidden_business_name_alameen_installments_and_finance'), 'business name deterministic guard missing'],
  [page.includes('إجمالي الأرشيف') && page.includes('exactCount'), 'global archive counters missing'],
];
for (const [ok, msg] of checks) if (!ok) throw new Error(msg);
console.log(`SELFTEST PASS - ${files.length} files transpiled and evaluator calibration guards verified`);
