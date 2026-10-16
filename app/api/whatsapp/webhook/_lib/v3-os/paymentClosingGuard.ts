import { applicationJourneyStage } from "./applicationJourney";
import { applicationReceiptUrl } from "./linkIntegrity";
import {
  containsAllCurrentFileOpeningPaymentDestinations,
  currentFileOpeningPaymentRule,
  fileOpeningPaymentWriterTruth,
} from "./paymentDestinationOverride";
import { normalizeArabic } from "./text";
import type { TruthBundle } from "./types";

export type PaymentClosingKind =
  | "none"
  | "amount_confirmation"
  | "method_details"
  | "beneficiary_explanation"
  | "beneficiary_mismatch"
  | "trust"
  | "claimed_paid";

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .toLowerCase()
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function paymentClosingStageOpen(truth: TruthBundle) {
  return applicationJourneyStage(truth.application) === "continuation_confirmed_fee_due";
}

function mutationOrRefundOwnsTurn(q: string) {
  return /(?:الغي|الغاء|استرد|استرداد|استرجع|استرجاع|الغوا|تلغي)/.test(q);
}

function installmentQuestionOwnsTurn(q: string) {
  const installment = /(?:قسط|اقساط|الاقساط|شهري|مده\s+التقسيط|مدة\s+التقسيط)/.test(q);
  const strongFeeClosing = /(?:رسوم\s+فتح\s+الملف|(?:5|٥|خمس)\s*(?:دنانير|دينار)).{0,25}(?:احول|ادفع|تحويل|دفع)|(?:احول|ادفع|تحويل|دفع).{0,25}(?:رسوم\s+فتح\s+الملف|(?:5|٥|خمس)\s*(?:دنانير|دينار))/.test(q);
  return installment && !strongFeeClosing;
}

export function resolvePaymentClosingKind(input: {
  customerText: string | null | undefined;
  truth: TruthBundle;
}): PaymentClosingKind {
  if (!paymentClosingStageOpen(input.truth)) return "none";
  const q = n(input.customerText);
  if (!q || mutationOrRefundOwnsTurn(q) || installmentQuestionOwnsTurn(q)) return "none";

  const beneficiaryContext = /(?:اسم\s+المستفيد|المستفيد|اسم\s+(?:الكليك|cliq)|عبد\s*الرحم(?:ا)?ن|abdul\s*rahman)/i.test(q);
  const mismatch = /(?:مختلف|مش\s+نفس|مو\s+نفس|غير\s+الاسم|اسم\s+غير|طلع\s+غير|طلع\s+اسم\s+ثاني|ما\s+طلع\s+نفس)/.test(q);
  if (beneficiaryContext && mismatch) return "beneficiary_mismatch";

  const paymentClaimNegated = /(?:^|\s)(?:ما|مش|لسا\s+ما|لسه\s+ما|لم)\s+(?:حولت|دفعت|تم\s+التحويل|عملت\s+تحويل|بعثت\s+المبلغ|ارسلت\s+المبلغ)(?:\s|$)/.test(q);
  const paymentClaimQuestion = /^(?:هل|هو)\s+تم\s+التحويل(?:\s|$)/.test(q);
  const claimedPaid = !paymentClaimNegated && !paymentClaimQuestion
    && /(?:^|\s)(?:حولت|دفعت|تم\s+التحويل|عملت\s+تحويل|بعثت\s+المبلغ|ارسلت\s+المبلغ)(?:\s|$)/.test(q);
  if (claimedPaid) return "claimed_paid";

  const beneficiaryWhy = beneficiaryContext
    && /(?:ليش|لماذا|ليه|مش\s+باسم|مو\s+باسم|مش\s+اسم|اسم\s+شخص|شخص\s+عادي|المفروض|ليش\s+مش)/.test(q);
  if (beneficiaryWhy) return "beneficiary_explanation";

  const amountQuestion = /(?:كم|قديش).{0,24}(?:احول|ادفع|المبلغ|رسوم\s+فتح\s+الملف)|(?:يعني|هسا|هسه|الان|الآن|هل).{0,20}(?:احول|ادفع).{0,18}(?:5|٥|خمس)|(?:احول|ادفع).{0,18}(?:5|٥|خمس)\s*(?:دنانير|دينار)?.{0,12}(?:بس|فقط|صح|؟)?$/.test(q);
  if (amountQuestion) return "amount_confirmation";

  const paymentMethod = /^(?:cliq|كليك|orange\s*money|اورنج\s*موني|اورنج\s*ماني)$/i.test(q)
    || /(?:كيف|وين|على\s+وين|طريقه|طريقة|بيانات).{0,28}(?:احول|ادفع|تحويل|الدفع)|(?:احول|ادفع|التحويل).{0,24}(?:كيف|وين|كليك|cliq|اورنج\s*موني|orange\s*money)/i.test(q);
  if (paymentMethod) return "method_details";

  const trustConcern = /(?:شو\s+عرفني|شو\s+بضمنلي|شو\s+بدو\s+يضمنلي|شو\s+يضمنلي|مين\s+بضمنلي|موثوق|موثوقه|مضمون|مضمونه|نصب|نصاب|احتيال|خايف|متخوف|اطمن|اطمئن|ثقه|ثقة|مصداقيه|مصداقية)/.test(q);
  if (trustConcern) return "trust";

  return "none";
}

function receiptInstruction(truth: TruthBundle) {
  const receipt = applicationReceiptUrl(truth);
  return receipt
    ? `بعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك:\n${receipt}`
    : "رابط رفع الوصل المرتبط بطلبك مش متاح عندي الآن. إذا كنت حولت بالفعل لا تعيد الدفع؛ بنكمل التحقق على نفس الطلب بدون ما أخليك تعمل تحويل ثاني.";
}

function expectedBeneficiary(truth: TruthBundle) {
  return String(truth.policy.paymentBeneficiaryName || fileOpeningPaymentWriterTruth().beneficiaryName || "").trim();
}

export function buildPaymentClosingReply(input: {
  kind: PaymentClosingKind;
  truth: TruthBundle;
}) {
  if (input.kind === "none" || !paymentClosingStageOpen(input.truth)) return null;

  const fee = Number(input.truth.policy.fileOpeningFeeJod || 5) || 5;
  const beneficiary = expectedBeneficiary(input.truth);
  const receipt = receiptInstruction(input.truth);
  const destinations = currentFileOpeningPaymentRule({ includeApology: false });

  if (input.kind === "beneficiary_mismatch") {
    return `لا تكمل التحويل إذا الاسم الظاهر عندك مختلف. اسم المستفيد المعتمد في بيانات الدفع الحالية هو ${beneficiary}. إذا ظهر اسم غيره وقف العملية ولا تعمل تحويل جديد. وإذا كنت حولت بالفعل، لا تدفع مرة ثانية؛ ارفع الوصل من الرابط المرتبط بطلبك حتى ينراجع التحويل:\n${applicationReceiptUrl(input.truth) || "رابط الوصل غير متاح حاليًا، فلا تعيد الدفع."}`;
  }

  if (input.kind === "claimed_paid") {
    return `إذا كنت حولت بالفعل، لا تعمل تحويل ثاني ولا تعيد الدفع. رسالتك وحدها ما بنعتبرها تأكيد دفع إداري؛ لازم ينرفع الوصل وينراجع على نفس الطلب.\n${receipt}\nالمبلغ المطلوب لرسوم فتح الملف هو ${fee} دنانير فقط. إذا كنت حولت مبلغ مختلف، لا تعمل أي تحويل إضافي قبل مراجعة الوصل.`;
  }

  if (input.kind === "beneficiary_explanation") {
    return `سؤالك بمحله. اسم المستفيد المعتمد اللي لازم يظهر حسب بيانات التحويل الحالية هو ${beneficiary}. ظهور هذا الاسم يطابق بيانات الدفع اللي أعطيناك إياها، حتى لو الاسم الظاهر اسم شخص وليس اسم «الأمين». ما رح أعتبر هالاسم لحاله إثبات قانوني للشركة. إذا ظهر عندك اسم مختلف عن ${beneficiary} لا تكمل التحويل. المطلوب الآن ${fee} دنانير فقط رسوم فتح الملف.\n${receipt}`;
  }

  if (input.kind === "amount_confirmation") {
    return `نعم، المطلوب الآن ${fee} دنانير فقط رسوم فتح الملف — مش دفعة أولى على الجهاز ومش القسط الأول.\n${destinations}\n${receipt}\nتأكيد الدفع النهائي يتم بعد مراجعة الوصل، فلا تعتبر التحويل مؤكدًا على الطلب قبل اعتماد الوصل.`;
  }

  if (input.kind === "method_details") {
    return `أكيد. المطلوب بهالمرحلة ${fee} دنانير فقط رسوم فتح الملف.\n${destinations}\n${receipt}\nبعد رفع الوصل بنراجع العملية، وما في داعي لأي تحويل إضافي.`;
  }

  return `حقك تطمّن قبل ما تحول. المطلوب بهالمرحلة ${fee} دنانير فقط رسوم فتح الملف، مش دفعة أولى ولا قسط أول. اسم المستفيد المعتمد في بيانات التحويل الحالية هو ${beneficiary}؛ إذا ظهر اسم مختلف لا تكمل التحويل. بعد التحويل بترفع الوصل من الرابط الرسمي المرتبط بنفس طلبك حتى ينراجع الدفع، وما بنعتبر الدفع مؤكد من رسالة واتساب وحدها. الرسوم مستردة بالكامل عبر المسار الرسمي إذا ما صدرت الموافقة النهائية، أو إذا قررت تلغي بعد دفع مؤكد.\n${receipt}`;
}

export function paymentClosingReplyCovers(input: {
  kind: PaymentClosingKind;
  reply: string | null | undefined;
  truth: TruthBundle;
}) {
  if (input.kind === "none") return true;
  const reply = String(input.reply || "").trim();
  if (!reply) return false;

  const q = n(reply);
  const fee = Number(input.truth.policy.fileOpeningFeeJod || 5) || 5;
  const beneficiary = expectedBeneficiary(input.truth);
  const receipt = applicationReceiptUrl(input.truth);
  const hasFee = q.includes(String(fee)) || (fee === 5 && /(?:٥|خمس)\s*(?:دنانير|دينار)?/.test(q));
  const hasBeneficiary = !beneficiary || reply.toUpperCase().includes(beneficiary.toUpperCase());
  const hasReceipt = !receipt || reply.includes(receipt);

  if (input.kind === "amount_confirmation" || input.kind === "method_details") {
    return hasFee && hasReceipt && containsAllCurrentFileOpeningPaymentDestinations(reply);
  }
  if (input.kind === "beneficiary_explanation") {
    return hasBeneficiary && hasReceipt && /(?:اسم\s+مختلف|ظهر\s+اسم\s+مختلف|لا\s+تكمل\s+التحويل|لا\s+تحول)/.test(q);
  }
  if (input.kind === "beneficiary_mismatch") {
    return hasBeneficiary && /(?:لا\s+تكمل|وقف|لا\s+تحول|ما\s+تحول)/.test(q) && /(?:لا\s+تدفع\s+مره\s+ثانيه|لا\s+تعيد\s+الدفع|لا\s+تعمل\s+تحويل\s+جديد)/.test(q);
  }
  if (input.kind === "claimed_paid") {
    return hasReceipt && /(?:لا\s+تعمل\s+تحويل\s+ثاني|لا\s+تعيد\s+الدفع|لا\s+تدفع\s+مره\s+ثانيه)/.test(q) && /(?:الوصل|مراجعه|مراجعة|تاكيد|تأكيد)/.test(q);
  }
  return hasFee && hasBeneficiary && hasReceipt && /(?:مسترد|استرداد)/.test(q) && /(?:اسم\s+مختلف|لا\s+تكمل\s+التحويل|لا\s+تحول)/.test(q);
}
