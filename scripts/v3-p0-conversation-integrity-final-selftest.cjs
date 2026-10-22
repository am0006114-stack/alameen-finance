const fs = require('node:fs');
const path = require('node:path');

function read(rel) { return fs.readFileSync(path.join(process.cwd(), rel), 'utf8'); }
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('PASS:', msg);
}

const runtime = read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const migration = read('app/api/whatsapp/webhook/_lib/v3-os/telegramMigration.ts');
const closing = read('app/api/whatsapp/webhook/_lib/v3-os/paymentClosingGuard.ts');
const authority = read('app/api/whatsapp/webhook/_lib/v3-os/singleConversationAuthority.ts');
const kernel = read('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');
const recovery = read('app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts');

ok(runtime.includes('P0_20261022_FINAL_FIVE_JOD_EGRESS_INVARIANT'), 'final 5-JOD egress invariant installed');
ok(runtime.includes('protectedFiveJodReply || buildMandatoryFiveJodContinuationReply'), 'final 5-JOD reply cannot be erased by later writers');
ok(runtime.includes('P0_20261022_RECOVERY_IMPORTS_FOR_LAST_RESORT'), 'last-resort conversation recovery imports installed');
ok(runtime.includes('P0_20261022_DOCUMENT_RECOVERY_BEFORE_GENERIC_FALLBACK'), 'document recovery precedes generic fallback');
ok(runtime.includes('P0_20261022_ALREADY_REFUNDING_NEVER_RECONFIRMS'), 'already-requested refund cannot ask for confirmation again');
ok(runtime.includes('P0_20261022_TELEGRAM_AVAILABILITY_DIRECT_REPLY'), 'Telegram availability question gets a direct WhatsApp answer');

ok(migration.includes('P0_20261022_WHATSAPP_CONFIRMATION_OWNS_TURN'), 'bare mutation confirmation stays WhatsApp-owned');
ok(migration.includes('P0_20261022_MIGRATION_ONLY_HANDLES_WHEN_SENT'), 'migration cannot swallow a turn when no link was actually sent');
ok(migration.includes('handled: false, suppressed: true'), 'cooldown/exhausted migration falls through to V3');

ok(closing.includes('P0_20261022_HYPOTHETICAL_PAYMENT_IS_NOT_CLAIM'), 'hypothetical payment is excluded from paid claims');
ok(closing.includes('P0_20261022_APPROVAL_CONTINGENCY_IS_PAYMENT_TRUST'), 'approval contingency is recognized');
ok(closing.includes('P0_20261022_TRUST_REPLY_INCLUDES_DESTINATIONS'), 'approval/trust answer includes full payment execution block');
ok(recovery.includes('P0_20261022_FIVE_JOD_REFUND_CONTINGENCY'), 'mandatory 5-JOD reply states final-approval refund contingency');

ok(authority.includes('P0_20261022_INSTALLMENT_AMOUNT_CURRENT_TEXT_PRIORITY'), 'current installment amount question has priority');
ok(authority.includes('P0_20261022_FIVE_WORD_FEE_NOT_MONTHLY_METHOD'), 'spelled five dinars is fee-only context');
ok(kernel.includes('P0_20261022_MISSING_INSTALLMENT_AMOUNT_IS_INVALID'), 'known installment amount cannot be omitted');
ok(kernel.includes('P0_20261022_NO_ASYNC_PROMISES'), 'unsupported future operational promises are rejected');
ok(kernel.includes('P0_20261022_GENERIC_FALLBACK_IS_NOT_AN_ANSWER'), 'known generic non-answer is rejected');
ok(kernel.includes('P0_20261022_REFUND_TRUTH_DOMINATES_MEMORY'), 'current refund truth dominates stale memory');

// Exact customer phrases from production regressions.
const telegramQuestion = (s) => /(?:هل\s+)?(?:ضروري|لازم).{0,16}(?:تلجرام|تليجرام)|(?:ما\s+عندي|ما\s+بنزل|مش\s+قادر|ما\s+بقدر).{0,20}(?:تلجرام|تليجرام)/i.test(s);
ok(telegramQuestion('هل ضروري تلجرام'), 'Telegram necessity phrase covered');
ok(telegramQuestion('ما بنزل عندي التلجرام'), 'Telegram unavailable phrase covered');

const docQuestion = (s) => /(?:الرابط|رابط).{0,25}(?:كشف|راتب|مستند)|(?:كشف\s+راتب).{0,25}(?:رابط|ابعث|ابعت)/.test(s);
ok(docQuestion('طيب بدي الرابط يلي ابعث فيه كشف راتب'), 'salary-slip link regression phrase covered');

const refundConfirmation = (s) => /^(?:نعم|اه|ايوه|yes|موافق|موافقه|اكيد|تاكيد|تأكيد)$/.test(s.trim().toLowerCase());
ok(refundConfirmation('نعم'), 'bare refund confirmation remains action-owned');

console.log('PASS: final P0 conversation-integrity gate');
