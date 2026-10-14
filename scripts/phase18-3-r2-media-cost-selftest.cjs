const fs = require("fs");
const path = require("path");
const root = process.cwd();
const files = {
  webhook: "app/api/telegram/webhook/route.ts",
  config: "app/api/telegram/_lib/config.ts",
  api: "app/api/telegram/_lib/telegramApi.ts",
  media: "app/api/telegram/_lib/media.ts",
  messages: "app/api/telegram/_lib/messages.ts",
  cost: "app/api/whatsapp/webhook/_lib/v3-os/whatsappCostGuard.ts",
  costRoute: "app/api/internal/whatsapp-cost/route.ts",
  schema: "scripts/phase18-3-telegram-schema.sql",
};
let passed = 0, failed = 0;
function ok(cond, label) { if (cond) { console.log("PASS:", label); passed++; } else { console.error("FAIL:", label); failed++; } }
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
for (const [name, file] of Object.entries(files)) ok(fs.existsSync(path.join(root, file)), `${name} exists`);
const webhook = read(files.webhook), config = read(files.config), api = read(files.api), media = read(files.media), messages = read(files.messages), cost = read(files.cost), costRoute = read(files.costRoute), schema = read(files.schema);
ok(/getTelegramFile/.test(api) && /downloadTelegramFile/.test(api), "Telegram file metadata + download transport exists");
ok(/mediaMaxBytes/.test(config) && /TELEGRAM_MEDIA_MAX_MB/.test(config), "media size is bounded by configuration");
ok(/telegram-media/.test(config) && /mediaStorageBucket/.test(config), "private media bucket is configurable");
ok(/persistTelegramMedia/.test(webhook) && /attachTelegramIncomingMedia/.test(webhook), "webhook persists linked-customer media metadata");
ok(/telegramMediaCustomerText/.test(webhook), "trusted voice transcript can re-enter the same V3 conversation turn");
ok(/transcriptionUrl/.test(config) && /TELEGRAM_TRANSCRIPTION_MODEL/.test(config), "voice transcription is optional and provider-configured");
ok(/!config\.transcriptionUrl\s*\|\|\s*!config\.transcriptionModel/.test(media), "no transcription network call occurs unless explicitly configured");
ok(/new ArrayBuffer\(input\.bytes\.byteLength\)/.test(media) && /new Uint8Array\(audioBuffer\)\.set\(input\.bytes\)/.test(media) && /new Blob\(\[audioBuffer\]/.test(media), "voice Blob uses an explicit ArrayBuffer backing store compatible with strict TS DOM typings");
ok(/supabaseAdmin\.storage[\s\S]*\.upload/.test(media), "attachments use private Supabase Storage from server runtime");
ok(/media_too_large/.test(media), "oversized attachments fail closed");
ok(/No|no/.test("No") && /ما رح أدّعي إني فهمت محتوى المرفق/.test(webhook), "unanalysed media never produces a fabricated interpretation");
ok(/transcript/.test(messages) && /effectiveBody/.test(messages), "voice transcript participates in cross-channel memory when available");
ok(/media_storage_path text/.test(schema) && /transcript text/.test(schema), "schema records private media path and transcript");
ok(/insert into storage\.buckets/.test(schema) && /public, file_size_limit/.test(schema), "schema provisions a private bounded media bucket");
ok(/loadWhatsAppMonthlyCostSnapshot/.test(cost), "WhatsApp cost telemetry reads the actual monthly pricing callbacks");
ok(/new Map<string, any>/.test(cost) && /message_id/.test(cost), "cost telemetry deduplicates by provider message id");
ok(/free_customer_service/.test(cost) && /paidService/.test(cost) && /paidUtility/.test(cost), "free service, paid service and utility are separated");
ok(/WHATSAPP_COST_PER_PAID_MESSAGE_USD/.test(cost), "unit price is configuration-driven, not hardcoded against changing Meta pricing");
ok(/obviousLowValueWhatsAppReply/.test(cost), "future paid-egress suppression classifier is present but not wired to Production");
ok(/mode:\s*"observe_only"/.test(costRoute), "R2 cost guard is observe-only and cannot silently suppress customer replies");
ok(/x-alameen-admin-secret/.test(costRoute), "cost endpoint is protected by admin secret");
ok(!/TELEGRAM_BOT_TOKEN\s*=\s*[A-Za-z0-9:_-]{20,}/.test([config,api,media,webhook].join("\n")), "no Telegram bot token is embedded in source");
ok(!/national_id|guarantor_national_id/.test(media + messages), "media transport does not inject identity-number fields");
console.log(`PHASE 18.3 R2 MEDIA + COST SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
