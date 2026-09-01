const fs=require('fs');
const path=require('path');
const root=process.argv[2]||process.cwd();
const base=path.join(root,'app','api','whatsapp','webhook','_lib','v3-os');
function read(name){ const p=path.join(base,name); if(!fs.existsSync(p)) throw new Error(`missing ${name}`); return fs.readFileSync(p,'utf8'); }
const required=[
  'types.ts','policy.ts','hierarchy.ts','interpreter.ts','modelInterpreter.ts','state.ts','planner.ts','actionAuthority.ts','actionPlane.ts',
  'commercialOperations.ts','productionTruth.ts','supabaseActionAdapter.ts','simulationActionAdapter.ts','humanVoice.ts','notificationPolicy.ts',
  'writerContract.ts','verifier.ts','safeFallback.ts','runtimeShadow.ts','sequenceLab.ts','archiveSequenceLab.ts','judge.ts','goldenCases.ts','sequenceCases.ts'
];
const src=Object.fromEntries(required.map(f=>[f,read(f)]));
const all=Object.values(src).join('\n');

// Absolute architecture invariant: no customer-service dependency on a human queue/pause.
if(/whatsapp_v2_human_action_queue|AUTO_REPLY_IGNORED|pauseAutoReplyAfterSend|wait_for_human|await_human_agent/i.test(all)) {
  throw new Error('human dependency regression detected');
}

// All customer-requested business mutations belong to Omran AI.
for(const action of ['cancel_application','continue_application','request_refund','stop_refund','change_application_data','change_device','reopen_application']) {
  if(!src['hierarchy.ts'].includes(`"${action}"`)) throw new Error(`Omran supervisor action missing: ${action}`);
}
if(!src['hierarchy.ts'].includes('autonomous_business_mutation_owned_by_omran')) throw new Error('Omran mutation routing reason missing');
if(!src['actionPlane.ts'].includes('omran_supervisor_required')) throw new Error('Omran action guard missing');
if(!src['supabaseActionAdapter.ts'].includes('omran_supervisor_required')) throw new Error('Omran production adapter guard missing');
if(!src['simulationActionAdapter.ts'].includes('omran_supervisor_required')) throw new Error('Omran simulation adapter guard missing');

// Direct deterministic customer instructions are autonomous, while model-only mutation guesses need one confirmation.
if(!src['actionAuthority.ts'].includes('source === "deterministic"') || !src['actionAuthority.ts'].includes('source === "resolved"')) throw new Error('deterministic/resolved mutation authority missing');
if(!src['actionAuthority.ts'].includes('confirmation_required')) throw new Error('model-only mutation confirmation guard missing');

// Payment confirmation is manual/admin-only and a customer claim can never become confirmed payment.
if(!src['policy.ts'].includes('تأكيد الدفع النهائي يتم يدويًا من الإدارة/الأدمن')) throw new Error('manual admin payment confirmation policy missing');
if(!src['verifier.ts'].includes('chat_cannot_confirm_payment')) throw new Error('chat payment confirmation verifier missing');
if(!src['supabaseActionAdapter.ts'].includes('confirmed_payment_required')) throw new Error('refund confirmed-payment guard missing');
if(/payment_status\s*:\s*["']confirmed["'][\s\S]{0,120}(?:customer_claim|وصل|واتساب)/i.test(src['supabaseActionAdapter.ts'])) throw new Error('unsafe chat-driven payment confirmation detected');

// Payment reference is authoritative evidence: business actions may read it but must not overwrite it as an audit note.
if(/payment_reference\s*:/.test(src['supabaseActionAdapter.ts'])) throw new Error('payment_reference must not be overwritten by V3 actions');

// Device changes use the real catalog and the real calculator, not LLM arithmetic.
if(!src['commercialOperations.ts'].includes('from "@/lib/installments"')) throw new Error('official installment calculator not used');
if(!src['commercialOperations.ts'].includes('from "@/lib/products"')) throw new Error('official product catalog not used');
if(!src['commercialOperations.ts'].includes('calculateRequestedDeviceChange')) throw new Error('device recalculation operation missing');

// Review-time truth: normal 2-3 business days + severe pressure, with no fabricated ETA.
if(!src['policy.ts'].includes('المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل')) throw new Error('normal 2-3 business-day review window missing');
if(!src['policy.ts'].includes('ضغط مراجعات شديد جدًا')) throw new Error('severe operational pressure truth missing');
if(!src['verifier.ts'].includes('review_window_or_pressure_missing') || !src['verifier.ts'].includes('invented_review_eta')) throw new Error('review-time verifier missing');

// Social/scam escalation must use the actual dispute rule, not a dead/literal template token.
if(src['planner.ts'].includes('social_threat: "${p.disputeResolutionRule}"')) throw new Error('social threat policy interpolation bug');
if(!src['planner.ts'].includes('social_threat: `${p.disputeResolutionRule}`')) throw new Error('social threat dispute rule not wired');
if(!src['policy.ts'].includes('التشهير المتعمد') || !src['policy.ts'].includes('حق العميل')) throw new Error('firm dispute/refund-right policy missing');

// Human voice is part of verification, not merely a prompt suggestion.
if(!src['writerContract.ts'].includes('humanVoiceGuidance')) throw new Error('human voice writer contract missing');
if(!src['verifier.ts'].includes('detectHumanityViolations')) throw new Error('humanity verifier missing');
if(!src['humanVoice.ts'].includes('high_similarity_to_recent_reply') || !src['humanVoice.ts'].includes('repeated_opening_structure')) throw new Error('reply similarity protection missing');

// Discord must be quiet for routine/recovered chat errors and loud only for actionable critical/admin events.
for(const q of ['provider_interpreter_recovered','provider_writer_recovered','verifier_repaired','routine_customer_complaint','routine_unknown_message','routine_action_success']) {
  if(!src['notificationPolicy.ts'].includes(`"${q}"`)) throw new Error(`quiet Discord event missing: ${q}`);
}
for(const important of ['payment_confirmation_required','business_mutation_failed','truth_integrity_failure','final_safety_fail_closed']) {
  if(!src['notificationPolicy.ts'].includes(`"${important}"`)) throw new Error(`actionable Discord event missing: ${important}`);
}

// Archive/sequence tests must simulate V3's own state transitions in memory only.
if(!src['runtimeShadow.ts'].includes('v3SimulationActionAdapter')) throw new Error('pure simulation adapter not wired');
if(!src['runtimeShadow.ts'].includes('actionMode === "simulate"')) throw new Error('sequence simulation mode missing');
if(src['runtimeShadow.ts'].includes('v3SupabaseActionAdapter')) throw new Error('shadow runtime must not wire real Supabase mutation adapter');
if(!src['archiveSequenceLab.ts'].includes('mergeArchiveExternalTruth')) throw new Error('archive branch truth continuity missing');
if(!src['archiveSequenceLab.ts'].includes('actionMode: "simulate"')) throw new Error('archive sequence must use pure simulation');

// Golden regression corpus must include the new operational contracts.
for(const phrase of ['direct cancellation is an autonomous Omran transaction','customer claim never auto-confirms payment','normal 2-3 business days + current severe pressure','firm de-escalation']) {
  if(!src['goldenCases.ts'].includes(phrase)) throw new Error(`golden case contract missing: ${phrase}`);
}

console.log('V3 PHASE 4 SELFTEST PASS');
console.log('Autonomous Omran operations + manual admin payment confirmation: PASS');
console.log('Official catalog/calculator device recalculation: PASS');
console.log('2-3 day review baseline + severe pressure truth: PASS');
console.log('Human voice/repetition verifier: PASS');
console.log('Discord noise suppression policy: PASS');
console.log('Archive sequence state-mutation simulation remains pure/in-memory: PASS');
console.log('No human queue / no AI pause dependency: PASS');
