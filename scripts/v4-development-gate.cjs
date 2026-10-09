const cp=require('child_process'),path=require('path');
const root=process.argv[2]||process.cwd();
const BASE='16597dc34bcadfd08713830bafd0a79ff0f25810';
function run(cmd,args,{capture=false}={}){const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed${r.stderr?`: ${String(r.stderr).trim()}`:''}`);return capture?String(r.stdout||'').trim():''}
function allowed(rel){return rel.startsWith('app/api/whatsapp/webhook/_lib/v4-os/')||rel==='docs/ALAMEEN_V4_HUMAN_AI_CONVERSATION_OS.md'||/^scripts\/v4-/.test(rel)}
const baseExists=run('git',['cat-file','-e',`${BASE}^{commit}`],{capture:true});void baseExists;
const names=run('git',['diff','--name-only',`${BASE}...HEAD`],{capture:true}).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const forbidden=names.filter(x=>!allowed(x));
if(forbidden.length){console.error('FAIL - V4 DEVELOPMENT TOUCHED FROZEN PRODUCTION FILES');for(const f of forbidden)console.error('  '+f);process.exit(1)}
console.log(`PASS - production baseline ${BASE.slice(0,7)} remains frozen; ${names.length} V4-only files changed`);
console.log('\n=== V4 CORE SELFTEST ===');
run(process.execPath,[path.join('scripts','v4-human-ai-conversation-os-selftest.cjs'),root]);
console.log('\n=== TYPESCRIPT / NEXT BUILD ===');
if(process.platform==='win32')run(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',['/d','/s','/c','npm run build']);else run('npm',['run','build']);
console.log('\n=== DIFF CHECK ===');
run('git',['diff','--check',`${BASE}...HEAD`]);
console.log('\n==============================================');
console.log('PASS - ALAMEEN V4 DEVELOPMENT GATE');
console.log('PRODUCTION 16597dc: FROZEN / UNCHANGED');
console.log('SHADOW MODE: NOT USED');
console.log('==============================================');
