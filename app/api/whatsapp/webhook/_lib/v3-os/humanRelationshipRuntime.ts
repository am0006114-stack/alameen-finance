import { customerFacingStatusLabel } from "./applicationJourney";
import { normalizeArabic } from "./text";
import type { ConversationState, HumanConcern, HumanEmotion, HumanRelationshipState, InterpretedTurn, TruthBundle } from "./types";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function explicitFrustrationText(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  return hasAny(q, [
    /(?:صارلي|صارله|صارلها|من\s+تاريخ).{0,24}(?:يوم|ايام|أيام|اسبوع|أسبوع|اسابيع|أسابيع|\d+)/,
    /(?:8|7|6|5|4|3|2)\s*(?:يوم|ايام|أيام)|(?:اسبوع|أسبوع|اسبوعين|أسبوعين)/,
    /(?:طولتوا|طولتو|تأخرتوا|تاخرتوا|تأخير|تاخير|زهقت|تعبت|قرفت|مش\s+معقول|شو\s+هالتاخير|ليش\s+هيك)/,
    /(?:كل\s+مره|كل\s+مرة).{0,24}(?:نفس\s+الرد|نفس\s+الحكي|بتعيد|تعيد)/,
    /(?:بدون\s+نتيجه|بدون\s+نتيجة|معلق|واقف).{0,24}(?:من\s+يوم|من\s+الخميس|من\s+فتره|من\s+فترة)?/,
  ]);
}

export function explicitAngerText(value: string | null | undefined) {
  const q = n(value);
  return /(?:خرا|زباله|زفت|نصاب|نصابين|احتيال|كذاب|كذابين|قرفت|طفشت|لعنه|لعنة|وسخ)/.test(q);
}

export function warmSocialText(value: string | null | undefined) {
  const q = n(value);
  return /(?:شكرا|شكرًا|مشكور|يسلمو|يعطيك\s+العافيه|يعطيك\s+العافية|يعافيك|كلك\s+ذوق|كلك\s+زوق|🌹|❤️|❤)/.test(q);
}

export function greetingCue(value: string | null | undefined): string | null {
  const q = n(value);
  if (/(?:صباح\s+الخير)/.test(q)) return "صباح النور";
  if (/(?:مساء\s+الخير)/.test(q)) return "مساء النور";
  if (/(?:السلام\s+عليكم)/.test(q)) return "وعليكم السلام";
  if (/^(?:مرحبا|مرحبًا|اهلا|أهلا|هلا)(?:\s|$)/.test(q)) return "أهلًا فيك";
  return null;
}

export function humanConcernFromTurn(turn: InterpretedTurn): HumanConcern {
  const q = n(turn.rawText);
  if (turn.topics.includes("refund") || /(?:استرداد|رجعولي|رجعلي|الخمس\s+ليرات)/.test(q)) return "refund";
  // A concrete website/progress symptom is a technical concern even when the user is
  // understandably frustrated about it. This keeps relationship memory tied to what
  // actually needs help instead of flattening every frustrated turn into "delay".
  if (turn.topics.includes("website") || /(?:علق|معلق|واقف|تحميل|خطا|خطأ|92|٩٢|نسبه|نسبة)/.test(q)) return "technical";
  if (turn.topics.includes("review_timing") || turn.topics.includes("operational_pressure") || explicitFrustrationText(q)) return "delay";
  if (turn.topics.some((x) => ["payment_fee","payment_method","payment_timing","payment_recipient","payment_status","payment_confirmation","receipt_upload"].includes(x))) return "payment";
  if (turn.topics.includes("trust") || turn.topics.includes("legal") || /(?:نصب|احتيال|ثقه|ثقة|موثوق)/.test(q)) return "trust";
  if (turn.topics.includes("requirements") || turn.topics.includes("guarantor") || /(?:هويه|هوية|كشف\s+حساب|اثبات\s+دخل|إثبات\s+دخل|راتب|ضمان)/.test(q)) return "documents";
  if (turn.topics.includes("products") || /(?:ايفون|iphone|سامسونج|samsung|جهاز|موديل|متوفر|يتوفر)/i.test(q)) return "availability";
  return "general";
}

export function explicitHumanEmotion(input: { turn: InterpretedTurn; state?: ConversationState | null }): HumanEmotion {
  const q = n(input.turn.rawText);
  if (explicitAngerText(q)) return "angry";
  if (explicitFrustrationText(q)) return "frustrated";
  if (/(?:بترجاك|برجاك|الله\s+يخليك|معلش|اذا\s+بتقدر|إذا\s+بتقدر)/.test(q)) return "pleading";
  if (/(?:مش\s+فاهم|ما\s+فهمت|شو\s+يعني|مش\s+واضح|وضحلي|فسرلي)/.test(q)) return "confused";
  if (warmSocialText(q) || greetingCue(q)) return "warm";
  // Classifier sentiment is supporting evidence only. It cannot manufacture frustration
  // for a neutral short status question such as "شو صار؟".
  const shortNeutralStatus = /^(?:شو\s+صار|شو\s+صار\s+بطلبي|حاله\s+الطلب|حالة\s+الطلب|تحديث|\?|؟|\.)$/.test(q);
  if (!shortNeutralStatus && input.turn.sentiment === "angry" && input.state?.consecutiveRiskTurns && input.state.consecutiveRiskTurns > 0) return "angry";
  return "neutral";
}

function defaultRelationship(stamp = new Date().toISOString()): HumanRelationshipState {
  return {
    lastEmotion: "neutral",
    lastConcern: null,
    frustrationStreak: 0,
    delayTurnCount: 0,
    warmTurnCount: 0,
    lastGreetingTurnId: null,
    updatedAt: stamp,
  };
}

export function updateHumanRelationshipState(input: { state: ConversationState; turn: InterpretedTurn; stamp?: string }): HumanRelationshipState {
  const stamp = input.stamp || new Date().toISOString();
  const previous = input.state.humanRelationship || defaultRelationship(stamp);
  const emotion = explicitHumanEmotion({ turn: input.turn, state: input.state });
  const concern = humanConcernFromTurn(input.turn);
  const delay = concern === "delay";
  const warm = emotion === "warm";
  const socialOnly = concern === "general" && Boolean(warm || greetingCue(input.turn.rawText));
  const effectiveConcern = socialOnly ? previous.lastConcern : concern;
  return {
    lastEmotion: emotion,
    lastConcern: effectiveConcern,
    frustrationStreak: ["frustrated","angry"].includes(emotion) ? Math.min(20, (previous.frustrationStreak || 0) + 1) : Math.max(0, (previous.frustrationStreak || 0) - 1),
    delayTurnCount: delay ? Math.min(50, (previous.delayTurnCount || 0) + 1) : previous.delayTurnCount || 0,
    warmTurnCount: warm ? Math.min(20, (previous.warmTurnCount || 0) + 1) : Math.max(0, (previous.warmTurnCount || 0) - 1),
    lastGreetingTurnId: greetingCue(input.turn.rawText) ? input.turn.turnId : previous.lastGreetingTurnId || null,
    updatedAt: stamp,
  };
}

function customerTurns(recentTurns?: string[]) {
  return (recentTurns || [])
    .filter((x) => /^\s*(?:العميل|customer)\s*:/i.test(String(x || "")))
    .map((x) => String(x || "").replace(/^\s*(?:العميل|customer)\s*:\s*/i, "").trim())
    .filter(Boolean)
    .slice(-12);
}

export function buildHumanRelationshipProfile(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle; recentTurns?: string[] }) {
  const emotion = explicitHumanEmotion({ turn: input.turn, state: input.state });
  const concern = humanConcernFromTurn(input.turn);
  const recent = customerTurns(input.recentTurns);
  const explicitDelayCount = recent.filter((x) => explicitFrustrationText(x) || /(?:متى|امتى|قديش).{0,30}(?:الموافقه|الموافقة|الدراسه|الدراسة|يخلص|جاهز)/.test(n(x))).length;
  const greeting = greetingCue(input.turn.rawText);
  const empathy: "none" | "light" | "contextual" | "strong" = emotion === "angry" ? "strong" : emotion === "frustrated" || emotion === "pleading" ? "contextual" : emotion === "confused" ? "light" : "none";
  return {
    emotion,
    concern,
    empathy,
    greeting,
    explicitDelayCount,
    relationshipState: input.state.humanRelationship || defaultRelationship(),
    rules: {
      classifierEmotionAloneNeverJustifiesEmpathy: true,
      neutralStatusQuestionsGetNoSyntheticFrustration: true,
      acknowledgeGreetingBeforeBusinessAnswer: Boolean(greeting),
      oneEmpathySentenceMaxBeforeUsefulAnswer: empathy !== "none",
      neverInventCustomerFacts: true,
      neverPretendToSeeMediaEvidence: true,
    },
  };
}

export function collapseAccidentalPhraseDuplication(value: string | null | undefined) {
  let reply = String(value || "").trim();
  if (!reply) return reply;
  const phrases = [
    "المعدل الطبيعي للمراجعة",
    "المعدل الطبيعي",
    "قيد الدراسة النهائية",
    "الدفع مؤكد إداريًا",
  ];
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    reply = reply.replace(new RegExp(`(${escaped})(?:\\s+\\1)+`, "g"), "$1");
  }
  return reply.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function stockEmpathyPrefix(value: string) {
  const q = n(value);
  return /^(?:معك\s+حق\s+تتضايق|مفهوم\s+انك\s+متضايق|مفهوم\s+إنك\s+متضايق|شايف\s+ان\s+الموضوع\s+ضاغط|شايف\s+إن\s+الموضوع\s+ضاغط)/.test(q);
}

function stripFirstParagraph(value: string) {
  const parts = String(value || "").trim().split(/\n\s*\n/);
  if (parts.length <= 1) return value;
  return parts.slice(1).join("\n\n").trim();
}

function actionCriticalReply(value: string) {
  const q = n(value);
  return /(?:اكدلي|أكدلي).{0,40}(?:نعم).{0,40}(?:الغي|ألغي|استرداد|اعتمد\s+الرقم)|(?:تم\s+الغاء|تم\s+إلغاء|تم\s+اعتماد\s+رقم\s+الواتساب|تم\s+تسجيل\s+طلب\s+الاسترداد)/.test(q);
}

export function applyHumanRelationshipEgress(input: { reply: string | null | undefined; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  let reply = collapseAccidentalPhraseDuplication(input.reply);
  if (!reply) return reply;
  const emotion = explicitHumanEmotion({ turn: input.turn, state: input.state });
  const greeting = greetingCue(input.turn.rawText);

  // Remove synthetic empathy when the literal turn contains no emotional evidence.
  if (emotion === "neutral" && stockEmpathyPrefix(reply)) reply = stripFirstParagraph(reply);

  // Preserve action confirmations as compact transactional truth; do not decorate them.
  if (!actionCriticalReply(reply) && greeting && !n(reply).startsWith(n(greeting))) {
    reply = `${greeting}.\n\n${reply}`;
  }
  return collapseAccidentalPhraseDuplication(reply);
}

function combinedEvidence(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const app = input.truth.application || input.state.lastVerifiedApplication?.application || null;
  return n([
    input.turn.rawText,
    input.state.lastCustomerText || "",
    app?.fullName || "",
    app?.deviceName || "",
    typeof app?.salary === "number" ? String(app.salary) : "",
  ].filter(Boolean).join(" "));
}

const BANK_NAMES: Array<{ key: string; pattern: RegExp }> = [
  { key: "البنك الإسلامي", pattern: /البنك\s+الاسلامي|البنك\s+الإسلامي/ },
  { key: "البنك العربي", pattern: /البنك\s+العربي/ },
  { key: "بنك الاتحاد", pattern: /بنك\s+الاتحاد/ },
  { key: "القاهرة عمان", pattern: /القاهره\s+عمان|القاهرة\s+عمان/ },
  { key: "الإسكان", pattern: /بنك\s+الاسكان|بنك\s+الإسكان/ },
];

export function unsupportedPersonalFactClaim(input: { candidate: string | null | undefined; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const candidate = n(input.candidate);
  if (!candidate) return false;
  const evidence = combinedEvidence(input);

  for (const bank of BANK_NAMES) {
    if (bank.pattern.test(candidate) && !bank.pattern.test(evidence)) return true;
  }

  const customerDeniedGuarantee = /(?:ما\s*عندي|مش\s*عندي|بدون).{0,18}(?:ضمان|ضمان\s+اجتماعي)/.test(evidence);
  const replyClaimsGuarantee = /(?:مسجل|مسجله|مسجلة|عندك|عندك\s+تسجيل).{0,24}(?:بالضمان|بالضمان\s+الاجتماعي|ضمان\s+اجتماعي)|(?:تسجيلك).{0,18}(?:بالضمان)/.test(candidate);
  if (customerDeniedGuarantee && replyClaimsGuarantee) return true;

  const selfEmployed = /(?:عمل\s+حر|اعمال\s+حرة|أعمال\s+حرة|بشتغل\s+لحسابي|لحسابي|ما\s*عندي\s+اثبات\s+دخل|ما\s*عندي\s+إثبات\s+دخل)/.test(evidence);
  const replyClaimsSalary = /(?:نزول\s+راتبك|راتبك\s+على|راتبك\s+ينزل|راتب\s+ثابت\s+عندك|كونك\s+موظف)/.test(candidate);
  if (selfEmployed && replyClaimsSalary) return true;

  return false;
}

export function buildGroundedPersonalFactRepair(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const evidence = combinedEvidence(input);
  const selfEmployed = /(?:عمل\s+حر|اعمال\s+حرة|أعمال\s+حرة|بشتغل\s+لحسابي|لحسابي)/.test(evidence);
  const hasBankStatement = /(?:كشف\s+حساب|حركات\s+تحويل|حركه\s+تحويل|حركة\s+تحويل)/.test(evidence);
  const deniedGuarantee = /(?:ما\s*عندي|مش\s*عندي|بدون).{0,18}(?:ضمان|ضمان\s+اجتماعي)/.test(evidence);
  if (selfEmployed) {
    const parts = ["فهمتك: شغلك عمل حر وبتشتغل لحسابك."];
    if (hasBankStatement) parts.push("وكشف الحساب اللي فيه حركة تحويلات ممكن يكون من المستندات اللي تساعد في توضيح الدخل إذا انطلب منك إثبات إضافي.");
    if (deniedGuarantee) parts.push("وبما إنك قلت ما عندك ضمان، ما رح أعتبرك مسجل بالضمان أو عندك راتب ثابت من عندي.");
    parts.push("الدراسة هي اللي بتحدد إذا احتاج ملفك مستند إضافي، وما في داعي ترفع شي على واتساب.");
    return parts.join(" ");
  }
  return "بعتمد فقط المعلومات اللي أنت كتبتها والحقيقة الموجودة على الطلب. ما رح أفترض بنك، راتب، ضمان، وظيفة أو أي معلومة شخصية ما انذكرت أو ما هي مثبتة فعليًا.";
}

export function mediaEvidenceViolation(input: { candidate: string | null | undefined; turn: InterpretedTurn; state: ConversationState }) {
  const candidate = n(input.candidate);
  const current = n(input.turn.rawText);
  const previous = n(input.state.lastCustomerText);
  if (!candidate) return false;
  const mediaEnvelope = /تم\s+استلام\s+(?:صوره|صورة|مرفق|ملف)\s+من\s+العميل/.test(current);
  const imageFollowup = /(?:الصوره|الصورة|سكرين|screenshot|92|٩٢|بالمية|بالمئه|بالمئة)/i.test(`${current} ${previous}`);
  if (!mediaEnvelope && !imageFollowup) return false;

  const claimsVision = /(?:شايف\s+بالصوره|شايف\s+بالصورة|واضح\s+بالصوره|واضح\s+بالصورة|الصوره\s+بتبين|الصورة\s+بتبين)/.test(candidate);
  const claimsProgressMeaning = /(?:92|٩٢).{0,28}(?:تحميل\s+الصفحه|تحميل\s+الصفحة|خاص\s+بالصفحه|خاص\s+بالصفحة|مش\s+مؤشر\s+على\s+حاله\s+طلبك|مش\s+مؤشر\s+على\s+حالة\s+طلبك)|(?:تحميل\s+الصفحه|تحميل\s+الصفحة).{0,28}(?:92|٩٢)/.test(candidate);
  return claimsVision || claimsProgressMeaning;
}

export function buildMediaEvidenceRepair(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const q = n(`${input.turn.rawText} ${input.state.lastCustomerText || ""}`);
  const app = input.truth.application || input.state.lastVerifiedApplication?.application || null;
  const status = app ? ` حالة طلبك الموثقة الآن: ${customerFacingStatusLabel(app)}.` : "";
  if (/(?:92|٩٢)/.test(q)) {
    return `إذا قصدك نسبة 92%، الرقم لحاله ما بكفيني أحدد بثقة شو بيمثل، فما رح أحكي إنها تحميل صفحة أو نسبة دراسة من عندي.${status} إذا بدك نحدد مشكلة الـ92% نفسها، اكتبلي اسم الصفحة اللي ظاهر عليها الرقم أو نص رسالة الخطأ إن وجدت.`;
  }
  return `وصلني المرفق، بس ما رح أفترض شو ظاهر فيه أو أبني عليه حقيقة من غير دليل واضح.${status} اكتبلي بكلمتين شو النقطة اللي بدك أتأكد منها بالمرفق وبجاوبك على نفس الشي.`;
}
