const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const root=process.argv[2]||process.cwd();
const V3='app/api/whatsapp/webhook/_lib/v3-os';
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0,failed=0;
function ok(v,m){if(v){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}}
function normalizeArabic(value){return String(value||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s+/g,' ').trim()}
function load(file,mocks){const src=read(file);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:file});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const module={exports:{}};const req=id=>{if(Object.prototype.hasOwnProperty.call(mocks,id))return mocks[id];throw new Error(`unmocked ${id}`)};new Function('require','module','exports',out.outputText)(req,module,module.exports);return module.exports;}
function stageOf(app){if(!app)return'unbound';const s=String(app.status||'').toLowerCase(),p=String(app.paymentStatus||'').toLowerCase();if(['refund_completed','refunded'].includes(s)||['refund_completed','refunded'].includes(p))return'refund_completed';if(s==='refund_requested'||p==='refund_requested')return'refund_requested';if(['cancelled','customer_declined_continue','rejected'].includes(s))return'cancelled';if(['approved','final_approved','ready_for_pickup','ready_for_contract','delivery_ready'].includes(s))return'approved';if(app.paymentConfirmedAt||['confirmed','paid','payment_confirmed'].includes(p))return'payment_confirmed_under_review';if(['customer_claimed_paid','pending_payment_confirmation'].includes(p))return'payment_proof_pending_admin';if(s==='customer_confirmed_continue'||['pending','pending_payment','payment_info_sent'].includes(p))return'continuation_confirmed_fee_due';if(s==='preliminary_qualified'||app.preliminaryQualifiedAt)return'preliminary_approved_waiting_decision';if(['','submitted','preliminary_application'].includes(s))return'preliminary_review';return'other'}
function label(app){return({preliminary_review:'قيد المراجعة المبدئية',preliminary_approved_waiting_decision:'موافقة مبدئية',continuation_confirmed_fee_due:'تم تسجيل رغبتك بالاستمرار',payment_proof_pending_admin:'إثبات الدفع بانتظار مراجعة الإدارة',payment_confirmed_under_review:'قيد الدراسة النهائية',approved:'موافق عليه',cancelled:'الطلب ملغي',refund_requested:'الاسترداد قيد المعالجة',refund_completed:'تم الاسترداد'})[stageOf(app)]||'قيد المتابعة'}
const policy={businessName:'الأمين للأقساط',generalLocation:'عمّان – شارع المدينة المنورة',fileOpeningFeeJod:5,normalReviewWindow:'المعدل الطبيعي من يومين لـ3 أيام عمل',severePressureRule:'حاليًا في ضغط مراجعات شديد جدًا وقد تتأخر بعض الملفات أكثر من المعدل الطبيعي.',requirementsGuidanceRule:'الهوية وإثبات الدخل من الأساسيات. بيانات الكفيل ليست شرطًا ثابتًا لكل طلب، والملف القوي قد يمشي بدون كفيل حسب الدراسة. إذا ما في كشف أو شهادة راتب، ممكن كشف حساب بنكي أو عقد عمل.'};
const app=(status='customer_confirmed_continue',extra={})=>({id:'a1',trackingId:'AM-1789000000000',status,paymentStatus:'pending_payment',paymentConfirmedAt:null,fullName:'عميل تجريبي',...extra});
const truth=(a)=>({application:a,ambiguousApplications:[],policy});
const state=(extra={})=>({version:'x',waId:'9627',activeApplicationId:'a1',activeTrackingId:'AM-1789000000000',currentTopic:null,currentGoal:null,role:{currentRole:'abdullah',tier:'case_specialist',reason:'x',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,updatedAt:'x',...extra});
function turn(raw,topics=[],requestedActions=[]){return{turnId:'t1',rawText:raw,normalizedText:normalizeArabic(raw),acts:[],topics,requestedActions,sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:1,warnings:[]}}

const unified=load(`${V3}/unifiedConversationDecisionPlane.ts`,{'./text':{normalizeArabic},'./types':{}});
ok(unified.protectedBusinessRegistrationRequest('ممكن اسم الشركة القانوني ورقم تسجيل الشركة؟'),'detects legal name + registration request');
ok(unified.protectedBusinessRegistrationRequest('بدي صورة السجل التجاري'),'detects commercial-registration document request');
ok(unified.protectedBusinessRegistrationRequest('اعطيني شهادة تسجيل الشركة'),'detects company registration certificate request');
ok(!unified.protectedBusinessRegistrationRequest('شو شروط استرداد الخمسة؟'),'refund terms are not protected-registration data');
ok(/جهة مستقلة تمامًا/.test(unified.BUSINESS_REGISTRATION_PROTECTION_REPLY)&&/لا يتم مشاركتها عبر واتساب/.test(unified.BUSINESS_REGISTRATION_PROTECTION_REPLY),'security response contains independence + non-disclosure');
const protectedState=state({lastAssistantText:unified.BUSINESS_REGISTRATION_PROTECTION_REPLY});
ok(unified.shouldSuppressRepeatedProtectedRegistration({turn:turn('اعطيني رقم تسجيل الشركة'),state:protectedState}),'repeated protected registration request is automatically suppressed');
ok(!unified.shouldSuppressRepeatedProtectedRegistration({turn:turn('رقم التسجيل وبدي اعرف متى الاسترداد'),state:protectedState}),'mixed legitimate customer question is not fully suppressed');
const durableProtectedState=state({lastAssistantText:'تمام، شو سؤالك؟',facts:[{key:'protected_business_registration_notice_sent',value:'sent',topic:'trust',source:'system',confidence:1,turnId:'old',updatedAt:'x'}]});
ok(unified.shouldSuppressRepeatedProtectedRegistration({turn:turn('رجع اعطيني رقم تسجيل الشركة'),state:durableProtectedState}),'protected-registration notice persists beyond the immediately previous assistant reply');

ok(unified.stopRefundKeepRequest('انا بدي الغي طلب الاسترداد فقط بس طلب التقسيط تبع الهاتف بدي يكمل'),'detects stop-refund + keep-device request');
ok(unified.stopRefundKeepRequest('لا ما بدي استرداد بدي اكمل إجراءات موافقة ع الجهاز'),'detects no-refund + continue application');
ok(!unified.stopRefundKeepRequest('بدي الغي الطلب واسترد الخمسة'),'does not confuse real cancellation/refund with stop-refund');
ok(unified.downPaymentQuestion('هل يوجد دفعة اولى؟'),'detects down-payment question');
ok(unified.officePaymentQuestion('ما عندي تحويل اجي عندكم ادفع؟'),'detects office walk-in payment request');
ok(unified.monthlyPaymentMechanismQuestion('كل شهر رح تاخذو 24.55 من حساب بنك الاتحاد؟'),'detects monthly bank debit mechanism question');
ok(unified.deviceWarrantyOrInsuranceQuestion('الهاتف عليه ضمان من الضرر؟'),'detects device damage warranty question');
ok(unified.productSimSpecQuestion('ايفون 17 256 فيه مدخل شريحة ولا esim؟'),'detects SIM/eSIM product specification question');
ok(unified.paymentDestinationUpdateQuestion('شو التحديث الطارئ بخصوص شو؟'),'detects payment-destination update explanation question');

let clean=unified.sanitizeUnifiedEgressReply('طلبك قيد الدراسة. يُشرح ذلك بصراحة ومن دون إعطاء موعد مؤكد أو وعد بالتنفيذ.');
ok(!/يُشرح|دون إعطاء/.test(clean),'sanitizer removes internal policy instruction leakage');
clean=unified.sanitizeUnifiedEgressReply('فرعنا في عمّان، والحضور للفرع بموعد.');
ok(!/فرع/.test(clean)&&/مكتبنا|المكتب/.test(clean),'sanitizer replaces forbidden branch terminology');
clean=unified.sanitizeUnifiedEgressReply('أنا معك، مش بوت. احكيلي سؤالك.');
ok(!/مش بوت/.test(clean),'sanitizer removes false bot/human defense');

const cqMock={buildCurrentQuestionAnswerContractReply:()=>null};
const humanMock={aiIdentityQuestionText:()=>false,buildHumanFirstConversationAuthorityReply:()=>null};
const arb=load(`${V3}/responseArbiter.ts`,{
  './applicationJourney':{applicationJourneyStage:stageOf,customerFacingStatusLabel:label},
  './linkIntegrity':{buildOfficialLinkContext:(_t,tr)=>({baseUrl:'https://www.ameenfinance.co',relevant:{tracking:tr.application?`https://www.ameenfinance.co/track?tracking=${tr.application.trackingId}&phone=0790000000`:null,products:'https://www.ameenfinance.co/products'}})},
  './text':{normalizeArabic},'./currentQuestionAnswerContract':cqMock,'./humanFirstConversationAuthority':humanMock,'./unifiedConversationDecisionPlane':unified,'./refundHumanCare':{buildRefundHumanCareReply:()=>null,refundHumanCareCandidateAligned:()=>false,refundHumanCareMode:()=>null},'./humanSemanticCare':{buildHumanSemanticCareReply:()=>null,composeHumanSemanticCareAroundAnswer:({answer})=>answer,humanSemanticCareCandidateAligned:()=>true,humanSemanticCareMode:()=>null},'./semanticQuestionLocks':{buildSemanticQuestionLockReply:()=>null,resolveSemanticQuestionLock:()=>({kind:'none',hard:false,reason:'mock'}),semanticQuestionCandidateAligned:()=>true},'./answerObligations':{resolveAnswerBundle:()=>({kind:'none',hard:false,reason:'mock'}),buildAnswerBundleReply:()=>null,answerBundleCandidateAligned:()=>true},'./currentHumanTurnAuthority':{resolveCurrentHumanTurnAuthority:()=>({kind:'none',hard:false,reason:'mock'}),buildCurrentHumanTurnReply:()=>null,currentHumanTurnCandidateAligned:()=>true},'./types':{}
});
function ar(raw,candidate,a=app(),topics=[],actions=[],s=state()){return arb.arbitrateProductionReply({candidate,turn:turn(raw,topics),state:s,truth:truth(a),actions})}

let r=ar('ممكن تزودني باسم الشركة القانوني ورقم تسجيل الشركة','اختيار الاستمرار مسجل بالفعل');
ok(r.obligation==='protected_business_registration','registration request becomes hard protected obligation');
ok((r.reply||'')===unified.BUSINESS_REGISTRATION_PROTECTION_REPLY,'first registration request gets one approved security response');
r=ar('اعطيني رقم تسجيل الشركة','أي نص قديم',app(),[],[],protectedState);
ok(r.suppressed===true&&r.reply===null,'repeated protected registration request is ignored at egress');

r=ar('انا بدي الغي طلب الاسترداد فقط بس طلب التقسيط تبع الهاتف بدي يكمل','أكيد، اكتب نعم ألغي الطلب',app('refund_requested',{paymentStatus:'refund_requested'}),['refund'],[]);
ok(r.obligation==='stop_refund_keep_request','stop-refund/keep request outranks cancellation/refund templates');
ok(/بدك توقف\/تلغي طلب الاسترداد وتكمل بطلب الجهاز/.test(r.reply||'')&&!/أكدلي.*ألغي الطلب/.test(r.reply||''),'stop-refund reply does not ask to cancel application');

r=ar('هل يوجد دفعة اولى؟','حالة طلبك الآن: قيد الدراسة النهائية',app('customer_confirmed_continue',{paymentStatus:'confirmed',paymentConfirmedAt:'x'}));
ok(r.obligation==='down_payment','down-payment gets hard current-meaning lock');
ok(/ما في دفعة أولى/.test(r.reply||'')&&/بعد شهر/.test(r.reply||''),'down-payment question answered directly');

r=ar('ما عندي تحويل اجي عندكم ادفع؟','تمام، تعال عالفرع وادفع الخمسة',app());
ok(r.obligation==='office_payment','office-payment question gets hard lock');
ok(/ما بنطلب دفعها بالحضور للمكتب/.test(r.reply||'')&&!/تعال عالفرع/.test(r.reply||''),'walk-in payment instruction is repaired');

r=ar('كل شهر رح تاخذو 24.55 من حساب بنك الاتحاد؟','ما في عندي خطوة دفع موثقة ومفتوحة',app());
ok(r.obligation==='monthly_payment_mechanism','monthly bank debit gets hard lock');
ok(/العقد النهائي/.test(r.reply||'')&&/سحبًا آليًا/.test(r.reply||''),'monthly payment mechanism stays in same semantic domain');

r=ar('الهاتف عليه ضمان من الضرر؟','بيانات الكفيل مش شرط ثابت',app());
ok(r.obligation==='device_warranty_or_insurance','warranty question cannot be misread as guarantor');
ok(/ضمان\/تأمين الجهاز نفسه/.test(r.reply||'')&&!/بيانات الكفيل/.test(r.reply||''),'warranty reply does not dump guarantor guidance');

r=ar('ايفون 17 256 فيه مدخل شريحة ولا esim؟','شوف صفحة المنتجات الرسمية',app());
ok(r.obligation==='product_sim_spec','SIM specification gets hard lock');
ok(/مدخل شريحة فعلية أو eSIM/.test(r.reply||''),'SIM question gets safe spec-specific answer');

r=ar('شو التحديث الطارئ بخصوص شو','اختيار الاستمرار مسجل بالفعل',app());
ok(r.obligation==='payment_destination_update','payment update explanation becomes hard lock');
ok(/بيانات محفظة دفع رسوم فتح الملف/.test(r.reply||'')&&!/اختيار الاستمرار مسجل/.test(r.reply||''),'payment update question is answered instead of stale continuation');

r=ar('هل يوجد دفعة اولى؟','أنا معك، مش بوت. فرعنا مفتوح. يُشرح ذلك بصراحة.',app());
ok(!/مش بوت|فرعنا|يُشرح/.test(r.reply||''),'egress sanitation runs before final customer reply');

const mut=load(`${V3}/mutationConfirmationGate.ts`,{'./text':{normalizeArabic},'./applicationJourney':{applicationJourneyStage:stageOf},'./unifiedConversationDecisionPlane':unified,'./types':{}});
const inputActions=[
  {action:'cancel_application',sourceActId:'a',requiresConfirmation:false,authority:'ai_planned',requiredRole:'omran',payload:null},
  {action:'request_refund',sourceActId:'b',requiresConfirmation:false,authority:'ai_planned',requiredRole:'omran',payload:null},
  {action:'stop_refund',sourceActId:'c',requiresConfirmation:false,authority:'ai_planned',requiredRole:'omran',payload:null},
];
const mg=mut.enforceMutationConfirmationGate({actions:inputActions,turn:turn('انا بدي الغي طلب الاسترداد فقط بس طلب التقسيط تبع الهاتف بدي يكمل',['refund'],['stop_refund']),state:state(),truth:truth(app('refund_requested',{paymentStatus:'refund_requested'}))});
ok(!mg.actions.some(x=>x.action==='cancel_application'||x.action==='request_refund'),'action separator strips dangerous real cancel/refund mutations');
ok(mg.actions.some(x=>x.action==='stop_refund'),'manual stop-refund action may continue through existing administrative path');
ok(mg.confirmationPrompt===null&&/مش تلغي طلب التقسيط/.test(mg.informationalReply||''),'stop-refund does not ask wrong real-action confirmation');

const runtime=read(`${V3}/runtimeLive.ts`),gate=read(`${V3}/finalResponseGate.ts`),writer=read(`${V3}/writerContract.ts`),types=read(`${V3}/types.ts`),arbSrc=read(`${V3}/responseArbiter.ts`),mutSrc=read(`${V3}/mutationConfirmationGate.ts`),unifiedSrc=read(`${V3}/unifiedConversationDecisionPlane.ts`),stateSrc=read(`${V3}/state.ts`);
ok(stateSrc.includes('protected_business_registration_notice_sent')&&stateSrc.includes('BUSINESS_REGISTRATION_PROTECTION_REPLY'),'conversation state persists the registration-security notice for later selective suppression');
ok(runtime.includes('policySuppressed'),'runtime carries selective protected-request suppression state');
ok(runtime.includes('protected_registration_repeat_suppressed'),'protected repeated-request suppression is observable in telemetry');
ok(runtime.includes('!plan.shouldRespond || policySuppressed || Boolean(reply && verification.pass && finalGate.pass)'),'selectively suppressed protected request passes final safety without sending a reply');
ok(gate.includes('unified_current_meaning_lock_violation'),'final gate vetoes cross-domain current-meaning violations');
ok(gate.includes('protected_business_registration_data_disclosed'),'final gate blocks protected registration data disclosure');
ok(gate.includes('stop_refund_keep_request_misrouted_to_real_mutation'),'final gate blocks stop-refund -> cancel/refund action confusion');
ok(gate.includes('office_payment_walk_in_instruction_forbidden'),'final gate blocks walk-in payment instruction');
ok(writer.includes('PHASE 7.5.0 UNIFIED CONVERSATION DECISION PLANE'),'writer contract encodes unified decision plane');
ok(writer.includes('BUSINESS REGISTRATION SECURITY'),'writer contract encodes registration-document security policy');
ok(writer.includes('ACTION INTENT SEPARATION'),'writer contract separates stop-refund from cancel/refund');
ok(types.includes('v3.0.0-phase7.5.0-unified-conversation-decision-plane')||types.includes('v3.0.0-phase7.5.1.1-type-safe-routing-hotfix')||types.includes('v3.0.0-phase7.5.2-semantic-priority-human-refund-care'),'runtime version identifies Phase 7.5.x decision plane');
ok(types.includes('v3.0.0-phase7.4.6-conversation-repair-true-single-egress'),'7.4.6 compatibility anchor retained');
ok(arbSrc.includes('current meaning lock repaired cross-domain candidate'),'arbiter reports semantic-lock repair reason');
ok(mutSrc.includes('PHASE 7.5.0 ACTION INTENT SEPARATION'),'mutation gate contains action separation hard guard');
ok(unifiedSrc.includes('BUSINESS_REGISTRATION_PROTECTION_REPLY'),'unified plane owns one canonical business-registration response');
ok(!runtime.includes('LIVE_SCOPED_MUTATIONS.add'),'7.5.0 does not expand Real Actions');
const all=[runtime,gate,writer,types,arbSrc,mutSrc,unifiedSrc].join('\n');
ok(!/(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE)/i.test(all),'7.5.0 introduces no SQL mutation');

console.log(`RESULT: ${passed}/${passed+failed} PASS`);if(failed)process.exit(1);
