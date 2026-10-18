const fs = require('fs');
const path = require('path');
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/hostedtoolcache/node/22.23.3/x64/lib/node_modules/typescript'); }

const root = process.argv[2] || process.cwd();
let passed = 0;
let failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log(`PASS ${passed}: ${label}`); }
  else { failed++; console.error(`FAIL: ${label}`); }
};
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const configPath = 'app/api/telegram/_lib/config.ts';
const handoffPath = 'app/api/telegram/_lib/handoff.ts';
const webhookPath = 'app/api/telegram/webhook/route.ts';
const config = read(configPath);
const handoff = read(handoffPath);
const webhook = read(webhookPath);

function transpiles(rel) {
  const result = ts.transpileModule(read(rel), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    reportDiagnostics: true,
    fileName: rel,
  });
  const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) console.error(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('\n'));
  return errors.length === 0;
}

ok(config.includes('TELEGRAM_HANDOFF_TTL_MINUTES || "1440"'), 'handoff default is one full day');
ok(config.includes('Math.max(configuredHandoffTtl, 24 * 60)') && config.includes('Math.min('), 'historical shorter TTL values are normalized to the one-day secure window');
ok(!config.includes('TELEGRAM_HANDOFF_TTL_MINUTES || "20"'), 'twenty-minute handoff default is retired');

ok(/randomBytes\(24\)/.test(handoff), 'handoff token keeps high entropy');
ok(/createHash\("sha256"\)/.test(handoff), 'handoff token remains hash-stored');
ok(/\.is\("used_at", null\)/.test(handoff), 'handoff remains one-time');
ok(/\.gt\("expires_at", now\)/.test(handoff), 'handoff remains expiry guarded');
ok(/applicationId:\s*string/.test(handoff) && /telegram_handoff_application_contact_mismatch/.test(handoff), 'handoff remains application/contact bound');

ok(webhook.includes('رابط تيليجرام جديد'), 'expired/invalid handoff gives a concrete recovery instruction');
ok(!webhook.includes('افتح أحدث رابط متابعة وصلك من الأمين على واتساب'), 'dead-end latest-link instruction is retired');
ok(!webhook.includes('ما رح أدّعي إني فهمت محتوى المرفق'), 'customer media reply no longer exposes internal safety wording');
ok(!webhook.includes('خليه للمتابعة البشرية من نفس المحادثة'), 'media reply no longer invents a human handoff path');
ok(webhook.includes('telegramRealActionsConfigured: config.realActionsEnabled'), 'Telegram diagnostics report the configured Real Actions gate truthfully');
ok(!/realActionsEnabled:\s*false/.test(webhook), 'stale hardcoded Real Actions=false diagnostic is retired');
ok(webhook.includes('phase: "18.6.1"'), 'Telegram health identity reports Phase 18.6.1');

for (const rel of [configPath, handoffPath, webhookPath]) {
  ok(transpiles(rel), `${rel} transpiles clean`);
}

console.log(`\nPHASE 18.6.1 TELEGRAM HANDOFF/UX SELFTEST: assertions=${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
