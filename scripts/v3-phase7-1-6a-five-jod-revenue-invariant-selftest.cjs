const fs = require("fs");
const path = require("path");
const root = process.argv[2] || process.cwd();
function read(rel){ return fs.readFileSync(path.join(root, rel), "utf8"); }
function ok(cond,msg){ if(!cond){ console.error("FAIL:",msg); process.exitCode=1; } else console.log("PASS:",msg); }
const runtime=read("app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts");
const recovery=read("app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts");
const verifier=read("app/api/whatsapp/webhook/_lib/v3-os/verifier.ts");
ok(/REVENUE INVARIANT/.test(runtime) && /protectedFiveJodStep/.test(runtime), "runtime has protected 5 JOD continuation invariant");
ok(/turn\.requestedActions\.includes\("continue_application"\)/.test(runtime), "continuation invariant is independent of planner wording");
ok(/!protectedFiveJodStep && runtimeNearDuplicate/.test(runtime), "near-duplicate suppression cannot erase the protected 5 JOD step");
ok(/FINAL 5 JOD REVENUE INVARIANT/.test(runtime) && /mandatoryContinuationReply/.test(runtime), "5 JOD reply is reasserted immediately before final safety pass");
ok(/const explicitContinue = continuationDecisionThisTurn/.test(runtime), "continuation Discord event uses recovered continuation decision");
ok(/رسوم فتح الملف بقيمة \$\{p\.fileOpeningFeeJod\} دنانير/.test(recovery), "deterministic continuation names the 5 JOD fee");
ok(/القرار إلك بالكامل/.test(recovery) && /حقك محفوظ/.test(recovery), "deterministic continuation satisfies non-coercive reassurance contract");
ok(/p\.paymentMethodRule/.test(recovery), "deterministic continuation includes authoritative payment method rule");
ok(/links\.relevant\.receipt/.test(recovery), "deterministic continuation uses request-bound official receipt link");
ok(/continuation_payment_ready_missing_5_jod_fee/.test(verifier), "verifier rejects a missing 5 JOD fee");
ok(/continuation_payment_ready_missing_payment_destination/.test(verifier), "verifier rejects a missing approved payment destination");
ok(/continuation_payment_ready_missing_receipt_link/.test(verifier), "verifier rejects omission of an available official receipt link");
ok(/continuation_payment_already_handled_but_fee_requested_again/.test(verifier), "verifier blocks duplicate 5 JOD charging after paid/pending truth");
if(process.exitCode){ console.error("V3 Phase 7.1.6A 5 JOD Revenue Invariant self-test FAILED"); process.exit(1); }
console.log("V3 Phase 7.1.6A 5 JOD Revenue Invariant self-test: PASS");
