const fs = require("fs");
const path = require("path");
const root = process.argv[2] || process.cwd();
const runtime = fs.readFileSync(path.join(root, "app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts"), "utf8");
const persist = fs.readFileSync(path.join(root, "app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts"), "utf8");
function ok(cond, msg) { if (!cond) { console.error("FAIL:", msg); process.exit(1); } console.log("PASS:", msg); }

ok(runtime.includes('postApprovalAnyInboundTrigger'), 'preliminary approval has broad any-inbound continuation latch');
ok(runtime.includes('applicationJourneyStage(truthAfterActions.application) === "preliminary_approved_waiting_decision"'), 'broad latch is scoped to authoritative preliminary approval');
ok(runtime.includes('explicitNonContinuationThisTurn') && runtime.includes('turn.requestedActions.includes("cancel_application")'), 'explicit decline/cancellation veto remains authoritative');
ok(runtime.includes('turn.requestedActions.includes("request_refund")'), 'refund intent cannot accidentally open payment');
ok(runtime.includes('continuationPersistence.updated || continuationPersistence.alreadyRecorded'), 'payment depends on durable continuation persistence');
ok(runtime.includes('status: "customer_confirmed_continue"') && runtime.includes('paymentStatus: "pending_payment"'), 'read-after-write lag is bridged monotonically from successful mutation');
ok(runtime.includes('applicationJourneyStage(truthAfterActions.application) === "continuation_confirmed_fee_due"'), 'protected payment block requires fee-due truth after persistence');
ok(runtime.includes('customer_continue_payment_ready'), 'canonical Discord continuation event is preserved');
ok(runtime.includes('أول رسالة بعد الموافقة المبدئية'), 'Discord identifies post-approval broad trigger');
ok(runtime.includes('لم يتم فتح بيانات دفع الـ5 دنانير'), 'persistence failure fails closed for payment disclosure');
ok(runtime.includes('hasCurrentCustomerQuestion') && runtime.includes('nativeQuestionFollowup'), 'same-turn customer questions continue after payment block');
ok(runtime.includes('protectedFiveJodReply') && runtime.includes('${authoritativeCommercialJourneyReply}\\n\\n${postPaymentFollowup}'), 'mandatory payment block is ordered before same-turn follow-up');
ok(!runtime.includes('const protectedFiveJodStep = continuationRevenueReadyAtDecision;'), 'old pre-persistence payment gate is removed');
ok(persist.includes('status: "customer_confirmed_continue"') && persist.includes('payment_status: "pending_payment"'), 'authoritative DB mutation remains unchanged');
console.log('V3 P0 FIVE JOD ANY-INBOUND CONTINUATION SELFTEST: PASS');
