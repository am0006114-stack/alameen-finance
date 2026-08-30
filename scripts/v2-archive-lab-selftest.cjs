const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.argv[2] || process.cwd();
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');

const provider = read('app/api/whatsapp/webhook/_lib/v2-conversation/provider.ts');
must(provider.includes('process.env.DEEPSEEK_V2_API_KEY'), 'V2 provider must use DEEPSEEK_V2_API_KEY');
must(!provider.includes('const apiKey = process.env.DEEPSEEK_API_KEY;'), 'V2 provider must not use legacy DeepSeek key');

for (const [p, flag] of [
  ['app/api/internal/whatsapp-v2-shadow/worker/route.ts','ALAMEEN_V2_LIVE_SHADOW_ENABLED'],
  ['app/api/internal/whatsapp-shadow/worker/route.ts','ALAMEEN_LEGACY_SHADOW_ENABLED'],
]) {
  const s = read(p); must(s.includes(flag), `${p} missing default-off flag`); must(s.includes('status: 423'), `${p} missing locked response`);
}

const archiveProvider = read('app/api/whatsapp/webhook/_lib/v2-archive/providers.ts');
must(archiveProvider.includes('DEEPSEEK_V2_API_KEY'), 'archive provider missing DeepSeek V2 key');
must(archiveProvider.includes('OPENAI_V2_API_KEY'), 'archive provider missing OpenAI V2 key');
must(archiveProvider.includes('reserveAiBudget'), 'archive provider missing cost reservation');
must(archiveProvider.includes('store: false'), 'OpenAI archive calls must not store responses');

const worker = read('app/api/internal/whatsapp-v2-archive/worker/route.ts');
must(worker.includes('isAdminLoggedIn'), 'archive worker must require admin');
must(worker.includes('lab_enabled'), 'archive worker must enforce kill switch');

const migration = read('supabase/migrations/20260830223000_v2_archive_evaluation_lab.sql');
must(migration.includes('seed_whatsapp_v2_archive_cases'), 'archive seed RPC missing');
must(migration.includes('reserve_whatsapp_v2_ai_budget'), 'budget reservation RPC missing');
must(!migration.includes('cron.schedule('), 'Phase 2 migration must not schedule any cron');
must(!/create\s+trigger\s+trg_kick_/i.test(migration), 'Phase 2 migration must not create shadow kick triggers');
must(!/update\s+public\.applications/i.test(migration), 'Phase 2 migration must not mutate applications');

const files = [];
function walk(dir) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if(e.isDirectory()) walk(p); else if(/\.(ts|tsx)$/.test(e.name)) files.push(p); } }
walk(path.join(root,'app/api/whatsapp/webhook/_lib/v2-archive'));
walk(path.join(root,'app/api/internal/whatsapp-v2-archive'));
walk(path.join(root,'app/admin/whatsapp-v2-lab'));
for (const rel of ['app/api/whatsapp/webhook/_lib/v2-conversation/provider.ts','app/api/internal/whatsapp-v2-shadow/worker/route.ts','app/api/internal/whatsapp-shadow/worker/route.ts']) files.push(path.join(root,rel));
for (const f of files) {
  const source = fs.readFileSync(f,'utf8');
  const result = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},fileName:f,reportDiagnostics:true});
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length) throw new Error(`${f}: ${errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; ')}`);
}
console.log(`V2 ARCHIVE LAB SELFTEST PASS - ${files.length} TypeScript files transpiled`);
