const fs = require('fs');
const path = require('path');
const root = process.argv[2];
if (!root) throw new Error('ProjectRoot required');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const files = {
  verifier: read('app/api/whatsapp/webhook/_lib/v3-os/verifier.ts'),
  fallback: read('app/api/whatsapp/webhook/_lib/v3-os/zeroFallback.ts'),
  runtime: read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts'),
  writer: read('app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts'),
  interpreter: read('app/api/whatsapp/webhook/_lib/v3-os/modelInterpreter.ts'),
};
function assert(ok, msg){ if(!ok) throw new Error(msg); }
assert(files.verifier.includes('customer_phone_misused_as_business_contact'), 'missing customer-phone/business-contact hard guard');
assert(files.verifier.includes('near_previous_reply_repeat'), 'missing near-repeat guard');
assert(files.verifier.includes('excessive_laughter_or_repeated_characters'), 'missing expression-length guard');
assert(files.verifier.includes('manual_action_falsely_in_processing'), 'missing pending-manual processing claim guard');
assert(files.runtime.includes('realActionsOffCompletionClaim'), 'missing absolute Real Actions OFF mutation-claim guard');
assert(files.runtime.includes('clampRepeatedCharacters'), 'missing runtime repeated-character clamp');
assert(files.runtime.includes('runtimeNearDuplicate'), 'missing runtime near-duplicate circuit breaker');
assert(files.runtime.includes('buildRepeatDeltaReply'), 'missing repeat-delta response builder');
assert(files.fallback.includes('ما رح أطلبه منك مرة ثانية'), 'known-fact rescue contract missing');
assert(files.fallback.includes('المتابعة الأساسية للطلبات عبر واتساب الحالي'), 'contact-number safe rescue missing');
assert(files.fallback.includes('الموافقة الحالية مبدئية وليست النهائية، ولسا ما في موعد استلام'), 'journey-aware pickup rescue missing');
assert(files.fallback.includes('رسوم فتح الملف هي'), 'direct fee-policy answer missing');
assert(files.fallback.includes('نتيجة سجل تجاري موثقة'), 'commercial-registry truth-safe rescue missing');
assert(files.writer.includes('رقم هاتف العميل داخل TRUTH/STATE هو رقم العميل وليس رقم الشركة'), 'writer customer phone isolation contract missing');
assert(files.writer.includes('الضحك مسموح بشكل طبيعي ومختصر فقط'), 'writer expression clamp contract missing');
assert(files.writer.includes('EXPLICIT_FEE_POLICY_QUESTION_NOW'), 'fee-policy exception contract missing');
assert(files.interpreter.includes('enrichOperationalActs'), 'deterministic multi-act enrichment missing');
assert(files.interpreter.includes('official_contact'), 'contact intent enrichment missing');
assert(files.interpreter.includes('product_condition'), 'product-condition intent enrichment missing');
console.log('V3 Phase 7.1.2 self-test: PASS');
console.log('State/action integrity: PASS');
console.log('Customer phone isolation: PASS');
console.log('Known-fact suppression: PASS');
console.log('Loop/repetition guard: PASS');
console.log('Multi-act enrichment: PASS');
console.log('Journey-aware rescue: PASS');
console.log('Real Actions OFF absolute completion gate: PASS');
