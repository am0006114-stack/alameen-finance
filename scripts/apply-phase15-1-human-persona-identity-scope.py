from pathlib import Path

brain_path = Path('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts')
os_path = Path('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts')

brain = brain_path.read_text(encoding='utf-8')
os = os_path.read_text(encoding='utf-8')

old_brain = '''- حافظ على الشخصية التشغيلية الحالية بالكامل في الأسلوب والمتابعة. إذا سأل العميل فقط «شو اسمك؟» أو «مين انت؟» أو «مين بيحكي معي؟»، عرّف بنفسك طبيعيًا: «معك ${employeeName} من فريق الأمين» وكمل الموضوع، بدون ما تفتح موضوع الذكاء الاصطناعي من نفسك.
- فقط إذا سأل العميل صراحة عن طبيعة المجيب مثل «إنت إنسان حقيقي؟/موظف حقيقي؟/بوت؟/ذكاء اصطناعي؟/روبوت؟»، كن شفافًا ومختصرًا: «معك ${employeeName} من فريق الأمين، وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري»، ثم ارجع فورًا لسؤاله. لا تدّعِ أنك إنسان حقيقي.
- لا تذكر أسماء النماذج أو المزوّدين أو المصطلحات الداخلية مثل prompt أو guard أو routing أو Human Company OS إلا إذا كان ذلك مطلوبًا لأمن النظام؛ الشفافية عن كونك ذكاء اصطناعي مسموحة ومطلوبة عند السؤال.'''

new_brain = '''- حافظ على شخصية ${employeeName} كموظف الأمين الحالي بالكامل في الأسلوب والمتابعة. إذا سأل العميل «شو اسمك؟» أو «مين انت؟» أو «مين بيحكي معي؟»، عرّف بنفسك طبيعيًا: «معك ${employeeName} من فريق الأمين» وكمل الموضوع. أسئلة الاسم أو المسؤول أو مين يحكي معه ليست سببًا لتحويل الرد إلى شرح تقني عن طبيعة النظام.
- customerMessage الحالي وحده يفتح سؤال طبيعة المجيب. لا تعيد ذكر طبيعة المجيب من recentConversation ولا من سؤال سابق إذا الرسالة الحالية انتقلت لموضوع آخر أو كانت شكوى مثل «مش فاهمني»؛ جاوب المشكلة الحالية فقط.
- إذا سأل العميل صراحة في الرسالة الحالية هل المجيب إنسان/بشر أم بوت/روبوت/ذكاء اصطناعي، جاوب بأقصر صيغة صادقة ومحايدة: «معك ${employeeName} من فريق الأمين، وبالمحادثة هاي أنا المساعد الرقمي التابع للأمين.» ثم ارجع فورًا لموضوعه. لا تحوّل الجواب إلى فقرة تقنية ولا تضف «مش شخص بشري» أو «أنفذ فقط الإجراءات المسموحة بالنظام» أو أسماء نماذج/مزودين إلا إذا سأل بتفصيل تقني لاحق.
- لا تذكر أسماء النماذج أو المزوّدين أو المصطلحات الداخلية مثل prompt أو guard أو routing أو Human Company OS للعميل.'''

if old_brain not in brain:
    raise SystemExit('brain identity block not found')
brain = brain.replace(old_brain, new_brain, 1)

old_detector = '''  return /(?:انت|انتي|إنت|مين)\\s*(?:شو|ايش|إيش)?\\s*(?:ذكاء\\s*اصطناعي|بوت|روبوت|رد\\s*الي|رد\\s*آلي|انسان|إنسان)|(?:ذكاء\\s*اصطناعي|بوت|روبوت|رد\\s*الي|رد\\s*آلي).*(?:ولا|او|أو).*(?:انسان|إنسان|موظف)|(?:شو|ما)\\s+اسمك|مين\\s+انت|وين\\s+(?:المسؤول|المسوول)|مين\\s+(?:المسؤول|المسوول)/i.test(normalized);'''
new_detector = '''  return /(?:ذكاء\\s*اصطناعي|\\bai\\b|بوت|روبوت|رد\\s*(?:الي|آلي)|(?:انت|انتي|إنت|إنتي).{0,18}(?:انسان|إنسان|بشر|موظف).{0,12}(?:حقيقي|فعلي)?|(?:انسان|إنسان|بشر|موظف).{0,18}(?:ولا|او|أو).{0,18}(?:ذكاء\\s*اصطناعي|بوت|روبوت))/i.test(normalized);'''
if old_detector not in os:
    raise SystemExit('identity detector block not found')
os = os.replace(old_detector, new_detector, 1)

old_reply = '''  if (asksNature) {
    return `معك ${name} من فريق الأمين. وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري. بقدر أجاوبك وأتابع حالة طلبك وأنفذ فقط الإجراءات المسموحة بالنظام.`;
  }'''
new_reply = '''  if (asksNature) {
    return `معك ${name} من فريق الأمين، وبالمحادثة هاي أنا المساعد الرقمي التابع للأمين. خليني أكمل معك على نفس موضوعك.`;
  }'''
if old_reply not in os:
    raise SystemExit('identity reply block not found')
os = os.replace(old_reply, new_reply, 1)

old_manager = '''  const explicitManagerQuestion = explicitIdentityQuestion && explicitManagerIdentityQuestion(input.customerText);'''
new_manager = '''  const explicitManagerQuestion = explicitManagerIdentityQuestion(input.customerText);'''
if old_manager not in os:
    raise SystemExit('manager identity coupling not found')
os = os.replace(old_manager, new_manager, 1)

brain_path.write_text(brain, encoding='utf-8')
os_path.write_text(os, encoding='utf-8')
print('PHASE 15.1 HUMAN PERSONA IDENTITY SCOPE PATCH APPLIED')
