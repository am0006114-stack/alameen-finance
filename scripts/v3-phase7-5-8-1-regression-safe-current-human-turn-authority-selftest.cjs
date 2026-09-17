const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const vm=require('vm');
const root=process.argv[2]||process.cwd();
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0,failed=0;
function ok(v,m){if(v){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}}
function transpile(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:rel});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(errs.length===0,`${rel} TypeScript syntax/transpile diagnostics clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));return out.outputText;}
function run(rel,stubs={}){const js=transpile(rel);const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:(id)=>{if(id in stubs)return stubs[id];throw new Error(`unexpected require ${id}`)},console,process:{env:{}},Date,Map,Set,URL});return mod.exports;}
const base='app/api/whatsapp/webhook/_lib/v3-os/';
const humanRel=base+'currentHumanTurnAuthority.ts',arbRel=base+'responseArbiter.ts',writerRel=base+'writerContract.ts',typesRel=base+'types.ts',payRel=base+'paymentDestinationOverride.ts',semRel=base+'semanticQuestionLocks.ts';
const human=read(humanRel),arb=read(arbRel),writer=read(writerRel),types=read(typesRel),pay=read(payRel),sem=read(semRel);
ok(types.includes('v3.0.0-phase7.5.8.1-regression-safe-current-human-turn-authority'),'runtime version identifies 7.5.8.1');
ok(types.includes('v3.0.0-phase7.5.7.1-regression-safe-human-employee-operating-presence'),'7.5.7.1 compatibility anchor preserved');
ok(writer.includes('PHASE 7.5.8 CURRENT HUMAN TURN AUTHORITY'),'writer contract contains 7.5.8 authority contract');
ok(writer.includes('CURRENT_HUMAN_TURN_AUTHORITY=true'),'current human turn authority is explicit');
ok(writer.includes('LEGACY_STATE_IS_CONTEXT_NOT_ANSWER=true'),'legacy state is explicitly context, not answer');
ok(writer.includes('مسجل ضمان')&&writer.includes('الضمان الاجتماعي'),'writer contract disambiguates social security from trust guarantee');
ok(writer.includes('من شهر 8'),'writer contract recognizes anomalous long delay');
ok(writer.includes('بتعيد نفس الحكي'),'writer contract preserves explicit no-repeat repair');
ok(writer.includes('7.5.6 PAYMENT CONVERSION INTEGRITY'),'7.5.6 payment conversion contract remains frozen');
ok(writer.includes('رسوم فتح الملف 5 دنانير'),'5 JOD fee remains explicit');
ok(writer.includes('كل خيارات الدفع المعتمدة معًا'),'all payment options together remains explicit');
ok(writer.includes('رابط الوصل الرسمي'),'official receipt link step remains explicit');
ok(writer.includes('لا تقل "أنا إنسان"'),'7.4.3 no-false-human-identity compatibility phrase preserved');
ok(arb.includes('current_human_turn'),'response arbiter exposes current_human_turn obligation');
ok(arb.indexOf('resolveCurrentHumanTurnAuthority')>=0,'response arbiter imports current human turn authority');
const resolveSection=arb.slice(arb.indexOf('export function resolveResponseObligation'),arb.indexOf('function trackingReply'));
ok(resolveSection.indexOf('currentHumanTurn.kind !== "none"')<resolveSection.indexOf('refundHumanCareMode'),'current human turn authority outranks refund-care state loops');
const arbSection=arb.slice(arb.indexOf('export function arbitrateProductionReply'));
ok(arbSection.indexOf('meaningLock.kind !== "none"')<arbSection.indexOf('currentHumanTurn.kind !== "none"'),'transaction/action meaning lock remains stronger than human-turn repair');
ok(arbSection.includes('final current human turn authority repaired legacy state loop'),'arbiter records hard final human-turn repair reason');
ok(arbSection.indexOf('currentHumanTurn.kind !== "none"')<arbSection.indexOf('semanticQuestionLock.kind !== "none"'),'contextual current-turn authority can correct a stale semantic lock');
ok(human.includes('direct_call_request')&&human.includes('long_delay_anomaly')&&human.includes('social_security_income'),'human-turn authority covers call, anomaly, and social-security contexts');
ok(human.includes('website_upload_error')&&human.includes('explicit_no_repeat')&&human.includes('five_jod_concern'),'human-turn authority covers upload error, no-repeat, and 5 JOD concern');
ok(human.includes('open_human_prompt')&&human.includes('meeting_request')&&human.includes('personal_question'),'human-turn authority covers human conversational topic changes');
const normalize=x=>String(x||'').toLowerCase().replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');
const stageOf=(app)=>app&&app.__stage||'unbound';
const label=(app)=>({refund_requested:'الاسترداد قيد المعالجة',refund_completed:'تم الاسترداد',payment_confirmed_under_review:'قيد الدراسة النهائية',preliminary_review:'قيد المراجعة المبدئية',continuation_confirmed_fee_due:'تم تسجيل رغبتك بالاستمرار'}[stageOf(app)]||'قيد المتابعة');
const contact=x=>/(?:اتصال|تواصل|رن|اتصل|مكالمه|مكالمة|رقم تلفون|رقم هاتف)/.test(normalize(x));
const mod=run(humanRel,{'./applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:label},'./currentTurnAuthority':{explicitContactRequestText:contact},'./text':{normalizeArabic:normalize},'./types':{}});
function mk(text,st='payment_confirmed_under_review'){return {turn:{rawText:text,topics:[],requestedActions:[],acts:[],sentiment:'neutral'},state:{lastVerifiedApplication:{application:{__stage:st,trackingId:'AM-TEST'}},lastCustomerText:'',lastAssistantText:''},truth:{application:{__stage:st,trackingId:'AM-TEST'},policy:{fileOpeningFeeJod:5,generalLocation:'عمّان – شارع المدينة المنورة'}}}}
function check(text,kind,st){const i=mk(text,st);const a=mod.resolveCurrentHumanTurnAuthority(i);ok(a.kind===kind,`production corpus locks ${kind}: ${text}`);const r=mod.buildCurrentHumanTurnReply({...i,authority:a})||'';return {a,r}}
let x=check('ارجو التواصل معي عبر اتصال هاتفي','direct_call_request','refund_requested');ok(/اتصال|مكالم/.test(normalize(x.r))&&!/طلبك ملغي بالفعل/.test(normalize(x.r)),'refund state cannot swallow explicit call request');
x=check('انا راتبي بنزل عالبنك الاسلامي الأردني ومسجل ضمان','social_security_income','preliminary_review');ok(/راتب|البنك/.test(normalize(x.r))&&/الضمان/.test(normalize(x.r))&&!/الضمان العملي/.test(normalize(x.r)),'social-security income gets requirements context, not trust template');
x=check('لم يتم استكمال هذا الطلب الملف كبير جدا بحيث لا تستطيع وظيفة الموقع معالجته','website_upload_error','needs_identity');ok(/حجم|كبير/.test(normalize(x.r))&&/الرابط الرسمي/.test(normalize(x.r))&&!/شارع المدينه/.test(normalize(x.r)),'website upload error gets practical file-size repair, not office location');
x=check('انا صارلي من شهر 8 مقدم','long_delay_anomaly','payment_confirmed_under_review');ok(/تجاوز|مش بنتكلم/.test(normalize(x.r)),'month-8 delay is acknowledged as anomaly, not ordinary 2-3 day request');
x=check('انت بتعيد وبتزيد بنفس الحكي وما عم تعطيني حل اعطيني حل','explicit_no_repeat','payment_confirmed_under_review');ok(/ما رح اعيد|ما رح أعيد/.test(x.r),'explicit complaint about repetition vetoes repeated template');
x=check('راحو علي ال ٥','five_jod_concern','payment_confirmed_under_review');ok(/الخمس/.test(normalize(x.r))&&/رسوم فتح الملف/.test(normalize(x.r)),'5 JOD concern is answered directly');
x=check('كلهم خمس ليرات كل هذا بدهم وقت','five_jod_concern','refund_requested');ok(/استرداد/.test(normalize(x.r))&&/قيد المعالجه/.test(normalize(x.r)),'refund-stage 5 JOD concern keeps verified refund truth');
x=check('عارف شو نفسي اعمل؟','open_human_prompt','refund_requested');ok(/احكيلي/.test(normalize(x.r))&&!/الاسترداد/.test(normalize(x.r)),'refund state cannot swallow open human conversational prompt');
x=check('نفسي نتقابل انا وانت الان','meeting_request','refund_requested');ok(/نحكي هون/.test(normalize(x.r))&&!/الاسترداد/.test(normalize(x.r)),'refund state cannot swallow meeting topic change');
x=check('عندك خوات؟','personal_question','refund_requested');ok(/الشخصي|خلينا عليك/.test(normalize(x.r))&&!/الاسترداد/.test(normalize(x.r)),'refund state cannot swallow personal conversational question');
const payMod=run(payRel);const rule=payMod.currentFileOpeningPaymentRule();ok(payMod.containsAllCurrentFileOpeningPaymentDestinations(rule)===true,'authoritative payment rule still contains every approved destination');ok(/Orange Money/.test(rule)&&/0788500337/.test(rule),'payment rule preserves Orange Money phone');ok(/PAYAMEEEN/.test(rule)&&/AMEEN1ST/.test(rule)&&/AM500337/.test(rule),'payment rule preserves all CliQ aliases together');ok(/ABDUL RAHMAN ALHARAHSHEH/.test(rule),'payment rule preserves beneficiary name');ok(!/صار تحديث طارئ|نعتذر/.test(rule),'normal 5 JOD payment reply stays free of emergency-wallet apology');
ok(sem.includes('stage === "continuation_confirmed_fee_due"'),'7.5.6 fee-due hard lock remains in semantic question locks');ok(sem.includes('currentFileOpeningPaymentRule()'),'fee-due lock still uses authoritative payment rule');ok(/payameeen/i.test(sem)&&/ameen1st/i.test(sem)&&/am500337/i.test(sem)&&/0788500337/.test(sem),'candidate alignment still requires all payment destinations');

const compat750=read('scripts/v3-phase7-5-0-unified-conversation-decision-plane-selftest.cjs');
const compat746=read('scripts/v3-phase7-4-6-conversation-repair-true-single-egress-selftest.cjs');
const compat745=read('scripts/v3-phase7-4-5-single-response-authority-selftest.cjs');
ok(compat750.includes("'./currentHumanTurnAuthority'")&&compat750.includes('resolveCurrentHumanTurnAuthority'),'7.5.0 inherited harness mocks currentHumanTurnAuthority import');
ok(compat746.includes("'./currentHumanTurnAuthority'")&&compat746.includes('resolveCurrentHumanTurnAuthority'),'7.4.6 inherited harness mocks currentHumanTurnAuthority import');
ok(compat745.includes("'./currentHumanTurnAuthority'")&&compat745.includes('resolveCurrentHumanTurnAuthority'),'7.4.5 inherited harness mocks currentHumanTurnAuthority import');

for(const f of [humanRel,arbRel,writerRel,typesRel]) transpile(f);
console.log(`\n7.5.8.1 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
