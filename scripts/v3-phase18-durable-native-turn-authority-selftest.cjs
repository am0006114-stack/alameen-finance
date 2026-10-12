const fs=require('fs'); const cp=require('child_process');
const read=(p)=>fs.readFileSync(p,'utf8'); let passed=0;
function ok(c,m){if(!c) throw new Error(m); console.log('PASS '+(++passed)+': '+m)}
const runtime=read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const state=read('app/api/whatsapp/webhook/_lib/v3-os/stateStore.ts');
const integrity=read('app/api/whatsapp/webhook/_lib/v3-os/turnIntegrity.ts');
const delay=read('app/delay-decision/page.tsx');
const types=read('app/api/whatsapp/webhook/_lib/v3-os/types.ts');
const control=read('app/api/whatsapp/webhook/_lib/v3-os/humanOsControl.ts');
ok(/enabled:\s*false/.test(control),'Phase 17 HumanConversationOS remains disabled');
ok(runtime.includes('beginHumanTurn({'),'native path starts durable turn journal');
ok(runtime.includes('status: "reply_ready"'),'native path checkpoints exact decided reply/state before transport');
ok(state.includes('raw_payload?.v3_turn_id'),'state recovery requires matching outgoing transport evidence');
ok(state.includes('["reply_ready", "delivered", "completed"]'),'reply-ready journal is eligible only through delivery evidence join');
ok(integrity.includes('durableIngressTurnFreshness'),'egress stale-turn check sees newer durable queued bubbles');
ok(runtime.includes('authoritativeCommercialJourneyReply\n        ? (criticalOperationalReply || authoritativeCommercialJourneyReply || nativeKernelInitial.reply)'),'protected commercial precedence remains unchanged');
ok(runtime.includes(': (nativeKernelInitial.reply || criticalOperationalReply)'),'non-commercial Native Kernel owns normal wording');
ok(runtime.includes('Phase 18 deterministic critical-operation fallback'),'critical deterministic writer is fallback, not first writer');
ok(delay.includes('payment_reference'),'refund page reads persisted transfer-detail marker');
ok(delay.includes('refundDetailsSubmitted'),'refund_requested alone no longer hides the refund data form');
ok(types.includes('v3.0.0-phase18.0-durable-native-turn-authority-single-egress'),'runtime version identifies Phase 18');
const diff=cp.execSync('git diff --name-only 1220069fc1772928aec33d05e15481b9350f0c9f',{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const protectedFiles=[
 'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts'
];
for(const p of protectedFiles) ok(!diff.includes(p),'NO-TOUCH 5-JOD file unchanged: '+p);
ok(!runtime.includes('criticalOperationalReply || authoritativeCommercialJourneyReply || nativeKernelInitial.reply) : null'),'legacy non-commercial deterministic-first egress removed');
console.log('\nPhase 18 assertions: '+passed+' passed= '+passed+' failed=0');
