const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value, 'utf8'); }
function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`PATCH ANCHOR MISSING [${label}]`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`PATCH ANCHOR NOT UNIQUE [${label}]`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}
function replaceAfter(source, marker, needle, replacement, label) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`PATCH MARKER MISSING [${label}]`);
  const pos = source.indexOf(needle, start);
  if (pos < 0) throw new Error(`PATCH ANCHOR MISSING AFTER MARKER [${label}]`);
  return source.slice(0, pos) + replacement + source.slice(pos + needle.length);
}

const modulePath = 'app/api/whatsapp/webhook/_lib/v3-os/currentTurnSupremacy.ts';
const moduleLines = [
'import { applicationJourneyStage, customerFacingStatusLabel } from "./applicationJourney";',
'import { buildOfficialLinkContext } from "./linkIntegrity";',
'import { normalizeArabic } from "./text";',
'import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";',
'',
'export type CurrentTurnSupremacyKind =',
'  | "none"',
'  | "mutation_decline"',
'  | "mutation_hypothetical"',
'  | "website_url"',
'  | "down_payment"',
'  | "trust_verification"',
'  | "income_requirement"',
'  | "external_credit"',
'  | "review_duration"',
'  | "dialect_preference";',
'',
'export type CurrentTurnSupremacy = { kind: CurrentTurnSupremacyKind; reason: string };',
'',
'function n(value: string | null | undefined) {',
'  return normalizeArabic(String(value || ""))',
'    .replace(/[؟?!.,،؛:()[\\]{}"`~*_#<>+=|\\\\/\\-]+/g, " ")',
'    .replace(/\\s+/g, " ")',
'    .trim();',
'}',
'',
'export function resolveCurrentTurnSupremacy(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): CurrentTurnSupremacy {',
'  const q = n(input.turn.rawText);',
'  if (!q) return { kind: "none", reason: "empty current turn" };',
'  const stage = applicationJourneyStage(input.truth.application);',
'',
'  const cancellationMention = /(?:الغي|الغاء|إلغاء|تلغي|الغوا)/.test(q);',
'  const cancellationDecline = /(?:لا|ما)\\s*(?:تلغي|الغي|الغاء|إلغاء)|(?:بديش|ما\\s+بدي|لا\\s+اريد|لا\\s+أريد).{0,24}(?:الغ|الغاء|إلغاء)|(?:لا\\s+لا).{0,20}(?:الغ|الطلب)|(?:كمل|اكمل|أكمل|استمر).{0,28}(?:الطلب|الملف)/.test(q);',
'  if ((input.state.pendingAction === "cancel_application" || cancellationMention) && cancellationDecline) return { kind: "mutation_decline", reason: "literal cancellation withdrawal owns current turn" };',
'',
'  const mutationMention = /(?:الغي|الغاء|إلغاء|استرد|استرداد|استرجع|استرجاع)/.test(q);',
'  const hypothetical = /(?:^|\\s)(?:لو|اذا|إذا|ادا|فرض|افتراض)(?:\\s|$)/.test(q)',
'    || /(?:هذا|هاد|هاذ|هاض).{0,14}(?:سؤال|سوال)|(?:بس).{0,12}(?:سؤال|سوال)|(?:بدي|حاب|اريد|أريد).{0,20}(?:اعرف|أعرف).{0,40}(?:لو|اذا|إذا)/.test(q);',
'  if (mutationMention && hypothetical) return { kind: "mutation_hypothetical", reason: "hypothetical mutation question is informational, never executable consent" };',
'',
'  if (/(?:رابط|لينك).{0,24}(?:الموقع\\s+الالكتروني|الموقع\\s+الإلكتروني|موقعكم|الويبسايت|website)|(?:الموقع\\s+الالكتروني|الموقع\\s+الإلكتروني|موقعكم\\s+الالكتروني|موقعكم\\s+الإلكتروني|الويبسايت|website).{0,18}(?:رابط|لينك)?/i.test(q)) return { kind: "website_url", reason: "customer explicitly asked for the official website URL" };',
'',
'  if (/(?:دفعه|دفعة).{0,10}(?:اوله|اولى|أولى)|(?:بدون|ما\\s+في|مفيش).{0,18}(?:دفعه|دفعة).{0,10}(?:اوله|اولى|أولى)?/.test(q)) return { kind: "down_payment", reason: "explicit down-payment question" };',
'',
'  if (/(?:اثبات|إثبات).{0,35}(?:موثوق|موثوقه|موثوقة|جهه|جهة|شركه|شركة)|(?:انتو|انتم|إنتو).{0,22}(?:شركه|شركة)|(?:مش\\s+المفروض).{0,28}(?:شركه|شركة)|(?:اسم).{0,30}(?:كليك|cliq).{0,30}(?:الشركه|الشركة)|(?:موثوق|موثوقه|موثوقة).{0,25}(?:الشركه|الشركة|الجهه|الجهة)/i.test(q)) return { kind: "trust_verification", reason: "customer asks for company/payment trust evidence" };',
'',
'  if (/(?:عقد\\s+شغل|عقد\\s+عمل|شغل\\s+حر|عمل\\s+حر|شهاده\\s+تعيين|شهادة\\s+تعيين|اثبات\\s+دخل|إثبات\\s+دخل|كشف\\s+راتب|شهاده\\s+راتب|شهادة\\s+راتب|عسكري).{0,55}(?:لازم|بكفي|ينفع|بنفع|بقدر|اقدر|أقدر|مطلوب|الشروط)?|(?:لازم|بكفي|ينفع|بنفع|بقدر|اقدر|أقدر).{0,35}(?:عقد\\s+شغل|عقد\\s+عمل|شهاده\\s+تعيين|شهادة\\s+تعيين|اثبات\\s+دخل|إثبات\\s+دخل|كشف\\s+راتب)/.test(q)) return { kind: "income_requirement", reason: "current turn asks about income-document eligibility" };',
'',
'  if (/(?:كريف|crif|شركة\\s+كرف|تقارير\\s+كرف|تقارير\\s+كريف)/i.test(q)) return { kind: "external_credit", reason: "current turn asks about external credit-report system" };',
'',
'  if (stage !== "preliminary_approved_waiting_decision" && /^(?:(?:كم|قديش).{0,18}(?:تستغرق|بتستغرق|بتاخد|بتاخذ|تاخذ|تأخذ|المده|المدة)|(?:متى|امتى|ايمتى).{0,12}(?:الرد|الموافقه|الموافقة)|(?:المده|المدة).{0,12}(?:كم|قديش))$/.test(q)) return { kind: "review_duration", reason: "short explicit review-duration question" };',
'',
'  if (/(?:ليش|لماذا).{0,24}(?:تحكوا|تحكي|تتكلم|بتحكوا|بتحكي).{0,24}(?:فصحى|فصحه)|(?:احكي|احكوا).{0,20}(?:عامي|عاميه|عامية|اردني|أردني)/.test(q)) return { kind: "dialect_preference", reason: "customer explicitly requested conversational dialect" };',
'',
'  return { kind: "none", reason: "no literal current-turn supremacy rule" };',
'}',
'',
'export function buildCurrentTurnSupremacyReply(input: { supremacy: CurrentTurnSupremacy; turn: InterpretedTurn; state: ConversationState; truth: TruthBundle }): string | null {',
'  const kind = input.supremacy.kind;',
'  const app = input.truth.application;',
'  const stage = applicationJourneyStage(app);',
'  const q = n(input.turn.rawText);',
'  const appStatus = app ? ` طلبك${app.trackingId ? ` ${app.trackingId}` : ""} حالته الحالية: ${customerFacingStatusLabel(app)}.` : "";',
'',
'  if (kind === "mutation_decline") {',
'    if (["cancelled", "refund_requested", "refund_completed"].includes(stage)) return `الحالة الحالية مثبتة بالفعل: ${customerFacingStatusLabel(app)}. إذا قصدك ترجع عن الإلغاء أو الاسترداد، احكيها كطلب مستقل وما رح أفترضها من كلمة لا.`;',
'    return `تمام، ما في إلغاء وما رح أنفذ أي إلغاء من هالرسالة.${appStatus} بنكمل على نفس الطلب.`;',
'  }',
'',
'  if (kind === "mutation_hypothetical") {',
'    const refund = /(?:استرد|استرجع|استرداد|استرجاع)/.test(q);',
'    if (refund) return `فهمت إنك بتسأل افتراضيًا، مش طالب استرداد الآن.${appStatus} إذا قررت تطلب الاسترداد فعلًا لاحقًا بنطلب منك تأكيد مستقل قبل أي إجراء، وما عندي مدة تحويل ثابتة أقدر أضمنها قبل ما يفتح مسار الاسترداد فعليًا.`;',
'    return `فهمت إنك بتسأل افتراضيًا، مش طالب إلغاء الآن.${appStatus} ما رح أسجل إلغاء من سؤال لو بدي. إذا قررت الإلغاء فعلًا لاحقًا بطلب منك تأكيد مستقل قبل التنفيذ، وإذا كان في دفع مؤكد بيدخل الطلب بمسار الاسترداد الرسمي.`;',
'  }',
'',
'  if (kind === "website_url") {',
'    const links = buildOfficialLinkContext(input.turn, input.truth);',
'    return `أكيد، هذا موقع الأمين للأقساط الرسمي:\\n${links.baseUrl}`;',
'  }',
'',
'  if (kind === "down_payment") {',
'    const fee = input.truth.policy.fileOpeningFeeJod || 5;',
'    return `صحيح، ما في دفعة أولى على الجهاز. القسط الأول يستحق بعد شهر من تاريخ توقيع العقد، وتاريخ توقيع العقد هو نفسه تاريخ استلام الجهاز. رسوم فتح الملف ${fee} دنانير خطوة منفصلة فقط بعد الموافقة المبدئية واختيار الاستمرار، ومش دفعة أولى ولا قسط أول.`;',
'  }',
'',
'  if (kind === "trust_verification") {',
'    const links = buildOfficialLinkContext(input.turn, input.truth);',
'    const beneficiary = String(input.truth.policy.paymentBeneficiaryName || "").trim();',
'    const beneficiaryLine = beneficiary ? ` اسم المستفيد المعتمد ببيانات التحويل الحالية هو ${beneficiary}.` : "";',
'    return `سؤالك بمحله. لا تعتمد على اسم التحويل وحده كإثبات قانوني.${beneficiaryLine} المرجع اللي بقدر أوثقه من هون هو موقعنا الرسمي وحالة طلبك ورقم التتبع ومسارات الدفع والرفع الرسمية: ${links.baseUrl}. إذا قصدك رقم سجل أو وثيقة تسجيل تجاري بعينها، ما عندي رقم موثق ظاهر بالمحادثة حتى أختلقه.`;',
'  }',
'',
'  if (kind === "income_requirement") return `مش شرط يكون عندك عقد عمل تحديدًا. الأساس هو إثبات دخل مناسب لطبيعة شغلك؛ وإذا شغلك حر أو ما عندك كشف أو شهادة راتب تقليدية، ممكن تستخدم بديل رسمي مثل كشف حساب بنكي أو عقد أو كتاب تعيين أو مستند رسمي يوضح مصدر الدخل. الدراسة هي اللي بتحسم المقبول النهائي حسب الملف، وأي مستند حساس يترفع فقط من الرابط الرسمي الآمن.`;',
'',
'  if (kind === "external_credit") return `ما عندي تكامل أو معلومة موثقة ظاهرة إلي تسمح أأكد إن دراسة الأمين تستخدم كريف أو CRIF أو تقرير ائتماني معيّن. ما رح أعطيك نعم أو لا من غير توثيق رسمي.`;',
'',
'  if (kind === "review_duration") {',
'    const window = input.truth.policy.normalReviewWindow || "المعدل الطبيعي من يومين إلى 3 أيام تشغيلية، والجمعة والسبت لا تحتسبان";',
'    const pressure = input.truth.policy.severePressureRule || "وحاليًا في ضغط مراجعات قد يطوّل بعض الملفات";',
'    return `${appStatus || ""} ${window}، ${pressure}. ما عندي موعد نهائي مؤكد أقدر أوعدك فيه.`.trim();',
'  }',
'',
'  if (kind === "dialect_preference") return "معك حق، بكمل معك باللهجة الأردنية وبشكل مباشر بدون فصحى ثقيلة. احكيلي شو بدك وأنا معك.";',
'  return null;',
'}',
];
write(modulePath, moduleLines.join('\n') + '\n');

const arbiterPath = 'app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts';
let arbiter = read(arbiterPath);
arbiter = replaceOnce(
  arbiter,
  'import { buildCurrentHumanTurnReply, currentHumanTurnCandidateAligned, resolveCurrentHumanTurnAuthority } from "./currentHumanTurnAuthority";\n',
  'import { buildCurrentHumanTurnReply, currentHumanTurnCandidateAligned, resolveCurrentHumanTurnAuthority } from "./currentHumanTurnAuthority";\nimport { buildCurrentTurnSupremacyReply, resolveCurrentTurnSupremacy } from "./currentTurnSupremacy";\n',
  'import current-turn supremacy'
);
arbiter = replaceOnce(arbiter, '  | "contact_identity_mismatch"\n  | "down_payment"', '  | "contact_identity_mismatch"\n  | "current_turn_supremacy"\n  | "down_payment"', 'add supremacy obligation');
arbiter = replaceOnce(
  arbiter,
  '  const currentHumanTurn = resolveCurrentHumanTurnAuthority({ turn: input.turn, state: input.state, truth: input.truth });\n\n  if (currentHumanTurn.kind === "contact_isolation_continuation")',
  '  const currentHumanTurn = resolveCurrentHumanTurnAuthority({ turn: input.turn, state: input.state, truth: input.truth });\n  const currentTurnSupremacy = resolveCurrentTurnSupremacy({ turn: input.turn, state: input.state, truth: input.truth });\n\n  if (currentHumanTurn.kind === "contact_isolation_continuation")',
  'resolve supremacy in obligation plane'
);
arbiter = replaceOnce(
  arbiter,
  '  if (hasAuthoritativeMutationResult(input.actions, input.turn)) return "mutation_truth";\n  if (currentHumanTurn.kind === "preliminary_decision_due")',
  '  if (hasAuthoritativeMutationResult(input.actions, input.turn)) return "mutation_truth";\n  if (currentTurnSupremacy.kind !== "none") return "current_turn_supremacy";\n  if (currentHumanTurn.kind === "preliminary_decision_due")',
  'supremacy before stale classifier and journey context'
);
arbiter = replaceOnce(
  arbiter,
  '    "current_human_turn", "answer_bundle", "refund_human_care", "refund_timing", "refund_process_problem",',
  '    "current_turn_supremacy", "current_human_turn", "answer_bundle", "refund_human_care", "refund_timing", "refund_process_problem",',
  'supremacy in current-question-first set'
);
arbiter = replaceOnce(
  arbiter,
  '  if (obligation === "protected_business_registration" && shouldSuppressRepeatedProtectedRegistration({ turn: input.turn, state: input.state })) {',
  '  if (obligation === "current_turn_supremacy") {\n    const supremacy = resolveCurrentTurnSupremacy({ turn: input.turn, state: input.state, truth: input.truth });\n    const repair = buildCurrentTurnSupremacyReply({ supremacy, turn: input.turn, state: input.state, truth: input.truth });\n    if (repair) return { reply: sanitizeUnifiedEgressReply(repair), obligation, repaired: repair !== candidate, reason: `literal current-turn supremacy: ${supremacy.reason}` };\n  }\n\n  if (obligation === "protected_business_registration" && shouldSuppressRepeatedProtectedRegistration({ turn: input.turn, state: input.state })) {',
  'final supremacy before legacy locks'
);
write(arbiterPath, arbiter);

const mutationPath = 'app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts';
let mutation = read(mutationPath);
mutation = replaceOnce(
  mutation,
  '  if (action === "link_whatsapp_alias") return /^(?:طيب\\s+)?(?:بزبط|ممكن|هل|بقدر|اقدر|كيف)/.test(q) || /(?:ممكن|بقدر|هل).{0,32}(?:اعتمد|اربط|ضيف|اضف|ثبت|سجل)/.test(q);\n  return /^(?:طيب\\s+)?(?:بزبط|ممكن|هل|بقدر|اقدر|اقدرش|لو|اذا|ادا|كيف|شو\\s+بصير|شو\\s+يصير|وش\\s+يصير|قديش|كم)/.test(q)',
  '  if (action === "link_whatsapp_alias") return /^(?:طيب\\s+)?(?:بزبط|ممكن|هل|بقدر|اقدر|كيف)/.test(q) || /(?:ممكن|بقدر|هل).{0,32}(?:اعتمد|اربط|ضيف|اضف|ثبت|سجل)/.test(q);\n  const explicitHypothetical = /(?:^|\\s)(?:لو|اذا|إذا|ادا|فرض|افتراض)(?:\\s|$)/.test(q) || /(?:هذا|هاد|هاذ|هاض).{0,14}(?:سؤال|سوال)|(?:بس).{0,12}(?:سؤال|سوال)/.test(q);\n  if (explicitHypothetical) return true;\n  return /^(?:طيب\\s+)?(?:بزبط|ممكن|هل|بقدر|اقدر|اقدرش|لو|اذا|ادا|كيف|شو\\s+بصير|شو\\s+يصير|وش\\s+يصير|قديش|كم)/.test(q)',
  'hypothetical mutation questions cannot stage action'
);
mutation = replaceOnce(
  mutation,
  '    return /(?:بديش|ما\\s+بدي|لا\\s+اريد|لا\\s+ارغب).{0,24}(?:الغ|الغاء)|(?:بطلت|تراجعت).{0,18}(?:الغي|الغاء)|(?:الغاء).{0,12}(?:طلب\\s+)?(?:الالغاء)|(?:سالتك|سألتك|بس\\s+سوال|بس\\s+سؤال).{0,28}(?:الغ|الغاء)|(?:ما\\s+حكيتلك|ما\\s+طلبت).{0,24}(?:تلغي|الغاء)|(?:كمل|اكمل|استمر).{0,28}(?:الطلب|الجهاز)/.test(q);',
  '    return /(?:لا|ما)\\s*(?:تلغي|الغي|الغاء|إلغاء)|(?:بديش|ما\\s+بدي|لا\\s+اريد|لا\\s+أريد|لا\\s+ارغب).{0,24}(?:الغ|الغاء)|(?:بطلت|تراجعت).{0,18}(?:الغي|الغاء)|(?:الغاء).{0,12}(?:طلب\\s+)?(?:الالغاء)|(?:سالتك|سألتك|بس\\s+سوال|بس\\s+سؤال|هذا\\s+سؤال|هاد\\s+سؤال).{0,28}(?:الغ|الغاء)|(?:ما\\s+حكيتلك|ما\\s+طلبت).{0,24}(?:تلغي|الغاء)|(?:لا\\s+لا).{0,20}(?:الغ|الطلب)|(?:كمل|اكمل|أكمل|استمر).{0,28}(?:الطلب|الجهاز|الملف)/.test(q);',
  'strong cancellation withdrawal'
);
mutation = replaceOnce(
  mutation,
  '  const authoritativeStage = applicationJourneyStage(input.truth.application);\n  const currentQ = normalized(input.turn.rawText);\n\n  const stopRefundContinuationRequest',
  '  const authoritativeStage = applicationJourneyStage(input.truth.application);\n  const currentQ = normalized(input.turn.rawText);\n\n  if (input.state.pendingAction === "cancel_application" && mutationDecline("cancel_application", input.turn.rawText)) {\n    const app = input.truth.application;\n    const status = app ? ` طلبك${app.trackingId ? ` ${app.trackingId}` : ""} مستمر وحالته الحالية: ${customerFacingStatusLabel(app)}.` : "";\n    return {\n      actions: input.actions.filter((action) => action.action !== "cancel_application"),\n      confirmationPrompt: null,\n      informationalReply: `تمام، ما في إلغاء وما رح أنفذ الإلغاء.${status}`.trim(),\n      clearPendingConfirmation: true,\n      confirmedAction: null,\n      blockedQuestionAction: "cancel_application",\n    };\n  }\n\n  const stopRefundContinuationRequest',
  'decline clears pending cancellation before planner residue'
);
write(mutationPath, mutation);

const continuationPath = 'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts';
let continuation = read(continuationPath);
continuation = replaceOnce(
  continuation,
  'const PAYMENT_PROOF_PENDING_STATUSES = new Set(["customer_claimed_paid", "pending_payment_confirmation"]);\nconst CONTINUATION_VISIBILITY_DELAYS_MS',
  'const PAYMENT_PROOF_PENDING_STATUSES = new Set(["customer_claimed_paid", "pending_payment_confirmation"]);\nconst CONTINUATION_PROTECTED_STATUSES = new Set([\n  "customer_confirmed_continue",\n  "customer_declined_continue",\n  "cancelled",\n  "rejected",\n  "refund_requested",\n  "refund_completed",\n  "refunded",\n  "approved",\n  "final_approved",\n  "ready_for_pickup",\n  "ready_for_contract",\n  "delivery_ready",\n  "needs_identity",\n  "identity_requested",\n  "needs_salary_slip",\n  "salary_slip_link_sent",\n  "needs_guarantor",\n]);\nconst CONTINUATION_VISIBILITY_DELAYS_MS',
  'protected later application states'
);
continuation = replaceOnce(
  continuation,
  'function preliminaryDecisionAuthority(app: ApplicationTruth | null | undefined) {\n  if (!app) return false;\n  const status = low(app.status);\n  return PRELIMINARY_DECISION_STATUSES.has(status)\n    && (status === "preliminary_qualified" || Boolean(app.preliminaryQualifiedAt));\n}',
  'function preliminaryDecisionAuthority(app: ApplicationTruth | null | undefined) {\n  if (!app) return false;\n  const status = low(app.status);\n  if (CONTINUATION_PROTECTED_STATUSES.has(status)) return false;\n  // Canonical invariant: preliminary_qualified_at is authoritative approval truth.\n  // Legacy rows may carry an older status string; if the marker is present and no\n  // protected later state exists, persistence must agree with the journey classifier.\n  return status === "preliminary_qualified" || Boolean(app.preliminaryQualifiedAt);\n}',
  'align revenue-ready authority with journey truth'
);
continuation = replaceOnce(
  continuation,
  '  const currentPreliminaryApproved = currentStatus === "preliminary_qualified" || Boolean(current.preliminary_qualified_at);\n  if (!currentPreliminaryApproved || !PRELIMINARY_DECISION_STATUSES.has(currentStatus)) {\n    return { attempted: true, updated: false, alreadyRecorded: false, blocker: `application_status:${currentStatus || "empty"}` };\n  }',
  '  const currentPreliminaryApproved = currentStatus === "preliminary_qualified" || Boolean(current.preliminary_qualified_at);\n  if (!currentPreliminaryApproved || CONTINUATION_PROTECTED_STATUSES.has(currentStatus)) {\n    return { attempted: true, updated: false, alreadyRecorded: false, blocker: `application_status:${currentStatus || "empty"}` };\n  }',
  'persist by authoritative preliminary marker while protecting later states'
);
write(continuationPath, continuation);

const selftest = [
"const assert = require('assert');",
"const fs = require('fs');",
"const arbiter = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts', 'utf8');",
"const supremacy = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/currentTurnSupremacy.ts', 'utf8');",
"const mutation = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/mutationConfirmationGate.ts', 'utf8');",
"const continuation = fs.readFileSync('app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts', 'utf8');",
"assert(arbiter.includes('current_turn_supremacy'));",
"assert(arbiter.includes('literal current-turn supremacy'));",
"assert(arbiter.indexOf('if (currentTurnSupremacy.kind !== \"none\") return \"current_turn_supremacy\";') < arbiter.indexOf('if (structuredApplicationStatusRequest(input.turn)) return \"application_status\";'));",
"assert(supremacy.includes('mutation_hypothetical'));",
"assert(supremacy.includes('website_url'));",
"assert(supremacy.includes('down_payment'));",
"assert(supremacy.includes('trust_verification'));",
"assert(supremacy.includes('income_requirement'));",
"assert(supremacy.includes('external_credit'));",
"assert(supremacy.includes('review_duration'));",
"assert(supremacy.includes('dialect_preference'));",
"assert(supremacy.includes('هذا موقع الأمين للأقساط الرسمي'));",
"assert(supremacy.includes('ما في دفعة أولى على الجهاز'));",
"assert(mutation.includes('const explicitHypothetical'));",
"assert(mutation.includes('input.state.pendingAction === \"cancel_application\" && mutationDecline'));",
"assert(mutation.includes('ما في إلغاء وما رح أنفذ الإلغاء'));",
"assert(continuation.includes('CONTINUATION_PROTECTED_STATUSES'));",
"assert(continuation.includes('Boolean(app.preliminaryQualifiedAt)'));",
"assert(!continuation.includes('!currentPreliminaryApproved || !PRELIMINARY_DECISION_STATUSES.has(currentStatus)'));",
"assert(continuation.includes('!currentPreliminaryApproved || CONTINUATION_PROTECTED_STATUSES.has(currentStatus)'));",
"console.log('PASS v3 Phase 13.1 root current-turn supremacy selftest');",
].join('\n') + '\n';
write('scripts/v3-phase13-1-root-current-turn-supremacy-selftest.cjs', selftest);

console.log('PHASE 13.1 ROOT PATCH COMPLETE');
