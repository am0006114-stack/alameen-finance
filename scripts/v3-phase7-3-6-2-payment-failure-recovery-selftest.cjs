const fs=require("fs"); const path=require("path");
const root=process.argv[2]||process.cwd();
let pass=0, fail=0;
function ok(v,m){if(v){pass++;console.log(`PASS ${pass}: ${m}`)}else{fail++;console.error(`FAIL: ${m}`)}}
function read(rel){return fs.readFileSync(path.join(root,rel),"utf8")}
const base="app/api/whatsapp/webhook/_lib/v3-os/";
const layer=read(base+"paymentFailureRecovery.ts");
const recovery=read(base+"conversationRecovery.ts");
const gate=read(base+"finalResponseGate.ts");
const writer=read(base+"writerContract.ts");
const v2=read("app/api/whatsapp/webhook/_lib/v2-production/safeComposer.ts");

for(const phrase of ["فشل","مش\\s+زابط","مش\\s+راضي","مرفوض","invalid","not\\s+found"]) ok(layer.includes(phrase),`failure detector includes ${phrase}`);
ok(layer.includes("containsLegacyFileOpeningPaymentDestination(raw)"),"legacy destination mention triggers recovery");
ok(layer.includes("paymentDisclosureDecision"),"central recovery uses payment disclosure firewall");
ok(layer.includes("decision.alreadyPaid"),"confirmed payment has protected recovery branch");
ok(layer.includes("decision.receiptPending"),"receipt pending has protected recovery branch");
ok(layer.includes("لا تعيد الدفع"),"recovery blocks duplicate payment");
ok(layer.includes("صار تحديث طارئ على أسماء CliQ"),"recovery explicitly states CliQ names changed");
ok(layer.includes("currentFileOpeningPaymentRule({ includeApology: false })"),"eligible recovery uses only current destination override");
ok(layer.includes("بدون إرسال أي معلومات بنكية حساسة"),"recovery asks only safe error text");
ok(layer.includes("paymentFailureRecoveryReplyIsCurrent"),"central egress validation helper exists");
ok(layer.includes("containsCurrentFileOpeningPaymentDestination"),"egress validation requires current destination when eligible");
ok(layer.includes("containsLegacyFileOpeningPaymentDestination(text)"),"egress validation rejects legacy destination");
ok(recovery.includes("payment_failure_or_destination_problem"),"conversation recovery adds deterministic payment_method act");
ok(recovery.includes("paymentFailureOrDestinationProblemText(input.turn.rawText)"),"conversation recovery prioritizes payment failures");
ok(recovery.includes("buildPaymentFailureRecoveryReply"),"conversation recovery returns central payment failure reply");
ok(gate.includes('violations.push("payment_failure_recovery_required")'),"final gate forces payment failure recovery");
ok(gate.includes('severity = "p0"'),"payment failure recovery failure is P0 guarded");
ok(gate.includes("paymentFailureRecoveryReplyIsCurrent"),"final gate validates current recovery response");
ok(gate.includes("buildPaymentFailureRecoveryReply"),"final gate deterministic repair uses central builder");
ok(writer.includes("PAYMENT FAILURE RECOVERY"),"writer receives explicit payment failure contract");
ok(writer.includes("تم تحديثها"),"writer is told that CliQ names changed");
ok(writer.includes("ممنوع تطلب دفعًا أو تحويلًا جديدًا"),"writer protects confirmed/pending customers from duplicate payment");
ok(v2.includes("paymentFailureOrDestinationProblemText"),"V2 failover detects payment failure");
ok(v2.includes("v2PaymentFailureRecoveryReply"),"V2 failover has dedicated recovery");
ok(v2.includes("V2_POLICY.forbiddenPaymentAliases"),"V2 recognizes legacy aliases from policy");
ok(v2.includes("payment_confirmed_at"),"V2 confirmed payment blocks repeat payment");
ok(v2.includes("customer_confirmed_continue"),"V2 exposes current data only after persisted continuation");
ok(v2.includes("V2_POLICY.paymentAliases.join"),"V2 recovery uses current aliases from policy");
ok(v2.includes("V2_POLICY.paymentPhone"),"V2 recovery uses current phone destination");
ok(v2.includes("بدون أي معلومات بنكية حساسة"),"V2 asks only safe error text");
ok(!layer.includes("AMEEENPAY")&&!layer.includes("AMENPAY"),"central recovery never repeats legacy aliases in customer-facing source");
ok(!v2.includes('return "AMEEENPAY')&&!v2.includes('return "AMENPAY'),"V2 recovery never returns legacy aliases directly");

console.log(`RESULT: ${pass}/${pass+fail} PASS`); if(fail) process.exit(1);
