import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { continuationCommercialState } from "./commercialProgression";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSensitiveMutation(turn: InterpretedTurn) {
  return turn.requestedActions.some((action) => [
    "cancel_application",
    "request_refund",
    "stop_refund",
    "reopen_application",
    "change_device",
    "change_application_data",
  ].includes(action));
}

export function directPaymentExecutionQuestion(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q) return false;
  if (/(?:قسط|الاقساط|الأقساط|دفعه\s+اولى|دفعة\s+أولى|تسديد\s+مبكر)/.test(q)
      && !/(?:رسوم\s+فتح\s+الملف|الخمس|الخمسه|5|٥)/.test(q)) return false;

  const direct = /^(?:(?:طيب|تمام|اه|أه)\s+)?(?:(?:هسا|هلا|هلأ|الان|الآن)\s+)?(?:ادفع|أدفع|احول|أحول|بحول|بدفع)(?:\s+(?:هسا|هلا|هلأ|الان|الآن|اليوم|المصاري|المبلغ|الخمس|الخمسه|5|٥|دنانير|دينار))*$/.test(q);
  if (direct) return true;

  return /(?:ادفع|أدفع|احول|أحول|بحول|بدفع).{0,22}(?:هسا|هلا|هلأ|الان|الآن|اليوم).{0,12}$/.test(q)
    && turn.topics.some((topic) => ["payment_fee", "payment_method", "payment_timing", "payment_status", "payment_confirmation"].includes(topic));
}

export function postContinuationProgressQuestion(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q) return false;
  if (/(?:بدي|اريد|أريد|حاب|حابب).{0,18}(?:اكمل|أكمل|استمر)/.test(q)) return false;
  return /(?:كده|هيك|هسا|يعني|طيب).{0,22}(?:الطلب|الملف|الخطوه|الخطوة).{0,24}(?:كمل|كامل|خلص|تم|فتح|مفتوح|ولا|شو\s+ناقص)|(?:الطلب|الملف).{0,24}(?:كمل|خلص|صار\s+كامل|تم\s+فتحه|انفتح).{0,18}(?:ولا|او\s+لا|صح)?|(?:شو|ايش|إيش).{0,16}(?:ضل|ناقص|الخطوه\s+هسا|الخطوة\s+هسا|بعد\s+هيك)|(?:خلصت|تمت).{0,18}(?:خطوه\s+فتح\s+الملف|خطوة\s+فتح\s+الملف)/.test(q);
}

export function conciseStatusQuestion(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q || hasSensitiveMutation(turn)) return false;
  if (/^(?:شو\s+صار|شو\s+صار\s+بالطلب|وين\s+وصل|وين\s+وصل\s+الطلب|تحديث|في\s+تحديث|شو\s+الوضع|شو\s+وضع\s+الطلب|شو\s+وضع\s+طلبي)$/.test(q)) return true;
  if (turn.topics.includes("application_status") && /(?:شو\s+صار|وين\s+وصل|تحديث|معلق|معلّق|طولت|طوّلت|من\s+امبارح|من\s+مبارح|صارلي|الي\s+اكتر|إلي\s+أكثر)/.test(q)) return true;
  return false;
}

export function mediaEnvelopeTurn(turn: InterpretedTurn) {
  const raw = String(turn.rawText || "");
  const q = n(raw);
  const image = /تم\s+استلام\s+صوره\s+من\s+العميل|تم\s+استلام\s+صورة\s+من\s+العميل|صوره\s+من\s+العميل\s+بدون\s+تعليق|صورة\s+من\s+العميل\s+بدون\s+تعليق/.test(q);
  const voice = /تم\s+استلام\s+رساله\s+صوتيه|تم\s+استلام\s+رسالة\s+صوتية|رساله\s+صوتيه\s+من\s+العميل|رسالة\s+صوتية\s+من\s+العميل/.test(q);
  return { image, voice };
}

function delayedStatusText(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  return /(?:طولت|طوّلت|تاخرت|تأخرت|من\s+امبارح|من\s+مبارح|صارلي|اكتر\s+من|أكثر\s+من|معلق|معلّق|\b9[0-9]\s*(?:بال\s*100|٪|%)?)/.test(q)
    || turn.topics.includes("review_timing")
    || turn.topics.includes("operational_pressure");
}

function trackingLine(turn: InterpretedTurn, truth: TruthBundle) {
  const link = buildOfficialLinkContext(turn, truth).relevant.tracking;
  return link ? `\nللمتابعة: ${link}` : "";
}

function receiptLine(turn: InterpretedTurn, truth: TruthBundle) {
  const synthetic: InterpretedTurn = {
    ...turn,
    topics: Array.from(new Set([...turn.topics, "payment_fee", "payment_method", "receipt_upload", "continuation"])) as InterpretedTurn["topics"],
  };
  const link = buildOfficialLinkContext(synthetic, truth).relevant.receipt;
  return link ? `\nبعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${link}` : "";
}

function paymentNowReply(turn: InterpretedTurn, truth: TruthBundle) {
  const app = truth.application;
  const stage = applicationJourneyStage(app);
  const commercial = continuationCommercialState(app);
  if (!app) return null;

  if (commercial === "already_paid" || stage === "payment_confirmed_under_review") {
    return "الدفع مؤكد إداريًا على طلبك، فما في داعي تدفع 5 دنانير مرة ثانية. الملف مكمل بالدراسة الحالية.";
  }
  if (commercial === "payment_pending_admin" || stage === "payment_proof_pending_admin") {
    return "وصل الدفع موجود على الملف وبانتظار اعتماد الإدارة، فما في داعي تدفع أو ترفع الوصل مرة ثانية.";
  }
  if (commercial === "payment_ready" || stage === "continuation_confirmed_fee_due") {
    return `نعم، هسا بتقدر تدفع رسوم فتح الملف 5 دنانير. ${truth.policy.paymentMethodRule}${receiptLine(turn, truth)}\nالقسط الأول مش مطلوب الآن؛ بيستحق بعد شهر من استلام الجهاز وتوقيع العقد.`;
  }
  if (stage === "preliminary_approved_waiting_decision") {
    return "الموافقة الحالية مبدئية. رسوم فتح الملف 5 دنانير بتصير بعد ما تختار الاستمرار؛ قبل ما أعطيك بيانات التحويل لازم يكون قرار الاستمرار مسجل على الطلب.";
  }
  return null;
}

function progressReply(turn: InterpretedTurn, truth: TruthBundle) {
  const app = truth.application;
  if (!app) return null;
  const stage = applicationJourneyStage(app);
  const track = trackingLine(turn, truth);
  if (stage === "continuation_confirmed_fee_due") {
    const receipt = receiptLine(turn, truth);
    return `اختيار الاستمرار مسجل، بس الملف لسا ما دخل الدراسة النهائية. الخطوة الحالية دفع رسوم فتح الملف 5 دنانير ورفع الوصل الرسمي؛ بعد اعتماد الدفع تبدأ الدراسة النهائية.${receipt}`;
  }
  if (stage === "payment_proof_pending_admin") return `وصل الدفع موجود على الملف وبانتظار اعتماد الإدارة. ما في عليك دفع أو رفع جديد هسا؛ بعد الاعتماد بكمل الملف للدراسة النهائية.${track}`;
  if (stage === "payment_confirmed_under_review") return `آه، خطوة فتح الملف مكتملة والدفع مؤكد إداريًا. طلبك هسا قيد الدراسة النهائية، وما في عليك خطوة مالية ثانية.${track}`;
  if (stage === "preliminary_approved_waiting_decision") return `الطلب أخذ موافقة مبدئية، بس لسا ما انتقل للدراسة النهائية. إذا بدك تكمل، لازم تسجل اختيار الاستمرار أولًا.`;
  if (stage === "preliminary_review") return `الطلب لسا بالمراجعة المبدئية، يعني ما وصل لمرحلة فتح الملف أو الدراسة النهائية بعد.${track}`;
  return `حالة طلبك الآن: ${customerFacingStatusLabel(app)}.${track}`;
}

function statusReply(turn: InterpretedTurn, truth: TruthBundle) {
  const app = truth.application;
  if (!app) return null;
  const stage = applicationJourneyStage(app);
  const track = trackingLine(turn, truth);
  const delayed = delayedStatusText(turn);
  const window = truth.policy.normalReviewWindow || "من يومين لـ3 أيام عمل";

  if (stage === "preliminary_review") {
    return `طلبك${app.trackingId ? ` ${app.trackingId}` : ""} لسا قيد المراجعة المبدئية.${delayed ? ` ${window}، وحاليًا في ضغط مراجعات شديد وقد تتأخر بعض الملفات أكثر من المعدل. ما عندي موعد مؤكد أقدر أوعدك فيه.` : ""}${track}`;
  }
  if (stage === "preliminary_approved_waiting_decision") {
    return `طلبك أخذ موافقة مبدئية، ولسا مش موافقة نهائية. إذا بدك تكمل، الخطوة التالية تسجيل الاستمرار ثم فتح الملف للدراسة النهائية.${track}`;
  }
  if (stage === "continuation_confirmed_fee_due") {
    return `اختيار الاستمرار مسجل على طلبك، والخطوة الحالية فتح الملف. المطلوب 5 دنانير رسوم فتح الملف ثم رفع الوصل الرسمي؛ بعد اعتماد الدفع تبدأ الدراسة النهائية.${track}`;
  }
  if (stage === "payment_proof_pending_admin") {
    return `وصل الدفع موجود على الملف وبانتظار اعتماد الإدارة. ما في داعي تدفع أو ترفع الوصل مرة ثانية.${track}`;
  }
  if (stage === "payment_confirmed_under_review") {
    return `طلبك لسا قيد الدراسة النهائية، والدفع مؤكد إداريًا وما في عليك خطوة مالية الآن.${delayed ? ` ${window}، لكن ضغط المراجعات الحالي مأخر بعض الملفات أكثر من المعتاد، وما عندي موعد نهائي مؤكد.` : ""}${track}`;
  }
  if (stage === "cancelled") return `طلبك ملغي حسب الحالة الحالية.${track}`;
  if (stage === "refund_requested") return `طلبك ملغي وطلب الاسترداد مسجل وقيد المعالجة.${track}`;
  if (stage === "refund_completed") return `طلبك ملغي والاسترداد مكتمل حسب الحالة الحالية.${track}`;
  return `حالة طلبك الآن: ${customerFacingStatusLabel(app)}.${track}`;
}

function mediaReply(turn: InterpretedTurn, truth: TruthBundle) {
  const media = mediaEnvelopeTurn(turn);
  if (!media.image && !media.voice) return null;
  if (media.voice) return "وصلتني الرسالة الصوتية، بس ما قدرت أسمعها بشكل واضح. اكتبلي النقطة اللي بدك تسأل عنها وبجاوبك مباشرة.";

  const app = truth.application;
  if (!app) return "وصلت الصورة. إذا هي لتوضيح مشكلة أو سؤال، اكتبلي باختصار شو بدك أتأكد منه منها وبمشي معك مباشرة.";
  const stage = applicationJourneyStage(app);
  if (stage === "payment_confirmed_under_review") {
    return "وصلت الصورة. إذا هي وصل دفع، الدفع عندك مؤكد إداريًا أصلًا وما في داعي تعيد رفعه. وإذا الصورة لموضوع ثاني بالطلب، اكتبلي شو بدك أتأكد منه.";
  }
  if (stage === "payment_proof_pending_admin") {
    return "وصلت الصورة. وصل الدفع الرسمي موجود على الملف وبانتظار اعتماد الإدارة، فما في داعي تعيد إرساله على واتساب.";
  }
  if (stage === "continuation_confirmed_fee_due") {
    const receipt = receiptLine(turn, truth);
    return `وصلت الصورة. إذا هي وصل دفع، صورة واتساب ما بنعتمدها كرفع رسمي؛ لازم الوصل ينرفع من الرابط الآمن المرتبط بطلبك.${receipt}`;
  }
  return "وصلت الصورة. إذا هي هوية أو إثبات دخل أو أي مستند حساس، ما بنعتمدها من واتساب وبتنرفع فقط من الرابط الرسمي الآمن. وإذا الصورة لتوضيح مشكلة بالموقع، اكتبلي شو ظاهر فيها وبساعدك من نفس السياق.";
}

export function buildCurrentQuestionAnswerContractReply(input: {
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
}) {
  if (hasSensitiveMutation(input.turn)) return null;
  const media = mediaReply(input.turn, input.truth);
  if (media) return media;
  if (directPaymentExecutionQuestion(input.turn)) return paymentNowReply(input.turn, input.truth);
  if (postContinuationProgressQuestion(input.turn)) return progressReply(input.turn, input.truth);
  if (conciseStatusQuestion(input.turn)) return statusReply(input.turn, input.truth);
  return null;
}

export function replyViolatesCurrentQuestionAnswerContract(input: {
  turn: InterpretedTurn;
  truth: TruthBundle;
  reply: string | null | undefined;
}) {
  const reply = n(input.reply);
  if (!reply) return false;
  const continuationBoilerplate = /(?:(?:رغبتك|اختيارك)\s+بالاستمرار|اختيار\s+الاستمرار)\s+مسجل.{0,80}(?:ما\s+في\s+داعي|جاوبني\s+بالنقطه|جاوبني\s+بالنقطة)/.test(reply);
  const missingDetails = /(?:تفاصيل\s+الطلب).{0,30}(?:مش|مو|غير).{0,20}(?:كامله|كاملة|مكتمله|مكتملة)|ما\s+عندي\s+طلب\s+موثوق/.test(reply);

  if (directPaymentExecutionQuestion(input.turn)) {
    const stage = applicationJourneyStage(input.truth.application);
    if (continuationBoilerplate || missingDetails) return true;
    if (stage === "continuation_confirmed_fee_due" && !/(?:5|٥|رسوم\s+فتح\s+الملف|الدفع\s+مؤكد|وصل\s+الدفع)/.test(reply)) return true;
  }
  if (postContinuationProgressQuestion(input.turn) && (continuationBoilerplate || missingDetails)) return true;
  if (conciseStatusQuestion(input.turn) && (continuationBoilerplate || missingDetails)) return true;
  const media = mediaEnvelopeTurn(input.turn);
  if ((media.image || media.voice) && missingDetails) return true;
  if (media.voice && /قدرتش|سمعتش|فهمتش/.test(reply)) return true;
  return false;
}
