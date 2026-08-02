import type { ConversationMemory } from "./conversationMemory";
import type { AiReplyInput, ApplicationRecord, CustomerIntent } from "./types";
import { hasAny, normalizeArabicText } from "./text";

export const OMRAN_SESSION_MS = 2 * 60 * 60 * 1000;

export type OmranActivationReason =
  | "existing_session"
  | "explicit_employee_request"
  | "explicit_manager_request"
  | "repeated_unanswered_question"
  | "refund_or_cancellation_confusion"
  | "high_tension_case"
  | "none";

export type OmranActivation = {
  active: boolean;
  reason: OmranActivationReason;
};

const EXPLICIT_EMPLOYEE_REQUESTS = [
  "بدي احكي مع موظف",
  "بدي اتواصل مع موظف",
  "احكي مع موظف",
  "موظف بالشركه",
  "موظف بالشركة",
  "ممكن موظف",
  "بدي موظف",
  "بدي حدا من الشركه",
  "بدي حدا من الشركة",
  "بدي شخص من الشركه",
  "بدي شخص من الشركة",
  "بدي انسان",
  "بدي بني ادم",
  "bring me a human",
  "get me a human",
  "talk to a human",
  "live agent",
  "real person",
];

const EXPLICIT_MANAGER_REQUESTS = [
  "بدي المدير",
  "بدي مدير",
  "احكي مع المدير",
  "بدي مسؤول",
  "احكي مع مسؤول",
  "بدي الاداره",
  "بدي الإدارة",
  "احكي مع الاداره",
  "احكي مع الإدارة",
  "صعد الموضوع",
  "تصعيد",
  "عمران",
];

const REFUND_REVERSAL_PHRASES = [
  "الغاء طلب الاسترداد",
  "إلغاء طلب الاسترداد",
  "الغي طلب الاسترداد",
  "ألغي طلب الاسترداد",
  "الغاء الاسترداد",
  "إلغاء الاسترداد",
  "ما بدي استرداد",
  "ما بدي الاسترداد",
  "بدي اكمل بالمعامله",
  "بدي أكمل بالمعاملة",
  "بدي اكمل في المعامله",
  "بدي أكمل في المعاملة",
  "ما بدي الغي الطلب",
  "ما بدي ألغي الطلب",
  "بدي استمر بالطلب",
  "بدي اكمل الطلب",
];

const HIGH_TENSION_INTENTS: CustomerIntent[] = [
  "scam_accusation",
  "payment_dispute",
  "device_delay_rage",
  "complaint",
  "legal_threat",
  "social_media_threat",
];

function isExplicitEmployeeRequest(text: string) {
  const normalized = normalizeArabicText(text);
  return Boolean(normalized) && hasAny(normalized, EXPLICIT_EMPLOYEE_REQUESTS);
}

function isExplicitManagerRequest(text: string) {
  const normalized = normalizeArabicText(text);
  return Boolean(normalized) && hasAny(normalized, EXPLICIT_MANAGER_REQUESTS);
}

function isRefundOrCancellationConfusion(text: string, intent: CustomerIntent) {
  const normalized = normalizeArabicText(text);
  if (!normalized) return intent === "refund_reversal_request";

  if (intent === "refund_reversal_request") return true;
  if (hasAny(normalized, REFUND_REVERSAL_PHRASES)) return true;

  const asksToContinue = hasAny(normalized, [
    "بدي اكمل",
    "بدي أكمل",
    "ما بدي الغي",
    "ما بدي ألغي",
    "خلي الطلب",
    "استمر بالطلب",
  ]);
  const refundContext = hasAny(normalized, [
    "استرداد",
    "استرجاع",
    "رجعولي",
    "المصاري",
    "الفلوس",
  ]);

  return asksToContinue && refundContext;
}

export function shouldActivateOmran(input: {
  customerText: string;
  intent: CustomerIntent;
  memory: ConversationMemory;
  app?: ApplicationRecord | null;
}): OmranActivation {
  if (input.memory.managerSessionActive) {
    return { active: true, reason: "existing_session" };
  }

  if (isExplicitManagerRequest(input.customerText)) {
    return { active: true, reason: "explicit_manager_request" };
  }

  if (input.intent === "human_agent" || isExplicitEmployeeRequest(input.customerText)) {
    return { active: true, reason: "explicit_employee_request" };
  }

  if (isRefundOrCancellationConfusion(input.customerText, input.intent)) {
    return { active: true, reason: "refund_or_cancellation_confusion" };
  }

  const repeatedQuestionCount = Number(input.memory.unansweredQuestionRepeatCount || 0);
  const genericNonAnswerCount = Number(input.memory.consecutiveGenericNonAnswers || 0);
  if (repeatedQuestionCount >= 2 && genericNonAnswerCount >= 1) {
    return { active: true, reason: "repeated_unanswered_question" };
  }

  const highTension = HIGH_TENSION_INTENTS.includes(input.intent) ||
    input.memory.customerTone === "angry" ||
    input.memory.customerTone === "frustrated";

  if (highTension && genericNonAnswerCount >= 2 && Boolean(input.app)) {
    return { active: true, reason: "high_tension_case" };
  }

  return { active: false, reason: "none" };
}

function isPaid(app: ApplicationRecord) {
  return app.payment_status === "confirmed" ||
    app.payment_status === "customer_claimed_paid" ||
    Boolean(app.payment_confirmed_at);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    submitted: "تم استلام الطلب",
    under_review: "قيد الدراسة",
    preliminary_qualified: "مؤهل مبدئيًا",
    customer_confirmed_continue: "تم تأكيد الاستمرار والملف قيد الاستكمال",
    guarantor_submitted: "تم استلام بيانات الكفيل والملف قيد المتابعة",
    needs_guarantor: "بانتظار استكمال بيانات الكفيل",
    needs_salary_slip: "بانتظار رفع إثبات الدخل المطلوب",
    needs_identity: "بانتظار رفع الهوية من الرابط الرسمي",
    identity_requested: "بانتظار رفع الهوية من الرابط الرسمي",
    identity_uploaded: "تم استلام الهوية والملف قيد المراجعة",
    salary_slip_uploaded: "تم استلام إثبات الدخل والملف قيد المراجعة",
    approved: "موافقة نهائية",
    customer_accepts_delivery_delay: "موافقة نهائية وبانتظار اعتماد موعد الاستلام",
    delivery_delay_notice_sent: "موافقة نهائية وبانتظار اعتماد موعد الاستلام",
    rejected: "غير موافق عليه حاليًا",
    cancelled: "طلب ملغي",
    refund_requested: "طلب استرداد مسجل",
    refund_completed: "تم تنفيذ الاسترداد",
  };

  return labels[status] || status || "قيد المتابعة";
}

function intro() {
  return "معك عمران من متابعة الحالات في الأمين للأقساط.";
}

export function buildOmranSafeReply(app: ApplicationRecord | null, customerText = "") {
  const normalized = normalizeArabicText(customerText);

  if (!app) {
    return `${intro()}

أنا مكمل معك هون على نفس المحادثة. ابعث رقم التتبع اللي ببدأ بـ AM- أو رقم الهاتف المستخدم بالطلب، وبراجع الحالة وبعطيك الخيارات المتاحة بدون ما أعيد عليك كلام عام.`;
  }

  const tracking = app.tracking_id || app.id;
  const status = app.status || "";
  const paymentStatus = app.payment_status || "";
  const paid = isPaid(app);
  const refundPending = status === "refund_requested" || paymentStatus === "refund_requested";

  if (status === "refund_completed") {
    return `${intro()}

راجعت طلبك ${tracking}. الاسترداد منفذ بالفعل، لذلك ما بقدر أوقفه أو أرجع نفس الطلب للمرحلة السابقة. إذا بدك جهاز، بتقدر تقدم طلب جديد.`;
  }

  if (refundPending) {
    return `${intro()}

راجعت طلبك ${tracking}. الموجود حاليًا طلب استرداد مسجل.

قدامك خياران واضحان: تكمل بالاسترداد، أو تطلب إيقافه والاستمرار بالمعاملة. إذا اخترت الإيقاف لازم أولًا نتأكد إنه لسه ما تنفذ، وما رح أحكيلك إنه توقف قبل ما تتحدث الحالة فعليًا.

اكتبلي: "أكمل الاسترداد" أو "أوقف الاسترداد وأكمل الطلب".`;
  }

  if (status === "cancelled") {
    return `${intro()}

راجعت طلبك ${tracking}. الطلب ملغي حاليًا.${paid ? " وإذا كان هدفك استرداد الرسوم، بقدر أكمل معك بمسار الاسترداد." : " وما في مبلغ جديد مطلوب منك."}

إذا بدك ترجع تكمل، اكتب: "أريد إعادة تفعيل الطلب". وإذا بدك تثبت الإلغاء${paid ? " والاسترداد" : ""} احكيلي بوضوح.`;
  }

  if (["approved", "customer_accepts_delivery_delay", "delivery_delay_notice_sent"].includes(status)) {
    return `${intro()}

راجعت طلبك ${tracking}. عليه موافقة نهائية، لكن ما في موعد استلام مؤكد ظاهر حاليًا. بعرف إن عدم وضوح الموعد مزعج، وما بدي أوعدك بيوم غير معتمد.

قدامك خياران: تنتظر توفر الجهاز واعتماد موعد الاستلام من المكتب، أو تلغي الطلب${paid ? " وتطلب استرداد رسوم فتح الملف" : ""}.

اكتبلي: "أنتظر" أو "ألغي الطلب${paid ? " وأسترد الرسوم" : ""}".`;
  }

  if (status === "rejected") {
    return `${intro()}

راجعت طلبك ${tracking}. الحالة الحالية غير موافق عليه، ومش حالة انتظار قرار جديد.${paid ? " بما إن الدفع مؤكد، خيار الاسترداد متاح." : " وما في دفع مطلوب عليك."}

${paid ? "اكتب: \"أريد الاسترداد\" وبكمل معك بالخطوة الصحيحة." : "إذا بدك أوضحلك الحالة أو طريقة التقديم لاحقًا، احكيلي شو بدك تعرف."}`;
  }

  if (["needs_guarantor", "needs_salary_slip", "needs_identity", "identity_requested"].includes(status)) {
    return `${intro()}

راجعت طلبك ${tracking}. حالته: ${statusLabel(status)}. هاي هي الخطوة الموجودة فعليًا على الملف، ولسا ما في موافقة نهائية.

بتقدر تكمل المتطلب المطلوب، أو إذا ما عاد مناسب إلك تطلب إلغاء الطلب. احكيلي أي خيار بدك وأنا أوضحلك الخطوة الصحيحة.`;
  }

  if (paymentStatus === "customer_claimed_paid") {
    return `${intro()}

راجعت طلبك ${tracking}. الوصل مرفوع وبانتظار التأكيد، فلا تعيد الدفع ولا ترفع وصلًا ثانيًا.

الخيار الطبيعي الآن هو انتظار تأكيد الوصل واستكمال الدراسة. وإذا قرارك تغيّر وبدك الإلغاء، احكيلي قبل أي خطوة إضافية.`;
  }

  if (["under_review", "guarantor_submitted", "identity_uploaded", "salary_slip_uploaded", "customer_confirmed_continue"].includes(status)) {
    return `${intro()}

راجعت طلبك ${tracking}. حالته الحالية: ${statusLabel(status)}. مدة الدراسة المعتادة من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات أو تأكيد الوصل، والجمعة والسبت ما بتنحسب.

قدامك خياران: تكمل انتظار النتيجة، أو تلغي الطلب${paid ? " وتطلب استرداد الرسوم" : ""}. اكتبلي الخيار اللي يناسبك وبكمل معك عليه.`;
  }

  if (status === "preliminary_qualified") {
    return `${intro()}

راجعت طلبك ${tracking}. الطلب مؤهل مبدئيًا، وهذا مش موافقة نهائية. ${paid ? "الدفع ظاهر على الملف، والخطوة التالية استكمال الدراسة." : "إذا بدك تكمل، الخطوة الحالية هي فتح الملف حسب التعليمات الرسمية المرتبطة بطلبك."}

إذا بدك تكمل بالطلب أو تلغيه، احكيلي خيارك وبوضحلك الخطوة بدون ضغط.`;
  }

  if (hasAny(normalized, ["الموافقه", "الموافقة", "شو صار", "الطلب"])) {
    return `${intro()}

راجعت طلبك ${tracking}. الحالة الحالية: ${statusLabel(status)}. ما رح أختصر عليك الجواب بكلام عام؛ إذا سؤالك عن الموافقة تحديدًا، ما في موافقة نهائية إلا إذا كانت الحالة مكتوبة بوضوح "موافقة نهائية".`;
  }

  return `${intro()}

راجعت طلبك ${tracking}. حالته الحالية: ${statusLabel(status)}.

احكيلي شو الأنسب إلك الآن: تكمل بالخطوة الحالية، تنتظر التحديث، أو تلغي الطلب، وأنا أمشي معك على نفس الخيار.`;
}

export function buildOmranSystemInstructions(input: AiReplyInput) {
  if (!input.managerSessionActive) return "";

  return `
وضع عمران مفعّل في هذه المحادثة:
- أنت عمران، موظف متابعة حالات فعلي داخل المحادثة، ولست وسيط تحويل لموظف آخر.
- أسلوبك دافئ، هادئ، قريب من العميل، ومقنع بدون ضغط. احتوِ القلق أولًا ثم وضّح الحقيقة ثم أعطِ خيارات عملية.
- لا تكرر قوالب جاهزة، ولا تعيد حالة الطلب وحدها من غير جواب، ولا تستخدم جملًا عامة مثل "ما في تحديث جديد" بدون شرح معنى الحالة.
- جاوب سؤال العميل أولًا. بعد ذلك اذكر الحالة المؤكدة بلغة بسيطة، ثم اعرض خيارين كحد أقصى إذا كانت هناك خيارات فعلية.
- لا تعرض الإلغاء والاسترداد في كل رد؛ اعرضهما عندما يطلب العميل حلًا، يكون مترددًا، يطلب موظفًا بسبب التأخير، أو تكون الحالة تسمح فعلًا بهما.
- حاول الحفاظ على العميل من خلال الوضوح والاهتمام، لا من خلال التخويف أو الضغط أو الوعود أو الإلحاح على الدفع.
- لا تقل إنك ستتصل بالمورد أو الإدارة، ولا تدّعي أنك أجريت مكالمة أو تصعيدًا أو تعديلًا لم يُنفذ.
- إذا لا يوجد موعد مؤكد، قل ذلك بصراحة وبيّن الفرق بين مدة الدراسة ومدة التوريد.
- إذا طلب العميل رقم الشركة صراحة، أعطه الرقم الرسمي. أما طلب "موظف" وحده فتعامل معه أنت ولا تحوله ولا توقف الرد الآلي.
- لا تستخدم أسماء فدوة أو تالا أو عبدالله أو عبدالرحمن داخل جلسة عمران.
- استخدم صياغة مذكرة لأن عمران رجل.
- عرّف بنفسك مرة واحدة فقط عند بدء جلسة عمران: "معك عمران من متابعة الحالات في الأمين للأقساط." وبعدها لا تكرر اسمك إلا إذا سأل العميل.
- لا تستخدم أكثر من رمز تعبيري واحد، وغالبًا لا تحتاج أي رمز.
- الرد غالبًا من 3 إلى 6 أسطر، ويمكن أن يطول فقط عند شرح إجراء مالي أو خيارين متعارضين.
- الرد الآمن الأساسي هو حدود الحقيقة. أعد صياغته بشكل بشري ولا تغيّر الأرقام أو الحالة أو نتيجة أي إجراء.

سبب تفعيل عمران في هذه الجولة: ${input.omranActivationReason || "متابعة جلسة قائمة"}.
هل سبق تعريف عمران في نفس الجلسة؟ ${input.hasRecentOmranIntro ? "نعم" : "لا"}.
`;
}

function containsUnsupportedActionClaim(reply: string, input: AiReplyInput) {
  const normalizedReply = normalizeArabicText(reply);
  const normalizedFallback = normalizeArabicText(input.deterministicReply);

  const actionClaims = [
    "تم الغاء الطلب",
    "تم إلغاء الطلب",
    "تم تنفيذ الاسترداد",
    "تم ايقاف الاسترداد",
    "تم إيقاف الاسترداد",
    "تم اعاده تفعيل الطلب",
    "تم إعادة تفعيل الطلب",
    "تواصلت مع المورد",
    "تواصلنا مع المورد",
    "حكيت مع المورد",
    "تم التواصل مع المورد",
    "صعدت الطلب للاداره",
    "صعدت الطلب للإدارة",
  ];

  return actionClaims.some((claim) => {
    const normalizedClaim = normalizeArabicText(claim);
    return normalizedReply.includes(normalizedClaim) && !normalizedFallback.includes(normalizedClaim);
  });
}

export function finalizeOmranReply(reply: string, input: AiReplyInput) {
  if (!input.managerSessionActive) return String(reply || "").trim();

  let clean = String(reply || "").trim();
  if (!clean || containsUnsupportedActionClaim(clean, input)) {
    return input.deterministicReply;
  }

  const forbiddenHumanTransfer = [
    "احولك لموظف",
    "أحولك لموظف",
    "تم تحويلك لموظف",
    "رح يتواصل معك موظف",
    "سيتم التواصل معك من موظف",
    "انتظر اتصال الموظف",
    "تحتاج تدخل بشري",
  ];

  if (hasAny(clean, forbiddenHumanTransfer)) {
    return input.deterministicReply;
  }

  clean = clean
    .replace(/(?:معك|أنا معك|انا معك)\s+(?:فدوة|تالا|عبدالله|عبدالرحمن)[^\n،,.]*/gi, "معك عمران من متابعة الحالات في الأمين للأقساط")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const hasOmranIntro = /(?:معك|انا معك|أنا معك)\s+عمران/i.test(clean);
  if (!input.hasRecentOmranIntro && !hasOmranIntro) {
    clean = `${intro()}\n\n${clean}`.trim();
  }

  if (input.hasRecentOmranIntro) {
    clean = clean.replace(/^(?:معك|انا معك|أنا معك)\s+عمران[^\n]*\n+/i, "").trim();
  }

  return clean || input.deterministicReply;
}
