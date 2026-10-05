import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildInformedCommercialDisclosureReply, buildPostDisclosurePaymentReply, commercialDisclosureDelivered, resemblesFullCommercialDisclosure } from "./informedCommercialContinuation";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { currentFileOpeningPaymentRule } from "./paymentDestinationOverride";
import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type AnswerBundleKind = "single_question" | "multi_question" | "application_start" | "repeat_repair" | "legal_notice" | "none";
export type AnswerBundle = { kind: AnswerBundleKind; reasons: string[] };

type QuestionFlags = ReturnType<typeof qFlags>;

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function currentCommercialDisclosureVisible(state: ConversationState, truth: TruthBundle) {
  return commercialDisclosureDelivered(state, truth) || resemblesFullCommercialDisclosure(state.lastAssistantText);
}

function explicitContinuation(q: string) {
  if (!q || /(?:لا\s+(?:ارغب|اريد)|مش\s+(?:حاب|حابب|راغب|مكمل)|ما\s+بدي|بديش).{0,30}(?:الاستمرار|استمر|اكمل|كمل|نكمل)/.test(q)) return false;
  if (/^(?:استمرار|اكمل|كمل|نكمل|نستمر|استمر|كملو|كملوا|استمروا|موافق|موافقه|اوافق)$/.test(q)) return true;
  return /(?:اود|ارغب|اريد|بدي|حاب|حابب|موافق|اوافق|خلينا|يلا).{0,24}(?:الاستمرار|استمر|اكمل|كمل|نكمل|نستمر)|^(?:تمام|خلص)\s+(?:بدي|حاب|حابب|موافق|خلينا).{0,18}(?:استمر|اكمل|كمل|نكمل|الاستمرار)/.test(q);
}

function qFlags(turn: InterpretedTurn, truth: TruthBundle) {
  const q = n(turn.rawText);
  const stage = applicationJourneyStage(truth.application);
  const contractTerms = /(?:شروط|بنود)\s+العقد/.test(q);
  const requirements = !contractTerms && /(?:الاوراق|الأوراق|المستندات|الوثائق|شروط\s+التقديم|الشروط\s+للتقديم|المتطلبات|اثبات\s+الدخل|إثبات\s+الدخل|شو\s+مطلوب\s+مني)/.test(q);
  const guarantor = /(?:كفيل|الكفيل|ضامن)/.test(q);
  const multipleDevices = /(?:تلفونين|هاتفين|جهازين|2\s*جهاز|٢\s*جهاز|اخد\s*2|اخد\s*٢|آخذ\s*2|آخذ\s*٢)/.test(q);
  const interest = /(?:الفائده|الفائدة|فايده|فائدة|مرابحه|مرابحة|نسبه\s+الربح|نسبة\s+الربح|نسب\s+الفايده|نسب\s+الفائدة)/.test(q);
  const downPayment = /(?:دفعه|دفعة).{0,12}(?:اولي|اولى|اولا)|(?:بدون|ما\s+في|مفيش|هل).{0,18}(?:دفعه|دفعة).{0,10}(?:اولي|اولى|اولا)/.test(q);
  const feePaymentMethod = /(?:كيف|وين|اين|أين).{0,26}(?:تستلمو|تستلموا|استلام|ادفع|أدفع|احول|أحول|تحويل).{0,26}(?:الرسوم|5|٥|الخمس|الخمسه)?|(?:الرسوم|5|٥|الخمس|الخمسه).{0,26}(?:كيف|وين|احول|أحول|ادفع|أدفع)|(?:الرسوم|الخمس|الخمسه|5|٥).{0,18}(?:بدفعها|بدفع|بادفع|رح\s+ادفع|راح\s+ادفع)/.test(q);
  const feeDueNow = /(?:بدك|بدكم|مطلوب|لازم).{0,24}(?:مني\s*)?(?:5|٥|خمس|خمسه|خمسة|الرسوم).{0,18}(?:هسا|هسه|الان|الآن)?|(?:5|٥|خمس|خمسه|خمسة|الرسوم).{0,24}(?:هسا|هسه|الان|الآن).{0,18}(?:مطلوب|ادفع|أدفع)?/.test(q);
  const feeRefundability = /(?:هاض|هاد|هذا|المبلغ|الرسوم|5|٥|الخمس|الخمسه).{0,32}(?:مسترد|مسترده|مستردة|بترجع|برجع|بترجعو|برجعو)|(?:مسترد|مسترده|مستردة|بترجع).{0,30}(?:الرسوم|المبلغ|5|٥)/.test(q);
  const officeLocation = /(?:وين|اين|أين).{0,24}(?:موقعكم|المكتب|المحل|العنوان|الشركه|الشركة|الفرع|فرع|فروعكم|افرعكم|أفرعكم)|(?:موقعكم|المكتب|المحل|الشركه|الشركة|الفرع|فرع|فروعكم|افرعكم|أفرعكم).{0,22}(?:وين|بالزبط|بالضبط)|^(?:اين|أين|وين)\s+(?:افرعكم|أفرعكم|فروعكم)$|^بدي\s+فرع$/.test(q);
  const officeHours = /(?:اوقات|ساعات|ايام).{0,20}(?:الدوام|العمل)|(?:الدوام).{0,20}(?:متى|متي|كيف|ايام)|(?:تعملون|بتداوموا|فاتحين).{0,20}(?:السبت|الجمعه)|(?:السبت|الجمعه).{0,20}(?:دوام|فاتحين|تعملون|عطله)/.test(q);
  const remoteProcess = /(?:كل|كامل).{0,18}(?:الاجراءات|المعامله).{0,24}(?:واتساب|اونلاين)|(?:لازم|ضروري|بدي).{0,22}(?:اجي|امر|احضر).{0,22}(?:المكتب|للمكتب|الفرع|للفرع)|(?:بدون).{0,18}(?:حضور|المكتب|الفرع)/.test(q);
  const supplierAuthorization = /(?:وكيل|موزع).{0,24}(?:ابل|apple|معتمد)|(?:من\s+وين|من\s+اي).{0,28}(?:بتجيبوا|تجيبوا|مصدر|وكلاء).{0,28}(?:الاجهزه|الايفون|iphone)|(?:اي\s+وكيل|الوكيل).{0,24}(?:الاجهزه|الايفون|iphone|apple)/i.test(q);
  const bankInstallmentChannel = /(?:عن\s+طريق|من\s+خلال).{0,30}(?:بنك\s+العربي\s+الاسلامي|البنك\s+العربي\s+الاسلامي|بنك\s+الاتحاد|بنك\s+اسلامي|بنك\s+إسلامي).{0,30}(?:اقساط|أقساط|تقسيط)?|(?:اقساط|أقساط|تقسيط).{0,30}(?:بنك\s+العربي\s+الاسلامي|البنك\s+العربي\s+الاسلامي|بنك\s+الاتحاد|بنك\s+اسلامي|بنك\s+إسلامي)/.test(q);
  const deliveryTiming = /(?:متى|متي|امتى|امتي|موعد|وقت).{0,24}(?:التسليم|تسليم|الاستلام|استلام)|(?:التسليم|الاستلام).{0,24}(?:متى|متي|امتى|امتي|موعد|وقت)/.test(q);
  const installmentQuote = /(?:كم|قديش).{0,28}(?:بطلع|بيطلع|يطلع).{0,24}(?:اقساط|أقساط|قسط)|(?:سعره|سعر|الجهاز).{0,22}(?:بالاقساط|بالأقساط)|(?:كم|قديش).{0,18}(?:القسط|قسطه|قسطها)/.test(q);
  const monthlyTarget = /(?:ادفع|أدفع|قسط|القسط).{0,24}(?:كل\s+شهر|شهري|بالشهر).{0,18}(?:\d+|[٠-٩]+)\s*(?:دينار)?|(?:\d+|[٠-٩]+)\s*(?:دينار)?\s*(?:كل\s+شهر|بالشهر|شهريا|شهريًا)/.test(q);
  const installmentDuration = /(?:على|خلال|مده|مدة).{0,15}(?:ست|6|٦|سبع|7|٧|اثنا\s+عشر|12|١٢|\d+|[٠-٩]+)\s*(?:اشهر|أشهر|شهر)|(?:ست|6|٦)\s*(?:اشهر|أشهر).{0,16}(?:او\s+اقل|أو\s+أقل)/.test(q);
  const priceChange = /(?:سعر\s+الجهاز|السعر).{0,28}(?:يختلف|يتغير|بتغير|بختلف|يزيد)|(?:يختلف|يتغير|بتغير|بختلف|يزيد).{0,28}(?:سعر\s+الجهاز|السعر)|(?:كم\s+يزيد).{0,24}(?:سعره|السعر)?/.test(q);
  const applicationStatus = Boolean(truth.application) && /(?:شو|ايش|اش).{0,18}(?:صار|وضع|حاله|حالة).{0,18}(?:طلبي|الطلب)|(?:حاله|حالة)\s+(?:الطلب|طلبي)|(?:متابعه|متابعة)\s+(?:الحاله|الحالة|الطلب|طلبي)/.test(q);
  const reviewTiming = !["refund_requested", "refund_completed"].includes(stage) && (
    /(?:متى|متي|امتى|امتي|قديش|كم|اليوم|بكرا|السبت).{0,32}(?:قرار|موافقه|الموافقة|يخلص|جاهز|وقت)|(?:ممكن|بزبط|هل).{0,22}(?:تصدر|تطلع|يطلع).{0,24}(?:الموافقه|الموافقة|النتيجه|النتيجة|القرار).{0,24}(?:بنفس|نفس)\s+اليوم|(?:تاخرتو|تأخرتوا|طولتوا|صارلي|صارله|مر\s+\d+\s+ايام|[٤4]\s+ايام)/.test(q)
    || /(?:كم|قديش).{0,18}(?:بدها|بده|بتاخد|بتاخذ|تحتاج).{0,24}(?:لتبين|ليبين|ليطلع|تطلع|يطلع).{0,20}(?:اه|نعم|لا|قبول|رفض|القرار|النتيجه)/.test(q)
  );
  const acceptanceProbability = /(?:نسبه|نسبة).{0,20}(?:القبول|الموافقه|الموافقة)|(?:كم|شو|ما).{0,20}(?:احتمال|نسبه|نسبة).{0,20}(?:قبولي|القبول|الموافقه|الموافقة)|(?:برايك|برأيك).{0,24}(?:بنقبل|ينقبل|بوافقوا|الموافقه|الموافقة)/.test(q);
  const accessoriesQuestion = /(?:معاه|معه|بيجي|يجي|يشمل|شامل).{0,28}(?:كفر|جراب|شاشه\s+حمايه|شاشة\s+حماية|اكسسوارات|اكسسوار)|(?:كفر|جراب|شاشه\s+حمايه|شاشة\s+حماية|اكسسوارات|اكسسوار).{0,32}(?:معاه|معه|بيجي|يجي|يشمل|مجاني|بس\s+الجهاز|ولا\s+بس)/.test(q);
  const supportComplaint = /(?:بدي|اريد|أريد).{0,20}(?:اقدم|أقدم|اعمل|أعمل|ارفع|أرفع).{0,20}(?:شكو|شكوى|شكوه).{0,35}(?:الدعم|الموظف|الخدمه|الخدمة)|(?:شكو|شكوى|شكوه).{0,25}(?:عن|على).{0,25}(?:الدعم|الموظف|الخدمه|الخدمة)/.test(q);
  const escalationRequest = /(?:تصعيد|صعد|صعّد|صعدوا).{0,30}(?:طلبي|الطلب|الملف).{0,45}(?:مشرف|الاداره|الإدارة|الائتمان)?|(?:مشرف|اداره|إدارة|الائتمان).{0,35}(?:صعد|تصعيد).{0,25}(?:طلبي|الطلب|الملف)/.test(q);
  const contactPhone = /^(?:رقم\s+(?:الشركه|الشركة)|رقمكم)(?:\s+لو\s+سمحت)?$|(?:في|فيه|عندكم|اعطيني|أعطيني|شو).{0,20}(?:رقم).{0,20}(?:الشركه|الشركة|تواصل|اتصال|هاتف)/.test(q);
  const applicationStart = /(?:كيف|وين|من\s+وين).{0,28}(?:اقدم|أقدم|ارفع\s+طلبي|أرفع\s+طلبي|اعمل\s+طلب|أعمل\s+طلب)|(?:ما\s+قدمت|لسا\s+ما\s+قدمت).{0,30}(?:كيف|وين|التقديم)|(?:رابط).{0,18}(?:التقديم|قدم\s+طلب)/.test(q);
  const businessIdentity = /(?:الاسم\s+القانوني|اسم\s+الشركه\s+القانوني|اسم\s+الشركة\s+القانوني|رقم\s+(?:التسجيل|الترخيص|السجل)|السجل\s+التجاري|ترخيص\s+الشركه|ترخيص\s+الشركة)/.test(q);
  const reopenCancelled = ["cancelled", "refund_requested"].includes(stage) && /(?:اعاده|إعادة|اعيد|أعيد|ارجع|أرجع|تفعيل|افعل|أفعل).{0,35}(?:الطلب|المعامله|المعاملة|الملغي|تفعيله)|(?:اقدم|أقدم).{0,25}(?:طلب\s+جديد).{0,30}(?:ولا|ام|أم).{0,30}(?:اعيد|أعيد|ارجع|أرجع|تفعيل)|(?:هل).{0,28}(?:استطيع|بقدر).{0,24}(?:اعاده|إعادة|تفعيل).{0,24}(?:الطلب|تفعيله)/.test(q);
  const statusConflict = Boolean(truth.application) && /(?:بعطيني|ظاهر|مبين|الصفحه|الصفحة).{0,35}(?:بانتظار\s+فتح\s+الملف|حاله\s+مختلفه|حالة\s+مختلفة).{0,30}(?:وانت|وانتو|هون)?/.test(q);
  const continuationDecision = !["cancelled", "refund_requested", "refund_completed"].includes(stage) && explicitContinuation(q);
  const legalNotice = /(?:دعوى\s+قضائيه|دعوى\s+قضائية|تبليغ\s+قانوني|اشعار\s+قانوني|إشعار\s+قانوني|وكيل\s+قانوني|ذمم|ذمه\s+مستحقه|ذمة\s+مستحقة)/.test(q);
  const repeatRepair = /(?:ما\s+تعيد|لا\s+تعيد|نفس\s+الجمله|نفس\s+الجملة|نفس\s+الرد|جاوبني\s+بدون\s+تكرار)/.test(q);
  return { requirements, guarantor, multipleDevices, interest, downPayment, feePaymentMethod, feeDueNow, feeRefundability, officeLocation, officeHours, remoteProcess, supplierAuthorization, bankInstallmentChannel, deliveryTiming, installmentQuote, monthlyTarget, installmentDuration, priceChange, applicationStatus, reviewTiming, acceptanceProbability, accessoriesQuestion, supportComplaint, escalationRequest, contactPhone, applicationStart, businessIdentity, reopenCancelled, statusConflict, continuationDecision, contractTerms, legalNotice, repeatRepair };
}

export function resolveAnswerBundle(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): AnswerBundle {
  const f = qFlags(input.turn, input.truth);
  if (f.legalNotice) return { kind: "legal_notice", reasons: ["legal notice must not route to trust/registration template"] };
  if (f.repeatRepair) return { kind: "repeat_repair", reasons: ["customer explicitly rejected repetition"] };
  if (f.applicationStart && (!input.truth.application || /(?:ما\s+قدمت|لسا\s+ما\s+قدمت)/.test(n(input.turn.rawText)))) return { kind: "application_start", reasons: ["customer asks how/where to apply instead of requesting status"] };
  const material = Object.entries(f).filter(([k,v]) => !["applicationStart","legalNotice","repeatRepair"].includes(k) && v).map(([k]) => k);
  if (material.length >= 2) return { kind: "multi_question", reasons: material };
  if (material.length === 1) return { kind: "single_question", reasons: material };
  return { kind: "none", reasons: [] };
}

function empathyPrefix(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (/(?:تاخرتو|تأخرتوا|طولتوا|صارلي|زهقت|مش\s+معقول|ما\s+بدي\s+استنى)/.test(q) || turn.sentiment === "frustrated" || turn.sentiment === "angry") return "معك حق، وما رح ألفّ عليك ولا أعيد نفس الجملة.";
  if (/(?:فضلا|فضلًا|الله\s+يخليك|بترجاك|اذا\s+بتقدر|إذا\s+بتقدر)/.test(q)) return "أكيد، وبجاوبك على كل نقطة مباشرة.";
  return "";
}

function statusPart(truth: TruthBundle) {
  if (!truth.application) return null;
  return `حالة طلبك الآن: ${customerFacingStatusLabel(truth.application)}.`;
}

function timingPart(truth: TruthBundle) {
  if (!truth.application) return null;
  const stage = applicationJourneyStage(truth.application);
  if (["approved","cancelled","refund_requested","refund_completed"].includes(stage)) return null;
  const window = truth.policy.normalReviewWindow || "من يومين لـ3 أيام عمل";
  const pressure = truth.policy.severePressureRule || "حاليًا في ضغط مراجعات شديد وقد تتأخر بعض الملفات أكثر من المعدل الطبيعي.";
  return `${window}، لكن ${pressure} وما بقدر أضمن يوم محدد قبل ما يصدر القرار فعليًا.`;
}

function acceptanceProbabilityPart() {
  return "ما عندي نسبة قبول موثقة أو صلاحية أتوقع قرار الملف من المحادثة. القبول أو الرفض بيتحدد من الدراسة الفعلية للطلب؛ أي رقم أو نسبة أعطيك إياها قبل القرار بتكون تخمين، لذلك ما رح أخمّن.";
}

function accessoriesPart() {
  return "ما عندي ملحقات مجانية موثقة على الطلب أقدر أضمنها، لذلك ما رح أقول إن الجهاز معه كفر أو حماية شاشة. اعتمد فقط أي ملحق يكون مذكور رسميًا ضمن بيانات المنتج أو الطلب وقت الاستلام.";
}

function supportComplaintPart() {
  return "إذا بدك تقدم شكوى عن الدعم الفني، اكتب تفاصيل الشكوى هون بوضوح. ما عندي قناة شكوى منفصلة موثقة أقدر أحولك إلها، وما رح أقول إن الشكوى تصعّدت أو تسجلت إداريًا قبل ما يكون في تنفيذ فعلي.";
}

function escalationPart(truth: TruthBundle) {
  const app = truth.application;
  const status = app ? ` حالة طلبك الحالية: ${customerFacingStatusLabel(app)}.` : "";
  const docs = app?.documents;
  let documents = " تفاصيل النواقص الدقيقة غير متاحة عندي بشكل موثّق هسا.";
  if (docs?.loaded) {
    const missing: string[] = [];
    if (docs.identityComplete === false) missing.push("الهوية");
    if (docs.salarySlipUploaded === false) missing.push("إثبات الدخل");
    if (docs.guarantorDataComplete === false) missing.push("بيانات الكفيل");
    documents = missing.length ? ` النواقص الظاهرة على الملف: ${missing.join("، ")}.` : " ما في نقص ظاهر عندي بالمستندات المحمّلة حاليًا.";
  }
  return `طلب التصعيد واضح، لكن ما رح أقول إنه تم تصعيد الملف لمشرف أو إدارة قبل ما يظهر تنفيذ فعلي وموثق.${status}${documents}`;
}

function contactPhonePart() {
  return "المتابعة الرسمية للطلبات من نفس واتساب الحالي. ما عندي رقم هاتف إضافي رسمي موثق أقدر أعطيك إياه، لذلك ما رح أختلق رقم أو أقول إن ما في رقم للشركة بشكل عام.";
}

function applicationStartPart(turn: InterpretedTurn, truth: TruthBundle) {
  const links = buildOfficialLinkContext({ ...turn, topics: Array.from(new Set([...turn.topics, "products"])) }, truth);
  const products = links.relevant.products || `${links.baseUrl}/products`;
  return `التقديم أونلاين من الموقع الرسمي: اختار الجهاز من صفحة المنتجات، عبّي طلب الموافقة المبدئية، وبعد الإرسال بيطلع لك رقم تتبع. ما بتحتاج تحضر للمكتب حتى يوصلك موعد رسمي لمرحلة تستحق الحضور.\n${products}`;
}

function requirementsPart(truth: TruthBundle) {
  return `${truth.policy.requirementsGuidanceRule} وأي مستند حساس بنستلمه فقط من الرابط الرسمي الآمن، مش عبر واتساب.`;
}

function guarantorPart() {
  return "الكفيل مش شرط ثابت لكل طلب؛ ممكن يُطلب حسب دراسة الملف، وما بقدر أضمن من واتساب إن ملف معيّن رح يمشي بكفيل أو بدونه قبل الدراسة.";
}

function multipleDevicesPart() {
  return "وبالنسبة لجهازين: ما عندي سياسة موثقة أقدر أوعدك منها إن جهازين بينقبلوا مع بعض تلقائيًا. التوفر والعدد المقبول بيتحددوا حسب مسار التقديم ودراسة كل طلب، فما رح أعطيك ضمان من عندي.";
}

function ratePercent(value: number) {
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function interestPart(truth: TruthBundle) {
  const app = truth.application;
  if (app && typeof app.interestRate === "number" && Number.isFinite(app.interestRate)) return `نسبة الربح المسجلة على طلبك حاليًا ${ratePercent(app.interestRate)}%. المرجع النهائي يظل الحسبة وجدول العقد.`;
  return `${truth.policy.commercialStructureRule} ما عندي نسبة رقمية موثقة أقدر أخمّنها بدون حسبة الجهاز والمدة؛ السعر والقسط والإجمالي لازم يطلعوا من الحسبة الرسمية للطلب.`;
}

function downPaymentPart(truth: TruthBundle) {
  return `دفعة أولى على الجهاز اختيارية ويمكن تكون 0. ${truth.policy.firstInstallmentRule} ورسوم فتح الملف ${truth.policy.fileOpeningFeeJod || 5} دنانير خطوة منفصلة بعد الموافقة المبدئية واختيار الاستمرار، ومش دفعة أولى.`;
}

function paymentDetails(turn: InterpretedTurn, truth: TruthBundle) {
  const links = buildOfficialLinkContext({ ...turn, topics: Array.from(new Set([...turn.topics, "payment_fee", "payment_method", "receipt_upload"])) as InterpretedTurn["topics"] }, truth);
  const receipt = links.relevant.receipt;
  return `${currentFileOpeningPaymentRule({ includeApology: false })}${receipt ? `\nبعد التحويل ارفع الوصل مرة واحدة من الرابط الرسمي المرتبط بطلبك:\n${receipt}` : ""}`;
}

function feePaymentMethodPart(turn: InterpretedTurn, state: ConversationState, truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  const fee = truth.policy.fileOpeningFeeJod || 5;
  if (["payment_proof_pending_admin", "payment_confirmed_under_review", "approved"].includes(stage)) return "خطوة دفع رسوم فتح الملف موجودة أصلًا على طلبك، فما تدفعها مرة ثانية. إذا الوصل بانتظار الإدارة انتظر الاعتماد، وإذا الدفع مؤكد فما في عليك خطوة مالية جديدة الآن.";
  if (["refund_requested", "refund_completed", "cancelled"].includes(stage)) return `طلبك الحالي مش بمرحلة دفع رسوم فتح الملف؛ حالته الآن ${customerFacingStatusLabel(truth.application!)}.`;
  const disclosureVisible = currentCommercialDisclosureVisible(state, truth);
  if (stage === "continuation_confirmed_fee_due" || (stage === "preliminary_approved_waiting_decision" && disclosureVisible)) {
    return `رسوم فتح الملف ${fee} دنانير، وهاي قنوات الدفع الرسمية:\n${paymentDetails(turn, truth)}\nتأكيد الدفع النهائي يتم بعد مراجعة الوصل إداريًا، والقسط الأول مش مطلوب الآن.`;
  }
  if (stage === "preliminary_approved_waiting_decision") return `رسوم فتح الملف ${fee} دنانير، لكن قبل فتح بيانات التحويل لازم نوضح خطوة فتح الملف كاملة ويكون قرار الاستمرار واضحًا. إذا بدك تكمل احكي إنك حاب تستمر، وبعد الشرح بعطيك بيانات الدفع الرسمية.`;
  return `رسوم فتح الملف ${fee} دنانير بتصير فقط بعد الموافقة المبدئية واختيار الاستمرار، ووقتها بنعطيك قنوات الدفع الرسمية من نفس المحادثة.`;
}

function feeDueNowPart(state: ConversationState, truth: TruthBundle) {
  const fee = truth.policy.fileOpeningFeeJod || 5;
  const stage = applicationJourneyStage(truth.application);
  if (["payment_proof_pending_admin", "payment_confirmed_under_review", "approved"].includes(stage)) return "لا، ما تدفع رسوم فتح الملف مرة ثانية؛ خطوة الدفع موجودة أصلًا على الملف حسب الحالة الحالية.";
  if (stage === "preliminary_review") return `لا، رسوم فتح الملف ${fee} دنانير ما بتطلب قبل الموافقة المبدئية.`;
  if (stage === "continuation_confirmed_fee_due") return `نعم، هسا المطلوب ${fee} دنانير رسوم فتح الملف حتى ينتقل الملف للدراسة النهائية. هاي منفصلة تمامًا عن الدفعة الأولى على الجهاز والقسط الأول.`;
  if (stage === "preliminary_approved_waiting_decision") {
    return currentCommercialDisclosureVisible(state, truth)
      ? `إذا قرارك إنك تكمل بعد الشرح، نعم: رسوم فتح الملف ${fee} دنانير مطلوبة قبل الدراسة النهائية. إذا ما بدك تكمل هسا، ما في دفع عليك وبيضل الطلب عند الموافقة المبدئية.`
      : `أنت عند الموافقة المبدئية. رسوم فتح الملف ${fee} دنانير بتصير فقط إذا اخترت الاستمرار للدراسة النهائية؛ قبل اختيار الاستمرار ما في دفع مطلوب.`;
  }
  return `رسوم فتح الملف ${fee} دنانير مرتبطة بمرحلة ما بعد الموافقة المبدئية واختيار الاستمرار، ومش دفعة أولى ولا القسط الأول.`;
}

function feeRefundabilityPart(truth: TruthBundle) {
  const fee = truth.policy.fileOpeningFeeJod || 5;
  return `نعم، رسوم فتح الملف ${fee} دنانير مستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية بعد دفع مؤكد، وكذلك إذا قررت تلغي بعد دفعها وكان الدفع مثبتًا إداريًا. ما بنعتبر الاسترداد مكتمل إلا لما يظهر التنفيذ فعليًا.`;
}

function officeLocationPart(truth: TruthBundle) {
  return `الموقع العام الموثق عندي: ${truth.policy.generalLocation}. ما عندي قائمة فروع إضافية موثقة أقدر أخمّنها. الحضور للمكتب بموعد رسمي مؤكد فقط.`;
}

function officeHoursPart() {
  return "الجمعة والسبت عطلة تشغيلية للمكتب، بينما استقبال الطلبات والمتابعة الرقمية مستمران. ما عندي ساعات يومية موثقة لباقي الأيام أذكرها بدون تخمين، والحضور للمكتب بيكون فقط بموعد رسمي مؤكد.";
}

function remoteProcessPart() {
  return "التقديم والمتابعة ممكنين رقميًا عبر الموقع وواتساب، لكن الاستلام وتوقيع العقد مش واتساب فقط: إذا وصل الطلب للموافقة النهائية، الحضور للمكتب بيكون بموعد رسمي مؤكد مرتبط بالطلب. ما في زيارة مفتوحة من غير موعد.";
}

function supplierAuthorizationPart(truth: TruthBundle) {
  const device = String(truth.application?.deviceName || "");
  const iphone18 = /iphone\s*18|ايفون\s*18|آيفون\s*18/i.test(device);
  const documentedWarranty = iphone18 ? " الموثق عندي لهذا الموديل أن كفالته iSYSTEMS الأردن، وهذا بحد ذاته لا يعني إن الأمين وكيل Apple أو موزع Apple معتمد." : "";
  return `ما عندي حقيقة موثقة تسمحلي أقول إن الأمين وكيل Apple أو موزع Apple معتمد، وما رح أنسب مصدر التوريد لوكيل معيّن بدون حقيقة موثقة على نفس المنتج.${documentedWarranty}`;
}

function bankInstallmentChannelPart() {
  return "التقسيط عند الأمين للأقساط نفسه، وما عندي شراكة أو برنامج تقسيط موثق أقدر أنسبه للبنك العربي الإسلامي أو بنك معيّن. إذا قصدك فقط تحويل الرسوم أو الأقساط من حسابك البنكي، بنعتمد قنوات السداد الرسمية المتاحة وقتها وما بنضمن توافق بنك بعينه إلا إذا ظهر لك المستفيد الصحيح قبل التأكيد.";
}

function deliveryTimingPart(turn: InterpretedTurn, truth: TruthBundle) {
  const q = n(turn.rawText);
  if (/iphone\s*18|ايفون\s*18|آيفون\s*18/i.test(q) || /iphone\s*18|ايفون\s*18|آيفون\s*18/i.test(String(truth.application?.deviceName || ""))) {
    return "إذا الجهاز iPhone 18 Pro أو Pro Max، الاستلام يكون بعد شهر من الموافقة النهائية، ومن المكتب وبموعد رسمي مؤكد فقط؛ ما في توصيل.";
  }
  const stage = applicationJourneyStage(truth.application);
  if (stage === "approved") return `الموافقة النهائية صادرة، لكن ما عندي قاعدة موثقة إن الاستلام يكون بنفس يوم الموافقة. موعد الاستلام نفسه لازم يكون موعدًا رسميًا مؤكدًا مرتبطًا بالطلب. ${truth.policy.generalLocation}.`;
  return `موعد التسليم ما بينحدد قبل صدور الموافقة النهائية، وما بقدر أوعد باستلام بنفس يوم صدورها. الاستلام يكون من المكتب وبموعد رسمي مؤكد مرتبط بالطلب؛ ما في توصيل. ${truth.policy.generalLocation}.`;
}

function installmentQuotePart(truth: TruthBundle) {
  const app = truth.application;
  if (app && typeof app.monthlyPayment === "number" && Number.isFinite(app.monthlyPayment) && typeof app.installmentMonths === "number" && Number.isFinite(app.installmentMonths)) {
    return `الحسبة المسجلة حاليًا على طلبك هي ${app.monthlyPayment.toFixed(2)} دينار شهريًا لمدة ${app.installmentMonths} شهر. المرجع النهائي يظل الحسبة وجدول العقد.`;
  }
  return "إذا قصدك كم بيطلع القسط الشهري للجهاز: ما عندي رقم حسبة موثق للطلب/الموديل بهاللحظة، وما رح أخمّن. القسط النهائي لازم يطلع من الحسبة الرسمية بعد تحديد الجهاز والسعة والمدة وأي دفعة أولى اختيارية.";
}

function monthlyTargetPart(truth: TruthBundle) {
  const app = truth.application;
  if (app && typeof app.monthlyPayment === "number" && Number.isFinite(app.monthlyPayment) && typeof app.installmentMonths === "number" && Number.isFinite(app.installmentMonths)) return `الحسبة المسجلة على طلبك حاليًا هي تقريبًا ${app.monthlyPayment.toFixed(2)} دينار شهريًا لمدة ${app.installmentMonths} شهر. أي هدف شهري مختلف يحتاج حسبة رسمية جديدة.`;
  return "إذا عندك هدف شهري محدد، بفهمه كطلب حسبة، لكن ما بقدر أضمن الرقم قبل ما تطلع الحسبة الرسمية للجهاز والمدة.";
}

function installmentDurationPart(truth: TruthBundle) {
  const months = truth.application?.installmentMonths;
  if (typeof months === "number" && Number.isFinite(months)) return `المدة المسجلة حاليًا على طلبك ${months} شهر. أي تغيير للمدة لازم ينعكس بالحسبة الرسمية قبل ما نعتبره معتمدًا.`;
  return "المدة النهائية لازم تعتمد على خيارات الحسبة الرسمية المتاحة للطلب؛ ما رح أثبت مدة من المحادثة إذا ما كانت مسجلة بالحسبة.";
}

function priceChangePart() {
  return "فرق السعر أو تغيير السعر ما بنحسبه يدويًا من المحادثة. لازم يطلع من الحسبة الرسمية للموديل والسعة الجديدة، وما رح أخمّن رقم قبل ما يكون موثقًا.";
}

function businessIdentityPart(truth: TruthBundle) {
  return `الاسم المعتمد عندي في النظام: ${truth.policy.businessName}. الموقع العام: ${truth.policy.generalLocation}. بالنسبة لرقم التسجيل أو الترخيص، ما عندي رقم موثق ومصرح للمحادثة أقدر أعطيك إياه، فما رح أخترع رقم. الدفع ما بنعتبره مؤكد إلا بعد مراجعة الوصل إداريًا، ورسوم فتح الملف ${truth.policy.fileOpeningFeeJod || 5} دنانير هي الرسوم الإضافية المعتمدة لفتح الملف فقط حسب السياسة الحالية.`;
}

function reopenCancelledPart(truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  if (stage === "refund_completed") return "الاسترداد مكتمل على الطلب، فما بقدر أعتبر نفس الطلب قابلًا لإعادة الفتح من المحادثة. إذا بدك تكمل لازم يبدأ مسار طلب جديد أو مراجعة إدارية موثقة.";
  if (stage === "refund_requested") return "الطلب ملغي والاسترداد مفتوح. إذا بدك ترجع تكمل على نفس الطلب، لازم أولًا يتوقف الاسترداد ويُعاد فتح الطلب بتنفيذ فعلي؛ ما بعتبره مفتوح من مجرد السؤال.";
  if (stage === "cancelled") return "الطلب ملغي حاليًا. ممكن تطلب إعادة فتح نفس الطلب، لكن ما بعتبره مفتوح قبل تنفيذ الإجراء فعليًا. إذا قرارك ترجع تكمل اكتب بوضوح: بدي أعيد فتح الطلب وأكمل عليه.";
  return `حالة الطلب الحالية: ${truth.application ? customerFacingStatusLabel(truth.application) : "غير متاحة"}.`;
}

function statusConflictPart(truth: TruthBundle) {
  return `واضح إن اللي ظاهر عندك بالواجهة مختلف عن الحالة اللي أقرأها هنا. الحالة التشغيلية عندي الآن: ${truth.application ? customerFacingStatusLabel(truth.application) : "غير متاحة"}. ما رح أقول إن الواجهة الثانية صحيحة أو خاطئة من غير مزامنة؛ إذا ظل التعارض ظاهرًا فهذا يحتاج فحص مزامنة للحالة.`;
}

function continuationPart(turn: InterpretedTurn, state: ConversationState, truth: TruthBundle) {
  const stage = applicationJourneyStage(truth.application);
  if (["payment_proof_pending_admin", "payment_confirmed_under_review", "approved"].includes(stage)) return "اختيار الاستمرار موجود أصلًا على الطلب، وخطوة الدفع/الدراسة ماشية حسب الحالة الحالية. ما في داعي تعيد تأكيد الاستمرار.";
  if (["cancelled", "refund_requested", "refund_completed"].includes(stage)) return reopenCancelledPart(truth);
  const visible = currentCommercialDisclosureVisible(state, truth);
  if (stage === "preliminary_approved_waiting_decision" && !visible) return buildInformedCommercialDisclosureReply(truth);
  if (stage === "preliminary_approved_waiting_decision" || stage === "continuation_confirmed_fee_due") {
    const links = buildOfficialLinkContext({ ...turn, topics: Array.from(new Set([...turn.topics, "payment_fee", "payment_method", "receipt_upload", "continuation"])) as InterpretedTurn["topics"] }, truth);
    return buildPostDisclosurePaymentReply(truth, links.relevant.receipt || null);
  }
  return `وصلني إنك بدك تستمر. حالة طلبك الحالية: ${truth.application ? customerFacingStatusLabel(truth.application) : "غير متاحة"}.`;
}

function contractTermsPart(truth: TruthBundle) {
  return `${truth.policy.commercialStructureRule} ${truth.policy.additionalFeesRule} ${truth.policy.firstInstallmentRule} ${truth.policy.requirementsGuidanceRule}`.replace(/\s+/g, " ").trim();
}

function repeatRepairReply(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }) {
  const status = statusPart(input.truth);
  const timing = timingPart(input.truth);
  if (status) return `معك حق، وما رح أعيد نفس الجملة عليك. ${status}${timing ? ` ${timing}` : ""}\n\nإذا ما ظهر قرار جديد بالنظام، ما رح أختلق تحديث؛ وإذا في خطوة مطلوبة منك بحكيلك إياها مباشرة.`;
  return "معك حق، وما رح أعيد نفس الجملة عليك. ما عندي حقيقة جديدة موثقة أضيفها هسا، وإذا بتعيد النقطة اللي بدك جوابها بكلمتين بجاوبها مباشرة بدون لف.";
}

function legalNoticeReply() {
  return "وصلت الرسالة وفهمت إنها إشعار/مطالبة قانونية، مش استفسار عميل عادي. استلام الرسالة هون ما يعني إقرارًا بصحة أي ذمة أو التزام وارد فيها، وما رح أحولها لرد ثقة أو تسجيل تجاري. لأي تبليغ أو مطالبة قانونية رسمية، لازم تعتمدوا المستندات والقنوات القانونية الرسمية الموثقة.";
}

export function buildAnswerBundleReply(input: { bundle: AnswerBundle; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): string | null {
  if (input.bundle.kind === "legal_notice") return legalNoticeReply();
  if (input.bundle.kind === "repeat_repair") return repeatRepairReply(input);
  if (input.bundle.kind === "application_start") return applicationStartPart(input.turn, input.truth);
  if (!["single_question", "multi_question"].includes(input.bundle.kind)) return null;
  const f: QuestionFlags = qFlags(input.turn, input.truth);
  const parts: string[] = [];
  const empathy = empathyPrefix(input.turn); if (empathy && input.bundle.kind === "multi_question") parts.push(empathy);
  if (f.continuationDecision) parts.push(continuationPart(input.turn, input.state, input.truth));
  if (f.reopenCancelled) parts.push(reopenCancelledPart(input.truth));
  if (f.statusConflict) parts.push(statusConflictPart(input.truth));
  if (f.applicationStatus) { const x = statusPart(input.truth); if (x) parts.push(x); }
  if (f.escalationRequest) parts.push(escalationPart(input.truth));
  if (f.reviewTiming) { const x = timingPart(input.truth); if (x) parts.push(x); }
  if (f.acceptanceProbability) parts.push(acceptanceProbabilityPart());
  if (f.accessoriesQuestion) parts.push(accessoriesPart());
  if (f.supportComplaint) parts.push(supportComplaintPart());
  if (f.contactPhone) parts.push(contactPhonePart());
  if (f.requirements) parts.push(requirementsPart(input.truth));
  if (f.guarantor) parts.push(guarantorPart());
  if (f.multipleDevices) parts.push(multipleDevicesPart());
  if (f.interest) parts.push(interestPart(input.truth));
  if (f.downPayment) parts.push(downPaymentPart(input.truth));
  if (f.feePaymentMethod) parts.push(feePaymentMethodPart(input.turn, input.state, input.truth));
  if (f.feeDueNow) parts.push(feeDueNowPart(input.state, input.truth));
  if (f.feeRefundability) parts.push(feeRefundabilityPart(input.truth));
  if (f.bankInstallmentChannel) parts.push(bankInstallmentChannelPart());
  if (f.deliveryTiming) parts.push(deliveryTimingPart(input.turn, input.truth));
  if (f.installmentQuote) parts.push(installmentQuotePart(input.truth));
  if (f.monthlyTarget) parts.push(monthlyTargetPart(input.truth));
  if (f.installmentDuration) parts.push(installmentDurationPart(input.truth));
  if (f.priceChange) parts.push(priceChangePart());
  if (f.contractTerms) parts.push(contractTermsPart(input.truth));
  if (f.businessIdentity) parts.push(businessIdentityPart(input.truth));
  if (f.supplierAuthorization) parts.push(supplierAuthorizationPart(input.truth));
  if (f.officeHours) parts.push(officeHoursPart());
  if (f.remoteProcess) parts.push(remoteProcessPart());
  if (f.officeLocation) parts.push(officeLocationPart(input.truth));
  if (f.applicationStart) parts.push(applicationStartPart(input.turn, input.truth));
  return Array.from(new Set(parts.filter(Boolean))).join("\n\n") || null;
}
