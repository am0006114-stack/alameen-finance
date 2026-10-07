const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(process.cwd(),'node_modules','typescript'))}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const tr=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));return tr.outputText}
function loadCalendar(){const rel='app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar.ts';const mod={exports:{}};vm.runInNewContext(transpile(rel),{module:mod,exports:mod.exports,require,console,Date,Intl,Map,Set,Math},{filename:rel});return mod.exports}
const rel={calendar:'app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar.ts',calendarPage:'app/admin/operations-calendar/page.tsx',arbiter:'app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts',truth:'app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts',detail:'app/admin/applications/[id]/page.tsx',care:'app/api/whatsapp/webhook/_lib/v3-os/humanCarePolicy.ts',cron:'app/api/cron/preliminary-approval/route.ts'};
for(const [name,file] of Object.entries(rel))ok(fs.existsSync(path.join(root,file)),`${name} source exists`);
const calendar=loadCalendar();
transpile(rel.calendarPage);transpile(rel.arbiter);transpile(rel.truth);transpile(rel.detail);transpile(rel.care);transpile(rel.cron);
ok(calendar.isOperationalDate(new Date('2026-10-08T12:00:00+03:00'))===true,'Thursday is an operational day');
ok(calendar.isOperationalDate(new Date('2026-10-09T12:00:00+03:00'))===false,'Friday is excluded from operations');
ok(calendar.isOperationalDate(new Date('2026-10-10T12:00:00+03:00'))===false,'Saturday is excluded from operations');
ok(calendar.isOperationalDate(new Date('2026-10-11T12:00:00+03:00'))===true,'Sunday resumes operations');
ok(calendar.countOperationalDaysElapsed('2026-10-08T12:00:00+03:00','2026-10-11T12:00:00+03:00')===1,'review-day counter skips Friday and Saturday');
const shifted=calendar.addOneCalendarMonthOperational('2026-09-09T12:00:00+03:00');
ok(calendar.jordanDateKey(shifted)==='2026-10-11','iPhone 18 one-month due date moves Friday to Sunday');
ok(calendar.isIphone18Device('iPhone 18 Pro Max - 256GB'),'iPhone 18 Pro Max detected');
ok(calendar.isIphone18Device('آيفون 18 Air'),'all iPhone 18 variants are covered');
let d=calendar.iphone18DeliveryCalendar({deviceName:'iPhone 18 Pro',paymentConfirmed:true,status:'under_review',finalApprovalAt:null,now:new Date('2026-10-07T12:00:00+03:00')});
ok(d.state==='awaiting_final_approval'&&d.dueDate===null,'paid iPhone 18 under final review is alerted but delivery clock has not started');
d=calendar.iphone18DeliveryCalendar({deviceName:'iPhone 18 Pro',paymentConfirmed:true,status:'approved',finalApprovalAt:'2026-09-09T12:00:00+03:00',now:new Date('2026-10-07T12:00:00+03:00')});
ok(d.state==='within_delivery_window'&&calendar.jordanDateKey(d.dueDate)==='2026-10-11','approved iPhone 18 is tracked inside the one-month delivery window');
const src={};for(const [k,v] of Object.entries(rel))src[k]=read(v);
ok(/الجمعة والسبت/.test(src.truth)&&/لا تُحتسبان/.test(src.truth),'business truth excludes Friday/Saturday from study-day counting');
ok(/جميع أجهزة iPhone 18/.test(src.truth)&&/شهر كامل من تاريخ الموافقة النهائية/.test(src.truth),'business truth applies one-month delivery rule to all iPhone 18 variants');
ok(src.calendarPage.includes('عداد شهر التسليم لم يبدأ')&&src.calendarPage.includes('countOperationalDaysElapsed'),'admin calendar surfaces paid iPhone 18 and operational review days');
ok(src.detail.includes('final_approval_recorded'),'admin final approval writes a durable calendar timestamp');
ok(src.detail.includes('studyDecisionStatuses')&&src.detail.includes('calendar=weekend-study-blocked'),'admin study decisions are blocked on Friday/Saturday');
ok(src.detail.includes('pickup=weekend-blocked')&&src.detail.includes('pickup=iphone18-too-early'),'admin appointment action blocks weekends and early iPhone 18 pickup dates');
ok(src.cron.includes('operational_weekend')&&src.cron.includes('isOperationalDate(new Date())'),'preliminary-approval cron skips Friday/Saturday');
ok(src.arbiter.includes('commercialFileOpeningText')&&src.arbiter.includes('explicitReopenApplicationText'),'commercial file opening is disambiguated from reopening a cancelled application');
ok(src.arbiter.includes('asksOperationalCalendarQuestion')&&src.arbiter.includes('operational_calendar'),'current-turn weekend/calendar questions have deterministic authority');
ok(src.arbiter.includes('fee_document_question'),'pre-payment invoice question owns its current turn instead of payment egress');
ok(src.care.includes('مفهوم\\s+إنك')||src.care.includes('مفهوم\\s+انك'),'human care recognizes existing acknowledgement and avoids stacking empathy');
const protectedPaymentFiles=['app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts','app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts','app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts','app/api/continue-decision/route.ts','app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts'];
for(const file of protectedPaymentFiles)ok(fs.existsSync(path.join(root,file)),`protected payment source still exists: ${file}`);
console.log(`\nV3 PHASE 11.9.1 OPERATIONAL CALENDAR INTEGRITY SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);if(failed)process.exit(1);
