import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type AnswerBundleKind = "multi_question" | "application_start" | "repeat_repair" | "legal_notice" | "none";
export type AnswerBundle = { kind: AnswerBundleKind; reasons: string[] };

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function qFlags(turn: InterpretedTurn, truth: TruthBundle) {
  const q = n(turn.rawText);
  const requirements = /(?:الاوراق|الأوراق|المستندات|الوثائق|الشروط|المتطلبات|اثبات\s+الدخل|إثبات\s+الدخل)/.test(q);
  const guarantor = /(?:كفيل|الكفيل)/.test(q);
  const multipleDevices = /(?:تلفونين|هاتفين|جهازين|2\s*جهاز|٢\s*جهاز|اخد\s*2|اخد\s*٢|آخذ\s*2|آخذ\s*٢)/.test(q);
  const interest = /(?:الفائده|الفائدة|فايده|فائدة|مرابحه|مرابحة|نسبه\s+الربح|نسبة\s+الربح)/.test(q);
  const downPayment = /(?:دفعه|دفعة).{0,12}(?:اولي|اولى|أولى)|(?:بدون|في|هل).{0,18}(?:دفعه|دفعة).{0,10}(?:اولي|اولى|أولى)/.test(q);
  const officeLocation = turn.topics.includes("office_location") || /(?:وين|اين|أين).{0,24}(?:موقعكم|المكتب|المحل|العنوان)|(?:موقعكم|المكتب|المحل).{0,18}(?:وين|بالزبط|بالضبط)/.test(q);
  const monthlyTarget = /(?:ادفع|أدفع|قسط|القسط).{0,24}(?:كل\s+شهر|شهري|بالشهر).{0,18}(?:\d+|[٠-٩]+)\s*(?:دينار)?|(?:\d+|[٠-٩]+)\s*(?:دينار)?\s*(?:كل\s+شهر|بالشهر|شهريا|شهريًا)/.test(q);
  const installmentDuration = turn.topics.includes("installment_duration") || /(?:على|خلال|مده|مدة).{0,15}(?:ست|6|٦|سبع|7|٧|اثنا\s+عشر|12|١٢|\d+|[٠-٩]+)\s*(?:اشهر|أشهر|شهر)|(?:ست|6|٦)\s*(?:اشهر|أشهر).{0,16}(?:او\s+اقل|أو\s+أقل)/.test(q);
  const priceChange = turn.topics.includes("product_price") || /(?:سعر\s+الجهاز|السعر).{0,28}(?:يختلف|يتغير|بتغير|بختلف|نفسه)|(?:يختلف|يتغير|بتغير|بختلف).{0,28}(?:سعر\s+الجهاز|السعر)/.test(q);
  const applicationStatus = Boolean(truth.application) && (turn.topics.includes("application_status") || /(?:شو|ايش|اش).{0,18}(?:صار|وضع|حاله|حالة).{0,18}(?:طلبي|الطلب)|(?:حاله|حالة)\s+(?:الطلب|طلبي)/.test(q));
  const reviewTiming = /(?:متى|امتى|قديش|كم|اليوم|بكرا|السبت).{0,32}(?:قرار|موافقه|الموافقة|يخلص|جاهز|وقت)|(?:تاخرتو|تأخرتوا|طولتوا|صارلي|صارله|مر\s+\d+\s+ايام|[٤4]\s+ايام)/.test(q);
  const applicationStart = /(?:كيف|وين|من\s+وين).{0,28}(?:اقدم|أقدم|ارفع\s+طلبي|أرفع\s+طلبي|اعمل\s+طلب|أعمل\s+طلب)|(?:ما\s+قدمت|لسا\s+ما\s+قدمت).{0,30}(?:كيف|وين|التقديم)|(?:رابط).{0,18}(?:التقديم|قدم\s+طلب)/.test(q);
  const legalNotice = /(?:دعوى\s+قضائيه|دعوى\s+قضائية|تبليغ\s+قانوني|اشعار\s+قانوني|إشعار\s+قانوني|وكيل\s+قانوني|ذمم|ذمه\s+مستحقه|ذمة\s+مستحقة)/.test(q);
  const repeatRepair = /(?:ما\s+تعيد|لا\s+تعيد|نفس\s+الجمله|نفس\s+الجملة|نفس\s+الرد|جاوبني\s+بدون\s+تكرار)/.test(q);
  return { requirements, guarantor, multipleDevices, interest, downPayment, officeLocation, monthlyTarget, installmentDuration, priceChange, applicationStatus, reviewTiming, applicationStart, legalNotice, repeatRepair };
}

export function resolveAnswerBundle(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): AnswerBundle {
  const f = qFlags(input.turn, input.truth);
  if (f.legalNotice) return { kind: "legal_notice", reasons: ["legal notice must not route to trust/registration template"] };
  if (f.repeatRepair) return { kind: "repeat_repair", reasons: ["customer explicitly rejected repetition"] };
  if (f.applicationStart && (!input.truth.application || /(?:ما\s+قدمت|لسا\s+ما\s+قدمت)/.test(n(input.turn.rawText)))) return { kind: "application_start", reasons: ["customer asks how/where to apply instead of requesting status"] };
  const material = Object.entries(f).filter(([k,v]) => !["applicationStart","legalNotice","repeatRepair"].includes(k) && v).map(([k]) => k);
  if (material.length >= 2) return { kind: "multi_question", reasons: material };
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
  return `المعدل الطبيعي للمراجعة ${window}، لكن ${pressure} وما بقدر أضمن يوم محدد قبل ما يصدر القرار فعليًا.`;
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

function interestPart(truth: TruthBundle) {
  const app = truth.application;
  if (app && typeof app.interestRate === "number" && Number.isFinite(app.interestRate)) return `نسبة الربح/الحسبة المسجلة على طلبك حاليًا ${app.interestRate}%. المرجع النهائي يظل الحسبة وجدول العقد.`;
  return `${truth.policy.commercialStructureRule} ما عندي نسبة ثابتة لسنة ونص أقدر أخمّنها بدون حسبة الجهاز والمدة؛ السعر والقسط والإجمالي لازم يطلعوا من الحسبة الرسمية للطلب.`;
}

function downPaymentPart(truth: TruthBundle) {
  return `ما في دفعة أولى على الجهاز. ${truth.policy.firstInstallmentRule} ورسوم فتح الملف ${truth.policy.fileOpeningFeeJod || 5} دنانير خطوة منفصلة بعد الموافقة المبدئية واختيار الاستمرار، ومش دفعة أولى.`;
}

function officeLocationPart(truth: TruthBundle) {
  return `${truth.policy.generalLocation}. الحضور للمكتب بموعد رسمي مؤكد فقط، مش زيارة مفتوحة.`;
}

function monthlyTargetPart(truth: TruthBundle) {
  const app = truth.application;
  if (app && typeof app.monthlyPayment === "number" && Number.isFinite(app.monthlyPayment) && typeof app.installmentMonths === "number" && Number.isFinite(app.installmentMonths)) {
    return `الحسبة المسجلة على طلبك حاليًا هي تقريبًا ${app.monthlyPayment} دينار شهريًا لمدة ${app.installmentMonths} شهر. إذا بدك هدف مختلف مثل مبلغ شهري محدد، ما بقدر أعتبره معتمد إلا لما تتغير الحسبة الرسمية على الطلب.`;
  }
  return "إذا عندك هدف مثل 75 دينار بالشهر، بقدر أفهمه كطلب حسبة، لكن ما بقدر أضمن الرقم أو أعتمده من المحادثة قبل ما تطلع الحسبة الرسمية للجهاز والمدة.";
}

function installmentDurationPart(truth: TruthBundle) {
  const months = truth.application?.installmentMonths;
  if (typeof months === "number" && Number.isFinite(months)) return `المدة المسجلة حاليًا على طلبك ${months} شهر. طلب 6 أشهر أو أقل ما بعتبره متاح أو منفذ إلا إذا الحسبة الرسمية للطلب سمحت فيه وتحدثت بيانات الطلب.`;
  return "بالنسبة لـ6 أشهر أو أقل: ما عندي مدة قصيرة موثقة أقدر أضمنها من المحادثة؛ لازم تعتمد على المدد والحسبة الرسمية المتاحة للطلب نفسه.";
}

function priceChangePart() {
  return "وبخصوص سعر الجهاز إذا قصّرت المدة: ما عندي قاعدة موثقة أقدر أقول منها إن سعر الجهاز نفسه رح يتغير. اللي نعتمده هو السعر/الإجمالي والقسط اللي يطلعوا بالحسبة الرسمية، بدون تخمين.";
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
  if (input.bundle.kind !== "multi_question") return null;
  const f = qFlags(input.turn, input.truth);
  const parts: string[] = [];
  const empathy = empathyPrefix(input.turn); if (empathy) parts.push(empathy);
  if (f.applicationStatus) { const x=statusPart(input.truth); if(x) parts.push(x); }
  if (f.reviewTiming) { const x=timingPart(input.truth); if(x) parts.push(x); }
  if (f.requirements) parts.push(requirementsPart(input.truth));
  if (f.guarantor) parts.push(guarantorPart());
  if (f.multipleDevices) parts.push(multipleDevicesPart());
  if (f.interest) parts.push(interestPart(input.truth));
  if (f.downPayment) parts.push(downPaymentPart(input.truth));
  if (f.monthlyTarget) parts.push(monthlyTargetPart(input.truth));
  if (f.installmentDuration) parts.push(installmentDurationPart(input.truth));
  if (f.priceChange) parts.push(priceChangePart());
  if (f.officeLocation) parts.push(officeLocationPart(input.truth));
  if (f.applicationStart) parts.push(applicationStartPart(input.turn,input.truth));
  return parts.filter(Boolean).join("\n\n") || null;
}
