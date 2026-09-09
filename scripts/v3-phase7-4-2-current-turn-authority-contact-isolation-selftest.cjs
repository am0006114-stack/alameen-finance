const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = process.argv[2] || process.cwd();
const V3 = 'app/api/whatsapp/webhook/_lib/v3-os';
const read = (r) => fs.readFileSync(path.join(root, r), 'utf8');
let passed = 0, failed = 0;
function ok(v, m){ if(v){passed++; console.log(`PASS ${passed}: ${m}`);} else {failed++; console.error(`FAIL: ${m}`);} }
function normalizeArabic(value){ return String(value||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/ة/g,'ه'); }
function loadHelper(){
  const file=`${V3}/currentTurnAuthority.ts`;
  const src=read(file);
  const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:file});
  const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errs.length) throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
  const module={exports:{}};
  const req=(id)=>{ if(id==='./text') return {normalizeArabic}; if(id==='./types') return {}; throw new Error(`unmocked ${id}`); };
  new Function('require','module','exports',out.outputText)(req,module,module.exports);
  return module.exports;
}
const h=loadHelper();
const statusTemplate=`أهلًا، أريد متابعة طلبي لدى الأمين للأقساط.\n\nرقم التتبع:\nAM-1788344665753\n\nرقم الهاتف:\n0779458479\n\nالحالة الحالية:\nملفك ما زال قيد الدراسة\n\nأرغب بمعرفة آخر تحديث أو الخطوة التالية.`;
ok(h.structuredOrderStatusTemplateText(statusTemplate), 'tracking-page WhatsApp template is recognized structurally');
ok(h.explicitOrderStatusRequestText(statusTemplate), 'tracking template is authoritative application-status request');
ok(!h.explicitContactRequestText(statusTemplate), 'رقم الهاتف field is not misread as company-contact request');
ok(h.explicitContactRequestText('كيف ارن عليكم'), 'real call request remains contact intent');
ok(h.explicitContactRequestText('مافي رقم اتصل عليكم؟'), 'natural no-number call question remains contact intent');
ok(h.explicitContactRequestText('اعطيني رقمكم لو سمحت'), 'explicit company-number request remains contact intent');
ok(h.explicitContactRequestText('رقم هاتف الشركة'), 'bare standalone company-phone request remains contact intent');
ok(h.explicitOrderStatusRequestText('شو صار بطلبي؟'), 'natural status question is recognized');
const turn={turnId:'t1',rawText:statusTemplate,normalizedText:normalizeArabic(statusTemplate),acts:[
  {id:'a1',type:'ask',topic:'call_request',text:statusTemplate,action:'record_call_preference',value:'official_contact',confidence:.9,source:'model'},
  {id:'a2',type:'ask',topic:'unknown',text:statusTemplate,action:'none',value:null,confidence:.5,source:'model'},
],topics:['call_request','unknown'],requestedActions:['record_call_preference'],sentiment:'calm',urgency:'normal',explicitRoleRequest:null,confidence:.8,warnings:[]};
const hardened=h.enforceCurrentTurnAuthority(turn);
ok(hardened.topics.includes('application_status'), 'current-turn authority injects application_status');
ok(!hardened.topics.includes('call_request'), 'false contact topic is removed from status template');
ok(!hardened.requestedActions.includes('record_call_preference'), 'false call-preference action is removed');
ok(hardened.warnings.includes('current_turn_status_authority'), 'authority decision is auditable in turn warnings');
const both={...turn,rawText:statusTemplate+'\nوكمان كيف اتصل عليكم؟'};
const bothH=h.enforceCurrentTurnAuthority(both);
ok(h.explicitContactRequestText(both.rawText), 'legitimate multi-topic status + contact turn preserves contact intent');
ok(bothH.topics.includes('call_request') && bothH.topics.includes('application_status'), 'multi-topic turn keeps both explicit topics');
ok(h.replyMisalignedWithCurrentTurn({turn:hardened,reply:'المتابعة الأساسية للطلبات من نفس واتساب. ما عندي رقم هاتف إضافي رسمي موثق.'}), 'status turn rejects contact-info reply');
ok(!h.replyMisalignedWithCurrentTurn({turn:hardened,reply:'طلبك AM-1788344665753 قيد الدراسة النهائية. رابط التتبع الرسمي موجود.'}), 'status-grounded reply passes relevance check');
const runtime=read(`${V3}/runtimeLive.ts`), gate=read(`${V3}/finalResponseGate.ts`), zero=read(`${V3}/zeroFallback.ts`), model=read(`${V3}/modelInterpreter.ts`), writer=read(`${V3}/writerContract.ts`), types=read(`${V3}/types.ts`);
ok(runtime.includes('const truthRecentTurns = input.recentTurns || []') && runtime.includes('recentTurns: truthRecentTurns'), 'truth resolver receives unsanitized internal recent turns for identifier continuity');
ok(runtime.includes('enforceCurrentTurnAuthority(enrichHumanFirstTurn'), 'current-turn authority runs after interpretation/recovery before truth/planning');
ok(gate.includes('current_turn_relevance_violation'), 'final egress gate owns human relevance mismatch');
ok(gate.indexOf('explicitOrderStatusRequestText(input.turn.rawText)') < gate.indexOf('if (phoneContactQuestionText(input.turn.rawText)) return buildPhoneContactReply()'), 'status repair has priority over contact repair');
ok(zero.includes('explicitOrderStatusRequestText(input.turn.rawText)') && zero.indexOf('explicitOrderStatusRequestText(input.turn.rawText)') < zero.indexOf('if (rawAsksContactNumber(q)'), 'zero fallback prioritizes status before contact');
ok(model.includes('if (explicitContactRequestText(customerText)) additions.push'), 'model operational enrichment no longer treats bare phone field as call request');
ok(writer.includes('وجود سطر «رقم الهاتف:» داخل رسالة التتبع مجرد بيانات تعريف للطلب'), 'human writer contract explicitly isolates tracking phone field from contact intent');
ok(types.includes('v3.0.0-phase7.4.2-current-turn-authority-contact-isolation') || types.includes('v3.0.0-phase7.4.3-action-commercial-human-authority'), 'runtime version preserves Phase 7.4.2 behavior or advances to 7.4.3');
ok(!runtime.includes('LIVE_SCOPED_MUTATIONS.add'), 'Phase 7.4.2 does not widen Real Actions');
console.log(`RESULT: ${passed}/${passed+failed} PASS`); if(failed) process.exit(1);
