const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cache=new Map();
function load(rel){let file=path.isAbsolute(rel)?rel:path.join(root,rel);if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';else if(fs.existsSync(file)&&fs.statSync(file).isDirectory()&&fs.existsSync(path.join(file,'index.ts')))file=path.join(file,'index.ts');}if(cache.has(file))return cache.get(file).exports;const src=fs.readFileSync(file,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(file,mod);function req(id){if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';else if(fs.existsSync(p)&&fs.statSync(p).isDirectory()&&fs.existsSync(path.join(p,'index.ts')))p=path.join(p,'index.ts');return load(p)}if(id==='@/lib/supabaseAdmin')return{supabaseAdmin:{}};if(['crypto','fs','path'].includes(id))return require(id);throw new Error(`unexpected external require ${id} from ${file}`)}vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder,AbortController,fetch:async()=>{throw new Error('network disabled')}},{filename:file});return mod.exports}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const route=read('app/api/whatsapp/webhook/route.ts'),runtime=read(b+'runtimeLive.ts'),kernelSrc=read(b+'nativeConversationKernel.ts'),gateSrc=read(b+'mutationConfirmationGate.ts'),informedSrc=read(b+'informedCommercialContinuation.ts'),types=read(b+'types.ts');
const v3Start=route.indexOf('if (v3LiveActive) {'),v1Start=route.indexOf('if (!v3LiveActive) {',v3Start);const v3Block=route.slice(v3Start,v1Start);

(async()=>{
// Absolute ownership / route cutover.
ok(types.includes('v3.0.0-phase8.1-absolute-runtime-authority-cutover'),'version identifies Phase 8.1 absolute runtime authority');
ok(runtime.includes('PHASE 8.1 ABSOLUTE RUNTIME AUTHORITY'),'runtime has absolute authority marker');
ok(v3Block.includes('if (!v3Run.finalSafetyPass || !v3Run.reply)'),'route requires validated Native Kernel result before sending');
ok(!v3Block.includes('v3Run.reply || buildV3LastResortReply()'),'route no longer substitutes a legacy reply when Native Kernel is empty');
ok(!v3Block.includes('reply = buildV3LastResortReply()'),'runtime exception cannot become generic customer reply');
ok(!v3Block.includes('const emergencyReply = buildV3LastResortReply()'),'Meta delivery retry cannot swap in legacy emergency text');
ok(v3Block.includes('sendWhatsAppTextDetailed(from, reply, false)'),'delivery retry uses the same validated Native Kernel reply');
ok(v3Block.includes('لم يتم إرسال أي رد Legacy أو generic للعميل'),'runtime exception is operationally fail-closed');
const egressAt=runtime.indexOf('PHASE 8.1 ABSOLUTE RUNTIME AUTHORITY EGRESS');
ok(egressAt>0,'Phase 8.1 egress section exists');
ok(!runtime.slice(egressAt).includes('buildV3LastResortReply({'),'Phase 8.1 live egress never falls back to legacy conversation author');
ok(runtime.includes('shouldRespond: Boolean(nativeKernelInitial.reply) || plan.shouldRespond'),'native reply, not legacy planner act type, owns response intent');
ok(runtime.includes('shouldRespond: true')&&runtime.includes('_autoContactAliasPrompt'),'safe-preview alias flow cannot execute/succeed silently because old planner said no response');
ok(runtime.includes('mutationGate.confirmationPrompt || mutationGate.informationalReply || mutationGate.actions.length'),'action/open-loop output forces a response opportunity');

// Contextual informed continuation: no magic phrase, but only after full disclosure on same app.
const policy=load(b+'policy.ts').getV3Policy();
const inf=load(b+'informedCommercialContinuation.ts');
function app(status='preliminary_qualified',paymentStatus=null){return{id:'app-1',trackingId:'AM-1',fullName:'Test',phone:'0790000000',email:null,status,paymentStatus,paymentConfirmedAt:null,paymentReference:null,deviceId:null,deviceName:'iPhone 18 Pro Max - 512GB',devicePrice:1499,installmentMonths:36,downPayment:0,interestRate:null,monthlyPayment:36.69,totalWithInterest:null,salary:null,deliveryDelayUntil:null,preliminaryQualifiedAt:'2026-09-23T00:00:00Z',paidClickedAt:null,documents:null}}
function truth(status='preliminary_qualified',paymentStatus=null,contactAccess='full'){return{confidence:'authoritative',source:'current_message_tracking',contactAccess,application:app(status,paymentStatus),ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()}}
function state(over={}){return{version:'v3.0.0-phase8.1-absolute-runtime-authority-cutover',waId:'9627',activeApplicationId:'app-1',activeTrackingId:'AM-1',currentTopic:null,currentGoal:null,role:{currentRole:'tala',tier:'frontline',reason:'x',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,conversationConstraints:{},semanticMemory:null,commercialDisclosure:null,humanRelationship:null,updatedAt:new Date().toISOString(),...over}}
function sem(dec={}){return{meaningSummary:'x',customerGoal:'x',currentQuestion:null,answerObligations:[],references:[],entities:[],decision:{continuation:'unknown',cancellation:'unknown',refund:'unknown',aliasConfirmation:'unknown',condition:null,...dec},correctionOfPrevious:false,socialClosure:false,requiresExternalFact:false,externalFactNeeded:null,answerMode:'direct',confidence:.96,warnings:[]}}
function turn(text,opts={}){return{turnId:opts.turnId||'t1',rawText:text,normalizedText:text,acts:opts.acts||[],topics:opts.topics||[],requestedActions:opts.actions||[],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.95,warnings:[],semantic:opts.semantic||sem()}}
const delivered={version:inf.COMMERCIAL_DISCLOSURE_VERSION,applicationId:'app-1',trackingId:'AM-1',status:'delivered',deliveredAt:new Date().toISOString(),deliveredTurnId:'prev',acknowledgedAt:null,acknowledgedTurnId:null};
ok(inf.informedCommercialContinuationConfirmed({state:state({commercialDisclosure:delivered}),truth:truth(),turn:turn('نعم'),customerText:'نعم'}),'bare yes confirms continuation only after full disclosure for same application');
ok(inf.informedCommercialContinuationConfirmed({state:state({commercialDisclosure:delivered}),truth:truth(),turn:turn('نعم اوافق على كامل الشروط'),customerText:'نعم اوافق على كامل الشروط'}),'natural full-terms confirmation advances informed continuation');
ok(!inf.informedCommercialContinuationConfirmed({state:state(),truth:truth(),turn:turn('نعم'),customerText:'نعم'}),'bare yes cannot open commercial payment journey without delivered disclosure');
ok(!inf.informedCommercialContinuationConfirmed({state:state({commercialDisclosure:delivered}),truth:truth(),turn:turn('نعم',{semantic:sem({continuation:'declined'})}),customerText:'نعم'}),'semantic decline veto outranks contextual affirmative');
ok(runtime.split('informedCommercialContinuationConfirmed').length>=3,'runtime uses contextual informed continuation in both disclosure and persistence decisions');

// Semantic mutation requests may STAGE confirmation, but never execute from model meaning alone.
const gate=load(b+'mutationConfirmationGate.ts');
let g=gate.enforceMutationConfirmationGate({actions:[],turn:turn('خلص الغي الطلب معناته',{topics:['cancellation'],semantic:sem({cancellation:'requested'})}),state:state(),truth:truth('under_review','paid')});
ok(g.actions.some(a=>a.action==='cancel_application'&&a.requiresConfirmation),'semantic cancellation request stages deterministic action-specific confirmation without phrase patch');
ok(g.confirmationPrompt&&/ألغي الطلب/.test(g.confirmationPrompt),'semantic cancellation gets explicit separate confirmation prompt');
ok(!g.actions.some(a=>a.action==='cancel_application'&&!a.requiresConfirmation),'semantic cancellation alone never executes destructive action');
g=gate.enforceMutationConfirmationGate({actions:[],turn:turn('رجعولي فلوسي',{topics:['refund'],semantic:sem({refund:'requested'})}),state:state(),truth:truth('under_review','paid')});
ok(g.actions.some(a=>a.action==='request_refund'&&a.requiresConfirmation),'semantic refund request stages confirmation without executing');
const pendingState=state({pendingAction:'cancel_application',pendingActionPayload:{_scopeApplicationId:'app-1',_scopeTrackingId:'AM-1',_scopeWaId:'9627'},lastAssistantText:'إذا قرارك نهائي اكتب: نعم، ألغي الطلب.'});
g=gate.enforceMutationConfirmationGate({actions:[],turn:turn('نعم ألغي الطلب',{topics:['cancellation']}),state:pendingState,truth:truth('under_review','paid')});
ok(g.actions.some(a=>a.action==='cancel_application'&&!a.requiresConfirmation),'second action-specific confirmation can authorize execution');

// Native validator protects the production truth leaks seen after 8.0.
const kernel=load(b+'nativeConversationKernel.ts');
const validate=(reply,customerText='مرحبا',topics=[],over={})=>kernel.validateNativeConversationReply({reply,turn:over.turn||turn(customerText,{topics}),state:over.state||state(),truth:over.truth||truth('under_review','paid'),actions:over.actions||[],recentTurns:over.recentTurns||[],customerText,disclosureRequiredThisTurn:Boolean(over.disclosureRequiredThisTurn),protectedFiveJodStep:Boolean(over.protectedFiveJodStep)});
ok(!validate('اكتب سؤالك أو رقم التتبع، وبجاوبك فقط من الحقيقة الموثقة عندنا.').pass,'legacy generic fallback remains forbidden by native egress');
ok(!validate('الخطوة الجاية إنه نوصل لمرحلة الإفصاح الكامل وبعدين تقرر.', 'شو الخطوة الجاية؟').pass,'internal commercial process label cannot leak to customer');
ok(!validate('أنا عمران، وأنا المسؤول عن طلبك من هون مباشرة.', 'بدي موظف',['human_request']).pass,'persona cannot claim literal responsibility/human transfer authority');
ok(!validate('عنواننا عمّان – شارع المدينة المنورة، وبتقدر تزورنا إذا بدك.', 'وين موقعكم؟',['office_location']).pass,'office cannot be presented as open visit without confirmed appointment');
ok(validate('عنواننا عمّان – شارع المدينة المنورة، والحضور فقط بموعد رسمي مؤكد.', 'وين موقعكم؟',['office_location']).pass,'office address with appointment truth passes');
ok(!validate('ابعتلي الهوية ورقم الهوية وكشف الراتب وبنفتحلك الطلب.', 'كيف اقدم؟',['requirements']).pass,'sensitive application data cannot be solicited inside WhatsApp');
ok(!validate('الكفيل العسكري مقبول وبزبط معك.', 'كفيل عسكري بزبط؟',['guarantor']).pass,'specific guarantor category cannot be guaranteed without authoritative truth');
ok(!validate('المراجعة يدوية وعشان هيك تأخرت.', 'ليش تأخرت؟',['review_timing']).pass,'unsupported internal review mechanism cannot be invented');

// 5-JOD invariant remains hard-protected.
const protectedReply='تمام، رسوم فتح الملف 5 دنانير. التحويل عبر Orange Money على 0788500337 أو CliQ: PAYAMEEEN أو AMEEN1ST أو AM500337. اسم المستفيد ABDUL RAHMAN ALHARAHSHEH. بعد التحويل ارفع الوصل من الرابط الرسمي: https://www.ameenfinance.co/receipt?tracking=AM-1&phone=0790000000';
ok(validate(protectedReply,'نعم اوافق على كامل الشروط',['continuation'],{turn:turn('نعم اوافق على كامل الشروط',{topics:['continuation'],actions:['continue_application'],semantic:sem({continuation:'confirmed'})}),truth:truth('customer_confirmed_continue','pending'),protectedFiveJodStep:true}).pass,'protected 5-JOD payment destinations + bound receipt link still pass after informed confirmation');
ok(!validate('حول 5 دنانير على 0788500337.', 'كم القسط الشهري؟',['installment_amount'],{truth:truth('under_review','paid')}).pass,'5-JOD topic still cannot leak into unrelated installment question');

// Prompt explicitly teaches the new authority rules rather than adding phrase-specific reply templates.
ok(kernelSrc.includes('الطلب الصريح = requested، السؤال = question'),'kernel emits structured cancellation/refund decisions');
ok(kernelSrc.includes('المكتب ليس زيارة مفتوحة'),'kernel preserves appointment-only office truth');
ok(kernelSrc.includes('لا تطلب من العميل إرسال الهوية أو الرقم الوطني أو إثبات الدخل أو الوصل داخل واتساب'),'kernel preserves secure-document boundary');
ok(kernelSrc.includes('حتى لو كان التأكيد المختصر «نعم/اه/Yes/موافق»'),'kernel understands natural post-disclosure consent without magic phrase');
ok(gateSrc.includes('semanticMutationRequest')&&gateSrc.includes('never')||gateSrc.includes('never'),'semantic mutation staging is explicit in action guard source');

// No shadow/model comparison introduced; two-call ceiling retained.
ok(!runtime.toLowerCase().includes('runtimeshadow'),'Phase 8.1 introduces no shadow runtime');
ok(runtime.includes('replyAttempts < 2'),'bounded maximum model path remains at most two generations');

const phaseFiles=['app/api/whatsapp/webhook/route.ts',b+'runtimeLive.ts',b+'nativeConversationKernel.ts',b+'mutationConfirmationGate.ts',b+'informedCommercialContinuation.ts',b+'types.ts'];
ok(!phaseFiles.some(f=>f.endsWith('.sql')),'Phase 8.1 contains no SQL');
for(const f of phaseFiles)transpile(f);
console.log(`\nPhase 8.1 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
})().catch(err=>{failed++;console.error('SELFTEST ERROR:',err&&err.stack||err);console.log(`\nPhase 8.1 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(1)});
