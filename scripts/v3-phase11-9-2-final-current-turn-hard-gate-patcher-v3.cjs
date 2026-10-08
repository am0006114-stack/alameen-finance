const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=process.argv[2]||process.cwd();
const BRANCH='phase11.9.2-final-current-turn-hard-gate';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(cmd+' '+args.join(' ')+' failed'+(r.stderr?': '+String(r.stderr).trim():''));return opts.capture?String(r.stdout||''):''}
const original=cp.execFileSync('git',['show','origin/'+BRANCH+':scripts/v3-phase11-9-2-final-current-turn-hard-gate-patcher.cjs'],{cwd:root,encoding:'utf8'});
const anchor="  replaceOnce(arb,'    || genericCurrentQuestionDeflection(reply);','    || genericCurrentQuestionDeflection(reply)\\n    || candidateHasUnsupportedBusinessClaimForArbiter(reply);','reject unsupported business claims');";
if(!original.includes(anchor))throw new Error('v3 precheck failed: patcher insertion anchor missing');
const earlyReceiptPatch=String.raw`
  const staleMediaAnchor='  // Phase 11.9.1: a new text turn immediately expires stale media authority.';
  const earlyReceiptGuard='  // Phase 11.9.2: an explicit text clarification that the prior image is a payment receipt owns the turn before stale-media repair.\\n  if (directReceiptClarificationForArbiter(input.turn.rawText)) {\\n    const receiptTurn = { ...input.turn, topics: Array.from(new Set([...input.turn.topics, "payment_fee", "receipt_upload"])) as InterpretedTurn["topics"] };\\n    const receiptLinks = buildOfficialLinkContext(receiptTurn, input.truth);\\n    const receiptUrl = receiptLinks.relevant.receipt;\\n    const receiptReply = "فهمت: الصورة/الرسالة اللي تقصدها هي إثبات حوالة CliQ. ما رح أعتبر الدفع مؤكد من صورة واتساب وحدها. ارفع الوصل من المسار الرسمي" + (receiptUrl ? ":\\\\n" + receiptUrl : " المرتبط بطلبك") + " وبعدها يعتمد الدفع إداريًا.";\\n    return { reply: sanitizeUnifiedEgressReply(receiptReply), obligation: "current_question_contract", repaired: receiptReply !== candidate, reason: "fresh receipt clarification precedes stale-media and payment locks" };\\n  }\\n\\n';
  replaceOnce(arb,staleMediaAnchor,earlyReceiptGuard+staleMediaAnchor,'place receipt clarification before stale-media guard');
`;
const patched=original.replace(anchor,anchor+earlyReceiptPatch);
if(patched===original)throw new Error('v3 transformation produced no change');
const tmp=path.join(process.env.TEMP||require('os').tmpdir(),'alameen-v3-phase11-9-2-inner-patcher-v3.cjs');
fs.writeFileSync(tmp,patched,'utf8');
run(process.execPath,['--check',tmp]);
run(process.execPath,[tmp,root]);
