const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const tr=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}
const rel={
  commercial:'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
  runtime:'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
  admin:'app/admin/page.tsx',
  detail:'app/admin/applications/[id]/page.tsx',
  continueRoute:'app/api/continue-decision/route.ts',
};
for(const [name,file] of Object.entries(rel))ok(fs.existsSync(path.join(root,file)),`${name} source exists`);
const src={};for(const [k,v] of Object.entries(rel))src[k]=read(v);
const commercial=loadTs(path.join(root,rel.commercial));

// A. Numeric shortcut is deterministic and deliberately narrow.
ok(commercial.numericContinuationShortcutText('1')===true,'western digit 1 is accepted as continuation shortcut');
ok(commercial.numericContinuationShortcutText('١')===true,'Arabic-Indic digit ١ is accepted as continuation shortcut');
ok(commercial.numericContinuationShortcutText('1!')===true,'harmless punctuation around shortcut is accepted');
ok(commercial.numericContinuationShortcutText('11')===false,'multi-digit values never become continuation');
ok(commercial.numericContinuationShortcutText('1 بدي الغي')===false,'numeric shortcut cannot swallow another instruction');
ok(commercial.numericContinuationShortcutText('نعم')===false,'ordinary natural confirmation stays on the semantic path');
ok(/اكتب الرقم 1/.test(commercial.buildInformedCommercialDisclosureReply({policy:{fileOpeningFeeJod:5,normalReviewWindow:'من يومين إلى 3 أيام عمل'}})),'protected commercial disclosure exposes the number-1 CTA');

// B. Shortcut is stage scoped and cannot bypass informed disclosure.
ok(/applicationJourneyStage\(truthBeforeActions\.application\) === "preliminary_approved_waiting_decision"[\s\S]{0,180}numericContinuationShortcutText\(effectiveCustomerText\)/.test(src.runtime),'number 1 is enabled only while waiting for the continuation decision');
ok(/const disclosureRequiredThisTurn = shouldExplainCommercialStep/.test(src.runtime),'informed-disclosure gate remains authoritative');
ok(/const continuationDecisionThisTurn = !disclosureRequiredThisTurn/.test(src.runtime),'number 1 cannot persist continuation on the same turn that still requires disclosure');
ok(src.runtime.indexOf('persistExplicitContinuation({') < src.runtime.indexOf('event: "customer_continue_payment_ready"'),'application persistence happens before continuation ledger/Discord emission');
ok(/if \(continuationPersistence\.updated\) \{[\s\S]*event: "customer_continue_payment_ready"/.test(src.runtime),'continuation event is emitted only after successful persistence');
ok((src.runtime.match(/event: "customer_continue_payment_ready"/g)||[]).length===1,'runtime has one canonical continuation event producer');
ok(!/أرسلت له خطوة 5 دنانير/.test(src.runtime),'Discord no longer claims payment instructions were sent before final egress succeeds');
ok(/"مصدر القرار": numericContinuationShortcut \? "واتساب — الرقم 1" : "واتساب — تأكيد صريح"/.test(src.runtime),'ledger payload records how the continuation decision was made');

// C. Web-page continuation joins the same durable ledger instead of a separate dark path.
ok(/notifyV3Discord/.test(src.continueRoute),'web continuation route uses the durable V3 notification ledger');
ok(/event: "customer_continue_payment_ready"/.test(src.continueRoute),'web continuation emits the canonical continuation event');
ok(/"مصدر القرار": "صفحة التأهيل المبدئي"/.test(src.continueRoute),'web continuation records its source');
ok(/payment_status = "pending_payment"/.test(src.continueRoute),'web continuation uses the canonical pending-payment status');
ok(!/AMEENPAY|Orang-Money/.test(src.continueRoute),'web continuation no longer leaks legacy payment destination text');
ok(!/إرسال صورة وصل الدفع عبر واتساب/.test(src.continueRoute),'web continuation no longer asks for receipt evidence through WhatsApp');
ok(/رابط رفع الوصل الرسمي المرتبط بطلبي/.test(src.continueRoute),'web continuation explicitly asks for the official receipt path');

// D. Admin funnel separates decision, receipt upload, and payment confirmation.
ok(/from\("whatsapp_v3_notification_ledger"\)/.test(src.admin),'admin dashboard reads durable continuation events');
ok(/new Set\([\s\S]{0,220}application_id/.test(src.admin),'24-hour continuation metric counts unique applications, not duplicate notifications');
const paymentFn=(src.admin.match(/function isPaymentAwaitingConfirmation\(app: Application\) \{[\s\S]*?\n\}/)||[''])[0];
ok(Boolean(paymentFn),'payment-awaiting helper exists');
ok(!/customer_confirmed_continue/.test(paymentFn),'choosing continuation is no longer mislabeled as payment awaiting admin confirmation');
ok(/function isAwaitingFileOpeningFee/.test(src.admin)&&/customer_confirmed_continue/.test(src.admin),'admin has a distinct waiting-for-5-JOD queue');
ok(/لوحة التحويل التجاري — آخر 24 ساعة/.test(src.admin),'admin exposes a commercial funnel panel');
ok(/اختاروا الاستمرار/.test(src.admin)&&/رفعوا وصل الدفع/.test(src.admin)&&/دفع مؤكد إداريًا/.test(src.admin),'admin funnel exposes the three post-approval milestones separately');

// E. Application detail keeps the historical decision visible after status changes.
ok(/سجل التحويل التجاري/.test(src.detail),'application detail contains a commercial history section');
ok(/latestContinuationEvent/.test(src.detail),'application detail reads the durable continuation event');
ok(/المصدر:/.test(src.detail),'application detail shows the decision source');
ok(/للاستمرار اكتب الرقم:[\s\S]*\n1/.test(src.detail),'admin-generated preliminary message uses the simple number-1 instruction');
ok(!/الأمين للأقساط والتمويل`/.test(src.detail),'admin-generated customer message uses the official business name');
ok(/currentFileOpeningPaymentRule/.test(src.detail),'admin payment message uses the canonical payment-destination source');
ok(/بعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك/.test(src.detail),'admin payment message sends customers to the official receipt link');
ok(!/بعد التحويل يرجى إرسال صورة أو لقطة شاشة لوصل الدفع عبر واتساب/.test(src.detail),'admin payment message no longer requests receipt evidence through WhatsApp');

for(const file of Object.values(rel))transpile(file);
console.log(`\nV3 PHASE 11.8.0 PAYMENT FUNNEL SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed)process.exit(1);
console.log('Payment funnel control plane + deterministic continuation shortcut: PASS');
