import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type LockedMeaningKind =
  | "protected_business_registration"
  | "stop_refund_keep_request"
  | "down_payment"
  | "office_payment"
  | "monthly_payment_mechanism"
  | "device_warranty_or_insurance"
  | "product_sim_spec"
  | "payment_destination_update"
  | "voluntary_opt_out"
  | "payment_receipt_confirmation"
  | "none";

export type LockedMeaning = {
  kind: LockedMeaningKind;
  hard: boolean;
  reason: string;
};

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const BUSINESS_REGISTRATION_PROTECTION_REPLY =
  "الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق. بيانات التسجيل والوثائق القانونية الداخلية لا يتم مشاركتها عبر واتساب حفاظًا على أمن الجهة ومنع إساءة الاستخدام أو انتحال الصفة.";

export function protectedBusinessRegistrationRequest(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  return /(?:الاسم\s+القانوني|اسم\s+الشركه\s+القانوني|اسم\s+الشركة\s+القانوني|رقم\s+(?:تسجيل|سجل)\s*(?:الشركه|الشركة)?|رقم\s+الشركه|رقم\s+الشركة|السجل\s+التجاري|سجل\s+تجاري|صوره\s+(?:السجل|التسجيل)|صورة\s+(?:السجل|التسجيل)|نسخه\s+(?:السجل|التسجيل)|نسخة\s+(?:السجل|التسجيل)|شهاده\s+تسجيل|شهادة\s+تسجيل|وثيقه\s+تسجيل|وثيقة\s+تسجيل|وثائق\s+(?:الشركه|الشركة)|رخصه\s+(?:الشركه|الشركة)|رخصة\s+(?:الشركه|الشركة)|ترخيص\s+(?:الشركه|الشركة)|اثبات\s+قانوني|إثبات\s+قانوني)/.test(q);
}

function registrationProtectionAlreadySent(state: ConversationState) {
  const durableNotice = Array.isArray(state.facts) && state.facts.some((fact) => fact.key === "protected_business_registration_notice_sent" && fact.value === "sent");
  if (durableNotice) return true;
  const last = n(state.lastAssistantText);
  return /بيانات\s+التسجيل\s+والوثا(?:ئ|ي)ق\s+القانونيه\s+الداخليه\s+لا\s+يتم\s+مشاركتها\s+عبر\s+واتساب/.test(last)
    && /لا\s+توجد\s+اي\s+علاقه\s+او\s+شراكه\s+او\s+تبعيه/.test(last);
}

function hasIndependentPermittedQuestion(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  return /(?:الاسترداد|استرجاع|متى|امتى|القسط|دفعة\s+اولى|دفعه\s+اولي|الدفع|الموافقه|الموافقة|الطلب|التتبع|الموقع|التوصيل|الاستلام|الضمان|التامين|التأمين|الاوراق|الأوراق|المتطلبات|الكفيل|الجهاز|السعر)/.test(q);
}

export function shouldSuppressRepeatedProtectedRegistration(input: { turn: InterpretedTurn; state: ConversationState }) {
  return protectedBusinessRegistrationRequest(input.turn.rawText)
    && registrationProtectionAlreadySent(input.state)
    && !hasIndependentPermittedQuestion(input.turn.rawText);
}

export function stopRefundKeepRequest(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  const stopRefund = /(?:الغي|الغاء|إلغاء|وقف|اوقف|إيقاف|بديش|ما\s+بدي|لا\s+اريد|لا\s+أريد).{0,28}(?:طلب\s+)?(?:ال)?(?:استرداد|استرجاع)|(?:ما\s+بدي|بديش).{0,20}(?:المبلغ|الخمسه|الخمس|5|٥).{0,16}(?:يرجع|استرداد)?/.test(q);
  const keep = /(?:اكمل|أكمل|يكمل|نكمل|كمل|استمر|افعل|أفعل|تفعيل|ارجع|رجع|اعاده|إعادة).{0,35}(?:طلبي|الطلب|ملف|التقسيط|الهاتف|الجهاز)|(?:بدي|اريد|أريد).{0,28}(?:اكمل|أكمل|يكمل|استمر).{0,24}(?:التقسيط|الطلب|الجهاز)|(?:طلب\s+التقسيط|طلب\s+الهاتف|طلبي|الطلب).{0,35}(?:يكمل|اكمل|أكمل|استمر|يتفعل|تفعيل)/.test(q);
  return stopRefund && keep;
}

export function downPaymentQuestion(value: string | null | undefined) {
  const q = n(value);
  return /(?:هل\s+يوجد|في|فيه|عندكم|لازم|مطلوب|بقدرش|ما\s+بقدر).{0,24}(?:دفعه|دفعة).{0,10}(?:اولي|أولى|اولى)|(?:بدون|ما\s+في|مفيش).{0,18}(?:دفعه|دفعة).{0,10}(?:اولي|أولى|اولى)|(?:دفعه|دفعة).{0,10}(?:اولي|أولى|اولى)/.test(q);
}

export function officePaymentQuestion(value: string | null | undefined) {
  const q = n(value);
  return /(?:اجي|أجي|تعال|اروح|أروح).{0,30}(?:المكتب|المحل|الفرع|عندكم).{0,28}(?:ادفع|أدفع|دفع)|(?:ادفع|أدفع|دفع).{0,26}(?:بالمكتب|بالمحل|بالفرع|عندكم|مباشره|مباشرة)/.test(q);
}

export function monthlyPaymentMechanismQuestion(value: string | null | undefined) {
  const q = n(value);
  return /(?:كيف|هل|يعني).{0,30}(?:تاخذو|تسحبو|تخصمو|ينسحب|ينخصم).{0,35}(?:كل\s+شهر|شهريا|شهريًا|الحساب|البنك)|(?:كل\s+شهر|شهريا|شهريًا).{0,35}(?:من\s+حسابي|من\s+البنك|بنك\s+عربي|بنك\s+الاتحاد)|(?:اليه|آلية|طريقه|طريقة).{0,22}(?:سداد|دفع).{0,20}(?:القسط|الاقساط|الأقساط)/.test(q);
}

export function deviceWarrantyOrInsuranceQuestion(value: string | null | undefined) {
  const q = n(value);
  const device = /(?:الهاتف|التلفون|الجهاز|ايفون|آيفون|سامسونج|s24|s25|s26)/.test(q);
  const warranty = /(?:ضمان|كفاله|كفالة|تامين|تأمين|امان).{0,26}(?:ضرر|كسر|الجهاز|الهاتف|التلفون)?/.test(q);
  return device && warranty;
}

export function productSimSpecQuestion(value: string | null | undefined) {
  const q = n(value);
  return /(?:مدخل\s+شريحه|مدخل\s+شريحة|شريحه\s+الكترونيه|شريحة\s+إلكترونية|شريحه\s+الكترونيه|esim|e\s*sim|sim).{0,45}(?:ايفون|آيفون|iphone|الجهاز|الهاتف)|(?:ايفون|آيفون|iphone|الجهاز|الهاتف).{0,45}(?:مدخل\s+شريحه|مدخل\s+شريحة|شريحه\s+الكترونيه|شريحة\s+إلكترونية|esim|sim)/i.test(q);
}



export function voluntaryOptOutQuestion(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  const explicitCancel = /(?:الغي|ألغي|الغاء|إلغاء).{0,24}(?:الطلب|طلبي|المعامله|المعاملة)|(?:بدي|اريد|أريد).{0,18}(?:الغي|ألغي|الغاء|إلغاء)/.test(q);
  const explicitRefund = /(?:استرداد|استرجاع|رجعلي|رجعولي).{0,24}(?:الرسوم|المبلغ|الخمس|الخمسه|5|٥)?/.test(q);
  if (explicitCancel || explicitRefund) return false;
  return /(?:لا\s+ارغب|لا\s+أرغب|ما\s+بدي|بديش|مش\s+حاب|مو\s+حاب|مش\s+مكمل|مو\s+مكمل).{0,28}(?:بالاستمرار|استمر|اكمل|أكمل|نكمل|المتابعه|المتابعة)(?:.{0,18}(?:حاليا|حاليًا|هسا|الان|الآن))?|(?:بوقف|بوقفها|بأجل|باجل|مأجل|ماجل).{0,20}(?:حاليا|حاليًا|هسا|الان|الآن)/.test(q);
}

function paymentConfirmedTruth(application: TruthBundle["application"]) {
  if (!application) return false;
  const status = String(application.status || "").toLowerCase();
  const payment = String(application.paymentStatus || "").toLowerCase();
  return Boolean(application.paymentConfirmedAt)
    || ["confirmed","paid","payment_confirmed","refund_requested","refund_processing","refund_completed","refunded"].includes(payment)
    || ["refund_requested","refund_processing","refund_completed","refunded"].includes(status);
}

export function paymentReceiptConfirmationQuestion(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  // Structured tracking text can contain labels such as "وصل الدفع قيد التأكيد";
  // that is a status payload, not a customer question asking us to confirm payment.
  if (/الحاله\s+الحاليه/.test(q) && /(?:اخر\s+تحديث|الخطوه\s+التاليه)/.test(q)) return false;
  const paymentWord = /(?:دفعت|حولت|حوّلت|الحواله|الحوالة|الدفع|الخمسه|الخمس|5|٥)/.test(q);
  const directAsk = /(?:بين\s+معكم|مبين\s+معكم|ظهر\s+معكم|واصل\s+عندكم|وصلتكم|وصلكم|شفتو|شايفين|تاكدتم|تأكدتم|تم\s+التاكيد|تم\s+التأكيد)/.test(q);
  const receiptWord = /(?:وصل\s+الدفع|الوصل|فاتوره|فاتورة|اثبات\s+الدفع|إثبات\s+الدفع)/.test(q);
  return (paymentWord && directAsk) || (receiptWord && directAsk) || /(?:بين|مبين).{0,18}(?:اني|إني).{0,12}(?:دفعت|حولت|حوّلت)/.test(q);
}

export function paymentDestinationUpdateQuestion(value: string | null | undefined) {
  const q = n(value);
  if (!q) return false;
  // 7.5.1: generic phrases such as "آخر تحديث أو الخطوة التالية" must NEVER
  // be interpreted as the historical payment-destination update explanation.
  const explicitEmergencyUpdate = /(?:التحديث|تحديث).{0,8}(?:الطارئ|الطائر|الطاري)/.test(q);
  const explicitPaymentUpdate = /(?:التحديث|تحديث).{0,24}(?:بيانات\s+المحفظه|بيانات\s+المحفظة|بيانات\s+التحويل|cliq|كليك)/i.test(q);
  const asksWhat = /(?:شو|ايش|اش|ما\s+هو|بخصوص\s+شو|عن\s+شو|ليش|ليه)/.test(q);
  return asksWhat && (explicitEmergencyUpdate || explicitPaymentUpdate);
}

export function resolveUnifiedMeaningLock(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): LockedMeaning {
  const raw = input.turn.rawText;
  if (protectedBusinessRegistrationRequest(raw)) return { kind: "protected_business_registration", hard: true, reason: "protected company-registration/security request" };
  if (stopRefundKeepRequest(raw)) return { kind: "stop_refund_keep_request", hard: true, reason: "stop-refund + keep-application must never become cancel/refund" };
  if (downPaymentQuestion(raw)) return { kind: "down_payment", hard: true, reason: "direct down-payment question" };
  if (officePaymentQuestion(raw)) return { kind: "office_payment", hard: true, reason: "office-payment request must follow appointment/payment-channel policy" };
  if (monthlyPaymentMechanismQuestion(raw)) return { kind: "monthly_payment_mechanism", hard: true, reason: "monthly debit/payment mechanism question" };
  if (deviceWarrantyOrInsuranceQuestion(raw)) return { kind: "device_warranty_or_insurance", hard: true, reason: "device warranty/insurance must not be confused with guarantor" };
  if (productSimSpecQuestion(raw)) return { kind: "product_sim_spec", hard: true, reason: "specific product SIM/eSIM specification" };
  if (voluntaryOptOutQuestion(raw)) return { kind: "voluntary_opt_out", hard: true, reason: "customer pauses/declines continuation without requesting cancellation" };
  if (paymentReceiptConfirmationQuestion(raw)) return { kind: "payment_receipt_confirmation", hard: true, reason: "customer asks whether payment/receipt is visible or confirmed" };
  if (paymentDestinationUpdateQuestion(raw)) return { kind: "payment_destination_update", hard: true, reason: "customer explicitly asks what the emergency payment-destination update was" };
  return { kind: "none", hard: false, reason: "no hard current-meaning lock" };
}

export function lockedMeaningReply(input: { meaning: LockedMeaning; turn: InterpretedTurn; truth: TruthBundle }) {
  const fee = input.truth.policy.fileOpeningFeeJod || 5;
  switch (input.meaning.kind) {
    case "protected_business_registration":
      return BUSINESS_REGISTRATION_PROTECTION_REPLY;
    case "stop_refund_keep_request": {
      const current = input.truth.application ? ` حالتك الحالية تبقى: ${String(input.truth.application.status || "").toLowerCase() === "refund_requested" || String(input.truth.application.paymentStatus || "").toLowerCase() === "refund_requested" ? "طلب الاسترداد قيد المعالجة" : "حسب الحالة الفعلية الظاهرة على الطلب"}.` : "";
      return `فهمت عليك: بدك توقف/تلغي طلب الاسترداد وتكمل بطلب الجهاز، مش تلغي طلب التقسيط. إيقاف الاسترداد وإعادة تفعيل الطلب ما بعتبرهم منفذين من الرسالة نفسها؛ لازم تتحدث الحالة الفعلية بعد تنفيذ الإجراء المعتمد.${current} ما رح أفتح إلغاء جديد ولا استرداد جديد من هالطلب.`;
    }
    case "down_payment":
      return `ما في دفعة أولى على الجهاز. القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد. رسوم فتح الملف ${fee} دنانير خطوة منفصلة بعد الموافقة المبدئية واختيار الاستمرار، ومش دفعة أولى.`;
    case "office_payment":
      return `رسوم فتح الملف ما بنطلب دفعها بالحضور للمكتب. إذا خطوة الدفع مفتوحة على طلبك، بنعطيك بيانات التحويل الرسمية من نفس المحادثة. الحضور للمكتب بموعد رسمي مؤكد فقط، مش للدفع المباشر بدون موعد.`;
    case "monthly_payment_mechanism":
      return "آلية سداد الأقساط الشهرية بتكون مثبتة بالعقد النهائي قبل التوقيع. ما بقدر أأكد سحبًا آليًا من بنك معيّن أو من حسابك كل شهر إلا إذا كان هذا مثبتًا بالعقد. القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد.";
    case "device_warranty_or_insurance":
      return "إذا قصدك ضمان/تأمين الجهاز نفسه من الضرر أو الكسر: ما عندي تفاصيل موثقة لهذا الجهاز أقدر أأكدها من المحادثة، وما رح أخمّن أو أخلطها بموضوع الكفيل. لازم تكون شروط الضمان/التأمين مثبتة ضمن مواصفات الجهاز أو العقد عند الاستلام.";
    case "product_sim_spec":
      return "إذا قصدك هل النسخة فيها مدخل شريحة فعلية أو eSIM فقط: ما عندي مواصفات موثقة لنسخة الجهاز المحددة أقدر أأكدها من المحادثة، وما رح أخمّن. لازم نعتمد المواصفات المكتوبة للموديل/النسخة نفسها قبل تأكيد هالنقطة.";
    case "voluntary_opt_out":
      return "تمام، ما رح نفتح خطوة دفع ولا نضغط عليك تكمل هسا، وما اعتبرت رسالتك إلغاء نهائي للطلب. طلبك بيضل على حالته الحالية، وإذا حبيت تكمل لاحقًا احكيلنا إنك بدك تستمر.";
    case "payment_receipt_confirmation": {
      const application = input.truth.application;
      if (paymentConfirmedTruth(application)) return "نعم، الدفع مؤكد إداريًا على طلبك، وما في داعي تعيد الدفع أو ترفع وصل جديد.";
      if (application?.documents?.paymentReceiptUploaded === true) return "وصل الدفع ظاهر على ملفك وبانتظار مراجعة الإدارة. لسا ما بعتبر الدفع مؤكد إداريًا، وما في داعي تعيد رفع الوصل مرة ثانية.";
      return "لسا ما ظهر عندي تأكيد دفع إداري أو وصل معتمد على الطلب. إذا رفعت الوصل من الرابط الرسمي، انتظر مراجعته وما تعيد الدفع.";
    }
    case "payment_destination_update":
      return "التحديث الطارئ كان على بيانات محفظة دفع رسوم فتح الملف وأسماء التحويل عبر CliQ فقط، مش على حالة طلبك ولا على قيمة الرسوم. عشان هيك بنطلب الاعتماد على بيانات التحويل الحالية اللي بتطلع لك وقت خطوة الدفع.";
    default:
      return null;
  }
}

export function candidateAlignedWithLockedMeaning(input: { meaning: LockedMeaning; candidate: string | null | undefined }) {
  if (input.meaning.kind === "none") return true;
  const q = n(input.candidate);
  if (!q) return false;
  switch (input.meaning.kind) {
    case "protected_business_registration":
      return /بيانات\s+التسجيل\s+والوثا(?:ئ|ي)ق\s+القانونيه\s+الداخليه\s+لا\s+يتم\s+مشاركتها\s+عبر\s+واتساب/.test(q)
        && /لا\s+توجد\s+اي\s+علاقه\s+او\s+شراكه\s+او\s+تبعيه/.test(q);
    case "stop_refund_keep_request":
      return /(?:وقف|الغاء|إلغاء|تلغي|الغي).{0,24}(?:ال)?(?:استرداد|استرجاع)/.test(q)
        && /(?:تكمل|استمرار|اعاده\s+تفعيل|إعادة\s+تفعيل|طلب\s+الجهاز)/.test(q)
        && !/(?:اكدلي|أكدلي).{0,30}(?:الغي\s+الطلب|ألغي\s+الطلب)|(?:اكدلي|أكدلي).{0,30}(?:استرداد\s+الرسوم)/.test(q);
    case "down_payment": return /دفعه\s+اولي|دفعة\s+أولى|دفعة\s+اولى/.test(q);
    case "office_payment": return /(?:الدفع|رسوم).{0,40}(?:المكتب|الحضور|تحويل)|(?:الحضور).{0,35}(?:موعد\s+رسمي)/.test(q) && !/(?:تعال|اجي|أجي).{0,30}(?:ادفع|أدفع)/.test(q);
    case "monthly_payment_mechanism": return /(?:العقد\s+النهائي|اليه\s+السداد|آلية\s+السداد|سحب\s+الي|سحب\s+آلي|حسابك|البنك)/.test(q);
    case "device_warranty_or_insurance": return /(?:ضمان|تامين|تأمين).{0,30}(?:الجهاز|الهاتف|الضرر|الكسر)|(?:المواصفات|العقد).{0,35}(?:الضمان|التامين|التأمين)/.test(q);
    case "product_sim_spec": return /(?:مدخل\s+شريحه|مدخل\s+شريحة|esim|شريحه\s+الكترونيه|شريحة\s+إلكترونية|مواصفات).{0,50}(?:الموديل|النسخه|النسخة|الجهاز)?/.test(q);
    case "voluntary_opt_out": return /(?:ما\s+رح|لن).{0,35}(?:نفتح|نطلب|نضغط).{0,35}(?:دفع|تكمل|استمرار)|(?:ما\s+اعتبرت|مش\s+إلغاء|ليس\s+إلغاء).{0,30}(?:إلغاء|الطلب)/.test(q);
    case "payment_receipt_confirmation": return /(?:الدفع|وصل\s+الدفع|الوصل).{0,45}(?:مؤكد|موكد|بانتظار|مراجعه|مراجعة|ظاهر|اعتماد)|(?:مؤكد|موكد|بانتظار|مراجعه|مراجعة).{0,45}(?:الدفع|الوصل)/.test(q);
    case "payment_destination_update": return /(?:التحديث|تحديث).{0,35}(?:المحفظه|المحفظة|cliq|كليك|بيانات\s+التحويل)/i.test(q);
    default: return true;
  }
}

function instructionLeak(value: string) {
  const q = n(value);
  return /(?:يشرح\s+ذلك|يتم\s+شرح\s+ذلك|دون\s+اعطاء\s+موعد|دون\s+إعطاء\s+موعد|يجب\s+عدم|قاعده\s+تشغيليه|قاعدة\s+تشغيلية)/.test(q);
}

export function sanitizeUnifiedEgressReply(value: string | null | undefined) {
  let reply = String(value || "").trim();
  if (!reply) return reply;
  reply = reply.replace(/فرعنا/g, "مكتبنا").replace(/الفرع/g, "المكتب").replace(/فرع/g, "مكتب");
  reply = reply.replace(/(?:،?\s*)?(?:يُشرح|يشرح|يتم شرح)\s+ذلك\s+بصراحة[^.\n]*(?:[.\n]|$)/g, " ");
  reply = reply.replace(/(?:،?\s*)?ومن دون إعطاء موعد مؤكد أو وعد بالتنفيذ[^.\n]*(?:[.\n]|$)/g, " ");
  reply = reply.replace(/(?:،?\s*)?دون إعطاء موعد مؤكد أو وعد بالتنفيذ[^.\n]*(?:[.\n]|$)/g, " ");
  reply = reply.replace(/أنا\s+معك،?\s*مش\s+(?:بوت|روبوت|رد\s+آلي)[^.\n]*(?:[.\n]|$)/g, "معك فريق الأمين من نفس المحادثة. ");
  reply = reply.replace(/مش\s+رد\s+آلي/g, "متابع معك من نفس المحادثة");
  reply = reply.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return reply;
}

export function unifiedInstructionLeakPresent(value: string | null | undefined) {
  return instructionLeak(String(value || ""));
}

export function repeatedQuestionNeedsRepair(input: { turn: InterpretedTurn; state: ConversationState; candidate: string | null | undefined }) {
  const current = n(input.turn.rawText);
  const previousCustomer = n(input.state.lastCustomerText);
  const previousAssistant = n(input.state.lastAssistantText);
  const candidate = n(input.candidate);
  const explicitRepair = /(?:مش\s+فاهم|ما\s+فهمت|ما\s+جاوبت|جاوب\s+سؤالي|جاوبني\s+عالسؤال|نفس\s+السؤال|كل\s+مره\s+نفس\s+الحكي|كل\s+مرة\s+نفس\s+الحكي|قصدي)/.test(current);
  const repeatedCustomer = current.length >= 6 && current === previousCustomer;
  const repeatedAssistant = candidate.length >= 10 && candidate === previousAssistant;
  return (explicitRepair || repeatedCustomer) && repeatedAssistant;
}
