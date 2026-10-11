const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value, 'utf8'); }
function replaceOnce(src, oldText, newText, label) {
  const first = src.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: old text not found`);
  if (first !== src.lastIndexOf(oldText)) throw new Error(`${label}: old text not unique`);
  return src.slice(0, first) + newText + src.slice(first + oldText.length);
}
function replaceAll(src, oldText, newText, expectedCount, label) {
  const count = src.split(oldText).length - 1;
  if (count !== expectedCount) throw new Error(`${label}: expected ${expectedCount}, found ${count}`);
  return src.split(oldText).join(newText);
}

// 1) Brain policy: persona by default, transparency only on a direct nature question.
{
  const path = 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts';
  let src = read(path);
  src = replaceOnce(
    src,
    '- إذا سأل العميل هل أنت إنسان/موظف/بوت/ذكاء اصطناعي، كن شفافًا: قل إنك مساعد ذكاء اصطناعي تابع للأمين ومش موظف بشري، ثم جاوب بقية سؤاله. لا تمثل إنك إنسان.\n',
    '- حافظ على الشخصية التشغيلية الحالية بالكامل في الأسلوب والمتابعة. إذا سأل العميل فقط «شو اسمك؟» أو «مين انت؟» أو «مين بيحكي معي؟»، عرّف بنفسك طبيعيًا: «معك ${employeeName} من فريق الأمين» وكمل الموضوع، بدون ما تفتح موضوع الذكاء الاصطناعي من نفسك.\n- فقط إذا سأل العميل صراحة عن طبيعة المجيب مثل «إنت إنسان حقيقي؟/موظف حقيقي؟/بوت؟/ذكاء اصطناعي؟/روبوت؟»، كن شفافًا ومختصرًا: «معك ${employeeName} من فريق الأمين، وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري»، ثم ارجع فورًا لسؤاله. لا تدّعِ أنك إنسان حقيقي.\n',
    'brain persona policy'
  );
  write(path, src);
}

// 2) Human OS deterministic identity and human-contact replies.
{
  const path = 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts';
  let src = read(path);
  src = replaceOnce(
    src,
    '  const asksResponsible = /(?:المسؤول|المسوول|المدير|الاداره|الإدارة)/.test(normalized);\n  if (asksResponsible) {\n    return `معك ${name} من الأمين، وأنا بكمل معك بهالموضوع هون. احكيلي شو المطلوب وبمشيه معك حسب حالة الطلب الفعلية.`;\n  }\n  return `أنا مساعد ذكاء اصطناعي تابع للأمين، مش موظف بشري. الاسم التشغيلي داخل المحادثة ${name}. بقدر أجاوبك وأتابع حالة طلبك وأنفذ فقط الإجراءات المسموحة بالنظام.`;\n',
    '  const asksNature = /(?:ذكاء\\s*اصطناعي|\\bai\\b|بوت|روبوت|رد\\s*(?:الي|آلي)|(?:انت|انتي|إنت|إنتي).{0,18}(?:انسان|إنسان|بشر|موظف).{0,12}(?:حقيقي|فعلي)?)/i.test(normalized);\n  const asksResponsible = /(?:المسؤول|المسوول|المدير|الاداره|الإدارة)/.test(normalized);\n  if (asksNature) {\n    return `معك ${name} من فريق الأمين. وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري. بقدر أجاوبك وأتابع حالة طلبك وأنفذ فقط الإجراءات المسموحة بالنظام.`;\n  }\n  if (asksResponsible) {\n    return `معك ${name} من فريق الأمين، وأنا بكمل معك بهالموضوع هون. احكيلي شو المطلوب وبمشيه معك حسب حالة الطلب الفعلية.`;\n  }\n  return `معك ${name} من فريق الأمين، وأنا اللي بكمل معك هون. احكيلي شو بدك وبجاوبك أو بنفذ الإجراء المسموح حسب حالة طلبك.`;\n',
    'human OS identity split'
  );
  src = replaceOnce(
    src,
    '    return `أنا مساعد ذكاء اصطناعي تابع للأمين، وبكمل معك هون مباشرة.${status} طلب موظف أو مكالمة ما بعمل تحويل بشري تلقائي ولا بدي أوهمك إنه انحجز اتصال. احكيلي المشكلة وبعالج اللي بقدر عليه حسب حالة الطلب الفعلية.`;\n',
    '    return `معك ${name} من فريق الأمين، وبكمل معك هون مباشرة.${status} طلب موظف أو مكالمة ما بعمل تحويل بشري تلقائي ولا بدي أوهمك إنه انحجز اتصال. احكيلي المشكلة وبعالج اللي بقدر عليه حسب حالة الطلب الفعلية.`;\n',
    'autonomous human request persona'
  );
  write(path, src);
}

// 3) Multi-question AnswerBundle must preserve persona semantics too.
{
  const path = 'app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts';
  let src = read(path);
  src = replaceOnce(
    src,
    'import { normalizeArabic } from "./text";\n',
    'import { normalizeArabic } from "./text";\nimport { roleDisplayName } from "./hierarchy";\n',
    'answer hierarchy import'
  );
  src = replaceOnce(
    src,
    'function assistantIdentityPart() {\n  return "أنا مساعد ذكاء اصطناعي تابع للأمين للأقساط، مش موظف بشري. بقدر أفهم رسالتك وأتابع حالة الطلب وأنفذ فقط الإجراءات المسموحة بالنظام، وإذا سألتني عن طبيعتي بحكيلك إياها بصراحة بدون ما أمثل إني إنسان.";\n}\n',
    'function explicitAssistantNatureQuestion(value: string | null | undefined) {\n  const q = n(value);\n  return /(?:ذكاء\\s*اصطناعي|\\bai\\b|بوت|روبوت|رد\\s*(?:الي|آلي)|(?:انت|انتي|إنت|إنتي).{0,18}(?:انسان|إنسان|بشر|موظف).{0,12}(?:حقيقي|فعلي)?)/i.test(q);\n}\n\nfunction assistantIdentityPart(turn: InterpretedTurn, state: ConversationState) {\n  const name = roleDisplayName(state.role.currentRole);\n  if (explicitAssistantNatureQuestion(turn.rawText)) {\n    return `معك ${name} من فريق الأمين. وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري. بقدر أفهم رسالتك وأتابع حالة الطلب وأنفذ فقط الإجراءات المسموحة بالنظام.`;\n  }\n  return `معك ${name} من فريق الأمين، وأنا اللي بكمل معك هون. احكيلي شو بدك وبجاوبك حسب حالة طلبك الفعلية.`;\n}\n',
    'answer bundle identity split'
  );
  src = replaceOnce(
    src,
    '  if (f.assistantIdentity) parts.push(assistantIdentityPart());\n',
    '  if (f.assistantIdentity) parts.push(assistantIdentityPart(input.turn, input.state));\n',
    'answer bundle identity invocation'
  );
  write(path, src);
}

// 4) Legacy deterministic route: generic identity is persona-first, direct bot/AI challenge stays transparent.
{
  const path = 'app/api/whatsapp/webhook/route.ts';
  let src = read(path);
  src = replaceOnce(
    src,
    'function employeeIdentityReply(from: string, app?: ApplicationRecord | null) {\n  const staffName = assignedStaffName(from);\n  const requestLine = app\n    ? `طلبك ${app.tracking_id || app.id} ظاهر بالسياق، وبقدر أتابعه معك هون.`\n    : "إذا سؤالك عن طلب محدد ابعث رقم الطلب أو رقم التتبع.";\n\n  return `أنا مساعد ذكاء اصطناعي تابع للأمين، مش موظف بشري. الاسم التشغيلي داخل المحادثة ${staffName}. ${requestLine}`;\n}\n',
    'function employeeIdentityReply(from: string, app?: ApplicationRecord | null, customerText = "") {\n  const staffName = assignedStaffName(from);\n  const requestLine = app\n    ? `طلبك ${app.tracking_id || app.id} ظاهر بالسياق، وبقدر أتابعه معك هون.`\n    : "إذا سؤالك عن طلب محدد ابعث رقم الطلب أو رقم التتبع.";\n\n  if (isBotIdentityChallengeText(customerText)) {\n    return `معك ${staffName} من فريق الأمين. وبالمحادثة هاي أنا مساعد ذكاء اصطناعي تابع للأمين، مش شخص بشري. ${requestLine}`;\n  }\n\n  return `معك ${staffName} من فريق الأمين، وأنا اللي بكمل معك هون. ${requestLine}`;\n}\n',
    'route identity split'
  );
  src = replaceAll(
    src,
    'return employeeIdentityReply(app.phone || app.tracking_id || app.id, app);',
    'return employeeIdentityReply(app.phone || app.tracking_id || app.id, app, customerText);',
    2,
    'app identity call sites'
  );
  src = replaceAll(
    src,
    'return employeeIdentityReply(from, app);',
    'return employeeIdentityReply(from, app, rawCustomerText);',
    2,
    'route identity call sites'
  );
  write(path, src);
}

console.log('PHASE 14.2 PERSONA DEFAULT / DIRECT-NATURE TRANSPARENCY PATCH APPLIED');
