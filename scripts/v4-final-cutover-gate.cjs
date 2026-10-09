const cp=require('child_process'),fs=require('fs'),path=require('path');
const root=process.argv[2]||process.cwd();
const BASE='16597dc34bcadfd08713830bafd0a79ff0f25810';
function run(cmd,args,{capture=false}={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed${r.stderr?`: ${String(r.stderr).trim()}`:''}`);return capture?String(r.stdout||'').trim():''}
function allowed(rel){return rel==='app/api/whatsapp/webhook/route.ts'||rel.startsWith('app/api/whatsapp/webhook/_lib/v4-os/')||rel==='docs/ALAMEEN_V4_HUMAN_AI_CONVERSATION_OS.md'||/^scripts\/v4-/.test(rel)}
run('git',['cat-file','-e',`${BASE}^{commit}`],{capture:true});
const names=run('git',['diff','--name-only',`${BASE}...HEAD`],{capture:true}).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const forbidden=names.filter(x=>!allowed(x));
if(forbidden.length){console.error('FAIL - V4 FINAL CUTOVER TOUCHED FORBIDDEN PRODUCTION FILES');for(const f of forbidden)console.error('  '+f);process.exit(1)}
const protectedPaths=[
'app/api/whatsapp/webhook/_lib/v3-os/informedCommercialContinuation.ts',
'app/api/whatsapp/webhook/_lib/v3-os/continuationPersistence.ts',
'app/api/whatsapp/webhook/_lib/v3-os/paymentDestinationOverride.ts',
'app/api/continue-decision/route.ts',
'app/admin/page.tsx',
'app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts',
'app/api/whatsapp/webhook/_lib/v3-os/operationalCalendar.ts',
'app/api/cron/preliminary-approval/route.ts',
'app/admin/operations-calendar/page.tsx',
'app/admin/applications/[id]/page.tsx',
];
const changed=new Set(names);const touchedProtected=protectedPaths.filter(x=>changed.has(x));
if(touchedProtected.length){console.error('FAIL - PROTECTED PAYMENT/CALENDAR CORE CHANGED');for(const f of touchedProtected)console.error('  '+f);process.exit(1)}
console.log(`PASS - cutover diff scope is constrained; ${names.length} allowed files changed from ${BASE.slice(0,7)}`);

const checks=[
['V4 CORE','v4-human-ai-conversation-os-selftest.cjs'],
['V4 STATE MEMORY','v4-state-memory-bridge-selftest.cjs'],
['V4 BURST ASSEMBLER','v4-burst-assembler-selftest.cjs'],
['V4 FROZEN COMMERCIAL DELEGATE','v4-commercial-delegate-selftest.cjs'],
['V4 HUMAN CARE','v4-human-care-playbook-selftest.cjs'],
['V4 HUMAN ESCALATION','v4-human-escalation-selftest.cjs'],
['V4 PRODUCTION REGRESSION CONTRACT','v4-regression-contract-selftest.cjs'],
['V4 PRODUCTION RUNTIME','v4-production-runtime-selftest.cjs'],
['V4 FINAL ROUTE OWNERSHIP','v4-final-cutover-route-selftest.cjs'],
];
for(const [label,file] of checks){console.log(`\n=== ${label} ===`);run(process.execPath,[path.join('scripts',file),root])}

const runtime=fs.readFileSync(path.join(root,'app/api/whatsapp/webhook/_lib/v4-os/productionRuntime.ts'),'utf8');
if(/enqueueShadowJob|enqueueConversationOsShadowJob|routeShadowAgent|shadow-core/.test(runtime))throw new Error('V4 production runtime contains forbidden shadow reference');
if(/from\s+["']\.\.\/v3-os\/runtimeLive["']/.test(runtime))throw new Error('V4 production runtime imports V3 conversational runtime');
console.log('\nPASS - V4 production runtime has no shadow or V3 conversational fallback');

console.log('\n=== TYPESCRIPT / NEXT BUILD ===');
if(process.platform==='win32')run(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',['/d','/s','/c','npm run build']);else run('npm',['run','build']);
console.log('\n=== DIFF CHECK ===');
run('git',['diff','--check',`${BASE}...HEAD`]);
console.log('\n====================================================');
console.log('PASS - ALAMEEN V4 FINAL CUTOVER GATE');
console.log('CUSTOMER CONVERSATION: V4 ONLY');
console.log('SHADOW MODE: NONE');
console.log('SPLIT / CANARY: NONE');
console.log('V3 CONVERSATION RUNTIME: NOT IMPORTED');
console.log('V3 TRUTH/ACTION BACKPLANE: REUSED');
console.log('PAYMENT FUNNEL: FROZEN / UNCHANGED');
console.log('OPERATIONAL CALENDAR: FROZEN / UNCHANGED');
console.log('IPHONE 18 CORE: FROZEN / UNCHANGED');
console.log('====================================================');
