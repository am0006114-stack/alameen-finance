const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cache=new Map();
function load(rel){let file=path.isAbsolute(rel)?rel:path.join(root,rel);if(!path.extname(file)){if(fs.existsSync(file+'.ts'))file+='.ts';else if(fs.existsSync(file+'.tsx'))file+='.tsx';else if(fs.existsSync(file)&&fs.statSync(file).isDirectory()&&fs.existsSync(path.join(file,'index.ts')))file=path.join(file,'index.ts');}if(cache.has(file))return cache.get(file).exports;const src=fs.readFileSync(file,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:file});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};cache.set(file,mod);function req(id){if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id);if(fs.existsSync(p+'.ts'))p+='.ts';else if(fs.existsSync(p+'.tsx'))p+='.tsx';else if(fs.existsSync(p)&&fs.statSync(p).isDirectory()&&fs.existsSync(path.join(p,'index.ts')))p=path.join(p,'index.ts');return load(p)}if(id==='@/lib/supabaseAdmin')return{supabaseAdmin:{}};if(['crypto','fs','path'].includes(id))return require(id);throw new Error(`unexpected external require ${id} from ${file}`)}vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require:req,console,process:{env:{}},Date,Map,Set,URL,URLSearchParams,setTimeout,clearTimeout,Buffer,TextEncoder,TextDecoder,AbortController,fetch:async()=>{throw new Error('network disabled')}},{filename:file});return mod.exports}
function transpile(rel){const r=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'))}
const b='app/api/whatsapp/webhook/_lib/v3-os/';
const business=load(b+'businessTruthRegistry.ts');
const payment=load(b+'paymentDestinationOverride.ts');
const links=load(b+'linkIntegrity.ts');
const kernel=load(b+'nativeConversationKernel.ts');
const kernelSrc=read(b+'nativeConversationKernel.ts');
const businessSrc=read(b+'businessTruthRegistry.ts');
const paymentSrc=read(b+'paymentDestinationOverride.ts');
const linkSrc=read(b+'linkIntegrity.ts');

const catalog=business.currentProductCatalogForPrompt();
ok(Array.isArray(catalog)&&catalog.length>10,'current product catalog is populated from the live website product source');
ok(catalog.some(p=>p.name==='iPhone 17'),'iPhone 17 is present in general authoritative catalog truth');
ok(catalog.some(p=>p.name==='iPhone 17 Pro Max'),'iPhone 17 Pro Max is present in general authoritative catalog truth');
ok(catalog.some(p=>p.name==='iPhone 18 Pro Max'&&p.capacity==='512GB'&&p.priceJod===1499&&p.source==='iphone18_authoritative'),'iPhone 18 authoritative overlay preserves protected 512GB Pro Max price');
ok(business.mentionedCatalogProduct('بدي ايفون 17')?.name==='iPhone 17','Arabic iPhone 17 mention resolves against catalog truth');
ok(Boolean(business.catalogAvailabilityContradiction({customerText:'بدي ايفون 17',reply:'للأسف iPhone 17 مش متوفر عندنا حاليا'})),'false denial of a catalog product is detected generically');
ok(!business.catalogAvailabilityContradiction({customerText:'بدي ايفون 17',reply:'iPhone 17 موجود ضمن الأجهزة المعروضة للتقديم، وهذا مش وعد بمخزون فوري'}),'truthful catalog availability wording passes');
ok(!business.catalogAvailabilityContradiction({customerText:'بدي ايفون 14',reply:'iPhone 14 غير ظاهر بالكتالوج الحالي'}),'unknown/non-catalog product does not trigger a false catalog contradiction');

const payTruth=payment.fileOpeningPaymentWriterTruth();
ok(payTruth.channels.orangeMoney.phone==='0788500337','Orange Money channel owns the phone destination');
ok(payTruth.channels.cliq.aliases.join('|')==='PAYAMEEEN|AMEEN1ST|AM500337','CliQ channel owns the three aliases');
const canonicalPay=payment.currentFileOpeningPaymentRule();
ok(/Orange Money:\s*\n- الرقم: 0788500337/.test(canonicalPay),'canonical payment block labels Orange Money phone explicitly');
ok(/CliQ:\s*\n- PAYAMEEEN\s*\n- AMEEN1ST\s*\n- AM500337/.test(canonicalPay),'canonical payment block labels all CliQ aliases explicitly');
ok(payment.paymentDestinationPresentationViolations(canonicalPay).length===0,'canonical payment presentation passes channel classifier');
const badPay='الدفع عبر محفظة Orange Money:\n- PAYAMEEEN\n- AMEEN1ST\n- AM500337\n- أو رقم المحفظة 0788500337\nاسم المستفيد ABDUL RAHMAN ALHARAHSHEH';
ok(payment.paymentDestinationPresentationViolations(badPay).includes('cliq_aliases_not_labeled'),'mislabeling CliQ aliases as Orange Money is rejected');
ok(payment.containsAllCurrentFileOpeningPaymentDestinations(canonicalPay)===true,'full canonical payment destination integrity passes');
ok(payment.containsAllCurrentFileOpeningPaymentDestinations(badPay)===false,'token-complete but channel-mislabeled payment block fails integrity');

const policy=load(b+'policy.ts').getV3Policy();
const truth={confidence:'authoritative',source:'current_message_tracking',contactAccess:'none',application:null,ambiguousApplications:[],policy,fetchedAt:new Date().toISOString()};
const neutralTurn={turnId:'t',rawText:'نعم',normalizedText:'نعم',acts:[],topics:['thanks'],requestedActions:[],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.95,warnings:[],semantic:null};
const linkCtx=links.buildOfficialLinkContext(neutralTurn,truth);
ok(linkCtx.allowedUrls.includes('https://www.ameenfinance.co/products'),'public products URL is always safe for contextual follow-up delivery');
ok(linkCtx.allowedUrls.includes('https://www.ameenfinance.co/track'),'public tracking landing URL remains safe');
ok(!Object.values(linkCtx.relevant).includes('https://www.ameenfinance.co/receipt'),'sensitive receipt link is not globally issued');

function state(){return{version:'v3.0.0-phase8.1-absolute-runtime-authority-cutover',waId:'9627',activeApplicationId:null,activeTrackingId:null,currentTopic:null,currentGoal:null,role:{currentRole:'abdulrahman',tier:'specialist',reason:'x',sinceTurnId:null,introduced:true},openLoops:[],facts:[],pendingAction:null,pendingActionPayload:null,lastTurnId:null,lastCustomerText:null,lastAssistantText:null,consecutiveRiskTurns:0,lastVerifiedApplication:null,verifiedContactBinding:null,contactResolution:null,conversationConstraints:{},semanticMemory:null,commercialDisclosure:null,humanRelationship:null,updatedAt:new Date().toISOString()}}
function turn(text,topics=[]){return{turnId:'t',rawText:text,normalizedText:text,acts:[],topics,requestedActions:[],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.95,warnings:[],semantic:null}}
const validate=(reply,customerText,topics=[],over={})=>kernel.validateNativeConversationReply({reply,turn:turn(customerText,topics),state:state(),truth:over.truth||truth,actions:[],recentTurns:[],customerText,disclosureRequiredThisTurn:false,protectedFiveJodStep:Boolean(over.protectedFiveJodStep)});
ok(!validate('للأسف iPhone 17 ما هو متوفر عندنا حاليًا ضمن الأجهزة المعتمدة للتقسيط.','انا بدي ايفون 17',['products']).pass,'native egress rejects false product-unavailable claim when live catalog lists product');
ok(!validate(badPay,'تمام اعطيني',['continuation'],{protectedFiveJodStep:true}).pass,'native egress rejects channel-mislabeled protected payment block');

ok(businessSrc.includes('websiteProducts'),'business truth imports live website catalog instead of duplicating a static general product list');
ok(businessSrc.includes('productCatalogRule')&&businessSrc.includes('currentCatalog'),'prompt truth exposes authoritative general product catalog semantics');
ok(paymentSrc.includes('channels:')&&paymentSrc.includes('orangeMoney')&&paymentSrc.includes('cliq'),'payment truth is structurally separated by channel');
ok(linkSrc.includes('canonicalPublicUrls'),'link integrity distinguishes always-safe public navigation from sensitive bound links');
ok(kernelSrc.includes('TRUTH_INTEGRITY_FREEZE'),'Native Kernel receives explicit truth-integrity contract');
ok(kernelSrc.includes('Orange Money = الرقم 0788500337 فقط'),'kernel is taught exact Orange Money mapping');
ok(kernelSrc.includes('CliQ = المعرفات PAYAMEEEN وAMEEN1ST وAM500337'),'kernel is taught exact CliQ mapping');
ok(kernelSrc.includes('رابط products نفسه؛ لا تستبدله برابط التتبع'),'kernel preserves requested-link semantics across short follow-up confirmations');
ok(kernelSrc.includes('قصدك كفالة الجهاز ولا الكفيل للطلب؟'),'kernel handles warranty/guarantor ambiguity contextually instead of assuming');
ok(!kernelSrc.includes('Phase 8.2'),'truth-integrity release does not introduce a new conversational architecture phase');

for(const f of [b+'businessTruthRegistry.ts',b+'paymentDestinationOverride.ts',b+'linkIntegrity.ts',b+'nativeConversationKernel.ts'])transpile(f);
console.log(`\nPhase 8.1.1 truth-integrity assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);process.exit(failed?1:0);
