import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";
import { buildOfficialLinkContext } from "./linkIntegrity";
import { normalizeArabic } from "./text";
import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";

export type CurrentTurnSupremacyKind =
  | "none"
  | "mutation_decline"
  | "mutation_hypothetical"
  | "social_closure"
  | "website_url"
  | "down_payment"
  | "trust_verification"
  | "income_requirement"
  | "external_credit"
  | "review_duration"
  | "dialect_preference";

export type CurrentTurnSupremacy = { kind: CurrentTurnSupremacyKind; reason: string };

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || ""))
    .replace(/[؟?!.,،؛:()[\]{}"`~*_#<>+=|\\/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveCurrentTurnSupremacy(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): CurrentTurnSupremacy {
  const q = n(input.turn.rawText);
  if (!q) return { kind: "none", reason: "empty current turn" };
  const stage = applicationJourneyStage(input.truth.application);

  const cancellationMention = /(?:الغي|الغاء|إلغاء|تلغي|الغوا)/.test(q);
  const cancellationDecline = /(?:لا|ما)\s*(?:تلغي|الغي|الغاء|إلغاء)|(?:بديش|ما\s+بدي|لا\s+اريد|لا\s+أريد).{0,24}(?:الغ|الغاء|إلغاء)|(?:لا\s+لا).{0,20}(?:الغ|الطلب)|(?:كمل|اكمل|أكمل|استمر).{0,28}(?:الطلب|الملف)/.test(q);
  if ((input.state.pendingAction === "cancel_application" || cancellationMention) && cancellationDecline) return { kind: "mutation_decline", reason: "literal cancellation withdrawal owns current turn" };

  const mutationMention = /(?:الغي|الغاء|إلغاء|استرد|استرداد|استرجع|استرجاع)/.test(q);
  const hypothetical = /(?:^|\s)(?:لو|اذا|إذا|ادا|فرض|افتراض)(?:\s|$)/.test(q)
    || /(?:هذا|هاد|هاذ|هاض).{0,14}(?:سؤال|سوال)|(?:بس).{0,12}(?:سؤال|سوال)|(?:بدي|حاب|اريد|أريد).{0,20}(?:اعرف|أعرف).{0,40}(?:لو|اذا|إذا)/.test(q);
  if (mutationMention && hypothetical) return { kind: "mutation_hypothetical", reason: "hypothetical mutation question is informational, never executable consent" };

  if (/^(?:تمام\s+)?(?:شكرا(?:\s+الك)?|شكراً(?:\s+الك)?|مشكور(?:\s+يا\s+صديقي)?|الله\s+يعطيك\s+العافيه|يعطيك\s+العافيه|اوك\s+ان\s+شاء\s+الله|اوكي\s+ان\s+شاء\s+الله|لا\s+شكرا|لا\s+شكراً)$/.test(q)) return { kind: "social_closure", reason: "literal thanks or conversational closure outranks stale topic labels" };

  if (/(?:رابط|لينك).{0,24}(?:الموقع\s+الالكتروني|الموقع\s+الإلكتروني|موقعكم|الويبسايت|website)|(?:الموقع\s+الالكتروني|الموقع\s+الإلكتروني|موقعكم\s+الالكتروني|موقعكم\s+الإلكتروني|الويبسايت|website).{0,18}(?:رابط|لينك)?/i.test(q)) return { kind: "website_url", reason: "customer explicitly asked for the official website URL" };

  if (/(?:دفعه|دفعة).{0,10}(?:اوله|اولى|أولى)|(?:بدون|ما\s+في|مفيش).{0,18}(?:دفعه|دفعة).{0,10}(?:اوله|اولى|أولى)?/.test(q)) return { kind: "down_payment", reason: "explicit down-payment question" };

  if (/(?:اثبات|إثبات).{0,35}(?:موثوق|موثوقه|موثوقة|جهه|جهة|شركه|شركة)|(?:انتو|انتم|إنتو).{0,22}(?:شركه|شركة)|(?:مش\s+المفروض).{0,28}(?:شركه|شركة)|(?:اسم).{0,30}(?:كليك|cliq).{0,30}(?:الشركه|الشركة)|(?:موثوق|موثوقه|موثوقة).{0,25}(?:الشركه|الشركة|الجهه|الجهة)/i.test(q)) return { kind: "trust_verification", reason: "customer asks for company/payment trust evidence" };

  if (/(?:عقد\s+شغل|عقد\s+عمل|شغل\s+حر|عمل\s+حر|شهاده\s+تعيين|شهادة\s+تعيين|اثبات\s+دخل|إثبات\s+دخل|كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب|عسكري).{0,55}(?:لازم|بكفي|ينفع|بنفع|بقدر|اقدر|أقدر|مطلوب|الشروط)?|(?:لازم|بكفي|ينفع|بنفع|بقدر|اقدر|أقدر).{0,35}(?:عقد\s+شغل|عقد\s+عمل|شهاده\s+تعيين|شهادة\s+تعيين|اثبات\s+دخل|إثبات\s+دخل|كشف\s+راتب)/.test(q)) return { kind: "income_requirement", reason: "current turn asks about income-document eligibility" };

  if (/(?:كريف|crif|شركة\s+كرف|تقارير\s+كرف|تقارير\s+كريف)/i.test(q)) return { kind: "external_credit", reason: "current turn asks about external credit-report system" };

  if (stage !== "preliminary_approved_waiting_decision" && /^(?:(?:كم|قديش).{0,18}(?:تستغرق|بتستغرق|بتاخد|بتاخذ|تاخذ|تأخذ|المده|المدة)|(?:متى|امتى|ايمتى).{0,12}(?:الرد|الموافقه|الموافقة)|(?:المده|المدة).{0,12}(?:كم|قديش))$/.test(q)) return { kind: "review_duration", reason: "short explicit review-duration question" };

  if (/(?:ليش|لماذا).{0,24}(?:تحكوا|تحكي|تتكلم|بتحكوا|بتحكي).{0,24}(?:فصحى|فصحه)|(?:احكي|احكوا).{0,20}(?:عامي|عاميه|عامية|اردني|أردني)/.test(q)) return { kind: "dialect_preference", reason: "customer explicitly requested conversational dialect" };

  return { kind: "none", reason: "no literal current-turn supremacy rule" };
}

export function buildCurrentTurnSupremacyReply(input: { supremacy: CurrentTurnSupremacy; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): string | null {
  const kind = input.supremacy.kind;
  const app = input.truth.application;
  const stage = applicationJourneyStage(app);
  const q = n(input.turn.rawText);
  const appStatus = app ? ` طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الحالية: ${customerFacingStatusLabel(app)}.` : "";

  if (kind === "mutation_decline") {
    if (["cancelled", "refund_requested", "refund_completed"].includes(stage)) return `الحالة الحالية مثبتة بالفعل: ${customerFacingStatusLabel(app)}. إذا قصدك ترجع عن الإلغاء أو الاسترداد، احكيها كطلب مستقل وما رح أفترضها من كلمة لا.`;
    return `تمام، ما في إلغاء وما رح أنفذ أي إلغاء من هالرسالة.${appStatus} بنكمل على نفس الطلب.`;
  }

  if (kind === "mutation_hypothetical") {
    const refund = /(?:استرد|استرجع|استرداد|استرجاع)/.test(q);
    if (refund) return `فهمت إنك بتسأل افتراضيًا، مش طالب استرداد الآن.${appStatus} إذا قررت تطلب الاسترداد فعلًا لاحقًا بنطلب منك تأكيد مستقل قبل أي إجراء، وما عندي مدة تحويل ثابتة أقدر أضمنها قبل ما يفتح مسار الاسترداد فعليًا.`;
    return `فهمت إنك بتسأل افتراضيًا، مش طالب إلغاء الآن.${appStatus} ما رح أسجل إلغاء من سؤال لو بدي. إذا قررت الإلغاء فعلًا لاحقًا بطلب منك تأكيد مستقل قبل التنفيذ، وإذا كان في دفع مؤكد بيدخل الطلب بمسار الاسترداد الرسمي.`;
  }

  if (kind === "social_closure") return /ان\s+شاء\s+الله/.test(q) ? "إن شاء الله، الله ييسر أمورك." : "العفو، الله يعافيك.";

  if (kind === "website_url") {
    const links = buildOfficialLinkContext(input.turn, input.truth);
    return `أكيد، هذا موقع الأمين للأقساط الرسمي:\n${links.baseUrl}`;
  }

  if (kind === "down_payment") {
    const fee = input.truth.policy.fileOpeningFeeJod || 5;
    return `صحيح، ما في دفعة أولى على الجهاز. القسط الأول يستحق بعد شهر من تاريخ توقيع العقد، وتاريخ توقيع العقد هو نفسه تاريخ استلام الجهاز. رسوم فتح الملف ${fee} دنانير خطوة منفصلة فقط بعد الموافقة المبدئية واختيار الاستمرار، ومش دفعة أولى ولا قسط أول.`;
  }

  if (kind === "trust_verification") {
    const links = buildOfficialLinkContext(input.turn, input.truth);
    const beneficiary = String(input.truth.policy.paymentBeneficiaryName || "").trim();
    const beneficiaryLine = beneficiary ? ` اسم المستفيد المعتمد ببيانات التحويل الحالية هو ${beneficiary}.` : "";
    return `سؤالك بمحله. لا تعتمد على اسم التحويل وحده كإثبات قانوني.${beneficiaryLine} المرجع اللي بقدر أوثقه من هون هو موقعنا الرسمي وحالة طلبك ورقم التتبع ومسارات الدفع والرفع الرسمية: ${links.baseUrl}. إذا قصدك رقم سجل أو وثيقة تسجيل تجاري بعينها، ما عندي رقم موثق ظاهر بالمحادثة حتى أختلقه.`;
  }

  if (kind === "income_requirement") return `مش شرط يكون عندك عقد عمل تحديدًا. الأساس هو إثبات دخل مناسب لطبيعة شغلك؛ وإذا شغلك حر أو ما عندك كشف أو شهادة راتب تقليدية، ممكن تستخدم بديل رسمي مثل كشف حساب بنكي أو عقد أو كتاب تعيين أو مستند رسمي يوضح مصدر الدخل. الدراسة هي اللي بتحسم المقبول النهائي حسب الملف، وأي مستند حساس يترفع فقط من الرابط الرسمي الآمن.`;

  if (kind === "external_credit") return `ما عندي تكامل أو معلومة موثقة ظاهرة إلي تسمح أأكد إن دراسة الأمين تستخدم كريف أو CRIF أو تقرير ائتماني معيّن. ما رح أعطيك نعم أو لا من غير توثيق رسمي.`;

  if (kind === "review_duration") {
    const window = input.truth.policy.normalReviewWindow || "المعدل الطبيعي من يومين إلى 3 أيام تشغيلية، والجمعة والسبت لا تحتسبان";
    const pressure = input.truth.policy.severePressureRule || "وحاليًا في ضغط مراجعات قد يطوّل بعض الملفات";
    return `${appStatus || ""} ${window}، ${pressure}. ما عندي موعد نهائي مؤكد أقدر أوعدك فيه.`.trim();
  }

  if (kind === "dialect_preference") return "معك حق، بكمل معك باللهجة الأردنية وبشكل مباشر بدون فصحى ثقيلة. احكيلي شو بدك وأنا معك.";
  return null;
}
