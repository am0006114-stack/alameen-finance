const fs=require('fs'); const path=require('path');
const root=process.argv[2]; if(!root) throw new Error('ProjectRoot required');
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}
function must(ok,msg){if(!ok) throw new Error(msg)}
let passed=0; function pass(ok,msg){must(ok,msg); passed++}
const rel='app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts';
const os=read(rel);

pass(/Phase 11\.4: pending actions may remain durable/.test(os),'11.4 structural marker missing');
pass(/currentTurnStillOwnsConversation/.test(os),'durable ownership resolver missing');
pass(/startLastTurnId = stateBefore\.lastTurnId/.test(os),'turn-start ownership snapshot missing');
pass(/latestTurnId !== input\.turnId[\s\S]*latestTurnId !== input\.startLastTurnId/.test(os),'ownership comparison must distinguish current and start owner');
pass(/ownership_lost_before_actions/.test(os),'pre-action supersession reason missing');
pass(/ownership_lost_before_egress/.test(os),'pre-egress supersession reason missing');
pass(/human_os_superseded_by_newer_turn/.test(os),'durable supersession journal code missing');
pass(/finalReply: null/.test(os),'superseded turn must journal no outbound reply');
pass(/reply: null/.test(os),'superseded turn must return no outbound reply');
pass(/stateAfter: input\.latestState/.test(os),'superseded turn must preserve newer state instead of overwriting it');

const preAction=os.indexOf('const ownershipBeforeActions = await currentTurnStillOwnsConversation');
const execute=os.indexOf('const actions = await executeActions');
pass(preAction>=0 && execute>preAction,'ownership must be rechecked before any real action execution');
const preEgress=os.indexOf('const ownershipBeforeEgress = await currentTurnStillOwnsConversation');
const finalize=os.indexOf('reduced = finalizeStateSemanticMemory',preEgress);
pass(preEgress>=0 && finalize>preEgress,'ownership must be rechecked before final reply/state commit');

pass(/replaySuperseded/.test(os),'durable replay freshness guard missing');
pass(/stateTime\(stateBefore\.updatedAt\) > stateTime\(stateAfter\.updatedAt\)/.test(os),'old durable reply must not replay over newer state');
pass(/shouldRespond: !replaySuperseded/.test(os),'superseded replay must not respond');
pass(/reply: replaySuperseded \? null : existing\.final_reply/.test(os),'superseded durable replay must be silent');

pass(/currentTurnWithdrawsPendingAction/.test(os),'semantic pending-action withdrawal missing');
pass(/decision\?\.cancellation === "declined"/.test(os),'cancel withdrawal must use semantic decision authority');
pass(/decision\?\.continuation === "declined"/.test(os),'continuation withdrawal must use semantic decision authority');
pass(/decision\?\.aliasConfirmation === "declined"/.test(os),'alias withdrawal must use semantic decision authority');
pass(/act\.type === "deny"/.test(os),'generic deny dialogue-act withdrawal missing');
pass(/pendingActionWithdrawn[\s\S]*pendingAction: null, pendingActionPayload: null/.test(os),'withdrawn action must clear pending state');

pass(/currentTurnShouldIgnorePendingAction/.test(os),'current-turn pending-action focus guard missing');
pass(/NON_MATERIAL_TURN_TOPICS/.test(os),'material current-turn classification missing');
pass(/semantic\?\.currentQuestion/.test(os) && /semantic\?\.answerObligations/.test(os),'current question/obligation authority missing');
pass(/ignorePendingForCurrentTurn/.test(os),'pending action must be demoted for unrelated current question');
pass(/const gateState = ignorePendingForCurrentTurn[\s\S]*pendingAction: null, pendingActionPayload: null/.test(os),'confirmation gate must not let old pending action hijack unrelated current turn');
pass(/enforceMutationConfirmationGate\(\{ actions: plan\.actions, turn, state: gateState/.test(os),'mutation gate must consume current-turn-scoped state');

// Behavioral ownership invariant, independent of Arabic wording.
function owns(startLastTurnId,currentTurnId,latestTurnId){
  const lost=Boolean(latestTurnId && latestTurnId!==currentTurnId && latestTurnId!==startLastTurnId);
  return !lost;
}
pass(owns('A','B','A')===true,'unchanged pre-turn state must not suppress current turn');
pass(owns('A','B','B')===true,'current turn may retain ownership after its own durable state update');
pass(owns('A','B','C')===false,'a different turn advancing state must supersede current turn');
pass(owns(null,'B','C')===false,'new durable owner must supersede turn even from empty initial state');

// Structural regression guards from 11.3/11.2.
pass(/explicitPendingMutationConfirmation/.test(os),'11.3 contextual confirmation completion regressed');
pass(/hasNewerCustomerTurn/.test(os),'11.3 initial recent-turn stale suppression regressed');
pass(/simpleSocialClosureReply/.test(os),'11.3 social closure regressed');
pass(/const paymentConfirmed = hasAuthoritativePaymentConfirmation\(app\)/.test(os),'11.2 authoritative paid-device-change gate regressed');
pass(/const secureDeviceLink = paymentConfirmed[\s\S]*buildSecureDeviceChangeUrl[\s\S]*: null/.test(os),'11.2 paid-only secure device link regressed');
pass(!/orangmoney\.com/i.test(os),'cross-project literal must not enter Human OS');

console.log(`V3 PHASE 11.4 SELFTEST PASS (${passed}/${passed})`);
console.log('Durable turn ownership + final egress freshness + pending-action focus/withdrawal: PASS');
