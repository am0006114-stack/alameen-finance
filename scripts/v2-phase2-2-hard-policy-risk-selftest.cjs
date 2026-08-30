const fs = require('fs');
const path = require('path');

const root = process.argv[2];
if (!root) throw new Error('Project root argument required');
const ts = require(path.join(root, 'node_modules', 'typescript'));
const files = [
  'app/api/whatsapp/webhook/_lib/v2-archive/policyVerifier.ts',
  'app/api/whatsapp/webhook/_lib/v2-archive/evaluator.ts',
  'app/api/whatsapp/webhook/_lib/v2-archive/providers.ts',
  'app/admin/whatsapp-v2-lab/ArchiveLabActions.tsx',
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

const verifier = fs.readFileSync(path.join(root, files[0]), 'utf8');
const evaluator = fs.readFileSync(path.join(root, files[1]), 'utf8');
const providers = fs.readFileSync(path.join(root, files[2]), 'utf8');
const actions = fs.readFileSync(path.join(root, files[3]), 'utf8');
const page = fs.readFileSync(path.join(root, files[4]), 'utf8');
const sqlPath = path.join(root, 'supabase/migrations/20260830235500_v2_archive_risk_first_claim.sql');
if (!fs.existsSync(sqlPath)) throw new Error('Risk-first SQL migration missing');
const sql = fs.readFileSync(sqlPath, 'utf8');

const checks = [
  [verifier.includes('unsupported_license_claim'), 'broad license guard missing'],
  [verifier.includes('unsupported_financing_or_lending_claim'), 'broad financing guard missing'],
  [verifier.includes('archiveTruthPolicyViolations'), 'historical truth gate missing'],
  [verifier.includes('known_tracking_id_reasked'), 'known tracking continuity guard missing'],
  [verifier.includes('known_whatsapp_number_reasked'), 'known WhatsApp number guard missing'],
  [verifier.includes('Punctuation-only archive artifacts'), 'punctuation noise skip missing'],
  [evaluator.includes('archiveConversationPolicyViolations') && evaluator.includes('archiveTruthPolicyViolations'), 'evaluator policy wall wiring missing'],
  [providers.includes('نصب/نصابين/احتيال'), 'complaint replay rule missing'],
  [providers.includes('نتائج الحراس الحتمية'), 'judge deterministic findings input missing'],
  [providers.includes('whatsapp_number_known'), 'known identifier prompt missing'],
  [actions.includes('تقييم 100 Risk') && actions.includes('تقييم 300 Risk'), 'accelerated risk buttons missing'],
  [page.includes('Phase 2.2') && page.includes('Risk-first'), 'Phase 2.2 dashboard label missing'],
  [sql.includes('whatsapp_v2_archive_risk_score') && sql.includes('ORDER BY public.whatsapp_v2_archive_risk_score(customer_message) DESC'), 'risk-first claim SQL missing'],
];
for (const [ok, msg] of checks) if (!ok) throw new Error(msg);
console.log(`SELFTEST PASS - V2 PHASE 2.2 HARD POLICY WALL + TRUTH GATE + RISK-FIRST (${files.length} TS/TSX files transpiled)`);
