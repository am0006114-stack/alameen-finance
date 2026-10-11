from pathlib import Path

p = Path('scripts/v3-phase14-3-1-contextual-bank-followup-selftest.cjs')
p.write_text(r'''const fs = require('fs');

function read(path){ return fs.readFileSync(path,'utf8'); }
function assert(cond,msg){ if(!cond) throw new Error(msg); }

const os = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const answers = read('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts');
const web = read('app/api/whatsapp/webhook/_lib/v3-os/freshPublicFacts.ts');
const continuity = read('app/api/whatsapp/webhook/_lib/v3-os/conversationContinuityAuthority.ts');
const brain = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');

// Phase 15+ removed the bank-specific synthetic-turn patch. Context continuation is
// generic: a short bank/app answer belongs to the question the employee just asked.
assert(!os.includes('function contextualBankCliqFollowup'), 'obsolete bank-specific detector returned');
assert(!os.includes('makeContextualBankCliqTurn'), 'obsolete bank-specific synthetic turn returned');
assert(continuity.includes('likelyContextualAnswerToAssistantPrompt'), 'generic contextual answer authority missing');
assert(os.includes('likelyContextualAnswerToAssistantPrompt'), 'generic contextual answer authority not wired into HumanOS');
assert(os.includes('contextualAnswerOwnsTurn'), 'contextual answer ownership missing');
assert(brain.includes('لا تكرر آخر رد بصياغته إذا العميل أعطاك المعلومة التي طلبتها'), 'generic short-answer continuity contract missing');
assert(answers.includes('احكيلي اسم البنك وبشوفلك إذا CliQ متاح من نفس التطبيق'), 'natural bank follow-up prompt missing');
assert(!answers.includes('حاليًا ما في طريقة دفع ثالثة معتمدة لرسوم فتح الملف'), 'robotic third-channel line still present');
assert(web.includes('if(turn.semantic?.requiresExternalFact===true'), 'safe public knowledge semantic authority missing');
assert(os.includes('const authoritativePublicKnowledgeReply = await resolveSafePublicKnowledgeReply'), 'public lookup authority missing');
assert(os.includes('reply = authoritativePublicKnowledgeReply || arbitration.reply'), 'public knowledge must remain final egress authority');

console.log('PASS Phase 14.3.1 compatibility gate under generic contextual continuation');
''', encoding='utf-8')
print('PHASE 16 STALE BANK TEST MODERNIZED')
