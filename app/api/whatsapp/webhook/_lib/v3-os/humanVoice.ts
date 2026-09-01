import { normalizeArabic } from "./text";

function assistantReplies(recentTurns: string[] | undefined) {
  return (recentTurns || [])
    .filter(x => /^\s*(?:الامين|الأمين)\s*:/i.test(x))
    .map(x => x.replace(/^\s*(?:الامين|الأمين)\s*:\s*/i, "").trim())
    .filter(Boolean)
    .slice(-6);
}

function tokens(value: string) {
  return normalizeArabic(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(x => x.length > 1);
}

function shingles(value: string, size = 3) {
  const t = tokens(value);
  const out = new Set<string>();
  for (let i=0;i<=t.length-size;i++) out.add(t.slice(i,i+size).join(" "));
  return out;
}

export function replySimilarity(a: string, b: string) {
  const aa = shingles(a), bb = shingles(b);
  if (!aa.size || !bb.size) return 0;
  let same = 0;
  for (const x of aa) if (bb.has(x)) same++;
  return same / Math.max(aa.size,bb.size);
}

function opener(value: string) {
  return normalizeArabic(value).replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim().split(" ").slice(0,6).join(" ");
}

function hasRoleIntro(value: string, name: string) {
  const n = normalizeArabic(value);
  return n.includes(normalizeArabic(`معك ${name}`)) ||
    n.includes(normalizeArabic(`انا ${name}`)) ||
    n.includes(normalizeArabic(`أنا ${name}`));
}

export function detectHumanityViolations(reply: string, recentTurns?: string[]) {
  const violations: string[] = [];
  const previous = assistantReplies(recentTurns);
  const clean = String(reply || "").trim();
  if (!clean) return violations;

  for (const old of previous) {
    if (clean.length >= 45 && old.length >= 45 && replySimilarity(clean,old) >= 0.72) {
      violations.push("high_similarity_to_recent_reply");
      break;
    }
  }

  const o = opener(clean);
  if (o && o.split(" ").length >= 4 && previous.some(x => opener(x) === o)) violations.push("repeated_opening_structure");

  const n = normalizeArabic(clean);
  const canned = [
    "تمام وصلتني",
    "وصلتني خلينا",
    "فاهم عليك خليني",
    "بوضحلك اياها بدون لف ودوران",
    "الله يعطيك العافيه",
  ];
  for (const phrase of canned) {
    if (n.includes(normalizeArabic(phrase)) && previous.some(x => normalizeArabic(x).includes(normalizeArabic(phrase)))) {
      violations.push(`reused_canned_phrase:${phrase}`);
    }
  }

  for (const name of ["عمران", "تالا", "فدوة", "عبدالله", "عبدالرحمن"]) {
    if (hasRoleIntro(clean,name) && previous.some(x => hasRoleIntro(x,name))) {
      violations.push(`repeated_staff_identity:${name}`);
    }
  }

  const emojiCount = (clean.match(/[🌿✅🙏🙂😊]/g) || []).length;
  if (emojiCount > 1) violations.push("too_many_routine_emojis");

  return Array.from(new Set(violations));
}

export function humanVoiceGuidance(input: { recentTurns?: string[]; tone: string; roleName: string }) {
  const previous = assistantReplies(input.recentTurns);
  const recentOpeners = previous.map(opener).filter(Boolean);
  const firm = input.tone === "firm";
  return `HUMAN_VOICE_CONTRACT:\n- احكِ كموظف أردني حقيقي يفهم السياق، لا كقالب خدمة عملاء.\n- لا تبدأ كل رد بـ "تمام" أو "وصلتني" أو نفس التحية. ادخل بالموضوع مباشرة عندما السياق مستمر.\n- غيّر طول الجمل وترتيبها حسب الموقف. لا تعيد نفس البنية أو الخاتمة.\n- استخدم العامية الأردنية الخفيفة عند ملاءمتها، بدون مبالغة أو تمثيل.\n- ممنوع كشف كلمات أو أوصاف داخلية مثل: مستوى إشراف في النظام، Supervisor، AI، ذكاء اصطناعي، routing، تحويل داخلي. العميل يرى موظفًا باسم واضح فقط.\n- في الغضب/التهديد: بدون إيموجي وبلا تملق؛ هدوء وثبات وحل عملي. لا تحوّل الرد إلى خطاب دفاعي.\n- في الرد الطبيعي: إيموجي واحد كحد أقصى وإذا له معنى، وليس بكل رسالة.\n- لا تذكر اسم ${input.roleName} في كل رسالة؛ التعريف مرة واحدة عند أول ظهور فعلي للدور فقط. بعد ذلك ادخل في الموضوع مباشرة.\n- لا تستخدم عبارات ميتة مثل "نقدر شعورك" إذا لم تضف بعدها إجراء أو حقيقة.\n- لا تكرر حرفيًا جملة سياسة ثابتة إذا يمكن شرح معناها بصياغة مختلفة مع الحفاظ على الحقيقة.\n- عند الشكوى أو اتهام النصب: ابدأ بحل المشكلة، ثم اذكر الإلغاء/الاسترداد بجملة مختصرة إذا كان ذلك مفيدًا للحل. لا تسرد السياسة كلها.\n- اسأل سؤالًا واحدًا واضحًا في نهاية الرد إذا كانت معلومة واحدة فقط هي المطلوبة؛ لا ترسل سلسلة أسئلة.\n- الرد يكون بطول السؤال: المختصر مختصر، والحالة المركبة تغطي كل النقاط بدون حشو.${firm ? "\n- هذه حالة حازمة: استهدف 45–90 كلمة غالبًا، وفق عدد النقاط، وبحد أقصى 3 فقرات قصيرة." : ""}\nRECENT_OPENINGS_TO_AVOID=${JSON.stringify(recentOpeners.slice(-5))}`;
}
