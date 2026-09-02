const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const page = read('app/admin/whatsapp-control/page.tsx');
const actions = read('app/admin/whatsapp-control/ControlActions.tsx');
const api = read('app/api/admin/whatsapp-control/route.ts');
const recover = read('app/api/admin/whatsapp-control/recover/route.ts');
const exp = read('app/api/admin/whatsapp-control/export/route.ts');
const route = read('app/api/whatsapp/webhook/route.ts');
must(page.includes('V3 Control Center'), 'control center page missing');
must(actions.includes('Backlog Recovery') && actions.includes('progress'), 'recovery progress UI missing');
must(api.includes('enable_replies') && api.includes('disable_v3') && api.includes('ENABLE_REAL_ACTIONS'), 'control actions incomplete');
must(recover.includes('realActionsEnabled: false'), 'recovery must hard-disable real actions');
must(recover.includes('FREEFORM_WINDOW_MS'), 'WhatsApp freeform window guard missing');
must(recover.includes('runV3ProductionLive'), 'V3 recovery runtime missing');
must(exp.includes('168') && exp.includes('سجل تشغيل واتساب'), 'copy/export windows missing');
must(route.includes('V3 PHASE 6.9 EMERGENCY SAFE FAILOVER'), 'Phase 6.9 safe failover baseline missing');
for (const d of ['whatsapp-shadow','whatsapp-v3-lab','whatsapp-v2-production']) {
  must(read(`app/admin/${d}/page.tsx`).includes('/admin/whatsapp-control'), `${d} not redirected`);
}
console.log('V3 PHASE 7 OPERATOR CONTROL CENTER SELFTEST PASS');
