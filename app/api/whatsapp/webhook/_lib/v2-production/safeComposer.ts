import type { V2InterpretedTurn } from "../v2-conversation";
import { V2_POLICY } from "./policyRegistry";
import type { V2ResolvedTruth } from "./truthResolver";
import type { V2ActionExecution } from "./actionExecutor";

function statusLine(status: string | null | undefined) {
  const map: Record<string, string> = {
    preliminary_qualified: "طلبك مؤهل مبدئيًا",
    customer_confirmed_continue: "رغبتك بالاستمرار مسجلة على الطلب",
    under_review: "طلبك قيد الدراسة",
    needs_identity: "الطلب بانتظار رفع الهوية من الرابط الرسمي",
    identity_requested: "الطلب بانتظار رفع الهوية من الرابط الرسمي",
    needs_guarantor: "الطلب بانتظار بيانات الكفيل",
    guarantor_submitted: "بيانات الكفيل مسجلة على الطلب",
    needs_salary_slip: "الطلب بانتظار كشف الراتب",
    salary_slip_uploaded: "كشف الراتب مسجل على الطلب",
    approved: "الطلب عليه موافقة نهائية",
    customer_accepts_delivery_delay: "الطلب عليه موافقة نهائية وبانتظار اعتماد الاستلام",
    cancelled: "الطلب ملغي",
    refund_requested: "طلب الاسترداد مسجل وقيد المراجعة",
    refund_completed: "الاسترداد مكتمل",
  };
  const clean = String(status || "").trim();
  return map[clean] || (clean ? `حالة الطلب المسجلة: ${clean}` : "");
}

function linkFor(truth: V2ResolvedTruth, path: string) {
  return truth.trustedLinks.find((url) => new RegExp(`/${path}(?:$|[?#])`, "i").test(url)) || "";
}


function actionResultFor(input: V2ActionExecution | null | undefined, intents: string[]) {
  return input?.results?.find((item) => intents.includes(String(item.intent))) || null;
}

function actionSummaryFor(input: V2ActionExecution | null | undefined, intents: string[]) {
  const summaries = (input?.results || [])
    .filter((item) => intents.includes(String(item.intent)))
    .map((item) => String(item.summary || "").trim())
    .filter(Boolean);
  return Array.from(new Set(summaries)).join(" ").trim();
}

function applicationContext(truth: V2ResolvedTruth) {
  if (truth.source === "ambiguous_phone_applications") {
    return `ظاهر عندي أكثر من طلب على نفس الرقم (${truth.candidateCount}). ابعث رقم الطلب اللي يبدأ بـ AM- حتى أربط جوابك بالملف الصحيح.`;
  }
  if (truth.application && truth.confidence === "high") {
    const line = statusLine(truth.application.status);
    return `${line}${truth.application.tracking_id ? ` — رقم الطلب ${truth.application.tracking_id}` : ""}.`;
  }
  return "ما بدي أعطيك حالة طلب من عندي بدون ربط الرسالة بطلب مؤكد في السجل.";
}

function requirementReply(truth: V2ResolvedTruth) {
  const app = truth.application;
  if (!app || truth.confidence !== "high") return applicationContext(truth);
  const status = String(app.status || "");
  const map: Record<string, [string, string]> = {
    needs_identity: ["الخطوة المطلوبة حاليًا هي رفع الهوية من الرابط الرسمي فقط، مش عبر واتساب.", "identity"],
    identity_requested: ["الخطوة المطلوبة حاليًا هي رفع الهوية من الرابط الرسمي فقط، مش عبر واتساب.", "identity"],
    needs_guarantor: ["الخطوة المطلوبة حاليًا هي تعبئة بيانات الكفيل من الرابط الرسمي.", "guarantor"],
    needs_salary_slip: ["الخطوة المطلوبة حاليًا هي رفع كشف راتب أو شهادة راتب من الرابط الرسمي.", "salary-slip"],
  };
  const row = map[status];
  if (!row) return `${applicationContext(truth)} حاليًا ما بدي أضيف خطوة غير ظاهرة على حالة الطلب.`;
  const url = linkFor(truth, row[1]);
  return url ? `${row[0]}\n${url}` : row[0];
}

export function composeV2TruthOnlyReply(input: {
  customerText: string;
  turn: V2InterpretedTurn;
  truth: V2ResolvedTruth;
  actionExecution?: V2ActionExecution | null;
}) {
  const topics = new Set(input.turn.topics || []);
  const app = input.truth.application;
  const parts: string[] = [];
  const actionExecution = input.actionExecution || null;

  if (topics.has("greeting") && topics.size === 1) return "أهلًا فيك، تفضل.";
  if (topics.has("acknowledgement") && topics.size === 1) return "تمام، وصلتني.";

  if (topics.has("application_status")) parts.push(applicationContext(input.truth));
  if (topics.has("review_timing")) {
    if (app && input.truth.confidence === "high") parts.push(`${applicationContext(input.truth)} المراجعة بتتم حسب الدور وضغط المراجعات، وما في موعد دقيق أقدر أوعدك فيه.`);
    else parts.push("مدة المراجعة بتعتمد على الدور وضغط المراجعات، وما بدي أعطيك موعد غير مؤكد بدون ربط الرسالة بالطلب الصحيح.");
  }

  if (topics.has("payment_fee")) parts.push(`رسوم فتح الملف ${V2_POLICY.fileOpeningFeeJod} دنانير فقط، منفصلة عن ثمن الجهاز والقسط الأول، وتُطلب بعد التأهيل المبدئي إذا اخترت تكمل.`);
  if (topics.has("payment_timing")) {
    if (app?.payment_status === "confirmed" && input.truth.confidence === "high") parts.push("الدفع مؤكد أصلًا على طلبك، فما في داعي تعيد دفع رسوم فتح الملف.");
    else parts.push("رسوم فتح الملف ما بتنطلب قبل التأهيل المبدئي؛ بتنطلب فقط إذا تأهلت مبدئيًا واخترت تكمل.");
  }
  if (topics.has("payment_method") || topics.has("payment_recipient")) {
    parts.push(`بيانات الدفع المعتمدة عند الحاجة لرسوم فتح الملف: ${V2_POLICY.paymentAliases.join(" أو ")}، واسم المستفيد ${V2_POLICY.paymentBeneficiary}.`);
  }
  if (topics.has("receipt_upload")) {
    const url = linkFor(input.truth, "receipt");
    parts.push(url
      ? `إثبات الدفع ينرفع فقط من الرابط الرسمي المرتبط بالطلب، مش على واتساب:\n${url}`
      : "إثبات الدفع ينرفع فقط من الرابط الرسمي المرتبط بالطلب، مش على واتساب.");
  }

  if (topics.has("first_installment")) parts.push(`${V2_POLICY.firstInstallment}.`);
  if (topics.has("installment_amount")) parts.push("قيمة القسط تعتمد على الجهاز والجدول المعتمد للطلب؛ ما بدي أخمّن رقم غير ظاهر عندي.");
  if (topics.has("installment_duration")) parts.push("مدة التقسيط تعتمد على الجهاز والجدول المعتمد للطلب، وما بدي أحدد عدد أشهر من عندي بدون بيانات مؤكدة.");
  if (topics.has("product_price")) parts.push(`الأسعار الحالية بتتأكد من صفحة الأجهزة الرسمية:\n${V2_POLICY.website}/products`);
  if (topics.has("products")) parts.push(`الأجهزة المتاحة والأسعار الحالية موجودة على الصفحة الرسمية:\n${V2_POLICY.website}/products`);

  if (topics.has("office_location")) parts.push(`موقعنا العام: ${V2_POLICY.generalLocation}. الحضور للمكتب بيكون بموعد رسمي فقط.`);
  if (topics.has("delivery")) parts.push("ما عنا توصيل؛ استلام الجهاز من المكتب بموعد بعد الموافقة النهائية واعتماد موعد الاستلام.");

  if (topics.has("requirements")) parts.push(requirementReply(input.truth));
  if (topics.has("identity")) {
    const url = linkFor(input.truth, "identity");
    parts.push(url ? `الهوية تُرفع فقط من الرابط الرسمي المرتبط بطلبك، مش على واتساب:\n${url}` : "الهوية تُرفع فقط من الرابط الرسمي المرتبط بالطلب، مش على واتساب.");
  }
  if (topics.has("salary")) {
    const url = linkFor(input.truth, "salary-slip");
    parts.push(url ? `كشف/شهادة الراتب تُرفع من الرابط الرسمي المرتبط بطلبك:\n${url}` : "كشف/شهادة الراتب تُرفع من الرابط الرسمي المرتبط بالطلب، مش على واتساب.");
  }
  if (topics.has("guarantor")) {
    const url = linkFor(input.truth, "guarantor");
    parts.push(url ? `بيانات الكفيل تُستكمل من الرابط الرسمي المرتبط بطلبك:\n${url}` : "بيانات الكفيل تُستكمل من الرابط الرسمي المرتبط بالطلب.");
  }

  if (topics.has("business_identity")) parts.push(`الاسم المعتمد هو ${V2_POLICY.businessName}. ${V2_POLICY.independence}.`);
  if (topics.has("business_website")) parts.push(`الموقع الرسمي: ${V2_POLICY.website}`);
  if (topics.has("trust")) parts.push(`للتأكد استخدم فقط الموقع الرسمي ${V2_POLICY.website} والروابط المرتبطة بطلبك. ${V2_POLICY.independence}.`);
  if (topics.has("site_issue")) parts.push("إذا الرابط الرسمي عندك مش شغال، ابعثلي اسم الصفحة أو الخطأ الظاهر بدون إرسال أي مستند حساس على واتساب.");

  if (topics.has("human_handoff")) {
    const result = actionResultFor(actionExecution, ["human_agent"]);
    const summary = actionSummaryFor(actionExecution, ["human_agent"]);
    parts.push(result?.executed && summary
      ? summary
      : "فهمت إنك بدك موظف، لكن ما رح أقول إن التحويل تم إذا ما كان مسجل فعليًا.");
  }
  if (topics.has("call_request")) {
    const result = actionResultFor(actionExecution, ["call_request"]);
    const summary = actionSummaryFor(actionExecution, ["call_request"]);
    parts.push(result?.executed && summary
      ? summary
      : "فهمت إنك طالب مكالمة، لكن ما رح أوعدك باتصال إذا الطلب ما تسجل فعليًا.");
  }
  if (topics.has("correction")) {
    const result = actionResultFor(actionExecution, ["application_data_correction"]);
    const summary = actionSummaryFor(actionExecution, ["application_data_correction"]);
    parts.push(result?.executed && summary
      ? summary
      : "فهمت إنك بدك تصحيح بيانات، وما رح أقول إن البيانات تغيرت إلا بعد تنفيذ التعديل فعليًا.");
  }

  if (topics.has("cancellation") || topics.has("refund") || topics.has("continuation")) {
    const relevant: string[] = [];
    if (topics.has("cancellation")) relevant.push("cancel_request", "cancel_confirmed", "decline_decision");
    if (topics.has("refund")) relevant.push("refund", "stop_refund");
    if (topics.has("continuation")) relevant.push("continue_decision", "decline_decision");
    const summary = actionSummaryFor(actionExecution, relevant);
    if (summary) parts.push(summary);
    else parts.push("فهمت طلبك، لكن ما رح أعتبر أي تغيير منفذ إلا إذا تنفذ فعليًا على الطلب.");
  }

  if (topics.has("refund") && app && input.truth.confidence === "high" && app.status === "refund_requested") {
    parts.push("طلب الاسترداد مسجل وقيد المراجعة، وما في موعد تحويل مؤكد أقدر أوعدك فيه.");
  }

  if (!parts.length) {
    if (input.truth.source === "ambiguous_phone_applications") return applicationContext(input.truth);
    if (app && input.truth.confidence === "high") return applicationContext(input.truth);
    return "وصلتني رسالتك، بس ما بدي أخمّن معلومة مش مؤكدة. وضحلي النقطة اللي بدك إياها بجملة قصيرة وبجاوبك على المؤكد فقط.";
  }

  return Array.from(new Set(parts.map((x) => x.trim()).filter(Boolean))).join("\n\n").trim();
}
