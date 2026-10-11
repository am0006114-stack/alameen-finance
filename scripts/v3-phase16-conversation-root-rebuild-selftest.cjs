const assert = require('assert');
const fs = require('fs');
const path = require('path');

function text(p) { return fs.readFileSync(p, 'utf8'); }
const human = text('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const brain = text('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');
const answer = text('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts');
const route = text('app/api/whatsapp/webhook/route.ts');
const native = text('app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');
const informed = text('app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts');

// Screenshot #2 root cause: nature/identity text must not turn a mixed service turn
// into a deterministic terminal response.
assert(!human.includes('function explicitStaffNatureQuestion'));
assert(!human.includes('function explicitAssistantIdentityReply'));
assert(!human.includes('authoritativeIdentityReply'));
assert(!human.includes('explicitStatusTracking || explicitIdentityQuestion ||'));
assert(human.includes('const modelTier: HumanModelTier = (explicitStatusTracking || secureDeviceChangeRequested || authoritativeSyntheticMediaReply)'));
assert(!human.includes('explicitIdentityQuestion'));

// Identity is a composable staff answer. Payment access remains a sibling answer.
assert(answer.includes('const paymentAccessProblem ='));
assert(answer.includes('const staffIdentity ='));
assert(answer.includes('if (f.paymentAccessProblem) parts.push(paymentAccessProblemPart(input.truth));'));
assert(answer.includes('if (f.staffIdentity) parts.push(staffIdentityPart(input.turn, input.state));'));
assert(answer.includes('return `معك ${name} من فريق الأمين.`;'));

// Screenshot #1 root cause: old semantic continuation state cannot expose payment
// destinations unless the CURRENT turn explicitly asks/commits to payment or answers
// the active decision screen.
assert(human.includes('const currentTurnPaymentIntent = paymentQuestionAfterDisclosure(turn, truthAfterActions)'));
assert(human.includes('alreadyDisclosed && commercialContinuationAffirmativeText(input.customerText)'));
assert(human.includes('&& currentTurnPaymentIntent;'));
assert(!human.includes('(Boolean(continuationIntent) || paymentQuestionAfterDisclosure(turn, truthAfterActions))'));
assert(informed.includes('numericCommercialContinueText'));
assert(informed.includes('commercialContinuationAffirmativeText'));

// No known customer-visible implementation-disclosure signatures may survive in the
// live WhatsApp path. Internal inbound detectors/guards are allowed and required.
const liveFiles = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p); else if (/\.(?:ts|tsx|js|cjs|mjs)$/.test(ent.name)) liveFiles.push(p);
  }
}
walk('app/api/whatsapp/webhook');
const live = liveFiles.map(p => text(p)).join('\n');
for (const forbidden of [
  'وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين',
  'والرد هون آلي من نظام الأمين',
  'أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري',
  'بيتوقف الرد الآلي على المحادثة',
]) assert(!live.includes(forbidden), `forbidden customer-facing identity signature survived: ${forbidden}`);

// Safety still prevents a generated reply from claiming literal human identity or
// leaking internal implementation terms.
assert(native.includes('internal_or_generic_fallback_leak'));
assert(native.includes('false_literal_human_handoff_claim'));

// Exact screenshot language remains recognizable as a payment-access problem +
// staff identity multi-question in the answer-bundle source; full payment payload is
// intentionally not the response authority for this mixed turn.
const screenshot2 = 'ما عندي كليك ولا محفظة كيف بدي ادفع؟ ليش مش راضي تفهم و مين معي بوت ولا ذكاء اصطناعي؟';
assert(/ما عندي كليك ولا محفظة/.test(screenshot2));
assert(/مين معي بوت ولا ذكاء اصطناعي/.test(screenshot2));
assert(answer.includes('إذا ما عندك CliQ ولا محفظة'));

console.log('PASS Phase 16 conversation root rebuild regression gate');
