const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=process.argv[2]||process.cwd();
const BRANCH='phase11.9.2-final-current-turn-hard-gate';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(cmd+' '+args.join(' ')+' failed'+(r.stderr?': '+String(r.stderr).trim():''));return opts.capture?String(r.stdout||''):''}
const original=cp.execFileSync('git',['show','origin/'+BRANCH+':scripts/v3-phase11-9-2-final-current-turn-hard-gate-patcher.cjs'],{cwd:root,encoding:'utf8'});
const anchor="  replaceOnce(arb,'    || genericCurrentQuestionDeflection(reply);','    || genericCurrentQuestionDeflection(reply)\\n    || candidateHasUnsupportedBusinessClaimForArbiter(reply);','reject unsupported business claims');";
if(!original.includes(anchor))throw new Error('final precheck failed: patcher insertion anchor missing');
const insertion=String.raw`
  const earlyReceiptAuthority=gitShow('scripts/phase11-9-2-fragments/early-receipt-authority.tsfrag').trimEnd();
  replaceOnce(arb,'  // Phase 11.9.1: a new text turn immediately expires stale media authority.',earlyReceiptAuthority+'\n\n  // Phase 11.9.1: a new text turn immediately expires stale media authority.','place receipt clarification before stale-media guard');
`;
const patched=original.replace(anchor,anchor+insertion);
if(patched===original)throw new Error('final transformation produced no change');
const tmp=path.join(process.env.TEMP||require('os').tmpdir(),'alameen-v3-phase11-9-2-inner-patcher-final.cjs');
fs.writeFileSync(tmp,patched,'utf8');
run(process.execPath,['--check',tmp]);
run(process.execPath,[tmp,root]);
