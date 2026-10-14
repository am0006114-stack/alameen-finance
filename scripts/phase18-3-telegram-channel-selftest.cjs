const fs = require("fs");
const path = require("path");

const root = process.cwd();
const files = {
  webhook: "app/api/telegram/webhook/route.ts",
  handoff: "app/api/telegram/handoff/route.ts",
  health: "app/api/telegram/health/route.ts",
  config: "app/api/telegram/_lib/config.ts",
  api: "app/api/telegram/_lib/telegramApi.ts",
  handoffLib: "app/api/telegram/_lib/handoff.ts",
  messages: "app/api/telegram/_lib/messages.ts",
  summary: "app/api/telegram/_lib/orderSummary.ts",
  schema: "scripts/phase18-3-telegram-schema.sql",
};
let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { console.log("PASS:", label); passed++; }
  else { console.error("FAIL:", label); failed++; }
}
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }

for (const [name, file] of Object.entries(files)) ok(fs.existsSync(path.join(root, file)), `${name} exists`);

const webhook = read(files.webhook);
const handoff = read(files.handoffLib);
const api = read(files.api);
const schema = read(files.schema);

ok(/x-telegram-bot-api-secret-token/i.test(webhook), "webhook verifies Telegram secret-token header");
ok(/business_message/.test(webhook) && /business_connection/.test(webhook), "business account update types are handled");
ok(/sender_business_bot/.test(webhook), "bot echo loop guard exists");
ok(/human_takeover/.test(webhook) && /markTelegramHumanTakeover/.test(webhook), "manual business-account reply triggers AI pause");
ok(/runV3ProductionLive/.test(webhook) && /waId:\s*link\.canonical_wa_id/.test(webhook), "Telegram reuses the canonical WhatsApp V3 identity");
ok(/config\.realActionsEnabled\s*&&\s*control\.realActionsEnabled/.test(webhook), "real actions require both Telegram and V3 gates");
ok(/saveV3ConversationState/.test(webhook), "V3 state is persisted after Telegram delivery");
ok(/saveCompactHumanMemory/.test(webhook), "compact human memory is persisted after Telegram delivery");
ok(/completeHumanTurnDelivery/.test(webhook), "durable turn journal is completed after Telegram delivery");
ok(/randomBytes\(24\)/.test(handoff) && /sha256/.test(handoff), "handoff token is high entropy and stored by hash");
ok(/\.is\("used_at", null\)/.test(handoff) && /\.gt\("expires_at", now\)/.test(handoff), "handoff token is one-time and expiry guarded");
ok(/https:\/\/t\.me\//.test(handoff) && /\?text=/.test(handoff), "handoff opens the public business chat with a prefilled token message");
ok(/type:\s*"template"/.test(api) === false, "Telegram transport does not use WhatsApp-style templates");
ok(/business_connection_id/.test(api), "outgoing Telegram sends on behalf of the business account");
ok(/readBusinessMessage/.test(api) && /sendChatAction/.test(api), "read and typing business operations are implemented");
ok(/enable row level security/i.test(schema) && /revoke all/i.test(schema), "Telegram tables are private from anon/authenticated roles");
ok(/telegram_messages_transport_dedupe_idx/.test(schema), "transport-level message dedupe index exists");
ok(/telegram_handoff_tokens_expiry_idx/.test(schema), "handoff expiry index exists");
ok(!/national_id|guarantor_national_id|salary\b/.test(read(files.summary)), "customer Telegram summary excludes sensitive identity/salary fields");

console.log(`PHASE 18.3 TELEGRAM FOUNDATION SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
