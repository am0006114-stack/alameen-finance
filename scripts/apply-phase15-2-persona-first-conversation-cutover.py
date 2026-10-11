from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

root = Path('.')

continuity_path = root / 'app/api/whatsapp/webhook/_lib/v3-os/conversationContinuityAuthority.ts'
continuity = continuity_path.read_text(encoding='utf-8')
old = '''export function explicitCurrentTurnPaymentExecution(value: string | null | undefined) {
  const q = normalize(value);
  if (!q) return false;
  return /(?:كيف|وين|بدي|اريد|حاب|ممكن).{0,24}(?:ادفع|دفع|احول|تحويل)|(?:ادفع|احول|حول|تحويل)(?:\\s|$)|(?:بيانات|رقم|اسم).{0,18}(?:الدفع|التحويل|المستفيد)|(?:وين|شو).{0,18}(?:رقم\\s+كليك|cliq|كليك).{0,18}(?:احول|تحويل|ادفع)?/.test(q);
}
'''
new = '''export function paymentAccessProblemText(value: string | null | undefined) {
  const q = normalize(value);
  if (!q) return false;
  const missingRail = /(?:ما\\s*عندي|مش\\s*عندي|بدون|مش\\s*مفعل(?:ه)?|ما\\s*بقدر\\s*استخدم).{0,36}(?:كليك|cliq|محفظه|محفظة)|(?:كليك|cliq|محفظه|محفظة).{0,36}(?:ما\\s*عندي|مش\\s*عندي|مش\\s*مفعل(?:ه)?|ما\\s*بقدر)/i.test(q);
  const asksForWay = /(?:كيف|شو|ايش|إيش|وين|طيب|الحل|طريقه|طريقة).{0,34}(?:ادفع|دفع|احول|تحويل)|(?:ادفع|احول|دفع|تحويل).{0,34}(?:كيف|شو|وين|الحل|طريقه|طريقة)/.test(q);
  return missingRail && asksForWay;
}

export function explicitCurrentTurnPaymentExecution(value: string | null | undefined) {
  const q = normalize(value);
  if (!q || paymentAccessProblemText(value)) return false;
  return /(?:كيف|وين|بدي|اريد|حاب|ممكن).{0,24}(?:ادفع|دفع|احول|تحويل)|(?:ادفع|احول|حول|تحويل)(?:\\s|$)|(?:بيانات|رقم|اسم).{0,18}(?:الدفع|التحويل|المستفيد)|(?:وين|شو).{0,18}(?:رقم\\s+كليك|cliq|كليك).{0,18}(?:احول|تحويل|ادفع)?/.test(q);
}
'''
continuity = replace_once(continuity, old, new, 'continuity payment execution')
continuity_path.write_text(continuity, encoding='utf-8')

locks_path = root / 'app/api/whatsapp/webhook/_lib/v3-os/semanticQuestionLocks.ts'
locks = locks_path.read_text(encoding='utf-8')
locks = replace_once(
    locks,
    'import { currentFileOpeningPaymentRule, FILE_OPENING_PAYMENT_PHONE, FILE_OPENING_PAYMENT_BENEFICIARY } from "./paymentDestinationOverride";\n',
    'import { currentFileOpeningPaymentRule, FILE_OPENING_PAYMENT_PHONE, FILE_OPENING_PAYMENT_BENEFICIARY } from "./paymentDestinationOverride";\nimport { paymentAccessProblemText } from "./conversationContinuityAuthority";\n',
    'semantic lock import',
)
old_cliq = '''function cliqUnavailableQuestionText(value: string | null | undefined) {
  const q = n(value);
  return /(?:ما\\s*عندي|مش\\s*عندي|بدون|ما\\s*بزبط|مابزبط|ما\\s*بقدر|مش\\s*مفعل|مش\\s*مفعله).{0,28}(?:كليك|cliq)|(?:كليك|cliq).{0,28}(?:ما\\s*عندي|مش\\s*عندي|ما\\s*بزبط|مابزبط|مش\\s*مفعل)/i.test(q);
}

'''
locks = replace_once(locks, old_cliq, '', 'remove cliq-unavailable hard lock helper')
old_start = '''export function fileOpeningPaymentMethodQuestion(turn: InterpretedTurn, truth?: TruthBundle) {
  const q = n(turn.rawText);
  if (!q) return false;
'''
new_start = '''export function fileOpeningPaymentMethodQuestion(turn: InterpretedTurn, truth?: TruthBundle) {
  const q = n(turn.rawText);
  if (!q || paymentAccessProblemText(turn.rawText)) return false;
'''
locks = replace_once(locks, old_start, new_start, 'semantic payment access early veto')
old_return = '''  return asksPaymentData || feeCommitment || (feeWord && howWhere) || explicitPay || directTransferWhere || destinationConfirmation || sourceCompatibility || cliqUnavailableQuestionText(turn.rawText) || feeDueNextStep || (turn.topics.includes("payment_method") && /(?:ادفع|أدفع|احول|أحول|تحويل|بيانات\\s+الدفع)/.test(q));
'''
new_return = '''  return asksPaymentData || feeCommitment || (feeWord && howWhere) || explicitPay || directTransferWhere || destinationConfirmation || sourceCompatibility || feeDueNextStep || (turn.topics.includes("payment_method") && /(?:ادفع|أدفع|احول|أحول|تحويل|بيانات\\s+الدفع)/.test(q));
'''
locks = replace_once(locks, old_return, new_return, 'remove payment-access problem from payment hard lock')
locks_path.write_text(locks, encoding='utf-8')

brain_path = root / 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts'
brain = brain_path.read_text(encoding='utf-8')
old_identity = '''- حافظ على شخصية ${employeeName} كموظف الأمين الحالي بالكامل في الأسلوب والمتابعة. إذا سأل العميل «شو اسمك؟» أو «مين انت؟» أو «مين بيحكي معي؟»، عرّف بنفسك طبيعيًا: «معك ${employeeName} من فريق الأمين» وكمل الموضوع. أسئلة الاسم أو المسؤول أو مين يحكي معه ليست سببًا لتحويل الرد إلى شرح تقني عن طبيعة النظام.
- customerMessage الحالي وحده يفتح سؤال طبيعة المجيب. لا تعيد ذكر طبيعة المجيب من recentConversation ولا من سؤال سابق إذا الرسالة الحالية انتقلت لموضوع آخر أو كانت شكوى مثل «مش فاهمني»؛ جاوب المشكلة الحالية فقط.
- إذا سأل العميل صراحة في الرسالة الحالية هل المجيب إنسان/بشر أم بوت/روبوت/ذكاء اصطناعي، جاوب بأقصر صيغة صادقة ومحايدة: «معك ${employeeName} من فريق الأمين، وبالمحادثة هاي أنا المساعد الرقمي التابع للأمين.» ثم ارجع فورًا لموضوعه. لا تحوّل الجواب إلى فقرة تقنية ولا تضف «مش شخص بشري» أو «أنفذ فقط الإجراءات المسموحة بالنظام» أو أسماء نماذج/مزودين إلا إذا سأل بتفصيل تقني لاحق.
- لا تذكر أسماء النماذج أو المزوّدين أو المصطلحات الداخلية مثل prompt أو guard أو routing أو Human Company OS للعميل.
'''
new_identity = '''- حافظ على شخصية ${employeeName} كموظف الأمين الحالي بالكامل في الأسلوب والمتابعة. إذا سأل العميل «شو اسمك؟» أو «مين انت؟» أو «مين بيحكي معي؟» أو «مين المسؤول؟»، عرّف بنفسك طبيعيًا وباختصار: «معك ${employeeName} من فريق الأمين» وكمل الموضوع. هاي أسئلة شخصية/دور وليست سؤالًا تقنيًا عن النظام.
- customerMessage الحالي وحده يقدر يفتح سؤال طبيعة المجيب؛ recentConversation أو سؤال هوية سابق ممنوع يلوث رد لاحق مثل «مش فاهمني» أو موضوع جديد.
- فقط إذا الرسالة الحالية نفسها تسأل بشكل صريح ومباشر هل الرد إنسان أم بوت/ذكاء اصطناعي، جاوب بأقصر صيغة صادقة بدون مصطلحات تقنية: «معك ${employeeName} من فريق الأمين، والرد هون آلي من نظام الأمين.» وبعدها ارجع فورًا لنفس موضوع العميل. لا تذكر «مساعد رقمي» ولا «مش شخص بشري» ولا أسماء نماذج أو مزودين أو تفاصيل النظام.
- إذا العميل يقول إنه ما عنده CliQ أو محفظة ويسأل كيف يدفع، اعتبرها مشكلة وصول لطريقة الدفع وليست طلبًا لإعادة بيانات الدفع. لا ترسل قائمة Orange Money/CliQ ولا رابط الوصل تلقائيًا. اسأله إذا عنده تطبيق بنك أو خذ اسم البنك إذا ذكره، وكمل من جوابه.
- إذا آخر رد منك طلب اسم بنك/تطبيق/معلومة محددة والعميل أعطاها بكلمة أو عبارة قصيرة، استهلكها فورًا كجواب للسؤال السابق. إذا معرفة دعم CliQ أو طريقة الوصول من تطبيق البنك تحتاج حقيقة عامة حديثة، عيّن requiresExternalFact=true بدل إعادة قالب الدفع.
- بيانات الدفع الكاملة تُعرض فقط عندما الرسالة الحالية تطلبها فعلًا أو تؤكد الرغبة بالدفع الآن، وليس لمجرد وجود كلمة «ادفع» ضمن مشكلة مثل «ما عندي كليك ولا محفظة كيف بدي ادفع؟».
- لا تذكر أسماء النماذج أو المزوّدين أو المصطلحات الداخلية مثل prompt أو guard أو routing أو Human Company OS للعميل.
'''
brain = replace_once(brain, old_identity, new_identity, 'brain persona/payment-access contract')
brain_path.write_text(brain, encoding='utf-8')

os_path = root / 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts'
os = os_path.read_text(encoding='utf-8')
os = replace_once(
    os,
    'import { explicitCurrentTurnPaymentExecution, likelyContextualAnswerToAssistantPrompt } from "./conversationContinuityAuthority";\n',
    'import { explicitCurrentTurnPaymentExecution, likelyContextualAnswerToAssistantPrompt, paymentAccessProblemText } from "./conversationContinuityAuthority";\n',
    'OS continuity import',
)
old_payment_q = '''function paymentQuestionAfterDisclosure(turn: InterpretedTurn, truth: TruthBundle) {
  if (applicationJourneyStage(truth.application) !== "continuation_confirmed_fee_due") return false;
  // Phase 15: a semantic payment_method label is not permission to advance the
  // commercial funnel. Only explicit current-turn payment execution language is.
  return explicitCurrentTurnPaymentExecution(turn.rawText);
}
'''
new_payment_q = '''function paymentQuestionAfterDisclosure(turn: InterpretedTurn, truth: TruthBundle) {
  if (applicationJourneyStage(truth.application) !== "continuation_confirmed_fee_due") return false;
  // Phase 15.2: inability to access CliQ/a wallet is a conversational problem to
  // solve first, not authorization to dump the protected payment payload.
  if (paymentAccessProblemText(turn.rawText)) return false;
  return explicitCurrentTurnPaymentExecution(turn.rawText);
}
'''
os = replace_once(os, old_payment_q, new_payment_q, 'OS payment access veto')
old_identity_reply = '''  if (asksNature) {
    return `معك ${name} من فريق الأمين، وبالمحادثة هاي أنا المساعد الرقمي التابع للأمين. خليني أكمل معك على نفس موضوعك.`;
  }
'''
new_identity_reply = '''  if (asksNature) {
    return `معك ${name} من فريق الأمين، والرد هون آلي من نظام الأمين. خليني أكمل معك على نفس موضوعك.`;
  }
'''
os = replace_once(os, old_identity_reply, new_identity_reply, 'OS minimal nature disclosure')
old_exec = '''  const paymentExecutionRequired = !contextualAnswerOwnsTurn && !disclosureRequired && alreadyDisclosed && (Boolean(continuationIntent) || paymentQuestionAfterDisclosure(turn, truthAfterActions));
'''
new_exec = '''  const paymentAccessProblem = paymentAccessProblemText(input.customerText);
  const paymentExecutionRequired = !paymentAccessProblem && !contextualAnswerOwnsTurn && !disclosureRequired && alreadyDisclosed && (Boolean(continuationIntent) || paymentQuestionAfterDisclosure(turn, truthAfterActions));
'''
os = replace_once(os, old_exec, new_exec, 'OS protected payment execution gate')
os_path.write_text(os, encoding='utf-8')

print('PHASE 15.2 PERSONA-FIRST CONVERSATION CUTOVER PATCH APPLIED')
