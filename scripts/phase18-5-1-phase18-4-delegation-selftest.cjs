const fs = require('fs');

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`missing ${path}`);
  return fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}
function must(condition, message) {
  if (!condition) throw new Error(message);
}

const presentation = read('app/api/telegram/_lib/presentation.ts');
const summary = read('app/api/telegram/_lib/orderSummary.ts');
const route = read('app/api/telegram/webhook/route.ts');
const hold = read('app/api/telegram/_lib/intelligenceHold.ts');

// Preserve the Phase 18.4 presentation contract itself.
for (const marker of [
  'telegramPresentationIntent',
  'buildTelegramStatusReply',
  'telegramNextStep',
  'polishTelegramReply',
  '📌 وضع طلبك الحالي:',
  '✅ الخطوة التالية:',
  'رسوم فتح الملف 5 دنانير فقط',
  'applicationJourneyStage',
  'customerFacingStatusLabel',
]) {
  must(presentation.includes(marker), `Phase 18.4 presentation marker missing: ${marker}`);
}

for (const forbidden of ['0788500337', 'PAYAMEEEN', 'AMEEN1ST', 'AM500337']) {
  must(!presentation.includes(forbidden) && !summary.includes(forbidden), `Phase 18.4 presentation must not hard-code payment destination: ${forbidden}`);
}

for (const marker of [
  '🌟 ملخص طلبك',
  '📱 الجهاز:',
  '💰 السعر:',
  '📆 التقسيط:',
  '📌 حالة الطلب:',
  '🔖 رقم الطلب:',
  '✅ الخطوة التالية:',
]) {
  must(summary.includes(marker), `Phase 18.4 summary marker missing: ${marker}`);
}

// Phase 18.5.1 intentionally moves the Phase 18.4 deterministic presentation
// decision from the immediate webhook into the 20-second durable intelligence
// worker. Verify the same semantic ordering across the delegated boundary.
must(route.includes('enqueueTelegramIntelligenceHold'), 'Telegram webhook must delegate linked dialogue to intelligence hold');
must(route.includes('if (telegramLinkAiPaused(link))'), 'Phase 18.4 human takeover guard missing from Telegram webhook');
must(route.includes('if (!config.aiEnabled)'), 'Phase 18.4 Telegram AI enable guard missing from webhook');

const takeoverPos = route.indexOf('if (telegramLinkAiPaused(link))');
const aiEnabledPos = route.indexOf('if (!config.aiEnabled)');
const enqueuePos = route.indexOf('await enqueueTelegramIntelligenceHold({');
must(takeoverPos >= 0 && aiEnabledPos >= 0 && enqueuePos >= 0 && takeoverPos < enqueuePos && aiEnabledPos < enqueuePos,
  'Human takeover and AI enable guards must run before Telegram dialogue is queued');

for (const marker of [
  'telegramPresentationIntent(customerText)',
  'buildTelegramStatusReply(link.application_id)',
  'buildTelegramOrderSummary(link.application_id)',
  'polishTelegramReply(reply);',
  'runV3ProductionLive({',
  'realActionsEnabled: config.realActionsEnabled && control.realActionsEnabled',
]) {
  must(hold.includes(marker), `Delegated Phase 18.4 marker missing from intelligence hold: ${marker}`);
}

const presentationPos = hold.indexOf('telegramPresentationIntent(customerText)');
const v3Pos = hold.indexOf('runV3ProductionLive({');
must(presentationPos >= 0 && v3Pos >= 0 && presentationPos < v3Pos,
  'Deterministic presentation must still run before V3 for recognized single-message read-only intents');

must(hold.includes('if (telegramLinkAiPaused(link))'), 'Human takeover guard missing in Telegram intelligence worker');
must(hold.includes('if (!config.aiEnabled)'), 'Telegram AI enable guard missing in intelligence worker');
must(hold.includes('rows.length === 1 ? telegramPresentationIntent(customerText) : null'),
  'Single-message deterministic presentation gate missing after 20-second hold');

console.log('PHASE 18.4 PRESENTATION CONTRACT THROUGH 18.5.1 DELEGATED HOLD SELFTEST PASS');
