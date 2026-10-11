const fs = require('fs');

function read(path){ return fs.readFileSync(path,'utf8'); }
function assert(cond,msg){ if(!cond) throw new Error(msg); }

const os = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const answers = read('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts');
const web = read('app/api/whatsapp/webhook/_lib/v3-os/freshPublicFacts.ts');

assert(os.includes('function contextualBankCliqFollowup'), 'contextual bank follow-up detector missing');
assert(os.includes('previousAskedForBank'), 'previous bank-question context gate missing');
assert(os.includes('const contextualCliqBank = contextualBankCliqFollowup'), 'contextual bank detector not wired into runtime');
assert(os.includes('turn = makeContextualBankCliqTurn(turn, contextualCliqBank)'), 'contextual bank turn authority missing');
assert(os.includes('requiresExternalFact: true'), 'contextual bank turn does not force external fact lookup');
assert(os.includes('هل ${bankName} يدعم CliQ في الأردن'), 'bank-specific CliQ lookup prompt missing');
assert(answers.includes('احكيلي اسم البنك وبشوفلك إذا CliQ متاح من نفس التطبيق'), 'natural bank follow-up prompt missing');
assert(!answers.includes('حاليًا ما في طريقة دفع ثالثة معتمدة لرسوم فتح الملف'), 'robotic third-channel line still present');
assert(web.includes('if(turn.semantic?.requiresExternalFact===true'), 'safe public knowledge semantic authority missing');
assert(os.indexOf('const contextualCliqBank = contextualBankCliqFollowup') < os.indexOf('const authoritativePublicKnowledgeReply = await resolveSafePublicKnowledgeReply'), 'contextual bank authority must be established before public lookup');
assert(os.includes('reply = authoritativePublicKnowledgeReply || arbitration.reply'), 'public knowledge must remain final egress authority');

console.log('PHASE 14.3.1 CONTEXTUAL BANK FOLLOW-UP SELFTEST PASS');
