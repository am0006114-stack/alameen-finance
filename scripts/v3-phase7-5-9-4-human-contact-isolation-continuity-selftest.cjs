const fs=require('fs'),path=require('path'),vm=require('vm');
let ts; try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=process.argv[2]||process.cwd(); let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function transpile(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:rel});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(errs.length===0,`${rel} TypeScript syntax/transpile diagnostics clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));return out.outputText;}
function run(rel,stubs={}){const js=transpile(rel);const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>{if(id in stubs)return stubs[id];throw new Error(`unexpected require ${id}`)},console,process:{env:{}},Date,Map,Set,URL,setTimeout,clearTimeout});return mod.exports;}
const base='app/api/whatsapp/webhook/_lib/v3-os/';
const files={types:base+'types.ts',human:base+'currentHumanTurnAuthority.ts',arb:base+'responseArbiter.ts',writer:base+'writerContract.ts',pay:base+'paymentDestinationOverride.ts'};
const src=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,read(v)]));
ok(src.types.includes('v3.0.0-phase7.5.9.4-human-contact-isolation-continuity'),'runtime version identifies 7.5.9.4');
ok(src.types.includes('v3.0.0-phase7.5.9.3-contact-isolation-current-intent-multiact-integrity'),'7.5.9.3 compatibility anchor preserved');
ok(src.pay.includes('0788500337')&&src.pay.includes('PAYAMEEEN')&&src.pay.includes('AMEEN1ST')&&src.pay.includes('AM500337'),'5 JOD payment destinations frozen');
const normalize=x=>String(x||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
const human=run(files.human,{'./applicationJourney':{applicationJourneyStage:()=> 'preliminary_review',customerFacingStatusLabel:()=> 'قيد المراجعة'},'./currentTurnAuthority':{explicitContactRequestText:()=>false},'./text':{normalizeArabic:normalize},'./types':{}});
const mismatch='فاهم عليك. رقم التتبع اللي بعثته مربوط برقم واتساب مختلف، فحرصًا على خصوصية صاحب الطلب ما بقدر أعرض تفاصيله أو أنفذ عليه من هالرقم.';
let state={lastAssistantText:mismatch,lastCustomerText:'الغِ الطلب الآن AM-1788534808875',lastVerifiedApplication:null,contactResolution:{status:'awaiting_alias_confirmation',trackingId:'AM-1788534808875',explanation:'no_whatsapp',updatedAt:'x'}};
let turn={rawText:'رقمي ما عليه واتساب',topics:[]};
let auth=human.resolveCurrentHumanTurnAuthority({turn,state,truth:{application:null}});
ok(auth.kind==='contact_isolation_continuation','no-WhatsApp explanation becomes contact-isolation continuation');
let reply=human.buildCurrentHumanTurnReply({authority:auth,turn,state,truth:{application:null}})||'';
ok(/(?:معلومات الطلب التشغيلية الآمنة|اعتمد رقم الواتساب|اعتمد الرقم)/.test(reply)&&!/تم اعتماد/.test(reply),'continuation keeps conversation open with safe-preview/alias path without falsely claiming authorization');
ok(/تأكيد واضح/.test(reply)&&/بنفذه مباشرة/.test(reply)&&!/تم اعتماد/.test(reply),'phone-channel mismatch offers explicit automatic alias confirmation and never claims completion before confirmation');
ok(!/(?:الدفع مؤكد|رقم الهوية|الراتب|الكفيل)/.test(reply),'continuation leaks no sensitive foreign application truth before safe preview is loaded');
state={...state,lastAssistantText:reply,lastCustomerText:'رقمي ما عليه واتساب'}; turn={rawText:'بس رقمي استرالي ما بزبط عليه واتساب',topics:[]};
auth=human.resolveCurrentHumanTurnAuthority({turn,state,truth:{application:null}});
ok(auth.kind==='contact_isolation_continuation','international/Australian follow-up remains in human contact-isolation continuity');
reply=human.buildCurrentHumanTurnReply({authority:auth,turn,state,truth:{application:null}})||'';
ok(/أسترالي أو دولي/.test(reply)&&/مش مشكلة/.test(reply)&&/(?:تعتمد رقم الواتساب|تأكيد واضح)/.test(reply),'international number reason is acknowledged specifically and stays on the alias-resolution path');
ok(human.currentHumanTurnCandidateAligned({authority:auth,candidate:reply})===true,'safe human continuation candidate is aligned');
ok(human.currentHumanTurnCandidateAligned({authority:auth,candidate:'معك حق تتضايق إذا حاسس إنك عم تستنى أكثر من اللازم'})===false,'unrelated generic delay empathy is rejected');
ok(src.arb.indexOf('currentHumanTurn.kind === "contact_isolation_continuation"') < src.arb.indexOf('contactIdentityMismatch(input.truth)'),'continuation authority can supersede repeated privacy template without weakening initial mismatch guard');
ok(src.arb.includes('معلومات تشغيلية آمنة')&&src.arb.includes('نعم، اعتمد الرقم'),'initial mismatch reply opens a safe-preview plus explicit-alias path instead of creating a dead end');
ok(src.writer.includes('CONTACT ISOLATION يحمي بيانات الطلب فقط، ولا يوقف المحادثة نفسها'),'writer contract explicitly separates privacy from conversation continuity');
ok(src.writer.includes('لا تعيد محاضرة الخصوصية في كل رسالة'),'writer contract forbids repetitive privacy lecture');
ok(src.writer.includes('تعاطفًا عامًا غير مرتبط'),'writer contract forbids unrelated generic empathy in this flow');
console.log(`\n7.5.9.4 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`); if(failed)process.exit(1);
