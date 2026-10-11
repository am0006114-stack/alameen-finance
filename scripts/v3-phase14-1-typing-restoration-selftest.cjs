const assert = require('assert');
const fs = require('fs');

const route = fs.readFileSync('app/api/whatsapp/webhook/route.ts', 'utf8');
const start = route.indexOf('async function sendWhatsAppTypingIndicator');
const end = route.indexOf('type WhatsAppSendAttempt', start);
assert(start >= 0 && end > start, 'typing indicator function missing');
const fn = route.slice(start, end);

assert(fn.includes('WHATSAPP_TYPING_INDICATOR_ENABLED", true'), 'typing indicator must remain enabled by default');
assert(fn.includes('WHATSAPP_TYPING_GRAPH_API_VERSION'), 'typing-specific Graph API override missing');
assert(fn.includes('configuredTypingGraphMajor >= 25'), 'retired/old Graph API versions must not own typing call');
assert(fn.includes(': "v25.0"'), 'supported v25 fallback missing');
assert(!fn.includes('process.env.GRAPH_API_VERSION || "v20.0"'), 'retired v20 typing fallback still present');
assert(fn.includes('status: "read"'), 'typing call must mark inbound message read');
assert(fn.includes('message_id: cleanMessageId'), 'typing call must target inbound WhatsApp message id');
assert(fn.includes('typing_indicator:'), 'typing indicator payload missing');
assert(fn.includes('type: "text"'), 'typing indicator text type missing');
assert(route.includes('await sendWhatsAppTypingIndicator(message.id);'), 'typing call must run for incoming message before reply processing');

console.log('PASS Phase 14.1 WhatsApp typing restoration selftest');
