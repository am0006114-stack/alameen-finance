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
const arb=read(arbRel), sem=read(semRel), human=read(humanRel), refund=read(refundRel), writer=read(writerRel), types=read(typesRel);

ok(types.includes('v3.0.0-phase7.5.3-human-semantic-repair'),'runtime version identifies 7.5.3');
ok(types.includes('v3.0.0-phase7.5.2-semantic-priority-human-refund-care'),'7.5.2 compatibility anchor preserved');
ok(writer.includes('PHASE 7.5.3 HUMAN SEMANTIC REPAIR'),'writer contract contains 7.5.3 human-first instruction');
ok(writer.includes('SEMANTIC VETO 7.5.3'),'writer contract contains hard semantic veto instruction');
ok(writer.includes('بشرية جدًا'),'writer contract explicitly targets very human conversation');
ok(arb.includes('semantic question veto repaired cross-domain candidate'),'arbiter has final semantic mismatch veto');
ok(arb.includes('human_semantic_care'),'arbiter wires general human semantic care');
ok(arb.includes('file_opening_payment_method')&&arb.includes('office_location')&&arb.includes('product_region_spec'),'arbiter exposes the three new semantic-lock obligations');
ok(refund.includes('gentle_pressure')&&refund.includes('dismissal'),'refund care expands to gentle pressure and dismissal/stop-contact cues');
ok(!human.includes('أنا مش بوت')&&!human.includes('أنا موظف بشري'),'new human-care module does not use false identity claims');
ok(!sem.includes('أنا مش بوت')&&!sem.includes('أنا موظف بشري'),'new semantic-lock module does not use false identity claims');

const pStructured=arb.indexOf('if (structuredApplicationStatusRequest(input.turn)) return "application_status"');
const pSemantic=arb.indexOf('if (semanticQuestionLock.kind !== "none") return semanticQuestionLock.kind');
const pRefund=arb.indexOf('if (refundHumanCareMode({ turn: input.turn, state: input.state, truth: input.truth })) return "refund_human_care"');
const pMutation=arb.indexOf('if (hasCurrentSensitiveMutation(input.turn)) return "mutation_truth"');
ok(pStructured>=0&&pSemantic>pStructured&&pRefund>pSemantic&&pMutation>pRefund,'priority is structured status > current semantic lock > refund care > new mutation');
const pInstallment=arb.indexOf('if (asksInstallmentServiceOverview(input.turn.rawText)) return "installment_service_overview"');
const pHuman=arb.indexOf('if (humanSemanticCareMode({ turn: input.turn, state: input.state, truth: input.truth })) return "human_semantic_care"');
ok(pHuman>pInstallment,'general human-care obligation runs after direct service/document obligations');

// TopicKey semantic contract stays type-safe.
const v3=path.join(root,'app/api/whatsapp/webhook/_lib/v3-os');
const tm=types.match(/export type TopicKey\s*=([\s\S]*?);/);
ok(Boolean(tm),'TopicKey union found');
const topicKeys=new Set((tm?.[1].match(/"([^"]+)"/g)||[]).map(x=>x.slice(1,-1)));
let invalid=[];
for(const name of fs.readdirSync(v3).filter(x=>x.endsWith('.ts'))){const src=fs.readFileSync(path.join(v3,name),'utf8');for(const m of src.matchAll(/\.topics\.includes\("([^"]+)"\)/g))if(!topicKeys.has(m[1]))invalid.push(`${name}:${m[1]}`)}
ok(invalid.length===0,`all topics.includes literals belong to TopicKey${invalid.length?` (${invalid.join(', ')})`:''}`);

// Full semantic TypeScript diagnostics on every modified runtime file.
const configPath=ts.findConfigFile(root,ts.sys.fileExists,'tsconfig.json');
ok(Boolean(configPath),'project tsconfig found for full semantic diagnostics');
if(configPath){
  const cfgRead=ts.readConfigFile(configPath,ts.sys.readFile);
  const cfg=ts.parseJsonConfigFileContent(cfgRead.config,ts.sys,path.dirname(configPath));
  const program=ts.createProgram(cfg.fileNames,cfg.options);
  const modifiedAbs=new Set([arbRel,semRel,humanRel,refundRel,writerRel,typesRel].map(r=>path.resolve(root,r)));
  const semantic=ts.getPreEmitDiagnostics(program).filter(d=>d.file&&modifiedAbs.has(path.resolve(d.file.fileName)));
  if(semantic.length) console.error(semantic.map(d=>{const lc=d.file.getLineAndCharacterOfPosition(d.start||0);return `${path.basename(d.file.fileName)}:${lc.line+1}:${lc.character+1} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`}).join('\n'));
  ok(semantic.length===0,'all modified runtime files pass full semantic TypeScript diagnostics');
}

const norm=(x)=>String(x||'').toLowerCase().replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');
const semMod=runModule(semRel,{
  './applicationJourney':{applicationJourneyStage:(app)=>app&&app.__stage||'preliminary_review'},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{receipt:'https://www.ameenfinance.co/receipt?tracking=TEST'}})},
  './paymentDestinationOverride':{currentFileOpeningPaymentRule:()=> 'الجهة المستلمة محفظة Orange Money. التحويل عبر CliQ يكون إلى PAYAMEEEN أو AMEEN1ST أو AM500337، أو باستخدام الرقم 0788500337.'},
  './text':{normalizeArabic:norm}, './types':{}
});
function semFixture(text,{topics=[],stage='continuation_confirmed_fee_due'}={}){return {turn:{rawText:text,topics},truth:{application:{__stage:stage},policy:{fileOpeningFeeJod:5,generalLocation:'عمّان – شارع المدينة المنورة'}}}}
function lock(text,opts){const x=semFixture(text,opts);return semMod.resolveSemanticQuestionLock(x)}
function lockReply(text,opts){const x=semFixture(text,opts);const l=semMod.resolveSemanticQuestionLock(x);return semMod.buildSemanticQuestionLockReply({...x,lock:l})||''}
ok(lock('وين بنقدر نحولها؟').kind==='file_opening_payment_method','production replay: bare transfer-location question locks to file-opening payment method');
ok(lock('بدي ادفع الخمس دنانير وين؟',{topics:['payment_method']}).kind==='file_opening_payment_method','explicit 5 JOD payment question locks to payment method');
const payReply=lockReply('وين بنقدر نحولها؟');
ok(/PAYAMEEEN|AMEEN1ST|AM500337|0788500337/.test(payReply),'payment-method repair returns current payment destination when payment is due');
ok(!/استرداد/.test(payReply),'payment-method repair cannot become a refund answer');
ok(semMod.semanticQuestionCandidateAligned({lock:lock('وين بنقدر نحولها؟'),candidate:'إذا قصدك متى ترجع الرسوم: الاسترداد قيد المعالجة.',truth:semFixture('x').truth})===false,'refund candidate is rejected for direct payment-method question');
ok(lock('تمام انتو رنيتوا علي واعطيتوني موعد رسمي مؤكد ف بدي الموقع',{stage:'approved'}).kind==='office_location','production replay: confirmed appointment + location request locks to office location');
const locReply=lockReply('تمام انتو رنيتوا علي واعطيتوني موعد رسمي مؤكد ف بدي الموقع',{stage:'approved'});
ok(/شارع المدينة|شارع المدينه/.test(locReply),'office-location reply gives approved general location');
ok(!/النموذج|الخانة|تعبئة الطلب/.test(locReply),'office-location reply cannot become an application-form troubleshooting answer');
ok(lock('وارد شو التلفون شرق اوسط ولا كيف').kind==='product_region_spec','production replay: device region/market question locks to product region spec');
const regionReply=lockReply('وارد شو التلفون شرق اوسط ولا كيف');
ok(/شرق أوسط|شرق اوسط/.test(regionReply)&&/ما رح أخمّن|ما رح اخمن|مش مثبت/.test(regionReply),'product-region reply explicitly refuses unsupported market-version guessing');
ok(!/تغيير الجهاز|غيّر الجهاز|غير الجهاز/.test(regionReply),'product-region question cannot be misread as device-change request');

const humanMod=runModule(humanRel,{
  './applicationJourney':{applicationJourneyStage:(app)=>app&&app.__stage||'payment_confirmed_under_review',customerFacingStatusLabel:()=> 'قيد الدراسة النهائية'},
  './text':{normalizeArabic:norm}, './types':{}
});
function humanFixture(text,{sentiment='calm',stage='payment_confirmed_under_review'}={}){return {turn:{rawText:text,sentiment,topics:[]},state:{lastAssistantText:''},truth:{application:{__stage:stage},policy:{normalReviewWindow:'من يومين لـ3 أيام عمل',severePressureRule:'حاليًا في ضغط مراجعات شديد.'}}}}
function hMode(text,opts){return humanMod.humanSemanticCareMode(humanFixture(text,opts))}
function hReply(text,opts){return humanMod.buildHumanSemanticCareReply(humanFixture(text,opts))||''}
ok(hMode('والله لو سياره مو زي هيك',{sentiment:'frustrated'})==='frustration','production replay: car-comparison frustration -> human frustration care');
ok(/معك حق|فاهم/.test(hReply('والله لو سياره مو زي هيك',{sentiment:'frustrated'})),'frustration reply starts by acknowledging the customer');
ok(hMode('بحكي يا رب تزبط لانو موظف شركه و كل اشي تمام')==='hope','production replay: hopeful customer -> hope care');
const hopeReply=hReply('بحكي يا رب تزبط لانو موظف شركه و كل اشي تمام');
ok(/إن شاء الله خير|ان شاء الله خير/.test(hopeReply),'hope reply responds naturally to the customer’s hope');
ok(!/^العفو/.test(norm(hopeReply))&&!/(?:موافقتك|الموافقه|الموافقة).{0,20}(?:مضمونه|مضمونة|اكيده|أكيده|اكيدة)|(?:اكيد|أكيد).{0,20}(?:تنقبل|موافق)/.test(norm(hopeReply)),'hope reply is not a trivial thanks and does not guarantee approval');
ok(hMode('اتحملني شوي')==='plea','production replay: gentle plea -> human plea care');
ok(hMode('نصابين وما بثق فيكم',{sentiment:'angry'})==='trust_loss','non-refund trust loss -> human de-escalation care');
ok(humanMod.humanSemanticCareCandidateAligned({candidate:'العفو، الله يعطيك العافية.',...humanFixture('بحكي يا رب تزبط لانو موظف شركه')})===false,'trivial acknowledgement is rejected when emotional meaning needs a real human response');

const refundMod=runModule(refundRel,{
  './applicationJourney':{applicationJourneyStage:(app)=>app&&app.__stage||'refund_requested'},
  './text':{normalizeArabic:norm}, './types':{}
});
function refundFixture(text,{sentiment='calm'}={}){return {turn:{rawText:text,sentiment,topics:[]},state:{lastAssistantText:''},truth:{application:{__stage:'refund_requested'}}}}
ok(refundMod.refundHumanCareMode(refundFixture('بس حاول انو ما يطول'))==='gentle_pressure','production replay: gentle refund pressure now enters Human Refund Care');
ok(/فاهم|وصلتني|معك حق/.test(refundMod.buildRefundHumanCareReply(refundFixture('بس حاول انو ما يطول'))||''),'gentle refund pressure gets human acknowledgement');
ok(refundMod.refundHumanCareMode(refundFixture('انقلع',{sentiment:'angry'}))==='dismissal','production replay: dismissal/stop-contact cue detected');
const dismiss=refundMod.buildRefundHumanCareReply(refundFixture('انقلع',{sentiment:'angry'}))||'';
ok(/ما رح أزيد|ما رح ازيد|ما رح أضل|ما رح اضل/.test(dismiss),'dismissal reply stops the repetitive conversation loop');
ok(!/https?:\/\//.test(dismiss),'dismissal reply does not chase the customer with another tracking link');

// Syntax/transpile all modified files, including the arbiter and writer contract.
transpile(arbRel); transpile(writerRel); transpile(typesRel);

console.log(`\n7.5.3 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed) process.exit(1);
