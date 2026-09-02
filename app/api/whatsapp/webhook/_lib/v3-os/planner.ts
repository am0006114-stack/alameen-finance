import { actionRequiresOmran } from "./hierarchy";
import { mutationAuthorization } from "./actionAuthority";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import { continuationCommercialState } from "./commercialProgression";
import type { ActionKey, ConversationState, InterpretedTurn, PlannedAction, PlannedAnswer, ReplyPlan, TruthBundle } from "./types";

function truthNeeded(topic: string) {
  return ["application_status","payment_status","payment_confirmation","refund","review_timing","device_change","device_recalculation","application_correction","cancellation","continuation","reopen","requirements","guarantor","tracking"].includes(topic);
}

function requirementsInstruction(truth: TruthBundle) {
  const app = truth.application;
  const p = truth.policy;
  if (!app) return `${p.secureDocumentsRule} لا تخصص مستندات ناقصة لعميل بعينه بدون ربط الطلب الصحيح.`;
  const docs = app.documents;
  const status = String(app.status || "").toLowerCase();
  if (!docs?.loaded) return `${p.secureDocumentsRule} حالة المستندات التفصيلية غير متاحة الآن؛ لا تقل إن مستندًا ناقص أو مرفوع بدون دليل.`;

  const received: string[] = [];
  if (docs.identityComplete) received.push("الهوية أمامي وخلفي");
  if (docs.salarySlipUploaded) received.push("كشف/شهادة الراتب");
  if (docs.guarantorDataComplete) received.push("بيانات الكفيل");
  if (docs.guarantorIdentityComplete) received.push("هوية الكفيل");
  if (docs.paymentReceiptUploaded) received.push("وصل الدفع");

  const missing: string[] = [];
  if (["needs_identity","identity_requested"].includes(status) && !docs.identityComplete) missing.push("الهوية");
  if (["needs_salary_slip","salary_slip_link_sent"].includes(status) && !docs.salarySlipUploaded) missing.push("كشف/شهادة الراتب");
  if (status === "needs_guarantor" && !docs.guarantorDataComplete) missing.push("بيانات الكفيل");

  if (!missing.length) {
    return `المستندات الموجودة فعليًا على الملف: ${received.length ? received.join("، ") : "لا توجد مستندات موثقة في جدول المستندات"}. لا تطلب إعادة رفع أي مستند ظاهر كمستلم. إذا حالة الطلب قديمة وتتناقض مع المستندات، اذكر أن المستند موجود واترك الحالة كما هي بدون اختراع تحديث.`;
  }
  return `المستندات الموجودة فعليًا على الملف: ${received.length ? received.join("، ") : "لا يوجد مستند مكتمل ظاهر"}. المطلوب حسب الحالة الحالية فقط: ${missing.join("، ")}. استخدم فقط الرابط المطابق الموجود في OFFICIAL_LINKS ولا تستخدم رابط /track كأنه رابط رفع.`;
}

function paymentStatusInstruction(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return "لا يوجد طلب موثوق مربوط الآن؛ لا تخصص حالة دفع.";
  if (hasAuthoritativePaymentConfirmation(app)) return "الدفع مؤكد إداريًا على هذا الطلب. قل ذلك بوضوح، ولا تطلب إعادة الدفع أو رفع وصل جديد ولا ترسل رابط receipt.";
  const ps = String(app.paymentStatus || "").toLowerCase();
  if (["customer_claimed_paid","pending_payment_confirmation"].includes(ps)) return "وصل الدفع/ادعاء الدفع مسجل لكنه بانتظار اعتماد الإدارة. لا تقل إن الدفع مؤكد ولا تطلب دفعًا جديدًا.";
  return `حالة الدفع المسجلة هي ${app.paymentStatus || "غير محددة"}. اشرحها دون تحويلها إلى تأكيد أو نفي غير موجود.`;
}

function applicationStatusInstruction(truth: TruthBundle) {
  const app = truth.application;
  if (!app) return "أجب فقط من application truth الموثوق. إذا الحقيقة غير محسومة لا تخصص حالة لطلب بعينه واطلب معلومة ضيقة للتمييز.";
  const paid = hasAuthoritativePaymentConfirmation(app);
  return `الطلب المربوط موثوق. استخدم الاسم الحقيقي ${app.fullName || "غير متوفر"} بشكل طبيعي عند الحاجة، ورقم التتبع ${app.trackingId || "غير متوفر"}. الحالة الخام ${app.status || "غير محددة"}، والدفع ${paid ? "مؤكد إداريًا" : app.paymentStatus || "غير محدد"}. لا تطلب مستندات أو دفعًا لمجرد أن الحالة اسمها قديم؛ راجع DOCUMENT_TRUTH أولًا.`;
}

function instructionFor(topic: string, truth: TruthBundle) {
  const p = truth.policy;
  const map: Record<string,string> = {
    payment_fee: `اشرح أن رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير وأنها ${p.fileOpeningFeeTiming}. وضّح السبب: ${p.fileOpeningFeePurposeRule} ووضّح الاسترداد: ${p.fileOpeningFeeRefundRule} استخدم طمأنة بشرية غير ضاغطة: ${p.continuationReassuranceRule}`,
    payment_status: paymentStatusInstruction(truth),
    payment_confirmation: truth.application
      ? `${paymentStatusInstruction(truth)} تأكيد الدفع لا يتم من كلام العميل أو صورة واتساب. القاعدة: ${p.paymentConfirmationRule} إذا احتاج رفع الإثبات ولم يكن الدفع مؤكدًا استخدم رابط receipt الموجود حرفيًا في OFFICIAL_LINKS فقط.`
      : `تأكيد الدفع لا يتم من كلام العميل أو صورة واتساب. لا يوجد طلب موثوق مربوط الآن؛ إذا احتاج العميل رابط رفع الوصل اطلب رقم التتبع/الطلب أولًا ولا تضع أي URL.`,
    first_installment: `اشرح القاعدة بالمعنى: ${p.firstInstallmentRule}.`,
    office_location: `اذكر فقط ${p.generalLocation}، ووضح أن الحضور بموعد رسمي فقط.`,
    appointment: "لا تدّعِ إنشاء موعد. وضح أن الحضور يكون بموعد رسمي وأن الموعد يعتمد على حالة الطلب الفعلية.",
    delivery: p.pickupRule,
    receipt_upload: truth.application
      ? hasAuthoritativePaymentConfirmation(truth.application)
        ? "الدفع مؤكد إداريًا على الطلب، لذلك لا ترسل رابط رفع وصل ولا تطلب إعادة الرفع. وضح أن الخطوة منتهية."
        : `${p.secureDocumentsRule} أعطِ رابط receipt الموجود حرفيًا في OFFICIAL_LINKS إذا كان موجودًا، ووضّح أن اعتماد الدفع بعد الرفع يبقى بيد الإدارة/الأدمن وليس تلقائيًا من المحادثة.`
      : `لا يوجد طلب موثوق مربوط بالمحادثة الآن. اطلب رقم التتبع أو رقم الطلب حتى يتم توليد رابط رفع الوصل الرسمي. ممنوع إعطاء أي URL قبل ربط الطلب.`,
    requirements: requirementsInstruction(truth),
    guarantor: requirementsInstruction(truth),
    tracking: truth.application
      ? `أعطِ رابط tracking المربوط بالطلب الموجود حرفيًا في OFFICIAL_LINKS. هذا رابط تتبع فقط وليس رابط رفع مستندات. استخدم اسم العميل طبيعيًا إذا كان متوفرًا.`
      : "إذا طلب رابط التتبع ولم يتم ربط طلب موثوق، أعطِ رابط التتبع العام من OFFICIAL_LINKS فقط بدون اختراع معلومات طلب.",
    trust: `استخدم اسم ${p.businessName} فقط، وإذا كان السؤال عن الجهة المشابهة استخدم بيان الاستقلالية الرسمي.`,
    human_request: "العميل طلب موظفًا: أنت الموظف الرسمي داخل نفس المحادثة. عرّف بنفسك فقط إذا لزم ولم يسبق التعريف، ثم حل المشكلة مباشرة. لا تقل تم التحويل ولا تنتظر إنسانًا.",
    manager_request: "عمران هو المسؤول عن الحالة الآن. إذا لم يسبق أن عرّف بنفسه، يكفي أن يقول: معك عمران. بعدها يدخل بالمشكلة مباشرة. لا يشرح أي مستوى أو تحويل أو بنية داخلية.",
    call_request: "اعترف بتفضيل المكالمة لكن لا تعد بمكالمة غير منفذة؛ استمر بحل الموضوع على واتساب الآن.",
    review_timing: `اذكر أن ${p.normalReviewWindow}. وضّح أيضًا أن ${p.severePressureRule} لا تعطِ يومًا أو ساعة محددة إذا لم يوجد ETA موثق. غيّر الصياغة حسب سياق العميل ولا تكرر قالبًا ثابتًا.`,
    operational_pressure: `اشرح الظروف التشغيلية بوضوح وبأسلوب إنساني: ${p.severePressureRule} لا تستخدم نفس الجملة حرفيًا كل مرة ولا تحوّل الضغط إلى عذر فارغ.`,
    application_status: applicationStatusInstruction(truth),
    refund: `افصل بين سياسة الاسترداد العامة والحالة الخاصة. إذا الدفع مؤكد وطلب العميل الاسترداد صراحةً فالتنفيذ من عمران. ${p.refundPressureRule} لا تقل تم الاسترداد إلا بعد ActionResult منفذ.`,
    cancellation: "طلب الإلغاء الصريح عملية تنفيذية مستقلة ويملكها عمران فقط. لا تربطه بالدفع أو الاستمرار. إذا الدفع مؤكد يفتح مسار الاسترداد آليًا، وإذا غير مؤكد يكون إلغاء فقط.",
    continuation: (() => {
      const commercial = continuationCommercialState(truth.application);
      if (commercial === "payment_ready") {
        return `العميل اختار الاستمرار والطلب مؤهل لخطوة رسوم فتح الملف الآن. لا تجعل الرد كأنه فاتورة باردة. اشرح بوضوح وبأسلوب مطمئن أن رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير فقط، وتُطلب بعد الموافقة المبدئية لأن العميل اختار الاستمرار. اشرح السبب حرفيًا بالمعنى: ${p.fileOpeningFeePurposeRule} واشرح أن الرسوم مستردة بالكامل وفق القاعدة: ${p.fileOpeningFeeRefundRule} وضّح أن القرار للعميل ولا يوجد ضغط، واستخدم هذه القاعدة النفسية/الإنسانية: ${p.continuationReassuranceRule} بعدها اذكر طريقة الدفع الموثقة: ${p.paymentMethodRule} وأعطِ رابط receipt الموجود حرفيًا في OFFICIAL_LINKS لرفع الوصل. وضّح أن تأكيد الدفع النهائي يدوي من الإدارة بعد مراجعة الوصل، وأن القسط الأول ليس الآن. لا تقل "لا يوجد دفع مطلوب" ولا تختصر الخطوة إلى مجرد أمر دفع.`;
      }
      if (commercial === "already_paid") return "العميل اختار الاستمرار والدفع مؤكد إداريًا أصلًا؛ أكد استمرار المتابعة ولا تطلب 5 دنانير أو وصلًا جديدًا.";
      if (commercial === "payment_pending_admin") return "العميل اختار الاستمرار ووصل الدفع مسجل بانتظار اعتماد الإدارة؛ لا تطلب دفعًا أو وصلًا جديدًا، ووضح أن التأكيد النهائي إداري.";
      if (commercial === "no_application") return "وصل قرار الاستمرار لكن لا يوجد طلب موثوق مربوط الآن؛ لا تطلب دفعًا ولا تعطي معلومات تحويل حتى يتم ربط الطلب الصحيح.";
      return "قرار الاستمرار وصل، لكن حالة الطلب الحالية لا تثبت أن رسوم فتح الملف مطلوبة الآن. لا تطلب دفعًا قبل التأهيل المبدئي؛ اشرح الخطوة الحالية فقط.";
    })(),
    reopen: "التراجع عن الإلغاء/إعادة الفتح من صلاحية عمران. إذا الاسترداد لم يكتمل يمكن إيقاف المسار وإعادة تفعيل الطلب ضمن الحقيقة؛ إذا اكتمل الاسترداد لا تعِد بإعادة نفس الملف تلقائيًا.",
    application_correction: "تصحيح بيانات الطلب من صلاحية عمران. لا تغيّر إلا حقولًا ذات قيمة جديدة واضحة ومتحقق من تنسيقها؛ إذا التفاصيل ناقصة اسأل سؤالًا واحدًا ضيقًا.",
    device_change: "تغيير الجهاز/الموديل من صلاحية عمران. استخدم كتالوج المنتجات الحالي فقط، وطابق موديلًا واحدًا بشكل واضح قبل التنفيذ. بعد التغيير أعد حساب السعر/المدة/الدفعة والقسط بنفس الحاسبة الرسمية ولا تخترع سعرًا.",
    device_recalculation: "بعد أي تغيير جهاز منفذ اعرض الحسبة الجديدة من ActionResult/Truth فقط: سعر الجهاز، المدة، الدفعة المقدمة/المقدم إن وجد، والقسط الشهري التقريبي. لا تحسب من رأسك.",
    complaint: "تعامل مع الاتهام أو الغضب بثبات واحترام: لا تدخل بجدال ولا تعترف بنصب. وضّح المخرج العملي: إذا لا يريد الطلب يمكن إلغاؤه، وإذا يوجد دفع مؤكد يمشي الاسترداد. حق العميل لا يضيع، لكن لا تعطي موعد استرداد غير موثق.",
    legal: "رد رسمي ثابت وهادئ. لا تتوتر من التهديد القانوني ولا تهدد مقابله تلقائيًا. اعرض حل الحالة فعليًا، واحفظ كل ادعاء ضمن الحقيقة الموثقة.",
    social_threat: `${p.disputeResolutionRule}`,
  };
  return map[topic] || "أجب مباشرة على هذا الجزء من رسالة العميل اعتمادًا على الحقيقة المتاحة والسياق، بدون اختراع أو قالب عام.";
}

function payloadForAction(turn: InterpretedTurn, action: ActionKey) {
  const act = turn.acts.find(a => a.action === action && a.value);
  return act?.value ? { requestedValue: act.value } : null;
}

export function buildReplyPlan(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): ReplyPlan {
  const answerItems: PlannedAnswer[] = [];
  const actions: PlannedAction[] = [];
  for (const act of input.turn.acts) {
    if (["greet","thank","acknowledge"].includes(act.type)) {
      answerItems.push({ actId: act.id, topic: act.topic, resolution: "acknowledge", instruction: "رد طبيعي ومختصر إذا كانت هناك حاجة للرد.", truthRequired: false });
      continue;
    }
    if (act.type === "request_role") {
      answerItems.push({ actId: act.id, topic: act.topic, resolution: "answer", instruction: instructionFor(act.topic,input.truth), truthRequired: false });
      continue;
    }
    if (act.type === "deny") {
      answerItems.push({ actId: act.id, topic: act.topic, resolution: "acknowledge", instruction: "أكد للعميل باختصار أن الإجراء المعلّق لن يُنفذ، ثم استمر على نفس السياق بدون فتح موضوع جديد.", truthRequired: false });
      continue;
    }
    if (act.type === "request_action" && act.action && act.action !== "none") {
      const authorization = mutationAuthorization(input.turn,act);
      actions.push({
        action: act.action,
        sourceActId: act.id,
        requiresConfirmation: authorization === "confirmation_required",
        authority: "ai_planned",
        requiredRole: actionRequiresOmran(act.action) ? "omran" : input.state.role.currentRole,
        payload: payloadForAction(input.turn, act.action),
      });
      answerItems.push({ actId: act.id, topic: act.topic, resolution: "execute_then_answer", instruction: instructionFor(act.topic,input.truth), truthRequired: truthNeeded(act.topic) });
      continue;
    }
    if (["ask","complaint","repair_request","correct","provide_fact","provide_reason","unknown"].includes(act.type)) {
      const needs = truthNeeded(act.topic);
      const ambiguous = needs && input.truth.confidence === "none" && input.truth.ambiguousApplications.length > 0;
      answerItems.push({ actId: act.id, topic: act.topic, resolution: ambiguous ? "ask_narrow_question" : needs && input.truth.confidence === "none" ? "defer_to_truth" : "answer", instruction: instructionFor(act.topic,input.truth), truthRequired: needs });
    }
  }
  const risk = input.turn.sentiment === "angry" || input.turn.topics.some((t) => ["legal","social_threat","complaint"].includes(t));
  return {
    objective: "حل كل أجزاء رسالة العميل داخل نفس المحادثة. قرار الاستمرار بعد التأهيل المبدئي هو انتقال تجاري حاسم: يجب أن يعرض 5 دنانير ورسوم فتح الملف وطريقة الدفع ورابط الوصل الموثق، ما لم يكن الدفع مؤكدًا/بانتظار اعتماد الإدارة. عمران يملك كل تغيير فعلي على الطلب، وتأكيد الدفع يدوي من الإدارة فقط، وممنوع إعادة طلب مستندات وصلت أو استخدام رابط تتبع كرابط رفع.",
    role: input.state.role.currentRole,
    answerItems,
    actions,
    requiredFacts: answerItems.filter((x) => x.truthRequired).map((x) => x.topic),
    forbiddenClaims: [...input.truth.policy.forbiddenClaims, "تم التحويل لموظف", "رح يتواصل معك موظف", "تم تحديد موعد", "رح نتصل فيك", "تم تأكيد الدفع"],
    tone: risk ? "firm" : input.turn.sentiment === "frustrated" || input.turn.sentiment === "confused" ? "supportive" : "brief",
    shouldRespond: answerItems.length > 0 || actions.length > 0,
  };
}
