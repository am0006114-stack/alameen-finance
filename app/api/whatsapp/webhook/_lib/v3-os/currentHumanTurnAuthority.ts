import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { explicitContactRequestText } from "./currentTurnAuthority";
import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type CurrentHumanTurnKind =
  | "none"
  | "safety_crisis"
  | "contact_isolation_continuation"
  | "verified_contact_alias_linked"
  | "verified_contact_alias_conflict"
  | "direct_call_request"
  | "long_delay_anomaly"
  | "social_security_income"
  | "website_upload_error"
  | "explicit_no_repeat"
  | "five_jod_concern"
  | "open_human_prompt"
  | "meeting_request"
  | "personal_question";

export type CurrentHumanTurnAuthority = {
  kind: CurrentHumanTurnKind;
  hard: boolean;
  reason: string;
};

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stage(input: { truth: TruthBundle; state: ConversationState }) {
  return applicationJourneyStage(input.truth.application || input.state.lastVerifiedApplication?.application || null);
}

function isRefundStage(value: string) {
  return value === "refund_requested" || value === "refund_completed";
}

function selfHarmCrisisText(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  return /(?:انتحر|انتحار|اقتل\s+نفسي|أقتل\s+نفسي|انهي\s+حياتي|أنهي\s+حياتي|بدي\s+اموت|بدي\s+أموت|نفسي\s+اموت|نفسي\s+أموت|رساله\s+انتحار|رسالة\s+انتحار|على\s+سطح\s+(?:عماره|عمارة)|ارمي\s+(?:حالي|نفسي)|أرمي\s+(?:حالي|نفسي)|انتهى\s+وقتي\s+بالدنيا)/.test(q);
}

function safetyCrisisActive(turn: InterpretedTurn, state: ConversationState) {
  if (selfHarmCrisisText(turn.rawText)) return true;
  if (!selfHarmCrisisText(state.lastCustomerText)) return false;
  const q = n(turn.rawText);
  return /(?:ما\s+بقدر|زهقت\s+من\s+الحياه|زهقت\s+من\s+الحياة|كل\s+شي\s+انتهى|كل\s+شيء\s+انتهى|خلص|ما\s+في\s+فايده|ما\s+في\s+فائدة|تعبت|انتهى\s+وقتي)/.test(q);
}


function contactIsolationConversationActive(state: ConversationState) {
  if (state.contactResolution && ["blocked_mismatch", "awaiting_admin_update"].includes(state.contactResolution.status)) return true;
  const previous = n(state.lastAssistantText);
  return /(?:رقم\s+التتبع).{0,120}(?:مربوط\s+برقم\s+واتساب\s+مختلف|رقم\s+واتساب\s+مختلف|رقم\s+مختلف)/.test(previous)
    || /(?:خصوصيه|خصوصية).{0,80}(?:صاحب\s+الطلب|رقم\s+مختلف|الطلب)/.test(previous)
    || /(?:ربط\s+الطلب|يتوثق\s+الربط|تحديث\s+الرقم|تعديل\s+الرقم).{0,120}(?:تنفيذ\s+اداري|تنفيذ\s+إداري|رقم\s+مختلف|واتساب|يتنفذ)/.test(previous);
}

function contactIsolationContinuation(q: string, state: ConversationState) {
  if (!contactIsolationConversationActive(state)) return false;
  return /(?:رقمي|الرقم).{0,55}(?:ما\s+عليه\s+واتساب|مش\s+عليه\s+واتساب|ما\s+بزبط.{0,16}واتساب|ما\s+بشتغل.{0,16}واتساب|استرالي|أسترالي|دولي|برا\s+الاردن|برا\s+الأردن|قديم|غيرته|غيرت\s+رقمي|رقم\s+ثاني|رقمي\s+الثاني)|(?:هو|هذا|هاد|هاض)\s+رقمي.{0,35}(?:بس|لكن|الثاني)?|(?:الرقم\s+المسجل).{0,40}(?:الي|إلي|رقمي)|(?:مش\s+عارف|مش\s+عارفه|ما\s+بعرف).{0,45}(?:اغير|أغير|تغيير|ارجع\s+اغير|أرجع\s+أغير).{0,30}(?:الرقم|رقم)|(?:عشان|عشان\s+التتبع).{0,35}(?:اغير|أغير|الرقم)|(?:وين\s+ابعته|وين\s+أبعته).{0,25}(?:رقم\s+التتبع|الرقم)?/.test(q);
}

function directCallRequest(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  return explicitContactRequestText(turn.rawText)
    || /(?:تواصل|احكي|رن|اتصل).{0,22}(?:معي|فيي|علي).{0,24}(?:اتصال|تلفون|مكالمه|مكالمة)|(?:بدي|اريد|أريد).{0,20}(?:موظف|موضف).{0,24}(?:احكي|اتواصل|اتصل)|(?:رن|اتصل).{0,16}(?:علي|فيي).{0,20}(?:الساعه|الساعة|على\s+\d+)/.test(q);
}

function longDelayAnomaly(q: string, currentStage: string) {
  if (isRefundStage(currentStage)) return false;
  const explicitOldMonth = /(?:من\s+شهر\s*(?:8|٨)|من\s+اغسطس|من\s+آب)/.test(q);
  const veryLong = /(?:صارلي|صارله|الي|إلي).{0,18}(?:اسبوعين|أسبوعين|ثلاث\s+اسابيع|3\s+اسابيع|٣\s+اسابيع|شهر)|(?:اكثر|أكثر)\s+من\s+(?:10|١٠)\s+ايام/.test(q);
  return explicitOldMonth || veryLong;
}

function socialSecurityIncome(q: string) {
  const income = /(?:راتبي|الراتب|راتب|دخل|بنك|البنك|كشف\s+حساب)/.test(q);
  const socialSecurity = /(?:مسجل|مشترك|عندي).{0,12}(?:بال)?ضمان|(?:الضمان\s+الاجتماعي|الضمان\s+الاجتماعى)/.test(q);
  return income && socialSecurity;
}

function websiteUploadError(q: string) {
  return /(?:لم\s+يتم\s+استكمال\s+هذا\s+الطلب|تعذر\s+استكمال\s+الطلب)/.test(q)
    && /(?:كبير\s+جدا|كبير\s+جدًا|حجم).{0,30}(?:الموقع|وظيفه\s+الموقع|وظيفة\s+الموقع|معالجته|معالجه)/.test(q)
    || /(?:الملف|الصوره|الصورة).{0,24}(?:كبير\s+جدا|كبير\s+جدًا).{0,38}(?:الموقع|يرفع|الرفع|معالجته)/.test(q);
}

function explicitNoRepeat(q: string) {
  return /(?:بتعيد|تعيد|بتكرر|تكرر).{0,26}(?:نفس\s+الحكي|نفس\s+الكلام|نفس\s+الجمله|نفس\s+الجملة)|(?:ما|لا)\s+(?:تعيد|تكرر).{0,24}(?:الحكي|الكلام|الجمله|الجملة)|(?:اعطيني|أعطيني)\s+حل.{0,24}(?:ما\s+تعيد|بدون\s+تكرار)?/.test(q);
}

function fiveJodConcern(q: string, currentStage: string) {
  const five = /(?:5|٥|الخمس|الخمسه|خمس|خمسه|خمسة|رسوم\s+فتح\s+الملف)/.test(q);
  const loss = /(?:راح|راحت|ضاع|ضاعت|خسرت|انسرق|سرقت|اكلتو|أكلتو|اخذتوا|أخذتوا|راحو\s+علي)/.test(q);
  const refundDelay = isRefundStage(currentStage) && /(?:وقت|يطول|طول|بدهم\s+وقت|حولتهم\s+بثواني|وينهم|متى|امتى)/.test(q);
  return five && (loss || refundDelay);
}

function openHumanPrompt(q: string) {
  return /^(?:عارف|بتعرف)\s+شو\s+(?:نفسي|بدي)(?:\s+اعمل|\s+أعمل)?$|^(?:بسالك|بسألك)\s+جاوبني$/.test(q);
}

function meetingRequest(q: string) {
  return /(?:نفسي|بدي|خلينا|تعال).{0,18}(?:نتقابل|اقابلك|أقابلك)|(?:اختار|حدد).{0,18}(?:المكان|مكان).{0,18}(?:الزمان|وقت)|^(?:نتقابل|تعال\s+نتقابل)$/.test(q);
}

function personalQuestion(q: string) {
  return /^(?:عندك|الك|إلك).{0,12}(?:خوات|اخوات|أخوات|اخوان|إخوان|ولاد|اولاد|أولاد)|(?:متزوج|متزوجه|متزوجة)\??$/.test(q);
}

function currentTurnContactIdentityEvent(state: ConversationState) {
  if (!state.lastTurnId) return null;
  const event = [...(state.facts || [])].reverse().find((fact) =>
    fact.turnId === state.lastTurnId && ["verified_alternate_contact_linked", "verified_alternate_contact_conflict"].includes(fact.key)
  );
  return event || null;
}

export function resolveCurrentHumanTurnAuthority(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): CurrentHumanTurnAuthority {
  const q = n(input.turn.rawText);
  if (!q) return { kind: "none", hard: false, reason: "empty current turn" };
  const currentStage = stage(input);
  if (safetyCrisisActive(input.turn, input.state)) return { kind: "safety_crisis", hard: true, reason: "immediate self-harm safety continuity outranks ordinary service, complaint, refund, and delay conversation" };
  const contactEvent = currentTurnContactIdentityEvent(input.state);
  if (contactEvent?.key === "verified_alternate_contact_linked") return { kind: "verified_contact_alias_linked", hard: true, reason: "registered application sender explicitly verified an alternate WhatsApp identity; acknowledge the real identity-state change without claiming application data changed" };
  if (contactEvent?.key === "verified_alternate_contact_conflict") return { kind: "verified_contact_alias_conflict", hard: true, reason: "requested alternate WhatsApp identity conflicts with an existing verified binding; do not overwrite automatically" };
  if (contactIsolationContinuation(q, input.state)) return { kind: "contact_isolation_continuation", hard: true, reason: "customer is explaining a legitimate phone/channel mismatch after contact-isolation guard; continue the conversation without disclosing the foreign application" };
  if (directCallRequest(input.turn)) return { kind: "direct_call_request", hard: true, reason: "explicit current-turn call/contact request outranks refund/delay state" };
  if (websiteUploadError(q)) return { kind: "website_upload_error", hard: true, reason: "customer supplied a concrete website/upload error" };
  if (socialSecurityIncome(q)) return { kind: "social_security_income", hard: true, reason: "income + social-security context; ضمان means social security, not trust guarantee" };
  if (longDelayAnomaly(q, currentStage)) return { kind: "long_delay_anomaly", hard: true, reason: "customer reports delay far beyond normal 2-3 business-day baseline" };
  if (explicitNoRepeat(q)) return { kind: "explicit_no_repeat", hard: true, reason: "customer explicitly says the system is repeating/failing to answer" };
  if (fiveJodConcern(q, currentStage)) return { kind: "five_jod_concern", hard: true, reason: "direct concern that the 5 JOD fee was lost" };
  if (meetingRequest(q)) return { kind: "meeting_request", hard: true, reason: "current human turn asks to meet, not for refund status" };
  if (personalQuestion(q)) return { kind: "personal_question", hard: true, reason: "current human turn is a personal conversational question" };
  if (openHumanPrompt(q)) return { kind: "open_human_prompt", hard: true, reason: "current human turn invites a human conversational response" };
  return { kind: "none", hard: false, reason: "no current-human-turn hard authority" };
}

function appLine(input: { truth: TruthBundle; state: ConversationState }) {
  const app = input.truth.application || input.state.lastVerifiedApplication?.application || null;
  if (!app) return "ما عندي حالة طلب موثقة أضيفها من عندي هسا.";
  return `الحالة المثبتة لطلبك${app.trackingId ? ` ${app.trackingId}` : ""}: ${customerFacingStatusLabel(app)}.`;
}

export function buildCurrentHumanTurnReply(input: { authority: CurrentHumanTurnAuthority; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): string | null {
  const currentStage = stage(input);
  switch (input.authority.kind) {
    case "safety_crisis":
      return `أنا معك هسا. إذا أنت على سطح أو قريب من حافة أو أي شي ممكن يأذيك، ابتعد عنه وادخل لمكان آمن الآن. اتصل بـ911 أو روح لأقرب طوارئ/مستشفى، وخلي شخص قريب منك يجي ويضل معك. ما رح أساعدك بطريقة لإيذاء نفسك أو بكتابة رسالة انتحار. احكيلي بس: ابتعدت عن الخطر وصار معك حدا؟`;
    case "verified_contact_alias_linked": {
      const event = [...(input.state.facts || [])].reverse().find((fact) => fact.turnId === input.state.lastTurnId && fact.key === "verified_alternate_contact_linked");
      const alias = event?.value || "الرقم الثاني";
      return `تمام، هيك الصورة صارت واضحة. ثبت عندي إن ${alias} هو رقم واتسابك الثاني للمتابعة. رقم الطلب نفسه وبياناته ما تغيّرت؛ بس لما تراسلنا من هالرقم بنعرف إنه تابع لنفس المتابعة وما بنرجع نوقفك كل مرة بسبب اختلاف الرقم.`;
    }
    case "verified_contact_alias_conflict":
      return `فهمت إنك بدك تعتمد الرقم الثاني للمتابعة، بس ما رح أعمل ربط تلقائي لأنه ظاهر عندي تعارض مع ربط موثّق سابق. خليت الربط كما هو لحماية الطلب، وهاي الحالة تحتاج مراجعة إدارية قبل أي تغيير.`;
    case "contact_isolation_continuation": {
      const australian = /(?:استرالي|أسترالي|دولي|برا\s+الاردن|برا\s+الأردن)/.test(n(input.turn.rawText));
      const noWhatsapp = /(?:ما\s+عليه\s+واتساب|مش\s+عليه\s+واتساب|ما\s+بزبط.{0,16}واتساب|ما\s+بشتغل.{0,16}واتساب)/.test(n(input.turn.rawText));
      const reason = australian ? "كون الرقم أسترالي أو دولي بحد ذاته مش مشكلة؛ المشكلة بس إن رقم الطلب مختلف عن رقم الواتساب الحالي." : noWhatsapp ? "فهمتك، المشكلة إن الرقم المسجل على الطلب ما عليه واتساب، مش إنك بدك تدخل على طلب حدا ثاني." : "فهمتك، عندك سبب فعلي لاستخدام رقم مختلف عن الرقم المسجل على الطلب.";
      return `${reason} نقدر نكمل هون عادي بأي سؤال عام أو عن خطوات الأمين، بس ما بقدر أعرض تفاصيل الطلب أو أنفذ عليه من رقم مختلف قبل ما يتوثق الربط. إذا بدك تحديث الرقم المسجل، هذا يحتاج تنفيذ إداري فعلي؛ ما رح أقول إنه تغيّر قبل ما يتنفذ.`;
    }
    case "direct_call_request":
      return `فاهم إنك بدك نحكي باتصال عشان توضح الصورة. المتابعة الرسمية للطلبات من نفس واتساب، وما عندي مكالمة فعلية أرتبها من هون. احكيلي النقطة اللي بدك تفهمها وأنا معك فيها مباشرة.`;
    case "website_upload_error":
      return `واضح من الرسالة إن الملف أكبر من الحجم اللي الموقع قدر يعالجه. لا تبعث الهوية أو كشف الحساب على واتساب؛ صغّر حجم الملف أو حوّله لملف/صورة أخف، وبعدها ارفعه من الرابط الرسمي الآمن نفسه. إذا ظل الخطأ بعد تصغيره، اكتبلي نوع الملف وحجمه وبمشي معك بالحل.`;
    case "social_security_income":
      return `تمام، نزول راتبك على البنك الإسلامي وتسجيلك بالضمان معلومات بتفيد دراسة الدخل والملف، بس ما بتضمن الموافقة لحالها. الهوية وإثبات الدخل من الأساسيات، والدراسة هي اللي بتحسم القرار النهائي حسب الملف.`;
    case "long_delay_anomaly":
      return `معك حق تعترض؛ إذا طلبك من شهر 8 فإحنا مش بنتكلم عن تأخير يومين أو 3 أصلًا، هذا تجاوز واضح للمعدل الطبيعي. ${appLine(input)} ما عندي سبب موثق أختلقه إلك ولا موعد وهمي أوعدك فيه، لكن ما رح أتعامل مع حالتك كأنها طلب جديد ضمن المدة الطبيعية.`;
    case "explicit_no_repeat":
      return `معك حق، وما رح أعيد عليك نفس قالب المدة. ${appLine(input)} إذا ما في تحديث جديد فعلي ما بدي ألبّس نفس الجواب بصياغة ثانية؛ من جهتك ما بطلب منك تعيد خطوة سبق وعملتها، وأي شيء ناقص فعليًا بحكيلك عنه مباشرة.`;
    case "five_jod_concern": {
      if (currentStage === "refund_requested") return `لا، الخمس دنانير مش ضايعة عليك. هي رسوم فتح الملف اللي كانت مرتبطة بالمعاملة، وطلب استردادها مسجل فعلًا وقيد المعالجة. ما رح أقول إنها رجعت إلا لما يظهر تنفيذ التحويل فعليًا.`;
      if (currentStage === "refund_completed") return `الخمس دنانير كانت رسوم فتح الملف، وحسب الحالة الحالية الاسترداد مكتمل بالنظام.`;
      return `لا، الخمس دنانير مش «راحت عليك». هي رسوم فتح الملف بعد الموافقة المبدئية واختيار الاستمرار، وهي منفصلة عن ثمن الجهاز والقسط الأول. إذا قررت تلغي بعد دفع مؤكد، إلها مسار استرداد رسمي؛ وحالة طلبك الحالية هي اللي بتحدد الخطوة التالية.`;
    }
    case "open_human_prompt":
      return `احكيلي 😄 شو نفسك تعمل؟`;
    case "meeting_request":
      return `هههه وصلت 😄 خلينا نحكي هون أحسن؛ احكيلي شو بدك مني وأنا معك.`;
    case "personal_question":
      return `هههه دخلنا بالشخصي 😄 خلينا عليك إنت — شو حاب تسألني أو شو بدك أساعدك فيه؟`;
    default:
      return null;
  }
}

export function currentHumanTurnCandidateAligned(input: { authority: CurrentHumanTurnAuthority; candidate: string | null | undefined }) {
  const q = n(input.candidate);
  if (!q) return false;
  switch (input.authority.kind) {
    case "safety_crisis": {
      const immediateSafety = /(?:ابتعد|ابعد|مكان\s+امن|مكان\s+آمن)/.test(q);
      const urgentHelp = /(?:911|اسعاف|إسعاف|طوارئ|مستشفى)/.test(q);
      const humanPresence = /(?:حدا|حد|شخص).{0,24}(?:قريب|معك)|(?:خلي|احكي).{0,20}(?:حدا|حد|شخص)/.test(q);
      const unsafeMethod = /(?:ارمي|أرمي).{0,18}(?:راس|رأس|رجل|رجليك)|(?:اسهل|أسهل).{0,18}(?:طريقه|طريقة).{0,18}(?:انتحار|تموت|اموت|أموت)/.test(q);
      const serviceTemplate = /(?:طلبك|الدراسه|الدراسة|ضغط\s+مراجعات|المعدل\s+الطبيعي|الاسترداد\s+مسجل)/.test(q);
      return immediateSafety && urgentHelp && humanPresence && !unsafeMethod && !serviceTemplate;
    }
    case "verified_contact_alias_linked": return /(?:ثبت\s+عندي|رقم\s+واتسابك\s+الثاني|تابع\s+لنفس\s+المتابعه|تابع\s+لنفس\s+المتابعة)/.test(q) && !/(?:غيرت\s+رقم\s+الطلب|تم\s+تعديل\s+الطلب)/.test(q);
    case "verified_contact_alias_conflict": return /(?:تعارض|مراجعه\s+اداريه|مراجعة\s+إدارية)/.test(q) && /(?:ما\s+رح|لم\s+يتم|ما\s+عملت).{0,30}(?:ربط|تغيير)/.test(q);
    case "contact_isolation_continuation": return /(?:نكمل\s+هون|نكمل\s+المحادثه|نكمل\s+المحادثة)/.test(q) && /(?:ما\s+بقدر\s+اعرض|ما\s+بقدر\s+أعرض).{0,50}(?:تفاصيل\s+الطلب|الطلب)/.test(q) && /(?:تنفيذ\s+اداري|تنفيذ\s+إداري|يتوثق\s+الربط)/.test(q) && !/(?:الجهاز|قيد\s+المراجعه|قيد\s+الدراسه|الدفع\s+مؤكد)/.test(q);
    case "direct_call_request": return /(?:اتصال|مكالمه|مكالمة|واتساب).{0,80}(?:ما\s+عندي|المتابعه|المتابعة|احكيلي)/.test(q);
    case "website_upload_error": return /(?:حجم|كبير).{0,70}(?:الملف|صغر|صغ ر|ارفع|الرابط\s+الرسمي)/.test(q) && !/شارع\s+المدينه|شارع\s+المدينة/.test(q);
    case "social_security_income": return /(?:راتب|البنك|الضمان).{0,120}(?:الدراسه|الدراسة|الدخل|الموافقه|الموافقة)/.test(q) && !/(?:الضمان\s+العملي|ثق\s+بكلام)/.test(q);
    case "long_delay_anomaly": return /(?:شهر\s*8|شهر\s*٨|تجاوز|خارج).{0,120}(?:المعدل|المده|المدة|التاخير|التأخير)|(?:مش\s+بنتكلم|مش\s+بحكي).{0,70}(?:يومين|3\s+ايام|3\s+أيام)/.test(q);
    case "explicit_no_repeat": return /(?:ما\s+رح\s+اعيد|ما\s+رح\s+أعيد|بدون\s+تكرار|مش\s+رح\s+اكرر|مش\s+رح\s+أكرر)/.test(q);
    case "five_jod_concern": return /(?:5|٥|الخمس|الخمسه|خمسه|خمسة).{0,100}(?:مش\s+ضايعه|مش\s+ضايعة|رسوم\s+فتح\s+الملف|استرداد)/.test(q);
    case "open_human_prompt": return /(?:احكيلي|قول|شو\s+نفسك)/.test(q) && !/(?:طلبك\s+ملغي|الاسترداد\s+مسجل)/.test(q);
    case "meeting_request": return /(?:خلينا\s+نحكي\s+هون|احكيلي\s+هون|أنا\s+معك|انا\s+معك)/.test(q) && !/(?:طلبك\s+ملغي|الاسترداد\s+مسجل)/.test(q);
    case "personal_question": return /(?:دخلنا\s+بالشخصي|خلينا\s+عليك|شو\s+حاب)/.test(q) && !/(?:طلبك\s+ملغي|الاسترداد\s+مسجل)/.test(q);
    default: return true;
  }
}
