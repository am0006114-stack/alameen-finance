const fs = require('fs');

function read(path){ return fs.readFileSync(path,'utf8'); }
function assert(cond,msg){ if(!cond) throw new Error(msg); }

const continuity = read('app/api/whatsapp/webhook/_lib/v3-os/conversationContinuityAuthority.ts');
const stateStore = read('app/api/whatsapp/webhook/_lib/v3-os/stateStore.ts');
const os = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts');
const arbiter = read('app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts');
const route = read('app/api/whatsapp/webhook/route.ts');
const brain = read('app/api/whatsapp/webhook/_lib/v3-os/humanConversationBrain.ts');

assert(continuity.includes('reconcileDeliveredConversationState'), 'generic delivered-state reconciliation missing');
assert(continuity.includes('likelyContextualAnswerToAssistantPrompt'), 'generic contextual-answer authority missing');
assert(continuity.includes('explicitCurrentTurnPaymentExecution'), 'explicit payment execution gate missing');
assert(!continuity.includes('العربي الاسلامي') && !continuity.includes('البنك العربي'), 'continuity authority must not be bank-specific');

assert(stateStore.includes('whatsapp_turn_journal'), 'state store does not recover from durable turn journal');
assert(stateStore.includes('.eq("status", "completed")'), 'state recovery is not restricted to completed delivered turns');
assert(stateStore.includes('reconcileDeliveredConversationState'), 'state store does not reconcile durable delivered state');
assert(stateStore.includes('.limit(8)'), 'state store does not inspect multiple completed turns for out-of-order completion safety');
assert(stateStore.includes('if (delivered?.state) return delivered.state'), 'journal is not a fallback when the projection read fails');
assert(continuity.includes('time(delivered.updatedAt) || time(input.deliveredAt)'), 'reconciliation can still prefer late completion time over newer semantic state time');

const completeIndex = route.indexOf('Phase 15 atomic conversation continuity');
const stateSaveIndex = route.indexOf('await saveV3ConversationState(stateToPersist)');
assert(completeIndex >= 0 && stateSaveIndex >= 0 && completeIndex < stateSaveIndex, 'delivered journal must commit before slower conversation-state save');
const outgoingLogIndex = route.indexOf('await logMessage({', completeIndex);
assert(outgoingLogIndex < 0 || completeIndex < outgoingLogIndex, 'delivered journal must commit before outgoing message analytics/log persistence');
const logAiIndex = route.indexOf('await logAiConversation({', completeIndex);
assert(logAiIndex < 0 || completeIndex < logAiIndex, 'delivered journal must commit before AI analytics logging');

assert(os.includes('likelyContextualAnswerToAssistantPrompt'), 'Human OS does not use generic contextual answer authority');
assert(os.includes('contextualAnswerOwnsTurn'), 'contextual answer ownership guard missing');
assert(!os.includes('function contextualBankCliqFollowup'), 'bank-specific conversational patch still owns runtime');
assert(!os.includes('makeContextualBankCliqTurn'), 'bank-specific synthetic turn still owns runtime');
assert(os.includes('explicitCurrentTurnPaymentExecution(turn.rawText)'), 'payment execution still depends on soft topic classification');
assert(!os.includes('turn.topics.some((topic) => ["payment_fee","payment_method","payment_timing","payment_recipient","receipt_upload"].includes(topic)) return true;'), 'soft payment topics can still auto-enter payment execution');

assert(arbiter.includes('MODEL_NATIVE_SOFT_OBLIGATIONS'), 'model-native soft obligation boundary missing');
assert(arbiter.includes('model-native conversational answer preserved'), 'arbiter still lacks model-native early acceptance');

assert(brain.includes('لا تكرر آخر رد بصياغته إذا العميل أعطاك المعلومة التي طلبتها'), 'brain continuity contract missing');
assert(!brain.includes('إذا كانت الرسالة الحالية اسم بنك فقط وجاءت جوابًا لسؤال سابق عن CliQ'), 'brain still contains domain-specific bank patch instead of generic conversational rule');

console.log('PHASE 15 MODEL-NATIVE ATOMIC CONVERSATION SELFTEST PASS');
