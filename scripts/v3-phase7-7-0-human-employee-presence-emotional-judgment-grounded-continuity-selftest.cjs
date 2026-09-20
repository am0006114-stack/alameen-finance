const fs=require('fs'),path=require('path'),vm=require('vm');
let ts; try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cache=new Map();
function load(rel,overrides={}){let file=path.isAbsolute(rel)?rel:path.join(root,rel);if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';}
 const key=file+'::'+Object.keys(overrides).sort().join('|');if(cache.has(key))return cache.get(key).exports;const src=fs.readFileSync(file,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(key,mod);function req(id){if(Object.prototype.hasOwnProperty.call(overrides,id))return overrides[id];if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';return load(p,overrides)}throw new Error(`unexpected external require ${id}`)}vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder},{filename:file});return mod.exports}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const base='app/api/whatsapp/webhook/_lib/v3-os/';
const files={types:base+'types.ts',state:base+'state.ts',rel:base+'humanRelationshipRuntime.ts',care:base+'humanSemanticCare.ts',writer:base+'writerContract.ts',runtime:base+'runtimeLive.ts',gate:base+'finalResponseGate.ts'};
const src=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,read(v)]));
ok(src.types.includes('v3.0.0-phase7.7.0-human-employee-presence-emotional-judgment-grounded-continuity') || src.types.includes('v3.0.0-phase7.7.1-payment-journey-continuity-human-repair'),'7.7.0 compatibility preserved under 7.7.1');
ok(src.types.includes('v3.0.0-phase7.6.1-human-meaning-authority-semantic-residue-elimination'),'7.6.1 compatibility anchor preserved');
ok(src.types.includes('HumanRelationshipState')&&src.types.includes('humanRelationship?: HumanRelationshipState'),'conversation state carries backward-compatible human relationship memory');
ok(src.state.includes('updateHumanRelationshipState')&&src.state.includes('humanRelationship:'),'state reducer persists relationship judgment');
ok(src.writer.includes('HUMAN_RELATIONSHIP_CONTEXT=')&&src.writer.includes('GROUNDED PERSONAL FACTS')&&src.writer.includes('MEDIA EVIDENCE CONTRACT'),'writer receives 7.7 relationship, fact-grounding, and media-evidence contract');
ok((src.runtime.match(/applyHumanRelationshipEgress\(/g)||[]).length===2,'human relationship egress runs on both true single-response paths');
ok(src.gate.includes('unsupported_customer_personal_fact_claim')&&src.gate.includes('severity = "p0"'),'final gate makes invented customer facts a P0 integrity violation');
ok(src.gate.includes('unsupported_media_or_progress_interpretation')&&src.gate.includes('buildMediaEvidenceRepair'),'final gate repairs unsupported media/progress interpretation');
ok(src.care.includes('Require literal customer evidence')&&!src.care.includes('input.turn.sentiment === "frustrated" || input.turn.sentiment === "angry"'),'semantic-care emotion no longer trusts classifier sentiment alone');

const rel=load(files.rel),care=load(files.care);
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,fileOpeningFeeTiming:'بعد الموافقة المبدئية',fileOpeningFeePurposeRule:'فتح الملف',fileOpeningFeeRefundRule:'مسترد',continuationReassuranceRule:'',commercialStructureRule:'مرابحة',additionalFeesRule:'',requirementsGuidanceRule:'',firstInstallmentRule:'بعد شهر',pickupRule:'',secureDocumentsRule:'',independenceStatement:'',paymentAliases:['PAYAMEEEN','AMEEN1ST','AM500337'],paymentWalletType:'Orange Money',paymentBeneficiaryName:'ABDUL RAHMAN ALHARAHSHEH',paymentMethodRule:'',paymentConfirmationRule:'',normalReviewWindow:'من يومين إلى 3 أيام عمل',recentReleaseAvailabilityRule:'',recentReleaseNotBefore:'2026-12-19',reviewPressureLevel:'severe',severePressureRule:'في ضغط مراجعات شديد جدًا',refundPressureRule:'',disputeResolutionRule:'',autonomousSupervisorRule:'',forbiddenClaims:[]};
const app={id:'a',trackingId:'AM-TEST',fullName:'ندال أحمد',phone:'0780000000',email:null,status:'under_review',paymentStatus:'confirmed',paymentConfirmedAt:null,paymentReference:null,deviceId:null,deviceName:'A56 5G',devicePrice:null,installmentMonths:null,downPayment:null,interestRate:null,monthlyPayment:null,totalWithInterest:null,salary:null,deliveryDelayUntil:null};
const truth={confidence:'authoritative',source:'current_message_tracking',contactAccess:'full',application:app,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()};
function state(lastCustomerText=null,lastAssistantText=null){return {version:'x',waId:'962700000000',activeApplicationId:'a',activeTrackingId:'AM-TEST',currentTopic:null,currentGoal:null,role:{currentRole:'omran',tier:'supervisor',reason:'t',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText,lastAssistantText,consecutiveRiskTurns:0,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,conversationConstraints:{noLinks:false,whatsappOnly:false,avoidRepetition:false,sourceTurnId:null,updatedAt:null},updatedAt:new Date().toISOString()}}
function turn(text,topics=['unknown'],sentiment='calm',id='t'){return {turnId:id,rawText:text,normalizedText:text,acts:[],topics,requestedActions:[],sentiment,urgency:'normal',explicitRoleRequest:null,confidence:1,warnings:[]}}

let st=state();
ok(rel.explicitHumanEmotion({turn:turn('شو صار؟',['application_status'],'frustrated'),state:st})==='neutral','neutral status question stays neutral even when classifier says frustrated');
ok(care.humanSemanticCareMode({turn:turn('شو صار؟',['application_status'],'frustrated'),state:st,truth})===null,'neutral status question does not trigger semantic empathy mode');
ok(rel.explicitHumanEmotion({turn:turn('الموضوع صارلو ٨ ايام',['review_timing'],'calm'),state:st})==='frustrated','literal long-delay evidence activates frustration');
ok(care.humanSemanticCareMode({turn:turn('الموضوع صارلو ٨ ايام',['review_timing'],'calm'),state:st,truth})==='frustration','explicit eight-day wait still activates human semantic care');
ok(rel.explicitHumanEmotion({turn:turn('خرا عليكو',['abuse'],'calm'),state:st})==='angry','literal abuse activates angry emotion');
ok(rel.explicitHumanEmotion({turn:turn('شكرا اخوي كلك زوق',['thanks'],'calm'),state:st})==='warm','warm social language is recognized without classifier dependency');
ok(rel.greetingCue('صباح الخير طبعا')==='صباح النور','morning greeting continuity is recognized');
ok(rel.greetingCue('السلام عليكم')==='وعليكم السلام','salam greeting continuity is recognized');
ok(rel.humanConcernFromTurn(turn('التحميل موقف ع ٩٢ بالمية',['unknown']))==='technical','92-percent stuck symptom is remembered as technical concern, not generic delay');

st=state();st.humanRelationship={lastEmotion:'frustrated',lastConcern:'delay',frustrationStreak:2,delayTurnCount:3,warmTurnCount:0,lastGreetingTurnId:null,updatedAt:new Date().toISOString()};
let hr=rel.updateHumanRelationshipState({state:st,turn:turn('شكرا اخوي',['thanks'],'calm','social')});
ok(hr.lastConcern==='delay','social thank-you does not erase the customer’s active concern category');
ok(hr.lastEmotion==='warm','social thank-you updates current emotional tone to warm');
hr=rel.updateHumanRelationshipState({state:{...st,humanRelationship:hr},turn:turn('التحميل موقف ع ٩٢',['website'],'calm','tech')});
ok(hr.lastConcern==='technical','new substantive technical concern replaces older relationship concern');

let profile=rel.buildHumanRelationshipProfile({turn:turn('شو صار؟',['application_status'],'frustrated'),state:state(),truth,recentTurns:['العميل: شو صار؟']});
ok(profile.empathy==='none'&&profile.rules.neutralStatusQuestionsGetNoSyntheticFrustration===true,'neutral status profile requests no synthetic empathy');
profile=rel.buildHumanRelationshipProfile({turn:turn('خرا عليكو',['abuse'],'calm'),state:state(),truth,recentTurns:['العميل: خرا عليكو']});
ok(profile.empathy==='strong','explicit anger requests strong but bounded empathy');
profile=rel.buildHumanRelationshipProfile({turn:turn('صباح الخير شو صار بطلبي',['greeting','application_status'],'calm'),state:state(),truth,recentTurns:[]});
ok(profile.greeting==='صباح النور'&&profile.rules.acknowledgeGreetingBeforeBusinessAnswer===true,'mixed greeting + business turn keeps greeting obligation');

let reply=rel.applyHumanRelationshipEgress({reply:'معك حق تتضايق إذا حاسس إنك عم تستنى أكثر من اللازم.\n\nطلبك لسا قيد الدراسة النهائية.',turn:turn('شو صار؟',['application_status'],'frustrated'),state:state(),truth});
ok(!/^معك حق/.test(reply)&&/طلبك لسا قيد الدراسة النهائية/.test(reply),'egress removes canned frustration opener from neutral status question');
reply=rel.applyHumanRelationshipEgress({reply:'معك حق تتضايق إذا حاسس إنك عم تستنى أكثر من اللازم.\n\nطلبك لسا قيد الدراسة النهائية.',turn:turn('صارلو ٨ ايام',['review_timing'],'calm'),state:state(),truth});
ok(/^معك حق/.test(reply),'egress retains empathy when the customer explicitly expresses prolonged waiting');
reply=rel.applyHumanRelationshipEgress({reply:'طلبك لسا قيد الدراسة النهائية.',turn:turn('صباح الخير طبعا',['greeting','application_status'],'calm'),state:state(),truth});
ok(/^صباح النور/.test(reply)&&/طلبك لسا/.test(reply),'egress acknowledges greeting before useful business answer');
reply=rel.applyHumanRelationshipEgress({reply:'أكدلي: نعم، اعتمد الرقم.',turn:turn('صباح الخير',['greeting'],'calm'),state:state(),truth});
ok(reply==='أكدلي: نعم، اعتمد الرقم.','action-critical confirmation is not decorated with social text');
reply=rel.collapseAccidentalPhraseDuplication('المعدل الطبيعي للمراجعة المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل');
ok((reply.match(/المعدل الطبيعي للمراجعة/g)||[]).length===1,'accidental exact phrase duplication is collapsed');

const nedalTurn=turn('بشتغل لحسابي يعني',['self_employed'],'calm');
const nedalState=state('اخي انا بشتغل عمل حر كهربائي ماعندي ضمان بس عندي كشف حساب بنك بحركات تحويل');
let bad='تمام، نزول راتبك على البنك الإسلامي وتسجيلك بالضمان معلومات بتفيد دراسة الدخل والملف.';
ok(rel.unsupportedPersonalFactClaim({candidate:bad,turn:nedalTurn,state:nedalState,truth})===true,'NEDAL production reproduction blocks invented bank/salary/social-security facts');
let repaired=rel.buildGroundedPersonalFactRepair({turn:nedalTurn,state:nedalState,truth});
ok(/عمل حر/.test(repaired)&&/كشف الحساب/.test(repaired)&&/ما عندك ضمان/.test(repaired),'grounded repair reflects only customer-supplied self-employment/bank-statement/no-guarantee facts');
ok(!/البنك الإسلامي/.test(repaired)&&!/راتبك ينزل|نزول راتبك/.test(repaired),'grounded repair does not re-invent a bank or salary');
ok(rel.unsupportedPersonalFactClaim({candidate:'كشف حساب البنك الإسلامي ممكن يساعد إذا كان يوضح حركة الدخل.',turn:turn('عندي كشف حساب من البنك الإسلامي',['requirements']),state:state(),truth})===false,'explicitly customer-supplied bank name is allowed');
ok(rel.unsupportedPersonalFactClaim({candidate:'بما إنك مسجل بالضمان فهذا بساعد الملف.',turn:turn('انا عمل حر ما عندي ضمان',['requirements']),state:state(),truth})===true,'reply cannot invert explicit no-social-security statement');
ok(rel.unsupportedPersonalFactClaim({candidate:'كونك موظف وراتبك ينزل شهريًا فهذا بساعد.',turn:turn('انا عمل حر وبشتغل لحسابي',['self_employed']),state:state(),truth})===true,'reply cannot invent fixed employment/salary for self-employed customer');
ok(rel.unsupportedPersonalFactClaim({candidate:'كونك عمل حر، الدراسة بتحدد شو المستند المناسب.',turn:nedalTurn,state:nedalState,truth})===false,'ordinary grounded self-employment answer remains allowed');

ok(rel.mediaEvidenceViolation({candidate:'واضح بالصورة إن الصفحة واقفة على ٩٢٪.',turn:turn('تم استلام صورة من العميل بدون تعليق.',['media_upload']),state:state()})===true,'media envelope cannot be treated as visually understood evidence');
ok(rel.mediaEvidenceViolation({candidate:'نسبة ٩٢٪ خاصة بتحميل الصفحة ومش مؤشر على حالة طلبك.',turn:turn('ليش التحميل موقف ع ٩٢',['unknown']),state:state('هاي الصورة')})===true,'92-percent meaning cannot be invented from follow-up text');
ok(rel.mediaEvidenceViolation({candidate:'طلبك قيد الدراسة النهائية حسب الحالة المسجلة.',turn:turn('ليش التحميل موقف ع ٩٢',['unknown']),state:state('هاي الصورة')})===false,'verified application status can still be stated during media troubleshooting');
let mediaRepair=rel.buildMediaEvidenceRepair({turn:turn('ليش موقف ع ٩٢',['unknown']),state:state('هاي الصورة'),truth});
ok(/الرقم لحاله ما بكفيني/.test(mediaRepair)&&!/إنها تحميل صفحة/.test(mediaRepair.split('فما رح أحكي')[0]),'media repair refuses to guess what 92 percent means');
ok(/حالة طلبك الموثقة الآن/.test(mediaRepair),'media repair separates verified application truth from unknown media meaning');
ok(!/من نص المحادثة/.test(mediaRepair),'media repair uses natural customer-facing language, not internal evidence terminology');
mediaRepair=rel.buildMediaEvidenceRepair({turn:turn('تم استلام صورة من العميل بدون تعليق.',['media_upload']),state:state(),truth});
ok(/ما رح أفترض شو ظاهر فيه/.test(mediaRepair),'generic media repair explicitly avoids pretending to see unsupported details');

for(const relFile of [files.types,files.state,files.rel,files.care,files.writer,files.runtime,files.gate])transpile(relFile);
console.log(`\n7.7.0 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
