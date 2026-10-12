const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
let passed = 0;
let failed = 0;
const ok = (condition, message) => {
  if (condition) {
    passed += 1;
    console.log(`PASS ${passed}: ${message}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
};
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const base = 'app/api/whatsapp/webhook/_lib/v3-os/';
const control = read(base + 'humanOsControl.ts');
const runtime = read(base + 'runtimeLive.ts');
const kernel = read(base + 'nativeConversationKernel.ts');
const humanOs = read(base + 'humanConversationOS.ts');
const arbiter = read(base + 'responseArbiter.ts');
const corpus = JSON.parse(read('scripts/v3-phase17-golden-conversation-corpus.json'));

// Cutover ownership: the DB flag can no longer re-enable the multi-writer path.
ok(control.includes('Phase 17 — Single Writer Conversation Cutover'), 'Phase 17 cutover is explicit in control source');
ok(!control.includes('from("whatsapp_human_os_settings")'), 'DB settings cannot silently re-enable HumanConversationOS');
ok(/enabled:\s*false/.test(control), 'HumanConversationOS is hard-disabled during Phase 17 evaluation');
ok(/return\s+PHASE17_NATIVE_SINGLE_WRITER/.test(control), 'control always returns the Phase 17 native single-writer decision');

// Runtime ownership: when Human OS is disabled, live traffic goes through the existing
// Native Conversation Kernel path rather than the multi-writer HumanConversationOS.
ok(runtime.includes('if (humanOs.enabled)'), 'runtime still has an explicit compatibility switch boundary');
ok(runtime.includes('return runLegacyV3ProductionLive(input);'), 'disabled Human OS falls through to native-kernel runtime');
ok(runtime.includes('nativeKernelInitial = await runNativeConversationKernel'), 'native kernel performs the normal conversation generation');
ok(!runtime.includes('arbitrateProductionReply('), 'legacy response arbiter is not part of native live runtime');

// Single-writer contract already present in the Native Conversation Kernel.
ok(kernel.includes('أنت سلطة الحوار الوحيدة لهذه الرسالة'), 'native kernel declares one conversational authority');
ok(kernel.includes('جاوب كل سؤال مادي في الرسالة الحالية'), 'native kernel must cover every material current-turn question');
ok(kernel.includes('لا تبدّل السؤال إلى status أقدم'), 'stale status/history cannot replace the current question');
ok(kernel.includes('عرّف باسم الموظف الحالي فقط'), 'identity uses the active employee persona instead of technical bot prose');
ok(kernel.includes('لا تقل «شخص حقيقي/مش رد آلي/مش بوت»'), 'kernel forbids false literal human/automation claims');
ok(kernel.includes('اقرأ فقاعات واتساب كسياق واحد'), 'kernel treats WhatsApp bubbles as one conversational context');
ok(kernel.includes('تذكّر ما تم شرحه ولا تجبر العميل على إعادة السؤال بصيغة سحرية'), 'kernel preserves conversational continuity');

// The problematic architecture remains in source only for rollback/reference; it must
// not own live traffic while Phase 17 control is hard-off.
ok(humanOs.includes('arbitrateProductionReply'), 'audit confirms multi-writer HumanConversationOS still exists as isolated legacy source');
ok(arbiter.includes('directRepair'), 'audit confirms deterministic repair-writer still exists only behind disabled Human OS');

// Golden corpus: production-proven failures become mandatory review cases.
ok(corpus.version.includes('phase17-single-writer-cutover'), 'golden corpus version is Phase 17');
ok(Array.isArray(corpus.cases) && corpus.cases.length >= 10, 'golden corpus contains at least ten production-proven failure sequences');
const ids = new Set(corpus.cases.map((x) => x.id));
for (const id of [
  'self_employed_income_stays_income',
  'identity_is_persona_not_operations_template',
  'contact_request_is_not_location',
  'location_followup_stays_location',
  'yes_answers_open_application_prompt',
  'guarantor_question_answers_guarantor_requirements',
  'office_payment_does_not_invent_cancellation',
  'new_text_beats_stale_voice',
  'payment_access_plus_identity_covers_both',
  'abuse_does_not_trigger_stale_human_request_template',
]) ok(ids.has(id), `golden corpus includes ${id}`);

const mixed = corpus.cases.find((x) => x.id === 'payment_access_plus_identity_covers_both');
ok(Boolean(mixed && mixed.mustCover.includes('payment access problem') && mixed.mustCover.includes('current employee persona name')), 'mixed-turn golden case requires coverage of both payment access and persona identity');

console.log(`\nPhase 17 assertions: ${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
