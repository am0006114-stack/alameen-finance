const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const vm=require('vm');
const root=process.argv[2]||process.cwd();
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0,failed=0;
function ok(v,m){if(v){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}}
function transpile(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:rel});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(errs.length===0,`${rel} TypeScript syntax/transpile diagnostics clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));return out.outputText;}
function runModule(rel,stubs={}){const js=transpile(rel);const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:(id)=>{if(id in stubs)return stubs[id];throw new Error(`unexpected require ${id} from ${rel}`)},console,process:{env:{}},Date,Map,Set,URL});return mod.exports;}
const base='app/api/whatsapp/webhook/_lib/v3-os/';
const payRel=base+'paymentDestinationOverride.ts';
const semRel=base+'semanticQuestionLocks.ts';
const writerRel=base+'writerContract.ts';
const typesRel=base+'types.ts';
const paySrc=read(payRel),semSrc=read(semRel),writer=read(writerRel),types=read(typesRel);

ok(types.includes('v3.0.0-phase7.5.6-payment-conversion-integrity'),'runtime version identifies 7.5.6');
ok(types.includes('v3.0.0-phase7.5.5-answer-obligations-emotion-composition-fresh-public-facts'),'7.5.5 compatibility anchor preserved');
ok(paySrc.includes('2026-09-16-payment-conversion-integrity'),'payment destination truth version upgraded');
ok(writer.includes('7.5.6 PAYMENT CONVERSION INTEGRITY'),'writer contract contains 7.5.6 payment conversion contract');
ok(writer.includes('اعرض كل خيارات الدفع المعتمدة معًا في نفس الرد'),'writer requires all payment options in one reply');
ok(writer.includes('ممنوع اختصارها إلى خيار واحد عند طلب بيانات الدفع'),'writer forbids one-option truncation');
ok(writer.includes('لا تستخدم عبارة «صار تحديث طارئ ببيانات محفظة الدفع» في المسار الطبيعي'),'normal payment flow forbids emergency-update scare copy');
ok(semSrc.includes('asksPaymentData'),'semantic lock explicitly detects payment-data requests');
ok(semSrc.includes('feeDueNextStep'),'fee-due next-step/help is stage-aware');
ok(semSrc.includes('هات|اعطيني|أعطيني'),'direct “give me payment data” language is recognized');
ok(semSrc.includes('ساعدني|ساعدوني'),'step-help language is recognized');
ok(semSrc.includes('طمني|طمنّي|طمّني'),'trust reassurance recognizes “طمني”');

const pay=runModule(payRel,{});
const rule=pay.currentFileOpeningPaymentRule();
ok(rule.includes('Orange Money'),'normal payment rule includes Orange Money');
ok(rule.includes('0788500337'),'normal payment rule includes wallet phone');
ok(rule.includes('PAYAMEEEN'),'normal payment rule includes PAYAMEEEN');
ok(rule.includes('AMEEN1ST'),'normal payment rule includes AMEEN1ST');
ok(rule.includes('AM500337'),'normal payment rule includes AM500337');
ok(rule.includes('ABDUL RAHMAN ALHARAHSHEH'),'normal payment rule includes beneficiary');
ok(/CliQ/.test(rule),'normal payment rule labels CliQ');
ok(!/تحديث طارئ/.test(rule),'normal payment rule does not mention emergency update');
ok(!/نعتذر/.test(rule),'normal payment rule does not inject apology');
ok(pay.containsAllCurrentFileOpeningPaymentDestinations(rule)===true,'all-current-destination validator accepts canonical full payment block');
ok(pay.containsAllCurrentFileOpeningPaymentDestinations('Orange Money 0788500337 PAYAMEEEN')===false,'all-current-destination validator rejects partial payment block');
ok(pay.containsCurrentFileOpeningPaymentDestination('PAYAMEEEN')===true,'current destination recognizer still works');
ok(pay.containsLegacyFileOpeningPaymentDestination('AMEEENPAY')===true,'legacy destination recognizer preserved');
const legacyClarification=pay.currentFileOpeningPaymentRule({includeApology:true});
ok(/بيانات دفع قديمة/.test(legacyClarification),'old-data clarification is available only when explicitly requested');
ok(!/صار تحديث طارئ/.test(legacyClarification),'even explicit old-data clarification avoids alarming emergency wording');

const norm=(x)=>String(x||'').toLowerCase().replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');
const sem=runModule(semRel,{
  './applicationJourney':{applicationJourneyStage:(app)=>app&&app.__stage||'preliminary_review'},
  './linkIntegrity':{buildOfficialLinkContext:()=>({relevant:{receipt:'https://www.ameenfinance.co/receipt?tracking=TEST&phone=0790000000'}})},
  './paymentDestinationOverride':{currentFileOpeningPaymentRule:pay.currentFileOpeningPaymentRule},
  './text':{normalizeArabic:norm}, './types':{}
});
const policy={fileOpeningFeeJod:5,generalLocation:'عمّان – شارع المدينة المنورة'};
function ctx(text,stage='continuation_confirmed_fee_due',topics=[]){return {turn:{rawText:text,topics},truth:{application:{__stage:stage},policy}}}

let c=ctx('هات بينات الدفع');
let lock=sem.resolveSemanticQuestionLock(c);
ok(lock.kind==='file_opening_payment_method','production replay: “هات بينات الدفع” hard-locks to payment details');
let reply=sem.buildSemanticQuestionLockReply({...c,lock})||'';
ok(reply.includes('5 دنانير'),'payment-data reply states exact file-opening fee');
ok(reply.includes('Orange Money')&&reply.includes('0788500337'),'payment-data reply includes Orange Money and phone');
ok(reply.includes('PAYAMEEEN')&&reply.includes('AMEEN1ST')&&reply.includes('AM500337'),'payment-data reply includes all CliQ aliases together');
ok(reply.includes('ABDUL RAHMAN ALHARAHSHEH'),'payment-data reply includes beneficiary');
ok(reply.includes('/receipt?tracking=TEST'),'payment-data reply includes official receipt link when available');
ok(/القسط الأول مش مطلوب الآن|القسط الاول مش مطلوب الان/.test(reply),'payment-data reply confirms first installment is not due now');
ok(!/تحديث طارئ|نعتذر عن أي لخبطة/.test(reply),'payment-data reply contains no scare/apology copy in normal flow');

c=ctx('ايش اعمل'); lock=sem.resolveSemanticQuestionLock(c);
ok(lock.kind==='file_opening_payment_method','fee-due “ايش اعمل” resolves to the real payment next step');
reply=sem.buildSemanticQuestionLockReply({...c,lock})||'';
ok(reply.includes('PAYAMEEEN')&&reply.includes('0788500337'),'fee-due next-step answer gives actionable payment data, not status');

c=ctx('شو المطلوب مني هسا'); lock=sem.resolveSemanticQuestionLock(c);
ok(lock.kind==='file_opening_payment_method','fee-due “شو المطلوب مني هسا” resolves to payment step');

c=ctx('بس بدي حدا يساعدني عالخطوات انا مش فاهم اشي'); lock=sem.resolveSemanticQuestionLock(c);
ok(lock.kind==='file_opening_payment_method','fee-due step-help request resolves to payment instructions instead of human-transfer deflection');

c=ctx('ايش اعمل','preliminary_review'); lock=sem.resolveSemanticQuestionLock(c);
ok(lock.kind==='none','generic “ايش اعمل” outside fee-due stage is not hijacked into payment');

c=ctx('طمني انته'); lock=sem.resolveSemanticQuestionLock(c);
ok(lock.kind==='trust_assurance','“طمني انته” is treated as trust reassurance rather than stale continuation');
reply=sem.buildSemanticQuestionLockReply({...c,lock})||'';
ok(/الضمان العملي|الحقيقة المثبتة|الحقيقه المثبته/.test(reply),'trust reassurance explains practical verified safeguards');
ok(!/اختيار الاستمرار مسجل بالفعل/.test(reply),'trust reassurance never falls back to stale continuation');

c=ctx('ابعت على اورنج مني على رقم 0788500337','continuation_confirmed_fee_due',['payment_method']);
lock=sem.resolveSemanticQuestionLock(c);
ok(lock.kind==='file_opening_payment_method','destination-confirmation question stays payment-locked');

const fullCandidate=`رسوم فتح الملف 5 دنانير. ${rule}`;
ok(sem.semanticQuestionCandidateAligned({lock:{kind:'file_opening_payment_method',hard:true,reason:'test'},candidate:fullCandidate,truth:c.truth})===true,'fee-due full all-options candidate is accepted');
ok(sem.semanticQuestionCandidateAligned({lock:{kind:'file_opening_payment_method',hard:true,reason:'test'},candidate:'ادفع على Orange Money 0788500337',truth:c.truth})===false,'fee-due one-option candidate is rejected');
ok(sem.semanticQuestionCandidateAligned({lock:{kind:'file_opening_payment_method',hard:true,reason:'test'},candidate:'حالة طلبك الآن: تم تسجيل رغبتك بالاستمرار.',truth:c.truth})===false,'stale continuation candidate is rejected for payment request');

// Confirm deterministic continuation/repair call sites will inherit the centralized all-options formatter when present.
for(const rel of [base+'conversationRecovery.ts',base+'finalResponseGate.ts',base+'zeroFallback.ts']){
  const abs=path.join(root,rel);
  if(fs.existsSync(abs)) ok(read(rel).includes('currentFileOpeningPaymentRule('),`${path.basename(rel)} uses centralized payment destination formatter`);
}

// Full semantic TypeScript diagnostics are filtered to files changed by this phase.
const configPath=ts.findConfigFile(root,ts.sys.fileExists,'tsconfig.json');
const hasNodeTypes=fs.existsSync(path.join(root,'node_modules','@types','node','package.json'));
if(configPath&&hasNodeTypes){
  const cfgRead=ts.readConfigFile(configPath,ts.sys.readFile);
  const cfg=ts.parseJsonConfigFileContent(cfgRead.config,ts.sys,path.dirname(configPath));
  const program=ts.createProgram(cfg.fileNames,cfg.options);
  const changed=[payRel,semRel,writerRel,typesRel].map(r=>path.resolve(root,r));
  const changedSet=new Set(changed);
  const diagnostics=ts.getPreEmitDiagnostics(program).filter(d=>d.file&&changedSet.has(path.resolve(d.file.fileName)));
  if(diagnostics.length) console.error(diagnostics.map(d=>{const lc=d.file.getLineAndCharacterOfPosition(d.start||0);return `${path.basename(d.file.fileName)}:${lc.line+1}:${lc.character+1} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`}).join('\n'));
  ok(diagnostics.length===0,'all 7.5.6 modified runtime files pass full semantic TypeScript diagnostics');
} else console.log('INFO: package-only snapshot lacks complete Node type environment; full semantic diagnostics deferred to installer project');

for(const f of [payRel,semRel,writerRel,typesRel]) transpile(f);
console.log(`\n7.5.6 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed) process.exit(1);
