const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = process.argv[2] || process.cwd();
const V3 = 'app/api/whatsapp/webhook/_lib/v3-os';
const read = (r) => fs.readFileSync(path.join(root, r), 'utf8');
let passed = 0, failed = 0;
function ok(value, message) { if (value) { passed++; console.log(`PASS ${passed}: ${message}`); } else { failed++; console.error(`FAIL: ${message}`); } }
function normalizeArabic(value) { return String(value||'').toLowerCase().replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/ة/g,'ه'); }
function stage(app) {
  if (!app) return 'unbound';
  const s=String(app.status||'').toLowerCase(), p=String(app.paymentStatus||'').toLowerCase();
  if (['refund_completed','refunded'].includes(s)||['refund_completed','refunded'].includes(p)) return 'refund_completed';
  if (s==='refund_requested'||p==='refund_requested') return 'refund_requested';
  if (['cancelled','customer_declined_continue','rejected'].includes(s)) return 'cancelled';
  if (app.paymentConfirmedAt || ['confirmed','paid','payment_confirmed'].includes(p)) return 'payment_confirmed_under_review';
  if (app.documents?.paymentReceiptUploaded || ['customer_claimed_paid','pending_payment_confirmation'].includes(p)) return 'payment_proof_pending_admin';
  if (s==='customer_confirmed_continue'||['pending','pending_payment','payment_info_sent'].includes(p)) return 'continuation_confirmed_fee_due';
  if (s==='preliminary_qualified'||app.preliminaryQualifiedAt) return 'preliminary_approved_waiting_decision';
  if (!s||['preliminary_application','submitted'].includes(s)) return 'preliminary_review';
  return 'other';
}
function loadHelper() {
  const file = `${V3}/humanFirstJourneyIntelligence.ts`;
  const src = read(file);
  const out = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true, fileName: file });
  const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if (errs.length) throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
  const module={exports:{}};
  const req=(id)=>{
    if (id==='./applicationJourney') return { applicationJourneyStage: stage };
    if (id==='./text') return { normalizeArabic };
    if (id==='./types') return {};
    throw new Error(`unmocked ${id}`);
  };
  new Function('require','module','exports',out.outputText)(req,module,module.exports);
  return module.exports;
}
const h = loadHelper();
const state = (extra={}) => ({ version:'v3', waId:'9627', activeApplicationId:'a1', activeTrackingId:'AM-1', currentTopic:'continuation', currentGoal:'payment', role:{currentRole:'tala',tier:'frontline',reason:'',sinceTurnId:null,introduced:true}, openLoops:[], facts:[], pendingAction:null, pendingActionPayload:null, lastTurnId:'old', lastCustomerText:null, lastAssistantText:null, consecutiveRiskTurns:0, lastVerifiedApplication:null, updatedAt:new Date().toISOString(), ...extra });
const turn = (raw, extra={}) => ({ turnId:'t1', rawText:raw, normalizedText:normalizeArabic(raw), acts:[], topics:['unknown'], requestedActions:[], sentiment:'calm', urgency:'normal', explicitRoleRequest:null, confidence:.7, warnings:[], ...extra });

const burst = h.buildHumanFirstCustomerBurst({ customerText:'وبدي الغي الطلب', recentTurns:['الأمين: أهلاً فيك','العميل: انا حولت ٥ دنانير','العميل: وبدي الغي الطلب'] });
ok(burst.merged && burst.messages.length===2, 'rapid unanswered WhatsApp bubbles are merged into one human turn');
ok(burst.combinedText.includes('حولت ٥') && burst.combinedText.includes('الغي الطلب'), 'merged turn preserves payment claim + cancellation request');

const enrichedCancel = h.enrichHumanFirstTurn(turn(burst.combinedText));
ok(enrichedCancel.requestedActions.includes('cancel_application'), 'Nadia burst keeps explicit cancellation action');
ok(enrichedCancel.topics.includes('payment_status') && enrichedCancel.topics.includes('cancellation'), 'Nadia burst covers payment claim and cancellation together');

const saj = h.enrichHumanFirstTurn(turn('انه انا ما بدي ادفع قسط اولي وبدي اعرف كيف الدفعه الشهرية رح تكوني'));
ok(saj.topics.includes('first_installment') && saj.topics.includes('installment_amount'), 'Saja no-upfront question resolves to first installment + monthly installment');

const multi = h.enrichHumanFirstTurn(turn('ممتاز بدي احولك اليوم المصاري\nوبعدها شو بصير ؟\nبعد ما افتح الملف يعني شو الإجراءات متى بتبلغوني\nوين موقع الشركة بالزبط'));
ok(multi.topics.includes('application_status') && multi.topics.includes('review_timing') && multi.topics.includes('office_location'), 'rapid multi-act turn covers next step + timing + location');

const refundState = state({ pendingAction:'continue_application', pendingActionPayload:{x:'y'}, openLoops:[
  {id:'l1',topic:'continuation',owedBy:'ai',state:'open',sourceTurnId:'x',createdAt:'x',updatedAt:'x'},
  {id:'l2',topic:'refund',owedBy:'ai',state:'open',sourceTurnId:'x',createdAt:'x',updatedAt:'x'},
]});
const superseded = h.supersedeConversationStateForJourney({ state:refundState, truth:{application:{id:'a1',trackingId:'AM-1',status:'cancelled',paymentStatus:'refund_requested'},policy:{}}, turn:turn('مافي شي اثبته من البيانات') });
ok(superseded.pendingAction===null, 'refund journey clears stale continuation pending action');
ok(superseded.openLoops.find(x=>x.topic==='continuation').state==='cancelled', 'refund journey cancels stale continuation open loop');
ok(superseded.openLoops.find(x=>x.topic==='refund').state==='open', 'refund journey keeps current refund loop alive');
ok(superseded.currentGoal==='support_current_refund_journey', 'refund journey becomes the active conversational goal');
ok(superseded.facts.some(x=>x.key==='authoritative_journey_stage' && x.value==='refund_requested'), 'authoritative journey stage is persisted as system fact');

ok(h.refundDataFormTroubleText('مافي شي اثبته من البيانات'), 'Nadia refund-data form follow-up is recognized');
ok(h.journeyStageReplyRegression('رغبتك بالاستمرار مسجلة بالفعل، فما في داعي تعيد أود الاستمرار', {application:{status:'cancelled',paymentStatus:'refund_requested'}}), 'refund journey blocks stale continuation response');
ok(!h.journeyStageReplyRegression('رسوم فتح الملف اللي دفعتها 5 دنانير داخلة بمسار الاسترداد الحالي.', {application:{status:'cancelled',paymentStatus:'refund_requested'}}), 'refund journey may mention the historic 5 JOD fee without treating it as recollection');
ok(h.journeyStageReplyRegression('حوّل 5 دنانير وارفع الوصل من /receipt', {application:{status:'cancelled',paymentStatus:'refund_requested'}}), 'refund journey blocks actual payment/receipt recollection instructions');
const repair = h.buildJourneyLockRepairReply({ turn:turn('مافي شي اثبته من البيانات'), truth:{application:{trackingId:'AM-1',status:'cancelled',paymentStatus:'refund_requested'}} });
ok(repair && /نفس مسار الاسترداد/.test(repair) && !/رغبتك بالاستمرار/.test(repair), 'refund form repair stays human and inside refund journey');

const runtime=read(`${V3}/runtimeLive.ts`), gate=read(`${V3}/finalResponseGate.ts`), writer=read(`${V3}/writerContract.ts`), planner=read(`${V3}/planner.ts`), voice=read(`${V3}/humanVoice.ts`), types=read(`${V3}/types.ts`);
ok(runtime.includes('buildHumanFirstCustomerBurst') && runtime.includes('effectiveCustomerText'), 'runtime interprets merged unanswered customer burst');
ok(runtime.includes('supersedeConversationStateForJourney({ state: boundStateBase') && runtime.includes('const conversationState = supersedeConversationStateForJourney'), 'journey supersession runs before planning and again after action truth refresh');
ok(gate.includes('authoritative_journey_stage_regression'), 'final egress gate blocks regression to an older journey');
ok(gate.includes('refund_data_form_followup_not_resolved'), 'final gate protects refund-form follow-up');
ok(writer.includes('TURN.rawText قد يكون دمجًا لعدة فقاعات واتساب متتالية'), 'writer contract understands WhatsApp burst semantics');
ok(writer.includes('بعد cancelled/refund_requested ممنوع الرجوع'), 'writer contract makes newer journey truth dominate old loops');
ok(planner.includes('الطلب داخل مسار الاسترداد الآن') && planner.includes('الدفع مؤكد والملف في الدراسة النهائية'), 'planner has authoritative stage-aware objectives');
ok(voice.includes('فكّر بإيقاع واتساب الحقيقي') && voice.includes('الحالة الأحدث هي سياق الحديث الحالي'), 'human-first voice is architectural, not template decoration');
ok(types.includes('v3.0.0-phase7.4.0-human-first-journey-intelligence'), 'runtime version identifies Phase 7.4.0');
ok(!runtime.includes('LIVE_SCOPED_MUTATIONS.add'), 'Phase 7.4.0 does not widen scoped real actions');

console.log(`RESULT: ${passed}/${passed+failed} PASS`);
if (failed) process.exit(1);
