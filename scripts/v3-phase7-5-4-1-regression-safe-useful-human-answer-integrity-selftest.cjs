const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const vm=require('vm');
const root=process.argv[2]||process.cwd();
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0,failed=0;
function ok(v,m){if(v){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}}
function transpile(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:rel});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(errs.length===0,`${rel} TypeScript syntax/transpile diagnostics clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));return out.outputText;}
function runModule(rel,stubs){const js=transpile(rel);const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:(id)=>{if(id in stubs)return stubs[id];throw new Error(`unexpected require ${id} from ${rel}`)},console});return mod.exports;}

const arbRel='app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts';
const semRel='app/api/whatsapp/webhook/_lib/v3-os/semanticQuestionLocks.ts';
const humanRel='app/api/whatsapp/webhook/_lib/v3-os/humanSemanticCare.ts';
const refundRel='app/api/whatsapp/webhook/_lib/v3-os/refundHumanCare.ts';
const writerRel='app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts';
const typesRel='app/api/whatsapp/webhook/_lib/v3-os/types.ts';
const arb=read(arbRel),sem=read(semRel),human=read(humanRel),refund=read(refundRel),writer=read(writerRel),types=read(typesRel);

ok(types.includes('v3.0.0-phase7.5.4.1-regression-safe-useful-human-answer-integrity'),'runtime version identifies 7.5.4.1');
ok(types.includes('v3.0.0-phase7.5.3-human-semantic-repair'),'7.5.3 compatibility anchor preserved');
ok(writer.includes('PHASE 7.5.4.1 REGRESSION-SAFE USEFUL HUMAN ANSWER INTEGRITY'),'writer contract contains regression-safe useful-human 7.5.4.1 instruction');
ok(writer.includes('الحقيقة الموثقة الحالية')&&writer.includes('ما الذي يحدث بعد ذلك'),'writer contract requires empathy + truth + next expectation');
ok(writer.includes('شو ضمان كلامك')&&writer.includes('كم بطلع علي الجهاز كامل'),'writer contract names both production failures');
ok(sem.includes('trust_assurance')&&sem.includes('total_payable'),'semantic question locks include trust and total payable');
ok(arb.includes('trust_assurance')&&arb.includes('total_payable'),'arbiter exposes trust and total-payable obligations');
ok(refund.includes('lastVerifiedApplication'),'refund care can use authoritative verified snapshot when current truth is temporarily absent');
ok(human.includes('usefulNextStep'),'general human care always adds practical utility');
ok(!human.includes('أنا مش بوت')&&!human.includes('أنا موظف بشري'),'human-care module avoids false identity claims');

// TopicKey semantic contract stays type-safe.
const v3=path.join(root,'app/api/whatsapp/webhook/_lib/v3-os');
const tm=types.match(/export type TopicKey\s*=([\s\S]*?);/);
ok(Boolean(tm),'TopicKey union found');
const topicKeys=new Set((tm?.[1].match(/"([^"]+)"/g)||[]).map(x=>x.slice(1,-1)));
let invalid=[];
if(fs.existsSync(v3)) for(const name of fs.readdirSync(v3).filter(x=>x.endsWith('.ts'))){const src=fs.readFileSync(path.join(v3,name),'utf8');for(const m of src.matchAll(/\.topics\.includes\("([^"]+)"\)/g))if(!topicKeys.has(m[1]))invalid.push(`${name}:${m[1]}`)}
ok(invalid.length===0,`all topics.includes literals belong to TopicKey${invalid.length?` (${invalid.join(', ')})`:''}`);

const norm=(x)=>String(x||'').toLowerCase().replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');
const semMod=runModule(semRel,{
  './applicationJourney':{applicationJourneyStage:(app)=>app&&app.__stage||'preliminary_review'},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{receipt:'https://www.ameenfinance.co/receipt?tracking=TEST'}})},
  './paymentDestinationOverride':{currentFileOpeningPaymentRule:()=> 'الجهة المستلمة محفظة Orange Money. التحويل عبر CliQ يكون إلى PAYAMEEEN أو AMEEN1ST أو AM500337، أو باستخدام الرقم 0788500337.'},
  './text':{normalizeArabic:norm}, './types':{}
});
function semFixture(text,{topics=[],stage='continuation_confirmed_fee_due',app={}}={}){return {turn:{rawText:text,topics},truth:{application:{__stage:stage,...app},policy:{fileOpeningFeeJod:5,generalLocation:'عمّان – شارع المدينة المنورة'}}}}
function lock(text,opts){const x=semFixture(text,opts);return semMod.resolveSemanticQuestionLock(x)}
function lockReply(text,opts){const x=semFixture(text,opts);const l=semMod.resolveSemanticQuestionLock(x);return semMod.buildSemanticQuestionLockReply({...x,lock:l})||''}

ok(lock('شو ضمان كلامك',{topics:['trust']}).kind==='trust_assurance','production replay: شو ضمان كلامك locks to trust assurance');
const trustReply=lockReply('شو ضمان كلامك',{topics:['trust'],stage:'continuation_confirmed_fee_due'});
ok(/سؤالك بمحله|الضمان العملي/.test(trustReply),'trust reply directly acknowledges trust question');
ok(/الدفع/.test(trustReply)&&/اعتماد/.test(trustReply),'trust reply explains verifiable payment truth');
ok(!/اختيار الاستمرار مسجل|ما في داعي تعيد/.test(trustReply),'trust reply cannot fall back to stale continuation');
ok(semMod.semanticQuestionCandidateAligned({lock:lock('شو ضمان كلامك',{topics:['trust']}),candidate:'اختيار الاستمرار مسجل بالفعل. ما في داعي تعيد أود الاستمرار.',truth:semFixture('x').truth})===false,'stale continuation candidate rejected for trust question');

ok(lock('وكم بطلع علي الجهاز كامل').kind==='total_payable','production replay: total device cost question locks to total payable');
const noTotal=lockReply('وكم بطلع علي الجهاز كامل',{stage:'payment_confirmed_under_review',app:{devicePrice:1148.55,monthlyPayment:36.69,installmentMonths:36,totalWithInterest:null}});
ok(/1148\.55/.test(noTotal)&&/36\.69/.test(noTotal),'total-payable reply may show known price and current approximate installment');
ok(/ما عندي رقم موثق|إجمالي المبلغ النهائي|اجمالي المبلغ النهائي/.test(noTotal),'total-payable reply refuses to invent final total when totalWithInterest is absent');
ok(!/1320\.84/.test(noTotal),'total-payable reply does not multiply approximate installments into a fake authoritative total');
const withTotal=lockReply('كم بطلع علي الجهاز كامل',{stage:'payment_confirmed_under_review',app:{devicePrice:1148.55,monthlyPayment:36.69,installmentMonths:36,totalWithInterest:1320.84}});
ok(/1320\.84/.test(withTotal),'documented totalWithInterest is used when present');
ok(semMod.semanticQuestionCandidateAligned({lock:lock('وكم بطلع علي الجهاز كامل'),candidate:'حالة طلبك الآن: تم تسجيل رغبتك بالاستمرار.',truth:semFixture('x').truth})===false,'continuation status rejected for total-payable question');

// Existing 7.5.3 locks remain.
ok(lock('وين بنقدر نحولها؟').kind==='file_opening_payment_method','payment-method hard lock preserved');
ok(lock('تمام انتو رنيتوا علي واعطيتوني موعد رسمي مؤكد ف بدي الموقع',{stage:'approved'}).kind==='office_location','office-location hard lock preserved');
ok(lock('وارد شو التلفون شرق اوسط ولا كيف').kind==='product_region_spec','product-region hard lock preserved');

const humanMod=runModule(humanRel,{
  './applicationJourney':{applicationJourneyStage:(app)=>app&&app.__stage||'payment_confirmed_under_review',customerFacingStatusLabel:()=> 'قيد الدراسة النهائية'},
  './text':{normalizeArabic:norm}, './types':{}
});
function humanFixture(text,{sentiment='calm',stage='payment_confirmed_under_review'}={}){return {turn:{rawText:text,sentiment,topics:[]},state:{lastAssistantText:''},truth:{application:{__stage:stage},policy:{normalReviewWindow:'من يومين لـ3 أيام عمل',severePressureRule:'حاليًا في ضغط مراجعات شديد.'}}}}
const frustration=humanMod.buildHumanSemanticCareReply(humanFixture('والله لو سياره مو زي هيك',{sentiment:'frustrated'}))||'';
ok(/معك حق|فاهم/.test(frustration),'frustration reply has strong human acknowledgement');
ok(/الحالة الفعلية|طلبك|الدراسة/.test(frustration),'frustration reply contains current truth');
ok(/ما في عليك|اللي ننتظره|الخطوة/.test(frustration),'frustration reply contains useful next expectation');
const hope=humanMod.buildHumanSemanticCareReply(humanFixture('يا رب تزبط لانو كل اشي تمام'))||'';
ok(/يا رب|فاهم/.test(hope)&&/الدراسة|القرار|الحالة/.test(hope),'hope reply is warm but truth-grounded');
ok(/إن شاء الله خير|ان شاء الله خير/.test(hope),'7.5.3 inherited hope wording contract preserved');
ok(humanMod.humanSemanticCareCandidateAligned({candidate:'معك حق تتضايق.',...humanFixture('والله لو سياره مو زي هيك',{sentiment:'frustrated'})})===false,'empathy-only candidate rejected as not useful');

const refundMod=runModule(refundRel,{
  './applicationJourney':{applicationJourneyStage:(app)=>app&&app.__stage||'unknown'},
  './text':{normalizeArabic:norm}, './types':{}
});
function refundFixture(text,{truthApp={__stage:'refund_requested'},verifiedApp=null,sentiment='calm'}={}){return {turn:{rawText:text,sentiment,topics:[]},state:{lastAssistantText:'',lastVerifiedApplication:verifiedApp?{application:verifiedApp,fetchedAt:'x'}:null},truth:{application:truthApp}}}
ok(refundMod.refundHumanCareMode(refundFixture('حولي الخمسه'))==='repeat_demand','direct refund-money demand remains refund human care');
const refundReply=refundMod.buildRefundHumanCareReply(refundFixture('حولي الخمسه'))||'';
ok(/فاهم|وصلتني|طلبك واضح/.test(refundReply),'refund demand gets human acknowledgement');
ok(/طلب الاسترداد|الاسترداد/.test(refundReply),'refund demand gets verified current truth');
ok(/ما في عليك طلب جديد|أول ما يظهر|اول ما يظهر|ما في داعي تعيد/.test(refundReply),'refund demand gets next expectation instead of empathy only');
ok(refundMod.refundHumanCareCandidateAligned({candidate:'معك حق تنزعج إذا حاسس إن الموضوع أخذ وقت أكبر من المتوقع.',...refundFixture('حولي الخمسه')})===false,'refund empathy-only candidate rejected');
ok(refundMod.refundHumanCareCandidateAligned({candidate:'فاهم إن الانتظار ثقيل عليك. طلب الاسترداد مسجل وقيد المعالجة وما عندي موعد تحويل موثق أقدر أضمنه.',truth:{application:{__stage:'refund_requested'}}})===true,'7.5.2 inherited truthful empathetic refund candidate remains accepted');
const fallback=refundFixture('حولولي الرسوم',{truthApp:null,verifiedApp:{__stage:'refund_requested'}});
ok(refundMod.refundHumanCareMode(fallback)==='repeat_demand','verified state snapshot preserves refund-care routing when current truth is temporarily absent');
const fallbackReply=refundMod.buildRefundHumanCareReply(fallback)||'';
ok(/طلب الاسترداد/.test(fallbackReply)&&/قيد المعالجة/.test(fallbackReply),'verified snapshot fallback still produces truthful refund-care response');

// Source-order invariant: semantic locks still run before refund/general human care.
const pSemantic=arb.indexOf('if (semanticQuestionLock.kind !== "none") return semanticQuestionLock.kind');
const pRefund=arb.indexOf('if (refundHumanCareMode({ turn: input.turn, state: input.state, truth: input.truth })) return "refund_human_care"');
const pHuman=arb.indexOf('if (humanSemanticCareMode({ turn: input.turn, state: input.state, truth: input.truth })) return "human_semantic_care"');
ok(pSemantic>=0&&pRefund>pSemantic&&pHuman>pRefund,'priority remains semantic hard locks > refund care > general human care');

// Full semantic TypeScript diagnostics on every modified runtime file when project tsconfig exists.
const configPath=ts.findConfigFile(root,ts.sys.fileExists,'tsconfig.json');
if(configPath){
  const cfgRead=ts.readConfigFile(configPath,ts.sys.readFile);
  const cfg=ts.parseJsonConfigFileContent(cfgRead.config,ts.sys,path.dirname(configPath));
  const program=ts.createProgram(cfg.fileNames,cfg.options);
  const modifiedAbs=new Set([arbRel,semRel,humanRel,refundRel,writerRel,typesRel].map(r=>path.resolve(root,r)));
  const diagnostics=ts.getPreEmitDiagnostics(program).filter(d=>d.file&&modifiedAbs.has(path.resolve(d.file.fileName)));
  if(diagnostics.length) console.error(diagnostics.map(d=>{const lc=d.file.getLineAndCharacterOfPosition(d.start||0);return `${path.basename(d.file.fileName)}:${lc.line+1}:${lc.character+1} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`}).join('\n'));
  ok(diagnostics.length===0,'all modified runtime files pass full semantic TypeScript diagnostics');
}else{
  console.log('INFO: no tsconfig in package-only test root; full semantic diagnostics deferred to installer project');
}

transpile(arbRel);transpile(writerRel);transpile(typesRel);
console.log(`\n7.5.4.1 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed) process.exit(1);
