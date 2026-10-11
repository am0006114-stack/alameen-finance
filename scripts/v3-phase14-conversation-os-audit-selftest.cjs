const assert = require('assert');
const fs = require('fs');

function text(path) {
  return fs.readFileSync(path, 'utf8');
}

const answer = text('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts');
const arbiter = text('app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts');
const brain = text('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');
const human = text('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const facts = text('app/api/whatsapp/webhook/_lib/v3-os/freshPublicFacts.ts');
const route = text('app/api/whatsapp/webhook/route.ts');

function before(haystack, a, b, label) {
  const ai = haystack.indexOf(a);
  const bi = haystack.indexOf(b);
  assert(ai >= 0, `${label}: missing first marker`);
  assert(bi >= 0, `${label}: missing second marker`);
  assert(ai < bi, `${label}: wrong precedence`);
}

// 1) A multi-question customer turn must be composed before any single-domain
// current-turn rule can erase sibling questions.
assert(arbiter.includes('const answerBundle = resolveAnswerBundle'));
before(
  arbiter,
  'if (answerBundle.kind === "multi_question") return "answer_bundle";',
  'if (currentTurnSupremacy.kind !== "none") return "current_turn_supremacy";',
  'multi-question supremacy'
);

// 2) Payment access difficulty is not the same thing as asking to repeat payment
// destinations. The system must explain options rather than dump the full block.
assert(answer.includes('const paymentAccessProblem ='));
assert(answer.includes('function paymentAccessProblemPart'));
assert(answer.includes('إذا ما عندك لا CliQ ولا محفظة'));
assert(answer.includes('خدمة CliQ متاحة من تطبيق البنك'));
assert(answer.includes('if (f.paymentAccessProblem) parts.push(paymentAccessProblemPart(input.truth));'));
assert(answer.includes('if (f.feePaymentMethod && !f.paymentAccessProblem)'));

// 3) Direct identity challenge must be answered truthfully; never impersonate a
// human employee or suppress the fact that the responder is AI.
assert(answer.includes('const assistantIdentity ='));
assert(answer.includes('أنا مساعد ذكاء اصطناعي تابع للأمين للأقساط، مش موظف بشري'));
assert(human.includes('أنا مساعد ذكاء اصطناعي تابع للأمين، مش موظف بشري'));
assert(route.includes('أنا مساعد ذكاء اصطناعي تابع للأمين، مش موظف بشري'));
assert(!brain.includes('لا تقل «أنا مساعد آلي»'));
assert(brain.includes('كن شفافًا: قل إنك مساعد ذكاء اصطناعي تابع للأمين ومش موظف بشري'));

// 4) The AI must be able to explicitly request public/current knowledge instead
// of pretending every answer is closed-book.
assert(brain.includes('requiresExternalFact: boolean;'));
assert(brain.includes('externalFactNeeded: string | null;'));
assert(brain.includes('requiresExternalFact: meaning.requiresExternalFact'));
assert(brain.includes('externalFactNeeded: meaning.externalFactNeeded'));
assert(brain.includes('"requiresExternalFact":false'));
assert(brain.includes('"externalFactNeeded":null'));
assert(brain.includes('إذا احتاج سؤال عام معلومة خارجية حديثة أو محلية عامة'));

// 5) Public web lookup is allowed only for de-identified public knowledge and must
// never become an alternate source of customer/application/payment truth.
assert(facts.includes('export function safePublicKnowledgeQuestion'));
assert(facts.includes('export async function resolveSafePublicKnowledgeReply'));
assert(facts.includes('tools:[{type:"web_search"}]'));
assert(facts.includes('فضّل المصادر الرسمية الأردنية أولًا مثل JoPACC والبنك المركزي الأردني'));
assert(facts.includes('.replace(/AM-\\d{8,}/gi,"[tracking]")'));
assert(facts.includes('.replace(/\\b(?:962)?7\\d{8}\\b/g,"[phone]")'));
assert(facts.includes('turn.requestedActions.length>0'));
assert(facts.includes('حالة طلب عميل أو بيانات دفع الأمين أو اسم المستفيد أو رسومه'));
assert(human.includes('resolveSafePublicKnowledgeReply'));
assert(human.includes('const authoritativePublicKnowledgeReply = await resolveSafePublicKnowledgeReply'));
assert(human.includes('reply = authoritativePublicKnowledgeReply || arbitration.reply;'));

// 6) A Discord policy suppression for routine human-contact requests is an
// autonomous conversation path, not a failed business action.
assert(human.includes('"autonomous"'));
assert(human.includes('autonomous_conversation_request_does_not_require_human_intervention'));
assert(human.includes('humanEscalationReceipt && humanEscalationReceipt !== "autonomous"'));
assert(human.includes('طلب موظف أو مكالمة ما بعمل تحويل بشري تلقائي'));

// 7) Preserve the actual WhatsApp typing indicator path while auditing. The code
// must remain enabled-by-default and invoked before message processing.
assert(route.includes('async function sendWhatsAppTypingIndicator'));
assert(route.includes('envFlag("WHATSAPP_TYPING_INDICATOR_ENABLED", true)'));
assert(route.includes('typing_indicator:'));
assert(route.includes('type: "text"'));
assert(route.includes('await sendWhatsAppTypingIndicator(message.id);'));

console.log('PASS Phase 14 conversation OS audit gate');
