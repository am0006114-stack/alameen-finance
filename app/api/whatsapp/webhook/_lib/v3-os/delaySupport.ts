import type { InterpretedTurn, TruthBundle } from "./types";
import { normalizeArabic } from "./text";

export type DelaySupportProfile = {
  active: boolean;
  repeatedDelayTurns: number;
  asksBeyondNormalWindow: boolean;
  rejectedAutoUpdatePhrase: boolean;
  reassuranceCue: string;
  guidance: string;
};

function customerTurns(recentTurns?: string[]) {
  return (recentTurns || [])
    .filter((x) => /^\s*(?:العميل|customer)\s*:/i.test(String(x || "")))
    .map((x) => String(x || "").replace(/^\s*(?:العميل|customer)\s*:\s*/i, "").trim())
    .filter(Boolean)
    .slice(-12);
}

function looksLikeDelayQuestion(value: string) {
  const n = normalizeArabic(value);
  return [
    "قديش", "كم يوم", "لايمتا", "لامتى", "ايمتا", "امتى", "متى", "تأخر", "تاخر",
    "طول", "مدة", "المده", "المراجعه", "المراجعة", "موعد", "بعد المده", "بعد المدة",
  ].some((needle) => n.includes(normalizeArabic(needle)));
}

function asksBeyondNormal(value: string) {
  const n = normalizeArabic(value);
  return [
    "بعد المده المحدده", "بعد المدة المحددة", "بعد المده", "بعد المدة", "بعد الثلاث ايام", "بعد 3 ايام",
    "بعد ثلاث ايام", "كم يوم زياده", "كم يوم زيادة", "قديش زياده", "قديش زيادة", "اكثر من المده", "أكثر من المدة",
  ].some((needle) => n.includes(normalizeArabic(needle)));
}

function rejectedAutoUpdate(recentTurns?: string[]) {
  return customerTurns(recentTurns).some((turn) => {
    const n = normalizeArabic(turn);
    const rejection = n.includes("لا تحكيلي") || n.includes("لا تقلي") || n.includes("ما بدي") || n.includes("بلاش");
    const autoPhrase = n.includes("اول ما") || n.includes("أول ما") || n.includes("لما تخلص") || n.includes("لما يطلع");
    return rejection && autoPhrase;
  });
}

function cueFor(turnId: string, repeated: number) {
  const cues = repeated >= 2
    ? [
        "بعرف إنك سمعت نفس المدة أكثر من مرة، وحقك تطلب جواب أوضح.",
        "معك حق؛ إعادة نفس الجملة ما بتفيدك وإنت مستني من فترة.",
        "مقدّر صبرك، وبعرف إن الانتظار صار ثقيل عليك.",
        "الله يعطيك العافية على صبرك؛ خليني أجاوبك على سؤالك نفسه بدون لف.",
      ]
    : [
        "معك حق تسأل عن المدة، خصوصًا لما الانتظار يطول.",
        "مقدّر انتظارك، وبدي أعطيك المؤكد بدون موعد من عندي.",
        "بعرف إن الانتظار بهيك موضوع ثقيل، وحقك تعرف شو المؤكد.",
      ];
  let hash = 0;
  for (const ch of String(turnId || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return cues[hash % cues.length];
}

export function buildDelaySupportProfile(input: {
  turn: InterpretedTurn;
  truth: TruthBundle;
  recentTurns?: string[];
}): DelaySupportProfile {
  const current = String(input.turn.rawText || "");
  const recentCustomer = customerTurns(input.recentTurns);
  const historicalCustomer = [...recentCustomer];
  if (historicalCustomer.length && normalizeArabic(historicalCustomer[historicalCustomer.length - 1]) === normalizeArabic(current)) historicalCustomer.pop();
  const repeatedDelayTurns = historicalCustomer.filter(looksLikeDelayQuestion).length + (looksLikeDelayQuestion(current) ? 1 : 0);
  const active = input.turn.topics.some((topic) => topic === "review_timing" || topic === "operational_pressure") || looksLikeDelayQuestion(current);
  const beyond = asksBeyondNormal(current);
  const rejected = rejectedAutoUpdate(input.recentTurns);
  const reassuranceCue = cueFor(input.turn.turnId, repeatedDelayTurns);

  const app = input.truth.application;
  const known = app?.trackingId
    ? `الطلب المربوط بالمحادثة هو ${app.trackingId}${app.fullName ? ` للعميل ${String(app.fullName).trim().split(/\s+/)[0]}` : ""}.`
    : "لا تستخدم تفاصيل شخصية للطلب إذا لم تكن الحقيقة مربوطة بطلب موثوق.";

  const guidance = [
    "DELAY_SUPPORT_CONTRACT:",
    `- ${reassuranceCue}`,
    `- ${known}`,
    "- جاوب السؤال الحالي أولًا؛ لا ترجع تلقائيًا لنفس فقرة 2–3 أيام إذا سبق شرحها أكثر من مرة.",
    beyond
      ? "- العميل يسأل تحديدًا: كم تزيد المدة بعد المعدل الطبيعي. لا تخترع رقمًا إضافيًا. قل بوضوح إنه لا يوجد متوسط إضافي ثابت وموثق يمكن نسبه لكل الملفات؛ لو أعطيت رقمًا مثل يومين/خمسة زيادة سيكون تخمينًا."
      : "- إذا كانت هذه أول مرة يسأل عن المدة، اذكر المعدل الطبيعي 2–3 أيام عمل والضغط الحالي الشديد بدون موعد مضمون.",
    repeatedDelayTurns >= 2
      ? "- هذه متابعة متكررة؛ لا تكرر نفس الخاتمة أو نفس بنية الرد. اعترف بأنه سمع الشرح السابق وقدم فرقًا حقيقيًا في المعلومة."
      : "- طمّنه بجملة إنسانية واحدة فقط، بدون مبالغة أو تمثيل.",
    rejected
      ? "- العميل رفض صراحة عبارة من نوع «أول ما تخلص/أول ما يظهر بنبعتلك». ممنوع استخدامها أو إعادة معناها كخاتمة."
      : "- لا تعد بتحديث لحظي أو تواصل بشري غير منفذ؛ إذا ذكرت التحديث فليكن بصياغة غير آلية وغير مكررة.",
    "- لا تجعل ضغط المراجعات عذرًا فارغًا. استخدمه كحقيقة تشغيلية فقط، مع الاعتراف بأن الانتظار مزعج.",
    "- ممنوع موعد أو عدد أيام إضافية غير موثق. الصدق أهم من تهدئة لحظية بوعد كاذب.",
  ].join("\n");

  return { active, repeatedDelayTurns, asksBeyondNormalWindow: beyond, rejectedAutoUpdatePhrase: rejected, reassuranceCue, guidance };
}
