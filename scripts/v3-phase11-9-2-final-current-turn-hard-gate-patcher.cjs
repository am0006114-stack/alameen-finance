const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=process.argv[2]||process.cwd();process.chdir(root);
const EXPECTED='16597dc34bcadfd08713830bafd0a79ff0f25810';
const BRANCH='phase11.9.2-final-current-turn-hard-gate';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(cmd+' '+args.join(' ')+' failed'+(r.stderr?': '+String(r.stderr).trim():''));return opts.capture?String(r.stdout||'').trim():''}
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8').replace(/\r\n/g,'\n').replace(/\r/g,'\n')}
function write(rel,value){const abs=path.join(root,rel);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,value,{encoding:'utf8'})}
function gitShow(rel){return cp.execFileSync('git',['show','origin/'+BRANCH+':'+rel],{cwd:root,encoding:'utf8'})}
function replaceOnce(rel,oldText,newText,label){const src=read(rel);const first=src.indexOf(oldText);if(first<0)throw new Error(label+': anchor missing in '+rel);if(src.indexOf(oldText,first+oldText.length)>=0)throw new Error(label+': anchor not unique in '+rel);write(rel,src.slice(0,first)+newText+src.slice(first+oldText.length))}
function replaceBlock(rel,start,end,replacement,label){const src=read(rel);const s=src.indexOf(start);if(s<0)throw new Error(label+': start anchor missing in '+rel);const e=src.indexOf(end,s+start.length);if(e<0)throw new Error(label+': end anchor missing in '+rel);write(rel,src.slice(0,s)+replacement+src.slice(e))}
function statusFor(files){return run('git',['status','--porcelain','--',...files],{capture:true})}
const arb='app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts';
const human='app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts';
const targets=[arb,human];
const created=['scripts/v3-phase11-9-2-final-current-turn-hard-gate-selftest.cjs','scripts/v3-phase11-9-2-current-turn-production-cases-selftest.cjs'];
const protectedFiles=[
'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',
'app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts',
'app/api/continue-decision/route.ts',
'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
'app/admin/page.tsx',
'app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar.ts',
'app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts',
'app/api/whatsapp/webhook/_lib/v3-os/policy.ts',
'app/admin/operations-calendar/page.tsx',
'app/admin/applications/[id]/page.tsx',
'app/api/cron/preliminary-approval/route.ts'
];
const head=run('git',['rev-parse','HEAD'],{capture:true});if(head!==EXPECTED)throw new Error('STOP: expected HEAD '+EXPECTED+', found '+head);
const dirty=statusFor([...targets,...protectedFiles,...created]);if(dirty)throw new Error('STOP: target/protected files have local changes:\n'+dirty);
for(const rel of created)if(fs.existsSync(path.join(root,rel)))throw new Error('STOP: Phase 11.9.2 file already exists: '+rel);
const expectedTargetBlobs={[arb]:'d4320296b5a02a24759a4b1b843e5f39678b11b0',[human]:'01de2bd442e3b3be6f5f0add825852ceb9796a64'};
for(const rel of targets){const blob=run('git',['rev-parse','HEAD:'+rel],{capture:true});if(blob!==expectedTargetBlobs[rel])throw new Error('STOP: unexpected baseline blob for '+rel+': '+blob)}
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);const backup=path.join(process.env.USERPROFILE||root,'.alameen-backups','before-v3-phase11-9-2-final-current-turn-hard-gate-'+stamp);fs.mkdirSync(backup,{recursive:true});for(const rel of targets){const dst=path.join(backup,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,rel),dst)}
function rollback(){for(const rel of targets){const src=path.join(backup,rel);if(fs.existsSync(src)){fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.copyFileSync(src,path.join(root,rel))}}for(const rel of created){try{fs.rmSync(path.join(root,rel),{force:true})}catch{}}}
try{
  for(const rel of created)write(rel,gitShow(rel));

  const arbiterFragment=gitShow('scripts/phase11-9-2-fragments/arbiter-hard-current-turn.tsfrag').trimEnd();
  replaceOnce(arb,'function hasAuthoritativeMutationResult(actions: ActionResult[], turn?: InterpretedTurn) {',arbiterFragment+'\n\nfunction hasAuthoritativeMutationResult(actions: ActionResult[], turn?: InterpretedTurn) {','insert hard current-turn authority');
  replaceOnce(arb,'    || /(?:بدي|حاب|اريد|أريد)?\\s*(?:افتح|أفتح|فتح).{0,8}(?:الطلب|طلب)(?:\\s|$)/.test(q)','    || /(?:بدي|حاب|اريد|أريد)\\s*(?:افتح|أفتح|فتح).{0,8}(?:الطلب|طلب)(?:\\s|$)/.test(q)','tighten arbiter reopen intent');
  replaceOnce(arb,'  const operation = /(?:دراسه|دراسة|مراجعه|مراجعة|موعد|مواعيد|استلام|تسليم|حضور|دوام|تاجيل|تأجيل|يتحسب|ينحسب|تحسب|ايام|أيام)/.test(q);','  const operation = /(?:دراسه|دراسة|مراجعه|مراجعة|موعد|مواعيد|استلام|تسليم|حضور|دوام|تاجيل|تأجيل|اجلت|أجلت|يتحسب|ينحسب|تحسب|ايام|أيام|يوم|الاحد|الأحد)/.test(q);','route implicit weekend reschedule question');

  replaceOnce(arb,'    || genericCurrentQuestionDeflection(reply);','    || genericCurrentQuestionDeflection(reply)\n    || candidateHasUnsupportedBusinessClaimForArbiter(reply);','reject unsupported business claims');

  const hardGateAnchor='  if (meaningLock.kind !== "none" && !currentQuestionFirst.has(obligation) && !candidateAlignedWithLockedMeaning({ meaning: meaningLock, candidate })) {';
  const hardGate=`  const hardCurrentTurn = hardCurrentTurnReplyForArbiter({ turn: input.turn, state: input.state, truth: input.truth, actions: input.actions });\n  if (hardCurrentTurn) {\n    const hardReply = hardCurrentTurn.reply ? sanitizeUnifiedEgressReply(hardCurrentTurn.reply) : null;\n    return { reply: hardReply, obligation, repaired: hardReply !== candidate, suppressed: hardCurrentTurn.suppress || undefined, reason: hardCurrentTurn.reason };\n  }\n  if (candidateHasUnsupportedBusinessClaimForArbiter(candidate)) {\n    const safeRepair = directRepair({ obligation, turn: input.turn, state: input.state, truth: input.truth, actions: input.actions });\n    const safeReply = safeRepair ? sanitizeUnifiedEgressReply(safeRepair) : null;\n    return { reply: safeReply, obligation, repaired: true, suppressed: !safeReply || undefined, reason: "unsupported business/social/license claim blocked at final egress" };\n  }\n\n`;
  replaceOnce(arb,hardGateAnchor,hardGate+hardGateAnchor,'insert final current-turn hard gate');

  replaceOnce(arb,'  if (!app) return `${window} هو المعدل الطبيعي للمراجعة، لكن ${pressure} ما بقدر أعطي موعد محدد بدون حالة طلب موثقة.`;','  if (!app) return `${window}. ${pressure} ما بقدر أعطي موعد محدد بدون حالة طلب موثقة.`;','remove duplicated review-window wording');

  const humanFragment=gitShow('scripts/phase11-9-2-fragments/human-os-hard-current-turn.tsfrag').trimEnd();
  replaceOnce(human,'function explicitReopenApplicationTextForHumanOs(value: string | null | undefined) {',humanFragment+'\n\nfunction explicitReopenApplicationTextForHumanOs(value: string | null | undefined) {','insert Human OS typo/reopen hard gate');
  replaceOnce(human,'    || /(?:بدي|حاب|اريد|أريد)?\\s*(?:افتح|أفتح|فتح).{0,8}(?:الطلب|طلب)(?:\\s|$)/.test(q)','    || /(?:بدي|حاب|اريد|أريد)\\s*(?:افتح|أفتح|فتح).{0,8}(?:الطلب|طلب)(?:\\s|$)/.test(q)','tighten Human OS reopen intent');

  replaceOnce(human,'  if (contextualContinuation) turn = makeDeterministicContinuationTurn(turn);','  if (contextualContinuation || typoContinuationTextForHumanOs(input.customerText)) turn = makeDeterministicContinuationTurn(turn);','normalize continuation typo before state and planning');
  replaceOnce(human,'  plan = vetoMisclassifiedCommercialFileReopen(plan, turn.rawText);','  plan = vetoMisclassifiedCommercialFileReopenV1192(vetoMisclassifiedCommercialFileReopen(plan, turn.rawText), turn.rawText);','veto file-opening reopen before Action Plane');
  replaceOnce(human,'  const continuationIntent = contextualContinuation || explicitContinuationText(input.customerText) || turn.semantic?.decision.continuation === "confirmed" || informedCommercialContinuationConfirmed({ state: reduced, truth: truthAfterActions, turn, customerText: input.customerText });','  const continuationIntent = contextualContinuation || explicitContinuationText(input.customerText) || typoContinuationTextForHumanOs(input.customerText) || turn.semantic?.decision.continuation === "confirmed" || informedCommercialContinuationConfirmed({ state: reduced, truth: truthAfterActions, turn, customerText: input.customerText });','continuation typo participates in commercial intent');

  const escalationStart='function explicitHumanEscalationRequest(turn: InterpretedTurn) {';
  const escalationEnd='\n\nasync function recordHumanEscalationReceipt';
  const escalationReplacement=`function explicitHumanEscalationRequest(turn: InterpretedTurn) {\n  const q = normalizeActionConfirmationText(turn.rawText);\n  if (!q) return false;\n  if (/(?:وين|حولني|حوّلني|حولوني|حوّلوني|بدي).{0,18}(?:عمران|عبدالله|عبدالرحمن|تالا|فدوة)|(?:حد|احد|أحد).{0,18}(?:الموظفين|الموظف)|(?:موظف|موضف).{0,16}(?:رسمي|حقيقي)|(?:خدمه|خدمة)\\s+(?:ال)?عملاء/.test(q)) return true;\n  return /(?:بدي|اريد|أريد|ممكن|لازم).{0,30}(?:موظف|موضف|مسؤول|مدير|شخص\\s+حقيقي|بني\\s+ادم|بني\\s+آدم|انسان|إنسان).{0,35}(?:احكي|اتفاهم|اتواصل|اتصل|يرد|معه|معها)?|(?:احكي|اتواصل|اتصل|رن).{0,25}(?:معي|علي|فيي|موظف|مسؤول|مدير)|(?:بدي|اريد|أريد).{0,25}(?:مكالمه|مكالمة|اتصال)/.test(q);\n}`;
  replaceBlock(human,escalationStart,escalationEnd,escalationReplacement,'expand durable human escalation request detection');

  console.log('\n=== PHASE 11.9.2 FINAL CURRENT-TURN HARD GATE SELFTEST ===');run('node',[created[0],root]);
  console.log('\n=== PHASE 11.9.2 PRODUCTION CASES SELFTEST ===');run('node',[created[1],root]);
  console.log('\n=== PHASE 11.9.1 OPERATIONAL CALENDAR REGRESSION ===');run('node',['scripts/v3-phase11-9-1-operational-calendar-integrity-selftest.cjs',root]);
  console.log('\n=== PHASE 11.9 HUMAN CARE REGRESSION ===');run('node',['scripts/v3-phase11-9-final-conversation-integrity-selftest.cjs',root]);
  console.log('\n=== PHASE 11.7.1 CURRENT-TURN REGRESSION ===');run('node',['scripts/v3-phase11-7-1-turn-scoped-authority-finalization-selftest.cjs',root]);
  console.log('\n=== PAYMENT FUNNEL FREEZE GATE ===');run('node',['scripts/v3-phase11-8-0-payment-funnel-control-plane-selftest.cjs',root]);
  console.log('\n=== BUILD ===');if(process.platform==='win32'){run(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',['/d','/s','/c','npm run build']);}else{run('npm',['run','build']);}run('git',['diff','--check']);
  const protectedDirty=statusFor(protectedFiles);if(protectedDirty)throw new Error('PROTECTED PAYMENT/CALENDAR/IPHONE18 CORE CHANGED:\n'+protectedDirty);
  console.log('\n================================================');
  console.log('PASS - PHASE 11.9.2 FINAL CURRENT-TURN HARD GATE');
  console.log('PAYMENT FUNNEL FREEZE: PASS / UNCHANGED');
  console.log('OPERATIONAL CALENDAR CORE: PASS / UNCHANGED');
  console.log('IPHONE 18 CALENDAR CORE: PASS / UNCHANGED');
  console.log('================================================');
  console.log('Backup: '+backup);
  console.log('\nChanged files:');console.log(statusFor([...targets,...created]));
}catch(err){console.error('\nFAILED - ROLLING BACK PHASE 11.9.2...');rollback();console.error(err&&err.stack?err.stack:String(err));process.exit(1)}
