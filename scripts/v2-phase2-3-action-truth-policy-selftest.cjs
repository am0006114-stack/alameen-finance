const fs = require('fs');
const path = require('path');

const root = process.argv[2];
if (!root) throw new Error('Project root argument required');
const ts = require(path.join(root, 'node_modules', 'typescript'));
const files = [
  'app/api/whatsapp/webhook/_lib/v2-archive/policyVerifier.ts',
  'app/api/whatsapp/webhook/_lib/v2-archive/providers.ts',
];
for (const rel of files) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) throw new Error(`Missing ${rel}`);
  const src = fs.readFileSync(full, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
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
const providers = fs.readFileSync(path.join(root, files[1]), 'utf8');
const checks = [
  [verifier.includes('payment_proof_requested_outside_official_link'), 'payment-proof WhatsApp guard missing'],
  [verifier.includes('wrong_file_fee_timing_or_office_payment_claim'), 'file fee timing/office guard missing'],
  [verifier.includes('wrong_file_fee_timing_before_preliminary_qualification'), 'premature file fee guard missing'],
  [verifier.includes('unsupported_interest_or_religious_claim'), 'interest/religious claim guard missing'],
  [verifier.includes('external_purchase_price_assumption'), 'external purchase-price assumption guard missing'],
  [verifier.includes('unexecuted_state_action_claim'), 'unexecuted state-action claim guard missing'],
  [verifier.includes('unexecuted_handoff_claim'), 'unexecuted handoff claim guard missing'],
  [verifier.includes('unsupported_review_eta_claim'), 'review ETA guard missing'],
  [verifier.includes('unsupported_appointment_scheduling_promise'), 'appointment scheduling guard missing'],
  [verifier.includes('unsupported_variable_down_payment_claim'), 'variable down-payment guard missing'],
  [verifier.includes('unsupported_refund_state_claim_low_truth'), 'natural refund-state truth guard missing'],
  [providers.includes('تُطلب فقط بعد التأهيل المبدئي'), 'correct fee timing prompt missing'],
  [providers.includes('بعد شهر من استلام الجهاز وتوقيع العقد'), 'first installment rule missing'],
  [providers.includes('إثباتات الدفع/صور التحويل لا تُطلب عبر واتساب'), 'payment proof secure-link prompt missing'],
  [providers.includes('فهم الطلب شيء وتنفيذه شيء آخر'), 'action execution separation judge rule missing'],
  [providers.includes('ممنوع اختراع مدة مراجعة'), 'no invented review ETA prompt missing'],
];
for (const [ok, msg] of checks) if (!ok) throw new Error(msg);
console.log(`SELFTEST PASS - V2 PHASE 2.3 ACTION TRUTH + COMMERCIAL POLICY (${files.length} TS files transpiled)`);
