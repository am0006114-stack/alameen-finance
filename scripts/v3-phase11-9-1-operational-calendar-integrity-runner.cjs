const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const root=process.argv[2]||process.cwd();
const branch='phase11.9.1-operational-calendar-integrity';
const patcherPath='scripts/v3-phase11-9-1-operational-calendar-integrity-patcher-v2.cjs';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(cmd+' '+args.join(' ')+' failed'+(r.stderr?': '+String(r.stderr).trim():''));return opts.capture?String(r.stdout||''):''}
let src=run('git',['show','origin/'+branch+':'+patcherPath],{capture:true});
const oldTargets="const targets=['app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts','app/api/whatsapp/webhook/_lib/v3-os/policy.ts','app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','app/api/whatsapp/webhook/_lib/v3-os/humanCarePolicy.ts','app/admin/applications/[id]/page.tsx','app/api/cron/preliminary-approval/route.ts'];";
const newTargets="const targets=['app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts','app/api/whatsapp/webhook/_lib/v3-os/policy.ts','app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','app/api/whatsapp/webhook/_lib/v3-os/humanCarePolicy.ts','app/admin/applications/[id]/page.tsx','app/api/cron/preliminary-approval/route.ts','app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts'];";
if(!src.includes(oldTargets))throw new Error('runner precheck failed: target list anchor missing');
src=src.replace(oldTargets,newTargets);
const testAnchor="console.log('\\n=== PHASE 11.9.1 OPERATIONAL CALENDAR SELFTEST ===');";
if(!src.includes(testAnchor))throw new Error('runner precheck failed: test anchor missing');
const extra=`const humanOs=targets[6];
const humanGuardFragment=gitShow('scripts/phase11-9-1-fragments/human-os-commercial-file-veto.tsfrag').trimEnd();
replaceOnce(humanOs,'const CUSTOMER_STATUS_REPLACEMENTS: Array<[RegExp, string]> = [',humanGuardFragment+'\\n\\nconst CUSTOMER_STATUS_REPLACEMENTS: Array<[RegExp, string]> = [','insert pre-action commercial-file/reopen veto');
replaceOnce(humanOs,'  plan = forceConfirmedPendingMutation(plan, { action: confirmedPendingMutation, state: stateWorking, turn });','  plan = forceConfirmedPendingMutation(plan, { action: confirmedPendingMutation, state: stateWorking, turn });\\n  plan = vetoMisclassifiedCommercialFileReopen(plan, turn.rawText);','veto misclassified reopen before Action Plane');
const cqOld='    "review_timing", "conditional_future_mutation", "requirements_question", "contract_terms_question", "current_question_contract", "application_status",';
const cqNew='    "operational_calendar", "fee_document_question", "fee_question", "pickup_delivery", "approval_status",\\n    "review_timing", "conditional_future_mutation", "requirements_question", "contract_terms_question", "current_question_contract", "application_status",';
replaceOnce(arbiter,cqOld,cqNew,'protect fresh calendar/fee/pickup questions from stale meaning locks');

`;
src=src.replace(testAnchor,extra+testAnchor);
const tmp=path.join(os.tmpdir(),'alameen-phase11-9-1-operational-calendar-integrity-patcher-final.cjs');
fs.writeFileSync(tmp,src,{encoding:'utf8'});
run(process.execPath,['--check',tmp]);
run(process.execPath,[tmp,root]);
