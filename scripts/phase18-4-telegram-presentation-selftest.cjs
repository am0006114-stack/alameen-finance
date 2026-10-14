const fs = require('fs');

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`missing ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const presentation = read('app/api/telegram/_lib/presentation.ts');
const summary = read('app/api/telegram/_lib/orderSummary.ts');
const route = read('app/api/telegram/webhook/route.ts');

const requiredPresentation = [
  'telegramPresentationIntent',
  'buildTelegramStatusReply',
  'telegramNextStep',
  'polishTelegramReply',
  '📌 وضع طلبك الحالي:',
  '✅ الخطوة التالية:',
  'رسوم فتح الملف 5 دنانير فقط',
  'applicationJourneyStage',
  'customerFacingStatusLabel',
];
for (const marker of requiredPresentation) {
  if (!presentation.includes(marker)) throw new Error(`presentation marker missing: ${marker}`);
}

for (const forbidden of ['0788500337', 'PAYAMEEEN', 'AMEEN1ST', 'AM500337']) {
  if (presentation.includes(forbidden) || summary.includes(forbidden)) {
    throw new Error(`presentation must not hard-code payment destination: ${forbidden}`);
  }
}

const requiredSummary = [
  '🌟 ملخص طلبك',
  '📱 الجهاز:',
  '💰 السعر:',
  '📆 التقسيط:',
  '📌 حالة الطلب:',
  '🔖 رقم الطلب:',
  '✅ الخطوة التالية:',
];
for (const marker of requiredSummary) {
  if (!summary.includes(marker)) throw new Error(`summary marker missing: ${marker}`);
}

const requiredRoute = [
  'telegramPresentationIntent(effectiveBody)',
  'buildTelegramStatusReply(link.application_id)',
  'buildTelegramOrderSummary(link.application_id)',
  'handled: `telegram_presentation_${presentationIntent}`',
  'reply = polishTelegramReply(reply);',
  'realActionsEnabled: config.realActionsEnabled && control.realActionsEnabled',
];
for (const marker of requiredRoute) {
  if (!route.includes(marker)) throw new Error(`route marker missing: ${marker}`);
}

const presentationPos = route.indexOf('telegramPresentationIntent(effectiveBody)');
const v3Pos = route.indexOf('runV3ProductionLive({');
if (presentationPos < 0 || v3Pos < 0 || presentationPos > v3Pos) {
  throw new Error('deterministic presentation must run before V3 for recognized read-only display intents');
}

if (!route.includes('if (telegramLinkAiPaused(link))')) throw new Error('human takeover guard missing');
if (!route.includes('if (!config.aiEnabled)')) throw new Error('telegram AI enable guard missing');

console.log('PHASE 18.4 TELEGRAM PRESENTATION SELFTEST PASS');
