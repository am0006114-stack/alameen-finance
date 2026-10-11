const fs = require('fs');

function mustReplace(path, from, to, label) {
  let src = fs.readFileSync(path, 'utf8');
  if (!src.includes(from)) throw new Error(`${label}: source anchor not found in ${path}`);
  if (src.indexOf(from) !== src.lastIndexOf(from)) throw new Error(`${label}: source anchor not unique in ${path}`);
  src = src.replace(from, to);
  fs.writeFileSync(path, src, 'utf8');
}

// 1) Canonical fee rationale approved by the business owner.
{
  const path = 'app/api/whatsapp/webhook/_lib/constants.ts';
  const from = `export function fileOpeningFeeExplanation() {\n  return \`رسوم فتح الملف هي \${FILE_OPENING_FEE_JOD} دنانير فقط، وليست دفعة على الجهاز ولا القسط الأول.\n\nتُطلب فقط بعد التأهيل المبدئي لاستكمال إجراءات الملف، وهي مستردة بالكامل في حال عدم الموافقة النهائية.\n\nالقسط الأول يكون بعد استلام الجهاز حسب الاتفاق.\`;\n}`;
  const to = `export function fileOpeningFeeExplanation() {\n  return \`رسوم فتح الملف 5 دنانير هي خطوة فتح الملف واستكماله للدراسة النهائية. هدفها تنظيم الدخول لهالمرحلة وقياس جدية الطلب والاستعداد المبدئي لإكمال الالتزامات المالية؛ لأن حجم الطلبات كبير جدًا وما بنقدر ندخل كل الطلبات غير الجادة في المراجعة التفصيلية ونأخر أصحاب الطلبات الجادة. هي مؤشر أولي فقط، ومش تقييم نهائي للقدرة الائتمانية ولا ضمان للموافقة، ومش ثمن الجهاز ولا قسط مقدم ولا القسط الأول. وإذا ما صدرت الموافقة النهائية بعد دفع مؤكد فهي مستردة بالكامل عبر المسار الرسمي، وإذا تم دفعها وبعدها قررت تلغي بتدخل ضمن مسار الاسترداد الرسمي بعد تأكيد الدفع إداريًا.\`;\n}`;
  mustReplace(path, from, to, 'canonical fee explanation');
}

// 2) V3 answer bundle: concise-by-default payment access + full fee rationale only when explicitly asked why.
{
  const path = 'app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts';
  let src = fs.readFileSync(path, 'utf8');

  const feeMethodAnchor = `  const feePaymentMethod = /(?:كيف|وين|اين|أين).{0,26}(?:تستلمو|تستلموا|استلام|ادفع|أدفع|احول|أحول|تحويل).{0,26}(?:الرسوم|5|٥|الخمس|الخمسه)?|(?:الرسوم|5|٥|الخمس|الخمسه).{0,26}(?:كيف|وين|احول|أحول|ادفع|أدفع)|(?:الرسوم|الخمس|الخمسه|5|٥).{0,18}(?:بدفعها|بدفع|بادفع|رح\\s+ادفع|راح\\s+ادفع)/.test(q);`;
  if (!src.includes(feeMethodAnchor)) throw new Error('feeMethodAnchor not found');
  src = src.replace(feeMethodAnchor, feeMethodAnchor + `\n  const feeReason = /(?:ليش|لماذا|شو\\s+سبب|ما\\s+سبب).{0,24}(?:5|٥|خمس|خمسه|خمسة|رسوم\\s+فتح\\s+الملف|رسوم\\s+الملف)|(?:رسوم\\s+فتح\\s+الملف|رسوم\\s+الملف|5|٥).{0,24}(?:ليش|لماذا|شو\\s+سبب|ما\\s+سبب)/.test(q);`);

  const returnAnchor = 'feePaymentMethod, paymentAccessProblem, assistantIdentity';
  if (!src.includes(returnAnchor)) throw new Error('qFlags return anchor not found');
  src = src.replace(returnAnchor, 'feePaymentMethod, feeReason, paymentAccessProblem, assistantIdentity');

  const oldPaymentAccess = `function paymentAccessProblemPart(truth: TruthBundle) {\n  const stage = applicationJourneyStage(truth.application);\n  if ([\"payment_proof_pending_admin\", \"payment_confirmed_under_review\", \"approved\"].includes(stage)) return \"ما في داعي تدور على وسيلة دفع ثانية؛ خطوة رسوم فتح الملف موجودة أصلًا على طلبك حسب الحالة الحالية.\";\n  if ([\"refund_requested\", \"refund_completed\", \"cancelled\"].includes(stage)) return \"طلبك الحالي مش بمرحلة دفع رسوم فتح الملف؛ حالته الآن \" + customerFacingStatusLabel(truth.application!) + \".\";\n  return \"فاهم عليك: إذا ما عندك لا CliQ ولا محفظة، تكرار نفس بيانات التحويل ما بحل المشكلة. القنوات المعتمدة عندنا حاليًا لرسوم فتح الملف هي CliQ أو Orange Money فقط. إذا عندك حساب بنكي وتطبيق بنك، ممكن تكون خدمة CliQ متاحة من تطبيق البنك بدون ما تحتاج محفظة منفصلة؛ احكيلي اسم البنك وبوضحلك الطريقة. وإذا ما عندك حساب بنكي ولا محفظة، ما عندي قناة ثالثة معتمدة أقدر أخترعها.\";\n}`;
  const newPaymentAccess = `function feeReasonPart() {\n  return \"رسوم فتح الملف 5 دنانير هي خطوة فتح الملف واستكماله للدراسة النهائية. هدفها تنظيم الدخول لهالمرحلة وقياس جدية الطلب والاستعداد المبدئي لإكمال الالتزامات المالية؛ لأن حجم الطلبات كبير جدًا وما بنقدر ندخل كل الطلبات غير الجادة في المراجعة التفصيلية ونأخر أصحاب الطلبات الجادة. هي مؤشر أولي فقط، ومش تقييم نهائي للقدرة الائتمانية ولا ضمان للموافقة، ومش ثمن الجهاز ولا قسط مقدم ولا القسط الأول. وإذا ما صدرت الموافقة النهائية بعد دفع مؤكد فهي مستردة بالكامل عبر المسار الرسمي، وإذا تم دفعها وبعدها قررت تلغي بتدخل ضمن مسار الاسترداد الرسمي بعد تأكيد الدفع إداريًا.\";\n}\n\nfunction paymentAccessProblemPart(truth: TruthBundle) {\n  const stage = applicationJourneyStage(truth.application);\n  if ([\"payment_proof_pending_admin\", \"payment_confirmed_under_review\", \"approved\"].includes(stage)) return \"رسوم فتح الملف مدفوعة أو قيد المراجعة على طلبك، فلا تدفعها مرة ثانية.\";\n  if ([\"refund_requested\", \"refund_completed\", \"cancelled\"].includes(stage)) return \"طلبك مش بمرحلة دفع رسوم فتح الملف الآن؛ حالته \" + customerFacingStatusLabel(truth.application!) + \".\";\n  return \"إذا ما عندك CliQ ولا محفظة، وإذا عندك حساب بنكي وتطبيق البنك احكيلي اسم البنك وبشوف معك إذا CliQ متاح من نفس التطبيق. وإذا ما عندك حساب بنكي ولا محفظة، حاليًا ما في طريقة دفع ثالثة معتمدة لرسوم فتح الملف.\";\n}`;
  if (!src.includes(oldPaymentAccess)) throw new Error('old payment access function not found');
  src = src.replace(oldPaymentAccess, newPaymentAccess);

  const buildAnchor = '  if (f.downPayment) parts.push(downPaymentPart(input.truth));\n  if (f.paymentAccessProblem) parts.push(paymentAccessProblemPart(input.truth));';
  if (!src.includes(buildAnchor)) throw new Error('answer bundle build anchor not found');
  src = src.replace(buildAnchor, '  if (f.downPayment) parts.push(downPaymentPart(input.truth));\n  if (f.feeReason) parts.push(feeReasonPart());\n  if (f.paymentAccessProblem) parts.push(paymentAccessProblemPart(input.truth));');

  fs.writeFileSync(path, src, 'utf8');
}

// 3) Conversation brain: "قل ودل", no guard-language leakage, and consume bank-name follow-ups.
{
  const path = 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts';
  let src = fs.readFileSync(path, 'utf8');
  const styleAnchor = '- جاوب السؤال الحالي مباشرة وبلهجة أردنية مهنية وطبيعية، قصيرة بقدر الحاجة. لا تكرر افتتاحيات محفوظة ولا تعيد شرحًا سبق فهمه.';
  if (!src.includes(styleAnchor)) throw new Error('brain style anchor not found');
  src = src.replace(styleAnchor, `${styleAnchor}\n- قاعدة الأسلوب: الكلام ما قل ودل. افتراضيًا جاوب بجملة إلى ثلاث جمل فقط، ولا تحول كل سؤال إلى شرح سياسة. توسع فقط إذا العميل طلب السبب أو قال وضح/فهمني/ليش، أو إذا كانت الخطوة المالية تحتاج التفاصيل لحمايته.\n- ممنوع تسريب لغة الحواجز الداخلية للعميل مثل «ما بقدر أخترع»، «الحقيقة التشغيلية»، «حسب الـtruth»، «القنوات المعتمدة حاليًا» بصيغة آلية. احكِ نفس المعنى بلغة موظف طبيعية ومباشرة.\n- لا تكرر آخر رد بصياغته إذا العميل أعطاك المعلومة التي طلبتها. استهلك جوابه وكمل الخطوة التالية.`);

  const contextAnchor = '- customerMessage هو السلطة الأعلى لهذه اللحظة. recentConversation سياق فقط: سؤال قديم أو وعد قديم لا يتحول إلى واجب جواب جديد إذا العميل انتقل لموضوع آخر.';
  if (!src.includes(contextAnchor)) throw new Error('brain context anchor not found');
  src = src.replace(contextAnchor, `${contextAnchor}\n- استثناء متابعة مباشر: إذا آخر رد منا طلب معلومة محددة والعميل أجاب بها الآن، اعتبرها جوابًا للسؤال السابق حتى لو كانت الرسالة كلمة أو اسمًا فقط. مثال: إذا سألناه عن اسم البنك بسبب CliQ ثم كتب «البنك العربي الإسلامي»، لا تعيد سؤال الدفع؛ اعتبر المطلوب التحقق من دعم CliQ لهذا البنك وطريقة الوصول لها من التطبيق، وعيّن requiresExternalFact=true وexternalFactNeeded بشكل واضح.`);

  const externalAnchor = '- إذا احتاج سؤال عام معلومة خارجية حديثة أو محلية عامة (مثال: ما هو CliQ، كيف تعمل خدمة دفع أردنية، معلومة عامة متغيرة عن بنك/شركة/جهاز) عيّن requiresExternalFact=true واكتب externalFactNeeded بشكل مختصر.';
  if (!src.includes(externalAnchor)) throw new Error('brain external fact anchor not found');
  src = src.replace(externalAnchor, `${externalAnchor}\n- إذا كانت الرسالة الحالية اسم بنك فقط وجاءت جوابًا لسؤال سابق عن CliQ، externalFactNeeded لازم يصير مثل: «هل <اسم البنك> يدعم CliQ في الأردن وكيف يصل العميل للخدمة من التطبيق؟».`);

  fs.writeFileSync(path, src, 'utf8');
}

// 4) Public web answers: include Islamic Arab Bank in local-bank detection and keep web answers terse/human.
{
  const path = 'app/api/whatsapp/webhook/_lib/v3-os/freshPublicFacts.ts';
  let src = fs.readFileSync(path, 'utf8');
  const bankAnchor = 'بنك\\s+الاتحاد|البنك\\s+العربي|بنك\\s+الاسكان|بنك\\s+الإسكان';
  if (!src.includes(bankAnchor)) throw new Error('public bank regex anchor not found');
  src = src.replace(bankAnchor, 'بنك\\s+الاتحاد|البنك\\s+العربي\\s+الاسلامي|البنك\\s+العربي\\s+الإسلامي|العربي\\s+الاسلامي|العربي\\s+الإسلامي|البنك\\s+العربي|بنك\\s+الاسكان|بنك\\s+الإسكان');

  const webStyle = 'اكتب 2-4 جمل باللهجة الأردنية المهنية، واذكر اسم المصدر الموثوق باختصار بدون روابط خارجية.';
  if (!src.includes(webStyle)) throw new Error('web style anchor not found');
  src = src.replace(webStyle, 'اكتب جوابًا طبيعيًا مختصرًا من 1-3 جمل باللهجة الأردنية المهنية. ابدأ بالجواب نفسه، لا بمقدمة عن البحث أو السياسات، واذكر اسم المصدر الموثوق باختصار بدون روابط خارجية. لا تستخدم تعابير مثل «ما بقدر أخترع» أو «حسب الحقيقة التشغيلية».');

  fs.writeFileSync(path, src, 'utf8');
}

console.log('PHASE 14.3 HUMANIZATION PATCH APPLIED');
