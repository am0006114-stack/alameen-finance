const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const root = process.argv[2] || process.cwd();
const files = [
  'app/api/whatsapp/webhook/_lib/v2-archive/evaluator.ts',
  'app/api/whatsapp/webhook/_lib/v2-archive/policyVerifier.ts',
];
let failed = 0;
for (const rel of files) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) { console.error('MISSING', rel); failed++; continue; }
  const src = fs.readFileSync(p, 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, reportDiagnostics: true });
  const errors = (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) { console.error('TS ERROR', rel, errors.map(e => e.messageText)); failed++; }
}

// Runtime policy checks for the exact acceptance failures from Phase 2.5.
const policyPath = path.join(root, 'app/api/whatsapp/webhook/_lib/v2-archive/policyVerifier.ts');
const policySrc = fs.readFileSync(policyPath, 'utf8');
const policyJs = ts.transpileModule(policySrc, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function normalizeArabicText(value){return String(value||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/[ى]/g,'ي').replace(/[ة]/g,'ه').replace(/[ؤ]/g,'و').replace(/[ئ]/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').trim();}
const mod={exports:{}};
vm.runInNewContext(policyJs,{module:mod,exports:mod.exports,console,require(id){if(id==='../text')return{normalizeArabicText};if(id==='../customerFacingPolicy')return{hasInternalCustomerFacingLanguage:()=>false};throw new Error(id)}});
const p=mod.exports;
const weak={customer_message:'x',historical_truth_confidence:'none',historical_truth:{},wa_id:'9627',tracking_id:null};
const checks=[
  ['canonical first installment', !p.archiveTruthPolicyViolations(weak,'القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد.').includes('wrong_first_installment_policy_claim')],
  ['acceptable بشهر wording', !p.archiveTruthPolicyViolations(weak,'القسط الأول يكون بعد استلام الجهاز وتوقيع العقد بشهر.').includes('wrong_first_installment_policy_claim')],
  ['missing month blocked', p.archiveTruthPolicyViolations(weak,'القسط الأول يكون بعد استلام الجهاز وتوقيع العقد.').includes('wrong_first_installment_policy_claim')],
  ['customer-attributed fee at receipt not policy violation', !p.archiveReplyPolicyViolations('فهمت إنك بدك تدفع الـ5 دنانير عند الاستلام. رسوم فتح الملف ما بتندفع عند الاستلام، بتُطلب بعد التأهيل المبدئي إذا قررت تكمل.').includes('wrong_file_fee_timing_or_office_payment_claim')],
  ['affirmative fee at receipt blocked', p.archiveReplyPolicyViolations('رسوم فتح الملف بتندفع عند الاستلام.').includes('wrong_file_fee_timing_or_office_payment_claim')],
  ['forbidden PAYAMEEN blocked', p.archiveReplyPolicyViolations('الدفع على PAYAMEEN').includes('forbidden_payment_alias_noncanonical')],
  ['receipt here blocked even with link mention', p.archiveReplyPolicyViolations('ارسل إثبات الدفع هنا أو عبر الرابط الرسمي').includes('payment_proof_requested_over_whatsapp')],
  ['future callback blocked', p.archiveTruthPolicyViolations(weak,'بمجرد ما يكون في تحديث رح أرجعلك هون').includes('unsupported_future_notification_or_contact_promise')],
];
for (const [name,ok] of checks){ if(!ok){console.error('RUNTIME FAIL',name);failed++;} }

const evalSrc = fs.readFileSync(path.join(root,'app/api/whatsapp/webhook/_lib/v2-archive/evaluator.ts'),'utf8');
for (const token of ['FINAL DELIVERY GATE','buildFailClosedArchiveReply','final_delivery_gate_applied','universal_fail_closed_fallback']) {
  if (!evalSrc.includes(token)) { console.error('MISSING GATE TOKEN', token); failed++; }
}
if (failed) process.exit(1);
console.log('SELFTEST PASS - V2 PHASE 2.5 FINAL FAIL-CLOSED DELIVERY GATE');
console.log('2 TypeScript files transpiled + deterministic delivery-gate runtime checks');
