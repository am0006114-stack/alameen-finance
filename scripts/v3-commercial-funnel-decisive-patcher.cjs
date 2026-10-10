const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const target = path.join(root, 'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts');
if (!fs.existsSync(target)) throw new Error(`missing target: ${target}`);
let src = fs.readFileSync(target, 'utf8');

const oldAnchor = /  if \(isContinuationRevenueReady\(app\)\) \{\r?\n    \/\/ Phase 9\.1 P0: once informed continuation is confirmed, the receipt URL is/;
const newAnchor = /  if \(commercial === "payment_ready"\) \{\r?\n    \/\/ Phase 9\.1 P0: payment handoff is allowed only after continuation is durably persisted\./;

if (newAnchor.test(src) && !oldAnchor.test(src)) {
  console.log('PASS - persistence-safe payment handoff patch already present');
  process.exit(0);
}

const matches = src.match(new RegExp(oldAnchor.source, 'g')) || [];
if (matches.length !== 1) {
  throw new Error(`expected exactly one continuation payment handoff anchor; found ${matches.length}`);
}

src = src.replace(oldAnchor,
  '  if (commercial === "payment_ready") {\n' +
  '    // Phase 9.1 P0: payment handoff is allowed only after continuation is durably persisted.\n' +
  '    // A preliminary_qualified application is the decision stage, never payment-ready.\n' +
  '    // Once informed continuation is confirmed, the receipt URL is'
);

fs.writeFileSync(target, src, 'utf8');
console.log('PASS - payment handoff now requires persisted payment_ready commercial state');
