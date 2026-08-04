import { normalizeArabicText } from "../text";
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
  const withoutTracking = normalizeDigits(value).replace(/AM-\d{8,}/gi, " ");
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
  return includesAny(reply, [
    "ساعات الدوام",
    "اوقات الدوام",
    "أوقات الدوام",
    "من السبت الى",
    "من السبت إلى",
    "من الاحد الى",
    "من الأحد إلى",
    "الدوام من",
    "صباحا حتى",
    "صباحًا حتى",
    "مساءا",
    "مساءً",
  ]) || /(?:^|\s)(?:[1-9]|1[0-2])(?::\d{2})?\s*(?:صباح|مساء)/.test(normalized(reply));
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
  const study = topics.some((topic) => ["requirements", "procedures", "document_upload"].includes(topic));
  if (contact) return agent === "tala" || agent === "fadwa";
  if (escalation) return agent === "omran";
  if (study) return agent === "abdullah" || agent === "abdulrahman";
  return agent === "tala" || agent === "fadwa";
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
  addCheck(checks, "no_internal_template", !includesAny(reply, ["اكتب السؤال كامل", "لازم تدخل بشري", "سيتم تحويلك", "متابعه بشريه", "متابعة بشرية"]), "critical", "لا يحتوي الرد قالبًا داخليًا أو باردًا.");
  addCheck(checks, "no_branch_word", !includesAny(reply, ["فرع", "فروع"]), "critical", "لا تُستخدم كلمة فرع أو فروع.");
  addCheck(checks, "correct_payment_alias", !includesAny(reply, ["payameen"]), "critical", "اسم الدفع الصحيح PAYAMEN وليس PAYAMEEN.");
  addCheck(checks, "no_ai_or_bot_discussion", !includesAny(reply, ["بوت", "ذكاء اصطناعي", "نظام تجريبي", "ai assistant"]), "critical", "لا يناقش الرد كونه بوتًا أو نظامًا تجريبيًا.");
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

  const actionClaim = includesAny(reply, ["تواصلت مع المورد", "اتصلت بالمورد", "تم تصعيد الطلب", "حولت طلبك للاداره", "رفعت طلبك للاداره"]);
  const supportedDeviceSubmission = facts.deviceChangeRequest.status === "submitted_for_review" && includesAny(reply, ["طلب تعديل الجهاز", "طلب التعديل"]);
  addCheck(checks, "no_unexecuted_action", !actionClaim || supportedDeviceSubmission, "critical", "لا يُدّعى تنفيذ إجراء غير مسجل.");
  addCheck(checks, "no_unsupported_term", !/(?:^|\s)\d{1,3}\s*(?:شهر|اشهر|أشهر)(?:\s|$)/.test(normalized(reply)), "critical", "لا تُخترع مدة تقسيط بالشهور.");
  addCheck(checks, "no_service_promise", !includesAny(reply, ["ما رح نأخرها عنك", "بنضمن ما تتأخر", "رح تخلص اليوم", "أكيد اليوم"]), "critical", "لا يُعطى وعد خدمة أو موعد غير مؤكد.");

  const reviewTimeWrong = topics.includes("review_time") && includesAny(reply, ["من يوم الى 3", "من يوم إلى 3", "يوم لثلاث", "1 الى 3", "1-3"]);
  addCheck(checks, "review_duration_exact", !reviewTimeWrong, "critical", "المدة المعتمدة من يومين إلى 3 أيام عمل.");

  const cancellationLoop = context.initialIntent === "cancel_confirmed" && asksForCancellationConfirmationAgain(reply);
  addCheck(checks, "no_cancel_confirmation_loop", !cancellationLoop, "critical", "بعد تأكيد الإلغاء لا يُطلب التأكيد مرة ثانية.");

  const answeredTopics = topics.filter((topic) => topicAnswered(topic, reply));
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
