const fs = require('node:fs');
const path = require('node:path');

const rel = 'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts';
const file = path.join(process.cwd(), rel);
let source = fs.readFileSync(file, 'utf8');

const leaked = 'مستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية، أو إذا ألغيت بعد دفع مؤكد. /* P0_20261022_FIVE_JOD_REFUND_CONTINGENCY */';
const clean = 'مستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية، أو إذا ألغيت بعد دفع مؤكد.';
const anchor = '    return `تمام، هيك بنكمّل. رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير فقط؛ منفصلة عن ثمن الجهاز والقسط الأول، ومستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية، أو إذا ألغيت بعد دفع مؤكد.';
const commentedAnchor = '    // P0_20261022_FIVE_JOD_REFUND_CONTINGENCY\n    return `تمام، هيك بنكمّل. رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير فقط؛ منفصلة عن ثمن الجهاز والقسط الأول، ومستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية، أو إذا ألغيت بعد دفع مؤكد.';

if (source.includes(leaked)) source = source.replace(leaked, clean);
if (!source.includes('// P0_20261022_FIVE_JOD_REFUND_CONTINGENCY')) {
  if (!source.includes(anchor)) throw new Error('P0 cleanup anchor missing');
  source = source.replace(anchor, commentedAnchor);
}
if (source.includes('/* P0_20261022_FIVE_JOD_REFUND_CONTINGENCY */')) {
  throw new Error('P0 marker still leaks into customer-facing copy');
}

fs.writeFileSync(file, source, 'utf8');
console.log('PASS: customer-facing five-JOD copy contains no internal marker');
