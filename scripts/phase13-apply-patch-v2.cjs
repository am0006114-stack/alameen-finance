const fs = require('fs');
const { spawnSync } = require('child_process');

const path = 'scripts/phase13-apply-patch.cjs';
let src = fs.readFileSync(path, 'utf8');
const bad = '\\${receipt ? `\\\\n\\\\nبعد التحويل ارفع الوصل مرة واحدة من الرابط الرسمي المرتبط بطلبك:\\\\n\\${receipt}` : ""}';
const good = '\\${receipt ? "\\\\n\\\\nبعد التحويل ارفع الوصل مرة واحدة من الرابط الرسمي المرتبط بطلبك:\\\\n" + receipt : ""}';
if (!src.includes(bad)) {
  throw new Error('Phase 13 runner repair target not found');
}
src = src.replace(bad, good);
fs.writeFileSync(path, src, 'utf8');

const check = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status || 1);
const run = spawnSync(process.execPath, [path], { stdio: 'inherit' });
process.exit(run.status || 0);
