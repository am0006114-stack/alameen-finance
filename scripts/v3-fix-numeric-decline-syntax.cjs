const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const rel = 'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts';
const target = path.join(root, rel);
let src = fs.readFileSync(target, 'utf8');

const startToken = '  const numericDecisionDecline = ';
const endToken = '  return explicit || contextualDecline || numericDecisionDecline;';
const start = src.indexOf(startToken);
const end = src.indexOf(endToken, start);

if (start < 0 || end < 0) throw new Error('numeric decision decline block not found');

const block = src.slice(start, end);
const fixedBlock = block.replace(/\\\r?\n/g, '\n');

if (block === fixedBlock) {
  console.log('PASS - numeric decline syntax already clean');
  process.exit(0);
}

src = src.slice(0, start) + fixedBlock + src.slice(end);
fs.writeFileSync(target, src, 'utf8');

const verify = fs.readFileSync(target, 'utf8').slice(start, src.indexOf(endToken, start));
if (/\\\r?\n/.test(verify)) throw new Error('literal trailing backslash still present in numeric decline block');

console.log('PASS - removed literal trailing backslashes from numeric decline block');
