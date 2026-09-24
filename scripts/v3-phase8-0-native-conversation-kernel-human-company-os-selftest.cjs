const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
let ts; try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd(); let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cache=new Map();
function load(rel){
  let file=path.isAbsolute(rel)?rel:path.join(root,rel);
  if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';else if(fs.existsSync(file)&&fs.statSync(file).isDirectory()&&fs.existsSync(path.join(file,'index.ts')))file=path.join(file,'index.ts');}
  if(cache.has(file))return cache.get(file).exports;
  const src=fs.readFileSync(file,'utf8');
  const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});
  const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
  const mod={exports:{}};cache.set(file,mod);
  function req(id){
    if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';else if(fs.existsSync(p)&&fs.statSync(p).isDirectory()&&fs.existsSync(path.join(p,'index.ts')))p=path.join(p,'index.ts');return load(p)}
    if(id==='@/lib/supabaseAdmin')return{supabaseAdmin:{}};
    if(id==='crypto')return require('crypto');
    throw new Error(`unexpected external require ${id} from ${file}`);
  }
  vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder,AbortController,fetch:async()=>{throw new Error('network disabled in selftest')}},{filename:file});
  return mod.exports;
}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
function normHash(rel){let b=fs.readFileSync(path.join(root,rel));let a=[];for(let i=0;i<b.length;i++){if(b[i]===13){if(i+1<b.length&&b[i+1]===10)i++;a.push(10)}else a.push(b[i])}return crypto.createHash('sha256').update(Buffer.from(a)).digest('hex')}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const types=read(b+'types.ts'), runtime=read(b+'runtimeLive.ts'), kernelSrc=read(b+'nativeConversationKernel.ts'), registrySrc=read(b+'businessTruthRegistry.ts'), policySrc=read(b+'policy.ts');

(async()=>{
// Architecture identity / ownership.
ok(types.includes('v3.0.0-phase8.0-native-conversation-kernel-human-company-os'),'runtime version identifies Phase 8.0 Native Conversation Kernel + Human Company OS');
ok(runtime.includes('PHASE 8.0 NATIVE CONVERSATION KERNEL'),'runtime contains Phase 8 native kernel cutover');
ok(runtime.includes('PHASE 8.0 NATIVE CONVERSATION EGRESS'),'runtime native kernel owns normal customer egress');
ok(runtime.includes('nativeKernelInitial = await runNativeConversationKernel'),'normal live path uses one native kernel call for understanding + initial draft');
ok(runtime.includes('replyAttempts < 2'),'any validation/action regeneration is bounded to maximum two generations');
ok(!runtime.includes('interpretTurnWithAi'),'legacy AI interpreter is retired from Phase 8 live path');
ok(!runtime.includes('verifySemanticReply('),'semantic judge/verifier model is retired from Phase 8 live path');
ok(!runtime.includes('buildWriterPrompt('),'legacy writer contract is retired from Phase 8 live egress');
ok(!runtime.includes('buildHumanJourneyReply('),'legacy human-journey writer is retired from Phase 8 live egress');
ok(!runtime.includes('buildConversationRecoveryReply('),'legacy conversation-recovery writer is retired from Phase 8 live egress');
ok(!runtime.includes('arbitrateProductionReply('),'legacy response arbiter no longer writes live replies');
ok(!runtime.includes('verifyReply('),'legacy broad reply verifier no longer controls normal Phase 8 egress');
ok(!runtime.includes('enforceFinalResponseGate('),'legacy final-response writer/gate no longer controls normal Phase 8 egress');
ok(!runtime.toLowerCase().includes('runtimeshadow'),'no shadow runtime is introduced into Phase 8 live path');
ok(!kernelSrc.toLowerCase().includes('shadow'),'native kernel contains no shadow/model-comparison path');
ok(kernelSrc.includes('temperature: 0.38')&&kernelSrc.includes('maxTokens: 1450'),'native kernel performs a single combined semantic + answer generation');

// Human Company OS contract.
for(const name of ['فدوة','تالا','عبدالله','عبدالرحمن','عمران']) ok(kernelSrc.includes(name),`Human OS prompt preserves employee voice ${name}`);
ok(kernelSrc.includes('KHALED_CALMING_OVERLAY')&&kernelSrc.includes('حكمة وهدوء خالد'),'Khaled calming/wisdom overlay is preserved without changing transaction role');
ok(kernelSrc.includes('المماطلة البشرية الآمنة')&&kernelSrc.includes('كسب وقت بصدق وحكمة'),'safe truthful human stalling is an explicit Human OS behavior');
ok(kernelSrc.includes('استخدم الحكمة البشرية')&&kernelSrc.includes('افهم لماذا يسأل العميل'),'Human OS requires deep intent/concern understanding, not keyword response');
ok(kernelSrc.includes('إذا العميل قال إنه سمع نفس الكلام')&&kernelSrc.includes('لا تعيد نفس الكلام'),'Human OS explicitly prevents repeating the same delay/status paragraph');
ok(kernelSrc.includes('لا تشترط عبارة حرفية «أود الاستمرار»'),'semantic continuation does not require a magic phrase');
ok(kernelSrc.includes('يجوز «معك عمران من الأمين»')&&kernelSrc.includes('ممنوع «أنا إنسان/موظف بشري»'),'employee identity is conversational continuity, not false literal-human claim');
ok(kernelSrc.includes('لا تذكر معلومة غير مطلوبة')&&kernelSrc.includes('رسوم 5 دنانير لا تظهر في سؤال لون/سعر/عنوان/status'),'Human OS forbids unsolicited fee/status drift');

// Protected 5-JOD contract is explicit and central.
ok(kernelSrc.includes('PROTECTED_5_JOD_JOURNEY')&&kernelSrc.includes('موافقة مبدئية -> إفصاح تجاري كامل')&&kernelSrc.includes('اعتماد الدفع إداريًا -> دراسة نهائية'),'protected 5-JOD journey is explicit in the native kernel');
ok(kernelSrc.includes('لا ترسل بيانات Orange Money/CliQ أو رابط الوصل قبل informed continuation'),'payment destinations remain hidden before informed continuation');
ok(kernelSrc.includes('تنظيم الدراسة النهائية')&&kernelSrc.includes('حجم الطلبات الكبير')&&kernelSrc.includes('لا تشتري الموافقة ولا تضمنها'),'full fee rationale + volume + non-guarantee truth is preserved');
ok(kernelSrc.includes('سؤال الأقساط الشهرية أو القسط الأول منفصل تمامًا عن 5 JOD'),'monthly/first installment remains isolated from file-opening fee');
ok(kernelSrc.includes('PAYMENT_PROOF_BINDING')&&kernelSrc.includes('الرابط الرسمي المرتبط بطلبه/رقم تتبعه ورقم الهاتف'),'payment proof is bound to the official application-specific receipt path');

// Central business/product truth retained.
const registry=load(b+'businessTruthRegistry.ts');
ok(registry.IPHONE18_PRODUCTS.length===8,'iPhone 18 authoritative catalog keeps exactly 8 variants');
ok(registry.IPHONE18_COLORS.join('|')==='أسود|فضي|جليدي|عنّابي','iPhone 18 authoritative colors stay exact');
ok(registry.IPHONE18_WARRANTY_RULE.includes('iSYSTEMS الأردن')&&registry.IPHONE18_WARRANTY_RULE.includes('نسخة الشرق الأوسط'),'iPhone 18 warranty + Middle East version truth preserved');
ok(registry.IPHONE18_PICKUP_RULE.includes('بعد شهر من الموافقة النهائية')&&registry.IPHONE18_PICKUP_RULE.includes('موعد رسمي مؤكد')&&registry.IPHONE18_PICKUP_RULE.includes('لا يوجد توصيل'),'iPhone 18 one-month-after-final-approval pickup truth preserved');
ok(registry.ALAMEEN_FIRST_INSTALLMENT_RULE.includes('بعد شهر من تاريخ توقيع العقد')&&registry.ALAMEEN_FIRST_INSTALLMENT_RULE.includes('نفسه تاريخ استلام الجهاز'),'first installment = contract signing + one month; signing=receipt date');
ok(registry.ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE.includes('CliQ')&&registry.ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE.includes('تحويل بنكي')&&registry.ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE.includes('الموقع الذي تم فيه توقيع العقد'),'monthly installment channels remain CliQ / bank / signing location');
ok(policySrc.includes('fileOpeningFeeJod: 5')&&policySrc.includes('مستردة بالكامل')&&policySrc.includes('قياس جدية الطلب'),'policy keeps 5-JOD amount/refund/seriousness rationale');

// Exact protected architecture anchors: no action/payment/route expansion.
ok(normHash('app/api/whatsapp/webhook/route.ts')==='bd1ebf07bf79ebe03246590e047fe78d5dff1bfa515158c80599c2408ec625b0','route ownership remains byte-contract preserved');
ok(normHash(b+'transactionalActionAdapter.ts')==='b9b65f7965f2683de86f61ed70e6e2975ddf36f43f10769772131e27b8509dce','transactional Real Actions adapter remains preserved');
ok(normHash(b+'paymentDestinationOverride.ts')==='6f915ad10d4565ee09e8e73f3f1cf8a6054147d471a0484d8c2fec63f6ea1335','authoritative file-fee payment destinations remain preserved');
ok(normHash(b+'mutationConfirmationGate.ts')==='a2380e66119ebc39e7a4c07d03aad1654e21a229f517caaf5fe23eb07fbc6024','destructive mutation confirmation gate remains preserved');
ok(normHash(b+'continuationPersistence.ts')==='a1e6c42ce29efdabcc84f893ce7d970e6f7f2c87a918098df32a5bee3e84f398','continuation persistence remains preserved');

// Test helpers.
const pol=load(b+'policy.ts').getV3Policy();
function app(status='preliminary_application',paymentStatus=null){return {id:'app-1',trackingId:'AM-1',fullName:'Test Customer',phone:'0790000000',email:null,status,paymentStatus,paymentConfirmedAt:null,paymentReference:null,deviceId:null,deviceName:'iPhone 18 Pro Max - 512GB',devicePrice:1499,installmentMonths:36,downPayment:0,interestRate:null,monthlyPayment:36.69,totalWithInterest:null,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:status==='preliminary_qualified'||status==='customer_confirmed_continue'?'2026-09-23T00:00:00Z':null,paidClickedAt:null,documents:null}}
function truth(status='preliminary_application',paymentStatus=null){return {confidence:'authoritative',source:'current_message_tracking',contactAccess:'full',application:app(status,paymentStatus),ambiguousApplications:[],policy:pol,fetchedAt:new Date().toISOString()}}
function state(over={}){return {version:'v3.0.0-phase8.0-native-conversation-kernel-human-company-os',waId:'9627',activeApplicationId:'app-1',activeTrackingId:'AM-1',currentTopic:null,currentGoal:null,role:{currentRole:'tala',tier:'frontline',reason:'x',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,conversationConstraints:{},semanticMemory:null,commercialDisclosure:null,humanRelationship:null,updatedAt:new Date().toISOString(),...over}}
function semantic(q,decision={}){return {meaningSummary:q,customerGoal:'help customer',currentQuestion:q,answerObligations:[q],references:[],entities:[],decision:{continuation:'unknown',cancellation:'unknown',refund:'unknown',aliasConfirmation:'unknown',condition:null,...decision},correctionOfPrevious:false,socialClosure:false,requiresExternalFact:false,externalFactNeeded:null,answerMode:'direct',confidence:.96,warnings:[]}}
function turn(text,topics=[],opts={}){const actions=opts.actions||[];return {turnId:'t1',rawText:text,normalizedText:text,acts:(opts.acts||topics.map((topic,i)=>({id:'a'+i,type:'ask',topic,text,action:'none',value:null,confidence:.95,source:'resolved'}))),topics,requestedActions:actions,sentiment:opts.sentiment||'calm',urgency:'normal',explicitRoleRequest:opts.explicitRoleRequest||null,confidence:.95,warnings:[],semantic:semantic(opts.q||text,opts.decision||{})}}
const kernel=load(b+'nativeConversationKernel.ts');
const validate=(x)=>kernel.validateNativeConversationReply({reply:x.reply,turn:x.turn||turn(x.customerText||'مرحبا',x.topics||[]),state:x.state||state(),truth:x.truth||truth(),actions:x.actions||[],recentTurns:x.recentTurns||[],customerText:x.customerText||x.turn?.rawText||'مرحبا',disclosureRequiredThisTurn:Boolean(x.disclosureRequiredThisTurn),protectedFiveJodStep:Boolean(x.protectedFiveJodStep)});

// Legacy/internal fallback retirement.
for(const bad of [
  'احكيلي شو بدك تعرف، وبجاوبك على الموجود فعليًا بدون ما أفترض خطوة ما صارت.',
  'اكتب سؤالك أو رقم التتبع، وبجاوبك فقط من الحقيقة الموثقة عندنا.',
  'سؤالك واضح، المعلومة المحددة اللازمة للجواب مش موجودة عندي.',
  'الحالة اللي ظاهرة على الطلب هي اللي بعتمدها هسا. إذا رسالتك فيها سؤال محدد بجاوب عليه.',
  'لا تخترع سعرًا أو لونًا خارج الحقيقة التجارية المعتمدة.'
]) ok(!validate({reply:bad}).pass,`legacy/internal canned reply is blocked: ${bad.slice(0,34)}`);

// Media grounding.
ok(!validate({reply:'وصلتني الصورة وبراجعها.',customerText:'هسا بدي ابعثلك صورة',topics:['requirements']}).pass,'intent to send media cannot be acknowledged as received');
ok(!validate({reply:'وصلت الصورة. إذا هي وصل دفع ارفعها رسميًا من الرابط الآمن.',customerText:'تم استلام صورة من العميل بدون تعليق.',topics:['receipt_upload']}).reasons.includes('false_media_received_claim'),'real image event may be acknowledged');
ok(!validate({reply:'وصلت الصورة.',customerText:'تم استلام رسالة واتساب من نوع unsupported.',topics:['unknown']}).pass,'unsupported WhatsApp event alone is not falsely treated as an image');

// Human identity / promises / appointment truth.
ok(!validate({reply:'أنا الموظف المسؤول عن طلبك وبحولك لموظف بشري.',customerText:'بدي موظف',topics:['human_request']}).pass,'false literal human/handoff claim is blocked');
ok(validate({reply:'معك عمران من الأمين، احكيلي شو المشكلة الأساسية وبمشي معك فيها.',customerText:'بدي عمران',topics:['manager_request'],state:state({role:{currentRole:'omran',tier:'supervisor',reason:'x',sinceTurnId:null,introduced:false}})}).pass,'persona identity may be used as conversational continuity without false human claim');
ok(!validate({reply:'تم التصعيد للإدارة ورح يتواصل معك موظف بكرة.',customerText:'استعجلولي الطلب',topics:['complaint']}).pass,'unsupported escalation/future-human promise is blocked');
ok(!validate({reply:'تعال بكرة عالمكتب وأنا بحجزلك موعد.',customerText:'متى اجي',topics:['appointment']}).pass,'unsupported appointment coordination is blocked');

// Known truth / link / regulatory safety.
ok(validate({reply:'العنوان العام: عمّان – شارع المدينة المنورة، والحضور بموعد رسمي مؤكد.',customerText:'وين موقعكم؟',topics:['office_location']}).pass,'known office address can be answered directly');
ok(!validate({reply:'ما بعرف وين موقعنا.',customerText:'وين موقعكم؟',topics:['office_location']}).pass,'known office address cannot be abandoned');
ok(!validate({reply:'إحنا شركة تمويل مرخصة من البنك المركزي.',customerText:'تابعين للبنك المركزي؟',topics:['legal']}).pass,'forbidden financing/central-bank regulatory claim is blocked');
ok(!validate({reply:'تابع التفاصيل هون https://evil.example/test',customerText:'وين اتابع؟',topics:['tracking']}).pass,'foreign/unissued link is blocked');

// Payment truth + action safety.
ok(!validate({reply:'دفعك مؤكد إداريًا.',customerText:'دفعت',topics:['payment_confirmation'],truth:truth('customer_confirmed_continue','pending')}).pass,'customer claim cannot become authoritative payment confirmation');
ok(!validate({reply:'تم إلغاء طلبك بنجاح.',customerText:'بدي الغي',topics:['cancellation'],turn:turn('بدي الغي',['cancellation'],{actions:['cancel_application']}),actions:[]}).pass,'cancel completion requires execution receipt');
ok(validate({reply:'تم إلغاء طلبك بنجاح.',customerText:'بدي الغي',topics:['cancellation'],turn:turn('بدي الغي',['cancellation'],{actions:['cancel_application']}),actions:[{action:'cancel_application',outcome:'executed',executed:true,authoritativeSummary:'cancelled',mutationId:'m1',blocker:null}]}).pass,'cancel completion is allowed only with execution receipt');
const needCancel=[{action:'cancel_application',outcome:'needs_confirmation',executed:false,authoritativeSummary:null,mutationId:null,blocker:null}];
ok(!validate({reply:'تمام.',customerText:'بدي الغي الطلب',topics:['cancellation'],turn:turn('بدي الغي الطلب',['cancellation'],{actions:['cancel_application']}),actions:needCancel}).pass,'pending destructive action requires action-specific confirmation language');
ok(validate({reply:'أكيد. إذا قرارك نهائي، أكدلي واكتب: نعم، ألغي الطلب.',customerText:'بدي الغي الطلب',topics:['cancellation'],turn:turn('بدي الغي الطلب',['cancellation'],{actions:['cancel_application']}),actions:needCancel}).pass,'action-specific cancel confirmation passes');

// Monthly installments must not leak file-opening fee.
let vr=validate({reply:'سداد الأقساط الشهرية حسب تفضيلك: CliQ، تحويل بنكي، أو الدفع بالموقع اللي تم فيه توقيع العقد.',customerText:'كل شهر كيف بدفع القسط؟',topics:['payment_method'],truth:truth('under_review','paid')});
ok(vr.pass,'monthly installment method can be answered from unified truth');
vr=validate({reply:'كل شهر بتدفع القسط، ورسوم فتح الملف 5 دنانير.',customerText:'كل شهر كيف بدفع القسط؟',topics:['payment_method'],truth:truth('under_review','paid')});
ok(!vr.pass&&vr.reasons.includes('unsolicited_fee_topic_drift'),'monthly installment question cannot drift into 5-JOD fee');

// First installment truth.
ok(registry.ALAMEEN_FIRST_INSTALLMENT_RULE==='القسط الأول يستحق بعد شهر من تاريخ توقيع العقد، وتاريخ توقيع العقد هو نفسه تاريخ استلام الجهاز.','first-installment canonical truth is exact');

// Informed commercial disclosure vs payment execution.
const disclosureGood='قبل ما نثبت الاستمرار، رسوم فتح الملف 5 دنانير. هدفها تنظيم الدراسة النهائية بسبب حجم الطلبات الكبير وقياس جدية الرغبة والاستعداد للاستمرار. هي مش دفعة أولى ولا القسط الأول ولا ثمن الجهاز، ولا تشتري الموافقة ولا تضمنها. إذا التفاصيل مناسبة إلك قرر براحتك.';
vr=validate({reply:disclosureGood,customerText:'استمرار',topics:['continuation'],truth:truth('preliminary_qualified',null),turn:turn('استمرار',['continuation'],{actions:['continue_application'],decision:{continuation:'confirmed'}}),disclosureRequiredThisTurn:true});
ok(vr.pass,'first continuation can deliver full informed disclosure without payment destinations');
vr=validate({reply:disclosureGood+' Orange Money 0788500337 وPAYAMEEEN',customerText:'استمرار',topics:['continuation'],truth:truth('preliminary_qualified',null),turn:turn('استمرار',['continuation'],{actions:['continue_application'],decision:{continuation:'confirmed'}}),disclosureRequiredThisTurn:true});
ok(!vr.pass&&vr.reasons.some(x=>x.includes('payment')),'payment destinations are blocked while disclosure is still required');
const paidStep='تمام، رسوم فتح الملف 5 دنانير. التحويل عبر Orange Money على 0788500337 أو CliQ: PAYAMEEEN أو AMEEEN1ST أو AM500337. اسم المستفيد ABDUL RAHMAN ALHARAHSHEH. بعد التحويل ارفع الوصل: https://www.ameenfinance.co/receipt?tracking=AM-1&phone=0790000000';
// Deliberately use a bad alias first to prove legacy alias protection.
ok(!validate({reply:paidStep,customerText:'تمام كمل',topics:['continuation'],truth:truth('customer_confirmed_continue','pending'),turn:turn('تمام كمل',['continuation'],{actions:['continue_application'],decision:{continuation:'confirmed'}}),protectedFiveJodStep:true}).pass,'legacy/incorrect payment alias cannot pass protected 5-JOD step');
const protectedGood='تمام، رسوم فتح الملف 5 دنانير. التحويل عبر Orange Money على 0788500337 أو CliQ: PAYAMEEEN أو AMEEN1ST أو AM500337. اسم المستفيد ABDUL RAHMAN ALHARAHSHEH. بعد التحويل ارفع الوصل من الرابط الرسمي: https://www.ameenfinance.co/receipt?tracking=AM-1&phone=0790000000';
vr=validate({reply:protectedGood,customerText:'تمام كمل',topics:['continuation'],truth:truth('customer_confirmed_continue','pending'),turn:turn('تمام كمل',['continuation'],{actions:['continue_application'],decision:{continuation:'confirmed'}}),protectedFiveJodStep:true});
ok(vr.pass,'protected informed continuation requires and accepts all current payment destinations + bound receipt link');

// Payment proof binding answer: exact production failure scenario.
const proofReply='بعد التحويل ارفع الوصل من الرابط الرسمي المرتبط بطلبك ورقم التتبع والهاتف. الإدارة بتراجع الوصل وبتثبت الدفع على نفس الطلب؛ صورة واتساب لحالها ما بتعتبر تأكيد دفع.';
vr=validate({reply:proofReply,customerText:'كيف تعرفوا انه أنا اللي دفعت عشان تكملوا طلبي؟',topics:['payment_method'],truth:truth('customer_confirmed_continue','pending')});
ok(vr.pass,'payment-proof binding question can be answered directly without generic fallback or unrelated status');

// Product grounding.
ok(!validate({reply:'iPhone 18 Pro Max 512GB سعره 999 دينار.',customerText:'كم سعر ايفون 18 برو ماكس 512؟',topics:['product_price']}).pass,'invented iPhone 18 price is blocked');
ok(!validate({reply:'ايفون 18 برو ماكس بتستلمه اليوم فورًا.',customerText:'متى استلم ايفون 18 برو ماكس؟',topics:['products']}).pass,'false instant iPhone 18 pickup is blocked');
ok(!validate({reply:'قبل 19 ديسمبر 2026 ما بنتوقع يتوفر.',customerText:'متى استلم ايفون 18 برو؟',topics:['products']}).pass,'stale 19-Dec iPhone 18 date is blocked');

// Repetition / human patience.
vr=validate({reply:'طلبك قيد الدراسة النهائية، والمعدل الطبيعي من يومين إلى 3 أيام عمل وفي ضغط مراجعات شديد.',customerText:'نفس الحكي زهقناه',topics:['complaint'],state:state({lastAssistantText:'طلبك قيد الدراسة النهائية، والمعدل الطبيعي من يومين إلى 3 أيام عمل وفي ضغط مراجعات شديد.'}),recentTurns:['الأمين: طلبك قيد الدراسة النهائية، والمعدل الطبيعي من يومين إلى 3 أيام عمل وفي ضغط مراجعات شديد.']});
ok(!vr.pass&&vr.reasons.some(x=>x.includes('repeated')),'customer rejection of repeated delay paragraph is respected deterministically');

// Fake provider proves one model call can return semantics + final reply together.
let calls=0;let seenPrompt='';
const provider={generate:async req=>{calls++;seenPrompt=String(req.user||'');return JSON.stringify({acts:[{type:'ask',topic:'office_location',action:'none',value:null,confidence:.99}],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,meaningSummary:'يسأل عن موقع المكتب',customerGoal:'معرفة الموقع',currentQuestion:'وين موقعكم؟',answerObligations:['إعطاء العنوان العام الموثق'],references:[],entities:[],decision:{continuation:'unknown',cancellation:'unknown',refund:'unknown',aliasConfirmation:'unknown',condition:null},correctionOfPrevious:false,socialClosure:false,requiresExternalFact:false,externalFactNeeded:null,answerMode:'direct',confidence:.99,warnings:[],reply:'العنوان العام: عمّان – شارع المدينة المنورة، والحضور بموعد رسمي مؤكد.'})}};
const anchor=turn('وين موقعكم؟',['office_location']);
const kr=await kernel.runNativeConversationKernel({provider,customerText:'وين موقعكم؟',turnId:'t1',state:state(),truth:truth(),recentTurns:[],profileName:null,deterministicAnchor:anchor});
ok(calls===1,'runNativeConversationKernel uses exactly one model call for semantic interpretation + draft');
ok(kr.modelUsed&&kr.turn.semantic.currentQuestion==='وين موقعكم؟'&&kr.reply.includes('شارع المدينة المنورة'),'single native call returns both semantic turn and final human reply');
ok(seenPrompt.includes('TRUTH=')&&seenPrompt.includes('STATE=')&&seenPrompt.includes('RECENT=')&&seenPrompt.includes('PROTECTED_5_JOD_JOURNEY')&&seenPrompt.includes('HUMAN_OS'),'native call receives truth + memory + commercial + Human OS context in one prompt');

// Deterministic destructive action safety anchor survives a model miss.
calls=0;
const cancelProvider={generate:async()=>{calls++;return JSON.stringify({acts:[{type:'ask',topic:'unknown',action:'none',value:null,confidence:.8}],sentiment:'calm',urgency:'normal',meaningSummary:'يريد إلغاء الطلب',customerGoal:'الإلغاء',currentQuestion:null,answerObligations:['تأكيد الإلغاء'],references:[],entities:[],decision:{continuation:'unknown',cancellation:'unknown',refund:'unknown',aliasConfirmation:'unknown',condition:null},correctionOfPrevious:false,socialClosure:false,requiresExternalFact:false,externalFactNeeded:null,answerMode:'direct',confidence:.8,warnings:[],reply:'أكيد، قبل الإلغاء بدي تأكيدك النهائي.'})}};
const cancelAnchor=turn('بدي الغي الطلب',['cancellation'],{actions:['cancel_application'],acts:[{id:'a1',type:'request_action',topic:'cancellation',text:'بدي الغي الطلب',action:'cancel_application',value:null,confidence:.99,source:'deterministic'}]});
const ck=await kernel.runNativeConversationKernel({provider:cancelProvider,customerText:'بدي الغي الطلب',turnId:'t2',state:state(),truth:truth('under_review','paid'),recentTurns:[],profileName:null,deterministicAnchor:cancelAnchor});
ok(calls===1&&ck.turn.requestedActions.includes('cancel_application'),'deterministic destructive-action anchor survives model omission');
ok(ck.turn.acts.some(x=>x.type==='request_action'&&x.action==='cancel_application'),'destructive cancellation act is merged back into native semantic turn');

// No SQL and changed files transpile.
const phaseFiles=[b+'nativeConversationKernel.ts',b+'runtimeLive.ts',b+'types.ts','scripts/v3-phase8-0-native-conversation-kernel-human-company-os-selftest.cjs'];
ok(!phaseFiles.some(f=>f.endsWith('.sql')),'Phase 8 package source set contains no SQL');
for(const f of phaseFiles.filter(f=>f.endsWith('.ts')))transpile(f);

console.log(`\nPhase 8.0 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);
process.exit(failed?1:0);
})().catch(err=>{failed++;console.error('SELFTEST ERROR:',err&&err.stack||err);console.log(`\nPhase 8.0 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(1)});
