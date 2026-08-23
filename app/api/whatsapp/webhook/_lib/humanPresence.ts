import type { CustomerIntent } from "./types";
import { normalizeArabicText } from "./text";

export type HumanEmotion =
  | "calm"
  | "confused"
  | "anxious"
  | "impatient"
  | "disappointed"
  | "angry"
  | "insulting"
  | "distrustful"
  | "complaint"
  | "public_escalation";

export type HumanPresenceProfile = {
  emotion: HumanEmotion;
  firmness: 0 | 1 | 2 | 3 | 4;
  needsAcknowledgement: boolean;
  isTinyContextFollowup: boolean;
  wantsCandidExplanation: boolean;
  publicEscalation: boolean;
  explicitComplaint: boolean;
};

export type OperationalTransparencyFacts = {
  advancedReviewBacklog: boolean;
  supplierDevicePressure: boolean;
  portfolioPaymentPressure: boolean;
};

function n(value: string) {
  return normalizeArabicText(String(value || "")).replace(/\s+/g, " ").trim();
}

function hasAny(value: string, needles: string[]) {
  const text = n(value);
  return needles.some((needle) => text.includes(n(needle)));
}

function envFlag(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  return !["0", "false", "off", "no", "disabled"].includes(String(raw).trim().toLowerCase());
}

export function currentOperationalTransparencyFacts(): OperationalTransparencyFacts {
  // V1.6.0: these defaults reflect the currently approved operational picture.
  // They can be disabled in Vercel without a code change if the operating situation changes.
  return {
    advancedReviewBacklog: envFlag("ALAMEEN_ADVANCED_REVIEW_BACKLOG_ACTIVE", true),
    supplierDevicePressure: envFlag("ALAMEEN_SUPPLIER_DEVICE_PRESSURE_ACTIVE", true),
    portfolioPaymentPressure: envFlag("ALAMEEN_PORTFOLIO_PAYMENT_PRESSURE_ACTIVE", true),
  };
}

export function detectHumanPresenceProfile(input: {
  customerText: string;
  lastCustomerMessages?: string[];
  lastAssistantReplies?: string[];
}): HumanPresenceProfile {
  const current = n(input.customerText);
  const recent = n([...(input.lastCustomerMessages || []).slice(-4), current].join(" "));

  const publicEscalation = hasAny(current, [
    "بنشر", "رح انشر", "راح انشر", "بفضح", "افضح", "فيسبوك", "فيس بوك",
    "سوشال", "صفحه عندي", "صفحة عندي", "متابع", "بحذر الناس", "احذر الناس",
  ]);
  const insulting = hasAny(current, [
    "يا نصابين", "نصابين", "حراميه", "حرامية", "كذابين", "بتتخوثو", "بتتخوثوا",
    "عقلي خرا", "وسخ", "زباله", "زبالة",
  ]);
  const distrustful = hasAny(current, [
    "نصب", "احتيال", "سرقه", "سرقة", "مش واثق", "ما بثق", "كذب", "نصاب",
  ]);
  const angry = insulting || hasAny(current, [
    "زهقت", "قرفت", "طفح الكيل", "معكم ساعتين",
    "ما في احترام", "عدم احترام", "مماطله", "مماطلة",
  ]);
  const explicitComplaint = hasAny(current, [
    "شكوى", "بشتكي", "اشتكي", "جرائم الكترونيه", "جرائم إلكترونية",
    "حمايه المستهلك", "حماية المستهلك", "محامي", "شرطه", "شرطة",
    "تاخير", "تأخير", "ما بتردو", "ما بتردوا",
  ]);
  const disappointed = hasAny(recent, [
    "صارلي", "منتظر", "تعبت", "محرج", "خيبتو", "خيبتوا", "وعدت", "استنيت",
  ]);
  const anxious = hasAny(current, [
    "خايف", "قلقان", "قلق", "شو صار", "وين وصل", "طمني", "طمّني",
  ]);
  const confused = hasAny(current, [
    "مش فاهم", "ما فهمت", "كيف يعني", "شو يعني", "يعني؟",
  ]);
  const impatient = hasAny(current, [
    "قديش كمان", "متى", "امتى", "إمتى", "لسا", "بكره", "بكرة", "اليوم",
  ]);
  const wantsCandidExplanation = hasAny(current, [
    "ليش التاخير", "ليش التأخير", "شو سبب التاخير", "شو سبب التأخير",
    "احكولي بصراحه", "احكولي بصراحة", "احكيلي بصراحه", "احكيلي بصراحة",
    "شو المشكله", "شو المشكلة", "شو اللي ماخر", "شو اللي مأخر",
    "ليش مطولين", "ليش طولتو", "ليش طولتوا",
  ]);
  const isTinyContextFollowup =
    current.length > 0 &&
    current.length <= 34 &&
    hasAny(current, [
      "طيب", "وبكره", "وبكرة", "بكره", "بكرة", "لسا", "يعني", "وبعدين",
      "بعدها", "قديش", "الخمس", "شو صار", "هسا", "هلأ", "والاستلام",
    ]);

  let emotion: HumanEmotion = "calm";
  let firmness: 0 | 1 | 2 | 3 | 4 = 0;

  if (publicEscalation) {
    emotion = "public_escalation";
    firmness = 4;
  } else if (insulting) {
    emotion = "insulting";
    firmness = 3;
  } else if (distrustful) {
    emotion = "distrustful";
    firmness = 2;
  } else if (angry) {
    emotion = "angry";
    firmness = 2;
  } else if (explicitComplaint) {
    emotion = "complaint";
    firmness = 1;
  } else if (disappointed) {
    emotion = "disappointed";
    firmness = 1;
  } else if (anxious) {
    emotion = "anxious";
    firmness = 1;
  } else if (confused) {
    emotion = "confused";
    firmness = 0;
  } else if (impatient) {
    emotion = "impatient";
    firmness = 1;
  }

  return {
    emotion,
    firmness,
    needsAcknowledgement: emotion !== "calm" && emotion !== "confused",
    isTinyContextFollowup,
    wantsCandidExplanation,
    publicEscalation,
    explicitComplaint,
  };
}

export function contextualHumanIntentHint(input: {
  customerText: string;
  currentIntent: CustomerIntent;
  lastCustomerMessages?: string[];
  lastAssistantReplies?: string[];
}): CustomerIntent | null {
  const current = n(input.customerText);
  if (!current || current.length > 44) return null;

  const recent = n([
    ...(input.lastCustomerMessages || []).slice(-5),
    ...(input.lastAssistantReplies || []).slice(-5),
  ].join(" "));

  // V1.6.0 REFERENT RECOVERY: a short "how long is it valid?" follow-up after
  // payment instructions is about the payment step, not the installment term.
  if (
    String(input.currentIntent) === "installment_info" &&
    hasAny(current, ["كم مده فعاليتها", "كم مدة فعاليتها", "مده فعاليتها", "مدة فعاليتها", "قديش فعاليتها", "كم بتضل", "كم بظل"]) &&
    hasAny(recent, ["5 دنانير", "٥ دنانير", "رسوم فتح الملف", "تعليمات الدفع", "ameeenpay", "amenpay", "رفع الوصل", "وصل الدفع"])
  ) {
    return "payment_timing" as CustomerIntent;
  }

  if (String(input.currentIntent) !== "unknown") return null;

  if (hasAny(recent, ["استرداد", "استرجاع", "رجعولي", "فلوسي", "الخمس ليرات", "الحواله", "الحوالة"])) {
    if (hasAny(current, ["الخمس", "فلوس", "مصاري", "متى", "وين", "لسا", "اليوم", "بكره", "بكرة", "هسا", "هلأ"])) {
      return "refund" as CustomerIntent;
    }
  }

  if (hasAny(recent, ["مدة الدراسه", "مدة الدراسة", "يومين", "3 ايام", "3 أيام", "قيد الدراسه", "قيد الدراسة", "الموافقه", "الموافقة"])) {
    if (hasAny(current, ["وبكره", "وبكرة", "بكره", "بكرة", "لسا", "قديش", "يعني", "شو صار", "هسا", "هلأ"])) {
      return "review_time" as CustomerIntent;
    }
  }

  if (hasAny(recent, ["استلام", "تسليم", "الجهاز", "التلفون", "توريد", "المورد"])) {
    if (hasAny(current, ["وبكره", "وبكرة", "بكره", "بكرة", "متى", "استلم", "والاستلام", "لسا"])) {
      return "delivery" as CustomerIntent;
    }
  }

  if (hasAny(recent, ["كم شهر", "مدة التقسيط", "مده التقسيط", "القسط", "الاقساط", "الأقساط"])) {
    if (hasAny(current, ["قديش", "كم", "مده", "مدة", "شهر", "فعاليتها"])) {
      return "installment_info" as CustomerIntent;
    }
  }

  if (hasAny(recent, ["وصل الدفع", "رفع الوصل", "رسوم فتح الملف", "الدفع", "تحويل"])) {
    if (hasAny(current, ["وبعدين", "بعدها", "شو بصير", "متى", "لسا", "شو صار"])) {
      return "payment_next_step" as CustomerIntent;
    }
  }

  return null;
}

export function shouldExplainOperationalPicture(customerText: string) {
  return detectHumanPresenceProfile({ customerText }).wantsCandidExplanation;
}

function pick<T>(seed: string, values: T[]): T {
  let hash = 2166136261;
  for (const char of String(seed || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return values[Math.abs(hash) % values.length];
}

export function buildOperationalTransparencyParagraph(input: {
  seed: string;
  customerSpecificApproved: boolean;
  statusLine?: string | null;
  facts?: OperationalTransparencyFacts;
}) {
  const facts = input.facts || currentOperationalTransparencyFacts();
  const pieces: string[] = [];

  if (input.customerSpecificApproved && facts.supplierDevicePressure) {
    pieces.push(pick(input.seed, [
      "وبالنسبة لطلبك تحديدًا، الموافقة النهائية موجودة؛ التأخير الحالي صار بمرحلة توفير الجهاز وترتيب التوريد من الوكلاء.",
      "طلبك نفسه عليه موافقة نهائية، والانتظار حاليًا مرتبط بتوفر الجهاز وجدولة التوريد من الوكلاء.",
      "على طلبك تحديدًا الدراسة منتهية بالموافقة، والمتبقي مرتبط بوصول الجهاز واعتماد ترتيب التوريد والاستلام.",
    ]));
  } else if (input.statusLine) {
    pieces.push(input.statusLine);
  }

  const generalFacts: string[] = [];
  if (facts.advancedReviewBacklog) {
    generalFacts.push("في عدد كبير من الملفات بتكون دراستها متقدمة أو جاهزة من ناحية المراجعة، بس التنفيذ مش دايمًا بيمشي بنفس السرعة");
  }
  if (facts.supplierDevicePressure) {
    generalFacts.push("توريد بعض الأجهزة من الوكلاء أحيانًا بتأخر أو بكون أبطأ من حجم الطلب");
  }
  if (facts.portfolioPaymentPressure) {
    generalFacts.push("وكمان تأخر بعض العملاء عن التزامات السداد بعمل ضغط على دورة التوريد والتنفيذ");
  }

  if (generalFacts.length) {
    const joined = generalFacts.join("، و");
    pieces.push(pick(`${input.seed}:general`, [
      `وبصراحة حتى تكون الصورة واضحة: ${joined}.`,
      `وبحكيلك الصورة مثل ما هي بدون تجميل: ${joined}.`,
      `اللي بصير فعليًا على مستوى التشغيل هو إنه ${joined}.`,
      `حتى أكون واضح معك: ${joined}.`,
    ]));
  }

  pieces.push(pick(`${input.seed}:close`, [
    "هذا مش مبرر نخليك بدون جواب، لكنه السبب إن التنفيذ أحيانًا يطول أكثر من المتوقع، وما بدي أعطيك موعد مش مثبت.",
    "بعرف إن هالشرح ما بعوض الانتظار، بس بفضّل أحكيلك السبب الحقيقي بدل أعطيك موعد ونرجع نغيّره.",
    "حقك تعرف السبب، وبنفس الوقت ما رح أوعدك بتاريخ قبل ما يكون في تحديث فعلي نقدر نعتمد عليه.",
  ]));

  return pieces.filter(Boolean).join("\n\n");
}

export function humanPresencePromptInstructions(input: {
  profile: HumanPresenceProfile;
  operationalFacts?: OperationalTransparencyFacts;
  applicationStatus?: string | null;
}) {
  const facts = input.operationalFacts || currentOperationalTransparencyFacts();
  const approved = ["approved", "customer_accepts_delivery_delay"].includes(String(input.applicationStatus || ""));

  return `
V1.6.0 Human Presence — تعليمات الحضور البشري:
- الحالة العاطفية المرجحة للرسالة الحالية: ${input.profile.emotion}.
- مستوى الحزم المطلوب: ${input.profile.firmness}/4.
- لا تتصرف كقالب دعم. افهم ماذا حدث للعميل قبل اختيار النبرة.
- التعاطف ليس جملة محفوظة؛ اعترف بالسبب المحدد للانزعاج ثم انتقل للحل أو الحقيقة.
- إذا العميل غاضب: لا تطل الاعتذار، لا تدافع عن الشركة، ولا تتجاهل اعتراضه. جملة احتواء واحدة ثم الجواب.
- إذا العميل مهين: ضع حدًا محترمًا وقصيرًا ثم أكمل بحل المشكلة. لا ترد بإهانة ولا تكافئ الشتيمة بمحاضرة.
- إذا العميل يهدد بالنشر: احترم حقه في الشكوى والتعبير عن تجربته، وذكّره بهدوء أن النشر يجب أن يكون دقيقًا وأن الجهة تحتفظ بحقوقها القانونية تجاه الادعاءات غير الصحيحة. لا تحاول منعه من شكوى مشروعة.
- لا تسأل العميل عن معلومة قالها أصلًا. إذا ذكر سبب الإلغاء ثم أكد الإلغاء، لا تسأله عن السبب ولا عن التأكيد مرة ثانية.
- المتابعة القصيرة مثل "وبكره؟" أو "لسا؟" أو "الخمس؟" تُفهم من آخر سياق كلما كان المرجع واضحًا.
- إذا بقي احتمالان حقيقيان فقط، اسأل سؤالًا محددًا بين الاحتمالين؛ ممنوع الرجوع مباشرة إلى "شو بدك تعرف تحديدًا؟".
- غيّر الافتتاحية وترتيب الجمل طبيعيًا؛ لا تعيد نفس فقرة الاعتذار أو التهدئة حرفيًا.
- الحزم يزيد مع الإساءة أو التهديد العلني، لكنه لا يغير الحقائق ولا يبرر تهديد العميل.

V1.6.0 Operational Transparency — فتح الصورة للعميل عند سؤاله بصراحة عن سبب التأخير:
- هذه الحقائق التشغيلية العامة مفعلة حاليًا:
  * ملفات كثيرة متقدمة/جاهزة من ناحية المراجعة: ${facts.advancedReviewBacklog ? "نعم" : "لا"}.
  * ضغط/تأخير توريد أجهزة من الوكلاء: ${facts.supplierDevicePressure ? "نعم" : "لا"}.
  * ضغط على دورة التنفيذ من حالات تأخر بالسداد: ${facts.portfolioPaymentPressure ? "نعم" : "لا"}.
- استخدم هذه الصورة فقط عندما يسأل العميل عن سبب التأخير أو يحتاج تفسيرًا صريحًا؛ لا تحشرها في كل رد.
- صغ المعنى كل مرة بطريقة طبيعية مختلفة، ولا تنسخ فقرة ثابتة.
- ممنوع لوم العميل الحالي على التزامات عملاء آخرين.
- ممنوع قول "موافقتك جاهزة" أو "ملفك موافق" إلا إذا حالة هذا الطلب نفسها approved/customer_accepts_delivery_delay.
- حالة هذا الطلب تسمح بذكر موافقة نهائية تخصه: ${approved ? "نعم" : "لا"}.
- إذا الطلب نفسه ما زال قيد الدراسة، افصل بوضوح بين حالته الشخصية وبين الصورة التشغيلية العامة.
`;
}
