const fs = require('fs');

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) {
    passed++;
    console.log(`PASS ${passed}: ${message}`);
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const contract = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/currentQuestionAnswerContract.ts', 'utf8');
const disclosure = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts', 'utf8');
const humanOs = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts', 'utf8');

ok(contract.includes('buildInformedCommercialDisclosureReply'), 'current-question contract imports the canonical commercial decision reply');
ok((contract.match(/return buildInformedCommercialDisclosureReply\(truth\);/g) || []).length >= 2, 'both preliminary status and next-step paths return the canonical decision screen');
ok(!contract.includes('إذا بدك تكمل، الخطوة التالية تسجيل الاستمرار ثم فتح الملف للدراسة النهائية'), 'old generic preliminary status sentence cannot own the current-question path');
ok(!contract.includes('إذا بدك تكمل، لازم تسجل اختيار الاستمرار أولًا'), 'old generic next-step sentence cannot own the current-question path');
ok(disclosure.includes('1 - نعم، أريد الاستمرار'), 'canonical decision screen contains option 1');
ok(disclosure.includes('2 - لا، مش هسا'), 'canonical decision screen contains option 2');
ok(disclosure.includes('رسوم فتح الملف ${fee} دنانير'), 'canonical decision screen discloses the 5 JOD fee timing');
ok(humanOs.includes('buildCurrentQuestionAnswerContractReply'), 'Human Conversation OS still passes through current-question authority');
ok(humanOs.includes('arbitrateProductionReply'), 'Human Conversation OS still applies final response arbitration');

console.log(`V3 HUMAN OS PRELIMINARY DECISION AUTHORITY SELFTEST: assertions=${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
