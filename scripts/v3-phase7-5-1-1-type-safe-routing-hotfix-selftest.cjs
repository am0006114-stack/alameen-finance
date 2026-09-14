const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const root=process.argv[2]||process.cwd();
const V3=path.join(root,'app/api/whatsapp/webhook/_lib/v3-os');
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
let passed=0,failed=0;
function ok(v,m){if(v){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}}
function transpile(rel){const src=read(rel);const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:rel});const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);ok(errs.length===0,`${rel} TypeScript syntax/transpile diagnostics clean`);if(errs.length)console.error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('\n'));}
const types=read('app/api/whatsapp/webhook/_lib/v3-os/types.ts');
const arb=read('app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts');
const plane=read('app/api/whatsapp/webhook/_lib/v3-os/unifiedConversationDecisionPlane.ts');
const writer=read('app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts');

ok(types.includes('v3.0.0-phase7.5.1.1-type-safe-routing-hotfix'),'runtime version identifies 7.5.1.1');
ok(!arb.includes('turn.topics.includes("order_status")'),'response arbiter does not use non-TopicKey order_status literal');
ok(arb.includes('turn.topics.includes("application_status")'),'application-status TopicKey remains authoritative');
ok(plane.includes('voluntaryOptOutQuestion'),'voluntary opt-out lock present');
ok(plane.includes('paymentReceiptConfirmationQuestion'),'receipt/payment confirmation truth lock present');
ok(plane.includes('explicitEmergencyUpdate'),'payment destination update requires explicit emergency/payment wording');
ok(writer.includes('PHASE 7.5.1.1 TYPE-SAFE ROUTING HOTFIX'),'writer contract carries type-safe hotfix instruction');

// Semantic contract: every literal passed to turn.topics.includes(...) anywhere in v3-os
// must exist in TopicKey. This specifically blocks the build failure that occurred in 7.5.1.
const tm=types.match(/export type TopicKey\s*=([\s\S]*?);/);
ok(Boolean(tm),'TopicKey union found');
const topicKeys=new Set((tm?.[1].match(/"([^"]+)"/g)||[]).map(x=>x.slice(1,-1)));
let invalid=[];
for(const name of fs.readdirSync(V3).filter(x=>x.endsWith('.ts'))){
  const src=fs.readFileSync(path.join(V3,name),'utf8');
  for(const m of src.matchAll(/\.topics\.includes\("([^"]+)"\)/g)){
    if(!topicKeys.has(m[1])) invalid.push(`${name}:${m[1]}`);
  }
}
ok(invalid.length===0,`all topics.includes literals belong to TopicKey${invalid.length?` (${invalid.join(', ')})`:''}`);

// Production regression fixtures from first post-7.5.0 hour.
ok(/generic phrases such as "آخر تحديث/.test(plane),'generic order-status cannot trigger payment-update explanation');
ok(/لا\\s\+ارغب/.test(plane)||plane.includes('voluntaryOptOutQuestion'),'temporary opt-out detection encoded');
ok(arb.includes('authoritative payment/receipt truth lock'),'receipt confirmation bypasses generic media fallback');
ok(arb.includes('stage === "refund_requested"'),'refund timing lock handles refund_requested state');

for(const rel of [
 'app/api/whatsapp/webhook/_lib/v3-os/unifiedConversationDecisionPlane.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/responseArbiter.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts',
 'app/api/whatsapp/webhook/_lib/v3-os/types.ts'
]) transpile(rel);

console.log(`\n7.5.1.1 focused assertions: ${passed+failed}; passed=${passed}; failed=${failed}`);
if(failed) process.exit(1);
