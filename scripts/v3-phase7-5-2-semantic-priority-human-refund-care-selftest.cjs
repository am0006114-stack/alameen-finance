const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const vm=require('vm');
const root=process.argv[2]||process.cwd();
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0,failed=0;
function ok(v,m){if(v){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}}
function transpile(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:rel});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(errs.length===0,`${rel} TypeScript syntax/transpile diagnostics clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));return out.outputText;}

const arbRel='app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts';
const careRel='app/api/whatsapp/webhook/_lib/v3-os/refundHumanCare.ts';
const writerRel='app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts';
const typesRel='app/api/whatsapp/webhook/_lib/v3-os/types.ts';
const arb=read(arbRel), care=read(careRel), writer=read(writerRel), types=read(typesRel);

ok(types.includes('v3.0.0-phase7.5.2-semantic-priority-human-refund-care'),'runtime version identifies 7.5.2');
ok(types.includes('v3.0.0-phase7.5.1.1-type-safe-routing-hotfix'),'7.5.1.1 backward compatibility anchor preserved');
ok(arb.includes('structuredApplicationStatusRequest'),'structured application-status priority lock present');
ok(arb.includes('refundHumanCareMode'),'refund human-care semantic detector wired into arbiter');
ok(arb.includes('buildRefundHumanCareReply'),'refund human-care reply builder wired into final repair');
ok(arb.includes('installment_service_overview'),'general installment-service overview obligation present');
ok(arb.includes('document_upload_guidance'),'document-upload follow-up obligation present');
ok(writer.includes('PHASE 7.5.2 SEMANTIC PRIORITY + HUMAN REFUND CARE'),'writer contract contains 7.5.2 human-first instruction');
ok(writer.includes('لا تستخدم التعاطف للضغط على العميل أو تغيير قراره'),'refund empathy explicitly non-coercive');
ok(care.includes('solution_request') && care.includes('repeat_demand') && care.includes('long_delay') && care.includes('accusation') && care.includes('distress'),'refund care covers solution/repetition/delay/anger/trust-loss families');
ok(care.includes('hasHumanAcknowledgement'),'candidate gate requires a human acknowledgement for refund care');
ok(!care.includes('رد آلي'),'customer-facing refund care does not call itself automated');
ok(!care.includes('أنا مش بوت') && !care.includes('مش روبوت'),'refund care contains no false identity defense');

// Priority order is a semantic invariant: authoritative mutation receipt > structured status > refund care > new mutation request.
const pMutationReceipt=arb.indexOf('if (hasAuthoritativeMutationResult(input.actions)) return "mutation_truth"');
const pStructured=arb.indexOf('if (structuredApplicationStatusRequest(input.turn)) return "application_status"');
const pRefundCare=arb.indexOf('if (refundHumanCareMode({ turn: input.turn, state: input.state, truth: input.truth })) return "refund_human_care"');
const pMutationRequest=arb.indexOf('if (hasCurrentSensitiveMutation(input.turn)) return "mutation_truth"');
ok(pMutationReceipt>=0 && pStructured>pMutationReceipt && pRefundCare>pStructured && pMutationRequest>pRefundCare,'semantic priority order is authoritative receipt > structured status > refund care > new mutation');

// TopicKey semantic contract preserved everywhere under v3-os.
const v3=path.join(root,'app/api/whatsapp/webhook/_lib/v3-os');
const tm=types.match(/export type TopicKey\s*=([\s\S]*?);/);
ok(Boolean(tm),'TopicKey union found');
const topicKeys=new Set((tm?.[1].match(/"([^"]+)"/g)||[]).map(x=>x.slice(1,-1)));
let invalid=[];
for(const name of fs.readdirSync(v3).filter(x=>x.endsWith('.ts'))){
  const src=fs.readFileSync(path.join(v3,name),'utf8');
  for(const m of src.matchAll(/\.topics\.includes\("([^"]+)"\)/g)) if(!topicKeys.has(m[1])) invalid.push(`${name}:${m[1]}`);
}
ok(invalid.length===0,`all topics.includes literals belong to TopicKey${invalid.length?` (${invalid.join(', ')})`:''}`);

// Full semantic TypeScript diagnostics for the modified runtime files. This catches
// assignability errors that transpileModule intentionally does not catch.
const configPath=ts.findConfigFile(root,ts.sys.fileExists,'tsconfig.json');
ok(Boolean(configPath),'project tsconfig found for semantic type contract');
if(configPath){
  const cfgRead=ts.readConfigFile(configPath,ts.sys.readFile);
  const cfg=ts.parseJsonConfigFileContent(cfgRead.config,ts.sys,path.dirname(configPath));
  const program=ts.createProgram(cfg.fileNames,cfg.options);
  const modifiedAbs=new Set([arbRel,careRel,writerRel,typesRel].map(r=>path.resolve(root,r)));
  const semantic=ts.getPreEmitDiagnostics(program).filter(d=>d.file&&modifiedAbs.has(path.resolve(d.file.fileName)));
  if(semantic.length) console.error(semantic.map(d=>{const lc=d.file.getLineAndCharacterOfPosition(d.start||0);return `${path.basename(d.file.fileName)}:${lc.line+1}:${lc.character+1} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`}).join('\n'));
  ok(semantic.length===0,'modified runtime files pass full semantic TypeScript diagnostics');
}

const careJs=transpile(careRel);
transpile(arbRel); transpile(writerRel); transpile(typesRel);

// Execute the refund-care module with narrow stubs so real production phrases are replayed against its logic.
const sandboxModule={exports:{}};
function localRequire(id){
  if(id==='./applicationJourney') return {applicationJourneyStage:(app)=>app&&app.__stage||'unknown'};
  if(id==='./text') return {normalizeArabic:(x)=>String(x||'').toLowerCase().replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')};
  if(id==='./types') return {};
  throw new Error(`unexpected require in refundHumanCare selftest: ${id}`);
}
vm.runInNewContext(careJs,{module:sandboxModule,exports:sandboxModule.exports,require:localRequire,console});
const careMod=sandboxModule.exports;
function fixture(text,{sentiment='calm',last='',stage='refund_requested'}={}){
  return {turn:{rawText:text,sentiment,topics:[],requestedActions:[]},state:{lastAssistantText:last},truth:{application:{__stage:stage}}};
}
function mode(text,opts){return careMod.refundHumanCareMode(fixture(text,opts));}
function reply(text,opts){return careMod.buildRefundHumanCareReply(fixture(text,opts))||'';}

ok(mode('قيد المعالجة صار له شهر')==='long_delay','production replay: month-long refund delay -> long_delay care');
ok(mode('طيب والحل')==='solution_request','production replay: "طيب والحل" -> solution-oriented care');
ok(mode('كيف ممكن حل مشكلتي')==='solution_request','production replay: explicit solution request -> solution-oriented care');
ok(mode('بدي حل سريع لمشكلتي')==='solution_request','production replay: urgent solution request -> solution-oriented care');
ok(mode('رجعوا مصارييي')==='repeat_demand','production replay: repeated money demand -> repeat-demand care');
ok(mode('ارجو استرداد مبلغ خمس دنانير رسوم المعاملة')==='repeat_demand','production replay: repeated explicit refund while already open -> care, not new mutation');
ok(mode('نصابين حسبي الله ونعم الوكيل',{sentiment:'angry'})==='accusation','production replay: scam accusation -> accusation de-escalation care');
ok(mode('لا إله إلا الله',{sentiment:'frustrated'})==='distress','production replay: distress-only turn during open refund -> human distress care');
ok(mode('اين المبلغ المسترد')==='timing','production replay: where is refunded amount -> timing care');
ok(mode('شهر عشان الاسترداد')==='long_delay','production replay: month + refund -> long-delay care');

const solutionReply=reply('طيب والحل');
ok(/الحل|عمليا|عمليًا/.test(solutionReply),'solution-care reply explains the practical path');
ok(/قيد المعالجه|قيد المعالجة/.test(solutionReply),'refund-care reply preserves current authoritative refund state');
ok(/ما عندي موعد|ما بدي اعطيك موعد|ما بدي أعطيك موعد/.test(reply('قيد المعالجة صار له شهر')),'long-delay reply refuses an unsupported ETA');
ok(/فاهم|معك حق|وصلتني|مفهوم/.test(reply('رجعوا مصارييي')),'refund-care reply starts with human acknowledgement');
ok(!/طلبك ملغي بالفعل، وطلب الاسترداد مسجل وقيد المعالجة\.?$/.test(reply('بدي حل سريع لمشكلتي')),'refund-care reply is not the old status-only loop');
ok(careMod.refundHumanCareCandidateAligned({candidate:'نعم، طلبك ملغي بالفعل، وطلب الاسترداد مسجل وقيد المعالجة.',truth:{application:{__stage:'refund_requested'}}})===false,'status-only refund loop is rejected as a final candidate');
ok(careMod.refundHumanCareCandidateAligned({candidate:'فاهم إن الانتظار ثقيل عليك. طلب الاسترداد مسجل وقيد المعالجة وما عندي موعد تحويل موثق أقدر أضمنه.',truth:{application:{__stage:'refund_requested'}}})===true,'truthful empathetic refund candidate is accepted');

// Static replay coverage for the other two production failures.
ok(/رقم\\s\+التتبع/.test(arb) && /الحاله\\s\+الحاليه/.test(arb) && /اخر\\s\+تحديث/.test(arb),'structured status template detector covers tracking + current state + latest update');
ok(/خدمه\\s\+تقسيط|خدمة\\s\+تقسيط/.test(arb) && /الشروط/.test(arb),'service-overview detector covers "شروط وطريقة التقديم"');
ok(/تمام\\s\+/.test(arb) && /وضحلي/.test(arb) && /previousOfferedDocs/.test(arb),'document explanation follow-up covers "تمام وضحلي" after an offered explanation');

console.log(`\n7.5.2 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed) process.exit(1);
