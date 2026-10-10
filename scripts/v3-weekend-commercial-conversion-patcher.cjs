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

// 1) Admin: preliminary qualification is commercial/intake and stays available 7 days/week.
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

// 2) Cron: preliminary approval / conversion runs 7 days/week.
// Global operationalCalendar is intentionally untouched.
{
  const rel = 'app/api/cron/preliminary-approval/route.ts';
  let src = read(rel);
  src = src.replace(/import \{ isOperationalDate \} from "@\/app\/api\/whatsapp\/webhook\/_lib\/v3-os\/operationalCalendar";\r?\n/, '');
  const weekendBlock = /\r?\n  if \(!isOperationalDate\(new Date\(\)\)\) \{\r?\n    return NextResponse\.json\(\{ ok: true, skipped: true, reason: "operational_weekend", message: "[^"\r\n]*" \}\);\r?\n  \}\r?\n/;
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

// 3) Runtime: recover/write the continuation ledger event for both fresh and already-recorded decisions.
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

  const title = '\u2705 \u0627\u0644\u0639\u0645\u064a\u0644 \u0627\u062e\u062a\u0627\u0631 \u0627\u0644\u0627\u0633\u062a\u0645\u0631\u0627\u0631 \u2014 \u062e\u0637\u0648\u0629 \u0627\u0644\u062f\u0641\u0639 \u0645\u0641\u062a\u0648\u062d\u0629';
  const description = '\u062a\u0645 \u062a\u062b\u0628\u064a\u062a \u0642\u0631\u0627\u0631 \u0627\u0644\u0627\u0633\u062a\u0645\u0631\u0627\u0631 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628\u060c \u0648\u0623\u0635\u0628\u062d\u062a \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u062f\u0641\u0639 \u0631\u0633\u0648\u0645 \u0641\u062a\u062d \u0627\u0644\u0645\u0644\u0641 \u0648\u0631\u0627\u0628\u0637 \u0631\u0641\u0639 \u0627\u0644\u0648\u0635\u0644 \u062c\u0627\u0647\u0632\u0629 \u0636\u0645\u0646 \u0645\u0633\u0627\u0631 \u0627\u0644\u0639\u0645\u064a\u0644 \u0627\u0644\u062d\u0627\u0644\u064a.';
  const before = src.slice(0, eventAt);
  let tail = src.slice(eventAt);
  const titleRe = /title:\s*"[^"\r\n]*",/;
  const descriptionRe = /description:\s*"[^"\r\n]*",/;
  if (!titleRe.test(tail)) throw new Error('continuation Discord title anchor missing');
  tail = tail.replace(titleRe, `title: ${JSON.stringify(title)},`);
  if (!descriptionRe.test(tail)) throw new Error('continuation Discord description anchor missing');
  tail = tail.replace(descriptionRe, `description: ${JSON.stringify(description)},`);
  src = before + tail;
  write(rel, src);
  console.log('PASS - continuation ledger/Discord event is durable and explicit about payment handoff');
}

// 4) Decision screen: one short deterministic screen, including explicit 1/2 choices.
{
  const rel = 'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts';
  let src = read(rel);
  const re = /export function buildInformedCommercialDisclosureReply\(truth: TruthBundle\) \{\r?\n  const fee = truth\.policy\.fileOpeningFeeJod;\r?\n  return `[\s\S]*?`;\r?\n\}/;
  const replacement = [
    'export function buildInformedCommercialDisclosureReply(truth: TruthBundle) {',
    '  const fee = truth.policy.fileOpeningFeeJod;',
    '  return `\u0637\u0644\u0628\u0643 \u0623\u062e\u0630 \u0645\u0648\u0627\u0641\u0642\u0629 \u0645\u0628\u062f\u0626\u064a\u0629 \u2705\\n\\n\u0647\u0644 \u062a\u0631\u063a\u0628 \u0628\u0627\u0644\u0627\u0633\u062a\u0645\u0631\u0627\u0631 \u0644\u0644\u062f\u0631\u0627\u0633\u0629 \u0627\u0644\u0646\u0647\u0627\u0626\u064a\u0629\u061f\\n1 - \u0646\u0639\u0645\u060c \u0623\u0631\u064a\u062f \u0627\u0644\u0627\u0633\u062a\u0645\u0631\u0627\u0631\\n2 - \u0644\u0627\u060c \u0645\u0634 \u0647\u0633\u0627\\n\\n\u0639\u0646\u062f \u0627\u062e\u062a\u064a\u0627\u0631 1\u060c \u0631\u0633\u0648\u0645 \u0641\u062a\u062d \u0627\u0644\u0645\u0644\u0641 ${fee} \u062f\u0646\u0627\u0646\u064a\u0631\u060c \u0648\u0647\u064a \u0645\u0633\u062a\u0631\u062f\u0629 \u0625\u0630\u0627 \u0645\u0627 \u0635\u062f\u0631\u062a \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0646\u0647\u0627\u0626\u064a\u0629.`;',
    '}',
  ].join('\n');
  src = once(src, re, replacement, 'concise commercial decision screen');
  write(rel, src);
  console.log('PASS - preliminary approval now exposes explicit 1/2 decision screen');
}

// 5) Numeric 2/Arabic 2 is a decline only when the previous assistant turn is the decision screen.
{
  const rel = 'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts';
  let src = read(rel);
  if (!src.includes('const numericDecisionDecline = /^(?:2|\\u0662)$/.test(q)')) {
    src = once(
      src,
      /  return explicit \|\| contextualDecline;/,
      '  const numericDecisionDecline = /^(?:2|\\u0662)$/.test(q)\\n    && /(?:1|2|\\u0661|\\u0662)/.test(ctx)\\n    && /(?:\\u0627\\u0644\\u0627\\u0633\\u062a\\u0645\\u0631\\u0627\\u0631|\\u0631\\u0633\\u0648\\u0645\\s+\\u0641\\u062a\\u062d\\s+\\u0627\\u0644\\u0645\\u0644\\u0641)/.test(ctx);\\n  return explicit || contextualDecline || numericDecisionDecline;',
      'contextual numeric decline'
    );
  }
  write(rel, src);
  console.log('PASS - numeric 2 decline is scoped to the active commercial decision screen');
}

// 6) Historical calendar selftest: preserve Fri/Sat for final study/review/delivery, not conversion.
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
