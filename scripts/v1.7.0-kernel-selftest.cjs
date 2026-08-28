const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const sourcePath = path.join(projectRoot, 'app', 'api', 'whatsapp', 'webhook', '_lib', 'conversationKernel.ts');
if (!fs.existsSync(sourcePath)) throw new Error(`Missing ${sourcePath}`);
const source = fs.readFileSync(sourcePath, 'utf8');
const out = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: sourcePath,
}).outputText;
const sandbox = { module: { exports: {} }, exports: {}, require, console };
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(out, sandbox, { filename: 'conversationKernel.js' });
const k = sandbox.module.exports;

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function app(overrides = {}) {
  return { id: 'app-1', tracking_id: 'AM-1234567890123', status: 'under_review', payment_status: 'confirmed', ...overrides };
}
function analyze(customerText, currentIntent = 'unknown', application = app(), memory = {}) {
  return k.analyzeConversationTurn({ customerText, currentIntent, application, memory, messageType: 'text' });
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('AMENPAY confirmation routes to payment recipient', () => {
  const t = analyze('رح احول لهاد AMENPAY تمام؟', 'greeting', app({ payment_status: 'pending' }));
  assert(t.primaryGoal === 'payment_alias_confirmation', t.primaryGoal);
  assert(t.intentOverride === 'payment_recipient', t.intentOverride);
  assert(/AMENPAY/.test(t.immediateReply), t.immediateReply);
});


test('confirmed payment blocks alias re-payment', () => {
  const t = analyze('رح احول لهاد AMENPAY تمام؟', 'greeting', app({ payment_status: 'confirmed' }));
  assert(/فلا تحول أي مبلغ جديد/.test(t.immediateReply), t.immediateReply);
});

test('total until last installment never becomes fee payment', () => {
  const t = analyze('كم إجمالي المبلغ الذي سأدفعه حتى آخر قسط', 'payment_amount');
  assert(t.primaryGoal === 'total_payable', t.primaryGoal);
  assert(!/التحويل إلى|AMEEENPAY/.test(t.immediateReply), t.immediateReply);
  assert(/مش ظاهر|ما رح أخمن/.test(t.immediateReply), t.immediateReply);
});

test('post approval installment payment separated from opening fee', () => {
  const t = analyze('بعد الموافقه اي خدمه ع اي فواتير مشان دفع القسط', 'payment');
  assert(t.primaryGoal === 'post_approval_installment_payment', t.primaryGoal);
  assert(!/AMEEENPAY|AMENPAY/.test(t.immediateReply), t.immediateReply);
});

test('cancelled + continue routes to reopen', () => {
  const t = analyze('اود الاستمرار ما تلغو طلبي', 'continue_decision', app({ status: 'cancelled', payment_status: 'none' }));
  assert(t.primaryGoal === 'reopen_cancelled', t.primaryGoal);
  assert(t.intentOverride === 'reopen_cancelled_request', t.intentOverride);
});

test('refund durable state beats fee inquiry wording', () => {
  const a = app({ status: 'refund_requested', payment_status: 'refund_requested' });
  const t = analyze('الحالة الحالية: طلب الاسترداد مسجل ارغب بمعرفة آخر تحديث', 'order_status', a);
  assert(t.primaryGoal === 'refund_status', t.primaryGoal);
  assert(/طلب الاسترداد مسجل/.test(t.immediateReply), t.immediateReply);
});

test('unsupported message cannot invent supplier delay', () => {
  const t = k.analyzeConversationTurn({ customerText: 'تم استلام رسالة واتساب من نوع unsupported.', currentIntent: 'delivery', application: app(), messageType: 'unsupported' });
  assert(t.primaryGoal === 'unsupported_media', t.primaryGoal);
  assert(!/مورد|اجهزه|أجهزة/.test(t.immediateReply), t.immediateReply);
});

test('installment duration change creates review action', () => {
  const t = analyze('اريد تعديل عدد الدفعات بدال 36 شهر 24 شهر', 'payment');
  assert(t.primaryGoal === 'application_change_installment_duration', t.primaryGoal);
  assert(t.actionRequestType === 'installment_plan_change_review', t.actionRequestType);
});

test('general phone change creates review action', () => {
  const t = analyze('اريد تعديل معلومات الهاتف بالطلب', 'order_status');
  assert(t.primaryGoal === 'application_change_general', t.primaryGoal);
  assert(t.actionRequestType === 'application_data_change_review', t.actionRequestType);
});

test('natural phone change question routes to review action', () => {
  const t = analyze('هل يمكنني تغيير رقم الهاتف ؟؟ بالطلب', 'order_status');
  assert(t.primaryGoal === 'application_change_general', t.primaryGoal);
  assert(t.actionRequestType === 'application_data_change_review', t.actionRequestType);
});

test('later installment payments question is post approval payment', () => {
  const t = analyze('طيب سوال بعدين كيف الدفعات', 'payment_method');
  assert(t.primaryGoal === 'post_approval_installment_payment', t.primaryGoal);
  assert(!/AMEEENPAY|AMENPAY/.test(t.immediateReply), t.immediateReply);
});

test('independence concern gets direct independence statement', () => {
  const t = analyze('الشركة وهمية شركة الامين مختلفة تماماً عن الي انت بتقدمه', 'scam_accusation');
  assert(t.primaryGoal === 'business_independence', t.primaryGoal);
  assert(/مستقلة تمامًا/.test(t.immediateReply), t.immediateReply);
});

test('official website request gets website', () => {
  const t = analyze('اعطيني موقع الشركة الرسمي', 'scam_accusation');
  assert(t.primaryGoal === 'business_website', t.primaryGoal);
  assert(/ameenfinance\.co/.test(t.immediateReply), t.immediateReply);
});

test('accredited claim question gets safe regulatory wording', () => {
  const t = analyze('تمام بدي اتاكد منكم جهه معتمده', 'installment_info');
  assert(t.primaryGoal === 'business_verification', t.primaryGoal);
  assert(/ما بنوصف/.test(t.immediateReply), t.immediateReply);
});

test('short payment timing follows recent payment context', () => {
  const t = analyze('كم معي من هون لاحول ؟', 'unknown', app({ payment_status: 'pending' }), { isPaymentAssistanceActive: true });
  assert(t.primaryGoal === 'payment_timing', t.primaryGoal);
  assert(t.intentOverride === 'payment_timing', t.intentOverride);
});

test('final guard fixes cancelled contradiction', () => {
  const out = k.applyConversationKernelReplyGuard({ customerText: 'اود الاستمرار الطلب', currentIntent: 'continue_decision', application: app({ status: 'cancelled' }), reply: 'تمام، طلبك مستمر وحالته الحالية: الطلب ملغي.' });
  assert(!(/طلبك مستمر/.test(out) && /ملغي/.test(out)), out);
  assert(/إعادة تفعيل/.test(out), out);
});

test('final guard respects active refund', () => {
  const a = app({ status: 'refund_requested', payment_status: 'refund_requested' });
  const out = k.applyConversationKernelReplyGuard({ customerText: 'طلب الاسترداد مسجل شو صار', currentIntent: 'order_status', application: a, reply: 'سؤالك استفسار وليس طلب استرداد.' });
  assert(/طلب الاسترداد مسجل/.test(out), out);
});

test('final guard prevents generic fallback for change request', () => {
  const out = k.applyConversationKernelReplyGuard({ customerText: 'اريد تعديل معلومات الهاتف', currentIntent: 'unknown', application: app(), reply: 'فاهم عليك. احكيلي شو النقطة اللي مقلقتك.' });
  assert(/تعدل بيانات الطلب/.test(out), out);
});

test('final guard blocks broad accredited claim', () => {
  const out = k.applyConversationKernelReplyGuard({ customerText: 'هل انتو معتمدين', currentIntent: 'trust_verification', application: app(), reply: 'الأمين للأقساط جهة أردنية معتمدة لتقسيط الأجهزة.' });
  assert(!/جهة أردنية معتمدة/.test(out), out);
  assert(/ما بنوصف/.test(out), out);
});

test('final guard catches incomplete connector', () => {
  const out = k.applyConversationKernelReplyGuard({ customerText: 'هل السبت تطلع المعامله', currentIntent: 'order_status', application: app(), reply: 'طلبك لسا قيد الدراسة، وما في تأكيد إن' });
  assert(!/تأكيد إن\s*$/.test(out), out);
  assert(/انقطع/.test(out), out);
});

let passed = 0;
for (const [name, fn] of tests) {
  fn();
  passed += 1;
  console.log(`PASS ${passed}/${tests.length}: ${name}`);
}
console.log(`SELFTEST PASS - ${passed}/${tests.length} conversation-kernel regressions`);
