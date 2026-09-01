import type { PolicyTruth } from "./types";

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
    firstInstallmentRule: "القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد، ما لم توجد حالة موثقة تخالف ذلك",
    pickupRule: "الاستلام من المكتب فقط وبموعد رسمي؛ لا يوجد توصيل",
    secureDocumentsRule: "الهوية وكشف الراتب وشهادة الراتب وبيانات الكفيل وإثبات الدفع والمستندات الحساسة ترفع فقط عبر الرابط الرسمي الآمن، ولا تُستلم عبر واتساب",
    independenceStatement: "الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق",
    paymentAliases: ["AMEEENPAY", "AMENPAY"],
    paymentConfirmationRule: "رسالة العميل أو صورة الوصل لا تؤكد الدفع تلقائيًا. تأكيد الدفع النهائي يتم يدويًا من الإدارة/الأدمن بعد مراجعة الإثبات الرسمي المرفوع من الرابط الآمن.",
    normalReviewWindow: "المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل",
    reviewPressureLevel: level,
    severePressureRule: pressureRule(level),
    refundPressureRule: "الاسترداد حق مرتبط بالدفع المؤكد. قد يحتاج وقتًا للمعالجة وله دوره مثل الدراسة والمراجعة؛ وجود الضغط لا يلغي حق العميل ولا يبرر إعطاء موعد وهمي.",
    disputeResolutionRule: "عند اتهام بالنصب أو تهديد بالنشر لا تدخل في دفاع عصبي ولا استجداء. اعرض الحل الفعلي بثبات: إن لم يرد العميل الاستمرار فالإلغاء متاح، وإذا كان الدفع مؤكدًا فمسار الاسترداد محفوظ. وضّح أن حقه لا يضيع وأن الاسترداد له معالجة ودور. عند تهديد نشر صريح فقط يمكن التنبيه باحترام إلى أن التشهير المتعمد أو نشر معلومات غير صحيحة قد تكون له تبعات قانونية.",
    autonomousSupervisorRule: "كل تغيير فعلي على الطلب أو الإلغاء أو التراجع أو الاسترداد أو تعديل الجهاز/الحسبة ينفذه عمران فقط. عمران يكمل الحالة مباشرة ولا ينتظر تحويلًا لشخص آخر.",
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
