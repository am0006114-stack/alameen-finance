"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");

const route = read("app/api/whatsapp/webhook/route.ts");
const migration = read("app/api/whatsapp/webhook/_lib/v3-os/telegramMigration.ts");
const actionPlane = read("app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts");
const adapter = read("app/api/whatsapp/webhook/_lib/v3-os/transactionalActionAdapter.ts");
const human = read("app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts");
const legacy = read("app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts");
const tg = read("app/api/telegram/_lib/intelligenceHold.ts");
const web = read("app/api/web-chat/_runtime.ts");
const types = read("app/api/whatsapp/webhook/_lib/v3-os/types.ts");

const paidCutover = route.indexOf("const paidChannelGate = await handlePostPaymentWhatsAppMigrationInbound");
const preReplyMemory = route.indexOf("const preReplyMemory = await getConversationMemory");
const typing = route.indexOf("await sendWhatsAppTypingIndicator(message.id)");
const v3 = route.indexOf("v3Run = await runV3ProductionLive");
assert(paidCutover > -1 && paidCutover < preReplyMemory && paidCutover < typing && paidCutover < v3,
  "Paid gate must run before WhatsApp memory/typing/V3");
assert(route.includes("if (paidChannelGate.handled)"), "Paid event must be short-circuited");
assert(migration.includes('if (!app) return { handled: false'), "Unpaid clients retain the normal five JOD flow");

const inbound = migration.slice(migration.indexOf("export async function handlePostPaymentWhatsAppMigrationInbound"),migration.indexOf("export async function sendPostPaymentTelegramMigrationAfterConfirmation"));
assert(!inbound.includes('ownership.owner === "whatsapp"'), "No paid complaints, refund or status fallback to WhatsApp");
assert(!inbound.includes("loadMigrationSourceMessage("), "Missing message text must not bypass paid cutover");
assert(inbound.includes("return prepareMigrationSend"), "Paid inbound is always handled by deterministic channel router");

assert(migration.includes('state: "recovery_reserved"'), "Expired-link recovery is atomically claimed");
assert(migration.includes('.eq("state", "exhausted")'), "Recovery only applies to exhausted migration states");
assert(migration.includes('state: "recovery_exhausted"'), "Recovery can run only once");
assert(migration.includes('24 * 60 * 60_000'), "Do not issue new links if earlier link remains valid");
assert(migration.includes("MIGRATION_MAX_OUTBOUND = 5"), "Preserve normal five-message migration cap");

assert(migration.includes("const { data: directApps, error: directError }"), "Resolve newest directly-owned application before historical aliases");
assert(migration.includes("return paymentAuthoritativelyConfirmed(latest) ? latest : null;"), "Newer unpaid applications must retain their five-JOD WhatsApp route");
assert(migration.includes('.order("created_at", { ascending: false })'), "Prefer latest application if a number has multiple applications");

assert(types.includes('origin?: "telegram" | "web_chat"'), "Paid action authority needs trusted transport origin");
assert(actionPlane.includes("transportContext: input.transportContext"), "Never lose trusted transport when dispatching actions");
assert(human.includes("transportContext: input.transportContext"), "Human OS passes the server-owned origin into action plane");
assert(legacy.includes("transportContext: input.transportContext"), "Legacy V3 path passes the same server-owned origin");
assert(adapter.includes('transport.origin === "telegram" || transport.origin === "web_chat"'), "Only verified channel origins can execute sensitive mutations");
assert(adapter.includes('transport.applicationId) === String(context.truth.application?.id'), "Secure action must match authenticated application");
assert(adapter.includes("truthHasAuthoritativePaymentConfirmation(context.truth)"), "Secure action requires confirmed payment");
assert(adapter.includes('blocker: "sensitive_mutation_requires_secure_postpayment_channel"'), "WhatsApp-sensitive actions must be denied");
assert(!adapter.includes('blocker: "sensitive_mutation_requires_manual_admin"'), "No human execution blocker for secure paid channels");
assert(tg.includes('origin: "telegram" as const'), "Telegram sets trusted channel origin");
assert(web.includes('origin: "web_chat"'), "Web Chat sets trusted channel origin");
assert(web.includes("realActionsEnabled: control.realActionsEnabled"), "Authenticated Web Chat can execute approved actions");
assert(web.includes("loadPostPaymentChannelState"), "Web Chat retains active paid channel session binding");
assert(web.includes("enforceRateLimit(input.session)"), "Web Chat rate limit remains in force");
assert(tg.includes("config.realActionsEnabled && control.realActionsEnabled"), "Telegram retains operator emergency switch");
console.log("P0 PAID WHATSAPP ZERO-AI CUTOVER + SECURE-CHANNEL ACTION ROUTING: PASS");
