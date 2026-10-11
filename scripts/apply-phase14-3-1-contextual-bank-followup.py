from pathlib import Path

os_path = Path('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts')
answers_path = Path('app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts')

s = os_path.read_text(encoding='utf-8')

marker = '''function explicitAssistantIdentityQuestion(value: string | null | undefined) {'''
helper = r'''function normalizeContextFollowupText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contextualBankCliqFollowup(input: { customerText: string; state: ConversationState }) {
  const current = normalizeContextFollowupText(input.customerText);
  const previous = normalizeContextFollowupText(input.state.lastAssistantText);
  if (!current || current.length > 90) return null;
  const previousAskedForBank = /(?:اسم\s+البنك|اي\s+بنك|أي\s+بنك|شو\s+البنك)/.test(previous) && /(?:cliq|كليك)/i.test(previous);
  if (!previousAskedForBank) return null;
  const looksLikeBankName = /(?:^|\s)(?:البنك|بنك|العربي|الاسلامي|الإسلامي|الاتحاد|الاسكان|الإسكان|الاهلي|الأهلي|القاهرة|عمان|صفوة|كابيتال|الراجحي|الاستثماري|الاستثمار|الاردن|الأردن)(?:\s|$)/.test(current);
  return looksLikeBankName ? String(input.customerText || "").trim() : null;
}

function makeContextualBankCliqTurn(turn: InterpretedTurn, bankName: string): InterpretedTurn {
  const externalFactNeeded = `هل ${bankName} يدعم CliQ في الأردن وكيف يصل العميل للخدمة من تطبيق البنك؟`;
  return {
    ...turn,
    semantic: {
      ...(turn.semantic || {
        meaningSummary: `العميل أجاب باسم البنك ${bankName} بعد سؤاله عن الدفع عبر CliQ`,
        customerGoal: "معرفة هل CliQ متاح من تطبيق البنك وطريقة الوصول له",
        currentQuestion: externalFactNeeded,
        answerObligations: [], references: [], entities: [], correctionOfPrevious: false, socialClosure: false,
        requiresExternalFact: true, externalFactNeeded, answerMode: "direct" as const, confidence: 0.99, warnings: [],
        decision: { continuation: "unknown" as const, cancellation: "unknown" as const, refund: "unknown" as const, aliasConfirmation: "unknown" as const, condition: null },
      }),
      meaningSummary: `العميل أجاب باسم البنك ${bankName} بعد سؤالنا عن البنك بسبب CliQ`,
      customerGoal: "معرفة هل CliQ متاح من تطبيق البنك وطريقة الوصول له",
      currentQuestion: externalFactNeeded,
      requiresExternalFact: true,
      externalFactNeeded,
      answerMode: "direct",
      confidence: Math.max(turn.semantic?.confidence || 0, 0.99),
    },
  };
}

'''
if 'function contextualBankCliqFollowup' not in s:
    if marker not in s:
        raise SystemExit('identity marker not found')
    s = s.replace(marker, helper + marker, 1)

anchor = '''  if (contextualContinuation) turn = makeDeterministicContinuationTurn(turn);\n  turn = preserveDeterministicCurrentQuestionAuthority(deterministicAnchor, turn);'''
replacement = '''  if (contextualContinuation) turn = makeDeterministicContinuationTurn(turn);\n  turn = preserveDeterministicCurrentQuestionAuthority(deterministicAnchor, turn);\n  // Phase 14.3.1: a short bank-name reply is an answer to our immediately preceding\n  // CliQ follow-up question, not a brand-new payment question. Make this deterministic\n  // so the web-knowledge path does not depend on the model remembering to set a flag.\n  const contextualCliqBank = contextualBankCliqFollowup({ customerText: input.customerText, state: stateWorking });\n  if (contextualCliqBank) turn = makeContextualBankCliqTurn(turn, contextualCliqBank);'''
if 'const contextualCliqBank = contextualBankCliqFollowup' not in s:
    if anchor not in s:
        raise SystemExit('turn authority anchor not found')
    s = s.replace(anchor, replacement, 1)

os_path.write_text(s, encoding='utf-8')

a = answers_path.read_text(encoding='utf-8')
old = 'return "إذا ما عندك CliQ ولا محفظة، وإذا عندك حساب بنكي وتطبيق البنك احكيلي اسم البنك وبشوف معك إذا CliQ متاح من نفس التطبيق. وإذا ما عندك حساب بنكي ولا محفظة، حاليًا ما في طريقة دفع ثالثة معتمدة لرسوم فتح الملف.";'
new = 'return "إذا ما عندك CliQ ولا محفظة، وإذا عندك حساب بنكي وتطبيق البنك احكيلي اسم البنك وبشوفلك إذا CliQ متاح من نفس التطبيق. وإذا ما عندك حساب بنكي كمان خبرني وبوضحلك شو المتاح عندنا.";'
if old not in a:
    raise SystemExit('payment access sentence not found')
a = a.replace(old, new, 1)
answers_path.write_text(a, encoding='utf-8')
