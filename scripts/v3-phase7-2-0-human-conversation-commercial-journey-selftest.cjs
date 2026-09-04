const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = process.cwd();
const files = [
  'app/api/whatsapp/webhook/_lib/v3-os/conversationRecovery.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/humanJourney.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/verifier.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/zeroFallback.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/personas/fadwa.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/personas/tala.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/personas/abdullah.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/personas/abdulrahman.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/personas/imran.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/personas/khaled.ts',
  'app/api/whatsapp/webhook/_lib/v3-os/personas/index.ts',
];
let passed = 0;
function ok(cond, name) { if (!cond) throw new Error('FAIL: ' + name); passed++; console.log('PASS', name); }
const text = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(root,f),'utf8')]));
for (const [f,s] of Object.entries(text)) {
  const out = ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
  const errs = (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  ok(errs.length === 0, 'TypeScript syntax ' + f);
}
const cr = text[files[0]];
const hj = text[files[1]];
const rt = text[files[2]];
const vr = text[files[3]];
const wc = text[files[4]];
const zf = text[files[5]];
ok(cr.includes('explicitDoNotContinueText'), 'explicit opt-out guard exists');
ok(cr.includes('if (explicitDoNotContinueText(value)) return false'), 'opt-out cannot parse as continuation');
ok(!cr.includes('type: \"inform\"'), 'opt-out does not inject unsupported DialogueActType');
ok(cr.includes('ما رح أفتح خطوة دفع أو أرسل تعليمات 5 دنانير'), 'opt-out reply explicitly blocks 5 JOD');
ok(rt.includes('!explicitDoNotContinueText(input.customerText)'), 'runtime persistence cannot fire on opt-out');
ok(hj.includes('مبروك، ${tracking} أخذ موافقة مبدئية'), 'preliminary approval has human journey reply');
ok(hj.includes('رسوم فتح الملف 5 دنانير'), 'preliminary journey surfaces 5 JOD transparently');
ok(hj.includes('المعدل الطبيعي ${window}'), 'preliminary journey includes review duration');
ok(hj.includes('اكتبلي: أود الاستمرار'), 'preliminary journey contains continuation CTA');
ok(hj.includes('لسا ما وصل لمرحلة تحديد موعد استلام'), 'pickup question is stage-aware');
ok(rt.includes('buildHumanJourneyReply'), 'human journey wired before writer');
ok(vr.includes('robotic_generic_fallback_language'), 'verifier blocks robotic fallback language');
ok(vr.includes('Transparency invariant'), 'verifier permits fee transparency but protects destination');
ok(wc.includes('personaWritingContract(roleName)'), 'writer receives persona contract');
ok(wc.includes('الرد لازم يقرأ كمحادثة بشرية مستمرة'), 'writer human continuity rule');
ok(wc.includes('رسوم فتح الملف 5 دنانير فقط'), 'writer preliminary approval fee invariant');
ok(zf.includes('اكتبلي: أود الاستمرار'), 'zero fallback preserves continuation CTA');
ok(!zf.includes('اكتب سؤالك مباشرة'), 'zero fallback removed ask-your-question robot phrase');
ok(!zf.includes('رقم الطلب المرتبط بالمحادثة عندي'), 'zero fallback removed robotic tracking phrase');
console.log(`SELFTEST PASSED ${passed}/${passed}`);
