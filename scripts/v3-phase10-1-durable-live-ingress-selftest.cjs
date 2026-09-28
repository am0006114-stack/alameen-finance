const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let failed = 0;
function ok(cond, label) {
  if (!cond) { console.error(`FAIL: ${label}`); failed++; }
  else console.log(`PASS: ${label}`);
}

const route = read('app/api/whatsapp/webhook/route.ts');
const ingress = read('app/api/whatsapp/webhook/_lib/v3-os/durableIngress.ts');
const worker = read('app/api/internal/whatsapp-live-ingress/worker/route.ts');
const migration = read('supabase/migrations/20260928235500_v3_phase10_1_durable_live_ingress.sql');

const publicPostAt = route.lastIndexOf('export async function POST(request: Request)');
const publicPost = publicPostAt >= 0 ? route.slice(publicPostAt) : '';

ok(route.includes('async function processWhatsAppWebhookBody(request: Request, body: WhatsAppWebhookBody)'), 'legacy live processor is isolated behind a request-aware direct helper');
ok(publicPost.includes('enqueueDurableIngressWebhook(body)'), 'external POST durably enqueues before customer processing');
ok(publicPost.includes('if (ingress.accepted)'), 'external POST has a durable-accept fast return');
ok(publicPost.indexOf('if (ingress.accepted)') < publicPost.indexOf('processWhatsAppWebhookBody(request, body);', publicPost.indexOf('if (ingress.accepted)')), 'direct synchronous processing is only after durable enqueue failure');
ok(publicPost.includes('x-alameen-live-worker-token') && publicPost.includes('verifyDurableIngressWorkerToken'), 'internal worker path is authenticated');
ok(!publicPost.includes('runV3ProductionLive('), 'public ingress wrapper does not invoke AI directly');
ok(route.includes('WHATSAPP_RETRYABLE_UNPROCESSED_INCOMING'), 'existing retry semantics remain inside the internal processor');

ok((route.match(/processWhatsAppWebhookBody\(/g) || []).length === 4, 'processor has one definition and exactly three call sites');
ok(!/processWhatsAppWebhookBody\((?!request[,):])/m.test(route), 'every processor invocation supplies request context');

ok(ingress.includes('`message:${messageId}`'), 'incoming Meta message id is the durable idempotency key');
ok(ingress.includes('.from("whatsapp_live_ingress_jobs")') && ingress.includes('ignoreDuplicates: true'), 'queue insert is idempotent on duplicate Meta delivery');
ok(!/openai|deepseek|gpt-5|solHybridRuntime/i.test(ingress), 'durable ingress helper makes no model call');
ok(ingress.includes('buildStatusOnlyWebhookBody') && !ingress.includes('event_kind: "status"'), 'delivery/read status callbacks stay out of the AI worker queue');

ok(worker.includes('claim_whatsapp_live_ingress_jobs'), 'worker claims durable jobs through DB lease RPC');
ok(worker.includes('requeue_stale_whatsapp_live_ingress_jobs'), 'worker releases stale processing leases');
ok(worker.includes('"x-alameen-live-worker-token": workerToken'), 'worker calls authenticated internal live processor');
ok(worker.includes('status: permanent ? "dead_letter" : "retry_wait"'), 'worker failures stay in internal retry/dead-letter state');
ok(!/openai|deepseek|gpt-5|solHybridRuntime/i.test(worker), 'worker orchestration itself makes no shadow/model call');

ok(migration.includes('event_key text not null unique'), 'DB enforces one durable job per event key');
ok(migration.includes("status in ('queued','processing','retry_wait','succeeded','dead_letter')"), 'DB has explicit live queue lifecycle');
ok(/for update of j skip locked/i.test(migration), 'worker claim uses SKIP LOCKED');
ok(migration.includes("older.status in ('queued','processing','retry_wait')"), 'claim exposes only oldest unfinished job per conversation');
ok(migration.includes('trg_kick_whatsapp_live_ingress_worker'), 'insert trigger wakes live worker asynchronously');
ok(migration.includes("'alameen-whatsapp-live-ingress-worker'"), 'pg_cron backup drains retries/backlog');
ok(!migration.includes('whatsapp_v2_shadow_jobs') && !migration.includes('whatsapp_shadow_jobs'), 'Phase 10.1 migration does not enqueue any shadow system');

if (failed) {
  console.error(`PHASE 10.1 DURABLE LIVE INGRESS SELFTEST FAILED: ${failed} failure(s)`);
  process.exit(1);
}
console.log('PHASE 10.1 DURABLE LIVE INGRESS SELFTEST PASSED');
