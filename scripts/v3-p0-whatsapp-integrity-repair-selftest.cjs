"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = (filename) => fs.readFileSync(path.join(root, filename), "utf8");
const webhook = source("app/api/whatsapp/webhook/route.ts");
const delivery = source("app/api/whatsapp/webhook/_lib/preliminaryTemplateDelivery.ts");
const adapter = source("app/api/whatsapp/webhook/_lib/v3-os/transactionalActionAdapter.ts");
const actionPlane = source("app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts");
const migration = source("app/api/whatsapp/webhook/_lib/v3-os/telegramMigration.ts");

assert(webhook.includes("reconcilePreliminaryTemplateFailure"), "Meta status processing must call the reconciliation helper");
assert(webhook.includes('matchedExistingMessage && statusValue === "failed"'), "Only matched failed Meta deliveries may reconcile");
assert(delivery.includes('.eq("message_type"') === false, "Template event identity must be checked after canonical message lookup");
assert(delivery.includes('message?.message_type !== "template_event"'), "Never treat customer text as a failed preliminary template");
assert(delivery.includes('startsWith("PRELIMINARY_APPROVAL_TEMPLATE_SENT")'), "Reconciliation must be scoped to the preliminary template");
assert(delivery.includes('.eq("preliminary_whatsapp_status", "sent")'), "Use compare-and-set to avoid duplicate failure actions");
assert(delivery.includes('.eq("status", "preliminary_qualified")'), "Do not alter progressed applications");
assert(delivery.includes('preliminary_whatsapp_status: "failed"'), "Record true Meta delivery failure");
assert(!delivery.includes("preliminary_whatsapp_sent_at:"), "Do not re-enable automatic cron retries after a Meta failure");
assert(!delivery.includes('payment_status:') && !delivery.includes('payment_confirmed_at:'), "Never change payment facts");
assert(delivery.includes('sendDiscordNotification'), "Alert administration on an undeliverable preliminary approval");

const sensitive = adapter.match(/const ADMIN_EXECUTION_ONLY_MUTATIONS = new Set\(\[([\s\S]*?)\]\);/);
assert(sensitive, "Manual-only action allowlist must be present");
for (const action of ["cancel_application", "request_refund", "stop_refund", "reopen_application"]) {
  assert(sensitive[1].includes('"' + action + '"'), action + " must require administration");
}
assert(!sensitive[1].includes("continue_application"), "Five-JOD continuation must stay outside sensitive action restriction");
assert(!sensitive[1].includes("link_whatsapp_alias"), "Safe WhatsApp alias linking stays enabled");
assert(adapter.includes('blocker: "sensitive_mutation_requires_manual_admin"'), "Manual action must fail closed");
assert(actionPlane.includes("persistExplicitContinuation"), "Authoritative commercial continuation remains operational");
assert(migration.includes('link.includes("🌐 متابعة على الموقع:")'), "Handoff copy must distinguish web choice");
assert(migration.includes("الخيَاران مرتبطان بنفس الطلب"), "Both channels must be presented equally");

console.log("P0 WhatsApp production integrity + untouched commercial continuation contracts PASS");
