const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = process.argv[2] || process.cwd();
const routerPath = path.join(root, 'app/api/whatsapp/webhook/_lib/v3-os/applicationModificationRouting.ts');
const kernelPath = path.join(root, 'app/api/whatsapp/webhook/_lib/v3-os/nativeConversationKernel.ts');
let passed = 0, failed = 0;
function check(cond, msg){ if(cond){ console.log(`PASS ${++passed}: ${msg}`); } else { failed++; console.error(`FAIL: ${msg}`); } }
function read(p){ return fs.readFileSync(p,'utf8'); }
function transpile(file){
  const src=read(file);
  const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},fileName:file,reportDiagnostics:true});
  const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errs.length) throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));
  return out.outputText;
}
function loadPureRouter(){
  const js=transpile(routerPath);
  const module={exports:{}};
  const sandbox={module,exports:module.exports,require,console};
  vm.runInNewContext(js,sandbox,{filename:'applicationModificationRouting.js'});
  return sandbox.module.exports;
}

check(fs.existsSync(routerPath), 'applicationModificationRouting.ts exists');
check(fs.existsSync(kernelPath), 'nativeConversationKernel.ts exists');
const routerSrc=read(routerPath), kernelSrc=read(kernelPath);
check(!/5\s*JOD|٥\s*دنانير|رسوم فتح الملف/.test(routerSrc), 'router does not touch or reproduce the protected 5-JOD journey');
check(kernelSrc.includes('APPLICATION MODIFICATION ROUTING حقيقة تشغيلية حتمية'), 'Native Kernel receives deterministic modification routing policy');
check(kernelSrc.includes('buildApplicationModificationRoutingReply'), 'Native Kernel applies modification routing inside the single conversation authority');
check(kernelSrc.includes('applicationModificationRoutingViolation'), 'final Native Kernel validation enforces the route');
check(!kernelSrc.includes('pickup_appointment_at'), 'no appointment schema/flow reintroduced');
check(kernelSrc.includes('صفحة الأمين الرسمية على فيسبوك'), 'paid modification policy points to official Facebook page');

const r=loadPureRouter();
const base={topics:['device_change'],requestedActions:['change_device'],customerText:'بدي اغير الجهاز',hasApplication:true,trackingId:'AM-123',registeredPhone:'0790000000'};
let d=r.resolveApplicationModificationRoute({...base,paymentConfirmed:false});
check(d.relevant && d.route==='cancel_reapply_unpaid','unpaid existing application routes to cancel + reapply');
d=r.resolveApplicationModificationRoute({...base,paymentConfirmed:true});
check(d.relevant && d.route==='facebook_manual_paid','authoritatively paid application routes to Facebook manual modification');
d=r.resolveApplicationModificationRoute({...base,topics:['payment_fee'],requestedActions:[],customerText:'كم رسوم فتح الملف',paymentConfirmed:true});
check(!d.relevant && d.route==='none','ordinary payment/fee question never enters modification routing');
d=r.resolveApplicationModificationRoute({...base,topics:[],requestedActions:[],customerText:'الطلب غير مدفوع لسا',paymentConfirmed:false});
check(!d.relevant && d.route==='none','Arabic word غير as negation does not falsely trigger modification routing');
d=r.resolveApplicationModificationRoute({...base,hasApplication:false,paymentConfirmed:false});
check(!d.relevant && d.route==='none','pre-application product questions are not misrouted as application modifications');
d=r.resolveApplicationModificationRoute({...base,topics:[],requestedActions:[],customerText:'بدي اغير اللون',paymentConfirmed:true});
check(d.route==='facebook_manual_paid','explicit manual color change is recognized even if semantic labels are sparse');
d=r.resolveApplicationModificationRoute({...base,topics:[],requestedActions:[],customerText:'بدي اغير الدفعة الاولى',paymentConfirmed:false});
check(d.route==='cancel_reapply_unpaid','explicit down-payment change on unpaid request uses cancel/reapply route');

let reply=r.buildApplicationModificationRoutingReply({...base,paymentConfirmed:true});
check(/فيسبوك/.test(reply) && /AM-123/.test(reply) && /0790000000/.test(reply),'paid routing reply includes Facebook + order number + registered phone');
check(!/(?:الغاء|إلغاء).{0,80}(?:طلب جديد|من جديد)/.test(reply),'paid routing reply does not recommend cancel/reapply');
check(r.applicationModificationRoutingViolation({...base,paymentConfirmed:true,reply})===null,'paid canonical reply passes routing validator');
check(r.applicationModificationRoutingViolation({...base,paymentConfirmed:true,reply:'الغي الطلب وقدم طلب جديد'})==='paid_modification_wrong_cancel_reapply_route','paid request rejects cancel/reapply answer');
check(r.applicationModificationRoutingViolation({...base,paymentConfirmed:true,reply:'وصلني طلب تغيير اللون، لكن ما بعتبره متغير قبل التنفيذ الفعلي.'})===null,'paid route preserves Phase 8.1.2 neutral non-execution safety answer compatibility');

reply=r.buildApplicationModificationRoutingReply({...base,paymentConfirmed:false});
check(/الغاء|إلغاء/.test(reply) && /طلب جديد/.test(reply),'unpaid canonical reply advises cancellation then new request');
check(!/فيسبوك/.test(reply),'unpaid canonical reply does not send customer to Facebook');
check(r.applicationModificationRoutingViolation({...base,paymentConfirmed:false,reply})===null,'unpaid canonical reply passes routing validator');
check(r.applicationModificationRoutingViolation({...base,paymentConfirmed:false,reply:'تواصل معنا على فيسبوك'})==='unpaid_modification_wrong_facebook_route','unpaid request rejects Facebook route');
check(r.applicationModificationRoutingViolation({...base,paymentConfirmed:false,reply:'وصلني طلب التعديل، لكن ما بعتبره منفذ قبل تحديث الطلب فعليًا.'})===null,'unpaid route allows neutral non-execution safety answer while deterministic builder owns final routing');

try { transpile(routerPath); check(true,'applicationModificationRouting.ts transpiles clean'); } catch(e){ console.error(e); check(false,'applicationModificationRouting.ts transpiles clean'); }
try { transpile(kernelPath); check(true,'nativeConversationKernel.ts transpiles clean'); } catch(e){ console.error(e); check(false,'nativeConversationKernel.ts transpiles clean'); }

console.log(`\nPhase 8.4 modification-routing assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);
process.exit(failed ? 1 : 0);
