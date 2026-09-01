import { actionRequiresOmran } from "./hierarchy";
import { mutationAuthorization } from "./actionAuthority";
import type { ActionKey, ConversationState, InterpretedTurn, PlannedAction, PlannedAnswer, ReplyPlan, TruthBundle } from "./types";

function truthNeeded(topic: string) {
  return ["application_status","payment_status","payment_confirmation","refund","review_timing","device_change","device_recalculation","application_correction","cancellation","continuation","reopen"].includes(topic);
}

function instructionFor(topic: string, truth: TruthBundle) {
  const p = truth.policy;
  const map: Record<string,string> = {
    payment_fee: `اشرح أن رسوم فتح الملف ${p.fileOpeningFeeJod} دنانير وأنها ${p.fileOpeningFeeTiming}.`,
    payment_confirmation: `تأكيد الدفع لا يتم من كلام العميل أو صورة واتساب. القاعدة: ${p.paymentConfirmationRule} إذا كان TRUTH يؤكد الدفع، قل إنه مؤكد. غير ذلك اعتبره بانتظار اعتماد الإدارة ووجّه للرابط الرسمي إذا احتاج رفع الإثبات.`,
    first_installment: `اشرح القاعدة بالمعنى: ${p.firstInstallmentRule}.`,
    office_location: `اذكر فقط ${p.generalLocation}، ووضح أن الحضور بموعد رسمي فقط.`,
    appointment: "لا تدّعِ إنشاء موعد. وضح أن الحضور يكون بموعد رسمي وأن الموعد يعتمد على حالة الطلب الفعلية.",
    delivery: p.pickupRule,
    receipt_upload: `${p.secureDocumentsRule} وضّح أن اعتماد الدفع بعد الرفع يبقى بيد الإدارة/الأدمن وليس تلقائيًا من المحادثة.`,
    requirements: p.secureDocumentsRule,
    trust: `استخدم اسم ${p.businessName} فقط، وإذا كان السؤال عن الجهة المشابهة استخدم بيان الاستقلالية الرسمي.`,
    human_request: "العميل طلب موظفًا: أنت الموظف الرسمي داخل نفس المحادثة. عرّف بنفسك فقط إذا لزم ولم يسبق التعريف، ثم حل المشكلة مباشرة. لا تقل تم التحويل ولا تنتظر إنسانًا.",
    manager_request: "انتقلت المعالجة داخليًا إلى عمران كمستوى Supervisor AI. أكمل حل المشكلة داخل نفس المحادثة ولا تعد بتحويل بشري.",
    call_request: "اعترف بتفضيل المكالمة لكن لا تعد بمكالمة غير منفذة؛ استمر بحل الموضوع على واتساب الآن.",
    review_timing: `اذكر أن ${p.normalReviewWindow}. وضّح أيضًا أن ${p.severePressureRule} لا تعطِ يومًا أو ساعة محددة إذا لم يوجد ETA موثق. غيّر الصياغة حسب سياق العميل ولا تكرر قالبًا ثابتًا.`,
    operational_pressure: `اشرح الظروف التشغيلية بوضوح وبأسلوب إنساني: ${p.severePressureRule} لا تستخدم نفس الجملة حرفيًا كل مرة ولا تحوّل الضغط إلى عذر فارغ.`,
    application_status: "أجب فقط من application truth الموثوق. إذا الحقيقة غير محسومة لا تخصص حالة لطلب بعينه واطلب معلومة ضيقة للتمييز.",
    refund: `افصل بين سياسة الاسترداد العامة والحالة الخاصة. إذا الدفع مؤكد وطلب العميل الاسترداد صراحةً فالتنفيذ من عمران AI. ${p.refundPressureRule} لا تقل تم الاسترداد إلا بعد ActionResult منفذ.`,
    cancellation: "طلب الإلغاء الصريح عملية تنفيذية مستقلة ويملكها عمران AI فقط. لا تربطه بالدفع أو الاستمرار. إذا الدفع مؤكد يفتح مسار الاسترداد آليًا، وإذا غير مؤكد يكون إلغاء فقط.",
    continuation: "قرار الاستمرار مستقل. إذا الطلب ملغي/في استرداد فالتراجع وإعادة الفتح يملكهما عمران AI، ولا تطلب موظفًا بشريًا.",
    reopen: "التراجع عن الإلغاء/إعادة الفتح عملية عمران AI. إذا الاسترداد لم يكتمل يمكن للنظام إيقاف المسار وإعادة تفعيل الطلب ضمن الحقيقة؛ إذا اكتمل الاسترداد لا تعِد بإعادة نفس الملف تلقائيًا.",
    application_correction: "تصحيح بيانات الطلب عملية عمران AI. لا تغيّر إلا حقولًا ذات قيمة جديدة واضحة ومتحقق من تنسيقها؛ إذا التفاصيل ناقصة اسأل سؤالًا واحدًا ضيقًا.",
    device_change: "تغيير الجهاز/الموديل عملية عمران AI. استخدم كتالوج المنتجات الحالي فقط، وطابق موديلًا واحدًا بشكل واضح قبل التنفيذ. بعد التغيير أعد حساب السعر/المدة/الدفعة والقسط بنفس calculator الرسمي ولا تخترع سعرًا.",
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
        // Direct deterministic/resolved instructions execute automatically. A
        // model-only mutation interpretation must be confirmed once; the model
        // is allowed to understand intent, not to manufacture authorization.
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
    objective: "حل كل أجزاء رسالة العميل كفريق AI كامل، مع امتلاك عمران لكل mutation فعلي، وتأكيد الدفع يدويًا من الإدارة فقط، ومنع أي اعتماد على موظف بشري.",
    role: input.state.role.currentRole,
    answerItems,
    actions,
    requiredFacts: answerItems.filter((x) => x.truthRequired).map((x) => x.topic),
    forbiddenClaims: [...input.truth.policy.forbiddenClaims, "تم التحويل لموظف", "رح يتواصل معك موظف", "تم تحديد موعد", "رح نتصل فيك", "تم تأكيد الدفع"],
    tone: risk ? "firm" : input.turn.sentiment === "frustrated" || input.turn.sentiment === "confused" ? "supportive" : "brief",
    shouldRespond: answerItems.length > 0 || actions.length > 0,
  };
}
