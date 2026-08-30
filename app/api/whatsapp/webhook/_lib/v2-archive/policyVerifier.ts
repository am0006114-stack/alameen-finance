import { normalizeArabicText } from "../text";
import { hasInternalCustomerFacingLanguage } from "../customerFacingPolicy";
import type { ArchiveCase } from "./types";

function n(value: string | null | undefined) {
  return normalizeArabicText(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function includesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(n(needle)));
}

function sentenceLooksNegated(sentence: string) {
  return includesAny(sentence, [
    "لسنا", "ليست", "ليس", "مش", "غير مرخص", "غير مرخصة", "غير مرخصه",
    "لا ندعي", "لا تدعي", "لا نقدم", "لا نوفر", "لا نمنح", "لا نقرض",
    "لا توجد علاقة", "لا يوجد علاقة", "مستقلة تماما", "مستقله تماما",
  ]);
}

function truthValue(item: ArchiveCase, key: string) {
  return item.historical_truth && Object.prototype.hasOwnProperty.call(item.historical_truth, key)
    ? item.historical_truth[key]
    : null;
}

function truthStatus(item: ArchiveCase) {
  return String(truthValue(item, "status") || "").trim().toLowerCase();
}

function truthPaymentStatus(item: ArchiveCase) {
  return String(truthValue(item, "payment_status") || "").trim().toLowerCase();
}

function isConditionalStatePhrase(text: string, phrase: string) {
  const idx = text.indexOf(phrase);
  if (idx < 0) return false;
  const before = text.slice(Math.max(0, idx - 90), idx);
  return includesAny(before, [
    "اذا", "إذا", "في حال", "لو", "بعد ما", "عندما", "لما",
    "اذا ظهر", "إذا ظهر", "اذا وصل", "إذا وصل", "اذا كانت", "إذا كانت",
    "حسب اللي ذكرت", "حسب ما ذكرت", "حسب كلامك", "مثل ما ذكرت",
  ]);
}

function phraseLooksNegated(sentence: string, phrase: string) {
  const target = n(phrase);
  const idx = sentence.indexOf(target);
  if (idx < 0) return false;
  const around = sentence.slice(Math.max(0, idx - 46), Math.min(sentence.length, idx + target.length + 20));
  return includesAny(around, [
    "ليس", "ليست", "وليس", "مش", "مو", "ما بتندفع", "ما بندفع", "ما بتدفع",
    "لا تدفع", "لا تُدفع", "غير متاح", "غير متاحه", "غير متاحة",
    "ممنوع", "مش في", "مو في", "ليس في", "مش عند", "مو عند", "ليس عند",
    "ما في", "لا يوجد", "لا توجد", "ما صدرت", "ما صدر",
  ]);
}

function feeTimingAffirmativeViolation(sentence: string, phrases: string[]) {
  return phrases.some((phrase) => sentence.includes(n(phrase)) && !phraseLooksNegated(sentence, phrase));
}

function statePhraseIsGuarded(text: string, phrase: string) {
  if (isConditionalStatePhrase(text, phrase)) return true;
  const idx = text.indexOf(phrase);
  if (idx < 0) return false;
  const before = text.slice(Math.max(0, idx - 100), idx);
  return includesAny(before, [
    "حسب اللي ذكرت", "حسب ما ذكرت", "حسب كلامك", "إنت ذكرت", "انت ذكرت",
    "اذا اللي وصلك", "إذا اللي وصلك", "إذا كانت الرساله", "إذا كانت الرسالة",
  ]);
}

export function isLowValueArchiveNoise(value: string | null | undefined, messageType?: string | null) {
  const raw = String(value || "").trim();
  const text = n(raw);
  if (!text) return true;

  if (String(messageType || "").toLowerCase() === "unsupported") return true;

  // Punctuation-only archive artifacts such as ".", "..", "...", "؟؟" should cost zero AI.
  if (raw.replace(/[\s.،,؛;:!؟?…_~\-–—]+/g, "").length === 0) return true;

  return [
    "this is a text message",
    "this is a message",
    "text message",
    "تم استلام رساله واتساب من نوع unsupported",
    "تم استلام رسالة واتساب من نوع unsupported",
  ].some((needle) => text === n(needle));
}

export function isSimpleSocialArchiveTurn(value: string | null | undefined) {
  const text = n(value);
  if (!text) return false;
  return new Set([
    "مرحبا", "هلا", "اهلا", "اهلين", "السلام عليكم", "صباح الخير", "مساء الخير",
    "شكرا", "شكراً", "مشكور", "يسلمو", "تسلم", "العفو",
  ].map(n)).has(text);
}

export function archiveReplyPolicyViolations(value: string | null | undefined) {
  const raw = String(value || "");
  const text = n(raw);
  if (!text) return [] as string[];

  const violations: string[] = [];

  // Canonical operating identity is exactly "الأمين للأقساط".
  if (text.includes(n("الأمين للأقساط والتمويل")) || text.includes(n("الامين للاقساط والتمويل"))) {
    violations.push("forbidden_business_name_alameen_installments_and_finance");
  }

  if (/\bpayamen\b/i.test(raw)) {
    violations.push("forbidden_payment_alias_payamen");
  }

  if (hasInternalCustomerFacingLanguage(raw)) {
    violations.push("internal_system_language_leak");
  }

  // Any positive licensing/regulatory claim is forbidden unless the same sentence clearly negates it.
  const sentences = text.split(/[.!؟?\n]+/).map((x) => x.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const mentionsLicense = /مرخص|ترخيص|مرخصه|مرخصة|مرخصين/.test(sentence);
    const mentionsCentralBank = includesAny(sentence, ["البنك المركزي", "رقابه البنك المركزي", "رقابة البنك المركزي"]);
    if ((mentionsLicense || mentionsCentralBank) && !sentenceLooksNegated(sentence)) {
      violations.push(mentionsCentralBank ? "unsupported_central_bank_claim" : "unsupported_license_claim");
    }

    // Broad positive financing/lending claims, not just "شركة تمويل".
    const positiveFinancePhrase = includesAny(sentence, [
      "نقدم تمويل", "نوفر تمويل", "خدمه تمويل", "خدمة تمويل", "تمويل اجهزه", "تمويل أجهزة",
      "تمويل الاجهزه", "تمويل الأجهزة", "شركه تمويل", "شركة تمويل", "جهه تمويل", "جهة تمويل",
      "مؤسسه تمويل", "مؤسسة تمويل", "نمول", "نمنح قروض", "نقدم قروض", "خدمه اقراض", "خدمة إقراض",
    ]);
    if (positiveFinancePhrase && !sentenceLooksNegated(sentence)) {
      violations.push("unsupported_financing_or_lending_claim");
    }
  }

  // Sensitive documents/data may only be requested through the official secure link.
  const asksToSend = includesAny(text, ["ابعث", "ابعت", "ارسل", "أرسل", "زودني", "اعطيني", "أعطيني", "ابعثلنا", "ارسلنا"]);
  const mentionsSensitive = includesAny(text, [
    "الهويه", "الهوية", "كشف الراتب", "شهاده الراتب", "شهادة الراتب",
    "بيانات الكفيل", "معلومات الكفيل", "رقم الكفيل", "هويه الكفيل", "هوية الكفيل",
  ]);
  const secureLinkMentioned = includesAny(text, ["الرابط الرسمي", "الرابط الامن", "الرابط الآمن", "رابط الطلب"]);
  if (asksToSend && mentionsSensitive && !secureLinkMentioned) {
    violations.push("sensitive_data_requested_outside_official_link");
  }

  // Payment receipts / transaction screenshots are also sensitive transaction evidence.
  const mentionsPaymentProof = includesAny(text, [
    "اثبات الدفع", "إثبات الدفع", "وصل الدفع", "صوره التحويل", "صورة التحويل",
    "لقطه شاشه", "لقطة شاشة", "رقم العمليه", "رقم العملية", "ايصال الدفع", "إيصال الدفع",
  ]);
  if (asksToSend && mentionsPaymentProof && !secureLinkMentioned) {
    violations.push("payment_proof_requested_outside_official_link");
  }

  // Stable commercial-policy invariants. These are not application-state claims.
  for (const sentence of sentences) {
    const mentionsFee = includesAny(sentence, ["رسوم فتح الملف", "الخمس دنانير", "5 دنانير", "٥ دنانير"]);
    if (mentionsFee && feeTimingAffirmativeViolation(sentence, [
      "عند الاستلام", "وقت الاستلام", "عند الزياره", "عند الزيارة", "في المكتب", "بالمكتب",
    ])) {
      violations.push("wrong_file_fee_timing_or_office_payment_claim");
    }
    if (mentionsFee && includesAny(sentence, ["اذا قررت تقدم الطلب", "إذا قررت تقدم الطلب", "عند تقديم الطلب", "وقت تقديم الطلب"])) {
      violations.push("wrong_file_fee_timing_before_preliminary_qualification");
    }
    if (includesAny(sentence, ["بدون فوائد", "ما في فوائد", "لا يوجد فوائد", "لا توجد فوائد", "بدون فوائد ربويه", "بدون فوائد ربوية"])) {
      violations.push("unsupported_interest_or_religious_claim");
    }
    if (includesAny(sentence, ["سعر الجهاز عندك", "اذا عندك سعر", "إذا عندك سعر", "من وين ناوي تشتري", "من وين بدك تشتري"])) {
      violations.push("external_purchase_price_assumption");
    }
  }

  return uniq(violations);
}

export function archiveConversationPolicyViolations(item: ArchiveCase, reply: string | null | undefined) {
  const customer = n(item.customer_message);
  const text = n(reply);
  if (!customer || !text) return [] as string[];
  const violations: string[] = [];

  const asksHuman = includesAny(customer, ["بدي موظف", "بدي موضف", "موظف", "موضف", "احكي مع موظف", "احكي مع حدا"]);
  const acknowledgesHuman = includesAny(text, ["موظف", "موضف", "زميل", "الفريق", "المتابعه البشريه", "المتابعة البشرية", "التصعيد"]);
  if (asksHuman && !acknowledgesHuman) violations.push("explicit_human_handoff_missed");

  if (item.tracking_id && includesAny(text, ["رقم الطلب", "رقم التتبع"]) && includesAny(text, ["ابعث", "ارسل", "أرسل", "زودني", "اعطيني", "أعطيني", "شو رقم"])) {
    violations.push("known_tracking_id_reasked");
  }

  // wa_id is already known to the WhatsApp system; asking for the phone again is unnecessary continuity loss.
  if (item.wa_id && includesAny(text, ["رقم الهاتف", "رقم تلفون", "رقم الموبايل"]) && includesAny(text, ["ابعث", "ارسل", "أرسل", "زودني", "اعطيني", "أعطيني", "شو رقم"])) {
    violations.push("known_whatsapp_number_reasked");
  }

  const asksStateMutation = includesAny(customer, [
    "الغاء الطلب", "إلغاء الطلب", "الغي الطلب", "ألغي الطلب", "الغاء طلب الاسترداد", "إلغاء طلب الاسترداد",
    "بدي استرداد", "بدي استرجاع", "استرجاع المصاري", "استرداد الرسوم",
  ]);
  const asksHumanContact = includesAny(customer, ["حدا يتواصل معي", "بدي موظف", "بدي موضف", "احكي مع موظف", "احكي مع حدا"]);
  const claimsExecution = includesAny(text, [
    "تم تسجيل طلبك", "تم تسجيل طلب", "تم تسجيل الإلغاء", "تم تسجيل الغاء", "تم إلغاء الطلب", "تم الغاء الطلب",
    "تم إلغاء الاسترداد", "تم الغاء الاسترداد", "تم رفع طلبك", "رح نرفع طلبك", "سأرفع طلبك",
    "سنقوم بمعالجته", "سنقوم بإلغائه", "سيتم إلغاء الطلب", "سيتم الغاء الطلب", "سيتم إلغاء الاسترداد", "سيتم الغاء الاسترداد",
  ]);
  const claimsHandoffExecution = includesAny(text, [
    "رح أحول طلبك لموظف", "رح احول طلبك لموظف", "سأحول طلبك لموظف", "سيتم تحويل طلبك لموظف",
    "رح أحولك لموظف", "رح احولك لموظف", "سيتواصل معك موظف", "موظف مختص يتواصل معك",
  ]);
  if (asksStateMutation && claimsExecution) violations.push("unexecuted_state_action_claim");
  if (asksHumanContact && claimsHandoffExecution) violations.push("unexecuted_handoff_claim");

  return uniq(violations);
}

export function archiveTruthPolicyViolations(item: ArchiveCase, reply: string | null | undefined) {
  const text = n(reply);
  if (!text) return [] as string[];

  const violations: string[] = [];
  const confidence = String(item.historical_truth_confidence || "none").toLowerCase();
  const status = truthStatus(item);
  const paymentStatus = truthPaymentStatus(item);
  const paymentConfirmedAt = truthValue(item, "payment_confirmed_at");
  const reliable = confidence === "high" || confidence === "medium";

  const hasAssertive = (phrases: string[]) => phrases.some((phrase) => {
    const normalized = n(phrase);
    return text.includes(normalized) && !statePhraseIsGuarded(text, normalized);
  });
  const hasPositiveAssertive = (phrases: string[]) => phrases.some((phrase) => {
    const normalized = n(phrase);
    return text.includes(normalized) && !statePhraseIsGuarded(text, normalized) && !phraseLooksNegated(text, normalized);
  });

  const finalApprovalClaim = hasPositiveAssertive(["تمت الموافقه", "تمت الموافقة", "صدرت الموافقه", "صدرت الموافقة", "عليه موافقه نهائيه", "عليه موافقة نهائية", "طلبك موافق"]);
  const preliminaryApprovalClaim = hasPositiveAssertive(["الموافقه المبدئيه تمت", "الموافقة المبدئية تمت", "تمت الموافقه المبدئيه", "تمت الموافقة المبدئية", "مؤهل مبدئيا", "مؤهل مبدئيًا"]);
  const rejectedClaim = hasAssertive(["تم رفض الطلب", "طلبك مرفوض", "لم تتم الموافقه", "لم تتم الموافقة", "غير موافق عليه"]);
  const cancelledClaim = hasPositiveAssertive(["تم الغاء الطلب", "تم إلغاء الطلب", "الطلب ملغي", "طلبك ملغي"]);
  const refundRequestedClaim = hasPositiveAssertive(["طلب الاسترداد مسجل", "الاسترداد قيد المراجعه", "الاسترداد قيد المراجعة", "قيد الاسترداد"]);
  const refundCompletedClaim = hasPositiveAssertive(["تم تنفيذ الاسترداد", "تم الاسترداد", "اكتمل الاسترداد"]);
  const paymentConfirmedClaim = hasPositiveAssertive(["تم تأكيد الدفع", "الدفع مؤكد", "تم تأكيد الوصل"]);
  const needsGuarantorClaim = hasPositiveAssertive(["مطلوب كفيل", "يحتاج كفيل", "بحاجه لكفيل", "بحاجة لكفيل"]);
  const guarantorReceivedClaim = hasPositiveAssertive(["تم استلام بيانات الكفيل", "استلمنا بيانات الكفيل"]);
  const needsSalaryClaim = hasPositiveAssertive(["مطلوب كشف راتب", "يحتاج كشف راتب", "بحاجه لكشف راتب", "بحاجة لكشف راتب"]);
  const salaryReceivedClaim = hasPositiveAssertive(["تم استلام كشف الراتب", "استلمنا كشف الراتب"]);
  const needsIdentityClaim = hasPositiveAssertive(["مطلوب الهويه", "مطلوب الهوية", "يحتاج رفع الهويه", "يحتاج رفع الهوية"]);
  const appointmentClaim = hasPositiveAssertive(["تم تحديد الموعد", "موعدك محدد", "تم حجز موعد", "موعد الاستلام محدد"]);

  const anyStateClaim = finalApprovalClaim || preliminaryApprovalClaim || rejectedClaim || cancelledClaim || refundRequestedClaim || refundCompletedClaim || paymentConfirmedClaim || needsGuarantorClaim || guarantorReceivedClaim || needsSalaryClaim || salaryReceivedClaim || needsIdentityClaim || appointmentClaim;
  if (!reliable && anyStateClaim) {
    violations.push("unsupported_application_state_claim_low_truth");
    return uniq(violations);
  }

  if (finalApprovalClaim && !["approved", "customer_accepts_delivery_delay"].includes(status)) violations.push("unsupported_final_approval_claim");
  if (preliminaryApprovalClaim && ![
    "preliminary_qualified", "customer_confirmed_continue", "pending_payment", "pending_payment_confirmation",
    "payment_info_sent", "needs_guarantor", "needs_salary_slip", "needs_identity", "identity_requested",
    "salary_slip_uploaded", "guarantor_submitted", "under_review", "approved", "customer_accepts_delivery_delay",
  ].includes(status)) violations.push("unsupported_preliminary_approval_claim");
  if (rejectedClaim && !["rejected", "not_approved"].includes(status)) violations.push("unsupported_rejection_claim");
  if (cancelledClaim && status !== "cancelled") violations.push("unsupported_cancellation_claim");
  if (refundRequestedClaim && !["refund_requested", "refund_completed"].includes(status) && paymentStatus !== "refund_requested") violations.push("unsupported_refund_state_claim");
  if (refundCompletedClaim && status !== "refund_completed") violations.push("unsupported_refund_completed_claim");
  if (paymentConfirmedClaim && paymentStatus !== "confirmed" && !paymentConfirmedAt) violations.push("unsupported_payment_confirmed_claim");
  if (needsGuarantorClaim && status !== "needs_guarantor") violations.push("unsupported_guarantor_requirement_claim");
  if (guarantorReceivedClaim && status !== "guarantor_submitted") violations.push("unsupported_guarantor_received_claim");
  if (needsSalaryClaim && status !== "needs_salary_slip") violations.push("unsupported_salary_requirement_claim");
  if (salaryReceivedClaim && status !== "salary_slip_uploaded") violations.push("unsupported_salary_received_claim");
  if (needsIdentityClaim && !["needs_identity", "identity_requested"].includes(status)) violations.push("unsupported_identity_requirement_claim");

  // Appointment truth is not reconstructed in archive historical_truth; do not allow invented confirmed appointments.
  if (appointmentClaim) violations.push("unsupported_appointment_claim");

  const paymentActionable =
    ["preliminary_qualified", "customer_confirmed_continue"].includes(status) ||
    ["pending", "pending_payment", "payment_info_sent"].includes(paymentStatus);

  // Negative/current-state assertions are still state claims. With weak archive truth,
  // do not invent that approval is absent or that no payment is due.
  const noFinalApprovalClaim = hasAssertive([
    "حاليا ما في موافقه نهائيه", "حاليًا ما في موافقة نهائية", "ما في موافقه نهائيه",
    "ما في موافقة نهائية", "لا توجد موافقه نهائيه", "لا توجد موافقة نهائية",
    "الموافقه النهائيه ما صدرت", "الموافقة النهائية ما صدرت",
  ]);
  if (noFinalApprovalClaim && !reliable) violations.push("unsupported_no_final_approval_claim_low_truth");

  const noPaymentDueClaim = hasAssertive([
    "لا يوجد اي دفع مطلوب", "لا يوجد أي دفع مطلوب", "ما في دفع مطلوب", "ما في أي دفع مطلوب",
    "ما في اي دفع هلا", "ما في أي دفع هلا", "هلا ما عليك اي مبلغ", "هلا ما عليك أي مبلغ",
    "حاليا ما في دفع مطلوب", "حاليًا ما في دفع مطلوب",
  ]);
  if (noPaymentDueClaim && (!reliable || paymentActionable)) violations.push("unsupported_no_payment_due_claim");

  // A direct "pay now / required now" instruction is application-state dependent.
  const currentFeeDueClaim = includesAny(text, [
    "رسوم فتح الملف تدفع الان", "رسوم فتح الملف تُدفع الآن", "ادفع الرسوم الان", "ادفع الرسوم الآن",
    "المطلوب حاليا دفع رسوم فتح الملف", "المطلوب حاليًا دفع رسوم فتح الملف",
    "المطلوب منك فقط رسوم فتح الملف", "جاهز تدفع الرسوم الان", "جاهز تدفع الرسوم الآن",
  ]);
  if (currentFeeDueClaim && !paymentActionable) violations.push("unsupported_current_fee_due_claim");

  // Do not fabricate that an application is suspended/pending on the fee without reliable state.
  if (includesAny(text, [
    "طلبك معلق على دفع الرسوم", "طلبك معلّق على دفع الرسوم", "طلبك بانتظار دفع الرسوم",
    "طلبك واقف على دفع الرسوم",
  ]) && !reliable) {
    violations.push("unsupported_application_fee_pending_claim");
  }

  // Payment verification requires the official receipt/payment flow; never invent an automatic verifier.
  if (includesAny(text, [
    "النظام بيتحقق من العمليه تلقائيا", "النظام بيتحقق من العملية تلقائيًا",
    "النظام يتحقق من العمليه تلقائيا", "النظام يتحقق من العملية تلقائيًا",
    "الدفع بيتأكد تلقائيا", "الدفع بيتأكد تلقائيًا", "التحقق تلقائي",
  ])) {
    violations.push("unsupported_automatic_payment_verification_claim");
  }

  // There is no generic promise that a due payment can simply be postponed to a chosen date.
  if (includesAny(text, [
    "ممكن تأجيل الدفع", "يمكن تأجيل الدفع", "بنقدر نأجل الدفع", "بتقدر تأجل الدفع",
    "تأجيل الدفع حسب الترتيب", "اكد الموعد معهم كتابيا", "أكد الموعد معهم كتابيًا",
  ])) {
    violations.push("unsupported_payment_deferral_policy");
  }

  // Weak historical truth cannot support a definitive claim that no installment application exists.
  if (!reliable && includesAny(text, [
    "ما عندنا طلب تقسيط مسجل", "لا يوجد طلب تقسيط مسجل", "ما في طلب تقسيط مسجل",
    "ما عندك طلب تقسيط مسجل", "لا يظهر عندنا طلب تقسيط",
  ])) {
    violations.push("unsupported_no_application_exists_claim");
  }

  // Replay candidates cannot promise that they themselves will send a payment link later.
  if (includesAny(text, [
    "بوصلك الرابط الرسمي للدفع", "رح ابعتلك رابط الدفع", "رح أبعثلك رابط الدفع",
    "رح ارسل لك رابط الدفع", "رح أرسل لك رابط الدفع", "برسلك رابط الدفع",
  ])) {
    violations.push("unexecuted_payment_link_delivery_promise");
  }

  // Do not fabricate operational review ETAs from thin historical truth.
  const reviewEtaClaim = includesAny(text, [
    "خلال يوم عمل", "يوم عمل تقريبا", "يوم عمل تقريباً", "خلال يومين", "خلال 24 ساعه", "خلال 24 ساعة",
    "خلال 48 ساعه", "خلال 48 ساعة", "بيوم عمل", "بحدود يوم عمل",
  ]);
  if (reviewEtaClaim) violations.push("unsupported_review_eta_claim");

  // Offering to schedule an office visit is a stateful promise unless the archived state supports an approved/appointment stage.
  const schedulingPromise = includesAny(text, ["نحدد موعد", "حدد موعد", "بنرتب موعد", "نرتب الموعد", "بترتب موعد", "احكيلي الوقت المناسب"]);
  if (schedulingPromise && !["approved", "customer_accepts_delivery_delay"].includes(status)) {
    violations.push("unsupported_appointment_scheduling_promise");
  }

  // There is no generic variable device down-payment rule. The fixed fee is separate, and the first installment follows receipt/contract.
  if (includesAny(text, ["دفعة أولى تختلف", "دفعه اولى تختلف", "بنحتاج دفعة أولى", "بنحتاج دفعه اولى"])) {
    violations.push("unsupported_variable_down_payment_claim");
  }

  // Expand refund-state detection for natural phrasings such as "طلب الاسترداد ما زال قيد المراجعة".
  if (includesAny(text, ["طلب الاسترداد ما زال قيد المراجعه", "طلب الاسترداد ما زال قيد المراجعة", "طلب الاسترداد لسا قيد المراجعه", "طلب الاسترداد لسا قيد المراجعة"]) && !reliable) {
    violations.push("unsupported_refund_state_claim_low_truth");
  }

  return uniq(violations);
}
