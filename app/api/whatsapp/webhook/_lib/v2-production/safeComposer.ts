import type { V2InterpretedTurn } from "../v2-conversation";
import { normalizeJordanPhone } from "../text";
import { V2_POLICY } from "./policyRegistry";
import type { V2ResolvedTruth } from "./truthResolver";

function statusLine(status: string | null | undefined) {
  const map: Record<string, string> = {
    preliminary_qualified: "طلبك مؤهل مبدئيًا",
    customer_confirmed_continue: "تم تأكيد رغبتك بالاستمرار على الطلب",
    under_review: "طلبك قيد الدراسة",
    needs_identity: "الطلب بانتظار رفع الهوية من الرابط الرسمي",
    identity_requested: "الطلب بانتظار رفع الهوية من الرابط الرسمي",
    needs_guarantor: "الطلب بانتظار بيانات الكفيل",
    guarantor_submitted: "بيانات الكفيل مسجلة على الطلب",
    needs_salary_slip: "الطلب بانتظار كشف الراتب",
    salary_slip_uploaded: "كشف الراتب مسجل على الطلب",
    approved: "الطلب موافق عليه",
    cancelled: "الطلب ملغي",
    refund_requested: "طلب الاسترداد مسجل",
    refund_completed: "الاسترداد مكتمل",
  };
  const clean = String(status || "").trim();
  return map[clean] || (clean ? `حالة الطلب المسجلة: ${clean}` : "");
}

function receiptLink(truth: V2ResolvedTruth) {
  return truth.trustedLinks.find((url) => /\/receipt(?:$|[?#])/i.test(url)) || "";
}

function trackLink(truth: V2ResolvedTruth) {
  return truth.trustedLinks.find((url) => /\/track\?/i.test(url)) || `${V2_POLICY.website}/track`;
}

export function composeV2TruthOnlyReply(input: {
  customerText: string;
  turn: V2InterpretedTurn;
  truth: V2ResolvedTruth;
  actionExecuted?: boolean;
  actionSummary?: string | null;
}) {
  const topics = new Set(input.turn.topics || []);
  const app = input.truth.application;
  const parts: string[] = [];

  if (topics.has("greeting") && topics.size === 1) return "أهلًا فيك، تفضل.";
  if (topics.has("acknowledgement") && topics.size === 1) return "تمام، وصلتني.";
  if (topics.has("payment_fee")) {
    parts.push(`رسوم فتح الملف ${V2_POLICY.fileOpeningFeeJod} دنانير، وهي منفصلة عن ثمن الجهاز والقسط الأول، وتُطلب فقط بعد التأهيل المبدئي إذا قررت تكمل.`);
  }
  if (topics.has("first_installment")) parts.push(`${V2_POLICY.firstInstallment}.`);
  if (topics.has("office_location")) parts.push(`موقعنا العام: ${V2_POLICY.generalLocation}. الحضور للمكتب بيكون بموعد.`);
  if (topics.has("delivery")) parts.push("ما عنا توصيل؛ استلام الجهاز من المكتب بموعد بعد اكتمال الخطوات المطلوبة.");
  if (topics.has("business_identity")) parts.push(`الاسم المعتمد هو ${V2_POLICY.businessName}. ${V2_POLICY.independence}.`);
  if (topics.has("business_website")) parts.push(`الموقع الرسمي: ${V2_POLICY.website}`);

  if (topics.has("application_status") || topics.has("requirements") || topics.has("receipt_upload") || topics.has("refund")) {
    if (app && input.truth.confidence !== "none") {
      const line = statusLine(app.status);
      if (line) parts.push(`${line}${app.tracking_id ? ` — رقم الطلب ${app.tracking_id}` : ""}.`);
    } else {
      parts.push("ما بدي أعطيك حالة طلب من عندي بدون ما تكون مربوطة بطلب مؤكد في السجل.");
    }
  }

  if (topics.has("receipt_upload")) {
    const url = receiptLink(input.truth);
    if (url) parts.push(`إثبات الدفع ينرفع فقط من الرابط الرسمي المرتبط بطلبك، مش على واتساب:\n${url}`);
    else parts.push("إثبات الدفع ينرفع فقط من الرابط الرسمي المرتبط بالطلب، مش على واتساب.");
  }

  if (topics.has("payment_method") || topics.has("payment_recipient")) {
    parts.push(`بيانات الدفع المعتمدة: ${V2_POLICY.paymentAliases.join(" أو ")}، واسم المستفيد ${V2_POLICY.paymentBeneficiary}. استخدمها فقط إذا كانت مرحلة طلبك تتطلب رسوم فتح الملف.`);
  }

  if (topics.has("human_handoff")) {
    parts.push(input.actionExecuted
      ? (input.actionSummary || "تم تنفيذ طلب التحويل للموظف.")
      : "فهمت إنك بدك تحكي مع موظف. ما رح أأكد إنه تم تحويلك إلا لما يتم التحويل فعليًا.");
  }

  if (topics.has("cancellation") || topics.has("refund") || topics.has("continuation")) {
    if (input.actionExecuted && input.actionSummary) parts.push(input.actionSummary);
    else if (!parts.some((x) => /الاسترداد|ملغي|الاستمرار/.test(x))) {
      parts.push("فهمت طلبك، لكن ما رح أعتبر الإلغاء أو الاسترداد أو الاستمرار منفذًا إلا إذا تنفذ فعليًا على الطلب.");
    }
  }

  if (topics.has("application_status") && app?.tracking_id && !parts.some((x) => /\/track/.test(x))) {
    parts.push(`رابط المتابعة:\n${trackLink(input.truth)}`);
  }

  if (!parts.length) {
    if (app && input.truth.confidence !== "none") {
      const line = statusLine(app.status);
      if (line) parts.push(`${line}${app.tracking_id ? ` — رقم الطلب ${app.tracking_id}` : ""}.`);
    }
  }

  if (!parts.length) {
    const phone = normalizeJordanPhone(app?.phone || "");
    return phone
      ? "وصلتني رسالتك، لكن ما بدي أخمّن جواب مش ثابت عندي. احكيلي النقطة نفسها بجملة قصيرة وأنا بجاوبك على المؤكد فقط."
      : "وصلتني رسالتك، لكن ما بدي أخمّن معلومة مش مؤكدة. وضحلي النقطة اللي بدك إياها وبجاوبك على المؤكد فقط.";
  }

  return parts.join("\n\n").trim();
}
