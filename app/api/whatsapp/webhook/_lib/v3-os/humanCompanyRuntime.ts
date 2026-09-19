import { normalizeArabic } from "./text";
import { customerFacingStatusLabel } from "./applicationJourney";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

function n(value: string | null | undefined) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return normalizeArabic(String(value || ""))
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[؟?!.,،؛:()[\]{}"'`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  | "official_external_number";

export function resolveHumanCompanyOverride(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): HumanCompanyOverrideKind {
  const q = n(input.turn.rawText);
  if (!q) return "none";
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

export function buildHumanCompanyOverrideReply(input: { kind: HumanCompanyOverrideKind; state: ConversationState; truth: TruthBundle }) {
  const app = input.truth.application || input.state.lastVerifiedApplication?.application || null;
  switch (input.kind) {
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
