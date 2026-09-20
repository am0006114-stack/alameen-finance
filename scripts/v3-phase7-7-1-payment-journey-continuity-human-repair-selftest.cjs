const fs=require('fs'),path=require('path'),vm=require('vm');
let ts; try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cache=new Map();
function load(rel){let file=path.isAbsolute(rel)?rel:path.join(root,rel);if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';}
 if(cache.has(file))return cache.get(file).exports;const src=fs.readFileSync(file,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(file,mod);function req(id){if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';return load(p)}throw new Error(`unexpected external require ${id}`)}vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder},{filename:file});return mod.exports}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const types=read(b+'types.ts'), writer=read(b+'writerContract.ts'), recoverySrc=read(b+'conversationRecovery.ts'), cqSrc=read(b+'currentQuestionAnswerContract.ts'), journeySrc=read(b+'humanFirstJourneyIntelligence.ts'), runtime=read(b+'runtimeLive.ts'), pay=read(b+'paymentDestinationOverride.ts');
ok(types.includes('v3.0.0-phase7.7.1-payment-journey-continuity-human-repair'),'runtime version identifies 7.7.1');
ok(types.includes('v3.0.0-phase7.6.1-human-meaning-authority-semantic-residue-elimination'),'7.6.1 compatibility anchor preserved');
ok(writer.includes('PHASE 7.7.1 PAYMENT JOURNEY CONTINUITY + HUMAN REPAIR'),'writer carries 7.7.1 fee-due continuity contract');
ok(writer.includes('PHASE 7.7.1 SEMANTIC CONTINUATION'),'writer carries semantic continuation/decline contract');
ok(pay.includes('0788500337')&&pay.includes('PAYAMEEEN')&&pay.includes('AMEEN1ST')&&pay.includes('AM500337')&&pay.includes('ABDUL RAHMAN ALHARAHSHEH'),'5 JOD destinations remain frozen');
ok(recoverySrc.includes('contextualDecline')&&recoverySrc.includes('لا\\s*يسلمو'),'contextual polite decline is protected from false continuation');
ok(recoverySrc.includes('استمرار|اكمل|أكمل|كمل|نكمل|نستمر|استمر'),'bare semantic continuation variants are recognized');
ok(runtime.includes('explicitDoNotContinueText(effectiveCustomerText, executionState.lastAssistantText)'),'runtime continuation persistence respects contextual decline');
ok(cqSrc.includes('yesNoPayment')&&cqSrc.includes('في\\s+دفع\\s+حاليا'),'direct yes/no payment confusion is recognized');
ok(cqSrc.includes('currentFileOpeningPaymentRule({ includeApology: false })'),'current-question fee-due reply uses authoritative all-options formatter');
ok(journeySrc.includes('asksPaymentNow')&&journeySrc.includes('نعم، هسا عليك 5 دنانير'),'journey repair answers fee-due confusion directly');
ok(journeySrc.includes('currentFileOpeningPaymentRule({ includeApology: false })'),'journey repair preserves all approved payment options');

ok(/\^\(\?:استمرار\|اكمل\|أكمل\|كمل\|نكمل\|نستمر\|استمر\)\$/.test(recoverySrc),'bare continuation regex is explicitly bounded');
ok(recoverySrc.includes('explicitDoNotContinueText(value, context?)') || recoverySrc.includes('explicitDoNotContinueText(value: string | null | undefined, context?: string | null)'),'decline detector accepts conversation context');

const cq=load(b+'currentQuestionAnswerContract.ts');
function turn(text,topics=['payment']){return {turnId:'t',rawText:text,normalizedText:text,acts:[],topics,requestedActions:[],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:1,warnings:[]}}
ok(cq.directPaymentExecutionQuestion(turn('في دفع ولا فش دفع هسا فهمني اخوي'))===true,'production corpus: fee-due yes/no payment question is owned');
ok(cq.directPaymentExecutionQuestion(turn('في دفع حاليا ولا لا'))===true,'production corpus: concise payment-now question is owned');
ok(cq.directPaymentExecutionQuestion(turn('القسط الشهري كم'))===false,'monthly installment question is not hijacked into 5 JOD execution');

const policy={fileOpeningFeeJod:5,paymentMethodRule:'OLD POLICY SHOULD NOT WIN',normalReviewWindow:'من يومين إلى 3 أيام عمل'};
const app={id:'a',trackingId:'AM-TEST',fullName:'Test',phone:'0790000000',email:null,status:'customer_confirmed_continue',paymentStatus:'pending',paymentConfirmedAt:null,paymentReference:null,deviceId:null,deviceName:'iPhone',devicePrice:null,installmentMonths:null,downPayment:null,interestRate:null,monthlyPayment:null,totalWithInterest:null,salary:null,deliveryDelayUntil:null,documents:{paymentReceiptUploaded:false}};
const truth={confidence:'authoritative',source:'x',contactAccess:'full',application:app,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()};
const st={version:'x',waId:'x',activeApplicationId:'a',activeTrackingId:'AM-TEST',currentTopic:null,currentGoal:null,role:{currentRole:'omran',tier:'supervisor',reason:'x',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,conversationConstraints:{noLinks:false,whatsappOnly:false,avoidRepetition:false,sourceTurnId:null,updatedAt:null},updatedAt:new Date().toISOString()};
let reply=cq.buildCurrentQuestionAnswerContractReply({turn:turn('في دفع ولا فش دفع هسا فهمني اخوي',['payment_fee']),state:st,truth});
ok(/5 دنانير/.test(reply||'')&&/0788500337/.test(reply||''),'fee-due confusion answer states fee and Orange Money phone');
ok(/PAYAMEEEN/.test(reply||'')&&/AMEEN1ST/.test(reply||'')&&/AM500337/.test(reply||''),'fee-due confusion answer includes all CliQ aliases');
ok(/ABDUL RAHMAN ALHARAHSHEH/.test(reply||''),'fee-due confusion answer includes beneficiary');
ok(!/تم تسجيل رغبتك بالاستمرار/.test(reply||''),'fee-due confusion never falls back to stale continuation label');

for(const f of [b+'types.ts',b+'writerContract.ts',b+'conversationRecovery.ts',b+'runtimeLive.ts',b+'currentQuestionAnswerContract.ts',b+'humanFirstJourneyIntelligence.ts'])transpile(f);
console.log(`\n7.7.1 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
