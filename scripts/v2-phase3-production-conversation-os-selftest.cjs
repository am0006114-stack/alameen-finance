const fs = require('fs');
const path = require('path');
const root = process.cwd();
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8');}
function must(cond,msg){if(!cond) throw new Error(msg);}
const route=read('app/api/whatsapp/webhook/route.ts');
const runtime=read('app/api/whatsapp/webhook/_lib/v2-production/runtime.ts');
const sql=read('supabase/migrations/20260831190000_v2_production_conversation_os.sql');
const control=read('app/api/internal/whatsapp-v2-production/control/route.ts');

must(route.includes('prepareV2ProductionTurn'), 'route missing V2 preparation');
must(route.includes('writeV2ProductionReply'), 'route missing V2 writer');
must(route.includes('commitV2ProductionState'), 'route missing V2 state commit');
must(route.includes('disableLegacyAi: true'), 'legacy AI is not bypassed inside active V2');
must(route.indexOf('writeV2ProductionReply') < route.lastIndexOf('applyProductionFinalTruthGate'), 'V2 writer must remain before final truth gate');
must(route.lastIndexOf('applyConversationKernelReplyGuard') < route.lastIndexOf('sendWhatsAppText(from, reply)'), 'final deterministic guard must remain before send');
must(runtime.includes('archiveReplyPolicyViolations'), 'static policy verifier missing');
must(runtime.includes('archiveTruthPolicyViolations'), 'truth verifier missing');
must(runtime.includes('repairViolations'), 'self repair missing');
must(runtime.includes('reply: input.deterministicReply'), 'fail-closed fallback missing');
must(runtime.includes('DEEPSEEK_V2_API_KEY'), 'dedicated V2 key missing');
must(!/\.from\(["']applications["']\)\s*\.update/s.test(runtime), 'production runtime must not mutate applications directly');
must(sql.includes("mode text not null default 'off'"), 'SQL must default mode OFF');
must(sql.includes('kill_switch boolean not null default true'), 'SQL must default kill switch ON');
must(sql.includes("values('default','off',true,5)"), 'SQL must force safe install state');
must(control.includes('action === "kill"'), 'admin kill switch missing');
console.log('SELFTEST PASS - V2 PHASE 3 PRODUCTION CONVERSATION OS');
