const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=process.argv[2]||process.cwd();process.chdir(root);
const EXPECTED='171bad6eecb0856a9ca43d6d9e406cb4bc567b01';
const BRANCH='phase11.9-final-conversation-integrity-human-care';
const enc='utf8';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed${r.stderr?`: ${r.stderr.trim()}`:''}`);return opts.capture?String(r.stdout||'').trim():''}
function read(rel){return fs.readFileSync(path.join(root,rel),enc)}
function write(rel,value){const abs=path.join(root,rel);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,value,{encoding:'utf8'})}
function replaceOnce(rel,oldText,newText,label){const src=read(rel);const first=src.indexOf(oldText);if(first<0)throw new Error(`${label}: anchor missing in ${rel}`);if(src.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor not unique in ${rel}`);write(rel,src.slice(0,first)+newText+src.slice(first+oldText.length))}
function replaceBlock(rel,start,end,replacement,label){const src=read(rel);const s=src.indexOf(start);if(s<0)throw new Error(`${label}: start anchor missing in ${rel}`);const e=src.indexOf(end,s+start.length);if(e<0)throw new Error(`${label}: end anchor missing in ${rel}`);write(rel,src.slice(0,s)+replacement+src.slice(e))}
function gitShow(remotePath){return cp.execFileSync('git',['show',`origin/${BRANCH}:${remotePath}`],{cwd:root,encoding:'utf8'})}
function hash(rel){return run('git',['hash-object','--',rel],{capture:true})}
function statusFor(files){return run('git',['status','--porcelain','--',...files],{capture:true})}
const targets=[
 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts',
];
const created=[
 'app/api/whatsapp/webhook/_lib/v3-os/humanCarePolicy.ts',
 'scripts/v3-phase11-9-final-conversation-integrity-selftest.cjs',
];
const protectedFiles=[
 'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts',
 'app/api/continue-decision/route.ts',
 'app/admin/page.tsx',
 'app/admin/applications/[id]/page.tsx',
 'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
];
const head=run('git',['rev-parse','HEAD'],{capture:true});if(head!==EXPECTED)throw new Error(`STOP: expected HEAD ${EXPECTED}, found ${head}`);
const dirty=statusFor([...targets,...protectedFiles]);if(dirty)throw new Error(`STOP: protected/target files have local changes:\n${dirty}`);
for(const rel of created)if(fs.existsSync(path.join(root,rel)))throw new Error(`STOP: new Phase 11.9 file already exists: ${rel}`);
const protectedHash=Object.fromEntries(protectedFiles.map(rel=>[rel,hash(rel)]));
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);const backup=path.join(process.env.USERPROFILE||root,'.alameen-backups',`before-v3-phase11-9-final-conversation-integrity-${stamp}`);fs.mkdirSync(backup,{recursive:true});for(const rel of targets){const dst=path.join(backup,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,rel),dst)}
function rollback(){for(const rel of targets){const src=path.join(backup,rel);if(fs.existsSync(src)){fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.copyFileSync(src,path.join(root,rel))}}for(const rel of created){try{fs.rmSync(path.join(root,rel),{force:true})}catch{}}}
try{
  write(created[0],gitShow(created[0]));
  write(created[1],gitShow(created[1]));

  replaceOnce(targets[0],
    'import { notifyV3Discord } from "./discordNotifier";',
    'import { notifyV3Discord } from "./discordNotifier";\nimport { applyHumanCareEgress } from "./humanCarePolicy";',
    'human-care import');

  replaceBlock(targets[0],
    'function humanRequestGroundedReply(',
    '\n\nfunction reconcilePendingMutationWithAuthoritativeTruth',
`type HumanEscalationReceipt = "recorded" | "already_recorded" | "failed" | "not_applicable" | null;

function explicitHumanEscalationRequest(turn: InterpretedTurn) {
  const q = normalizeActionConfirmationText(turn.rawText);
  if (!q) return false;
  return /(?:بدي|اريد|أريد|ممكن|لازم).{0,30}(?:موظف|موضف|مسؤول|مدير|شخص\s+حقيقي|بني\s+ادم|بني\s+آدم|انسان|إنسان).{0,35}(?:احكي|اتفاهم|اتواصل|اتصل|يرد|معه|معها)?|(?:احكي|اتواصل|اتصل|رن).{0,25}(?:معي|علي|فيي|موظف|مسؤول|مدير)|(?:بدي|اريد|أريد).{0,25}(?:مكالمه|مكالمة|اتصال)/.test(q);
}

async function recordHumanEscalationReceipt(input: { turn: InterpretedTurn; truth: TruthBundle; waId: string; turnId: string; customerText: string }): Promise<HumanEscalationReceipt> {
  if (!explicitHumanEscalationRequest(input.turn)) return null;
  const app = input.truth.application;
  if (!app || input.truth.contactAccess !== "full") return "not_applicable";
  try {
    const notification = await notifyV3Discord({
      event: "manual_action_required",
      applicationId: app.id,
      trackingId: app.trackingId || null,
      waId: input.waId,
      actionKey: "record_call_preference",
      details: {
        action: "record_call_preference",
        requestType: "human_contact_request",
        customerMessage: input.customerText,
        turnId: input.turnId,
      },
    });
    if (notification.sent) return "recorded";
    if (notification.reason === "duplicate_actionable_notification") return "already_recorded";
    return "failed";
  } catch (error) {
    console.error("human escalation durable receipt failed", { turnId: input.turnId, error });
    return "failed";
  }
}

function humanRequestGroundedReply(input: { turn: InterpretedTurn; state: ConversationState; truth: TruthBundle; receipt: HumanEscalationReceipt }) {
  if (!explicitHumanEscalationRequest(input.turn) && !input.turn.topics.some((topic) => ["human_request", "manager_request", "call_request"].includes(topic))) return null;
  const name = roleDisplayName(input.state.role.currentRole);
  const tracking = input.truth.application?.trackingId ? ` على الطلب ${input.truth.application.trackingId}` : "";
  const status = input.truth.application && input.turn.topics.includes("application_status")
    ? ` حالة طلبك الحالية: ${customerFacingStatusLabel(input.truth.application)}.`
    : "";
  if (input.receipt === "recorded" || input.receipt === "already_recorded") {
    return `معك ${name} من الأمين، وأنا مكمل معك هون.${status} طلبك للتواصل المباشر اتسجل للإدارة${tracking}. هذا تسجيل طلب تواصل فعلي، مش وعد بموعد مكالمة؛ ما رح أقول إن حدا اتصل أو تم تحويلك قبل ما يصير ذلك فعليًا.`;
  }
  if (input.receipt === "failed") {
    return `معك ${name} من الأمين.${status} طلبك للتواصل واضح، لكن ما قدرت أثبت تسجيله تشغيليًا الآن، لذلك ما رح أقول لك إنه اتسجل. احكيلي المشكلة نفسها وبكمل معك هون بدون ما أعيد عليك معلومات معروفة.`;
  }
  if (input.receipt === "not_applicable") {
    return `معك ${name} من الأمين.${status} طلبك للتواصل واضح، لكن ما عندي ربط كامل بطلب محدد أقدر أسجل عليه طلب تواصل إداري بشكل موثوق. ابعث رقم التتبع إذا عندك، وبنفس الوقت احكيلي المشكلة نفسها وبكمل معك هون.`;
  }
  return `معك ${name} من الأمين، وبكمل معك هون على نفس المحادثة.${status} ما رح أدّعي إنه صار تحويل أو اتصال إذا ما في تنفيذ فعلي مثبت؛ احكيلي المطلوب مباشرة وبعالجه معك حسب حالة الطلب الفعلية.`;
}`,
    'human escalation durable receipt block');

  replaceOnce(targets[0],
    '  let actionResults = actions;\n\n  let manualMutationReceipt: ManualMutationReceipt | null = null;',
`  let actionResults = actions;

  const humanEscalationReceipt = await recordHumanEscalationReceipt({
    turn,
    truth: truthBeforeActions,
    waId: input.waId,
    turnId: input.turnId,
    customerText: input.customerText,
  });
  if (humanEscalationReceipt) {
    const durable = humanEscalationReceipt === "recorded" || humanEscalationReceipt === "already_recorded";
    const receiptResult: ActionResult = {
      action: "record_call_preference",
      outcome: durable ? (humanEscalationReceipt === "recorded" ? "executed" : "already_done") : (humanEscalationReceipt === "failed" ? "failed" : "dry_run"),
      executed: durable,
      authoritativeSummary: durable ? "human contact request durably recorded in notification ledger" : null,
      mutationId: null,
      blocker: durable ? null : (humanEscalationReceipt === "failed" ? "human_contact_request_receipt_failed" : "human_contact_request_not_applicable"),
      ownerRole: stateWorking.role.currentRole,
      details: durable ? { receipt: "human_contact_request_durable_ledger" } : { receipt: humanEscalationReceipt },
    };
    const existingContactIndex = actionResults.findIndex((result) => result.action === "record_call_preference");
    actionResults = existingContactIndex >= 0
      ? actionResults.map((result, index) => index === existingContactIndex ? receiptResult : result)
      : [...actionResults, receiptResult];
  }

  let manualMutationReceipt: ManualMutationReceipt | null = null;`,
    'durable human escalation action receipt');

  replaceOnce(targets[0],
    '  const authoritativeHumanRequestReply = humanRequestGroundedReply({ turn, state: stateWorking, truth: truthAfterActions });',
    '  const authoritativeHumanRequestReply = humanRequestGroundedReply({ turn, state: stateWorking, truth: truthAfterActions, receipt: humanEscalationReceipt });',
    'human escalation reply receipt binding');

  replaceOnce(targets[0],
`  if (reply && resemblesPostDisclosurePaymentReply(reply)) {
    reduced = markCommercialDisclosureAcknowledged(reduced, truthAfterActions, turn.turnId);
  }

  if (gate.confirmationPrompt && arbitration.obligation !== "mutation_truth" && reply !== gate.confirmationPrompt) {`,
`  if (reply && resemblesPostDisclosurePaymentReply(reply)) {
    reduced = markCommercialDisclosureAcknowledged(reduced, truthAfterActions, turn.turnId);
  }

  // Phase 11.9: human care shapes the language only after truth/action/commercial
  // arbitration. Protected payment execution/disclosure replies are byte-stable.
  reply = applyHumanCareEgress({ reply, turn, state: reduced, truth: truthAfterActions });

  if (gate.confirmationPrompt && arbitration.obligation !== "mutation_truth" && reply !== gate.confirmationPrompt) {`,
    'human care final egress application');

  replaceOnce(targets[1],
    'import { personaWritingContract } from "./personas";',
    'import { personaWritingContract } from "./personas";\nimport { humanCarePromptContract } from "./humanCarePolicy";',
    'human brain care import');
  replaceOnce(targets[1],
    '${khaledOverlay ? `\nCALMING_OVERLAY:\n${khaledOverlay}` : ""}\n\nالقواعد الصلبة:',
    '${khaledOverlay ? `\nCALMING_OVERLAY:\n${khaledOverlay}` : ""}\n\nHUMAN_CARE_POLICY:\n${humanCarePromptContract({ turn: input.anchor, state: input.state, truth: input.truth })}\n\nالقواعد الصلبة:',
    'human brain unified care contract');

  replaceBlock(targets[2],
    'function hasAuthoritativeMutationResult(actions: ActionResult[]) {',
    '\n\nfunction conditionalFutureMutationText',
`function hasAuthoritativeMutationResult(actions: ActionResult[]) {
  return actions.some((a) => ["cancel_application", "request_refund", "stop_refund", "reopen_application", "link_whatsapp_alias"].includes(a.action)
    && (a.executed || ["executed", "already_done", "needs_confirmation", "blocked", "failed", "dry_run"].includes(a.outcome)));
}

function authoritativeStopOrReopenReply(input: { actions: ActionResult[]; truth: TruthBundle }) {
  const tracking = input.truth.application?.trackingId ? ` على الطلب ${input.truth.application.trackingId}` : "";
  const stop = input.actions.find((a) => a.action === "stop_refund");
  if (stop) {
    if (stop.outcome === "needs_confirmation") return `طلب إيقاف الاسترداد واضح${tracking}. للتأكيد النهائي اكتب: نعم، بدي أوقف طلب الاسترداد وأرجع أكمل طلب التقسيط.`;
    if (stop.outcome === "executed") return `تم إيقاف طلب الاسترداد وإعادة تفعيل طلبك${tracking}. المتابعة بتكمل على نفس الطلب.`;
    if (stop.outcome === "already_done") return `ما في استرداد نشط يحتاج إيقاف${tracking}؛ الطلب مستمر أصلًا حسب النتيجة الموثقة.`;
    return `طلب إيقاف الاسترداد واضح${tracking}، لكن الإجراء ما تنفذ فعليًا لحد الآن. ما رح أعتبر الاسترداد موقوف قبل ما تثبت النتيجة بالنظام.`;
  }
  const reopen = input.actions.find((a) => a.action === "reopen_application");
  if (reopen) {
    if (reopen.outcome === "needs_confirmation") return `طلب إعادة فتح الطلب واضح${tracking}. للتأكيد النهائي اكتب: نعم، بدي أعيد فتح الطلب وأكمل عليه.`;
    if (reopen.outcome === "executed") return `تم إعادة فتح طلبك${tracking} بنجاح، والمتابعة بتكمل على نفس الطلب.`;
    if (reopen.outcome === "already_done") return `طلبك${tracking} مفتوح أصلًا وما في داعي نعيد فتحه.`;
    return `طلب إعادة فتح الطلب واضح${tracking}، لكن الإجراء ما تنفذ فعليًا لحد الآن. ما رح أقول إنه انفتح قبل ما تثبت النتيجة بالنظام.`;
  }
  return null;
}`,
    'stop-refund/reopen authoritative mutation result');

  replaceBlock(targets[2],
    'function asksTrackingLink(value: string | null | undefined) {',
    '\n\nfunction asksContactChannel',
`function asksTrackingLink(value: string | null | undefined) {
  const q = n(value);
  // device_change_link_owns_current_turn: an explicit link object outranks the
  // generic word "رابط" so a device-change link can never become a tracking link.
  if (/(?:رابط).{0,35}(?:تغيير|تعديل).{0,24}(?:الجهاز|الموديل)|(?:تغيير|تعديل).{0,24}(?:الجهاز|الموديل).{0,35}(?:رابط)/.test(q)) return false;
  return /(?:اعطيني|ابعث|ابعت|ارسل|بدي|وين|كيف).{0,28}(?:رابط\s+التتبع|رابط).{0,25}(?:طلبي|الطلب)?|(?:كيف\s+اشوف|كيف\s+اتتبع|بدي\s+اتتبع).{0,22}(?:طلبي|الطلب)/.test(q);
}`,
    'tracking link object authority');

  replaceBlock(targets[2],
    'function asksRequirementsQuestion(turn: InterpretedTurn) {',
    '\n\nfunction asksContractTermsQuestion',
`function asksRequirementsQuestion(turn: InterpretedTurn) {
  const q = n(turn.rawText);
  if (!q) return false;
  if (/(?:شروط|بنود)\s+العقد/.test(q)) return false;
  const requirementObject = /(?:شروط|الشروط|المتطلبات|الاوراق|الأوراق|وثائق|الوثائق|مستند|مستندات|كفيل|ضامن|اثبات\s+دخل|إثبات\s+دخل|كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب)/;
  const asks = /(?:شو|ايش|إيش|ما|هل|ايه|إيه).{0,28}(?:شروط|الشروط|المتطلبات|الاوراق|الأوراق|وثائق|الوثائق|مستند|مستندات|اثبات\s+دخل|إثبات\s+دخل|كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب)|(?:شو\s+لازم|شو\s+مطلوب).{0,28}(?:للتقديم|للطلب|مني|ارفع|أرفع)|(?:هل|بدي|محتاج).{0,24}(?:كفيل|ضامن|وثائق|مستندات)|(?:كفيل|الكفيل).{0,24}(?:لازم|مطلوب|ضروري|هل)|(?:اثبات\s+دخل|إثبات\s+دخل).{0,24}(?:قصدك|يعني|هو).{0,20}(?:كشف\s+راتب|شهاده\s+راتب|شهادة\s+راتب)/.test(q);
  return asks || (turn.topics.includes("requirements") && requirementObject.test(q));
}`,
    'requirements/document authority');

  replaceBlock(targets[2],
    'function mutationRequestReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {',
    '\n\nfunction refundTimingReply',
`function mutationRequestReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const app = input.truth.application;
  const stage = applicationJourneyStage(app);
  const stopRefundRequest = /(?:وقف|اوقف|ايقاف|الغاء|الغي).{0,34}(?:طلب\s+)?(?:الاسترداد|الاسترجاع)/.test(q);
  if (stopRefundRequest) {
    if (stage === "refund_requested") return `طلبك واضح: بدك توقف الاسترداد وترجع تكمل نفس الطلب${app?.trackingId ? ` ${app.trackingId}` : ""}. للتأكيد النهائي اكتب: نعم، بدي أوقف طلب الاسترداد وأرجع أكمل طلب التقسيط.`;
    if (stage === "refund_completed") return "الاسترداد مكتمل حسب الحالة الحالية، لذلك ما بقدر أعتبره قابلًا للإيقاف من المحادثة وحدها.";
    return "ما في طلب استرداد نشط ظاهر على الحالة الحالية يحتاج إيقاف.";
  }
  const reopenRequest = /(?:ارجع|أرجع|اعيد|أعيد|اعاده|إعادة|افتح|أفتح|تفعيل).{0,35}(?:الطلب|المعامله|المعاملة|الملف)/.test(q);
  if (reopenRequest && ["cancelled", "refund_requested"].includes(stage)) {
    return `طلب إعادة فتح الطلب واضح${app?.trackingId ? ` ${app.trackingId}` : ""}. للتأكيد النهائي اكتب: نعم، بدي أعيد فتح الطلب وأكمل عليه.`;
  }
  const cancel = /(?:الغي|الغاء|إلغاء|الغوا)/.test(q);
  if (cancel) {
    if (["cancelled", "refund_requested", "refund_completed"].includes(stage)) {
      if (stage === "refund_requested") return "طلبك ملغي بالفعل، وطلب الاسترداد مفتوح وقيد المعالجة؛ ما في داعي تعيد الإلغاء.";
      if (stage === "refund_completed") return "طلبك ملغي والاسترداد مكتمل حسب الحالة الحالية؛ ما في داعي تعيد الإلغاء.";
      return "طلبك ملغي بالفعل حسب الحالة الحالية؛ ما في داعي تعيد الإلغاء.";
    }
    return `وصلني طلب الإلغاء${app?.trackingId ? ` للطلب ${app.trackingId}` : ""}. قبل ما أنفذ أي تغيير، أكدلي مرة واحدة: نعم، ألغي الطلب.`;
  }
  if (stage === "refund_requested") return "طلب الاسترداد مسجل بالفعل وقيد المعالجة؛ ما في داعي تعيد طلبه.";
  if (stage === "refund_completed") return "الاسترداد مكتمل حسب الحالة الحالية؛ ما في داعي تعيد طلبه.";
  return "وصلني طلب استرداد الرسوم. قبل ما أسجل الإجراء فعليًا، أكدلي مرة واحدة: نعم، أريد استرداد الرسوم.";
}`,
    'stop-refund before generic cancellation');

  replaceOnce(targets[2],
`  if (obligation === "mutation_truth") {
    if (hasAuthoritativeMutationResult(input.actions)) {
      return { reply: candidate, obligation, repaired: false, reason: "mutation/action truth remains authoritative" };
    }`,
`  if (obligation === "mutation_truth") {
    const stopOrReopenReply = authoritativeStopOrReopenReply({ actions: input.actions, truth: input.truth });
    if (stopOrReopenReply) {
      return { reply: sanitizeUnifiedEgressReply(stopOrReopenReply), obligation, repaired: stopOrReopenReply !== candidate, reason: "stop-refund/reopen action result owns final response" };
    }
    if (hasAuthoritativeMutationResult(input.actions)) {
      return { reply: candidate, obligation, repaired: false, reason: "mutation/action truth remains authoritative" };
    }`,
    'authoritative stop-refund final reply');

  replaceOnce(targets[3],
`  if (action.action === "switch_ai_role" || action.action === "record_call_preference") {
    return {
      action: action.action,
      outcome: "executed",
      executed: true,
      authoritativeSummary: action.action === "switch_ai_role" ? "تم تغيير مستوى المعالجة داخل فريق AI." : "تم تسجيل تفضيل العميل للمكالمة دون وعد باتصال.",
      mutationId: null,
      blocker: null,
      ownerRole: state.role.currentRole,
    };
  }`,
`  if (action.action === "switch_ai_role") {
    return {
      action: action.action,
      outcome: "executed",
      executed: true,
      authoritativeSummary: "تم تغيير مستوى المعالجة داخل فريق AI.",
      mutationId: null,
      blocker: null,
      ownerRole: state.role.currentRole,
    };
  }
  if (action.action === "record_call_preference") {
    return {
      action: action.action,
      outcome: "dry_run",
      executed: false,
      authoritativeSummary: null,
      mutationId: null,
      blocker: "human_contact_request_requires_durable_receipt",
      ownerRole: state.role.currentRole,
    };
  }`,
    'call preference cannot self-certify execution');

  replaceOnce(targets[4],
    '  if (!actionSucceeded(input.actions, "link_whatsapp_alias") && /تم\\s+(?:اعتماد|ربط)\\s+(?:رقم|الرقم|واتساب)/.test(n)) reasons.push("false_contact_link_completion_claim");',
    '  if (!actionSucceeded(input.actions, "link_whatsapp_alias") && /تم\\s+(?:اعتماد|ربط)\\s+(?:رقم|الرقم|واتساب)/.test(n)) reasons.push("false_contact_link_completion_claim");\n  if (!actionSucceeded(input.actions, "record_call_preference") && /(?:تم\\s+تسجيل|سجلت|سجلنا).{0,45}(?:طلب\\s+)?(?:اتصال|مكالمة|تواصل|موظف|مسؤول)/.test(n)) reasons.push("false_human_contact_registration_claim");',
    'false human-contact registration guard');

  console.log('\n=== PHASE 11.9 REGRESSION PACK ===');
  run('node',['scripts/v3-phase11-9-final-conversation-integrity-selftest.cjs',root]);
  console.log('\n=== CURRENT 11.7.1 REGRESSION PACK ===');
  run('node',['scripts/v3-phase11-7-1-turn-scoped-authority-finalization-selftest.cjs',root]);
  console.log('\n=== PAYMENT FUNNEL FREEZE GATE ===');
  run('node',['scripts/v3-phase11-8-0-payment-funnel-control-plane-selftest.cjs',root]);
  console.log('\n=== BUILD ===');
  run(process.platform==='win32'?'npm.cmd':'npm',['run','build']);
  run('git',['diff','--check']);

  for(const rel of protectedFiles){const after=hash(rel);if(after!==protectedHash[rel])throw new Error(`PAYMENT FUNNEL FREEZE VIOLATION: protected file changed: ${rel}`)}
  const protectedDirty=statusFor(protectedFiles);if(protectedDirty)throw new Error(`PAYMENT FUNNEL FREEZE VIOLATION: protected files dirty:\n${protectedDirty}`);

  console.log('\n========================================');
  console.log('PASS - PHASE 11.9 FINAL CONVERSATION INTEGRITY');
  console.log('PAYMENT FUNNEL FREEZE: PASS / UNCHANGED');
  console.log('========================================');
  console.log(`Backup: ${backup}`);
  console.log('\nChanged files:');
  console.log(run('git',['status','--short','--',...targets,...created],{capture:true}));
}catch(err){console.error('\nFAILED - ROLLING BACK PHASE 11.9...');rollback();console.error(err&&err.stack?err.stack:String(err));process.exit(1)}
