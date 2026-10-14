const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const checks = [];
function ok(name, condition){ checks.push({name,condition:Boolean(condition)}); if(!condition) console.error('FAIL:',name); }

const durable = read('app/api/whatsapp/webhook/_lib/v3-os/durableIngress.ts');
const tgRoute = read('app/api/telegram/webhook/route.ts');
const hold = read('app/api/telegram/_lib/intelligenceHold.ts');
const worker = read('app/api/internal/telegram-intelligence/worker/route.ts');
const schema = read('scripts/phase18-5-1-humanized-intelligence-hold-schema.sql');
const migration = read('app/api/whatsapp/webhook/_lib/v3-os/telegramMigration.ts');

ok('WhatsApp durable hold is exactly 20 seconds', durable.includes('HUMANIZED_INTELLIGENCE_HOLD_MS = 20_000'));
ok('WhatsApp new bubble extends queued/retry quiet window', durable.includes('.in("status", ["queued", "retry_wait"])') && durable.includes('next_attempt_at: dueAt'));
ok('No 20-second function sleep in WhatsApp', !/setTimeout\s*\([^,]+,\s*20_?000/.test(durable));
ok('Telegram webhook queues humanized intelligence', tgRoute.includes('enqueueTelegramIntelligenceHold') && tgRoute.includes('held_for_humanized_intelligence'));
ok('Telegram webhook no longer runs V3 immediately', !tgRoute.includes('runV3ProductionLive'));
ok('Telegram hold is exactly 20 seconds', hold.includes('TELEGRAM_INTELLIGENCE_HOLD_SECONDS = 20'));
ok('Telegram combines sequential bubbles into one reasoning turn', hold.includes('افهمها كوحدة واحدة كاملة قبل الرد'));
ok('Known single-message facts stay deterministic', hold.includes('telegramPresentationIntent(customerText)') && hold.includes('buildTelegramPaymentReply'));
ok('Stale reasoning is suppressed if a newer bubble arrives', hold.includes('superseded_after_reasoning') && hold.includes('holdStillCurrent'));
ok('Telegram Real Actions remain double-guarded', hold.includes('config.realActionsEnabled && control.realActionsEnabled'));
ok('Internal worker requires existing durable worker token', worker.includes('verifyDurableIngressWorkerToken'));
ok('Schema scheduler is sub-minute without sleeping Vercel', schema.includes("'5 seconds'") && schema.includes('kick_alameen_humanized_intelligence_workers'));
ok('Schema only calls workers when due jobs exist', schema.includes('v_whatsapp_due') && schema.includes('v_telegram_due'));
ok('Post-payment WhatsApp migration cap remains 5', migration.includes('MIGRATION_MAX_OUTBOUND = 5'));
ok('No Telegram real-action enablement introduced', !schema.includes('TELEGRAM_REAL_ACTIONS_ENABLED=true') && !tgRoute.includes('realActionsEnabled: true'));

const failed = checks.filter(x=>!x.condition);
if(failed.length){
  console.error(`PHASE 18.5.1 SELFTEST FAILED: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`PHASE 18.5.1 HUMANIZED INTELLIGENCE SELFTEST PASS: ${checks.length}/${checks.length}`);
