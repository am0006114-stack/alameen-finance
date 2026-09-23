import { normalizeArabic } from "./text";
import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

function n(value: string | null | undefined) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return normalizeArabic(String(value || ""))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nearbyContext(state: ConversationState) {
  return n([state.lastCustomerText || "", state.lastAssistantText || ""].filter(Boolean).join(" "));
}

function recentReleaseDeviceQuestion(q: string) {
  const iphone18 = /(?:ايفون|آيفون|iphone)?\s*18(?:\s*(?:pro\s*max|pro|max|برو\s*ماكس|برو))?|18\s*(?:pro\s*max|pro|max|برو\s*ماكس|برو).{0,12}(?:ايفون|آيفون|iphone)?/i.test(q);
  const genericFresh = /(?:جهاز|موديل).{0,22}(?:حديث\s*جدا|حديث\s*جدًا|جديد\s*نازل|لسا\s*نازل|نازل\s*جديد)/.test(q);
  return iphone18 || genericFresh;
}

function lastProductReferent(state: ConversationState) {
  const fact = [...(state.facts || [])].reverse().find((item) => item.key === "last_product_referent");
  return n(fact?.value || "");
}

function productAvailabilityFollowup(q: string) {
  return /^(?:مافي|ما\s+في|مش\s+موجود|مو\s+موجود|مش\s+ظاهر|مو\s+ظاهر)$|(?:قصدي).{0,30}(?:متي|امتي|ايمتي).{0,25}(?:يوصل|يتوفر|يجي)|(?:متي|امتي|ايمتي).{0,25}(?:يوصل|يتوفر|يجي|ينزل)|(?:شو\s+هاليوم|شو\s+هاليوم|يعني\s+متي)/.test(q);
}

function asksReleaseAvailabilityOrPrice(q: string) {
  return /(?:متى|امتى|ايمتى|توفر|يتوفر|ينزل|يوصل|يجي|عندكم|في\s+اقساط|تقسيط|كم\s+قسط|قسط\s+شهري|كم\s+سعر|سعرو|سعره|بكم)/.test(q);
}

function asksChangeToRecentRelease(q: string) {
  return /(?:اغير|أغير|تغيير|بدل|استبدل|احول|أحول).{0,35}(?:18|ايفون\s*18|آيفون\s*18|iphone\s*18)|(?:من).{0,25}(?:16|17).{0,25}(?:ل|الى|إلى).{0,12}(?:18)/i.test(q);
}

function explicitCurrentCatalogProductQuestion(q: string) {
  const model = /(?:ايفون|iphone)\s*(?:15|16|17)(?:\s*(?:pro\s*max|pro|max|plus|air|e|برو\s*ماكس|برو|ماكس|بلس|اير))?/i.test(q);
  const ask = /(?:كم\s+سعر|قديش\s+سعر|شو\s+سعر|سعرو|سعره|بكم|كم\s+قسط|قسط\s+شهري|تقسيط|متوفر|موجود)/.test(q);
  return model && ask;
}

function feePurposeQuestion(q: string) {
  return /(?:لشو|ليش|شو\s+سبب|شو\s+هي|شو\s+هاي|مقابل\s+شو|تبع\s+شو|على\s+شو).{0,30}(?:(?:5|خمس|خمسه)\s*(?:دنانير|دينار|ليرات|ليره)?|رسوم\s+فتح\s+الملف)|(?:(?:5|خمس|خمسه)\s*(?:دنانير|دينار|ليرات|ليره)?|رسوم\s+فتح\s+الملف).{0,30}(?:لشو|ليش|مقابل\s+شو|تبع\s+شو)/.test(q);
}

function feeDeclineOrPause(q: string, ctx: string) {
  const feeContext = /(?:5|خمس|خمسه)\s*(?:دنانير|دينار|ليرات|ليره)?|رسوم\s+فتح\s+الملف|بيانات\s+الدفع|حول|تحويل/.test(ctx);
  const direct = /(?:لا\s+ما|ما|مش|مو|بديش|ما\s+رح|مش\s+رح|لن).{0,20}(?:ادفع|أدفع|بدفع|احول|أحول|بحول).{0,30}(?:هسا|الان|الآن|حاليا|حاليًا|شي|اشي|إشي)?|(?:بدون).{0,18}(?:ما\s+ادفع|ادفع|أدفع|دفع)|(?:ما\s+بدي|بديش).{0,24}(?:دفع|ادفع|أدفع|اكمل|أكمل).{0,18}(?:هسا|الان|الآن|حاليا|حاليًا)?/.test(q);
  return direct && (feeContext || /(?:5|خمس|خمسه|رسوم\s+فتح\s+الملف)/.test(q));
}

function finalApprovalBeforeFeeConfusion(q: string, ctx: string) {
  const saysAfterFinal = /(?:بس|لكن|طيب)?\s*(?:بعد|لما|وقت).{0,28}(?:الموافقه).{0,12}(?:النهاييه)|(?:ما\s+بدفع|بدفع|بحول|بكمل).{0,30}(?:بعد|لما).{0,24}(?:الموافقه).{0,12}(?:النهاييه)/.test(q);
  const commercialContext = /(?:موافقه\s+مبدئيه|موافقة\s+مبدئية|اود\s+الاستمرار|أود\s+الاستمرار|رسوم\s+فتح\s+الملف|5\s+دنانير|خمس\s+دنانير)/.test(ctx);
  return saysAfterFinal && commercialContext;
}

function paymentDeferralQuestion(q: string, ctx: string) {
  const ask = /(?:بزبط|بصير|ممكن|بقدر|هل).{0,22}(?:اجل|أجل|ااخر|أاخر|اخر|أخر|أأجل|أجل).{0,18}(?:الدفع|التحويل)|(?:اجل|أجل|ااخر|اخر|أخر|أأجل).{0,18}(?:الدفع|التحويل).{0,20}(?:لقدام|لبعدين|بعدين)?|(?:الدفع|التحويل).{0,20}(?:بعدين|لقدام|لاحقا|لاحقًا).{0,15}(?:بزبط|بصير|ممكن)?/.test(q);
  const installment = /(?:قسط|الاقساط|الأقساط)/.test(q);
  const feeContext = /(?:رسوم\s+فتح\s+الملف|5\s+دنانير|خمس\s+دنانير|اود\s+الاستمرار|أود\s+الاستمرار|بيانات\s+الدفع)/.test(ctx);
  return ask && !installment && feeContext;
}

function directReviewTimingQuestion(q: string, state: ConversationState) {
  const direct = /(?:متي|امتي|ايمتي|قديش).{0,40}(?:تنتهي|تنخلص|تخلص|يخلص|انهاء|إنهاء|تنتهي|الدراسه\s+النهائيه|الدراسة\s+النهائية|المراجعه\s+النهائيه|المراجعة\s+النهائية)|(?:الدراسه\s+النهاييه|المراجعه\s+النهاييه).{0,35}(?:متي|امتي|قديش|تنتهي|تخلص)/.test(q);
  if (direct) return true;
  const previous = n(state.lastCustomerText);
  return /^(?:النهاييه)$/.test(q) && /(?:متي|امتي|قديش).{0,45}(?:الدراسه|تنتهي|تخلص|انهاء)/.test(previous);
}

export type HumanCompanyOverrideKind =
  | "none"
  | "installment_adjustment"
  | "whatsapp_only_preference"
  | "specific_approval_date_claim"
  | "persona_name_question"
  | "no_links_acknowledgement"
  | "sensitive_document_on_whatsapp"
  | "income_proof_source"
  | "official_external_number"
  | "fee_purpose"
  | "fee_decline_or_pause"
  | "final_approval_before_fee_confusion"
  | "payment_deferral"
  | "review_timing_direct"
  | "recent_release_device"
  | "recent_release_change"
  | "catalog_product_question";

export function resolveHumanCompanyOverride(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): HumanCompanyOverrideKind {
  const q = n(input.turn.rawText);
  if (!q) return "none";
  const ctx = nearbyContext(input.state);
  const productReferent = lastProductReferent(input.state);
  const currentOrRememberedRecentRelease = recentReleaseDeviceQuestion(q) || (input.state.currentTopic === "products" && recentReleaseDeviceQuestion(productReferent));

  // Phase 7.6.1 Human Meaning Authority: raw current meaning outranks classifier/state.
  if (recentReleaseDeviceQuestion(q) && asksChangeToRecentRelease(q)) return "recent_release_change";
  if (currentOrRememberedRecentRelease && (asksReleaseAvailabilityOrPrice(q) || productAvailabilityFollowup(q))) return "recent_release_device";
  if (explicitCurrentCatalogProductQuestion(q)) return "catalog_product_question";
  if (feePurposeQuestion(q)) return "fee_purpose";
  if (finalApprovalBeforeFeeConfusion(q, ctx)) return "final_approval_before_fee_confusion";
  if (feeDeclineOrPause(q, ctx)) return "fee_decline_or_pause";
  if (paymentDeferralQuestion(q, ctx)) return "payment_deferral";
  if (directReviewTimingQuestion(q, input.state)) return "review_timing_direct";

  if (/(?:قسطين|قسطين\s+بنفس\s+الشهر|شهرين\s+بنفس\s+الوقت|ادفع\s+ضعف|ادفع\s+مرتين|اسدد\s+الجهاز\s+كامل|ادفع\s+المبلغ\s+كامل|ادفعو\s+مره\s+وحده|ادفعه\s+مره\s+وحده)/.test(q)) return "installment_adjustment";
  if (/(?:ابعتلي|ابعثلي|راسلني).{0,25}(?:واتساب|واتس).{0,30}(?:لا\s*ترن|لا\s*تتصل|مش\s*مكالمه|مش\s*مكالمة)?|(?:بس\s+يتم|لما\s+يتم).{0,30}(?:الموافقه|الموافقة).{0,30}(?:واتساب|واتس).{0,20}(?:لا\s*ترن|لا\s*تتصل)?/.test(q)) return "whatsapp_only_preference";
  if (/(?:حسب\s+الموقع|الموقع\s+حكولي|حكولي\s+بالموقع).{0,60}(?:(?:موافقه|الموافقة).{0,25}\d{1,2}|\d{1,2}.{0,25}(?:موافقه|الموافقة)).{0,20}(?:صح|صحيح)?/.test(q)) return "specific_approval_date_claim";
  if (/^(?:اسمك\s+)?(?:عمران|عبدالله|عبد\s*الرحمن|تالا|فدوه|فدوة)\s*(?:شو|ايش|إيش|؟)?$/.test(q) || /^(?:اسمك|انت\s+اسمك|إنت\s+اسمك).{0,20}(?:عمران|عبدالله|عبد\s*الرحمن|تالا|فدوه|فدوة)/.test(q)) return "persona_name_question";
  if (input.state.conversationConstraints?.noLinks && /(?:مابدي|ما\s*بدي|بديش|لا).{0,18}(?:رابط|روابط)/.test(q)) return "no_links_acknowledgement";
  if (/(?:من\s+اي\s+بنك|اي\s+بنك).{0,35}(?:كشف\s+الحساب|كشف\s+حساب)|(?:زين\s*كاش|zain\s*cash).{0,35}(?:بنفع|مقبول|كشف|اثبات)|(?:كشف\s+الحساب|اثبات\s+الدخل).{0,35}(?:زين\s*كاش|zain\s*cash)/i.test(q)) return "income_proof_source";
  if (/(?:رقم).{0,25}(?:الجرايم\s+الالكترونيه|الجرائم\s+الالكترونيه|الجرائم\s+الإلكترونية|جرائم\s+الكترونيه|جرايم\s+الكترونيه)/.test(q)) return "official_external_number";
  const appStatus = String(input.truth.application?.status || input.state.lastVerifiedApplication?.application.status || "").toLowerCase();
  const needsSensitive = /(?:needs_identity|identity_requested|needs_salary_slip|salary_slip_link_sent)/.test(appStatus);
  const sentHere = /(?:بعتها|بعثتها|ارسلتها|أرسلتها|بعتتها).{0,16}(?:هون|هنا|الواتساب|واتساب)|(?:هويتي|الهويه|الهوية|كشف\s+الراتب|شهاده\s+الراتب|شهادة\s+الراتب).{0,24}(?:هون|واتساب)|تم\s+استلام\s+(?:صوره|صورة|مرفق).{0,30}(?:بدون\s+تعليق)?/.test(q);
  if (needsSensitive && sentHere) return "sensitive_document_on_whatsapp";
  return "none";
}

function reviewTimingReply(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return `${truth.policy.normalReviewWindow}، ومع ضغط المراجعات الحالي بعض الملفات بتتجاوز هالمدة. ما عندي موعد نهائي موثق أقدر أضمنه.`;
  const stage = applicationJourneyStage(app);
  if (stage === "preliminary_approved_waiting_decision") return `الدراسة النهائية ما بدأت بعد؛ بتبدأ بعد اختيار الاستمرار وفتح الملف. بعدها ${truth.policy.normalReviewWindow}، ومع ضغط المراجعات الحالي بعض الملفات ممكن تتأخر أكثر، بدون موعد نهائي مضمون.`;
  if (["final_review", "under_review", "payment_confirmed_under_review"].includes(stage)) return `طلبك في الدراسة النهائية. ${truth.policy.normalReviewWindow}، لكن هالفترة في ضغط مراجعات شديد وبعض الملفات بتتجاوز هالمدة. ما بقدر أعطيك يوم أو ساعة مؤكدة قبل صدور القرار فعليًا.`;
  return `${truth.policy.normalReviewWindow}، لكن ما بقدر أحدد موعد نهائي قبل ما تكون مرحلة المراجعة الحالية واضحة ومكتملة على الطلب.`;
}

export function buildHumanCompanyOverrideReply(input: { kind: HumanCompanyOverrideKind; state: ConversationState; truth: TruthBundle }) {
  const app = input.truth.application || input.state.lastVerifiedApplication?.application || null;
  switch (input.kind) {
    case "fee_purpose":
      return `الخمس دنانير هي رسوم فتح الملف واستكمال إجراءات الطلب بعد الموافقة المبدئية، مش دفعة أولى ولا جزء من سعر الجهاز ولا القسط الأول. إذا اخترت تكمل فهي الخطوة اللي تفتح الدراسة النهائية، وإذا ما بدك تدفع هسا ما في ضغط عليك؛ بتقدر توقف هون وتكمل لاحقًا. وإذا دفعتها وبعدين ألغيت بعد دفع مؤكد، بتدخل بمسار الاسترداد الرسمي.`;
    case "fee_decline_or_pause":
      return "تمام، ما في مشكلة وما رح أضغط عليك تدفع هسا. بما إن رسوم فتح الملف هي الخطوة اللي تفتح الدراسة النهائية بعد اختيار الاستمرار، الطلب بيضل بانتظار فتح الملف لحد ما تقرر تكمل. وما اعتبرت كلامك إلغاءً للطلب.";
    case "final_approval_before_fee_confusion":
      return "بس أوضحلك ترتيب الخطوات حتى ما يصير لخبطة: الموافقة الموجودة أولًا مبدئية، والدراسة النهائية ما بتبدأ إلا بعد ما تختار الاستمرار وتفتح الملف برسوم الـ5 دنانير. يعني الموافقة النهائية ما بتجي قبل فتح الملف. إذا ما بدك تدفع هسا ما في مشكلة، بس الطلب بيضل واقف قبل الدراسة النهائية لحد ما تقرر تكمل.";
    case "payment_deferral":
      return "نعم، بتقدر ما تدفع رسوم فتح الملف هسا وتكمل لاحقًا لما تكون جاهز. بس الدراسة النهائية ما بتبدأ قبل فتح الملف، لذلك الطلب بيضل بانتظار هالخطوة. هذا مش إلغاء للطلب، وما رح أعيد عليك بيانات التحويل إلا لما تطلبها أو تقرر تدفع.";
    case "review_timing_direct":
      return reviewTimingReply(input.truth);
    case "recent_release_device":
      return input.truth.policy.recentReleaseAvailabilityRule || "أجهزة iPhone 18 Pro وPro Max موجودة ضمن الأجهزة المعروضة للتقديم، والاستلام بعد شهر من الموافقة النهائية وبموعد مؤكد من المكتب؛ وجودها بالكتالوج لا يعني استلامًا فوريًا.";
    case "recent_release_change":
      return `${input.truth.policy.recentReleaseAvailabilityRule || "أجهزة iPhone 18 Pro وPro Max معروضة للتقديم ضمن الكتالوج الرسمي."} تغيير الجهاز على طلب قائم ما بصير من المحادثة وحدها؛ لازم يعتمد على الإجراء الفعلي والحسبة المعتمدة للطلب.`;
    case "catalog_product_question": {
      const q = n(input.state.lastCustomerText || "");
      const appName = n(app?.deviceName || "");
      const sameApp = Boolean(app?.devicePrice != null && appName && q && (q.includes(appName) || appName.includes(q)));
      if (sameApp) return `السعر المسجل على طلبك لهذا الجهاز هو ${app?.devicePrice} دينار${app?.monthlyPayment != null ? `، والقسط الشهري التقريبي ${app.monthlyPayment} دينار لمدة ${app.installmentMonths || "المدة المسجلة"} شهر` : ""}. إذا قصدك سعر السوق الحالي خارج طلبك، المرجع هو صفحة المنتجات الرسمية.`;
      return "فهمتك، سؤالك عن موديل جهاز وسعره/قسطه الحالي، مش عن أعمار ولا عن حالة طلب قديم. السعر والقسط لازم ناخذهم من صفحة المنتجات والحسبة الرسمية الحالية؛ ما رح أخمّن رقم من عندي إذا القيمة نفسها مش ظاهرة عندي بهالرسالة.";
    }
    case "installment_adjustment":
      return "إذا قصدك تسدد كامل الرصيد بدري أو تدفع أكثر من قسط بنفس الشهر، ما عندي قاعدة موثقة على ملفك أقدر أأكد منها إن هذا مسموح أو كيف ينحسب. هالنقطة لازم تتأكد من شروط العقد أو الإدارة وقتها، وما رح أخمّن عليك بنظام سداد مش مثبت.";
    case "whatsapp_only_preference":
      return "تمام، وصلتني: بدك تحديث الموافقة على واتساب فقط، بدون مكالمة. ما رح أعكس طلبك وأعتبرك طالب اتصال.";
    case "specific_approval_date_claim":
      return `إذا الموقع أو صفحة عندك أظهرت تاريخًا محددًا للموافقة، ما بقدر أعتبره موعد قرار مضمون من غير ما يكون مثبت فعليًا على الطلب. ${app ? `الحالة الموثقة هسا: ${customerFacingStatusLabel(app)}.` : "ما عندي حالة موثقة تضيف موعدًا محددًا."} القرار الفعلي هو اللي نعتمد عليه.`;
    case "persona_name_question":
      return "نعم، معك عمران من فريق الأمين للأقساط. احكيلي شو بدك وأنا بكمل معك بنفس الموضوع.";
    case "no_links_acknowledgement":
      return "تمام، ما رح أبعثلك روابط بهالمحادثة إلا إذا طلبتها أنت. بكمل معك بالنص مباشرة.";
    case "sensitive_document_on_whatsapp":
      return "وصلتني رسالتك، بس إذا المرفق هوية أو إثبات دخل ما بنعتمده من واتساب حفاظًا على بياناتك. ارفعه فقط من الرابط الرسمي الآمن المرتبط بطلبك؛ وما رح أعتبر مستند واتساب مستلم رسميًا.";
    case "income_proof_source":
      return "كشف الحساب المقصود يكون كشفًا بنكيًا رسميًا يوضح حركة الحساب ومصدر الدخل قدر الإمكان. ما عندي اعتماد موثق أقدر أؤكد منه إن Zain Cash يُقبل بدل كشف الحساب البنكي، لذلك ما رح أوعدك فيه كبديل؛ الدراسة هي اللي تحدد المستند المقبول النهائي.";
    case "official_external_number":
      return "ما عندي رقم رسمي موثق للجرائم الإلكترونية ضمن بيانات الأمين أقدر أعطيك إياه بثقة، وما رح أخمّن برقم. إذا بدك رقم جهة خارجية محددة، لازم نعتمد مصدر رسمي محدث بدل ما أعطيك معلومة غير مؤكدة.";
    default:
      return null;
  }
}
