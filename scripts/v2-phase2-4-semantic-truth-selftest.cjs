const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2];
if (!root) throw new Error('Project root argument required');
const ts = require(path.join(root, 'node_modules', 'typescript'));
const files = [
  'app/api/whatsapp/webhook/_lib/v2-archive/policyVerifier.ts',
  'app/api/whatsapp/webhook/_lib/v2-archive/providers.ts',
  'app/api/whatsapp/webhook/_lib/v2-archive/evaluator.ts',
];
for (const rel of files) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) throw new Error(`Missing ${rel}`);
  const src = fs.readFileSync(full, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: rel,
  });
  const errors = (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`${rel} transpile failed:\n${errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n')}`);
}

const verifierPath = path.join(root, files[0]);
const verifier = fs.readFileSync(verifierPath, 'utf8');
const providers = fs.readFileSync(path.join(root, files[1]), 'utf8');
const evaluator = fs.readFileSync(path.join(root, files[2]), 'utf8');
const checks = [
  [verifier.includes('feeTimingAffirmativeViolation'), 'negation-safe fee timing verifier missing'],
  [verifier.includes('unsupported_automatic_payment_verification_claim'), 'automatic payment verification guard missing'],
  [verifier.includes('unsupported_payment_deferral_policy'), 'payment deferral guard missing'],
  [verifier.includes('unsupported_no_application_exists_claim'), 'no-application truth guard missing'],
  [verifier.includes('unsupported_no_payment_due_claim'), 'no-payment-due truth guard missing'],
  [verifier.includes('unsupported_current_fee_due_claim'), 'current fee due truth guard missing'],
  [verifier.includes('unexecuted_payment_link_delivery_promise'), 'payment link promise guard missing'],
  [providers.includes('customer-reported fact'), 'customer-attribution prompt missing'],
  [providers.includes('احترم النفي حرفيًا'), 'judge negation calibration missing'],
  [providers.includes('AMEEENPAY أو AMENPAY فقط'), 'canonical payment aliases missing'],
  [providers.includes('النظام يتحقق من الدفع تلقائيًا'), 'auto-verification prohibition prompt missing'],
  [evaluator.includes('deterministic policy/truth findings are the authoritative hard-critical layer'), 'deterministic hard-critical authority missing'],
  [evaluator.includes('judge_review:'), 'semantic judge review tagging missing'],
];
for (const [ok, msg] of checks) if (!ok) throw new Error(msg);

// Runtime smoke checks for the exact false-positive / truth patterns observed in the 72-case run.
const commonJs = ts.transpileModule(verifier, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  fileName: files[0],
}).outputText;
function normalizeArabicText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
const mod = { exports: {} };
const sandbox = {
  module: mod,
  exports: mod.exports,
  console,
  require(id) {
    if (id === '../text') return { normalizeArabicText };
    if (id === '../customerFacingPolicy') return { hasInternalCustomerFacingLanguage: () => false };
    throw new Error(`Unexpected verifier require in selftest: ${id}`);
  },
};
vm.runInNewContext(commonJs, sandbox, { filename: 'policyVerifier.selftest.js' });
const pv = mod.exports;
const weak = { customer_message: 'x', historical_truth_confidence: 'none', historical_truth: {}, wa_id: '9627', tracking_id: null };
function must(cond, msg) { if (!cond) throw new Error(msg); }
let result = pv.archiveReplyPolicyViolations('رسوم فتح الملف 5 دنانير، وليست في المكتب أو عند الاستلام.');
must(!result.includes('wrong_file_fee_timing_or_office_payment_claim'), 'negated office/pickup statement falsely flagged');
result = pv.archiveReplyPolicyViolations('رسوم فتح الملف 5 دنانير وتدفع عند الاستلام.');
must(result.includes('wrong_file_fee_timing_or_office_payment_claim'), 'affirmative wrong pickup timing not flagged');
result = pv.archiveTruthPolicyViolations(weak, 'إذا ظهر من الإدارة إنه الطلب مؤهل مبدئيًا، بتظهر تعليمات الدفع.');
must(!result.includes('unsupported_application_state_claim_low_truth'), 'conditional preliminary state falsely flagged');
result = pv.archiveTruthPolicyViolations(weak, 'حاليًا لا يوجد أي دفع مطلوب منك.');
must(result.includes('unsupported_no_payment_due_claim'), 'unsupported no-payment-due claim not flagged');
result = pv.archiveTruthPolicyViolations(weak, 'بعد التحويل النظام بيتحقق من العملية تلقائيًا.');
must(result.includes('unsupported_automatic_payment_verification_claim'), 'automatic payment verification claim not flagged');
result = pv.archiveTruthPolicyViolations(weak, 'ممكن تأجيل الدفع حسب الترتيب مع الفريق.');
must(result.includes('unsupported_payment_deferral_policy'), 'unsupported payment deferral not flagged');
result = pv.archiveTruthPolicyViolations(weak, 'ما عندنا طلب تقسيط مسجل بهذا الرقم.');
must(result.includes('unsupported_no_application_exists_claim'), 'unsupported no-application claim not flagged');
result = pv.archiveTruthPolicyViolations(weak, 'إذا حابب أكمل، بوصلك الرابط الرسمي للدفع.');
must(result.includes('unexecuted_payment_link_delivery_promise'), 'unexecuted payment-link promise not flagged');

console.log(`SELFTEST PASS - V2 PHASE 2.4 SEMANTIC TRUTH CALIBRATION (${files.length} TS files transpiled + runtime policy checks)`);
