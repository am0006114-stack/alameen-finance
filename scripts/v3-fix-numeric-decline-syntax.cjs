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
const fixedBlock = block
  .replace(/\\n(\s*&&)/g, '\n$1')
  .replace(/;\\n(\s*)$/g, ';\n$1');

if (block === fixedBlock) {
  if (/\\n\s*&&|;\\n\s*$/.test(block)) {
    throw new Error('literal escaped newline still present in numeric decline block');
  }
  console.log('PASS - numeric decline syntax already clean');
  process.exit(0);
}

src = src.slice(0, start) + fixedBlock + src.slice(end);
fs.writeFileSync(target, src, 'utf8');

const updated = fs.readFileSync(target, 'utf8');
const verifyStart = updated.indexOf(startToken);
const verifyEnd = updated.indexOf(endToken, verifyStart);
const verify = updated.slice(verifyStart, verifyEnd);
if (/\\n\s*&&|;\\n\s*$/.test(verify)) throw new Error('literal escaped newline still present in numeric decline block');

console.log('PASS - converted literal \\n sequences to real TypeScript newlines');
