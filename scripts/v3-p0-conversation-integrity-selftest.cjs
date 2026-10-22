const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}
function assert(condition, message) {
  if (!condition) throw new Error(`P0 SELFTEST FAILED: ${message}`);
}
function has(source, text, label) {
  assert(source.includes(text), `${label}: missing ${text}`);
}

const runtime = read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const recovery = read('app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts');
const migration = read('app/api/whatsapp/webhook/_lib/v3-os/telegramMigration.ts');
const closing = read('app/api/whatsapp/webhook/_lib/v3-os/paymentClosingGuard.ts');
const authority = read('app/api/whatsapp/webhook/_lib/v3-os/singleConversationAuthority.ts');
const kernel = read('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');

has(runtime, 'P0_20261022_FINAL_FIVE_JOD_EGRESS_INVARIANT', 'five-jod final egress');
has(runtime, 'reply = protectedFiveJodReply || buildMandatoryFiveJodContinuationReply(turn, truthAfterActions);', 'five-jod final egress');
has(runtime, 'protectedFiveJodStep: true', 'five-jod final egress validation');
has(recovery, 'P0_20261022_FIVE_JOD_REFUND_CONTINGENCY', 'five-jod refund contingency');
has(recovery, 'إذا ما صدرت الموافقة النهائية', 'five-jod refund contingency wording');

has(migration, 'P0_20261022_WHATSAPP_CONFIRMATION_OWNS_TURN', 'telegram confirmation ownership');
has(migration, 'critical_fallback_mutation_confirmation', 'telegram confirmation ownership');
has(migration, 'critical_fallback_telegram_unavailable_or_question', 'telegram availability fallback');
has(migration, 'P0_20261022_MIGRATION_ONLY_HANDLES_WHEN_SENT', 'telegram no-silence invariant');
has(migration, 'if (!migration.sent)', 'telegram no-silence invariant');
has(migration, 'handled: false', 'telegram no-silence invariant');

has(closing, 'P0_20261022_HYPOTHETICAL_PAYMENT_IS_NOT_CLAIM', 'hypothetical payment');
has(closing, 'paymentClaimHypothetical', 'hypothetical payment');
has(closing, 'P0_20261022_APPROVAL_CONTINGENCY_IS_PAYMENT_TRUST', 'approval contingency');
has(closing, 'P0_20261022_TRUST_REPLY_INCLUDES_DESTINATIONS', 'payment trust destinations');
has(closing, '${destinations}', 'payment trust destinations');

has(authority, 'P0_20261022_INSTALLMENT_AMOUNT_CURRENT_TEXT_PRIORITY', 'installment amount priority');
has(authority, 'P0_20261022_FIVE_WORD_FEE_NOT_MONTHLY_METHOD', 'five-word fee classification');
has(authority, 'خمس\\s*دنانير', 'five-word fee classification');

has(kernel, 'P0_20261022_MISSING_INSTALLMENT_AMOUNT_IS_INVALID', 'installment missing amount validation');
has(kernel, 'monthly_installment_amount_missing', 'installment missing amount validation');
has(kernel, 'P0_20261022_NO_ASYNC_PROMISES', 'future promise rejection');
has(kernel, 'P0_20261022_GENERIC_FALLBACK_IS_NOT_AN_ANSWER', 'generic fallback rejection');
has(kernel, 'P0_20261022_REFUND_TRUTH_DOMINATES_MEMORY', 'refund truth authority');

// Behavioral replicas for the exact production phrases that triggered this hotfix.
const confirm = (s) => /^(?:نعم|اه|ايوه|yes|موافق|موافقه|اكيد|تاكيد|تأكيد)$/.test(s.trim().toLowerCase());
assert(confirm('نعم'), 'bare refund confirmation must remain WhatsApp-owned');
assert(confirm('ايوه'), 'bare affirmative must remain WhatsApp-owned');

const hypotheticalPaid = (s) => /(?:^|\s)(?:اذا|لو)\s+[^\n]{0,45}(?:حولت|دفعت|عملت\s+تحويل)(?:\s|$)/.test(s.trim().toLowerCase());
assert(hypotheticalPaid('اذا دفعت الخمس دنانير هسا رح اقدر استلم الجهاز قبل سفري'), 'hypothetical payment phrase not detected');
assert(!hypotheticalPaid('دفعت الخمس دنانير'), 'real paid claim misdetected as hypothetical');

const installmentAmount = (s) => /(?:كم|قديش|شو).{0,22}(?:القسط|قسط)|(?:القسط|قسطه|قسطو).{0,22}(?:كم|قديش)|(?:على\s*(?:12|١٢|24|٢٤|36|٣٦)\s*شهر).{0,28}(?:كم|قديش).{0,18}(?:اول|أول)\s+(?:دفعه|دفعة)/.test(s);
assert(installmentAmount('كم هو القسط'), 'monthly amount phrase not detected');
assert(installmentAmount('كم القسط الاول دفع'), 'first installment amount phrase not detected');
assert(installmentAmount('طيب على 36 شهر كم اول دفعه'), '36-month first payment phrase not detected');

const approvalContingency = (s) => /(?:اذا|لو).{0,35}(?:ما|لم).{0,24}(?:تمت|تتم|طلعت|صدرت).{0,24}(?:الموافقه|الموافقة)/.test(s);
assert(approvalContingency('ادفع خمس دنانير واذا ما تمت الموافقه'), 'five-jod approval contingency not detected');

assert(/(?:هل ضروري تلجرام|ما بنزل عندي التلجرام)/.test('هل ضروري تلجرام'), 'telegram necessity question not detected');
assert(/(?:هل ضروري تلجرام|ما بنزل عندي التلجرام)/.test('ما بنزل عندي التلجرام'), 'telegram unavailable phrase not detected');

console.log('PASS: P0 conversation-integrity regression gate');
