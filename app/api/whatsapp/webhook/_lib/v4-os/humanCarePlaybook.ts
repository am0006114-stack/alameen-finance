import type { V4TurnUnderstanding, V4WorkingMemory } from "./types";
import { normalizeForFingerprint } from "./workingMemory";

export type HumanCareMode =
  | "normal"
  | "wait_fatigue"
  | "anger"
  | "distrust"
  | "payment_anxiety"
  | "refund_anxiety"
  | "confusion"
  | "repetition_break"
  | "threat_to_leave"
  | "insult_without_disengagement"
  | "decision_hesitation"
  | "no_new_update"
  | "direct_answer_only";

function q(value: string | null | undefined) {
  return normalizeForFingerprint(value);
}

export function detectHumanCareModes(input: { burstText?: string | null; understanding: V4TurnUnderstanding; memory: V4WorkingMemory }): HumanCareMode[] {
  const text = q(input.burstText || input.memory.lastCustomerText);
  const modes = new Set<HumanCareMode>();

  if (input.understanding.customerWantsBrevity || input.memory.prefersBriefReplies) modes.add("direct_answer_only");
  if (input.understanding.customerRejectedPreviousAnswer || input.memory.repetitionSensitivity >= 4) modes.add("repetition_break");
  if (input.understanding.emotion === "angry") modes.add("anger");
  if (input.understanding.emotion === "distrustful" || /(?:نصب|نصاب|حقيقي|مضمون|اثق|اوثق|ثقه|ثقة)/.test(text)) modes.add("distrust");
  if (input.understanding.emotion === "confused" || /(?:مش فاهم|فهمني|شو يعني|يعني كيف)/.test(text)) modes.add("confusion");
  if (/(?:صرلي|صارلي|الي|إلي).{0,12}(?:يوم|ايام|أيام|اسبوع|أسبوع)|(?:طولت|تأخرت|استنيت|انتظرت|زهقت|قرفت)/.test(text)) modes.add("wait_fatigue");

  const paymentSubject = /(?:دفع|ادفع|احول|تحويل|الخمسه|الخمس|رسوم|5|٥)/.test(text);
  const paymentConcern = /(?:اخاف|خايف|تروح|تضيع|عالفاضي|على الفاضي|ما طلعتلي|ما طلعت|ما انقبل|ما انقبلت|ما وافقوا|بدون موافقه|بدون الموافقه)/.test(text);
  if (paymentSubject && paymentConcern) modes.add("payment_anxiety");

  const refundSubject = /(?:استرداد|رجعولي|رجعلي|المصاري|الرسوم)/.test(text);
  const refundConcern = /(?:متى|راحت|ضاعت|بتوصل|ترجع|رجعت|وينها|وينهم)/.test(text);
  if (refundSubject && refundConcern) modes.add("refund_anxiety");

  if (/(?:بروح|اروح|أروح|اشوف|أشوف).{0,25}(?:محل ثاني|غيركم)|(?:بدي الغي|رح الغي|راح الغي).{0,30}(?:اذا|إذا|لو)/.test(text)) modes.add("threat_to_leave");
  if (/(?:يا حمار|غبي|هبل|غباء|قرفتوني|مسخره|مسخرة)/.test(text) && !input.understanding.socialClosure) modes.add("insult_without_disengagement");
  if (/(?:مش عارف|محتار|افكر|أفكر|خليني افكر|خليني أفكر|يمكن اكمل|يمكن أكمل)/.test(text)) modes.add("decision_hesitation");
  if (input.memory.lastAssistantText && input.understanding.currentGoal === input.memory.activeGoal && !input.understanding.topicChanged && input.memory.repetitionSensitivity > 0) modes.add("no_new_update");

  if (!modes.size) modes.add("normal");
  return Array.from(modes);
}

const MODE_DIRECTIVES: Record<HumanCareMode, string[]> = {
  normal: [
    "جاوب كموظف حاضر ومهتم، من غير حشو عاطفي مصطنع.",
  ],
  wait_fatigue: [
    "اعترف بأن طول الانتظار نفسه هو المشكلة، لا تعيد شرح المدة الطبيعية كأن العميل لم ينتظر.",
    "إذا لا يوجد تحديث فعلي، قل ذلك بصراحة وباختصار بدل إعادة قالب الانتظار.",
  ],
  anger: [
    "لا تدافع عن الشركة ولا تلوم العميل. سمِّ سبب الغضب مرة واحدة ثم حل السؤال الحالي.",
    "لا تكرر اعتذارًا عامًا في كل رسالة؛ التعاطف مرة واحدة ثم فعل/جواب.",
  ],
  distrust: [
    "لا تطلب من العميل أن يثق بنا لمجرد الكلام. استخدم حقائق موثقة فقط، واعترف بما هو غير موثق.",
    "تجنب أي ادعاء عن ترخيص أو صفحات أو فروع أو شراكات غير موجود في TruthBundle.",
  ],
  payment_anxiety: [
    "افصل بوضوح بين دفع الرسوم، تأكيد الدفع، والموافقة النهائية. لا توحي أن الدفع يشتري الموافقة.",
    "إذا سأل العميل عن خطر ضياع الرسوم، جاوب مصير الرسوم مباشرة قبل أي شرح إضافي.",
  ],
  refund_anxiety: [
    "فرّق بين طلب الاسترداد المسجل وبين التحويل المنفذ فعليًا. لا تستخدم كلمة تم التحويل قبل receipt موثق.",
    "إذا السؤال نعم/لا عن التبليغ أو الحالة، أجب نعم/لا أولًا.",
  ],
  confusion: [
    "أعد صياغة الفكرة بلغة أبسط من السابق، لا تكرر نفس الكلمات التي سببت الالتباس.",
    "قسّم الجواب إلى نقطة أو نقطتين فقط إذا كان الموضوع متعدد المراحل.",
  ],
  repetition_break: [
    "ممنوع إعادة نفس القالب أو نفس المعلومات التي رفضها العميل؛ أعطِ معلومة جديدة فقط أو صرّح أنه لا يوجد جديد.",
  ],
  threat_to_leave: [
    "لا تضغط على العميل ولا تستخدم لغة احتفاظ تسويقية مصطنعة. أعطه الحقيقة والخيار المتاح باحترام.",
    "إذا كان الإلغاء مجرد شرط مستقبلي فلا تنفذه كطلب إلغاء حالي.",
  ],
  insult_without_disengagement: [
    "تجاهل الإهانة نفسها ولا تعظ العميل بالأدب؛ التقط المشكلة العملية التي وراءها وأجب عليها.",
    "إذا طلب جوابًا مباشرًا، لا تضف عتابًا ولا دفاعًا.",
  ],
  decision_hesitation: [
    "لا تدفع العميل لاتخاذ قرار. لخص له الفرق بين الخيارات والنتيجة العملية لكل خيار فقط.",
  ],
  no_new_update: [
    "إذا لا يوجد تحديث جديد موثق، قل: ما عندي تحديث جديد فعليًا بدل إعادة القصة كاملة.",
  ],
  direct_answer_only: [
    "ابدأ بالجواب نفسه. لا مقدمة تعاطف، لا شرح سياسة، ولا خلفية إلا إذا كانت لازمة لمنع سوء فهم خطير.",
  ],
};

export function humanCareDirectives(input: { burstText?: string | null; understanding: V4TurnUnderstanding; memory: V4WorkingMemory }) {
  const modes = detectHumanCareModes(input);
  const directives = modes.flatMap((mode) => MODE_DIRECTIVES[mode]);
  return {
    modes,
    directives: Array.from(new Set(directives)),
  };
}
