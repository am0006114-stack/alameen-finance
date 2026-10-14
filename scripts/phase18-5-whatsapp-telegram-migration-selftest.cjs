const fs = require("fs");

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const presentation = fs.readFileSync("app/api/telegram/_lib/presentation.ts", "utf8");
const telegramWebhook = fs.readFileSync("app/api/telegram/webhook/route.ts", "utf8");
const telegramHandoff = fs.readFileSync("app/api/telegram/_lib/handoff.ts", "utf8");
const migration = fs.readFileSync("app/api/whatsapp/webhook/_lib/v3-os/telegramMigration.ts", "utf8");
const waRoute = fs.readFileSync("app/api/whatsapp/webhook/route.ts", "utf8");
const adminPage = fs.readFileSync("app/admin/applications/[id]/page.tsx", "utf8");
const schema = fs.readFileSync("scripts/phase18-5-whatsapp-telegram-migration-schema.sql", "utf8");

must(presentation.includes('"payment"'), "presentation payment intent missing");
must(presentation.includes("buildTelegramPaymentReply"), "deterministic Telegram payment writer missing");
must(presentation.includes("fileOpeningPaymentWriterTruth"), "payment reply must use canonical payment destination truth");
must(presentation.includes("payment_proof_pending_admin"), "pending receipt guard missing");
must(presentation.includes("hasAuthoritativePaymentConfirmation"), "confirmed payment guard missing");
must(presentation.includes("رسوم فتح الملف (5 دنانير فقط)"), "5 JOD deterministic payment copy missing");

must(telegramWebhook.includes("buildTelegramPaymentReply"), "Telegram webhook payment presentation import missing");
must(telegramWebhook.includes('presentationIntent === "payment"'), "Telegram webhook payment short-circuit missing");

must(telegramHandoff.includes("whatsapp_application_contacts"), "approved WhatsApp alias handoff support missing");
must(telegramHandoff.includes('eq("status", "approved")'), "handoff alias must require approved status");
must(telegramHandoff.includes("whatsapp_telegram_migration_state"), "handoff consume must mark migration state linked");

must(migration.includes("MIGRATION_MAX_OUTBOUND = 5"), "hard five-message migration cap missing");
must(migration.includes("(state?.outbound_count ?? 0) >= MIGRATION_MAX_OUTBOUND"), "null-safe TypeScript migration cap guard missing");
must(migration.includes("MIGRATION_REMINDER_COOLDOWN_MS = 10 * 60_000"), "anti-burst migration cooldown missing");
must(migration.includes("WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60_000"), "24h customer-service window guard missing");
must(migration.includes("paymentAuthoritativelyConfirmed"), "authoritative payment gate missing");
must(migration.includes("customer_claimed_paid") === false, "customer_claimed_paid must never be treated as authoritative confirmation");
must(migration.includes("waiting_for_customer_service_window"), "outside-24h safe wait path missing");
must(migration.includes("telegram_customer_links"), "existing Telegram link detection missing");
must(migration.includes("preferredWhatsAppForApplication"), "approved WhatsApp alias preference missing");
must(migration.includes("migration_cap_reached"), "migration cap suppression path missing");
must(migration.includes("already_linked_notice_suppressed"), "post-link WhatsApp suppression missing");
must(migration.includes('handled_by: "telegram_migration"'), "migration outbound audit logging missing");

must(waRoute.includes("handlePostPaymentWhatsAppMigrationInbound"), "WhatsApp post-payment migration gate missing");
must(waRoute.includes("telegramMigrationGate.handled"), "WhatsApp migration suppression return missing");
must(adminPage.includes("sendPostPaymentTelegramMigrationAfterConfirmation"), "admin payment-confirmed migration trigger missing");
must(adminPage.includes('nextPaymentStatus === "confirmed"'), "admin trigger must be tied to confirmed payment");

must(schema.includes("outbound_count integer not null default 0"), "migration state counter missing");
must(schema.includes("outbound_count <= 5"), "database hard cap check missing");
must(schema.includes("interval \'10 minutes\'"), "database atomic anti-burst cooldown missing");
must(schema.includes("security invoker"), "reservation RPC must be security invoker");
must(schema.includes("revoke all on function public.reserve_whatsapp_telegram_migration_message"), "reservation RPC public execute revoke missing");
must(schema.includes("grant execute on function public.reserve_whatsapp_telegram_migration_message"), "service_role RPC grant missing");
must(schema.includes("enable row level security"), "migration state RLS missing");

console.log("PHASE 18.5 WHATSAPP -> TELEGRAM COST-CAPPED MIGRATION + PAYMENT GROUNDING SELFTEST PASS");
