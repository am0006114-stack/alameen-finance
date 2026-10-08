const fs=require('fs'),path=require('path'),cp=require('child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(process.cwd(),'node_modules','typescript'))}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
function transpile(rel){const tr=ts.transpileModule(read(rel),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},reportDiagnostics:true,fileName:rel});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(!errs.length,`${rel} transpiles clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));}
const arb='app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts';
const human='app/api/whatsapp/webhook/_lib/v3-os/humanConversationOS.ts';
const a=read(arb),h=read(human);
transpile(arb);transpile(human);
ok(a.includes('function hardCurrentTurnReplyForArbiter'),'hard current-turn gate exists');
ok(a.includes('explicitNoReplyRequestForArbiter'),'explicit no-reply detector exists');
ok(a.includes('fresh receipt clarification owns current turn'),'CliQ/receipt clarification owns fresh turn');
ok(a.includes('fresh location question owns current turn'),'location question owns fresh turn');
ok(a.includes('fresh contact-channel question owns current turn'),'contact question owns fresh turn');
ok(a.includes('fresh approval-status question owns current turn'),'approval-status question owns fresh turn');
ok(a.includes('fresh today-result question owns current turn'),'today-result question is answered directly');
ok(a.includes('fresh operational-calendar question owns current turn'),'calendar question owns fresh turn');
ok(a.includes('business-truth hard guard owns current turn'),'business-truth hard guard exists');
ok(a.includes('customer rejected repeated answer'),'repetition kill switch exists');
ok(a.includes('candidateHasUnsupportedBusinessClaimForArbiter'),'unsupported social/license claim detector exists');
ok(a.includes('|| candidateHasUnsupportedBusinessClaimForArbiter(reply);'),'unsupported business claim participates in bad-candidate rejection');
ok(a.includes('ما عندي اسم أو رابط صفحة فيسبوك أو إنستغرام موثق'),'social-page truth never invents Facebook/Instagram');
ok(a.includes('الموقع الرسمي الموثق عندي هو'),'official-site truth is explicit');
ok(a.includes('ما عندي رقم ترخيص أو تسجيل موثق'),'license/registration truth refuses invention');
ok(a.includes('commercialFileOpeningStatusTextForArbiter'),'commercial file-opening status detector exists');
ok(a.includes('عبارة فتح الملف هنا ما تعني إعادة فتح طلب ملغي')||a.includes('عبارة فتح الملف ما بتعني إعادة فتح طلب ملغي'),'commercial file opening is explicitly separated from reopen action');
ok(/\(\?:بدي\|حاب\|اريد\|أريد\)\\s\*\(\?:افتح/.test(a),'explicit reopen requires an intent prefix for bare open-request wording');
const hardCall=a.indexOf('const hardCurrentTurn = hardCurrentTurnReplyForArbiter');
const humanTurn=a.indexOf('if (currentHumanTurn.kind !== "none") {',hardCall);
const genericMeaning=a.indexOf('if (meaningLock.kind !== "none"',hardCall);
ok(hardCall>=0&&humanTurn>hardCall,'hard current-turn gate runs before human-turn stale-context arbitration');
ok(hardCall>=0&&genericMeaning>hardCall,'hard current-turn gate runs before generic meaning lock');
ok(a.includes('explicit customer no-reply request')&&a.includes('suppressed: hardCurrentTurn.suppress || undefined'),'explicit no-reply can suppress egress');
ok(a.includes('ما رح أعتبر الدفع مؤكد من صورة واتساب وحدها'),'receipt clarification never confirms payment from WhatsApp image');
ok(h.includes('function typoContinuationTextForHumanOs'),'continuation typo tolerance exists');
ok(h.includes('contextualContinuation || typoContinuationTextForHumanOs(input.customerText)'),'typo continuation is normalized before state/planning');
ok(h.includes('explicitContinuationText(input.customerText) || typoContinuationTextForHumanOs(input.customerText)'),'typo continuation participates in continuation intent');
ok(h.includes('vetoMisclassifiedCommercialFileReopenV1192'),'Phase 11.9.2 reopen veto exists');
const vetoCall=h.indexOf('plan = vetoMisclassifiedCommercialFileReopenV1192');
const executeCall=h.indexOf('const actions = await executeActions');
ok(vetoCall>=0&&executeCall>vetoCall,'commercial-file reopen veto runs before Action Plane execution');
ok(h.includes('عمران|عبدالله|عبدالرحمن|تالا|فدوة'),'named employee requests are recognized for human escalation');
ok(h.includes('الموظفين|الموظف'),'generic employee requests are recognized for human escalation');
const protectedFiles=[
'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',
'app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts',
'app/api/continue-decision/route.ts',
'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
'app/admin/page.tsx',
'app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar.ts',
'app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry.ts',
'app/api/whatsapp/webhook/_lib/v3-os/policy.ts',
'app/admin/operations-calendar/page.tsx',
'app/admin/applications/[id]/page.tsx',
'app/api/cron/preliminary-approval/route.ts'
];
for(const file of protectedFiles)ok(fs.existsSync(path.join(root,file)),`protected source exists: ${file}`);
const changed=cp.execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
ok(!protectedFiles.some(file=>changed.includes(file)),'payment/calendar/iPhone-18 protected core has no worktree changes');
console.log(`\nV3 PHASE 11.9.2 FINAL CURRENT-TURN HARD GATE SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed)process.exit(1);
