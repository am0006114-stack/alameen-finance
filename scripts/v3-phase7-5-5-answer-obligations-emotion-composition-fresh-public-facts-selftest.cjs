const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const vm=require('vm');
const root=process.argv[2]||process.cwd();
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0,failed=0;
function ok(v,m){if(v){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}}
function transpile(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:rel});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(errs.length===0,`${rel} TypeScript syntax/transpile diagnostics clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));return out.outputText;}
function runModule(rel,stubs,globals={}){const js=transpile(rel);const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:(id)=>{if(id in stubs)return stubs[id];throw new Error(`unexpected require ${id} from ${rel}`)},console,process:{env:{}},fetch:globals.fetch||(()=>Promise.reject(new Error('network disabled in selftest'))),AbortController:global.AbortController,setTimeout,clearTimeout,Date,Map,Set,URL});return mod.exports;}

const base='app/api/whatsapp/webhook/_lib/v3-os/';
const ansRel=base+'answerObligations.ts';
const freshRel=base+'freshPublicFacts.ts';
const arbRel=base+'responseArbiter.ts';
const humanRel=base+'humanSemanticCare.ts';
const semRel=base+'semanticQuestionLocks.ts';
const runtimeRel=base+'runtimeLive.ts';
const writerRel=base+'writerContract.ts';
const typesRel=base+'types.ts';
const ans=read(ansRel),fresh=read(freshRel),arb=read(arbRel),human=read(humanRel),sem=read(semRel),runtime=read(runtimeRel),writer=read(writerRel),types=read(typesRel);

ok(types.includes('v3.0.0-phase7.5.5-answer-obligations-emotion-composition-fresh-public-facts'),'runtime version identifies 7.5.5');
ok(types.includes('v3.0.0-phase7.5.4.1-regression-safe-useful-human-answer-integrity'),'7.5.4.1 compatibility anchor preserved');
ok(arb.includes('answer_bundle'),'arbiter exposes answer-bundle obligation');
ok(arb.indexOf('resolveAnswerBundle') < arb.lastIndexOf('humanSemanticCareMode'),'answer obligations are evaluated before general emotion care');
ok(arb.includes('composeHumanSemanticCareAroundAnswer'),'emotion is composed around useful answers instead of replacing them');
ok(writer.includes('العاطفة/التعاطف تعدّل طريقة الجواب لكنها ممنوع تستبدل الجواب نفسه'),'writer contract states emotion may not replace answer');
ok(writer.includes('كل سؤال مادي في الرسالة الحالية التزام مستقل'),'writer contract requires all material sub-questions');
ok(runtime.includes('resolveFreshPublicProductReply'),'runtime integrates fresh public product facts');
ok(runtime.indexOf('freshPublicProductReply') < runtime.indexOf('currentQuestionReply)'),'fresh public facts can answer before stale current-question fallback');
ok(fresh.includes('https://api.openai.com/v1/responses')&&fresh.includes('web_search'),'fresh public facts uses OpenAI Responses web search');
ok(fresh.includes('لا تخترع توافرًا في الأردن')&&(fresh.includes('فرّق دائمًا بين الإطلاق العالمي وبين توفر الجهاز لدى الأمين للأقساط')||fresh.includes('فرق دائمًا بين الإطلاق العالمي وبين توفر الجهاز لدى الأمين للأقساط')),'fresh search explicitly separates global release from Al Ameen inventory');
ok(!fresh.includes('refund_requested')&&!fresh.includes('cancel_application'),'fresh web layer does not own refund/cancellation truth');

const norm=(x)=>String(x||'').toLowerCase().replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');
const ansMod=runModule(ansRel,{
  './applicationJourney':{applicationJourneyStage:(app)=>app&&app.__stage||'preliminary_review',customerFacingStatusLabel:(app)=>app&&app.__label||'قيد الدراسة النهائية'},
  './linkIntegrity':{buildOfficialLinkContext:()=>({baseUrl:'https://www.ameenfinance.co',relevant:{products:'https://www.ameenfinance.co/products'}})},
  './text':{normalizeArabic:norm}, './types':{}
});
const policy={requirementsGuidanceRule:'الهوية وإثبات الدخل من الأساسيات، والكفيل مش شرط ثابت لكل طلب.',commercialStructureRule:'التعامل مرابحة، مش قرض ربوي.',firstInstallmentRule:'القسط الأول يستحق بعد شهر من استلام الجهاز وتوقيع العقد.',fileOpeningFeeJod:5,normalReviewWindow:'من يومين لـ3 أيام عمل',severePressureRule:'حاليًا في ضغط مراجعات شديد جدًا.'};
function fix(text,{topics=[],app=null,lastCustomerText='',sentiment='calm'}={}){return {turn:{rawText:text,topics,sentiment},state:{lastCustomerText,lastAssistantText:''},truth:{application:app,policy}}}
let x=fix('صباح الخير ما هي الاوراق و الشروط المطلوبه لو بدي اقسط تلفونين ايفون ١٧ برو ماكس هل يوجد كفيل و كم الفائدة على سنه و نص وازا في دفعه اوليه شكرا',{topics:['requirements']});
let b=ansMod.resolveAnswerBundle(x); ok(b.kind==='multi_question','Sara replay becomes multi-question bundle');
let r=ansMod.buildAnswerBundleReply({...x,bundle:b})||'';
ok(/الهوية|اثبات الدخل|إثبات الدخل/.test(r),'multi-question bundle answers documents/requirements');
ok(/الكفيل/.test(r),'multi-question bundle answers guarantor');
ok(/جهازين/.test(r),'multi-question bundle answers two-device question instead of dropping it');
ok(/مرابح|نسبه|نسبة/.test(norm(r)),'multi-question bundle answers interest/profit structure without inventing a rate');
ok(/ما في دفعة أولى|ما في دفعه اولى/.test(r),'multi-question bundle answers down-payment question');

x=fix('ما قدمت لسه بدي طريقه كيف اقدم و وين'); b=ansMod.resolveAnswerBundle(x); ok(b.kind==='application_start','not-yet-applied message routes to application start'); r=ansMod.buildAnswerBundleReply({...x,bundle:b})||''; ok(/صفحة المنتجات|صفحه المنتجات/.test(r)&&/ameenfinance\.co\/products/.test(r),'application-start reply explains online flow and gives official products page'); ok(!/^عمّان/.test(r),'application-start reply is not hijacked to office location');

x=fix('ما تعيد بل جمله',{app:{__stage:'payment_confirmed_under_review',__label:'قيد الدراسة النهائية'},lastCustomerText:'المفروض اليوم كل اشي يكون جاهز'}); b=ansMod.resolveAnswerBundle(x); ok(b.kind==='repeat_repair','explicit no-repeat complaint triggers repair'); r=ansMod.buildAnswerBundleReply({...x,bundle:b})||''; ok(/ما رح أعيد نفس الجملة|ما رح اعيد نفس الجمله/.test(r),'repeat repair explicitly honors customer request'); ok(/قيد الدراسة النهائية|قيد الدراسه النهائيه/.test(r),'repeat repair still gives actual current truth');

x=fix('نرجو اعلامكم انه سيتم تسجيل دعوى قضائيه وذلك لعدم تسديد ذمم شركه الوكيل القانوني'); b=ansMod.resolveAnswerBundle(x); ok(b.kind==='legal_notice','legal demand routes to legal-notice answer bundle'); r=ansMod.buildAnswerBundleReply({...x,bundle:b})||''; ok(/إشعار|اشعار|مطالبة قانونية|مطالبه قانونيه/.test(r)&&/ما يعني إقرار|ما يعني اقرار/.test(r),'legal notice reply acknowledges notice without admitting debt'); ok(!/تطمّن قبل ما تكمل|التسجيل|الترخيص/.test(r),'legal notice is not converted into trust/registration template');

x=fix('شو حالة الطلب الان؟ والدفعة الاولى ؟',{topics:['application_status'],app:{__stage:'payment_confirmed_under_review',__label:'قيد الدراسة النهائية'}}); b=ansMod.resolveAnswerBundle(x); ok(b.kind==='multi_question','status + down payment becomes multi-question bundle'); r=ansMod.buildAnswerBundleReply({...x,bundle:b})||''; ok(/حالة طلبك الآن|حاله طلبك الان/.test(r)&&/ما في دفعة أولى|ما في دفعه اولى/.test(r),'status + down payment answers both sub-questions in one reply');

x=fix('هاض الطلب شو صار في تاخرتو',{topics:['application_status'],app:{__stage:'payment_confirmed_under_review',__label:'قيد الدراسة النهائية'},sentiment:'frustrated'}); b=ansMod.resolveAnswerBundle(x); ok(b.kind==='multi_question','status + frustration/delay becomes answer bundle rather than emotion-only'); r=ansMod.buildAnswerBundleReply({...x,bundle:b})||''; ok(/معك حق/.test(r)&&/قيد الدراسة النهائية|قيد الدراسه النهائيه/.test(r)&&/يومين|3 أيام|3 ايام/.test(r),'Yousef replay gets empathy + truth + timing utility');

const semMod=runModule(semRel,{
  './applicationJourney':{applicationJourneyStage:(app)=>app&&app.__stage||'continuation_confirmed_fee_due'},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{receipt:'https://www.ameenfinance.co/receipt?tracking=TEST'}})},
  './paymentDestinationOverride':{currentFileOpeningPaymentRule:()=> 'الجهة المستلمة محفظة Orange Money. التحويل عبر CliQ يكون إلى PAYAMEEEN أو AMEEN1ST أو AM500337، أو باستخدام الرقم 0788500337.'},
  './text':{normalizeArabic:norm}, './types':{}
});
const semFix={turn:{rawText:'ابعت على اورنج مني على رقم 0788500337',topics:['payment_method']},truth:{application:{__stage:'continuation_confirmed_fee_due'},policy:{fileOpeningFeeJod:5,generalLocation:'عمّان – شارع المدينة المنورة'}}};
const sl=semMod.resolveSemanticQuestionLock(semFix); ok(sl.kind==='file_opening_payment_method','payment destination confirmation locks to payment method'); const sr=semMod.buildSemanticQuestionLockReply({...semFix,lock:sl})||''; ok(/Orange Money|0788500337/.test(sr),'payment destination confirmation answers with authoritative current payment destination');

const freshMod=runModule(freshRel,{'./linkIntegrity':{buildOfficialLinkContext:()=>({baseUrl:'https://www.ameenfinance.co',relevant:{products:'https://www.ameenfinance.co/products'}})},'./text':{normalizeArabic:norm},'./types':{}});
ok(freshMod.freshPublicProductQuestion({rawText:'متوفر iPhone 18 Pro Max',topics:['products']})===true,'iPhone 18 Pro Max availability question triggers fresh web facts');
ok(freshMod.freshPublicProductQuestion({rawText:'شو حالة طلبي',topics:['application_status']})===false,'order-status question never triggers web facts');
ok(freshMod.freshPublicProductQuestion({rawText:'رجعولي الخمسه',topics:['refund']})===false,'refund question never triggers web facts');

// TopicKey literal contract remains intact.
const v3=path.join(root,base); const tm=types.match(/export type TopicKey\s*=([\s\S]*?);/); ok(Boolean(tm),'TopicKey union found'); const topicKeys=new Set((tm?.[1].match(/"([^"]+)"/g)||[]).map(s=>s.slice(1,-1))); let invalid=[]; if(fs.existsSync(v3)) for(const name of fs.readdirSync(v3).filter(x=>x.endsWith('.ts'))){const src=fs.readFileSync(path.join(v3,name),'utf8');for(const m of src.matchAll(/\.topics\.includes\("([^"]+)"\)/g))if(!topicKeys.has(m[1]))invalid.push(`${name}:${m[1]}`)} ok(invalid.length===0,`all topics.includes literals belong to TopicKey${invalid.length?` (${invalid.join(', ')})`:''}`);

// Full semantic TypeScript diagnostics are filtered to files changed by this phase.
const configPath=ts.findConfigFile(root,ts.sys.fileExists,'tsconfig.json');
const hasNodeTypes=fs.existsSync(path.join(root,'node_modules','@types','node','package.json'));
if(configPath&&hasNodeTypes){const cfgRead=ts.readConfigFile(configPath,ts.sys.readFile);const cfg=ts.parseJsonConfigFileContent(cfgRead.config,ts.sys,path.dirname(configPath));const program=ts.createProgram(cfg.fileNames,cfg.options);const changed=[ansRel,freshRel,arbRel,humanRel,semRel,runtimeRel,writerRel,typesRel].map(r=>path.resolve(root,r));const changedSet=new Set(changed);const diagnostics=ts.getPreEmitDiagnostics(program).filter(d=>d.file&&changedSet.has(path.resolve(d.file.fileName)));if(diagnostics.length)console.error(diagnostics.map(d=>{const lc=d.file.getLineAndCharacterOfPosition(d.start||0);return `${path.basename(d.file.fileName)}:${lc.line+1}:${lc.character+1} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`}).join('\n'));ok(diagnostics.length===0,'all 7.5.5 modified runtime files pass full semantic TypeScript diagnostics');}
else console.log('INFO: package-only snapshot lacks complete Node type environment; full semantic diagnostics deferred to installer project');

for(const f of [ansRel,freshRel,arbRel,humanRel,semRel,runtimeRel,writerRel,typesRel]) transpile(f);
console.log(`\n7.5.5 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`); if(failed) process.exit(1);
