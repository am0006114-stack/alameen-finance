const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value, 'utf8');
const once = (src, re, replacement, label) => {
  const matches = src.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || [];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one anchor, found ${matches.length}`);
  return src.replace(re, replacement);
};

// 1) Admin: preliminary qualification is a 7-day commercial/intake action.
// Final study/review decisions and pickup/delivery remain weekend-blocked.
{
  const rel = 'app/admin/applications/[id]/page.tsx';
  let src = read(rel);
  if (src.includes('new Set(["needs_identity", "needs_salary_slip", "needs_guarantor", "approved", "rejected"])')) {
    console.log('PASS - admin preliminary qualification already exempt from weekend block');
  } else {
    src = once(
      src,
      /const studyDecisionStatuses = new Set\(\["preliminary_qualified", "needs_identity", "needs_salary_slip", "needs_guarantor", "approved", "rejected"\]\);/,
      'const studyDecisionStatuses = new Set(["needs_identity", "needs_salary_slip", "needs_guarantor", "approved", "rejected"]);',
      'admin weekend decision set'
    );
    write(rel, src);
    console.log('PASS - preliminary qualification is available 7 days/week; final study decisions stay protected');
  }
}

// 2) Cron: preliminary approval / conversion is allowed 7 days/week.
// Do not alter global operationalCalendar: final review, delivery and appointments keep Fri/Sat rules.
{
  const rel = 'app/api/cron/preliminary-approval/route.ts';
  let src = read(rel);
  src = src.replace(/import \{ isOperationalDate \} from "@\/app\/api\/whatsapp\/webhook\/_lib\/v3-os\/operationalCalendar";\r?\n/, '');
  const weekendBlock = /\r?\n  if \(!isOperationalDate\(new Date\(\)\)\) \{\r?\n    return NextResponse\.json\(\{ ok: true, skipped: true, reason: "operational_weekend", message: "الجمعة والسبت لا تُنفذ فيهما دراسة أو إرسال موافقات تشغيلية؛ تبقى الطلبات في الانتظار حتى أول يوم تشغيل\." \}\);\r?\n  \}\r?\n/;
  if (weekendBlock.test(src)) {
    src = src.replace(weekendBlock, '\n');
    write(rel, src);
    console.log('PASS - preliminary-approval cron now runs 7 days/week');
  } else if (!src.includes('operational_weekend') && !src.includes('isOperationalDate(new Date())')) {
    console.log('PASS - preliminary-approval cron already has no weekend skip');
  } else {
    throw new Error('cron weekend block shape changed; refused broad edit');
  }
}

// 3) Runtime: create/recover the continuation ledger+Discord event for both a fresh
// durable continuation write and an already-recorded continuation decision.
// Dedupe policy prevents duplicate actionable notifications.
{
  const rel = 'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts';
  let src = read(rel);
  const oldCondition = /if \(continuationPersistence\.updated\) \{\r?\n    truthAfterActions = await resolveV3ProductionTruth\(/;
  const newCondition = 'if (continuationPersistence.updated || continuationPersistence.alreadyRecorded) {\n    truthAfterActions = await resolveV3ProductionTruth(';
  if (oldCondition.test(src)) {
    src = once(src, oldCondition, newCondition, 'continuation notification recovery condition');
  } else if (!src.includes('if (continuationPersistence.updated || continuationPersistence.alreadyRecorded) {')) {
    throw new Error('continuation notification condition anchor missing');
  }

  const eventAnchor = 'event: "customer_continue_payment_ready"';
  const eventAt = src.indexOf(eventAnchor);
  if (eventAt < 0) throw new Error('continuation Discord event missing');

  const before = src.slice(0, eventAt);
  let eventTail = src.slice(eventAt);
  const titleRe = /title:\s*"[^"\r\n]*",/;
  const descriptionRe = /description:\s*"[^"\r\n]*",/;
  if (!titleRe.test(eventTail)) throw new Error('continuation Discord title anchor missing');
  eventTail = eventTail.replace(titleRe, 'title: "✅ العميل اختار الاستمرار — خطوة الدفع مفتوحة",');
  if (!descriptionRe.test(eventTail)) throw new Error('continuation Discord description anchor missing');
  eventTail = eventTail.replace(descriptionRe, 'description: "تم تثبيت قرار الاستمرار على الطلب، وأصبحت معلومات دفع رسوم فتح الملف ورابط رفع الوصل جاهزة ضمن مسار العميل الحالي.",');
  src = before + eventTail;

  if (!src.includes('continuationPersistence.updated || continuationPersistence.alreadyRecorded')) throw new Error('continuation event recovery guard missing');
  if (!src.includes('title: "✅ العميل اختار الاستمرار — خطوة الدفع مفتوحة",')) throw new Error('continuation Discord title was not enforced');
  if (!src.includes('description: "تم تثبيت قرار الاستمرار على الطلب، وأصبحت معلومات دفع رسوم فتح الملف ورابط رفع الوصل جاهزة ضمن مسار العميل الحالي.",')) throw new Error('continuation Discord description was not enforced');
  write(rel, src);
  console.log('PASS - continuation ledger/Discord event is durable, recoverable and explicit about payment handoff');
}

// 4) Historical calendar selftest: keep weekend rules for study/review/delivery,
// but update the two assertions whose policy has explicitly changed for conversion.
{
  const rel = 'scripts/v3-phase11-9-1-operational-calendar-integrity-selftest.cjs';
  let src = read(rel);
  src = src.replace(
    "ok(src.detail.includes('studyDecisionStatuses')&&src.detail.includes('calendar=weekend-study-blocked'),'admin study decisions are blocked on Friday/Saturday');",
    "ok(src.detail.includes('studyDecisionStatuses')&&src.detail.includes('calendar=weekend-study-blocked')&&!/studyDecisionStatuses = new Set\\(\\[\\\"preliminary_qualified\\\"/.test(src.detail),'preliminary qualification is 7-day while final study decisions remain weekend-blocked');"
  );
  src = src.replace(
    "ok(src.cron.includes('operational_weekend')&&src.cron.includes('isOperationalDate(new Date())'),'preliminary-approval cron skips Friday/Saturday');",
    "ok(!src.cron.includes('operational_weekend')&&!src.cron.includes('isOperationalDate(new Date())'),'preliminary-approval conversion cron runs Friday/Saturday');"
  );
  write(rel, src);
  console.log('PASS - calendar regression contract updated only for 7-day conversion');
}

console.log('\nPASS - 7-DAY COMMERCIAL CONVERSION PATCH APPLIED');
