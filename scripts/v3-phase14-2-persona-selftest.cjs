const assert = require('assert');
const fs = require('fs');

const brain = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts','utf8');
const human = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','utf8');
const answer = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts','utf8');
const route = fs.readFileSync('app/api/whatsapp/webhook/route.ts','utf8');

assert(brain.includes('«معك ${employeeName} من فريق الأمين»'));
assert(brain.includes('بدون ما تفتح موضوع الذكاء الاصطناعي من نفسك'));
assert(brain.includes('فقط إذا سأل العميل صراحة عن طبيعة المجيب'));
assert(brain.includes('لا تدّعِ أنك إنسان حقيقي'));

assert(human.includes('const asksNature ='));
assert(human.includes('معك ${name} من فريق الأمين، وأنا اللي بكمل معك هون'));
assert(human.includes('وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري'));
assert(!human.includes('return `أنا مساعد ذكاء اصطناعي تابع للأمين، وبكمل معك هون مباشرة.'));

assert(answer.includes('import { roleDisplayName } from "./hierarchy";'));
assert(answer.includes('function explicitAssistantNatureQuestion'));
assert(answer.includes('assistantIdentityPart(input.turn, input.state)'));
assert(answer.includes('معك ${name} من فريق الأمين، وأنا اللي بكمل معك هون'));

assert(route.includes('function employeeIdentityReply(from: string, app?: ApplicationRecord | null, customerText = "")'));
assert(route.includes('if (isBotIdentityChallengeText(customerText))'));
assert(route.includes('معك ${staffName} من فريق الأمين، وأنا اللي بكمل معك هون'));
assert(route.includes('employeeIdentityReply(app.phone || app.tracking_id || app.id, app, customerText)'));
assert(route.includes('employeeIdentityReply(from, app, rawCustomerText)'));

console.log('PASS Phase 14.2 persona-default/direct-nature-transparency gate');
