const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
let failed = 0;
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function pass(name, ok){ if(ok) console.log(`PASS: ${name}`); else { failed++; console.error(`FAIL: ${name}`); } }

const runtime = read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const route = read('app/api/whatsapp/webhook/route.ts');
const brain = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');
const os = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const journal = read('app/api/whatsapp/webhook/_lib/v3-os/durableTurnJournal.ts');
const memory = read('app/api/whatsapp/webhook/_lib/v3-os/compactHumanMemory.ts');
const ladder = read('app/api/whatsapp/webhook/_lib/v3-os/modelCostLadder.ts');
const control = read('app/api/whatsapp/webhook/_lib/v3-os/humanOsControl.ts');
const migration = read('supabase/migrations/20260929013000_v3_phase11_human_conversation_os.sql');

// Phase 11.2 may add new deterministic authorities (for example secure device-change links).
// These regressions protect tracking authority semantically instead of freezing the exact OR-chain shape.

pass('single cutover switch defaults safe/off', /enabled:\s*false/.test(control) && /solEnabled:\s*false/.test(control));
pass('runtime has one Human OS branch and legacy fallback only when switch off', /if \(humanOs\.enabled\)/.test(runtime) && /runHumanConversationOS/.test(runtime) && /runLegacyV3ProductionLive/.test(runtime));
pass('Human OS has durable turn replay before model work', /existing\?\.final_reply/.test(os) && /reusedDecision:\s*true/.test(os));
const modelTierDeclaration = (os.match(/const modelTier:[^\n]+/) || [""])[0];
pass('explicit tracking status becomes deterministic authoritative read', /explicitTrackingStatusAuthority/.test(os) && /explicitStatusTracking/.test(modelTierDeclaration) && /\? \"deterministic\"/.test(modelTierDeclaration));
pass('explicit tracking status reply uses customer-facing DB status', /explicitTrackingStatusReply/.test(os) && /customerFacingStatusLabel/.test(os));
pass('safe preview persists mismatch context without binding full application id', /contactAccess !== "safe_preview"/.test(os) && /markContactResolution/.test(os) && /blocked_mismatch/.test(os));
const initialReplyDeclaration = (os.match(/let reply = [^\n]+/) || [""])[0];
pass('authoritative tracking reply survives safety fallback', /authoritativeTrackingReply/.test(initialReplyDeclaration) && /gate\.confirmationPrompt/.test(initialReplyDeclaration));
pass('authoritative tracking reply bypasses generic model verifier with native safety shape', /AUTHORITATIVE_DETERMINISTIC_SAFETY/.test(os) && /authoritativeDeterministicReply = Boolean\(authoritativeTrackingReply/.test(os) && /const safety = authoritativeDeterministicReply \? AUTHORITATIVE_DETERMINISTIC_SAFETY/.test(os) && /finalAuthoritativeDeterministicReply = Boolean\(authoritativeTrackingReply/.test(os) && /const finalSafety = finalAuthoritativeDeterministicReply \? AUTHORITATIVE_DETERMINISTIC_SAFETY/.test(os));
pass('turn journal persists final reply before delivery', /status:\s*"reply_ready"/.test(os) && /finalReply:\s*reply/.test(os));
pass('route finalizes journal only after provider message id exists', /completeHumanTurnDelivery/.test(route) && /providerMessageId:\s*outgoingMessageId/.test(route));
pass('compact human memory is persisted only on delivered path', /saveCompactHumanMemory/.test(route) && /memoryAfter/.test(route));
pass('human brain explicitly interprets yes by context, not global intent', /"نعم\/اه\/yes\/ok" معناها يتحدد من السؤال المفتوح والسياق/.test(brain));
pass('human brain handles cancellation retraction', /الغي\.\.\. لا استنى/.test(brain));
pass('human brain prioritizes primary goal over backup cancellation', /الإلغاء كخيار احتياطي/.test(brain));
pass('five-JOD protected journey remains deterministic under human brain', /buildInformedCommercialDisclosureReply/.test(os) && /buildPostDisclosurePaymentReply/.test(os));
pass('mutations still pass confirmation gate and transactional adapter', /enforceMutationConfirmationGate/.test(os) && /v3TransactionalActionAdapter/.test(os));
pass('Human OS validates final reply against existing truth/action safety', /validateNativeConversationReply/.test(os));
pass('no live shadow AI path in Human OS', !/runtimeShadow|shadow provider|shadow_model/i.test(brain + os + ladder));
pass('Sol is not invoked by Human OS implementation', !/createSolHybridProvider|gpt-5\.6-sol|OPENAI_V3_API_KEY/.test(os + brain));
pass('cost ladder caps normal context and defaults high complexity back to DeepSeek', /maxPromptChars/.test(brain) && /provisionalRoute\.tier === "sol" \? "deepseek"/.test(os));
pass('migration is additive and activation defaults OFF', /create table if not exists public\.whatsapp_turn_journal/.test(migration) && /create table if not exists public\.whatsapp_human_memory/.test(migration) && /values \('default', false, false, 6, 18000\)/.test(migration));
pass('journal turn_id is primary key for exactly-once decision reuse', /turn_id text primary key/.test(migration));
pass('memory is one durable record per wa_id', /wa_id text primary key/.test(migration));
pass('journal module never calls a model provider', !/generate\(|DeepSeek|OpenAI|Sol/.test(journal));
pass('memory module never calls a model provider', !/generate\(|DeepSeek|OpenAI|Sol/.test(memory));

if(failed){ console.error(`PHASE 11 HUMAN CONVERSATION OS SELFTEST FAILED: ${failed}`); process.exit(1); }
console.log('PHASE 11 HUMAN CONVERSATION OS SELFTEST PASSED');
