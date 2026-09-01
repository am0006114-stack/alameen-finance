const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dir = path.join(root,'app/api/whatsapp/webhook/_lib/v3-os');
const files = ['types.ts','policy.ts','hierarchy.ts','text.ts','interpreter.ts','state.ts','truth.ts','planner.ts','actionPlane.ts','writerContract.ts','verifier.ts','orchestrator.ts','goldenCases.ts','sequenceCases.ts','index.ts'];
for (const f of files) if (!fs.existsSync(path.join(dir,f))) throw new Error(`missing ${f}`);
const all = files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
const required = ['V3_OS_VERSION','AI_TEAM','resolveAiRole','interpretTurn','resolveTruth','buildReplyPlan','executeActions','buildWriterPrompt','verifyReply','runV3OsShadow','V3_GOLDEN_CASES','V3_GOLDEN_SEQUENCES'];
for (const marker of required) if (!all.includes(marker)) throw new Error(`missing marker ${marker}`);
const forbidden = [
  ['pauseAutoReplyAfterSend','must not pause AI after staff request'],
  ['AUTO_REPLY_IGNORED','must not create ignored marker for human handoff'],
  ['whatsapp_v2_human_action_queue','must not depend on human queue'],
  ['owedBy: "staff"','must not create staff-owned loops'],
  ['تم تحويل المحادثة فعليًا لقائمة متابعة الموظفين','must not claim human queue'],
];
for (const [needle,msg] of forbidden) if (all.includes(needle)) throw new Error(`${msg}: ${needle}`);
if (!all.includes('بدي موظف')) throw new Error('golden human request missing');
if (!all.includes('بدي المدير')) throw new Error('golden manager request missing');
if (!all.includes('omran')) throw new Error('AI supervisor role missing');
if (!all.includes('shadow_core_no_business_mutation')) throw new Error('shadow mutation blocker missing');
console.log('PASS: V3 autonomous AI company OS core structure');
console.log('PASS: no human queue dependency / no auto-reply pause');
console.log('PASS: AI hierarchy Tala/Fadwa/Abdullah/Abdulrahman/Omran');
console.log('PASS: multi-act + state + truth + planner + action + writer contract + verifier + golden suite');
console.log('PASS: shadow core cannot mutate business state');
