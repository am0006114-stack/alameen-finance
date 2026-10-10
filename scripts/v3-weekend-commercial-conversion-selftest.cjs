const fs=require('fs'),path=require('path');
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>c?(passed++,console.log(`PASS ${passed}: ${m}`)):(failed++,console.error(`FAIL: ${m}`));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const detail=read('app/admin/applications/[id]/page.tsx');
const cron=read('app/api/cron/preliminary-approval/route.ts');
const calendar=read('app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar.ts');
const runtime=read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const policy=read('app/api/whatsapp/webhook/_lib/v3-os/notificationPolicy.ts');
const notifier=read('app/api/whatsapp/webhook/_lib/v3-os/discordNotifier.ts');

const setMatch=detail.match(/const studyDecisionStatuses = new Set\(\[([^\]]+)\]\);/);
ok(Boolean(setMatch),'admin weekend study-decision set exists');
const setText=setMatch?setMatch[1]:'';
ok(!setText.includes('preliminary_qualified'),'preliminary qualification is not weekend-blocked');
ok(setText.includes('needs_identity')&&setText.includes('needs_salary_slip')&&setText.includes('needs_guarantor'),'final-study document decisions remain weekend-protected');
ok(setText.includes('approved')&&setText.includes('rejected'),'final approval/rejection remain weekend-protected');
ok(detail.includes('calendar=weekend-study-blocked'),'admin still contains weekend guard for final study decisions');
ok(detail.includes('pickup=weekend-blocked'),'pickup/delivery weekend guard remains intact');

ok(!cron.includes('operational_weekend'),'preliminary approval cron has no Friday/Saturday conversion skip');
ok(!cron.includes('isOperationalDate(new Date())'),'preliminary approval cron no longer uses global operational-day veto');
ok(!cron.includes('import { isOperationalDate }'),'unused weekend calendar import removed from preliminary approval cron');

ok(calendar.includes('export function isOperationalDate'),'global operational calendar remains present');
ok(/weekday !== 5 && weekday !== 6/.test(calendar),'global Friday/Saturday rule remains intact for review/delivery/appointments');
ok(calendar.includes('addOneCalendarMonthOperational')&&calendar.includes('iphone18DeliveryCalendar'),'iPhone 18 calendar logic remains intact');

ok(runtime.includes('event: "customer_continue_payment_ready"'),'continuation operational event remains wired');
ok(runtime.includes('continuationPersistence.updated || continuationPersistence.alreadyRecorded'),'continuation event recovers already-recorded decisions as well as fresh writes');
ok(runtime.includes('\u062e\u0637\u0648\u0629 \u0627\u0644\u062f\u0641\u0639 \u0645\u0641\u062a\u0648\u062d\u0629'),'Discord title clearly identifies continuation/payment step');
ok(runtime.includes('\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u062f\u0641\u0639 \u0631\u0633\u0648\u0645 \u0641\u062a\u062d \u0627\u0644\u0645\u0644\u0641')&&runtime.includes('\u0631\u0627\u0628\u0637 \u0631\u0641\u0639 \u0627\u0644\u0648\u0635\u0644'),'Discord description identifies payment information and receipt-upload readiness');
ok(policy.includes('input.event === "customer_continue_payment_ready"')&&policy.includes('customer-continue:${input.applicationId || "unknown"}'),'continuation event has deterministic dedupe policy');
ok(notifier.includes('whatsapp_v3_notification_ledger')&&notifier.includes('status: "pending"'),'Discord notifier durably claims ledger row before delivery');

console.log(`\nV3 WEEKEND COMMERCIAL CONVERSION SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed)process.exit(1);
