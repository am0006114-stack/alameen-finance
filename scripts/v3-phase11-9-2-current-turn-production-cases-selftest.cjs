const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(process.cwd(),'node_modules','typescript'))}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const cache=new Map();
function loadTs(abs){abs=path.resolve(abs);if(cache.has(abs))return cache.get(abs).exports;const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(abs,mod);const localRequire=spec=>{if(spec.startsWith('.')){let target=path.resolve(path.dirname(abs),spec);if(!path.extname(target))target+='.ts';return loadTs(target)}return require(spec)};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:localRequire,console,Date,Intl,Map,Set,URL,URLSearchParams,Buffer,TextEncoder,TextDecoder,process},{filename:abs});return mod.exports}
const L=file=>loadTs(path.join(root,'app/api/whatsapp/webhook/_lib/v3-os',file));
const interpreter=L('interpreter.ts'),arbiter=L('responseArbiter.ts'),policy=L('policy.ts'),stateMod=L('state.ts');
const policyTruth=policy.getV3Policy();
const baseApp={id:'app-1192',trackingId:'AM-1192000001',status:'under_review',paymentStatus:'confirmed',paymentConfirmedAt:'2026-10-01T00:00:00Z',phone:'0790000000',deviceName:'iPhone 17 Pro'};
const prelimApp={...baseApp,status:'preliminary_qualified',paymentStatus:null,paymentConfirmedAt:null,deviceName:'iPhone 18 Pro Max - 256GB'};
const mkTruth=application=>({application,ambiguousApplications:[],contactAccess:'full',policy:policyTruth,degraded:false,readWarnings:[]});
let baseState=stateMod.emptyState('962790000000');baseState={...baseState,activeApplicationId:baseApp.id,activeTrackingId:baseApp.trackingId,lastAssistantText:'طلبك حالته الآن قيد الدراسة النهائية. المعدل الطبيعي للمراجعة من يومين إلى 3 أيام تشغيلية (الأحد إلى الخميس)، والجمعة والسبت لا تُحتسبان ضمن مدة الدراسة ولا تُنفذ فيهما مراجعة، لكن يوجد حاليًا ضغط مراجعات شديد جدًا.',lastCustomerText:'شو صار'};
const turn=(text,id)=>interpreter.interpretTurn({turnId:id,customerText:text});
const arb=(text,candidate,state=baseState,app=baseApp,actions=[],id='x')=>arbiter.arbitrateProductionReply({candidate,turn:turn(text,id),state,truth:mkTruth(app),actions});
let r;

r=arb('قدمت عل تلفون من عندكو من يومين بدي اشوف موافقه طلعت','وصلتني الرسالة الصوتية، بس ما قدرت أسمعها بشكل واضح. اكتبلي النقطة اللي بدك تسأل عنها وبجاوبك مباشرة.',baseState,baseApp,[],'media-text');
ok(!/الرسالة الصوتية|الصوتية/.test(r.reply||''),'fresh text expires stale voice/media reply');
ok(/(?:موافق|الموافقة|قيد الدراسة|قيد المراجعة)/.test(r.reply||''),'fresh approval question is answered from application truth');

r=arb('وين موقعكم بلا بس','تمام، هيك ثبتنا إنك حاب تكمل. رسوم فتح الملف 5 دنانير وهاي بيانات الدفع الرسمية.',baseState,prelimApp,[],'location');
ok(/(?:عمّان|عمان).*(?:شارع المدينة|شارع المدينه)/.test(r.reply||''),'fresh location question beats stale payment candidate');
ok(!/Orange Money|PAYAMEEEN|بيانات الدفع/.test(r.reply||''),'location reply does not leak payment egress');

r=arb('هل في رقم للتواصل ؟','المعدل الطبيعي للمراجعة من يومين إلى 3 أيام تشغيلية.',baseState,baseApp,[],'contact');
ok(/واتساب/.test(r.reply||''),'fresh contact question answers contact channel');
ok(!/المعدل الطبيعي/.test(r.reply||''),'contact question is not replaced by review timing');

r=arb('اليوم عطيتوني يوم الاحد و امبارح كان السبت','طلب الاسترداد مسجل فعلًا وقيد المعالجة.',baseState,baseApp,[],'calendar');
ok(/الجمعة والسبت/.test(r.reply||''),'weekend/calendar question owns current turn');
ok(!/الاسترداد مسجل/.test(r.reply||''),'calendar question is not replaced by refund context');

r=arb('بلا هالحكي الفاضي هاض',baseState.lastAssistantText,baseState,baseApp,[],'reject');
ok(/ما عندي تحديث جديد فعليًا/.test(r.reply||''),'rejected repeated answer triggers repetition kill switch');
ok(!/المعدل الطبيعي للمراجعة/.test(r.reply||''),'repetition kill switch does not resend review template');

const falseReopen=[{action:'reopen_application',outcome:'needs_confirmation',executed:false,authoritativeSummary:null,mutationId:null,blocker:'confirmation_required',ownerRole:'omran',details:{}}];
r=arb('بس لما افتح على الطلب بعطيني بانتظار فتح الملف','طلب إعادة فتح الطلب واضح. للتأكيد النهائي اكتب نعم.',baseState,prelimApp,falseReopen,'file-opening');
ok(/(?:فتح الملف).*(?:مش|غير).*إعادة فتح|عبارة فتح الملف.*ما تعني إعادة فتح/s.test(r.reply||''),'commercial file-opening language is separated from reopen action');
ok(!/للتأكيد النهائي.*أعيد فتح/.test(r.reply||''),'misclassified reopen confirmation cannot own commercial file-opening turn');

r=arb('لا هاي تأكيد حوالة كليك','وصلت الصورة. إذا هي هوية أو إثبات دخل ارفعها من الرابط الآمن.',baseState,prelimApp,[],'receipt-clarification');
ok(/إثبات حوالة CliQ/.test(r.reply||''),'CliQ image clarification is recognized as payment proof context');
ok(/ارفع الوصل/.test(r.reply||'')&&/ما رح أعتبر الدفع مؤكد/.test(r.reply||''),'receipt clarification routes to official upload without confirming payment');

r=arb('هل الكم صفحات على فيسبوك او انستغرام','أكيد، صفحاتنا الرسمية موجودة على فيسبوك وإنستغرام وما عنا موقع إلكتروني منفصل.',baseState,prelimApp,[],'business-social');
ok(/الموقع الرسمي الموثق/.test(r.reply||''),'business-truth guard answers with documented official site');
ok(/ما عندي اسم أو رابط صفحة/.test(r.reply||''),'business-truth guard refuses invented social pages');
ok(!/صفحاتنا الرسمية موجودة/.test(r.reply||''),'invented social-page claim is blocked');

r=arb('مافي داعي للرد','طلبك قيد الدراسة النهائية.',baseState,baseApp,[],'silence');
ok(r.reply===null&&r.suppressed===true,'explicit no-reply request suppresses egress');

r=arb('في أمل تطلع النتيجة اليوم ؟','أكيد، لقيت الطلب وحالته قيد الدراسة النهائية.',baseState,baseApp,[],'today');
ok(/ممكن يصدر القرار اليوم/.test(r.reply||'')&&/ما عندي شيء موثق يضمن/.test(r.reply||''),'today-result question gets a direct non-promissory answer');

console.log(`\nV3 PHASE 11.9.2 PRODUCTION CASES SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);if(failed)process.exit(1);
