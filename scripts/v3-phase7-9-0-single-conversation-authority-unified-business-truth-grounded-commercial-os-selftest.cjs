const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
let ts; try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd(); let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const n=s=>String(s||'').normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLowerCase();
const cache=new Map();
function load(rel){
  let file=path.isAbsolute(rel)?rel:path.join(root,rel);
  if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts'; else if(fs.existsSync(file+'.tsx'))file+='.tsx';}
  if(cache.has(file)) return cache.get(file).exports;
  const src=fs.readFileSync(file,'utf8');
  const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});
  const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errs.length) throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
  const mod={exports:{}}; cache.set(file,mod);
  function req(id){
    if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id); if(fs.existsSync(p+'.ts'))p+='.ts'; else if(fs.existsSync(p+'.tsx'))p+='.tsx'; return load(p)}
    if(id==='@/lib/supabaseAdmin') return {supabaseAdmin:{}};
    if(id==='crypto') return require('crypto');
    throw new Error(`unexpected external require ${id} from ${file}`);
  }
  vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder,AbortController,fetch:async()=>{throw new Error('network disabled in selftest')}},{filename:file});
  return mod.exports;
}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
function normHash(rel){let b=fs.readFileSync(path.join(root,rel));let a=[];for(let i=0;i<b.length;i++){if(b[i]===13){if(i+1<b.length&&b[i+1]===10)i++;a.push(10)}else a.push(b[i])}return crypto.createHash('sha256').update(Buffer.from(a)).digest('hex')}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const files=['businessTruthRegistry.ts','conversationRecovery.ts','currentQuestionAnswerContract.ts','finalResponseGate.ts','freshPublicFacts.ts','groundingGuard.ts','humanCompanyRuntime.ts','humanFirstConversationAuthority.ts','informedCommercialContinuation.ts','policy.ts','responseArbiter.ts','runtimeLive.ts','semanticReplyVerifier.ts','semanticRescue.ts','singleConversationAuthority.ts','types.ts','unifiedConversationDecisionPlane.ts','writerContract.ts'].map(x=>b+x);

const types=read(b+'types.ts'), runtime=read(b+'runtimeLive.ts'), writer=read(b+'writerContract.ts'), policySrc=read(b+'policy.ts'), registrySrc=read(b+'businessTruthRegistry.ts'), disclosureSrc=read(b+'informedCommercialContinuation.ts'), guardSrc=read(b+'groundingGuard.ts'), freshSrc=read(b+'freshPublicFacts.ts');
ok(types.includes('v3.0.0-phase7.9.0-single-conversation-authority-grounded-business-truth'),'runtime version identifies Phase 7.9.0');
ok(types.includes('v3.0.0-phase7.8.0.1-informed-commercial-continuation-fee-rationale-integrity'),'7.8.0.1 compatibility anchor preserved');
ok(types.includes('2026-09-informed-fee-v2-full-rationale'),'commercial disclosure type requires full-rationale v2');
ok(runtime.includes('PHASE 7.9.0 SINGLE CONVERSATION AUTHORITY'),'runtime installs single conversation authority');
ok(runtime.includes('SINGLE CONVERSATION ANSWER PLAN GATE'),'runtime has final answer-plan coverage gate');
ok(runtime.includes('GROUNDED BUSINESS EGRESS'),'runtime has grounded business egress');
ok(runtime.indexOf('SINGLE CONVERSATION ANSWER PLAN GATE') < runtime.indexOf('FINAL SEMANTIC EGRESS VETO'),'answer-plan repair occurs before final semantic veto');
ok(runtime.includes('postGroundingRepair'),'answer obligations are restored after grounding repair');
ok(writer.includes('BUSINESS_TRUTH_REGISTRY')&&writer.includes('SINGLE_CONVERSATION_ANSWER_PLAN'),'writer receives centralized truth and answer plan');
ok(writer.includes('ممنوع تجاهل item')&&writer.includes('جاوب كل item'),'writer must cover every answer-plan item');
ok(!writer.includes('19 ديسمبر 2026'),'writer no longer carries stale iPhone 18 availability date');
ok(freshSrc.includes('isIphone18Question')&&freshSrc.includes('return null'),'public web product search cannot override internal iPhone 18 truth');
ok(disclosureSrc.includes('2026-09-informed-fee-v2-full-rationale'),'disclosure implementation uses full-rationale version');
ok(disclosureSrc.includes('عدد كبير جدًا من الطلبات')&&disclosureSrc.includes('تمييز العملاء الراغبين فعلًا'),'fee rationale includes high-volume + seriousness explanation');
ok(disclosureSrc.includes('مستردة بالكامل')&&disclosureSrc.includes('ما صدرت الموافقة النهائية'),'fee disclosure states full refund if final approval does not issue after confirmed payment');
ok(!disclosureSrc.includes('PAYAMEEEN')&&!disclosureSrc.includes('0788500337'),'pre-payment disclosure author itself contains no payment destinations');
ok(policySrc.includes('ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE'),'policy is wired to centralized monthly-installment truth');
ok(policySrc.includes('ALAMEEN_FIRST_INSTALLMENT_RULE'),'policy is wired to centralized first-installment truth');
ok(policySrc.includes('recentReleaseNotBefore: ""'),'stale iPhone release-not-before date is retired');
ok(guardSrc.includes('unsupported_media_receipt_claim'),'media-receipt grounding protection exists');
ok(guardSrc.includes('unsupported_iphone18_price')&&guardSrc.includes('iphone18_discount_not_denied'),'iPhone 18 price/discount grounding protection exists');

// Critical exact architecture anchors: Phase 7.9 does not expand Real Actions or route ownership.
ok(normHash('app/api/whatsapp/webhook/route.ts')==='bd1ebf07bf79ebe03246590e047fe78d5dff1bfa515158c80599c2408ec625b0','route ownership remains exactly preserved');
ok(normHash(b+'transactionalActionAdapter.ts')==='b9b65f7965f2683de86f61ed70e6e2975ddf36f43f10769772131e27b8509dce','Real Actions transactional adapter remains exactly preserved');
ok(normHash(b+'paymentDestinationOverride.ts')==='6f915ad10d4565ee09e8e73f3f1cf8a6054147d471a0484d8c2fec63f6ea1335','file-fee payment destination source remains exactly preserved');
ok(normHash(b+'mutationConfirmationGate.ts')==='a2380e66119ebc39e7a4c07d03aad1654e21a229f517caaf5fe23eb07fbc6024','destructive confirmation gate remains exactly preserved');
ok(normHash(b+'continuationPersistence.ts')==='a1e6c42ce29efdabcc84f893ce7d970e6f7f2c87a918098df32a5bee3e84f398','continuation persistence implementation remains exactly preserved');

const registry=load(b+'businessTruthRegistry.ts');
ok(registry.IPHONE18_PRODUCTS.length===8,'iPhone 18 catalog has exactly 8 authoritative variants');
ok(registry.IPHONE18_COLORS.length===4,'iPhone 18 catalog has exactly 4 authoritative colors');
const expected=[['iPhone 18 Pro','256GB',1199],['iPhone 18 Pro','512GB',1399],['iPhone 18 Pro','1TB',1799],['iPhone 18 Pro','2TB',2399],['iPhone 18 Pro Max','256GB',1299],['iPhone 18 Pro Max','512GB',1499],['iPhone 18 Pro Max','1TB',1899],['iPhone 18 Pro Max','2TB',2499]];
for(const [model,cap,price] of expected) ok(registry.IPHONE18_PRODUCTS.some(x=>x.model===model&&x.capacity===cap&&x.priceJod===price),`${model} ${cap} exact price ${price} JOD`);
ok(registry.IPHONE18_COLORS.join('|')==='أسود|فضي|جليدي|عنّابي','iPhone 18 exact approved colors preserved');
ok(registry.IPHONE18_WARRANTY_RULE.includes('iSYSTEMS الأردن'),'iPhone 18 iSYSTEMS Jordan warranty/source truth preserved');
ok(registry.IPHONE18_WARRANTY_RULE.includes('نسخة الشرق الأوسط'),'iPhone 18 Middle East version truth preserved');
ok(registry.IPHONE18_PICKUP_RULE.includes('بعد شهر من الموافقة النهائية')&&registry.IPHONE18_PICKUP_RULE.includes('موعد رسمي مؤكد')&&registry.IPHONE18_PICKUP_RULE.includes('لا يوجد توصيل'),'iPhone 18 pickup timing/appointment/no-delivery truth preserved');
ok(registry.ALAMEEN_FIRST_INSTALLMENT_RULE.includes('بعد شهر من تاريخ توقيع العقد')&&registry.ALAMEEN_FIRST_INSTALLMENT_RULE.includes('نفسه تاريخ استلام الجهاز'),'first installment = signing + one month and signing=receipt');
ok(registry.ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE.includes('CliQ')&&registry.ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE.includes('تحويل بنكي')&&registry.ALAMEEN_MONTHLY_INSTALLMENT_PAYMENT_RULE.includes('الموقع الذي تم فيه توقيع العقد'),'monthly installment payment methods are CliQ/bank/signing location');

let rr=registry.buildIphone18AuthoritativeReply('كم سعر ايفون 18 برو 256؟');
ok(rr&&rr.includes('1,199')&&rr.includes('ما عليه خصم 5%'),'18 Pro 256 price answer is exact and no 5% discount');
rr=registry.buildIphone18AuthoritativeReply('كم سعر ايفون 18 برو ماكس؟');
ok(rr&&['1,299','1,499','1,899','2,499'].every(x=>rr.includes(x)),'18 Pro Max price-list answer contains all exact variants');
rr=registry.buildIphone18AuthoritativeReply('ايفون 18 برو ماكس شو كفالته ونسخته؟');
ok(rr&&rr.includes('iSYSTEMS الأردن')&&rr.includes('نسخة الشرق الأوسط'),'warranty + region multi-question answered together');
rr=registry.buildIphone18AuthoritativeReply('ايفون 18 برو شو الالوان؟');
ok(rr&&['أسود','فضي','جليدي','عنّابي'].every(x=>rr.includes(x)),'color answer contains only approved color set');
rr=registry.buildIphone18AuthoritativeReply('ايفون 18 برو عليه خصم 5%؟');
ok(rr&&rr.includes('ما عليهم خصم 5%'),'iPhone 18 discount question is explicitly denied');
rr=registry.buildIphone18AuthoritativeReply('متى بستلم ايفون 18 برو ماكس؟');
ok(rr&&rr.includes('بعد شهر من الموافقة النهائية')&&rr.includes('موعد رسمي مؤكد')&&rr.includes('لا يوجد توصيل'),'pickup answer uses final-approval + one month + confirmed office appointment');
rr=registry.buildIphone18AuthoritativeReply('ايفون 18 برو ماكس 512 كم سعره وشو الالوان والكفالة والنسخة ومتى الاستلام؟');
ok(rr&&rr.includes('1,499')&&rr.includes('عنّابي')&&rr.includes('iSYSTEMS الأردن')&&rr.includes('نسخة الشرق الأوسط')&&rr.includes('بعد شهر من الموافقة النهائية'),'multi-obligation iPhone 18 question answers price+colors+warranty+region+pickup');

const pol=load(b+'policy.ts').getV3Policy();
function app(status='preliminary_qualified',paymentStatus=null){return {id:'app-1',trackingId:'AM-1',fullName:'Test',phone:'0790000000',email:null,status,paymentStatus,paymentConfirmedAt:null,paymentReference:null,deviceId:null,deviceName:'iPhone 18 Pro Max - 512GB',devicePrice:1499,installmentMonths:36,downPayment:0,interestRate:null,monthlyPayment:null,totalWithInterest:null,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:'2026-09-23T00:00:00Z',paidClickedAt:null,documents:null}}
function truth(status='preliminary_qualified',paymentStatus=null){return {confidence:'authoritative',source:'current_message_tracking',contactAccess:'full',application:app(status,paymentStatus),ambiguousApplications:[],policy:pol,fetchedAt:new Date().toISOString()}}
function state(over={}){return {version:'v3.0.0-phase7.9.0-single-conversation-authority-grounded-business-truth',waId:'9627',activeApplicationId:'app-1',activeTrackingId:'AM-1',currentTopic:null,currentGoal:null,role:{currentRole:'tala',tier:'frontline',reason:'x',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,conversationConstraints:{},updatedAt:new Date().toISOString(),...over}}
function semanticFrame(q,goal='business question',opts={}){return {meaningSummary:opts.meaningSummary||q,customerGoal:goal,currentQuestion:q,answerObligations:opts.answerObligations||[q],references:[],entities:opts.entities||[],decision:{continuation:'unknown',cancellation:'unknown',refund:'unknown',aliasConfirmation:'unknown',condition:null},correctionOfPrevious:false,socialClosure:false,requiresExternalFact:Boolean(opts.requiresExternalFact),externalFactNeeded:opts.requiresExternalFact?q:null,answerMode:'direct',confidence:.96,warnings:[]}}
function turn(text,topics=[],q=text,opts={}){return {turnId:'t-'+Math.random().toString(36).slice(2),rawText:text,normalizedText:text,acts:topics.map((topic,i)=>({id:'a'+i,type:'ask',topic,text,action:'none',value:null,confidence:.95,source:'resolved'})),topics,requestedActions:opts.actions||[],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.95,warnings:[],semantic:semanticFrame(q,opts.goal||'business question',opts)}}

const disclosure=load(b+'informedCommercialContinuation.ts');
let s=state();
ok(disclosure.preliminaryApprovalNeedsInformedDisclosure(s,truth())===true,'preliminary-approved request requires full disclosure before payment');
const staleV1={version:'2026-09-informed-fee-v1',applicationId:'app-1',trackingId:'AM-1',status:'delivered',deliveredAt:'x',deliveredTurnId:'t0',acknowledgedAt:null,acknowledgedTurnId:null};
ok(disclosure.currentCommercialDisclosure(state({commercialDisclosure:staleV1}),truth()).status==='not_delivered','old/partial disclosure memory does not count as informed disclosure');
let delivered=disclosure.markCommercialDisclosureDelivered(state(),truth(),'t1');
ok(disclosure.commercialDisclosureDelivered(delivered,truth())===true,'full-rationale application-scoped disclosure is remembered');
ok(disclosure.preliminaryApprovalNeedsInformedDisclosure(delivered,truth())===false,'same application does not repeat full disclosure after delivery');
let otherTruth=truth(); otherTruth.application={...otherTruth.application,id:'app-2',trackingId:'AM-2'};
ok(disclosure.commercialDisclosureDelivered(delivered,otherTruth)===false,'disclosure memory cannot leak across applications');
ok(disclosure.preliminaryApprovalNeedsInformedDisclosure(state(),truth('customer_confirmed_continue','pending'))===true,'legacy continuation-confirmed state still blocks payment until full disclosure exists');
const disclosureReply=disclosure.buildInformedCommercialDisclosureReply(truth());
ok(disclosureReply.includes('5 دنانير')&&disclosureReply.includes('عدد كبير جدًا من الطلبات')&&disclosureReply.includes('الجدية')&&disclosureReply.includes('لا يضمن قبول الطلب'),'commercial disclosure contains amount+rationale+volume+non-guarantee');
ok(disclosureReply.includes('مستردة بالكامل')&&disclosureReply.includes('ما صدرت الموافقة النهائية'),'commercial disclosure contains full refund truth for no final approval');
ok(!disclosureReply.includes('PAYAMEEEN')&&!disclosureReply.includes('0788500337'),'commercial disclosure hides payment destinations');
const payReply=disclosure.buildPostDisclosurePaymentReply(truth('customer_confirmed_continue','pending'),'https://www.ameenfinance.co/receipt?tracking=AM-1&phone=0790000000');
ok(payReply.includes('PAYAMEEEN')&&payReply.includes('0788500337'),'payment destinations appear after informed confirmation');
ok(payReply.includes('بعد شهر من تاريخ توقيع العقد')&&payReply.includes('نفسه تاريخ استلام الجهاز'),'post-disclosure payment reply carries corrected first-installment truth');

const authority=load(b+'singleConversationAuthority.ts');
let t=turn('كل شهر كيف بدفع القسط؟ عن طريق البنك ولا كليك ولا كاش؟',['payment_method','installment_amount'],'كيف أسدد الأقساط الشهرية؟');
let plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth('under_review','paid')});
ok(plan.items.some(x=>x.key==='monthly_installment_payment'),'monthly installment method becomes explicit answer-plan item');
let rendered=authority.renderSingleConversationAnswerPlan(plan);
ok(rendered.includes('CliQ')&&rendered.includes('تحويل بنكي')&&rendered.includes('الموقع الذي تم فيه توقيع العقد'),'monthly installment answer uses all three customer-choice channels');
ok(!rendered.includes('0788500337')&&!rendered.includes('PAYAMEEEN'),'monthly installment answer does not leak file-fee destinations');

t=turn('متى اول قسط وكيف بدفعه كل شهر؟',['first_installment','payment_method'],'متى أول قسط وكيف أسدد الأقساط الشهرية؟');
plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth('under_review','paid')});
ok(plan.items.some(x=>x.key==='first_installment_timing')&&plan.items.some(x=>x.key==='monthly_installment_payment'),'multi-question plan contains first-installment + monthly-payment obligations');
rendered=authority.renderSingleConversationAnswerPlan(plan);
ok(rendered.includes('بعد شهر من تاريخ توقيع العقد')&&rendered.includes('CliQ'),'combined installment reply answers timing and method together');

t=turn('وين موقع الشركة؟',['office_location'],'وين موقع الشركة؟');
plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth()});
rendered=authority.renderSingleConversationAnswerPlan(plan);
ok(rendered.includes('عمّان')&&rendered.includes('شارع المدينة المنورة')&&rendered.includes('موعد رسمي مؤكد'),'office-location question gets direct known truth first time');

t=turn('ليش أدفع خمس دنانير وشو يضمنلي ما ينصب علي؟',['payment_fee','trust'],'ليش رسوم فتح الملف وشو الضمان؟');
plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth()});
rendered=authority.renderSingleConversationAnswerPlan(plan);
ok(plan.items.some(x=>x.key==='fee_rationale'),'fee/trust objection becomes mandatory answer-plan item');
ok(rendered.includes('جدية')&&rendered.includes('حجم الطلبات')&&rendered.includes('مستردة بالكامل')&&rendered.includes('مش شراءً للموافقة'),'fee/trust answer covers rationale+volume+refund+non-guarantee');

t=turn('حاليا شو مطلوب مني؟',['application_status'],'شو الخطوة المطلوبة هسا؟');
plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth()});
rendered=authority.renderSingleConversationAnswerPlan(plan);
ok(plan.items.some(x=>x.key==='current_next_step')&&rendered.includes('موافقة مبدئية')&&rendered.includes('أوضحلك رسوم فتح الملف'),'current-next-step answer is application-stage specific, not generic fallback');

t=turn('بدي اقسط سنة او سنتين مش 36 شهر',['installment_duration'],'بدي أغير مدة التقسيط إلى سنة أو سنتين');
plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth()});
rendered=authority.renderSingleConversationAnswerPlan(plan);
ok(plan.items.some(x=>x.key==='installment_duration_change'),'installment-duration change becomes explicit answer-plan item');
ok(rendered.includes('36 شهر')&&rendered.includes('ما بنعتبرها تغيّرت من رسالة واتساب')&&!rendered.includes('PAYAMEEEN'),'duration-change answer preserves current application truth and avoids fee detour');

t=turn('شو اسم مدير القسم المسؤول؟',['manager_request'],'شو اسم مدير القسم المسؤول؟');
plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth()});
ok(plan.items.some(x=>x.key==='grounded_unknown'),'known-business question without authoritative fact gets grounded-specific unknown item');
rendered=authority.renderSingleConversationAnswerPlan(plan);
ok(rendered.includes('شو اسم مدير القسم المسؤول')&&rendered.includes('مش موجودة عندي')&&!authority.genericFallbackDetected(rendered),'grounded unknown names the actual question instead of legacy generic fallback');

t=turn('عدد قوانين الجاذبية؟',[],'كم عدد قوانين الجاذبية؟',{requiresExternalFact:true});
plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth()});
ok(plan.items.some(x=>x.key==='business_scope'),'out-of-company knowledge question is scoped back to Al Ameen instead of encyclopedia mode');
rendered=authority.renderSingleConversationAnswerPlan(plan);
ok(rendered.includes('الأمين للأقساط'),'business-scope reply stays within company support');

const generic='احكيلي شو بدك تعرف، وبجاوبك على الموجود فعليًا بدون ما أفترض خطوة ما صارت.';
t=turn('وين موقعكم؟',['office_location'],'وين موقعكم؟');
plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth()});
ok(authority.genericFallbackDetected(generic)===true,'legacy canned fallback is detected');
let repaired=authority.repairReplyAgainstAnswerPlan({reply:generic,plan});
ok(repaired.repaired&&repaired.reply.includes('شارع المدينة المنورة')&&!authority.genericFallbackDetected(repaired.reply),'known-truth question replaces generic fallback with direct fact');
let cov=authority.answerPlanCoverage({reply:repaired.reply,plan}); ok(cov.pass,'repaired location reply satisfies answer-plan coverage');

t=turn('ايفون 18 برو ماكس 512 كم سعره وشو كفالته ونسخته ومتى بستلمه؟',['products','product_price'],'كم سعر iPhone 18 Pro Max 512 وما كفالته ونسخته ومتى الاستلام؟',{entities:[{surface:'iPhone 18 Pro Max 512',kind:'device',role:'requested_device',knownFactStatus:'known',countryHint:'JO',confidence:.99}]});
plan=authority.buildSingleConversationAnswerPlan({turn:t,state:state(),truth:truth()});
rendered=authority.renderSingleConversationAnswerPlan(plan);
ok(plan.items.some(x=>x.key==='iphone18_product_truth'),'iPhone 18 question becomes authoritative product-truth answer-plan item');
ok(rendered.includes('1,499')&&rendered.includes('iSYSTEMS الأردن')&&rendered.includes('نسخة الشرق الأوسط')&&rendered.includes('بعد شهر من الموافقة النهائية'),'iPhone 18 plan covers price+warranty+region+pickup');
ok(authority.answerPlanCoverage({reply:rendered,plan}).pass,'iPhone 18 multi-obligation authoritative reply passes strict answer-plan coverage');
let partialIphone='iPhone 18 Pro Max 512GB سعره 1,499 د.أ.';
ok(!authority.answerPlanCoverage({reply:partialIphone,plan}).pass,'partial iPhone reply fails when warranty/region/pickup obligations are missing');

const guard=load(b+'groundingGuard.ts');
t=turn('هسا بدي ابعثلك صورة',['requirements'],'بدي أبعث صورة');
let g=guard.enforceGroundedBusinessEgress({reply:'وصلتني الصورة، خليني أشوفها.',turn:t,truth:truth()});
ok(!g.pass&&g.reason==='unsupported_media_receipt_claim','cannot claim media received before actual media event');
t=turn('صورة مرفقة مع تعليق: هاي الصورة',['receipt_upload'],'هاي الصورة');
g=guard.enforceGroundedBusinessEgress({reply:'وصلتني الصورة.',turn:t,truth:truth()});
ok(g.pass,'media acknowledgement is allowed only on actual media event');
t=turn('متى بستلم ايفون 18 برو؟',['products'],'متى استلام iPhone 18 Pro؟');
g=guard.enforceGroundedBusinessEgress({reply:'قبل 19 ديسمبر 2026 ما بنتوقع يتوفر.',turn:t,truth:truth()});
ok(!g.pass&&g.reason==='stale_release_date'&&g.replacement.includes('بعد شهر من الموافقة النهائية'),'stale iPhone 18 date is vetoed and replaced by current pickup truth');
g=guard.enforceGroundedBusinessEgress({reply:'iPhone 18 Pro سعره 999 دينار.',turn:turn('كم سعر ايفون 18 برو؟',['product_price'],'كم سعر iPhone 18 Pro؟'),truth:truth()});
ok(!g.pass&&g.reason==='unsupported_iphone18_price','unsupported iPhone 18 price is vetoed');
g=guard.enforceGroundedBusinessEgress({reply:'نعم عليه خصم 5%.',turn:turn('ايفون 18 عليه خصم 5%؟',['products'],'هل iPhone 18 عليه خصم 5%؟'),truth:truth()});
ok(!g.pass&&g.reason==='iphone18_discount_not_denied','false iPhone 18 5% discount is vetoed');
g=guard.enforceGroundedBusinessEgress({reply:'كفالته سنة.',turn:turn('شو كفالة ايفون 18 برو؟',['products'],'ما كفالة iPhone 18 Pro؟'),truth:truth()});
ok(!g.pass&&g.reason==='iphone18_warranty_missing','iPhone 18 warranty answer without iSYSTEMS is vetoed');
g=guard.enforceGroundedBusinessEgress({reply:'نسخة رسمية.',turn:turn('ايفون 18 نسخة الشرق الأوسط؟',['products'],'هل iPhone 18 نسخة الشرق الأوسط؟'),truth:truth()});
ok(!g.pass&&g.reason==='iphone18_region_missing','iPhone 18 regional-version answer without Middle East truth is vetoed');
g=guard.enforceGroundedBusinessEgress({reply:'بتستلمه اليوم فورًا.',turn:turn('متى استلم ايفون 18 برو؟',['products'],'متى استلم iPhone 18 Pro؟'),truth:truth()});
ok(!g.pass&&g.reason==='false_immediate_pickup_claim','instant iPhone 18 pickup claim is vetoed');
const canonical=registry.buildIphone18AuthoritativeReply('متى استلم ايفون 18 برو؟');
g=guard.enforceGroundedBusinessEgress({reply:canonical,turn:turn('متى استلم ايفون 18 برو؟',['products'],'متى استلم iPhone 18 Pro؟'),truth:truth()});
ok(g.pass,'authoritative iPhone 18 pickup reply passes grounding guard');

// Active-source regression: current business truth must not be shadowed by stale authoring.
const activeSource=files.map(read).join('\n');
ok(!/القسط الأول[^\n]{0,100}بعد شهر من استلام الجهاز وتوقيع العقد/.test(activeSource),'active 7.9 source has no stale first-installment wording');
ok(!/ما بنتوقع توفرها قبل 3 أشهر/.test(activeSource),'active 7.9 source has no old 3-month iPhone availability authoring');
ok(!/ايفون 18[^\n]{0,120}خصم 5%/.test(activeSource.replace(/ما عليهم خصم 5%|لا يوجد خصم 5%|ما عليه خصم 5%/g,'')),'active source does not positively authorize a 5% iPhone 18 discount');
ok(!runtime.includes('git add .'),'runtime contains no deployment-side Git behavior');

for(const f of files) transpile(f);

console.log(`\n7.9.0 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);
process.exit(failed?1:0);
