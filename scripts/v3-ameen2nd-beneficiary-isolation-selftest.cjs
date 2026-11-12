'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'app/api/whatsapp/webhook/_lib/v3-os');
const read = (file) => fs.readFileSync(path.join(base, file), 'utf8');
const compiled = ts.transpileModule(read('paymentDestinationOverride.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics.filter((x)=>x.category===ts.DiagnosticCategory.Error).length, 0);
const sandbox={module:{exports:{}},require}; sandbox.exports=sandbox.module.exports;
vm.runInNewContext(compiled.outputText,sandbox,{timeout:3000});
const m=sandbox.module.exports;
const canonical=m.currentFileOpeningPaymentRule();
const truth=m.fileOpeningPaymentWriterTruth();
assert.equal(m.containsAllCurrentFileOpeningPaymentDestinations(canonical),true);
assert.equal(truth.channels.cliq.accounts.length,2);
assert.equal(truth.channels.cliq.accounts[0].beneficiaryName,'ABDUL RAHMAN ALHARAHSHEH');
assert.deepEqual(Array.from(truth.channels.cliq.accounts[0].aliases),['PAYAMEEEN','AMEEN1ST','AM500337']);
assert.deepEqual(Array.from(truth.channels.cliq.accounts[1].aliases),['AMEEN2ND']);
assert.equal(truth.channels.cliq.accounts[1].beneficiaryName,'مصطفى مخلد مطلق');
assert.equal(truth.channels.cliq.accounts[1].bankName,'البنك العربي');
assert.equal(truth.channels.orangeMoney.phone,'0788500337');
assert.equal(m.containsCurrentFileOpeningPaymentDestination('AMEEN2ND'),true);
assert.equal(m.containsLegacyFileOpeningPaymentDestination('AMEEENPAY'),true);
assert.ok(m.allFileOpeningPaymentExecutionTokens().includes('AMEEN2ND'));
assert.ok(m.allFileOpeningPaymentExecutionTokens().includes('مصطفى مخلد مطلق'));
assert.equal(m.containsAllCurrentFileOpeningPaymentDestinations(canonical.replace('AMEEN2ND','OTHER')),false);
assert.equal(m.containsAllCurrentFileOpeningPaymentDestinations(canonical.replace('مصطفى مخلد مطلق','ABDUL RAHMAN ALHARAHSHEH')),false);
assert.equal(m.containsAllCurrentFileOpeningPaymentDestinations(canonical.replace('البنك العربي','بنك آخر')),false);
assert.ok(m.paymentDestinationPresentationViolations('CliQ (البنك العربي): AMEEN2ND - اسم المستفيد: ABDUL RAHMAN ALHARAHSHEH').includes('secondary_cliq_beneficiary_missing_or_wrong'));
for(const file of ['writerContract.ts','verifier.ts','nativeConversationKernel.ts','runtimeLive.ts','paymentClosingGuard.ts']){
  assert.ok(/AMEEN2ND|fileOpeningPaymentBeneficiaryGuidance/.test(read(file)),file+' contains secondary payment integration');
}
console.log('AMEEN2ND recipient isolation and legacy payment-safety regressions PASS');