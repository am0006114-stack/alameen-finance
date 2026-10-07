const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const root=process.argv[2]||process.cwd();
const branch='phase11.9.1-operational-calendar-integrity';
const patcherPath='scripts/v3-phase11-9-1-operational-calendar-integrity-patcher-v2.cjs';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(cmd+' '+args.join(' ')+' failed'+(r.stderr?': '+String(r.stderr).trim():''));return opts.capture?String(r.stdout||''):''}
function one(src,needle,replacement,label){const first=src.indexOf(needle);if(first<0)throw new Error(label+': anchor missing');if(src.indexOf(needle,first+needle.length)>=0)throw new Error(label+': anchor not unique');return src.slice(0,first)+replacement+src.slice(first+needle.length)}
let src=run('git',['show','origin/'+branch+':'+patcherPath],{capture:true});

// Windows-safe reads inside the temporary patcher only.
src=one(src,"function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}","function read(rel){return fs.readFileSync(path.join(root,rel),'utf8').replace(/\\r\\n/g,'\\n').replace(/\\r/g,'\\n')}",'patcher read helper');

// Extend the patcher's rollback/dirty-scope to the two additional files touched by 11.9.1.
const oldTargets="const targets=['app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts','app/api/whatsapp/webhook/_lib/v3-os/policy.ts','app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','app/api/whatsapp/webhook/_lib/v3-os/humanCarePolicy.ts','app/admin/applications/[id]/page.tsx','app/api/cron/preliminary-approval/route.ts'];";
const newTargets="const targets=['app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts','app/api/whatsapp/webhook/_lib/v3-os/policy.ts','app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','app/api/whatsapp/webhook/_lib/v3-os/humanCarePolicy.ts','app/admin/applications/[id]/page.tsx','app/api/cron/preliminary-approval/route.ts','app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','app/api/whatsapp/webhook/_lib/v3-os/answerObligations.ts'];";
src=one(src,oldTargets,newTargets,'target list');

// Preserve 11.7.1 precedence exactly. New 11.9.1 detectors must not run before AnswerBundle.
const pStart=src.indexOf('const precedenceNew=');
const pEndMarker="\nreplaceOnce(arbiter,precedenceOld,precedenceNew,'fresh explicit current-turn precedence');";
const pEnd=src.indexOf(pEndMarker,pStart);
if(pStart<0||pEnd<0)throw new Error('precedence patch anchors missing');
const safePrecedence="const precedenceNew='  if (pureGreetingTurnForArbiter(input.turn)) return \\\"social_greeting\\\";\\n  if (pureSocialClosureTurnForArbiter(input.turn)) return \\\"social_closure\\\";\\n\\n  // Phase 11.7 precedence:';";
src=src.slice(0,pStart)+safePrecedence+src.slice(pEnd);

const insertMarker="replaceOnce(arbiter,precedenceOld,precedenceNew,'fresh explicit current-turn precedence');\n";
const extra=`const humanOs=targets[6];
const obligations=targets[7];
const humanGuardFragment=gitShow('scripts/phase11-9-1-fragments/human-os-commercial-file-veto.tsfrag').trimEnd();
replaceOnce(humanOs,'const CUSTOMER_STATUS_REPLACEMENTS: Array<[RegExp, string]> = [',humanGuardFragment+'\\n\\nconst CUSTOMER_STATUS_REPLACEMENTS: Array<[RegExp, string]> = [','insert pre-action commercial-file/reopen veto');
replaceOnce(humanOs,'  plan = forceConfirmedPendingMutation(plan, { action: confirmedPendingMutation, state: stateWorking, turn });','  plan = forceConfirmedPendingMutation(plan, { action: confirmedPendingMutation, state: stateWorking, turn });\\n  plan = vetoMisclassifiedCommercialFileReopen(plan, turn.rawText);','veto misclassified reopen before Action Plane');

// Keep established AnswerBundle authority first; only genuinely new detectors are inserted after it.
const answerBundleAnchor='  const answerBundle = resolveAnswerBundle({ turn: input.turn, state: input.state, truth: input.truth });\\n  if (answerBundle.kind !== "none") return "answer_bundle";\\n';
const answerBundleFallbacks=answerBundleAnchor+
  '  if (asksOperationalCalendarQuestion(input.turn.rawText)) return "operational_calendar";\\n'+
  '  if (asksFeeDocumentQuestion(input.turn.rawText)) return "fee_document_question";\\n';
replaceOnce(arbiter,answerBundleAnchor,answerBundleFallbacks,'place 11.9.1-only detectors after answer bundle');

replaceOnce(obligations,'function officeHoursPart() {\\n  return "الجمعة والسبت عطلة تشغيلية للمكتب، بينما استقبال الطلبات والمتابعة الرقمية مستمران. ما عندي ساعات يومية موثقة لباقي الأيام أذكرها بدون تخمين، والحضور للمكتب بيكون فقط بموعد رسمي مؤكد.";\\n}','function officeHoursPart() {\\n  return "أيام الدراسة والتشغيل والمواعيد والتسليم هي الأحد إلى الخميس. الجمعة والسبت عطلة تشغيلية كاملة: لا تُحتسبان ضمن أيام الدراسة، ولا تُنفذ فيهما دراسة أو مراجعة أو تسليم، ولا يُعطى فيهما موعد حضور أو استلام. استقبال الطلبات والمتابعة الرقمية عبر الموقع وواتساب يستمران خلال العطلة.";\\n}','answer-bundle office-hours truth follows operational calendar');
replaceOnce(obligations,'    return "إذا الجهاز iPhone 18 Pro أو Pro Max، الاستلام يكون بعد شهر من الموافقة النهائية، ومن المكتب وبموعد رسمي مؤكد فقط؛ ما في توصيل.";','    return truth.policy.recentReleaseAvailabilityRule;','route iPhone 18 delivery answer through authoritative all-variants policy');

const cqOld='    "review_timing", "conditional_future_mutation", "requirements_question", "contract_terms_question", "current_question_contract", "application_status",';
const cqNew='    "operational_calendar", "fee_document_question", "fee_question", "pickup_delivery", "approval_status",\\n    "review_timing", "conditional_future_mutation", "requirements_question", "contract_terms_question", "current_question_contract", "application_status",';
replaceOnce(arbiter,cqOld,cqNew,'protect fresh calendar/fee/pickup questions from stale meaning locks');

const mediaOld='  const currentHumanTurn = resolveCurrentHumanTurnAuthority({ turn: input.turn, state: input.state, truth: input.truth });\\n  const currentQuestionFirst = new Set<ResponseObligation>([';
const mediaNew='  const currentHumanTurn = resolveCurrentHumanTurnAuthority({ turn: input.turn, state: input.state, truth: input.truth });\\n\\n  // Phase 11.9.1: a new text turn immediately expires stale media authority.\\n  if (staleMediaCandidateOnTextTurn(input.turn, candidate)) {\\n    const repair = staleMediaTextTurnRepair({ turn: input.turn, state: input.state, truth: input.truth });\\n    return { reply: sanitizeUnifiedEgressReply(repair), obligation: "current_question_contract", repaired: repair !== candidate, reason: "new text turn expired stale media authority before human-turn arbitration" };\\n  }\\n\\n  const currentQuestionFirst = new Set<ResponseObligation>([';
replaceOnce(arbiter,mediaOld,mediaNew,'expire stale media before human-turn arbitration');

const responsiveOld='  const stage = applicationJourneyStage(input.truth.application);\\n  switch (input.obligation) {';
const responsiveNew='  const stage = applicationJourneyStage(input.truth.application);\\n  if (["operational_calendar", "fee_document_question", "review_timing", "pickup_delivery"].includes(input.obligation)) return false;\\n  switch (input.obligation) {';
replaceOnce(arbiter,responsiveOld,responsiveNew,'force deterministic calendar/timing/pickup replies');
`;
src=one(src,insertMarker,insertMarker+extra,'post-precedence compatibility injection');

// Make the legacy gate diagnostic: if it fails, print the exact FAIL lines once.
const legacyLine="console.log('\\n=== PHASE 11.7.1 CURRENT-TURN REGRESSION ===');run('node',['scripts/v3-phase11-7-1-turn-scoped-authority-finalization-selftest.cjs',root]);";
const legacyDiag=`console.log('\\n=== PHASE 11.7.1 CURRENT-TURN REGRESSION ===');{const lr=cp.spawnSync('node',['scripts/v3-phase11-7-1-turn-scoped-authority-finalization-selftest.cjs',root],{cwd:root,encoding:'utf8'});process.stdout.write(lr.stdout||'');process.stderr.write(lr.stderr||'');if(lr.status!==0){const all=String(lr.stdout||'')+'\\n'+String(lr.stderr||'');console.error('\\n=== EXACT 11.7.1 FAILURES ===');for(const line of all.split(/\\r?\\n/))if(line.startsWith('FAIL:'))console.error(line);throw new Error('11.7.1 regression failed');}}`;
src=one(src,legacyLine,legacyDiag,'legacy diagnostic gate');

const tmp=path.join(os.tmpdir(),'alameen-phase11-9-1-operational-calendar-integrity-patcher-v3-generated.cjs');
fs.writeFileSync(tmp,src,{encoding:'utf8'});
run(process.execPath,['--check',tmp]);
run(process.execPath,[tmp,root]);
