const fs = require('fs');
const cp = require('child_process');

const BASE = '1220069fc1772928aec33d05e15481b9350f0c9f';
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s, 'utf8');
const fail = (m) => { throw new Error(m); };

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) fail(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

function replaceAllExact(source, before, after, expected, label) {
  const count = source.split(before).length - 1;
  if (count !== expected) fail(`${label}: expected ${expected} matches, found ${count}`);
  return source.split(before).join(after);
}

function commercialBlock(source) {
  const start = source.indexOf('  // REVENUE + ADMIN INVARIANT:');
  const end = source.indexOf('  const criticalOperationalReply = criticalOperationalFallbackReply', start);
  if (start < 0 || end < 0 || end <= start) fail('commercial block markers missing');
  return source.slice(start, end);
}

// 1) Durable native-turn journaling + critical-operation single-writer cutover.
const runtimePath = 'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts';
let runtime = read(runtimePath);
const commercialBefore = commercialBlock(runtime);

runtime = replaceOnce(
  runtime,
  'import { runHumanConversationOS } from "./humanConversationOS";\n',
  'import { runHumanConversationOS } from "./humanConversationOS";\nimport { beginHumanTurn, checkpointHumanTurn } from "./durableTurnJournal";\n',
  'runtime journal import'
);

runtime = replaceOnce(
  runtime,
  '}): Promise<V3LiveResult> {\n  const truthRecentTurns = input.recentTurns || [];',
  `}): Promise<V3LiveResult> {\n  // Phase 18 durable native-turn journal. This is transport/conversation continuity only;\n  // it does not alter commercial continuation, fee eligibility, payment destinations, or receipt policy.\n  try {\n    await beginHumanTurn({\n      turnId: input.turnId,\n      waId: input.waId,\n      incomingMessageId: input.turnId,\n      customerText: input.customerText,\n    });\n  } catch (error) {\n    console.error("V3 Phase 18 native turn journal begin failed", { waId: input.waId, turnId: input.turnId, error });\n  }\n\n  const truthRecentTurns = input.recentTurns || [];`,
  'runtime begin journal'
);

runtime = replaceOnce(
  runtime,
  '  let reply: string | null = plan.shouldRespond ? (criticalOperationalReply || authoritativeCommercialJourneyReply || nativeKernelInitial.reply) : null;',
  `  // Phase 18 TRUE SINGLE WRITER for non-commercial operational turns.\n  // The protected commercial journey keeps its previous precedence byte-for-byte.\n  // For every other turn, the Native Kernel owns the normal wording and the deterministic\n  // critical reply becomes safety fallback only.\n  let reply: string | null = plan.shouldRespond\n    ? (authoritativeCommercialJourneyReply\n        ? (criticalOperationalReply || authoritativeCommercialJourneyReply || nativeKernelInitial.reply)\n        : (nativeKernelInitial.reply || criticalOperationalReply))\n    : null;`,
  'runtime single writer initial reply'
);

runtime = replaceAllExact(
  runtime,
  '&& !criticalOperationalReply && !authoritativeCommercialJourneyReply',
  '&& !authoritativeCommercialJourneyReply',
  2,
  'runtime critical refresh/repair gates'
);

runtime = replaceOnce(
  runtime,
  '  // PHASE 8.5 NEVER-SILENT EGRESS: a provider outage or an over-strict native',
  `  // Phase 18 deterministic critical-operation fallback: only after the Native Kernel\n  // has had its bounded post-action/confirmation repair opportunity. Protected commercial\n  // replies are excluded so the 5-JOD journey is behaviorally untouched.\n  if (plan.shouldRespond && !nativeValidation.pass && criticalOperationalReply && !authoritativeCommercialJourneyReply) {\n    reply = criticalOperationalReply;\n    fallbackUsed = true;\n    nativeValidation = validateNativeConversationReply({\n      reply,\n      turn,\n      state: conversationState,\n      truth: truthAfterActions,\n      actions,\n      recentTurns: scopedRecentTurns,\n      customerText: effectiveCustomerText,\n      disclosureRequiredThisTurn,\n      protectedFiveJodStep,\n    });\n  }\n\n  // PHASE 8.5 NEVER-SILENT EGRESS: a provider outage or an over-strict native`,
  'runtime critical deterministic fallback'
);

runtime = replaceOnce(
  runtime,
  '  const stateAfter = markRoleIntroducedFromReply(semanticFinalizedState, reply);\n\n  return {',
  `  const stateAfter = markRoleIntroducedFromReply(semanticFinalizedState, reply);\n\n  // Snapshot the exact decided reply/state before transport. StateStore will only\n  // recover this snapshot when a matching successfully logged outgoing v3_turn_id exists.\n  // Therefore a failed WhatsApp send can never become conversation truth.\n  try {\n    await checkpointHumanTurn({\n      turnId: input.turnId,\n      status: "reply_ready",\n      meaning: { runtime: "phase18_native_single_writer", shouldRespond: plan.shouldRespond },\n      truth: truthAfterActions,\n      actions,\n      finalReply: reply,\n      stateAfter,\n    });\n  } catch (error) {\n    console.error("V3 Phase 18 native turn journal checkpoint failed", { waId: input.waId, turnId: input.turnId, error });\n  }\n\n  return {`,
  'runtime reply-ready checkpoint'
);

if (commercialBlock(runtime) !== commercialBefore) {
  fail('PROTECTED COMMERCIAL BLOCK CHANGED: Phase 18 must not modify the 5-JOD journey');
}
write(runtimePath, runtime);

// 2) Recover journaled native state only after transport success is evidenced by whatsapp_messages.
const stateStorePath = 'app/api/whatsapp/webhook/_lib/v3-os/stateStore.ts';
let stateStore = read(stateStorePath);
const stateFnStart = stateStore.indexOf('async function loadLatestCompletedDeliveredState(waId: string) {');
const stateFnEnd = stateStore.indexOf('\nexport async function loadV3ConversationState', stateFnStart);
if (stateFnStart < 0 || stateFnEnd < 0) fail('stateStore recovery function markers missing');
const newStateFn = `async function loadLatestCompletedDeliveredState(waId: string) {\n  try {\n    const [journalRead, outgoingRead] = await Promise.all([\n      supabaseAdmin\n        .from("whatsapp_turn_journal")\n        .select("turn_id,status,state_after_json,provider_message_id,delivered_at,completed_at,updated_at")\n        .eq("wa_id", waId)\n        .in("status", ["reply_ready", "delivered", "completed"])\n        .order("updated_at", { ascending: false })\n        .limit(16),\n      supabaseAdmin\n        .from("whatsapp_messages")\n        .select("message_id,raw_payload,created_at")\n        .eq("wa_id", waId)\n        .eq("direction", "outgoing")\n        .order("created_at", { ascending: false })\n        .limit(32),\n    ]);\n\n    if (journalRead.error) {\n      console.error("v3_delivered_state_recovery_read_failed", { waId, error: journalRead.error.message });\n      return null;\n    }\n    if (outgoingRead.error) {\n      console.error("v3_delivered_state_outgoing_evidence_read_failed", { waId, error: outgoingRead.error.message });\n      return null;\n    }\n\n    const outgoingTurnTimes = new Map();\n    for (const row of (Array.isArray(outgoingRead.data) ? outgoingRead.data : [])) {\n      const turnId = String(row?.raw_payload?.v3_turn_id || "").trim();\n      if (turnId && !outgoingTurnTimes.has(turnId)) outgoingTurnTimes.set(turnId, String(row?.created_at || ""));\n    }\n\n    const candidates = (Array.isArray(journalRead.data) ? journalRead.data : [])\n      .filter((row) => {\n        const turnId = String(row?.turn_id || "").trim();\n        const journalCompleted = row?.status === "completed" && Boolean(row?.provider_message_id);\n        const transportLogged = Boolean(turnId && outgoingTurnTimes.has(turnId));\n        return journalCompleted || transportLogged;\n      })\n      .map((row) => {\n        const state = hydrateConversationState(row?.state_after_json as ConversationState | null | undefined);\n        if (!state) return null;\n        const turnId = String(row?.turn_id || "").trim();\n        return {\n          state,\n          deliveredAt: String(row?.completed_at || row?.delivered_at || outgoingTurnTimes.get(turnId) || row?.updated_at || state.updatedAt || ""),\n        };\n      })\n      .filter((item): item is { state: ConversationState; deliveredAt: string } => Boolean(item))\n      .sort((a, b) => Date.parse(b.state.updatedAt || "") - Date.parse(a.state.updatedAt || ""));\n    return candidates[0] || null;\n  } catch (error) {\n    console.error("v3_delivered_state_recovery_failed", { waId, error: error instanceof Error ? error.message : String(error) });\n    return null;\n  }\n}\n`;
stateStore = stateStore.slice(0, stateFnStart) + newStateFn + stateStore.slice(stateFnEnd);
write(stateStorePath, stateStore);

// 3) Make final stale-turn suppression consult durable ingress, not only already-logged rows.
const turnIntegrityPath = 'app/api/whatsapp/webhook/_lib/v3-os/turnIntegrity.ts';
let turnIntegrity = read(turnIntegrityPath);
turnIntegrity = replaceOnce(
  turnIntegrity,
  'import { supabaseAdmin } from "@/lib/supabaseAdmin";\n',
  'import { supabaseAdmin } from "@/lib/supabaseAdmin";\nimport { durableIngressTurnFreshness } from "./durableIngress";\n',
  'turnIntegrity durable import'
);
turnIntegrity = replaceOnce(
  turnIntegrity,
  '  if (!waId || !currentMessageId) return false;\n\n  const since =',
  `  if (!waId || !currentMessageId) return false;\n\n  // Phase 18: a newer customer bubble may already be durably queued before it is\n  // written to whatsapp_messages. Such a turn owns the conversation immediately.\n  try {\n    const durable = await durableIngressTurnFreshness({ waId, currentMessageId, lookbackSeconds: input.lookbackSeconds ?? 180 });\n    if (!durable.fresh && durable.latestMessageId) return true;\n  } catch (error) {\n    console.error("v3 durable stale-turn pre-send check failed:", error);\n  }\n\n  const since =`,
  'turnIntegrity durable ownership'
);
write(turnIntegrityPath, turnIntegrity);

// 4) Refund page: refund_requested means the workflow opened; it does NOT prove transfer details were submitted.
const delayPath = 'app/delay-decision/page.tsx';
let delayPage = read(delayPath);
delayPage = replaceOnce(
  delayPage,
  '  payment_confirmed_at?: string | null;\n  delivery_delay_started_at?: string | null;',
  '  payment_confirmed_at?: string | null;\n  payment_reference?: string | null;\n  delivery_delay_started_at?: string | null;',
  'refund page type payment_reference'
);
delayPage = replaceOnce(
  delayPage,
  '"id, tracking_id, full_name, phone, device_name, status, payment_status, payment_confirmed_at, delivery_delay_started_at, delivery_delay_until"',
  '"id, tracking_id, full_name, phone, device_name, status, payment_status, payment_confirmed_at, payment_reference, delivery_delay_started_at, delivery_delay_until"',
  'refund page select payment_reference'
);
delayPage = replaceOnce(
  delayPage,
  '  const refundRequested = rawRefundState && refundPaymentConfirmed;\n  const refundNotEligible =',
  `  // Phase 18 refund contract: the Real Action may open refund_requested before\n  // the customer has supplied transfer details. Only the persisted detail marker\n  // (or the successful POST result) proves the form was completed.\n  const refundDetailsSubmitted =\n    result === "refund" ||\n    /^Refund requested \\| Account:/i.test(String(app.payment_reference || ""));\n  const refundRequested = rawRefundState && refundPaymentConfirmed && refundDetailsSubmitted;\n  const refundNotEligible =`,
  'refund details submission truth'
);
write(delayPath, delayPage);

// 5) Remove version drift.
const typesPath = 'app/api/whatsapp/webhook/_lib/v3-os/types.ts';
let types = read(typesPath);
types = replaceOnce(
  types,
  'export const V3_OS_VERSION = "v3.0.0-phase10.0-sol-hybrid-intelligence-24h-pilot" as const;',
  'export const V3_OS_VERSION = "v3.0.0-phase18.0-durable-native-turn-authority-single-egress" as const;',
  'V3 version drift'
);
write(typesPath, types);

// 6) Phase 18 regression gate, including an explicit no-touch fence around the 5-JOD journey.
const testPath = 'scripts/v3-phase18-durable-native-turn-authority-selftest.cjs';
const test = `const fs=require('fs'); const cp=require('child_process');\nconst read=(p)=>fs.readFileSync(p,'utf8'); let passed=0;\nfunction ok(c,m){if(!c) throw new Error(m); console.log('PASS '+(++passed)+': '+m)}\nconst runtime=read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');\nconst state=read('app/api/whatsapp/webhook/_lib/v3-os/stateStore.ts');\nconst integrity=read('app/api/whatsapp/webhook/_lib/v3-os/turnIntegrity.ts');\nconst delay=read('app/delay-decision/page.tsx');\nconst types=read('app/api/whatsapp/webhook/_lib/v3-os/types.ts');\nconst control=read('app/api/whatsapp/webhook/_lib/v3-os/humanOsControl.ts');\nok(/enabled:\\s*false/.test(control),'Phase 17 HumanConversationOS remains disabled');\nok(runtime.includes('beginHumanTurn({'),'native path starts durable turn journal');\nok(runtime.includes('status: "reply_ready"'),'native path checkpoints exact decided reply/state before transport');\nok(state.includes('raw_payload?.v3_turn_id'),'state recovery requires matching outgoing transport evidence');\nok(state.includes('["reply_ready", "delivered", "completed"]'),'reply-ready journal is eligible only through delivery evidence join');\nok(integrity.includes('durableIngressTurnFreshness'),'egress stale-turn check sees newer durable queued bubbles');\nok(runtime.includes('authoritativeCommercialJourneyReply\\n        ? (criticalOperationalReply || authoritativeCommercialJourneyReply || nativeKernelInitial.reply)'),'protected commercial precedence remains unchanged');\nok(runtime.includes(': (nativeKernelInitial.reply || criticalOperationalReply)'),'non-commercial Native Kernel owns normal wording');\nok(runtime.includes('Phase 18 deterministic critical-operation fallback'),'critical deterministic writer is fallback, not first writer');\nok(delay.includes('payment_reference'),'refund page reads persisted transfer-detail marker');\nok(delay.includes('refundDetailsSubmitted'),'refund_requested alone no longer hides the refund data form');\nok(types.includes('v3.0.0-phase18.0-durable-native-turn-authority-single-egress'),'runtime version identifies Phase 18');\nconst diff=cp.execSync('git diff --name-only ${BASE}',{encoding:'utf8'}).trim().split(/\\r?\\n/).filter(Boolean);\nconst protectedFiles=[\n 'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',\n 'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',\n 'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts',\n 'app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts'\n];\nfor(const p of protectedFiles) ok(!diff.includes(p),'NO-TOUCH 5-JOD file unchanged: '+p);\nok(!runtime.includes('criticalOperationalReply || authoritativeCommercialJourneyReply || nativeKernelInitial.reply) : null'),'legacy non-commercial deterministic-first egress removed');\nconsole.log('\\nPhase 18 assertions: '+passed+' passed= '+passed+' failed=0');\n`;
write(testPath, test);

// Final no-touch fence: fail before CI if a protected 5-JOD module changed.
const changed = cp.execSync(`git diff --name-only ${BASE}`, { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
for (const p of [
  'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts',
]) {
  if (changed.includes(p)) fail(`NO-TOUCH 5-JOD VIOLATION: ${p}`);
}

console.log('Phase 18 guarded patch applied. Changed files:');
console.log(changed.join('\n'));
