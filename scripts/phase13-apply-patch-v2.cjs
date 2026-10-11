const fs = require('fs');
const { spawnSync } = require('child_process');

const path = 'scripts/phase13-apply-patch.cjs';
let src = fs.readFileSync(path, 'utf8');

const badReceipt = '\\${receipt ? `\\\\n\\\\nبعد التحويل ارفع الوصل مرة واحدة من الرابط الرسمي المرتبط بطلبك:\\\\n\\${receipt}` : ""}';
const goodReceipt = '\\${receipt ? "\\\\n\\\\nبعد التحويل ارفع الوصل مرة واحدة من الرابط الرسمي المرتبط بطلبك:\\\\n" + receipt : ""}';
if (!src.includes(badReceipt)) throw new Error('Phase 13 receipt runner repair target not found');
src = src.replace(badReceipt, goodReceipt);

const badDuration = "assert(!human.includes('المدة اللي ذكرتها (${duration}) متجاوزة'));";
const goodDuration = "assert(!human.includes('المدة اللي ذكرتها (' + '$' + '{duration}) متجاوزة'));";
if (!src.includes(badDuration)) throw new Error('Phase 13 duration selftest repair target not found');
src = src.replace(badDuration, goodDuration);

fs.writeFileSync(path, src, 'utf8');
const check = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status || 1);
const run = spawnSync(process.execPath, [path], { stdio: 'inherit' });
process.exit(run.status || 0);
