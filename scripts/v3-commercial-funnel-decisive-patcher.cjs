const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const target = path.join(root, 'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts');
if (!fs.existsSync(target)) throw new Error(`missing target: ${target}`);
let src = fs.readFileSync(target, 'utf8');

const oldNeedle = '  if (isContinuationRevenueReady(app)) {\n    // Phase 9.1 P0: once informed continuation is confirmed, the receipt URL is';
const newNeedle = '  if (commercial === "payment_ready") {\n    // Phase 9.1 P0: payment handoff is allowed only after continuation is durably persisted.\n    // A preliminary_qualified application is the decision stage, never payment-ready.\n    // Once informed continuation is confirmed, the receipt URL is';

const oldCount = src.split(oldNeedle).length - 1;
const newCount = src.split(newNeedle).length - 1;
if (newCount === 1 && oldCount === 0) {
  console.log('PASS - persistence-safe payment handoff patch already present');
  process.exit(0);
}
if (oldCount !== 1) throw new Error(`expected exactly one continuation payment handoff anchor; found ${oldCount}`);
src = src.replace(oldNeedle, newNeedle);
fs.writeFileSync(target, src, 'utf8');
console.log('PASS - payment handoff now requires persisted payment_ready commercial state');
