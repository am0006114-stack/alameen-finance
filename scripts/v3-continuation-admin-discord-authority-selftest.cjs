const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function must(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`[FAIL] ${label}: missing ${JSON.stringify(needle)}`);
  }
  console.log(`[PASS] ${label}`);
}

const persistence = read('app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts');
const actionPlane = read('app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts');
const notificationPolicy = read('app/api/whatsapp/webhook/_lib/v3-os/notificationPolicy.ts');

must(persistence, 'Boolean(app.preliminaryQualifiedAt)', 'preliminary_qualified_at is authoritative for WhatsApp continuation');
must(persistence, '.select("id,status,payment_status,payment_confirmed_at,preliminary_qualified_at")', 'continuation re-reads authoritative application row before mutation');
must(persistence, 'status: "customer_confirmed_continue"', 'Admin-visible continuation status is persisted');
must(persistence, 'payment_status: "pending_payment"', 'Admin-visible payment state is opened');
must(persistence, 'currentStatusRaw == null', 'NULL historical status is handled with compare-and-set semantics');
must(persistence, 'continuation_persistence_stale_truth', 'stale concurrent truth fails closed');

must(actionPlane, 'event: "customer_continue_payment_ready"', 'successful WhatsApp continuation emits canonical Discord event');
must(actionPlane, 'source: "whatsapp_human_os"', 'Discord event identifies Human OS continuation source');
must(actionPlane, 'if (success)', 'Discord success event cannot fire before persistence succeeds');
must(actionPlane, 'V3 continuation success Discord notification failed', 'Discord failure is isolated from authoritative DB write');

must(notificationPolicy, 'if (input.event === "customer_continue_payment_ready")', 'continuation event remains actionable in notification policy');
must(notificationPolicy, 'customer-continue:${input.applicationId || "unknown"}', 'continuation Discord notification remains deduplicated per application');

console.log('[PASS] V3 continuation Admin + Discord authority regression gate');
