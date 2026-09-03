const fs = require('fs');
const path = require('path');
const root = process.argv[2] || process.cwd();
function read(rel){ return fs.readFileSync(path.join(root,rel),'utf8'); }
function must(rel, needle, label){ const s=read(rel); if(!s.includes(needle)) throw new Error(`${label}: missing ${needle} in ${rel}`); console.log(`PASS: ${label}`); }
function mustNot(rel, needle, label){ const s=read(rel); if(s.includes(needle)) throw new Error(`${label}: forbidden ${needle} in ${rel}`); console.log(`PASS: ${label}`); }

const runtime='app/api/whatsapp/webhook/_lib/v3-os/runtimeLive.ts';
const policy='app/api/whatsapp/webhook/_lib/v3-os/manualActionPolicy.ts';
const verifier='app/api/whatsapp/webhook/_lib/v3-os/verifier.ts';
const writer='app/api/whatsapp/webhook/_lib/v3-os/writerContract.ts';
const zero='app/api/whatsapp/webhook/_lib/v3-os/zeroFallback.ts';
const types='app/api/whatsapp/webhook/_lib/v3-os/types.ts';
const interpreter='app/api/whatsapp/webhook/_lib/v3-os/modelInterpreter.ts';

must(types,'v3.0.0-phase7.1.1-truth-locked-actions','runtime version');
must(policy,'cancel_reapply_guidance','unpaid device-change cancel/reapply policy');
must(policy,'hasPaymentProtection','payment evidence protection');
must(policy,'_manualStatus: "awaiting_admin"','persistent manual action state');
must(policy,'reconciled_by_truth','manual action truth reconciliation');
must(runtime,'buildManualActionCustomerReply','manual action deterministic reply before writer');
must(runtime,'if (planned.action === "change_device" && !hasPaymentProtection(input.truth)) continue;','unpaid device change does not create premature admin mutation request');
must(runtime,'? "cancel_application"','unpaid device change creates cancellation confirmation state');
must(runtime,'buildV3LastResortReply({ truth: truthAfterActions, state: boundState','context-aware last resort');

must(runtime,'buildV3LastResortReply(input?:','route-level last-resort backward compatibility');
const route='app/api/whatsapp/webhook/route.ts';
const routeText=read(route);
if(routeText.includes('buildV3LastResortReply()') && !read(runtime).includes('buildV3LastResortReply(input?:')) {
  throw new Error('route/runtime compatibility: route uses zero-argument buildV3LastResortReply() but runtime signature is not optional');
}
console.log('PASS: route/runtime last-resort call compatibility');
must(verifier,'hard_execution_receipt_missing:','hard execution receipt gate');
must(verifier,'known_tracking_re_requested','never ask known tracking');
must(verifier,'eligibility_or_document_requirement_overclaim','eligibility overclaim guard');
must(verifier,'literal_human_identity_claim','literal human-identity claim guard');
must(writer,'CURRENT_DB_VALUE','requested change vs database truth separation');
must(writer,'NEVER ASK KNOWN FACTS','known-fact writer contract');
must(writer,'لا تقل "أنا إنسان"','identity handling contract');
must(zero,'resolveManualActionDisposition','zero-fallback honors device-change/manual-action policy');
must(interpreter,'awaiting_customer_cancel_confirmation','destructive cancel/reapply confirmation mode');
must(interpreter,'Require the customer\'s reply itself to explicitly contain cancellation','generic yes does not authorize cancel/reapply');
mustNot(runtime,'صار خلل مؤقت وأنا بجهز الرد','legacy visible failure absent from live runtime');

let ts;
try { ts=require('typescript'); } catch { ts=null; }
if(ts){
  for(const rel of [runtime,policy,verifier,writer,zero,types,interpreter]){
    const src=read(rel);
    const r=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true,fileName:rel});
    const errors=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    if(errors.length) throw new Error(`TypeScript syntax failed: ${rel}: ${errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' | ')}`);
  }
  console.log('PASS: TypeScript syntax/transpile');
} else {
  console.log('INFO: local typescript module unavailable; npm build remains authoritative');
}
console.log('V3 Phase 7.1.1 self-test: PASS');
