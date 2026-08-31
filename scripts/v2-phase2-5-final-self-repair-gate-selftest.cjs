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
const structuralChecks = [
  [verifier.includes('forbidden_payment_alias_noncanonical'), 'canonical payment alias guard missing'],
  [verifier.includes('unsupported_generic_current_state_claim_low_truth'), 'generic current-state guard missing'],
  [verifier.includes('unsupported_future_notification_or_contact_promise'), 'future notification/contact promise guard missing'],
  [verifier.includes('wrong_first_installment_policy_claim'), 'first-installment exact invariant missing'],
  [providers.includes('runDeepSeekArchiveRepair'), 'archive self-repair provider missing'],
  [providers.includes('archive_repair'), 'archive repair cost purpose missing'],
  [providers.includes('ممنوع تمامًا كتابة أي صيغة'), 'dominant no-payment rule missing'],
  [evaluator.includes('Generate -> deterministic verify -> one focused repair -> verify again'), 'verify-repair-verify loop missing'],
  [evaluator.includes('self_repaired:'), 'repair audit flags missing'],
];
for (const [ok, msg] of structuralChecks) if (!ok) throw new Error(msg);

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
vm.runInNewContext(commonJs, sandbox, { filename: 'policyVerifier.p25.selftest.js' });
const pv = mod.exports;
const weak = { customer_message: 'x', historical_truth_confidence: 'none', historical_truth: {}, wa_id: '9627', tracking_id: null };
function must(cond, msg) { if (!cond) throw new Error(msg); }

must(pv.archiveReplyPolicyViolations('ادفع على PAYAMEEN').includes('forbidden_payment_alias_noncanonical'), 'PAYAMEEN was not rejected');
must(!pv.archiveConversationPolicyViolations({ ...weak, customer_message: 'موظف حكومي في البنك المركزي' }, 'السعر حسب الخطة المعتمدة').includes('explicit_human_handoff_missed'), 'occupation falsely treated as handoff request');
must(pv.archiveConversationPolicyViolations({ ...weak, customer_message: 'وصلني لحدا' }, 'شو استفسارك؟').includes('explicit_human_handoff_missed'), 'explicit handoff request not detected');
must(pv.archiveConversationPolicyViolations({ ...weak, customer_message: 'بدي موظف' }, 'رح أوصل طلبك للفريق ورح يتواصلوا معك').includes('unexecuted_handoff_claim'), 'false handoff execution promise not detected');
must(pv.archiveTruthPolicyViolations(weak, 'حاليًا ما في أي دفع مطلوب منك').includes('unsupported_no_payment_due_claim'), 'dominant unsupported no-payment claim not detected');
must(pv.archiveTruthPolicyViolations(weak, 'طلبك قيد المتابعة').includes('unsupported_generic_current_state_claim_low_truth'), 'generic current state not detected');
must(pv.archiveTruthPolicyViolations(weak, 'رح يوصلك تحديث لما يصير شي').includes('unsupported_future_notification_or_contact_promise'), 'future notification promise not detected');
must(pv.archiveTruthPolicyViolations(weak, 'القسط الأول يكون بعد الاستلام حسب الاتفاق').includes('wrong_first_installment_policy_claim'), 'wrong first-installment wording not detected');
must(!pv.archiveTruthPolicyViolations(weak, 'القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد').includes('wrong_first_installment_policy_claim'), 'correct first-installment policy falsely rejected');

console.log(`SELFTEST PASS - V2 PHASE 2.5 FINAL SELF-REPAIR GATE (${files.length} TS files transpiled + runtime truth/policy checks)`);
