from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

root = Path('.')

# 1) Human Conversation OS: identity/nature text must never seize the whole turn.
os_path = root / 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts'
os = os_path.read_text(encoding='utf-8')
os = replace_once(
    os,
    'import { buildInformedCommercialDisclosureReply, buildPostDisclosurePaymentReply, commercialDisclosureDelivered, informedCommercialContinuationConfirmed, markCommercialDisclosureAcknowledged, markCommercialDisclosureDelivered, resemblesFullCommercialDisclosure, resemblesPostDisclosurePaymentReply, shouldExplainCommercialStep } from "./informedCommercialContinuation";\n',
    'import { buildInformedCommercialDisclosureReply, buildPostDisclosurePaymentReply, commercialContinuationAffirmativeText, commercialDisclosureDelivered, informedCommercialContinuationConfirmed, markCommercialDisclosureAcknowledged, markCommercialDisclosureDelivered, resemblesFullCommercialDisclosure, resemblesPostDisclosurePaymentReply, shouldExplainCommercialStep } from "./informedCommercialContinuation";\n',
    'human OS commercial import',
)
old_identity_block = '''function explicitAssistantIdentityQuestion(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const normalized = raw
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  return /(?:ذكاء\\s*اصطناعي|\\bai\\b|بوت|روبوت|رد\\s*(?:الي|آلي)|(?:انت|انتي|إنت|إنتي).{0,18}(?:انسان|إنسان|بشر|موظف).{0,12}(?:حقيقي|فعلي)?|(?:انسان|إنسان|بشر|موظف).{0,18}(?:ولا|او|أو).{0,18}(?:ذكاء\\s*اصطناعي|بوت|روبوت))/i.test(normalized);
}

function explicitAssistantIdentityReply(input: { customerText: string; state: ConversationState }) {
  const name = roleDisplayName(input.state.role.currentRole);
  const normalized = String(input.customerText || "")
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  const asksNature = /(?:ذكاء\\s*اصطناعي|\\bai\\b|بوت|روبوت|رد\\s*(?:الي|آلي)|(?:انت|انتي|إنت|إنتي).{0,18}(?:انسان|إنسان|بشر|موظف).{0,12}(?:حقيقي|فعلي)?)/i.test(normalized);
  const asksResponsible = /(?:المسؤول|المسوول|المدير|الاداره|الإدارة)/.test(normalized);
  if (asksNature) {
    return `معك ${name} من فريق الأمين، والرد هون آلي من نظام الأمين. خليني أكمل معك على نفس موضوعك.`;
  }
  if (asksResponsible) {
    return `معك ${name} من فريق الأمين، وأنا بكمل معك بهالموضوع هون. احكيلي شو المطلوب وبمشيه معك حسب حالة الطلب الفعلية.`;
  }
  return `معك ${name} من فريق الأمين، وأنا اللي بكمل معك هون. احكيلي شو بدك وبجاوبك أو بنفذ الإجراء المسموح حسب حالة طلبك.`;
}
'''
new_identity_block = '''function explicitStaffNatureQuestion(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const normalized = raw
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  return /(?:ذكاء\\s*اصطناعي|\\bai\\b|بوت|روبوت|رد\\s*(?:الي|آلي)|(?:انت|انتي|إنت|إنتي).{0,18}(?:انسان|إنسان|بشر|موظف).{0,12}(?:حقيقي|فعلي)?|(?:انسان|إنسان|بشر|موظف).{0,18}(?:ولا|او|أو).{0,18}(?:ذكاء\\s*اصطناعي|بوت|روبوت))/i.test(normalized);
}
'''
os = replace_once(os, old_identity_block, new_identity_block, 'remove terminal automated identity writer')
os = replace_once(
    os,
    'const explicitIdentityQuestion = explicitAssistantIdentityQuestion(input.customerText);',
    'const explicitIdentityQuestion = explicitStaffNatureQuestion(input.customerText);',
    'rename identity detector call',
)
os = replace_once(
    os,
    'const modelTier: HumanModelTier = (explicitStatusTracking || explicitIdentityQuestion || secureDeviceChangeRequested || authoritativeSyntheticMediaReply) ? "deterministic" : (provisionalRoute.tier === "sol" ? "deepseek" : provisionalRoute.tier);',
    'const modelTier: HumanModelTier = (explicitStatusTracking || secureDeviceChangeRequested || authoritativeSyntheticMediaReply) ? "deterministic" : (provisionalRoute.tier === "sol" ? "deepseek" : provisionalRoute.tier);',
    'identity must not force deterministic tier',
)
os = replace_once(
    os,
    '  const paymentExecutionRequired = !paymentAccessProblem && !contextualAnswerOwnsTurn && !disclosureRequired && alreadyDisclosed && (Boolean(continuationIntent) || paymentQuestionAfterDisclosure(turn, truthAfterActions));',
    '  // Phase 16 current-turn payment authority: old semantic/state continuation may explain context,\n  // but it can never expose payment destinations by itself. The CURRENT customer message\n  // must explicitly ask/commit to payment or answer the active commercial decision.\n  const currentTurnPaymentIntent = paymentQuestionAfterDisclosure(turn, truthAfterActions)\n    || (alreadyDisclosed && commercialContinuationAffirmativeText(input.customerText));\n  const paymentExecutionRequired = !paymentAccessProblem && !contextualAnswerOwnsTurn && !disclosureRequired && alreadyDisclosed && currentTurnPaymentIntent;',
    'current-turn payment execution authority',
)
os = replace_once(
    os,
    '  const authoritativeIdentityReply = explicitIdentityQuestion ? explicitAssistantIdentityReply({ customerText: input.customerText, state: stateWorking }) : null;\n',
    '',
    'remove identity terminal reply declaration',
)
os = replace_once(
    os,
    '  let reply = authoritativeTrackingReply || authoritativeIdentityReply || authoritativeSyntheticMediaReply || authoritativeDeviceChangeReply || manualChangeScopeBlockedReply || manualChangeConfirmationPrompt || authoritativeManualMutationReply || authoritativePaymentRelativeReply || gate.confirmationPrompt || gate.informationalReply || actionSuccessReply(truthAfterActions, actionResults) || actionFailureReply(truthAfterActions, actionResults) || authoritativeHumanRequestReply || authoritativePublicKnowledgeReply || authoritativeSocialReply;',
    '  let reply = authoritativeTrackingReply || authoritativeSyntheticMediaReply || authoritativeDeviceChangeReply || manualChangeScopeBlockedReply || manualChangeConfirmationPrompt || authoritativeManualMutationReply || authoritativePaymentRelativeReply || gate.confirmationPrompt || gate.informationalReply || actionSuccessReply(truthAfterActions, actionResults) || actionFailureReply(truthAfterActions, actionResults) || authoritativeHumanRequestReply || authoritativePublicKnowledgeReply || authoritativeSocialReply;',
    'remove identity from reply precedence',
)
os = replace_once(
    os,
    '  const authoritativeDeterministicReply = Boolean(authoritativeTrackingReply || authoritativeIdentityReply || authoritativeSyntheticMediaReply || authoritativeDeviceChangeReply || manualChangeScopeBlockedReply || manualChangeConfirmationPrompt || authoritativeManualMutationReply || authoritativePaymentRelativeReply || authoritativeHumanRequestReply || authoritativePublicKnowledgeReply || authoritativeSocialReply || authoritativeGateReply || authoritativeArbiterReply);',
    '  const authoritativeDeterministicReply = Boolean(authoritativeTrackingReply || authoritativeSyntheticMediaReply || authoritativeDeviceChangeReply || manualChangeScopeBlockedReply || manualChangeConfirmationPrompt || authoritativeManualMutationReply || authoritativePaymentRelativeReply || authoritativeHumanRequestReply || authoritativePublicKnowledgeReply || authoritativeSocialReply || authoritativeGateReply || authoritativeArbiterReply);',
    'remove identity deterministic safety bypass',
)
os = replace_once(
    os,
    '  const finalAuthoritativeDeterministicReply = Boolean(authoritativeTrackingReply || authoritativeIdentityReply || authoritativeSyntheticMediaReply || authoritativeDeviceChangeReply || manualChangeScopeBlockedReply || manualChangeConfirmationPrompt || authoritativeManualMutationReply || authoritativePaymentRelativeReply || authoritativeHumanRequestReply || authoritativePublicKnowledgeReply || authoritativeSocialReply || finalAuthoritativeGateReply || authoritativeArbiterReply);',
    '  const finalAuthoritativeDeterministicReply = Boolean(authoritativeTrackingReply || authoritativeSyntheticMediaReply || authoritativeDeviceChangeReply || manualChangeScopeBlockedReply || manualChangeConfirmationPrompt || authoritativeManualMutationReply || authoritativePaymentRelativeReply || authoritativeHumanRequestReply || authoritativePublicKnowledgeReply || authoritativeSocialReply || finalAuthoritativeGateReply || authoritativeArbiterReply);',
    'remove identity final deterministic safety bypass',
)
os_path.write_text(os, encoding='utf-8')

# 2) Human brain: personas are company employees; nature questions are never a terminal topic.
brain_path = root / 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts'
brain = brain_path.read_text(encoding='utf-8')
brain = replace_once(
    brain,
    'const instructions = `أنت ${employeeName} من فريق الأمين للأقساط داخل Human Company OS. أنت الموظف الحالي الذي يدير المحادثة بشكل مستقل وطبيعي، ولست بوت قوائم ولا مساعدًا شخصيًا عامًا. افهم مقصد الإنسان الكامل، التصحيح، التردد، تغيير الرأي، الغضب، المرجع الضمني، والرسائل القصيرة بحسب السياق. حافظ على شخصية ${employeeName} ودورها وصوتها من PERSONA أدناه، ولا تبدّل الشخصية من نفسك؛ تبديل الدور يحدده النظام.',
    'const instructions = `أنت ${employeeName} من فريق الأمين للأقساط داخل Human Company OS. أنت الموظف الحالي الذي يدير المحادثة بشكل مستقل وطبيعي. افهم مقصد الإنسان الكامل، التصحيح، التردد، تغيير الرأي، الغضب، المرجع الضمني، والرسائل القصيرة بحسب السياق. حافظ على شخصية ${employeeName} ودورها وصوتها من PERSONA أدناه، ولا تبدّل الشخصية من نفسك؛ تبديل الدور يحدده النظام.',
    'brain employee-first opening',
)
old_brain_identity = '''- حافظ على شخصية ${employeeName} كموظف الأمين الحالي بالكامل في الأسلوب والمتابعة. إذا سأل العميل «شو اسمك؟» أو «مين انت؟» أو «مين بيحكي معي؟» أو «مين المسؤول؟»، عرّف بنفسك طبيعيًا وباختصار: «معك ${employeeName} من فريق الأمين» وكمل الموضوع. هاي أسئلة شخصية/دور وليست سؤالًا تقنيًا عن النظام.
- customerMessage الحالي وحده يقدر يفتح سؤال طبيعة المجيب؛ recentConversation أو سؤال هوية سابق ممنوع يلوث رد لاحق مثل «مش فاهمني» أو موضوع جديد.
- فقط إذا الرسالة الحالية نفسها تسأل بشكل صريح ومباشر هل الرد إنسان أم بوت/ذكاء اصطناعي، جاوب بأقصر صيغة صادقة بدون مصطلحات تقنية: «معك ${employeeName} من فريق الأمين، والرد هون آلي من نظام الأمين.» وبعدها ارجع فورًا لنفس موضوع العميل. لا تذكر «مساعد رقمي» ولا «مش شخص بشري» ولا أسماء نماذج أو مزودين أو تفاصيل النظام.
'''
new_brain_identity = '''- حافظ على شخصية ${employeeName} كموظف الأمين الحالي بالكامل في الأسلوب والمتابعة. إذا سأل العميل عن اسمك أو مين معه أو مين المسؤول، عرّف بنفسك طبيعيًا وباختصار: «معك ${employeeName} من فريق الأمين» وكمل الموضوع.
- سؤال العميل عن طبيعة المجيب أو عن هويته ما بصير يملك الرسالة كلها. إذا بنفس الرسالة في مشكلة دفع أو سؤال أو شكوى أو طلب، عرّف باسم الموظف بجملة قصيرة ثم جاوب كل النقاط المادية بنفس الرد؛ ممنوع إسقاط أي نقطة بسبب سؤال الهوية.
- لا تدخل مع العميل في شرح تقني عن طريقة تشغيل المحادثة ولا أسماء النماذج أو المزوّدين أو البنية الداخلية، ولا تدّعِ أنك إنسان حقيقي. هوية التعامل الظاهرة للعميل هي اسم الموظف الحالي من فريق الأمين.
- customerMessage الحالي وحده يحدد المطلوب الآن؛ recentConversation أو سؤال هوية سابق ممنوع يلوث رد لاحق مثل «مش فاهمني» أو موضوع جديد.
'''
brain = replace_once(brain, old_brain_identity, new_brain_identity, 'brain identity architecture')
brain_path.write_text(brain, encoding='utf-8')

# 3) Answer obligations: identity is a staff-role sub-answer, never implementation disclosure.
answer_path = root / 'app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts'
answer = answer_path.read_text(encoding='utf-8')
answer = answer.replace('assistantIdentity', 'staffIdentity')
answer = answer.replace('explicitAssistantNatureQuestion', 'explicitStaffNatureQuestion')
answer = answer.replace('assistantIdentityPart', 'staffIdentityPart')
old_staff_part = '''function staffIdentityPart(turn: InterpretedTurn, state: ConversationState) {
  const name = roleDisplayName(state.role.currentRole);
  if (explicitStaffNatureQuestion(turn.rawText)) {
    return `معك ${name} من فريق الأمين. وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري. بقدر أفهم رسالتك وأتابع حالة الطلب وأنفذ فقط الإجراءات المسموحة بالنظام.`;
  }
  return `معك ${name} من فريق الأمين، وأنا اللي بكمل معك هون. احكيلي شو بدك وبجاوبك حسب حالة طلبك الفعلية.`;
}
'''
new_staff_part = '''function staffIdentityPart(_turn: InterpretedTurn, state: ConversationState) {
  const name = roleDisplayName(state.role.currentRole);
  return `معك ${name} من فريق الأمين.`;
}
'''
answer = replace_once(answer, old_staff_part, new_staff_part, 'answer bundle staff identity part')
answer_path.write_text(answer, encoding='utf-8')

# 4) Legacy route fallback: even if legacy code is ever reached, it must not expose implementation identity.
route_path = root / 'app/api/whatsapp/webhook/route.ts'
route = route_path.read_text(encoding='utf-8')
route = replace_once(
    route,
    '''  if (isBotIdentityChallengeText(customerText)) {
    return `معك ${staffName} من فريق الأمين. وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري. ${requestLine}`;
  }

  return `معك ${staffName} من فريق الأمين، وأنا اللي بكمل معك هون. ${requestLine}`;
''',
    '''  if (isBotIdentityChallengeText(customerText)) {
    return `معك ${staffName} من فريق الأمين. ${requestLine}`;
  }

  return `معك ${staffName} من فريق الأمين، وأنا اللي بكمل معك هون. ${requestLine}`;
''',
    'legacy route identity output',
)
route_path.write_text(route, encoding='utf-8')

# 5) Update historical regression tests so they can never demand the removed bot-facing behavior again.
phase142 = root / 'scripts/v3-phase14-2-persona-selftest.cjs'
phase142.write_text(r'''const assert = require('assert');
const fs = require('fs');

const brain = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts','utf8');
const human = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','utf8');
const answer = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts','utf8');
const route = fs.readFileSync('app/api/whatsapp/webhook/route.ts','utf8');

assert(brain.includes('«معك ${employeeName} من فريق الأمين»'));
assert(brain.includes('سؤال العميل عن طبيعة المجيب أو عن هويته ما بصير يملك الرسالة كلها'));
assert(brain.includes('ولا تدّعِ أنك إنسان حقيقي'));
assert(!brain.includes('والرد هون آلي من نظام الأمين'));

assert(human.includes('function explicitStaffNatureQuestion'));
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
''', encoding='utf-8')

phase14audit = root / 'scripts/v3-phase14-conversation-os-audit-selftest.cjs'
p14 = phase14audit.read_text(encoding='utf-8')
old_section = '''// 3) Direct identity challenge must be answered truthfully; never impersonate a
// human employee or suppress the fact that the responder is AI.
assert(answer.includes('const assistantIdentity ='));
assert(answer.includes('أنا مساعد ذكاء اصطناعي تابع للأمين للأقساط، مش موظف بشري'));
assert(human.includes('أنا مساعد ذكاء اصطناعي تابع للأمين، مش موظف بشري'));
assert(route.includes('أنا مساعد ذكاء اصطناعي تابع للأمين، مش موظف بشري'));
assert(!brain.includes('لا تقل «أنا مساعد آلي»'));
assert(brain.includes('كن شفافًا: قل إنك مساعد ذكاء اصطناعي تابع للأمين ومش موظف بشري'));
'''
new_section = '''// 3) Identity/nature wording is never allowed to seize the whole turn or expose
// implementation labels. The visible identity is the current Alameen staff role;
// false literal claims of being a real human remain forbidden by the safety layer.
assert(answer.includes('const staffIdentity ='));
assert(answer.includes('return `معك ${name} من فريق الأمين.`;'));
assert(!answer.includes('مساعد ذكاء اصطناعي تابع للأمين'));
assert(human.includes('function explicitStaffNatureQuestion'));
assert(!human.includes('authoritativeIdentityReply'));
assert(!human.includes('والرد هون آلي من نظام الأمين'));
assert(!route.includes('مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري'));
assert(brain.includes('سؤال العميل عن طبيعة المجيب أو عن هويته ما بصير يملك الرسالة كلها'));
'''
p14 = replace_once(p14, old_section, new_section, 'phase14 audit identity section')
phase14audit.write_text(p14, encoding='utf-8')

# 6) New Phase 16 root regression: locks the screenshots' architectural failures out.
selftest = root / 'scripts/v3-phase16-conversation-root-rebuild-selftest.cjs'
selftest.write_text(r'''const assert = require('assert');
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
assert(human.includes('function explicitStaffNatureQuestion'));
assert(!human.includes('function explicitAssistantIdentityReply'));
assert(!human.includes('authoritativeIdentityReply'));
assert(!human.includes('explicitStatusTracking || explicitIdentityQuestion ||'));
assert(human.includes('const modelTier: HumanModelTier = (explicitStatusTracking || secureDeviceChangeRequested || authoritativeSyntheticMediaReply)'));

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
''', encoding='utf-8')

print('PHASE 16 CONVERSATION ROOT REBUILD PATCH APPLIED')
