const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=process.argv[2]||process.cwd();process.chdir(root);
const EXPECTED='171bad6eecb0856a9ca43d6d9e406cb4bc567b01';
const BRANCH='phase11.9-final-conversation-integrity-human-care';
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed${r.stderr?`: ${r.stderr.trim()}`:''}`);return opts.capture?String(r.stdout||'').trim():''}
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
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
'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts'];
const created=['app/api/whatsapp/webhook/_lib/v3-os/humanCarePolicy.ts','scripts/v3-phase11-9-final-conversation-integrity-selftest.cjs'];
const protectedFiles=[
'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',
'app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts',
'app/api/continue-decision/route.ts','app/admin/page.tsx','app/admin/applications/[id]/page.tsx',
'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts'];
const fragments={
human:'scripts/phase11-9-fragments/human-escalation.tsfrag',
receipt:'scripts/phase11-9-fragments/human-action-receipt.tsfrag',
stop:'scripts/phase11-9-fragments/stop-reopen-authority.tsfrag',
requirements:'scripts/phase11-9-fragments/requirements-authority.tsfrag',
mutation:'scripts/phase11-9-fragments/mutation-request.tsfrag',
tracking:'scripts/phase11-9-fragments/tracking-link-authority.tsfrag'};
const head=run('git',['rev-parse','HEAD'],{capture:true});if(head!==EXPECTED)throw new Error(`STOP: expected HEAD ${EXPECTED}, found ${head}`);
const dirty=statusFor([...targets,...protectedFiles]);if(dirty)throw new Error(`STOP: protected/target files have local changes:\n${dirty}`);
for(const rel of created)if(fs.existsSync(path.join(root,rel)))throw new Error(`STOP: Phase 11.9 file already exists: ${rel}`);
const protectedHash=Object.fromEntries(protectedFiles.map(rel=>[rel,hash(rel)]));
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);const backup=path.join(process.env.USERPROFILE||root,'.alameen-backups',`before-v3-phase11-9-final-conversation-integrity-${stamp}`);fs.mkdirSync(backup,{recursive:true});for(const rel of targets){const dst=path.join(backup,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,rel),dst)}
function rollback(){for(const rel of targets){const src=path.join(backup,rel);if(fs.existsSync(src)){fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.copyFileSync(src,path.join(root,rel))}}for(const rel of created){try{fs.rmSync(path.join(root,rel),{force:true})}catch{}}}
try{
write(created[0],gitShow(created[0]));write(created[1],gitShow(created[1]));
replaceOnce(targets[0],'import { notifyV3Discord } from "./discordNotifier";','import { notifyV3Discord } from "./discordNotifier";\nimport { applyHumanCareEgress } from "./humanCarePolicy";','human care import');
replaceBlock(targets[0],'function humanRequestGroundedReply(','\n\nfunction reconcilePendingMutationWithAuthoritativeTruth',gitShow(fragments.human).trimEnd(),'human escalation durable receipt block');
replaceOnce(targets[0],'  let actionResults = actions;\n\n  let manualMutationReceipt: ManualMutationReceipt | null = null;',gitShow(fragments.receipt).trimEnd(),'durable human escalation action receipt');
replaceOnce(targets[0],'  const authoritativeHumanRequestReply = humanRequestGroundedReply({ turn, state: stateWorking, truth: truthAfterActions });','  const authoritativeHumanRequestReply = humanRequestGroundedReply({ turn, state: stateWorking, truth: truthAfterActions, receipt: humanEscalationReceipt });','human escalation receipt binding');
const oldCare='  if (reply && resemblesPostDisclosurePaymentReply(reply)) {\n    reduced = markCommercialDisclosureAcknowledged(reduced, truthAfterActions, turn.turnId);\n  }\n\n  if (gate.confirmationPrompt && arbitration.obligation !== "mutation_truth" && reply !== gate.confirmationPrompt) {';
const newCare='  if (reply && resemblesPostDisclosurePaymentReply(reply)) {\n    reduced = markCommercialDisclosureAcknowledged(reduced, truthAfterActions, turn.turnId);\n  }\n\n  // Phase 11.9: human care shapes language only after truth/action/commercial arbitration.\n  // Protected payment execution/disclosure replies stay byte-stable.\n  reply = applyHumanCareEgress({ reply, turn, state: reduced, truth: truthAfterActions });\n\n  if (gate.confirmationPrompt && arbitration.obligation !== "mutation_truth" && reply !== gate.confirmationPrompt) {';
replaceOnce(targets[0],oldCare,newCare,'human care final egress');
replaceOnce(targets[1],'import { personaWritingContract } from "./personas";','import { personaWritingContract } from "./personas";\nimport { humanCarePromptContract } from "./humanCarePolicy";','human brain care import');
replaceOnce(targets[1],'${khaledOverlay ? `\nCALMING_OVERLAY:\n${khaledOverlay}` : ""}\n\nالقواعد الصلبة:','${khaledOverlay ? `\nCALMING_OVERLAY:\n${khaledOverlay}` : ""}\n\nHUMAN_CARE_POLICY:\n${humanCarePromptContract({ turn: input.anchor, state: input.state, truth: input.truth })}\n\nالقواعد الصلبة:','human brain unified care contract');
replaceBlock(targets[2],'function hasAuthoritativeMutationResult(actions: ActionResult[]) {','\n\nfunction conditionalFutureMutationText',gitShow(fragments.stop).trimEnd(),'stop-refund/reopen authoritative result');
replaceBlock(targets[2],'function asksTrackingLink(value: string | null | undefined) {','\n\nfunction asksContactChannel',gitShow(fragments.tracking).trimEnd(),'tracking link object authority');
replaceBlock(targets[2],'function asksRequirementsQuestion(turn: InterpretedTurn) {','\n\nfunction asksContractTermsQuestion',gitShow(fragments.requirements).trimEnd(),'requirements current question authority');
replaceBlock(targets[2],'function mutationRequestReply(input: { turn: InterpretedTurn; truth: TruthBundle }) {','\n\nfunction refundTimingReply',gitShow(fragments.mutation).trimEnd(),'stop-refund before cancel');
const oldMutation='  if (obligation === "mutation_truth") {\n    if (hasAuthoritativeMutationResult(input.actions)) {\n      return { reply: candidate, obligation, repaired: false, reason: "mutation/action truth remains authoritative" };\n    }';
const newMutation='  if (obligation === "mutation_truth") {\n    const stopOrReopenReply = authoritativeStopOrReopenReply({ actions: input.actions, truth: input.truth });\n    if (stopOrReopenReply) {\n      return { reply: sanitizeUnifiedEgressReply(stopOrReopenReply), obligation, repaired: stopOrReopenReply !== candidate, reason: "stop-refund/reopen action result owns final response" };\n    }\n    if (hasAuthoritativeMutationResult(input.actions)) {\n      return { reply: candidate, obligation, repaired: false, reason: "mutation/action truth remains authoritative" };\n    }';
replaceOnce(targets[2],oldMutation,newMutation,'authoritative stop-refund final reply');
const oldAction='  if (action.action === "switch_ai_role" || action.action === "record_call_preference") {\n    return {\n      action: action.action,\n      outcome: "executed",\n      executed: true,\n      authoritativeSummary: action.action === "switch_ai_role" ? "تم تغيير مستوى المعالجة داخل فريق AI." : "تم تسجيل تفضيل العميل للمكالمة دون وعد باتصال.",\n      mutationId: null,\n      blocker: null,\n      ownerRole: state.role.currentRole,\n    };\n  }';
const newAction='  if (action.action === "switch_ai_role") {\n    return { action: action.action, outcome: "executed", executed: true, authoritativeSummary: "تم تغيير مستوى المعالجة داخل فريق AI.", mutationId: null, blocker: null, ownerRole: state.role.currentRole };\n  }\n  if (action.action === "record_call_preference") {\n    return { action: action.action, outcome: "dry_run", executed: false, authoritativeSummary: null, mutationId: null, blocker: "human_contact_request_requires_durable_receipt", ownerRole: state.role.currentRole };\n  }';
replaceOnce(targets[3],oldAction,newAction,'call preference durable receipt gate');
const oldContact='  if (!actionSucceeded(input.actions, "link_whatsapp_alias") && /تم\\s+(?:اعتماد|ربط)\\s+(?:رقم|الرقم|واتساب)/.test(n)) reasons.push("false_contact_link_completion_claim");';
const newContact=oldContact+'\n  if (!actionSucceeded(input.actions, "record_call_preference") && /(?:تم\\s+تسجيل|سجلت|سجلنا).{0,45}(?:طلب\\s+)?(?:اتصال|مكالمة|تواصل|موظف|مسؤول)/.test(n)) reasons.push("false_human_contact_registration_claim");';
replaceOnce(targets[4],oldContact,newContact,'false human-contact registration guard');
console.log('\n=== PHASE 11.9 REGRESSION PACK ===');run('node',[created[1],root]);
console.log('\n=== CURRENT 11.7.1 REGRESSION PACK ===');run('node',['scripts/v3-phase11-7-1-turn-scoped-authority-finalization-selftest.cjs',root]);
console.log('\n=== PAYMENT FUNNEL FREEZE GATE ===');run('node',['scripts/v3-phase11-8-0-payment-funnel-control-plane-selftest.cjs',root]);
console.log('\n=== BUILD ===');run(process.platform==='win32'?'npm.cmd':'npm',['run','build']);run('git',['diff','--check']);
for(const rel of protectedFiles){if(hash(rel)!==protectedHash[rel])throw new Error(`PAYMENT FUNNEL FREEZE VIOLATION: ${rel}`)}
const protectedDirty=statusFor(protectedFiles);if(protectedDirty)throw new Error(`PAYMENT FUNNEL FREEZE VIOLATION:\n${protectedDirty}`);
console.log('\n========================================');console.log('PASS - PHASE 11.9 FINAL CONVERSATION INTEGRITY');console.log('PAYMENT FUNNEL FREEZE: PASS / UNCHANGED');console.log('========================================');console.log(`Backup: ${backup}`);console.log('\nChanged files:');console.log(run('git',['status','--short','--',...targets,...created],{capture:true}));
}catch(err){console.error('\nFAILED - ROLLING BACK PHASE 11.9...');rollback();console.error(err&&err.stack?err.stack:String(err));process.exit(1)}
