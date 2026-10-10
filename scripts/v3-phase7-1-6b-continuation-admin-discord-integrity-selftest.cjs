const fs = require('fs');
const path = require('path');
const root = process.argv[2];
if (!root) throw new Error('Project root required');
function read(rel){ return fs.readFileSync(path.join(root,rel),'utf8'); }
function ok(cond,msg){ if(!cond) throw new Error(msg); console.log('PASS:',msg); }
const recovery=read('app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts');
const runtime=read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const persist=read('app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts');
const admin=read('app/admin/page.tsx');
ok(/\u0627\u0648\u062f|\u0627\u0631\u063a\u0628/.test(recovery),'natural continuation wording is deterministically recognized');
ok(/\u0627\u0647/.test(recovery) && /\u0628\u062f\u064a/.test(recovery),'contextual affirmative continuation is recognized');
ok(recovery.includes('action: "continue_application"'),'recovered continuation becomes continue_application');
ok(runtime.includes('persistExplicitContinuation'),'runtime persists explicit continuation');
ok(runtime.includes('continuationDecisionThisTurn'),'single deterministic continuation decision drives revenue/admin/Discord');
ok(runtime.includes('customer_continue_payment_ready'),'continuation sends dedicated Discord event');
ok(runtime.includes('continuationPersistence.updated || continuationPersistence.alreadyRecorded'),'continuation event covers fresh and already-recorded durable decisions');
ok(runtime.includes('truth_integrity_failure'),'admin persistence failure escalates instead of silently disappearing');
ok(persist.includes('status: "customer_confirmed_continue"'),'admin status is customer_confirmed_continue');
ok(persist.includes('payment_status: "pending_payment"'),'payment state becomes pending_payment');
ok(persist.includes('.eq("status", "preliminary_qualified")'),'persistence is stale-truth guarded to preliminary qualification');
ok(persist.includes('isContinuationRevenueReady(app)') && persist.includes('status !== "preliminary_qualified"'),'persistence is eligibility-gated and only mutates preliminary-qualified applications');
ok(admin.includes('customer_confirmed_continue'),'existing admin UI supports continuation status');
ok(!persist.includes('cancelled') && !persist.includes('refund_requested') && !persist.includes('reopen_application'),'continuation persistence cannot cancel/refund/reopen');
console.log('SELFTEST PASSED - V3 PHASE 7.1.6B CONTINUATION ADMIN + DISCORD INTEGRITY');
