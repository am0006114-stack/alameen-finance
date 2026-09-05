const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = process.argv[2] || process.cwd();
function read(rel){ return fs.readFileSync(path.join(root,rel),'utf8'); }
let passed=0;
function ok(cond,msg){ if(!cond) throw new Error('FAIL: '+msg); passed++; console.log('PASS:',msg); }
const files=[
  'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/humanJourney.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/verifier.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/zeroFallback.ts',
];
const t=Object.fromEntries(files.map(f=>[f,read(f)]));
for(const [f,s] of Object.entries(t)){
  const out=ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:f});
  const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  ok(errs.length===0,'TypeScript syntax '+f);
}
const cp=t[files[0]], cr=t[files[1]], hj=t[files[2]], rt=t[files[3]], vr=t[files[4]], wc=t[files[5]], zf=t[files[6]];
ok(cp.includes('isContinuationRevenueReady'),'single continuation revenue-readiness helper exists');
ok(cp.includes('"preliminary_qualified", "customer_confirmed_continue"'),'revenue readiness survives admin status persistence');
ok(cp.includes('hasAuthoritativePaymentConfirmation(app)'),'confirmed payment blocks duplicate 5 JOD');
ok(cp.includes('paymentReceiptUploaded'),'pending receipt blocks duplicate 5 JOD');
ok(cr.includes('(?:بدي|حاب|حابه|حابة)\\s+(?:افتح|أفتح|فتح)\\s+(?:ال)?ملف'),'natural بدي افتح ملف wording is continuation');
ok(cr.includes('buildMandatoryFiveJodContinuationReply'),'mandatory 5 JOD reply has dedicated deterministic function');
ok(cr.includes('isContinuationRevenueReady(app)'),'continuation reply no longer depends only on post-persistence commercial state');
ok(rt.includes('explicitContinuationText(input.customerText)'),'raw explicit continuation independently drives commercial decision');
ok(rt.includes('truthAtContinuationDecision'),'pre-persistence authoritative truth is preserved');
ok(rt.includes('continuationRevenueReadyAtDecision'),'5 JOD eligibility is captured before admin status mutation');
ok(rt.includes('const protectedFiveJodStep = continuationRevenueReadyAtDecision'),'final revenue guard cannot be erased by status refresh');
ok(rt.includes('buildMandatoryFiveJodContinuationReply') && rt.includes('truthAtContinuationDecision'),'mandatory payment reply uses decision-time truth/link context');
ok(/if \(explicitContinue && protectedFiveJodStep\)/.test(rt),'Discord continuation follows same protected revenue decision');
ok(rt.includes('isLowInformationCustomerTurn(input.customerText) && runtimeNearDuplicate'),'duplicate suppression is restricted to low-information turns');
ok(!rt.includes('return `ما في تحديث جديد عن آخر حالة'),'runtime no longer emits robotic unchanged-status template');
ok(!rt.includes('رقم الطلب المرتبط بالمحادثة عندي'),'runtime last resort no longer emits robotic tracking phrase');
ok(rt.indexOf('} else if (writer) {') < rt.indexOf('const deterministicJourneyRescue = humanJourneyReply || recoveryReply'),'normal conversation gets writer-first human wording before deterministic rescue');
ok(rt.includes('shouldPrioritizeConversationRecovery'),'only truth-critical recovery paths pre-empt the writer');
ok(wc.includes('أنت تكمل محادثة مع شخص، مش شاشة حالة'),'writer explicitly operates as human dialogue, not a status API');
ok(wc.includes('لا تنهِ كل رد بـ"هل في شي ثاني؟"'),'writer avoids robotic closing ritual');
ok(wc.includes('لا تنتظر تنفيذًا إداريًا إضافيًا قبل إعطائه خطوة 5 دنانير'),'writer cannot invent admin gate before 5 JOD');
ok(vr.includes('preliminary_approval_5_jod_next_step_missing'),'verifier requires 5 JOD next step on preliminary approval status');
ok(vr.includes('preliminary_approval_review_window_missing'),'verifier requires review duration on preliminary approval status');
ok(vr.includes('unverified_contact_number_change_claim'),'verifier blocks false promise to route updates to another number');
ok(vr.includes('invented_admin_gate_before_5_jod'),'verifier blocks invented admin gate after continuation');
ok(cr.includes('explicitContactNumberChangeRequest'),'contact-number change is explicitly recognized');
ok(rt.includes('العميل طلب تغيير رقم التواصل على الطلب'),'contact-number change triggers actionable Discord alert');
ok(cr.includes('ما رح أقول إن رقم التواصل تغيّر'),'customer is told contact number was not changed without execution');
ok(hj.includes('هاي مش الموافقة النهائية لسا'),'fallback preliminary journey explains status naturally');
ok(hj.includes('الدراسة النهائية عادة ${window}'),'fallback preliminary journey includes expected review window');
ok(!zf.includes('اكتب سؤالك مباشرة'),'zero fallback keeps robotic ask-your-question phrase removed');
ok(rt.includes('LIVE_SCOPED_MUTATIONS'),'scoped mutation architecture retained');
ok(rt.includes('cancel_application') && rt.includes('request_refund'),'cancel/refund flow references retained');
console.log(`SELFTEST PASSED ${passed}/${passed} - V3 PHASE 7.2.1 HUMAN DIALOGUE + REVENUE LOCK`);
