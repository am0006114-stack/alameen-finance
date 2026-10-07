const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const root=process.argv[2]||process.cwd();process.chdir(root);
const EXPECTED='85f241a6c67e73d0fc513438ac05f65d289de61a';
const BRANCH='phase11.9.1-operational-calendar-integrity';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed${r.stderr?`: ${String(r.stderr).trim()}`:''}`);return opts.capture?String(r.stdout||'').trim():''}
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
function write(rel,value){const abs=path.join(root,rel);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,value,{encoding:'utf8'})}
function gitShow(rel){return cp.execFileSync('git',['show',`origin/${BRANCH}:${rel}`],{cwd:root,encoding:'utf8'})}
function replaceOnce(rel,oldText,newText,label){const src=read(rel);const first=src.indexOf(oldText);if(first<0)throw new Error(`${label}: anchor missing in ${rel}`);if(src.indexOf(oldText,first+oldText.length)>=0)throw new Error(`${label}: anchor not unique in ${rel}`);write(rel,src.slice(0,first)+newText+src.slice(first+oldText.length))}
function replaceBlock(rel,start,end,replacement,label){const src=read(rel);const s=src.indexOf(start);if(s<0)throw new Error(`${label}: start anchor missing in ${rel}`);const e=src.indexOf(end,s+start.length);if(e<0)throw new Error(`${label}: end anchor missing in ${rel}`);write(rel,src.slice(0,s)+replacement+src.slice(e))}
function replaceAllExact(rel,oldText,newText,expected,label){const src=read(rel);const count=src.split(oldText).length-1;if(count!==expected)throw new Error(`${label}: expected ${expected} anchors, found ${count} in ${rel}`);write(rel,src.split(oldText).join(newText))}
function shaText(value){return crypto.createHash('sha256').update(value,'utf8').digest('hex')}
function fileHash(rel){return run('git',['hash-object','--',rel],{capture:true})}
function blockHash(rel,start,end){const src=read(rel),s=src.indexOf(start),e=src.indexOf(end,s+start.length);if(s<0||e<0)throw new Error(`protected block anchor missing: ${rel}`);return shaText(src.slice(s,e))}
function statusFor(files){return run('git',['status','--porcelain','--',...files],{capture:true})}
const targets=[
'app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts',
'app/api/whatsapp/webhook/_lib/v3-os/policy.ts',
'app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts',
'app/api/whatsapp/webhook/_lib/v3-os/humanCarePolicy.ts',
'app/admin/applications/[id]/page.tsx'];
const created=[
'app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar.ts',
'app/admin/operations-calendar/page.tsx',
'scripts/v3-phase11-9-1-operational-calendar-integrity-selftest.cjs'];
const protectedFiles=[
'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',
'app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts',
'app/api/continue-decision/route.ts',
'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
'app/admin/page.tsx'];
const detail='app/admin/applications/[id]/page.tsx';
const paymentBlocks=[
['function preliminaryApprovalWithFeeQuestionMessage','\n\nfunction preliminaryQualificationMessage'],
['function paymentInfoMessage','\n\nfunction underReviewMessage']];
const head=run('git',['rev-parse','HEAD'],{capture:true});if(head!==EXPECTED)throw new Error(`STOP: expected HEAD ${EXPECTED}, found ${head}`);
const dirty=statusFor([...targets,...protectedFiles,...created]);if(dirty)throw new Error(`STOP: target/protected files have local changes:\n${dirty}`);
for(const rel of created)if(fs.existsSync(path.join(root,rel)))throw new Error(`STOP: Phase 11.9.1 file already exists: ${rel}`);
const protectedHash=Object.fromEntries(protectedFiles.map(rel=>[rel,fileHash(rel)]));
const protectedPaymentBlockHash=paymentBlocks.map(([s,e])=>blockHash(detail,s,e));
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);const backup=path.join(process.env.USERPROFILE||root,'.alameen-backups',`before-v3-phase11-9-1-operational-calendar-${stamp}`);fs.mkdirSync(backup,{recursive:true});for(const rel of targets){const dst=path.join(backup,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,rel),dst)}
function rollback(){for(const rel of targets){const src=path.join(backup,rel);if(fs.existsSync(src)){fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.copyFileSync(src,path.join(root,rel))}}for(const rel of created){try{fs.rmSync(path.join(root,rel),{force:true})}catch{}}}
try{
  for(const rel of created)write(rel,gitShow(rel));

  const truth=targets[0];
  replaceOnce(truth,
`export const ALAMEEN_OFFICE_OPERATION_RULE =
  "موقعنا العام: عمّان – شارع المدينة المنورة. الجمعة والسبت عطلة تشغيلية للمكتب، بينما استقبال الطلبات والمتابعة الرقمية يستمران. الحضور للمكتب فقط بعد الموافقة النهائية وبموعد رسمي مؤكد مرتبط بالطلب؛ لا توجد زيارات مفتوحة ولا توصيل. العنوان التفصيلي وتعليمات الوصول تُرسل فقط مع الموعد الرسمي المؤكد، لأن المكتب ليس نقطة استقبال مفتوحة: كل حضور يجب أن يكون مرتبطًا بملف وموعد حتى يكون الجهاز والعقد وإجراءات الاستلام جاهزة مسبقًا، وحتى لا يحضر العميل بدون تنسيق أو ينتظر بدون فائدة.";`,
`export const ALAMEEN_OFFICE_OPERATION_RULE =
  "موقعنا العام: عمّان – شارع المدينة المنورة. أيام الدراسة والتشغيل والمواعيد والتسليم هي الأحد إلى الخميس. الجمعة والسبت عطلة تشغيلية كاملة: لا تُحتسبان ضمن أيام الدراسة، ولا تُنفذ فيهما دراسة أو مراجعة أو تسليم، ولا يُعطى فيهما موعد حضور أو استلام. استقبال الطلبات والمتابعة عبر الموقع وواتساب يستمران خلال العطلة. الحضور للمكتب فقط بعد الموافقة النهائية وبموعد رسمي مؤكد مرتبط بالطلب؛ لا توجد زيارات مفتوحة ولا توصيل. العنوان التفصيلي وتعليمات الوصول تُرسل فقط مع الموعد الرسمي المؤكد.";`,
  'office operational calendar truth');
  replaceOnce(truth,
`export const IPHONE18_PICKUP_RULE =
  "بالنسبة لأجهزة iPhone 18 Pro وiPhone 18 Pro Max، الاستلام يكون بعد شهر من الموافقة النهائية، ومن المكتب وبموعد رسمي مؤكد فقط؛ لا يوجد توصيل.";`,
`export const IPHONE18_PICKUP_RULE =
  "بالنسبة لجميع أجهزة iPhone 18 باختلاف أنواعها، استحقاق التسليم يكون بعد شهر كامل من تاريخ الموافقة النهائية الموثقة، وليس من تاريخ التقديم أو الدفع. إذا وافق تاريخ الاستحقاق يوم الجمعة أو السبت ينتقل لأول يوم تشغيل تالٍ. الاستلام من المكتب وبموعد رسمي مؤكد فقط؛ لا يوجد توصيل، ولا يبدأ عداد شهر التسليم قبل الموافقة النهائية.";`,
  'iphone18 one-month delivery truth');

  replaceOnce(targets[1],
'    normalReviewWindow: "المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل",',
'    normalReviewWindow: "المعدل الطبيعي للمراجعة من يومين إلى 3 أيام تشغيلية (الأحد إلى الخميس)، والجمعة والسبت لا تُحتسبان ضمن مدة الدراسة ولا تُنفذ فيهما مراجعة",',
'policy operational review window');

  const arbiter=targets[2];
  replaceOnce(arbiter,'  | "fee_question";','  | "operational_calendar"\n  | "fee_document_question"\n  | "fee_question";','arbiter obligation types');
  const oldClosure='  if (/^(?:تمام|تم|اوك|اوكي|أوك|أوكي|شكرا|شكرًا|شكراً|يسلمو|تسلم|الله\\s+يعافيك|يعطيك\\s+العافيه|يعطيك\\s+العافية|الله\\s+يعطيك\\s+العافيه|الله\\s+يعطيك\\s+العافية|ان\\s+شاء\\s+الله|إن\\s+شاء\\s+الله|تمام\\s+ان\\s+شاء\\s+الله|تمام\\s+إن\\s+شاء\\s+الله|العفو)$/.test(q)) return true;';
  const newClosure='  if (/^(?:خلص|خلص\\s+تمام|تمام|تم|اوك|اوكي|أوك|أوكي|شكرا|شكرًا|شكراً|يسلمو|تسلم|الله\\s+يعافيك|يعطيك\\s+العافيه|يعطيك\\s+العافية|الله\\s+يعطيك\\s+العافيه|الله\\s+يعطيك\\s+العافية|ان\\s+شاء\\s+الله|إن\\s+شاء\\s+الله|تمام\\s+ان\\s+شاء\\s+الله|تمام\\s+إن\\s+شاء\\s+الله|العفو)$/.test(q)) return true;';
  replaceOnce(arbiter,oldClosure,newClosure,'fresh social closure authority');
  replaceOnce(arbiter,
'  return /^(?:مرحبا|مرحبًا|هلا|اهلا|أهلا|السلام\\s+عليكم|صباح\\s+الخير|مساء\\s+الخير|كيفك|كيف\\s+حالكم)$/.test(q);',
'  return /^(?:مرحبا|مرحبًا|هلا|اهلا|أهلا|السلام\\s+عليكم|صباح\\s+الخير|مساء\\s+الخير|كيفك(?:\\s+[\\p{L}]+){0,2}|كيف\\s+حالكم)$/u.test(q);',
  'named greeting authority');
  const arbiterFragment=gitShow('scripts/phase11-9-1-fragments/arbiter-current-turn-calendar.tsfrag').trimEnd();
  replaceOnce(arbiter,'function hasAuthoritativeMutationResult(actions: ActionResult[]) {',`${arbiterFragment}\n\nfunction hasAuthoritativeMutationResult(actions: ActionResult[], turn?: InterpretedTurn) {`,'insert arbiter current-turn helpers');
  replaceBlock(arbiter,
'function hasAuthoritativeMutationResult(actions: ActionResult[], turn?: InterpretedTurn) {',
'\n\nfunction authoritativeStopOrReopenReply',
`function hasAuthoritativeMutationResult(actions: ActionResult[], turn?: InterpretedTurn) {
  const reopenAllowed = !turn || explicitReopenApplicationText(turn.rawText);
  return actions.some((a) => {
    if (a.action === "reopen_application" && !reopenAllowed) return false;
    return ["cancel_application", "request_refund", "stop_refund", "reopen_application", "link_whatsapp_alias"].includes(a.action)
      && (a.executed || ["executed", "already_done", "needs_confirmation", "blocked", "failed", "dry_run"].includes(a.outcome));
  });
}`,
'guard authoritative reopen by literal current text');
  replaceOnce(arbiter,
'function authoritativeStopOrReopenReply(input: { actions: ActionResult[]; truth: TruthBundle }) {',
'function authoritativeStopOrReopenReply(input: { actions: ActionResult[]; truth: TruthBundle; turn: InterpretedTurn }) {',
'bind stop/reopen reply to current turn');
  replaceOnce(arbiter,
'  const reopen = input.actions.find((a) => a.action === "reopen_application");',
'  const reopen = explicitReopenApplicationText(input.turn.rawText) ? input.actions.find((a) => a.action === "reopen_application") : undefined;',
'block stale reopen action reply');
  replaceOnce(arbiter,
'  const reopenRequest = /(?:ارجع|أرجع|اعيد|أعيد|اعاده|إعادة|افتح|أفتح|تفعيل).{0,35}(?:الطلب|المعامله|المعاملة|الملف)/.test(q);',
'  const reopenRequest = explicitReopenApplicationText(input.turn.rawText);',
'commercial file opening is not reopen');
  replaceAllExact(arbiter,'hasAuthoritativeMutationResult(input.actions)','hasAuthoritativeMutationResult(input.actions, input.turn)',2,'turn-scoped mutation result authority');
  replaceOnce(arbiter,
'authoritativeStopOrReopenReply({ actions: input.actions, truth: input.truth })',
'authoritativeStopOrReopenReply({ actions: input.actions, truth: input.truth, turn: input.turn })',
'turn-scoped stop/reopen reply');
  replaceOnce(arbiter,
`  if (pureGreetingTurnForArbiter(input.turn)) return "social_greeting";
  if (pureSocialClosureTurnForArbiter(input.turn)) return "social_closure";

  // Phase 11.7 precedence:`,
`  if (pureGreetingTurnForArbiter(input.turn)) return "social_greeting";
  if (pureSocialClosureTurnForArbiter(input.turn)) return "social_closure";

  // Phase 11.9.1: fresh literal customer text clears stale journey/media obligations.
  // These are answer-only questions; destructive mutations still keep their own confirmation gate.
  if (asksOperationalCalendarQuestion(input.turn.rawText)) return "operational_calendar";
  if (asksFeeDocumentQuestion(input.turn.rawText)) return "fee_document_question";
  if (asksRequirementsQuestion(input.turn)) return "requirements_question";
  if (asksFeeQuestion(input.turn.rawText)) return "fee_question";
  if (asksPickupDelivery(input.turn.rawText)) return "pickup_delivery";
  if (asksApprovalStatus(input.turn.rawText)) return "approval_status";
  if (asksReviewTiming(input.turn.rawText, input.turn)) return "review_timing";

  // Phase 11.7 precedence:`,
'fresh explicit current-turn precedence');
  replaceBlock(arbiter,
'function asksPickupDelivery(value: string | null | undefined) {',
'\n\nfunction asksPostPaymentNextStep',
`function asksPickupDelivery(value: string | null | undefined) {
  const q = n(value);
  return /(?:يوجد|في|عندكم).{0,15}(?:توصيل|دليفري)|(?:التوصيل|توصيل).{0,20}(?:موجود|في|عندكم|ولا)|(?:الاستلام).{0,20}(?:توصيل|مكتب)/.test(q)
    || /(?:متى|امتى|قديش|كم|ليش).{0,35}(?:استلم|الاستلام|التسليم)|(?:استلم|الاستلام|التسليم).{0,35}(?:متى|امتى|بعد\\s+شهر|شهر|قديش|كم|ليش)/.test(q);
}`,
'pickup timing current-question authority');
  replaceBlock(arbiter,
'function pickupDeliveryReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {',
'\n\nfunction postPaymentNextStepReply',
`function pickupDeliveryReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {
  const q = n(input.turn.rawText);
  const requirements = /(?:الاوراق|الأوراق|الوثائق|الهويه|الهوية|اثبات\\s+الدخل|إثبات\\s+الدخل)/.test(q)
    ? \\`${'${input.truth.policy.requirementsGuidanceRule} '}\\`
    : "";
  const device = String(input.truth.application?.deviceName || "");
  const iphone18 = /(?:iphone|ايفون|آيفون)\\s*18\\b/i.test(String(input.turn.rawText || "")) || /(?:iphone|ايفون|آيفون)\\s*18\\b/i.test(device);
  if (iphone18) return \\`${'${requirements}${input.truth.policy.iphone18PickupRule} ${input.truth.policy.officeOperationRule}'}\\`;
  return \\`${'${requirements}ما في توصيل. الاستلام من المكتب فقط وبموعد رسمي مؤكد بعد استحقاق مرحلة الاستلام. ${input.truth.policy.officeOperationRule}'}\\`;
}`,
'calendar-aware pickup reply');
  replaceOnce(arbiter,
'  const window = input.truth.policy.normalReviewWindow || "من يومين لـ3 أيام عمل";',
'  const window = input.truth.policy.normalReviewWindow || "من يومين لـ3 أيام تشغيلية؛ الجمعة والسبت لا تُحتسبان ولا تُنفذ فيهما دراسة";',
'calendar-aware review window');
  replaceOnce(arbiter,
'    case "refund_process_problem": return refundProcessProblemReply(input.truth);\n    case "review_timing": return reviewTimingReply({ turn, truth: input.truth });',
'    case "refund_process_problem": return refundProcessProblemReply(input.truth);\n    case "operational_calendar": return operationalCalendarReply({ turn, truth: input.truth });\n    case "review_timing": return reviewTimingReply({ turn, truth: input.truth });',
'operational calendar reply dispatch');
  replaceOnce(arbiter,
'    case "fee_question": return feeQuestionReply({ turn, truth: input.truth });',
'    case "fee_document_question": return feeDocumentQuestionReply();\n    case "fee_question": return feeQuestionReply({ turn, truth: input.truth });',
'fee document reply dispatch');

  replaceOnce(targets[3],
'  return /(?:فاهم|معك\\s+حق|مقدّر|مقدر|بعرف\\s+إن|بعرف\\s+ان|واضح\\s+إنك|واضح\\s+انك|ولا\\s+يهمك|ما\\s+أزعجتني|ما\\s+ازعجتني|إن\\s+شاء\\s+الله\\s+خير|ان\\s+شاء\\s+الله\\s+خير|الثقه\\s+اهتزت|الثقة\\s+اهتزت)/.test(q);',
'  return /(?:فاهم|مفهوم\\s+إنك|مفهوم\\s+انك|معك\\s+حق|مقدّر|مقدر|بعرف\\s+إن|بعرف\\s+ان|واضح\\s+إنك|واضح\\s+انك|ولا\\s+يهمك|ما\\s+أزعجتني|ما\\s+ازعجتني|إن\\s+شاء\\s+الله\\s+خير|ان\\s+شاء\\s+الله\\s+خير|الثقه\\s+اهتزت|الثقة\\s+اهتزت)/.test(q);',
'prevent stacked human-care acknowledgement');

  const detailFile=targets[4];
  replaceOnce(detailFile,
'import { currentFileOpeningPaymentRule } from "@/app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride";',
'import { currentFileOpeningPaymentRule } from "@/app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride";\nimport { addOneCalendarMonthOperational, isIphone18Device, isOperationalDate, jordanDateKey } from "@/app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar";',
'admin operational calendar import');
  replaceOnce(detailFile,
'مدة المراجعة المتوقعة: من 24 إلى 72 ساعة من وقت تأكيد الدفع.',
'مدة المراجعة المتوقعة: من يومين إلى 3 أيام تشغيلية من وقت تأكيد الدفع. الجمعة والسبت لا تُحتسبان ضمن أيام الدراسة ولا تُنفذ فيهما مراجعة.',
'admin review message uses operational days');
  replaceOnce(detailFile,
`    revalidatePath("/admin");
    revalidatePath(\`/admin/applications/${'${applicationId}'}\`);

    redirect(\`/admin/applications/${'${applicationId}'}?status=success\`);`,
`    if (nextStatus === "approved" && String(app.status || "").toLowerCase() !== "approved") {
      const approvalRecordedAt = new Date().toISOString();
      const { error: approvalLedgerError } = await supabaseAdmin
        .from("whatsapp_v3_notification_ledger")
        .insert({
          dedupe_key: \\`final_approval_recorded:${'${applicationId}'}:${'${approvalRecordedAt}'}\\`,
          event_type: "final_approval_recorded",
          application_id: applicationId,
          wa_id: normalizeJordanPhoneForWhatsApp(preferredWhatsAppPhone) || null,
          severity: "info",
          payload: { trackingId: app.tracking_id || null, deviceName: app.device_name || null, source: "admin_status_approved" },
          status: "sent",
          sent_at: approvalRecordedAt,
        });
      if (approvalLedgerError) console.error("Failed to record final approval calendar event:", approvalLedgerError);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/operations-calendar");
    revalidatePath(\`/admin/applications/${'${applicationId}'}\`);

    redirect(\`/admin/applications/${'${applicationId}'}?status=success\`);`,
'persist final approval timestamp');
  replaceBlock(detailFile,
'  async function sendApprovedWithCustomDateAction(formData: FormData) {',
'\n\n  const hasWhatsAppPhone',
`  async function sendApprovedWithCustomDateAction(formData: FormData) {
    "use server";

    const pickupDate = String(formData.get("pickup_date") || "").trim();
    if (!pickupDate) redirect(\`/admin/applications/${'${app.id}'}\`);
    if (String(app.status || "").toLowerCase() !== "approved") redirect(\`/admin/applications/${'${app.id}'}?pickup=requires-final-approval\`);

    const pickupDateTime = new Date(\`${'${pickupDate}'}T12:00:00+03:00\`);
    if (Number.isNaN(pickupDateTime.getTime())) redirect(\`/admin/applications/${'${app.id}'}?pickup=invalid-date\`);
    if (!isOperationalDate(pickupDateTime)) redirect(\`/admin/applications/${'${app.id}'}?pickup=weekend-blocked\`);

    if (isIphone18Device(app.device_name)) {
      const { data: approvalEvent } = await supabaseAdmin
        .from("whatsapp_v3_notification_ledger")
        .select("created_at")
        .eq("application_id", app.id)
        .eq("event_type", "final_approval_recorded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!approvalEvent?.created_at) redirect(\`/admin/applications/${'${app.id}'}?pickup=approval-date-missing\`);
      const earliest = addOneCalendarMonthOperational(approvalEvent.created_at);
      const pickupKey = jordanDateKey(pickupDateTime);
      const earliestKey = jordanDateKey(earliest);
      if (!pickupKey || !earliestKey || pickupKey < earliestKey) redirect(\`/admin/applications/${'${app.id}'}?pickup=iphone18-too-early\`);
    }

    redirect(makeWhatsAppUrl(preferredWhatsAppPhone, approvedMessage(app, pickupDate)));
  }`,
'guard appointment/delivery calendar');

  console.log('\n=== PHASE 11.9.1 OPERATIONAL CALENDAR SELFTEST ===');run('node',[created[2],root]);
  console.log('\n=== PHASE 11.9 HUMAN CARE REGRESSION ===');run('node',['scripts/v3-phase11-9-final-conversation-integrity-selftest.cjs',root]);
  console.log('\n=== PHASE 11.7.1 CURRENT-TURN REGRESSION ===');run('node',['scripts/v3-phase11-7-1-turn-scoped-authority-finalization-selftest.cjs',root]);
  console.log('\n=== PAYMENT FUNNEL FREEZE GATE ===');run('node',['scripts/v3-phase11-8-0-payment-funnel-control-plane-selftest.cjs',root]);
  console.log('\n=== BUILD ===');if(process.platform==='win32'){run(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',['/d','/s','/c','npm run build']);}else{run('npm',['run','build']);}run('git',['diff','--check']);
  for(const rel of protectedFiles){if(fileHash(rel)!==protectedHash[rel])throw new Error(`PAYMENT FUNNEL FREEZE VIOLATION: ${rel}`)}
  for(let i=0;i<paymentBlocks.length;i++){const [s,e]=paymentBlocks[i];if(blockHash(detail,s,e)!==protectedPaymentBlockHash[i])throw new Error(`PAYMENT MESSAGE BLOCK CHANGED: ${s}`)}
  console.log('\n================================================');console.log('PASS - PHASE 11.9.1 OPERATIONAL CALENDAR INTEGRITY');console.log('PAYMENT FUNNEL FREEZE: PASS / UNCHANGED');console.log('FRIDAY/SATURDAY GUARD: PASS');console.log('IPHONE 18 DELIVERY CALENDAR: PASS');console.log('================================================');console.log(`Backup: ${backup}`);console.log('\nChanged files:');console.log(run('git',['status','--short','--',...targets,...created],{capture:true}));
}catch(err){console.error('\nFAILED - ROLLING BACK PHASE 11.9.1...');rollback();console.error(err&&err.stack?err.stack:String(err));process.exit(1)}
