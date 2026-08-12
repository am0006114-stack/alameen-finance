import { normalizeArabicText } from "../text";
import { hasGenderLanguageMismatch } from "../customerGender";
import type { CustomerIntent } from "../types";
import type {
  ShadowAgentId,
  ShadowFacts,
  ShadowPolicyCheck,
  ShadowPolicySeverity,
  ShadowTopic,
  ShadowValidation,
} from "./types";

function normalized(value: string) {
  return normalizeArabicText(String(value || ""));
}

function includesAny(text: string, values: string[]) {
  const value = normalized(text);
  return values.some((item) => value.includes(normalized(item)));
}

function addCheck(
  checks: ShadowPolicyCheck[],
  id: string,
  passed: boolean,
  severity: ShadowPolicySeverity,
  message: string,
) {
  checks.push({ id, passed, severity, message });
}

function hasUnsupportedFinalApprovalClaim(value: string) {
  const reply = normalized(value);
  const cleaned = reply
    .replace(/(?:اذا|لو|في حال|بحال)\s+(?:ما|لم)\s+(?:تمت|تصدر|صدرت)?\s*(?:ال)?موافقه (?:ال)?نهاييه/g, " ")
    .replace(/(?:عدم|ما|لم|لا توجد|ما في)\s+(?:تمت|صدرت|صدور)?\s*(?:ال)?موافقه (?:ال)?نهاييه/g, " ")
    .replace(/(?:ال)?موافقه (?:ال)?نهاييه\s+(?:غير موجوده|غير صادره)/g, " ")
    .replace(/(?:بعد|عند|حال)\s+(?:صدور|اعتماد|الموافقه على)?\s*(?:ال)?موافقه (?:ال)?نهاييه/g, " ")
    .replace(/بعد ما (?:تطلع|تصدر)\s*(?:ال)?موافقه/g, " ");
  return includesAny(cleaned, [
    "تمت الموافقه النهاييه",
    "صدرت الموافقه النهاييه",
    "طلبك موافق نهائيا",
    "عليه موافقه نهائيه",
    "موافقه نهائيه",
  ]);
}

function asksForCancellationConfirmationAgain(reply: string) {
  return includesAny(reply, [
    "اكتب اكد الغاء الطلب",
    "اكتبي اكد الغاء الطلب",
    "تأكيد اخير",
    "تاكيد اخير",
    "أكد الغاء الطلب مرة اخيرة",
    "اكد الغاء الطلب مره اخيره",
  ]);
}

function hasPaymentInstructions(reply: string) {
  return includesAny(reply, [
    "amenpay",
    "payamen",
    "abdul rahman alharahsheh",
    "تحويل رسوم فتح الملف",
    "حول 5",
    "حولي 5",
    "ادفع رسوم فتح الملف",
    "ادفعي رسوم فتح الملف",
  ]);
}

function hasDirectWhatsAppReceiptRequest(reply: string) {
  const asksDirectly = includesAny(reply, [
    "ابعت صورة الوصل",
    "ابعث صورة الوصل",
    "ارسل صورة الوصل",
    "أرسل صورة الوصل",
    "ابعتلي صورة الاشعار",
    "ابعتلي اشعار التحويل",
    "ارسل لنا اشعار التحويل",
    "ابعث الوصل هون",
    "ابعت الوصل هون",
    "ابعثه هون",
    "ابعت اثبات الدفع",
    "ابعث إثبات الدفع",
    "ارسل اثبات الدفع",
    "أرسل إثبات الدفع",
    "معه صورة الوصل",
    "صورة الوصل ان وجدت",
    "صورة الوصل إن وجدت",
    "صورة من الحركة",
  ]);
  const hasOfficialUpload = includesAny(reply, ["الرابط الرسمي", "/receipt", "ارفع الوصل من الرابط"]);
  return asksDirectly && !hasOfficialUpload;
}

function hasDirectWhatsAppDocumentRequest(reply: string) {
  const asksDirectly = includesAny(reply, [
    "ابعت الهوية",
    "ابعث الهوية",
    "ارسل الهوية",
    "ابعت كشف الراتب",
    "ابعث كشف الراتب",
    "ارسل كشف الراتب",
    "ابعت بيانات الكفيل",
    "ابعث بيانات الكفيل",
    "ارسل بيانات الكفيل",
  ]);
  const hasOfficialUpload = includesAny(reply, ["الرابط الرسمي", "الرابط الامن", "الرفع الرسمي"]);
  return asksDirectly && !hasOfficialUpload;
}

function hasUnsupportedStaffAvailabilityClaim(reply: string) {
  return includesAny(reply, [
    "ما في موظف متاح",
    "لا يوجد موظف متاح",
    "الموظف غير متاح",
    "ما في حدا متاح للمكالمه",
    "ما في حدا متاح للمكالمة",
    "لا يوجد احد متاح للمكالمه",
    "لا يوجد أحد متاح للمكالمة",
  ]);
}

function paymentExplanationComplete(reply: string) {
  const requirements = [
    includesAny(reply, ["5 دنانير", "٥ دنانير"]),
    includesAny(reply, ["ليست قسط", "مش قسط", "ليست دفعة على الجهاز"]),
    includesAny(reply, ["مسترده بالكامل", "مستردة بالكامل"]),
    includesAny(reply, ["القسط الاول", "القسط الأول"]),
    includesAny(reply, ["orange money"]),
    includesAny(reply, ["amenpay"]),
    includesAny(reply, ["payamen"]),
    includesAny(reply, ["abdul rahman alharahsheh"]),
    includesAny(reply, ["/receipt", "الرابط الرسمي"]),
    includesAny(reply, ["يومين الى 3", "يومين إلى 3", "يومين ل 3", "يومين لـ 3"]),
    includesAny(reply, ["الجمعه والسبت", "الجمعة والسبت"]),
  ];
  return requirements.every(Boolean);
}

function normalizeDigits(value: string) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const eastern = "۰۱۲۳۴۵۶۷۸۹";
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(eastern.indexOf(digit)));
}

function phoneNumbers(value: string) {
  const withoutTracking = normalizeDigits(value)
    .replace(/AM-\d{8,}/gi, " ")
    .replace(/(?:رقم\s+(?:الطلب|التتبع)|tracking\s*(?:id|number)?)\s*[:#-]?\s*\d{8,16}/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ");
  const matches = withoutTracking.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  return matches
    .map((match) => match.replace(/\D/g, ""))
    .filter((digits) => digits.length >= 9 && digits.length <= 15);
}

function hasUnapprovedContactNumber(reply: string, facts: ShadowFacts) {
  const allowed = new Set([
    facts.officialContact.localNumber.replace(/\D/g, ""),
    facts.officialContact.internationalNumber.replace(/\D/g, ""),
  ]);
  return phoneNumbers(reply).some((digits) => !allowed.has(digits));
}

function hasUnsupportedBusinessHours(reply: string, facts: ShadowFacts) {
  if (facts.officialContact.businessHours) return false;
  const text = normalized(reply);
  const explicitSchedule =
    /(?:الدوام|اوقات الدوام|ساعات الدوام)[^\n.]{0,80}(?:من|يبدا|يبدأ|ببلش|الساعة|الساعه)\s*(?:الاحد|الأحد|السبت|[0-9٠-٩])/i.test(String(reply || "")) ||
    /(?:من\s+(?:الاحد|الأحد|السبت)[^\n.]{0,60}(?:الى|إلى)|(?:^|\s)(?:[1-9]|1[0-2])(?::\d{2})?\s*(?:صباح|مساء))/i.test(text);
  return explicitSchedule;
}

function deviceModelKeys(value: string | null | undefined) {
  const raw = normalizeDigits(String(value || ""));
  const matches: string[] = [];
  const patterns = [
    /\biphone\s*\d{1,2}(?:\s*(?:pro\s*max|pro|plus|max))?/gi,
    /(?:ايفون|آيفون)\s*\d{1,2}(?:\s*(?:برو\s*ماكس|برو|بلس|ماكس))?/gi,
    /\b(?:samsung\s+|galaxy\s+)?[sa]\d{2}(?:\s*(?:ultra|plus|fe))?/gi,
    /\bhonor\s+[a-z0-9-]+(?:\s*pro)?/gi,
    /\b(?:xiaomi|redmi|oppo|realme|pixel|poco|oneplus|infinix|tecno|huawei)\s+[a-z0-9-]+(?:\s*(?:pro|plus|ultra|max))?/gi,
  ];
  for (const pattern of patterns) {
    matches.push(...(raw.match(pattern) || []));
  }
  return Array.from(new Set(matches.map((item) => normalized(item)
    .replace(/آيفون|ايفون/g, "iphone")
    .replace(/برو ماكس/g, "pro max")
    .replace(/برو/g, "pro")
    .replace(/بلس/g, "plus")
    .replace(/\s+/g, " ")
    .trim())));
}

function hasUnsupportedDeviceMention(reply: string, facts: ShadowFacts) {
  const mentioned = deviceModelKeys(reply);
  if (!mentioned.length) return false;
  const allowed = new Set([
    ...deviceModelKeys(facts.currentDevice),
    ...deviceModelKeys(facts.deviceChangeRequest.requestedDevice),
  ]);
  return mentioned.some((model) => !allowed.has(model));
}

function hasDeviceChangeRequestClaim(reply: string) {
  return includesAny(reply, [
    "طلب تعديل الجهاز",
    "طلبك لتعديل الجهاز",
    "طلب تغيير الجهاز",
  ]);
}

function hasDeviceChangeSubmissionClaim(reply: string) {
  const value = normalized(reply);
  return /(?:طلب|تعديل|تغيير)\s+(?:تعديل|تغيير)?\s*الجهاز.{0,120}(?:تم ارساله|تم رفعه|تحت المراجعه|مرفوع للاداره)/.test(value)
    || /(?:تم ارسال|تم رفع)\s+طلب\s+(?:تعديل|تغيير)\s+الجهاز/.test(value)
    || /طلب التعديل.{0,80}(?:تحت المراجعه|مرفوع للاداره)/.test(value);
}

function hasDeviceChangeApprovalClaim(reply: string) {
  const value = normalized(reply);
  return /(?:تم اعتماد|تمت الموافقه على|تم تغيير)\s+(?:طلب\s+)?(?:تعديل\s+)?الجهاز/.test(value);
}

function hasFalseCentralBankClaim(reply: string) {
  const value = normalized(reply)
    .replace(/(?:لا|لم)\s+(?:ندعي|تدعي).{0,120}البنك المركزي/g, " ")
    .replace(/(?:ليست|لسنا|غير)\s+(?:مرخصه|خاضعه).{0,120}البنك المركزي/g, " ")
    .replace(/(?:لا|لم)\s+تخضع.{0,120}البنك المركزي/g, " ");
  return [
    /(?:نحن|احنا|الامين|الشركه|الجهه).{0,80}(?:مرخصه|مرخصين|خاضعه|تخضع|تحت رقابه).{0,80}البنك المركزي/,
    /(?:مرخصه|مرخصين)\s+(?:ومسجله\s+)?(?:من|لدى)\s+البنك المركزي/,
    /(?:خاضعه|تخضع|تحت رقابه)\s+(?:ل)?(?:رقابه\s+)?البنك المركزي/,
    /البنك المركزي.{0,80}(?:يراقبنا|يشرف علينا|مرخصنا|رخصنا)/,
  ].some((pattern) => pattern.test(value));
}

function hasForbiddenBusinessName(reply: string) {
  return includesAny(reply, [
    "الامين للاقساط والتمويل",
    "شركة الامين للاقساط والتمويل",
  ]);
}

function hasAffirmativeFinanceOrLoanIdentity(reply: string) {
  const value = normalized(reply);
  return [
    /(?:نحن|احنا|الامين|الشركه|الجهه)\s+(?:عباره عن\s+)?(?:بنك|شركة تمويل|جهه تمويل|شركة اقراض|جهه اقراض)/,
    /(?:نقدم|نعطي|نمنح)\s+(?:قروض|قرض|تمويل شخصي|تمويل نقدي)/,
  ].some((pattern) => pattern.test(value));
}

function hasUnsupportedLegalNameClaim(reply: string, facts: ShadowFacts) {
  if (facts.businessIdentity.legalName) return false;
  return includesAny(reply, [
    "الاسم القانوني هو",
    "الاسم القانوني للشركه هو",
    "الاسم القانوني للشركة هو",
    "الاسم الرسمي المسجل هو",
    "مسجله باسم",
    "مسجلة باسم",
  ]);
}

function regulatoryDisclosureComplete(reply: string) {
  return includesAny(reply, ["ليست بنكا", "ليست بنك", "لسنا بنكا", "لسنا بنك", "مش بنك"])
    && includesAny(reply, ["ليست شركة تمويل", "ولا شركة تمويل", "لسنا شركة تمويل", "مش شركة تمويل"])
    && includesAny(reply, ["لا تمنح قروضا", "لا تمنح قروض", "لا نقدم قروضا", "لا نقدم قروض", "ما بنقدم قروض"])
    && includesAny(reply, ["لا ندعي", "لا تدعي", "ليست خاضعه", "لا تخضع"])
    && includesAny(reply, ["البنك المركزي"]);
}

function businessIdentityComplete(reply: string, facts: ShadowFacts) {
  return includesAny(reply, [facts.businessIdentity.brandName])
    && includesAny(reply, ["تقسيط الاجهزه", "تقسيط الأجهزة", "تقسيط الهواتف", "تقسيط اجهزه"]);
}


function hasEmptyLabeledLink(value: string) {
  const lines = String(value || "").split("\n");
  const labelPattern = /^(?:رابط رفع الوصل الرسمي|رابط رفع الوصل|رابط المتابعة|رابط الطلب|رابط الاسترداد)\s*:\s*$/i;

  for (let index = 0; index < lines.length; index += 1) {
    if (!labelPattern.test(lines[index].trim())) continue;
    let nextIndex = index + 1;
    while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1;
    if (!/^https?:\/\//i.test(lines[nextIndex]?.trim() || "")) return true;
  }

  return false;
}

function stageLanguageMismatch(reply: string, facts: ShadowFacts) {
  const text = normalizeArabicText(reply);
  const hasFinalReview = includesAny(text, ["قيد الدراسه النهائيه", "الدراسه النهائيه", "المرحله النهائيه من الدراسه"]);
  const hasUnderReview = includesAny(text, ["قيد الدراسه", "الملف قيد الدراسه", "بدأت الدراسه"]);
  const hasPrequalified = includesAny(text, ["مؤهل مبدئيا", "تأهيله مبدئيا", "تم التأهيل مبدئيا"]);
  const hasSubmitted = includesAny(text, ["تم استلام الطلب", "تم تسجيل الطلب", "استلمنا طلبك"]);

  if (facts.stage !== "final_review" && hasFinalReview) return true;
  if (["submitted", "queued_for_review", "prequalified"].includes(facts.stage) && hasUnderReview && !hasPrequalified) return true;
  if (facts.stage === "submitted" && hasPrequalified) return true;
  if (facts.stage === "queued_for_review" && (hasPrequalified || hasUnderReview)) return true;
  if (facts.stage === "prequalified" && facts.status !== "preliminary_application" && hasSubmitted && !hasPrequalified) return true;
  if (facts.stage === "under_review" && hasFinalReview) return true;
  if (facts.stage === "approved" && !includesAny(text, ["الموافقه النهائيه", "صدرت الموافقه", "تمت الموافقه النهائيه"])) return true;
  if (facts.stage === "rejected" && !includesAny(text, ["لم تتم الموافقه", "غير موافق", "انتهت الدراسه"])) return true;
  if (!facts.customerAskedFinalApproval && ["submitted", "queued_for_review", "prequalified"].includes(facts.stage) && includesAny(text, ["الموافقه النهائيه لم تصدر", "لسا ما صدرت الموافقه النهائيه", "لم تصدر الموافقه النهائيه"])) return true;
  return false;
}

function topicAnswered(topic: ShadowTopic, reply: string) {
  const checks: Partial<Record<ShadowTopic, string[]>> = {
    order_status: ["حاله طلبك", "حالة طلبك", "طلبك", "الملف"],
    review_time: ["يومين", "3 ايام", "ثلاث ايام", "موعدا غير مؤكد", "موعد غير مؤكد"],
    bank_requirement: ["لا يوجد بنك محدد", "مش مطلوب بنك", "اي بنك يدعم"],
    regulatory_status: ["ليست بنك", "لسنا بنك", "البنك المركزي"],
    business_identity: ["الامين للاقساط", "تقسيط الاجهزه", "تقسيط الأجهزة"],
    early_settlement: ["الاتفاق", "الجدول النهائي", "لا نقدر نضمن"],
    payment_method: ["الدفع", "amenpay", "لا يوجد دفع مطلوب"],
    payment_status: ["الدفع", "الوصل", "بانتظار التأكيد", "مؤكد"],
    procedures: ["الخطوه", "الخطوة", "الحالة", "طلبك"],
    post_approval_steps: ["بعد صدور الموافقه", "بعد صدور الموافقة", "موعد حضور رسمي", "القسط الاول", "القسط الأول"],
    requirements: ["المطلوب", "كفيل", "راتب", "هويه", "هوية", "لا يوجد مستند", "ما في مستند", "رقم التتبع"],
    office_location: ["المكتب", "العنوان", "موعد رسمي"],
    independence: ["جهه مستقله تماما", "جهة مستقلة تمامًا"],
    delivery: ["لا يوجد توصيل", "الاستلام من المكتب"],
    supplier_delay: ["التوريد", "المورد", "موعد توريد"],
    device_selection: ["اختيار الجهاز", "/products", "/change-device"],
    voluntary_opt_out: ["الخدمه اختياريه", "الخدمة اختيارية", "القرار راجع", "ما في عليك اي التزام", "ما في عليك أي التزام"],
    office_payment_request: ["الدفع في المكتب غير متاح", "دفع رسوم فتح الملف غير متاح في المكتب", "الخدمة اختيارية", "الاجراء اختياري"],
    business_hours: ["ما عندي وقت دوام عام معتمد", "الحضور إلى المكتب لا يكون إلا بموعد رسمي", "الحضور الى المكتب لا يكون الا بموعد رسمي", "موعد رسمي"],
    eligibility: ["تقدر تقدم", "بتقدر تقدم", "لا تعني موافقة", "ما بيعني موافقة", "ما بنقدر نضمن القبول"],
    device_change: ["change-device", "تغيير الجهاز", "تعديل الجهاز"],
    cancellation: ["الغاء", "إلغاء", "تأكيدك"],
    refund: ["الاسترداد", "المبلغ", "الحواله", "الحوالة"],
    stop_refund: ["ايقاف", "إيقاف", "الاسترداد", "اعاده تفعيل", "إعادة تفعيل"],
    contact_number: ["0788500337", "+962788500337", "رقم التواصل الرسمي"],
    phone_not_answered: ["اترك رسالتك", "اترك رساله", "واتساب", "رقم طلبك"],
    human_agent: ["فريق الامين", "فريق الأمين", "تالا", "فدوه", "فدوة", "عبدالله", "عبدالرحمن", "عمران"],
    staff_change: ["فريق الامين", "فريق الأمين", "عمران", "موظف", "تالا", "فدوة", "عبدالله", "عبدالرحمن"],
    voice_message: ["الرساله الصوتيه", "الرسالة الصوتية", "اكتب"],
    media_upload: ["المرفق", "الصوره", "الصورة", "وصل"],
    document_upload: ["المستند", "الرابط الرسمي", "الرفع"],
    unsupported_message: ["غير مدعومه", "غير مدعومة", "اكتب طلبك نصيا", "اكتب طلبك نصيًا"],
    acknowledgement: ["وصلت", "تمام"],
    complaint: ["حقك", "فاهم", "التأخير", "مزعج"],
    trust: ["حقك تتأكد", "الموقع الرسمي", "الروابط"],
    general_question: [],
  };
  const words = checks[topic] || [];
  return words.length === 0 || includesAny(reply, words);
}

function agentRoleValid(agent: ShadowAgentId, topics: ShadowTopic[]) {
  const contact = topics.some((topic) => ["contact_number", "phone_not_answered", "human_agent", "staff_change", "regulatory_status", "business_identity"].includes(topic));
  const escalation = topics.some((topic) => ["complaint", "trust", "cancellation", "refund", "stop_refund"].includes(topic));
  const study = topics.some((topic) => ["requirements", "eligibility", "procedures", "document_upload"].includes(topic));
  if (contact) return agent === "tala" || agent === "fadwa";
  if (escalation) return agent === "omran";
  if (study) return agent === "abdullah" || agent === "abdulrahman";
  return agent === "tala" || agent === "fadwa";
}


function explicitOperationalLinkRequest(customerText: string) {
  const text = normalized(customerText);
  const hasLink = includesAny(text, ["رابط", "لينك", "link"]);
  const asks = includesAny(text, [
    "بدي", "ابعث", "ابعت", "ارسل", "أرسل", "هات", "اعطيني", "أعطيني", "وين", "راح", "ضاع", "مفقود",
  ]);
  const operational = includesAny(text, [
    "وصل", "ايصال", "إيصال", "هوية", "هويه", "كشف راتب", "شهادة راتب", "شهاده راتب",
    "كفيل", "مستند", "التتبع", "متابعة", "استرداد", "اختيار الجهاز", "تغيير الجهاز",
  ]);
  return hasLink && asks && operational;
}

function hasOptOutCoercion(reply: string) {
  return includesAny(reply, [
    "لازم تدفع", "لازم تدفعي", "ضروري تدفع", "ضروري تدفعي", "لازم تحضر", "لازم تحضري",
    "هذه الخطوه الوحيده", "هذه الخطوة الوحيدة", "بس للاستمرار", "حتى نكمل لازم",
    "راح نخسر طلبك", "رح نخسر طلبك", "لازم تكمل", "لازم تكملي",
  ]);
}

function hasVoluntaryChoiceLanguage(reply: string) {
  return includesAny(reply, [
    "الخدمه اختياريه بالكامل", "الخدمة اختيارية بالكامل", "الاجراء اختياري بالكامل", "الإجراء اختياري بالكامل",
    "القرار راجع الك", "القرار راجع إلك", "ما في عليك اي التزام", "ما في عليك أي التزام",
    "بدون ضغط", "ما رح نضغط عليك",
  ]);
}

function replyHasAnyUrl(reply: string) {
  return /https?:\/\/[^\s]+/i.test(String(reply || ""));
}

function finalReplyHasSingleStaffIdentity(reply: string) {
  const names = [...String(reply || "").matchAll(/(?:انا\s+معك|أنا\s+معك|معك|معكِ)\s+(تالا|فدوة|عبدالله|عبدالرحمن|عمران)(?=[،,.]|\s|$)/gi)]
    .map((match) => normalized(match[1] || ""))
    .filter(Boolean);
  return new Set(names).size <= 1;
}

function hasPersonalFollowupPromise(reply: string) {
  return /(?:انا|أنا)\s+شخصي(?:ا|ًا)?\s+(?:رح|راح)\s+اتابع|(?:رح|راح)\s+أ?تابع(?:لك)?\s+(?:(?:الموضوع|ملفك|طلبك)(?:\s+شخصي(?:ا|ًا)?)?|(?:ملفك|طلبك)\s+(?:اول\s+باول|أول\s+بأول))|بضل\s+اتابع(?:لك)?|بتابعلك\s+(?:ملفك|طلبك)|(?:انا|أنا)\s+مسجل(?:ة)?[^.\n]{0,120}(?:رح|راح)\s+أ?تابع/i.test(String(reply || ""));
}

function clearRequestWasAnsweredWithUnknown(customerText: string, reply: string) {
  const clearRequest = includesAny(customerText, [
    "بدي رقم", "رقم تليفون", "رقم تلفون", "اتواصل معكم", "صارلي اسبوع", "صارلي أسبوع",
    "من زمان", "ما في مصداقية", "حماية المستهلك", "بدي فلوسي", "رجعهم", "رجعولي",
    "بدي الرابط", "وين الرابط", "الرابط راح",
    "بقدر احول بكرا", "بقدر أحول بكرا", "اريد جهاز اقسطه", "أريد جهاز أقسطه",
    "نفس مشكله", "نفس مشكلة", "كيف ارفق الملف", "كيف أرفق الملف",
    "الرد بدو وقت", "الرد بده وقت", "بقدر ارفع قيمة القسط", "بقدر لحد", "كيف الدفع الشهري",
    "اقتطاع من البنك", "ما بقدر اطلع اخذو", "اطلع استلمو", "اقدم شكوى عليكم", "قدما شكوه عليكم",
    "كم سعة الرامات", "وبخصوص الرام", "مواصفات هاتف", "مواصفات الجهاز", "اتاكديلي من مواصفات",
    "متى رح يبين", "هل الرد يوخذ وقت طويل", "اليوم بتردولي خبر", "متى بتحكولي اه ولا لا",
    "كم نسبة الموافقة", "نسبة قبولي", "اعطيني انسان اتواصل معه",
    "جهاز ثاني", "جهاز تاني", "كمان جهاز", "reply me in english", "in english pls",
    "قصدي السؤال الي قبل", "قصدي السؤال اللي قبل", "في مكان ممكن اراجع",
    "القسط ع كم شهر", "القسط على كم شهر", "كم شهر تقسيط", "مدة التقسيط",
    "هسا في سماعة معه", "معه سماعة", "سماعة معه", "معه شاحن",
    "هل في فوائد", "فوائد ربوية", "هل التقسيط شرعي",
    "استمرار", "يعني بطول", "قديش بقعد وقت", "الوقت", "ممكن موقعكم", "موقعكم",
    "رقم تواصل مكالمة", "في رقم ثاني لتواصل", "بدي اتواصل مع الاداره", "بدي أتواصل مع الإدارة",
    "الدوام ببلش", "من اي ساعه لا اي ساعه", "من أي ساعة لأي ساعة", "ايام الدوام", "أيام الدوام",
    "مطلوب اي اشي لبعدين", "مطلوب أي اشي لبعدين", "وين اعبي", "وين أعبي",
  ]);
  const unknownFallback = includesAny(reply, [
    "معناها مش واضح", "الرسالة قصيرة وما قدرت احدد", "اكتب السؤال كامل", "ما بدي اخمن",
  ]);
  return clearRequest && unknownFallback;
}

function hasUnsupportedRegistrationClaim(reply: string) {
  return includesAny(reply, [
    "شركتنا مسجلة", "شركتنا مسجله", "مسجلة ومعروفة بالأردن", "مسجله ومعروفه بالاردن",
    "مسجلين ومعروفين", "جهة مسجلة ومعروفة", "جهة مسجله ومعروفه",
  ]);
}

function hasWrongReviewDuration(reply: string) {
  return includesAny(reply, [
    "يوم إلى يومين", "يوم الى يومين", "يوم او يومين", "يوم أو يومين", "1-2 يوم", "1 إلى 2 يوم", "1 الى 2 يوم",
  ]);
}

function hasGuaranteedReviewOutcome(reply: string) {
  return includesAny(reply, [
    "بصير عندك خبر واضح", "رح تخلص اليوم", "أكيد اليوم", "اكيد اليوم", "اليوم بنعطيك النتيجة", "اليوم بنعطيك النتيجه",
  ]);
}

function hasUnverifiedProductVerificationPromise(reply: string) {
  return includesAny(reply, [
    "أقدر أتأكدلك", "اقدر اتأكدلك", "بنقدر نأكدلك", "بنقدر ناكدلك", "رح أتأكدلك", "رح اتأكدلك",
    "بعد ما تقدم الطلب بنتأكدلك", "بعد ما تقدم الطلب بنأكدلك",
  ]);
}

function customerExplicitlyDeclinesContinuation(text: string) {
  return includesAny(text, [
    "لا ارغب بالاستمرار", "لا أرغب بالاستمرار", "لا اريد الاستمرار", "لا أريد الاستمرار",
    "ما بدي اكمل", "ما بدي أكمل", "مش حاب اكمل", "مش حاب أكمل", "ما بدي استمر",
  ]);
}

function customerCancellationIsConditional(text: string) {
  const mentionsCancel = includesAny(text, ["الغي", "ألغي", "الغاء", "إلغاء", "كنسل", "اكنسل", "cancel"]);
  const conditional = includesAny(text, ["اذا", "إذا", "لو", "بلاش", "قبل ما", "ممكن", "يمكن", "رح", "راح"]);
  return mentionsCancel && conditional;
}

function customerRequestsStopRefund(text: string) {
  const refundAnchor = includesAny(text, ["استرداد", "الاسترداد", "استرد", "استرجاع", "الاسترجاع", "استرجع", "refund"]);
  const stopAnchor = includesAny(text, [
    "الغاء", "إلغاء", "الغي", "ألغي", "الغوا", "وقف", "اوقف", "أوقف", "ايقاف", "إيقاف",
    "تراجع", "تراجعت", "ما بدي", "بديش", "مش طالب", "لا اريد", "لا أريد",
  ]);
  const returnToOrder = includesAny(text, [
    "رجع طلب التلفون", "رجعولي طلب التلفون", "رجعولي الطلب", "رجعوا الطلب",
    "بدي ارجع للطلب بدل الاسترداد", "بدي أرجع للطلب بدل الاسترداد", "الرجوع الى طلبي", "الرجوع إلى طلبي",
  ]);
  return (refundAnchor && stopAnchor) || returnToOrder;
}

function customerAsksRefundPolicyInquiry(text: string) {
  const explicitNoRefund = includesAny(text, [
    "ما بدي استرد", "ما بدي استرجع", "بديش استرد", "بديش استرجع",
    "مش طالب استرداد", "مش طالب استرجاع", "انا بستفسر", "أنا بستفسر",
    "بس بستفسر", "مجرد استفسار",
  ]);
  if (explicitNoRefund) return true;

  const feeOrRefundContext = includesAny(text, [
    "رسوم", "رسوم فتح الملف", "قيمة الملف", "قيمه الملف", "الخمس", "الخمسه", "الخمسة",
    "5", "٥", "دينار", "دنانير", "مبلغ", "المبلغ", "فلوس", "مصاري",
    "استرد", "استرداد", "استرجع", "استرجاع", "رجع", "بترجع", "برجع", "مسترد", "مسترده", "مستردة",
  ]);
  if (!feeOrRefundContext) return false;

  const refundTimingOrStatus = includesAny(text, [
    "متى", "امتى", "إمتى", "قديش بد", "كم بد", "كم يوم", "كم ساعه", "كم ساعة",
    "اليوم", "بكرا", "غدا", "غدًا", "وين وصل", "شو صار بالاسترداد", "حالة الاسترداد",
    "موعد الاسترداد", "وقت الاسترداد", "متى الحواله", "متى الحوالة",
  ]);
  if (refundTimingOrStatus) return false;

  return includesAny(text, [
    "هل", "اذا", "إذا", "لو", "في حال", "بحال",
    "بترجع", "برجع", "بيرجع", "ترجعلي", "ترجع", "يرجع",
    "مسترده", "مستردة", "مسترد",
    "بتنخصم", "تنخصم", "بينخصم", "ينخصم", "بتنهضم", "تنهضم",
    "من اول قسط", "من أول قسط", "من القسط الاول", "من القسط الأول",
    "شو بصير", "وين بتروح", "شو مصير", "بسال", "بسأل", "سؤال",
  ]);
}

function finalReplyLooksTruncated(reply: string) {
  const clean = normalized(reply).replace(/[،,.؟!;:]+$/g, "").trim();
  if (!clean) return true;
  const words = clean.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || "";
  if (["من", "الى", "إلى", "على", "عن", "في", "اذا", "إذا", "لو", "عشان", "حتى", "لكن", "بس", "او", "أو", "انه", "إنه", "انو", "إنو"].includes(last)) return true;
  if (/[:،,\-–]$/.test(String(reply || "").trim())) return true;
  return false;
}

function finalReplyHasMinimumSemanticContent(reply: string, intent: CustomerIntent) {
  if (["greeting", "thanks", "reaction"].includes(String(intent))) return true;
  const clean = normalized(reply)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return false;
  const words = clean.split(/\s+/).filter(Boolean);
  return clean.length >= 12 && words.length >= 3;
}

function hasUnverifiedInterestOrReligiousClaim(reply: string) {
  return includesAny(reply, [
    "ما في فوائد ربوية", "لا يوجد فوائد ربوية", "بدون فوائد ربوية",
    "ما في ربا", "بدون ربا", "النظام شرعي", "التقسيط شرعي",
    "حلال 100", "حلال مية بالمية", "حلال ميه بالميه",
    "ما في فوائد", "بدون فوائد", "لا توجد فوائد",
  ]);
}

function hasUnverifiedEligibilityGuarantee(reply: string) {
  return includesAny(reply, [
    "اكيد يزبط", "أكيد يزبط", "اكيد بتنقبل", "أكيد بتنقبل", "مضمون قبول", "القبول مضمون",
    "وضعك الممتاز", "وضعك ممتاز", "اكيد مؤهل", "أكيد مؤهل", "رح تنقبل", "راح تنقبل",
  ]);
}

function hasNonRejectionGuarantee(reply: string) {
  return includesAny(reply, [
    "ما في اي نيه لرفضه", "ما في أي نية لرفضه", "ما في نيه لرفضه", "ما في نية لرفضه",
    "ما رح ينرفض", "مش رح ينرفض", "اكيد ما بينرفض", "أكيد ما بينرفض", "مستحيل ينرفض",
  ]);
}

function hasUnexecutedAdminTransferClaim(reply: string) {
  return includesAny(reply, [
    "اوصل التفاصيل", "أوصل التفاصيل", "حولت طلبك للاداره", "حولت طلبك للإدارة",
    "رفعت طلبك للاداره", "رفعت طلبك للإدارة",
  ]);
}

function finalReplyIsIntroOnly(reply: string) {
  const text = normalized(reply).replace(/[،,.!؟\s]+/g, " ").trim();
  return /^(?:معك|انا معك|أنا معك)\s+(?:تالا|فدوه|فدوة|عبدالله|عبدالرحمن|عمران)(?:\s+من\s+فريق\s+الامين)?$/.test(text);
}

function replyClaimsAuthoritativeDocumentReceipt(reply: string) {
  return {
    guarantor: includesAny(reply, ["تم استلام معلومات الكفيل", "تم استلام بيانات الكفيل", "استلمنا بيانات الكفيل"]),
    salary: includesAny(reply, ["تم استلام كشف الراتب", "استلمنا كشف الراتب", "كشف الراتب تم استلامه"]),
  };
}

function customerAsksMonthlyInstallmentMethod(text: string) {
  return includesAny(text, [
    "كيف الدفع الشهري", "كيف ادفع القسط", "كيف أدفع القسط", "اقتطاع من البنك", "اقتطاع مباشر",
    "كمبيالات", "كمبياله", "كمبيالة", "بعد الاستلام كيف ادفع", "بعد الاستلام كيف أدفع",
    "كيف رح يصير دفع", "مع شو رح اتعامل", "مع شو رح أتعامل",
  ]);
}

export function validateFinalActualReply(
  reply: string,
  topics: ShadowTopic[],
  facts: ShadowFacts,
  context: {
    initialIntent: CustomerIntent;
    agent: ShadowAgentId;
    agentName: string;
    customerText: string;
  },
): ShadowPolicyCheck[] {
  const checks: ShadowPolicyCheck[] = [];
  const explicitLink = explicitOperationalLinkRequest(context.customerText);
  addCheck(
    checks,
    "explicit_link_request_must_include_link",
    !explicitLink || !facts.hasApplication || replyHasAnyUrl(reply),
    "critical",
    "عند طلب الرابط صراحةً لطلب مرتبط يجب أن يحتوي الرد النهائي على الرابط الفعلي.",
  );
  addCheck(
    checks,
    "final_reply_has_single_staff_identity",
    finalReplyHasSingleStaffIdentity(reply),
    "critical",
    "الرد النهائي لا يجوز أن يحتوي أكثر من هوية موظف واحدة.",
  );
  addCheck(
    checks,
    "no_unexecuted_personal_followup_promise",
    !hasPersonalFollowupPromise(reply),
    "critical",
    "لا يجوز وعد العميل بمتابعة شخصية غير مسجلة أو غير منفذة.",
  );
  addCheck(
    checks,
    "no_unverified_technical_team_action",
    !/(?:الفريق\s+(?:الفني|التقني)|الدعم\s+الفني)\s+(?:شغال|يعمل)\s+(?:عليه|على\s+معالجته|على\s+حل)/i.test(String(reply || "")),
    "critical",
    "لا يُدّعى أن فريقًا فنيًا يعمل على الخلل دون إجراء مثبت.",
  );
  addCheck(
    checks,
    "no_unverified_refund_mechanics",
    !/(?:بيوصل|يوصل)\s+لحسابك\s+مباشره?\s+من\s+النظام|ما\s+حدا\s+(?:بيقدر|يقدر)\s+يسرع(?:ها|ه)\s+يدوي/i.test(normalized(reply)),
    "critical",
    "لا تُخترع آلية تنفيذ الاسترداد أو استحالة تسريعه دون حقيقة تشغيلية مثبتة.",
  );
  const actualRefundRegistrationClaim = includesAny(reply, [
    "سجلت حالة الملف الآن: قيد الاسترداد",
    "تم تسجيل الاسترداد",
    "طلب الاسترداد مسجل",
    "طلب الاسترداد قيد المتابعة",
    "حالة طلبك: طلب الاسترداد",
  ]);
  addCheck(
    checks,
    "final_actual_refund_requires_confirmed_payment",
    facts.paymentConfirmed || !actualRefundRegistrationClaim,
    "critical",
    "ممنوع تسجيل أو وصف استرداد نشط دون وجود دفع مؤكد على الطلب.",
  );
  const refundPolicyInquiry = customerAsksRefundPolicyInquiry(context.customerText);
  const refundMutationClaim = actualRefundRegistrationClaim || includesAny(reply, [
    "وصلتني رغبتك بالاسترداد",
    "رابط تثبيت بيانات الاسترداد",
    "/delay-decision",
  ]);
  addCheck(
    checks,
    "refund_inquiry_must_not_start_or_confirm_refund",
    !refundPolicyInquiry || !refundMutationClaim,
    "critical",
    "السؤال عن رسوم فتح الملف أو إمكانية استردادها لا يجوز أن يبدأ أو يؤكد طلب استرداد.",
  );
  addCheck(
    checks,
    "no_unverified_installment_adjustment_promise",
    !/ممكن\s+تعديل\s+قيمة\s+القسط\s+حسب\s+المدة|طلب\s+تعديل\s+القسط[^.\n]{0,80}(?:مسجل|مرفوع)/i.test(String(reply || "")),
    "critical",
    "لا يُوعد بتعديل القسط أو تسجيل طلب تعديل دون جدول أو إجراء مثبت.",
  );
  addCheck(checks, "final_actual_no_invented_business_hours", !hasUnsupportedBusinessHours(reply, facts), "critical", "لا يجوز اختراع أيام أو ساعات دوام غير موجودة ضمن الحقائق المعتمدة.");
  addCheck(checks, "final_actual_no_unverified_eligibility_guarantee", !hasUnverifiedEligibilityGuarantee(reply), "critical", "التقديم للمراجعة لا يعني ضمان الأهلية أو الموافقة.");
  addCheck(checks, "final_actual_no_non_rejection_guarantee", !hasNonRejectionGuarantee(reply), "critical", "لا يجوز ضمان أن الطلب لن يُرفض قبل صدور قرار فعلي.");
  addCheck(checks, "final_actual_no_unexecuted_admin_transfer", !hasUnexecutedAdminTransferClaim(reply), "critical", "لا يُدّعى تحويل التفاصيل أو التصعيد للإدارة دون إجراء مسجل فعليًا.");
  addCheck(checks, "final_actual_reply_not_intro_only", !finalReplyIsIntroOnly(reply), "critical", "مقدمة اسم الموظف وحدها ليست جوابًا صالحًا لسؤال العميل.");
  const receiptClaims = replyClaimsAuthoritativeDocumentReceipt(reply);
  addCheck(checks, "final_actual_guarantor_receipt_truth", !receiptClaims.guarantor || facts.status === "guarantor_submitted", "critical", "لا يُدّعى استلام بيانات الكفيل قبل أن تعكس قاعدة البيانات ذلك.");
  addCheck(checks, "final_actual_salary_receipt_truth", !receiptClaims.salary || facts.status === "salary_slip_uploaded", "critical", "لا يُدّعى استلام كشف الراتب قبل أن تعكس قاعدة البيانات ذلك.");
  const asksIndependence = topics.includes("independence");
  addCheck(checks, "final_actual_independence_disclosure", !asksIndependence || includesAny(reply, ["جهة مستقلة تمامًا", "جهه مستقله تماما"]) && includesAny(reply, ["لا توجد أي علاقة", "لا توجد اي علاقه", "لا علاقة", "لا علاقه"]), "critical", "عند السؤال عن الأمين للتمويل الأصغر يجب توضيح الاستقلال التام وعدم وجود علاقة أو شراكة أو تبعية.");
  const voiceInput = topics.includes("voice_message");
  addCheck(checks, "final_actual_voice_requires_text", !voiceInput || includesAny(reply, ["الرسالة الصوتية", "الرساله الصوتيه"]) && includesAny(reply, ["اكتب", "نص"]), "critical", "الصوت دون تفريغ نصي لا يجوز تفسير محتواه؛ يجب طلب توضيح نصي.");
  addCheck(
    checks,
    "clear_customer_request_not_treated_as_unknown",
    !clearRequestWasAnsweredWithUnknown(context.customerText, reply),
    "critical",
    "الطلبات الواضحة مثل الرقم أو الرابط أو الاسترداد أو التأخير لا تُعامل كرسالة غير مفهومة.",
  );
  addCheck(
    checks,
    "final_actual_address_allowed",
    facts.officeAddressCanBeShared || !includesAny(reply, ["رانا سنتر", "شارع المدينه المنوره", "شارع المدينة المنورة", "مقابل مستشفى العيون"]),
    "critical",
    "الرد الفعلي النهائي لا يحتوي عنوان المكتب قبل الموافقة أو الموعد الرسمي.",
  );
  addCheck(
    checks,
    "final_actual_gender_matches_customer",
    !hasGenderLanguageMismatch(reply, facts.customerGender),
    "critical",
    "صيغة الجنس في الرد الفعلي النهائي تطابق الاسم المؤكد أو تكون محايدة.",
  );
  addCheck(checks, "no_unverified_registration_claim", !hasUnsupportedRegistrationClaim(reply), "critical", "لا يُدّعى تسجيل أو شهرة قانونية غير مثبتة.");
  addCheck(checks, "review_duration_policy_exact", !hasWrongReviewDuration(reply), "critical", "مدة الدراسة المعتمدة من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات.");
  addCheck(checks, "no_guaranteed_review_outcome", !hasGuaranteedReviewOutcome(reply), "critical", "لا يُضمن موعد أو نتيجة مراجعة غير مؤكدة.");
  addCheck(checks, "no_unverified_product_verification_promise", !hasUnverifiedProductVerificationPromise(reply), "critical", "لا يُوعد بالتحقق من مواصفة منتج دون آلية أو مصدر مثبت.");
  addCheck(
    checks,
    "negative_continue_has_no_payment_instructions",
    !customerExplicitlyDeclinesContinuation(context.customerText) || !hasPaymentInstructions(reply),
    "critical",
    "رفض الاستمرار لا يجوز أن يفعّل تعليمات الدفع أو الاستمرار.",
  );
  addCheck(
    checks,
    "conditional_cancel_not_confirmed",
    !customerCancellationIsConditional(context.customerText) || !includesAny(reply, ["تم إلغاء الطلب بنجاح", "تم الغاء الطلب بنجاح", "تم إلغاء طلبك"]),
    "critical",
    "ذكر الإلغاء بصيغة شرطية أو تهديدية ليس تأكيد إلغاء.",
  );
  addCheck(
    checks,
    "stop_refund_not_inverted",
    !customerRequestsStopRefund(context.customerText) || !includesAny(reply, ["طلب الاسترداد محفوظ وقيد المتابعة", "طلب الاسترداد مسجل وقيد المتابعة", "أول ما يتم تنفيذ الحوالة", "اول ما يتم تنفيذ الحوالة"]),
    "critical",
    "طلب إيقاف الاسترداد لا يجوز الرد عليه وكأنه طلب متابعة للاسترداد.",
  );
  addCheck(
    checks,
    "final_actual_reply_not_truncated",
    !finalReplyLooksTruncated(reply) && finalReplyHasMinimumSemanticContent(reply, context.initialIntent),
    "critical",
    "الرد الفعلي النهائي يجب أن يكون مكتمل المعنى، وليس كلمة أو كلمتين مجتزأتين أو جملة معلقة.",
  );
  addCheck(
    checks,
    "no_unverified_interest_or_religious_claim",
    !hasUnverifiedInterestOrReligiousClaim(reply),
    "critical",
    "لا يجوز إصدار حكم شرعي أو مصرفي غير موثق مثل نفي الفوائد الربوية أو وصف التقسيط بأنه شرعي.",
  );
  addCheck(
    checks,
    "monthly_installment_method_not_confused_with_file_fee",
    !customerAsksMonthlyInstallmentMethod(context.customerText) ||
      (!includesAny(reply, ["amenpay", "payamen"]) && includesAny(reply, ["الاتفاق", "الجدول النهائي", "طريقة السداد", "وسيلة السداد"])),
    "critical",
    "سؤال طريقة الأقساط بعد الاستلام يجب ألا يُجاب بمعلومات رسوم فتح الملف أو تحويلها.",
  );
  addCheck(
    checks,
    "no_unverified_weekly_installment_claim",
    !includesAny(reply, ["شهري أو أسبوعي", "شهري او اسبوعي", "قسط أسبوعي", "قسط اسبوعي"]),
    "critical",
    "لا يجوز اختراع خيار أقساط أسبوعية دون جدول معتمد.",
  );
  const highPriorityTopics = topics.filter((topic) => [
    "refund", "stop_refund", "cancellation", "complaint", "voice_message", "business_hours",
    "eligibility", "office_location", "independence", "contact_number", "phone_not_answered",
    "human_agent", "review_time", "requirements", "office_payment_request", "voluntary_opt_out",
  ].includes(topic));
  const missingHighPriority = highPriorityTopics.filter((topic) => !topicAnswered(topic, reply));
  addCheck(checks, "final_actual_high_priority_topics_answered", missingHighPriority.length === 0, "critical", "الرد النهائي يجب أن يغطي كل موضوع تشغيلي أو حساس واضح في الرسالة الحالية.");
  return checks;
}

export function validateShadowReply(
  candidate: string,
  topics: ShadowTopic[],
  facts: ShadowFacts,
  context: { initialIntent: CustomerIntent; agent: ShadowAgentId },
): ShadowValidation {
  const reply = String(candidate || "").trim();
  const checks: ShadowPolicyCheck[] = [];

  addCheck(checks, "non_empty", Boolean(reply), "critical", "الرد غير فارغ.");
  addCheck(checks, "reasonable_length", reply.length <= 1400, "warning", "الرد لا يتجاوز 1400 حرف.");
  addCheck(checks, "candidate_semantic_completeness", !finalReplyLooksTruncated(reply) && finalReplyHasMinimumSemanticContent(reply, context.initialIntent), "critical", "المسودة يجب أن تكون جملة مكتملة المعنى وليست جزءًا مبتورًا.");
  addCheck(checks, "no_unverified_interest_or_religious_claim", !hasUnverifiedInterestOrReligiousClaim(reply), "critical", "ممنوع إصدار حكم شرعي أو مصرفي غير موثق عن الفوائد أو الربا.");
  addCheck(checks, "no_internal_template", !includesAny(reply, ["اكتب السؤال كامل", "لازم تدخل بشري", "سيتم تحويلك", "متابعه بشريه", "متابعة بشرية"]), "critical", "لا يحتوي الرد قالبًا داخليًا أو باردًا.");
  addCheck(checks, "no_branch_word", !includesAny(reply, ["فرع", "فروع"]), "critical", "لا تُستخدم كلمة فرع أو فروع.");
  addCheck(checks, "correct_payment_alias", !includesAny(reply, ["payameen"]), "critical", "اسم الدفع الصحيح PAYAMEN وليس PAYAMEEN.");
  addCheck(checks, "no_ai_or_bot_discussion", !includesAny(reply, ["بوت", "ذكاء اصطناعي", "نظام تجريبي", "ai assistant"]), "critical", "لا يناقش الرد كونه بوتًا أو نظامًا تجريبيًا.");
  addCheck(checks, "no_invented_staff_availability", !hasUnsupportedStaffAvailabilityClaim(reply), "critical", "لا يجوز اختراع توفر الموظفين أو عدم توفرهم.");
  addCheck(checks, "no_false_central_bank_claim", !hasFalseCentralBankClaim(reply), "critical", "ممنوع الادعاء بأن الجهة مرخصة أو خاضعة لرقابة البنك المركزي الأردني.");
  addCheck(checks, "approved_business_name_only", !hasForbiddenBusinessName(reply), "critical", "الاسم المعتمد هو الأمين للأقساط فقط.");
  addCheck(checks, "no_finance_or_loan_identity", !hasAffirmativeFinanceOrLoanIdentity(reply), "critical", "الجهة ليست بنكًا أو شركة تمويل أو إقراض ولا تمنح قروضًا.");
  addCheck(checks, "no_unverified_legal_name", !hasUnsupportedLegalNameClaim(reply, facts), "critical", "لا يُدّعى اسم قانوني غير موجود ضمن الحقائق الموثقة.");
  if (topics.includes("regulatory_status")) {
    addCheck(checks, "complete_regulatory_disclosure", regulatoryDisclosureComplete(reply), "critical", "سؤال البنك المركزي يحتاج توضيحًا كاملًا لطبيعة النشاط وعدم الادعاء التنظيمي.");
  } else {
    addCheck(checks, "complete_regulatory_disclosure", true, "critical", "لا يلزم إفصاح تنظيمي كامل في هذه الحالة.");
  }
  if (topics.includes("business_identity")) {
    addCheck(checks, "business_identity_complete", businessIdentityComplete(reply, facts), "critical", "سؤال اسم الجهة يحتاج الاسم المعتمد ونوع النشاط.");
  } else {
    addCheck(checks, "business_identity_complete", true, "critical", "لا يلزم شرح هوية النشاط في هذه الحالة.");
  }
  addCheck(checks, "agent_role_match", agentRoleValid(context.agent, topics), "critical", "الموظف المختار يطابق نوع الحالة.");

  const paymentInstructions = hasPaymentInstructions(reply);
  const voluntaryOptOut = topics.includes("voluntary_opt_out");
  const officePaymentRequest = topics.includes("office_payment_request");
  addCheck(checks, "voluntary_opt_out_reply_is_non_coercive", !voluntaryOptOut || (!hasOptOutCoercion(reply) && hasVoluntaryChoiceLanguage(reply)), "critical", "الرفض الصريح للدفع يُجاب عنه باحترام الاختيار دون ضغط أو محاولة إقناع.");
  addCheck(checks, "voluntary_opt_out_has_no_payment_instructions", !voluntaryOptOut || !paymentInstructions, "critical", "بعد رفض العميل الصريح لا تُرسل معلومات تحويل أو طلب دفع.");
  addCheck(checks, "office_payment_policy_is_clear", !officePaymentRequest || includesAny(reply, ["الدفع في المكتب غير متاح", "دفع رسوم فتح الملف غير متاح في المكتب"]), "critical", "طلب الدفع في المكتب يجب أن يُجاب عنه بأن هذه الوسيلة غير متاحة.");
  addCheck(checks, "office_payment_reply_is_non_coercive", !officePaymentRequest || (!hasOptOutCoercion(reply) && hasVoluntaryChoiceLanguage(reply)), "critical", "رد الدفع في المكتب يوضح أن الاستمرار اختياري دون ضغط.");
  addCheck(checks, "office_payment_reply_has_no_address", !officePaymentRequest || !includesAny(reply, ["شارع", "مجمع", "الطابق", "موقعنا هو", "عنواننا هو"]), "critical", "لا يُرسل عنوان المكتب لغرض دفع الرسوم.");
  addCheck(checks, "office_payment_reply_has_no_payment_instructions", !officePaymentRequest || !paymentInstructions, "critical", "بعد توضيح رفض الدفع في المكتب لا تُكرر تعليمات التحويل أو روابط الدفع في نفس الرد.");
  addCheck(checks, "internal_ready_to_ignore_not_exposed", !includesAny(reply, ["جاهز للتجاهل", "تجاهل العميل", "جاهز للتطنيش"]), "critical", "وسم التجاهل داخلي ولا يظهر للعميل.");
  addCheck(checks, "payment_allowed", facts.paymentCurrentlyAllowed || !paymentInstructions, "critical", "لا تُرسل تعليمات دفع عندما لا يكون الدفع مسموحًا.");
  addCheck(checks, "no_duplicate_payment", !facts.paymentAlreadyConfirmed || !includesAny(reply, ["ادفع الرسوم", "ادفعي الرسوم", "حول الرسوم", "حولي الرسوم", "الخطوه الجايه هي دفع"]), "critical", "لا يُطلب الدفع مرة ثانية بعد التأكيد أو رفع الوصل.");
  addCheck(checks, "confirmed_not_pending", !facts.paymentConfirmed || !includesAny(reply, ["الوصل بانتظار التأكيد", "الدفع قيد التأكيد", "ننتظر تأكيد الوصل", "خلينا نأكد الوصل"]), "critical", "لا يوصف الدفع المؤكد بأنه بانتظار التأكيد.");
  addCheck(checks, "pending_not_confirmed", !facts.paymentReceiptPending || !includesAny(reply, ["الدفع مؤكد", "تم تأكيد الدفع"]), "critical", "لا يوصف الوصل المعلق بأنه دفع مؤكد.");
  addCheck(checks, "no_whatsapp_receipt", !hasDirectWhatsAppReceiptRequest(reply), "critical", "وصل الدفع يُرفع فقط من الرابط الرسمي، وليس عبر واتساب.");
  addCheck(checks, "no_whatsapp_documents", !hasDirectWhatsAppDocumentRequest(reply), "critical", "المستندات الحساسة تُرفع فقط من الرابط الرسمي.");

  const unrequestedDocument = !facts.requiredDocument && includesAny(reply, [
    "نحتاج بيانات الكفيل",
    "مطلوب منك كفيل",
    "نحتاج كشف راتب",
    "مطلوب كشف راتب",
    "نحتاج الهوية",
    "مطلوب رفع الهوية",
    "رح نطلب منك مستندات",
  ]);
  addCheck(checks, "document_matches_state", !unrequestedDocument, "critical", "لا يُطلب مستند غير موجود في requiredDocument.");

  if (topics.includes("payment_method") && facts.paymentCurrentlyAllowed && paymentInstructions) {
    addCheck(checks, "complete_payment_explanation", paymentExplanationComplete(reply), "critical", "شرح الدفع المستحق يجب أن يتضمن جميع الحقائق الثابتة.");
  } else {
    addCheck(checks, "complete_payment_explanation", true, "critical", "لا يلزم شرح دفع كامل في هذه الحالة.");
  }

  addCheck(checks, "official_contact_only", !hasUnapprovedContactNumber(reply, facts), "critical", "لا يُذكر أي رقم اتصال غير الرقم الرسمي المعتمد.");
  addCheck(checks, "no_invented_business_hours", !hasUnsupportedBusinessHours(reply, facts), "critical", "ساعات الدوام غير مخزنة، لذلك لا يجوز اختراعها.");
  // V1.1.4 DEVICE SELECTION VALIDATOR START
  const deviceSelectionRequested = topics.includes("device_selection");
  const hasProductsLink = reply.includes("/products");
  const hasChangeDeviceLink = reply.includes("/change-device");
  const hasSelectDeviceLink = reply.includes("/select-device");
  const hasExpectedDeviceSelectionLink = Boolean(facts.deviceSelectionUrl && reply.includes(facts.deviceSelectionUrl));
  const deviceSelectionLinkMatches = !deviceSelectionRequested || (
    facts.hasApplication
      ? facts.hasSpecificDevice
        ? hasExpectedDeviceSelectionLink && hasChangeDeviceLink && !hasProductsLink && !hasSelectDeviceLink
        : hasExpectedDeviceSelectionLink && hasSelectDeviceLink && !hasProductsLink && !hasChangeDeviceLink
      : hasExpectedDeviceSelectionLink && hasProductsLink && !hasChangeDeviceLink && !hasSelectDeviceLink
  );
  addCheck(checks, "device_selection_link_matches_context", deviceSelectionLinkMatches, "critical", "رابط اختيار الجهاز يجب أن يكون شخصيًا للطلب القائم، أو رابط الأجهزة للعميل دون طلب مرتبط.");
  // V1.1.4 DEVICE SELECTION VALIDATOR END

  addCheck(checks, "device_mentions_grounded", !hasUnsupportedDeviceMention(reply, facts), "critical", "أي جهاز مذكور يجب أن يكون الجهاز الحالي أو جهاز تعديل مثبتًا بدليل المحادثة.");

  const deviceRequestClaim = hasDeviceChangeRequestClaim(reply);
  addCheck(checks, "device_change_request_truth", !deviceRequestClaim || facts.deviceChangeRequest.requested, "critical", "لا يُدّعى وجود طلب تعديل جهاز دون دليل.");
  const deviceSubmissionClaim = hasDeviceChangeSubmissionClaim(reply);
  addCheck(checks, "device_change_submission_truth", !deviceSubmissionClaim || facts.deviceChangeRequest.status === "submitted_for_review", "critical", "لا يتحول طلب العميل إلى طلب مرفوع للإدارة دون نموذج رسمي مثبت.");
  const deviceApprovalClaim = hasDeviceChangeApprovalClaim(reply);
  addCheck(checks, "device_change_approval_truth", !deviceApprovalClaim || facts.deviceChangeRequest.status === "approved", "critical", "لا يُدّعى اعتماد تعديل الجهاز دون حالة مؤكدة.");

  const linkedApplicationClaim = includesAny(reply, [
    "طلبك قيد",
    "طلبك لسا",
    "حالة طلبك",
    "الدفع مؤكد على طلبك",
    "الملف قيد",
  ]);
  addCheck(checks, "application_link_truth", facts.hasApplication || !linkedApplicationClaim, "critical", "لا تُذكر حالة طلب شخصية دون طلب مرتبط بالمحادثة.");

  addCheck(checks, "address_allowed", facts.officeAddressCanBeShared || !includesAny(reply, ["رانا سنتر", "شارع المدينه المنوره", "شارع المدينة المنورة", "مقابل مستشفى العيون"]), "critical", "لا يُذكر عنوان المكتب قبل الموافقة أو الموعد الرسمي.");
  addCheck(checks, "no_delivery_promise", !includesAny(reply, ["نوصل الجهاز", "التوصيل متاح", "مندوب التوصيل", "بنوصله لعندك"]), "critical", "لا يوجد توصيل.");
  addCheck(checks, "no_early_settlement_guarantee", !includesAny(reply, ["اكيد بتقدر تسدد كامل", "السداد الكامل متاح دائما", "تقدر تسكر الاقساط بأي وقت"]), "critical", "السداد المبكر لا يُضمن مسبقًا.");
  addCheck(checks, "final_approval_truth", facts.isApproved || !hasUnsupportedFinalApprovalClaim(reply), "critical", "لا تُدّعى موافقة نهائية غير موجودة.");
  addCheck(checks, "refund_completion_truth", facts.refundCompleted || !includesAny(reply, ["تم الاسترداد", "رجع المبلغ", "تمت الحواله", "تمت الحوالة"]), "critical", "لا يُدّعى اكتمال الاسترداد دون حالة مؤكدة.");
  addCheck(checks, "refund_registration_truth", facts.refundActive || !includesAny(reply, ["تم تسجيل الاسترداد", "طلب الاسترداد مسجل", "في طلب استرداد نشط"]), "critical", "لا يُدّعى وجود استرداد نشط إذا لم يظهر في الحقائق.");
  const refundRegistrationClaim = includesAny(reply, [
    "سجلت حالة الملف الآن: قيد الاسترداد",
    "تم تسجيل الاسترداد",
    "طلب الاسترداد مسجل",
    "في طلب استرداد نشط",
    "طلب الاسترداد قيد المتابعة",
  ]);
  addCheck(checks, "refund_requires_confirmed_payment", facts.paymentConfirmed || !refundRegistrationClaim, "critical", "لا يجوز إنشاء أو وصف استرداد نشط دون دفع مؤكد.");

  const actionClaim = includesAny(reply, ["تواصلت مع المورد", "اتصلت بالمورد", "تم تصعيد الطلب", "حولت طلبك للاداره", "رفعت طلبك للاداره"]);
  const supportedDeviceSubmission = facts.deviceChangeRequest.status === "submitted_for_review" && includesAny(reply, ["طلب تعديل الجهاز", "طلب التعديل"]);
  addCheck(checks, "no_unexecuted_action", !actionClaim || supportedDeviceSubmission, "critical", "لا يُدّعى تنفيذ إجراء غير مسجل.");
  addCheck(checks, "no_unsupported_term", !/(?:^|\s)\d{1,3}\s*(?:شهر|اشهر|أشهر)(?:\s|$)/.test(normalized(reply)), "critical", "لا تُخترع مدة تقسيط بالشهور.");
  addCheck(checks, "no_service_promise", !includesAny(reply, ["ما رح نأخرها عنك", "بنضمن ما تتأخر", "رح تخلص اليوم", "أكيد اليوم"]), "critical", "لا يُعطى وعد خدمة أو موعد غير مؤكد.");
  addCheck(checks, "no_unverified_registration_claim", !hasUnsupportedRegistrationClaim(reply), "critical", "لا يُدّعى تسجيل أو شهرة قانونية غير مثبتة.");
  addCheck(checks, "review_duration_policy_exact", !hasWrongReviewDuration(reply), "critical", "مدة الدراسة المعتمدة من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات.");
  addCheck(checks, "no_guaranteed_review_outcome", !hasGuaranteedReviewOutcome(reply), "critical", "لا يُضمن موعد أو نتيجة مراجعة غير مؤكدة.");
  addCheck(checks, "no_unverified_product_verification_promise", !hasUnverifiedProductVerificationPromise(reply), "critical", "لا يُوعد بالتحقق من مواصفة منتج دون آلية أو مصدر مثبت.");

  addCheck(checks, "stage_language_matches_application_status", !stageLanguageMismatch(reply, facts), "critical", "صياغة المرحلة تطابق حالة الطلب الفعلية.");
  addCheck(checks, "gender_language_matches_customer", !hasGenderLanguageMismatch(reply, facts.customerGender), "critical", "صيغة مخاطبة العميل تطابق الجنس اللغوي المؤكد أو تستخدم صياغة محايدة.");
  addCheck(checks, "empty_receipt_link_not_rendered", !hasEmptyLabeledLink(reply), "critical", "لا يظهر عنوان رابط دون رابط فعلي تحته.");

  const reviewTimeWrong = topics.includes("review_time") && includesAny(reply, ["من يوم الى 3", "من يوم إلى 3", "يوم لثلاث", "1 الى 3", "1-3"]);
  addCheck(checks, "review_duration_exact", !reviewTimeWrong, "critical", "المدة المعتمدة من يومين إلى 3 أيام عمل.");

  const cancellationLoop = context.initialIntent === "cancel_confirmed" && asksForCancellationConfirmationAgain(reply);
  addCheck(checks, "no_cancel_confirmation_loop", !cancellationLoop, "critical", "بعد تأكيد الإلغاء لا يُطلب التأكيد مرة ثانية.");

  const refundAnswerPresent = facts.refundActive && topics.includes("refund") && topicAnswered("refund", reply);
  const answeredTopics = topics.filter((topic) => {
    if (refundAnswerPresent && ["payment_status", "order_status", "review_time"].includes(topic)) return true;
    if (!facts.hasApplication && topic === "order_status" && includesAny(reply, ["ما ظهر عندي طلب مرتبط", "أرسل رقم التتبع", "ارسل رقم التتبع"])) return true;
    return topicAnswered(topic, reply);
  });
  const missingTopics = topics.filter((topic) => !answeredTopics.includes(topic));
  addCheck(checks, "all_topics_answered", missingTopics.length === 0, "critical", "تمت الإجابة عن جميع موضوعات رسالة العميل.");

  const failed = checks.filter((check) => !check.passed);
  const riskFlags = failed.map((check) => check.id);
  const criticalRiskCount = failed.filter((check) => check.severity === "critical").length;
  const warningCount = failed.filter((check) => check.severity === "warning").length;
  const score = Math.max(0, 100 - criticalRiskCount * 22 - warningCount * 6 - missingTopics.length * 8);

  return {
    valid: criticalRiskCount === 0,
    score,
    riskFlags,
    answeredTopics,
    missingTopics,
    policyChecks: checks,
    criticalRiskCount,
  };
}
