const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const root=process.argv[2]||process.cwd();
const branch='phase11.9.1-operational-calendar-integrity';
const baseRunner='scripts/v3-phase11-9-1-operational-calendar-integrity-runner.cjs';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(cmd+' '+args.join(' ')+' failed'+(r.stderr?': '+String(r.stderr).trim():''));return opts.capture?String(r.stdout||''):''}
let src=run('git',['show','origin/'+branch+':'+baseRunner],{capture:true});

// Replace the previous selective compatibility shim with a complete one:
// every new 11.9.1 deterministic question detector is a fallback AFTER the
// established 11.7.1 answer bundle. This preserves all historical contracts.
const oldCompat=`// Phase 11.9.1 must not replace established 11.7.1 answer-bundle ownership for
// ordinary delivery/review questions. The new guards remain deterministic
// fallbacks, while answerBundle continues to own questions it already understands.
const earlyPickup='  if (asksPickupDelivery(input.turn.rawText)) return "pickup_delivery";\\n';
const earlyReview='  if (asksReviewTiming(input.turn.rawText, input.turn)) return "review_timing";\\n';
if(!src.includes(earlyPickup))throw new Error('runner precheck failed: early pickup precedence anchor missing');
if(!src.includes(earlyReview))throw new Error('runner precheck failed: early review precedence anchor missing');
src=src.replace(earlyPickup,'');
src=src.replace(earlyReview,'');
`;
const newCompat=`// Phase 11.9.1 compatibility: established AnswerBundle owns every question it
// already understands. New calendar/fee/pickup/status detectors are fallbacks only.
const earlyChecks=[
  '  if (asksOperationalCalendarQuestion(input.turn.rawText)) return "operational_calendar";\\n',
  '  if (asksFeeDocumentQuestion(input.turn.rawText)) return "fee_document_question";\\n',
  '  if (asksRequirementsQuestion(input.turn)) return "requirements_question";\\n',
  '  if (asksFeeQuestion(input.turn.rawText)) return "fee_question";\\n',
  '  if (asksPickupDelivery(input.turn.rawText)) return "pickup_delivery";\\n',
  '  if (asksApprovalStatus(input.turn.rawText)) return "approval_status";\\n',
  '  if (asksReviewTiming(input.turn.rawText, input.turn)) return "review_timing";\\n',
];
for(const check of earlyChecks){if(!src.includes(check))throw new Error('runner precheck failed: early 11.9.1 precedence anchor missing: '+check.trim());src=src.replace(check,'');}
`;
if(!src.includes(oldCompat))throw new Error('v2 precheck failed: previous compatibility block missing');
src=src.replace(oldCompat,newCompat);

const extraNeedle=`replaceOnce(obligations,'    return "إذا الجهاز iPhone 18 Pro أو Pro Max، الاستلام يكون بعد شهر من الموافقة النهائية، ومن المكتب وبموعد رسمي مؤكد فقط؛ ما في توصيل.";','    return truth.policy.recentReleaseAvailabilityRule;','route iPhone 18 delivery answer through authoritative all-variants policy');\n`;
if(!src.includes(extraNeedle))throw new Error('v2 precheck failed: obligations patch anchor missing');
const fallbackPatch=`const answerBundleAnchor='  const answerBundle = resolveAnswerBundle({ turn: input.turn, state: input.state, truth: input.truth });\\n  if (answerBundle.kind !== "none") return "answer_bundle";\\n';
const answerBundleFallbacks=answerBundleAnchor+
  '  // Phase 11.9.1 fallbacks: only after the established answer bundle declines the turn.\\n'+
  '  if (asksOperationalCalendarQuestion(input.turn.rawText)) return "operational_calendar";\\n'+
  '  if (asksFeeDocumentQuestion(input.turn.rawText)) return "fee_document_question";\\n'+
  '  if (asksRequirementsQuestion(input.turn)) return "requirements_question";\\n'+
  '  if (asksFeeQuestion(input.turn.rawText)) return "fee_question";\\n'+
  '  if (asksPickupDelivery(input.turn.rawText)) return "pickup_delivery";\\n'+
  '  if (asksApprovalStatus(input.turn.rawText)) return "approval_status";\\n'+
  '  if (asksReviewTiming(input.turn.rawText, { ...input.turn, topics: [] })) return "review_timing";\\n';
replaceOnce(arbiter,answerBundleAnchor,answerBundleFallbacks,'place 11.9.1 explicit detectors after answer bundle');
replaceOnce(obligations,'function officeHoursPart() {\\n  return "الجمعة والسبت عطلة تشغيلية للمكتب، بينما استقبال الطلبات والمتابعة الرقمية مستمران. ما عندي ساعات يومية موثقة لباقي الأيام أذكرها بدون تخمين، والحضور للمكتب بيكون فقط بموعد رسمي مؤكد.";\\n}','function officeHoursPart() {\\n  return "أيام الدراسة والتشغيل والمواعيد والتسليم هي الأحد إلى الخميس. الجمعة والسبت عطلة تشغيلية كاملة: لا تُحتسبان ضمن أيام الدراسة، ولا تُنفذ فيهما دراسة أو مراجعة أو تسليم، ولا يُعطى فيهما موعد حضور أو استلام. استقبال الطلبات والمتابعة الرقمية عبر الموقع وواتساب يستمران خلال العطلة.";\\n}','answer-bundle office-hours truth follows operational calendar');
`;
src=src.replace(extraNeedle,extraNeedle+fallbackPatch);

// If the legacy regression fails, print only its FAIL lines prominently before rollback.
const testNeedle=`run(process.execPath,['scripts/v3-phase11-7-1-turn-scoped-authority-finalization-selftest.cjs',root]);`;
if(src.includes(testNeedle)){
  const diag=`{const legacy=cp.spawnSync(process.execPath,['scripts/v3-phase11-7-1-turn-scoped-authority-finalization-selftest.cjs',root],{cwd:root,encoding:'utf8'});process.stdout.write(legacy.stdout||'');process.stderr.write(legacy.stderr||'');if(legacy.status!==0){const all=String(legacy.stdout||'')+'\\n'+String(legacy.stderr||'');const fails=all.split(/\\r?\\n/).filter(x=>x.startsWith('FAIL:'));console.error('\\n=== EXACT 11.7.1 FAILURES ===');for(const f of fails)console.error(f);throw new Error('11.7.1 regression failed');}}`;
  src=src.replace(testNeedle,diag);
}

const tmp=path.join(os.tmpdir(),'alameen-phase11-9-1-operational-calendar-integrity-runner-v2-generated.cjs');
fs.writeFileSync(tmp,src,{encoding:'utf8'});
run(process.execPath,['--check',tmp]);
run(process.execPath,[tmp,root]);
