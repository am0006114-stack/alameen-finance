import type { PolicyTruth } from "./types";
import {
  ALAMEEN_DOWN_PAYMENT_RULE,
  ALAMEEN_FIRST_INSTALLMENT_RULE,
  ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE,
  ALAMEEN_OFFICE_OPERATION_RULE,
  IPHONE18_PICKUP_RULE,
} from "./businessTruthRegistry";
import {
  FILE_OPENING_PAYMENT_ALIASES,
  FILE_OPENING_PAYMENT_BENEFICIARY,
  FILE_OPENING_PAYMENT_PHONE,
  FILE_OPENING_PAYMENT_WALLET_TYPE,
  currentFileOpeningPaymentRule,
} from "./paymentDestinationOverride";

type ReviewPressureLevel = PolicyTruth["reviewPressureLevel"];

function pressureLevel(): ReviewPressureLevel {
  const raw = String(process.env.ALAMEEN_REVIEW_PRESSURE_LEVEL || "severe").trim().toLowerCase();
  if (raw === "normal" || raw === "high" || raw === "severe") return raw;
  return "severe";
}

function pressureRule(level: ReviewPressureLevel) {
  if (level === "normal") return "حركة المراجعات ضمن المعدل الطبيعي حاليًا. لا يُعطى موعد دقيق إلا إذا كان موثقًا على الطلب.";
  if (level === "high") return "يوجد حاليًا ضغط مرتفع على المراجعات وقد تتجاوز بعض الملفات المعدل الطبيعي. يُشرح ذلك بصراحة ومن دون وعد بتاريخ غير موثق.";
  return "يوجد حاليًا ضغط مراجعات شديد جدًا وقد تتجاوز بعض الملفات المعدل الطبيعي بوضوح. يُشرح ذلك بصراحة ومن دون إعطاء موعد مؤكد أو وعد بالتنفيذ.";
}

function buildPolicy(): PolicyTruth {
  const level = pressureLevel();
  return {
    businessName: "الأمين للأقساط",
    generalLocation: "عمّان – شارع المدينة المنورة",
    fileOpeningFeeJod: 5,
    fileOpeningFeeTiming: "تُطلب فقط بعد التأهيل المبدئي إذا اختار العميل الاستمرار",
    fileOpeningFeePurposeRule: "هي رسوم فتح الملف واستكمال إجراءات الطلب بعد الموافقة المبدئية. هدفها تنظيم الدخول للدراسة النهائية وقياس جدية الطلب والاستعداد المبدئي لإكمال الالتزامات المالية في ظل حجم كبير جدًا من الطلبات، حتى لا تؤخر الطلبات غير الجادة معالجة العملاء الجادين. هي مؤشر أولي فقط وليست تقييمًا نهائيًا للقدرة الائتمانية ولا ضمانًا للموافقة، وليست ثمنًا للجهاز ولا قسطًا مقدمًا ولا القسط الأول.",
    fileOpeningFeeRefundRule: "رسوم فتح الملف مستردة بالكامل عبر المسار الرسمي إذا لم تصدر الموافقة النهائية بعد دفع مؤكد، وكذلك إذا قرر العميل إلغاء الطلب بعد دفعها، على أن يكون الدفع مثبتًا ومؤكدًا إداريًا.",
    continuationReassuranceRule: "اشرح الخطوة بوضوح واحترام ومن دون ضغط: العميل يجب أن يعرف سبب الرسوم وما الذي تفتحه قبل تثبيت قراره. الموافقة المبدئية ليست نهائية، والـ5 دنانير ليست شراءً للموافقة ولا التزامًا بثمن الجهاز. القرار للعميل، ويجوز له أخذ وقته قبل الاختيار. إذا دفع ولم تصدر الموافقة النهائية فالرسوم مستردة بالكامل عبر المسار الرسمي، وإذا دفع ثم قرر الإلغاء فحقه محفوظ وفق مسار الإلغاء والاسترداد. لا تستخدم صياغة من نوع ادفع أو توقف، ولا تخويفًا أو استعجالًا مصطنعًا.",
    commercialStructureRule: "نظام التعامل عند الأمين للأقساط مرابحة وليس قرضًا ربويًا.",
    additionalFeesRule: `${ALAMEEN_DOWN_PAYMENT_RULE} لا يوجد تأمين، ولا توجد رسوم عقد أو رسوم إدارية إضافية معتمدة غير رسوم فتح الملف 5 دنانير. ${ALAMEEN_FIRST_INSTALLMENT_RULE} ${ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE}`,
    requirementsGuidanceRule: "الهوية وإثبات الدخل من الأساسيات. بيانات الكفيل ليست شرطًا ثابتًا لكل طلب، والملف القوي قد يمشي بدون كفيل حسب الدراسة. إذا ما في كشف أو شهادة راتب، ممكن تُذكر/تُرفع بدائل مناسبة لطبيعة الدخل مثل كشف حساب بنكي أو عقد عمل أو مستند رسمي يوضح مصدر الدخل، والدراسة تحدد المقبول النهائي حسب حالة الملف.",
    firstInstallmentRule: ALAMEEN_FIRST_INSTALLMENT_RULE,
    pickupRule: ALAMEEN_OFFICE_OPERATION_RULE,
    secureDocumentsRule: "الهوية وكشف الراتب وشهادة الراتب وبيانات الكفيل وإثبات الدفع والمستندات الحساسة ترفع فقط عبر الرابط الرسمي الآمن، ولا تُستلم عبر واتساب",
    independenceStatement: "الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق",
    paymentAliases: [...FILE_OPENING_PAYMENT_ALIASES],
    paymentWalletType: FILE_OPENING_PAYMENT_WALLET_TYPE,
    paymentBeneficiaryName: FILE_OPENING_PAYMENT_BENEFICIARY,
    paymentMethodRule: `${currentFileOpeningPaymentRule()} لا تفترض توافق محفظة/بنك غير موثق مع قناة معينة؛ اشرح فقط قنوات الاستلام الرسمية المعتمدة.`,
    paymentConfirmationRule: "رسالة العميل أو صورة الوصل لا تؤكد الدفع تلقائيًا. تأكيد الدفع النهائي يتم يدويًا من الإدارة/الأدمن بعد مراجعة الإثبات الرسمي المرفوع من الرابط الآمن.",
    normalReviewWindow: "المعدل الطبيعي للمراجعة من يومين إلى 3 أيام تشغيلية (الأحد إلى الخميس)، والجمعة والسبت لا تُحتسبان ضمن مدة الدراسة ولا تُنفذ فيهما مراجعة",
    recentReleaseAvailabilityRule: `${IPHONE18_PICKUP_RULE} وجود iPhone 18 في الكتالوج يعني أنه معروض للتقديم، ولا يعني مخزونًا أو استلامًا فوريًا. لا تخترع سعرًا أو لونًا أو قسطًا أو توفرًا خارج الحقيقة التجارية المعتمدة.`,
    recentReleaseNotBefore: "",
    reviewPressureLevel: level,
    severePressureRule: pressureRule(level),
    refundPressureRule: "الاسترداد حق مرتبط بالدفع المؤكد. قد يحتاج وقتًا للمعالجة وله دوره مثل الدراسة والمراجعة؛ وجود الضغط لا يلغي حق العميل ولا يبرر إعطاء موعد وهمي.",
    disputeResolutionRule: "عند اتهام بالنصب أو تهديد بالنشر لا تدخل في دفاع عصبي ولا استجداء. اعرض الحل الفعلي بثبات: إن لم يرد العميل الاستمرار فالإلغاء متاح، وإذا كان الدفع مؤكدًا فمسار الاسترداد محفوظ. وضّح أن حقه لا يضيع وأن الاسترداد له معالجة ودور. عند تهديد نشر صريح فقط يمكن التنبيه باحترام إلى أن التشهير المتعمد أو نشر معلومات غير صحيحة قد تكون له تبعات قانونية.",
    autonomousSupervisorRule: "عمران هو صوت الإشراف في محادثات الإلغاء والاسترداد والتعديل والتصعيد. لا يُعتبر أي تغيير أو إلغاء أو استرداد منفذًا لمجرد أن عمران قاله؛ التنفيذ يُثبت فقط من Action Result أو من الحقيقة التشغيلية/الإدارية الموثقة.",
    forbiddenClaims: [
      "الأمين للأقساط والتمويل",
      "شركة تمويل",
      "شركة إقراض",
      "بنك",
      "مرخص من البنك المركزي",
      "خاضع لرقابة البنك المركزي",
      "بدون فوائد",
      "PAYAMEN",
      "PAYAMEEN",
      "AMEENPAY",
      "تم تأكيد الدفع من واتساب",
      "تم اعتماد الدفع من الوصل المرسل على واتساب",
    ],
  };
}

// Default export-like constant for deterministic/self-test code. Runtime truth
// uses getV3Policy() so operational pressure can be changed without rewriting
// conversational logic.
export const V3_POLICY: PolicyTruth = buildPolicy();

export function getV3Policy(): PolicyTruth {
  return buildPolicy();
}

export function policyForPrompt() {
  return JSON.stringify(getV3Policy(), null, 2);
}
