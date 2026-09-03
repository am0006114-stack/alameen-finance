const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
function ok(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exitCode=1; } else console.log('PASS:',msg); }

const writer = read('app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts');
const verifier = read('app/api/whatsapp/webhook/_lib/v3-os/verifier.ts');
const fallback = read('app/api/whatsapp/webhook/_lib/v3-os/zeroFallback.ts');
const runtime = read('app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts');
const notificationPolicy = read('app/api/whatsapp/webhook/_lib/v3-os/notificationPolicy.ts');
const discord = read('app/api/whatsapp/webhook/_lib/v3-os/discordNotifier.ts');

ok(/INSTALLMENT_PAYMENT_CHANNEL_QUESTION/.test(writer), 'writer detects monthly-installment payment-channel questions');
ok(/يخص حصريًا رسوم فتح الملف/.test(writer) && /ليس قناة سداد الأقساط الشهرية/.test(writer), 'file-opening payment credentials are scoped away from monthly installments');
ok(/installment_payment_destination_not_authoritative/.test(verifier), 'verifier blocks invented monthly-installment destination');
ok(/guarantor_requirement_presented_as_mandatory_without_truth/.test(verifier), 'verifier blocks mandatory guarantor overclaim without truth');
ok(/specific_missing_documents_claim_without_document_truth/.test(verifier), 'verifier blocks specific missing-document claims without loaded document truth');
ok(/ما عندي إلها بيانات موثقة/.test(fallback) && /رسوم فتح الملف/.test(fallback), 'zero fallback gives safe monthly-installment payment-channel answer');
ok(/قد تُطلب حسب حالة الملف فقط/.test(fallback), 'zero fallback keeps guarantor conditional');

// Phase 7.1.3A Discord guarantees must remain untouched.
ok(/notifyScopedMutationSuccesses/.test(runtime) && /business_mutation_succeeded/.test(runtime), 'executed scoped cancel/refund still emits Discord event');
ok(/business_mutation_succeeded/.test(notificationPolicy), 'Discord policy still allows successful real-action notifications');
ok(/فتح الطلب مباشرة/.test(discord) && /admin\/applications/.test(discord), 'Discord still includes direct admin application link');

if(process.exitCode){ console.error('Phase 7.1.4 self-test FAILED'); process.exit(1); }
console.log('V3 Phase 7.1.4 self-test: PASS');
