import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type HumanCareMode =
  | "none"
  | "warmth"
  | "confusion"
  | "anxiety"
  | "frustration"
  | "anger"
  | "plea"
  | "trust_loss"
  | "disappointment"
  | "embarrassment"
  | "exhaustion"
  | "time_pressure"
  | "financial_pressure"
  | "apology"
  | "hope";

export type HumanCareProfile = {
  mode: HumanCareMode;
  intensity: 0 | 1 | 2 | 3;
  reason: string;
  shouldAcknowledge: boolean;
};

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function has(value: string, pattern: RegExp) {
  return Boolean(value && pattern.test(value));
}

function shortContextualFollowup(value: string) {
  return value.length <= 72 && /^(?:طيب|طب|يعني|بس|وهسا|هسا|وبعدين|ليش|كيف|متى|امتى|طيب\s+شو|طيب\s+يعني)(?:\s|$)/.test(value);
}

function detectModeFromText(value: string): HumanCareProfile {
  const q = n(value);
  if (!q) return { mode: "none", intensity: 0, reason: "no literal emotional evidence", shouldAcknowledge: false };

  if (has(q, /(?:اسف|آسف|سامحني|حقك\s+علي|معلش\s+اذا\s+ازعجتك|معلش\s+إذا\s+أزعجتك)/)) {
    return { mode: "apology", intensity: 1, reason: "customer apologised or worried about burdening the conversation", shouldAcknowledge: true };
  }
  if (has(q, /(?:محرج|مستحي|استحي|شكلي\s+ازعجتك|شكلي\s+أزعجتك|كثرت\s+اسئله|كثرت\s+أسئلة|غلبتك\s+معي|تعبتك\s+معي)/)) {
    return { mode: "embarrassment", intensity: 1, reason: "customer shows embarrassment or fear of being a burden", shouldAcknowledge: true };
  }
  if (has(q, /(?:نصاب|نصابين|احتيال|محتال|كذاب|كذابين|ما\s+بثق|فقدت\s+الثقه|فقدت\s+الثقة|الثقه\s+راحت|الثقة\s+راحت)/)) {
    return { mode: "trust_loss", intensity: 3, reason: "customer explicitly signals loss of trust", shouldAcknowledge: true };
  }
  if (has(q, /(?:خرا|زباله|زفت|وسخ|قرفت|طفشت|الله\s+لا\s+يوفق|شو\s+هالمهزله|شو\s+هالمهزلة|عيب\s+عليكم)/)) {
    return { mode: "anger", intensity: 3, reason: "customer is explicitly angry", shouldAcknowledge: true };
  }
  if (has(q, /(?:خلص\s+تعبت|تعبت\s+من|زهقت\s+من|بطلت\s+قادر|مش\s+قادر\s+اكمل|مش\s+قادر\s+أكمل|خلص\s+مش\s+مهم|بديش\s+اعرف|بديش\s+أعرف|كل\s+مره\s+نفس|كل\s+مرة\s+نفس)/)) {
    return { mode: "exhaustion", intensity: 3, reason: "customer is exhausted by the process or repeated answers", shouldAcknowledge: true };
  }
  if (has(q, /(?:وضعي\s+المادي|ظروفي\s+الماديه|ظروفي\s+المادية|ما\s+معي\s+مصاري|المبلغ\s+ضاغط|القسط\s+ضاغط|راتبي\s+ما\s+بكفي|علي\s+التزامات|عندي\s+التزامات\s+مالي)/)) {
    return { mode: "financial_pressure", intensity: 2, reason: "customer explicitly describes financial pressure", shouldAcknowledge: true };
  }
  if (has(q, /(?:مسافر|سفري|عندي\s+سفر|مستعجل|مستعجله|مستعجلة|ضروري\s+قبل|لازم\s+قبل|عندي\s+موعد|مرتبط\s+بموعد)/)) {
    return { mode: "time_pressure", intensity: 2, reason: "customer has a concrete time pressure", shouldAcknowledge: true };
  }
  if (has(q, /(?:خايف|خايفه|خايفة|قلقان|قلقانه|قلقانة|متوتر|متوتره|متوترة|خوف|مخوفني|مخوفني)/)) {
    return { mode: "anxiety", intensity: 2, reason: "customer explicitly expresses fear or anxiety", shouldAcknowledge: true };
  }
  if (has(q, /(?:خاب\s+املي|خاب\s+أملي|خيبه|خيبة|كنت\s+متوقع|ما\s+توقعت|محبط|احباط|إحباط)/)) {
    return { mode: "disappointment", intensity: 2, reason: "customer expresses disappointment", shouldAcknowledge: true };
  }
  if (has(q, /(?:بترجاك|برجاك|الله\s+يخليك|بس\s+حاول|اذا\s+بتقدر|إذا\s+بتقدر|ارجوك|أرجوك)/)) {
    return { mode: "plea", intensity: 2, reason: "customer is pleading for help", shouldAcknowledge: true };
  }
  if (has(q, /(?:مش\s+فاهم|ما\s+فهمت|مش\s+واضح|وضحلي|فسرلي|شو\s+يعني|ضايع|تلخبطت|مش\s+مستوعب)/)) {
    return { mode: "confusion", intensity: 1, reason: "customer explicitly signals confusion", shouldAcknowledge: true };
  }
  if (has(q, /(?:صارلي|صارله|صارلها|من\s+تاريخ).{0,25}(?:يوم|ايام|أيام|اسبوع|أسبوع|اسابيع|أسابيع|\d+)|(?:طولتوا|تأخرتوا|تاخرتوا|مش\s+معقول|ليش\s+هيك|نفس\s+الرد|نفس\s+الحكي|بدون\s+نتيجه|بدون\s+نتيجة)/)) {
    return { mode: "frustration", intensity: 2, reason: "customer explicitly signals frustration or prolonged waiting", shouldAcknowledge: true };
  }
  if (has(q, /(?:يا\s+رب|ان\s+شاء\s+الله|إن\s+شاء\s+الله|متامل|متأمل|بتمنى|اتمنى|أتمنى).{0,40}(?:خير|تزبط|تمشي|تنقبل|تنحل|تخلص)?/)) {
    return { mode: "hope", intensity: 1, reason: "customer expresses hope", shouldAcknowledge: true };
  }
  if (has(q, /(?:شكرا|شكرًا|شكراً|مشكور|يسلمو|يعطيك\s+العافيه|يعطيك\s+العافية|كلك\s+ذوق|🌹|❤️|❤)/)) {
    return { mode: "warmth", intensity: 1, reason: "customer is warm or grateful", shouldAcknowledge: false };
  }
  return { mode: "none", intensity: 0, reason: "neutral current turn", shouldAcknowledge: false };
}

function previousEmotionalEvidence(state: ConversationState) {
  return detectModeFromText(String(state.lastCustomerText || ""));
}

export function resolveHumanCareProfile(input: { turn: InterpretedTurn; state: ConversationState; truth?: TruthBundle | null }): HumanCareProfile {
  const current = detectModeFromText(input.turn.rawText);
  if (current.mode !== "none" && current.mode !== "warmth") return current;

  const q = n(input.turn.rawText);
  const previous = previousEmotionalEvidence(input.state);
  if (shortContextualFollowup(q) && previous.shouldAcknowledge && previous.mode !== "apology" && previous.mode !== "embarrassment") {
    return { ...previous, intensity: Math.max(1, previous.intensity - 1) as 1 | 2 | 3, reason: `short follow-up continues previous human-care context: ${previous.reason}` };
  }

  const relationship = input.state.humanRelationship;
  if (relationship && relationship.frustrationStreak >= 2 && /(?:متى|امتى|شو\s+صار|وين\s+وصل|ليش|تحديث)/.test(q)) {
    return { mode: "frustration", intensity: 2, reason: "durable frustration streak plus another status/delay follow-up", shouldAcknowledge: true };
  }
  return current;
}

const ACKS: Record<Exclude<HumanCareMode, "none" | "warmth">, string[]> = {
  confusion: [
    "ولا يهمك، خليني أبسطها بدون ما أعقدها عليك.",
    "أكيد، خليني أوضحها بطريقة أبسط وعلى نفس سؤالك.",
  ],
  anxiety: [
    "فاهم قلقك، والأهم أفصل لك شو المضمون وشو اللي ما بقدر أوعدك فيه.",
    "طبيعي تسأل إذا الموضوع مقلقك؛ خليني أعطيك الحقيقة بدون تطمينات فارغة.",
  ],
  frustration: [
    "معك حق تسأل، خصوصًا إذا طولت أكثر من المتوقع أو سمعت نفس الرد قبل.",
    "بعرف إن تكرار نفس الحالة بدون نتيجة جديدة مزعج؛ خليني أعطيك المفيد مباشرة.",
    "مقدّر صبرك، وما رح أعيد عليك نفس الجملة إذا ما في شيء جديد فعليًا.",
  ],
  anger: [
    "واضح إنك متضايق من اللي صار، وما رح أدخل معك بجدال؛ خليني أمسك المشكلة نفسها.",
    "فاهم إنك وصلت لمرحلة غضب، فخليني أحكي فقط بالشيء المثبت والحل الممكن الآن.",
  ],
  plea: [
    "فاهم إن الموضوع مهم إلك، وبجاوبك على قد اللي أقدر أثبته بدون وعود من عندي.",
    "وصلتني إنك محتاج مساعدة فعلية، فخليني أمشي معك بالمفيد الآن.",
  ],
  trust_loss: [
    "فاهم ليش الثقة اهتزت عندك، وما رح أغطي على هالشي بكلام إنشائي.",
    "واضح إنك فقدت الثقة من اللي صار؛ خليني أفصل لك الحقيقة المثبتة عن أي شيء ما بقدر أضمنه.",
  ],
  disappointment: [
    "واضح إن اللي صار خيّب توقعك، وخليني أجاوبك على الوضع الحقيقي بدل كلام عام.",
    "فاهم خيبة أملك، خصوصًا إذا كنت متوقع نتيجة أسرع أو أوضح.",
  ],
  embarrassment: [
    "ولا يهمك أبدًا، ما في داعي تتحرج من كثرة الأسئلة؛ حقك تفهم كل خطوة.",
    "ما أزعجتني، واسأل اللي بدك إياه؛ الأفضل تكون الصورة واضحة عندك.",
  ],
  exhaustion: [
    "واضح إنك تعبت من تكرار المتابعة، فما رح أزيد عليك بجملة محفوظة ثانية.",
    "فاهم إنك زهقت من الدوران بنفس النقطة؛ خليني أعطيك اللي تغيّر واللي ما تغيّر فقط.",
  ],
  time_pressure: [
    "فاهم إن عندك ضغط وقت، لذلك بدي أكون واضح معك بدون موعد غير مضمون.",
    "وصلتني إن الموضوع مرتبط بوقت عندك؛ خليني أحكي لك شو المثبت الآن وشو ما بقدر أضمنه.",
  ],
  financial_pressure: [
    "فاهم إن الجانب المالي ضاغط عليك، لذلك ما رح أخلط عليك الرسوم أو الأقساط أو أوعدك بشيء غير مثبت.",
    "وصلتني إن الالتزام المالي مهم بحساباتك؛ خليني أفصل لك المطلوب فعليًا بدون زيادة.",
  ],
  apology: [
    "ولا يهمك، ما في داعي تعتذر؛ خلينا نكمل من نفس النقطة.",
    "أبدًا، ما في مشكلة؛ كمل سؤالك وأنا معك بنفس السياق.",
  ],
  hope: [
    "إن شاء الله خير، وبنفس الوقت خليني أضل واضح معك بالشيء المثبت فقط.",
    "إن شاء الله تمشي الأمور للأفضل؛ خليني أعطيك الوضع الحالي بدون ما أوعدك قبل النتيجة.",
  ],
};

function replyHasHumanAcknowledgement(value: string) {
  const q = n(value);
  return /(?:فاهم|مفهوم\s+إنك|مفهوم\s+انك|معك\s+حق|مقدّر|مقدر|بعرف\s+إن|بعرف\s+ان|واضح\s+إنك|واضح\s+انك|ولا\s+يهمك|ما\s+أزعجتني|ما\s+ازعجتني|إن\s+شاء\s+الله\s+خير|ان\s+شاء\s+الله\s+خير|الثقه\s+اهتزت|الثقة\s+اهتزت)/.test(q);
}

function actionCriticalReply(value: string) {
  const q = n(value);
  return /(?:اكدلي|أكدلي|للتأكيد|للتاكيد).{0,55}(?:نعم).{0,55}(?:الغي|ألغي|استرداد|وقف\s+الاسترداد|اعيد\s+فتح|أعيد\s+فتح|اعتمد\s+الرقم)|(?:تم\s+الغاء|تم\s+إلغاء|تم\s+تسجيل\s+طلب\s+الاسترداد|تم\s+ايقاف\s+الاسترداد|تم\s+إيقاف\s+الاسترداد|تم\s+اعاده\s+فتح|تم\s+إعادة\s+فتح)/.test(q);
}

export function protectedCommercialEgress(value: string) {
  const raw = String(value || "");
  const q = n(raw);
  return /اكتب\s+الرقم\s*1/.test(q)
    || /(?:Orange\s+Money|CliQ|PAYAMEEEN|0788500337)/i.test(raw)
    || /\/receipt\?tracking=/i.test(raw)
    || /بعد\s+التحويل.{0,80}ارفع\s+الوصل/.test(q);
}

function stableIndex(seed: string, size: number) {
  if (size <= 1) return 0;
  let hash = 0;
  for (const ch of String(seed || "")) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
  return hash % size;
}

function acknowledgementFor(profile: HumanCareProfile, turnId: string, previousAssistant: string) {
  if (profile.mode === "none" || profile.mode === "warmth") return null;
  const pool = ACKS[profile.mode];
  const start = stableIndex(turnId, pool.length);
  const previous = n(previousAssistant);
  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(start + offset) % pool.length];
    const signature = n(candidate).split(" ").slice(0, 6).join(" ");
    if (!signature || !previous.includes(signature)) return candidate;
  }
  return null;
}

export function humanCarePromptContract(input: { turn: InterpretedTurn; state: ConversationState; truth?: TruthBundle | null }) {
  const profile = resolveHumanCareProfile(input);
  return `HUMAN_CARE_PROFILE=${JSON.stringify(profile)}\n- الشعور يغيّر طريقة الكلام فقط، ولا يغيّر الحقيقة أو الإجراء.\n- اعترف بالشعور بجملة واحدة كحد أقصى عندما يوجد دليل حرفي أو استمرارية واضحة.\n- لا تستخدم تعاطفًا مصطنعًا مع سؤال محايد.\n- التصبير صادق: ممنوع موعد وهمي أو وعد متابعة/تصعيد/اتصال غير منفذ.\n- بعد الاعتراف بالشعور، جاوب السؤال الحالي أو أعطِ الخطوة العملية مباشرة.\n- لا تكرر نفس جملة الاحتواء إذا استُخدمت قبل قليل.`;
}

export function applyHumanCareEgress(input: {
  reply: string | null | undefined;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
}) {
  const reply = String(input.reply || "").trim();
  if (!reply) return reply;
  if (actionCriticalReply(reply) || protectedCommercialEgress(reply)) return reply;

  const profile = resolveHumanCareProfile(input);
  if (!profile.shouldAcknowledge || profile.mode === "none" || profile.mode === "warmth") return reply;
  if (replyHasHumanAcknowledgement(reply)) return reply;

  const ack = acknowledgementFor(profile, input.turn.turnId, input.state.lastAssistantText || "");
  if (!ack) return reply;
  return `${ack}\n\n${reply}`.replace(/\n{3,}/g, "\n\n").trim();
}
