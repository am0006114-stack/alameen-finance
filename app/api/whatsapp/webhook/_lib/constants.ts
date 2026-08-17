export const BUSINESS_NAME = "الأمين للأقساط";
export const BUSINESS_ADDRESS = "رانا سنتر - الطابق الثاني - مقابل مستشفى العيون - شارع المدينة المنورة";
export const BUSINESS_GENERAL_LOCATION = "عمّان - شارع المدينة المنورة";
export const BUSINESS_INDEPENDENCE_STATEMENT = "الأمين للأقساط جهة مستقلة تمامًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر على الإطلاق";
export const BUSINESS_PHONE_DISPLAY = "0788500337";
export const BUSINESS_PHONE_E164 = "+962788500337";
export const BUSINESS_WEBSITE = "https://www.ameenfinance.co";
export const BUSINESS_ACTIVITY = "تقسيط الأجهزة الإلكترونية والهواتف";
export const BUSINESS_REGULATORY_DISCLOSURE =
  "الأمين للأقساط ليست بنكًا ولا شركة تمويل أو إقراض، ولا تمنح قروضًا، ولا تدّعي أنها مرخصة أو خاضعة لرقابة البنك المركزي الأردني.";
export const FILE_OPENING_FEE_JOD = 5;
export const POST_EID_DELIVERY_TEXT = "سيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة من المورد/الوكلاء المعتمدين واعتماد جدول الاستلام من المكتب من الإدارة";
export const POST_EID_DELIVERY_STRICT_TEXT =
  "لغاية الآن الأجهزة ما وصلتنا من المورد/الوكلاء المعتمدين، وصبركم مقدّر جدًا. سيتم التواصل مع أصحاب الطلبات المؤكدة فور وصول الأجهزة واعتماد جدول الاستلام من المكتب من الإدارة. لا يوجد أي توصيل نهائيًا، والاستلام يكون من المكتب فقط وبموعد مسبق";

export const FOLLOWUP_AGENT_NAMES = ["فدوة", "تالا"] as const;
export const STUDY_AGENT_NAMES = ["عبدالله", "عبدالرحمن"] as const;
export const ESCALATION_MANAGER_NAME = "عمران";

export function fileOpeningFeeExplanation() {
  return `رسوم فتح الملف هي ${FILE_OPENING_FEE_JOD} دنانير فقط، وليست دفعة على الجهاز ولا القسط الأول.

تُطلب فقط بعد التأهيل المبدئي لاستكمال إجراءات الملف، وهي مستردة بالكامل في حال عدم الموافقة النهائية.

القسط الأول يكون بعد استلام الجهاز حسب الاتفاق.`;
}

export function noPaymentNeededLine() {
  return `لا يوجد أي دفع مطلوب الآن إلا إذا كان طلبكم مؤهلًا مبدئيًا وتم إرسال تعليمات فتح الملف رسميًا لكم.`;
}
