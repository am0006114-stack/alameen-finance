const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`PASS: ${name}`); }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function sha(rel) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex'); }

const expectedR21 = {
  'app/api/telegram/_lib/config.ts': '1823315414e77ac4cd1657370d039ef8d038f7411f0a06c101b22e122e72f5a1',
  'app/api/telegram/_lib/types.ts': '9302d3c04ad1a0dea5dc91fbd9d480976c541af69048ecd0b2b6ef1965fa4179',
  'app/api/telegram/_lib/telegramApi.ts': 'c225ebcf0622acbd5a7f2f73a4f30efe68bfed48378a6f8bf32633af53d4fa25',
  'app/api/telegram/_lib/messages.ts': '8888e60e06ff9c64e5bf84364c68af16119359379d1decb403a417b36c8ef368',
  'app/api/telegram/_lib/media.ts': 'ede4af98b3fb32d109fc0d36b82caa8ee1acc4cca4be6c9cd9143e0db8f250bb',
  'app/api/telegram/webhook/route.ts': '560ff4db916d2f8d4fc7c5ab66966e7064cf37fbe149d3f06dc60794e36c01fa',
  'app/api/whatsapp/webhook/_lib/v3-os/whatsappCostGuard.ts': 'e44abffffccef8d629e094be0bdacfe494f0c562d1e93abab2159d856bb643a5',
  'app/api/internal/whatsapp-cost/route.ts': '41af4b05f97934a0c7d708e033cfb24be0df20ba8cab71c06b6e7f5f4fb445fd',
  'scripts/phase18-3-telegram-schema.sql': 'd97d92ebf15c5d7315a8e756fc6b93d80776655e66049483e39be497714cd91a',
};
for (const [rel, hash] of Object.entries(expectedR21)) {
  ok(fs.existsSync(path.join(root, rel)), `R2.1 source exists: ${rel}`);
  if (fs.existsSync(path.join(root, rel))) ok(sha(rel) === hash, `R2.1 source exact: ${rel}`);
}

const readiness = read('app/api/telegram/readiness/route.ts');
ok(/TELEGRAM_READINESS_SECRET/.test(readiness), 'readiness endpoint requires a dedicated secret');
ok(/x-alameen-readiness-secret/.test(readiness), 'readiness endpoint checks secret header');
ok(/read_only_readiness/.test(readiness), 'readiness endpoint declares read-only mode');
ok(/getWebhookInfo/.test(readiness) && /getMe/.test(readiness), 'readiness checks Telegram bot and webhook');
ok(/telegram_business_connections/.test(readiness) && /telegram_customer_links/.test(readiness), 'readiness checks Telegram schema');
ok(/readyForLiveTraffic/.test(readiness), 'readiness returns one live gate');
ok(!/setWebhook/.test(readiness), 'readiness endpoint never mutates Telegram webhook');
ok(!/insert\(|update\(|upsert\(|delete\(/.test(readiness), 'readiness endpoint has no database writes');

const schema = read('scripts/phase18-3-telegram-schema.sql');
ok(/enable row level security/i.test(schema), 'Telegram tables keep RLS enabled');
ok(/public = false/.test(schema), 'Telegram media bucket remains private');

const webhook = read('app/api/telegram/webhook/route.ts');
ok(/x-telegram-bot-api-secret-token/.test(webhook), 'webhook validates Telegram secret token');
ok(/sender_business_bot/.test(webhook), 'webhook prevents bot echo loops');
ok(/human_takeover/.test(webhook), 'webhook supports human takeover');

const config = read('app/api/telegram/_lib/config.ts');
ok(/TELEGRAM_REAL_ACTIONS_ENABLED/.test(config) && /false\)/.test(config), 'Telegram real actions remain off by default');

console.log(`PHASE 18.3 R3 SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
