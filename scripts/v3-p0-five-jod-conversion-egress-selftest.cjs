const fs = require('fs');
const path = require('path');
const runtime = fs.readFileSync(path.join(process.cwd(), 'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts'), 'utf8');

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('PASS:', msg);
}

const triggerStart = runtime.indexOf('const postApprovalAnyInboundTrigger = Boolean(');
const triggerEnd = runtime.indexOf('const continuationDecisionThisTurn', triggerStart);
const triggerBlock = runtime.slice(triggerStart, triggerEnd);

ok(triggerStart >= 0 && triggerEnd > triggerStart, 'post-approval trigger exists');
ok(!triggerBlock.includes('semanticContinueVeto'), 'post-template any-inbound latch is not vetoed by deferred/conditional semantics');
ok(runtime.includes('postApprovalAnyInboundTrigger\n      || (!semanticContinueVeto && !disclosureRequiredThisTurn && ('), 'semantic veto remains scoped to legacy/non-latched continuation');
ok(runtime.includes('&& !explicitNonContinuationThisTurn'), 'explicit decline/cancel/refund remains a hard veto');

const replyStart = runtime.indexOf('const authoritativeCommercialJourneyReply =');
const replyBlock = runtime.slice(replyStart, replyStart + 520);
ok(replyBlock.includes('= protectedFiveJodStep'), 'protected 5-JOD step has first commercial egress precedence');
ok(replyBlock.indexOf('buildMandatoryFiveJodContinuationReply') < replyBlock.indexOf('buildInformedCommercialDisclosureReply'), 'mandatory payment block precedes disclosure fallback');
ok(runtime.includes('اسم\\s+المستفيد') && runtime.includes('receipt\\?') && runtime.includes('تأكيد\\s+الدفع\\s+النهائي'), 'native follow-up filter blocks duplicated payment execution fragments');
ok(runtime.includes('customer_continue_payment_ready'), 'canonical Discord continuation notification remains present');
ok(runtime.includes('continuationPersistence.updated || continuationPersistence.alreadyRecorded'), 'payment egress still depends on durable continuation persistence');

console.log('V3 P0 FIVE JOD CONVERSION EGRESS SELFTEST: PASS');
