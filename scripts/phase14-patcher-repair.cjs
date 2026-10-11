const fs = require('fs');

const path = 'scripts/phase14-audit-rebuild-apply.cjs';
let src = fs.readFileSync(path, 'utf8');

function fix(from, to, label) {
  if (!src.includes(from)) throw new Error(`missing patcher repair anchor: ${label}`);
  src = src.replace(from, to);
}

fix(
  'if (["refund_requested", "refund_completed", "cancelled"].includes(stage)) return `طلبك الحالي مش بمرحلة دفع رسوم فتح الملف؛ حالته الآن ${customerFacingStatusLabel(truth.application!)}.`;',
  'if (["refund_requested", "refund_completed", "cancelled"].includes(stage)) return "طلبك الحالي مش بمرحلة دفع رسوم فتح الملف؛ حالته الآن " + customerFacingStatusLabel(truth.application!) + ".";',
  'nested target template in payment access reply'
);

fix(
  'const key=`public:${n(clean).slice(0,260)}`;',
  'const key="public:"+n(clean).slice(0,260);',
  'nested public cache key template'
);

fix(
  'input:`التاريخ: ${today}\\nالسؤال العام المنقح: ${clean}`',
  'input:"التاريخ: "+today+"\\nالسؤال العام المنقح: "+clean',
  'nested public input template'
);

fs.writeFileSync(path, src, 'utf8');
console.log('PHASE 14 PATCHER QUOTING REPAIRED');
