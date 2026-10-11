const assert = require('assert');
const fs = require('fs');

const brain = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts','utf8');
const human = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','utf8');
const answer = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts','utf8');
const route = fs.readFileSync('app/api/whatsapp/webhook/route.ts','utf8');

assert(brain.includes('«معك ${employeeName} من فريق الأمين»'));
assert(brain.includes('سؤال العميل عن طبيعة المجيب أو عن هويته ما بصير يملك الرسالة كلها'));
assert(brain.includes('ولا تدّعِ أنك إنسان حقيقي'));
assert(!brain.includes('والرد هون آلي من نظام الأمين'));

assert(!human.includes('function explicitStaffNatureQuestion'));
assert(!human.includes('function explicitAssistantIdentityReply'));
assert(!human.includes('والرد هون آلي من نظام الأمين'));
assert(!human.includes('authoritativeIdentityReply'));
assert(!human.includes('explicitStatusTracking || explicitIdentityQuestion ||'));

assert(answer.includes('import { roleDisplayName } from "./hierarchy";'));
assert(answer.includes('function explicitStaffNatureQuestion'));
assert(answer.includes('staffIdentityPart(input.turn, input.state)'));
assert(answer.includes('return `معك ${name} من فريق الأمين.`;'));
assert(!answer.includes('مساعد ذكاء اصطناعي تابع للأمين'));

assert(route.includes('function employeeIdentityReply(from: string, app?: ApplicationRecord | null, customerText = "")'));
assert(route.includes('if (isBotIdentityChallengeText(customerText))'));
assert(route.includes('return `معك ${staffName} من فريق الأمين. ${requestLine}`;'));
assert(!route.includes('مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري'));

console.log('PASS Phase 14.2 compatibility gate under Phase 16 employee-first authority');
