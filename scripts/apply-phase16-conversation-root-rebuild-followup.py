from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

root = Path('.')

# HumanOS must have no special identity writer/detector authority at all. Identity is
# just one answer obligation and therefore cannot seize a mixed customer turn.
os_path = root / 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts'
os = os_path.read_text(encoding='utf-8')
identity_helper = '''function explicitStaffNatureQuestion(value: string | null | undefined) {
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
os = replace_once(os, identity_helper, '', 'remove HumanOS identity detector helper')
os = replace_once(
    os,
    '  const explicitIdentityQuestion = explicitStaffNatureQuestion(input.customerText);\n',
    '',
    'remove HumanOS identity detector state',
)
os_path.write_text(os, encoding='utf-8')

# Old V2 fallback is not the production authority, but it is still tracked runtime
# code and must not contain a customer-facing "automated reply" identity sentence.
v2_path = root / 'app/api/whatsapp/webhook/_lib/v2-production/actionExecutor.ts'
v2 = v2_path.read_text(encoding='utf-8')
v2 = replace_once(
    v2,
    '        summary: "تم تحويل المحادثة فعليًا لقائمة متابعة الموظفين، وبعد هذه الرسالة بيتوقف الرد الآلي على المحادثة.",',
    '        summary: "تم تحويل المحادثة فعليًا لقائمة متابعة الموظفين، وبعد هذه الرسالة بتصير المتابعة على قائمة الموظفين.",',
    'remove legacy automated-reply wording',
)
v2_path.write_text(v2, encoding='utf-8')

# Modernize stale Phase 14 audit assertions. These tests previously institutionalized
# the wrong customer-facing implementation identity and stale payment wording.
p14_path = root / 'scripts/v3-phase14-conversation-os-audit-selftest.cjs'
p14 = p14_path.read_text(encoding='utf-8')
p14 = replace_once(
    p14,
    "assert(answer.includes('إذا ما عندك لا CliQ ولا محفظة'));\nassert(answer.includes('خدمة CliQ متاحة من تطبيق البنك'));",
    "assert(answer.includes('إذا ما عندك CliQ ولا محفظة'));\nassert(answer.includes('إذا عندك حساب بنكي وتطبيق البنك احكيلي اسم البنك'));",
    'refresh Phase14 payment-access assertions',
)
p14 = p14.replace("assert(human.includes('function explicitStaffNatureQuestion'));\n", "assert(!human.includes('function explicitStaffNatureQuestion'));\n")
p14_path.write_text(p14, encoding='utf-8')

# Phase 14.2 compatibility gate is also updated after HumanOS identity authority is
# fully removed.
p142_path = root / 'scripts/v3-phase14-2-persona-selftest.cjs'
p142 = p142_path.read_text(encoding='utf-8')
p142 = p142.replace("assert(human.includes('function explicitStaffNatureQuestion'));\n", "assert(!human.includes('function explicitStaffNatureQuestion'));\n")
p142_path.write_text(p142, encoding='utf-8')

# Phase 16 regression test: identity recognition belongs to the answer-bundle layer,
# not HumanOS routing.
p16_path = root / 'scripts/v3-phase16-conversation-root-rebuild-selftest.cjs'
p16 = p16_path.read_text(encoding='utf-8')
p16 = p16.replace("assert(human.includes('function explicitStaffNatureQuestion'));\n", "assert(!human.includes('function explicitStaffNatureQuestion'));\n")
p16 = p16.replace("assert(human.includes('const modelTier: HumanModelTier = (explicitStatusTracking || secureDeviceChangeRequested || authoritativeSyntheticMediaReply)'));\n", "assert(human.includes('const modelTier: HumanModelTier = (explicitStatusTracking || secureDeviceChangeRequested || authoritativeSyntheticMediaReply)'));\nassert(!human.includes('explicitIdentityQuestion'));\n")
p16 = p16.replace("  'أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري',\n", "  'أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري',\n  'بيتوقف الرد الآلي على المحادثة',\n")
p16_path.write_text(p16, encoding='utf-8')

print('PHASE 16 FOLLOWUP PATCH APPLIED')
