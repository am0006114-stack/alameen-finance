const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const root=process.argv[2]||process.cwd();
const branch='phase11.9-final-conversation-integrity-human-care';
const patcherPath='scripts/v3-phase11-9-final-conversation-integrity-patcher.cjs';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed${r.stderr?`: ${String(r.stderr).trim()}`:''}`);return opts.capture?String(r.stdout||''):''}
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
const preflight=[
 ['app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','import { notifyV3Discord } from "./discordNotifier";'],
 ['app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','function humanRequestGroundedReply('],
 ['app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','function reconcilePendingMutationWithAuthoritativeTruth'],
 ['app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','  let actionResults = actions;'],
 ['app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','  const authoritativeHumanRequestReply = humanRequestGroundedReply({ turn, state: stateWorking, truth: truthAfterActions });'],
 ['app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts','  if (reply && resemblesPostDisclosurePaymentReply(reply)) {'],
 ['app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts','import { personaWritingContract } from "./personas";'],
 ['app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts','\n\nالقواعد الصلبة:'],
 ['app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','function hasAuthoritativeMutationResult(actions: ActionResult[]) {'],
 ['app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','function conditionalFutureMutationText'],
 ['app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','function asksTrackingLink(value: string | null | undefined) {'],
 ['app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','function asksContactChannel'],
 ['app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','function asksRequirementsQuestion(turn: InterpretedTurn) {'],
 ['app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','function asksContractTermsQuestion'],
 ['app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','function mutationRequestReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {'],
 ['app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','function refundTimingReply'],
 ['app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts','  if (obligation === "mutation_truth") {'],
 ['app/api/whatsapp/webhook/_lib/v3-os/actionPlane.ts','  if (action.action === "switch_ai_role" || action.action === "record_call_preference") {'],
 ['app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts','false_contact_link_completion_claim'],
];
const missing=[];for(const [file,needle] of preflight){const src=read(file);if(!src.includes(needle))missing.push(`${file} :: ${JSON.stringify(needle)}`)}
if(missing.length){console.error('PRECHECK FAILED - NO FILES CHANGED');for(const x of missing)console.error('MISSING',x);process.exit(1)}
let src=run('git',['show',`origin/${branch}:${patcherPath}`],{capture:true});
const lines=src.split(/\r?\n/);
const idx=lines.findIndex(line=>line.includes("'human brain unified care contract'"));
if(idx<0)throw new Error('runner could not locate old human-brain anchor line');
lines[idx]="replaceOnce(targets[1],'\\n\\nالقواعد الصلبة:','\\n\\nHUMAN_CARE_POLICY:\\n${humanCarePromptContract({ turn: input.anchor, state: input.state, truth: input.truth })}\\n\\nالقواعد الصلبة:','human brain unified care contract');";
src=lines.join('\n');
const tmp=path.join(os.tmpdir(),'alameen-phase11-9-final-conversation-integrity-patcher-fixed.cjs');
fs.writeFileSync(tmp,src,{encoding:'utf8'});
run(process.execPath,['--check',tmp]);
run(process.execPath,[tmp,root]);
