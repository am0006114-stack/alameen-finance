const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
let ts; try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd(); let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function normHash(rel){let b=fs.readFileSync(path.join(root,rel)),a=[];for(let i=0;i<b.length;i++){if(b[i]===13){if(i+1<b.length&&b[i+1]===10)i++;a.push(10)}else a.push(b[i])}return crypto.createHash('sha256').update(Buffer.from(a)).digest('hex')}
const cache=new Map();
function load(rel){let file=path.isAbsolute(rel)?rel:path.join(root,rel);if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';}
 if(cache.has(file))return cache.get(file).exports; const src=fs.readFileSync(file,'utf8'); const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file}); const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error); if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; ')); const mod={exports:{}}; cache.set(file,mod); function req(id){if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';return load(p)} if(id==='@/lib/supabaseAdmin')return{supabaseAdmin:{}}; throw new Error(`unexpected external require ${id}`)} vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder},{filename:file}); return mod.exports}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const types=read(b+'types.ts'), runtime=read(b+'runtimeLive.ts'), informedSrc=read(b+'informedCommercialContinuation.ts'), policy=read(b+'policy.ts'), planner=read(b+'planner.ts'), writer=read(b+'writerContract.ts'), verifier=read(b+'verifier.ts'), arbiter=read(b+'responseArbiter.ts'), semVerifier=read(b+'semanticReplyVerifier.ts');
ok(types.includes('v3.0.0-phase7.8.0.1-informed-commercial-continuation-fee-rationale-integrity'),'runtime version identifies 7.8.0.1');
ok(types.includes('v3.0.0-phase7.8.0-ai-native-conversation-brain-semantic-memory'),'7.8.0 compatibility anchor preserved');
ok(types.includes('CommercialDisclosureState')&&types.includes('commercialDisclosure?: CommercialDisclosureState'),'commercial disclosure is first-class conversation state');
ok(informedSrc.includes('2026-09-informed-fee-v1'),'commercial disclosure has explicit policy version');
ok(policy.includes('قياس جدية الطلب')&&policy.includes('حجم كبير جدًا من الطلبات'),'fee rationale explains seriousness and high application volume');
ok(policy.includes('الاستعداد المبدئي لإكمال الالتزامات المالية'),'fee rationale explains preliminary payment-readiness signal');
ok(policy.includes('ليست تقييمًا نهائيًا للقدرة الائتمانية')&&policy.includes('ضمانًا للموافقة'),'fee rationale does not misrepresent fee as credit decision or approval purchase');
ok(policy.includes('لا تستخدم صياغة من نوع ادفع أو توقف'),'policy explicitly forbids coercive pay-or-leave language');
ok(planner.includes('قبل تثبيت قرار الاستمرار اشرح للعميل الخطوة كاملة')&&planner.includes('ممنوع إعطاء المستفيد أو الرقم أو CliQ أو رابط الوصل'),'planner enforces disclosure-before-payment execution details');
ok(writer.includes('INFORMED_COMMERCIAL_DISCLOSURE=')&&writer.includes('INFORMED_DISCLOSURE_DELIVERED='),'writer receives informed-disclosure memory');
ok(writer.includes('INFORMED COMMERCIAL CONTINUATION 7.8.0.1'),'writer has explicit informed-continuation contract');
ok(verifier.includes('payment_destination_exposed_before_informed_continuation'),'deterministic verifier blocks payment destination before informed confirmation');
ok(verifier.includes('preliminary_approval_fee_rationale_missing_or_coercive'),'deterministic verifier requires respectful rationale');
ok(semVerifier.includes('COMMERCIAL_DISCLOSURE=')&&semVerifier.includes('لا يجوز القفز مباشرة إلى بيانات الدفع'),'semantic egress verifier understands disclosure gate');
ok(runtime.includes('import { applicationRefundUrl, buildOfficialLinkContext, sanitizeRecentTurnsForModel } from "./linkIntegrity";'),'runtime imports official link builder used by post-disclosure payment reply');
ok(runtime.includes('disclosureRequiredThisTurn')&&runtime.includes('actions.filter((action) => action.action !== "continue_application")'),'first continuation is prevented from becoming a persisted commercial action before disclosure');
ok(runtime.includes('!disclosureRequiredThisTurn')&&runtime.includes('persistExplicitContinuation'),'continuation persistence is gated behind informed disclosure');
ok(runtime.includes('informedCommercialDisclosureReply')&&runtime.includes('buildInformedCommercialDisclosureReply'),'runtime owns a deterministic disclosure reply before writer/payment');
ok(runtime.includes('markCommercialDisclosureDelivered')&&runtime.includes('markCommercialDisclosureAcknowledged'),'runtime remembers delivered and acknowledged disclosure states');
ok(runtime.includes('buildPostDisclosurePaymentReply'),'payment details are released only on post-disclosure confirmation path');
ok(runtime.includes('officialLinksForContinuation.relevant.receipt ?? null'),'optional receipt link is normalized to null for strict TypeScript compatibility');
ok(arbiter.includes('حجم الطلبات كبير جدًا')&&arbiter.includes('مش تقييم نهائي للقدرة الائتمانية'),'direct why-fee question now receives the business rationale');
ok(!informedSrc.includes('PAYAMEEEN')&&!informedSrc.includes('0788500337'),'pre-confirmation disclosure builder contains no hard-coded payment destination');
ok(normHash('app/api/whatsapp/webhook/route.ts')==='bd1ebf07bf79ebe03246590e047fe78d5dff1bfa515158c80599c2408ec625b0','route/burst ownership remains exactly preserved');
ok(normHash(b+'transactionalActionAdapter.ts')==='b9b65f7965f2683de86f61ed70e6e2975ddf36f43f10769772131e27b8509dce','Real Actions adapter scope remains exactly preserved');
ok(normHash(b+'paymentDestinationOverride.ts')==='6f915ad10d4565ee09e8e73f3f1cf8a6054147d471a0484d8c2fec63f6ea1335','payment destination source remains exactly preserved');
ok(![types,runtime,informedSrc,policy,planner,writer,verifier,arbiter,semVerifier].join('\n').includes('ALTER TABLE'),'7.8.0.1 introduces no SQL migration');

const informed=load(b+'informedCommercialContinuation.ts');
const app=(id='a1',tracking='AM-1',status='preliminary_qualified')=>({id,trackingId:tracking,status,paymentStatus:null,paymentConfirmedAt:null,documents:{paymentReceiptUploaded:false}});
const policyTruth={fileOpeningFeeJod:5,normalReviewWindow:'المعدل الطبيعي للمراجعة من يومين إلى 3 أيام عمل',fileOpeningFeePurposeRule:'x',fileOpeningFeeRefundRule:'x',paymentMethodRule:'التحويل ممكن من أي حساب بنكي يدعم CliQ أو من محفظة إلكترونية. الجهة المستلمة محفظة Orange Money، والتحويل يكون إلى PAYAMEEEN أو AMEEN1ST أو AM500337 أو الرقم 0788500337، ويجب مراجعة اسم المستفيد ABDUL RAHMAN ALHARAHSHEH قبل تأكيد الحوالة.'};
const truth=(a=app())=>({application:a,policy:policyTruth,source:'conversation_binding',contactAccess:'full'});
const state=(d=informed.emptyCommercialDisclosure())=>({waId:'9627',commercialDisclosure:d});
const turn={turnId:'t1',rawText:'استمرار',topics:['continuation'],requestedActions:['continue_application'],semantic:{confidence:.96,socialClosure:false,customerGoal:'الاستمرار بعد الموافقة المبدئية',currentQuestion:null,answerObligations:[],decision:{continuation:'confirmed'}}};
let st=state();
ok(informed.preliminaryApprovalNeedsInformedDisclosure(st,truth())===true,'fresh preliminary approval requires disclosure');
ok(informed.shouldExplainCommercialStep({state:st,truth:truth(),turn,explicitContinuationIntent:true})===true,'first continuation asks for disclosure instead of payment');
let reply=informed.buildInformedCommercialDisclosureReply(truth());
ok(reply.includes('5 دنانير')&&reply.includes('جدية الطلب')&&reply.includes('حجم الطلبات كبير جدًا'),'customer disclosure contains amount, seriousness rationale, and volume context');
ok(reply.includes('الاستعداد المبدئي لإكمال الالتزامات المالية'),'customer disclosure explains preliminary financial-readiness rationale');
ok(reply.includes('مش تقييم')||reply.includes('ليست تقييمًا'),'customer disclosure limits the meaning of the fee');
ok(reply.includes('مسار الاسترداد الرسمي'),'customer disclosure preserves refundability');
ok(reply.includes('خذ قرارك براحتك'),'customer disclosure is explicitly non-coercive');
ok(!/PAYAMEEEN|AMEEN1ST|AM500337|0788500337|ABDUL RAHMAN/i.test(reply),'first disclosure exposes no payment destination');
st=informed.markCommercialDisclosureDelivered(st,truth(),'t1');
ok(st.commercialDisclosure.status==='delivered'&&st.commercialDisclosure.applicationId==='a1','delivered disclosure is scoped to current application');
ok(informed.preliminaryApprovalNeedsInformedDisclosure(st,truth())===false,'same application no longer repeats disclosure after delivery');
ok(informed.shouldExplainCommercialStep({state:st,truth:truth(),turn:{...turn,turnId:'t2'},explicitContinuationIntent:true})===false,'second continuation can advance to payment');
st=informed.markCommercialDisclosureAcknowledged(st,truth(),'t2');
ok(st.commercialDisclosure.status==='acknowledged'&&st.commercialDisclosure.acknowledgedTurnId==='t2','second informed confirmation is remembered');
ok(informed.preliminaryApprovalNeedsInformedDisclosure(st,truth(app('a2','AM-2')))===true,'disclosure memory cannot leak across applications');
const paymentReply=informed.buildPostDisclosurePaymentReply(truth(), 'https://www.ameenfinance.co/receipt?tracking=AM-1&phone=0790000000');
ok(paymentReply.includes('PAYAMEEEN')&&paymentReply.includes('0788500337'),'post-disclosure payment reply includes authoritative payment destination');
ok(paymentReply.includes('/receipt?tracking=AM-1'),'post-disclosure payment reply includes bound receipt URL');
ok(paymentReply.includes('القسط الأول مش مطلوب الآن'),'post-disclosure payment reply preserves first-installment distinction');

for(const rel of [b+'types.ts',b+'informedCommercialContinuation.ts',b+'state.ts',b+'stateStore.ts',b+'policy.ts',b+'planner.ts',b+'writerContract.ts',b+'verifier.ts',b+'semanticReplyVerifier.ts',b+'responseArbiter.ts',b+'runtimeLive.ts']) transpile(rel);
console.log(`\n7.8.0.1 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`); if(failed)process.exit(1);
