const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = process.argv[2] || process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0;
let failed = 0;
function test(name, ok) {
  if (ok) { passed++; console.log(`PASS ${passed}: ${name}`); }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const tokenFile = 'app/api/whatsapp/webhook/_lib/v3-os/deviceChangeAuthority.ts';
const registryFile = 'app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts';
const routingFile = 'app/api/whatsapp/webhook/_lib/v3-os/applicationModificationRouting.ts';
const humanOsFile = 'app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts';
const nativeFile = 'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts';
const plannerFile = 'app/api/whatsapp/webhook/_lib/v3-os/planner.ts';
const writerFile = 'app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts';
const groundingFile = 'app/api/whatsapp/webhook/_lib/v3-os/groundingGuard.ts';
const pageFile = 'app/change-device/page.tsx';
const apiFile = 'app/api/change-device/route.ts';
const runtimeFile = 'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts';
const manualFile = 'app/api/whatsapp/webhook/_lib/v3-os/manualActionPolicy.ts';

for (const file of [tokenFile, registryFile, routingFile, humanOsFile, nativeFile, plannerFile, writerFile, groundingFile, pageFile, apiFile, runtimeFile, manualFile]) {
  test(`${file} exists`, fs.existsSync(path.join(root, file)));
}

const tokenSrc = read(tokenFile);
const registry = read(registryFile);
const routing = read(routingFile);
const humanOs = read(humanOsFile);
const native = read(nativeFile);
const planner = read(plannerFile);
const writer = read(writerFile);
const page = read(pageFile);
const api = read(apiFile);
const runtime = read(runtimeFile);
const manual = read(manualFile);

// Paid-only authority is the central Phase 11.2 invariant.
test('route has explicit paid-only states', /payment_confirmation_pending/.test(routing) && /unpaid_cancel_reapply/.test(routing));
test('secure link route requires paymentConfirmed', /if \(input\.paymentConfirmed\) route = "secure_device_link"/.test(routing));
test('payment-protected pending state never routes to secure link', /else if \(input\.paymentProtected\) route = "payment_confirmation_pending"/.test(routing));
test('true unpaid state routes to cancel-reapply guidance', /else route = "unpaid_cancel_reapply"/.test(routing));
test('pending-payment reply explicitly withholds link until admin confirmation', /رابط تغيير الجهاز ما بنطلعه قبل تأكيد الدفع رسميًا/.test(routing));
test('unpaid reply explicitly forbids device-change link', /رابط تغيير الجهاز مش متاح/.test(routing) && /إلغاء الطلب الحالي بعد تأكيدك بشكل منفصل/.test(routing));

// Token security + hard payment gate.
test('device token uses AES-256-GCM', /createCipheriv\("aes-256-gcm"/.test(tokenSrc) && /createDecipheriv\("aes-256-gcm"/.test(tokenSrc));
test('device token is domain-separated from service-role key', /TOKEN_KEY_DOMAIN/.test(tokenSrc) && /SUPABASE_SERVICE_ROLE_KEY/.test(tokenSrc));
test('token issuance itself requires authoritative payment', /device_change_requires_authoritative_payment/.test(tokenSrc) && /hasAuthoritativePaymentConfirmation\(input\.application\)/.test(tokenSrc));
test('row payment recheck uses canonical payment truth helper', /deviceChangeRowHasAuthoritativePaymentConfirmation/.test(tokenSrc) && /hasAuthoritativePaymentConfirmation\(app\)/.test(tokenSrc));
test('device token contains expiry, nonce and before snapshot', /expiresAt/.test(tokenSrc) && /nonce/.test(tokenSrc) && /before:/.test(tokenSrc));
test('device token action idempotency is nonce scoped', /device-change-link:\$\{claims\.applicationId\}:\$\{claims\.nonce\}/.test(tokenSrc));

// Price truth lock.
test('general catalog prices are stripped from WhatsApp truth', /priceJod:\s*null/.test(registry) && /website_catalog_unpriced/.test(registry));
test('iPhone 18 remains explicit price authority', /IPHONE18_PRODUCTS/.test(registry) && /iphone18_authoritative/.test(registry));
test('native prompt says only iPhone 18 prices are authoritative', /أسعار iPhone 18 فقط/.test(native));

// Human OS / legacy path must never generate a link before authoritative payment.
test('Human OS makes device change deterministic', /explicitStatusTracking \|\| explicitIdentityQuestion \|\| secureDeviceChangeRequested/.test(humanOs));
test('Human OS removes change_device from WhatsApp mutation plan', /filter\(\(action\) => action\.action !== "change_device"\)/.test(humanOs));
test('Human OS gates secure URL generation behind paymentConfirmed', /const secureDeviceLink = paymentConfirmed[\s\S]{0,180}buildSecureDeviceChangeUrl/.test(humanOs));
test('Human OS passes paymentProtected into routing', /paymentProtected,/.test(humanOs));
test('legacy runtime gates secure URL generation behind paymentConfirmed', /if \(isDeviceChange && paymentConfirmed && app/.test(runtime));
test('legacy runtime passes paymentProtected into routing', /paymentProtected,/.test(runtime));
test('device change removed from manual Facebook mutation set', /MANUAL_MUTATION_ACTIONS[\s\S]*change_application_data/.test(manual) && !/MANUAL_MUTATION_ACTIONS[\s\S]{0,120}"change_device"/.test(manual));
test('planner preserves paid/pending/unpaid distinction', /hasPaymentProtection\(truth\)/.test(planner) && /لا تعطِ رابط تغيير الجهاز/.test(planner));
test('writer contract explicitly limits secure link to authoritative paid orders', /مسموح فقط عندما Payment Truth يؤكد الدفع إداريًا/.test(writer));
test('native prompt knows all three device-change payment routes', /secure_device_link/.test(native) && /payment_confirmation_pending/.test(native) && /unpaid_cancel_reapply/.test(native));

// Page/API execution plane: defense in depth.
test('change-device page accepts opaque token only', /params\?\.t/.test(page) && !/params\?\.tracking/.test(page) && !/params\?\.phone/.test(page));
test('change-device page rechecks authoritative payment before form', /deviceChangeRowHasAuthoritativePaymentConfirmation/.test(page) && /الرابط غير متاح قبل تأكيد الدفع/.test(page));
test('change-device API rechecks authoritative payment before execution', /deviceChangeRowHasAuthoritativePaymentConfirmation/.test(api) && /payment_not_confirmed/.test(api));
test('change-device API validates token and stale before snapshot', /readDeviceChangeToken/.test(api) && /sameDeviceChangeSnapshot/.test(api) && /request_changed/.test(api));
test('change-device API respects global Real Actions control', /canV3ExecuteRealActions/.test(api) && /actions_disabled/.test(api));
test('change-device API executes existing audited RPC', /execute_whatsapp_v3_application_action/.test(api) && /p_action_type:\s*"change_device"/.test(api));
test('change-device API preserves same application and writes complete recalculation payload', /device_price/.test(api) && /monthly_payment/.test(api) && /total_with_interest/.test(api));

// Run the token codec itself with a stub paymentTruth module to prove paid-only issuance.
try {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key-phase11-2';
  let js = ts.transpileModule(tokenSrc, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: tokenFile,
  }).outputText;
  const originalRequire = Module.prototype.require;
  const m = new Module(path.join(root, tokenFile), module);
  m.filename = path.join(root, tokenFile);
  m.paths = module.paths;
  m.require = function(id) {
    if (id === './paymentTruth') return { hasAuthoritativePaymentConfirmation: (app) => String(app?.paymentStatus || '').toLowerCase() === 'confirmed' && Boolean(app?.paymentConfirmedAt) };
    return originalRequire.call(this, id);
  };
  m._compile(js, m.filename);
  const auth = m.exports;
  const paidApp = {
    id: 'app-123', trackingId: 'AM-1790999999999', fullName: 'Test User', phone: '0790000000', email: null,
    status: 'final_review', paymentStatus: 'confirmed', paymentConfirmedAt: '2026-09-29T12:00:00Z', paymentReference: 'admin-confirmed',
    deviceId: 'old-device', deviceName: 'Old Device', devicePrice: 999, installmentMonths: 36, downPayment: 0,
    interestRate: 0.2, monthlyPayment: 33, totalWithInterest: 1188, salary: null, deliveryDelayUntil: null,
  };
  const unpaidApp = { ...paidApp, id: 'app-unpaid', trackingId: 'AM-1790888888888', paymentStatus: 'pending_payment_confirmation', paymentConfirmedAt: null, paymentReference: null };
  const token = auth.issueDeviceChangeToken({ application: paidApp, waId: '962790000000' });
  const claims = auth.readDeviceChangeToken(token);
  test('paid application token round-trips valid claims', Boolean(claims && claims.applicationId === paidApp.id));
  let unpaidRejected = false;
  try { auth.issueDeviceChangeToken({ application: unpaidApp, waId: '962790000000' }); } catch (e) { unpaidRejected = String(e?.message || e).includes('device_change_requires_authoritative_payment'); }
  test('unpaid/pending application cannot receive a token', unpaidRejected);
  const mid = Math.floor(token.length / 2);
  const tampered = `${token.slice(0, mid)}${token[mid] === 'A' ? 'B' : 'A'}${token.slice(mid + 1)}`;
  test('tampered token is rejected', auth.readDeviceChangeToken(tampered) === null);
} catch (error) {
  console.error(error);
  test('token codec executable self-test', false);
}

console.log(`\nPhase 11.2 V3 paid-only focused assertions: ${passed + failed}; passed=${passed}; failed=${failed}`);
if (failed) process.exit(1);
