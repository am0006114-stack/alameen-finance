const fs = require('fs');

function read(path){ return fs.readFileSync(path,'utf8'); }
function assert(cond,msg){ if(!cond) throw new Error(msg); }

const constants = read('app/api/whatsapp/webhook/_lib/constants.ts');
const answers = read('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts');
const brain = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');
const web = read('app/api/whatsapp/webhook/_lib/v3-os/freshPublicFacts.ts');

assert(constants.includes('هدفها تنظيم الدخول لهالمرحلة وقياس جدية الطلب'), 'canonical fee rationale missing');
assert(constants.includes('مش ثمن الجهاز ولا قسط مقدم ولا القسط الأول'), 'fee distinctions missing');
assert(constants.includes('مستردة بالكامل عبر المسار الرسمي'), 'fee refund rule missing');

assert(answers.includes('const feeReason ='), 'fee reason intent missing');
assert(answers.includes('if (f.feeReason) parts.push(feeReasonPart());'), 'fee reason answer hook missing');
assert(answers.includes('احكيلي اسم البنك وبشوف معك إذا CliQ متاح من نفس التطبيق'), 'concise payment access follow-up missing');
assert(!answers.includes('ما عندي قناة ثالثة معتمدة أقدر أخترعها'), 'robotic invention wording still present');

assert(brain.includes('الكلام ما قل ودل'), 'concise-by-default rule missing');
assert(brain.includes('لا تكرر آخر رد بصياغته إذا العميل أعطاك المعلومة التي طلبتها'), 'context consumption rule missing');
assert(brain.includes('إذا سألناه عن اسم البنك بسبب CliQ'), 'bank follow-up rule missing');
assert(brain.includes('requiresExternalFact=true'), 'external fact follow-up requirement missing');
assert(brain.includes('ممنوع تسريب لغة الحواجز الداخلية'), 'guard-language leak rule missing');

assert(web.includes('البنك\\s+العربي\\s+الاسلامي'), 'Islamic Arab Bank public lookup detection missing');
assert(web.includes('جوابًا طبيعيًا مختصرًا من 1-3 جمل'), 'terse public web response rule missing');

console.log('PHASE 14.3 HUMANIZATION SELFTEST PASS');
