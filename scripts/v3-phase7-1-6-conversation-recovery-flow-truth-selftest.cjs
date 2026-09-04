const fs = require("fs");
const path = require("path");
const root = process.argv[2] || process.cwd();
function read(rel){ return fs.readFileSync(path.join(root, rel), "utf8"); }
function ok(cond,msg){ if(!cond){ console.error("FAIL:",msg); process.exitCode=1; } else console.log("PASS:",msg); }

const route = read("app/api/whatsapp/webhook/route.ts");
const runtime = read("app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts");
const recovery = read("app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts");
const fallback = read("app/api/whatsapp/webhook/_lib/v3-os/zeroFallback.ts");
const verifier = read("app/api/whatsapp/webhook/_lib/v3-os/verifier.ts");
const writer = read("app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts");
const manual = read("app/api/whatsapp/webhook/_lib/v3-os/manualActionPolicy.ts");
const adapter = read("app/api/whatsapp/webhook/_lib/v3-os/transactionalActionAdapter.ts");

ok(/hardenTurnForConversationRecovery/.test(runtime), "runtime hardens interpreted turns before planning");
ok(/buildConversationRecoveryReply/.test(runtime), "runtime has deterministic conversation-recovery reply path before writer fallback");
ok(/اخترت[^\n]{0,30}الاستمرار/.test(recovery) && /continue_application/.test(recovery), "explicit continuation phrases are deterministically promoted to continuation action");
ok(/الدراسه|الدراسة/.test(recovery) && /النهائيه|النهائية/.test(recovery), "move-to-final-study wording is recognized as continuation");
ok(/new_application_start/.test(recovery) && /reopen_application/.test(recovery), "new application flow explicitly strips reopen actions");
ok(/isNewApplicationFlow/.test(runtime) && /pendingAction: null/.test(runtime), "new-application flow clears stale non-scoped reopen/change pending actions");
ok(/newApplicationConversationContext/.test(recovery) && /ما رح أستخدم قسط الطلب القديم/.test(recovery), "new-application context cannot reuse old application installment/payment truth");
ok(/لا، حكيّنا عن بدء طلب جديد ما يعني إن الطلب القديم انفتح/.test(recovery), "follow-up reopen question stays separated from new-application flow");
ok(/طلب جديد، ما بنعتبر هذا إعادة فتح/.test(recovery), "customer-facing new-application recovery distinguishes new request from reopen");
ok(/foreign_application_blocker/.test(recovery) && /لا تختصر الرقم ولا تغيّره/.test(recovery), "foreign-applicant form blocker never invents national-ID workaround");
ok(/المكتب مش زيارة مفتوحة لمشاهدة الأجهزة/.test(recovery), "office cannot be represented as an open showroom");
ok(/reviewTimingQuestionText/.test(recovery) && /المعدل الطبيعي للمراجعة/.test(recovery), "review timing has direct deterministic answer rather than generic fallback");
ok(/humanRequestText/.test(recovery) && /ما رح أدعي إني حولتك لموظف/.test(recovery), "human/staff request is acknowledged without false transfer claim");
ok(/الموعد: إذا قصدك وقت الموافقة/.test(recovery) && /القسط:/.test(recovery) && /المستندات:/.test(recovery), "multi-topic appointment/installment/requirements is answered in one recovery turn");
ok(/formatJod/.test(recovery) && /toFixed\(2\)/.test(recovery), "customer money formatting is capped at two decimals");
ok(/buildConversationRecoveryReply/.test(fallback), "zero fallback reuses deterministic recovery before generic status fallback");
ok(/formatJod\(app\.monthlyPayment\)/.test(fallback), "zero fallback no longer exposes long floating-point installment values");
ok(/global_cancelled_or_closed_claim_mismatch_truth/.test(verifier), "global cancelled/closed claims must match authoritative truth regardless intent");
ok(/global_preliminary_approval_claim_mismatch_truth/.test(verifier), "global preliminary-approval claims must match authoritative truth regardless intent");
ok(/global_active_status_claim_on_terminal_application/.test(verifier), "terminal applications cannot be described as active review");
ok(/new_application_must_not_be_reopen/.test(verifier), "verifier blocks new-application to reopen inversion");
ok(/new_application_reused_old_tracking/.test(verifier), "verifier blocks reuse of old tracking as new request");
ok(/foreign_applicant_invented_national_id_workaround/.test(verifier), "verifier blocks invented foreign-ID substitution workaround");
ok(/office_not_open_showroom_for_browsing/.test(verifier), "verifier blocks showroom browsing invitations");
ok(/money_display_more_than_two_decimals/.test(verifier), "verifier blocks >2 decimal JOD display");
ok(/NEW_APPLICATION_REQUEST/.test(writer) && /FOREIGN_APPLICANT_FORM_BLOCKER/.test(writer) && /SHOWROOM_BROWSING_REQUEST/.test(writer), "writer contract receives new application/foreign/showroom risk flags");
ok(/ممنوع الرد بقالب/.test(writer) && /اكتب سؤالك مباشرة/.test(writer), "writer is forbidden from generic ask-the-question fallback on clear questions");
ok(/حالة الطلب الحالية للعميل/.test(manual) && /customerFacingStatusLabel/.test(manual), "manual-action reconciliation uses customer-facing status labels only");
ok(!/الحالة الفعلية المسجلة على الطلب الآن هي \$\{app\.status/.test(manual), "manual-action reply no longer leaks raw DB status");
ok(/Skipped stale V3 reply at final send because a newer customer message arrived/.test(route), "stale-turn guard runs again after human delay immediately before send");
const staleCount=(route.match(/shouldSuppressStaleV3Reply\(/g)||[]).length;
ok(staleCount >= 2, "route contains both pre-lock and final-send stale-turn checks");
ok(/LIVE_SCOPED_MUTATIONS\s*=\s*new Set\(\[\s*"cancel_application",\s*"request_refund"/m.test(adapter), "automatic mutations remain scoped to cancel + refund only");
ok(/scoped_real_actions_disallowed/.test(adapter), "all other real mutations remain automatically blocked");

if(process.exitCode){ console.error("V3 Phase 7.1.6 self-test FAILED"); process.exit(1); }
console.log("V3 Phase 7.1.6 self-test: PASS");
